import { FeeLedger, ScheduledInstallment } from '../types';

const MONTH_MAP: Record<string, string> = {
  January: '01', February: '02', March: '03', April: '04',
  May: '05', June: '06', July: '07', August: '08',
  September: '09', October: '10', November: '11', December: '12'
};

export function monthNameToNumber(month: string): string {
  return MONTH_MAP[month] || '01';
}

export function defaultDueDateForMonth(month: string, year: number, day = 10): string {
  const mm = monthNameToNumber(month);
  return `${year}-${mm}-${String(day).padStart(2, '0')}`;
}

export function formatDueDateLabel(dueDate?: string): string {
  if (!dueDate) return 'Not set';
  try {
    return new Date(dueDate + 'T00:00:00').toLocaleDateString('en-PK', {
      day: 'numeric', month: 'short', year: 'numeric'
    });
  } catch {
    return dueDate;
  }
}

export function buildScheduledInstallments(
  count: 2 | 3,
  netFee: number,
  dueDates: string[]
): ScheduledInstallment[] {
  const baseAmount = Math.floor(netFee / count);
  const installments: ScheduledInstallment[] = [];
  let allocated = 0;

  for (let i = 0; i < count; i++) {
    const isLast = i === count - 1;
    const amount = isLast ? netFee - allocated : baseAmount;
    allocated += amount;
    const suffix = i === 0 ? 'st' : i === 1 ? 'nd' : 'rd';
    installments.push({
      id: `sched-${Date.now()}-${i}`,
      label: `${i + 1}${suffix} Installment`,
      amount,
      due_date: dueDates[i] || dueDates[dueDates.length - 1] || new Date().toISOString().slice(0, 10),
      status: 'Pending'
    });
  }
  return installments;
}

export function reconcileScheduledInstallments(
  installments: ScheduledInstallment[],
  today: string
): ScheduledInstallment[] {
  return installments.map(inst => {
    if (inst.status === 'Paid') return inst;
    if (inst.due_date && inst.due_date < today) {
      return { ...inst, status: 'Overdue' as const };
    }
    if (inst.status === 'Overdue' && inst.due_date && inst.due_date >= today) {
      return { ...inst, status: 'Pending' as const };
    }
    return inst;
  });
}

export function reconcileFeeOverdueStatus(fee: FeeLedger): FeeLedger {
  const today = new Date().toISOString().slice(0, 10);
  const remaining = Math.max(0, fee.net_fee - (fee.paid_amount || 0));

  let updated: FeeLedger = { ...fee };

  if (updated.scheduled_installments?.length) {
    updated = {
      ...updated,
      scheduled_installments: reconcileScheduledInstallments(updated.scheduled_installments, today)
    };
  }

  if (remaining <= 0) {
    return {
      ...updated,
      status: 'Paid',
      paid_amount: updated.net_fee,
      scheduled_installments: updated.scheduled_installments?.map(inst => ({
        ...inst,
        status: 'Paid' as const,
        paid_date: inst.paid_date || today
      }))
    };
  }

  const mainOverdue = Boolean(updated.due_date && updated.due_date < today);
  const installmentOverdue = updated.scheduled_installments?.some(
    inst => inst.status === 'Overdue'
  );

  if (updated.paid_amount > 0) {
    updated.status = (mainOverdue || installmentOverdue) ? 'Overdue' : 'Partial';
  } else if (mainOverdue || installmentOverdue) {
    updated.status = 'Overdue';
  } else if (updated.status === 'Overdue') {
    updated.status = 'Unpaid';
  }

  return updated;
}

export function reconcileAllFees(fees: FeeLedger[]): FeeLedger[] {
  return fees.map(reconcileFeeOverdueStatus);
}

export function applyPaymentToScheduledInstallments(
  fee: FeeLedger,
  paymentId: string,
  paymentDate: string,
  paymentAmount: number
): ScheduledInstallment[] | undefined {
  if (!fee.scheduled_installments?.length) return fee.scheduled_installments;

  const updated = [...fee.scheduled_installments];
  let remaining = paymentAmount;

  for (let i = 0; i < updated.length && remaining > 0; i++) {
    const inst = updated[i];
    if (inst.status === 'Paid') continue;
    if (remaining >= inst.amount || i === updated.length - 1) {
      updated[i] = {
        ...inst,
        status: 'Paid',
        paid_date: paymentDate,
        linked_payment_id: paymentId
      };
      remaining -= inst.amount;
    }
  }

  return updated;
}

export function feesNeedReconciliation(current: FeeLedger[], reconciled: FeeLedger[]): boolean {
  return JSON.stringify(current) !== JSON.stringify(reconciled);
}

export function findExistingFeeVoucher(
  fees: FeeLedger[],
  studentId: string,
  month: string,
  year: number,
  feeCategory?: string
): FeeLedger | undefined {
  const targetCategory = feeCategory || 'Monthly Tuition';
  return fees.find(f => {
    if (f.student_id !== studentId || f.month !== month || f.year !== year) return false;
    const existingCategory = f.fee_category || 'Monthly Tuition';
    return existingCategory === targetCategory;
  });
}

const FEE_STATUS_RANK: Record<string, number> = {
  Paid: 4,
  Partial: 3,
  Overdue: 2,
  Unpaid: 1
};

/** One voucher per student + month + year + category (prefer Paid / highest progress). */
export function dedupeFeeVouchers(fees: FeeLedger[]): FeeLedger[] {
  const map = new Map<string, FeeLedger>();

  for (const fee of fees) {
    const key = `${fee.student_id}|${fee.month}|${fee.year}|${fee.fee_category || 'Monthly Tuition'}`;
    const existing = map.get(key);
    if (!existing) {
      map.set(key, fee);
      continue;
    }

    const rankExisting = FEE_STATUS_RANK[existing.status] || 0;
    const rankFee = FEE_STATUS_RANK[fee.status] || 0;
    let winner = existing;

    if (rankFee > rankExisting) {
      winner = fee;
    } else if (rankFee === rankExisting) {
      if ((fee.paid_amount || 0) > (existing.paid_amount || 0)) {
        winner = fee;
      } else if ((fee.paid_amount || 0) === (existing.paid_amount || 0) && fee.id > existing.id) {
        winner = fee;
      }
    }

    map.set(key, winner);
  }

  return Array.from(map.values());
}

export function isFeeFullyPaid(fee: FeeLedger): boolean {
  return fee.status === 'Paid' || (fee.paid_amount >= fee.net_fee && fee.net_fee >= 0);
}
