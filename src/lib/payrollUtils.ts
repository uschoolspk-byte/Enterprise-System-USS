import { Payroll } from '../types';

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
];

const DEFAULT_TOTAL_WORKING_DAYS = 26;

export function resolveTotalWorkingDays(candidate?: number): number {
  const n = typeof candidate === 'number' ? candidate : Number(candidate);
  if (Number.isFinite(n) && n > 0 && n <= 31) return Math.round(n);
  return DEFAULT_TOTAL_WORKING_DAYS;
}

export function calcDailySalary(baseSalary: number, totalWorkingDays?: number): number {
  const base = typeof baseSalary === 'number' && Number.isFinite(baseSalary) ? baseSalary : Number(baseSalary) || 0;
  const days = resolveTotalWorkingDays(totalWorkingDays);
  if (days <= 0) return 0;
  return Math.round((base / days) * 100) / 100;
}

export function calcHalfDayDeduction(baseSalary: number, totalWorkingDays?: number): number {
  return Math.round((calcDailySalary(baseSalary, totalWorkingDays) / 2) * 100) / 100;
}

export function calcAbsentDeduction(absentCount: number, baseSalary: number, totalWorkingDays?: number): number {
  const days = typeof absentCount === 'number' && Number.isFinite(absentCount) && absentCount >= 0 ? absentCount : 0;
  return Math.round(days * calcDailySalary(baseSalary, totalWorkingDays) * 100) / 100;
}

export function calcHlDeduction(hlCount: number, baseSalary: number, totalWorkingDays?: number): number {
  const days = typeof hlCount === 'number' && Number.isFinite(hlCount) && hlCount >= 0 ? hlCount : 0;
  return Math.round(days * calcHalfDayDeduction(baseSalary, totalWorkingDays) * 100) / 100;
}

export function defaultMonthStartDate(month: string, year: number): string {
  const idx = MONTH_NAMES.indexOf(month);
  const m = idx >= 0 ? idx : 0;
  const y = typeof year === 'number' && Number.isFinite(year) && year > 1900 ? year : new Date().getFullYear();
  const mm = String(m + 1).padStart(2, '0');
  return `${y}-${mm}-01`;
}

export function getPreviousMonthYear(month: string, year: number): { month: string; year: number } {
  const idx = MONTH_NAMES.indexOf(month);
  if (idx <= 0) {
    return { month: MONTH_NAMES[11], year: year - 1 };
  }
  return { month: MONTH_NAMES[idx - 1], year };
}

export function findExistingPayroll(
  payrolls: Payroll[],
  teacherId: string,
  month: string,
  year: number
): Payroll | undefined {
  return payrolls.find(p => p.teacher_id === teacherId && p.month === month && p.year === year);
}

export function isPayrollDisbursed(payroll: Payroll): boolean {
  return payroll.status === 'Disbursed' || payroll.status === 'Paid';
}

export function isPayrollResolved(payroll: Payroll): boolean {
  return isPayrollDisbursed(payroll) || payroll.status === 'Waived';
}

export function findMissedPayrollMonth(
  payrolls: Payroll[],
  teacherId: string,
  targetMonth: string,
  targetYear: number,
  joiningDate?: string
): { month: string; year: number } | null {
  const prev = getPreviousMonthYear(targetMonth, targetYear);

  if (joiningDate) {
    const join = new Date(joiningDate + 'T00:00:00');
    const prevDate = new Date(`${prev.year}-${String(MONTH_NAMES.indexOf(prev.month) + 1).padStart(2, '0')}-01T00:00:00`);
    if (prevDate < new Date(join.getFullYear(), join.getMonth(), 1)) {
      return null;
    }
  }

  const existing = findExistingPayroll(payrolls, teacherId, prev.month, prev.year);
  if (!existing) return prev;
  if (existing.status === 'Waived') return null;
  return null;
}

export function formatSalaryPeriod(month: string, year: number): string {
  return `${month} ${year}`;
}

export function sortPayrollsByPeriodDesc(payrollList: Payroll[]): Payroll[] {
  return [...payrollList].sort((a, b) => {
    if (a.year !== b.year) return b.year - a.year;
    return MONTH_NAMES.indexOf(b.month) - MONTH_NAMES.indexOf(a.month);
  });
}

export function getTeacherPaidPayrolls(payrollList: Payroll[], teacherId: string): Payroll[] {
  return sortPayrollsByPeriodDesc(
    payrollList.filter(p => p.teacher_id === teacherId && isPayrollDisbursed(p))
  );
}

export function buildWaivedPayroll(
  teacherId: string,
  month: string,
  year: number,
  baseSalary: number,
  remarks: string
): Payroll {
  const workingDays = DEFAULT_TOTAL_WORKING_DAYS;
  const daily = calcDailySalary(baseSalary, workingDays);
  const halfDay = calcHalfDayDeduction(baseSalary, workingDays);
  return {
    id: 'pay-waived-' + Date.now() + '-' + teacherId,
    teacher_id: teacherId,
    month,
    year,
    month_start_date: defaultMonthStartDate(month, year),
    total_working_days: workingDays,
    daily_salary: daily,
    half_day_deduction: halfDay,
    base_salary: baseSalary,
    absent_count: 0,
    deductions: 0,
    absent_deduction: 0,
    hl_deduction: 0,
    bonus: 0,
    net_salary: 0,
    status: 'Waived',
    remarks: remarks.trim() || 'Salary intentionally not disbursed for this month.',
    created_at: new Date().toISOString()
  };
}
