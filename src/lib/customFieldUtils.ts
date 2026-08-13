import { DynamicCustomField, Student, Teacher, FeeLedger, Expense } from '../types';
import { isImageUrl, isPDFUrl } from './pdfViewerUtils';

/** Human-readable label for PDF/export — never dump raw base64 or data URLs. */
export function formatCustomFieldValueForExport(
  value: unknown,
  fieldMeta?: Pick<DynamicCustomField, 'fieldType'>
): string {
  if (value === null || value === undefined) return '—';
  const str = String(value).trim();
  if (!str) return '—';

  const isFileField = fieldMeta?.fieldType === 'file';

  if (isFileField || isPDFUrl(str)) {
    return 'VERIFIED ATTACHED (PDF)';
  }
  if (isImageUrl(str)) {
    return 'VERIFIED ATTACHED (Image)';
  }
  if (
    str.startsWith('data:') ||
    str.startsWith('blob:') ||
    (str.length > 200 && !str.includes(' '))
  ) {
    return 'VERIFIED ATTACHED (File)';
  }
  if (str.length > 120) {
    return str.slice(0, 117) + '...';
  }
  return str;
}

export function documentAttachmentStatus(url: string | undefined | null): string {
  if (!url || !String(url).trim()) return 'NOT UPLOADED';
  return 'VERIFIED ATTACHED';
}

export function migrateCustomFieldKey(
  records: Record<string, any> | undefined,
  oldName: string,
  newName: string
): Record<string, any> | undefined {
  if (!records || records[oldName] === undefined) return records;
  const next = { ...records };
  next[newName] = next[oldName];
  delete next[oldName];
  return next;
}

export function removeCustomFieldKey(
  records: Record<string, any> | undefined,
  fieldName: string
): Record<string, any> | undefined {
  if (!records || records[fieldName] === undefined) return records;
  const next = { ...records };
  delete next[fieldName];
  return next;
}

export function migrateStudentsCustomFieldKey(
  students: Student[],
  oldName: string,
  newName: string
): Student[] {
  return students.map(s => ({
    ...s,
    custom_fields: migrateCustomFieldKey(s.custom_fields, oldName, newName)
  }));
}

export function migrateTeachersCustomFieldKey(
  teachers: Teacher[],
  oldName: string,
  newName: string
): Teacher[] {
  return teachers.map(t => ({
    ...t,
    custom_fields: migrateCustomFieldKey(t.custom_fields, oldName, newName)
  }));
}

export function migrateFinancialCustomFieldKey(
  fees: FeeLedger[],
  expenses: Expense[],
  oldName: string,
  newName: string
): { fees: FeeLedger[]; expenses: Expense[] } {
  return {
    fees: fees.map(f => ({
      ...f,
      custom_fields: migrateCustomFieldKey(f.custom_fields, oldName, newName)
    })),
    expenses: expenses.map(e => ({
      ...e,
      custom_fields: migrateCustomFieldKey(e.custom_fields, oldName, newName)
    }))
  };
}

export function purgeCustomFieldKeyFromTarget(
  target: DynamicCustomField['target'],
  fieldName: string,
  data: {
    students: Student[];
    teachers: Teacher[];
    fees: FeeLedger[];
    expenses: Expense[];
  }
): Partial<{ students: Student[]; teachers: Teacher[]; fees: FeeLedger[]; expenses: Expense[] }> {
  switch (target) {
    case 'student':
      return {
        students: data.students.map(s => ({
          ...s,
          custom_fields: removeCustomFieldKey(s.custom_fields, fieldName)
        }))
      };
    case 'teacher':
      return {
        teachers: data.teachers.map(t => ({
          ...t,
          custom_fields: removeCustomFieldKey(t.custom_fields, fieldName)
        }))
      };
    case 'financial':
      return {
        fees: data.fees.map(f => ({
          ...f,
          custom_fields: removeCustomFieldKey(f.custom_fields, fieldName)
        })),
        expenses: data.expenses.map(e => ({
          ...e,
          custom_fields: removeCustomFieldKey(e.custom_fields, fieldName)
        }))
      };
    default:
      return {};
  }
}

export function normalizeCustomField(raw: Record<string, any>): DynamicCustomField {
  return {
    id: raw.id,
    target: raw.target,
    fieldName: raw.fieldName ?? raw.field_name ?? '',
    fieldType: raw.fieldType ?? raw.field_type ?? 'text',
    isRequired: raw.isRequired ?? raw.is_required ?? false
  };
}
