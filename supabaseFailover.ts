import { createClient, SupabaseClient, PostgrestError } from '@supabase/supabase-js';
import ws from 'ws';
import { mergeRecordsById, isDuplicateCnicError } from './dbSyncHelpers';

const APP_STORE_ENTITY_LIST_KEYS = new Set([
  'students', 'teachers', 'fees', 'payrolls', 'exam_results', 'expenses',
  'email_templates', 'custom_fields', 'student_attendance', 'teacher_attendance', 'email_logs'
]);

const FETCH_TIMEOUT_MS = 45000;
const UPSERT_CHUNK_SIZE = 15;
const MAX_RETRIES = 3;
const skipWarningAt = new Map<string, number>();

function logSkippedRows(table: string, skipped: number, reason: string) {
  const key = `${table}:${reason}`;
  const now = Date.now();
  const last = skipWarningAt.get(key) ?? 0;
  if (now - last < 60_000) return;
  skipWarningAt.set(key, now);
  console.warn(`[Supabase] ${table}: ${skipped} row(s) skipped — ${reason}`);
}

function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

const clientOptions = {
  realtime: {
    transport: ws as unknown as typeof WebSocket
  },
  global: {
    fetch: (input: RequestInfo | URL, init?: RequestInit) => {
      const signal = init?.signal ?? AbortSignal.timeout(FETCH_TIMEOUT_MS);
      return fetch(input, { ...init, signal });
    }
  }
};

export const SUPABASE_PRIMARY_URL =
  process.env.SUPABASE_URL ||
  process.env.VITE_SUPABASE_URL ||
  '';

export const SUPABASE_PRIMARY_KEY =
  process.env.SUPABASE_ANON_KEY ||
  process.env.VITE_SUPABASE_ANON_KEY ||
  '';

export const SUPABASE_OVERFLOW_URL =
  process.env.SUPABASE_OVERFLOW_URL ||
  '';

export const SUPABASE_OVERFLOW_KEY =
  process.env.SUPABASE_OVERFLOW_ANON_KEY ||
  '';

export const supabasePrimary = createClient(
  SUPABASE_PRIMARY_URL,
  SUPABASE_PRIMARY_KEY,
  clientOptions
);

export const supabaseOverflow = createClient(
  SUPABASE_OVERFLOW_URL,
  SUPABASE_OVERFLOW_KEY,
  clientOptions
);

/** Primary client — existing data always stays here until storage is full. */
export const supabase = supabasePrimary;

let primaryStorageFull = false;
let failoverActivatedAt: string | null = null;

export function isStorageQuotaError(error: unknown): boolean {
  if (!error) return false;
  const err = error as Record<string, unknown>;
  const msg = String(err.message || error).toLowerCase();
  const details = String(err.details || '').toLowerCase();
  const hint = String(err.hint || '').toLowerCase();
  const combined = `${msg} ${details} ${hint}`;
  const status = Number(err.status || err.statusCode || 0);
  return (
    status === 507 ||
    combined.includes('storage') ||
    combined.includes('quota') ||
    combined.includes('disk full') ||
    combined.includes('insufficient') ||
    combined.includes('exceed') ||
    combined.includes('space') ||
    combined.includes('capacity') ||
    combined.includes('limit reached') ||
    combined.includes('payload too large')
  );
}

export function isPostgresConstraintError(error: unknown): boolean {
  if (!error) return false;
  const msg = String((error as PostgrestError)?.message || error).toLowerCase();
  const code = String((error as PostgrestError)?.code || '');
  return (
    code === '23502' ||
    code === '23503' ||
    code === '23505' ||
    msg.includes('violates not-null') ||
    msg.includes('violates foreign-key') ||
    msg.includes('duplicate key')
  );
}

export function isTransientNetworkError(error: unknown): boolean {
  if (!error) return false;
  const msg = String((error as PostgrestError)?.message || error).toLowerCase();
  const name = String((error as Error)?.name || '').toLowerCase();
  return (
    name === 'aborterror' ||
    msg.includes('fetch failed') ||
    msg.includes('network') ||
    msg.includes('econnreset') ||
    msg.includes('etimedout') ||
    msg.includes('timeout') ||
    msg.includes('socket hang up') ||
    msg.includes('enotfound') ||
    msg.includes('eai_again') ||
    msg.includes('connection')
  );
}

export function markPrimaryStorageFull(): void {
  if (!primaryStorageFull) {
    primaryStorageFull = true;
    failoverActivatedAt = new Date().toISOString();
    console.warn(
      '[Supabase Failover] Primary database storage is full. New saves will automatically go to the overflow Supabase. All existing primary data is preserved.'
    );
  }
}

export function getSupabaseFailoverStatus() {
  return {
    primaryStorageFull,
    failoverActivatedAt,
    primaryUrl: SUPABASE_PRIMARY_URL,
    overflowUrl: SUPABASE_OVERFLOW_URL,
    activeWriteTarget: primaryStorageFull ? 'overflow' as const : 'primary' as const
  };
}

export async function checkSupabaseConnectivity(): Promise<{
  primary: boolean;
  overflow: boolean;
}> {
  let primary = false;
  let overflow = false;

  try {
    const { error } = await supabasePrimary.from('app_store').select('key').limit(1);
    primary = !error;
  } catch {
    primary = false;
  }

  try {
    const { error } = await supabaseOverflow.from('app_store').select('key').limit(1);
    overflow = !error;
  } catch {
    overflow = false;
  }

  return { primary, overflow };
}

export async function selectMergedTable(table: string): Promise<{
  data: Record<string, unknown>[];
  primaryOk: boolean;
  overflowOk: boolean;
}> {
  let primaryRows: Record<string, unknown>[] = [];
  let overflowRows: Record<string, unknown>[] = [];
  let primaryOk = false;
  let overflowOk = false;

  try {
    const { data, error } = await supabasePrimary.from(table).select('*');
    if (!error) {
      primaryOk = true;
      primaryRows = (data || []) as Record<string, unknown>[];
    }
  } catch {
    // table may not exist yet on a fresh project
  }

  try {
    const { data, error } = await supabaseOverflow.from(table).select('*');
    if (!error) {
      overflowOk = true;
      overflowRows = (data || []) as Record<string, unknown>[];
    }
  } catch {
    // overflow project may not have schema applied yet
  }

  return {
    data: primaryStorageFull
      ? (overflowOk ? overflowRows : primaryRows)
      : (primaryOk ? primaryRows : mergeRecordsById(primaryRows, overflowRows) as Record<string, unknown>[]),
    primaryOk,
    overflowOk
  };
}

export async function loadMergedAppStoreMap(): Promise<Record<string, unknown>> {
  const map: Record<string, unknown> = {};
  const meta: Record<string, string> = {};

  const ingest = (
    rows: { key: string; value: unknown; updated_at?: string }[] | null | undefined,
    isOverflow: boolean
  ) => {
    if (!rows) return;
    for (const row of rows) {
      const key = row.key;
      const value = row.value;
      const updatedAt = row.updated_at || '';
      if (map[key] === undefined) {
        map[key] = value;
        meta[key] = updatedAt;
        continue;
      }
      // Entity lists: never union primary + overflow (that resurrects deleted rows)
      if (APP_STORE_ENTITY_LIST_KEYS.has(key) && Array.isArray(value)) {
        if (updatedAt >= (meta[key] || '')) {
          map[key] = value;
          meta[key] = updatedAt;
        }
        continue;
      }
      if (Array.isArray(value) && Array.isArray(map[key])) {
        map[key] = mergeRecordsById(map[key] as Record<string, unknown>[], value as Record<string, unknown>[]);
        if (updatedAt >= (meta[key] || '')) meta[key] = updatedAt;
      } else if (isOverflow && primaryStorageFull) {
        map[key] = value;
        meta[key] = updatedAt;
      } else if (updatedAt >= (meta[key] || '')) {
        map[key] = value;
        meta[key] = updatedAt;
      }
    }
  };

  try {
    const { data } = await supabasePrimary.from('app_store').select('key, value, updated_at');
    ingest(data as { key: string; value: unknown; updated_at?: string }[] | null, false);
  } catch {
    // silent
  }

  try {
    const { data } = await supabaseOverflow.from('app_store').select('key, value, updated_at');
    ingest(data as { key: string; value: unknown; updated_at?: string }[] | null, true);
  } catch {
    // silent
  }

  return map;
}

export async function selectAppStoreValue(key: string): Promise<unknown> {
  try {
    const { data } = await supabasePrimary.from('app_store').select('value').eq('key', key).maybeSingle();
    if (data?.value !== undefined && data?.value !== null) return data.value;
  } catch {
    // fall through
  }

  try {
    const { data } = await supabaseOverflow.from('app_store').select('value').eq('key', key).maybeSingle();
    if (data?.value !== undefined && data?.value !== null) return data.value;
  } catch {
    // silent
  }

  return undefined;
}

async function upsertOnClient(
  client: SupabaseClient,
  table: string,
  rows: Record<string, unknown>[],
  onConflict: string
) {
  return client.from(table).upsert(rows, { onConflict });
}

async function upsertChunkWithRetry(
  client: SupabaseClient,
  table: string,
  rows: Record<string, unknown>[],
  onConflict: string
): Promise<{ ok: boolean; error?: string; quotaError?: boolean; networkError?: boolean }> {
  let lastError: string | undefined;

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      const { error } = await upsertOnClient(client, table, rows, onConflict);
      if (!error) return { ok: true };

      lastError = error.message;
      if (isStorageQuotaError(error)) {
        return { ok: false, error: error.message, quotaError: true };
      }
      if (isPostgresConstraintError(error)) {
        return { ok: false, error: error.message, networkError: false };
      }
      if (!isTransientNetworkError(error)) {
        return { ok: false, error: error.message, networkError: false };
      }
    } catch (err: unknown) {
      lastError = err instanceof Error ? err.message : String(err);
      if (!isTransientNetworkError(err)) {
        return { ok: false, error: lastError, networkError: false };
      }
    }

    if (attempt < MAX_RETRIES - 1) {
      await sleep(1000 * (attempt + 1));
    }
  }

  return { ok: false, error: lastError, networkError: true };
}

export async function selectPrimaryTableIds(table: string): Promise<Set<string>> {
  try {
    const { data, error } = await supabasePrimary.from(table).select('id');
    if (error || !data) return new Set();
    return new Set(
      data
        .map(row => String((row as { id?: string }).id || ''))
        .filter(Boolean)
    );
  } catch {
    return new Set();
  }
}

async function upsertRowsIndividuallyOnClient(
  client: SupabaseClient,
  table: string,
  rows: Record<string, unknown>[],
  onConflict: string
): Promise<{ ok: boolean; error?: string; skipped: number }> {
  let skipped = 0;
  for (const row of rows) {
    let result = await upsertChunkWithRetry(client, table, [row], onConflict);
    if (!result.ok && table === 'teachers' && isDuplicateCnicError(result.error)) {
      const id = String(row.id || '');
      const fixed = { ...row, cnic: `PENDING-${id}` };
      result = await upsertChunkWithRetry(client, table, [fixed], onConflict);
    }
    if (!result.ok) skipped += 1;
  }
  return {
    ok: skipped < rows.length,
    skipped,
    error: skipped > 0 ? `${skipped}/${rows.length} rows skipped (constraint)` : undefined
  };
}

async function upsertAllChunksOnClient(
  client: SupabaseClient,
  table: string,
  rows: Record<string, unknown>[],
  onConflict: string
): Promise<{ ok: boolean; error?: string; quotaError?: boolean; networkError?: boolean }> {
  for (let i = 0; i < rows.length; i += UPSERT_CHUNK_SIZE) {
    const chunk = rows.slice(i, i + UPSERT_CHUNK_SIZE);
    const result = await upsertChunkWithRetry(client, table, chunk, onConflict);
    if (!result.ok) return result;
  }
  return { ok: true };
}

async function writeRowsWithFailover(
  table: string,
  rows: Record<string, unknown>[],
  onConflict: string
): Promise<{ ok: boolean; wroteTo: 'primary' | 'overflow' | 'none'; error?: string }> {
  if (!primaryStorageFull) {
    const primary = await upsertAllChunksOnClient(supabasePrimary, table, rows, onConflict);
    if (primary.ok) {
      // Mirror to overflow so merged reads never resurrect deleted rows
      await upsertAllChunksOnClient(supabaseOverflow, table, rows, onConflict).catch(() => undefined);
      return { ok: true, wroteTo: 'primary' };
    }

    if (isPostgresConstraintError(primary.error)) {
      const individual = await upsertRowsIndividuallyOnClient(
        supabasePrimary,
        table,
        rows,
        onConflict
      );
      if (individual.ok) {
        if (individual.skipped > 0) {
          const reason =
            table === 'teachers'
              ? 'duplicate CNIC or constraint conflict (assign a unique CNIC in Teacher Hub)'
              : 'foreign-key or constraint conflict';
          logSkippedRows(table, individual.skipped, reason);
        }
        return { ok: true, wroteTo: 'primary', error: individual.error };
      }
      return { ok: false, wroteTo: 'primary', error: primary.error };
    }

    const shouldTryOverflow =
      !isPostgresConstraintError(primary.error) &&
      (primary.quotaError || primary.networkError || isTransientNetworkError(primary.error));

    if (primary.quotaError) markPrimaryStorageFull();

    if (shouldTryOverflow) {
      console.warn(
        `[Supabase Failover] Primary upsert failed for ${table} (${primary.error}). Trying overflow database…`
      );
      const overflow = await upsertAllChunksOnClient(supabaseOverflow, table, rows, onConflict);
      return {
        ok: overflow.ok,
        wroteTo: 'overflow',
        error: overflow.error
      };
    }

    return { ok: false, wroteTo: 'primary', error: primary.error };
  }

  const overflow = await upsertAllChunksOnClient(supabaseOverflow, table, rows, onConflict);
  return {
    ok: overflow.ok,
    wroteTo: 'overflow',
    error: overflow.error
  };
}

export async function upsertTableWithFailover(
  table: string,
  rows: Record<string, unknown>[],
  onConflict = 'id'
): Promise<{ ok: boolean; wroteTo: 'primary' | 'overflow' | 'none'; error?: string }> {
  if (rows.length === 0) return { ok: true, wroteTo: 'none' };
  return writeRowsWithFailover(table, rows, onConflict);
}

async function upsertAppStoreRowsWithRetry(
  client: SupabaseClient,
  rows: { key: string; value: unknown; updated_at: string }[]
): Promise<{ ok: boolean; error?: string; quotaError?: boolean; networkError?: boolean }> {
  let lastError: string | undefined;

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      const { error } = await client.from('app_store').upsert(rows, { onConflict: 'key' });
      if (!error) return { ok: true };
      lastError = error.message;
      if (isStorageQuotaError(error)) return { ok: false, error: error.message, quotaError: true };
      if (!isTransientNetworkError(error)) return { ok: false, error: error.message };
    } catch (err: unknown) {
      lastError = err instanceof Error ? err.message : String(err);
      if (!isTransientNetworkError(err)) return { ok: false, error: lastError };
    }
    if (attempt < MAX_RETRIES - 1) await sleep(1000 * (attempt + 1));
  }

  return { ok: false, error: lastError, networkError: true };
}

async function upsertSingleAppStoreRowWithFailover(
  row: { key: string; value: unknown; updated_at: string }
): Promise<{ ok: boolean; wroteTo: 'primary' | 'overflow' | 'none'; error?: string }> {
  if (!primaryStorageFull) {
    const primary = await upsertAppStoreRowsWithRetry(supabasePrimary, [row]);
    if (primary.ok) {
      await upsertAppStoreRowsWithRetry(supabaseOverflow, [row]).catch(() => undefined);
      return { ok: true, wroteTo: 'primary' };
    }

    const shouldTryOverflow =
      primary.quotaError || primary.networkError || isTransientNetworkError(primary.error);
    if (primary.quotaError) markPrimaryStorageFull();

    if (shouldTryOverflow) {
      const overflow = await upsertAppStoreRowsWithRetry(supabaseOverflow, [row]);
      return { ok: overflow.ok, wroteTo: 'overflow', error: overflow.error };
    }

    return { ok: false, wroteTo: 'primary', error: primary.error };
  }

  const overflow = await upsertAppStoreRowsWithRetry(supabaseOverflow, [row]);
  return { ok: overflow.ok, wroteTo: 'overflow', error: overflow.error };
}

export async function upsertAppStoreKeyWithFailover(
  key: string,
  value: unknown,
  updatedAt = new Date().toISOString()
): Promise<{ ok: boolean; wroteTo: 'primary' | 'overflow' | 'none'; error?: string }> {
  if (value === undefined || value === null) {
    return { ok: true, wroteTo: 'none' };
  }
  return upsertSingleAppStoreRowWithFailover({ key, value, updated_at: updatedAt });
}

export async function upsertAppStoreWithFailover(
  rows: { key: string; value: unknown; updated_at: string }[]
): Promise<{ ok: boolean; wroteTo: 'primary' | 'overflow' | 'none'; error?: string; failedKeys?: string[] }> {
  if (rows.length === 0) return { ok: true, wroteTo: 'none' };

  const priority = new Set(['site_branding', 'school_fee_settings', 'admin_session']);
  const ordered = [
    ...rows.filter(r => priority.has(r.key)),
    ...rows.filter(r => !priority.has(r.key))
  ];

  let wroteTo: 'primary' | 'overflow' | 'none' = 'none';
  const failedKeys: string[] = [];

  for (const row of ordered) {
    const result = await upsertSingleAppStoreRowWithFailover(row);
    if (result.ok) {
      wroteTo = result.wroteTo;
    } else {
      failedKeys.push(row.key);
      console.warn(`[Supabase app_store] Upsert failed for key "${row.key}": ${result.error}`);
    }
  }

  return {
    ok: failedKeys.length === 0,
    wroteTo,
    error: failedKeys.length > 0 ? `Failed keys: ${failedKeys.join(', ')}` : undefined,
    failedKeys: failedKeys.length > 0 ? failedKeys : undefined
  };
}

async function reconcileOnClient(
  client: SupabaseClient,
  table: string,
  keepIds: string[]
): Promise<void> {
  const { data: existing } = await client.from(table).select('id');
  const deleteIds = (existing || [])
    .map(row => row.id as string)
    .filter(id => id && !keepIds.includes(id));
  if (deleteIds.length > 0) {
    await client.from(table).delete().in('id', deleteIds);
  }
}

export async function reconcileDeletesWithFailover(table: string, keepIds: string[]): Promise<void> {
  try {
    if (!primaryStorageFull) {
      await reconcileOnClient(supabasePrimary, table, keepIds);
    }
    await reconcileOnClient(supabaseOverflow, table, keepIds);
  } catch (err) {
    console.warn(`Supabase delete reconcile note (${table}):`, err);
  }
}

export async function replaceCustomFieldsWithFailover(
  customFields: Record<string, unknown>[]
): Promise<{ ok: boolean; error?: string }> {
  // Never wipe all custom fields when the client sends an empty list (load race / stale tab)
  if (!Array.isArray(customFields) || customFields.length === 0) {
    return { ok: true };
  }

  const writeClient = primaryStorageFull ? supabaseOverflow : supabasePrimary;

  try {
    if (!primaryStorageFull) {
      const { error: deleteErr } = await supabasePrimary.from('custom_fields').delete().neq('id', '');
      if (deleteErr && isStorageQuotaError(deleteErr)) {
        markPrimaryStorageFull();
      } else if (deleteErr) {
        return { ok: false, error: deleteErr.message };
      }

      if (!primaryStorageFull && customFields.length > 0) {
        const { error: upsertErr } = await supabasePrimary
          .from('custom_fields')
          .upsert(customFields, { onConflict: 'id' });
        if (upsertErr && isStorageQuotaError(upsertErr)) {
          markPrimaryStorageFull();
        } else if (upsertErr) {
          return { ok: false, error: upsertErr.message };
        } else {
          const store = await upsertAppStoreWithFailover([
            { key: 'custom_fields', value: customFields, updated_at: new Date().toISOString() }
          ]);
          return { ok: store.ok, error: store.error };
        }
      }
    }

    if (primaryStorageFull) {
      const overflowClient = supabaseOverflow;
      const { error: deleteErr } = await overflowClient.from('custom_fields').delete().neq('id', '');
      if (deleteErr) return { ok: false, error: deleteErr.message };

      if (customFields.length > 0) {
        const { error: upsertErr } = await overflowClient
          .from('custom_fields')
          .upsert(customFields, { onConflict: 'id' });
        if (upsertErr) return { ok: false, error: upsertErr.message };
      }

      const store = await upsertAppStoreWithFailover([
        { key: 'custom_fields', value: customFields, updated_at: new Date().toISOString() }
      ]);
      return { ok: store.ok, error: store.error };
    }

    const store = await upsertAppStoreWithFailover([
      { key: 'custom_fields', value: customFields, updated_at: new Date().toISOString() }
    ]);
    return { ok: store.ok, error: store.error };
  } catch (err: any) {
    return { ok: false, error: err.message };
  }
}

export async function downloadStorageWithFailover(
  bucketName: string,
  storagePath: string
): Promise<{ ok: boolean; buffer?: Buffer; contentType?: string; error?: string }> {
  for (const client of [supabasePrimary, supabaseOverflow]) {
    const { data, error } = await client.storage.from(bucketName).download(storagePath);
    if (!error && data) {
      const buffer = Buffer.from(await data.arrayBuffer());
      const contentType = data.type || (storagePath.toLowerCase().endsWith('.pdf') ? 'application/pdf' : 'application/octet-stream');
      return { ok: true, buffer, contentType };
    }
  }
  return { ok: false, error: 'File not found in Supabase Storage' };
}

export async function uploadStorageWithFailover(
  bucketName: string,
  storagePath: string,
  buffer: Buffer,
  contentType: string
): Promise<{ ok: boolean; publicUrlClient: SupabaseClient; error?: string }> {
  const options = { upsert: true, contentType };

  if (!primaryStorageFull) {
    const { error } = await supabasePrimary.storage.from(bucketName).upload(storagePath, buffer, options);
    if (!error) return { ok: true, publicUrlClient: supabasePrimary };
    if (isStorageQuotaError(error)) {
      markPrimaryStorageFull();
      const { error: overflowErr } = await supabaseOverflow.storage.from(bucketName).upload(storagePath, buffer, options);
      return {
        ok: !overflowErr,
        publicUrlClient: supabaseOverflow,
        error: overflowErr?.message
      };
    }
    const policyBlocked = String(error.message || '').toLowerCase().includes('row-level security');
    if (policyBlocked) {
      const { error: overflowErr } = await supabaseOverflow.storage.from(bucketName).upload(storagePath, buffer, options);
      if (!overflowErr) return { ok: true, publicUrlClient: supabaseOverflow };
    }
    return { ok: false, publicUrlClient: supabasePrimary, error: error.message };
  }

  const { error: overflowErr } = await supabaseOverflow.storage.from(bucketName).upload(storagePath, buffer, options);
  return {
    ok: !overflowErr,
    publicUrlClient: supabaseOverflow,
    error: overflowErr?.message
  };
}

export async function persistEmailLogToSupabase(logEntry: Record<string, unknown>): Promise<void> {
  const result = await upsertTableWithFailover('email_logs', [logEntry], 'id');
  if (result.ok) return;

  try {
    const existing = await selectAppStoreValue('email_logs');
    const list = Array.isArray(existing) ? existing : [];
    await upsertAppStoreWithFailover([
      {
        key: 'email_logs',
        value: [logEntry, ...list],
        updated_at: new Date().toISOString()
      }
    ]);
  } catch {
    // silent
  }
}
