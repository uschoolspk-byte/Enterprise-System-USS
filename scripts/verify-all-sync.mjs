/**
 * End-to-end verification: health, fetch, sync all modules, re-fetch persistence.
 */
import 'dotenv/config';

const BASE = process.env.TEST_BASE || 'http://localhost:3000';
const TIMEOUT = 180_000;
const ts = Date.now();

const results = [];
let passed = 0;
let failed = 0;

function pass(name, detail = '') {
  passed++;
  results.push({ name, ok: true, detail });
  console.log(`  PASS  ${name}${detail ? ` — ${detail}` : ''}`);
}

function fail(name, detail = '') {
  failed++;
  results.push({ name, ok: false, detail });
  console.log(`  FAIL  ${name}${detail ? ` — ${detail}` : ''}`);
}

async function getJson(path, options = {}) {
  const res = await fetch(`${BASE}${path}`, {
    ...options,
    signal: AbortSignal.timeout(TIMEOUT)
  });
  const json = await res.json().catch(() => ({}));
  return { res, json };
}

async function getAll() {
  const { res, json } = await getJson('/api/db/all');
  if (!res.ok || !json.data) throw new Error('GET /api/db/all failed');
  return json;
}

async function sync(body, seq) {
  const res = await fetch(`${BASE}/api/db/sync`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...body, syncSequence: seq }),
    signal: AbortSignal.timeout(TIMEOUT)
  });
  return res.json();
}

async function run() {
  console.log('\n=== Unique School System — Full Sync Verification ===\n');
  console.log(`Base URL: ${BASE}\n`);

  // 1. Health
  try {
    const { res, json } = await getJson('/api/db/health');
    if (res.ok && (json.supabase || json.mongodb)) {
      pass('Health check', `supabase=${json.supabase} mongodb=${json.mongodb}`);
    } else fail('Health check', JSON.stringify(json));
  } catch (e) {
    fail('Health check', e.message);
  }

  // 2. Schema status
  try {
    const { res, json } = await getJson('/api/db/schema-status');
    if (res.ok) pass('Schema status', json.allReady ? 'all tables ready' : `hint: ${json.hint || 'check schema'}`);
    else fail('Schema status');
  } catch (e) {
    fail('Schema status', e.message);
  }

  // 3. Initial fetch
  let all;
  try {
    all = await getAll();
    pass('Initial DB fetch', `seq=${all.syncSequence ?? 0}, loadMs=${all.loadMs ?? '?'}`);
  } catch (e) {
    fail('Initial DB fetch', e.message);
    printSummary();
    process.exit(1);
  }

  const d = all.data;
  let seq = all.syncSequence ?? 0;

  const testStudent = {
    id: `std-e2e-${ts}`,
    full_name: 'E2E Test Student',
    roll_no: `USS-E2E-${ts}`,
    class_name: '1',
    father_name: 'E2E Father',
    gender: 'Male',
    enrollment_date: '2026-08-12',
    created_at: new Date().toISOString()
  };

  const testTeacher = {
    id: `tch-e2e-${ts}`,
    full_name: 'E2E Test Teacher',
    cnic: `88888-${String(ts).slice(-7)}-8`,
    phone: '03008888888',
    email: 'e2e-teacher@test.com',
    qualification: 'M.Ed',
    specialization: 'Science',
    joining_date: '2026-08-12',
    base_salary: 45000,
    designation: 'Teacher',
    created_at: new Date().toISOString()
  };

  const testPayroll = {
    id: `pay-e2e-${ts}`,
    teacher_id: testTeacher.id,
    teacher_name: testTeacher.full_name,
    month: 'August',
    year: 2026,
    gross_salary: 45000,
    deductions: 0,
    net_salary: 45000,
    status: 'Pending',
    created_at: new Date().toISOString()
  };

  const testFee = {
    id: `fee-e2e-${ts}`,
    student_id: testStudent.id,
    month: 'August',
    year: 2026,
    tuition_fee: 5000,
    net_fee: 5000,
    paid_amount: 0,
    status: 'Pending',
    due_date: '2026-08-25',
    created_at: new Date().toISOString()
  };

  const testExpense = {
    id: `exp-e2e-${ts}`,
    title: 'E2E Test Expense',
    amount: 1500,
    category: 'Utilities',
    date: '2026-08-12',
    status: 'Paid',
    created_at: new Date().toISOString()
  };

  const testExam = {
    id: `exm-e2e-${ts}`,
    student_id: testStudent.id,
    student_roll: testStudent.roll_no,
    student_name: testStudent.full_name,
    exam_name: 'E2E Test Exam',
    subject: 'Math',
    obtained_marks: 85,
    total_marks: 100,
    percentage: 85,
    grade: 'A',
    created_at: new Date().toISOString()
  };

  const testTemplate = {
    id: `tpl-e2e-${ts}`,
    type: 'custom',
    name: 'E2E Test Template',
    subject: 'E2E Test Email',
    body: 'Hello {{name}}',
    header_title: 'Test',
    footer: 'USS',
    accent_color: '#1e3a8a',
    is_active: true,
    updated_at: new Date().toISOString()
  };

  const testStudentAttendance = {
    id: `sa-e2e-${ts}`,
    date: '2026-08-12',
    class_name: '1',
    student_id: testStudent.id,
    status: 'P',
    created_at: new Date().toISOString()
  };

  const testTeacherAttendance = {
    id: `ta-e2e-${ts}`,
    date: '2026-08-12',
    teacher_id: testTeacher.id,
    status: 'P',
    created_at: new Date().toISOString()
  };

  const testCustomField = {
    id: `cf-e2e-${ts}`,
    target: 'student',
    fieldName: `E2E Field ${ts}`,
    fieldType: 'text',
    isRequired: false
  };

  const testTeacherNa = {
    id: `tch-na-${ts}`,
    full_name: 'E2E NA Date Teacher',
    cnic: `66666-${ts}-6`,
    phone: `0300${String(ts).slice(-7)}`,
    email: `na-teacher-${ts}@test.com`,
    qualification: 'B.Ed',
    specialization: 'General',
    dob: 'N/A',
    joining_date: 'N/A',
    base_salary: 40000,
    designation: 'Teacher',
    created_at: new Date().toISOString()
  };

  const syncTests = [
    {
      name: 'Sync students (add)',
      patch: {
        students: [...(d.students || []), testStudent]
      },
      verify: data => (data.students || []).some(s => s.id === testStudent.id)
    },
    {
      name: 'Sync teachers (add)',
      patch: {
        teachers: [...(d.teachers || []), testTeacher]
      },
      verify: data => (data.teachers || []).some(t => t.id === testTeacher.id)
    },
    {
      name: 'Sync payrolls (add)',
      patch: {
        teachers: [...(d.teachers || []), testTeacher],
        students: [...(d.students || []), testStudent],
        payrolls: [...(d.payrolls || []), testPayroll]
      },
      verify: data => (data.payrolls || []).some(p => p.id === testPayroll.id)
    },
    {
      name: 'Sync fees (add)',
      patch: {
        students: [...(d.students || []), testStudent],
        fees: [...(d.fees || []), testFee]
      },
      verify: data => (data.fees || []).some(f => f.id === testFee.id)
    },
    {
      name: 'Sync expenses (add)',
      patch: {
        expenses: [...(d.expenses || []), testExpense]
      },
      verify: data => (data.expenses || []).some(e => e.id === testExpense.id)
    },
    {
      name: 'Sync exam results (add)',
      patch: {
        students: [...(d.students || []), testStudent],
        examResults: [...(d.examResults || []), testExam]
      },
      verify: data => (data.examResults || []).some(e => e.id === testExam.id)
    },
    {
      name: 'Sync email templates (add)',
      patch: {
        emailTemplates: [...(d.emailTemplates || []), testTemplate]
      },
      verify: data => (data.emailTemplates || []).some(t => t.id === testTemplate.id)
    },
    {
      name: 'Sync student attendance (add)',
      patch: {
        students: [...(d.students || []), testStudent],
        studentAttendance: [...(d.studentAttendance || []), testStudentAttendance]
      },
      verify: data => (data.studentAttendance || []).some(a => a.id === testStudentAttendance.id)
    },
    {
      name: 'Sync teacher attendance (add)',
      patch: {
        teachers: [...(d.teachers || []), testTeacher],
        teacherAttendance: [...(d.teacherAttendance || []), testTeacherAttendance]
      },
      verify: data => (data.teacherAttendance || []).some(a => a.id === testTeacherAttendance.id)
    },
    {
      name: 'Sync school fee settings',
      patch: {
        schoolFeeSettings: {
          ...(d.schoolFeeSettings || {}),
          payment_instructions: `E2E test instructions ${ts}`,
          updated_at: new Date().toISOString()
        }
      },
      verify: data =>
        String(data.schoolFeeSettings?.payment_instructions || '').includes(`E2E test instructions ${ts}`)
    },
    {
      name: 'Sync custom fields (add)',
      patch: {
        customFields: [...(d.customFields || []), testCustomField]
      },
      verify: data => (data.customFields || []).some(f => f.id === testCustomField.id)
    },
    {
      name: 'Sync teachers (N/A dates coerced)',
      patch: {},
      verify: data => (data.teachers || []).some(t => t.id === testTeacherNa.id)
    }
  ];

  // Build cumulative state for final combined sync
  let cumulative = { ...d };

  for (const test of syncTests) {
    try {
      if (test.name === 'Sync teachers (N/A dates coerced)') {
        const fresh = await getAll();
        seq = fresh.syncSequence ?? seq;
        test.patch.teachers = [...(fresh.data.teachers || []), testTeacherNa];
      }
      cumulative = { ...cumulative, ...test.patch };
      const body = { ...test.patch };

      const res = await sync(body, seq);
      if (!res.success) {
        fail(test.name, res.errors?.[0] || res.message || 'sync returned success=false');
        continue;
      }
      if (Array.isArray(res.errors) && res.errors.some(e => /invalid input syntax for type date/i.test(String(e)))) {
        fail(test.name, res.errors.find(e => /date/i.test(String(e))));
        continue;
      }
      seq = res.syncSequence ?? seq + 1;

      const syncStarted = Date.now();
      // Sync can be slow — retry fetch until data appears or timeout
      let verified = false;
      for (let attempt = 0; attempt < 6; attempt++) {
        if (attempt > 0) await new Promise(r => setTimeout(r, 2000));
        const after = await getAll();
        if (test.verify(after.data)) {
          verified = true;
          seq = after.syncSequence ?? seq;
          break;
        }
      }
      if (verified) {
        pass(test.name, `persisted after fetch (${Date.now() - syncStarted}ms)`);
      } else {
        fail(test.name, 'not found after re-fetch');
      }
    } catch (e) {
      fail(test.name, e.message);
    }
  }

  // 4. Simulate new browser — fresh fetch with no session seq
  console.log('\n--- New browser simulation (fresh fetch) ---');
  try {
    const fresh = await getAll();
    const checks = [
      ['Student', (fresh.data.students || []).some(s => s.id === testStudent.id)],
      ['Teacher', (fresh.data.teachers || []).some(t => t.id === testTeacher.id)],
      ['Payroll', (fresh.data.payrolls || []).some(p => p.id === testPayroll.id)],
      ['Fee', (fresh.data.fees || []).some(f => f.id === testFee.id)],
      ['Expense', (fresh.data.expenses || []).some(e => e.id === testExpense.id)],
      ['Exam result', (fresh.data.examResults || []).some(e => e.id === testExam.id)],
      ['Email template', (fresh.data.emailTemplates || []).some(t => t.id === testTemplate.id)],
      ['Student attendance', (fresh.data.studentAttendance || []).some(a => a.id === testStudentAttendance.id)],
      ['Teacher attendance', (fresh.data.teacherAttendance || []).some(a => a.id === testTeacherAttendance.id)],
      ['Custom field', (fresh.data.customFields || []).some(f => f.id === testCustomField.id)],
      ['School fee settings', String(fresh.data.schoolFeeSettings?.payment_instructions || '').includes(`E2E test instructions ${ts}`)]
    ];
    for (const [label, ok] of checks) {
      if (ok) pass(`Fresh fetch: ${label}`);
      else fail(`Fresh fetch: ${label}`, 'missing in DB');
    }
  } catch (e) {
    fail('Fresh fetch simulation', e.message);
  }

  // 5. Document gallery round-trip
  console.log('\n--- Document gallery persistence ---');
  try {
    const docId = `gal-e2e-${ts}`;
    const storagePath = `students/${testStudent.id}/${docId}.png`;
    const png = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
    const upload = await getJson('/api/supabase/upload', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ bucket: 'entity-documents', path: storagePath, fileBase64: png })
    });
    if (!upload.res.ok || (!upload.json.cloudPersisted && !upload.json.dbPersisted)) {
      fail('Document upload', upload.json.error || upload.res.statusText);
    } else {
      pass('Document upload', upload.json.message || 'saved');
      const galleryStudent = {
        ...testStudent,
        document_gallery: [{
          id: docId,
          title: 'E2E Gallery Doc',
          url: upload.json.publicUrl,
          storage_path: upload.json.path || storagePath,
          storage_bucket: upload.json.bucket || 'cloudinary',
          storage_persisted: true,
          uploaded_at: new Date().toISOString()
        }]
      };
      const freshAll = await getAll();
      const allStudents = (freshAll.data.students || []).map(s =>
        s.id === testStudent.id ? galleryStudent : s
      );
      const syncRes = await sync(
        { students: allStudents, teachers: freshAll.data.teachers || [] },
        freshAll.syncSequence ?? seq
      );
      if (!syncRes.success) fail('Document gallery sync', syncRes.errors?.[0]);
      else {
        const refetch = await getAll();
        const row = (refetch.data.students || []).find(s => s.id === testStudent.id);
        const gallery = row?.document_gallery || [];
        if (gallery.length) pass('Document gallery after refresh', `${gallery.length} file(s)`);
        else fail('Document gallery after refresh', 'empty');
        seq = refetch.syncSequence ?? seq;
      }
    }
  } catch (e) {
    fail('Document gallery persistence', e.message);
  }

  // 6. Custom fields dedicated endpoint
  try {
    const cfRes = await fetch(`${BASE}/api/custom-fields/verify`, {
      signal: AbortSignal.timeout(TIMEOUT)
    });
    const cfJson = await cfRes.json();
    if (cfRes.ok && cfJson.success) pass('Custom fields verify endpoint');
    else fail('Custom fields verify endpoint', cfJson.error || 'failed');
  } catch (e) {
    fail('Custom fields verify endpoint', e.message);
  }

  // 7. Supabase direct check (if env available)
  if (process.env.SUPABASE_URL && process.env.SUPABASE_ANON_KEY) {
    try {
      const url = process.env.SUPABASE_URL;
      const key = process.env.SUPABASE_ANON_KEY;
      const h = { apikey: key, Authorization: `Bearer ${key}` };
      const store = await fetch(`${url}/rest/v1/app_store?key=eq.students&select=value`, { headers: h }).then(r => r.json());
      const arr = Array.isArray(store[0]?.value) ? store[0].value : [];
      if (arr.some(s => s.id === testStudent.id)) pass('Supabase app_store students');
      else fail('Supabase app_store students', 'test student not in store');
    } catch (e) {
      fail('Supabase app_store check', e.message);
    }
  }

  printSummary();
  process.exit(failed > 0 ? 1 : 0);
}

function printSummary() {
  console.log('\n=== Summary ===');
  console.log(`Passed: ${passed}`);
  console.log(`Failed: ${failed}`);
  console.log(`Total:  ${passed + failed}`);
  if (failed > 0) {
    console.log('\nFailed tests:');
    results.filter(r => !r.ok).forEach(r => console.log(`  - ${r.name}: ${r.detail}`));
  } else {
    console.log('\nAll tests passed.');
  }
}

run().catch(err => {
  console.error('Fatal:', err);
  process.exit(1);
});
