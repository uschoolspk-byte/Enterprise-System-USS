import {
  normalizeGalleryDocForStore,
  type GalleryDocRecord
} from './entityDocumentStorage';

export const STUDENT_DOC_URL_FIELDS = [
  'profile_image_url',
  'b_form_doc',
  'father_cnic_doc',
  'death_certificate_doc',
  'leaving_cert_doc'
] as const;

export const TEACHER_DOC_URL_FIELDS = [
  'profile_image_url',
  'cnic_doc',
  'degree_doc',
  'work_exp_doc'
] as const;

function isUsableDocUrl(value: unknown): value is string {
  if (typeof value !== 'string' || !value.trim()) return false;
  if (value.startsWith('/api/supabase/file')) return true;
  if (value.startsWith('http://') || value.startsWith('https://')) return true;
  if (value.startsWith('data:') && value.length <= 4000) return true;
  return false;
}

function galleryDocKey(doc: GalleryDocRecord): string {
  return String(doc.id || doc.storage_path || doc.url || '');
}

function galleryDocScore(doc: GalleryDocRecord): number {
  let score = 0;
  if (doc.storage_path) score += 4;
  if (doc.storage_persisted !== false) score += 2;
  if (typeof doc.url === 'string' && doc.url.startsWith('/api/supabase/file')) score += 3;
  if (typeof doc.url === 'string' && doc.url.startsWith('https://res.cloudinary.com')) score += 4;
  if (typeof doc.url === 'string' && doc.url && !doc.url.startsWith('data:')) score += 1;
  return score;
}

export function mergeGalleryDocuments(
  ...sources: (GalleryDocRecord[] | undefined | null)[]
): GalleryDocRecord[] {
  const map = new Map<string, GalleryDocRecord>();

  for (const list of sources) {
    if (!Array.isArray(list)) continue;
    for (const raw of list) {
      if (!raw) continue;
      const doc = normalizeGalleryDocForStore(raw);
      const key = galleryDocKey(doc);
      if (!key) continue;

      const prev = map.get(key);
      if (!prev) {
        map.set(key, doc);
        continue;
      }

      const winner = galleryDocScore(doc) >= galleryDocScore(prev) ? doc : prev;
      const loser = winner === doc ? prev : doc;
      map.set(key, normalizeGalleryDocForStore({ ...loser, ...winner }));
    }
  }

  return Array.from(map.values()).filter(doc => doc.url || doc.storage_path);
}

function coerceDateField(value: unknown, fallback?: string): string {
  const fb =
    fallback && String(fallback).trim() && String(fallback).toLowerCase() !== 'n/a'
      ? coerceDateField(fallback)
      : new Date().toISOString().slice(0, 10);
  if (value === null || value === undefined) return fb;
  const s = String(value).trim();
  if (!s || s.toLowerCase() === 'n/a' || s.toLowerCase() === 'na') return fb;
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const parsed = Date.parse(s);
  if (Number.isFinite(parsed)) return new Date(parsed).toISOString().slice(0, 10);
  return fb;
}

function normalizeMergedDateFields(merged: Record<string, unknown>): void {
  if ('roll_no' in merged || 'class_name' in merged) {
    if ('enrollment_date' in merged) merged.enrollment_date = coerceDateField(merged.enrollment_date);
    if ('dob' in merged) merged.dob = coerceDateField(merged.dob, String(merged.enrollment_date || ''));
  } else if ('designation' in merged || 'teacher_id' in merged) {
    if ('joining_date' in merged) merged.joining_date = coerceDateField(merged.joining_date);
    if ('dob' in merged) merged.dob = coerceDateField(merged.dob, String(merged.joining_date || ''));
  }
}

function docFieldsForRecord(row: Record<string, unknown>): readonly string[] {
  return row.teacher_id !== undefined || row.designation !== undefined
    ? TEACHER_DOC_URL_FIELDS
    : STUDENT_DOC_URL_FIELDS;
}

export function mergeRecordDocuments<T extends Record<string, unknown>>(base: T, overlay: T): T {
  const merged: Record<string, unknown> = { ...base, ...overlay };
  const docFields = docFieldsForRecord(merged);

  const baseGallery = Array.isArray(base.document_gallery)
    ? (base.document_gallery as GalleryDocRecord[])
    : [];
  const overlayGallery = Array.isArray(overlay.document_gallery)
    ? (overlay.document_gallery as GalleryDocRecord[])
    : [];
  const gallery = mergeGalleryDocuments(baseGallery, overlayGallery);
  if (gallery.length > 0) {
    merged.document_gallery = gallery;
  } else if (!Array.isArray(merged.document_gallery)) {
    merged.document_gallery = [];
  }

  for (const key of docFields) {
    const overlayVal = overlay[key];
    const baseVal = base[key];
    if (isUsableDocUrl(overlayVal)) merged[key] = overlayVal;
    else if (isUsableDocUrl(baseVal)) merged[key] = baseVal;
  }

  const baseCustom =
    base.custom_fields && typeof base.custom_fields === 'object' && !Array.isArray(base.custom_fields)
      ? (base.custom_fields as Record<string, unknown>)
      : {};
  const overlayCustom =
    overlay.custom_fields && typeof overlay.custom_fields === 'object' && !Array.isArray(overlay.custom_fields)
      ? (overlay.custom_fields as Record<string, unknown>)
      : {};
  if (Object.keys(baseCustom).length || Object.keys(overlayCustom).length) {
    const nextCustom = { ...baseCustom, ...overlayCustom };
    for (const key of new Set([...Object.keys(baseCustom), ...Object.keys(overlayCustom)])) {
      const overlayVal = overlayCustom[key];
      const baseVal = baseCustom[key];
      if (isUsableDocUrl(overlayVal)) nextCustom[key] = overlayVal;
      else if (isUsableDocUrl(baseVal)) nextCustom[key] = baseVal;
    }
    merged.custom_fields = nextCustom;
  }

  normalizeMergedDateFields(merged);

  return merged as T;
}

/** Merge entity lists while preserving the richest document metadata per record. */
export function mergeEntityListsWithDocuments<T extends { id: string }>(
  ...sources: (T[] | undefined | null)[]
): T[] {
  const map = new Map<string, T>();

  for (const list of sources) {
    if (!Array.isArray(list)) continue;
    for (const item of list) {
      if (!item?.id) continue;
      const prev = map.get(item.id);
      map.set(item.id, prev ? mergeRecordDocuments(prev as Record<string, unknown>, item as Record<string, unknown>) as T : item);
    }
  }

  return Array.from(map.values());
}
