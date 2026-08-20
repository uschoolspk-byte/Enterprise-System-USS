/** Shared helpers for entity document gallery storage (client + server). */

export const ENTITY_DOCS_BUCKET = 'entity-documents';
export const CLOUDINARY_BUCKET = 'cloudinary';

export type GalleryDocRecord = {
  id?: string;
  title?: string;
  url?: string | null;
  uploaded_at?: string;
  notes?: string;
  storage_path?: string;
  storage_bucket?: string;
  storage_persisted?: boolean;
};

export function isRemoteDocumentUrl(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    (value.startsWith('https://') || value.startsWith('http://') || value.startsWith('/api/supabase/file'))
  );
}

export function buildEntityDocStoragePath(
  entityType: 'students' | 'teachers',
  entityId: string,
  docId: string,
  ext: string
): string {
  const safeId = entityId.replace(/[^a-zA-Z0-9_-]/g, '_');
  const safeDocId = docId.replace(/[^a-zA-Z0-9_-]/g, '_');
  return `${entityType}/${safeId}/${safeDocId}.${ext}`;
}

export function buildEntityDocProxyUrl(
  storagePath: string,
  bucket = ENTITY_DOCS_BUCKET
): string {
  return `/api/supabase/file?bucket=${encodeURIComponent(bucket)}&path=${encodeURIComponent(storagePath)}`;
}

export function inferDocumentExt(dataUrlOrMime: string, fileName?: string): string {
  const fromName = fileName?.match(/\.([a-zA-Z0-9]+)$/);
  if (fromName) {
    const ext = fromName[1].toLowerCase();
    if (ext === 'jpeg') return 'jpg';
    return ext;
  }

  const mimeMatch = dataUrlOrMime.match(/^data:([^;]+);/);
  const mime = (mimeMatch?.[1] || dataUrlOrMime).toLowerCase();
  if (mime.includes('pdf')) return 'pdf';
  if (mime.includes('png')) return 'png';
  if (mime.includes('webp')) return 'webp';
  if (mime.includes('gif')) return 'gif';
  if (mime.includes('jpeg') || mime.includes('jpg')) return 'jpg';
  if (mime.includes('bmp')) return 'bmp';
  if (mime.includes('tiff') || mime.includes('tif')) return 'tiff';
  if (mime.includes('svg')) return 'svg';
  if (mime.includes('heic') || mime.includes('heif')) return 'heic';
  if (mime.includes('msword') || mime.includes('application/word')) return 'doc';
  if (mime.includes('openxmlformats-officedocument.wordprocessingml')) return 'docx';
  if (mime.includes('excel') || mime.includes('spreadsheetml.sheet')) return 'xlsx';
  if (mime.includes('vnd.ms-excel')) return 'xls';
  if (mime.includes('powerpoint') || mime.includes('presentationml.presentation')) return 'pptx';
  if (mime.includes('vnd.ms-powerpoint')) return 'ppt';
  if (mime.includes('rtf')) return 'rtf';
  if (mime.includes('plain') || (mime.includes('text/') && !mime.includes('html') && !mime.includes('csv'))) return 'txt';
  if (mime.includes('csv')) return 'csv';
  if (mime.includes('html') || mime.includes('htm')) return 'html';
  if (mime.includes('zip') || mime.includes('compressed')) return 'zip';
  if (mime.includes('rar')) return 'rar';
  if (mime.includes('7z') || mime.includes('7-zip')) return '7z';
  if (mime.includes('tar')) return 'tar';
  if (mime.includes('gz') || mime.includes('gzip')) return 'gz';
  if (mime.includes('mp3') || (mime.includes('mpeg') && mime.includes('audio'))) return 'mp3';
  if (mime.includes('mp4') || mime.includes('video/mp4')) return 'mp4';
  if (mime.includes('wav')) return 'wav';
  if (mime.includes('avi')) return 'avi';
  if (mime.includes('mov') || mime.includes('quicktime')) return 'mov';
  if (mime.includes('json')) return 'json';
  if (mime.includes('xml')) return 'xml';
  if (mime.includes('vcard') || mime.includes('vcf')) return 'vcf';
  if (mime.includes('ics')) return 'ics';
  return 'dat';
}

/** Replace oversized data URLs with persisted remote URLs when storage is confirmed. */
export function normalizeGalleryDocForStore(doc: GalleryDocRecord): GalleryDocRecord {
  if (doc.storage_bucket === CLOUDINARY_BUCKET && isRemoteDocumentUrl(doc.url)) {
    return { ...doc, storage_persisted: doc.storage_persisted ?? true };
  }

  const bucket = doc.storage_bucket || ENTITY_DOCS_BUCKET;

  if (doc.storage_path && doc.storage_persisted !== false) {
    if (isRemoteDocumentUrl(doc.url)) return doc;
    const url = doc.url;
    if (!url || typeof url !== 'string' || url.startsWith('data:') || url.length > 4000) {
      return {
        ...doc,
        url: buildEntityDocProxyUrl(doc.storage_path, bucket)
      };
    }
    return doc;
  }

  if (typeof doc.url === 'string' && doc.url.startsWith('data:') && doc.url.length > 4000) {
    return { ...doc, url: null };
  }

  return doc;
}

export async function uploadEntityDocumentViaApi(
  entityType: 'students' | 'teachers',
  entityId: string,
  docId: string,
  fileBase64: string,
  fileName?: string
): Promise<{
  url: string;
  storage_path: string;
  storage_bucket: string;
  storagePersisted: boolean;
}> {
  const ext = inferDocumentExt(fileBase64, fileName);
  const storagePath = buildEntityDocStoragePath(entityType, entityId, docId, ext);
  const bucket = ENTITY_DOCS_BUCKET;

  const res = await fetch('/api/supabase/upload', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ bucket, path: storagePath, fileBase64 })
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Document upload failed.');
  }

  const data = await res.json();
  const persisted =
    data.cloudPersisted === true ||
    data.storagePersisted === true ||
    data.dbPersisted === true;

  if (persisted && data.publicUrl) {
    const resolvedBucket =
      data.bucket === CLOUDINARY_BUCKET || String(data.publicUrl).includes('res.cloudinary.com')
        ? CLOUDINARY_BUCKET
        : (data.bucket || ENTITY_DOCS_BUCKET);
    const url =
      String(data.publicUrl).startsWith('http')
        ? String(data.publicUrl)
        : buildEntityDocProxyUrl(String(data.path || storagePath), resolvedBucket);

    return {
      url,
      storage_path: String(data.path || storagePath),
      storage_bucket: resolvedBucket,
      storagePersisted: true
    };
  }

  throw new Error(data.error || 'Document could not be saved.');
}
