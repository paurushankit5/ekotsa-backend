import {
  mkdirSync,
  writeFileSync,
  readFileSync,
  existsSync,
  statSync,
  createWriteStream,
  createReadStream,
  unlinkSync,
  renameSync,
} from "node:fs";
import { join, dirname } from "node:path";
import { createHash, randomBytes } from "node:crypto";
import { pipeline } from "node:stream/promises";
import type { Readable } from "node:stream";
import { createId } from "@paralleldrive/cuid2";
import { loadEnv } from "../config/env.js";
import type { ObjectStorage, ProtectedUploadResult } from "./object-storage.js";

type StoredObject = {
  bucket: string;
  path: string;
  contentType: string;
  size: number;
  bytes?: Buffer;
  sha256?: string;
  createdAt: string;
};

declare global {
  // eslint-disable-next-line no-var
  var __ekotsaLocalStorage: Map<string, StoredObject> | undefined;
  // eslint-disable-next-line no-var
  var __ekotsaUploadTokens: Map<string, { bucket: string; path: string; expiresAt: number }> | undefined;
}

function store() {
  globalThis.__ekotsaLocalStorage ??= new Map();
  return globalThis.__ekotsaLocalStorage;
}

function uploadTokens() {
  globalThis.__ekotsaUploadTokens ??= new Map();
  return globalThis.__ekotsaUploadTokens;
}

function key(bucket: string, path: string) {
  return `${bucket}:${path}`;
}

/** Dev/local adapter — disk under STORAGE_LOCAL_DIR; swap for R2 later. */
export class LocalObjectStorage implements ObjectStorage {
  private root: string;

  constructor(root?: string) {
    const env = loadEnv();
    this.root = root ?? env.STORAGE_LOCAL_DIR ?? join(process.cwd(), ".storage");
  }

  diskPath(bucket: string, path: string) {
    return join(this.root, bucket, path);
  }

  async createProtectedUpload(input: {
    bucket: string;
    path: string;
    contentType: string;
    size: number;
  }): Promise<ProtectedUploadResult> {
    const token = createId();
    store().set(key(input.bucket, input.path), {
      bucket: input.bucket,
      path: input.path,
      contentType: input.contentType,
      size: input.size,
      createdAt: new Date().toISOString(),
    });
    uploadTokens().set(token, {
      bucket: input.bucket,
      path: input.path,
      expiresAt: Date.now() + 2 * 60 * 60 * 1000,
    });

    const env = loadEnv();
    const base = env.APP_PUBLIC_URL ?? `http://localhost:${env.PORT}`;
    return {
      path: input.path,
      token,
      signedUrl: `${base}/v1/payments/upload/${encodeURIComponent(input.bucket)}/${encodeURIComponent(input.path)}?token=${token}`,
    };
  }

  issueUploadToken(input: { bucket: string; path: string; ttlMs?: number }) {
    const token = randomBytes(24).toString("base64url");
    uploadTokens().set(token, {
      bucket: input.bucket,
      path: input.path,
      expiresAt: Date.now() + (input.ttlMs ?? 2 * 60 * 60 * 1000),
    });
    return token;
  }

  consumeUploadToken(token: string, bucket: string, path: string) {
    const entry = uploadTokens().get(token);
    if (!entry) return false;
    if (entry.expiresAt <= Date.now()) {
      uploadTokens().delete(token);
      return false;
    }
    if (entry.bucket !== bucket || entry.path !== path) return false;
    return true;
  }

  async putObject(input: {
    bucket: string;
    path: string;
    contentType: string;
    body: Buffer;
  }) {
    const entry = store().get(key(input.bucket, input.path));
    const record: StoredObject = {
      bucket: input.bucket,
      path: input.path,
      contentType: input.contentType,
      size: input.body.length,
      bytes: input.body,
      createdAt: entry?.createdAt ?? new Date().toISOString(),
    };
    store().set(key(input.bucket, input.path), record);

    const diskPath = this.diskPath(input.bucket, input.path);
    mkdirSync(dirname(diskPath), { recursive: true });
    writeFileSync(diskPath, input.body);
    return record;
  }

  /** Stream large installers to disk without buffering the whole file in RAM. */
  async putObjectStream(input: {
    bucket: string;
    path: string;
    contentType: string;
    body: Readable;
    expectedSize?: number | null;
    maxBytes: number;
  }): Promise<{ size: number; sha256: string; diskPath: string }> {
    const diskPath = this.diskPath(input.bucket, input.path);
    mkdirSync(dirname(diskPath), { recursive: true });
    const partialPath = `${diskPath}.partial`;
    const hash = createHash("sha256");
    let size = 0;

    const out = createWriteStream(partialPath);
    input.body.on("data", (chunk: Buffer | string) => {
      const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      size += buf.length;
      if (size > input.maxBytes) {
        input.body.destroy(new Error("Upload exceeds maximum allowed size"));
        out.destroy(new Error("Upload exceeds maximum allowed size"));
        return;
      }
      hash.update(buf);
    });

    try {
      await pipeline(input.body, out);
    } catch (error) {
      try {
        unlinkSync(partialPath);
      } catch {
        // ignore cleanup errors
      }
      throw error;
    }

    if (input.expectedSize != null && input.expectedSize > 0 && size !== input.expectedSize) {
      try {
        unlinkSync(partialPath);
      } catch {
        // ignore
      }
      throw new Error(`Uploaded size ${size} did not match expected ${input.expectedSize}`);
    }

    renameSync(partialPath, diskPath);
    const sha256 = hash.digest("hex");
    store().set(key(input.bucket, input.path), {
      bucket: input.bucket,
      path: input.path,
      contentType: input.contentType,
      size,
      sha256,
      createdAt: new Date().toISOString(),
    });
    return { size, sha256, diskPath };
  }

  createReadStream(bucket: string, path: string) {
    const diskPath = this.diskPath(bucket, path);
    if (!existsSync(diskPath)) return null;
    return createReadStream(diskPath);
  }

  async getProtectedObjectInfo(input: { bucket: string; path: string }) {
    const mem = store().get(key(input.bucket, input.path));
    if (mem?.bytes) {
      return { size: mem.size, contentType: mem.contentType, sha256: mem.sha256 };
    }
    const diskPath = this.diskPath(input.bucket, input.path);
    if (!existsSync(diskPath)) return null;
    const st = statSync(diskPath);
    return {
      size: st.size,
      contentType: mem?.contentType ?? "application/octet-stream",
      sha256: mem?.sha256,
    };
  }

  async createProtectedReadUrl(input: {
    bucket: string;
    path: string;
    expiresInSeconds?: number;
  }) {
    const info = await this.getProtectedObjectInfo(input);
    if (!info) return null;
    const env = loadEnv();
    const base = env.APP_PUBLIC_URL ?? `http://localhost:${env.PORT}`;
    return `${base}/v1/payments/proof/${encodeURIComponent(input.bucket)}/${encodeURIComponent(input.path)}`;
  }

  async readObject(input: { bucket: string; path: string }) {
    const mem = store().get(key(input.bucket, input.path));
    if (mem?.bytes) return mem;
    const diskPath = this.diskPath(input.bucket, input.path);
    if (!existsSync(diskPath)) return null;
    const bytes = readFileSync(diskPath);
    return {
      bucket: input.bucket,
      path: input.path,
      contentType: mem?.contentType ?? "application/octet-stream",
      size: bytes.length,
      bytes,
      sha256: mem?.sha256,
      createdAt: mem?.createdAt ?? new Date().toISOString(),
    };
  }
}

let singleton: LocalObjectStorage | null = null;

export function getObjectStorage(): LocalObjectStorage {
  singleton ??= new LocalObjectStorage();
  return singleton;
}
