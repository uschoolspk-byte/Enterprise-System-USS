/**
 * Verify document gallery round-trip: upload blob, sync metadata, re-fetch, preview bytes.
 */
import 'dotenv/config';

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

async function getJson(path, options = {}) {
  const res = await fetch(`${BASE}${path}`, {
    ...options,
    signal: AbortSignal.timeout(TIMEOUT)
  });
  const json = await res.json().catch(() => ({}));
  return { res, json };
}

function tinyPngDataUrl() {
  return 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
}

async function main() {
  console.log('\n=== Document Persistence Verification ===\n');
  console.log(`Base URL: ${BASE}\n`);

  const { res: healthRes, json: health } = await getJson('/api/db/health');
  if (!healthRes.ok) {
    fail('Health check', 'server unreachable');
    process.exit(1);
  }
  pass('Health check', `supabase=${health.supabase} mongodb=${health.mongodb}`);

  const initial = await getJson('/api/db/all');
  if (!initial.res.ok || !initial.json.data) {
    fail('Initial fetch');
    process.exit(1);
  }

  let seq = initial.json.syncSequence || initial.json.data?.syncSequence || 0;
  const entityId = `doc-test-stu-${ts}`;
  const docId = `gal-${ts}`;
  const storagePath = `students/${entityId}/${docId}.png`;
  const dataUrl = tinyPngDataUrl();

  const upload = await getJson('/api/supabase/upload', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      bucket: 'entity-documents',
      path: storagePath,
      fileBase64: dataUrl
    })
  });

  if (!upload.res.ok || (!upload.json.cloudPersisted && !upload.json.dbPersisted)) {
    fail('Upload entity document', upload.json.error || upload.res.statusText);
    process.exit(1);
  }
  pass('Upload entity document', upload.json.message || 'saved');

  const galleryEntry = {
    id: docId,
    title: 'Persistence Test Doc',
    url: upload.json.publicUrl,
    uploaded_at: new Date().toISOString(),
    storage_path: upload.json.path || storagePath,
    storage_bucket: upload.json.bucket || 'cloudinary',
    storage_persisted: true
  };

  const student = {
    id: entityId,
    roll_no: `DOC-${ts}`,
    full_name: 'Document Test Student',
    dob: '2015-01-01',
    b_form_no: 'N/A',
    gender: 'Other',
    blood_group: 'N/A',
    father_name: 'Test Father',
    father_cnic: 'N/A',
    mother_name: 'N/A',
    parent_phone: '03001234567',
    emergency_phone: '03001234567',
    mailing_address: 'N/A',
    enrollment_date: '2026-01-01',
    class_name: 'Test',
    guardian_name: 'Test Father',
    guardian_relation: 'Father',
    guardian_cnic: 'N/A',
    guardian_phone: '03001234567',
    guardian_email: 'test@example.com',
    is_orphan: false,
    custom_fields: {},
    document_gallery: [galleryEntry],
    noc_status: 'Pending',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  };

  const sync = await getJson('/api/db/sync', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      syncSequence: seq,
      students: [student]
    })
  });

  if (!sync.json.success) {
    fail('Sync student with gallery', (sync.json.errors || []).join('; ') || sync.json.error);
    process.exit(1);
  }
  seq = sync.json.syncSequence || seq;
  pass('Sync student with gallery');

  const refetch = await getJson('/api/db/all');
  const fetchedStudents = refetch.json.data?.students || [];
  const fetched = fetchedStudents.find(s => s.id === entityId);
  const gallery = fetched?.document_gallery || [];

  if (!fetched) {
    fail('Re-fetch student');
  } else if (!gallery.length) {
    fail('Re-fetch document_gallery', 'empty after refresh');
  } else {
    pass('Re-fetch document_gallery', `${gallery.length} item(s)`);
  }

  const previewUrl =
    String(galleryEntry.url || '').startsWith('http')
      ? galleryEntry.url
      : `${BASE}/api/supabase/file?bucket=entity-documents&path=${encodeURIComponent(storagePath)}`;
  const preview = await fetch(previewUrl, { signal: AbortSignal.timeout(TIMEOUT) });

  if (!preview.ok) {
    const errText = await preview.text().catch(() => '');
    fail('Preview document bytes', errText.slice(0, 120));
  } else {
    const buf = Buffer.from(await preview.arrayBuffer());
    if (buf.length < 50) fail('Preview document bytes', `too small (${buf.length})`);
    else pass('Preview document bytes', `${buf.length} bytes`);
  }

  const cleanup = await getJson('/api/db/sync', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      syncSequence: seq,
      students: fetchedStudents.filter(s => s.id !== entityId)
    })
  });

  if (cleanup.json.success) pass('Cleanup test student');
  else fail('Cleanup test student', (cleanup.json.errors || []).join('; '));

  console.log(`\nResult: ${passed} passed, ${failed} failed\n`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
