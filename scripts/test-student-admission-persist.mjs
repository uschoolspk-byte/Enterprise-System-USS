/**
 * Student admission persistence — add via API (mirrors onboarding), re-fetch simulates refresh.
 * Run: node scripts/test-student-admission-persist.mjs
 */
import 'dotenv/config';

const BASE = process.env.API_BASE || 'http://localhost:3000';
const ts = Date.now();

async function fetchAll() {
  const res = await fetch(`${BASE}/api/db/all`, { signal: AbortSignal.timeout(180000) });
  if (!res.ok) throw new Error(`fetchAll ${res.status}`);
  return res.json();
}

async function syncStudents(students, seq) {
  const res = await fetch(`${BASE}/api/db/sync`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ students, syncSequence: seq }),
    signal: AbortSignal.timeout(300000)
  });
  if (!res.ok) throw new Error(`sync ${res.status}`);
  return res.json();
}

console.log('\n=== Student Admission Persistence Test ===\n');

const all = await fetchAll();
const seq = all.syncSequence ?? 0;
const studentId = `adm-test-${ts}`;
const newStudent = {
  id: studentId,
  roll_no: `ADM-${ts}`,
  full_name: 'Admission Persist Test',
  father_name: 'Test Father',
  parent_phone: '03001234567',
  class_name: '1',
  enrollment_date: '2026-08-14',
  dob: '2015-01-01',
  gender: 'Male',
  created_at: new Date().toISOString()
};

const teachers = all.data.teachers || [];
const studentsBefore = all.data.students || [];
console.log(`Before: ${studentsBefore.length} students`);

const sync1 = await syncStudents([newStudent, ...studentsBefore], seq);
console.log(`Sync add: success=${sync1.success} supabase=${sync1.supabase} mongodb=${sync1.mongodb}`);
if (!sync1.success) {
  console.error('FAIL — sync did not succeed', sync1.errors);
  process.exit(1);
}

await new Promise(r => setTimeout(r, 2500));

const afterAdd = await fetchAll();
const found = (afterAdd.data.students || []).find(s => s.id === studentId);
if (!found) {
  console.error('FAIL — student not found after add (simulated refresh)');
  process.exit(1);
}
console.log(`PASS — student found after add: ${found.full_name} (${found.roll_no})`);

const afterAdd2 = await fetchAll();
const found2 = (afterAdd2.data.students || []).find(s => s.id === studentId);
if (!found2) {
  console.error('FAIL — student missing on second fetch (refresh simulation)');
  process.exit(1);
}
console.log('PASS — student still present on second fetch (page refresh)');

const cleaned = (afterAdd2.data.students || []).filter(s => s.id !== studentId);
await syncStudents(cleaned, afterAdd2.syncSequence ?? sync1.syncSequence);
console.log('Cleanup: test student removed\n');
process.exit(0);
