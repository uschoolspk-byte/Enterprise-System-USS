import { downloadStorageWithFailover } from './supabaseFailover';
import { buildEntityDocProxyUrl, ENTITY_DOCS_BUCKET } from './entityDocumentStorage';
import { loadEntityDocumentFromDatabaseAuto } from './entityDocumentDatabase';

export type GalleryDoc = {
  id?: string;
  title?: string;
  url?: string;
  storage_path?: string;
  storage_bucket?: string;
};

type DocumentSource = {
  title: string;
  url?: string | null;
  storage_path?: string;
  storage_bucket?: string;
};

export type EmailAttachment = { filename: string; content: string; encoding: 'base64' };

function extFromMime(mime: string): string {
  if (mime.includes('pdf')) return 'pdf';
  if (mime.includes('png')) return 'png';
  if (mime.includes('webp')) return 'webp';
  if (mime.includes('jpeg') || mime.includes('jpg')) return 'jpg';
  return 'bin';
}

function safeFilenamePart(value: string): string {
  return value.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 80) || 'Document';
}

function isDocumentUrl(value: unknown): value is string {
  if (typeof value !== 'string' || !value.trim()) return false;
  return (
    value.startsWith('data:') ||
    value.startsWith('http://') ||
    value.startsWith('https://') ||
    value.startsWith('/api/supabase/file') ||
    value.includes('.pdf') ||
    value.length > 100
  );
}

function resolveDocumentSourceUrl(source: DocumentSource): string | null {
  if (source.url && isDocumentUrl(source.url)) return source.url;
  if (source.storage_path) {
    return buildEntityDocProxyUrl(source.storage_path, source.storage_bucket || ENTITY_DOCS_BUCKET);
  }
  return null;
}

function collectStudentProfileDocuments(student: Record<string, unknown>): DocumentSource[] {
  const docs: DocumentSource[] = [];
  const seen = new Set<string>();

  const add = (doc: DocumentSource) => {
    const url = resolveDocumentSourceUrl(doc);
    if (!url || seen.has(url)) return;
    seen.add(url);
    docs.push({ ...doc, url });
  };

  const standardFields: Array<{ key: string; label: string }> = [
    { key: 'profile_image_url', label: 'Profile Photo' },
    { key: 'b_form_doc', label: 'B-Form / Birth Certificate' },
    { key: 'father_cnic_doc', label: 'Father CNIC Scan' },
    { key: 'death_certificate_doc', label: 'Death Certificate' },
    { key: 'leaving_cert_doc', label: 'Leaving Certificate' }
  ];

  for (const { key, label } of standardFields) {
    const url = student[key];
    if (isDocumentUrl(url)) add({ title: label, url });
  }

  const customFields = student.custom_fields;
  if (customFields && typeof customFields === 'object') {
    for (const [fieldName, value] of Object.entries(customFields as Record<string, unknown>)) {
      if (isDocumentUrl(value)) {
        add({ title: `Custom - ${fieldName}`, url: value as string });
      }
    }
  }

  if (Array.isArray(student.document_gallery)) {
    for (const entry of student.document_gallery as GalleryDoc[]) {
      if (!entry) continue;
      add({
        title: entry.title?.trim() || 'Gallery Document',
        url: entry.url,
        storage_path: entry.storage_path,
        storage_bucket: entry.storage_bucket
      });
    }
  }

  return docs;
}

function collectTeacherProfileDocuments(teacher: Record<string, unknown>): DocumentSource[] {
  const docs: DocumentSource[] = [];
  const seen = new Set<string>();

  const add = (doc: DocumentSource) => {
    const url = resolveDocumentSourceUrl(doc);
    if (!url || seen.has(url)) return;
    seen.add(url);
    docs.push({ ...doc, url });
  };

  const standardFields: Array<{ key: string; label: string }> = [
    { key: 'profile_image_url', label: 'Profile Photo' },
    { key: 'cnic_doc', label: 'CNIC Card Scan' },
    { key: 'degree_doc', label: 'Degree Certificate' },
    { key: 'work_exp_doc', label: 'Work Experience Certificate' }
  ];

  for (const { key, label } of standardFields) {
    const url = teacher[key];
    if (isDocumentUrl(url)) add({ title: label, url });
  }

  const customFields = teacher.custom_fields;
  if (customFields && typeof customFields === 'object') {
    for (const [fieldName, value] of Object.entries(customFields as Record<string, unknown>)) {
      if (isDocumentUrl(value)) {
        add({ title: `Custom - ${fieldName}`, url: value as string });
      }
    }
  }

  if (Array.isArray(teacher.document_gallery)) {
    for (const entry of teacher.document_gallery as GalleryDoc[]) {
      if (!entry) continue;
      add({
        title: entry.title?.trim() || 'Gallery Document',
        url: entry.url,
        storage_path: entry.storage_path,
        storage_bucket: entry.storage_bucket
      });
    }
  }

  return docs;
}

/** All documents shown in the profile Document Gallery tab (standard, custom, gallery uploads). */
export function collectProfileDocumentSources(
  entity: Record<string, unknown>,
  entityType: 'student' | 'teacher'
): DocumentSource[] {
  return entityType === 'student'
    ? collectStudentProfileDocuments(entity)
    : collectTeacherProfileDocuments(entity);
}

async function attachmentFromDocumentSource(
  source: DocumentSource,
  baseName: string
): Promise<EmailAttachment | null> {
  const bucket = source.storage_bucket || ENTITY_DOCS_BUCKET;
  let url = resolveDocumentSourceUrl(source);
  if (!url && !source.storage_path) return null;

  if (!url && source.storage_path) {
    url = buildEntityDocProxyUrl(source.storage_path, bucket);
  }
  if (!url) return null;

  let att: EmailAttachment | null = null;
  if (url.startsWith('data:')) {
    att = attachmentFromDataUrl(url, baseName);
  } else if (url.includes('/api/supabase/file')) {
    att = await attachmentFromSupabaseFileUrl(url, baseName);
  } else if (url.startsWith('http://') || url.startsWith('https://')) {
    att = await attachmentFromHttpUrl(url, baseName);
  }

  if (!att && source.storage_path) {
    att = await attachmentFromStoragePath(source.storage_path, bucket, baseName);
  }

  return att;
}

/** Attach every document from the profile gallery alongside the profile PDF. */
export async function buildProfileDocumentGalleryAttachments(
  entity: Record<string, unknown>,
  entityType: 'student' | 'teacher',
  filenamePrefix: string
): Promise<EmailAttachment[]> {
  const sources = collectProfileDocumentSources(entity, entityType);
  if (sources.length === 0) return [];

  const attachments: EmailAttachment[] = [];
  const usedNames = new Set<string>();

  for (let i = 0; i < sources.length; i++) {
    const source = sources[i];
    let baseName = `${filenamePrefix}_${safeFilenamePart(source.title)}`;
    if (usedNames.has(baseName)) baseName = `${baseName}_${i + 1}`;
    usedNames.add(baseName);

    const att = await attachmentFromDocumentSource(source, baseName);
    if (att) attachments.push(att);
  }

  return attachments;
}

function attachmentFromDataUrl(url: string, baseName: string) {
  const match = url.match(/^data:([^;]+);base64,(.+)$/s);
  if (!match) return null;
  const ext = extFromMime(match[1]);
  return {
    filename: `${safeFilenamePart(baseName)}.${ext}`,
    content: match[2],
    encoding: 'base64' as const
  };
}

async function attachmentFromHttpUrl(url: string, baseName: string) {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const buffer = Buffer.from(await res.arrayBuffer());
    const ct = res.headers.get('content-type') || '';
    const ext = extFromMime(ct);
    return {
      filename: `${safeFilenamePart(baseName)}.${ext}`,
      content: buffer.toString('base64'),
      encoding: 'base64' as const
    };
  } catch {
    return null;
  }
}

async function attachmentFromStoragePath(storagePath: string, bucketName: string, baseName: string) {
  try {
    let download = await downloadStorageWithFailover(bucketName, storagePath);
    if (!download.ok || !download.buffer) {
      download = await loadEntityDocumentFromDatabaseAuto(bucketName, storagePath);
    }
    if (!download.ok || !download.buffer) return null;

    const pathExt = storagePath.split('.').pop();
    const ext = pathExt && pathExt.length <= 5 ? pathExt : extFromMime(download.contentType || '');
    return {
      filename: `${safeFilenamePart(baseName)}.${ext}`,
      content: download.buffer.toString('base64'),
      encoding: 'base64' as const
    };
  } catch {
    return null;
  }
}

async function attachmentFromSupabaseFileUrl(url: string, baseName: string) {
  try {
    const parsed = new URL(url, 'http://localhost');
    if (!parsed.pathname.includes('/api/supabase/file')) return null;

    const storagePath = parsed.searchParams.get('path') || '';
    const bucketName = parsed.searchParams.get('bucket') || ENTITY_DOCS_BUCKET;
    if (!storagePath || !storagePath.includes('/')) return null;

    const download = await downloadStorageWithFailover(bucketName, storagePath);
    if (!download.ok || !download.buffer) return null;

    const pathExt = storagePath.split('.').pop();
    const ext = pathExt && pathExt.length <= 5 ? pathExt : extFromMime(download.contentType || '');
    return {
      filename: `${safeFilenamePart(baseName)}.${ext}`,
      content: download.buffer.toString('base64'),
      encoding: 'base64' as const
    };
  } catch {
    return null;
  }
}

/** Build nodemailer attachments from document_gallery entries (data URLs, Supabase, or http). */
export async function buildDocumentGalleryEmailAttachments(
  gallery: GalleryDoc[] | undefined,
  filenamePrefix: string
): Promise<EmailAttachment[]> {
  if (!Array.isArray(gallery) || gallery.length === 0) return [];

  const attachments: EmailAttachment[] = [];
  const usedNames = new Set<string>();

  for (let i = 0; i < gallery.length; i++) {
    const entry = gallery[i];
    const bucket = entry.storage_bucket || ENTITY_DOCS_BUCKET;
    let url = typeof entry?.url === 'string' ? entry.url.trim() : '';
    if (!url && entry.storage_path) {
      url = buildEntityDocProxyUrl(entry.storage_path, bucket);
    }
    if (!url && !entry.storage_path) continue;

    const title = entry.title?.trim() || `Gallery_${i + 1}`;
    let baseName = `${filenamePrefix}_Gallery_${title}`;
    if (usedNames.has(baseName)) baseName = `${baseName}_${i + 1}`;
    usedNames.add(baseName);

    const att = await attachmentFromDocumentSource(
      {
        title,
        url,
        storage_path: entry.storage_path,
        storage_bucket: entry.storage_bucket
      },
      baseName
    );
    if (att) attachments.push(att);
  }

  return attachments;
}
