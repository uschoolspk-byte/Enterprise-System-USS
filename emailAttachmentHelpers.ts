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
  const m = String(mime || '').toLowerCase();
  if (m.includes('pdf')) return 'pdf';
  if (m.includes('png')) return 'png';
  if (m.includes('webp')) return 'webp';
  if (m.includes('jpeg') || m.includes('jpg')) return 'jpg';
  if (m.includes('gif')) return 'gif';
  if (m.includes('bmp')) return 'bmp';
  if (m.includes('tiff') || m.includes('tif')) return 'tiff';
  if (m.includes('svg')) return 'svg';
  if (m.includes('heic') || m.includes('heif')) return 'heic';
  if (m.includes('msword') || m.includes('application/word')) return 'doc';
  if (m.includes('openxmlformats-officedocument.wordprocessingml')) return 'docx';
  if (m.includes('excel') || m.includes('spreadsheetml.sheet')) return 'xlsx';
  if (m.includes('vnd.ms-excel')) return 'xls';
  if (m.includes('powerpoint') || m.includes('presentationml.presentation')) return 'pptx';
  if (m.includes('vnd.ms-powerpoint')) return 'ppt';
  if (m.includes('rtf')) return 'rtf';
  if (m.includes('plain') || m.includes('text/') && !m.includes('html') && !m.includes('csv')) return 'txt';
  if (m.includes('csv')) return 'csv';
  if (m.includes('html') || m.includes('htm')) return 'html';
  if (m.includes('zip') || m.includes('compressed')) return 'zip';
  if (m.includes('rar')) return 'rar';
  if (m.includes('7z') || m.includes('7-zip')) return '7z';
  if (m.includes('tar')) return 'tar';
  if (m.includes('gz') || m.includes('gzip')) return 'gz';
  if (m.includes('mp3') || m.includes('mpeg') && m.includes('audio')) return 'mp3';
  if (m.includes('mp4') || m.includes('video/mp4')) return 'mp4';
  if (m.includes('wav')) return 'wav';
  if (m.includes('avi')) return 'avi';
  if (m.includes('mov') || m.includes('quicktime')) return 'mov';
  if (m.includes('json')) return 'json';
  if (m.includes('xml')) return 'xml';
  if (m.includes('vcard') || m.includes('vcf')) return 'vcf';
  if (m.includes('ics')) return 'ics';
  return '';
}

function extFromMagicBytes(buffer: Buffer | Uint8Array | string): string {
  let bytes: Uint8Array;
  if (typeof buffer === 'string') {
    try {
      const b64 = buffer.includes(',') ? buffer.split(',')[1] : buffer;
      const binary = atob(b64);
      const len = Math.min(binary.length, 16);
      bytes = new Uint8Array(len);
      for (let i = 0; i < len; i++) bytes[i] = binary.charCodeAt(i);
    } catch {
      return '';
    }
  } else if (Buffer.isBuffer(buffer)) {
    const len = Math.min(buffer.length, 16);
    bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) bytes[i] = buffer[i];
  } else {
    const len = Math.min(buffer.length, 16);
    bytes = buffer.slice(0, len);
  }
  const b = bytes;
  if (b.length >= 4 && b[0] === 0x25 && b[1] === 0x50 && b[2] === 0x44 && b[3] === 0x46) return 'pdf';
  if (b.length >= 8 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4E && b[3] === 0x47 && b[4] === 0x0D && b[5] === 0x0A && b[6] === 0x1A && b[7] === 0x0A) return 'png';
  if (b.length >= 3 && b[0] === 0xFF && b[1] === 0xD8 && b[2] === 0xFF) return 'jpg';
  if (b.length >= 6 && (b[0] === 0x47 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x38 && (b[4] === 0x37 || b[4] === 0x39) && b[5] === 0x61)) return 'gif';
  if (b.length >= 12 && b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50) return 'webp';
  if (b.length >= 2 && b[0] === 0x42 && b[1] === 0x4D) return 'bmp';
  if (b.length >= 4 && b[0] === 0x50 && b[1] === 0x4B && b[2] === 0x03 && b[3] === 0x04) return 'zip';
  if (b.length >= 8 && b[0] === 0x52 && b[1] === 0x61 && b[2] === 0x72 && b[3] === 0x21 && b[4] === 0x1A && b[5] === 0x07 && (b[6] === 0x00 || b[6] === 0x01)) return 'rar';
  if (b.length >= 3 && b[0] === 0x1F && b[1] === 0x8B && b[2] === 0x08) return 'gz';
  if (b.length >= 6 && b[0] === 0x75 && b[1] === 0x73 && b[2] === 0x74 && b[3] === 0x61 && b[4] === 0x72) return 'tar';
  if (b.length >= 4 && (b[0] === 0x49 && b[1] === 0x49 && b[2] === 0x2A && b[3] === 0x00) || (b[0] === 0x4D && b[1] === 0x4D && b[2] === 0x00 && b[3] === 0x2A)) return 'tiff';
  if (b.length >= 3 && (b[0] === 0x49 && b[1] === 0x44 && b[2] === 0x33) || (b[0] === 0x49 && b[1] === 0x44 && b[2] === 0x32)) return 'mp3';
  if (b.length >= 12 && b[4] === 0x66 && b[5] === 0x74 && b[6] === 0x79 && b[7] === 0x70) return 'mp4';
  if (b.length >= 4 && b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46) return 'wav';
  if (b.length >= 8 && (b[0] === 0x30 || b[0] === 0x31 || b[0] === 0x32) && b[1] === 0x00 && b[2] === 0x00 && b[3] === 0x00 && (b[4] === 0x66 && b[5] === 0x74 && b[6] === 0x79 && b[7] === 0x70)) return 'mov';
  return '';
}

function resolveExtension(mime: string, buffer?: Buffer | Uint8Array | string, fallbackPathExt?: string): string {
  const BLOCKED_EXTS = new Set(['bin', 'exe', 'bat', 'cmd', 'com', 'scr', 'pif', 'vbs', 'js', 'msi', 'reg', 'ps1']);
  if (fallbackPathExt && !BLOCKED_EXTS.has(fallbackPathExt.toLowerCase())) return fallbackPathExt.toLowerCase();
  const fromMime = extFromMime(mime);
  if (fromMime) return fromMime;
  if (buffer) {
    const fromMagic = extFromMagicBytes(buffer);
    if (fromMagic) return fromMagic;
  }
  return 'dat';
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
  const ext = resolveExtension(match[1], match[2]);
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
    const ext = resolveExtension(ct, buffer);
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
    const validatedPathExt = pathExt && pathExt.length <= 5 ? pathExt : undefined;
    const ext = resolveExtension(download.contentType || '', download.buffer, validatedPathExt);
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
    const validatedPathExt = pathExt && pathExt.length <= 5 ? pathExt : undefined;
    const ext = resolveExtension(download.contentType || '', download.buffer, validatedPathExt);
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
