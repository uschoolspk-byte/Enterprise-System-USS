import React from 'react';
import { 
  GraduationCap, 
  Users, 
  UserCheck, 
  CalendarCheck, 
  CreditCard, 
  DollarSign, 
  FileSpreadsheet, 
  UploadCloud, 
  Lock, 
  Unlock, 
  Menu, 
  X,
  Bot,
  Receipt,
  Palette,
  Settings,
  ScrollText,
  Loader2,
  ExternalLink
} from 'lucide-react';
import { SiteBrandingSettings } from '../types';
import { resolveLogoUrl } from '../lib/brandingAssets';

export type ActiveTab = 
  | 'attendance'  // Phase 1 Unprotected Attendance & Staff Logs
  | 'admissions'  // Screen A
  | 'students'    // Screen B
  | 'teachers'    // Screen C
  | 'fees'        // Screen E
  | 'payroll'     // Screen F
  | 'expenses'    // Expense Tracker Module
  | 'email-designer' // Email Designer & Template Editor
  | 'batch-results' // Screen G
  | 'reporting'   // Screen H
  | 'ai-assistant'
  | 'site-settings';

interface NavbarHeaderProps {
  activeTab: ActiveTab;
  setActiveTab: (tab: ActiveTab) => void;
  isAdminAuthenticated: boolean;
  onLockAdmin: () => void;
  onRequestAdminAuth: (tab: ActiveTab) => void;
  mobileMenuOpen: boolean;
  setMobileMenuOpen: (open: boolean) => void;
  siteBranding: SiteBrandingSettings;
  emailLogsCount?: number;
  isSyncing?: boolean;
  hasSyncErrors?: boolean;
  onOpenActivityLogs?: () => void;
}

const GENERATE_RESULT_URL = 'https://results-2q6j.onrender.com';

export const NavbarHeader: React.FC<NavbarHeaderProps> = ({
  activeTab,
  setActiveTab,
  isAdminAuthenticated,
  onLockAdmin,
  onRequestAdminAuth,
  mobileMenuOpen,
  setMobileMenuOpen,
  siteBranding,
  emailLogsCount = 0,
  isSyncing = false,
  hasSyncErrors = false,
  onOpenActivityLogs
}) => {
  const navItems: { id: ActiveTab; label: string; icon: React.ReactNode; protected: boolean }[] = [
    { id: 'attendance', label: 'Attendance Console', icon: <CalendarCheck className="w-4 h-4" />, protected: false },
    { id: 'admissions', label: 'Student Admissions', icon: <GraduationCap className="w-4 h-4" />, protected: true },
    { id: 'students', label: 'Student Directory & Hub', icon: <Users className="w-4 h-4" />, protected: true },
    { id: 'teachers', label: 'Teacher Hub & Staff', icon: <UserCheck className="w-4 h-4" />, protected: true },
    { id: 'fees', label: 'Fee Manager', icon: <CreditCard className="w-4 h-4" />, protected: true },
    { id: 'payroll', label: 'Payroll Manager', icon: <DollarSign className="w-4 h-4" />, protected: true },
    { id: 'expenses', label: 'Expense Tracker', icon: <Receipt className="w-4 h-4" />, protected: true },
    { id: 'email-designer', label: 'Email Designer', icon: <Palette className="w-4 h-4" />, protected: true },
    { id: 'batch-results', label: 'Batch Results Parser', icon: <UploadCloud className="w-4 h-4" />, protected: true },
    { id: 'reporting', label: 'Global Excel Reporting', icon: <FileSpreadsheet className="w-4 h-4" />, protected: true },
    { id: 'ai-assistant', label: 'Groq AI Assistant', icon: <Bot className="w-4 h-4" />, protected: true }
  ];


  const handleTabClick = (item: typeof navItems[0]) => {
    setMobileMenuOpen(false);
    if (item.protected && !isAdminAuthenticated) {
      onRequestAdminAuth(item.id);
    } else {
      setActiveTab(item.id);
    }
  };

  const handleSettingsClick = () => {
    setMobileMenuOpen(false);
    if (!isAdminAuthenticated) {
      onRequestAdminAuth('site-settings');
    } else {
      setActiveTab('site-settings');
    }
  };

  const handleLogsClick = () => {
    setMobileMenuOpen(false);
    if (!isAdminAuthenticated) {
      onRequestAdminAuth(activeTab);
    } else {
      onOpenActivityLogs?.();
    }
  };

  return (
    <header className="sticky top-0 z-40 bg-slate-900 border-b border-slate-800 text-white shadow-xl">
      {/* Top Brand Banner */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-[4.75rem] sm:h-20 gap-2">
          
          {/* Logo & Identity */}
          <div className="flex items-center gap-3 sm:gap-4 flex-1 min-w-0">
            <div className="h-14 w-14 sm:h-16 sm:w-16 shrink-0 flex items-center justify-center">
              <img
                src={resolveLogoUrl(siteBranding.logo_url)}
                alt="School logo"
                className="h-full w-full object-contain drop-shadow-md"
              />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-base sm:text-lg font-black tracking-tight text-white uppercase font-sans">
                  {siteBranding.school_name}
                </h1>
                {siteBranding.badge_text && (
                  <span className="hidden md:inline-block px-2 py-0.5 text-[10px] font-extrabold uppercase rounded bg-amber-400/20 text-amber-300 border border-amber-400/30">
                    {siteBranding.badge_text}
                  </span>
                )}
              </div>
              <p className="text-[11px] text-slate-400 font-medium hidden sm:block">
                {siteBranding.header_subtitle}
              </p>
            </div>
          </div>

          {/* Admin Authentication & Top-right tools */}
          <div className="flex items-center gap-2 sm:gap-3 shrink-0">
            {isAdminAuthenticated ? (
              <button
                onClick={onLockAdmin}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 hover:bg-emerald-500/20 text-xs font-bold transition-all"
                title="Lock Admin Privileges"
              >
                <Unlock className="w-3.5 h-3.5 text-emerald-400" />
                <span className="hidden sm:inline">Admin Unlocked</span>
              </button>
            ) : (
              <button
                onClick={() => onRequestAdminAuth(activeTab)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-500/10 text-amber-400 border border-amber-500/30 hover:bg-amber-500/20 text-xs font-bold transition-all"
                title="Click to Unlock Protected Layers"
              >
                <Lock className="w-3.5 h-3.5 text-amber-400" />
                <span className="hidden sm:inline">Admin Locked</span>
              </button>
            )}

            {isSyncing && (
              <div className="p-2 rounded-xl bg-amber-500/10 border border-amber-500/30" title="Syncing to database…">
                <Loader2 className="w-4 h-4 text-amber-400 animate-spin" />
              </div>
            )}

            <button
              onClick={handleLogsClick}
              className={`relative p-2.5 rounded-xl border transition-all ${
                hasSyncErrors
                  ? 'bg-red-500/10 border-red-500/40 text-red-300 hover:bg-red-500/20'
                  : 'bg-slate-800 border-slate-700 text-slate-300 hover:text-white hover:bg-slate-700 hover:border-slate-600'
              }`}
              title={hasSyncErrors ? 'Activity logs — sync errors detected' : 'Activity & Email Logs'}
            >
              <ScrollText className="w-5 h-5" />
              {hasSyncErrors && (
                <span className="absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full bg-red-500 border border-slate-900" />
              )}
              {!hasSyncErrors && emailLogsCount > 0 && (
                <span className="absolute -top-1 -right-1 min-w-[16px] h-4 px-1 rounded-full bg-amber-500 text-slate-900 text-[9px] font-black flex items-center justify-center">
                  {emailLogsCount > 99 ? '99+' : emailLogsCount}
                </span>
              )}
            </button>

            <button
              onClick={handleSettingsClick}
              className={`p-2.5 rounded-xl border transition-all ${
                activeTab === 'site-settings'
                  ? 'bg-blue-600 border-blue-500 text-white shadow-md shadow-blue-600/30'
                  : 'bg-slate-800 border-slate-700 text-slate-300 hover:text-white hover:bg-slate-700 hover:border-slate-600'
              }`}
              title="Site Settings — Edit Header & Footer"
            >
              <Settings className="w-5 h-5" />
            </button>

            {/* Mobile Hamburger Menu Toggle */}
            <button
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="lg:hidden p-2 rounded-lg bg-slate-800 text-slate-300 hover:text-white border border-slate-700"
            >
              {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </button>
          </div>
        </div>
      </div>

      {/* Navigation Desktop Tabs Bar */}
      <div className="hidden lg:block bg-slate-950/80 border-t border-slate-800/80 backdrop-blur-md">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <nav className="flex space-x-1 overflow-x-auto py-2 no-scrollbar">
            {navItems.map((item) => {
              const isActive = activeTab === item.id;
              const isLocked = item.protected && !isAdminAuthenticated;

              return (
                <button
                  key={item.id}
                  onClick={() => handleTabClick(item)}
                  className={`flex items-center gap-2 px-3.5 py-2 rounded-lg text-xs font-bold whitespace-nowrap transition-all ${
                    isActive
                      ? 'bg-blue-600 text-white shadow-md shadow-blue-600/30'
                      : 'text-slate-300 hover:text-white hover:bg-slate-800/80'
                  }`}
                >
                  <span className={isActive ? 'text-white' : 'text-slate-400'}>
                    {item.icon}
                  </span>
                  {item.label}
                  {isLocked && <Lock className="w-3 h-3 text-amber-400 ml-1 opacity-70" />}
                </button>
              );
            })}
            <a
              href={GENERATE_RESULT_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 px-3.5 py-2 rounded-lg text-xs font-bold whitespace-nowrap transition-all text-slate-300 hover:text-white hover:bg-slate-800/80"
            >
              <ExternalLink className="w-4 h-4 text-slate-400" />
              Generate Result
            </a>
          </nav>
        </div>
      </div>

      {/* Mobile Navigation Drawer Dropdown */}
      {mobileMenuOpen && (
        <div className="lg:hidden bg-slate-950 border-t border-slate-800 px-4 py-3 space-y-1 animate-in slide-in-from-top duration-200">
          {navItems.map((item) => {
            const isActive = activeTab === item.id;
            const isLocked = item.protected && !isAdminAuthenticated;

            return (
              <button
                key={item.id}
                onClick={() => handleTabClick(item)}
                className={`w-full flex items-center justify-between px-4 py-3 rounded-xl text-sm font-bold transition-all ${
                  isActive
                    ? 'bg-blue-600 text-white'
                    : 'text-slate-300 hover:bg-slate-900'
                }`}
              >
                <div className="flex items-center gap-3">
                  {item.icon}
                  {item.label}
                </div>
                {isLocked ? (
                  <span className="flex items-center gap-1 text-xs text-amber-400 bg-amber-400/10 px-2 py-0.5 rounded border border-amber-400/20">
                    <Lock className="w-3 h-3" /> Password Required
                  </span>
                ) : (
                  <span className="text-xs text-emerald-400 bg-emerald-400/10 px-2 py-0.5 rounded border border-emerald-400/20">
                    Public / Access
                  </span>
                )}
              </button>
            );
          })}
          <a
            href={GENERATE_RESULT_URL}
            target="_blank"
            rel="noopener noreferrer"
            onClick={() => setMobileMenuOpen(false)}
            className="w-full flex items-center justify-between px-4 py-3 rounded-xl text-sm font-bold text-slate-300 hover:bg-slate-900 transition-all"
          >
            <div className="flex items-center gap-3">
              <ExternalLink className="w-4 h-4" />
              Generate Result
            </div>
            <span className="text-xs text-blue-300 bg-blue-400/10 px-2 py-0.5 rounded border border-blue-400/20">
              External Link
            </span>
          </a>
        </div>
      )}
    </header>
  );
};
