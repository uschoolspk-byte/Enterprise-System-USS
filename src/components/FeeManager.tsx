import React, { useState, useEffect, useRef } from 'react';
import { 
  CreditCard, 
  AlertTriangle, 
  Mail, 
  CheckCircle2, 
  DollarSign, 
  Plus, 
  Send, 
  Sparkles,
  FileSpreadsheet,
  Search,
  Edit3,
  Trash2,
  Clock,
  Check,
  X,
  Receipt,
  Printer,
  Calendar,
  Filter,
  Eye,
  Loader2
} from 'lucide-react';
import { Student, FeeLedger, InstallmentRecord, DynamicCustomField, SchoolFeeSettings, SchoolBankAccount } from '../types';
import { generateFeeVoucherPDF } from '../lib/pdfGenerator';
import { DocumentPreviewModal } from './DocumentPreviewModal';
import { DynamicFieldSection, validateDynamicFieldValues } from './DynamicFieldSection';
import {
  defaultDueDateForMonth,
  buildScheduledInstallments,
  applyPaymentToScheduledInstallments,
  formatDueDateLabel,
  reconcileFeeOverdueStatus,
  findExistingFeeVoucher,
  isFeeFullyPaid
} from '../lib/feeUtils';

interface FeeManagerProps {
  students: Student[];
  fees: FeeLedger[];
  schoolFeeSettings: SchoolFeeSettings;
  onUpdateSchoolFeeSettings: (settings: SchoolFeeSettings) => void;
  onSaveFees: (fees: FeeLedger[]) => void;
  onUpdateFeeStatus: (feeId: string, status: 'Paid' | 'Partial' | 'Overdue', paidAmount: number) => void;
  onUpdateFee?: (updatedFee: FeeLedger) => void;
  onDeleteFee?: (feeId: string) => void;
  customFields: DynamicCustomField[];
  onAddCustomField: (field: DynamicCustomField) => void;
  onUpdateCustomField: (field: DynamicCustomField) => void;
  onDeleteCustomField: (fieldId: string) => void;
  onReorderCustomFields: (orderedIds: string[]) => void;
}

export const FeeManager: React.FC<FeeManagerProps> = ({
  students,
  fees,
  schoolFeeSettings,
  onUpdateSchoolFeeSettings,
  onSaveFees,
  onUpdateFeeStatus,
  onUpdateFee,
  onDeleteFee,
  customFields,
  onAddCustomField,
  onUpdateCustomField,
  onDeleteCustomField,
  onReorderCustomFields
}) => {
  // Month & Year Selector for Batch Invoice Generation
  const [targetMonth, setTargetMonth] = useState('August');
  const [targetYear, setTargetYear] = useState(2026);
  const [baseTuitionFee, setBaseTuitionFee] = useState(8500);
  const [batchDueDate, setBatchDueDate] = useState(defaultDueDateForMonth('August', 2026, 10));

  // School bank account settings panel
  const [showBankSettings, setShowBankSettings] = useState(false);
  const [paymentInstructions, setPaymentInstructions] = useState(schoolFeeSettings.payment_instructions || '');

  // Filter & Search State
  const [viewTab, setViewTab] = useState<'defaulters' | 'partial' | 'paid' | 'all'>('defaulters');
  const [searchTerm, setSearchTerm] = useState('');
  const [classFilter, setClassFilter] = useState('All');
  const [monthYearFilter, setMonthYearFilter] = useState<{ month: string; year: number } | null>(null);

  // Installment Payment Modal State
  const [installmentModalFee, setInstallmentModalFee] = useState<FeeLedger | null>(null);
  const [paymentAmount, setPaymentAmount] = useState<number>(3000);
  const [paymentMode, setPaymentMode] = useState<'Cash' | 'Bank Transfer' | 'Cheque' | 'Online'>('Cash');
  const [receiptNo, setReceiptNo] = useState<string>(`REC-${Date.now().toString().slice(-6)}`);
  const [installmentNotes, setInstallmentNotes] = useState<string>('Installment received at counter');
  const [paymentDate, setPaymentDate] = useState<string>(new Date().toISOString().slice(0, 10));

  // Installment History Drawer / Modal
  const [historyFee, setHistoryFee] = useState<FeeLedger | null>(null);

  // Add Custom Voucher Modal State
  const [isAddVoucherOpen, setIsAddVoucherOpen] = useState(false);
  const [newVoucherStudentId, setNewVoucherStudentId] = useState(students[0]?.id || '');
  const [newVoucherCategory, setNewVoucherCategory] = useState('Monthly Tuition');
  const [newVoucherMonth, setNewVoucherMonth] = useState('August');
  const [newVoucherYear, setNewVoucherYear] = useState(2026);
  const [newVoucherTuition, setNewVoucherTuition] = useState(8500);
  const [newVoucherLab, setNewVoucherLab] = useState(0);
  const [newVoucherCustom, setNewVoucherCustom] = useState(0);
  const [newVoucherDiscount, setNewVoucherDiscount] = useState(0);
  const [newVoucherDueDate, setNewVoucherDueDate] = useState('2026-08-15');
  const [newVoucherPaymentPlan, setNewVoucherPaymentPlan] = useState<'Full' | 'Installments_2' | 'Installments_3'>('Full');
  const [installmentDueDates, setInstallmentDueDates] = useState<string[]>(['2026-08-15', '2026-09-15', '2026-10-15']);
  const [newVoucherCustomFields, setNewVoucherCustomFields] = useState<Record<string, any>>({});

  // Edit Fee Voucher Modal State
  const [editingFee, setEditingFee] = useState<FeeLedger | null>(null);

  // Toast State & Dispatch State
  const [toastMsg, setToastMsg] = useState<string | null>(null);
  const [dispatchingId, setDispatchingId] = useState<string | null>(null);

  // Fee Challan Preview Modal State
  const [previewModal, setPreviewModal] = useState<{ title: string; url: string } | null>(null);

  // Big error when fee already paid — hides voucher form and redirects to paid tab
  const [paidDuplicateAlert, setPaidDuplicateAlert] = useState<{
    student: Student;
    fee: FeeLedger;
    batchNote?: string;
  } | null>(null);
  const paidRedirectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    setBatchDueDate(defaultDueDateForMonth(targetMonth, targetYear, 10));
  }, [targetMonth, targetYear]);

  useEffect(() => {
    return () => {
      if (paidRedirectTimerRef.current) clearTimeout(paidRedirectTimerRef.current);
    };
  }, []);

  const navigateToExistingFee = (existing: FeeLedger, student: Student) => {
    setMonthYearFilter({ month: existing.month, year: existing.year });
    setSearchTerm(student.roll_no);
    setClassFilter('All');

    if (isFeeFullyPaid(existing)) {
      setViewTab('paid');
    } else if (existing.status === 'Partial') {
      setViewTab('partial');
    } else {
      setViewTab('defaulters');
    }
  };

  const dismissPaidDuplicateAndGoToPaid = (existing: FeeLedger, student: Student) => {
    if (paidRedirectTimerRef.current) {
      clearTimeout(paidRedirectTimerRef.current);
      paidRedirectTimerRef.current = null;
    }
    setPaidDuplicateAlert(null);
    navigateToExistingFee(existing, student);
  };

  const showPaidDuplicateError = (
    existing: FeeLedger,
    student: Student,
    batchNote?: string
  ) => {
    setIsAddVoucherOpen(false);
    setNewVoucherCustomFields({});
    setPaidDuplicateAlert({ student, fee: existing, batchNote });

    if (paidRedirectTimerRef.current) clearTimeout(paidRedirectTimerRef.current);
    paidRedirectTimerRef.current = setTimeout(() => {
      dismissPaidDuplicateAndGoToPaid(existing, student);
    }, 3200);
  };

  // Generate Invoices for All Active Students
  const handleGenerateInvoices = () => {
    const dueDate = batchDueDate || defaultDueDateForMonth(targetMonth, targetYear, 10);
    const newInvoices: FeeLedger[] = [];
    let skippedPaidCount = 0;
    let skippedExistingCount = 0;

    for (const student of students) {
      const existing = findExistingFeeVoucher(fees, student.id, targetMonth, targetYear);
      if (existing) {
        if (isFeeFullyPaid(existing)) skippedPaidCount++;
        else skippedExistingCount++;
        continue;
      }

      const netFee = student.is_orphan ? 0 : baseTuitionFee;
      newInvoices.push({
        id: 'fee-' + Date.now() + '-' + student.id,
        student_id: student.id,
        month: targetMonth,
        year: targetYear,
        tuition_fee: baseTuitionFee,
        discount_scholarship: student.is_orphan ? baseTuitionFee : 0,
        net_fee: netFee,
        paid_amount: 0,
        status: student.is_orphan ? 'Paid' : 'Unpaid',
        due_date: dueDate,
        payment_plan: 'Full',
        installments: [],
        created_at: new Date().toISOString()
      });
    }

    if (newInvoices.length > 0) {
      onSaveFees(newInvoices.map(reconcileFeeOverdueStatus));
    }

    setMonthYearFilter({ month: targetMonth, year: targetYear });

    if (newInvoices.length === 0 && skippedPaidCount > 0) {
      const firstPaidStudent = students.find(s => {
        const ex = findExistingFeeVoucher(fees, s.id, targetMonth, targetYear);
        return ex && isFeeFullyPaid(ex);
      });
      if (firstPaidStudent) {
        const existing = findExistingFeeVoucher(fees, firstPaidStudent.id, targetMonth, targetYear)!;
        showPaidDuplicateError(
          existing,
          firstPaidStudent,
          skippedPaidCount === 1
            ? undefined
            : `All ${skippedPaidCount} students already have PAID vouchers for ${targetMonth} ${targetYear}.`
        );
      }
    } else if (skippedPaidCount > 0) {
      setViewTab('all');
      setSearchTerm('');
      setToastMsg(`Created ${newInvoices.length} new vouchers. ${skippedPaidCount} student(s) already paid for ${targetMonth} ${targetYear} — check Fully Paid tab.`);
    } else if (newInvoices.length === 0 && skippedExistingCount > 0) {
      setViewTab('all');
      setToastMsg(`${skippedExistingCount} voucher(s) already issued for ${targetMonth} ${targetYear}. No duplicates created.`);
    } else {
      setViewTab('all');
      setToastMsg(`SUCCESS: Batch generated ${newInvoices.length} fee vouchers for ${targetMonth} ${targetYear}!`);
    }

    setTimeout(() => setToastMsg(null), 5000);
  };

  // Add Single Custom Voucher
  const handleCreateCustomVoucher = (e: React.FormEvent) => {
    e.preventDefault();
    const student = students.find(s => s.id === newVoucherStudentId);
    if (!student) return;

    const existing = findExistingFeeVoucher(
      fees,
      student.id,
      newVoucherMonth,
      newVoucherYear,
      newVoucherCategory
    );
    if (existing) {
      setIsAddVoucherOpen(false);
      setNewVoucherCustomFields({});
      if (isFeeFullyPaid(existing)) {
        showPaidDuplicateError(existing, student);
      } else {
        navigateToExistingFee(existing, student);
        setToastMsg(`${student.full_name}: A ${newVoucherMonth} ${newVoucherYear} voucher already exists (${existing.status}). No duplicate created.`);
        setTimeout(() => setToastMsg(null), 5000);
      }
      return;
    }

    const financialFields = customFields.filter(f => f.target === 'financial');
    const fieldValidationError = validateDynamicFieldValues(financialFields, newVoucherCustomFields);
    if (fieldValidationError) {
      setToastMsg(fieldValidationError);
      setTimeout(() => setToastMsg(null), 4000);
      return;
    }

    const netFee = Math.max(0, (newVoucherTuition + newVoucherLab + newVoucherCustom) - newVoucherDiscount);
    const scheduledInstallments = newVoucherPaymentPlan === 'Installments_2'
      ? buildScheduledInstallments(2, netFee, installmentDueDates.slice(0, 2))
      : newVoucherPaymentPlan === 'Installments_3'
        ? buildScheduledInstallments(3, netFee, installmentDueDates.slice(0, 3))
        : undefined;

    const newVoucher: FeeLedger = {
      id: 'fee-custom-' + Date.now(),
      student_id: student.id,
      fee_category: newVoucherCategory,
      month: newVoucherMonth,
      year: newVoucherYear,
      tuition_fee: newVoucherTuition,
      lab_charges: newVoucherLab,
      custom_charges: newVoucherCustom,
      discount: newVoucherDiscount,
      net_fee: netFee,
      paid_amount: 0,
      status: 'Unpaid',
      due_date: newVoucherDueDate,
      payment_plan: newVoucherPaymentPlan,
      scheduled_installments: scheduledInstallments,
      installments: [],
      custom_fields: newVoucherCustomFields,
      created_at: new Date().toISOString()
    };

    onSaveFees([reconcileFeeOverdueStatus(newVoucher)]);
    setIsAddVoucherOpen(false);
    setNewVoucherCustomFields({});
    setToastMsg(`SUCCESS: Created custom fee voucher (${newVoucherCategory}) for ${student.full_name}!`);
    setTimeout(() => setToastMsg(null), 4000);
  };

  // Submit Installment Payment
  const handleReceiveInstallment = (e: React.FormEvent) => {
    e.preventDefault();
    if (!installmentModalFee) return;

    const existingInstallments = installmentModalFee.installments || [];
    const newInstallment: InstallmentRecord = {
      id: 'inst-' + Date.now(),
      date: paymentDate,
      amount: paymentAmount,
      payment_mode: paymentMode,
      receipt_no: receiptNo,
      notes: installmentNotes,
      received_by: 'Admin Office'
    };

    const updatedInstallments = [...existingInstallments, newInstallment];
    const newPaidAmount = (installmentModalFee.paid_amount || 0) + paymentAmount;
    
    let newStatus: 'Paid' | 'Partial' | 'Overdue' | 'Unpaid' = 'Unpaid';
    if (newPaidAmount >= installmentModalFee.net_fee) {
      newStatus = 'Paid';
    } else if (newPaidAmount > 0) {
      newStatus = 'Partial';
    }

    const updatedScheduled = applyPaymentToScheduledInstallments(
      installmentModalFee,
      newInstallment.id,
      paymentDate,
      paymentAmount
    );

    const updatedFee: FeeLedger = reconcileFeeOverdueStatus({
      ...installmentModalFee,
      paid_amount: newPaidAmount,
      status: newStatus,
      payment_date: paymentDate,
      installments: updatedInstallments,
      scheduled_installments: updatedScheduled
    });

    if (onUpdateFee) {
      onUpdateFee(updatedFee);
    } else {
      onUpdateFeeStatus(installmentModalFee.id, newStatus, newPaidAmount);
    }

    const student = students.find(s => s.id === installmentModalFee.student_id);
    setInstallmentModalFee(null);
    setToastMsg(`SUCCESS: Recorded installment payment of PKR ${paymentAmount.toLocaleString()} for ${student?.full_name || 'Student'}. Remaining: PKR ${Math.max(0, installmentModalFee.net_fee - newPaidAmount).toLocaleString()}`);
    setTimeout(() => setToastMsg(null), 5000);
  };

  // Submit Edit Fee Voucher
  const handleSaveEditFee = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingFee) return;

    const financialFields = customFields.filter(f => f.target === 'financial');
    const fieldValidationError = validateDynamicFieldValues(financialFields, editingFee.custom_fields || {});
    if (fieldValidationError) {
      setToastMsg(fieldValidationError);
      setTimeout(() => setToastMsg(null), 4000);
      return;
    }

    const netFee = Math.max(0, (editingFee.tuition_fee + (editingFee.lab_charges || 0) + (editingFee.custom_charges || 0)) - ((editingFee.discount || 0) + (editingFee.discount_scholarship || 0)));
    let updated: FeeLedger = {
      ...editingFee,
      net_fee: netFee
    };

    if (updated.status === 'Paid') {
      updated.paid_amount = netFee;
      updated.payment_date = updated.payment_date || new Date().toISOString().slice(0, 10);
    }

    updated = reconcileFeeOverdueStatus(updated);

    if (onUpdateFee) {
      onUpdateFee(updated);
    }
    setEditingFee(null);
    setToastMsg(`Updated fee voucher for ID ${editingFee.id}`);
    setTimeout(() => setToastMsg(null), 3000);
  };

  // Mark voucher as fully paid
  const handleMarkAsPaid = (fee: FeeLedger) => {
    const student = students.find(s => s.id === fee.student_id);
    const today = new Date().toISOString().slice(0, 10);
    const updatedFee: FeeLedger = reconcileFeeOverdueStatus({
      ...fee,
      paid_amount: fee.net_fee,
      status: 'Paid',
      payment_date: today,
      scheduled_installments: fee.scheduled_installments?.map(inst => ({
        ...inst,
        status: 'Paid' as const,
        paid_date: inst.paid_date || today
      }))
    });

    if (onUpdateFee) {
      onUpdateFee(updatedFee);
    } else {
      onUpdateFeeStatus(fee.id, 'Paid', fee.net_fee);
    }

    setToastMsg(`SUCCESS: Marked fee voucher as PAID for ${student?.full_name || 'Student'}.`);
    setTimeout(() => setToastMsg(null), 4000);
  };

  const buildVoucherPdf = (student: Student, fee: FeeLedger) =>
    generateFeeVoucherPDF(student, fee, schoolFeeSettings);

  const voucherFilename = (student: Student, fee: FeeLedger) =>
    `Fee_Voucher_${student.roll_no}_${fee.month}_${fee.year}.pdf`.replace(/\s+/g, '_');

  const handleDownloadVoucher = (student: Student, fee: FeeLedger) => {
    const doc = buildVoucherPdf(student, fee);
    doc.save(voucherFilename(student, fee));
    setToastMsg(`Downloaded fee voucher for ${student.full_name}.`);
    setTimeout(() => setToastMsg(null), 3000);
  };

  // Send official fee voucher PDF via email
  const handleSendFeeVoucher = async (fee: FeeLedger) => {
    const student = students.find(s => s.id === fee.student_id);
    if (!student) return;

    setDispatchingId(fee.id);
    setToastMsg(`Generating voucher PDF & dispatching to ${student.is_orphan ? 'donor' : 'guardian'}...`);

    try {
      const doc = buildVoucherPdf(student, fee);
      const pdfBase64 = doc.output('datauristring');
      const remaining = Math.max(0, fee.net_fee - (fee.paid_amount || 0));

      const res = await fetch('/api/email/dispatch-fee-reminder', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          student,
          feeMonth: `${fee.month} ${fee.year}`,
          amountDue: remaining,
          dueDate: fee.due_date,
          isVoucher: true,
          pdfBase64,
          attachmentFilename: voucherFilename(student, fee)
        })
      });

      const data = await res.json();
      setDispatchingId(null);

      if (data.success) {
        const sentAt = new Date().toISOString();
        const updatedFee = { ...fee, voucher_sent_at: sentAt };
        if (onUpdateFee) onUpdateFee(updatedFee);
        setToastMsg(`SUCCESS: Fee voucher emailed to ${data.recipientEmail} (${data.recipientType}: ${data.recipientName})`);
      } else {
        setToastMsg(`Email Dispatch Result: ${data.message}`);
      }
    } catch (err: any) {
      setDispatchingId(null);
      setToastMsg(`Brevo Dispatch Error: ${err.message || 'Server connection error'}`);
    }
    setTimeout(() => setToastMsg(null), 5000);
  };

  // Dispatch Brevo SMTP Fee Reminder Email (text reminder, optional)
  const handleSendFeeReminder = async (fee: FeeLedger) => {
    const student = students.find(s => s.id === fee.student_id);
    if (!student) return;

    setDispatchingId(fee.id);
    setToastMsg(`Dispatching Brevo SMTP Fee Reminder for ${student.full_name}...`);

    try {
      const res = await fetch('/api/email/dispatch-fee-reminder', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          student,
          feeMonth: `${fee.month} ${fee.year}`,
          amountDue: fee.net_fee - fee.paid_amount,
          dueDate: fee.due_date
        })
      });

      const data = await res.json();
      setDispatchingId(null);

      if (data.success) {
        setToastMsg(`SUCCESS: Fee Reminder dispatched via Brevo SMTP to ${data.recipientEmail} (${data.recipientType}: ${data.recipientName})`);
      } else {
        setToastMsg(`Email Dispatch Result: ${data.message}`);
      }
    } catch (err: any) {
      setDispatchingId(null);
      setToastMsg(`Brevo Dispatch Error: ${err.message || 'Server connection error'}`);
    }
    setTimeout(() => setToastMsg(null), 5000);
  };

  const handleSaveBankSettings = () => {
    onUpdateSchoolFeeSettings({
      ...schoolFeeSettings,
      payment_instructions: paymentInstructions
    });
    setToastMsg('School bank account settings saved.');
    setTimeout(() => setToastMsg(null), 3000);
  };

  const handleAddBankAccount = () => {
    const newAccount: SchoolBankAccount = {
      id: 'bank-' + Date.now(),
      bank_name: '',
      account_title: 'Unique School System',
      account_number: '',
      iban: '',
      branch: ''
    };
    onUpdateSchoolFeeSettings({
      ...schoolFeeSettings,
      bank_accounts: [...schoolFeeSettings.bank_accounts, newAccount]
    });
  };

  const handleUpdateBankAccount = (id: string, patch: Partial<SchoolBankAccount>) => {
    onUpdateSchoolFeeSettings({
      ...schoolFeeSettings,
      bank_accounts: schoolFeeSettings.bank_accounts.map(acct =>
        acct.id === id ? { ...acct, ...patch } : acct
      )
    });
  };

  const handleRemoveBankAccount = (id: string) => {
    onUpdateSchoolFeeSettings({
      ...schoolFeeSettings,
      bank_accounts: schoolFeeSettings.bank_accounts.filter(acct => acct.id !== id)
    });
  };

  // Filtered Fee Records
  const allClasses = Array.from(new Set(students.map(s => s.class_name)));

  const filteredFees = fees.filter(fee => {
    const student = students.find(s => s.id === fee.student_id);
    if (!student) return false;

    const matchesSearch = student.full_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                          student.roll_no.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesClass = classFilter === 'All' || student.class_name === classFilter;
    const matchesMonthYear = !monthYearFilter
      || (fee.month === monthYearFilter.month && fee.year === monthYearFilter.year);

    let matchesTab = true;
    if (viewTab === 'defaulters') matchesTab = fee.status === 'Overdue' || fee.status === 'Partial' || fee.status === 'Unpaid';
    else if (viewTab === 'partial') matchesTab = fee.status === 'Partial';
    else if (viewTab === 'paid') matchesTab = fee.status === 'Paid';

    return matchesSearch && matchesClass && matchesMonthYear && matchesTab;
  });

  const defaulterCount = fees.filter(f => f.status === 'Overdue' || f.status === 'Partial' || f.status === 'Unpaid').length;
  const partialCount = fees.filter(f => f.status === 'Partial').length;

  return (
    <div className="max-w-7xl mx-auto p-4 sm:p-6 space-y-6">
      
      {/* Toast Alert */}
      {toastMsg && (
        <div className="p-4 rounded-xl bg-blue-900 text-white font-bold flex items-center justify-between shadow-2xl animate-in slide-in-from-top border border-blue-700 z-[100]">
          <div className="flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-amber-400" />
            <span>{toastMsg}</span>
          </div>
        </div>
      )}

      {/* Header & Automated Billing Engine Bar */}
      <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-xl space-y-4">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b pb-4">
          <div>
            <div className="flex items-center gap-2">
              <CreditCard className="w-6 h-6 text-blue-900" />
              <h2 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight">
                Fee Manager & Installment Tracking Console
              </h2>
            </div>
            <p className="text-xs text-slate-500 mt-1">
              Full CRUD management: Issue custom vouchers, receive installments, set reminders & track partial payments.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <select
              value={targetMonth}
              onChange={e => setTargetMonth(e.target.value)}
              className="px-3 py-2 rounded-xl border border-slate-300 text-xs font-bold bg-slate-50"
            >
              {['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'].map(m => (
                <option key={m} value={m}>{m}</option>
              ))}
            </select>

            <input 
              type="number"
              value={targetYear}
              onChange={e => setTargetYear(Number(e.target.value))}
              className="w-20 px-3 py-2 rounded-xl border border-slate-300 text-xs font-bold bg-slate-50"
            />

            <input
              type="date"
              value={batchDueDate}
              onChange={e => setBatchDueDate(e.target.value)}
              title="Due date for batch vouchers"
              className="px-3 py-2 rounded-xl border border-slate-300 text-xs font-bold bg-amber-50"
            />

            <input
              type="number"
              value={baseTuitionFee}
              onChange={e => setBaseTuitionFee(Number(e.target.value))}
              title="Base tuition fee"
              className="w-24 px-3 py-2 rounded-xl border border-slate-300 text-xs font-bold bg-slate-50"
            />

            <button
              onClick={() => {
                setBatchDueDate(defaultDueDateForMonth(targetMonth, targetYear, 10));
              }}
              className="px-2 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-[10px] font-bold rounded-xl"
              title="Reset due date to 10th of selected month"
            >
              Auto Due
            </button>

            <button
              onClick={handleGenerateInvoices}
              className="px-3.5 py-2 bg-blue-900 hover:bg-blue-800 text-white text-xs font-extrabold rounded-xl shadow flex items-center gap-1.5 transition-all"
            >
              <Plus className="w-4 h-4 text-amber-400" />
              Batch Issue Monthly Vouchers
            </button>

            <button
              onClick={() => setIsAddVoucherOpen(true)}
              className="px-3.5 py-2 bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-extrabold rounded-xl shadow flex items-center gap-1.5 transition-all"
            >
              <Plus className="w-4 h-4 text-emerald-200" />
              + Custom Fee Voucher
            </button>

            <button
              onClick={() => {
                setShowBankSettings(!showBankSettings);
                setPaymentInstructions(schoolFeeSettings.payment_instructions || '');
              }}
              className="px-3.5 py-2 bg-slate-800 hover:bg-slate-900 text-white text-xs font-extrabold rounded-xl shadow flex items-center gap-1.5"
            >
              <CreditCard className="w-4 h-4" />
              Bank Accounts
            </button>
          </div>
        </div>

        {showBankSettings && (
          <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200 space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-black text-slate-900">School Fee Deposit Accounts</h3>
              <button
                onClick={handleAddBankAccount}
                className="px-3 py-1.5 bg-blue-900 text-white text-xs font-bold rounded-lg flex items-center gap-1"
              >
                <Plus className="w-3.5 h-3.5" /> Add Account
              </button>
            </div>

            {schoolFeeSettings.bank_accounts.map(acct => (
              <div key={acct.id} className="grid grid-cols-1 md:grid-cols-6 gap-2 p-3 bg-white rounded-xl border text-xs">
                <input
                  placeholder="Bank Name"
                  value={acct.bank_name}
                  onChange={e => handleUpdateBankAccount(acct.id, { bank_name: e.target.value })}
                  className="px-2 py-1.5 border rounded-lg font-bold"
                />
                <input
                  placeholder="Account Title"
                  value={acct.account_title}
                  onChange={e => handleUpdateBankAccount(acct.id, { account_title: e.target.value })}
                  className="px-2 py-1.5 border rounded-lg"
                />
                <input
                  placeholder="Account Number"
                  value={acct.account_number}
                  onChange={e => handleUpdateBankAccount(acct.id, { account_number: e.target.value })}
                  className="px-2 py-1.5 border rounded-lg font-mono"
                />
                <input
                  placeholder="IBAN"
                  value={acct.iban || ''}
                  onChange={e => handleUpdateBankAccount(acct.id, { iban: e.target.value })}
                  className="px-2 py-1.5 border rounded-lg font-mono"
                />
                <input
                  placeholder="Branch"
                  value={acct.branch || ''}
                  onChange={e => handleUpdateBankAccount(acct.id, { branch: e.target.value })}
                  className="px-2 py-1.5 border rounded-lg"
                />
                <button
                  onClick={() => handleRemoveBankAccount(acct.id)}
                  className="px-2 py-1.5 bg-red-50 text-red-700 font-bold rounded-lg hover:bg-red-100"
                >
                  Remove
                </button>
              </div>
            ))}

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">Payment Instructions (shown on PDF voucher)</label>
              <textarea
                value={paymentInstructions}
                onChange={e => setPaymentInstructions(e.target.value)}
                rows={2}
                className="w-full px-3 py-2 border rounded-xl text-xs"
                placeholder="e.g. Mention student roll number in transfer reference..."
              />
            </div>

            <button
              onClick={handleSaveBankSettings}
              className="px-4 py-2 bg-blue-900 text-white text-xs font-extrabold rounded-xl"
            >
              Save Bank Settings
            </button>
          </div>
        )}

        {/* View Switcher & Filters */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
          <div className="flex space-x-1.5 overflow-x-auto pb-1 sm:pb-0 items-center">
            <button
              onClick={() => { setMonthYearFilter(null); setViewTab('defaulters'); }}
              className={`px-3.5 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 ${
                viewTab === 'defaulters' ? 'bg-red-600 text-white shadow-lg' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
              }`}
            >
              <AlertTriangle className="w-4 h-4" />
              Defaulters & Overdue ({defaulterCount})
            </button>

            <button
              onClick={() => { setMonthYearFilter(null); setViewTab('partial'); }}
              className={`px-3.5 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 ${
                viewTab === 'partial' ? 'bg-amber-600 text-white shadow-lg' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
              }`}
            >
              <Clock className="w-4 h-4" />
              Installment Plans ({partialCount})
            </button>

            <button
              onClick={() => { setMonthYearFilter(null); setViewTab('paid'); }}
              className={`px-3.5 py-2 rounded-xl text-xs font-bold transition-all ${
                viewTab === 'paid' ? 'bg-emerald-700 text-white shadow-lg' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
              }`}
            >
              Fully Paid
            </button>

            <button
              onClick={() => { setMonthYearFilter(null); setViewTab('all'); }}
              className={`px-3.5 py-2 rounded-xl text-xs font-bold transition-all ${
                viewTab === 'all' ? 'bg-blue-900 text-white shadow-lg' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
              }`}
            >
              All Issued Vouchers ({fees.length})
            </button>

            {monthYearFilter && (
              <span className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-blue-100 text-blue-900 text-[10px] font-bold border border-blue-200">
                {monthYearFilter.month} {monthYearFilter.year}
                <button
                  type="button"
                  onClick={() => setMonthYearFilter(null)}
                  className="hover:text-blue-700"
                  title="Clear month filter"
                >
                  <X className="w-3 h-3" />
                </button>
              </span>
            )}
          </div>

          <div className="flex items-center gap-2">
            <div className="relative flex-1 sm:w-60">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-2.5" />
              <input
                type="text"
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                placeholder="Search Student or Roll No..."
                className="w-full pl-8 pr-3 py-1.5 rounded-xl border border-slate-300 text-xs font-medium"
              />
            </div>

            <select
              value={classFilter}
              onChange={e => setClassFilter(e.target.value)}
              className="px-3 py-1.5 rounded-xl border border-slate-300 text-xs font-bold bg-slate-50"
            >
              <option value="All">All Classes</option>
              {allClasses.map(c => (
                <option key={c} value={c}>Class {c}</option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Main Fee Ledger Table */}
      <div className="bg-white rounded-3xl border border-slate-200 shadow-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-900 text-white text-[11px] font-black uppercase tracking-wider">
                <th className="p-3">Student Roll & Name</th>
                <th className="p-3">Class</th>
                <th className="p-3">Category & Month</th>
                <th className="p-3">Total Net Fee</th>
                <th className="p-3">Paid / Installments</th>
                <th className="p-3">Remaining Balance</th>
                <th className="p-3">Due Date</th>
                <th className="p-3">Status</th>
                <th className="p-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 text-xs text-slate-800">
              {filteredFees.map(fee => {
                const student = students.find(s => s.id === fee.student_id);
                if (!student) return null;

                const remaining = Math.max(0, fee.net_fee - (fee.paid_amount || 0));
                const installmentCount = fee.installments?.length || 0;

                return (
                  <tr key={fee.id} className="hover:bg-slate-50 transition-all">
                    <td className="p-3 font-bold">
                      <div className="font-mono text-blue-900">{student.roll_no}</div>
                      <div className="text-slate-900">{student.full_name}</div>
                    </td>
                    <td className="p-3 font-bold">Class {student.class_name}</td>
                    <td className="p-3 font-semibold text-slate-600">
                      <div>{fee.fee_category || 'Monthly Tuition'}</div>
                      <div className="text-[10px] text-slate-400 font-mono">{fee.month} {fee.year}</div>
                    </td>
                    <td className="p-3 font-extrabold text-slate-900">
                      PKR {fee.net_fee.toLocaleString()}
                    </td>
                    <td className="p-3">
                      <div className="font-extrabold text-emerald-800">
                        PKR {(fee.paid_amount || 0).toLocaleString()}
                      </div>
                      {installmentCount > 0 && (
                        <button
                          onClick={() => setHistoryFee(fee)}
                          className="text-[10px] text-blue-800 font-bold hover:underline flex items-center gap-1 mt-0.5"
                        >
                          <Receipt className="w-3 h-3" />
                          {installmentCount} Installment{installmentCount > 1 ? 's' : ''} Paid
                        </button>
                      )}
                    </td>

                    <td className="p-3 font-extrabold text-red-700">
                      PKR {remaining.toLocaleString()}
                    </td>

                    <td className="p-3">
                      <div className={`font-bold text-[11px] ${fee.due_date && fee.due_date < new Date().toISOString().slice(0, 10) && fee.status !== 'Paid' ? 'text-red-700' : 'text-slate-700'}`}>
                        {formatDueDateLabel(fee.due_date)}
                      </div>
                      {fee.scheduled_installments && fee.scheduled_installments.length > 0 && (
                        <div className="text-[10px] text-amber-800 mt-0.5">
                          {fee.scheduled_installments.filter(i => i.status !== 'Paid').length} installment(s) pending
                        </div>
                      )}
                      {fee.voucher_sent_at && (
                        <div className="text-[10px] text-blue-700 mt-0.5 flex items-center gap-0.5">
                          <Send className="w-3 h-3" /> Voucher sent
                        </div>
                      )}
                    </td>

                    <td className="p-3">
                      <span className={`px-2.5 py-1 rounded-full font-extrabold text-[10px] uppercase ${
                        fee.status === 'Paid' ? 'bg-emerald-100 text-emerald-800 border border-emerald-300' :
                        fee.status === 'Partial' ? 'bg-amber-100 text-amber-900 border border-amber-300' :
                        fee.status === 'Unpaid' ? 'bg-slate-100 text-slate-800 border border-slate-300' :
                        'bg-red-100 text-red-800 border border-red-300'
                      }`}>
                        {fee.status === 'Partial' ? 'Installments' : fee.status}
                      </span>
                    </td>

                    <td className="p-3 text-right">
                      <div className="flex items-center justify-end gap-1.5 flex-wrap">
                        <button
                          onClick={() => {
                            const doc = buildVoucherPdf(student, fee);
                            const url = doc.output('datauristring');
                            setPreviewModal({
                              title: `Fee Voucher — ${student.full_name} (${fee.month} ${fee.year})`,
                              url
                            });
                          }}
                          className="p-1.5 bg-blue-100 text-blue-900 hover:bg-blue-200 rounded-xl transition-all"
                          title="Preview Fee Voucher PDF"
                        >
                          <Eye className="w-3.5 h-3.5" />
                        </button>

                        <button
                          onClick={() => handleDownloadVoucher(student, fee)}
                          className="p-1.5 bg-indigo-100 text-indigo-900 hover:bg-indigo-200 rounded-xl transition-all"
                          title="Download Fee Voucher PDF"
                        >
                          <Printer className="w-3.5 h-3.5" />
                        </button>

                        {fee.status !== 'Paid' && (
                          <button
                            disabled={dispatchingId === fee.id}
                            onClick={() => handleSendFeeVoucher(fee)}
                            className="p-1.5 bg-purple-100 text-purple-900 hover:bg-purple-200 font-bold rounded-xl shadow-sm transition-all disabled:opacity-50 flex items-center justify-center"
                            title="Email Official Fee Voucher with PDF"
                          >
                            {dispatchingId === fee.id ? (
                              <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            ) : (
                              <Send className="w-3.5 h-3.5" />
                            )}
                          </button>
                        )}

                        {fee.status !== 'Paid' && (
                          <button
                            onClick={() => handleMarkAsPaid(fee)}
                            className="p-1.5 bg-emerald-100 text-emerald-900 hover:bg-emerald-200 rounded-xl transition-all"
                            title="Mark as Fully Paid"
                          >
                            <CheckCircle2 className="w-3.5 h-3.5" />
                          </button>
                        )}

                        {fee.status !== 'Paid' && (
                          <button
                            onClick={() => {
                              setInstallmentModalFee(fee);
                              setPaymentAmount(remaining > 0 ? remaining : 3000);
                              setReceiptNo(`REC-${Date.now().toString().slice(-6)}`);
                            }}
                            className="px-3 py-1.5 bg-emerald-700 hover:bg-emerald-800 text-white font-extrabold text-xs rounded-xl shadow flex items-center gap-1 transition-all active:scale-95"
                          >
                            <DollarSign className="w-3.5 h-3.5 text-amber-300" />
                            + Installment
                          </button>
                        )}

                        {fee.status !== 'Paid' && (
                          <button
                            disabled={dispatchingId === fee.id}
                            onClick={() => handleSendFeeReminder(fee)}
                            className="p-1.5 bg-red-100 text-red-800 hover:bg-red-200 font-bold rounded-xl shadow-sm transition-all disabled:opacity-50 flex items-center justify-center"
                            title="Send Text Reminder (no PDF)"
                          >
                            {dispatchingId === fee.id ? (
                              <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            ) : (
                              <Mail className="w-3.5 h-3.5" />
                            )}
                          </button>
                        )}

                        <button
                          onClick={() => setEditingFee(fee)}
                          className="p-1.5 bg-slate-100 text-slate-700 hover:bg-slate-200 rounded-xl"
                          title="Edit Fee Voucher"
                        >
                          <Edit3 className="w-3.5 h-3.5" />
                        </button>

                        {onDeleteFee && (
                          <button
                            onClick={() => {
                              if (confirm('Delete this fee voucher record?')) {
                                onDeleteFee(fee.id);
                                setToastMsg('Fee voucher deleted');
                                setTimeout(() => setToastMsg(null), 3000);
                              }
                            }}
                            className="p-1.5 bg-red-50 text-red-600 hover:bg-red-100 rounded-xl"
                            title="Delete Fee Voucher"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* RECEIVE INSTALLMENT PAYMENT MODAL */}
      {installmentModalFee && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-slate-900/80 backdrop-blur-sm animate-in fade-in">
          <div className="bg-white rounded-3xl max-w-lg w-full p-6 space-y-4 shadow-2xl border border-slate-200">
            <div className="flex justify-between items-center border-b pb-3">
              <div>
                <h3 className="text-base font-black text-slate-900 flex items-center gap-2">
                  <DollarSign className="w-5 h-5 text-emerald-600" />
                  Receive Fee / Installment Payment
                </h3>
                <p className="text-xs text-slate-500">
                  {students.find(s => s.id === installmentModalFee.student_id)?.full_name} ({students.find(s => s.id === installmentModalFee.student_id)?.roll_no})
                </p>
              </div>
              <button onClick={() => setInstallmentModalFee(null)} className="text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-3 bg-slate-50 rounded-2xl border text-xs grid grid-cols-3 gap-2 text-center">
              <div>
                <span className="block text-slate-400 font-bold">Total Net Fee</span>
                <span className="font-extrabold text-slate-900">PKR {installmentModalFee.net_fee.toLocaleString()}</span>
              </div>
              <div>
                <span className="block text-slate-400 font-bold">Already Paid</span>
                <span className="font-extrabold text-emerald-700">PKR {(installmentModalFee.paid_amount || 0).toLocaleString()}</span>
              </div>
              <div>
                <span className="block text-slate-400 font-bold">Remaining</span>
                <span className="font-extrabold text-red-700">PKR {Math.max(0, installmentModalFee.net_fee - (installmentModalFee.paid_amount || 0)).toLocaleString()}</span>
              </div>
            </div>

            <form onSubmit={handleReceiveInstallment} className="space-y-4 text-xs">
              <div>
                <label className="block font-extrabold text-slate-800 mb-1">Installment Amount Received (PKR) *</label>
                <input
                  type="number"
                  required
                  min={1}
                  value={paymentAmount}
                  onChange={e => setPaymentAmount(Number(e.target.value))}
                  className="w-full px-3.5 py-2.5 rounded-xl border-2 border-emerald-600 text-base font-black text-emerald-900 bg-emerald-50/30"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Payment Method</label>
                  <select
                    value={paymentMode}
                    onChange={e => setPaymentMode(e.target.value as any)}
                    className="w-full px-3 py-2 border rounded-xl font-bold bg-slate-50"
                  >
                    <option value="Cash">Cash</option>
                    <option value="Bank Transfer">Bank Transfer</option>
                    <option value="Online">Online / EasyPaisa</option>
                    <option value="Cheque">Cheque</option>
                  </select>
                </div>

                <div>
                  <label className="block font-bold text-slate-700 mb-1">Receipt / Ref Number</label>
                  <input
                    type="text"
                    required
                    value={receiptNo}
                    onChange={e => setReceiptNo(e.target.value)}
                    className="w-full px-3 py-2 border rounded-xl font-mono bg-slate-50"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Payment Date</label>
                  <input
                    type="date"
                    required
                    value={paymentDate}
                    onChange={e => setPaymentDate(e.target.value)}
                    className="w-full px-3 py-2 border rounded-xl font-semibold bg-slate-50"
                  />
                </div>

                <div>
                  <label className="block font-bold text-slate-700 mb-1">Admin Notes / Remarks</label>
                  <input
                    type="text"
                    value={installmentNotes}
                    onChange={e => setInstallmentNotes(e.target.value)}
                    placeholder="e.g. 1st Installment paid in cash"
                    className="w-full px-3 py-2 border rounded-xl bg-slate-50"
                  />
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t">
                <button
                  type="button"
                  onClick={() => setInstallmentModalFee(null)}
                  className="px-4 py-2 bg-slate-200 text-slate-800 font-bold rounded-xl"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-6 py-2.5 bg-emerald-700 hover:bg-emerald-800 text-white font-extrabold rounded-xl shadow-lg flex items-center gap-1.5"
                >
                  <CheckCircle2 className="w-4 h-4 text-amber-300" />
                  Save Installment Payment
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* INSTALLMENT HISTORY DRAWER MODAL */}
      {historyFee && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-slate-900/80 backdrop-blur-sm animate-in fade-in">
          <div className="bg-white rounded-3xl max-w-xl w-full p-6 space-y-4 shadow-2xl border border-slate-200">
            <div className="flex justify-between items-center border-b pb-3">
              <div>
                <h3 className="text-base font-black text-slate-900 flex items-center gap-2">
                  <Receipt className="w-5 h-5 text-blue-900" />
                  Installment Payment Breakdown
                </h3>
                <p className="text-xs text-slate-500">
                  {students.find(s => s.id === historyFee.student_id)?.full_name} ({historyFee.month} {historyFee.year})
                </p>
              </div>
              <button onClick={() => setHistoryFee(null)} className="text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-3 max-h-60 overflow-y-auto">
              {historyFee.scheduled_installments && historyFee.scheduled_installments.length > 0 && (
                <div className="space-y-2">
                  <p className="text-[10px] font-black text-slate-500 uppercase">Scheduled Installment Plan</p>
                  {historyFee.scheduled_installments.map((inst, idx) => (
                    <div key={inst.id || `sched-${idx}`} className="p-3 bg-amber-50 border border-amber-200 rounded-2xl flex justify-between items-center text-xs">
                      <div>
                        <span className="font-extrabold text-slate-900 block">{inst.label} — PKR {inst.amount.toLocaleString()}</span>
                        <span className="text-[10px] text-slate-500">Due: {formatDueDateLabel(inst.due_date)}</span>
                      </div>
                      <span className={`px-2 py-1 font-bold rounded text-[10px] ${
                        inst.status === 'Paid' ? 'bg-emerald-100 text-emerald-800' :
                        inst.status === 'Overdue' ? 'bg-red-100 text-red-800' :
                        'bg-slate-100 text-slate-700'
                      }`}>
                        {inst.status.toUpperCase()}
                      </span>
                    </div>
                  ))}
                </div>
              )}

              {historyFee.installments && historyFee.installments.length > 0 ? (
                historyFee.installments.map((inst, idx) => (
                  <div key={inst.id || idx} className="p-3 bg-slate-50 border rounded-2xl flex justify-between items-center text-xs">
                    <div>
                      <span className="font-extrabold text-slate-900 block">Installment #{idx + 1} — PKR {inst.amount.toLocaleString()}</span>
                      <span className="text-[10px] text-slate-500">Date: {inst.date} | Mode: {inst.payment_mode} | Ref: {inst.receipt_no}</span>
                      {inst.notes && <p className="text-[10px] text-blue-900 italic mt-0.5">{inst.notes}</p>}
                    </div>
                    <span className="px-2 py-1 bg-emerald-100 text-emerald-800 font-bold rounded text-[10px]">
                      PAID
                    </span>
                  </div>
                ))
              ) : (
                <p className="text-xs text-slate-400 italic text-center py-4">No installment records found.</p>
              )}
            </div>

            <div className="flex justify-between items-center pt-3 border-t text-xs">
              <div>
                Total Paid: <strong className="text-emerald-800 font-extrabold">PKR {(historyFee.paid_amount || 0).toLocaleString()}</strong>
              </div>
              <button
                onClick={() => setHistoryFee(null)}
                className="px-5 py-2 bg-slate-900 text-white font-bold rounded-xl"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* CREATE CUSTOM FEE VOUCHER MODAL */}
      {isAddVoucherOpen && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-slate-900/80 backdrop-blur-sm animate-in fade-in">
          <div className="bg-white rounded-3xl max-w-lg w-full p-6 space-y-4 shadow-2xl border border-slate-200">
            <div className="flex justify-between items-center border-b pb-3">
              <h3 className="text-base font-black text-slate-900 flex items-center gap-2">
                <Plus className="w-5 h-5 text-blue-900" />
                Issue Custom Fee Voucher
              </h3>
              <button onClick={() => setIsAddVoucherOpen(false)} className="text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateCustomVoucher} className="space-y-4 text-xs">
              <div>
                <label className="block font-bold text-slate-700 mb-1">Select Student *</label>
                <select
                  value={newVoucherStudentId}
                  onChange={e => setNewVoucherStudentId(e.target.value)}
                  className="w-full px-3 py-2 border rounded-xl font-bold bg-slate-50"
                >
                  {students.map(s => (
                    <option key={s.id} value={s.id}>{s.roll_no} - {s.full_name} (Class {s.class_name})</option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Fee Category</label>
                  <select
                    value={newVoucherCategory}
                    onChange={e => setNewVoucherCategory(e.target.value)}
                    className="w-full px-3 py-2 border rounded-xl font-semibold bg-slate-50"
                  >
                    <option value="Monthly Tuition">Monthly Tuition</option>
                    <option value="Admission Fee">Admission Fee</option>
                    <option value="Exam Fee">Exam Fee</option>
                    <option value="Transport Charges">Transport Charges</option>
                    <option value="Late Fine">Late Fine</option>
                    <option value="Custom Voucher">Custom Voucher</option>
                  </select>
                </div>

                <div>
                  <label className="block font-bold text-slate-700 mb-1">Billing Month / Year</label>
                  <div className="flex gap-1">
                    <select
                      value={newVoucherMonth}
                      onChange={e => setNewVoucherMonth(e.target.value)}
                      className="w-2/3 px-2 py-2 border rounded-xl text-xs font-bold bg-slate-50"
                    >
                      {['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'].map(m => (
                        <option key={m} value={m}>{m}</option>
                      ))}
                    </select>
                    <input
                      type="number"
                      value={newVoucherYear}
                      onChange={e => setNewVoucherYear(Number(e.target.value))}
                      className="w-1/3 px-2 py-2 border rounded-xl text-xs font-bold bg-slate-50"
                    />
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Tuition / Base Amount (PKR)</label>
                  <input
                    type="number"
                    value={newVoucherTuition}
                    onChange={e => setNewVoucherTuition(Number(e.target.value))}
                    className="w-full px-3 py-2 border rounded-xl font-bold bg-slate-50"
                  />
                </div>

                <div>
                  <label className="block font-bold text-slate-700 mb-1">Discount (PKR)</label>
                  <input
                    type="number"
                    value={newVoucherDiscount}
                    onChange={e => setNewVoucherDiscount(Number(e.target.value))}
                    className="w-full px-3 py-2 border rounded-xl font-bold text-red-600 bg-slate-50"
                  />
                </div>
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Due Date</label>
                <input
                  type="date"
                  value={newVoucherDueDate}
                  onChange={e => setNewVoucherDueDate(e.target.value)}
                  className="w-full px-3 py-2 border rounded-xl font-semibold bg-slate-50"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Payment Plan</label>
                <select
                  value={newVoucherPaymentPlan}
                  onChange={e => setNewVoucherPaymentPlan(e.target.value as 'Full' | 'Installments_2' | 'Installments_3')}
                  className="w-full px-3 py-2 border rounded-xl font-bold bg-slate-50"
                >
                  <option value="Full">Full Payment (single due date)</option>
                  <option value="Installments_2">2 Installments</option>
                  <option value="Installments_3">3 Installments</option>
                </select>
              </div>

              {newVoucherPaymentPlan !== 'Full' && (
                <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl space-y-2">
                  <p className="text-[10px] font-black text-amber-900 uppercase">Installment Due Dates</p>
                  {(newVoucherPaymentPlan === 'Installments_2' ? [0, 1] : [0, 1, 2]).map(idx => (
                    <div key={idx} className="flex items-center gap-2">
                      <span className="text-xs font-bold w-28">{idx + 1}{idx === 0 ? 'st' : idx === 1 ? 'nd' : 'rd'} Installment</span>
                      <input
                        type="date"
                        value={installmentDueDates[idx]}
                        onChange={e => {
                          const next = [...installmentDueDates];
                          next[idx] = e.target.value;
                          setInstallmentDueDates(next);
                        }}
                        className="flex-1 px-2 py-1.5 border rounded-lg text-xs font-semibold"
                      />
                    </div>
                  ))}
                </div>
              )}

              <DynamicFieldSection
                target="financial"
                customFields={customFields}
                onAddCustomField={onAddCustomField}
                onUpdateCustomField={onUpdateCustomField}
                onDeleteCustomField={onDeleteCustomField}
                onReorderCustomFields={onReorderCustomFields}
                values={newVoucherCustomFields}
                onValuesChange={setNewVoucherCustomFields}
                sectionTitle="Custom Fee Fields"
                onNotify={msg => {
                  setToastMsg(msg);
                  setTimeout(() => setToastMsg(null), 3000);
                }}
              />

              <div className="flex justify-end gap-2 pt-2 border-t">
                <button
                  type="button"
                  onClick={() => setIsAddVoucherOpen(false)}
                  className="px-4 py-2 bg-slate-200 text-slate-800 font-bold rounded-xl"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-6 py-2 bg-blue-900 hover:bg-blue-800 text-white font-extrabold rounded-xl shadow"
                >
                  Create Fee Voucher
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* EDIT FEE VOUCHER MODAL */}
      {editingFee && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-slate-900/80 backdrop-blur-sm animate-in fade-in">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 space-y-4 shadow-2xl border border-slate-200">
            <div className="flex justify-between items-center border-b pb-3">
              <h3 className="text-base font-black text-slate-900">
                Edit Fee Voucher Record
              </h3>
              <button onClick={() => setEditingFee(null)} className="text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveEditFee} className="space-y-4 text-xs">
              <div>
                <label className="block font-bold text-slate-700 mb-1">Tuition Fee (PKR)</label>
                <input
                  type="number"
                  value={editingFee.tuition_fee}
                  onChange={e => setEditingFee({ ...editingFee, tuition_fee: Number(e.target.value) })}
                  className="w-full px-3 py-2 border rounded-xl font-bold bg-slate-50"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Discount (PKR)</label>
                <input
                  type="number"
                  value={editingFee.discount || 0}
                  onChange={e => setEditingFee({ ...editingFee, discount: Number(e.target.value) })}
                  className="w-full px-3 py-2 border rounded-xl font-bold bg-slate-50"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Due Date</label>
                <input
                  type="date"
                  value={editingFee.due_date || ''}
                  onChange={e => setEditingFee({ ...editingFee, due_date: e.target.value })}
                  className="w-full px-3 py-2 border rounded-xl font-semibold bg-slate-50"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Fee Status</label>
                <select
                  value={editingFee.status}
                  onChange={e => setEditingFee({ ...editingFee, status: e.target.value as any })}
                  className="w-full px-3 py-2 border rounded-xl font-bold bg-slate-50"
                >
                  <option value="Unpaid">Unpaid</option>
                  <option value="Overdue">Overdue</option>
                  <option value="Partial">Partial / Installment</option>
                  <option value="Paid">Paid</option>
                </select>
              </div>

              <DynamicFieldSection
                target="financial"
                customFields={customFields}
                onAddCustomField={onAddCustomField}
                onUpdateCustomField={onUpdateCustomField}
                onDeleteCustomField={onDeleteCustomField}
                onReorderCustomFields={onReorderCustomFields}
                values={editingFee.custom_fields || {}}
                onValuesChange={vals => setEditingFee({ ...editingFee, custom_fields: vals })}
                sectionTitle="Custom Fee Fields"
                onNotify={msg => {
                  setToastMsg(msg);
                  setTimeout(() => setToastMsg(null), 3000);
                }}
              />

              <div className="flex justify-end gap-2 pt-2 border-t">
                <button
                  type="button"
                  onClick={() => setEditingFee(null)}
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

      {/* BIG ERROR — fee already paid (voucher form hidden, redirects to paid tab) */}
      {paidDuplicateAlert && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-red-950/95 backdrop-blur-md animate-in fade-in">
          <div className="bg-white rounded-3xl max-w-lg w-full p-10 text-center shadow-2xl border-4 border-red-500 animate-in zoom-in-95">
            <div className="w-24 h-24 mx-auto mb-6 rounded-full bg-red-100 flex items-center justify-center ring-8 ring-red-200">
              <AlertTriangle className="w-14 h-14 text-red-600" />
            </div>

            <h2 className="text-3xl sm:text-4xl font-black text-red-700 tracking-tight mb-3 uppercase">
              Fee Already Paid
            </h2>

            <p className="text-lg font-extrabold text-slate-900 mb-1">
              {paidDuplicateAlert.student.full_name}
            </p>
            <p className="text-sm font-mono text-slate-500 mb-2">
              {paidDuplicateAlert.student.roll_no} · Class {paidDuplicateAlert.student.class_name}
            </p>

            <div className="my-5 p-4 bg-red-50 border-2 border-red-200 rounded-2xl">
              <p className="text-base font-black text-red-800">
                {paidDuplicateAlert.fee.month} {paidDuplicateAlert.fee.year} fee voucher is already marked as{' '}
                <span className="uppercase">PAID</span>.
              </p>
              <p className="text-sm text-red-700 mt-2 font-semibold">
                You cannot issue a duplicate voucher for this period.
              </p>
              {paidDuplicateAlert.batchNote && (
                <p className="text-sm text-red-600 mt-2 font-bold">{paidDuplicateAlert.batchNote}</p>
              )}
            </div>

            <p className="text-xs text-slate-400 mb-6">
              Redirecting to Fully Paid fees in a moment…
            </p>

            <button
              type="button"
              onClick={() => dismissPaidDuplicateAndGoToPaid(paidDuplicateAlert.fee, paidDuplicateAlert.student)}
              className="w-full px-6 py-4 bg-emerald-700 hover:bg-emerald-800 text-white text-base font-black rounded-2xl shadow-lg flex items-center justify-center gap-2 transition-all active:scale-95"
            >
              <CheckCircle2 className="w-5 h-5" />
              Go to Paid Fees Now
            </button>
          </div>
        </div>
      )}

      {/* UNIVERSAL DOCUMENT PREVIEW MODAL FOR FEE CHALLANS */}
      <DocumentPreviewModal
        isOpen={!!previewModal}
        onClose={() => setPreviewModal(null)}
        title={previewModal?.title || 'Fee Voucher Preview'}
        url={previewModal?.url}
      />

    </div>
  );
};
