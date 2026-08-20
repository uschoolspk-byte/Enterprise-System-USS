/**
 * Unique School System - Core Domain Models & Enumerations
 */

export type AttendanceState = 'P' | 'A' | 'L' | 'HL';

export type DesignationType = 'Principal' | 'Coordinator' | 'Teacher';

export type ExamTypeEnum = 'Weekly Test' | 'Monthly Test' | '1st Term' | '2nd Term' | 'Final';

export type FeeStatusEnum = 'Paid' | 'Unpaid' | 'Partial' | 'Overdue';

export interface DynamicCustomField {
  id: string;
  target: 'student' | 'teacher' | 'financial';
  fieldName: string;
  fieldType: 'text' | 'numeric' | 'file';
  isRequired?: boolean;
}

export interface GalleryDocument {
  id: string;
  title: string;
  url: string;
  uploaded_at?: string;
  notes?: string;
  /** Supabase Storage path when file is stored in the cloud bucket */
  storage_path?: string;
  storage_bucket?: string;
  /** False when file is kept in local/Mongo fallback instead of Supabase Storage */
  storage_persisted?: boolean;
}

export interface Student {
  id: string;
  roll_no: string; // e.g. BS-SE-8202 or USS-2026-001
  full_name: string;
  dob: string;
  b_form_no: string;
  gender: 'Male' | 'Female' | 'Other';
  blood_group: string;
  father_name: string;
  father_cnic: string;
  mother_name: string;
  parent_phone: string;
  emergency_phone: string;
  mailing_address: string;
  enrollment_date: string;
  class_name: string; // e.g. "1", "2", "3", "Prep", "9th-A"
  
  // Guardian Info
  guardian_name: string;
  guardian_relation: string;
  guardian_cnic: string;
  guardian_phone: string;
  guardian_email: string;
  guardian_profession?: string;
  guardian_income_source?: string;

  // Orphan & Donor Tracking
  is_orphan: boolean;
  donor_id?: string | null;
  donor_name?: string | null;
  donor_number?: string | null;
  donor_email?: string | null;
  father_profession_before_death?: string | null;
  cause_of_death?: string | null; // How death occurred

  // Student Fee & Installment Plan (Admission Form)
  standard_tuition_fee?: number;
  discount_amount?: number;
  discount_reason?: string;
  payment_plan?: 'Full' | 'Half' | 'Installments_3' | 'Custom';

  // Media & Documents
  profile_image_url?: string;
  b_form_doc?: string;
  father_cnic_doc?: string;
  death_certificate_doc?: string; // Required if is_orphan = true
  leaving_cert_doc?: string;

  // Custom Fields (JSONB)
  custom_fields?: Record<string, any>;
  document_gallery?: GalleryDocument[];

  // Graduation NOC Status
  noc_status?: 'Pending' | 'Cleared';

  created_at: string;
}

export interface InstallmentRecord {
  id: string;
  date: string;
  amount: number;
  payment_mode: 'Cash' | 'Bank Transfer' | 'Cheque' | 'Online' | string;
  receipt_no: string;
  notes?: string;
  received_by?: string;
}

export interface ScheduledInstallment {
  id: string;
  label: string;
  amount: number;
  due_date: string;
  status: 'Pending' | 'Paid' | 'Overdue';
  paid_date?: string;
  linked_payment_id?: string;
}

export interface SchoolBankAccount {
  id: string;
  bank_name: string;
  account_title: string;
  account_number: string;
  iban?: string;
  branch?: string;
  notes?: string;
}

export interface SchoolFeeSettings {
  bank_accounts: SchoolBankAccount[];
  payment_instructions?: string;
  updated_at?: string;
}

export interface Teacher {
  id: string;
  teacher_id: string; // Auto format: T-YYYY-XXX e.g. T-2026-001
  full_name: string;
  cnic: string;
  phone: string;
  alt_phone: string;
  email: string;
  address: string;
  qualification: string;
  specialization: string;
  joining_date: string;
  dob?: string;
  base_salary: number;
  designation: DesignationType;
  classes_assigned: string; // Plain manual text input e.g. "1, 2, Prep, 9th-A"
  subjects_assigned?: string; // Manual text input e.g. "Calculus, Physics"
  
  profile_image_url?: string;
  cnic_doc?: string;
  degree_doc?: string;
  work_exp_doc?: string;

  custom_fields?: Record<string, any>;
  document_gallery?: GalleryDocument[];
  created_at: string;
}

export interface StudentAttendance {
  id: string;
  date: string; // YYYY-MM-DD
  class_name: string;
  student_id: string;
  status: AttendanceState;
  hl_reason?: string;
  created_at: string;
}

export interface TeacherAttendance {
  id: string;
  date: string; // YYYY-MM-DD
  teacher_id: string;
  status: AttendanceState;
  hl_reason?: string;
  created_at: string;
}

export interface FeeLedger {
  id: string;
  student_id: string;
  month: string; // e.g. "January", "August"
  year: number; // e.g. 2026
  tuition_fee: number;
  lab_charges?: number;
  custom_charges?: number;
  discount?: number;
  discount_scholarship?: number;
  net_fee: number;
  paid_amount: number;
  status: FeeStatusEnum;
  due_date?: string;
  payment_date?: string;
  installments?: InstallmentRecord[];
  scheduled_installments?: ScheduledInstallment[];
  payment_plan?: 'Full' | 'Installments_2' | 'Installments_3';
  fee_category?: string; // e.g. "Monthly Tuition", "Admission Fee", "Exam Fee"
  remarks?: string;
  voucher_sent_at?: string;
  custom_fields?: Record<string, any>;
  created_at: string;
}

export interface Payroll {
  id: string;
  teacher_id: string;
  month: string;
  year: number;
  month_start_date?: string;
  total_working_days?: number;
  daily_salary?: number;
  half_day_deduction?: number;
  base_salary: number;
  present_count?: number;
  absent_count: number;
  half_leave_count?: number;
  hl_count?: number;
  leave_count?: number;
  absent_deduction?: number;
  hl_deduction?: number;
  deductions?: number;
  bonus?: number;
  bonus_reason?: string;
  net_salary: number;
  status: 'Pending' | 'Disbursed' | 'Paid' | 'Waived';
  disbursed_date?: string;
  payment_mode?: string;
  remarks?: string;
  created_at: string;
}

export interface ExamResult {
  id: string;
  student_id: string;
  student_roll?: string;
  student_name?: string;
  session_name?: string; // e.g. "Session 2026"
  exam_category?: ExamTypeEnum; // 'Weekly Test' | 'Monthly Test' | '1st Term' | '2nd Term' | 'Final'
  exam_name?: string;
  
  // Structured Folder Tree Metadata
  evaluation_type?: 'Weekly Test' | 'Monthly Test' | 'Term Exam' | 'Weekly' | 'Monthly' | 'Term';
  year?: number; // e.g. 2026
  month?: string; // e.g. "August"
  month_name?: string;
  week_number?: 'Week 1' | 'Week 2' | 'Week 3' | 'Week 4' | string;
  term_name?: string; // e.g. "1st Term", "Midterm", "Final"
  
  subject?: string;
  subject_name?: string;
  marks?: Record<string, number>;
  obtained_marks?: number;
  marks_obtained?: number;
  total_marks?: number;
  percentage?: number;
  grade?: string;
  status?: string;
  remarks?: string;
  teacher_comments?: string;

  file_name?: string;
  file_url?: string; // Data URL or storage link
  storage_path?: string; // Supabase Storage path: e.g. "Session 2026/Weekly Test/Week 1/BS-SE-8201.pdf"
  uploaded_at?: string;
  created_at?: string;
}

export interface Expense {
  id: string;
  date: string;
  category: string;
  amount: number;
  description: string;
  payment_mode: string;
  logged_by: string;
  receipt_url?: string;
  custom_fields?: Record<string, any>;
  created_at: string;
}

export interface VatFiling {
  id: string;
  tax_year: number;
  quarter: string;
  gross_revenue: number;
  taxable_income: number;
  vat_rate: number;
  vat_due: number;
  status: 'Filed' | 'Pending' | 'Draft';
  filing_date: string;
}

export interface BrevoEmailLog {
  id: string;
  timestamp: string;
  recipient_email: string;
  recipient_type: 'Donor' | 'Guardian' | string;
  recipient_name: string;
  student_name?: string;
  subject: string;
  term_name?: string;
  status: 'Success' | 'Simulated' | 'Failed' | string;
  attachment_name?: string;
}

export interface AdminSessionState {
  isAuthenticated: boolean;
  activeTab?: string;
  updated_at: string;
}

export interface SiteBrandingSettings {
  school_name: string;
  client_updated_at?: string;
  tagline: string;
  header_subtitle: string;
  badge_text: string;
  logo_url?: string;
  footer_title: string;
  footer_subtitle: string;
  footer_contact: string;
  contact_email?: string;
  contact_phone?: string;
  address?: string;
}

export interface EmailTemplate {
  id: string;
  type: 'fee_reminder' | 'salary_slip' | 'teacher_profile' | 'report_card' | 'sponsor_update' | 'custom';
  name: string;
  subject: string;
  header_title?: string;
  body: string;
  footer?: string;
  accent_color?: string; // hex color e.g. '#1e3a8a'
  is_active?: boolean;
  updated_at: string;
}
