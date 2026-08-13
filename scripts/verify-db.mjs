/**
 * End-to-end database save/fetch verification.
 * Run: node scripts/verify-db.mjs
 */

const BASE = process.env.API_BASE || 'http://localhost:3000';

async function get(path) {
  const res = await fetch(`${BASE}${path}`, { signal: AbortSignal.timeout(90000) });
  if (!res.ok) throw new Error(`${path} → ${res.status}`);
  return res.json();
}

async function post(path, body) {
  const res = await fetch(`${BASE}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(120000)
  });
  if (!res.ok) throw new Error(`${path} → ${res.status}`);
  return res.json();
}

function syncPayload(data) {
  return {
    students: data.students,
    teachers: data.teachers,
    fees: data.fees,
    payrolls: data.payrolls,
    examResults: data.examResults,
    customFields: data.customFields,
    expenses: data.expenses,
    emailTemplates: data.emailTemplates,
    studentAttendance: data.studentAttendance,
    teacherAttendance: data.teacherAttendance,
    schoolFeeSettings: data.schoolFeeSettings,
    siteBranding: data.siteBranding,
    emailLogs: data.emailLogs
  };
}

console.log('=== DATABASE SAVE / FETCH VERIFICATION ===\n');

const health = await get('/api/db/health');
console.log(`Health: ok=${health.ok} supabase=${health.supabase} overflow=${health.supabaseOverflow} mongodb=${health.mongodb}`);

const schema = await get('/api/db/schema-status');
console.log(`Schema: ${schema.readyCount}/${schema.totalCount} tables ready`);

const t0 = Date.now();
const all = await get('/api/db/all');
const fetchMs = Date.now() - t0;
const d = all.data;
const counts = all.counts || {
  students: d.students?.length ?? 0,
  teachers: d.teachers?.length ?? 0,
  fees: d.fees?.length ?? 0,
  payrolls: d.payrolls?.length ?? 0,
  examResults: d.examResults?.length ?? 0,
  expenses: d.expenses?.length ?? 0,
  customFields: d.customFields?.length ?? 0
};
console.log(`Fetch: ${fetchMs}ms (server ${all.loadMs ?? '?'}ms) connected=${all.connected}`);
console.log(`Records: students=${counts.students} teachers=${counts.teachers} fees=${counts.fees} payrolls=${counts.payrolls} examResults=${counts.examResults} expenses=${counts.expenses} customFields=${counts.customFields}`);

const cf = await get('/api/custom-fields/verify');
console.log(`Custom fields verify: ${cf.writeReadOk ? 'PASS' : 'FAIL'}`);

const ts = Date.now();
const probeStudent = {
  id: `verify-std-${ts}`,
  full_name: 'DB Verify Student',
  roll_no: 'VERIFY-001',
  class_name: '1',
  enrollment_date: '2026-08-12',
  gender: 'Other',
  created_at: new Date().toISOString()
};
const saveData = { ...d, students: [...(d.students || []), probeStudent] };
const sync1 = await post('/api/db/sync', syncPayload(saveData));
console.log(`Save sync: success=${sync1.success} supabase=${sync1.supabase} mongodb=${sync1.mongodb}${sync1.errors?.length ? ` errors=${sync1.errors.join(';')}` : ''}`);

await new Promise(r => setTimeout(r, 2000));

const all2 = await get('/api/db/all');
const found = (all2.data.students || []).find(s => s.id === probeStudent.id);
console.log(`Fetch after save: ${found ? 'PASS (probe student found)' : 'FAIL (probe missing)'}`);

const cleanData = { ...all2.data, students: (all2.data.students || []).filter(s => s.id !== probeStudent.id) };
const sync2 = await post('/api/db/sync', syncPayload(cleanData));
console.log(`Cleanup sync: success=${sync2.success}`);

const all3 = await get('/api/db/all');
const stillThere = (all3.data.students || []).some(s => s.id === probeStudent.id);
console.log(`Fetch after delete: ${stillThere ? 'FAIL (probe still present)' : 'PASS (probe removed)'}`);

const allOk =
  health.ok &&
  health.supabase &&
  health.mongodb &&
  schema.allReady &&
  all.connected &&
  sync1.success &&
  sync1.supabase &&
  found &&
  sync2.success &&
  !stillThere &&
  cf.writeReadOk;

console.log(`\n=== RESULT: ${allOk ? 'ALL PASS ✓' : 'SOME CHECKS FAILED ✗'} ===`);
process.exit(allOk ? 0 : 1);
