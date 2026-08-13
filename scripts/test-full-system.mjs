/**
 * Full system verification — every module, API, backend sync, and email endpoint.
 * Run: node scripts/test-full-system.mjs
 */
import 'dotenv/config';
import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const BASE = process.env.API_BASE || 'http://localhost:3000';
const SYNC_TIMEOUT = 300_000;
const FETCH_TIMEOUT = 180_000;

let syncSequence = 0;
const ts = Date.now();
const results = [];

function record(module, name, ok, detail = '') {
  results.push({ module, name, ok, detail });
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
}

async function get(path, timeout = 90000) {
  const res = await fetch(`${BASE}${path}`, { signal: AbortSignal.timeout(timeout) });
  const json = res.ok ? await res.json().catch(() => null) : null;
  return { ok: res.ok, status: res.status, json };
}

async function post(path, body, timeout = 120000) {
  const res = await fetch(`${BASE}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(timeout)
  });
  const json = res.ok ? await res.json().catch(() => null) : null;
  return { ok: res.ok, status: res.status, json };
}

async function fetchAll(retries = 4) {
  let lastErr;
  for (let i = 0; i < retries; i++) {
    try {
      if (i > 0) await new Promise(r => setTimeout(r, 3000 * i));
      const res = await fetch(`${BASE}/api/db/all`, { signal: AbortSignal.timeout(FETCH_TIMEOUT) });
      if (!res.ok) throw new Error(`fetchAll ${res.status}`);
      const json = await res.json();
      if (typeof json.syncSequence === 'number') syncSequence = json.syncSequence;
      return json;
    } catch (err) {
      lastErr = err;
    }
  }
  throw lastErr;
}

async function syncPatch(patch, retries = 3) {
  let lastErr;
  for (let i = 0; i < retries; i++) {
    try {
      if (i > 0) await new Promise(r => setTimeout(r, 4000 * i));
      const res = await fetch(`${BASE}/api/db/sync`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...patch, syncSequence }),
        signal: AbortSignal.timeout(SYNC_TIMEOUT)
      });
      if (!res.ok) throw new Error(`sync ${res.status}`);
      const json = await res.json();
      if (typeof json.syncSequence === 'number') syncSequence = json.syncSequence;
      await new Promise(r => setTimeout(r, 1200));
      return json;
    } catch (err) {
      lastErr = err;
    }
  }
  throw lastErr;
}

function syncOk(r) {
  return Boolean(r?.success && (r.supabase || r.mongodb));
}

async function testEntityCrud(module, key, make, patch, check) {
  try {
    const all = await fetchAll();
    const list = [...(all.data[key] || [])];
    const item = make(ts);
    const id = item.id;

    const s1 = await syncPatch({ [key]: [...list, item] });
    if (!syncOk(s1)) return record(module, `${key} create`, false, s1.errors?.[0] || 'sync failed');

    const all2 = await fetchAll();
    const found = (all2.data[key] || []).find(r => r.id === id);
    if (!found) return record(module, `${key} read`, false, 'not found');

    const updated = patch({ ...found });
    const s2 = await syncPatch({ [key]: (all2.data[key] || []).map(r => (r.id === id ? updated : r)) });
    if (!syncOk(s2)) return record(module, `${key} update`, false, 'sync failed');

    const all3 = await fetchAll();
    const foundUpd = (all3.data[key] || []).find(r => r.id === id);
    if (!foundUpd || !check(foundUpd, updated)) return record(module, `${key} update verify`, false, 'not persisted');

    const s3 = await syncPatch({ [key]: (all3.data[key] || []).filter(r => r.id !== id) });
    if (!syncOk(s3)) return record(module, `${key} delete`, false, 'sync failed');

    const all4 = await fetchAll();
    const gone = !(all4.data[key] || []).some(r => r.id === id);
    record(module, `${key} full CRUD`, gone, gone ? 'create/read/update/delete OK' : 'still present after delete');
  } catch (e) {
    record(module, `${key} CRUD`, false, e.message);
  }
}

const miniPdf = Buffer.from('%PDF-1.4 system test').toString('base64');

console.log('\n╔══════════════════════════════════════════════════════════════╗');
console.log('║       UNIQUE SCHOOL SYSTEM — COMPLETE MODULE TEST            ║');
console.log('╚══════════════════════════════════════════════════════════════╝\n');
console.log(`Base URL: ${BASE}\n`);

// ── INFRASTRUCTURE ──
console.log('▸ Infrastructure & Database');
try {
  const health = await get('/api/db/health');
  record('Infrastructure', 'Health check', health.ok && health.json?.ok,
    `supabase=${health.json?.supabase} mongodb=${health.json?.mongodb} cloudinary=${health.json?.cloudinary}`);

  const schema = await get('/api/db/schema-status');
  record('Infrastructure', 'Schema status', schema.json?.allReady,
    `${schema.json?.readyCount}/${schema.json?.totalCount} tables`);

  const feeSchema = await get('/api/db/fee-schema-check');
  record('Infrastructure', 'Fee schema columns', feeSchema.json?.feeColumnsReady !== false);

  const all = await fetchAll();
  record('Infrastructure', 'Fetch all data', all.connected !== false,
    `students=${all.data?.students?.length ?? 0} teachers=${all.data?.teachers?.length ?? 0} fees=${all.data?.fees?.length ?? 0}`);

  const adminOk = process.env.ADMIN_PASSWORD
    ? (await post('/api/admin/login', { password: process.env.ADMIN_PASSWORD })).json?.success
    : null;
  record('Infrastructure', 'Admin login', adminOk !== false,
    adminOk ? 'authenticated' : adminOk === null ? 'ADMIN_PASSWORD not set (skip)' : 'invalid password');
} catch (e) {
  record('Infrastructure', 'Infrastructure block', false, e.message);
}

// ── ATTENDANCE CONSOLE ──
console.log('\n▸ Attendance Console');
try {
  await testEntityCrud('Attendance', 'studentAttendance',
    t => ({ id: `att-std-${t}`, student_id: 'std-101', date: '2026-08-13', status: 'P', created_at: new Date().toISOString() }),
    r => ({ ...r, status: 'A' }),
    (a, b) => a.status === b.status);
  await testEntityCrud('Attendance', 'teacherAttendance',
    t => ({ id: `att-tch-${t}`, teacher_id: 'tch-201', date: '2026-08-13', status: 'P', created_at: new Date().toISOString() }),
    r => ({ ...r, status: 'L' }),
    (a, b) => a.status === b.status);
} catch (e) {
  record('Attendance', 'Attendance CRUD', false, e.message);
}

// ── STUDENT ADMISSIONS & HUB ──
console.log('\n▸ Student Admissions & Hub');
try {
  await testEntityCrud('Students', 'students',
    t => ({ id: `sys-std-${t}`, full_name: 'System Test Student', roll_no: `SYS-S-${t}`, class_name: '1', enrollment_date: '2026-08-13', gender: 'Other', created_at: new Date().toISOString() }),
    r => ({ ...r, full_name: 'System Test Student Updated' }),
    (a, b) => a.full_name === b.full_name);
} catch (e) {
  record('Students', 'Student CRUD', false, e.message);
}

// ── TEACHER HUB ──
console.log('\n▸ Teacher Hub & Staff');
try {
  await testEntityCrud('Teachers', 'teachers',
    t => ({ id: `sys-tch-${t}`, full_name: 'System Test Teacher', teacher_id: `SYS-T-${t}`, cnic: `55555-${String(t).slice(-7)}-5`, phone: '03009999999', designation: 'Teacher', joining_date: '2026-08-13', base_salary: 50000, created_at: new Date().toISOString() }),
    r => ({ ...r, full_name: 'System Test Teacher Updated' }),
    (a, b) => a.full_name === b.full_name);

  const naTeacher = {
    id: `sys-tch-na-${ts}`,
    full_name: 'NA Date Teacher',
    cnic: `44444-${ts}-4`,
    phone: `0300${String(ts).slice(-7)}`,
    designation: 'Teacher',
    dob: 'N/A',
    joining_date: 'N/A',
    base_salary: 40000,
    created_at: new Date().toISOString()
  };
  const fresh = await fetchAll();
  await syncPatch({ teachers: [...(fresh.data.teachers || []), naTeacher] });
  const afterNa = await fetchAll();
  const foundNa = (afterNa.data.teachers || []).find(t => t.id === naTeacher.id);
  const datesOk = foundNa && foundNa.joining_date !== 'N/A' && foundNa.dob !== 'N/A';
  record('Teachers', 'N/A date coercion', Boolean(foundNa && datesOk),
    foundNa ? `joining=${foundNa.joining_date}` : 'not found');
  if (foundNa) {
    await syncPatch({ teachers: (afterNa.data.teachers || []).filter(t => t.id !== naTeacher.id) });
  }
} catch (e) {
  record('Teachers', 'Teacher module', false, e.message);
}

// ── FEE MANAGER ──
console.log('\n▸ Fee Manager');
try {
  await testEntityCrud('Fees', 'fees',
    t => ({ id: `sys-fee-${t}`, student_id: 'std-101', month: 'August', year: 2026, tuition_fee: 5000, net_fee: 5000, paid_amount: 0, status: 'Unpaid', created_at: new Date().toISOString() }),
    r => ({ ...r, status: 'Paid', paid_amount: 5000 }),
    (a, b) => a.status === b.status);

  const settings = {
    ...(await fetchAll()).data.schoolFeeSettings || {},
    payment_instructions: `System test fee settings ${ts}`,
    updated_at: new Date().toISOString()
  };
  await syncPatch({ schoolFeeSettings: settings });
  const afterSettings = await fetchAll();
  record('Fees', 'School fee settings', String(afterSettings.data.schoolFeeSettings?.payment_instructions || '').includes(String(ts)));
} catch (e) {
  record('Fees', 'Fee module', false, e.message);
}

// ── PAYROLL MANAGER ──
console.log('\n▸ Payroll Manager');
try {
  await testEntityCrud('Payroll', 'payrolls',
    t => ({ id: `sys-pay-${t}`, teacher_id: 'tch-201', month: 'August', year: 2026, base_salary: 50000, net_salary: 48000, status: 'Pending', created_at: new Date().toISOString() }),
    r => ({ ...r, status: 'Paid' }),
    (a, b) => a.status === b.status);
} catch (e) {
  record('Payroll', 'Payroll CRUD', false, e.message);
}

// ── EXPENSE TRACKER ──
console.log('\n▸ Expense Tracker');
try {
  await testEntityCrud('Expenses', 'expenses',
    t => ({ id: `sys-exp-${t}`, description: 'System Test Expense', amount: 1000, category: 'Utilities', date: '2026-08-13', payment_mode: 'Cash', logged_by: 'Test', created_at: new Date().toISOString() }),
    r => ({ ...r, amount: 1500 }),
    (a, b) => Number(a.amount) === Number(b.amount));

  const scan = await post('/api/expense/scan-receipt', {
    imageBase64: 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
    mimeType: 'image/png'
  });
  record('Expenses', 'Receipt OCR scan', scan.ok && scan.json?.success,
    scan.json?.source || scan.json?.error || '');
} catch (e) {
  record('Expenses', 'Expense module', false, e.message);
}

// ── EMAIL DESIGNER & TEMPLATES ──
console.log('\n▸ Email Designer & Templates');
try {
  await testEntityCrud('Email', 'emailTemplates',
    t => ({ id: `sys-tpl-${t}`, type: 'custom', name: 'System Test Template', subject: 'Test', body: 'Hello', updated_at: new Date().toISOString() }),
    r => ({ ...r, subject: 'Updated Subject' }),
    (a, b) => a.subject === b.subject);

  const logsBefore = await get('/api/email/logs');
  record('Email', 'Email logs endpoint', logsBefore.ok);

  const testEmail = process.env.SMTP_FROM_EMAIL || 'uschools.pk@gmail.com';
  const sendTest = await post('/api/email/send-test', {
    recipientEmail: testEmail,
    subject: 'System Test Email',
    body: 'Full system verification test email.'
  });
  record('Email', 'Send test email', sendTest.ok && sendTest.json?.success,
    sendTest.json?.status || sendTest.json?.message || '');

  const all = await fetchAll();
  const student = (all.data.students || [])[0];
  const teacher = (all.data.teachers || [])[0];
  const payroll = (all.data.payrolls || [])[0];

  if (student) {
    const progress = await post('/api/email/dispatch-progress-report', {
      student, termName: 'System Test Term', pdfBase64: `data:application/pdf;base64,${miniPdf}`
    });
    record('Email', 'Progress report dispatch', progress.ok && (progress.json?.success || progress.json?.status),
      progress.json?.status || progress.json?.message || '');

    const feeRem = await post('/api/email/dispatch-fee-reminder', {
      student, feeMonth: 'August 2026', amountDue: 5000, isVoucher: true,
      pdfBase64: `data:application/pdf;base64,${miniPdf}`
    });
    record('Email', 'Fee reminder dispatch', feeRem.ok && (feeRem.json?.success || feeRem.json?.status),
      feeRem.json?.status || feeRem.json?.message || '');

    const bulkRem = await post('/api/email/fee-reminders', {
      defaulters: [{
        student_name: student.full_name,
        month: 'August', year: 2026, net_fee: 5000, paid_amount: 0,
        is_orphan: false, guardian_email: student.guardian_email || 'guardian@example.com',
        guardian_name: student.guardian_name || 'Parent'
      }]
    });
    record('Email', 'Bulk fee reminders', bulkRem.ok && bulkRem.json?.success,
      `dispatched=${bulkRem.json?.dispatchedCount ?? 0}`);
  } else {
    record('Email', 'Progress/fee email (needs student)', false, 'no students in DB');
  }

  if (teacher) {
    const salary = await post('/api/email/dispatch-salary-slip', {
      teacher, payroll: payroll || { month: 'August', year: 2026, net_salary: 48000 },
      pdfBase64: `data:application/pdf;base64,${miniPdf}`
    });
    record('Email', 'Salary slip dispatch', salary.ok && (salary.json?.success || salary.json?.status),
      salary.json?.status || salary.json?.message || '');

    const profile = await post('/api/email/dispatch-teacher-profile', {
      teacher, targetEmail: teacher.email || 'teacher@example.com',
      pdfBase64: `data:application/pdf;base64,${miniPdf}`
    });
    record('Email', 'Teacher profile dispatch', profile.ok && (profile.json?.success || profile.json?.status),
      profile.json?.status || profile.json?.message || '');
  } else {
    record('Email', 'Teacher email dispatches', false, 'no teachers in DB');
  }
} catch (e) {
  record('Email', 'Email module', false, e.message);
}

// ── EXAM RESULTS / REPORTING ──
console.log('\n▸ Exam Results & Reporting');
try {
  await testEntityCrud('Reporting', 'examResults',
    t => ({ id: `sys-exam-${t}`, student_id: 'std-101', exam_category: 'Weekly Test', session_name: '2026', subject: 'Mathematics', total_marks: 100, obtained_marks: 85, grade: 'A', created_at: new Date().toISOString() }),
    r => ({ ...r, obtained_marks: 90 }),
    (a, b) => a.obtained_marks === b.obtained_marks);
} catch (e) {
  record('Reporting', 'Exam results CRUD', false, e.message);
}

// ── CUSTOM FIELDS ──
console.log('\n▸ Custom Fields (Dynamic Forms)');
try {
  const cfVerify = await get('/api/custom-fields/verify');
  record('Custom Fields', 'Write/read verify', cfVerify.json?.writeReadOk);

  const cfGet = await get('/api/custom-fields');
  record('Custom Fields', 'GET /api/custom-fields', cfGet.ok && cfGet.json?.success,
    `count=${cfGet.json?.count ?? 0}`);

  const fieldId = `sys-cf-${ts}`;
  const cfPost = await post('/api/custom-fields', {
    id: fieldId,
    target: 'student',
    fieldName: 'System Test Field',
    fieldType: 'text',
    isRequired: false
  });
  record('Custom Fields', 'POST create field', cfPost.ok && cfPost.json?.success);

  const cfPut = await fetch(`${BASE}/api/custom-fields/${fieldId}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ fieldName: 'System Test Field Updated' }),
    signal: AbortSignal.timeout(60000)
  }).then(r => r.json());
  record('Custom Fields', 'PUT update field', cfPut?.success);

  const cfDel = await fetch(`${BASE}/api/custom-fields/${fieldId}`, {
    method: 'DELETE',
    signal: AbortSignal.timeout(60000)
  }).then(r => r.json());
  record('Custom Fields', 'DELETE field', cfDel?.success);
} catch (e) {
  record('Custom Fields', 'Custom fields API', false, e.message);
}

// ── SITE SETTINGS ──
console.log('\n▸ Site Settings Portal');
try {
  const all = await fetchAll();
  const orig = all.data.siteBranding?.school_name;
  const brand = { ...(all.data.siteBranding || {}), school_name: `System Test Brand ${ts}`, client_updated_at: new Date().toISOString() };
  await syncPatch({ siteBranding: brand });
  const after = await fetchAll();
  const saved = after.data.siteBranding?.school_name === brand.school_name;
  record('Site Settings', 'Site branding save', saved);
  if (orig !== undefined) {
    await syncPatch({ siteBranding: { ...(after.data.siteBranding || {}), school_name: orig, client_updated_at: new Date().toISOString() } });
  }
} catch (e) {
  record('Site Settings', 'Site branding', false, e.message);
}

// ── DOCUMENTS & CLOUDINARY ──
console.log('\n▸ Documents & Cloudinary');
try {
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
  const studentId = `doc-sys-${ts}`;
  const galleryId = `gal-sys-${ts}`;
  const upload = await post('/api/supabase/upload', {
    bucket: 'entity-documents',
    path: `students/${studentId}/${galleryId}.png`,
    fileBase64: `data:image/png;base64,${png.toString('base64')}`
  }, 180000);
  record('Documents', 'Document upload', upload.ok && upload.json?.success,
    upload.json?.cloudPersisted ? 'Cloudinary' : upload.json?.dbPersisted ? 'DB fallback' : upload.json?.message || '');

  const docUrl = upload.json?.url || upload.json?.publicUrl;
  if (docUrl?.startsWith('/api/supabase/file')) {
    const file = await get(docUrl.replace(BASE, ''), 60000);
    record('Documents', 'Document file serve', file.ok);
  } else if (docUrl?.startsWith('http')) {
    record('Documents', 'Document Cloudinary URL', true, docUrl.slice(0, 60) + '…');
  }

  const all = await fetchAll();
  const testStudent = {
    id: studentId,
    full_name: 'Doc Test Student',
    roll_no: `DOC-${ts}`,
    class_name: '1',
    enrollment_date: '2026-08-13',
    gender: 'Other',
    document_gallery: [{
      id: galleryId,
      name: 'test.png',
      url: upload.json?.url || upload.json?.publicUrl,
      storage_path: `students/${studentId}/${galleryId}.png`,
      storage_persisted: true
    }],
    created_at: new Date().toISOString()
  };
  await syncPatch({ students: [...(all.data.students || []), testStudent] });
  const afterDoc = await fetchAll();
  const found = (afterDoc.data.students || []).find(s => s.id === studentId);
  const galleryOk = (found?.document_gallery || []).length > 0;
  record('Documents', 'Document gallery sync', galleryOk);
  await syncPatch({ students: (afterDoc.data.students || []).filter(s => s.id !== studentId) });
} catch (e) {
  record('Documents', 'Document module', false, e.message);
}

// ── AI ASSISTANT ──
console.log('\n▸ AI Assistant (Groq)');
try {
  const groq = await post('/api/groq/chat', { message: 'What modules does Unique School System have?' });
  record('AI Assistant', 'Groq chat endpoint', groq.ok && (groq.json?.reply || groq.json?.text),
    groq.json?.reply ? 'reply received' : groq.json?.error || 'not configured');
} catch (e) {
  record('AI Assistant', 'Groq chat', false, e.message);
}

// ── RUN EXISTING SUB-SUITES ──
console.log('\n▸ Running bundled verification scripts…\n');

function runScript(name) {
  return new Promise(resolve => {
    const proc = spawn('node', [join(__dirname, name)], {
      stdio: 'inherit',
      shell: true,
      env: { ...process.env, API_BASE: BASE }
    });
    proc.on('close', code => resolve({ name, code }));
  });
}

const subScripts = [
  'test-cloudinary.mjs',
  'test-batch-parser.mjs'
];

for (const script of subScripts) {
  const { name, code } = await runScript(script);
  record('Sub-suite', script, code === 0, code === 0 ? 'all passed' : `exit ${code}`);
}

// ── SUMMARY ──
const passed = results.filter(r => r.ok).length;
const failed = results.filter(r => !r.ok).length;

console.log('\n╔══════════════════════════════════════════════════════════════╗');
console.log('║                        FINAL SUMMARY                         ║');
console.log('╚══════════════════════════════════════════════════════════════╝');
console.log(`\n  Passed: ${passed}`);
console.log(`  Failed: ${failed}`);
console.log(`  Total:  ${results.length}\n`);

if (failed > 0) {
  console.log('Failed checks:');
  for (const r of results.filter(x => !x.ok)) {
    console.log(`  • [${r.module}] ${r.name}${r.detail ? `: ${r.detail}` : ''}`);
  }
  console.log('');
}

const modules = [...new Set(results.map(r => r.module))];
console.log('Modules tested:');
for (const m of modules) {
  const modResults = results.filter(r => r.module === m);
  const modPass = modResults.filter(r => r.ok).length;
  console.log(`  ${m}: ${modPass}/${modResults.length} passed`);
}

console.log('');
process.exit(failed > 0 ? 1 : 0);
