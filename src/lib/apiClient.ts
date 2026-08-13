import {
  Student, Teacher, FeeLedger, Payroll, ExamResult, DynamicCustomField,
  Expense, EmailTemplate, StudentAttendance, TeacherAttendance,
  SchoolFeeSettings, BrevoEmailLog, AdminSessionState, SiteBrandingSettings
} from '../types';

export type SyncPayload = {
  students?: Student[];
  teachers?: Teacher[];
  fees?: FeeLedger[];
  payrolls?: Payroll[];
  examResults?: ExamResult[];
  customFields?: DynamicCustomField[];
  expenses?: Expense[];
  emailTemplates?: EmailTemplate[];
  studentAttendance?: StudentAttendance[];
  teacherAttendance?: TeacherAttendance[];
  schoolFeeSettings?: SchoolFeeSettings;
  siteBranding?: SiteBrandingSettings;
  emailLogs?: BrevoEmailLog[];
  adminSession?: AdminSessionState;
  /** Optimistic concurrency — must match server version from last load/successful sync */
  syncSequence?: number;
};

export type SyncResponse = {
  success?: boolean;
  supabase?: boolean;
  mongodb?: boolean;
  stale?: boolean;
  syncSequence?: number;
  errors?: string[];
  emailLogs?: BrevoEmailLog[];
  students?: Student[];
  teachers?: Teacher[];
  message?: string;
  error?: string;
};

export type DbSyncStatus = {
  supabase: boolean;
  mongodb: boolean;
  errors: string[];
  lastSyncedAt: string | null;
  lastMessage?: string;
  isConnected: boolean;
};

export type DbFetchResult = {
  data: Record<string, unknown>;
  connected: boolean;
  supabase: boolean;
  mongodb: boolean;
  syncSequence?: number;
};

export async function verifyAdminLogin(
  password: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const res = await fetch('/api/admin/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password })
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      return {
        success: false,
        error: typeof json?.error === 'string' ? json.error : 'Authentication failed.'
      };
    }
    return { success: Boolean(json.success) };
  } catch {
    return { success: false, error: 'Could not reach server. Check your connection.' };
  }
}

export async function fetchDbHealth(): Promise<Record<string, unknown> | null> {
  try {
    const res = await fetch('/api/db/health');
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

export async function fetchAllDbRecords(): Promise<DbFetchResult | null> {
  try {
    const res = await fetch('/api/db/all');
    if (!res.ok) return null;
    const json = await res.json();
    if (json.data) {
      return {
        data: json.data,
        connected: Boolean(json.connected),
        supabase: Boolean(json.supabase),
        mongodb: Boolean(json.mongodb),
        syncSequence: typeof json.syncSequence === 'number' ? json.syncSequence : undefined
      };
    }
  } catch (err) {
    console.warn('Backend DB fetch fallback to local initial state:', err);
  }
  return null;
}

export async function fetchDbSchemaStatus(): Promise<Record<string, unknown> | null> {
  try {
    const res = await fetch('/api/db/schema-status');
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

export async function syncStateToMongo(payload: SyncPayload): Promise<SyncResponse | null> {
  try {
    const res = await fetch('/api/db/sync', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const json = await res.json();
    if (!res.ok) {
      return {
        success: false,
        errors: [json?.error || `Sync failed (HTTP ${res.status})`]
      };
    }
    if (json?.errors?.length && !json.stale) {
      console.warn('Database sync warnings:', json.errors);
    }
    return json;
  } catch (err: any) {
    console.warn('Backend sync silent fallback:', err);
    return {
      success: false,
      errors: [err?.message || 'Network error — could not reach sync server']
    };
  }
}

export async function syncCustomFieldsImmediate(customFields: DynamicCustomField[]): Promise<SyncResponse | null> {
  try {
    const res = await fetch('/api/custom-fields/sync', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ customFields })
    });
    const json = await res.json();
    if (!res.ok) {
      return {
        success: false,
        errors: [json?.error || `Custom fields sync failed (HTTP ${res.status})`]
      };
    }
    return json;
  } catch (err: any) {
    return {
      success: false,
      errors: [err?.message || 'Network error — could not sync custom fields']
    };
  }
}

export async function fetchCustomFieldsFromDb(): Promise<DynamicCustomField[] | null> {
  try {
    const res = await fetch('/api/custom-fields');
    if (!res.ok) return null;
    const json = await res.json();
    return Array.isArray(json.customFields) ? json.customFields : null;
  } catch {
    return null;
  }
}

export async function verifyCustomFieldsDb(): Promise<Record<string, unknown> | null> {
  try {
    const res = await fetch('/api/custom-fields/verify');
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

export function mergeEmailLogEntry(logs: BrevoEmailLog[], entry: BrevoEmailLog): BrevoEmailLog[] {
  if (!entry?.id) return logs;
  return [entry, ...logs.filter(log => log.id !== entry.id)];
}
