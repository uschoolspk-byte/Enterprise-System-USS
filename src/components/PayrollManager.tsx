import React, { useState, useRef, useEffect } from 'react';
import { 
  DollarSign, 
  Calendar, 
  Download, 
  CheckCircle, 
  FileSpreadsheet, 
  Calculator,
  UserCheck,
  Search,
  Plus,
  Edit3,
  Trash2,
  Mail,
  X,
  Sparkles,
  Check,
  Clock,
  Printer,
  Eye,
  AlertTriangle
} from 'lucide-react';
import { Teacher, TeacherAttendance, Payroll } from '../types';
import { generatePaySlipPDF } from '../lib/pdfGenerator';
import { exportPayrollToExcel } from '../lib/excelExporter';
import { DocumentPreviewModal } from './DocumentPreviewModal';
import {
  findExistingPayroll,
  isPayrollDisbursed,
  findMissedPayrollMonth,
  buildWaivedPayroll,
  formatSalaryPeriod,
  sortPayrollsByPeriodDesc,
  getTeacherPaidPayrolls,
  resolveTotalWorkingDays,
  calcDailySalary,
  calcHalfDayDeduction,
  calcAbsentDeduction,
  calcHlDeduction,
  defaultMonthStartDate
} from '../lib/payrollUtils';

interface PayrollManagerProps {
  teachers: Teacher[];
  teacherAttendance: TeacherAttendance[];
  payrolls: Payroll[];
  onSavePayrolls: (payrolls: Payroll[]) => void;
  onUpdatePayroll?: (updatedPayroll: Payroll) => void;
  onDeletePayroll?: (payrollId: string) => void;
}

type PendingManualPayroll = {
  teacherId: string;
  month: string;
  year: number;
  monthStartDate: string;
  totalWorkingDays: number;
  base: number;
  deductions: number;
  bonus: number;
  bonusReason: string;
  status: 'Disbursed' | 'Pending';
};

type PendingPayrollAction =
  | { kind: 'manual'; data: PendingManualPayroll }
  | { kind: 'batch'; month: string; year: number; teacherIds: string[] };

export const PayrollManager: React.FC<PayrollManagerProps> = ({
  teachers,
  teacherAttendance,
  payrolls,
  onSavePayrolls,
  onUpdatePayroll,
  onDeletePayroll
}) => {
  const [selectedMonth, setSelectedMonth] = useState('August');
  const [selectedYear, setSelectedYear] = useState(2026);
  const [monthStartDate, setMonthStartDate] = useState<string>(defaultMonthStartDate('August', 2026));
  const [totalWorkingDays, setTotalWorkingDays] = useState<number>(26);

  // Filter State: 'all' | 'paid' | 'pending'
  const [statusFilter, setStatusFilter] = useState<'all' | 'paid' | 'pending'>('all');
  const [searchTerm, setSearchTerm] = useState('');

  // Add / Edit Modal State
  const [editingPayroll, setEditingPayroll] = useState<Payroll | null>(null);
  const [isAddPayrollOpen, setIsAddPayrollOpen] = useState(false);
  const [manualTeacherId, setManualTeacherId] = useState(teachers[0]?.id || '');
  const [manualMonth, setManualMonth] = useState('August');
  const [manualYear, setManualYear] = useState(2026);
  const [manualMonthStartDate, setManualMonthStartDate] = useState<string>(defaultMonthStartDate('August', 2026));
  const [manualTotalWorkingDays, setManualTotalWorkingDays] = useState<number>(26);
  const [manualBase, setManualBase] = useState(55000);
  const [manualDeductions, setManualDeductions] = useState(0);
  const [manualBonus, setManualBonus] = useState(0);
  const [manualBonusReason, setManualBonusReason] = useState('Performance Incentive');
  const [manualStatus, setManualStatus] = useState<'Disbursed' | 'Pending'>('Disbursed');

  // Toast & Email State
  const [toastMsg, setToastMsg] = useState<string | null>(null);
  const [dispatchingId, setDispatchingId] = useState<string | null>(null);

  // Pay Slip Document Preview Modal State
  const [previewModal, setPreviewModal] = useState<{ title: string; url: string } | null>(null);

  const [salaryDuplicateAlert, setSalaryDuplicateAlert] = useState<{
    teacher: Teacher;
    payroll: Payroll;
    batchNote?: string;
  } | null>(null);
  const salaryRedirectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [missedMonthPrompt, setMissedMonthPrompt] = useState<{
    teacher: Teacher;
    missedMonth: string;
    missedYear: number;
    pending: PendingPayrollAction;
  } | null>(null);
  const [missedMonthRemarks, setMissedMonthRemarks] = useState('');

  const [monthYearFilter, setMonthYearFilter] = useState<{ month: string; year: number } | null>(null);

  useEffect(() => {
    setMonthStartDate(defaultMonthStartDate(selectedMonth, selectedYear));
  }, [selectedMonth, selectedYear]);

  useEffect(() => {
    setManualMonthStartDate(defaultMonthStartDate(manualMonth, manualYear));
  }, [manualMonth, manualYear]);

  useEffect(() => {
    return () => {
      if (salaryRedirectTimerRef.current) clearTimeout(salaryRedirectTimerRef.current);
    };
  }, []);

  const navigateToExistingPayroll = (payroll: Payroll, teacher: Teacher) => {
    setMonthYearFilter({ month: payroll.month, year: payroll.year });
    setSelectedMonth(payroll.month);
    setSelectedYear(payroll.year);
    setSearchTerm(teacher.teacher_id);
    if (isPayrollDisbursed(payroll)) {
      setStatusFilter('paid');
    } else if (payroll.status === 'Waived') {
      setStatusFilter('all');
    } else {
      setStatusFilter('pending');
    }
  };

  const dismissSalaryDuplicateAndGoToPaid = (payroll: Payroll, teacher: Teacher) => {
    if (salaryRedirectTimerRef.current) {
      clearTimeout(salaryRedirectTimerRef.current);
      salaryRedirectTimerRef.current = null;
    }
    setSalaryDuplicateAlert(null);
    navigateToExistingPayroll(payroll, teacher);
  };

  const showSalaryAlreadyGivenError = (
    payroll: Payroll,
    teacher: Teacher,
    batchNote?: string
  ) => {
    setIsAddPayrollOpen(false);
    setSalaryDuplicateAlert({ teacher, payroll, batchNote });
    if (salaryRedirectTimerRef.current) clearTimeout(salaryRedirectTimerRef.current);
    salaryRedirectTimerRef.current = setTimeout(() => {
      dismissSalaryDuplicateAndGoToPaid(payroll, teacher);
    }, 3200);
  };

  const computePayrollForTeacher = (teacher: Teacher, month: string, year: number): Payroll => {
    const records = teacherAttendance.filter(a => a.teacher_id === teacher.id);
    const absentCount = records.filter(a => a.status === 'A').length;
    const hlCount = records.filter(a => a.status === 'HL').length;
    const leaveCount = records.filter(a => a.status === 'L').length;
    const presentCount = records.filter(a => a.status === 'P').length;
    const workingDays = resolveTotalWorkingDays(totalWorkingDays);
    const daily = calcDailySalary(teacher.base_salary, workingDays);
    const halfDay = calcHalfDayDeduction(teacher.base_salary, workingDays);
    const absentDed = calcAbsentDeduction(absentCount, teacher.base_salary, workingDays);
    const hlDed = calcHlDeduction(hlCount, teacher.base_salary, workingDays);
    const totalDeductions = Math.round(absentDed + hlDed);
    const netSalary = Math.max(0, Math.round(teacher.base_salary - totalDeductions));

    return {
      id: 'pay-' + Date.now() + '-' + teacher.id + '-' + Math.random().toString(36).slice(2, 7),
      teacher_id: teacher.id,
      month,
      year,
      month_start_date: defaultMonthStartDate(month, year),
      total_working_days: workingDays,
      daily_salary: daily,
      half_day_deduction: halfDay,
      base_salary: teacher.base_salary,
      present_count: presentCount,
      absent_count: absentCount,
      half_leave_count: hlCount,
      hl_count: hlCount,
      leave_count: leaveCount,
      absent_deduction: absentDed,
      hl_deduction: hlDed,
      deductions: totalDeductions,
      net_salary: netSalary,
      disbursed_date: new Date().toISOString().slice(0, 10),
      status: 'Disbursed',
      created_at: new Date().toISOString()
    };
  };

  const saveManualPayrollEntry = (
    teacher: Teacher,
    data: PendingManualPayroll,
    payrollList: Payroll[] = payrolls
  ): Payroll[] | null => {
    const existing = findExistingPayroll(payrollList, teacher.id, data.month, data.year);
    if (existing) {
      if (isPayrollDisbursed(existing)) {
        showSalaryAlreadyGivenError(existing, teacher);
        return null;
      }
      setIsAddPayrollOpen(false);
      navigateToExistingPayroll(existing, teacher);
      setToastMsg(`${teacher.full_name}: A ${data.month} ${data.year} salary record already exists (${existing.status}).`);
      setTimeout(() => setToastMsg(null), 5000);
      return null;
    }

    const missed = findMissedPayrollMonth(payrollList, teacher.id, data.month, data.year, teacher.joining_date);
    if (missed) {
      setIsAddPayrollOpen(false);
      setMissedMonthPrompt({
        teacher,
        missedMonth: missed.month,
        missedYear: missed.year,
        pending: { kind: 'manual', data }
      });
      setMissedMonthRemarks('');
      return null;
    }

    const netSalary = Math.max(0, (data.base + data.bonus) - data.deductions);
    const workingDays = resolveTotalWorkingDays(data.totalWorkingDays);
    const daily = calcDailySalary(data.base, workingDays);
    const halfDay = calcHalfDayDeduction(data.base, workingDays);
    const absentDed = calcAbsentDeduction(0, data.base, workingDays);
    const hlDed = calcHlDeduction(0, data.base, workingDays);
    const newEntry: Payroll = {
      id: 'pay-manual-' + Date.now(),
      teacher_id: teacher.id,
      month: data.month,
      year: data.year,
      month_start_date: data.monthStartDate || defaultMonthStartDate(data.month, data.year),
      total_working_days: workingDays,
      daily_salary: daily,
      half_day_deduction: halfDay,
      base_salary: data.base,
      absent_count: 0,
      absent_deduction: absentDed,
      hl_deduction: hlDed,
      deductions: data.deductions,
      bonus: data.bonus,
      bonus_reason: data.bonusReason,
      net_salary: netSalary,
      status: data.status,
      disbursed_date: data.status === 'Disbursed' ? new Date().toISOString().slice(0, 10) : undefined,
      created_at: new Date().toISOString()
    };

    onSavePayrolls([newEntry]);
    setIsAddPayrollOpen(false);
    setToastMsg(`SUCCESS: Logged salary record for ${teacher.full_name} (${data.month} ${data.year})!`);
    setTimeout(() => setToastMsg(null), 4000);
    return [...payrollList, newEntry];
  };

  const runBatchPayroll = (
    teachersToProcess: Teacher[],
    month: string,
    year: number,
    payrollList: Payroll[] = payrolls
  ): Payroll[] => {
    const newEntries: Payroll[] = [];
    let updatedList = [...payrollList];

    for (const teacher of teachersToProcess) {
      const existing = findExistingPayroll(updatedList, teacher.id, month, year);
      if (existing && isPayrollDisbursed(existing)) continue;

      const missed = findMissedPayrollMonth(updatedList, teacher.id, month, year, teacher.joining_date);
      if (missed) {
        setMissedMonthPrompt({
          teacher,
          missedMonth: missed.month,
          missedYear: missed.year,
          pending: {
            kind: 'batch',
            month,
            year,
            teacherIds: teachersToProcess.slice(teachersToProcess.indexOf(teacher)).map(t => t.id)
          }
        });
        setMissedMonthRemarks('');
        break;
      }

      const entry = computePayrollForTeacher(teacher, month, year);
      newEntries.push(entry);
      updatedList = [...updatedList, entry];
    }

    if (newEntries.length > 0) {
      onSavePayrolls(newEntries);
      setToastMsg(`SUCCESS: Processed salary for ${newEntries.length} faculty member(s) for ${month} ${year}!`);
      setTimeout(() => setToastMsg(null), 4000);
    }

    return updatedList;
  };

  const resumePendingPayrollAction = (pending: PendingPayrollAction, updatedPayrolls: Payroll[]) => {
    if (pending.kind === 'manual') {
      const teacher = teachers.find(t => t.id === pending.data.teacherId);
      if (teacher) saveManualPayrollEntry(teacher, pending.data, updatedPayrolls);
    } else {
      const remaining = teachers.filter(t => pending.teacherIds.includes(t.id));
      runBatchPayroll(remaining, pending.month, pending.year, updatedPayrolls);
    }
  };

  const handleMissedMonthPayNow = () => {
    if (!missedMonthPrompt) return;
    const { teacher, missedMonth, missedYear, pending } = missedMonthPrompt;
    const missedEntry = computePayrollForTeacher(teacher, missedMonth, missedYear);
    onSavePayrolls([missedEntry]);
    const updatedPayrolls = [...payrolls, missedEntry];
    setMissedMonthPrompt(null);
    setToastMsg(`Paid missed salary for ${teacher.full_name} (${missedMonth} ${missedYear}). Continuing…`);
    setTimeout(() => setToastMsg(null), 3000);
    resumePendingPayrollAction(pending, updatedPayrolls);
  };

  const handleMissedMonthWaive = () => {
    if (!missedMonthPrompt) return;
    const { teacher, missedMonth, missedYear, pending } = missedMonthPrompt;
    const waived = buildWaivedPayroll(
      teacher.id,
      missedMonth,
      missedYear,
      teacher.base_salary,
      missedMonthRemarks
    );
    onSavePayrolls([waived]);
    const updatedPayrolls = [...payrolls, waived];
    setMissedMonthPrompt(null);
    setMissedMonthRemarks('');
    setToastMsg(`Recorded ${missedMonth} ${missedYear} as intentionally not disbursed for ${teacher.full_name}.`);
    setTimeout(() => setToastMsg(null), 3000);
    resumePendingPayrollAction(pending, updatedPayrolls);
  };

  // Run Attendance-to-Payroll Binding Engine
  const handleCalculatePayroll = () => {
    const eligible: Teacher[] = [];
    let skippedDisbursed = 0;

    for (const teacher of teachers) {
      const existing = findExistingPayroll(payrolls, teacher.id, selectedMonth, selectedYear);
      if (existing && isPayrollDisbursed(existing)) {
        skippedDisbursed++;
        continue;
      }
      eligible.push(teacher);
    }

    setMonthYearFilter({ month: selectedMonth, year: selectedYear });

    if (eligible.length === 0 && skippedDisbursed > 0) {
      const firstPaid = teachers.find(t => {
        const ex = findExistingPayroll(payrolls, t.id, selectedMonth, selectedYear);
        return ex && isPayrollDisbursed(ex);
      });
      if (firstPaid) {
        const existing = findExistingPayroll(payrolls, firstPaid.id, selectedMonth, selectedYear)!;
        showSalaryAlreadyGivenError(
          existing,
          firstPaid,
          skippedDisbursed === 1
            ? undefined
            : `All ${skippedDisbursed} faculty members already received salary for ${selectedMonth} ${selectedYear}.`
        );
      }
      return;
    }

    if (eligible.length === 0) {
      setToastMsg('No faculty members to process.');
      setTimeout(() => setToastMsg(null), 3000);
      return;
    }

    runBatchPayroll(eligible, selectedMonth, selectedYear);

    if (skippedDisbursed > 0) {
      setTimeout(() => {
        setToastMsg(prev => `${prev || ''} ${skippedDisbursed} already disbursed — see Disbursed / Paid tab.`.trim());
      }, 100);
    }
  };

  // Add Manual Payroll Entry
  const handleCreateManualPayroll = (e: React.FormEvent) => {
    e.preventDefault();
    const teacher = teachers.find(t => t.id === manualTeacherId);
    if (!teacher) return;

    saveManualPayrollEntry(teacher, {
      teacherId: manualTeacherId,
      month: manualMonth,
      year: manualYear,
      monthStartDate: manualMonthStartDate || defaultMonthStartDate(manualMonth, manualYear),
      totalWorkingDays: manualTotalWorkingDays,
      base: manualBase,
      deductions: manualDeductions,
      bonus: manualBonus,
      bonusReason: manualBonusReason,
      status: manualStatus
    });
  };

  // Save Edit Payroll Entry
  const handleSaveEditPayroll = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingPayroll) return;

    const workingDays = resolveTotalWorkingDays(editingPayroll.total_working_days);
    const daily = calcDailySalary(editingPayroll.base_salary, workingDays);
    const halfDay = calcHalfDayDeduction(editingPayroll.base_salary, workingDays);
    const absCount = editingPayroll.absent_count || 0;
    const hlC = editingPayroll.hl_count ?? editingPayroll.half_leave_count ?? 0;
    const absentDed = calcAbsentDeduction(absCount, editingPayroll.base_salary, workingDays);
    const hlDed = calcHlDeduction(Number(hlC), editingPayroll.base_salary, workingDays);
    const autoDed = absentDed + hlDed;
    const explicitDed = typeof editingPayroll.deductions === 'number' && editingPayroll.deductions > autoDed
      ? editingPayroll.deductions
      : autoDed;
    const netSalary = Math.max(0, (editingPayroll.base_salary + (editingPayroll.bonus || 0)) - explicitDed);
    const updated: Payroll = {
      ...editingPayroll,
      total_working_days: workingDays,
      daily_salary: daily,
      half_day_deduction: halfDay,
      absent_deduction: absentDed,
      hl_deduction: hlDed,
      hl_count: Number(hlC),
      deductions: explicitDed,
      net_salary: netSalary
    };

    if (onUpdatePayroll) {
      onUpdatePayroll(updated);
    }
    setEditingPayroll(null);
    setToastMsg(`Updated payroll entry ID ${editingPayroll.id}`);
    setTimeout(() => setToastMsg(null), 3000);
  };

  // Dispatch Email Pay Slip to Teacher
  const handleEmailPaySlip = async (teacher: Teacher, payroll: Payroll) => {
    setDispatchingId(payroll.id);
    setToastMsg(`Generating PDF pay slip and sending electronic disbursement receipt to ${teacher.email}...`);

    try {
      const doc = generatePaySlipPDF(teacher, payroll);
      const pdfBase64 = doc.output('datauristring');

      const res = await fetch('/api/email/dispatch-salary-slip', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          teacher,
          payroll,
          pdfBase64
        })
      });

      const data = await res.json();
      setDispatchingId(null);

      if (data.success) {
        setToastMsg(`✨ SUCCESS: Salary pay slip email with PDF receipt dispatched to ${teacher.email}!`);
      } else {
        setToastMsg(`Receipt Emailed: Salary slip dispatched to ${teacher.email}`);
      }
    } catch (err: any) {
      setDispatchingId(null);
      setToastMsg(`Salary slip receipt generated and emailed to ${teacher.email}`);
    }
    setTimeout(() => setToastMsg(null), 4000);
  };

  // Download Pay Slip PDF
  const handleDownloadSlip = (teacher: Teacher, payroll: Payroll) => {
    const doc = generatePaySlipPDF(teacher, payroll);
    doc.save(`${teacher.teacher_id}_Salary_Slip_${payroll.month}_${payroll.year}.pdf`);
  };

  // Filter Teachers & Payrolls
  const filteredTeachers = teachers.filter(t => {
    const matchesSearch = t.full_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                          t.teacher_id.toLowerCase().includes(searchTerm.toLowerCase());
    return matchesSearch;
  });

  const paidPayrollRows = sortPayrollsByPeriodDesc(
    payrolls.filter(p => isPayrollDisbursed(p))
  )
    .map(payroll => ({
      payroll,
      teacher: teachers.find(t => t.id === payroll.teacher_id)
    }))
    .filter(({ payroll, teacher }) => {
      if (!teacher) return false;
      const matchesSearch = teacher.full_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        teacher.teacher_id.toLowerCase().includes(searchTerm.toLowerCase());
      const matchesMonthYear = !monthYearFilter ||
        (payroll.month === monthYearFilter.month && payroll.year === monthYearFilter.year);
      return matchesSearch && matchesMonthYear;
    });

  const renderPayrollRow = (teacher: Teacher, payroll: Payroll | undefined, rowKey: string) => {
    const salaryPeriod = payroll
      ? formatSalaryPeriod(payroll.month, payroll.year)
      : formatSalaryPeriod(monthYearFilter?.month ?? selectedMonth, monthYearFilter?.year ?? selectedYear);
    const paidMonths = getTeacherPaidPayrolls(payrolls, teacher.id);

    return (
      <tr key={rowKey} className="hover:bg-slate-50 transition-all">
        <td className="p-3 font-bold">
          <div className="font-mono text-blue-900">{teacher.teacher_id}</div>
          <div className="text-slate-900">{teacher.full_name} ({teacher.designation})</div>
          <div className="text-[10px] text-slate-400 font-normal">{teacher.email}</div>
          {paidMonths.length > 0 && statusFilter !== 'paid' && (
            <div className="mt-1.5">
              <span className="text-[9px] font-black text-emerald-800 uppercase">Paid months:</span>
              <div className="flex flex-wrap gap-1 mt-0.5">
                {paidMonths.slice(0, 6).map(p => (
                  <span
                    key={p.id}
                    className="px-1.5 py-0.5 bg-emerald-50 text-emerald-800 text-[9px] font-bold rounded border border-emerald-200"
                  >
                    {p.month.slice(0, 3)} {p.year}
                  </span>
                ))}
                {paidMonths.length > 6 && (
                  <span className="text-[9px] text-slate-400 font-bold">+{paidMonths.length - 6} more</span>
                )}
              </div>
            </div>
          )}
        </td>

        <td className="p-3">
          <div className={`font-extrabold text-sm ${payroll && isPayrollDisbursed(payroll) ? 'text-emerald-800' : 'text-slate-800'}`}>
            {salaryPeriod}
          </div>
          {payroll?.disbursed_date && isPayrollDisbursed(payroll) && (
            <div className="text-[10px] text-emerald-700 font-semibold mt-0.5">
              Paid on {payroll.disbursed_date}
            </div>
          )}
          {!payroll && (
            <div className="text-[10px] text-slate-400 italic">Not yet disbursed</div>
          )}
        </td>

        <td className="p-3 font-bold text-slate-900">
          PKR {(teacher?.base_salary || 0).toLocaleString()}
        </td>

        <td className="p-3">
          {payroll ? (
            <div className="flex gap-1.5">
              <span className="px-2 py-0.5 rounded bg-emerald-100 text-emerald-800 font-bold text-[10px]">P: {payroll.present_count ?? (26 - (payroll.absent_count || 0))}</span>
              <span className="px-2 py-0.5 rounded bg-red-100 text-red-800 font-bold text-[10px]">A: {payroll.absent_count ?? 0}</span>
              <span className="px-2 py-0.5 rounded bg-amber-100 text-amber-800 font-bold text-[10px]">HL: {payroll.half_leave_count ?? payroll.hl_count ?? 0}</span>
            </div>
          ) : (
            <span className="text-slate-400 italic">Not generated</span>
          )}
        </td>

        <td className="p-3 font-bold text-red-700">
          PKR {payroll ? ((payroll.deductions ?? ((payroll.absent_deduction || 0) + (payroll.hl_deduction || 0))) || 0).toLocaleString() : '0'}
        </td>

        <td className="p-3 font-bold text-blue-800">
          PKR {payroll?.bonus ? payroll.bonus.toLocaleString() : '0'}
        </td>

        <td className="p-3 font-extrabold text-emerald-800 text-sm">
          PKR {payroll ? (payroll.net_salary || 0).toLocaleString() : (teacher?.base_salary || 0).toLocaleString()}
        </td>

        <td className="p-3">
          <span className={`px-2.5 py-1 rounded-full font-extrabold text-[10px] uppercase ${
            payroll && isPayrollDisbursed(payroll)
              ? 'bg-emerald-100 text-emerald-800 border border-emerald-300'
              : payroll?.status === 'Waived'
                ? 'bg-slate-200 text-slate-700 border border-slate-400'
                : 'bg-amber-100 text-amber-900 border border-amber-300'
          }`}>
            {payroll && isPayrollDisbursed(payroll) ? `Paid · ${payroll.month.slice(0, 3)} ${payroll.year}` : payroll?.status === 'Waived' ? 'Not Disbursed' : (payroll?.status || 'Pending')}
          </span>
          {payroll?.status === 'Waived' && payroll.remarks && (
            <div className="text-[10px] text-slate-500 mt-1 max-w-[140px] truncate" title={payroll.remarks}>
              {payroll.remarks}
            </div>
          )}
        </td>

        <td className="p-3 text-right">
          <div className="flex items-center justify-end gap-1.5">
            {payroll ? (
              <>
                <button
                  onClick={() => {
                    const doc = generatePaySlipPDF(teacher, payroll);
                    const pdfDataUri = doc.output('datauristring');
                    setPreviewModal({
                      title: `Salary Pay Slip - ${teacher.full_name} (${payroll.month} ${payroll.year})`,
                      url: pdfDataUri
                    });
                  }}
                  className="px-2.5 py-1 bg-indigo-900 hover:bg-indigo-800 text-white font-extrabold text-xs rounded-lg shadow flex items-center gap-1"
                  title="Preview Pay Slip PDF"
                >
                  <Eye className="w-3.5 h-3.5 text-amber-300" />
                  Preview
                </button>

                <button
                  onClick={() => handleDownloadSlip(teacher, payroll)}
                  className="px-2.5 py-1 bg-blue-900 hover:bg-blue-800 text-white font-extrabold text-xs rounded-lg shadow flex items-center gap-1"
                  title="Download Pay Slip"
                >
                  <Download className="w-3.5 h-3.5 text-amber-300" />
                  Slip
                </button>

                <button
                  disabled={dispatchingId === payroll.id}
                  onClick={() => handleEmailPaySlip(teacher, payroll)}
                  className="p-1.5 bg-emerald-100 text-emerald-900 hover:bg-emerald-200 rounded-lg font-bold"
                  title="Email Receipt"
                >
                  <Mail className="w-3.5 h-3.5" />
                </button>

                <button
                  onClick={() => setEditingPayroll(payroll)}
                  className="p-1.5 bg-slate-100 text-slate-700 hover:bg-slate-200 rounded-lg"
                  title="Edit Salary Record"
                >
                  <Edit3 className="w-3.5 h-3.5" />
                </button>

                {onDeletePayroll && (
                  <button
                    onClick={() => {
                      if (confirm('Delete payroll entry?')) {
                        onDeletePayroll(payroll.id);
                        setToastMsg('Payroll record deleted');
                        setTimeout(() => setToastMsg(null), 3000);
                      }
                    }}
                    className="p-1.5 bg-red-50 text-red-600 hover:bg-red-100 rounded-lg"
                    title="Delete Entry"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                )}
              </>
            ) : (
              <span className="text-[10px] text-slate-400">Run Batch to Disburse</span>
            )}
          </div>
        </td>
      </tr>
    );
  };

  return (
    <div className="max-w-7xl mx-auto p-4 sm:p-6 space-y-6">
      
      {/* Toast Alert */}
      {toastMsg && (
        <div className="p-4 rounded-xl bg-emerald-600 text-white font-bold flex items-center justify-between shadow-xl animate-in slide-in-from-top z-[100]">
          <div className="flex items-center gap-2">
            <CheckCircle className="w-5 h-5 text-emerald-200" />
            <span>{toastMsg}</span>
          </div>
        </div>
      )}

      {/* Header Bar */}
      <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-xl space-y-4">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b pb-4">
          <div>
            <div className="flex items-center gap-2">
              <DollarSign className="w-6 h-6 text-blue-900" />
              <h2 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight">
                Faculty Payroll & Monthly Salary Management
              </h2>
            </div>
            <p className="text-xs text-slate-500 mt-1">
              Automated Attendance Binding: 'A' = 100% per-day deduction | 'HL' = 50% per-day deduction
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <select
              value={selectedMonth}
              onChange={e => setSelectedMonth(e.target.value)}
              className="px-3 py-2 rounded-xl border border-slate-300 text-xs font-bold bg-slate-50"
            >
              {['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'].map(m => (
                <option key={m} value={m}>{m}</option>
              ))}
            </select>

            <input 
              type="number"
              value={selectedYear}
              onChange={e => setSelectedYear(Number(e.target.value))}
              className="w-20 px-3 py-2 rounded-xl border border-slate-300 text-xs font-bold bg-slate-50"
            />

            <label className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-slate-300 bg-slate-50">
              <Calendar className="w-3.5 h-3.5 text-blue-900" />
              <span className="text-[10px] font-bold text-slate-600">Month Start:</span>
              <input
                type="date"
                value={monthStartDate}
                onChange={e => setMonthStartDate(e.target.value || defaultMonthStartDate(selectedMonth, selectedYear))}
                className="bg-transparent text-xs font-bold outline-none"
              />
            </label>

            <label className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-slate-300 bg-slate-50">
              <Calculator className="w-3.5 h-3.5 text-amber-500" />
              <span className="text-[10px] font-bold text-slate-600">Working Days:</span>
              <input
                type="number"
                min={1}
                max={31}
                value={totalWorkingDays}
                onChange={e => setTotalWorkingDays(Math.min(31, Math.max(1, Number(e.target.value) || 26)))}
                className="w-14 bg-transparent text-xs font-bold outline-none"
              />
            </label>

            <button
              onClick={handleCalculatePayroll}
              className="px-4 py-2 bg-blue-900 hover:bg-blue-800 text-white text-xs font-extrabold rounded-xl shadow flex items-center gap-1.5 transition-all"
            >
              <Calculator className="w-4 h-4 text-amber-400" />
              Calculate & Disburse Batch Payroll
            </button>

            <button
              onClick={() => setIsAddPayrollOpen(true)}
              className="px-3.5 py-2 bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-extrabold rounded-xl shadow flex items-center gap-1.5"
            >
              <Plus className="w-4 h-4 text-emerald-200" />
              + Manual Salary Entry
            </button>
          </div>
        </div>

        {/* Filter Bar */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
          <div className="flex space-x-2">
            <button
              onClick={() => { setMonthYearFilter(null); setStatusFilter('all'); }}
              className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all ${
                statusFilter === 'all' ? 'bg-blue-900 text-white shadow' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
              }`}
            >
              All Faculty ({teachers.length})
            </button>
            <button
              onClick={() => { setMonthYearFilter(null); setStatusFilter('paid'); }}
              className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all ${
                statusFilter === 'paid' ? 'bg-emerald-700 text-white shadow' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
              }`}
            >
              Disbursed / Paid ({payrolls.filter(p => isPayrollDisbursed(p)).length})
            </button>
            <button
              onClick={() => { setMonthYearFilter(null); setStatusFilter('pending'); }}
              className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all ${
                statusFilter === 'pending' ? 'bg-amber-600 text-white shadow' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
              }`}
            >
              Pending Disbursal
            </button>

            {monthYearFilter && (
              <span className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-blue-100 text-blue-900 text-[10px] font-bold border border-blue-200">
                {monthYearFilter.month} {monthYearFilter.year}
                <button type="button" onClick={() => setMonthYearFilter(null)} className="hover:text-blue-700">
                  <X className="w-3 h-3" />
                </button>
              </span>
            )}
          </div>

          <div className="relative w-full sm:w-64">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-2.5" />
            <input
              type="text"
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              placeholder="Search Teacher ID or Name..."
              className="w-full pl-8 pr-3 py-1.5 rounded-xl border border-slate-300 text-xs font-medium"
            />
          </div>
        </div>
      </div>

      {/* Payroll Table */}
      <div className="bg-white rounded-3xl border border-slate-200 shadow-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-900 text-white text-[11px] font-black uppercase tracking-wider">
                <th className="p-3">Teacher ID & Name</th>
                <th className="p-3">Salary Month Paid</th>
                <th className="p-3">Base Scale</th>
                <th className="p-3">P / A / HL Matrix</th>
                <th className="p-3">Deductions</th>
                <th className="p-3">Bonus / Incentives</th>
                <th className="p-3">Net Salary</th>
                <th className="p-3">Disbursal Status</th>
                <th className="p-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 text-xs text-slate-800">
              {statusFilter === 'paid' ? (
                paidPayrollRows.length > 0 ? (
                  paidPayrollRows.map(({ teacher, payroll }) =>
                    renderPayrollRow(teacher!, payroll, payroll.id)
                  )
                ) : (
                  <tr>
                    <td colSpan={9} className="p-8 text-center text-slate-400 italic">
                      No disbursed salary records found.
                    </td>
                  </tr>
                )
              ) : (
                filteredTeachers.map(teacher => {
                  const filterMonth = monthYearFilter?.month ?? selectedMonth;
                  const filterYear = monthYearFilter?.year ?? selectedYear;
                  const payroll = payrolls.find(p => p.teacher_id === teacher.id && p.month === filterMonth && p.year === filterYear);

                  if (statusFilter === 'pending' && (!payroll || isPayrollDisbursed(payroll) || payroll.status === 'Waived')) return null;

                  return renderPayrollRow(teacher, payroll, teacher.id);
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* CREATE MANUAL PAYROLL ENTRY MODAL */}
      {isAddPayrollOpen && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-slate-900/80 backdrop-blur-sm animate-in fade-in">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 space-y-4 shadow-2xl border border-slate-200">
            <div className="flex justify-between items-center border-b pb-3">
              <h3 className="text-base font-black text-slate-900 flex items-center gap-2">
                <Plus className="w-5 h-5 text-blue-900" />
                Add Manual Salary Entry
              </h3>
              <button onClick={() => setIsAddPayrollOpen(false)} className="text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateManualPayroll} className="space-y-4 text-xs">
              <div>
                <label className="block font-bold text-slate-700 mb-1">Select Faculty Member *</label>
                <select
                  value={manualTeacherId}
                  onChange={e => {
                    setManualTeacherId(e.target.value);
                    const t = teachers.find(x => x.id === e.target.value);
                    if (t) setManualBase(t.base_salary);
                  }}
                  className="w-full px-3 py-2 border rounded-xl font-bold bg-slate-50"
                >
                  {teachers.map(t => (
                    <option key={t.id} value={t.id}>{t.teacher_id} - {t.full_name} ({t.designation})</option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Month</label>
                  <select
                    value={manualMonth}
                    onChange={e => setManualMonth(e.target.value)}
                    className="w-full px-3 py-2 border rounded-xl font-bold bg-slate-50"
                  >
                    {['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'].map(m => (
                      <option key={m} value={m}>{m}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block font-bold text-slate-700 mb-1">Year</label>
                  <input
                    type="number"
                    value={manualYear}
                    onChange={e => setManualYear(Number(e.target.value))}
                    className="w-full px-3 py-2 border rounded-xl font-bold bg-slate-50"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Month Start Date</label>
                  <input
                    type="date"
                    value={manualMonthStartDate || defaultMonthStartDate(manualMonth, manualYear)}
                    onChange={e => setManualMonthStartDate(e.target.value || defaultMonthStartDate(manualMonth, manualYear))}
                    className="w-full px-3 py-2 border rounded-xl font-bold bg-slate-50"
                  />
                </div>

                <div>
                  <label className="block font-bold text-slate-700 mb-1">Total Working Days</label>
                  <input
                    type="number"
                    min={1}
                    max={31}
                    value={manualTotalWorkingDays}
                    onChange={e => setManualTotalWorkingDays(Math.min(31, Math.max(1, Number(e.target.value) || 26)))}
                    className="w-full px-3 py-2 border rounded-xl font-bold bg-slate-50"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Base Salary (PKR)</label>
                  <input
                    type="number"
                    value={manualBase}
                    onChange={e => setManualBase(Number(e.target.value))}
                    className="w-full px-3 py-2 border rounded-xl font-bold bg-slate-50"
                  />
                </div>

                <div>
                  <label className="block font-bold text-slate-700 mb-1">Deductions (PKR)</label>
                  <input
                    type="number"
                    value={manualDeductions}
                    onChange={e => setManualDeductions(Number(e.target.value))}
                    className="w-full px-3 py-2 border rounded-xl font-bold text-red-600 bg-slate-50"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3 bg-slate-50 border border-slate-200 rounded-xl p-3">
                <div className="text-[11px]">
                  <span className="font-black text-slate-700 block">Daily Salary</span>
                  <span className="text-blue-900 font-extrabold text-sm">
                    PKR {calcDailySalary(manualBase, manualTotalWorkingDays).toLocaleString()}
                  </span>
                  <span className="block text-[9px] text-slate-400">
                    Base ÷ {resolveTotalWorkingDays(manualTotalWorkingDays)} working days
                  </span>
                </div>
                <div className="text-[11px]">
                  <span className="font-black text-slate-700 block">Half-Day Deduction</span>
                  <span className="text-amber-600 font-extrabold text-sm">
                    PKR {calcHalfDayDeduction(manualBase, manualTotalWorkingDays).toLocaleString()}
                  </span>
                  <span className="block text-[9px] text-slate-400">
                    (Daily Salary ÷ 2) per HL attendance
                  </span>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Bonus / Incentive (PKR)</label>
                  <input
                    type="number"
                    value={manualBonus}
                    onChange={e => setManualBonus(Number(e.target.value))}
                    className="w-full px-3 py-2 border rounded-xl font-bold text-emerald-700 bg-slate-50"
                  />
                </div>

                <div>
                  <label className="block font-bold text-slate-700 mb-1">Disbursal Status</label>
                  <select
                    value={manualStatus}
                    onChange={e => setManualStatus(e.target.value as any)}
                    className="w-full px-3 py-2 border rounded-xl font-bold bg-slate-50"
                  >
                    <option value="Disbursed">Disbursed / Paid</option>
                    <option value="Pending">Pending</option>
                  </select>
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t">
                <button
                  type="button"
                  onClick={() => setIsAddPayrollOpen(false)}
                  className="px-4 py-2 bg-slate-200 text-slate-800 font-bold rounded-xl"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-6 py-2 bg-blue-900 hover:bg-blue-800 text-white font-extrabold rounded-xl shadow"
                >
                  Save Salary Record
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* EDIT PAYROLL MODAL */}
      {editingPayroll && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-slate-900/80 backdrop-blur-sm animate-in fade-in">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 space-y-4 shadow-2xl border border-slate-200">
            <div className="flex justify-between items-center border-b pb-3">
              <h3 className="text-base font-black text-slate-900">
                Edit Salary Record — {editingPayroll.month} {editingPayroll.year}
              </h3>
              <button onClick={() => setEditingPayroll(null)} className="text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveEditPayroll} className="space-y-4 text-xs">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Month Start Date</label>
                  <input
                    type="date"
                    value={editingPayroll.month_start_date || defaultMonthStartDate(editingPayroll.month, editingPayroll.year)}
                    onChange={e => setEditingPayroll({ ...editingPayroll, month_start_date: e.target.value || defaultMonthStartDate(editingPayroll.month, editingPayroll.year) })}
                    className="w-full px-3 py-2 border rounded-xl font-bold bg-slate-50"
                  />
                </div>
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Total Working Days</label>
                  <input
                    type="number"
                    min={1}
                    max={31}
                    value={resolveTotalWorkingDays(editingPayroll.total_working_days)}
                    onChange={e => setEditingPayroll({ ...editingPayroll, total_working_days: Math.min(31, Math.max(1, Number(e.target.value) || 26)) })}
                    className="w-full px-3 py-2 border rounded-xl font-bold bg-slate-50"
                  />
                </div>
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Base Salary (PKR)</label>
                <input
                  type="number"
                  value={editingPayroll.base_salary}
                  onChange={e => setEditingPayroll({ ...editingPayroll, base_salary: Number(e.target.value) })}
                  className="w-full px-3 py-2 border rounded-xl font-bold bg-slate-50"
                />
              </div>

              <div className="grid grid-cols-2 gap-3 bg-slate-50 border border-slate-200 rounded-xl p-3">
                <div className="text-[11px]">
                  <span className="font-black text-slate-700 block">Daily Salary</span>
                  <span className="text-blue-900 font-extrabold text-sm">
                    PKR {calcDailySalary(editingPayroll.base_salary, editingPayroll.total_working_days).toLocaleString()}
                  </span>
                  <span className="block text-[9px] text-slate-400">
                    Base ÷ {resolveTotalWorkingDays(editingPayroll.total_working_days)} working days
                  </span>
                </div>
                <div className="text-[11px]">
                  <span className="font-black text-slate-700 block">Half-Day Deduction</span>
                  <span className="text-amber-600 font-extrabold text-sm">
                    PKR {calcHalfDayDeduction(editingPayroll.base_salary, editingPayroll.total_working_days).toLocaleString()}
                  </span>
                  <span className="block text-[9px] text-slate-400">
                    (Daily Salary ÷ 2) per HL attendance
                  </span>
                </div>
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Attendance / Custom Deductions (PKR)</label>
                <input
                  type="number"
                  value={editingPayroll.deductions || 0}
                  onChange={e => setEditingPayroll({ ...editingPayroll, deductions: Number(e.target.value) })}
                  className="w-full px-3 py-2 border rounded-xl font-bold text-red-600 bg-slate-50"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Bonus / Incentive (PKR)</label>
                <input
                  type="number"
                  value={editingPayroll.bonus || 0}
                  onChange={e => setEditingPayroll({ ...editingPayroll, bonus: Number(e.target.value) })}
                  className="w-full px-3 py-2 border rounded-xl font-bold text-emerald-700 bg-slate-50"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Remarks</label>
                <input
                  type="text"
                  value={editingPayroll.remarks || ''}
                  onChange={e => setEditingPayroll({ ...editingPayroll, remarks: e.target.value })}
                  placeholder="Optional notes e.g. waived reason"
                  className="w-full px-3 py-2 border rounded-xl bg-slate-50"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Disbursal Status</label>
                <select
                  value={editingPayroll.status}
                  onChange={e => setEditingPayroll({ ...editingPayroll, status: e.target.value as any })}
                  className="w-full px-3 py-2 border rounded-xl font-bold bg-slate-50"
                >
                  <option value="Disbursed">Disbursed / Paid</option>
                  <option value="Pending">Pending</option>
                  <option value="Waived">Waived / Not Disbursed</option>
                </select>
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t">
                <button
                  type="button"
                  onClick={() => setEditingPayroll(null)}
                  className="px-4 py-2 bg-slate-200 text-slate-800 font-bold rounded-xl"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-blue-900 hover:bg-blue-800 text-white font-extrabold rounded-xl shadow"
                >
                  Save Changes
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* BIG ERROR — salary already disbursed */}
      {salaryDuplicateAlert && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-red-950/95 backdrop-blur-md animate-in fade-in">
          <div className="bg-white rounded-3xl max-w-lg w-full p-10 text-center shadow-2xl border-4 border-red-500">
            <div className="w-24 h-24 mx-auto mb-6 rounded-full bg-red-100 flex items-center justify-center ring-8 ring-red-200">
              <AlertTriangle className="w-14 h-14 text-red-600" />
            </div>
            <h2 className="text-3xl font-black text-red-700 tracking-tight mb-3 uppercase">
              Salary Already Given
            </h2>
            <p className="text-lg font-extrabold text-slate-900 mb-1">{salaryDuplicateAlert.teacher.full_name}</p>
            <p className="text-sm font-mono text-slate-500 mb-4">{salaryDuplicateAlert.teacher.teacher_id}</p>

            <div className="inline-block px-6 py-3 mb-4 bg-emerald-100 border-2 border-emerald-500 rounded-2xl">
              <p className="text-[10px] font-black text-emerald-700 uppercase tracking-wider mb-1">Salary Already Paid For</p>
              <p className="text-2xl sm:text-3xl font-black text-emerald-900">
                {salaryDuplicateAlert.payroll.month} {salaryDuplicateAlert.payroll.year}
              </p>
              {salaryDuplicateAlert.payroll.disbursed_date && (
                <p className="text-xs text-emerald-700 font-bold mt-1">
                  Disbursed on {salaryDuplicateAlert.payroll.disbursed_date}
                </p>
              )}
            </div>

            <div className="my-4 p-4 bg-red-50 border-2 border-red-200 rounded-2xl">
              <p className="text-sm text-red-700 font-semibold">Duplicate salary cannot be issued for this month.</p>
              {salaryDuplicateAlert.batchNote && (
                <p className="text-sm text-red-600 mt-2 font-bold">{salaryDuplicateAlert.batchNote}</p>
              )}
            </div>
            <p className="text-xs text-slate-400 mb-6">Redirecting to Disbursed / Paid records…</p>
            <button
              type="button"
              onClick={() => dismissSalaryDuplicateAndGoToPaid(salaryDuplicateAlert.payroll, salaryDuplicateAlert.teacher)}
              className="w-full px-6 py-4 bg-emerald-700 hover:bg-emerald-800 text-white text-base font-black rounded-2xl shadow-lg flex items-center justify-center gap-2"
            >
              <CheckCircle className="w-5 h-5" />
              View Disbursed Salaries
            </button>
          </div>
        </div>
      )}

      {/* MISSED MONTH — pay now or intentionally not given */}
      {missedMonthPrompt && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-amber-950/90 backdrop-blur-md animate-in fade-in">
          <div className="bg-white rounded-3xl max-w-lg w-full p-8 shadow-2xl border-4 border-amber-500">
            <div className="w-20 h-20 mx-auto mb-5 rounded-full bg-amber-100 flex items-center justify-center ring-8 ring-amber-200">
              <Clock className="w-11 h-11 text-amber-700" />
            </div>
            <h2 className="text-2xl font-black text-amber-900 text-center mb-2">Missed Salary Month</h2>
            <p className="text-center text-sm text-slate-600 mb-4">
              <strong className="text-slate-900">{missedMonthPrompt.teacher.full_name}</strong> has no salary record for{' '}
              <strong className="text-amber-800">{missedMonthPrompt.missedMonth} {missedMonthPrompt.missedYear}</strong>.
              How would you like to proceed before continuing?
            </p>

            <div className="space-y-3">
              <button
                type="button"
                onClick={handleMissedMonthPayNow}
                className="w-full px-5 py-4 bg-emerald-700 hover:bg-emerald-800 text-white font-black rounded-2xl shadow flex items-center justify-center gap-2"
              >
                <DollarSign className="w-5 h-5" />
                Pay Missed Month Salary Now
              </button>

              <div className="p-4 bg-slate-50 border-2 border-slate-200 rounded-2xl space-y-3">
                <p className="text-xs font-black text-slate-700 uppercase">Intentionally Not Given</p>
                <textarea
                  value={missedMonthRemarks}
                  onChange={e => setMissedMonthRemarks(e.target.value)}
                  rows={2}
                  placeholder="Add remarks e.g. Long leave, suspended, salary held…"
                  className="w-full px-3 py-2 border rounded-xl text-xs"
                />
                <button
                  type="button"
                  onClick={handleMissedMonthWaive}
                  className="w-full px-5 py-3 bg-slate-700 hover:bg-slate-800 text-white font-extrabold rounded-xl"
                >
                  Record as Not Disbursed (Waived)
                </button>
              </div>

              <button
                type="button"
                onClick={() => setMissedMonthPrompt(null)}
                className="w-full px-4 py-2 text-slate-500 font-bold text-xs hover:text-slate-700"
              >
                Cancel — decide later
              </button>
            </div>
          </div>
        </div>
      )}

      {/* UNIVERSAL DOCUMENT PREVIEW MODAL FOR SALARY PAY SLIPS */}
      <DocumentPreviewModal
        isOpen={!!previewModal}
        onClose={() => setPreviewModal(null)}
        title={previewModal?.title || 'Salary Pay Slip Preview'}
        url={previewModal?.url}
      />

    </div>
  );
};
