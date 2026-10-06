import { mkdirSync, writeFileSync, readFileSync, existsSync, statSync } from "node:fs";
import { join, dirname } from "node:path";
import { createId } from "@paralleldrive/cuid2";
import { loadEnv } from "../config/env.js";
import type { ObjectStorage, ProtectedUploadResult } from "./object-storage.js";

type StoredObject = {
  bucket: string;
  path: string;
  contentType: string;
  size: number;
  bytes?: Buffer;
  createdAt: string;
};

declare global {
  // eslint-disable-next-line no-var
  var __ekotsaLocalStorage: Map<string, StoredObject> | undefined;
}

function store() {
  globalThis.__ekotsaLocalStorage ??= new Map();
  return globalThis.__ekotsaLocalStorage;
}

function key(bucket: string, path: string) {
  return `${bucket}:${path}`;
}

/** Dev/local adapter — keeps proofs in memory + optional disk under STORAGE_LOCAL_DIR */
export class LocalObjectStorage implements ObjectStorage {
  private root: string;

  constructor(root?: string) {
    const env = loadEnv();
    this.root = root ?? env.STORAGE_LOCAL_DIR ?? join(process.cwd(), ".storage");
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

    const env = loadEnv();
    const base = env.APP_PUBLIC_URL ?? `http://localhost:${env.PORT}`;
    return {
      path: input.path,
      token,
      signedUrl: `${base}/v1/payments/upload/${encodeURIComponent(input.bucket)}/${encodeURIComponent(input.path)}?token=${token}`,
    };
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

    const diskPath = join(this.root, input.bucket, input.path);
    mkdirSync(dirname(diskPath), { recursive: true });
    writeFileSync(diskPath, input.body);
    return record;
  }

  async getProtectedObjectInfo(input: { bucket: string; path: string }) {
    const mem = store().get(key(input.bucket, input.path));
    if (mem?.bytes) {
      return { size: mem.size, contentType: mem.contentType };
    }
    const diskPath = join(this.root, input.bucket, input.path);
    if (!existsSync(diskPath)) return null;
    const st = statSync(diskPath);
    return {
      size: st.size,
      contentType: mem?.contentType ?? "application/octet-stream",
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
    const diskPath = join(this.root, input.bucket, input.path);
    if (!existsSync(diskPath)) return null;
    const bytes = readFileSync(diskPath);
    return {
      bucket: input.bucket,
      path: input.path,
      contentType: mem?.contentType ?? "application/octet-stream",
      size: bytes.length,
      bytes,
      createdAt: mem?.createdAt ?? new Date().toISOString(),
    };
  }
}

let singleton: LocalObjectStorage | null = null;

export function getObjectStorage(): LocalObjectStorage {
  singleton ??= new LocalObjectStorage();
  return singleton;
}
