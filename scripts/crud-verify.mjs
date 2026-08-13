/**
 * Quick CRUD round-trip verification against live dev server.
 * Run: node scripts/crud-verify.mjs
 */
import 'dotenv/config';

const BASE = process.env.API_BASE || 'http://localhost:3000';
const SYNC_TIMEOUT = 300_000;
const FETCH_TIMEOUT = 180_000;

let syncSequence = 0;

async function syncPatch(patch) {
  const res = await fetch(`${BASE}/api/db/sync`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...patch, syncSequence }),
    signal: AbortSignal.timeout(SYNC_TIMEOUT)
  });
  if (!res.ok) throw new Error(`sync ${res.status}`);
  const json = await res.json();
  if (typeof json.syncSequence === 'number') syncSequence = json.syncSequence;
  await new Promise(r => setTimeout(r, 1500));
  return json;
}

async function fetchAll() {
  const res = await fetch(`${BASE}/api/db/all`, { signal: AbortSignal.timeout(FETCH_TIMEOUT) });
  if (!res.ok) throw new Error(`fetchAll ${res.status}`);
  const json = await res.json();
  if (typeof json.syncSequence === 'number') syncSequence = json.syncSequence;
  return json;
}

function syncOk(result) {
  return Boolean(result?.success && (result.supabase || result.mongodb));
}

async function testEntity(name, key, make, patch, checkUpdate) {
  const result = { entity: name, create: 'FAIL', read: 'FAIL', update: 'FAIL', delete: 'FAIL' };
  const ts = Date.now();
  const all = await fetchAll();
  const list = [...(all.data[key] || [])];
  const item = make(ts);
  const id = item.id;

  const s1 = await syncPatch({ [key]: [...list, item] });
  if (!syncOk(s1)) {
    result.create = `FAIL: ${(s1.errors || []).join(';') || s1.message || 'sync failed'}`;
    return result;
  }
  result.create = 'PASS';

  const all2 = await fetchAll();
  const found = (all2.data[key] || []).find(r => r.id === id);
  if (!found) return result;
  result.read = 'PASS';

  const updated = patch({ ...found });
  const updatedList = (all2.data[key] || []).map(r => (r.id === id ? updated : r));
  const s2 = await syncPatch({ [key]: updatedList });
  if (!syncOk(s2)) {
    result.update = `FAIL: ${(s2.errors || []).join(';') || 'sync failed'}`;
    return result;
  }

  const all3 = await fetchAll();
  const foundUpd = (all3.data[key] || []).find(r => r.id === id);
  if (foundUpd && checkUpdate(foundUpd, updated)) result.update = 'PASS';
  else {
    result.update = 'FAIL: not persisted';
    return result;
  }

  const deleteList = (all3.data[key] || []).filter(r => r.id !== id);
  const s3 = await syncPatch({ [key]: deleteList });
  if (!syncOk(s3)) {
    result.delete = `FAIL: ${(s3.errors || []).join(';') || 'sync failed'}`;
    return result;
  }

  const all4 = await fetchAll();
  if (!(all4.data[key] || []).some(r => r.id === id)) result.delete = 'PASS';
  else result.delete = 'FAIL: still present';

  return result;
}

const entities = [
  ['students', 'students', ts => ({ id: `crud-std-${ts}`, full_name: 'CRUD Student', roll_no: `CRUD-S-${ts}`, class_name: '1', enrollment_date: '2026-08-12', gender: 'Other', created_at: new Date().toISOString() }), r => ({ ...r, full_name: 'CRUD Student Updated' }), (a, b) => a.full_name === b.full_name],
  ['teachers', 'teachers', ts => ({ id: `crud-tch-${ts}`, full_name: 'CRUD Teacher', teacher_id: `CRUD-T-${ts}`, cnic: `11111-${String(ts).slice(-7)}-1`, phone: '03001111111', designation: 'Teacher', joining_date: '2026-08-12', base_salary: 50000, created_at: new Date().toISOString() }), r => ({ ...r, full_name: 'CRUD Teacher Updated' }), (a, b) => a.full_name === b.full_name],
  ['fees', 'fees', ts => ({ id: `crud-fee-${ts}`, student_id: 'std-101', month: 'August', year: 2026, tuition_fee: 5000, net_fee: 5000, paid_amount: 0, status: 'Unpaid', created_at: new Date().toISOString() }), r => ({ ...r, status: 'Paid', paid_amount: 5000 }), (a, b) => a.status === b.status],
  ['payrolls', 'payrolls', ts => ({ id: `crud-pay-${ts}`, teacher_id: 'tch-201', month: 'August', year: 2026, base_salary: 50000, net_salary: 48000, status: 'Pending', created_at: new Date().toISOString() }), r => ({ ...r, status: 'Paid' }), (a, b) => a.status === b.status],
  ['examResults', 'examResults', ts => ({ id: `crud-exam-${ts}`, student_id: 'std-101', exam_category: 'Weekly Test', session_name: '2026', subject: 'Mathematics', total_marks: 100, obtained_marks: 85, grade: 'A', created_at: new Date().toISOString() }), r => ({ ...r, obtained_marks: 90 }), (a, b) => a.obtained_marks === b.obtained_marks],
  ['expenses', 'expenses', ts => ({ id: `crud-exp-${ts}`, description: 'CRUD Expense', amount: 1000, category: 'Utilities', date: '2026-08-12', payment_mode: 'Cash', logged_by: 'Test', created_at: new Date().toISOString() }), r => ({ ...r, amount: 1500 }), (a, b) => Number(a.amount) === Number(b.amount)],
  ['emailTemplates', 'emailTemplates', ts => ({ id: `crud-tpl-${ts}`, type: 'custom', name: 'CRUD Template', subject: 'Test', body: 'Hello', updated_at: new Date().toISOString() }), r => ({ ...r, subject: 'Updated Subject' }), (a, b) => a.subject === b.subject],
  ['studentAttendance', 'studentAttendance', ts => ({ id: `crud-satt-${ts}`, student_id: 'std-101', date: '2026-08-12', status: 'P', created_at: new Date().toISOString() }), r => ({ ...r, status: 'A' }), (a, b) => a.status === b.status],
  ['teacherAttendance', 'teacherAttendance', ts => ({ id: `crud-tatt-${ts}`, teacher_id: 'tch-201', date: '2026-08-12', status: 'P', created_at: new Date().toISOString() }), r => ({ ...r, status: 'L' }), (a, b) => a.status === b.status]
];

console.log('=== CRUD VERIFICATION ===\n');

const health = await fetch(`${BASE}/api/db/health`, { signal: AbortSignal.timeout(30000) }).then(r => r.json());
console.log(`Health: supabase=${health.supabase} mongodb=${health.mongodb} cloudinary=${health.cloudinary}\n`);

const results = [];
for (const args of entities) {
  process.stdout.write(`Testing ${args[0]}… `);
  try {
    const r = await testEntity(...args);
    results.push(r);
    const ok = r.create === 'PASS' && r.read === 'PASS' && r.update === 'PASS' && r.delete === 'PASS';
    console.log(ok ? 'PASS' : `FAIL (${JSON.stringify(r)})`);
  } catch (err) {
    results.push({ entity: args[0], create: 'FAIL', read: 'FAIL', update: 'FAIL', delete: 'FAIL', error: err.message });
    console.log(`ERROR: ${err.message}`);
  }
}

const cf = await fetch(`${BASE}/api/custom-fields/verify`, { signal: AbortSignal.timeout(60000) }).then(r => r.json());
console.log(`\nCustom fields verify: ${cf.writeReadOk ? 'PASS' : 'FAIL'}`);

const allB = await fetchAll();
const brand = { ...(allB.data.siteBranding || {}), school_name: `CRUD Brand ${Date.now()}`, client_updated_at: new Date().toISOString() };
const origName = allB.data.siteBranding?.school_name;
const brandSync = await syncPatch({ siteBranding: brand });
const allB2 = await fetchAll();
const brandOk = syncOk(brandSync) && allB2.data.siteBranding?.school_name === brand.school_name;
if (origName) {
  await syncPatch({ siteBranding: { ...allB2.data.siteBranding, school_name: origName, client_updated_at: new Date().toISOString() } });
}
console.log(`Site branding save: ${brandOk ? 'PASS' : 'FAIL'}`);

const fullPass = results.filter(r => r.create === 'PASS' && r.read === 'PASS' && r.update === 'PASS' && r.delete === 'PASS').length;
console.log(`\n=== SUMMARY: ${fullPass}/9 entities | Custom fields: ${cf.writeReadOk ? 'PASS' : 'FAIL'} | Branding: ${brandOk ? 'PASS' : 'FAIL'} ===`);
console.table(results);

process.exit(fullPass === 9 && cf.writeReadOk && brandOk ? 0 : 1);
