import { Payroll } from '../types';

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
];

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
  return {
    id: 'pay-waived-' + Date.now() + '-' + teacherId,
    teacher_id: teacherId,
    month,
    year,
    base_salary: baseSalary,
    absent_count: 0,
    deductions: 0,
    bonus: 0,
    net_salary: 0,
    status: 'Waived',
    remarks: remarks.trim() || 'Salary intentionally not disbursed for this month.',
    created_at: new Date().toISOString()
  };
}
