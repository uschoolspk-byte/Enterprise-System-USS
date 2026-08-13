-- ====================================================================
-- UNIQUE SCHOOL SYSTEM ERP - ALL-IN-ONE SUPABASE POSTGRESQL SCHEMA
-- Paste this entire SQL script directly into the Supabase SQL Editor
-- (https://supabase.com/dashboard/project/vxyjudsllimiwlqkcvrs/sql)
-- and click "Run" to initialize all database tables and indexes.
-- ====================================================================

-- 1. EXTENSIONS
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- --------------------------------------------------------------------
-- 2. DYNAMIC CUSTOM FIELDS TABLE
-- --------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS custom_fields (
    id TEXT PRIMARY KEY DEFAULT uuid_generate_v4()::text,
    target TEXT NOT NULL CHECK (target IN ('student', 'teacher', 'financial')),
    field_name TEXT NOT NULL,
    field_type TEXT NOT NULL CHECK (field_type IN ('text', 'numeric', 'file')),
    is_required BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- --------------------------------------------------------------------
-- 3. STUDENTS MASTER DIRECTORY
-- Includes:
--   - Core Student Metadata
--   - Guardian Profession & Income Source
--   - Mandatory Orphan Verification (Father CNIC, Death Cert, Cause of Death)
--   - Sponsoring Donor ID & Contact Details
--   - Admission Fee Structure, Concessions & Installment Payment Plans
-- --------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS students (
    id TEXT PRIMARY KEY DEFAULT uuid_generate_v4()::text,
    roll_no TEXT UNIQUE NOT NULL,
    full_name TEXT NOT NULL,
    dob DATE,
    b_form_no TEXT,
    gender TEXT CHECK (gender IN ('Male', 'Female', 'Other')),
    blood_group TEXT DEFAULT 'O+',
    father_name TEXT NOT NULL,
    father_cnic TEXT DEFAULT 'N/A',
    mother_name TEXT DEFAULT 'N/A',
    parent_phone TEXT NOT NULL,
    emergency_phone TEXT,
    mailing_address TEXT,
    enrollment_date DATE DEFAULT CURRENT_DATE,
    class_name TEXT NOT NULL,
    
    -- Guardian Fields
    guardian_name TEXT,
    guardian_relation TEXT,
    guardian_cnic TEXT,
    guardian_phone TEXT,
    guardian_email TEXT,
    guardian_profession TEXT DEFAULT 'N/A',
    guardian_income_source TEXT DEFAULT 'N/A',

    -- Orphan Category & Sponsoring Donor Information
    is_orphan BOOLEAN DEFAULT false,
    donor_id TEXT,
    donor_name TEXT,
    donor_number TEXT,
    donor_email TEXT,
    father_profession_before_death TEXT,
    cause_of_death TEXT,

    -- Fee Structure & Installment Concessions
    standard_tuition_fee NUMERIC(10, 2) DEFAULT 3000.00,
    discount_amount NUMERIC(10, 2) DEFAULT 0.00,
    discount_reason TEXT DEFAULT 'Standard',
    payment_plan TEXT DEFAULT 'Full' CHECK (payment_plan IN ('Full', 'Half', 'Installments_3', 'Custom')),

    -- Document Scans & Photos
    profile_image_url TEXT,
    b_form_doc TEXT,
    father_cnic_doc TEXT,
    death_certificate_doc TEXT, -- MANDATORY IF IS_ORPHAN = TRUE
    leaving_cert_doc TEXT,

    -- Dynamic Custom JSON Attributes
    custom_fields JSONB DEFAULT '{}'::jsonb,

    -- Document gallery (metadata + database proxy URLs)
    document_gallery JSONB DEFAULT '[]'::jsonb,

    -- Clearance Status
    noc_status TEXT DEFAULT 'Cleared' CHECK (noc_status IN ('Pending', 'Cleared')),

    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Student Table Indexes
CREATE INDEX IF NOT EXISTS idx_students_roll_no ON students(roll_no);
CREATE INDEX IF NOT EXISTS idx_students_class_name ON students(class_name);
CREATE INDEX IF NOT EXISTS idx_students_is_orphan ON students(is_orphan);
CREATE INDEX IF NOT EXISTS idx_students_donor_id ON students(donor_id);

-- --------------------------------------------------------------------
-- 4. TEACHERS & FACULTY DIRECTORY
-- --------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS teachers (
    id TEXT PRIMARY KEY DEFAULT uuid_generate_v4()::text,
    teacher_id TEXT UNIQUE NOT NULL,
    full_name TEXT NOT NULL,
    cnic TEXT NOT NULL,
    phone TEXT NOT NULL,
    alt_phone TEXT,
    email TEXT,
    address TEXT,
    qualification TEXT,
    specialization TEXT,
    joining_date DATE DEFAULT CURRENT_DATE,
    base_salary NUMERIC(10, 2) NOT NULL DEFAULT 35000.00,
    designation TEXT NOT NULL CHECK (designation IN ('Principal', 'Coordinator', 'Teacher')),
    classes_assigned TEXT DEFAULT '',
    
    profile_image_url TEXT,
    cnic_doc TEXT,
    degree_doc TEXT,
    work_exp_doc TEXT,

    custom_fields JSONB DEFAULT '{}'::jsonb,
    document_gallery JSONB DEFAULT '[]'::jsonb,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_teachers_teacher_id ON teachers(teacher_id);

-- --------------------------------------------------------------------
-- 5. DAILY STUDENT ATTENDANCE LOGS
-- --------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS student_attendance (
    id TEXT PRIMARY KEY DEFAULT uuid_generate_v4()::text,
    date DATE NOT NULL,
    class_name TEXT NOT NULL,
    student_id TEXT NOT NULL REFERENCES students(id) ON DELETE CASCADE,
    status TEXT NOT NULL CHECK (status IN ('P', 'A', 'L', 'HL')),
    hl_reason TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(date, student_id)
);

CREATE INDEX IF NOT EXISTS idx_student_att_date ON student_attendance(date);
CREATE INDEX IF NOT EXISTS idx_student_att_student ON student_attendance(student_id);

-- --------------------------------------------------------------------
-- 6. DAILY TEACHER ATTENDANCE LOGS
-- --------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS teacher_attendance (
    id TEXT PRIMARY KEY DEFAULT uuid_generate_v4()::text,
    date DATE NOT NULL,
    teacher_id TEXT NOT NULL REFERENCES teachers(id) ON DELETE CASCADE,
    status TEXT NOT NULL CHECK (status IN ('P', 'A', 'L', 'HL')),
    hl_reason TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(date, teacher_id)
);

CREATE INDEX IF NOT EXISTS idx_teacher_att_date ON teacher_attendance(date);

-- --------------------------------------------------------------------
-- 7. FEE LEDGER & DISBURSEMENT LOGS
-- --------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS fee_ledger (
    id TEXT PRIMARY KEY DEFAULT uuid_generate_v4()::text,
    student_id TEXT NOT NULL REFERENCES students(id) ON DELETE CASCADE,
    month TEXT NOT NULL,
    year INT NOT NULL,
    tuition_fee NUMERIC(10, 2) NOT NULL DEFAULT 3000.00,
    lab_charges NUMERIC(10, 2) DEFAULT 0.00,
    custom_charges NUMERIC(10, 2) DEFAULT 0.00,
    discount NUMERIC(10, 2) DEFAULT 0.00,
    net_fee NUMERIC(10, 2) NOT NULL,
    paid_amount NUMERIC(10, 2) DEFAULT 0.00,
    status TEXT NOT NULL CHECK (status IN ('Paid', 'Unpaid', 'Partial', 'Overdue')),
    payment_date DATE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_fee_student ON fee_ledger(student_id);
CREATE INDEX IF NOT EXISTS idx_fee_status ON fee_ledger(status);

-- --------------------------------------------------------------------
-- 8. FACULTY PAYROLL & SALARY DISBURSEMENT
-- --------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS payrolls (
    id TEXT PRIMARY KEY DEFAULT uuid_generate_v4()::text,
    teacher_id TEXT NOT NULL REFERENCES teachers(id) ON DELETE CASCADE,
    month TEXT NOT NULL,
    year INT NOT NULL,
    total_working_days INT DEFAULT 26,
    base_salary NUMERIC(10, 2) NOT NULL,
    absent_count INT DEFAULT 0,
    hl_count INT DEFAULT 0,
    absent_deduction NUMERIC(10, 2) DEFAULT 0.00,
    hl_deduction NUMERIC(10, 2) DEFAULT 0.00,
    bonus NUMERIC(10, 2) DEFAULT 0.00,
    net_salary NUMERIC(10, 2) NOT NULL,
    status TEXT DEFAULT 'Pending' CHECK (status IN ('Pending', 'Disbursed')),
    disbursed_date DATE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- --------------------------------------------------------------------
-- 9. EXAM RESULTS & EVALUATION FOLDER TREE
-- Supports:
--   - Weekly Test Folders (Month Name & Week Number hierarchy)
--   - Monthly Test Folders (By Month Name hierarchy)
--   - Term Examinations (1st Term, Midterm, Final)
--   - Individual Test Result Preview, Download, & Delete Controls
-- --------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS exam_results (
    id TEXT PRIMARY KEY DEFAULT uuid_generate_v4()::text,
    student_id TEXT NOT NULL REFERENCES students(id) ON DELETE CASCADE,
    student_roll TEXT,
    student_name TEXT,
    session_name TEXT DEFAULT 'Session 2026',
    exam_category TEXT,
    exam_name TEXT NOT NULL,
    
    evaluation_type TEXT DEFAULT 'Weekly',
    year INT DEFAULT 2026,
    month TEXT,
    month_name TEXT,
    week_number TEXT,
    term_name TEXT,

    subject TEXT,
    subject_name TEXT,
    marks_obtained NUMERIC(5, 2) DEFAULT 0.00,
    total_marks NUMERIC(5, 2) DEFAULT 100.00,
    percentage NUMERIC(5, 2) DEFAULT 0.00,
    grade TEXT DEFAULT 'A',
    status TEXT DEFAULT 'Pass',
    remarks TEXT,
    teacher_comments TEXT,

    file_name TEXT,
    file_url TEXT,
    uploaded_at TIMESTAMPTZ DEFAULT NOW(),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_exam_student ON exam_results(student_id);
CREATE INDEX IF NOT EXISTS idx_exam_eval_type ON exam_results(evaluation_type);

-- --------------------------------------------------------------------
-- 10. SCHOOL EXPENSES TRACKER
-- --------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS expenses (
    id TEXT PRIMARY KEY DEFAULT uuid_generate_v4()::text,
    date DATE NOT NULL DEFAULT CURRENT_DATE,
    category TEXT NOT NULL,
    amount NUMERIC(10, 2) NOT NULL,
    description TEXT,
    payment_mode TEXT DEFAULT 'Cash',
    logged_by TEXT DEFAULT 'Admin',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- --------------------------------------------------------------------
-- 11. VAT & TAX FILINGS
-- --------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS vat_filings (
    id TEXT PRIMARY KEY DEFAULT uuid_generate_v4()::text,
    tax_year INT NOT NULL,
    quarter TEXT NOT NULL,
    gross_revenue NUMERIC(12, 2) DEFAULT 0.00,
    taxable_income NUMERIC(12, 2) DEFAULT 0.00,
    vat_rate NUMERIC(5, 2) DEFAULT 17.00,
    vat_due NUMERIC(12, 2) DEFAULT 0.00,
    status TEXT DEFAULT 'Draft' CHECK (status IN ('Filed', 'Pending', 'Draft')),
    filing_date DATE DEFAULT CURRENT_DATE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- --------------------------------------------------------------------
-- 12. BREVO TRANSACTIONAL EMAIL DISPATCH AUDIT LOGS
-- --------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS email_logs (
    id TEXT PRIMARY KEY DEFAULT uuid_generate_v4()::text,
    timestamp TIMESTAMPTZ DEFAULT NOW(),
    recipient_email TEXT NOT NULL,
    student_roll TEXT,
    student_name TEXT,
    term_name TEXT,
    status TEXT NOT NULL,
    brevo_message_id TEXT,
    error_message TEXT
);

-- --------------------------------------------------------------------
-- 12b. ENTITY DOCUMENT BLOBS (database file storage — gallery, scans, PDFs)
-- --------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS entity_document_blobs (
    id TEXT PRIMARY KEY,
    bucket TEXT NOT NULL DEFAULT 'entity-documents',
    storage_path TEXT NOT NULL,
    content_type TEXT NOT NULL DEFAULT 'application/octet-stream',
    content_base64 TEXT NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_entity_document_blobs_path
    ON entity_document_blobs (bucket, storage_path);

-- --------------------------------------------------------------------
-- 13. SECURITY & ROW-LEVEL SECURITY (RLS) POLICIES
-- --------------------------------------------------------------------
ALTER TABLE custom_fields DISABLE ROW LEVEL SECURITY;
ALTER TABLE students DISABLE ROW LEVEL SECURITY;
ALTER TABLE teachers DISABLE ROW LEVEL SECURITY;
ALTER TABLE student_attendance DISABLE ROW LEVEL SECURITY;
ALTER TABLE teacher_attendance DISABLE ROW LEVEL SECURITY;
ALTER TABLE fee_ledger DISABLE ROW LEVEL SECURITY;
ALTER TABLE payrolls DISABLE ROW LEVEL SECURITY;
ALTER TABLE exam_results DISABLE ROW LEVEL SECURITY;
ALTER TABLE expenses DISABLE ROW LEVEL SECURITY;
ALTER TABLE vat_filings DISABLE ROW LEVEL SECURITY;
ALTER TABLE email_logs DISABLE ROW LEVEL SECURITY;
ALTER TABLE entity_document_blobs DISABLE ROW LEVEL SECURITY;

GRANT ALL ON ALL TABLES IN SCHEMA public TO anon, authenticated, service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO anon, authenticated, service_role;

-- Complete Execution Confirmation
SELECT 'Unique School System ERP Master Database Schema Deployed Successfully!' as status;
