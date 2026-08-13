-- ====================================================================
-- UNIQUE SCHOOL SYSTEM — COMPLETE SUPABASE DATABASE SCHEMA (.SQL)
-- ====================================================================
-- Copy and paste this complete SQL file into Supabase SQL Editor.
-- It will create all tables, indexes, constraints, foreign keys, RLS policies,
-- storage buckets, and initial seeds for the Unique School System.
-- ====================================================================

-- 1. Enable Required Extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 2. CREATE TABLE: STUDENTS
CREATE TABLE IF NOT EXISTS public.students (
    id TEXT PRIMARY KEY DEFAULT ('std-' || extract(epoch from now())::bigint),
    roll_no VARCHAR(50) UNIQUE NOT NULL,
    full_name VARCHAR(150) NOT NULL,
    dob DATE,
    b_form_no VARCHAR(50),
    gender VARCHAR(20) DEFAULT 'Male',
    blood_group VARCHAR(10),
    father_name VARCHAR(150) NOT NULL,
    father_cnic VARCHAR(30),
    mother_name VARCHAR(150),
    parent_phone VARCHAR(30),
    emergency_phone VARCHAR(30),
    mailing_address TEXT,
    enrollment_date DATE DEFAULT CURRENT_DATE,
    class_name VARCHAR(50) NOT NULL,

    -- Guardian Details
    guardian_name VARCHAR(150),
    guardian_relation VARCHAR(50),
    guardian_cnic VARCHAR(30),
    guardian_phone VARCHAR(30),
    guardian_email VARCHAR(100),
    guardian_profession VARCHAR(100),
    guardian_income_source VARCHAR(100),

    -- Orphan & Donor Sponsorship Tracking
    is_orphan BOOLEAN DEFAULT FALSE,
    donor_id VARCHAR(50),
    donor_name VARCHAR(150),
    donor_number VARCHAR(30),
    donor_email VARCHAR(100),
    father_profession_before_death VARCHAR(100),
    cause_of_death TEXT,

    -- Tuition Fee & Installments Plan
    standard_tuition_fee NUMERIC(10, 2) DEFAULT 8500.00,
    discount_amount NUMERIC(10, 2) DEFAULT 0.00,
    discount_reason VARCHAR(255),
    payment_plan VARCHAR(30) DEFAULT 'Full',

    -- Scanned Asset Documents
    profile_image_url TEXT,
    b_form_doc TEXT,
    father_cnic_doc TEXT,
    death_certificate_doc TEXT,
    leaving_cert_doc TEXT,

    -- Dynamic Custom Fields (JSONB)
    custom_fields JSONB DEFAULT '{}'::jsonb,

    -- NOC Clearance
    noc_status VARCHAR(20) DEFAULT 'Pending',

    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexing for fast searches
CREATE INDEX IF NOT EXISTS idx_students_roll_no ON public.students(roll_no);
CREATE INDEX IF NOT EXISTS idx_students_class ON public.students(class_name);
CREATE INDEX IF NOT EXISTS idx_students_orphan ON public.students(is_orphan);


-- 3. CREATE TABLE: TEACHERS
CREATE TABLE IF NOT EXISTS public.teachers (
    id TEXT PRIMARY KEY DEFAULT ('tch-' || extract(epoch from now())::bigint),
    teacher_id VARCHAR(50) UNIQUE NOT NULL,
    full_name VARCHAR(150) NOT NULL,
    cnic VARCHAR(30) UNIQUE NOT NULL,
    phone VARCHAR(30) NOT NULL,
    alt_phone VARCHAR(30),
    email VARCHAR(100) UNIQUE NOT NULL,
    address TEXT,
    qualification VARCHAR(150),
    specialization VARCHAR(150),
    joining_date DATE DEFAULT CURRENT_DATE,
    dob DATE,
    base_salary NUMERIC(10, 2) NOT NULL DEFAULT 45000.00,
    designation VARCHAR(50) NOT NULL DEFAULT 'Teacher',
    classes_assigned TEXT,
    subjects_assigned TEXT,

    -- Scanned Documents
    profile_image_url TEXT,
    cnic_doc TEXT,
    degree_doc TEXT,
    work_exp_doc TEXT,

    -- Custom Fields (JSONB)
    custom_fields JSONB DEFAULT '{}'::jsonb,

    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_teachers_teacher_id ON public.teachers(teacher_id);
CREATE INDEX IF NOT EXISTS idx_teachers_designation ON public.teachers(designation);


-- 4. CREATE TABLE: STUDENT_ATTENDANCE
CREATE TABLE IF NOT EXISTS public.student_attendance (
    id TEXT PRIMARY KEY DEFAULT ('att-s-' || extract(epoch from now())::bigint || '-' || floor(random()*1000)::text),
    date DATE NOT NULL,
    class_name VARCHAR(50) NOT NULL,
    student_id TEXT REFERENCES public.students(id) ON DELETE CASCADE,
    status VARCHAR(5) NOT NULL CHECK (status IN ('P', 'A', 'L', 'HL')),
    hl_reason TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(date, student_id)
);

CREATE INDEX IF NOT EXISTS idx_student_att_date_class ON public.student_attendance(date, class_name);


-- 5. CREATE TABLE: TEACHER_ATTENDANCE
CREATE TABLE IF NOT EXISTS public.teacher_attendance (
    id TEXT PRIMARY KEY DEFAULT ('att-t-' || extract(epoch from now())::bigint || '-' || floor(random()*1000)::text),
    date DATE NOT NULL,
    teacher_id TEXT REFERENCES public.teachers(id) ON DELETE CASCADE,
    status VARCHAR(5) NOT NULL CHECK (status IN ('P', 'A', 'L', 'HL')),
    hl_reason TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(date, teacher_id)
);

CREATE INDEX IF NOT EXISTS idx_teacher_att_date ON public.teacher_attendance(date);


-- 6. CREATE TABLE: FEE_LEDGER
CREATE TABLE IF NOT EXISTS public.fee_ledger (
    id TEXT PRIMARY KEY DEFAULT ('fee-' || extract(epoch from now())::bigint || '-' || floor(random()*1000)::text),
    student_id TEXT REFERENCES public.students(id) ON DELETE CASCADE,
    month VARCHAR(20) NOT NULL,
    year INT NOT NULL,
    tuition_fee NUMERIC(10, 2) NOT NULL DEFAULT 8500.00,
    lab_charges NUMERIC(10, 2) DEFAULT 0.00,
    custom_charges NUMERIC(10, 2) DEFAULT 0.00,
    discount NUMERIC(10, 2) DEFAULT 0.00,
    discount_scholarship NUMERIC(10, 2) DEFAULT 0.00,
    net_fee NUMERIC(10, 2) NOT NULL,
    paid_amount NUMERIC(10, 2) DEFAULT 0.00,
    status VARCHAR(20) DEFAULT 'Unpaid' CHECK (status IN ('Paid', 'Unpaid', 'Partial', 'Overdue')),
    due_date DATE,
    payment_date DATE,
    fee_category VARCHAR(100) DEFAULT 'Monthly Tuition',
    remarks TEXT,
    installments JSONB DEFAULT '[]'::jsonb,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_fee_ledger_student ON public.fee_ledger(student_id);
CREATE INDEX IF NOT EXISTS idx_fee_ledger_month_year ON public.fee_ledger(month, year);


-- 7. CREATE TABLE: PAYROLL
CREATE TABLE IF NOT EXISTS public.payroll (
    id TEXT PRIMARY KEY DEFAULT ('pay-' || extract(epoch from now())::bigint || '-' || floor(random()*1000)::text),
    teacher_id TEXT REFERENCES public.teachers(id) ON DELETE CASCADE,
    month VARCHAR(20) NOT NULL,
    year INT NOT NULL,
    total_working_days INT DEFAULT 30,
    base_salary NUMERIC(10, 2) NOT NULL,
    present_count INT DEFAULT 0,
    absent_count INT DEFAULT 0,
    half_leave_count INT DEFAULT 0,
    absent_deduction NUMERIC(10, 2) DEFAULT 0.00,
    hl_deduction NUMERIC(10, 2) DEFAULT 0.00,
    deductions NUMERIC(10, 2) DEFAULT 0.00,
    bonus NUMERIC(10, 2) DEFAULT 0.00,
    bonus_reason VARCHAR(255),
    net_salary NUMERIC(10, 2) NOT NULL,
    status VARCHAR(20) DEFAULT 'Pending' CHECK (status IN ('Pending', 'Disbursed', 'Paid')),
    disbursed_date DATE,
    payment_mode VARCHAR(50) DEFAULT 'Bank Transfer',
    remarks TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_payroll_teacher ON public.payroll(teacher_id);
CREATE INDEX IF NOT EXISTS idx_payroll_month_year ON public.payroll(month, year);


-- 8. CREATE TABLE: EXAM_RESULTS
CREATE TABLE IF NOT EXISTS public.exam_results (
    id TEXT PRIMARY KEY DEFAULT ('res-' || extract(epoch from now())::bigint || '-' || floor(random()*1000)::text),
    student_id TEXT REFERENCES public.students(id) ON DELETE CASCADE,
    student_roll VARCHAR(50),
    student_name VARCHAR(150),
    session_name VARCHAR(50) DEFAULT 'Session 2026',
    exam_category VARCHAR(50) DEFAULT '1st Term',
    exam_name VARCHAR(100),
    
    evaluation_type VARCHAR(50),
    year INT DEFAULT 2026,
    month VARCHAR(20),
    week_number VARCHAR(20),
    term_name VARCHAR(50),

    subject VARCHAR(100),
    marks JSONB DEFAULT '{}'::jsonb,
    obtained_marks NUMERIC(6, 2) DEFAULT 0.00,
    total_marks NUMERIC(6, 2) DEFAULT 100.00,
    percentage NUMERIC(5, 2) DEFAULT 0.00,
    grade VARCHAR(10),
    status VARCHAR(20) DEFAULT 'Pass',
    teacher_comments TEXT,

    file_name VARCHAR(255),
    file_url TEXT,
    storage_path TEXT,
    uploaded_at TIMESTAMPTZ DEFAULT NOW(),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_exam_results_student ON public.exam_results(student_id);
CREATE INDEX IF NOT EXISTS idx_exam_results_storage_path ON public.exam_results(storage_path);


-- 9. CREATE TABLE: DYNAMIC_CUSTOM_FIELDS
CREATE TABLE IF NOT EXISTS public.dynamic_custom_fields (
    id TEXT PRIMARY KEY DEFAULT ('field-' || extract(epoch from now())::bigint),
    target VARCHAR(20) NOT NULL CHECK (target IN ('student', 'teacher', 'financial')),
    field_name VARCHAR(100) NOT NULL,
    field_type VARCHAR(20) NOT NULL CHECK (field_type IN ('text', 'numeric', 'file')),
    is_required BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);


-- 10. CREATE TABLE: BREVO_EMAIL_LOGS
CREATE TABLE IF NOT EXISTS public.brevo_email_logs (
    id TEXT PRIMARY KEY DEFAULT ('log-' || extract(epoch from now())::bigint || '-' || floor(random()*1000)::text),
    timestamp TIMESTAMPTZ DEFAULT NOW(),
    recipient_email VARCHAR(100) NOT NULL,
    recipient_type VARCHAR(20) CHECK (recipient_type IN ('Donor', 'Guardian')),
    recipient_name VARCHAR(150),
    student_name VARCHAR(150),
    subject VARCHAR(255),
    term_name VARCHAR(100),
    status VARCHAR(20) DEFAULT 'Success',
    attachment_name VARCHAR(255)
);

-- 11. SUPABASE STORAGE BUCKETS SETUP
INSERT INTO storage.buckets (id, name, public) 
VALUES ('student-results', 'student-results', true)
ON CONFLICT (id) DO NOTHING;

INSERT INTO storage.buckets (id, name, public) 
VALUES ('student-documents', 'student-documents', true)
ON CONFLICT (id) DO NOTHING;

-- 12. ROW LEVEL SECURITY (RLS) POLICIES — PUBLIC ACCESS ALLOWED FOR APP INTEGRATION
ALTER TABLE public.students ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.teachers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.student_attendance ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.teacher_attendance ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fee_ledger ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payroll ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.exam_results ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dynamic_custom_fields ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.brevo_email_logs ENABLE ROW LEVEL SECURITY;

-- Allow full public read/write access for application integration
CREATE POLICY "Allow public select on students" ON public.students FOR SELECT USING (true);
CREATE POLICY "Allow public insert on students" ON public.students FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow public update on students" ON public.students FOR UPDATE USING (true);
CREATE POLICY "Allow public delete on students" ON public.students FOR DELETE USING (true);

CREATE POLICY "Allow public select on teachers" ON public.teachers FOR SELECT USING (true);
CREATE POLICY "Allow public insert on teachers" ON public.teachers FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow public update on teachers" ON public.teachers FOR UPDATE USING (true);
CREATE POLICY "Allow public delete on teachers" ON public.teachers FOR DELETE USING (true);

CREATE POLICY "Allow public select on fee_ledger" ON public.fee_ledger FOR SELECT USING (true);
CREATE POLICY "Allow public insert on fee_ledger" ON public.fee_ledger FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow public update on fee_ledger" ON public.fee_ledger FOR UPDATE USING (true);
CREATE POLICY "Allow public delete on fee_ledger" ON public.fee_ledger FOR DELETE USING (true);

CREATE POLICY "Allow public select on payroll" ON public.payroll FOR SELECT USING (true);
CREATE POLICY "Allow public insert on payroll" ON public.payroll FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow public update on payroll" ON public.payroll FOR UPDATE USING (true);
CREATE POLICY "Allow public delete on payroll" ON public.payroll FOR DELETE USING (true);

CREATE POLICY "Allow public select on exam_results" ON public.exam_results FOR SELECT USING (true);
CREATE POLICY "Allow public insert on exam_results" ON public.exam_results FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow public update on exam_results" ON public.exam_results FOR UPDATE USING (true);
CREATE POLICY "Allow public delete on exam_results" ON public.exam_results FOR DELETE USING (true);

-- ====================================================================
-- END OF SUPABASE SQL SCHEMA SCRIPT
-- ====================================================================
