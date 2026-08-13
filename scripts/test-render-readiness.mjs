/**
 * Render deployment readiness — email + add/refresh persistence for all entities.
 * Run: node scripts/test-render-readiness.mjs
 */
import 'dotenv/config';

const BASE = process.env.API_BASE || 'http://localhost:3000';
const SYNC_TIMEOUT = 300_000;
const ts = Date.now();

let passed = 0;
let failed = 0;

function pass(name, detail = '') {
  passed++;
  console.log(`  PASS  ${name}${detail ? ` — ${detail}` : ''}`);
}

function fail(name, detail = '') {
  failed++;
  console.log(`  FAIL  ${name}${detail ? ` — ${detail}` : ''}`);
}

async function fetchAll() {
  const res = await fetch(`${BASE}/api/db/all`, { signal: AbortSignal.timeout(180000) });
  if (!res.ok) throw new Error(`fetchAll ${res.status}`);
  return res.json();
}

async function syncPatch(patch, seq) {
  const res = await fetch(`${BASE}/api/db/sync`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...patch, syncSequence: seq }),
    signal: AbortSignal.timeout(SYNC_TIMEOUT)
  });
  if (!res.ok) throw new Error(`sync ${res.status}`);
  return res.json();
}

async function testEntity(key, make, patch, check) {
  const all = await fetchAll();
  let seq = all.syncSequence ?? 0;
  const item = make(ts);
  const id = item.id;

  await syncPatch({ [key]: [...(all.data[key] || []), item] }, seq);
  await new Promise(r => setTimeout(r, 2000));

  const afterAdd = await fetchAll();
  seq = afterAdd.syncSequence ?? seq;
  const found = (afterAdd.data[key] || []).find(r => r.id === id);
  if (!found) {
    fail(`${key} add+fetch`, 'missing after add');
    return;
  }

  const updated = patch({ ...found });
  await syncPatch({ [key]: (afterAdd.data[key] || []).map(r => (r.id === id ? updated : r)) }, seq);
  await new Promise(r => setTimeout(r, 2000));

  const afterUpdate = await fetchAll();
  seq = afterUpdate.syncSequence ?? seq;
  const foundUpd = (afterUpdate.data[key] || []).find(r => r.id === id);
  if (!foundUpd || !check(foundUpd, updated)) {
    fail(`${key} update+fetch`, 'update not persisted');
    return;
  }

  const afterRefresh = await fetchAll();
  const stillThere = (afterRefresh.data[key] || []).find(r => r.id === id);
  if (!stillThere || !check(stillThere, updated)) {
    fail(`${key} refresh`, 'lost after second fetch');
    return;
  }

  await syncPatch({ [key]: (afterRefresh.data[key] || []).filter(r => r.id !== id) }, afterRefresh.syncSequence ?? seq);
  pass(`${key} add → update → refresh`, 'persisted');
}

console.log('\n=== Render Readiness Test ===\n');
console.log(`Base URL: ${BASE}\n`);

console.log('▸ Email (Brevo)');
try {
  const health = await fetch(`${BASE}/api/email/health`, { signal: AbortSignal.timeout(60000) }).then(r => r.json());
  if (health.success || health.ok) {
    pass('Email health', `api=${health.apiReachable} smtp=${health.smtpVerify || 'n/a'}`);
  } else {
    fail('Email health', health.hint || health.error || 'not configured');
  }

  const testTo = process.env.SMTP_FROM_EMAIL || 'uschools.pk@gmail.com';
  const send = await fetch(`${BASE}/api/email/send-test`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      recipientEmail: testTo,
      subject: `Render readiness test ${ts}`,
      body: 'Automated test from Unique School System.'
    }),
    signal: AbortSignal.timeout(120000)
  }).then(r => r.json());

  if (send.status === 'Success') {
    pass('Send test email', `channel=${send.channel || 'brevo'}`);
  } else {
    fail('Send test email', send.error || send.message || send.status);
  }
} catch (e) {
  fail('Email block', e.message);
}

console.log('\n▸ Database add + refresh (all core entities)');
const tests = [
  ['students', ts => ({ id: `rr-std-${ts}`, full_name: 'Render Test Student', roll_no: `RR-${ts}`, class_name: '1', enrollment_date: '2026-08-14', gender: 'Other', created_at: new Date().toISOString() }), r => ({ ...r, full_name: 'Render Test Updated' }), (a, b) => a.full_name === b.full_name],
  ['teachers', ts => ({ id: `rr-tch-${ts}`, full_name: 'Render Test Teacher', teacher_id: `RR-T-${ts}`, cnic: `33333-${String(ts).slice(-7)}-3`, phone: '03003333333', designation: 'Teacher', joining_date: '2026-08-14', base_salary: 50000, created_at: new Date().toISOString() }), r => ({ ...r, full_name: 'Render Teacher Updated' }), (a, b) => a.full_name === b.full_name],
  ['fees', ts => ({ id: `rr-fee-${ts}`, student_id: 'std-101', month: 'August', year: 2026, tuition_fee: 5000, net_fee: 5000, paid_amount: 0, status: 'Unpaid', created_at: new Date().toISOString() }), r => ({ ...r, status: 'Paid', paid_amount: 5000 }), (a, b) => a.status === b.status],
  ['payrolls', ts => ({ id: `rr-pay-${ts}`, teacher_id: 'tch-201', month: 'August', year: 2026, base_salary: 50000, net_salary: 48000, status: 'Pending', created_at: new Date().toISOString() }), r => ({ ...r, status: 'Paid' }), (a, b) => a.status === b.status],
  ['expenses', ts => ({ id: `rr-exp-${ts}`, description: 'Render Test', amount: 500, category: 'Utilities', date: '2026-08-14', payment_mode: 'Cash', logged_by: 'Test', created_at: new Date().toISOString() }), r => ({ ...r, amount: 750 }), (a, b) => Number(a.amount) === Number(b.amount)],
  ['examResults', ts => ({ id: `rr-exam-${ts}`, student_id: 'std-101', exam_category: 'Weekly Test', session_name: '2026', subject: 'Math', total_marks: 100, obtained_marks: 80, grade: 'A', created_at: new Date().toISOString() }), r => ({ ...r, obtained_marks: 85 }), (a, b) => a.obtained_marks === b.obtained_marks],
  ['studentAttendance', ts => ({ id: `rr-satt-${ts}`, student_id: 'std-101', date: '2026-08-14', status: 'P', created_at: new Date().toISOString() }), r => ({ ...r, status: 'A' }), (a, b) => a.status === b.status],
  ['teacherAttendance', ts => ({ id: `rr-tatt-${ts}`, teacher_id: 'tch-201', date: '2026-08-14', status: 'P', created_at: new Date().toISOString() }), r => ({ ...r, status: 'L' }), (a, b) => a.status === b.status]
];

for (const [key, make, patch, check] of tests) {
  try {
    await testEntity(key, make, patch, check);
  } catch (e) {
    fail(`${key} test`, e.message);
  }
}

console.log(`\nResult: ${passed} passed, ${failed} failed\n`);
process.exit(failed > 0 ? 1 : 0);
