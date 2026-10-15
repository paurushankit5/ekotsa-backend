import {
  DeleteObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  GetObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { loadEnv } from "../config/env.js";
import { AppError } from "../middleware/errorHandler.js";

export type R2Config = {
  accountId: string;
  accessKeyId: string;
  secretAccessKey: string;
  bucket: string;
  /** Optional public base like https://downloads.ekotsa.com (no trailing slash) */
  publicBaseUrl?: string;
};

let cachedClient: S3Client | null = null;
let cachedConfig: R2Config | null = null;

export function getR2Config(): R2Config | null {
  const env = loadEnv();
  const accountId = env.R2_ACCOUNT_ID?.trim();
  const accessKeyId = env.R2_ACCESS_KEY_ID?.trim();
  const secretAccessKey = env.R2_SECRET_ACCESS_KEY?.trim();
  const bucket = env.R2_BUCKET?.trim();
  if (!accountId || !accessKeyId || !secretAccessKey || !bucket) return null;
  return {
    accountId,
    accessKeyId,
    secretAccessKey,
    bucket,
    publicBaseUrl: env.R2_PUBLIC_BASE_URL?.replace(/\/$/, "") || undefined,
  };
}

export function isR2Configured() {
  return Boolean(getR2Config());
}

function requireR2(): R2Config {
  const cfg = getR2Config();
  if (!cfg) {
    throw new AppError(
      503,
      "Cloudflare R2 is not configured. Set R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, and R2_BUCKET.",
      "R2_NOT_CONFIGURED",
    );
  }
  return cfg;
}

function getClient(): { client: S3Client; config: R2Config } {
  const config = requireR2();
  if (
    cachedClient &&
    cachedConfig &&
    cachedConfig.accountId === config.accountId &&
    cachedConfig.accessKeyId === config.accessKeyId &&
    cachedConfig.bucket === config.bucket
  ) {
    return { client: cachedClient, config };
  }

  // Default jurisdiction endpoint only:
  // https://<ACCOUNT_ID>.r2.cloudflarestorage.com
  const endpoint = `https://${config.accountId}.r2.cloudflarestorage.com`;

  cachedClient = new S3Client({
    region: "auto",
    endpoint,
    credentials: {
      accessKeyId: config.accessKeyId,
      secretAccessKey: config.secretAccessKey,
    },
  });
  cachedConfig = config;
  return { client: cachedClient, config };
}

export async function createR2PresignedPutUrl(input: {
  key: string;
  contentType: string;
  expiresInSeconds?: number;
}): Promise<{ url: string; bucket: string; key: string; headers: Record<string, string> }> {
  const { client, config } = getClient();
  const command = new PutObjectCommand({
    Bucket: config.bucket,
    Key: input.key,
    ContentType: input.contentType,
  });
  const url = await getSignedUrl(client, command, {
    expiresIn: input.expiresInSeconds ?? 2 * 60 * 60,
  });
  return {
    url,
    bucket: config.bucket,
    key: input.key,
    headers: {
      "Content-Type": input.contentType,
    },
  };
}

export async function createR2PresignedGetUrl(input: {
  key: string;
  fileName?: string;
  expiresInSeconds?: number;
}): Promise<string> {
  const { client, config } = getClient();
  const command = new GetObjectCommand({
    Bucket: config.bucket,
    Key: input.key,
    ResponseContentDisposition: input.fileName
      ? `attachment; filename="${input.fileName.replace(/"/g, "")}"`
      : undefined,
  });
  return getSignedUrl(client, command, {
    expiresIn: input.expiresInSeconds ?? 30 * 60,
  });
}

export async function headR2Object(key: string): Promise<{
  size: number;
  contentType: string | null;
  etag: string | null;
}> {
  const { client, config } = getClient();
  try {
    const out = await client.send(
      new HeadObjectCommand({
        Bucket: config.bucket,
        Key: key,
      }),
    );
    return {
      size: Number(out.ContentLength ?? 0),
      contentType: out.ContentType ?? null,
      etag: out.ETag?.replaceAll('"', "") ?? null,
    };
  } catch {
    throw new AppError(404, "Installer not found in Cloudflare R2 yet", "R2_OBJECT_MISSING");
  }
}

export async function deleteR2Object(key: string): Promise<void> {
  const { client, config } = getClient();
  await client.send(
    new DeleteObjectCommand({
      Bucket: config.bucket,
      Key: key,
    }),
  );
}

/** Optional public URL if a custom domain / r2.dev public access is configured. */
export function publicR2ObjectUrl(key: string): string | null {
  const cfg = getR2Config();
  if (!cfg?.publicBaseUrl) return null;
  return `${cfg.publicBaseUrl}/${key.split("/").map(encodeURIComponent).join("/")}`;
}
