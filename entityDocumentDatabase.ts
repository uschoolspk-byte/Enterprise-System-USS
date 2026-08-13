import type { Db } from 'mongodb';
import {
  entityBlobKey,
  persistEntityDocumentBlob,
  loadEntityDocumentBlob,
  loadEntityDocumentBlobAuto
} from './entityDocumentBlobStore';

export type EntityBlobRow = {
  id: string;
  bucket: string;
  storage_path: string;
  content_type: string;
  content_base64: string;
  updated_at: string;
};

type SupabaseBlobOps = {
  upsert: (row: EntityBlobRow) => Promise<boolean>;
  load: (id: string) => Promise<{ content_base64?: string; content_type?: string } | null>;
};

type AppStoreBlobOps = {
  upsert: (row: EntityBlobRow) => Promise<boolean>;
  load: (id: string) => Promise<{ content_base64?: string; content_type?: string } | null>;
};

let supabaseBlobOps: SupabaseBlobOps | null = null;
let appStoreBlobOps: AppStoreBlobOps | null = null;

export function registerSupabaseEntityBlobOps(ops: SupabaseBlobOps): void {
  supabaseBlobOps = ops;
}

export function registerAppStoreEntityBlobOps(ops: AppStoreBlobOps): void {
  appStoreBlobOps = ops;
}

export async function persistEntityDocumentToDatabase(
  mongoDb: Db | null,
  bucket: string,
  storagePath: string,
  buffer: Buffer,
  contentType: string
): Promise<{ ok: boolean; mongo: boolean; supabase: boolean }> {
  const id = entityBlobKey(bucket, storagePath);
  const row: EntityBlobRow = {
    id,
    bucket,
    storage_path: storagePath,
    content_type: contentType,
    content_base64: buffer.toString('base64'),
    updated_at: new Date().toISOString()
  };

  const mongo = await persistEntityDocumentBlob(mongoDb, bucket, storagePath, buffer, contentType);
  let supabase = false;
  if (supabaseBlobOps) {
    try {
      supabase = await supabaseBlobOps.upsert(row);
    } catch {
      supabase = false;
    }
  }

  let appStore = false;
  if (!mongo && !supabase && appStoreBlobOps) {
    try {
      appStore = await appStoreBlobOps.upsert(row);
    } catch {
      appStore = false;
    }
  }

  return { ok: mongo || supabase || appStore, mongo, supabase };
}

export async function loadEntityDocumentFromDatabase(
  mongoDb: Db | null,
  bucket: string,
  storagePath: string
): Promise<{ ok: boolean; buffer?: Buffer; contentType?: string }> {
  const mongo = await loadEntityDocumentBlob(mongoDb, bucket, storagePath);
  if (mongo.ok && mongo.buffer) return mongo;

  if (supabaseBlobOps) {
    try {
      const doc = await supabaseBlobOps.load(entityBlobKey(bucket, storagePath));
      if (doc?.content_base64) {
        return {
          ok: true,
          buffer: Buffer.from(String(doc.content_base64), 'base64'),
          contentType: String(doc.content_type || 'application/octet-stream')
        };
      }
    } catch {
      // fall through
    }
  }

  if (appStoreBlobOps) {
    try {
      const doc = await appStoreBlobOps.load(entityBlobKey(bucket, storagePath));
      if (doc?.content_base64) {
        return {
          ok: true,
          buffer: Buffer.from(String(doc.content_base64), 'base64'),
          contentType: String(doc.content_type || 'application/octet-stream')
        };
      }
    } catch {
      // fall through
    }
  }

  return { ok: false };
}

export async function loadEntityDocumentFromDatabaseAuto(
  bucket: string,
  storagePath: string
): Promise<{ ok: boolean; buffer?: Buffer; contentType?: string }> {
  const { loadEntityDocumentBlobAuto } = await import('./entityDocumentBlobStore');
  const mongo = await loadEntityDocumentBlobAuto(bucket, storagePath);
  if (mongo.ok && mongo.buffer) return mongo;

  if (supabaseBlobOps) {
    try {
      const doc = await supabaseBlobOps.load(entityBlobKey(bucket, storagePath));
      if (doc?.content_base64) {
        return {
          ok: true,
          buffer: Buffer.from(String(doc.content_base64), 'base64'),
          contentType: String(doc.content_type || 'application/octet-stream')
        };
      }
    } catch {
      // fall through
    }
  }

  if (appStoreBlobOps) {
    try {
      const doc = await appStoreBlobOps.load(entityBlobKey(bucket, storagePath));
      if (doc?.content_base64) {
        return {
          ok: true,
          buffer: Buffer.from(String(doc.content_base64), 'base64'),
          contentType: String(doc.content_type || 'application/octet-stream')
        };
      }
    } catch {
      // fall through
    }
  }

  return { ok: false };
}
