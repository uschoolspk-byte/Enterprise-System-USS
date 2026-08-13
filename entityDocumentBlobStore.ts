import type { Db } from 'mongodb';

const COLLECTION = 'entity_document_blobs';

let dbResolver: (() => Promise<Db | null>) | null = null;

/** Register MongoDB accessor from server startup (enables preview/email fallbacks). */
export function registerEntityDocumentDbResolver(fn: () => Promise<Db | null>): void {
  dbResolver = fn;
}

async function resolveDb(): Promise<Db | null> {
  if (!dbResolver) return null;
  try {
    return await dbResolver();
  } catch {
    return null;
  }
}

export function entityBlobKey(bucket: string, storagePath: string): string {
  return `${bucket}/${storagePath}`;
}

export async function persistEntityDocumentBlob(
  db: Db | null,
  bucket: string,
  storagePath: string,
  buffer: Buffer,
  contentType: string
): Promise<boolean> {
  if (!db) return false;
  try {
    const id = entityBlobKey(bucket, storagePath);
    await db.collection(COLLECTION).updateOne(
      { id },
      {
        $set: {
          id,
          bucket,
          storage_path: storagePath,
          content_type: contentType,
          content_base64: buffer.toString('base64'),
          updated_at: new Date().toISOString()
        }
      },
      { upsert: true }
    );
    return true;
  } catch {
    return false;
  }
}

export async function loadEntityDocumentBlob(
  db: Db | null,
  bucket: string,
  storagePath: string
): Promise<{ ok: boolean; buffer?: Buffer; contentType?: string }> {
  if (!db) return { ok: false };
  try {
    const doc = await db.collection(COLLECTION).findOne({
      id: entityBlobKey(bucket, storagePath)
    });
    if (!doc?.content_base64) return { ok: false };
    return {
      ok: true,
      buffer: Buffer.from(String(doc.content_base64), 'base64'),
      contentType: String(doc.content_type || 'application/octet-stream')
    };
  } catch {
    return { ok: false };
  }
}

export async function loadEntityDocumentBlobAuto(
  bucket: string,
  storagePath: string
): Promise<{ ok: boolean; buffer?: Buffer; contentType?: string }> {
  const db = await resolveDb();
  return loadEntityDocumentBlob(db, bucket, storagePath);
}
