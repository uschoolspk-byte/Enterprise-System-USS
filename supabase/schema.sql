-- Unique School System (USS) — Supabase schema (canonical)
-- Run in Supabase Dashboard → SQL Editor → New query → Run
-- Or: DATABASE_URL="postgresql://..." npm run db:setup
--
-- Table names used by server.ts / dbSyncHelpers.ts:
--   students, teachers, fees, payrolls, exam_results, expenses, email_templates,
--   custom_fields, email_logs, student_attendance, teacher_attendance, app_store
--
-- Extended fields (documents, donor info, gallery, etc.) are kept in app_store JSON
-- snapshots; table columns below match normalize*ForDb() in dbSyncHelpers.ts.

-- =============================================================================
-- STUDENTS
-- =============================================================================
CREATE TABLE IF NOT EXISTS public.students (
  id text PRIMARY KEY,
  roll_no text NOT NULL DEFAULT '',
  full_name text NOT NULL DEFAULT 'Unnamed Student',
  dob text DEFAULT '',
  b_form_no text DEFAULT '',
  gender text DEFAULT 'Other',
  blood_group text DEFAULT '',
  father_name text NOT NULL DEFAULT 'N/A',
  father_cnic text DEFAULT '',
  mother_name text DEFAULT '',
  parent_phone text DEFAULT '',
  emergency_phone text DEFAULT '',
  mailing_address text DEFAULT '',
  enrollment_date text DEFAULT '',
  class_name text DEFAULT 'Unassigned',
  guardian_name text DEFAULT '',
  guardian_relation text DEFAULT '',
  guardian_cnic text DEFAULT '',
  guardian_phone text DEFAULT '',
  guardian_email text DEFAULT '',
  is_orphan boolean DEFAULT false,
  custom_fields jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE public.students ALTER COLUMN father_name SET DEFAULT 'N/A';
ALTER TABLE public.students ALTER COLUMN full_name SET DEFAULT 'Unnamed Student';

-- =============================================================================
-- TEACHERS
-- =============================================================================
CREATE TABLE IF NOT EXISTS public.teachers (
  id text PRIMARY KEY,
  teacher_id text NOT NULL DEFAULT '',
  full_name text NOT NULL DEFAULT 'Unnamed Teacher',
  cnic text DEFAULT '',
  phone text DEFAULT '',
  alt_phone text DEFAULT '',
  email text DEFAULT '',
  address text DEFAULT '',
  qualification text DEFAULT '',
  specialization text DEFAULT '',
  joining_date text DEFAULT '',
  dob text DEFAULT '',
  base_salary numeric DEFAULT 0,
  designation text DEFAULT 'Teacher',
  classes_assigned text DEFAULT '',
  subjects_assigned text DEFAULT '',
  custom_fields jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE public.teachers ADD COLUMN IF NOT EXISTS dob text DEFAULT '';
ALTER TABLE public.teachers ADD COLUMN IF NOT EXISTS subjects_assigned text DEFAULT '';
ALTER TABLE public.teachers ADD COLUMN IF NOT EXISTS profile_image_url text DEFAULT '';
ALTER TABLE public.teachers ADD COLUMN IF NOT EXISTS cnic_doc text DEFAULT '';
ALTER TABLE public.teachers ADD COLUMN IF NOT EXISTS degree_doc text DEFAULT '';
ALTER TABLE public.teachers ADD COLUMN IF NOT EXISTS work_exp_doc text DEFAULT '';
ALTER TABLE public.teachers ADD COLUMN IF NOT EXISTS document_gallery jsonb DEFAULT '[]'::jsonb;
ALTER TABLE public.teachers ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();

ALTER TABLE public.students ADD COLUMN IF NOT EXISTS guardian_profession text DEFAULT 'N/A';
ALTER TABLE public.students ADD COLUMN IF NOT EXISTS guardian_income_source text DEFAULT 'N/A';
ALTER TABLE public.students ADD COLUMN IF NOT EXISTS donor_id text;
ALTER TABLE public.students ADD COLUMN IF NOT EXISTS donor_name text;
ALTER TABLE public.students ADD COLUMN IF NOT EXISTS donor_number text;
ALTER TABLE public.students ADD COLUMN IF NOT EXISTS donor_email text;
ALTER TABLE public.students ADD COLUMN IF NOT EXISTS father_profession_before_death text;
ALTER TABLE public.students ADD COLUMN IF NOT EXISTS cause_of_death text;
ALTER TABLE public.students ADD COLUMN IF NOT EXISTS standard_tuition_fee numeric DEFAULT 3000;
ALTER TABLE public.students ADD COLUMN IF NOT EXISTS discount_amount numeric DEFAULT 0;
ALTER TABLE public.students ADD COLUMN IF NOT EXISTS discount_reason text DEFAULT 'Standard';
ALTER TABLE public.students ADD COLUMN IF NOT EXISTS payment_plan text DEFAULT 'Full';
ALTER TABLE public.students ADD COLUMN IF NOT EXISTS profile_image_url text;
ALTER TABLE public.students ADD COLUMN IF NOT EXISTS b_form_doc text;
ALTER TABLE public.students ADD COLUMN IF NOT EXISTS father_cnic_doc text;
ALTER TABLE public.students ADD COLUMN IF NOT EXISTS death_certificate_doc text;
ALTER TABLE public.students ADD COLUMN IF NOT EXISTS leaving_cert_doc text;
ALTER TABLE public.students ADD COLUMN IF NOT EXISTS noc_status text DEFAULT 'Pending';
ALTER TABLE public.students ADD COLUMN IF NOT EXISTS document_gallery jsonb DEFAULT '[]'::jsonb;
ALTER TABLE public.students ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();

-- App resolves missing CNIC to PENDING-{id} before upsert; unique index prevents duplicates.
CREATE UNIQUE INDEX IF NOT EXISTS teachers_cnic_key ON public.teachers (cnic);
CREATE UNIQUE INDEX IF NOT EXISTS teachers_teacher_id_key ON public.teachers (teacher_id)
  WHERE teacher_id IS NOT NULL AND teacher_id <> '';

-- =============================================================================
-- FEES
-- =============================================================================
CREATE TABLE IF NOT EXISTS public.fees (
  id text PRIMARY KEY,
  student_id text NOT NULL,
  month text NOT NULL,
  year integer NOT NULL,
  tuition_fee numeric DEFAULT 0,
  lab_charges numeric DEFAULT 0,
  custom_charges numeric DEFAULT 0,
  discount numeric DEFAULT 0,
  discount_scholarship numeric DEFAULT 0,
  net_fee numeric DEFAULT 0,
  paid_amount numeric DEFAULT 0,
  status text DEFAULT 'Unpaid',
  due_date text,
  payment_date text,
  installments jsonb DEFAULT '[]'::jsonb,
  scheduled_installments jsonb DEFAULT '[]'::jsonb,
  payment_plan text,
  fee_category text,
  remarks text,
  voucher_sent_at text,
  custom_fields jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE public.fees ADD COLUMN IF NOT EXISTS custom_fields jsonb DEFAULT '{}'::jsonb;
ALTER TABLE public.fees ADD COLUMN IF NOT EXISTS scheduled_installments jsonb DEFAULT '[]'::jsonb;
ALTER TABLE public.fees ADD COLUMN IF NOT EXISTS payment_plan text;
ALTER TABLE public.fees ADD COLUMN IF NOT EXISTS voucher_sent_at text;

-- =============================================================================
-- PAYROLLS
-- =============================================================================
CREATE TABLE IF NOT EXISTS public.payrolls (
  id text PRIMARY KEY,
  teacher_id text NOT NULL,
  month text NOT NULL,
  year integer NOT NULL,
  month_start_date text,
  total_working_days integer,
  daily_salary numeric DEFAULT 0,
  half_day_deduction numeric DEFAULT 0,
  base_salary numeric DEFAULT 0,
  present_count integer,
  absent_count integer DEFAULT 0,
  half_leave_count integer,
  hl_count integer DEFAULT 0,
  leave_count integer,
  absent_deduction numeric DEFAULT 0,
  hl_deduction numeric DEFAULT 0,
  deductions numeric DEFAULT 0,
  bonus numeric DEFAULT 0,
  bonus_reason text,
  net_salary numeric DEFAULT 0,
  status text DEFAULT 'Pending',
  disbursed_date text,
  payment_mode text,
  remarks text,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE public.payrolls ADD COLUMN IF NOT EXISTS hl_count integer DEFAULT 0;
ALTER TABLE public.payrolls ADD COLUMN IF NOT EXISTS leave_count integer;
ALTER TABLE public.payrolls ADD COLUMN IF NOT EXISTS month_start_date text;
ALTER TABLE public.payrolls ADD COLUMN IF NOT EXISTS daily_salary numeric DEFAULT 0;
ALTER TABLE public.payrolls ADD COLUMN IF NOT EXISTS half_day_deduction numeric DEFAULT 0;
ALTER TABLE public.payrolls ADD COLUMN IF NOT EXISTS present_count integer;
ALTER TABLE public.payrolls ADD COLUMN IF NOT EXISTS half_leave_count integer;

-- =============================================================================
-- EXAM RESULTS
-- =============================================================================
CREATE TABLE IF NOT EXISTS public.exam_results (
  id text PRIMARY KEY,
  student_id text NOT NULL,
  student_roll text,
  student_name text,
  session_name text,
  exam_category text,
  exam_name text,
  evaluation_type text,
  year integer,
  month text,
  month_name text,
  week_number text,
  term_name text,
  subject text,
  subject_name text,
  marks jsonb,
  obtained_marks numeric,
  marks_obtained numeric,
  total_marks numeric,
  percentage numeric,
  grade text,
  status text,
  remarks text,
  teacher_comments text,
  file_name text,
  file_url text,
  storage_path text,
  uploaded_at timestamptz,
  exam_type text,
  session text,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE public.exam_results ADD COLUMN IF NOT EXISTS student_roll text;
ALTER TABLE public.exam_results ADD COLUMN IF NOT EXISTS student_name text;
ALTER TABLE public.exam_results ADD COLUMN IF NOT EXISTS session_name text;
ALTER TABLE public.exam_results ADD COLUMN IF NOT EXISTS exam_category text;
ALTER TABLE public.exam_results ADD COLUMN IF NOT EXISTS exam_name text;
ALTER TABLE public.exam_results ADD COLUMN IF NOT EXISTS evaluation_type text;
ALTER TABLE public.exam_results ADD COLUMN IF NOT EXISTS year integer;
ALTER TABLE public.exam_results ADD COLUMN IF NOT EXISTS month text;
ALTER TABLE public.exam_results ADD COLUMN IF NOT EXISTS month_name text;
ALTER TABLE public.exam_results ADD COLUMN IF NOT EXISTS week_number text;
ALTER TABLE public.exam_results ADD COLUMN IF NOT EXISTS term_name text;
ALTER TABLE public.exam_results ADD COLUMN IF NOT EXISTS subject text;
ALTER TABLE public.exam_results ADD COLUMN IF NOT EXISTS subject_name text;
ALTER TABLE public.exam_results ADD COLUMN IF NOT EXISTS marks jsonb;
ALTER TABLE public.exam_results ADD COLUMN IF NOT EXISTS obtained_marks numeric;
ALTER TABLE public.exam_results ADD COLUMN IF NOT EXISTS marks_obtained numeric;
ALTER TABLE public.exam_results ADD COLUMN IF NOT EXISTS total_marks numeric;
ALTER TABLE public.exam_results ADD COLUMN IF NOT EXISTS percentage numeric;
ALTER TABLE public.exam_results ADD COLUMN IF NOT EXISTS grade text;
ALTER TABLE public.exam_results ADD COLUMN IF NOT EXISTS status text;
ALTER TABLE public.exam_results ADD COLUMN IF NOT EXISTS remarks text;
ALTER TABLE public.exam_results ADD COLUMN IF NOT EXISTS teacher_comments text;
ALTER TABLE public.exam_results ADD COLUMN IF NOT EXISTS file_name text;
ALTER TABLE public.exam_results ADD COLUMN IF NOT EXISTS file_url text;
ALTER TABLE public.exam_results ADD COLUMN IF NOT EXISTS storage_path text;
ALTER TABLE public.exam_results ADD COLUMN IF NOT EXISTS uploaded_at timestamptz;
ALTER TABLE public.exam_results ADD COLUMN IF NOT EXISTS exam_type text;
ALTER TABLE public.exam_results ADD COLUMN IF NOT EXISTS session text;

-- =============================================================================
-- EXPENSES
-- =============================================================================
CREATE TABLE IF NOT EXISTS public.expenses (
  id text PRIMARY KEY,
  date text NOT NULL,
  category text NOT NULL,
  amount numeric DEFAULT 0,
  description text,
  payment_mode text,
  logged_by text,
  receipt_url text,
  custom_fields jsonb DEFAULT '{}'::jsonb,
  expense_date text,
  title text,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE public.expenses ADD COLUMN IF NOT EXISTS custom_fields jsonb DEFAULT '{}'::jsonb;
ALTER TABLE public.expenses ADD COLUMN IF NOT EXISTS expense_date text;
ALTER TABLE public.expenses ADD COLUMN IF NOT EXISTS title text;

-- =============================================================================
-- EMAIL TEMPLATES
-- =============================================================================
CREATE TABLE IF NOT EXISTS public.email_templates (
  id text PRIMARY KEY,
  type text NOT NULL,
  name text NOT NULL,
  subject text NOT NULL,
  header_title text,
  body text,
  footer text,
  accent_color text,
  is_active boolean DEFAULT true,
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE public.email_templates ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();

-- =============================================================================
-- CUSTOM FORM FIELDS (camelCase columns match JS upsert payload)
-- =============================================================================
CREATE TABLE IF NOT EXISTS public.custom_fields (
  id text PRIMARY KEY,
  target text NOT NULL,
  "fieldName" text NOT NULL,
  "fieldType" text NOT NULL,
  "isRequired" boolean DEFAULT false
);

-- =============================================================================
-- EMAIL LOGS
-- =============================================================================
CREATE TABLE IF NOT EXISTS public.email_logs (
  id text PRIMARY KEY,
  timestamp timestamptz DEFAULT now(),
  recipient_email text,
  recipient_type text,
  recipient_name text,
  student_name text,
  subject text,
  term_name text,
  status text,
  attachment_name text
);

-- =============================================================================
-- STUDENT ATTENDANCE
-- =============================================================================
CREATE TABLE IF NOT EXISTS public.student_attendance (
  id text PRIMARY KEY,
  date text NOT NULL,
  class_name text NOT NULL DEFAULT 'Unassigned',
  student_id text NOT NULL,
  status text NOT NULL,
  hl_reason text,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE public.student_attendance ALTER COLUMN class_name SET DEFAULT 'Unassigned';

-- =============================================================================
-- TEACHER ATTENDANCE
-- =============================================================================
CREATE TABLE IF NOT EXISTS public.teacher_attendance (
  id text PRIMARY KEY,
  date text NOT NULL,
  teacher_id text NOT NULL,
  status text NOT NULL,
  hl_reason text,
  created_at timestamptz DEFAULT now()
);

-- =============================================================================
-- APP STORE (JSON key-value backup + settings)
-- =============================================================================
CREATE TABLE IF NOT EXISTS public.app_store (
  key text PRIMARY KEY,
  value jsonb,
  updated_at timestamptz DEFAULT now()
);

-- =============================================================================
-- ENTITY DOCUMENT BLOBS (database-backed file storage for gallery & scans)
-- =============================================================================
CREATE TABLE IF NOT EXISTS public.entity_document_blobs (
  id text PRIMARY KEY,
  bucket text NOT NULL DEFAULT 'entity-documents',
  storage_path text NOT NULL,
  content_type text NOT NULL DEFAULT 'application/octet-stream',
  content_base64 text NOT NULL,
  updated_at timestamptz DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_entity_document_blobs_path
  ON public.entity_document_blobs (bucket, storage_path);

-- app_store keys used by sync:
-- students, teachers, fees, payrolls, exam_results, expenses, email_templates,
-- custom_fields, student_attendance, teacher_attendance, school_fee_settings,
-- site_branding, email_logs, admin_session, sync_sequence

-- =============================================================================
-- ROW LEVEL SECURITY — allow app access via anon key
-- =============================================================================
DO $$
DECLARE
  tbl text;
BEGIN
  FOREACH tbl IN ARRAY ARRAY[
    'students', 'teachers', 'fees', 'payrolls', 'exam_results', 'expenses', 'email_templates',
    'custom_fields', 'email_logs', 'student_attendance', 'teacher_attendance', 'app_store',
    'entity_document_blobs'
  ]
  LOOP
    BEGIN
      EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', tbl);
      EXECUTE format('DROP POLICY IF EXISTS uss_anon_all ON public.%I', tbl);
      EXECUTE format(
        'CREATE POLICY uss_anon_all ON public.%I FOR ALL USING (true) WITH CHECK (true)',
        tbl
      );
    EXCEPTION WHEN undefined_table THEN
      RAISE NOTICE 'Table % does not exist yet, skipping RLS', tbl;
    END;
  END LOOP;
END $$;

-- =============================================================================
-- INDEXES
-- =============================================================================
CREATE INDEX IF NOT EXISTS idx_students_roll_no ON public.students (roll_no);
CREATE INDEX IF NOT EXISTS idx_students_class_name ON public.students (class_name);
CREATE INDEX IF NOT EXISTS idx_teachers_teacher_id ON public.teachers (teacher_id);
CREATE INDEX IF NOT EXISTS idx_fees_student_id ON public.fees (student_id);
CREATE INDEX IF NOT EXISTS idx_fees_month_year ON public.fees (month, year);
CREATE INDEX IF NOT EXISTS idx_payrolls_teacher_id ON public.payrolls (teacher_id);
CREATE INDEX IF NOT EXISTS idx_payrolls_month_year ON public.payrolls (month, year);
CREATE INDEX IF NOT EXISTS idx_exam_results_student_id ON public.exam_results (student_id);
CREATE INDEX IF NOT EXISTS idx_exam_results_storage_path ON public.exam_results (storage_path);
CREATE INDEX IF NOT EXISTS idx_expenses_date ON public.expenses (date);
CREATE INDEX IF NOT EXISTS idx_student_attendance_date ON public.student_attendance (date);
CREATE INDEX IF NOT EXISTS idx_student_attendance_student_id ON public.student_attendance (student_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_student_attendance_date_student ON public.student_attendance (date, student_id);
CREATE INDEX IF NOT EXISTS idx_teacher_attendance_date ON public.teacher_attendance (date);
CREATE INDEX IF NOT EXISTS idx_teacher_attendance_teacher_id ON public.teacher_attendance (teacher_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_teacher_attendance_date_teacher ON public.teacher_attendance (date, teacher_id);
CREATE INDEX IF NOT EXISTS idx_email_logs_timestamp ON public.email_logs (timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_custom_fields_target ON public.custom_fields (target);
CREATE INDEX IF NOT EXISTS idx_email_templates_type ON public.email_templates (type);

-- =============================================================================
-- STORAGE (batch result PDFs + student documents)
-- =============================================================================
INSERT INTO storage.buckets (id, name, public)
VALUES ('student-results', 'student-results', true)
ON CONFLICT (id) DO UPDATE SET public = EXCLUDED.public;

INSERT INTO storage.buckets (id, name, public)
VALUES ('student-documents', 'student-documents', true)
ON CONFLICT (id) DO UPDATE SET public = EXCLUDED.public;

DROP POLICY IF EXISTS uss_storage_select ON storage.objects;
DROP POLICY IF EXISTS uss_storage_insert ON storage.objects;
DROP POLICY IF EXISTS uss_storage_update ON storage.objects;
DROP POLICY IF EXISTS uss_storage_delete ON storage.objects;

CREATE POLICY uss_storage_select ON storage.objects
  FOR SELECT USING (bucket_id IN ('student-results', 'student-documents'));
CREATE POLICY uss_storage_insert ON storage.objects
  FOR INSERT WITH CHECK (bucket_id IN ('student-results', 'student-documents'));
CREATE POLICY uss_storage_update ON storage.objects
  FOR UPDATE USING (bucket_id IN ('student-results', 'student-documents'));
CREATE POLICY uss_storage_delete ON storage.objects
  FOR DELETE USING (bucket_id IN ('student-results', 'student-documents'));

-- =============================================================================
-- OPTIONAL FK REMOVAL (batch uploads may reference roll before student row exists)
-- =============================================================================
ALTER TABLE public.exam_results DROP CONSTRAINT IF EXISTS exam_results_student_id_fkey;
ALTER TABLE public.student_attendance DROP CONSTRAINT IF EXISTS student_attendance_student_id_fkey;
ALTER TABLE public.teacher_attendance DROP CONSTRAINT IF EXISTS teacher_attendance_teacher_id_fkey;
ALTER TABLE public.fees DROP CONSTRAINT IF EXISTS fees_student_id_fkey;
ALTER TABLE public.payrolls DROP CONSTRAINT IF EXISTS payrolls_teacher_id_fkey;
