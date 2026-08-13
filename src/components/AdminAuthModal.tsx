import React, { useState } from 'react';
import { Lock, KeyRound, ShieldAlert, CheckCircle2, ArrowRight, Loader2 } from 'lucide-react';
import { verifyAdminLogin } from '../lib/apiClient';

interface AdminAuthModalProps {
  isOpen: boolean;
  onAuthenticated: () => void;
  onCancel?: () => void;
  targetModuleName?: string;
}

export const AdminAuthModal: React.FC<AdminAuthModalProps> = ({
  isOpen,
  onAuthenticated,
  onCancel,
  targetModuleName = 'Protected Administration Area'
}) => {
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsSubmitting(true);

    const result = await verifyAdminLogin(password);
    setIsSubmitting(false);

    if (result.success) {
      setPassword('');
      onAuthenticated();
      return;
    }

    setError(result.error || 'Invalid password.');
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/80 backdrop-blur-sm p-4 animate-in fade-in duration-200">
      <div className="w-full max-w-md bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden">
        {/* Modal Header */}
        <div className="bg-gradient-to-r from-blue-900 via-indigo-900 to-slate-900 p-6 text-white text-center relative">
          <div className="w-16 h-16 bg-white/10 rounded-2xl flex items-center justify-center mx-auto mb-3 backdrop-blur-md border border-white/20">
            <Lock className="w-8 h-8 text-amber-400" />
          </div>
          <h2 className="text-xl font-bold tracking-tight">Security Gateway Barrier</h2>
          <p className="text-xs text-blue-200 mt-1 font-medium">Unique School System - Administrative Privileges Required</p>
          <div className="mt-2 inline-block px-3 py-1 rounded-full bg-amber-400/20 text-amber-300 text-xs font-semibold border border-amber-400/30">
            {targetModuleName}
          </div>
        </div>

        {/* Modal Content */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div className="space-y-1.5">
            <label className="text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center gap-1.5">
              <KeyRound className="w-4 h-4 text-blue-800" />
              Master Admin Password
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => { setPassword(e.target.value); setError(null); }}
              placeholder="Enter admin password"
              autoFocus
              disabled={isSubmitting}
              className={`w-full px-4 py-3 rounded-xl border font-mono text-sm focus:outline-none transition-all disabled:opacity-60 ${
                error
                  ? 'border-red-500 bg-red-50 text-red-900 focus:ring-2 focus:ring-red-500'
                  : 'border-slate-300 bg-slate-50 focus:bg-white focus:border-blue-800 focus:ring-2 focus:ring-blue-800/20'
              }`}
            />
            {error && (
              <p className="text-xs text-red-600 font-semibold flex items-center gap-1 mt-1">
                <ShieldAlert className="w-4 h-4 text-red-600 shrink-0" />
                {error}
              </p>
            )}
          </div>

          <div className="bg-slate-50 p-3 rounded-xl border border-slate-200 text-xs text-slate-600 space-y-1">
            <div className="font-semibold text-slate-800 flex items-center gap-1">
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
              Security Policy Compliance (SPEC 5)
            </div>
            <p className="text-slate-500 leading-relaxed">
              Student Attendance Phase 1 is public. All administrative directories, student hubs, fee ledgers, payrolls, and email engines require master admin clearance.
            </p>
          </div>

          <div className="flex gap-3 pt-2">
            {onCancel && (
              <button
                type="button"
                onClick={onCancel}
                disabled={isSubmitting}
                className="flex-1 px-4 py-2.5 rounded-xl border border-slate-300 text-slate-700 text-sm font-semibold hover:bg-slate-100 transition-all disabled:opacity-60"
              >
                Cancel
              </button>
            )}
            <button
              type="submit"
              disabled={isSubmitting || !password.trim()}
              className="flex-1 px-4 py-2.5 rounded-xl bg-blue-900 hover:bg-blue-800 text-white text-sm font-bold shadow-lg shadow-blue-900/20 hover:shadow-blue-900/30 flex items-center justify-center gap-2 transition-all active:scale-[0.98] disabled:opacity-60"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Verifying…
                </>
              ) : (
                <>
                  Authenticate
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
