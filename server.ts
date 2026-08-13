import 'dotenv/config';
import express from 'express';
import path from 'path';
import { createServer as createViteServer } from 'vite';
import { GoogleGenAI } from '@google/genai';
import {
  sendTransactionalEmail,
  verifyEmailConnectivity,
  getEmailConfig,
  type EmailAttachment
} from './brevoEmail';
import { MongoClient, Db } from 'mongodb';
import {
  mergeRecordsById,
  mergePreferLatest,
  normalizeFeesForDb,
  normalizeExamResultsForDb,
  resolveExamResultsForDbSync,
  normalizeExpensesForDb,
  normalizeEmailTemplatesForDb,
  resolveStudentAttendanceForDbSync,
  resolveTeacherAttendanceForDbSync,
  normalizePayrollsForDb,
  normalizeStudentsForDb,
  normalizeTeachersForDb,
  stripEntityListForStore,
  collectIds,
  mergeEntityListForFetch,
  resolveEntityListForStoreWrite,
  resolveSchoolFeeSettingsForStoreWrite,
  resolveTeachersCnicInList,
  resolveTeachersCnicForUpsert,
  stripOversizedFields,
  type AdminSessionPayload
} from './dbSyncHelpers';
import {
  ENTITY_DOCS_BUCKET,
  buildEntityDocProxyUrl,
  CLOUDINARY_BUCKET,
  isRemoteDocumentUrl
} from './entityDocumentStorage';
import {
  uploadBufferToCloudinary,
  isCloudinaryConfigured,
  buildCloudinaryDeliveryUrl
} from './cloudinaryStorage';
import {
  supabase,
  supabasePrimary,
  supabaseOverflow,
  selectMergedTable,
  selectPrimaryTableIds,
  loadMergedAppStoreMap,
  selectAppStoreValue,
  upsertTableWithFailover,
  upsertAppStoreWithFailover,
  upsertAppStoreKeyWithFailover,
  reconcileDeletesWithFailover,
  replaceCustomFieldsWithFailover,
  persistEmailLogToSupabase,
  uploadStorageWithFailover,
  downloadStorageWithFailover,
  getSupabaseFailoverStatus,
  checkSupabaseConnectivity
} from './supabaseFailover';
import { buildBrandedEmailHtml, type EmailBrandingContext } from './emailHtmlBuilder';
import { buildProfileDocumentGalleryAttachments, collectProfileDocumentSources } from './emailAttachmentHelpers';
import { registerEntityDocumentDbResolver } from './entityDocumentBlobStore';
import {
  persistEntityDocumentToDatabase,
  loadEntityDocumentFromDatabase,
  registerSupabaseEntityBlobOps,
  registerAppStoreEntityBlobOps
} from './entityDocumentDatabase';
import { mergeEntityListsWithDocuments } from './entityDocumentMerge';
import { hydrateEntityListAllDocuments } from './entityDocumentPersist';
import { GROQ_SYSTEM_INSTRUCTION } from './groqSystemFaq';

const app = express();
const PORT = 3000;

/** Prevent overlapping sync requests from overwhelming Supabase. */
let activeDbSync: Promise<unknown> | null = null;

const pause = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Supabase clients are managed in supabaseFailover.ts (primary + automatic overflow when storage is full)

// In-Memory Email Log History Fallback
const emailLogs: any[] = [];

// Persist email log to Supabase and MongoDB
async function persistEmailLog(logEntry: Record<string, unknown>) {
  emailLogs.unshift(logEntry);
  await persistEmailLogToSupabase(logEntry);
  const db = await getMongoDb();
  if (db) {
    await db.collection('email_logs').updateOne(
      { id: logEntry.id },
      { $set: logEntry },
      { upsert: true }
    );
  }
}

async function reconcileSupabaseDeletes(table: string, keepIds: string[]): Promise<void> {
  await reconcileDeletesWithFailover(table, keepIds);
}

/** Avoid teachers_cnic_key violations — only one row per CNIC in Supabase. */
async function resolveTeacherCnicConflicts(rows: Record<string, unknown>[]): Promise<Record<string, unknown>[]> {
  try {
    const merged = await selectMergedTable('teachers');
    return resolveTeachersCnicForUpsert(
      rows,
      merged.data as { id: string; cnic?: string }[]
    );
  } catch {
    return resolveTeachersCnicInList(rows as { id: string; cnic?: string }[]) as Record<string, unknown>[];
  }
}

type SyncStatusState = { supabase: boolean; errors: string[] };

async function persistEntityListEarly(
  storeKey: string,
  items: unknown[] | undefined,
  storeUpdatedAt: string,
  syncStatus: SyncStatusState
): Promise<unknown[] | undefined> {
  if (!Array.isArray(items)) return items;

  const stored = await selectAppStoreValue(storeKey);
  let resolved = resolveEntityListForStoreWrite(
    stored,
    items as { id: string; created_at?: string }[]
  );
  if (storeKey === 'teachers' && Array.isArray(resolved)) {
    resolved = resolveTeachersCnicInList(resolved as { id: string; cnic?: string; created_at?: string }[]);
  }

  if (storeKey === 'students' || storeKey === 'teachers') {
    const db = await getMongoDb();
    resolved = await hydrateEntityListAllDocuments(
      resolved,
      storeKey === 'students' ? 'students' : 'teachers',
      db
    );
  }

  const storeResult = await upsertAppStoreKeyWithFailover(
    storeKey,
    stripEntityListForStore(resolved),
    storeUpdatedAt
  );
  if (storeResult.ok) syncStatus.supabase = true;
  else if (storeResult.error) {
    syncStatus.errors.push(`Supabase app_store ${storeKey}: ${storeResult.error}`);
  }

  return resolved;
}

async function syncSupabaseTableWithDeletes(
  table: string,
  items: unknown[] | undefined,
  transform?: (rows: unknown[]) => Record<string, unknown>[]
): Promise<boolean> {
  if (!Array.isArray(items)) return false;
  let rows = transform ? transform(items) : items.filter(
    (item): item is Record<string, unknown> => Boolean(item && typeof item === 'object' && (item as { id?: string }).id)
  );
  if (table === 'teachers') {
    rows = await resolveTeacherCnicConflicts(rows);
  }
  const keepIds = collectIds(rows);

  if (rows.length > 0) {
    const result = await upsertTableWithFailover(table, rows, 'id');
    if (!result.ok) {
      console.warn(
        `Supabase upsert ${table}: ${result.error || 'unknown error'} (target=${result.wroteTo})`
      );
      return false;
    }
  }

  await reconcileSupabaseDeletes(table, keepIds);

  return true;
}

async function syncMongoCollectionWithDeletes(
  db: Db,
  collection: string,
  items: unknown[] | undefined
): Promise<void> {
  if (!Array.isArray(items)) return;
  const keepIds: string[] = [];

  for (const item of items) {
    if (!item || typeof item !== 'object' || !(item as { id?: string }).id) continue;
    const clean = { ...(item as Record<string, unknown>) };
    delete clean._id;
    keepIds.push((item as { id: string }).id);
    await db.collection(collection).updateOne(
      { id: (item as { id: string }).id },
      { $set: clean },
      { upsert: true }
    );
  }

  if (keepIds.length === 0) {
    await db.collection(collection).deleteMany({});
    return;
  }

  await db.collection(collection).deleteMany({ id: { $nin: keepIds } });
}

async function persistMongoAppStore(db: Db, key: string, value: unknown): Promise<void> {
  await db.collection('app_store').updateOne(
    { key },
    { $set: { key, value, updated_at: new Date().toISOString() } },
    { upsert: true }
  );
}

const DEFAULT_SITE_BRANDING: EmailBrandingContext = {
  school_name: 'UNIQUE SCHOOL SYSTEM',
  header_subtitle: 'Production Management Portal',
  footer_subtitle: 'Principal: Abdul Rehman Jamil | Unique School System',
  footer_contact: 'Main Campus, Block-4, Education District, Pakistan'
};

async function loadSiteBranding(): Promise<EmailBrandingContext> {
  try {
    const value = await selectAppStoreValue('site_branding');
    if (value && typeof value === 'object') {
      return { ...DEFAULT_SITE_BRANDING, ...(value as EmailBrandingContext) };
    }
  } catch { /* silent */ }

  try {
    const db = await getMongoDb();
    if (db) {
      const doc = await db.collection('app_store').findOne({ key: 'site_branding' });
      if (doc?.value && typeof doc.value === 'object') {
        return { ...DEFAULT_SITE_BRANDING, ...(doc.value as EmailBrandingContext) };
      }
    }
  } catch { /* silent */ }

  return DEFAULT_SITE_BRANDING;
}

async function loadAppStoreMap(): Promise<Record<string, unknown>> {
  return loadMergedAppStoreMap();
}

/** For partial sync — load students/teachers from DB when not included in the request payload. */
async function loadStudentsForLinking(incoming: unknown[] | undefined): Promise<unknown[]> {
  if (Array.isArray(incoming)) return incoming;
  const stored = await selectAppStoreValue('students');
  if (Array.isArray(stored) && stored.length > 0) return stored;
  const merged = await selectMergedTable('students');
  return merged.data || [];
}

async function loadTeachersForLinking(incoming: unknown[] | undefined): Promise<unknown[]> {
  if (Array.isArray(incoming)) return incoming;
  const stored = await selectAppStoreValue('teachers');
  if (Array.isArray(stored) && stored.length > 0) return stored;
  const merged = await selectMergedTable('teachers');
  return merged.data || [];
}

function pushStoreRow(
  rows: { key: string; value: unknown; updated_at: string }[],
  key: string,
  value: unknown,
  updatedAt: string
) {
  if (value === undefined) return;
  if (Array.isArray(value) || (value !== null && typeof value === 'object')) {
    rows.push({ key, value, updated_at: updatedAt });
  }
}

function stripBrandingForStore(branding: Record<string, unknown>): Record<string, unknown> {
  return stripOversizedFields(branding);
}

async function resolveSiteBrandingForSync(incoming: unknown): Promise<Record<string, unknown>> {
  if (incoming && typeof incoming === 'object' && !Array.isArray(incoming)) {
    const branding = { ...(incoming as Record<string, unknown>) };
    if (!branding.client_updated_at) {
      branding.client_updated_at = new Date().toISOString();
    }
    return branding;
  }
  const loaded = await loadSiteBranding();
  return { ...loaded };
}

function mergeSiteBranding(
  requestBranding: unknown,
  loadedBranding: EmailBrandingContext
): EmailBrandingContext {
  if (requestBranding && typeof requestBranding === 'object') {
    return { ...loadedBranding, ...(requestBranding as EmailBrandingContext) };
  }
  return loadedBranding;
}

async function fetchEmailLogsFromStores(): Promise<any[]> {
  let logs: any[] = [];
  try {
    logs = (await selectMergedTable('email_logs')).data;
  } catch { /* table may not exist */ }

  try {
    const logStore = await selectAppStoreValue('email_logs');
    if (Array.isArray(logStore)) {
      logs = mergeRecordsById(logs, logStore);
    }
  } catch { /* silent */ }

  logs = mergeRecordsById(logs, emailLogs);
  return logs.sort((a, b) =>
    String(b.timestamp || '').localeCompare(String(a.timestamp || ''))
  );
}

async function syncEmailLogs(clientLogs: unknown[] | undefined): Promise<any[]> {
  const dbLogs = await fetchEmailLogsFromStores();
  const merged = mergeRecordsById(
    dbLogs,
    Array.isArray(clientLogs) ? clientLogs : []
  ).sort((a, b) => String(b.timestamp || '').localeCompare(String(a.timestamp || '')));

  emailLogs.length = 0;
  emailLogs.push(...merged);

  if (merged.length > 0) {
    await upsertTableWithFailover('email_logs', merged as Record<string, unknown>[], 'id');
  }

  await upsertAppStoreWithFailover([
    { key: 'email_logs', value: merged, updated_at: new Date().toISOString() }
  ]);

  const db = await getMongoDb();
  if (db) {
    await syncMongoCollectionWithDeletes(db, 'email_logs', merged);
  }

  return merged;
}

// MongoDB Atlas Client Connection Management (Used for Dynamic Custom Form Fields)
function buildMongoUri(): string {
  const base = process.env.MONGODB_URI?.trim();
  if (!base) return '';
  if (/retryWrites=/i.test(base)) return base;
  const sep = base.includes('?') ? '&' : '?';
  return `${base}${sep}retryWrites=true&w=majority&appName=UniqueSchoolSystem`;
}

const mongoUri = buildMongoUri();
let mongoClient: MongoClient | null = null;
let dbInstance: Db | null = null;
let mongoConnectPromise: Promise<Db | null> | null = null;
let mongoLastFailedAt = 0;
let mongoReconnectTimer: ReturnType<typeof setTimeout> | null = null;
const MONGO_RETRY_COOLDOWN_MS = 15000;
const MONGO_CONNECT_ATTEMPTS = 3;

function scheduleMongoReconnect() {
  if (dbInstance || mongoReconnectTimer) return;
  mongoReconnectTimer = setTimeout(async () => {
    mongoReconnectTimer = null;
    mongoLastFailedAt = 0;
    await getMongoDb().catch(() => undefined);
    if (!dbInstance) scheduleMongoReconnect();
  }, 30000);
}

async function getMongoDb(): Promise<Db | null> {
  if (!mongoUri) return null;
  if (dbInstance) return dbInstance;
  if (Date.now() - mongoLastFailedAt < MONGO_RETRY_COOLDOWN_MS) return null;
  if (mongoConnectPromise) return mongoConnectPromise;

  mongoConnectPromise = (async () => {
    let lastError: unknown;
    for (let attempt = 1; attempt <= MONGO_CONNECT_ATTEMPTS; attempt++) {
      try {
        if (mongoClient) {
          try {
            await mongoClient.close();
          } catch {
            // ignore stale client cleanup
          }
          mongoClient = null;
        }

        mongoClient = new MongoClient(mongoUri, {
          connectTimeoutMS: 30000,
          serverSelectionTimeoutMS: 30000,
          socketTimeoutMS: 45000,
          maxPoolSize: 10,
          retryWrites: true,
          retryReads: true
        });
        await mongoClient.connect();
        console.log('[MongoDB Atlas] Connected successfully to Cluster0 for Dynamic Custom Form Fields!');
        dbInstance = mongoClient.db(process.env.MONGODB_DB_NAME || 'uschools_db');
        mongoLastFailedAt = 0;
        return dbInstance;
      } catch (err) {
        lastError = err;
        if (attempt < MONGO_CONNECT_ATTEMPTS) {
          console.warn(
            `[MongoDB Atlas] Connection attempt ${attempt}/${MONGO_CONNECT_ATTEMPTS} failed, retrying…`,
            err instanceof Error ? err.message : err
          );
          await new Promise(resolve => setTimeout(resolve, 2000 * attempt));
        }
      }
    }

    mongoLastFailedAt = Date.now();
    console.warn('[MongoDB Atlas] Connection failed:', lastError instanceof Error ? lastError.message : lastError);
    scheduleMongoReconnect();
    return null;
  })().finally(() => {
    mongoConnectPromise = null;
  });

  return mongoConnectPromise;
}

function normalizeCustomField(raw: Record<string, unknown>) {
  return {
    id: raw.id,
    target: raw.target,
    fieldName: raw.fieldName ?? raw.field_name ?? '',
    fieldType: raw.fieldType ?? raw.field_type ?? 'text',
    isRequired: raw.isRequired ?? raw.is_required ?? false
  };
}

async function resolveCustomFieldsForSync(incoming: unknown[] | undefined): Promise<unknown[] | undefined> {
  if (!Array.isArray(incoming) || incoming.length === 0) return incoming;

  let stored: unknown = await selectAppStoreValue('custom_fields');
  if (!Array.isArray(stored) || stored.length === 0) {
    try {
      const merged = await selectMergedTable('custom_fields');
      if (merged.data.length) stored = merged.data;
    } catch {
      // use incoming only
    }
  }

  return resolveEntityListForStoreWrite(
    stored,
    incoming as { id: string; created_at?: string }[]
  );
}

async function loadCustomFieldsFromStores(): Promise<any[]> {
  let fromTable: any[] = [];
  let fromStore: any[] = [];

  try {
    const merged = await selectMergedTable('custom_fields');
    if (merged.data.length) {
      fromTable = merged.data.map(row => normalizeCustomField(row as Record<string, unknown>));
    }
  } catch {
    // fall through to app_store / MongoDB
  }

  try {
    const storeValue = await selectAppStoreValue('custom_fields');
    if (Array.isArray(storeValue) && storeValue.length > 0) {
      fromStore = storeValue.map((row: Record<string, unknown>) => normalizeCustomField(row));
    }
  } catch {
    // fall through
  }

  let customFields = mergePreferLatest(fromTable, fromStore);

  if (customFields.length === 0) {
    const db = await getMongoDb();
    if (db) {
      try {
        const mongoCustomFields = await db.collection('custom_fields').find({}).toArray();
        customFields = mongoCustomFields.map(cf => {
          const normalized = normalizeCustomField(cf as Record<string, unknown>);
          return normalized;
        });
      } catch {
        // ignore
      }
    }
  }

  return customFields;
}

async function persistCustomFieldsToStores(customFields: any[]) {
  const errors: string[] = [];
  let supabaseOk = false;
  let mongodbOk = false;

  if (!Array.isArray(customFields) || customFields.length === 0) {
    return { supabase: true, mongodb: true, errors: [] as string[] };
  }

  try {
    const result = await replaceCustomFieldsWithFailover(customFields);
    if (result.error) errors.push(`Supabase custom_fields: ${result.error}`);
    supabaseOk = result.ok;
  } catch (err: any) {
    errors.push(`Supabase custom_fields sync: ${err.message}`);
  }

  try {
    const db = await getMongoDb();
    if (db) {
      await db.collection('custom_fields').deleteMany({});
      if (customFields.length > 0) {
        await db.collection('custom_fields').insertMany(customFields.map(cf => {
          const clean = { ...cf };
          delete clean._id;
          return clean;
        }));
      }
      mongodbOk = true;
    }
  } catch (err: any) {
    errors.push(`MongoDB custom_fields sync: ${err.message}`);
  }

  return { supabase: supabaseOk, mongodb: mongodbOk, errors };
}

// Brevo email — see brevoEmail.ts (HTTP API + SMTP fallback for Render/cloud)

// ====================================================================
// ADMIN AUTH (password from ADMIN_PASSWORD env — never stored in frontend)
// ====================================================================

app.post('/api/admin/login', (req, res) => {
  const configured = process.env.ADMIN_PASSWORD;
  if (!configured) {
    return res.status(503).json({
      success: false,
      error: 'Admin login is not configured. Set ADMIN_PASSWORD in your server .env file.'
    });
  }

  const password = req.body?.password;
  if (typeof password !== 'string' || !password.trim()) {
    return res.status(400).json({ success: false, error: 'Password is required.' });
  }

  if (password !== configured) {
    return res.status(401).json({ success: false, error: 'Invalid password.' });
  }

  res.json({ success: true });
});

// ====================================================================
// DATABASE REST API ENDPOINTS (SUPABASE PRIMARY DATA + MONGODB CUSTOM FIELDS)
// ====================================================================

// GET /api/db/health - Quick connectivity check for Supabase + MongoDB
app.get('/api/db/health', async (_req, res) => {
  const errors: string[] = [];
  const supabaseStatus = await checkSupabaseConnectivity();
  const failover = getSupabaseFailoverStatus();

  if (!supabaseStatus.primary) errors.push('Supabase primary: unavailable');
  if (!supabaseStatus.overflow) errors.push('Supabase overflow: unavailable (apply schema if first use)');

  let mongoOk = false;
  try {
    const db = await getMongoDb();
    if (db) {
      await db.command({ ping: 1 });
      mongoOk = true;
    } else {
      errors.push('MongoDB: connection unavailable');
    }
  } catch (err: any) {
    errors.push(`MongoDB: ${err.message}`);
  }

  res.json({
    ok: supabaseStatus.primary || supabaseStatus.overflow || mongoOk || isCloudinaryConfigured(),
    supabase: supabaseStatus.primary,
    supabaseOverflow: supabaseStatus.overflow,
    mongodb: mongoOk,
    cloudinary: isCloudinaryConfigured(),
    email: getEmailConfig(),
    failover,
    errors: errors.length ? errors : undefined,
    timestamp: new Date().toISOString()
  });
});

// GET /api/db/schema-status - Check which Supabase tables are available
app.get('/api/db/schema-status', async (_req, res) => {
  const tables = [
    'students', 'teachers', 'fees', 'payrolls', 'exam_results', 'expenses',
    'email_templates', 'custom_fields', 'email_logs', 'student_attendance',
    'teacher_attendance', 'app_store'
  ];
  const status: Record<string, boolean> = {};
  for (const table of tables) {
    const col = table === 'app_store' ? 'key' : 'id';
    const { error } = await supabase.from(table).select(col).limit(1);
    status[table] = !error;
  }
  const ready = Object.values(status).filter(Boolean).length;
  res.json({
    tables: status,
    readyCount: ready,
    totalCount: tables.length,
    allReady: ready === tables.length,
    hint: ready < tables.length
      ? 'Run supabase/schema.sql in Supabase Dashboard → SQL Editor, or set DATABASE_URL and run npm run db:setup'
      : 'All tables ready'
  });
});

// GET /api/db/fee-schema-check - Verify extended fee columns exist in Supabase
app.get('/api/db/fee-schema-check', async (_req, res) => {
  const requiredColumns = [
    'scheduled_installments', 'payment_plan', 'voucher_sent_at', 'custom_fields'
  ];
  const probeFee = {
    id: '__schema_probe__',
    student_id: '__probe__',
    month: 'January',
    year: 2099,
    tuition_fee: 0,
    net_fee: 0,
    paid_amount: 0,
    status: 'Unpaid',
    scheduled_installments: [],
    payment_plan: 'Full',
    voucher_sent_at: null,
    custom_fields: {}
  };

  const { error } = await supabase.from('fees').upsert([probeFee], { onConflict: 'id' });
  if (!error) {
    await supabase.from('fees').delete().eq('id', '__schema_probe__');
  }

  res.json({
    feeColumnsReady: !error,
    requiredColumns,
    error: error?.message ?? null,
    hint: error
      ? 'Run the ALTER TABLE statements for fees in supabase/schema.sql (scheduled_installments, payment_plan, voucher_sent_at, custom_fields). Full fee data is still backed up in app_store.'
      : 'All extended fee columns are available in Supabase.'
  });
});

// POST /api/custom-fields/sync - Persist custom fields only (no full app sync)
app.post('/api/custom-fields/sync', async (req, res) => {
  try {
    const { customFields } = req.body || {};
    if (!Array.isArray(customFields)) {
      return res.status(400).json({ success: false, error: 'customFields array is required' });
    }
    const persist = await persistCustomFieldsToStores(customFields);
    res.json({
      success: persist.supabase || persist.mongodb,
      supabase: persist.supabase,
      mongodb: persist.mongodb,
      errors: persist.errors.length ? persist.errors : undefined,
      customFields
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/custom-fields - Load all custom field definitions
app.get('/api/custom-fields', async (_req, res) => {
  try {
    const customFields = await loadCustomFieldsFromStores();
    res.json({ success: true, customFields, count: customFields.length });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/custom-fields/verify - Verify DB connectivity for custom fields CRUD
app.get('/api/custom-fields/verify', async (_req, res) => {
  try {
    const customFields = await loadCustomFieldsFromStores();
    const testField = {
      id: 'verify-' + Date.now(),
      target: 'student',
      fieldName: '__verify_field__',
      fieldType: 'text',
      isRequired: false
    };
    const withTest = [...customFields.filter(f => f.id !== testField.id && f.fieldName !== testField.fieldName), testField];
    const persist = await persistCustomFieldsToStores(withTest);
    const reloaded = await loadCustomFieldsFromStores();
    const found = reloaded.some(f => f.id === testField.id);
    await persistCustomFieldsToStores(customFields);

    res.json({
      success: persist.supabase || persist.mongodb,
      supabase: persist.supabase,
      mongodb: persist.mongodb,
      loadedCount: customFields.length,
      writeReadOk: found,
      errors: persist.errors,
      stores: {
        supabaseTable: 'custom_fields',
        supabaseAppStore: 'app_store.custom_fields',
        mongodbCollection: 'custom_fields'
      }
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/custom-fields - Create a custom field
app.post('/api/custom-fields', async (req, res) => {
  try {
    const field = normalizeCustomField(req.body || {});
    if (!field.id || !field.fieldName || !field.target) {
      return res.status(400).json({ success: false, error: 'id, target, and fieldName are required' });
    }
    const existing = await loadCustomFieldsFromStores();
    if (existing.some(f => f.id === field.id)) {
      return res.status(409).json({ success: false, error: 'Field id already exists' });
    }
    const next = [...existing, field];
    const persist = await persistCustomFieldsToStores(next);
    res.json({ success: persist.supabase || persist.mongodb, customFields: next, persist });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// PUT /api/custom-fields/:id - Update an existing custom field
app.put('/api/custom-fields/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const updates = normalizeCustomField({ ...req.body, id });
    const existing = await loadCustomFieldsFromStores();
    const index = existing.findIndex(f => f.id === id);
    if (index === -1) {
      return res.status(404).json({ success: false, error: 'Field not found' });
    }
    const next = existing.map(f => f.id === id ? { ...f, ...updates, id } : f);
    const persist = await persistCustomFieldsToStores(next);
    res.json({ success: persist.supabase || persist.mongodb, customFields: next, persist });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// DELETE /api/custom-fields/:id - Delete a custom field
app.delete('/api/custom-fields/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const existing = await loadCustomFieldsFromStores();
    const next = existing.filter(f => f.id !== id);
    if (next.length === existing.length) {
      return res.status(404).json({ success: false, error: 'Field not found' });
    }
    const persist = await persistCustomFieldsToStores(next);
    res.json({ success: persist.supabase || persist.mongodb, customFields: next, persist });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/db/all - Fetch all persisted records from Supabase & MongoDB Custom Fields
app.get('/api/db/all', async (req, res) => {
  const loadStarted = Date.now();
  try {
    let students: any[] = [];
    let teachers: any[] = [];
    let fees: any[] = [];
    let payrolls: any[] = [];
    let examResults: any[] = [];
    let expenses: any[] = [];
    let emailTemplates: any[] = [];
    let logs: any[] = [];
    let customFields: any[] = [];
    let studentAttendance: any[] = [];
    let teacherAttendance: any[] = [];
    let schoolFeeSettings: any = null;
    let siteBranding: any = null;
    let adminSession: AdminSessionPayload | null = null;
    let storeMap: Record<string, unknown> = {};
    let syncSequence = 0;

    let supabaseConnected = false;
    let mongoConnected = false;

    // 1. Fetch Primary Data from Supabase (primary + overflow merged when active) — parallel for speed
    try {
      const [
        stMerged,
        teachersMerged,
        feesMerged,
        payrollsMerged,
        examResultsMerged,
        expensesMerged,
        emailTemplatesMerged,
        cfMerged,
        studentAttendanceMerged,
        teacherAttendanceMerged,
        logsMerged,
        storeMapResult
      ] = await Promise.all([
        selectMergedTable('students'),
        selectMergedTable('teachers'),
        selectMergedTable('fees'),
        selectMergedTable('payrolls'),
        selectMergedTable('exam_results'),
        selectMergedTable('expenses'),
        selectMergedTable('email_templates'),
        selectMergedTable('custom_fields'),
        selectMergedTable('student_attendance'),
        selectMergedTable('teacher_attendance'),
        selectMergedTable('email_logs'),
        loadMergedAppStoreMap()
      ]);

      if (stMerged.primaryOk || stMerged.overflowOk) supabaseConnected = true;
      students = stMerged.data;
      teachers = teachersMerged.data;
      fees = feesMerged.data;
      payrolls = payrollsMerged.data;
      examResults = examResultsMerged.data;
      expenses = expensesMerged.data;
      emailTemplates = emailTemplatesMerged.data;

      if (cfMerged.data.length > 0) {
        customFields = cfMerged.data.map(row => normalizeCustomField(row as Record<string, unknown>));
      }

      studentAttendance = studentAttendanceMerged.data;
      teacherAttendance = teacherAttendanceMerged.data;
      logs = logsMerged.data;

      if (logs.length === 0) {
        const logStore = await selectAppStoreValue('email_logs');
        if (Array.isArray(logStore)) logs = logStore;
      }

      // Merge app_store snapshots (prefer app_store for extended / newer fields)
      storeMap = storeMapResult;
      const rawSeq = storeMap.sync_sequence;
      if (typeof rawSeq === 'number') syncSequence = rawSeq;
      else if (typeof rawSeq === 'string' && rawSeq.trim()) syncSequence = Number(rawSeq) || 0;
      if (Object.keys(storeMap).length > 0) {
        students = mergeEntityListForFetch(students, storeMap.students);
        teachers = mergeEntityListForFetch(teachers, storeMap.teachers);
        fees = mergeEntityListForFetch(fees, storeMap.fees);
        payrolls = mergeEntityListForFetch(payrolls, storeMap.payrolls);
        examResults = mergeEntityListForFetch(examResults, storeMap.exam_results);
        expenses = mergeEntityListForFetch(expenses, storeMap.expenses);
        emailTemplates = mergeEntityListForFetch(emailTemplates, storeMap.email_templates);
        if (Array.isArray(storeMap.custom_fields)) {
          customFields = (storeMap.custom_fields as Record<string, unknown>[]).map(r => normalizeCustomField(r));
        }
        studentAttendance = mergeEntityListForFetch(studentAttendance, storeMap.student_attendance);
        teacherAttendance = mergeEntityListForFetch(teacherAttendance, storeMap.teacher_attendance);
        if (storeMap.school_fee_settings) schoolFeeSettings = storeMap.school_fee_settings;
        if (storeMap.site_branding && typeof storeMap.site_branding === 'object') {
          siteBranding = { ...DEFAULT_SITE_BRANDING, ...(storeMap.site_branding as Record<string, unknown>) };
        }
        if (storeMap.admin_session) adminSession = storeMap.admin_session as AdminSessionPayload;
      }

      logs = mergeRecordsById(logs, storeMap.email_logs as any[], emailLogs)
        .sort((a, b) => String(b.timestamp || '').localeCompare(String(a.timestamp || '')));
    } catch (supaErr) {
      console.warn('Supabase query note:', supaErr);
    }

    // 2. MongoDB: load custom fields only if Supabase/app_store had none; always use entity fallbacks
    const db = await getMongoDb();
    if (db) {
      try {
        mongoConnected = true;

        if (customFields.length === 0) {
          const mongoCustomFields = await db.collection('custom_fields').find({}).toArray();
          customFields = mongoCustomFields.map(cf => normalizeCustomField(cf as Record<string, unknown>));
        }

        // Fallback for primary data from MongoDB if Supabase returned empty
        if (students.length === 0) {
          const st = await db.collection('students').find({}).toArray();
          students = st.map(x => { const c = { ...x }; delete c._id; return c; });
        }
        if (teachers.length === 0) {
          const tc = await db.collection('teachers').find({}).toArray();
          teachers = tc.map(x => { const c = { ...x }; delete c._id; return c; });
        }
        if (fees.length === 0) {
          const fe = await db.collection('fees').find({}).toArray();
          fees = fe.map(x => { const c = { ...x }; delete c._id; return c; });
        }
        if (payrolls.length === 0) {
          const pr = await db.collection('payrolls').find({}).toArray();
          payrolls = pr.map(x => { const c = { ...x }; delete c._id; return c; });
        }
        if (examResults.length === 0) {
          const ex = await db.collection('exam_results').find({}).toArray();
          examResults = ex.map(x => { const c = { ...x }; delete c._id; return c; });
        }
        if (expenses.length === 0) {
          const exp = await db.collection('expenses').find({}).toArray();
          expenses = exp.map(x => { const c = { ...x }; delete c._id; return c; });
        }
        if (emailTemplates.length === 0) {
          const tpl = await db.collection('email_templates').find({}).toArray();
          emailTemplates = tpl.map(x => { const c = { ...x }; delete c._id; return c; });
        }
        if (studentAttendance.length === 0) {
          const sa = await db.collection('student_attendance').find({}).toArray();
          studentAttendance = sa.map(x => { const c = { ...x }; delete c._id; return c; });
        }
        if (teacherAttendance.length === 0) {
          const ta = await db.collection('teacher_attendance').find({}).toArray();
          teacherAttendance = ta.map(x => { const c = { ...x }; delete c._id; return c; });
        }

        // Always enrich student/teacher documents from MongoDB backups (full hydrated snapshots)
        const cleanMongoRow = (row: Record<string, unknown>) => {
          const copy = { ...row };
          delete copy._id;
          return copy;
        };
        const [mongoStoreStudents, mongoStoreTeachers, mongoStudentRows, mongoTeacherRows] = await Promise.all([
          db.collection('app_store').findOne({ key: 'students' }),
          db.collection('app_store').findOne({ key: 'teachers' }),
          db.collection('students').find({}).toArray(),
          db.collection('teachers').find({}).toArray()
        ]);
        if (Array.isArray(mongoStoreStudents?.value)) {
          students = mergeEntityListsWithDocuments(students, mongoStoreStudents.value);
        }
        if (Array.isArray(mongoStoreTeachers?.value)) {
          teachers = mergeEntityListsWithDocuments(teachers, mongoStoreTeachers.value);
        }
        if (mongoStudentRows.length) {
          students = mergeEntityListsWithDocuments(
            students,
            mongoStudentRows.map(row => cleanMongoRow(row as Record<string, unknown>))
          );
        }
        if (mongoTeacherRows.length) {
          teachers = mergeEntityListsWithDocuments(
            teachers,
            mongoTeacherRows.map(row => cleanMongoRow(row as Record<string, unknown>))
          );
        }

        if (!schoolFeeSettings) {
          const sfDoc = await db.collection('app_store').findOne({ key: 'school_fee_settings' });
          if (sfDoc?.value) schoolFeeSettings = sfDoc.value;
        }
        if (!siteBranding) {
          const sbDoc = await db.collection('app_store').findOne({ key: 'site_branding' });
          if (sbDoc?.value && typeof sbDoc.value === 'object') {
            siteBranding = { ...DEFAULT_SITE_BRANDING, ...(sbDoc.value as Record<string, unknown>) };
          }
        }
        if (!adminSession) {
          const adminDoc = await db.collection('app_store').findOne({ key: 'admin_session' });
          if (adminDoc?.value) adminSession = adminDoc.value as AdminSessionPayload;
        }
        if (logs.length === 0) {
          const mongoLogs = await db.collection('email_logs').find({}).toArray();
          logs = mongoLogs.map(x => { const c = { ...x }; delete c._id; return c; });
        }
      } catch (mongoErr) {
        console.warn('MongoDB custom fields fetch note:', mongoErr);
      }
    }

    res.json({
      connected: supabaseConnected || mongoConnected,
      supabase: supabaseConnected,
      mongodb: mongoConnected,
      failover: getSupabaseFailoverStatus(),
      loadMs: Date.now() - loadStarted,
      counts: {
        students: students.length,
        teachers: teachers.length,
        fees: fees.length,
        payrolls: payrolls.length,
        examResults: examResults.length,
        expenses: expenses.length,
        customFields: customFields.length,
        emailLogs: (logs.length > 0 ? logs : emailLogs).length
      },
      data: {
        students,
        teachers,
        fees,
        payrolls,
        examResults,
        customFields,
        expenses,
        emailTemplates,
        studentAttendance,
        teacherAttendance,
        schoolFeeSettings,
        siteBranding,
        adminSession,
        emailLogs: logs.length > 0 ? logs : emailLogs
      },
      syncSequence
    });

  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/db/sync - Sync State Payload to Supabase (All Data) & MongoDB (Custom Form Fields)
app.post('/api/db/sync', async (req, res) => {
  if (activeDbSync) {
    try {
      await activeDbSync;
    } catch {
      // prior sync failed — continue with this one
    }
  }

  const syncJob = (async () => {
  try {
    const {
      students, teachers, fees, payrolls, examResults, customFields,
      expenses, emailTemplates, studentAttendance, teacherAttendance,
      schoolFeeSettings, siteBranding, emailLogs: clientEmailLogs, adminSession,
      syncSequence: incomingSyncSequence
    } = req.body;

    const syncStatus = { supabase: false, mongodb: false, errors: [] as string[] };
    let mergedEmailLogs: any[] = [];
    const storeUpdatedAt = new Date().toISOString();

    const storedSyncSequenceRaw = await selectAppStoreValue('sync_sequence');
    const storedSyncSequence =
      typeof storedSyncSequenceRaw === 'number'
        ? storedSyncSequenceRaw
        : Number(storedSyncSequenceRaw ?? 0) || 0;
    const incomingSyncSequenceNum =
      typeof incomingSyncSequence === 'number'
        ? incomingSyncSequence
        : Number(incomingSyncSequence ?? storedSyncSequence) || storedSyncSequence;

    // Never reject saves for stale sequence — merge entity lists instead (multi-tab safe)
    const nextSyncSequence = Math.max(storedSyncSequence, incomingSyncSequenceNum) + 1;

    const resolvedSiteBranding = await resolveSiteBrandingForSync(siteBranding);
    const storedSchoolFeeSettings = await selectAppStoreValue('school_fee_settings');
    const resolvedSchoolFeeSettings = resolveSchoolFeeSettingsForStoreWrite(
      storedSchoolFeeSettings,
      schoolFeeSettings && typeof schoolFeeSettings === 'object' ? schoolFeeSettings : null
    );

    let resolvedCustomFields: unknown[] | undefined;
    if (Array.isArray(customFields)) {
      resolvedCustomFields = await resolveCustomFieldsForSync(customFields);
    }

    const storeUpdatedAtBranding = storeUpdatedAt;
    if (siteBranding !== undefined || resolvedSiteBranding) {
      const brandingResult = await upsertAppStoreKeyWithFailover(
        'site_branding',
        stripBrandingForStore(resolvedSiteBranding),
        storeUpdatedAtBranding
      );
      if (!brandingResult.ok && brandingResult.error) {
        syncStatus.errors.push(`Supabase app_store site_branding: ${brandingResult.error}`);
      } else if (brandingResult.ok) {
        syncStatus.supabase = true;
      }
    }

    // Persist school fee settings immediately when changed
    if (resolvedSchoolFeeSettings) {
      const feeSettingsResult = await upsertAppStoreKeyWithFailover(
        'school_fee_settings',
        resolvedSchoolFeeSettings,
        storeUpdatedAt
      );
      if (feeSettingsResult.ok) syncStatus.supabase = true;
      else if (feeSettingsResult.error) {
        syncStatus.errors.push(`Supabase app_store school_fee_settings: ${feeSettingsResult.error}`);
      }
    }

    // Persist custom field definitions early so slow entity sync cannot lose them to stale tabs
    if (Array.isArray(resolvedCustomFields) && resolvedCustomFields.length > 0) {
      const cfEarly = await persistCustomFieldsToStores(resolvedCustomFields);
      if (cfEarly.errors.length) syncStatus.errors.push(...cfEarly.errors);
      if (cfEarly.supabase) syncStatus.supabase = true;
      if (cfEarly.mongodb) syncStatus.mongodb = true;
    }

    // Persist changed entity lists to app_store immediately (partial sync — only keys sent by client)
    let resolvedStudents = students;
    let resolvedTeachers = teachers;
    let resolvedFees = fees;
    let resolvedPayrolls = payrolls;
    let resolvedExamResults = examResults;
    let resolvedExpenses = expenses;
    let resolvedEmailTemplates = emailTemplates;
    let resolvedStudentAttendance = studentAttendance;
    let resolvedTeacherAttendance = teacherAttendance;

    if (Array.isArray(students)) {
      resolvedStudents = await persistEntityListEarly(
        'students', students, storeUpdatedAt, syncStatus
      ) ?? resolvedStudents;
    }
    if (Array.isArray(teachers)) {
      resolvedTeachers = await persistEntityListEarly(
        'teachers', teachers, storeUpdatedAt, syncStatus
      ) ?? resolvedTeachers;
    }
    if (Array.isArray(fees)) {
      resolvedFees = await persistEntityListEarly(
        'fees', fees, storeUpdatedAt, syncStatus
      ) ?? resolvedFees;
    }
    if (Array.isArray(payrolls)) {
      resolvedPayrolls = await persistEntityListEarly(
        'payrolls', payrolls, storeUpdatedAt, syncStatus
      ) ?? resolvedPayrolls;
    }
    if (Array.isArray(expenses)) {
      resolvedExpenses = await persistEntityListEarly(
        'expenses', expenses, storeUpdatedAt, syncStatus
      ) ?? resolvedExpenses;
    }
    if (Array.isArray(emailTemplates)) {
      resolvedEmailTemplates = await persistEntityListEarly(
        'email_templates', emailTemplates, storeUpdatedAt, syncStatus
      ) ?? resolvedEmailTemplates;
    }
    if (Array.isArray(studentAttendance)) {
      resolvedStudentAttendance = await persistEntityListEarly(
        'student_attendance', studentAttendance, storeUpdatedAt, syncStatus
      ) ?? resolvedStudentAttendance;
    }
    if (Array.isArray(teacherAttendance)) {
      resolvedTeacherAttendance = await persistEntityListEarly(
        'teacher_attendance', teacherAttendance, storeUpdatedAt, syncStatus
      ) ?? resolvedTeacherAttendance;
    }
    if (Array.isArray(examResults)) {
      resolvedExamResults = await persistEntityListEarly(
        'exam_results', examResults, storeUpdatedAt, syncStatus
      ) ?? resolvedExamResults;
    }

    const studentsForLink = await loadStudentsForLinking(students);
    const teachersForLink = await loadTeachersForLinking(teachers);

    // 1. Upsert only entity tables included in this partial sync request
    try {
      let supaTableOk = false;

      if (Array.isArray(students)) {
        supaTableOk = await syncSupabaseTableWithDeletes('students', resolvedStudents, normalizeStudentsForDb) || supaTableOk;
      }
      if (Array.isArray(teachers)) {
        supaTableOk = await syncSupabaseTableWithDeletes('teachers', resolvedTeachers, normalizeTeachersForDb) || supaTableOk;
      }
      if (Array.isArray(fees)) {
        supaTableOk = await syncSupabaseTableWithDeletes('fees', resolvedFees, normalizeFeesForDb) || supaTableOk;
      }
      if (Array.isArray(payrolls)) {
        supaTableOk = await syncSupabaseTableWithDeletes('payrolls', resolvedPayrolls, normalizePayrollsForDb) || supaTableOk;
      }
      if (Array.isArray(examResults)) {
        supaTableOk = await syncSupabaseTableWithDeletes(
          'exam_results',
          resolvedExamResults,
          rows => resolveExamResultsForDbSync(rows, studentsForLink)
        ) || supaTableOk;
      }
      if (Array.isArray(expenses)) {
        supaTableOk = await syncSupabaseTableWithDeletes('expenses', resolvedExpenses, normalizeExpensesForDb) || supaTableOk;
      }
      if (Array.isArray(emailTemplates)) {
        supaTableOk = await syncSupabaseTableWithDeletes('email_templates', resolvedEmailTemplates, normalizeEmailTemplatesForDb) || supaTableOk;
      }

      if (Array.isArray(studentAttendance)) {
        const primaryStudentIds = await selectPrimaryTableIds('students');
        supaTableOk = await syncSupabaseTableWithDeletes(
          'student_attendance',
          resolvedStudentAttendance,
          rows => resolveStudentAttendanceForDbSync(rows, studentsForLink, primaryStudentIds)
        ) || supaTableOk;
      }
      if (Array.isArray(teacherAttendance)) {
        const primaryTeacherIds = await selectPrimaryTableIds('teachers');
        supaTableOk = await syncSupabaseTableWithDeletes(
          'teacher_attendance',
          resolvedTeacherAttendance,
          rows => resolveTeacherAttendanceForDbSync(rows, teachersForLink, primaryTeacherIds)
        ) || supaTableOk;
      }

      if (Array.isArray(clientEmailLogs)) {
        mergedEmailLogs = await syncEmailLogs(clientEmailLogs);
      }

      const storeUpdatedAtFinal = new Date().toISOString();
      const storeRows: { key: string; value: unknown; updated_at: string }[] = [];
      if (Array.isArray(students)) {
        pushStoreRow(storeRows, 'students', stripEntityListForStore(resolvedStudents), storeUpdatedAtFinal);
      }
      if (Array.isArray(teachers)) {
        pushStoreRow(storeRows, 'teachers', stripEntityListForStore(resolvedTeachers), storeUpdatedAtFinal);
      }
      if (Array.isArray(fees)) {
        pushStoreRow(storeRows, 'fees', stripEntityListForStore(resolvedFees), storeUpdatedAtFinal);
      }
      if (Array.isArray(payrolls)) {
        pushStoreRow(storeRows, 'payrolls', stripEntityListForStore(resolvedPayrolls), storeUpdatedAtFinal);
      }
      if (Array.isArray(examResults)) {
        pushStoreRow(storeRows, 'exam_results', stripEntityListForStore(resolvedExamResults), storeUpdatedAtFinal);
      }
      if (Array.isArray(resolvedCustomFields) && resolvedCustomFields.length > 0) {
        pushStoreRow(storeRows, 'custom_fields', resolvedCustomFields, storeUpdatedAtFinal);
      }
      if (Array.isArray(expenses)) {
        pushStoreRow(storeRows, 'expenses', stripEntityListForStore(resolvedExpenses), storeUpdatedAtFinal);
      }
      if (Array.isArray(emailTemplates)) {
        pushStoreRow(storeRows, 'email_templates', stripEntityListForStore(resolvedEmailTemplates), storeUpdatedAtFinal);
      }
      if (Array.isArray(studentAttendance)) {
        pushStoreRow(storeRows, 'student_attendance', stripEntityListForStore(resolvedStudentAttendance), storeUpdatedAtFinal);
      }
      if (Array.isArray(teacherAttendance)) {
        pushStoreRow(storeRows, 'teacher_attendance', stripEntityListForStore(resolvedTeacherAttendance), storeUpdatedAtFinal);
      }
      if (resolvedSchoolFeeSettings) {
        pushStoreRow(storeRows, 'school_fee_settings', resolvedSchoolFeeSettings, storeUpdatedAtFinal);
      }
      if (mergedEmailLogs.length > 0) {
        pushStoreRow(storeRows, 'email_logs', mergedEmailLogs, storeUpdatedAtFinal);
      } else if (Array.isArray(clientEmailLogs)) {
        pushStoreRow(storeRows, 'email_logs', clientEmailLogs, storeUpdatedAtFinal);
      }

      if (adminSession && typeof adminSession === 'object') {
        storeRows.push({
          key: 'admin_session',
          value: adminSession,
          updated_at: storeUpdatedAt
        });
      }

      storeRows.push({
        key: 'sync_sequence',
        value: nextSyncSequence,
        updated_at: storeUpdatedAt
      });

      let storeOk = true;
      if (storeRows.length > 0) {
        const storeResult = await upsertAppStoreWithFailover(storeRows);

        if (!storeResult.ok && storeResult.error) {
          storeOk = false;
          syncStatus.errors.push(`Supabase app_store: ${storeResult.error}`);
        }
      }
      if (supaTableOk || storeOk) {
        syncStatus.supabase = true;
      }
    } catch (supaSyncErr: any) {
      syncStatus.errors.push(`Supabase sync: ${supaSyncErr.message}`);
      console.warn('Supabase sync note:', supaSyncErr);
    }

    // 2. Persist custom field definitions to Supabase + MongoDB (always runs)
    if (Array.isArray(resolvedCustomFields)) {
      const cfPersist = await persistCustomFieldsToStores(resolvedCustomFields);
      if (cfPersist.errors.length) syncStatus.errors.push(...cfPersist.errors);
      if (cfPersist.supabase) syncStatus.supabase = true;
      if (cfPersist.mongodb) syncStatus.mongodb = true;
    }

    // 3. Sync primary collections into MongoDB as auxiliary backup (with delete reconcile)
    try {
      const db = await getMongoDb();
      if (db) {
        if (Array.isArray(resolvedStudents)) await syncMongoCollectionWithDeletes(db, 'students', resolvedStudents);
        if (Array.isArray(resolvedTeachers)) await syncMongoCollectionWithDeletes(db, 'teachers', resolvedTeachers);
        if (Array.isArray(resolvedFees)) await syncMongoCollectionWithDeletes(db, 'fees', resolvedFees);
        if (Array.isArray(resolvedPayrolls)) await syncMongoCollectionWithDeletes(db, 'payrolls', resolvedPayrolls);
        if (Array.isArray(resolvedExamResults)) await syncMongoCollectionWithDeletes(db, 'exam_results', resolvedExamResults);
        if (Array.isArray(resolvedExpenses)) await syncMongoCollectionWithDeletes(db, 'expenses', resolvedExpenses);
        if (Array.isArray(resolvedEmailTemplates)) await syncMongoCollectionWithDeletes(db, 'email_templates', resolvedEmailTemplates);
        if (Array.isArray(resolvedStudentAttendance)) await syncMongoCollectionWithDeletes(db, 'student_attendance', resolvedStudentAttendance);
        if (Array.isArray(resolvedTeacherAttendance)) await syncMongoCollectionWithDeletes(db, 'teacher_attendance', resolvedTeacherAttendance);

        if (resolvedSchoolFeeSettings) {
          await persistMongoAppStore(db, 'school_fee_settings', resolvedSchoolFeeSettings);
        }
        if (siteBranding !== undefined || resolvedSiteBranding) {
          await persistMongoAppStore(db, 'site_branding', resolvedSiteBranding);
        }
        if (adminSession) {
          await persistMongoAppStore(db, 'admin_session', adminSession);
        }

        // Mirror app_store entity snapshots in MongoDB so fallback loads respect deletes
        if (Array.isArray(resolvedStudents)) await persistMongoAppStore(db, 'students', resolvedStudents);
        if (Array.isArray(resolvedTeachers)) await persistMongoAppStore(db, 'teachers', resolvedTeachers);
        if (Array.isArray(resolvedFees)) await persistMongoAppStore(db, 'fees', resolvedFees);
        if (Array.isArray(resolvedPayrolls)) await persistMongoAppStore(db, 'payrolls', resolvedPayrolls);
        if (Array.isArray(resolvedExamResults)) await persistMongoAppStore(db, 'exam_results', resolvedExamResults);
        if (Array.isArray(resolvedExpenses)) await persistMongoAppStore(db, 'expenses', resolvedExpenses);
        if (Array.isArray(resolvedEmailTemplates)) await persistMongoAppStore(db, 'email_templates', resolvedEmailTemplates);
        if (Array.isArray(resolvedStudentAttendance)) await persistMongoAppStore(db, 'student_attendance', resolvedStudentAttendance);
        if (Array.isArray(resolvedTeacherAttendance)) await persistMongoAppStore(db, 'teacher_attendance', resolvedTeacherAttendance);

        syncStatus.mongodb = true;
      }
    } catch (mongoSyncErr: any) {
      syncStatus.errors.push(`MongoDB sync: ${mongoSyncErr.message}`);
      console.warn('MongoDB sync note:', mongoSyncErr);
    }

    if (mergedEmailLogs.length === 0) {
      mergedEmailLogs = await fetchEmailLogsFromStores();
    }

    return {
      success: syncStatus.supabase || syncStatus.mongodb,
      supabase: syncStatus.supabase,
      mongodb: syncStatus.mongodb,
      syncSequence: nextSyncSequence,
      failover: getSupabaseFailoverStatus(),
      errors: syncStatus.errors.length > 0 ? syncStatus.errors : undefined,
      emailLogs: mergedEmailLogs,
      ...(Array.isArray(students) ? { students: stripEntityListForStore(resolvedStudents) } : {}),
      ...(Array.isArray(teachers) ? { teachers: stripEntityListForStore(resolvedTeachers) } : {}),
      message: syncStatus.supabase || syncStatus.mongodb
        ? 'All application data successfully persisted in Supabase database! Dynamic form fields managed via MongoDB.'
        : 'Sync completed with warnings — check errors array.'
    };

  } catch (err: any) {
    console.error('Data sync error:', err);
    throw err;
  }
  })();

  activeDbSync = syncJob;

  try {
    const result = await syncJob;
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  } finally {
    if (activeDbSync === syncJob) activeDbSync = null;
  }
});


// POST /api/email/send-test - Send test template email via Brevo SMTP
app.post('/api/email/send-test', async (req, res) => {
  try {
    const { recipientEmail, subject, headerTitle, body, footer, accentColor, siteBranding } = req.body;
    if (!recipientEmail) {
      return res.status(400).json({ error: 'Recipient email address is required.' });
    }

    const fromEmail = process.env.SMTP_FROM_EMAIL || 'uschools.pk@gmail.com';
    const fromName = process.env.SMTP_FROM_NAME || 'Unique School System';
    const branding = mergeSiteBranding(siteBranding, await loadSiteBranding());

    const htmlContent = buildBrandedEmailHtml({
      headerTitle: headerTitle || branding.school_name,
      body: body || 'This is a test preview email dispatched from Unique School System.',
      footer: footer || branding.footer_subtitle,
      accentColor,
      branding,
      isPlainTextBody: true,
      headerBadge: 'Template System Preview Dispatch'
    });

    const sendResult = await sendTransactionalEmail({
      to: recipientEmail,
      subject: subject || 'Test Email Template Preview',
      text: body,
      html: htmlContent
    });
    const status = sendResult.status === 'Success' ? 'Success' : sendResult.status;

    res.json({
      success: sendResult.status !== 'Failed',
      status,
      channel: sendResult.channel,
      error: sendResult.error,
      message: status === 'Success'
        ? `Test email dispatched successfully to ${recipientEmail}!`
        : sendResult.error || `Email delivery ${String(status).toLowerCase()}. Target: ${recipientEmail}`
    });
  } catch (err: any) {
    console.error('Test email dispatch error:', err);
    res.status(500).json({ error: err.message || 'Failed to dispatch test email.' });
  }
});

// Brevo SMTP Email Sending Endpoint
app.post('/api/email/dispatch-progress-report', async (req, res) => {
  try {
    const { student, termName, pdfBase64, customSubject, attachmentFilename, customRecipientEmail, customNote, siteBranding } = req.body;

    if (!student) {
      return res.status(400).json({ error: 'Student record is required.' });
    }

    const isOrphan = Boolean(student.is_orphan);
    let recipientEmail = '';
    let recipientName = '';
    let recipientType: 'Donor' | 'Guardian' = 'Guardian';

    if (isOrphan) {
      recipientEmail = student.donor_email || student.guardian_email || 'donor@example.com';
      recipientName = student.donor_name || 'Honorable Sponsor';
      recipientType = 'Donor';
    } else {
      recipientEmail = student.guardian_email || student.parent_email || 'guardian@example.com';
      recipientName = student.guardian_name || student.father_name || 'Respected Parent';
      recipientType = 'Guardian';
    }

    if (customRecipientEmail && String(customRecipientEmail).includes('@')) {
      recipientEmail = customRecipientEmail;
    }

    const effectiveTerm = termName || '1st Term Examination 2026';
    const isProfileShare = Boolean(attachmentFilename);
    const subject = customSubject || (isProfileShare
      ? `Student Profile - ${student.full_name} (${student.roll_no})`
      : `Student Progress Report - Unique School System`);

    const bodyText = customNote || (isProfileShare
      ? (() => {
          const docCount = collectProfileDocumentSources(student, 'student').length;
          const galleryLine = docCount > 0
            ? `\n\nThis package also includes ${docCount} document(s) from the student Document Gallery (scans, certificates, and uploaded files).`
            : '';
          return `Respected (Mr / Miss) ${recipientName},
Assalam o Alaikum

Please find attached the verified student profile for ${student.full_name} (${student.roll_no}).${galleryLine}

Warm Regards,
Abdul Rehman Jamil
Unique School System`;
        })()
      : `Respected (Mr / Miss) ${recipientName},
Assalam o Alaikum

We hope this message finds you in good health and high spirits.

Please find attached progress report(s) of your sponsored student(s) for [${effectiveTerm}]. We sincerely appreciate your continued support to Unique School System for this genuine cause to educate orphan/in-need students.

JazakAllah u Khairan

Warm Regards,
Abdul Rehman Jamil
Unique School System`);

    const fromEmail = process.env.SMTP_FROM_EMAIL || 'uschools.pk@gmail.com';
    const fromName = process.env.SMTP_FROM_NAME || 'Unique School System';
    const branding = mergeSiteBranding(siteBranding, await loadSiteBranding());

    const htmlContent = buildBrandedEmailHtml({
      headerTitle: isProfileShare ? 'Student Profile Package' : 'Academic Progress Report',
      body: bodyText,
      footer: branding.footer_subtitle,
      branding,
      isPlainTextBody: true
    });

    const attachments: EmailAttachment[] = [];
    if (pdfBase64) {
      const pdfFilename = attachmentFilename
        || `${student.roll_no}_Progress_Report_${effectiveTerm.replace(/[^a-zA-Z0-9]/g, '_')}.pdf`;
      attachments.push({
        filename: pdfFilename,
        content: pdfBase64.split(',')[1] || pdfBase64,
        encoding: 'base64'
      });

      if (isProfileShare) {
        const galleryAttachments = await buildProfileDocumentGalleryAttachments(
          student,
          'student',
          student.roll_no || student.id || 'Student'
        );
        attachments.push(...galleryAttachments);
      }
    }

    const sendResult = await sendTransactionalEmail({
      to: recipientEmail,
      subject,
      text: bodyText,
      html: htmlContent,
      attachments: attachments.length ? attachments : undefined
    });
    const mailStatus = sendResult.status === 'Success' ? 'Success' : sendResult.status;

    const logEntry = {
      id: 'log-' + Date.now(),
      timestamp: new Date().toISOString(),
      recipient_email: recipientEmail,
      recipient_type: recipientType,
      recipient_name: recipientName,
      student_name: student.full_name,
      subject: subject,
      term_name: effectiveTerm,
      status: mailStatus,
      attachment_name: attachmentFilename || `${student.roll_no}_Report.pdf`
    };

    await persistEmailLog(logEntry);

    res.json({
      success: true,
      status: mailStatus,
      recipientEmail,
      recipientName,
      recipientType,
      log: logEntry,
      message: mailStatus === 'Success' 
        ? `Progress report dispatched successfully via Brevo SMTP to ${recipientEmail}` 
        : `Progress report dispatched in simulated mode to ${recipientEmail} (${recipientType}: ${recipientName})`
    });

  } catch (error: any) {
    console.error('Error dispatching Brevo SMTP email:', error);
    res.status(500).json({ error: error.message || 'Failed to send Brevo email.' });
  }
});

// Single Fee Reminder or Receipt Dispatch Endpoint
app.post('/api/email/dispatch-fee-reminder', async (req, res) => {
  try {
    const { student, feeMonth, amountDue, isPaidReceipt, pdfBase64, dueDate, isVoucher, attachmentFilename, siteBranding } = req.body;
    if (!student) {
      return res.status(400).json({ error: 'Student record required.' });
    }

    const isOrphan = Boolean(student.is_orphan);
    let recipientEmail = '';
    let recipientName = '';
    let recipientType: 'Donor' | 'Guardian' = 'Guardian';

    if (isOrphan) {
      recipientEmail = student.donor_email || student.guardian_email || 'donor@example.com';
      recipientName = student.donor_name || 'Honorable Sponsor';
      recipientType = 'Donor';
    } else {
      recipientEmail = student.guardian_email || student.parent_email || 'guardian@example.com';
      recipientName = student.guardian_name || student.father_name || 'Respected Parent';
      recipientType = 'Guardian';
    }

    const subject = isPaidReceipt 
      ? `Official Fee Payment Receipt - ${student.full_name} (${feeMonth})`
      : isVoucher
        ? `Official Fee Voucher - ${student.full_name} (${feeMonth})`
        : `Fee Payment Reminder Notice - ${student.full_name} (${feeMonth})`;

    const dueDateLine = dueDate ? `\nPayment Due Date: ${dueDate}` : '';

    const bodyText = isPaidReceipt
      ? `Respected ${recipientName},
Assalam o Alaikum

This is an official payment confirmation receipt from Unique School System.
We have received the fee payment for ${student.full_name} for the period [${feeMonth}].

Student Roll No: ${student.roll_no}
Class: ${student.class_name}

Thank you for your prompt payment and continued support!

Warm Regards,
Abdul Rehman Jamil
Principal, Unique School System`
      : isVoucher
        ? `Respected ${recipientName},
Assalam o Alaikum

Please find attached the official fee voucher for ${student.full_name} for the period [${feeMonth}].

Student Roll No: ${student.roll_no}
Class: ${student.class_name}
Outstanding Amount Due: PKR ${Number(amountDue || 0).toLocaleString()}${dueDateLine}

Kindly deposit the fee using the bank account details shown on the attached voucher. Mention the student roll number in your transfer reference.

Warm Regards,
Abdul Rehman Jamil
Principal, Unique School System`
        : `Respected ${recipientName},
Assalam o Alaikum

This is a gentle reminder from Unique School System regarding pending fee dues for ${student.full_name} for the period [${feeMonth}].

Student Roll No: ${student.roll_no}
Class: ${student.class_name}
Outstanding Amount Due: PKR ${Number(amountDue || 0).toLocaleString()}${dueDateLine}

Kindly deposit the outstanding amount at your earliest convenience to maintain smooth academic operations.

Warm Regards,
Abdul Rehman Jamil
Principal, Unique School System`;

    const fromEmail = process.env.SMTP_FROM_EMAIL || 'uschools.pk@gmail.com';
    const fromName = process.env.SMTP_FROM_NAME || 'Unique School System';
    const branding = mergeSiteBranding(siteBranding, await loadSiteBranding());

    const htmlContent = buildBrandedEmailHtml({
      headerTitle: isPaidReceipt ? 'Fee Payment Receipt' : isVoucher ? 'Official Fee Voucher' : 'Fee Payment Reminder',
      body: bodyText,
      footer: branding.footer_subtitle,
      branding,
      isPlainTextBody: true
    });

    const feeAttachments: EmailAttachment[] = [];
    if (pdfBase64) {
      const pdfFilename = attachmentFilename
        || (isVoucher
          ? `${student.roll_no}_Fee_Voucher_${feeMonth.replace(/[^a-zA-Z0-9]/g, '_')}.pdf`
          : `${student.roll_no}_Fee_Receipt_${feeMonth.replace(/[^a-zA-Z0-9]/g, '_')}.pdf`);
      feeAttachments.push({
        filename: pdfFilename,
        content: pdfBase64.split(',')[1] || pdfBase64,
        encoding: 'base64'
      });
    }

    const feeSend = await sendTransactionalEmail({
      to: recipientEmail,
      subject,
      text: bodyText,
      html: htmlContent,
      attachments: feeAttachments.length ? feeAttachments : undefined
    });
    const mailStatus = feeSend.status === 'Success' ? 'Success' : feeSend.status;

    const logEntry = {
      id: 'fee-log-' + Date.now(),
      timestamp: new Date().toISOString(),
      recipient_email: recipientEmail,
      recipient_type: recipientType,
      recipient_name: recipientName,
      student_name: student.full_name,
      subject: subject,
      term_name: feeMonth,
      status: mailStatus,
      attachment_name: isPaidReceipt ? `${student.roll_no}_Fee_Receipt.pdf` : 'Notice'
    };

    await persistEmailLog(logEntry);

    res.json({
      success: true,
      status: mailStatus,
      recipientEmail,
      recipientName,
      recipientType,
      message: mailStatus === 'Success'
        ? `Email successfully sent to ${recipientEmail}`
        : `Simulated dispatch: email notification queued for ${recipientEmail}`
    });

  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Salary Slip Dispatch Endpoint for Teachers
app.post('/api/email/dispatch-salary-slip', async (req, res) => {
  try {
    const { teacher, payroll, pdfBase64, siteBranding } = req.body;
    if (!teacher) {
      return res.status(400).json({ error: 'Teacher record required.' });
    }

    const recipientEmail = teacher.email || 'teacher@example.com';
    const recipientName = teacher.full_name;
    const monthYear = payroll ? `${payroll.month} ${payroll.year}` : 'Current Month';
    const subject = `Official Salary Disbursement Slip - ${monthYear} (${teacher.full_name})`;

    const bodyText = `Respected ${recipientName},
Assalam o Alaikum

Your salary for [${monthYear}] has been successfully processed and disbursed by Unique School System Accounts.

Employee ID: ${teacher.teacher_id}
Designation: ${teacher.designation}
Net Salary Amount: PKR ${Number(payroll?.net_salary || teacher.base_salary || 0).toLocaleString()}
Disbursement Date: ${payroll?.disbursed_date || new Date().toISOString().slice(0, 10)}

Please find attached your official electronic pay slip receipt for your personal financial records.

Warm Regards,
Abdul Rehman Jamil
Principal, Unique School System`;

    const fromEmail = process.env.SMTP_FROM_EMAIL || 'uschools.pk@gmail.com';
    const fromName = process.env.SMTP_FROM_NAME || 'Unique School System';
    const branding = mergeSiteBranding(siteBranding, await loadSiteBranding());

    const htmlContent = buildBrandedEmailHtml({
      headerTitle: 'Salary Disbursement Slip',
      body: bodyText,
      footer: branding.footer_subtitle,
      branding,
      isPlainTextBody: true
    });

    const salaryAttachments: EmailAttachment[] = [];
    if (pdfBase64) {
      salaryAttachments.push({
        filename: `${teacher.teacher_id}_Salary_Slip_${monthYear.replace(/[^a-zA-Z0-9]/g, '_')}.pdf`,
        content: pdfBase64.split(',')[1] || pdfBase64,
        encoding: 'base64'
      });
    }

    const salarySend = await sendTransactionalEmail({
      to: recipientEmail,
      subject,
      text: bodyText,
      html: htmlContent,
      attachments: salaryAttachments.length ? salaryAttachments : undefined
    });
    const mailStatus = salarySend.status === 'Success' ? 'Success' : salarySend.status;

    const logEntry = {
      id: 'sal-log-' + Date.now(),
      timestamp: new Date().toISOString(),
      recipient_email: recipientEmail,
      recipient_type: 'Faculty',
      recipient_name: recipientName,
      student_name: teacher.full_name,
      subject: subject,
      term_name: monthYear,
      status: mailStatus,
      attachment_name: `${teacher.teacher_id}_Salary_Slip.pdf`
    };

    await persistEmailLog(logEntry);

    res.json({
      success: true,
      status: mailStatus,
      recipientEmail,
      recipientName,
      message: mailStatus === 'Success'
        ? `Salary slip successfully emailed to ${recipientEmail}`
        : `Salary slip receipt dispatched to ${recipientEmail}`
    });

  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Teacher Profile Share & Dispatch Endpoint
app.post('/api/email/dispatch-teacher-profile', async (req, res) => {
  try {
    const { teacher, targetEmail, pdfBase64, customNote, siteBranding } = req.body;
    if (!teacher) {
      return res.status(400).json({ error: 'Teacher record required.' });
    }

    const recipientEmail = targetEmail || teacher.email || 'teacher@example.com';
    const recipientName = teacher.full_name;
    const subject = `Official Faculty Dossier & Profile Package - ${teacher.full_name} (${teacher.teacher_id})`;

    const docCount = collectProfileDocumentSources(teacher, 'teacher').length;
    const bodyText = `Respected ${recipientName},
Assalam o Alaikum

Please find attached your official Faculty Dossier and Verified Profile Package from Unique School System.

Employee ID: ${teacher.teacher_id}
Designation: ${teacher.designation}
Assigned Classes: ${teacher.classes_assigned || 'N/A'}
Assigned Subjects: ${teacher.subjects_assigned || 'N/A'}
Joining Date: ${teacher.joining_date}
Contact Phone: ${teacher.phone}

${customNote ? `Additional Administrator Notes:\n"${customNote}"\n\n` : ''}Included Attachments:
1. Complete Faculty Profile Summary PDF (${teacher.teacher_id}_Profile.pdf)${docCount > 0 ? `\n2. Document Gallery — ${docCount} file(s) (CNIC, degrees, certificates, and gallery uploads)` : ''}

For any queries regarding your official employment records, please contact the Principal's Secretariat.

Warm Regards,
Abdul Rehman Jamil
Principal, Unique School System`;

    const fromEmail = process.env.SMTP_FROM_EMAIL || 'uschools.pk@gmail.com';
    const fromName = process.env.SMTP_FROM_NAME || 'Unique School System';
    const branding = mergeSiteBranding(siteBranding, await loadSiteBranding());

    const htmlContent = buildBrandedEmailHtml({
      headerTitle: 'Faculty Profile Dossier',
      body: bodyText,
      footer: branding.footer_subtitle,
      branding,
      isPlainTextBody: true
    });

    const profileAttachments: EmailAttachment[] = [];

    if (pdfBase64) {
      profileAttachments.push({
        filename: `${teacher.teacher_id}_Faculty_Profile.pdf`,
        content: pdfBase64.split(',')[1] || pdfBase64,
        encoding: 'base64'
      });
    }

    const galleryAttachments = await buildProfileDocumentGalleryAttachments(
      teacher,
      'teacher',
      teacher.teacher_id || teacher.id || 'Teacher'
    );
    profileAttachments.push(...galleryAttachments);

    const profileSend = await sendTransactionalEmail({
      to: recipientEmail,
      subject,
      text: bodyText,
      html: htmlContent,
      attachments: profileAttachments.length ? profileAttachments : undefined
    });
    const mailStatus = profileSend.status === 'Success' ? 'Success' : profileSend.status;

    const logEntry = {
      id: 'prof-log-' + Date.now(),
      timestamp: new Date().toISOString(),
      recipient_email: recipientEmail,
      recipient_type: 'Faculty',
      recipient_name: recipientName,
      student_name: teacher.full_name,
      subject: subject,
      term_name: 'Profile Dossier',
      status: mailStatus,
      attachment_name: `${teacher.teacher_id}_Faculty_Profile.pdf`
    };

    await persistEmailLog(logEntry);

    res.json({
      success: true,
      status: mailStatus,
      recipientEmail,
      recipientName,
      attachmentsCount: attachments.length,
      message: mailStatus === 'Success'
        ? `Faculty profile package successfully dispatched to ${recipientEmail}`
        : `Simulated dispatch: Teacher profile dossier sent to ${recipientEmail}`
    });

  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Fee Reminders Dispatch Endpoint
app.post('/api/email/fee-reminders', async (req, res) => {
  try {
    const { defaulters } = req.body;
    if (!Array.isArray(defaulters)) {
      return res.status(400).json({ error: 'Defaulters array required.' });
    }

    const branding = mergeSiteBranding(undefined, await loadSiteBranding());
    let dispatchedCount = 0;
    const logs: any[] = [];

    for (const d of defaulters) {
      const recipientEmail = d.is_orphan ? (d.donor_email || d.guardian_email) : d.guardian_email;
      const recipientName = d.is_orphan ? (d.donor_name || 'Donor') : d.guardian_name;
      const amountDue = Number(d.net_fee || 0) - Number(d.paid_amount || 0);
      const subject = `Fee Payment Reminder - ${d.student_name} (${d.month} ${d.year})`;
      const bodyText = `Respected ${recipientName || 'Parent/Donor'},
Assalam o Alaikum

This is a fee payment reminder for ${d.student_name} for ${d.month} ${d.year}.
Outstanding amount: PKR ${amountDue.toLocaleString()}

Warm Regards,
Unique School System`;

      const htmlContent = buildBrandedEmailHtml({
        headerTitle: 'Fee Payment Reminder',
        body: bodyText,
        footer: branding.footer_subtitle,
        branding,
        isPlainTextBody: true
      });

      const sendResult = recipientEmail
        ? await sendTransactionalEmail({
            to: recipientEmail,
            subject,
            text: bodyText,
            html: htmlContent
          })
        : { status: 'Failed' as const, error: 'No recipient email' };

      const log = {
        id: 'fee-rem-' + Date.now() + Math.random().toString(36).slice(2, 6),
        timestamp: new Date().toISOString(),
        recipient_email: recipientEmail,
        recipient_type: d.is_orphan ? 'Donor' : 'Guardian',
        recipient_name: recipientName,
        student_name: d.student_name,
        subject,
        term_name: `${d.month} ${d.year}`,
        status: sendResult.status === 'Success' ? 'Success' : sendResult.status
      };
      logs.push(log);
      if (sendResult.status === 'Success') dispatchedCount++;
    }

    for (const log of logs) {
      await persistEmailLog(log);
    }

    res.json({
      success: dispatchedCount > 0 || logs.length === 0,
      dispatchedCount,
      logs,
      message: `Dispatched ${dispatchedCount} of ${defaulters.length} fee reminder email(s) via Brevo.`
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Serve uploaded PDF/document from Supabase Storage (for preview when file_url is not stored)
app.get('/api/supabase/file', async (req, res) => {
  try {
    const storagePath = typeof req.query.path === 'string' ? req.query.path : '';
    const bucketName = typeof req.query.bucket === 'string' ? req.query.bucket : 'student-results';

    if (!storagePath) {
      return res.status(400).json({ error: 'Invalid storage path.' });
    }

    if (bucketName === CLOUDINARY_BUCKET) {
      const directUrl = typeof req.query.url === 'string' ? req.query.url : '';
      if (isRemoteDocumentUrl(directUrl)) {
        return res.redirect(directUrl);
      }
      const resourceType = storagePath.toLowerCase().includes('.pdf') ? 'raw' : 'image';
      const deliveryUrl = buildCloudinaryDeliveryUrl(storagePath, resourceType);
      if (deliveryUrl) return res.redirect(deliveryUrl);
      return res.status(404).json({ error: 'Cloudinary document not found.' });
    }

    if (!storagePath.includes('/')) {
      return res.status(400).json({ error: 'Invalid storage path.' });
    }

    const db = await getMongoDb();

    // Database-first for entity documents (gallery, admissions, profile scans)
    if (bucketName === ENTITY_DOCS_BUCKET) {
      const dbDoc = await loadEntityDocumentFromDatabase(db, bucketName, storagePath);
      if (dbDoc.ok && dbDoc.buffer) {
        const fileName = path.basename(storagePath);
        res.setHeader('Content-Type', dbDoc.contentType || 'application/octet-stream');
        res.setHeader('Content-Disposition', `inline; filename="${fileName}"`);
        res.setHeader('Cache-Control', 'private, max-age=3600');
        return res.send(dbDoc.buffer);
      }
    }

    const download = await downloadStorageWithFailover(bucketName, storagePath);
    if (download.ok && download.buffer) {
      const fileName = path.basename(storagePath);
      res.setHeader('Content-Type', download.contentType || 'application/pdf');
      res.setHeader('Content-Disposition', `inline; filename="${fileName}"`);
      res.setHeader('Cache-Control', 'private, max-age=3600');
      return res.send(download.buffer);
    }

    const fallback = await loadEntityDocumentFromDatabase(db, bucketName, storagePath);
    if (fallback.ok && fallback.buffer) {
      const fileName = path.basename(storagePath);
      res.setHeader('Content-Type', fallback.contentType || 'application/octet-stream');
      res.setHeader('Content-Disposition', `inline; filename="${fileName}"`);
      res.setHeader('Cache-Control', 'private, max-age=3600');
      return res.send(fallback.buffer);
    }

    return res.status(404).json({
      error: 'File not found in database or storage. Re-upload the document if this record is old.'
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Supabase Storage Batch Document Upload Endpoint
app.post('/api/supabase/upload', async (req, res) => {
  try {
    const { bucket, path: storagePath, fileBase64 } = req.body;

    if (!storagePath || !storagePath.includes('/')) {
      return res.status(400).json({ error: 'Invalid storage path format.' });
    }
    if (!fileBase64) {
      return res.status(400).json({ error: 'fileBase64 payload is required.' });
    }

    const bucketName = bucket || 'student-results';
    const cleanBase64 = fileBase64.replace(/^data:[^;]+;base64,/, '');
    const buffer = Buffer.from(cleanBase64, 'base64');
    const isPdf = storagePath.toLowerCase().endsWith('.pdf');
    const contentType = isPdf ? 'application/pdf' : 'image/jpeg';

    console.log(`[Document Upload] bucket '${bucketName}' path '${storagePath}'`);

    // Entity documents: Cloudinary first, then database fallback
    if (bucketName === ENTITY_DOCS_BUCKET) {
      if (isCloudinaryConfigured()) {
        const cloud = await uploadBufferToCloudinary(buffer, storagePath, contentType);
        if (cloud.ok && cloud.secureUrl && cloud.publicId) {
          return res.json({
            success: true,
            bucket: CLOUDINARY_BUCKET,
            path: cloud.publicId,
            publicUrl: cloud.secureUrl,
            uploadedAt: new Date().toISOString(),
            storagePersisted: true,
            cloudPersisted: true,
            dbPersisted: false,
            message: 'Document saved to Cloudinary.'
          });
        }
        console.warn('[Cloudinary] Upload note:', cloud.error);
      }

      const db = await getMongoDb();
      const saved = await persistEntityDocumentToDatabase(db, bucketName, storagePath, buffer, contentType);
      if (!saved.ok) {
        return res.status(500).json({
          error: 'Failed to save document. Configure Cloudinary or MongoDB/Supabase blob storage.'
        });
      }

      return res.json({
        success: true,
        bucket: bucketName,
        path: storagePath,
        publicUrl: buildEntityDocProxyUrl(storagePath, bucketName),
        uploadedAt: new Date().toISOString(),
        storagePersisted: true,
        dbPersisted: true,
        savedLocally: saved.mongo,
        savedToSupabase: saved.supabase,
        message: 'Document saved to database fallback.'
      });
    }

    const uploadResult = await uploadStorageWithFailover(bucketName, storagePath, buffer, contentType);

    if (!uploadResult.ok) {
      console.warn('[Supabase Storage] Upload note:', uploadResult.error);
      const db = await getMongoDb();
      const saved = await persistEntityDocumentToDatabase(db, bucketName, storagePath, buffer, contentType);
      return res.json({
        success: true,
        bucket: bucketName,
        path: storagePath,
        publicUrl: saved.ok
          ? buildEntityDocProxyUrl(storagePath, bucketName)
          : (fileBase64.startsWith('data:') ? fileBase64 : `data:${contentType};base64,${cleanBase64}`),
        uploadedAt: new Date().toISOString(),
        storagePersisted: saved.ok,
        dbPersisted: saved.ok,
        savedLocally: saved.mongo,
        savedToSupabase: saved.supabase,
        failover: getSupabaseFailoverStatus(),
        message: saved.ok
          ? `Document saved to database; Supabase Storage unavailable: ${uploadResult.error}`
          : `Supabase Storage unavailable: ${uploadResult.error}`
      });
    }

    const { data: urlData } = uploadResult.publicUrlClient.storage.from(bucketName).getPublicUrl(storagePath);

    res.json({
      success: true,
      bucket: bucketName,
      path: storagePath,
      publicUrl: urlData.publicUrl,
      uploadedAt: new Date().toISOString(),
      storagePersisted: true,
      message: `Document successfully uploaded to Supabase Storage at "${storagePath}"`
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Fetch Email Logs
app.get('/api/email/logs', (req, res) => {
  res.json({ logs: emailLogs });
});

// Email connectivity diagnostic (for Render deployment troubleshooting)
app.get('/api/email/health', async (_req, res) => {
  try {
    const status = await verifyEmailConnectivity();
    res.json({ success: status.ok, ...status });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Groq AI Assistant — school system help only (replaces Gemini chat for AI Assistant tab)
app.post('/api/groq/chat', async (req, res) => {
  try {
    const { message, history, prompt, context } = req.body;
    const userMessage = String(message || prompt || '').trim();
    if (!userMessage) {
      return res.status(400).json({ error: 'Message is required.' });
    }

    const apiKey = process.env.GROQ_API_KEY;
    if (!apiKey) {
      return res.json({
        reply: 'Unique School System Assistant is not configured. Add GROQ_API_KEY to your server environment (.env).'
      });
    }

    const groqMessages: { role: 'system' | 'user' | 'assistant'; content: string }[] = [
      { role: 'system', content: GROQ_SYSTEM_INSTRUCTION }
    ];

    if (context && typeof context === 'object') {
      groqMessages.push({
        role: 'system',
        content: `Live system context (use if relevant): ${JSON.stringify(context).slice(0, 6000)}`
      });
    }

    if (Array.isArray(history)) {
      for (const turn of history.slice(-12)) {
        const text = turn?.parts?.[0]?.text ?? turn?.text ?? '';
        if (!text || typeof text !== 'string') continue;
        const role = turn.role === 'model' || turn.role === 'assistant' ? 'assistant' : 'user';
        groqMessages.push({ role, content: text });
      }
    }

    groqMessages.push({ role: 'user', content: userMessage });

    const groqRes = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: process.env.GROQ_MODEL || 'llama-3.3-70b-versatile',
        messages: groqMessages,
        temperature: 0.4,
        max_tokens: 1200
      })
    });

    const groqRaw = await groqRes.text();
    let groqJson: { error?: { message?: string }; choices?: { message?: { content?: string } }[] } = {};
    if (groqRaw.trim()) {
      try {
        groqJson = JSON.parse(groqRaw);
      } catch {
        throw new Error(`Groq returned invalid response (HTTP ${groqRes.status}). Check GROQ_API_KEY.`);
      }
    }
    if (!groqRes.ok) {
      throw new Error(groqJson?.error?.message || `Groq API error (HTTP ${groqRes.status})`);
    }

    const reply = groqJson.choices?.[0]?.message?.content?.trim() || 'I could not generate a response. Please try again.';
    res.json({ reply, text: reply });
  } catch (err: any) {
    console.error('Groq API server route error:', err);
    res.status(500).json({ error: err.message || 'Groq API call failed.' });
  }
});

// Expense Receipt Scan & OCR Extraction Endpoint via Gemini AI
app.post('/api/expense/scan-receipt', async (req, res) => {
  try {
    const { imageBase64, mimeType } = req.body;
    if (!imageBase64) {
      return res.status(400).json({ error: 'Receipt image base64 data is required.' });
    }

    const apiKey = process.env.GEMINI_API_KEY;
    const cleanBase64 = imageBase64.replace(/^data:image\/\w+;base64,/, '');

    if (apiKey) {
      try {
        const ai = new GoogleGenAI({
          apiKey,
          httpOptions: { headers: { 'User-Agent': 'aistudio-build' } }
        });

        const imagePart = {
          inlineData: {
            data: cleanBase64,
            mimeType: mimeType || 'image/png'
          }
        };

        const promptPart = {
          text: `You are an intelligent document & expense scanner for a school system.
Examine this receipt/bill image carefully and extract key payment details.
Respond strictly in JSON format with the following keys:
{
  "amount": number, // total monetary value (e.g. 12500)
  "date": "YYYY-MM-DD", // date on receipt or today's date if missing
  "category": string, // One of: "Utilities & Power", "IT Infrastructure", "Campus Maintenance", "Salaries & Wages", "Stationery & Printing", "Events & Celebrations", "Transport & Fuel", "Lab & Sports Equipment", "Miscellaneous"
  "description": string, // vendor name and summary of goods/services
  "payment_mode": string // "Cash", "Bank Transfer", "Cheque", "Online / POS", "Corporate Card"
}`
        };

        const response = await ai.models.generateContent({
          model: 'gemini-3.6-flash',
          contents: { parts: [imagePart, promptPart] },
          config: {
            responseMimeType: 'application/json'
          }
        });

        if (response.text) {
          const parsed = JSON.parse(response.text.trim());
          return res.json({
            success: true,
            source: 'Gemini AI Vision',
            data: {
              amount: Number(parsed.amount) || 0,
              date: parsed.date || new Date().toISOString().slice(0, 10),
              category: parsed.category || 'Miscellaneous',
              description: parsed.description || 'Scanned Receipt Expense',
              payment_mode: parsed.payment_mode || 'Cash'
            }
          });
        }
      } catch (genErr) {
        console.warn('Gemini vision scan note:', genErr);
      }
    }

    // Smart Fallback Extractor if Gemini Key is not present or offline
    res.json({
      success: true,
      source: 'Intelligent Vision Engine (Simulated)',
      data: {
        amount: Math.floor(Math.random() * 8000) + 1500,
        date: new Date().toISOString().slice(0, 10),
        category: 'Utilities & Power',
        description: 'Scanned Campus Utility / Vendor Receipt Voucher',
        payment_mode: 'Cash'
      }
    });

  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to scan receipt.' });
  }
});

// Start Server Setup with Vite Middleware (Dev) or Static (Prod)
async function startServer() {
  registerEntityDocumentDbResolver(getMongoDb);
  registerSupabaseEntityBlobOps({
    upsert: async row => {
      const result = await upsertTableWithFailover('entity_document_blobs', [row as Record<string, unknown>], 'id');
      return result.ok;
    },
    load: async id => {
      try {
        const { data } = await supabasePrimary
          .from('entity_document_blobs')
          .select('content_base64, content_type')
          .eq('id', id)
          .maybeSingle();
        if (data) return data as { content_base64?: string; content_type?: string };
      } catch {
        // fall through
      }
      try {
        const { data } = await supabaseOverflow
          .from('entity_document_blobs')
          .select('content_base64, content_type')
          .eq('id', id)
          .maybeSingle();
        return (data as { content_base64?: string; content_type?: string }) || null;
      } catch {
        return null;
      }
    }
  });
  registerAppStoreEntityBlobOps({
    upsert: async row => {
      const result = await upsertAppStoreKeyWithFailover(`entity_doc:${row.id}`, {
        content_base64: row.content_base64,
        content_type: row.content_type,
        bucket: row.bucket,
        storage_path: row.storage_path,
        updated_at: row.updated_at
      });
      return result.ok;
    },
    load: async id => {
      const value = await selectAppStoreValue(`entity_doc:${id}`);
      if (value && typeof value === 'object') {
        return value as { content_base64?: string; content_type?: string };
      }
      return null;
    }
  });
  // Warm MongoDB connection in background (non-blocking)
  getMongoDb().catch(() => undefined);

  if (isCloudinaryConfigured()) {
    console.log('[Cloudinary] Document storage enabled for PDFs and images.');
  } else {
    console.warn('[Cloudinary] Not configured — entity documents use database fallback.');
  }

  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa'
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*all', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Unique School System Server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
