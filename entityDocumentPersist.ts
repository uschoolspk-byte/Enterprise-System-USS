import type { Db } from 'mongodb';
import {
  ENTITY_DOCS_BUCKET,
  buildEntityDocStoragePath,
  buildEntityDocProxyUrl,
  inferDocumentExt,
  normalizeGalleryDocForStore,
  CLOUDINARY_BUCKET,
  type GalleryDocRecord
} from './entityDocumentStorage';
import { persistEntityDocumentToDatabase } from './entityDocumentDatabase';
import { isCloudinaryConfigured, uploadBufferToCloudinary } from './cloudinaryStorage';

const STUDENT_DOC_FIELDS = [
  'profile_image_url',
  'b_form_doc',
  'father_cnic_doc',
  'death_certificate_doc',
  'leaving_cert_doc'
] as const;

const TEACHER_DOC_FIELDS = [
  'profile_image_url',
  'cnic_doc',
  'degree_doc',
  'work_exp_doc'
] as const;

function isDataDocumentUrl(value: unknown): value is string {
  return typeof value === 'string' && value.startsWith('data:') && value.length > 50;
}

function isPersistedProxyUrl(value: unknown): boolean {
  return typeof value === 'string' && value.startsWith('/api/supabase/file');
}

function isPersistedRemoteUrl(value: unknown): boolean {
  return typeof value === 'string' && (value.startsWith('https://') || value.startsWith('http://'));
}

function contentTypeForExt(ext: string): string {
  if (ext === 'pdf') return 'application/pdf';
  if (ext === 'png') return 'image/png';
  if (ext === 'webp') return 'image/webp';
  if (ext === 'gif') return 'image/gif';
  return `image/${ext === 'jpg' ? 'jpeg' : ext}`;
}

export function buildEntityFieldStoragePath(
  entityType: 'students' | 'teachers',
  entityId: string,
  fieldKey: string,
  ext: string
): string {
  const safeId = entityId.replace(/[^a-zA-Z0-9_-]/g, '_');
  const safeField = fieldKey.replace(/[^a-zA-Z0-9_-]/g, '_');
  return `${entityType}/${safeId}/fields/${safeField}.${ext}`;
}

export function buildEntityCustomFieldStoragePath(
  entityType: 'students' | 'teachers',
  entityId: string,
  fieldName: string,
  ext: string
): string {
  const safeId = entityId.replace(/[^a-zA-Z0-9_-]/g, '_');
  const safeField = fieldName.replace(/[^a-zA-Z0-9_-]/g, '_');
  return `${entityType}/${safeId}/custom/${safeField}.${ext}`;
}

async function persistDataUrlToDatabase(
  mongoDb: Db | null,
  dataUrl: string,
  storagePath: string
): Promise<{ ok: boolean; url: string; storage_path?: string; storage_bucket?: string }> {
  const ext = inferDocumentExt(dataUrl);
  const cleanBase64 = dataUrl.replace(/^data:[^;]+;base64,/, '');
  const buffer = Buffer.from(cleanBase64, 'base64');
  const contentType = contentTypeForExt(ext);

  if (isCloudinaryConfigured()) {
    const cloud = await uploadBufferToCloudinary(buffer, storagePath, contentType);
    if (cloud.ok && cloud.secureUrl && cloud.publicId) {
      return {
        ok: true,
        url: cloud.secureUrl,
        storage_path: cloud.publicId,
        storage_bucket: CLOUDINARY_BUCKET
      };
    }
  }

  const saved = await persistEntityDocumentToDatabase(
    mongoDb,
    ENTITY_DOCS_BUCKET,
    storagePath,
    buffer,
    contentType
  );
  if (!saved.ok) return { ok: false, url: dataUrl };
  return {
    ok: true,
    url: buildEntityDocProxyUrl(storagePath),
    storage_path: storagePath,
    storage_bucket: ENTITY_DOCS_BUCKET
  };
}

/** Persist every embedded document on a student/teacher row to the database before sync strip. */
export async function hydrateEntityAllDocuments(
  row: Record<string, unknown>,
  entityType: 'students' | 'teachers',
  mongoDb: Db | null
): Promise<Record<string, unknown>> {
  const entityId = String(row.id || '');
  if (!entityId) return row;

  const out: Record<string, unknown> = { ...row };
  const docFields = entityType === 'students' ? STUDENT_DOC_FIELDS : TEACHER_DOC_FIELDS;

  for (const fieldKey of docFields) {
    const value = out[fieldKey];
    if (isDataDocumentUrl(value)) {
      const ext = inferDocumentExt(value);
      const storagePath = buildEntityFieldStoragePath(entityType, entityId, fieldKey, ext);
      const persisted = await persistDataUrlToDatabase(mongoDb, value, storagePath);
      if (persisted.ok) out[fieldKey] = persisted.url;
    } else if (isPersistedProxyUrl(value) || isPersistedRemoteUrl(value)) {
      out[fieldKey] = value;
    }
  }

  const customFields = out.custom_fields;
  if (customFields && typeof customFields === 'object' && !Array.isArray(customFields)) {
    const nextCustom: Record<string, unknown> = { ...(customFields as Record<string, unknown>) };
    for (const [fieldName, value] of Object.entries(nextCustom)) {
      if (isDataDocumentUrl(value)) {
        const ext = inferDocumentExt(value);
        const storagePath = buildEntityCustomFieldStoragePath(entityType, entityId, fieldName, ext);
        const persisted = await persistDataUrlToDatabase(mongoDb, value, storagePath);
        if (persisted.ok) nextCustom[fieldName] = persisted.url;
      }
    }
    out.custom_fields = nextCustom;
  }

  if (Array.isArray(out.document_gallery)) {
    const gallery = await Promise.all(
      (out.document_gallery as GalleryDocRecord[]).map(async doc => {
        if (!doc) return doc;

        if (doc.url && !String(doc.url).startsWith('data:')) {
          return normalizeGalleryDocForStore({
            ...doc,
            storage_persisted: doc.storage_persisted ?? true
          });
        }

        const docId = doc.id || `gal-${Date.now()}`;
        const ext = inferDocumentExt(String(doc.url), doc.title);
        const storagePath = doc.storage_path || buildEntityDocStoragePath(entityType, entityId, docId, ext);
        const persisted = await persistDataUrlToDatabase(mongoDb, String(doc.url), storagePath);

        return normalizeGalleryDocForStore({
          ...doc,
          id: docId,
          url: persisted.ok ? persisted.url : doc.url,
          storage_path: persisted.storage_path || storagePath,
          storage_bucket: persisted.storage_bucket || ENTITY_DOCS_BUCKET,
          storage_persisted: persisted.ok
        });
      })
    );

    out.document_gallery = gallery.filter(doc => doc && (doc.url || doc.storage_path));
  }

  return out;
}

export async function hydrateEntityListAllDocuments(
  items: unknown[] | undefined,
  entityType: 'students' | 'teachers',
  mongoDb: Db | null
): Promise<unknown[] | undefined> {
  if (!Array.isArray(items)) return items;
  return Promise.all(
    items.map(async item => {
      if (!item || typeof item !== 'object') return item;
      return hydrateEntityAllDocuments(item as Record<string, unknown>, entityType, mongoDb);
    })
  );
}
