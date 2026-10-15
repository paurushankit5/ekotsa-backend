/**
 * Object storage abstraction (replaces Supabase Storage).
 * Website source: ekotsa-website/src/services/object-storage.ts
 *
 * Implement adapters: local (dev), s3/r2 (prod), optional supabase (bridge).
 * Used by payments domain for payment-proof upload/read URLs.
 */

export type ProtectedUploadResult = {
  path: string;
  token: string;
  signedUrl: string;
};

export interface ObjectStorage {
  createProtectedUpload(input: {
    bucket: string;
    path: string;
    contentType: string;
    size: number;
  }): Promise<ProtectedUploadResult>;

  getProtectedObjectInfo(input: {
    bucket: string;
    path: string;
  }): Promise<{ size: number; contentType: string } | null>;

  createProtectedReadUrl(input: {
    bucket: string;
    path: string;
    expiresInSeconds?: number;
  }): Promise<string | null>;
}

export class NotImplementedObjectStorage implements ObjectStorage {
  async createProtectedUpload(): Promise<ProtectedUploadResult> {
    throw new Error("ObjectStorage not configured — Phase 0 / Wave D");
  }

  async getProtectedObjectInfo(): Promise<{ size: number; contentType: string } | null> {
    throw new Error("ObjectStorage not configured — Phase 0 / Wave D");
  }

  async createProtectedReadUrl(): Promise<string | null> {
    throw new Error("ObjectStorage not configured — Phase 0 / Wave D");
  }
}
