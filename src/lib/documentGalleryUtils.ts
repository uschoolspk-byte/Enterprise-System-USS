import { DynamicCustomField, GalleryDocument, Student, Teacher } from '../types';
import { buildEntityDocProxyUrl, ENTITY_DOCS_BUCKET, CLOUDINARY_BUCKET } from '../../entityDocumentStorage';

export type DocumentSource = 'standard' | 'custom_field' | 'gallery_upload';

export interface CollectedDocument {
  id: string;
  title: string;
  url: string;
  source: DocumentSource;
  fieldKey?: string;
  uploadedAt?: string;
  editable: boolean;
}

const isDocumentUrl = (value: unknown): value is string => {
  if (typeof value !== 'string' || !value.trim()) return false;
  return (
    value.startsWith('data:') ||
    value.startsWith('http://') ||
    value.startsWith('https://') ||
    value.startsWith('blob:') ||
    value.startsWith('/api/supabase/file') ||
    value.includes('.pdf') ||
    value.length > 100
  );
};

export function resolveGalleryDocumentUrl(entry: GalleryDocument): string | null {
  if (entry.storage_bucket === CLOUDINARY_BUCKET && entry.url && isDocumentUrl(entry.url)) {
    return entry.url;
  }
  if (entry.storage_persisted === false && entry.url && isDocumentUrl(entry.url)) {
    return entry.url;
  }
  if (entry.url && isDocumentUrl(entry.url) && !entry.url.startsWith('/api/supabase/file')) {
    return entry.url;
  }
  if (entry.storage_path) {
    return buildEntityDocProxyUrl(entry.storage_path, entry.storage_bucket || ENTITY_DOCS_BUCKET);
  }
  if (entry.url && isDocumentUrl(entry.url)) return entry.url;
  return null;
}

export function collectStudentDocuments(
  student: Student,
  customFields: DynamicCustomField[] = []
): CollectedDocument[] {
  const docs: CollectedDocument[] = [];
  const seen = new Set<string>();

  const add = (doc: CollectedDocument) => {
    if (!doc.url || seen.has(doc.url)) return;
    seen.add(doc.url);
    docs.push(doc);
  };

  const standardFields: Array<{ key: keyof Student; label: string }> = [
    { key: 'profile_image_url', label: 'Profile Photo' },
    { key: 'b_form_doc', label: 'B-Form / Birth Certificate' },
    { key: 'father_cnic_doc', label: 'Father CNIC Scan' },
    { key: 'death_certificate_doc', label: 'Death Certificate' },
    { key: 'leaving_cert_doc', label: 'Leaving Certificate' }
  ];

  for (const { key, label } of standardFields) {
    const url = student[key] as string | undefined;
    if (isDocumentUrl(url)) {
      add({
        id: `std-${String(key)}`,
        title: label,
        url: url!,
        source: 'standard',
        fieldKey: String(key),
        editable: true
      });
    }
  }

  const fileFields = customFields.filter(f => f.target === 'student' && f.fieldType === 'file');
  for (const field of fileFields) {
    const url = student.custom_fields?.[field.fieldName];
    if (isDocumentUrl(url)) {
      add({
        id: `cf-${field.id}`,
        title: field.fieldName,
        url: url as string,
        source: 'custom_field',
        fieldKey: field.fieldName,
        editable: true
      });
    }
  }

  for (const entry of student.document_gallery || []) {
    const url = resolveGalleryDocumentUrl(entry);
    if (url && isDocumentUrl(url)) {
      add({
        id: entry.id,
        title: entry.title,
        url,
        source: 'gallery_upload',
        uploadedAt: entry.uploaded_at,
        editable: true
      });
    }
  }

  return docs;
}

export function collectTeacherDocuments(
  teacher: Teacher,
  customFields: DynamicCustomField[] = []
): CollectedDocument[] {
  const docs: CollectedDocument[] = [];
  const seen = new Set<string>();

  const add = (doc: CollectedDocument) => {
    if (!doc.url || seen.has(doc.url)) return;
    seen.add(doc.url);
    docs.push(doc);
  };

  const standardFields: Array<{ key: keyof Teacher; label: string }> = [
    { key: 'profile_image_url', label: 'Profile Photo' },
    { key: 'cnic_doc', label: 'CNIC Card Scan' },
    { key: 'degree_doc', label: 'Degree Certificate' },
    { key: 'work_exp_doc', label: 'Work Experience Certificate' }
  ];

  for (const { key, label } of standardFields) {
    const url = teacher[key] as string | undefined;
    if (isDocumentUrl(url)) {
      add({
        id: `std-${String(key)}`,
        title: label,
        url: url!,
        source: 'standard',
        fieldKey: String(key),
        editable: true
      });
    }
  }

  const fileFields = customFields.filter(f => f.target === 'teacher' && f.fieldType === 'file');
  for (const field of fileFields) {
    const url = teacher.custom_fields?.[field.fieldName];
    if (isDocumentUrl(url)) {
      add({
        id: `cf-${field.id}`,
        title: field.fieldName,
        url: url as string,
        source: 'custom_field',
        fieldKey: field.fieldName,
        editable: true
      });
    }
  }

  for (const entry of teacher.document_gallery || []) {
    const url = resolveGalleryDocumentUrl(entry);
    if (url && isDocumentUrl(url)) {
      add({
        id: entry.id,
        title: entry.title,
        url,
        source: 'gallery_upload',
        uploadedAt: entry.uploaded_at,
        editable: true
      });
    }
  }

  return docs;
}

export function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

export function sourceLabel(source: DocumentSource): string {
  switch (source) {
    case 'standard': return 'Standard Field';
    case 'custom_field': return 'Custom Field';
    case 'gallery_upload': return 'Gallery Upload';
  }
}
