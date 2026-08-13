/** Server-side DB sync helpers (used by server.ts) */

export function mergeRecordsById<T extends { id: string }>(
  ...sources: (T[] | undefined | null)[]
): T[] {
  const map = new Map<string, T>();
  for (const list of sources) {
    if (!Array.isArray(list)) continue;
    for (const item of list) {
      if (!item?.id) continue;
      const prev = map.get(item.id);
      map.set(item.id, prev ? { ...prev, ...item } : item);
    }
  }
  return Array.from(map.values());
}

/** Later arrays override earlier ones (app_store wins over table rows). */
export function mergePreferLatest<T extends { id: string }>(
  ...sources: (T[] | undefined | null)[]
): T[] {
  const map = new Map<string, T>();
  for (const list of sources) {
    if (!Array.isArray(list)) continue;
    for (const item of list) {
      if (!item?.id) continue;
      map.set(item.id, item);
    }
  }
  return Array.from(map.values());
}

/** When app_store snapshot exists, it is the last synced client truth (respects deletes). */
export function resolveAuthoritativeEntityList<T>(
  tableRows: T[],
  storeSnapshot: unknown
): T[] {
  if (Array.isArray(storeSnapshot)) {
    return storeSnapshot as T[];
  }
  return tableRows;
}

/** Merge table rows with app_store snapshot (store is membership truth; table enriches fields). */
export function mergeEntityListForFetch<T extends { id: string; created_at?: string }>(
  tableRows: T[],
  storeSnapshot: unknown
): T[] {
  if (!Array.isArray(storeSnapshot)) return tableRows;
  const storeRows = storeSnapshot as T[];
  if (storeRows.length === 0) return tableRows;

  const storeIds = new Set(storeRows.map(r => r.id));
  const tableById = new Map(tableRows.map(r => [r.id, r]));
  const maxStoreCreated = Math.max(0, ...storeRows.map(entityCreatedAtMs));

  // app_store defines current records (respects deletes); merge document fields from both sources
  const merged = storeRows.map(row => {
    const fromTable = tableById.get(row.id);
    return fromTable
      ? mergeRecordDocuments(fromTable as Record<string, unknown>, row as Record<string, unknown>) as T
      : row;
  });

  // Include table-only rows when store likely lagged on a new insert (same-ms batch counts as new)
  for (const row of tableRows) {
    if (!storeIds.has(row.id) && entityCreatedAtMs(row) >= maxStoreCreated) {
      merged.push(row);
    }
  }

  return merged;
}

function entityCreatedAtMs(record: { created_at?: string; id?: string }): number {
  const parsed = Date.parse(record.created_at || '');
  if (Number.isFinite(parsed)) return parsed;
  const idMatch = String(record.id || '').match(/(\d{10,13})/);
  if (idMatch) {
    const n = Number(idMatch[1]);
    return idMatch[1].length === 13 ? n : n * 1000;
  }
  return 0;
}

/**
 * Prevent stale browser tabs from wiping newer records out of app_store.
 * Strict subset = client deleted rows — keep the shorter list.
 * Stale full list after deletes elsewhere — keep store membership, apply field updates.
 */
export function resolveEntityListForStoreWrite<T extends { id: string; created_at?: string }>(
  stored: unknown,
  incoming: T[]
): T[] {
  if (!Array.isArray(stored) || stored.length === 0) return incoming;
  if (!Array.isArray(incoming) || incoming.length === 0) return incoming;

  const storedArr = stored as T[];
  const storedIds = new Set(storedArr.map(row => row.id));
  const incomingIds = new Set(incoming.map(row => row.id));

  const isStrictSubset =
    incoming.length < storedArr.length &&
    incoming.every(row => storedIds.has(row.id));

  if (isStrictSubset) {
    return incoming;
  }

  // Stale tab sent an old full list after another tab/session deleted rows
  if (
    incoming.length > storedArr.length &&
    storedArr.every(row => incomingIds.has(row.id))
  ) {
    const incomingById = new Map(incoming.map(row => [row.id, row]));
    const merged = storedArr.map(row => ({
      ...row,
      ...incomingById.get(row.id)!
    }));
    for (const row of incoming) {
      if (!storedIds.has(row.id)) {
        merged.push(row);
      }
    }
    return merged;
  }

  return incoming;
}

/** Prefer newer school fee settings when stale tabs sync without a fresh updated_at. */
export function resolveSchoolFeeSettingsForStoreWrite(
  stored: unknown,
  incoming: unknown
): Record<string, unknown> | null {
  if (!incoming || typeof incoming !== 'object') {
    return stored && typeof stored === 'object' ? (stored as Record<string, unknown>) : null;
  }
  const inc = incoming as Record<string, unknown>;
  if (!stored || typeof stored !== 'object') return inc;

  const st = stored as Record<string, unknown>;
  const inAt = Date.parse(String(inc.updated_at || ''));
  const stAt = Date.parse(String(st.updated_at || ''));

  if (Number.isFinite(stAt) && (!Number.isFinite(inAt) || inAt < stAt)) {
    return st;
  }
  return { ...st, ...inc };
}

const FEE_TABLE_COLUMNS = new Set([
  'id', 'student_id', 'month', 'year', 'tuition_fee', 'lab_charges', 'custom_charges',
  'discount', 'discount_scholarship', 'net_fee', 'paid_amount', 'status', 'due_date',
  'payment_date', 'installments', 'scheduled_installments', 'payment_plan', 'fee_category',
  'remarks', 'voucher_sent_at', 'custom_fields', 'created_at'
]);

export function normalizeFeeForDb(fee: Record<string, unknown>): Record<string, unknown> {
  const row: Record<string, unknown> = {};
  for (const key of FEE_TABLE_COLUMNS) {
    if (fee[key] !== undefined) row[key] = fee[key];
  }
  if (row.installments === undefined) row.installments = [];
  if (row.scheduled_installments === undefined && fee.scheduled_installments !== undefined) {
    row.scheduled_installments = fee.scheduled_installments;
  }
  if (row.custom_fields === undefined) row.custom_fields = fee.custom_fields ?? {};
  if (row.due_date !== undefined) row.due_date = normalizeOptionalDateForDb(row.due_date);
  if (row.payment_date !== undefined) row.payment_date = normalizeOptionalDateForDb(row.payment_date);
  return row;
}

export function normalizeFeesForDb(fees: unknown[]): Record<string, unknown>[] {
  if (!Array.isArray(fees)) return [];
  return fees
    .filter((f): f is Record<string, unknown> => Boolean(f && typeof f === 'object' && (f as { id?: string }).id))
    .map(normalizeFeeForDb);
}

const EXAM_RESULTS_TABLE_COLUMNS = new Set([
  'id', 'student_id', 'created_at', 'student_roll', 'student_name', 'session_name',
  'exam_category', 'exam_name', 'evaluation_type', 'year', 'month', 'month_name',
  'week_number', 'term_name', 'subject', 'subject_name', 'marks', 'obtained_marks',
  'marks_obtained', 'total_marks', 'percentage', 'grade', 'status', 'remarks',
  'teacher_comments', 'file_name', 'file_url', 'storage_path', 'uploaded_at'
]);

export function normalizeExamResultForDb(result: Record<string, unknown>): Record<string, unknown> {
  const src = stripOversizedFields({ ...result });

  // Map legacy / alias field names to schema columns
  if (!src.exam_category && src.exam_type) src.exam_category = src.exam_type;
  if (!src.session_name && src.session) src.session_name = src.session;
  if (src.obtained_marks === undefined && src.marks_obtained !== undefined) {
    src.obtained_marks = src.marks_obtained;
  }
  if (src.marks_obtained === undefined && src.obtained_marks !== undefined) {
    src.marks_obtained = src.obtained_marks;
  }

  const row: Record<string, unknown> = {};
  for (const key of EXAM_RESULTS_TABLE_COLUMNS) {
    if (src[key] !== undefined) row[key] = src[key];
  }
  if (!row.created_at) row.created_at = new Date().toISOString();
  return row;
}

export function normalizeExamResultsForDb(results: unknown[]): Record<string, unknown>[] {
  if (!Array.isArray(results)) return [];
  return results
    .filter((r): r is Record<string, unknown> => Boolean(r && typeof r === 'object' && (r as { id?: string }).id))
    .map(normalizeExamResultForDb);
}

/** Link exam results to real student IDs for table upsert; skip unmatched (still kept in app_store). */
export function resolveExamResultsForDbSync(
  examResults: unknown[],
  students: unknown[]
): Record<string, unknown>[] {
  const studentList = Array.isArray(students) ? students : [];
  const byId = new Set<string>();
  const byRoll = new Map<string, string>();

  for (const s of studentList) {
    if (!s || typeof s !== 'object') continue;
    const row = s as Record<string, unknown>;
    if (row.id) byId.add(String(row.id));
    const roll = String(row.roll_no || '').trim().toLowerCase();
    if (roll) byRoll.set(roll, String(row.id));
  }

  const normalized = normalizeExamResultsForDb(examResults);
  const forTable: Record<string, unknown>[] = [];

  for (const row of normalized) {
    let studentId = String(row.student_id || '').trim();
    if (!studentId || studentId === 'unmatched' || !byId.has(studentId)) {
      const roll = String(row.student_roll || '').trim().toLowerCase();
      const resolved = roll ? byRoll.get(roll) : undefined;
      if (resolved) {
        row.student_id = resolved;
        studentId = resolved;
      }
    }
    if (studentId && byId.has(studentId)) {
      forTable.push(row);
    }
  }

  return forTable;
}

const EXPENSES_TABLE_COLUMNS = new Set([
  'id', 'date', 'category', 'amount', 'description', 'payment_mode', 'logged_by',
  'receipt_url', 'created_at', 'custom_fields'
]);

export function normalizeExpenseForDb(expense: Record<string, unknown>): Record<string, unknown> {
  const src = stripOversizedFields({ ...expense });

  // Map legacy / alias field names to schema columns
  if (!src.date && src.expense_date) src.date = src.expense_date;
  if (!src.description && src.title) src.description = src.title;

  const row: Record<string, unknown> = {};
  for (const key of EXPENSES_TABLE_COLUMNS) {
    if (src[key] !== undefined) row[key] = src[key];
  }

  row.date = normalizeDateForDb(row.date);
  row.category = withDefaultString(row.category, 'General');
  row.amount = typeof row.amount === 'number' ? row.amount : Number(row.amount) || 0;
  row.description = withDefaultString(row.description, 'Expense');
  row.payment_mode = withDefaultString(row.payment_mode, 'Cash');
  row.logged_by = withDefaultString(row.logged_by, 'System');
  row.custom_fields = row.custom_fields ?? {};
  if (!row.created_at) row.created_at = new Date().toISOString();

  return row;
}

export function normalizeExpensesForDb(expenses: unknown[]): Record<string, unknown>[] {
  if (!Array.isArray(expenses)) return [];
  return expenses
    .filter((e): e is Record<string, unknown> => Boolean(e && typeof e === 'object' && (e as { id?: string }).id))
    .map(normalizeExpenseForDb);
}

export function collectIds(items: unknown[]): string[] {
  if (!Array.isArray(items)) return [];
  return items
    .map(item => (item && typeof item === 'object' ? (item as { id?: string }).id : undefined))
    .filter((id): id is string => Boolean(id));
}

const NA = 'N/A';
const MAX_SYNC_FIELD_CHARS = 4000;

const STUDENTS_TABLE_COLUMNS = new Set([
  'id', 'roll_no', 'full_name', 'dob', 'b_form_no', 'gender', 'blood_group', 'father_name',
  'father_cnic', 'mother_name', 'parent_phone', 'emergency_phone', 'mailing_address',
  'enrollment_date', 'class_name', 'guardian_name', 'guardian_relation', 'guardian_cnic',
  'guardian_phone', 'guardian_email', 'guardian_profession', 'guardian_income_source',
  'is_orphan', 'donor_id', 'donor_name', 'donor_number', 'donor_email',
  'father_profession_before_death', 'cause_of_death',
  'standard_tuition_fee', 'discount_amount', 'discount_reason', 'payment_plan',
  'profile_image_url', 'b_form_doc', 'father_cnic_doc', 'death_certificate_doc', 'leaving_cert_doc',
  'noc_status', 'document_gallery', 'custom_fields', 'created_at', 'updated_at'
]);

const TEACHERS_TABLE_COLUMNS = new Set([
  'id', 'teacher_id', 'full_name', 'cnic', 'phone', 'alt_phone', 'email', 'address',
  'qualification', 'specialization', 'joining_date', 'dob', 'base_salary', 'designation',
  'classes_assigned', 'subjects_assigned',
  'profile_image_url', 'cnic_doc', 'degree_doc', 'work_exp_doc',
  'document_gallery', 'custom_fields', 'created_at', 'updated_at'
]);

function pickTableColumns(row: Record<string, unknown>, columns: Set<string>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const key of columns) {
    if (row[key] !== undefined) out[key] = row[key];
  }
  return out;
}

import {
  normalizeGalleryDocForStore,
  type GalleryDocRecord
} from './entityDocumentStorage';
import { mergeRecordDocuments } from './entityDocumentMerge';

/** Remove embedded base64 blobs from rows synced to Supabase tables (prevents fetch timeout). */
export function stripOversizedFields(row: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = { ...row };

  for (const [key, value] of Object.entries(out)) {
    if (typeof value === 'string' && value.length > MAX_SYNC_FIELD_CHARS) {
      if (value.startsWith('/api/supabase/file')) continue;
      if (value.startsWith('data:') || key.endsWith('_doc') || key.endsWith('_url')) {
        out[key] = value.startsWith('http') ? value.slice(0, MAX_SYNC_FIELD_CHARS) : null;
      }
    }
  }

  if (out.custom_fields && typeof out.custom_fields === 'object' && !Array.isArray(out.custom_fields)) {
    const cf = { ...(out.custom_fields as Record<string, unknown>) };
    for (const [cfKey, cfVal] of Object.entries(cf)) {
      if (typeof cfVal === 'string' && cfVal.length > MAX_SYNC_FIELD_CHARS) {
        if (cfVal.startsWith('/api/supabase/file')) continue;
        if (cfVal.startsWith('data:')) cf[cfKey] = null;
      }
    }
    out.custom_fields = cf;
  }

  if (Array.isArray(out.document_gallery)) {
    out.document_gallery = (out.document_gallery as GalleryDocRecord[])
      .map(doc => normalizeGalleryDocForStore(doc))
      .filter(doc => doc.url || doc.storage_path);
  }

  return out;
}

function withDefaultString(value: unknown, fallback = NA): string {
  if (value === null || value === undefined) return fallback;
  const s = String(value).trim();
  return s || fallback;
}

function isInvalidDateToken(value: string): boolean {
  const s = value.trim().toLowerCase();
  return !s || s === 'n/a' || s === 'na' || s === 'null' || s === 'undefined' || s === '-';
}

function todayIsoDate(): string {
  return new Date().toISOString().slice(0, 10);
}

/** Coerce UI placeholders to valid Postgres DATE (YYYY-MM-DD). */
export function normalizeDateForDb(value: unknown, fallback?: string): string {
  const fb =
    fallback !== undefined && !isInvalidDateToken(String(fallback))
      ? normalizeDateForDb(fallback)
      : todayIsoDate();

  if (value === null || value === undefined) return fb;
  const s = String(value).trim();
  if (isInvalidDateToken(s)) return fb;

  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;

  const isoPrefix = s.match(/^(\d{4}-\d{2}-\d{2})/);
  if (isoPrefix) return isoPrefix[1];

  const parsed = Date.parse(s);
  if (Number.isFinite(parsed)) return new Date(parsed).toISOString().slice(0, 10);

  return fb;
}

/** Nullable date columns — invalid tokens become null. */
export function normalizeOptionalDateForDb(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  const s = String(value).trim();
  if (isInvalidDateToken(s)) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const parsed = Date.parse(s);
  if (Number.isFinite(parsed)) return new Date(parsed).toISOString().slice(0, 10);
  return null;
}

/** Missing CNIC → unique placeholder per teacher (NOT NULL + UNIQUE safe). */
function normalizeTeacherCnic(value: unknown, teacherId: string): string {
  if (value === null || value === undefined) {
    return `PENDING-${teacherId}`;
  }
  const s = String(value).trim();
  if (!s || s === NA || s.toUpperCase() === 'N/A') {
    return `PENDING-${teacherId}`;
  }
  return s;
}

export function normalizeStudentForDb(student: Record<string, unknown>): Record<string, unknown> {
  const row = stripOversizedFields({ ...student });

  row.full_name = withDefaultString(row.full_name, 'Unnamed Student');
  row.roll_no = withDefaultString(row.roll_no, `STU-${String(row.id || Date.now())}`);
  row.father_name = withDefaultString(row.father_name, withDefaultString(row.guardian_name));
  row.father_cnic = withDefaultString(row.father_cnic, withDefaultString(row.guardian_cnic));
  row.mother_name = withDefaultString(row.mother_name);
  row.b_form_no = withDefaultString(row.b_form_no);
  row.gender = withDefaultString(row.gender, 'Other');
  row.blood_group = withDefaultString(row.blood_group);
  row.parent_phone = withDefaultString(row.parent_phone, withDefaultString(row.guardian_phone));
  row.emergency_phone = withDefaultString(row.emergency_phone, withDefaultString(row.parent_phone));
  row.mailing_address = withDefaultString(row.mailing_address);
  row.enrollment_date = normalizeDateForDb(row.enrollment_date);
  row.class_name = withDefaultString(row.class_name, 'Unassigned');
  row.guardian_name = withDefaultString(row.guardian_name, withDefaultString(row.father_name));
  row.guardian_relation = withDefaultString(row.guardian_relation, 'Guardian');
  row.guardian_cnic = withDefaultString(row.guardian_cnic, withDefaultString(row.father_cnic));
  row.guardian_phone = withDefaultString(row.guardian_phone, withDefaultString(row.parent_phone));
  row.guardian_email = withDefaultString(row.guardian_email);
  row.dob = normalizeDateForDb(row.dob, String(row.enrollment_date));
  row.is_orphan = row.is_orphan ?? false;
  row.custom_fields = row.custom_fields ?? {};
  row.document_gallery = row.document_gallery ?? [];
  row.noc_status = withDefaultString(row.noc_status, 'Pending');
  row.guardian_profession = withDefaultString(row.guardian_profession);
  row.guardian_income_source = withDefaultString(row.guardian_income_source);
  row.discount_reason = withDefaultString(row.discount_reason, 'Standard');
  row.payment_plan = withDefaultString(row.payment_plan, 'Full');
  row.updated_at = new Date().toISOString();
  row.created_at = withDefaultString(row.created_at, new Date().toISOString());

  return pickTableColumns(row, STUDENTS_TABLE_COLUMNS);
}

export function normalizeStudentsForDb(students: unknown[]): Record<string, unknown>[] {
  if (!Array.isArray(students)) return [];
  return students
    .filter((s): s is Record<string, unknown> => Boolean(s && typeof s === 'object' && (s as { id?: string }).id))
    .map(normalizeStudentForDb);
}

export function normalizeTeacherForDb(teacher: Record<string, unknown>): Record<string, unknown> {
  const row = stripOversizedFields({ ...teacher });

  row.full_name = withDefaultString(row.full_name, 'Unnamed Teacher');
  row.teacher_id = withDefaultString(row.teacher_id, `T-${String(row.id || Date.now())}`);
  row.cnic = normalizeTeacherCnic(row.cnic, String(row.id || row.teacher_id || Date.now()));
  row.phone = withDefaultString(row.phone);
  row.alt_phone = withDefaultString(row.alt_phone, withDefaultString(row.phone));
  row.email = withDefaultString(row.email);
  row.address = withDefaultString(row.address);
  row.qualification = withDefaultString(row.qualification);
  row.specialization = withDefaultString(row.specialization);
  row.joining_date = normalizeDateForDb(row.joining_date);
  row.base_salary = typeof row.base_salary === 'number' ? row.base_salary : Number(row.base_salary) || 0;
  row.designation = withDefaultString(row.designation, 'Teacher');
  row.classes_assigned = withDefaultString(row.classes_assigned);
  row.subjects_assigned = withDefaultString(row.subjects_assigned);
  row.dob = normalizeDateForDb(row.dob, String(row.joining_date));
  row.custom_fields = row.custom_fields ?? {};
  row.document_gallery = row.document_gallery ?? [];
  row.updated_at = new Date().toISOString();
  row.created_at = withDefaultString(row.created_at, new Date().toISOString());

  return pickTableColumns(row, TEACHERS_TABLE_COLUMNS);
}

export function normalizeTeachersForDb(teachers: unknown[]): Record<string, unknown>[] {
  if (!Array.isArray(teachers)) return [];
  const normalized = teachers
    .filter((t): t is Record<string, unknown> => Boolean(t && typeof t === 'object' && (t as { id?: string }).id))
    .map(normalizeTeacherForDb);

  // One CNIC per teacher in Supabase — duplicates within batch get unique placeholders
  return resolveTeachersCnicInList(normalized as { id: string; cnic?: string }[]) as Record<string, unknown>[];
}

/** Ensure unique CNIC values within a teacher list (required by teachers_cnic_key). */
export function resolveTeachersCnicInList<T extends { id: string; cnic?: string; created_at?: string }>(
  teachers: T[]
): T[] {
  const cnicToId = new Map<string, string>();
  const sorted = [...teachers].sort((a, b) => entityCreatedAtMs(a) - entityCreatedAtMs(b));
  const resolvedById = new Map<string, T>();

  for (const teacher of sorted) {
    const id = String(teacher.id || '');
    let cnic = typeof teacher.cnic === 'string' ? teacher.cnic.trim() : '';
    if (!cnic || cnic.startsWith('PENDING-')) {
      resolvedById.set(id, teacher);
      continue;
    }

    const ownerId = cnicToId.get(cnic);
    if (ownerId && ownerId !== id) {
      resolvedById.set(id, { ...teacher, cnic: `PENDING-${id}` });
    } else {
      cnicToId.set(cnic, id);
      resolvedById.set(id, teacher);
    }
  }

  return teachers.map(teacher => resolvedById.get(String(teacher.id)) ?? teacher);
}

/** Resolve CNIC conflicts against existing DB rows and within the incoming batch. */
export function resolveTeachersCnicForUpsert(
  rows: Record<string, unknown>[],
  existingRows: { id: string; cnic?: string }[] = []
): Record<string, unknown>[] {
  const cnicToId = new Map<string, string>();
  for (const teacher of existingRows) {
    const id = String(teacher.id || '');
    const cnic = typeof teacher.cnic === 'string' ? teacher.cnic.trim() : '';
    if (cnic && id && !cnic.startsWith('PENDING-')) {
      cnicToId.set(cnic, id);
    }
  }

  return rows.map(row => {
    const id = String(row.id || '');
    let cnic = typeof row.cnic === 'string' ? row.cnic.trim() : '';
    if (!cnic || cnic.startsWith('PENDING-')) return row;

    const dbOwnerId = cnicToId.get(cnic);
    if (dbOwnerId && dbOwnerId === id) return row;

    if (dbOwnerId && dbOwnerId !== id) {
      return { ...row, cnic: `PENDING-${id}` };
    }

    const batchOwnerId = cnicToId.get(cnic);
    if (batchOwnerId && batchOwnerId !== id) {
      return { ...row, cnic: `PENDING-${id}` };
    }

    cnicToId.set(cnic, id);
    return row;
  });
}

export function isDuplicateCnicError(error: unknown): boolean {
  const msg = String((error as { message?: string })?.message || error).toLowerCase();
  const code = String((error as { code?: string })?.code || '');
  return msg.includes('teachers_cnic') && (code === '23505' || msg.includes('duplicate key'));
}

const EMAIL_TEMPLATES_TABLE_COLUMNS = new Set([
  'id', 'type', 'name', 'subject', 'header_title', 'body', 'footer', 'accent_color', 'is_active', 'updated_at'
]);

const EMAIL_TEMPLATE_TYPES = new Set([
  'fee_reminder', 'salary_slip', 'teacher_profile', 'report_card', 'sponsor_update', 'custom'
]);

export function normalizeEmailTemplateForDb(template: Record<string, unknown>): Record<string, unknown> {
  const src = { ...template };
  if (!src.updated_at && src.created_at) src.updated_at = src.created_at;
  const row: Record<string, unknown> = {};
  for (const key of EMAIL_TEMPLATES_TABLE_COLUMNS) {
    if (src[key] !== undefined) row[key] = src[key];
  }
  const rawType = withDefaultString(row.type, 'custom');
  row.type = EMAIL_TEMPLATE_TYPES.has(rawType) ? rawType : 'custom';
  row.name = withDefaultString(row.name, 'Template');
  row.subject = withDefaultString(row.subject, 'Notification');
  row.body = withDefaultString(row.body, '');
  row.header_title = withDefaultString(row.header_title, row.name as string);
  row.footer = withDefaultString(row.footer, '');
  row.accent_color = withDefaultString(row.accent_color, '#1e3a8a');
  row.updated_at = withDefaultString(row.updated_at, new Date().toISOString());
  if (row.is_active === undefined) row.is_active = true;
  return row;
}

export function normalizeEmailTemplatesForDb(templates: unknown[]): Record<string, unknown>[] {
  if (!Array.isArray(templates)) return [];
  return templates
    .filter((t): t is Record<string, unknown> => Boolean(t && typeof t === 'object' && (t as { id?: string }).id))
    .map(normalizeEmailTemplateForDb);
}

const STUDENT_ATTENDANCE_TABLE_COLUMNS = new Set([
  'id', 'date', 'class_name', 'student_id', 'status', 'hl_reason', 'created_at'
]);

export function normalizeStudentAttendanceForDb(record: Record<string, unknown>): Record<string, unknown> {
  const row: Record<string, unknown> = {};
  for (const key of STUDENT_ATTENDANCE_TABLE_COLUMNS) {
    if (record[key] !== undefined) row[key] = record[key];
  }
  row.date = normalizeDateForDb(row.date);
  row.class_name = withDefaultString(row.class_name, 'Unassigned');
  row.student_id = String(row.student_id || '').trim();
  row.status = withDefaultString(row.status, 'P');
  if (!row.created_at) row.created_at = new Date().toISOString();
  return row;
}

/** Only upsert attendance rows linked to real students (full list still kept in app_store). */
export function resolveStudentAttendanceForDbSync(
  records: unknown[],
  students: unknown[],
  dbStudentIds?: Set<string>
): Record<string, unknown>[] {
  const byId = new Set<string>();
  for (const s of Array.isArray(students) ? students : []) {
    if (!s || typeof s !== 'object') continue;
    const id = (s as { id?: string }).id;
    if (id) byId.add(String(id));
  }

  const normalized = normalizeStudentAttendanceListForDb(records);
  return normalized.filter(row => {
    const studentId = String(row.student_id || '').trim();
    if (!studentId || studentId === 'unknown' || !byId.has(studentId)) return false;
    if (dbStudentIds && dbStudentIds.size > 0 && !dbStudentIds.has(studentId)) return false;
    return true;
  });
}

export function normalizeStudentAttendanceListForDb(records: unknown[]): Record<string, unknown>[] {
  if (!Array.isArray(records)) return [];
  const normalized = records
    .filter((r): r is Record<string, unknown> => Boolean(r && typeof r === 'object' && (r as { id?: string }).id))
    .map(normalizeStudentAttendanceForDb);
  const byKey = new Map<string, Record<string, unknown>>();
  for (const row of normalized) {
    byKey.set(`${row.date}|${row.student_id}|${row.class_name}`, row);
  }
  return Array.from(byKey.values());
}

const TEACHER_ATTENDANCE_TABLE_COLUMNS = new Set([
  'id', 'date', 'teacher_id', 'status', 'hl_reason', 'created_at'
]);

export function normalizeTeacherAttendanceForDb(record: Record<string, unknown>): Record<string, unknown> {
  const row: Record<string, unknown> = {};
  for (const key of TEACHER_ATTENDANCE_TABLE_COLUMNS) {
    if (record[key] !== undefined) row[key] = record[key];
  }
  row.date = normalizeDateForDb(row.date);
  row.teacher_id = String(row.teacher_id || '').trim();
  row.status = withDefaultString(row.status, 'P');
  if (!row.created_at) row.created_at = new Date().toISOString();
  return row;
}

/** Only upsert attendance rows linked to real teachers (full list still kept in app_store). */
export function resolveTeacherAttendanceForDbSync(
  records: unknown[],
  teachers: unknown[],
  dbTeacherIds?: Set<string>
): Record<string, unknown>[] {
  const byId = new Set<string>();
  for (const t of Array.isArray(teachers) ? teachers : []) {
    if (!t || typeof t !== 'object') continue;
    const id = (t as { id?: string }).id;
    if (id) byId.add(String(id));
  }

  const normalized = normalizeTeacherAttendanceListForDb(records);
  return normalized.filter(row => {
    const teacherId = String(row.teacher_id || '').trim();
    if (!teacherId || teacherId === 'unknown' || !byId.has(teacherId)) return false;
    if (dbTeacherIds && dbTeacherIds.size > 0 && !dbTeacherIds.has(teacherId)) return false;
    return true;
  });
}

export function normalizeTeacherAttendanceListForDb(records: unknown[]): Record<string, unknown>[] {
  if (!Array.isArray(records)) return [];
  const normalized = records
    .filter((r): r is Record<string, unknown> => Boolean(r && typeof r === 'object' && (r as { id?: string }).id))
    .map(normalizeTeacherAttendanceForDb);
  const byKey = new Map<string, Record<string, unknown>>();
  for (const row of normalized) {
    byKey.set(`${row.date}|${row.teacher_id}`, row);
  }
  return Array.from(byKey.values());
}

const PAYROLL_TABLE_COLUMNS = new Set([
  'id', 'teacher_id', 'month', 'year', 'total_working_days', 'base_salary', 'present_count',
  'absent_count', 'half_leave_count', 'hl_count', 'leave_count', 'absent_deduction', 'hl_deduction',
  'deductions', 'bonus', 'bonus_reason', 'net_salary', 'status', 'disbursed_date', 'payment_mode',
  'remarks', 'created_at'
]);

export function normalizePayrollForDb(payroll: Record<string, unknown>): Record<string, unknown> {
  const row: Record<string, unknown> = {};
  for (const key of PAYROLL_TABLE_COLUMNS) {
    if (payroll[key] !== undefined) row[key] = payroll[key];
  }
  row.teacher_id = withDefaultString(row.teacher_id, 'unknown');
  row.month = withDefaultString(row.month, 'January');
  row.year = typeof row.year === 'number' ? row.year : Number(row.year) || new Date().getFullYear();
  row.base_salary = typeof row.base_salary === 'number' ? row.base_salary : Number(row.base_salary) || 0;
  row.net_salary = typeof row.net_salary === 'number' ? row.net_salary : Number(row.net_salary) || Number(row.base_salary) || 0;
  row.deductions = typeof row.deductions === 'number' ? row.deductions : Number(row.deductions) || 0;
  row.bonus = typeof row.bonus === 'number' ? row.bonus : Number(row.bonus) || 0;
  row.status = withDefaultString(row.status, 'Pending');
  if (row.disbursed_date !== undefined) {
    row.disbursed_date = normalizeOptionalDateForDb(row.disbursed_date);
  }
  if (!row.created_at) row.created_at = new Date().toISOString();
  return row;
}

export function normalizePayrollsForDb(payrolls: unknown[]): Record<string, unknown>[] {
  if (!Array.isArray(payrolls)) return [];
  return payrolls
    .filter((p): p is Record<string, unknown> => Boolean(p && typeof p === 'object' && (p as { id?: string }).id))
    .map(normalizePayrollForDb);
}

/** Strip oversized payloads from app_store entity snapshots before Supabase write. */
export function stripEntityListForStore(items: unknown[] | undefined): unknown[] {
  if (!Array.isArray(items)) return [];
  return items.map(item => {
    if (!item || typeof item !== 'object') return item;
    return normalizeStoreDateFields(stripOversizedFields(item as Record<string, unknown>));
  });
}

function normalizeStoreDateFields(row: Record<string, unknown>): Record<string, unknown> {
  const out = { ...row };

  if ('roll_no' in out || 'class_name' in out) {
    if ('enrollment_date' in out) out.enrollment_date = normalizeDateForDb(out.enrollment_date);
    if ('dob' in out) out.dob = normalizeDateForDb(out.dob, String(out.enrollment_date || ''));
  } else if ('teacher_id' in out || 'designation' in out) {
    if ('joining_date' in out) out.joining_date = normalizeDateForDb(out.joining_date);
    if ('dob' in out) out.dob = normalizeDateForDb(out.dob, String(out.joining_date || ''));
  } else if ('date' in out) {
    out.date = normalizeDateForDb(out.date);
  }

  return out;
}

export interface AdminSessionPayload {
  isAuthenticated: boolean;
  activeTab?: string;
  updated_at: string;
}
