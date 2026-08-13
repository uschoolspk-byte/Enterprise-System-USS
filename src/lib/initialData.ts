import {
  Student,
  Teacher,
  StudentAttendance,
  TeacherAttendance,
  FeeLedger,
  Payroll,
  ExamResult,
  Expense,
  VatFiling,
  DynamicCustomField,
  EmailTemplate,
  SchoolFeeSettings,
  SiteBrandingSettings
} from '../types';
import { DEFAULT_LOGO_URL } from './brandingAssets';

export const INITIAL_SITE_BRANDING: SiteBrandingSettings = {
  school_name: 'UNIQUE SCHOOL SYSTEM',
  tagline: 'Production Management Portal',
  header_subtitle: 'Principal: Tahir Azad | Production Management Portal',
  badge_text: 'ENTERPRISE ECOSYSTEM',
  logo_url: DEFAULT_LOGO_URL,
  footer_title: 'UNIQUE SCHOOL SYSTEM — Enterprise Management Platform',
  footer_subtitle: 'Principal: Tahir Azad | Powered by Unique School System',
  footer_contact: 'Main Campus, Block-4, Education District, Pakistan',
  contact_email: 'info@uniqueschool.edu.pk',
  contact_phone: '+92 42 35880000',
  address: 'Main Campus, Block-4, Education District, Pakistan'
};

export const INITIAL_SCHOOL_FEE_SETTINGS: SchoolFeeSettings = {
  bank_accounts: [],
  payment_instructions: ''
};

export const INITIAL_CUSTOM_FIELDS: DynamicCustomField[] = [];
export const INITIAL_STUDENTS: Student[] = [];
export const INITIAL_TEACHERS: Teacher[] = [];
export const INITIAL_STUDENT_ATTENDANCE: StudentAttendance[] = [];
export const INITIAL_TEACHER_ATTENDANCE: TeacherAttendance[] = [];
export const INITIAL_FEE_LEDGER: FeeLedger[] = [];
export const INITIAL_PAYROLLS: Payroll[] = [];
export const INITIAL_EXAM_RESULTS: ExamResult[] = [];
export const INITIAL_EXPENSES: Expense[] = [];
export const INITIAL_VAT_FILINGS: VatFiling[] = [];
export const INITIAL_EMAIL_TEMPLATES: EmailTemplate[] = [];
