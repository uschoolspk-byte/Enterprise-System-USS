import 'dotenv/config';

const BASE = process.env.API_BASE || 'http://localhost:3000';
const ts = Date.now();
const teacher = {
  id: `tch-na-quick-${ts}`,
  full_name: 'Quick NA Teacher',
  cnic: `77777-${ts}-7`,
  phone: `0300${String(ts).slice(-7)}`,
  email: `na-quick-${ts}@test.com`,
  qualification: 'B.Ed',
  specialization: 'General',
  dob: 'N/A',
  joining_date: 'N/A',
  base_salary: 40000,
  designation: 'Teacher',
  created_at: new Date().toISOString()
};

const all = await fetch(`${BASE}/api/db/all`).then(r => r.json());
let seq = all.syncSequence ?? 0;
const teachers = [...(all.data.teachers || []), teacher];
const sync = await fetch(`${BASE}/api/db/sync`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ teachers, syncSequence: seq })
}).then(r => r.json());

console.log('sync success:', sync.success);
if (sync.errors?.length) console.log('errors:', sync.errors.slice(0, 3));
seq = sync.syncSequence ?? seq;

await new Promise(r => setTimeout(r, 3000));
const after = await fetch(`${BASE}/api/db/all`).then(r => r.json());
const found = (after.data.teachers || []).find(t => t.id === teacher.id);
console.log('found:', Boolean(found));
if (found) {
  console.log('dates:', { joining_date: found.joining_date, dob: found.dob });
  const cleaned = (after.data.teachers || []).filter(t => t.id !== teacher.id);
  await fetch(`${BASE}/api/db/sync`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ teachers: cleaned, syncSequence: after.syncSequence })
  });
  console.log('cleanup: done');
}

process.exit(found ? 0 : 1);
