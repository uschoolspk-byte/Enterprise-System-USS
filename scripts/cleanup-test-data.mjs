/**
 * Remove E2E / debug / dummy records from Supabase + MongoDB via full sync.
 * Usage: node scripts/cleanup-test-data.mjs
 */
import 'dotenv/config';

const BASE = process.env.TEST_BASE || 'http://localhost:3000';
const TIMEOUT = 180_000;

const TEST_ID =
  /^(std|tch|fee|pay|exp|exm|tpl|sa|ta|cf|exam|res)-(c|e2e|test|debug|user|verify|manual)-|^(test-std-|std-tets-|fee-e2e-|pay-e2e-|pay-debug-|exp-e2e-|exm-e2e-|tpl-e2e-|tpl-c-|fee-c-|pay-c-|exp-c-|exm-c-|std-c-|tch-e2e-|cf-e2e-|cf-c-|cf-test-|cf-direct-|cf-mainsync-)/i;

function isTestId(id) {
  return TEST_ID.test(String(id || ''));
}

function isTestText(...parts) {
  const text = parts.filter(Boolean).join(' ').toLowerCase();
  return (
    text.includes('e2e') ||
    text.includes('consolidated test') ||
    text.includes('consolidated expense') ||
    text.includes('consolidated template') ||
    text.includes('consolidated cf') ||
    text.includes('debug teacher') ||
    text.includes('user added teacher') ||
    text.includes('test student') ||
    text.includes('test teacher') ||
    text.includes('test expense') ||
    text.includes('test exam') ||
    text.includes('test template') ||
    text.includes('test email') ||
    text.includes('module test') ||
    text.includes('sync all test') ||
    text.includes('__verify') ||
    text === 'tets' ||
    text.includes('unique school system') && text.includes('s-uss-101')
  );
}

function keepStudent(s) {
  if (isTestId(s.id)) return false;
  if (isTestText(s.full_name, s.roll_no)) return false;
  return true;
}

function keepTeacher(t) {
  if (isTestId(t.id)) return false;
  if (isTestText(t.full_name, t.teacher_id, t.email)) return false;
  return true;
}

function keepFee(f, studentIds) {
  if (isTestId(f.id)) return false;
  if (!studentIds.has(f.student_id)) return false;
  return true;
}

function keepPayroll(p, teacherIds) {
  if (isTestId(p.id)) return false;
  if (!teacherIds.has(p.teacher_id)) return false;
  return true;
}

function keepExpense(e) {
  if (isTestId(e.id)) return false;
  if (isTestText(e.description, e.title, e.category)) return false;
  return true;
}

function keepExam(r, studentIds) {
  if (isTestId(r.id)) return false;
  if (isTestText(r.exam_name, r.student_name)) return false;
  if (r.student_id && !studentIds.has(r.student_id)) return false;
  return true;
}

function keepTemplate(t) {
  if (isTestId(t.id)) return false;
  if (isTestText(t.name, t.subject)) return false;
  return true;
}

function keepCustomField(f) {
  if (isTestId(f.id)) return false;
  if (isTestText(f.fieldName)) return false;
  return true;
}

function keepStudentAttendance(a, studentIds) {
  if (isTestId(a.id)) return false;
  return studentIds.has(a.student_id);
}

function keepTeacherAttendance(a, teacherIds) {
  if (isTestId(a.id)) return false;
  return teacherIds.has(a.teacher_id);
}

async function main() {
  console.log('\n=== Cleanup test / dummy data ===\n');

  const res = await fetch(`${BASE}/api/db/all`, { signal: AbortSignal.timeout(TIMEOUT) });
  const all = await res.json();
  if (!all.data) throw new Error('Could not load /api/db/all');

  const d = all.data;
  const before = {
    students: d.students?.length ?? 0,
    teachers: d.teachers?.length ?? 0,
    fees: d.fees?.length ?? 0,
    payrolls: d.payrolls?.length ?? 0,
    expenses: d.expenses?.length ?? 0,
    examResults: d.examResults?.length ?? 0,
    emailTemplates: d.emailTemplates?.length ?? 0,
    customFields: d.customFields?.length ?? 0,
    studentAttendance: d.studentAttendance?.length ?? 0,
    teacherAttendance: d.teacherAttendance?.length ?? 0
  };

  const students = (d.students || []).filter(keepStudent);
  const teachers = (d.teachers || []).filter(keepTeacher);
  const studentIds = new Set(students.map(s => s.id));
  const teacherIds = new Set(teachers.map(t => t.id));

  const cleaned = {
    students,
    teachers,
    fees: (d.fees || []).filter(f => keepFee(f, studentIds)),
    payrolls: (d.payrolls || []).filter(p => keepPayroll(p, teacherIds)),
    expenses: (d.expenses || []).filter(keepExpense),
    examResults: (d.examResults || []).filter(r => keepExam(r, studentIds)),
    emailTemplates: (d.emailTemplates || []).filter(keepTemplate),
    customFields: (d.customFields || []).filter(keepCustomField),
    studentAttendance: (d.studentAttendance || []).filter(a => keepStudentAttendance(a, studentIds)),
    teacherAttendance: (d.teacherAttendance || []).filter(a => keepTeacherAttendance(a, teacherIds)),
    schoolFeeSettings: {
      ...(d.schoolFeeSettings || {}),
      payment_instructions: /e2e|consolidated fee/i.test(String(d.schoolFeeSettings?.payment_instructions || ''))
        ? 'Please deposit the fee amount via bank transfer or at the school accounts office. Mention student roll number in the transfer reference.'
        : d.schoolFeeSettings?.payment_instructions,
      updated_at: new Date().toISOString()
    },
    siteBranding: d.siteBranding,
    emailLogs: d.emailLogs,
    syncSequence: all.syncSequence ?? 0
  };

  const after = {
    students: cleaned.students.length,
    teachers: cleaned.teachers.length,
    fees: cleaned.fees.length,
    payrolls: cleaned.payrolls.length,
    expenses: cleaned.expenses.length,
    examResults: cleaned.examResults.length,
    emailTemplates: cleaned.emailTemplates.length,
    customFields: cleaned.customFields.length,
    studentAttendance: cleaned.studentAttendance.length,
    teacherAttendance: cleaned.teacherAttendance.length
  };

  console.log('Before → After:');
  for (const key of Object.keys(before)) {
    const removed = before[key] - after[key];
    console.log(`  ${key}: ${before[key]} → ${after[key]}${removed ? ` (−${removed})` : ''}`);
  }

  const syncRes = await fetch(`${BASE}/api/db/sync`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(cleaned),
    signal: AbortSignal.timeout(TIMEOUT)
  });
  const syncJson = await syncRes.json();

  if (!syncJson.success) {
    console.error('\nSync failed:', syncJson.errors || syncJson.error || syncJson);
    process.exit(1);
  }

  console.log('\nCleanup sync OK — seq', syncJson.syncSequence);
  console.log('Remaining students:', cleaned.students.map(s => `${s.full_name} (${s.roll_no})`).join(', ') || '(none)');
  console.log('Remaining teachers:', cleaned.teachers.map(t => t.full_name).join(', ') || '(none)');
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
