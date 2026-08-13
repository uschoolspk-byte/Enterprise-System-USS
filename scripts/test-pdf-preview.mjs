/**
 * PDF preview API — verify file endpoint returns inline PDF bytes.
 * Run: node scripts/test-pdf-preview.mjs
 */
import 'dotenv/config';

const BASE = process.env.API_BASE || 'http://localhost:3000';

const miniPdf = Buffer.from('%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Kids[]/Count 0>>endobj\nxref\n0 3\ntrailer<</Root 1 0 R>>\n%%EOF');

console.log('\n=== PDF Preview API Test ===\n');

const upload = await fetch(`${BASE}/api/supabase/upload`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    bucket: 'entity-documents',
    path: `students/pdf-preview-test/doc-${Date.now()}.pdf`,
    fileBase64: `data:application/pdf;base64,${miniPdf.toString('base64')}`
  }),
  signal: AbortSignal.timeout(120000)
}).then(r => r.json());

if (!upload.success) {
  console.error('FAIL — upload', upload.error || upload.message);
  process.exit(1);
}
console.log('PASS — PDF uploaded', upload.cloudPersisted ? '(Cloudinary)' : '(DB)');

const fileUrl = upload.url || upload.publicUrl;
let previewUrl = fileUrl;
if (fileUrl?.startsWith('/api/')) {
  previewUrl = `${BASE}${fileUrl}`;
} else if (fileUrl?.startsWith('http')) {
  previewUrl = fileUrl;
}

const res = await fetch(previewUrl, { signal: AbortSignal.timeout(60000) });
if (!res.ok) {
  console.error('FAIL — preview fetch', res.status);
  process.exit(1);
}

const ct = res.headers.get('content-type') || '';
const buf = Buffer.from(await res.arrayBuffer());
const isPdf = ct.includes('pdf') || buf.slice(0, 4).toString() === '%PDF';
const disp = res.headers.get('content-disposition') || '';

console.log(`PASS — preview fetch ${res.status}, type=${ct}, bytes=${buf.length}, pdf=${isPdf}`);
if (disp) console.log(`       content-disposition: ${disp}`);
console.log('');
process.exit(isPdf && buf.length > 20 ? 0 : 1);
