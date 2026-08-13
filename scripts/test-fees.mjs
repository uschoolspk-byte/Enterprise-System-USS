/**
 * Fee module verification — create, read, update, delete + school fee settings.
 * Run: node scripts/test-fees.mjs
 */
import 'dotenv/config';

const BASE = process.env.API_BASE || 'http://localhost:3000';
const SYNC_TIMEOUT = 300_000;
const FETCH_TIMEOUT = 180_000;

let syncSequence = 0;
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
  const res = await fetch(`${BASE}/api/db/all`, { signal: AbortSignal.timeout(FETCH_TIMEOUT) });
  if (!res.ok) throw new Error(`fetchAll ${res.status}`);
  const json = await res.json();
  if (typeof json.syncSequence === 'number') syncSequence = json.syncSequence;
  return json;
}

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

function syncOk(result) {
  return Boolean(result?.success && (result.supabase || result.mongodb));
}

console.log('\n=== Fee Module Verification ===\n');
console.log(`Base URL: ${BASE}\n`);

try {
  const health = await fetch(`${BASE}/api/db/health`, { signal: AbortSignal.timeout(30000) }).then(r => r.json());
  if (health.supabase || health.mongodb) {
    pass('Health check', `supabase=${health.supabase} mongodb=${health.mongodb}`);
  } else {
    fail('Health check', 'no database connected');
    process.exit(1);
  }

  const feeId = `fee-test-${ts}`;
  const testFee = {
    id: feeId,
    student_id: 'std-101',
    month: 'August',
    year: 2026,
    tuition_fee: 5000,
    net_fee: 5000,
    paid_amount: 0,
    status: 'Unpaid',
    created_at: new Date().toISOString()
  };

  const all = await fetchAll();
  const fees = [...(all.data.fees || [])];

  // CREATE
  const createRes = await syncPatch({ fees: [...fees, testFee] });
  if (!syncOk(createRes)) {
    fail('Create fee voucher', (createRes.errors || []).join('; ') || createRes.message || 'sync failed');
  } else {
    pass('Create fee voucher');
  }

  // READ
  const afterCreate = await fetchAll();
  const found = (afterCreate.data.fees || []).find(f => f.id === feeId);
  if (found && found.status === 'Unpaid' && Number(found.net_fee) === 5000) {
    pass('Read fee voucher', `status=${found.status}, net_fee=${found.net_fee}`);
  } else {
    fail('Read fee voucher', found ? `unexpected: ${JSON.stringify(found)}` : 'not found after create');
  }

  // UPDATE (mark paid)
  const updated = { ...found, status: 'Paid', paid_amount: 5000 };
  const updateList = (afterCreate.data.fees || []).map(f => (f.id === feeId ? updated : f));
  const updateRes = await syncPatch({ fees: updateList });
  if (!syncOk(updateRes)) {
    fail('Update fee (mark paid)', (updateRes.errors || []).join('; ') || 'sync failed');
  } else {
    pass('Update fee (mark paid)');
  }

  const afterUpdate = await fetchAll();
  const foundPaid = (afterUpdate.data.fees || []).find(f => f.id === feeId);
  if (foundPaid?.status === 'Paid' && Number(foundPaid.paid_amount) === 5000) {
    pass('Verify paid status after re-fetch', `paid_amount=${foundPaid.paid_amount}`);
  } else {
    fail('Verify paid status after re-fetch', foundPaid ? `status=${foundPaid.status}` : 'not found');
  }

  // SCHOOL FEE SETTINGS
  const instructions = `Fee test instructions ${ts}`;
  const settings = {
    ...(afterUpdate.data.schoolFeeSettings || {}),
    payment_instructions: instructions,
    updated_at: new Date().toISOString()
  };
  const settingsRes = await syncPatch({ schoolFeeSettings: settings });
  if (!syncOk(settingsRes)) {
    fail('Sync school fee settings', (settingsRes.errors || []).join('; ') || 'sync failed');
  } else {
    pass('Sync school fee settings');
  }

  const afterSettings = await fetchAll();
  const savedInstructions = String(afterSettings.data.schoolFeeSettings?.payment_instructions || '');
  if (savedInstructions.includes(instructions)) {
    pass('Read school fee settings after re-fetch');
  } else {
    fail('Read school fee settings after re-fetch', `got: ${savedInstructions.slice(0, 80)}`);
  }

  // DELETE
  const deleteList = (afterSettings.data.fees || []).filter(f => f.id !== feeId);
  const deleteRes = await syncPatch({ fees: deleteList });
  if (!syncOk(deleteRes)) {
    fail('Delete fee voucher', (deleteRes.errors || []).join('; ') || 'sync failed');
  } else {
    pass('Delete fee voucher');
  }

  const afterDelete = await fetchAll();
  if (!(afterDelete.data.fees || []).some(f => f.id === feeId)) {
    pass('Verify fee removed after re-fetch');
  } else {
    fail('Verify fee removed after re-fetch', 'fee still present');
  }
} catch (err) {
  fail('Unexpected error', err.message);
}

console.log(`\nResult: ${passed} passed, ${failed} failed\n`);
process.exit(failed > 0 ? 1 : 0);
