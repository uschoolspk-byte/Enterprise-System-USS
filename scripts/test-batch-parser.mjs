/**
 * Batch Results Parser — module verification
 * Usage: node scripts/test-batch-parser.mjs
 */
import 'dotenv/config';
import * as XLSX from 'xlsx';
import { writeFileSync, unlinkSync, readFileSync } from 'fs';
import { join } from 'path';

const BASE = process.env.TEST_BASE || 'http://localhost:3000';
const TIMEOUT = 180_000;
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

// --- Mirror supabaseStorage.ts path helpers ---
function constructSupabaseStoragePath(sessionName, examCategory, subPeriodWeek, subPeriodMonth, rollNo) {
  const cleanSession = (sessionName || 'Session 2026').trim();
  const cleanCategory = (examCategory || '1st Term').trim();
  let cleanRoll = (rollNo || 'UNKNOWN').trim();
  if (!cleanRoll.toLowerCase().endsWith('.pdf')) cleanRoll = `${cleanRoll}.pdf`;

  if (cleanCategory === 'Weekly Test') {
    const week = (subPeriodWeek || 'Week 1').trim();
    const month = (subPeriodMonth || 'August').trim();
    return `${cleanSession}/${cleanCategory}/${month}/${week}/${cleanRoll}`;
  }
  if (cleanCategory === 'Monthly Test') {
    const month = (subPeriodMonth || 'August').trim();
    return `${cleanSession}/${cleanCategory}/${month}/${cleanRoll}`;
  }
  return `${cleanSession}/${cleanCategory}/${cleanRoll}`;
}

function parseSupabaseStoragePath(path) {
  if (!path) return { session: 'Session 2026', category: '1st Term', subPeriod: '', rollNo: '' };
  const parts = path.split('/');
  const fileName = parts[parts.length - 1] || '';
  const rollNo = fileName.replace(/\.[^/.]+$/, '');
  if (parts.length >= 5) {
    return { session: parts[0], category: parts[1], subPeriod: `${parts[2]} - ${parts[3]}`, rollNo };
  }
  if (parts.length === 4) {
    return { session: parts[0], category: parts[1], subPeriod: parts[2], rollNo };
  }
  if (parts.length === 3) {
    return { session: parts[0], category: parts[1], subPeriod: '', rollNo };
  }
  return { session: 'Session 2026', category: '1st Term', subPeriod: '', rollNo };
}

function extractRollNumberFromFilename(filename, students) {
  const baseName = filename.replace(/\.[^/.]+$/, '').trim();
  const direct = students.find(s => s.roll_no?.toLowerCase() === baseName.toLowerCase());
  if (direct) return direct.roll_no;
  const contains = students.find(s => s.roll_no && baseName.toLowerCase().includes(s.roll_no.toLowerCase()));
  if (contains) return contains.roll_no;
  for (const part of baseName.split(/[_ ]/)) {
    const m = students.find(s => s.roll_no && s.roll_no.toLowerCase() === part.toLowerCase());
    if (m) return m.roll_no;
  }
  return baseName;
}

function findStudentByRoll(extractedRoll, students) {
  if (!extractedRoll) return null;
  const cleanExtracted = extractedRoll.toLowerCase().replace(/[^a-z0-9]/g, '');
  return students.find(s => {
    if (!s.roll_no) return false;
    const cleanRoll = s.roll_no.toLowerCase().replace(/[^a-z0-9]/g, '');
    return cleanRoll === cleanExtracted || s.roll_no.toLowerCase() === extractedRoll.toLowerCase();
  }) || null;
}

async function getAll() {
  const res = await fetch(`${BASE}/api/db/all`, { signal: AbortSignal.timeout(TIMEOUT) });
  const json = await res.json();
  if (!json.data) throw new Error('GET /api/db/all failed');
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

async function main() {
  console.log('\n=== Batch Results Parser — Module Test ===\n');

  // 1. Storage path construction
  const termPath = constructSupabaseStoragePath('Session 2026', '1st Term', 'Week 1', 'August', 'S-USS-01');
  if (termPath === 'Session 2026/1st Term/S-USS-01.pdf') pass('Storage path: 1st Term');
  else fail('Storage path: 1st Term', termPath);

  const weeklyPath = constructSupabaseStoragePath('Session 2026', 'Weekly Test', 'Week 2', 'August', 'BS-SE-5259');
  if (weeklyPath === 'Session 2026/Weekly Test/August/Week 2/BS-SE-5259.pdf') pass('Storage path: Weekly Test');
  else fail('Storage path: Weekly Test', weeklyPath);

  const monthlyPath = constructSupabaseStoragePath('Session 2026', 'Monthly Test', 'Week 1', 'September', 'S-USS-03');
  if (monthlyPath === 'Session 2026/Monthly Test/September/S-USS-03.pdf') pass('Storage path: Monthly Test');
  else fail('Storage path: Monthly Test', monthlyPath);

  const parsed = parseSupabaseStoragePath(weeklyPath);
  if (parsed.session === 'Session 2026' && parsed.category === 'Weekly Test' && parsed.rollNo === 'BS-SE-5259') {
    pass('Parse storage path round-trip');
  } else fail('Parse storage path round-trip', JSON.stringify(parsed));

  // 2. Load students for roll matching
  let all;
  try {
    all = await getAll();
    pass('Load students for matching', `${all.data.students?.length ?? 0} students`);
  } catch (e) {
    fail('Load students', e.message);
    process.exit(1);
  }

  const students = all.data.students || [];
  if (students.length === 0) {
    fail('Students available for batch test', 'no students in DB');
  } else {
    const sample = students[0];
    const rollFromFile = extractRollNumberFromFilename(`${sample.roll_no}.pdf`, students);
    const matched = findStudentByRoll(rollFromFile, students);
    if (matched?.id === sample.id) pass('Roll extract + match from PDF filename', sample.roll_no);
    else fail('Roll extract + match', `got ${rollFromFile}`);

    const unmatched = findStudentByRoll('NOT-A-REAL-ROLL', students);
    if (!unmatched) pass('Unmatched roll returns null');
    else fail('Unmatched roll should be null');
  }

  // 3. Excel spreadsheet parse (mirrors parseExcelFile)
  const xlsxPath = join(process.cwd(), `_batch_test_${ts}.xlsx`);
  try {
    const sampleStudent = students[0];
    if (!sampleStudent) throw new Error('no student');
    const sheetData = [{
      'Roll Number': sampleStudent.roll_no,
      'Name': sampleStudent.full_name,
      'Mathematics': 90,
      'English': 85,
      'Science': 88,
      'Urdu': 92,
      'Islamiat': 95
    }];
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(sheetData);
    XLSX.utils.book_append_sheet(wb, ws, 'Results');
    XLSX.writeFile(wb, xlsxPath);

    const readWb = XLSX.read(readFileSync(xlsxPath), { type: 'buffer' });
    const rows = XLSX.utils.sheet_to_json(readWb.Sheets[readWb.SheetNames[0]]);
    if (rows.length === 1 && rows[0]['Roll Number'] === sampleStudent.roll_no) {
      pass('Excel spreadsheet parse', `${rows.length} row`);
    } else fail('Excel spreadsheet parse');
  } catch (e) {
    fail('Excel spreadsheet parse', e.message);
  } finally {
    try { unlinkSync(xlsxPath); } catch { /* ignore */ }
  }

  // 4. Supabase storage upload API
  const testStudent = students[0];
  const storagePath = constructSupabaseStoragePath('Session 2026', '1st Term', 'Week 1', 'August', testStudent?.roll_no || 'TEST');
  const miniPdf = Buffer.from('%PDF-1.4 batch parser test').toString('base64');
  try {
    const up = await fetch(`${BASE}/api/supabase/upload`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        bucket: 'student-results',
        path: storagePath,
        fileBase64: `data:application/pdf;base64,${miniPdf}`
      }),
      signal: AbortSignal.timeout(TIMEOUT)
    });
    const upJson = await up.json();
    if (up.ok && upJson.success) {
      pass('Supabase upload API', upJson.storagePersisted ? 'cloud persisted' : 'indexed locally');
    } else {
      fail('Supabase upload API', upJson.error || `status ${up.status}`);
    }
  } catch (e) {
    fail('Supabase upload API', e.message);
  }

  // 5. Simulate batch commit (spreadsheet → exam result → sync)
  if (testStudent) {
    const examId = `exam-batch-test-${ts}`;
    const resultObj = {
      id: examId,
      student_id: testStudent.id,
      student_roll: testStudent.roll_no,
      student_name: testStudent.full_name,
      session_name: 'Session 2026',
      exam_category: '1st Term',
      exam_name: 'Batch Parser Test Exam',
      evaluation_type: 'Term Exam',
      month: 'August',
      marks: { Mathematics: 90, English: 85 },
      total_marks: 500,
      obtained_marks: 450,
      grade: 'A+',
      status: 'Pass',
      storage_path: storagePath,
      file_name: `${testStudent.roll_no}.pdf`,
      created_at: new Date().toISOString()
    };

    const body = {
      students: all.data.students,
      teachers: all.data.teachers,
      fees: all.data.fees,
      payrolls: all.data.payrolls,
      examResults: [...(all.data.examResults || []), resultObj],
      customFields: all.data.customFields,
      expenses: all.data.expenses,
      emailTemplates: all.data.emailTemplates,
      studentAttendance: all.data.studentAttendance,
      teacherAttendance: all.data.teacherAttendance,
      schoolFeeSettings: all.data.schoolFeeSettings,
      siteBranding: all.data.siteBranding
    };

    try {
      const syncRes = await sync(body, all.syncSequence ?? 0);
      if (!syncRes.success) {
        fail('Batch exam result sync', syncRes.errors?.[0] || 'sync failed');
      } else {
        const after = await getAll();
        const found = (after.data.examResults || []).some(r => r.id === examId);
        if (found) pass('Batch exam result persisted after sync', examId);
        else fail('Batch exam result persisted', 'not found after fetch');

        // Tree path check
        const saved = (after.data.examResults || []).find(r => r.id === examId);
        const treeParsed = parseSupabaseStoragePath(saved?.storage_path || '');
        if (treeParsed.rollNo === testStudent.roll_no.replace(/\.pdf$/i, '') || treeParsed.rollNo === testStudent.roll_no) {
          pass('Document tree path indexing', saved?.storage_path);
        } else {
          fail('Document tree path indexing', saved?.storage_path);
        }
      }
    } catch (e) {
      fail('Batch exam result sync', e.message);
    }
  }

  // 6. Email dispatch endpoint (simulated — should not 500)
  if (testStudent) {
    try {
      const emailRes = await fetch(`${BASE}/api/email/dispatch-progress-report`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          student: testStudent,
          termName: 'Batch Parser Test',
          pdfBase64: `data:application/pdf;base64,${miniPdf}`
        }),
        signal: AbortSignal.timeout(TIMEOUT)
      });
      const emailJson = await emailRes.json();
      if (emailRes.ok && (emailJson.success || emailJson.message || emailJson.status)) {
        pass('Progress report email dispatch', emailJson.status || emailJson.message || 'ok');
      } else {
        fail('Progress report email dispatch', emailJson.error || `status ${emailRes.status}`);
      }
    } catch (e) {
      fail('Progress report email dispatch', e.message);
    }
  }

  console.log('\n=== Summary ===');
  console.log(`Passed: ${passed}`);
  console.log(`Failed: ${failed}`);
  console.log('');
  process.exit(failed > 0 ? 1 : 0);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
