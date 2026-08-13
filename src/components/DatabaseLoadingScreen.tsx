import React from 'react';
import { Database, RefreshCw, CheckCircle2, AlertCircle, Loader2 } from 'lucide-react';
import { DEFAULT_LOGO_URL } from '../lib/brandingAssets';

export type DbLoadPhase = 'connecting' | 'fetching' | 'processing' | 'ready' | 'error';

export type DbLoadSummary = {
  students: number;
  teachers: number;
  fees: number;
  payrolls: number;
  examResults: number;
  expenses: number;
};

type DatabaseLoadingScreenProps = {
  phase: DbLoadPhase;
  supabase?: boolean;
  mongodb?: boolean;
  summary?: DbLoadSummary | null;
  error?: string | null;
  onRetry?: () => void;
};

const phaseLabels: Record<DbLoadPhase, string> = {
  connecting: 'Connecting to database servers…',
  fetching: 'Fetching school records from Supabase & MongoDB…',
  processing: 'Preparing your dashboard…',
  ready: 'All records loaded successfully',
  error: 'Could not load database records'
};

export function DatabaseLoadingScreen({
  phase,
  supabase,
  mongodb,
  summary,
  error,
  onRetry
}: DatabaseLoadingScreenProps) {
  const isError = phase === 'error';
  const isReady = phase === 'ready';

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-gradient-to-br from-slate-950 via-blue-950 to-slate-900 text-white">
      <div className="mx-4 w-full max-w-md rounded-2xl border border-white/10 bg-white/5 p-8 shadow-2xl backdrop-blur-md">
        <div className="mb-6 flex flex-col items-center text-center">
          <div className={`mb-4 flex h-16 w-16 items-center justify-center rounded-2xl overflow-hidden ${
            isError ? 'bg-red-500/20' : isReady ? 'bg-emerald-500/20' : 'bg-blue-500/20'
          }`}>
            {isError ? (
              <AlertCircle className="h-8 w-8 text-red-400" />
            ) : isReady ? (
              <CheckCircle2 className="h-8 w-8 text-emerald-400" />
            ) : (
              <img src={DEFAULT_LOGO_URL} alt="" className="h-full w-full object-contain p-1" />
            )}
          </div>

          <h1 className="text-xl font-bold tracking-tight">Unique School System</h1>
          <p className="mt-2 text-sm text-slate-300">{phaseLabels[phase]}</p>
        </div>

        {!isError && !isReady && (
          <div className="mb-6 flex justify-center">
            <Loader2 className="h-10 w-10 animate-spin text-blue-400" />
          </div>
        )}

        <div className="mb-6 space-y-2 rounded-xl bg-black/20 p-4 text-sm">
          <div className="flex items-center justify-between">
            <span className="text-slate-400">Supabase</span>
            <ConnectionBadge connected={supabase} pending={supabase === undefined} />
          </div>
          <div className="flex items-center justify-between">
            <span className="text-slate-400">MongoDB</span>
            <ConnectionBadge connected={mongodb} pending={mongodb === undefined} />
          </div>
        </div>

        {summary && !isError && (
          <div className="mb-4 grid grid-cols-3 gap-2 text-center text-xs">
            <Stat label="Students" value={summary.students} />
            <Stat label="Teachers" value={summary.teachers} />
            <Stat label="Fees" value={summary.fees} />
            <Stat label="Payrolls" value={summary.payrolls} />
            <Stat label="Results" value={summary.examResults} />
            <Stat label="Expenses" value={summary.expenses} />
          </div>
        )}

        {isError && (
          <div className="space-y-4">
            <p className="rounded-lg bg-red-500/10 px-3 py-2 text-center text-xs text-red-200">
              {error || 'Database connection failed. Your data is safe — sync is paused until connection is restored.'}
            </p>
            {onRetry && (
              <button
                type="button"
                onClick={onRetry}
                className="flex w-full items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 py-3 text-sm font-semibold transition hover:bg-blue-500"
              >
                <RefreshCw className="h-4 w-4" />
                Retry Connection
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function ConnectionBadge({ connected, pending }: { connected?: boolean; pending?: boolean }) {
  if (pending) {
    return <span className="text-slate-500">Checking…</span>;
  }
  if (connected) {
    return <span className="font-medium text-emerald-400">Connected</span>;
  }
  return <span className="font-medium text-amber-400">Unavailable</span>;
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg bg-white/5 px-2 py-2">
      <div className="text-lg font-bold text-white">{value}</div>
      <div className="text-slate-400">{label}</div>
    </div>
  );
}
