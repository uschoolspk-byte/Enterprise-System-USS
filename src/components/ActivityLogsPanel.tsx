import React from 'react';
import { X, ScrollText, Mail, RefreshCw, CheckCircle2, Clock, AlertTriangle, Database } from 'lucide-react';
import { BrevoEmailLog } from '../types';
import { DbSyncStatus } from '../lib/apiClient';

interface ActivityLogsPanelProps {
  isOpen: boolean;
  onClose: () => void;
  emailLogs: BrevoEmailLog[];
  isSyncing?: boolean;
  syncStatus?: DbSyncStatus;
  schemaHint?: string;
}

export const ActivityLogsPanel: React.FC<ActivityLogsPanelProps> = ({
  isOpen,
  onClose,
  emailLogs,
  isSyncing = false,
  syncStatus,
  schemaHint
}) => {
  if (!isOpen) return null;

  const recentLogs = [...emailLogs]
    .sort((a, b) => String(b.timestamp || '').localeCompare(String(a.timestamp || '')))
    .slice(0, 50);

  const hasSyncErrors = (syncStatus?.errors?.length ?? 0) > 0;
  const syncHealthy = !hasSyncErrors && syncStatus?.isConnected && (syncStatus.supabase || syncStatus.mongodb);

  return (
    <div className="fixed inset-0 z-50 flex">
      <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm" onClick={onClose} />

      <div className="relative w-full max-w-md bg-slate-950 text-white h-full shadow-2xl border-r border-slate-800 flex flex-col animate-in slide-in-from-left duration-200">
        <div className="p-4 border-b border-slate-800 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2">
            <ScrollText className="w-5 h-5 text-amber-400" />
            <div>
              <h3 className="font-black text-sm">Activity & Sync Logs</h3>
              <p className="text-[10px] text-slate-400">Email dispatches & database sync health</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-white">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-4 border-b border-slate-800 shrink-0 space-y-3">
          <div className={`flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-bold border ${
            isSyncing
              ? 'bg-amber-500/10 border-amber-500/30 text-amber-300'
              : hasSyncErrors
                ? 'bg-red-500/10 border-red-500/30 text-red-300'
                : syncHealthy
                  ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
                  : 'bg-slate-800 border-slate-700 text-slate-300'
          }`}>
            {isSyncing ? (
              <>
                <RefreshCw className="w-4 h-4 animate-spin shrink-0" />
                Syncing to Supabase & MongoDB…
              </>
            ) : hasSyncErrors ? (
              <>
                <AlertTriangle className="w-4 h-4 shrink-0" />
                Sync completed with errors — see below
              </>
            ) : syncHealthy ? (
              <>
                <CheckCircle2 className="w-4 h-4 shrink-0" />
                Database sync healthy — saves on your actions
              </>
            ) : (
              <>
                <Database className="w-4 h-4 shrink-0" />
                Waiting for first sync or backend offline
              </>
            )}
          </div>

          {syncStatus && (
            <div className="grid grid-cols-2 gap-2 text-[10px] font-bold">
              <div className={`px-2 py-1.5 rounded-lg border ${syncStatus.supabase ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300' : 'bg-slate-900 border-slate-700 text-slate-400'}`}>
                Supabase: {syncStatus.supabase ? 'OK' : 'Issue'}
              </div>
              <div className={`px-2 py-1.5 rounded-lg border ${syncStatus.mongodb ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300' : 'bg-slate-900 border-slate-700 text-slate-400'}`}>
                MongoDB: {syncStatus.mongodb ? 'OK' : 'Offline / Issue'}
              </div>
            </div>
          )}

          {syncStatus?.lastSyncedAt && (
            <p className="text-[10px] text-slate-500 font-mono">
              Last sync: {new Date(syncStatus.lastSyncedAt).toLocaleString()}
            </p>
          )}

          {hasSyncErrors && (
            <div className="space-y-1.5 max-h-32 overflow-y-auto">
              {syncStatus!.errors.map((err, i) => (
                <div key={i} className="px-2 py-1.5 rounded-lg bg-red-950/50 border border-red-900/50 text-[10px] text-red-200 font-mono leading-relaxed">
                  {err}
                </div>
              ))}
            </div>
          )}

          {schemaHint && (
            <div className="px-2 py-1.5 rounded-lg bg-amber-950/40 border border-amber-900/40 text-[10px] text-amber-200">
              {schemaHint}
            </div>
          )}
        </div>

        <div className="px-4 py-2 border-b border-slate-800 shrink-0">
          <h4 className="text-[10px] font-black uppercase tracking-wider text-slate-500">Email Dispatch Log</h4>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-2">
          {recentLogs.length === 0 ? (
            <div className="text-center py-12 text-slate-500 space-y-2">
              <Mail className="w-10 h-10 mx-auto opacity-40" />
              <p className="text-sm font-bold">No email logs yet</p>
              <p className="text-xs">Fee vouchers, progress reports, and salary slips will appear here.</p>
            </div>
          ) : (
            recentLogs.map(log => (
              <div
                key={log.id}
                className="p-3 rounded-xl bg-slate-900 border border-slate-800 space-y-1.5 text-xs"
              >
                <div className="flex items-start justify-between gap-2">
                  <span className="font-bold text-slate-200 line-clamp-2">{log.subject}</span>
                  <span className={`shrink-0 px-2 py-0.5 rounded text-[10px] font-black uppercase ${
                    log.status === 'Success'
                      ? 'bg-emerald-500/20 text-emerald-400'
                      : log.status === 'Failed'
                        ? 'bg-red-500/20 text-red-400'
                        : 'bg-slate-700 text-slate-300'
                  }`}>
                    {log.status}
                  </span>
                </div>
                <p className="text-slate-400">
                  To: <span className="text-slate-300 font-semibold">{log.recipient_email}</span>
                  {log.recipient_name && ` (${log.recipient_name})`}
                </p>
                {log.student_name && (
                  <p className="text-slate-500">Student: {log.student_name}</p>
                )}
                <div className="flex items-center gap-1 text-[10px] text-slate-500 font-mono">
                  <Clock className="w-3 h-3" />
                  {log.timestamp ? new Date(log.timestamp).toLocaleString() : '—'}
                </div>
              </div>
            ))
          )}
        </div>

        <div className="p-3 border-t border-slate-800 text-[10px] text-slate-500 text-center shrink-0">
          {recentLogs.length} email log(s) · Syncs when you save changes
        </div>
      </div>
    </div>
  );
};
