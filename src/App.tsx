import React, { useState, useEffect, useRef } from 'react';
import { 
  INITIAL_STUDENTS, 
  INITIAL_TEACHERS, 
  INITIAL_STUDENT_ATTENDANCE, 
  INITIAL_TEACHER_ATTENDANCE, 
  INITIAL_FEE_LEDGER, 
  INITIAL_PAYROLLS, 
  INITIAL_EXAM_RESULTS, 
  INITIAL_CUSTOM_FIELDS,
  INITIAL_EXPENSES,
  INITIAL_EMAIL_TEMPLATES,
  INITIAL_SCHOOL_FEE_SETTINGS,
  INITIAL_SITE_BRANDING
} from './lib/initialData';
import { fetchAllDbRecords, syncStateToMongo, syncCustomFieldsImmediate, fetchDbSchemaStatus, fetchDbHealth, DbSyncStatus, SyncPayload, SyncResponse } from './lib/apiClient';
import { mergePreferLatest } from './lib/entityMergeUtils';
import { mergeEntityListsWithDocuments } from '../entityDocumentMerge';
import { reconcileAllFees, feesNeedReconciliation, dedupeFeeVouchers } from './lib/feeUtils';
import {
  migrateStudentsCustomFieldKey,
  migrateTeachersCustomFieldKey,
  migrateCustomFieldKey,
  removeCustomFieldKey
} from './lib/customFieldUtils';
import { 
  Student, 
  Teacher, 
  StudentAttendance, 
  TeacherAttendance, 
  FeeLedger, 
  Payroll, 
  ExamResult, 
  DynamicCustomField,
  Expense,
  EmailTemplate,
  SchoolFeeSettings,
  BrevoEmailLog,
  AdminSessionState,
  SiteBrandingSettings
} from './types';
import { NavbarHeader, ActiveTab } from './components/NavbarHeader';
import { AdminAuthModal } from './components/AdminAuthModal';
import { AttendanceConsole } from './components/AttendanceConsole';
import { StudentAdmissions } from './components/StudentAdmissions';
import { StudentHub } from './components/StudentHub';
import { TeacherHub } from './components/TeacherHub';
import { FeeManager } from './components/FeeManager';
import { PayrollManager } from './components/PayrollManager';
import { BatchResultsParser } from './components/BatchResultsParser';
import { ReportingCenter } from './components/ReportingCenter';
import { GeminiAssistant } from './components/GeminiAssistant';
import { ExpenseTracker } from './components/ExpenseTracker';
import { EmailDesigner } from './components/EmailDesigner';
import { SiteSettingsPortal } from './components/SiteSettingsPortal';
import { ActivityLogsPanel } from './components/ActivityLogsPanel';
import { DatabaseLoadingScreen, DbLoadPhase, DbLoadSummary } from './components/DatabaseLoadingScreen';

export default function App() {
  // Global State
  const [students, setStudents] = useState<Student[]>(INITIAL_STUDENTS);
  const [teachers, setTeachers] = useState<Teacher[]>(INITIAL_TEACHERS);
  const [studentAttendance, setStudentAttendance] = useState<StudentAttendance[]>(INITIAL_STUDENT_ATTENDANCE);
  const [teacherAttendance, setTeacherAttendance] = useState<TeacherAttendance[]>(INITIAL_TEACHER_ATTENDANCE);
  const [fees, setFees] = useState<FeeLedger[]>(INITIAL_FEE_LEDGER);
  const [payrolls, setPayrolls] = useState<Payroll[]>(INITIAL_PAYROLLS);
  const [examResults, setExamResults] = useState<ExamResult[]>(INITIAL_EXAM_RESULTS);
  const [customFields, setCustomFields] = useState<DynamicCustomField[]>(INITIAL_CUSTOM_FIELDS);
  const [expenses, setExpenses] = useState<Expense[]>(INITIAL_EXPENSES);
  const [emailTemplates, setEmailTemplates] = useState<EmailTemplate[]>(INITIAL_EMAIL_TEMPLATES);
  const [schoolFeeSettings, setSchoolFeeSettings] = useState<SchoolFeeSettings>(INITIAL_SCHOOL_FEE_SETTINGS);
  const [siteBranding, setSiteBranding] = useState<SiteBrandingSettings>(INITIAL_SITE_BRANDING);
  const [emailLogs, setEmailLogs] = useState<BrevoEmailLog[]>([]);
  const [isDbLoaded, setIsDbLoaded] = useState(false);
  const [dbLoadSucceeded, setDbLoadSucceeded] = useState(false);
  const [dbLoadPhase, setDbLoadPhase] = useState<DbLoadPhase>('connecting');
  const [dbLoadSummary, setDbLoadSummary] = useState<DbLoadSummary | null>(null);
  const [dbLoadError, setDbLoadError] = useState<string | null>(null);
  const [dbConnectionInfo, setDbConnectionInfo] = useState<{ supabase?: boolean; mongodb?: boolean }>({});
  const [isSyncing, setIsSyncing] = useState(false);
  const [isActivityLogsOpen, setIsActivityLogsOpen] = useState(false);
  const [dbSyncStatus, setDbSyncStatus] = useState<DbSyncStatus>({
    supabase: false,
    mongodb: false,
    errors: [],
    lastSyncedAt: null,
    isConnected: false
  });
  const [schemaHint, setSchemaHint] = useState<string | undefined>();
  const syncInFlightRef = useRef<Promise<SyncResponse | null> | null>(null);
  const syncSequenceRef = useRef(Number(sessionStorage.getItem('uss_sync_seq') || 0));

  const [activeTab, setActiveTab] = useState<ActiveTab>(() => {
    const saved = sessionStorage.getItem('uss_admin_tab');
    return (saved as ActiveTab) || 'attendance';
  });
  const [isAdminAuthenticated, setIsAdminAuthenticated] = useState<boolean>(() => {
    return sessionStorage.getItem('uss_admin_auth') === 'true';
  });
  const [isAuthModalOpen, setIsAuthModalOpen] = useState<boolean>(false);
  const [pendingTab, setPendingTab] = useState<ActiveTab | null>(null);
  const [mobileMenuOpen, setMobileMenuOpen] = useState<boolean>(false);

  const appStateRef = useRef({
    students, teachers, fees, payrolls, examResults, customFields, expenses,
    emailTemplates, studentAttendance, teacherAttendance, schoolFeeSettings,
    siteBranding, emailLogs, isAdminAuthenticated, activeTab
  });

  useEffect(() => {
    appStateRef.current = {
      students, teachers, fees, payrolls, examResults, customFields, expenses,
      emailTemplates, studentAttendance, teacherAttendance, schoolFeeSettings,
      siteBranding, emailLogs, isAdminAuthenticated, activeTab
    };
  }, [
    students, teachers, fees, payrolls, examResults, customFields, expenses,
    emailTemplates, studentAttendance, teacherAttendance, schoolFeeSettings,
    siteBranding, emailLogs, isAdminAuthenticated, activeTab
  ]);

  const applySyncResult = (result: SyncResponse | null) => {
    if (typeof result?.syncSequence === 'number') {
      syncSequenceRef.current = result.syncSequence;
      sessionStorage.setItem('uss_sync_seq', String(result.syncSequence));
    }

    // Background sync conflict — merge latest server data without reloading the screen
    if (result?.stale) {
      void silentMergeEntitiesFromServer();
      setDbSyncStatus(prev => ({
        ...prev,
        supabase: true,
        isConnected: true,
        errors: [],
        lastSyncedAt: new Date().toISOString()
      }));
      return;
    }

    setDbSyncStatus({
      supabase: Boolean(result?.supabase),
      mongodb: Boolean(result?.mongodb),
      errors: result?.errors ?? (result?.error ? [result.error] : []),
      lastSyncedAt: new Date().toISOString(),
      lastMessage: result?.message,
      isConnected: Boolean(result?.success ?? result?.supabase ?? result?.mongodb)
    });
    if (result?.emailLogs && Array.isArray(result.emailLogs)) {
      setEmailLogs(prev =>
        JSON.stringify(prev) === JSON.stringify(result.emailLogs) ? prev : result.emailLogs!
      );
    }
    if (Array.isArray(result.students)) {
      setStudents(prev => mergeEntityListsWithDocuments(prev, result.students as Student[]));
    }
    if (Array.isArray(result.teachers)) {
      setTeachers(prev => mergeEntityListsWithDocuments(prev, result.teachers as Teacher[]));
    }
  };

  const silentMergeEntitiesFromServer = async () => {
    const result = await fetchAllDbRecords();
    if (!result?.data) return;

    if (typeof result.syncSequence === 'number') {
      syncSequenceRef.current = result.syncSequence;
      sessionStorage.setItem('uss_sync_seq', String(result.syncSequence));
    }

    const data = result.data;
    if (Array.isArray(data.students)) {
      setStudents(prev => mergeEntityListsWithDocuments(prev, data.students as Student[]));
    }
    if (Array.isArray(data.teachers)) {
      setTeachers(prev => mergeEntityListsWithDocuments(prev, data.teachers as Teacher[]));
    }
    if (Array.isArray(data.fees)) {
      setFees(prev => mergePreferLatest(dedupeFeeVouchers(data.fees as FeeLedger[]), prev));
    }
    if (Array.isArray(data.payrolls)) {
      setPayrolls(prev => mergePreferLatest(data.payrolls as Payroll[], prev));
    }
    if (Array.isArray(data.examResults)) {
      setExamResults(prev => mergePreferLatest(data.examResults as ExamResult[], prev));
    }
    if (Array.isArray(data.expenses)) {
      setExpenses(prev => mergePreferLatest(data.expenses as Expense[], prev));
    }
    if (Array.isArray(data.emailTemplates)) {
      setEmailTemplates(prev => mergePreferLatest(data.emailTemplates as EmailTemplate[], prev));
    }
    if (Array.isArray(data.studentAttendance)) {
      setStudentAttendance(prev => mergePreferLatest(data.studentAttendance as StudentAttendance[], prev));
    }
    if (Array.isArray(data.teacherAttendance)) {
      setTeacherAttendance(prev => mergePreferLatest(data.teacherAttendance as TeacherAttendance[], prev));
    }
  };

  const buildSyncPayload = (patch: Partial<SyncPayload>): SyncPayload => {
    const s = appStateRef.current;
    const payload: SyncPayload = {
      adminSession: {
        isAuthenticated: s.isAdminAuthenticated,
        activeTab: s.isAdminAuthenticated ? (s.activeTab as string) : undefined,
        updated_at: new Date().toISOString()
      },
      syncSequence: syncSequenceRef.current
    };

    // Partial sync — only send entities that changed (much faster, avoids touching other modules)
    (Object.keys(patch) as (keyof SyncPayload)[]).forEach(key => {
      if (key === 'adminSession' || key === 'syncSequence') return;
      payload[key] = patch[key] as never;
    });

    return payload;
  };

  const flushSyncNow = (patch: Partial<SyncPayload> = {}): Promise<SyncResponse | null> => {
    if (!isDbLoaded || !dbLoadSucceeded) {
      return Promise.resolve({
        success: false,
        errors: ['Database not ready — sync paused to protect your data.']
      });
    }

    const runSync = async (): Promise<SyncResponse | null> => {
      if (syncInFlightRef.current) {
        try {
          await syncInFlightRef.current;
        } catch {
          // prior sync failed — continue
        }
      }

      setIsSyncing(true);
      const syncPromise = (async () => {
        await refreshSyncSequenceFromServer();
        const payload = buildSyncPayload(patch);
        payload.syncSequence = syncSequenceRef.current;
        const result = await syncStateToMongo(payload);
        applySyncResult(result);
        return result;
      })().finally(() => {
        syncInFlightRef.current = null;
        setIsSyncing(false);
      });

      syncInFlightRef.current = syncPromise;
      return syncPromise;
    };

    return runSync();
  };

  /** Sync only admin tab/session — never push full entity lists (avoids restoring deleted rows). */
  const syncAdminSessionOnly = async (): Promise<SyncResponse | null> => {
    if (!isDbLoaded || !dbLoadSucceeded) return null;
    setIsSyncing(true);
    try {
      await refreshSyncSequenceFromServer();
      const s = appStateRef.current;
      const adminSession: AdminSessionState = {
        isAuthenticated: s.isAdminAuthenticated,
        activeTab: s.isAdminAuthenticated ? (s.activeTab as string) : undefined,
        updated_at: new Date().toISOString()
      };
      const result = await syncStateToMongo({
        adminSession,
        syncSequence: syncSequenceRef.current
      });
      applySyncResult(result);
      return result;
    } finally {
      setIsSyncing(false);
    }
  };

  const handleSaveSiteBranding = async (settings: SiteBrandingSettings): Promise<SyncResponse | null> => {
    const stamped = { ...settings, client_updated_at: new Date().toISOString() };
    setSiteBranding(stamped);
    appStateRef.current = { ...appStateRef.current, siteBranding: stamped };
    return flushSyncNow({ siteBranding: stamped });
  };

  const loadFromDatabase = React.useCallback(async () => {
    setIsDbLoaded(false);
    setDbLoadSucceeded(false);
    setDbLoadPhase('connecting');
    setDbLoadError(null);
    setDbLoadSummary(null);

    let loadOk = false;

    try {
      const health = await fetchDbHealth();
      if (health) {
        setDbConnectionInfo({
          supabase: Boolean(health.supabase),
          mongodb: Boolean(health.mongodb)
        });
      }

      setDbLoadPhase('fetching');
      const result = await fetchAllDbRecords();

      if (result?.data) {
        setDbLoadPhase('processing');
        if (typeof result.syncSequence === 'number') {
          syncSequenceRef.current = result.syncSequence;
          sessionStorage.setItem('uss_sync_seq', String(result.syncSequence));
        }
        const data = result.data;
        if (Array.isArray(data.students)) setStudents(data.students as Student[]);
        if (Array.isArray(data.teachers)) setTeachers(data.teachers as Teacher[]);
        if (Array.isArray(data.fees)) setFees(dedupeFeeVouchers(data.fees as FeeLedger[]));
        if (Array.isArray(data.payrolls)) setPayrolls(data.payrolls as Payroll[]);
        if (Array.isArray(data.examResults)) setExamResults(data.examResults as ExamResult[]);
        if (Array.isArray(data.customFields)) setCustomFields(data.customFields as DynamicCustomField[]);
        if (Array.isArray(data.expenses)) setExpenses(data.expenses as Expense[]);
        if (Array.isArray(data.emailTemplates)) setEmailTemplates(data.emailTemplates as EmailTemplate[]);
        if (Array.isArray(data.studentAttendance)) setStudentAttendance(data.studentAttendance as StudentAttendance[]);
        if (Array.isArray(data.teacherAttendance)) setTeacherAttendance(data.teacherAttendance as TeacherAttendance[]);
        if (data.schoolFeeSettings) setSchoolFeeSettings(data.schoolFeeSettings as SchoolFeeSettings);
        if (data.siteBranding && typeof data.siteBranding === 'object') {
          setSiteBranding({ ...INITIAL_SITE_BRANDING, ...(data.siteBranding as SiteBrandingSettings) });
        }
        if (Array.isArray(data.emailLogs)) setEmailLogs(data.emailLogs as BrevoEmailLog[]);
        if (data.adminSession && typeof data.adminSession === 'object' && (data.adminSession as AdminSessionState).isAuthenticated) {
          setIsAdminAuthenticated(true);
          sessionStorage.setItem('uss_admin_auth', 'true');
          const sessionTab = (data.adminSession as AdminSessionState).activeTab;
          if (sessionTab) {
            setActiveTab(sessionTab as ActiveTab);
            sessionStorage.setItem('uss_admin_tab', sessionTab);
          }
        }

        const summary: DbLoadSummary = {
          students: Array.isArray(data.students) ? data.students.length : 0,
          teachers: Array.isArray(data.teachers) ? data.teachers.length : 0,
          fees: Array.isArray(data.fees) ? data.fees.length : 0,
          payrolls: Array.isArray(data.payrolls) ? data.payrolls.length : 0,
          examResults: Array.isArray(data.examResults) ? data.examResults.length : 0,
          expenses: Array.isArray(data.expenses) ? data.expenses.length : 0
        };
        setDbLoadSummary(summary);
        setDbLoadSucceeded(true);
        setDbConnectionInfo({
          supabase: result.supabase,
          mongodb: result.mongodb
        });
        setDbSyncStatus(prev => ({
          ...prev,
          supabase: result.supabase,
          mongodb: result.mongodb,
          isConnected: result.connected,
          errors: result.connected ? prev.errors : ['Database connection unavailable — sync paused to protect your data.']
        }));

        setDbLoadPhase('ready');
        loadOk = true;
      } else {
        setDbLoadPhase('error');
        setDbLoadError('Could not load data from database. Sync paused so demo data is not written over your records.');
        setDbSyncStatus(prev => ({
          ...prev,
          isConnected: false,
          errors: ['Could not load data from database. Sync paused so demo data is not written over your records.']
        }));
      }
    } catch {
      setDbLoadPhase('error');
      setDbLoadError('Database load failed. Please check your connection and try again.');
      setDbSyncStatus(prev => ({
        ...prev,
        isConnected: false,
        errors: ['Database load failed. Sync paused to protect your data.']
      }));
    }

    if (loadOk) setIsDbLoaded(true);
  }, []);

  // Initial Load from MongoDB / Supabase Backend API
  useEffect(() => {
    loadFromDatabase();

    fetchDbSchemaStatus().then(schema => {
      if (schema && schema.allReady === false && typeof schema.hint === 'string') {
        setSchemaHint(schema.hint);
      }
    });
  }, [loadFromDatabase]);

  // Auto-mark overdue fees when due dates pass (on load + periodic check)
  useEffect(() => {
    if (!isDbLoaded) return;

    const applyReconciliation = () => {
      setFees(prev => {
        const reconciled = reconcileAllFees(prev);
        if (!feesNeedReconciliation(prev, reconciled)) return prev;
        appStateRef.current = { ...appStateRef.current, fees: reconciled };
        void flushSyncNow({ fees: reconciled });
        return reconciled;
      });
    };

    applyReconciliation();
    const interval = setInterval(applyReconciliation, 60000);
    return () => clearInterval(interval);
  }, [isDbLoaded]);

  // Refresh email logs from DB periodically (picks up server-sent emails)
  useEffect(() => {
    if (!isDbLoaded || !isAdminAuthenticated) return;
    const refreshLogs = () => {
      fetchAllDbRecords().then(result => {
        if (Array.isArray(result?.data?.emailLogs)) setEmailLogs(result.data.emailLogs as BrevoEmailLog[]);
      });
    };
    const interval = setInterval(refreshLogs, 30000);
    return () => clearInterval(interval);
  }, [isDbLoaded, isAdminAuthenticated]);


  // Handle Tab Switch Request
  const handleRequestAdminAuth = (targetTab: ActiveTab) => {
    setPendingTab(targetTab);
    setIsAuthModalOpen(true);
  };

  // Handle Successful Master Password Authentication
  const handleAuthenticated = () => {
    const nextTab = pendingTab ?? activeTab;
    setIsAdminAuthenticated(true);
    sessionStorage.setItem('uss_admin_auth', 'true');
    setIsAuthModalOpen(false);
    if (pendingTab) {
      setActiveTab(pendingTab);
      sessionStorage.setItem('uss_admin_tab', pendingTab);
      setPendingTab(null);
    }
    appStateRef.current = {
      ...appStateRef.current,
      isAdminAuthenticated: true,
      activeTab: nextTab
    };
    void syncAdminSessionOnly();
  };

  // Lock Admin Privileges
  const handleLockAdmin = () => {
    setIsAdminAuthenticated(false);
    sessionStorage.removeItem('uss_admin_auth');
    const nextTab: ActiveTab = activeTab !== 'attendance' ? 'attendance' : activeTab;
    if (activeTab !== 'attendance') {
      setActiveTab('attendance');
      sessionStorage.setItem('uss_admin_tab', 'attendance');
    }
    appStateRef.current = {
      ...appStateRef.current,
      isAdminAuthenticated: false,
      activeTab: nextTab
    };
    void syncAdminSessionOnly();
  };

  // Persist active tab + sync admin session when admin switches tabs
  const adminTabSyncReadyRef = useRef(false);
  useEffect(() => {
    if (isAdminAuthenticated) {
      sessionStorage.setItem('uss_admin_tab', activeTab);
    }
    if (!isDbLoaded || !dbLoadSucceeded || !isAdminAuthenticated) return;
    if (!adminTabSyncReadyRef.current) {
      adminTabSyncReadyRef.current = true;
      return;
    }
    void syncAdminSessionOnly();
  }, [activeTab, isAdminAuthenticated, isDbLoaded, dbLoadSucceeded]);

  const reportSyncFailure = (entityLabel: string, result: SyncResponse | null) => {
    if (!result || result.success) return;
    const detail = result.errors?.[0] || result.error || result.message || 'Could not reach the database.';
    alert(`${entityLabel} could not be saved to the database.\n\n${detail}\n\nPlease check your connection and try again.`);
  };

  const refreshSyncSequenceFromServer = async () => {
    const result = await fetchAllDbRecords();
    if (typeof result?.syncSequence === 'number') {
      syncSequenceRef.current = result.syncSequence;
      sessionStorage.setItem('uss_sync_seq', String(result.syncSequence));
    }
  };

  const persistChange = <K extends keyof SyncPayload>(
    label: string,
    key: K,
    nextValue: SyncPayload[K],
    extraPatch: Partial<SyncPayload> = {}
  ) => {
    appStateRef.current = { ...appStateRef.current, [key]: nextValue };
    void flushSyncNow({ ...extraPatch, [key]: nextValue }).then(r => reportSyncFailure(label, r));
  };

  const handleUpdateSchoolFeeSettings = (settings: SchoolFeeSettings) => {
    const withTimestamp = { ...settings, updated_at: new Date().toISOString() };
    setSchoolFeeSettings(withTimestamp);
    persistChange('School fee settings', 'schoolFeeSettings', withTimestamp);
  };

  // State Updates — sync to database immediately on create/update/delete
  const handleSaveStudent = (newStudent: Student) => {
    let nextList: Student[] = [];
    setStudents(prev => {
      nextList = [newStudent, ...prev];
      appStateRef.current = { ...appStateRef.current, students: nextList };
      return nextList;
    });
    void flushSyncNow({ students: nextList }).then(result => reportSyncFailure('Student', result));
  };

  const handleUpdateStudent = (updatedStudent: Student) => {
    let nextList: Student[] = [];
    setStudents(prev => {
      nextList = prev.map(s => s.id === updatedStudent.id ? updatedStudent : s);
      appStateRef.current = { ...appStateRef.current, students: nextList };
      return nextList;
    });
    void flushSyncNow({ students: nextList }).then(result => reportSyncFailure('Student', result));
  };

  const handleDeleteStudent = async (studentId: string) => {
    const nextList = appStateRef.current.students.filter(s => s.id !== studentId);
    appStateRef.current = { ...appStateRef.current, students: nextList };
    setStudents(nextList);
    const result = await flushSyncNow({ students: nextList });
    reportSyncFailure('Student delete', result);
  };

  const handleSaveTeacher = (newTeacher: Teacher) => {
    let nextList: Teacher[] = [];
    setTeachers(prev => {
      nextList = [newTeacher, ...prev];
      appStateRef.current = { ...appStateRef.current, teachers: nextList };
      return nextList;
    });
    void flushSyncNow({ teachers: nextList }).then(result => reportSyncFailure('Teacher', result));
  };

  const handleUpdateTeacher = (updatedTeacher: Teacher) => {
    let nextList: Teacher[] = [];
    setTeachers(prev => {
      nextList = prev.map(t => t.id === updatedTeacher.id ? updatedTeacher : t);
      appStateRef.current = { ...appStateRef.current, teachers: nextList };
      return nextList;
    });
    void flushSyncNow({ teachers: nextList }).then(result => reportSyncFailure('Teacher', result));
  };

  const handleDeleteTeacher = async (teacherId: string) => {
    const nextList = appStateRef.current.teachers.filter(t => t.id !== teacherId);
    appStateRef.current = { ...appStateRef.current, teachers: nextList };
    setTeachers(nextList);
    const result = await flushSyncNow({ teachers: nextList });
    reportSyncFailure('Teacher delete', result);
  };

  const handleSaveStudentAttendance = (records: StudentAttendance[]) => {
    if (records.length === 0) return;
    const { date, class_name } = records[0];
    let nextList: StudentAttendance[] = [];
    setStudentAttendance(prev => {
      const rest = prev.filter(a => !(a.date === date && a.class_name === class_name));
      nextList = [...records, ...rest];
      appStateRef.current = { ...appStateRef.current, studentAttendance: nextList };
      return nextList;
    });
    void flushSyncNow({ studentAttendance: nextList }).then(r => reportSyncFailure('Attendance', r));
  };

  const handleSaveTeacherAttendance = (records: TeacherAttendance[]) => {
    if (records.length === 0) return;
    const { date } = records[0];
    let nextList: TeacherAttendance[] = [];
    setTeacherAttendance(prev => {
      const rest = prev.filter(a => a.date !== date);
      nextList = [...records, ...rest];
      appStateRef.current = { ...appStateRef.current, teacherAttendance: nextList };
      return nextList;
    });
    void flushSyncNow({ teacherAttendance: nextList }).then(r => reportSyncFailure('Attendance', r));
  };

  const handleSaveFees = (newFees: FeeLedger[]) => {
    let nextList: FeeLedger[] = [];
    setFees(prev => {
      nextList = [...newFees, ...prev];
      appStateRef.current = { ...appStateRef.current, fees: nextList };
      return nextList;
    });
    void flushSyncNow({ fees: nextList }).then(r => reportSyncFailure('Fee voucher', r));
  };

  const handleUpdateFeeStatus = (feeId: string, status: 'Paid' | 'Partial' | 'Overdue', paidAmount: number) => {
    let nextList: FeeLedger[] = [];
    setFees(prev => {
      nextList = prev.map(f => f.id === feeId ? { ...f, status, paid_amount: paidAmount } : f);
      appStateRef.current = { ...appStateRef.current, fees: nextList };
      return nextList;
    });
    void flushSyncNow({ fees: nextList }).then(r => reportSyncFailure('Fee voucher', r));
  };

  const handleUpdateFee = (updatedFee: FeeLedger) => {
    let nextList: FeeLedger[] = [];
    setFees(prev => {
      nextList = prev.map(f => f.id === updatedFee.id ? updatedFee : f);
      appStateRef.current = { ...appStateRef.current, fees: nextList };
      return nextList;
    });
    void flushSyncNow({ fees: nextList }).then(r => reportSyncFailure('Fee voucher', r));
  };

  const handleDeleteFee = async (feeId: string) => {
    const nextList = appStateRef.current.fees.filter(f => f.id !== feeId);
    appStateRef.current = { ...appStateRef.current, fees: nextList };
    setFees(nextList);
    const result = await flushSyncNow({ fees: nextList });
    reportSyncFailure('Fee delete', result);
  };

  const handleSavePayrolls = (newPayrolls: Payroll[]) => {
    let nextList: Payroll[] = [];
    setPayrolls(prev => {
      nextList = [...newPayrolls, ...prev];
      appStateRef.current = { ...appStateRef.current, payrolls: nextList };
      return nextList;
    });
    void flushSyncNow({ payrolls: nextList }).then(r => reportSyncFailure('Payroll', r));
  };

  const handleUpdatePayroll = (updatedPayroll: Payroll) => {
    let nextList: Payroll[] = [];
    setPayrolls(prev => {
      nextList = prev.map(p => p.id === updatedPayroll.id ? updatedPayroll : p);
      appStateRef.current = { ...appStateRef.current, payrolls: nextList };
      return nextList;
    });
    void flushSyncNow({ payrolls: nextList }).then(r => reportSyncFailure('Payroll', r));
  };

  const handleDeletePayroll = async (payrollId: string) => {
    const nextList = appStateRef.current.payrolls.filter(p => p.id !== payrollId);
    appStateRef.current = { ...appStateRef.current, payrolls: nextList };
    setPayrolls(nextList);
    const result = await flushSyncNow({ payrolls: nextList });
    reportSyncFailure('Payroll delete', result);
  };

  const handleSaveExamResults = (newResults: ExamResult[]) => {
    let nextList: ExamResult[] = [];
    setExamResults(prev => {
      nextList = [...newResults, ...prev];
      appStateRef.current = { ...appStateRef.current, examResults: nextList };
      return nextList;
    });
    void flushSyncNow({ examResults: nextList }).then(r => reportSyncFailure('Exam result', r));
  };

  const handleDeleteExamResult = async (resultId: string) => {
    const nextList = appStateRef.current.examResults.filter(r => r.id !== resultId);
    appStateRef.current = { ...appStateRef.current, examResults: nextList };
    setExamResults(nextList);
    const result = await flushSyncNow({ examResults: nextList });
    reportSyncFailure('Exam result delete', result);
  };

  const handleUpdateExamResult = (updatedResult: ExamResult) => {
    let nextList: ExamResult[] = [];
    setExamResults(prev => {
      nextList = prev.map(r => r.id === updatedResult.id ? updatedResult : r);
      appStateRef.current = { ...appStateRef.current, examResults: nextList };
      return nextList;
    });
    void flushSyncNow({ examResults: nextList }).then(r => reportSyncFailure('Exam result', r));
  };

  const handleAddCustomField = (newField: DynamicCustomField) => {
    const next = [...appStateRef.current.customFields, newField];
    setCustomFields(next);
    appStateRef.current = { ...appStateRef.current, customFields: next };
    void syncCustomFieldsImmediate(next);
    void flushSyncNow({ customFields: next }).then(r => reportSyncFailure('Custom field', r));
  };

  const handleUpdateCustomField = (updatedField: DynamicCustomField) => {
    const s = appStateRef.current;
    const oldField = s.customFields.find(f => f.id === updatedField.id);
    const nextFields = s.customFields.map(f => f.id === updatedField.id ? updatedField : f);

    let nextStudents = s.students;
    let nextTeachers = s.teachers;
    let nextFees = s.fees;
    let nextExpenses = s.expenses;

    if (oldField && oldField.fieldName !== updatedField.fieldName) {
      if (updatedField.target === 'student') {
        nextStudents = migrateStudentsCustomFieldKey(s.students, oldField.fieldName, updatedField.fieldName);
        setStudents(nextStudents);
      } else if (updatedField.target === 'teacher') {
        nextTeachers = migrateTeachersCustomFieldKey(s.teachers, oldField.fieldName, updatedField.fieldName);
        setTeachers(nextTeachers);
      } else if (updatedField.target === 'financial') {
        nextFees = s.fees.map(f => ({
          ...f,
          custom_fields: migrateCustomFieldKey(f.custom_fields, oldField.fieldName, updatedField.fieldName)
        }));
        nextExpenses = s.expenses.map(e => ({
          ...e,
          custom_fields: migrateCustomFieldKey(e.custom_fields, oldField.fieldName, updatedField.fieldName)
        }));
        setFees(nextFees);
        setExpenses(nextExpenses);
      }
    }

    setCustomFields(nextFields);
    appStateRef.current = {
      ...appStateRef.current,
      customFields: nextFields,
      students: nextStudents,
      teachers: nextTeachers,
      fees: nextFees,
      expenses: nextExpenses
    };
    void syncCustomFieldsImmediate(nextFields);
    void flushSyncNow({
      customFields: nextFields,
      students: nextStudents,
      teachers: nextTeachers,
      fees: nextFees,
      expenses: nextExpenses
    }).then(r => reportSyncFailure('Custom field', r));
  };

  const handleDeleteCustomField = async (fieldId: string) => {
    const s = appStateRef.current;
    const removed = s.customFields.find(f => f.id === fieldId);
    const nextFields = s.customFields.filter(f => f.id !== fieldId);

    let nextStudents = s.students;
    let nextTeachers = s.teachers;
    let nextFees = s.fees;
    let nextExpenses = s.expenses;

    if (removed) {
      if (removed.target === 'student') {
        nextStudents = s.students.map(st => ({
          ...st,
          custom_fields: removeCustomFieldKey(st.custom_fields, removed.fieldName)
        }));
        setStudents(nextStudents);
      } else if (removed.target === 'teacher') {
        nextTeachers = s.teachers.map(t => ({
          ...t,
          custom_fields: removeCustomFieldKey(t.custom_fields, removed.fieldName)
        }));
        setTeachers(nextTeachers);
      } else if (removed.target === 'financial') {
        nextFees = s.fees.map(f => ({
          ...f,
          custom_fields: removeCustomFieldKey(f.custom_fields, removed.fieldName)
        }));
        nextExpenses = s.expenses.map(e => ({
          ...e,
          custom_fields: removeCustomFieldKey(e.custom_fields, removed.fieldName)
        }));
        setFees(nextFees);
        setExpenses(nextExpenses);
      }
    }

    setCustomFields(nextFields);
    appStateRef.current = {
      ...appStateRef.current,
      customFields: nextFields,
      students: nextStudents,
      teachers: nextTeachers,
      fees: nextFees,
      expenses: nextExpenses
    };
    void syncCustomFieldsImmediate(nextFields);
    const result = await flushSyncNow({
      customFields: nextFields,
      students: nextStudents,
      teachers: nextTeachers,
      fees: nextFees,
      expenses: nextExpenses
    });
    reportSyncFailure('Custom field delete', result);
  };

  const handleReorderCustomFields = (orderedIds: string[]) => {
    const prev = appStateRef.current.customFields;
    const fieldMap = new Map(prev.map(f => [f.id, f]));
    const reordered = orderedIds.map(id => fieldMap.get(id)).filter(Boolean) as DynamicCustomField[];
    const reorderedSet = new Set(orderedIds);
    const rest = prev.filter(f => !reorderedSet.has(f.id));
    const next = [...reordered, ...rest];
    setCustomFields(next);
    appStateRef.current = { ...appStateRef.current, customFields: next };
    void syncCustomFieldsImmediate(next);
    void flushSyncNow({ customFields: next }).then(r => reportSyncFailure('Custom field', r));
  };

  const handleSaveExpense = (newExpense: Expense) => {
    let nextList: Expense[] = [];
    setExpenses(prev => {
      nextList = [newExpense, ...prev];
      appStateRef.current = { ...appStateRef.current, expenses: nextList };
      return nextList;
    });
    void flushSyncNow({ expenses: nextList }).then(r => reportSyncFailure('Expense', r));
  };

  const handleUpdateExpense = (updatedExpense: Expense) => {
    let nextList: Expense[] = [];
    setExpenses(prev => {
      nextList = prev.map(e => e.id === updatedExpense.id ? updatedExpense : e);
      appStateRef.current = { ...appStateRef.current, expenses: nextList };
      return nextList;
    });
    void flushSyncNow({ expenses: nextList }).then(r => reportSyncFailure('Expense', r));
  };

  const handleDeleteExpense = async (expenseId: string) => {
    const nextList = appStateRef.current.expenses.filter(e => e.id !== expenseId);
    appStateRef.current = { ...appStateRef.current, expenses: nextList };
    setExpenses(nextList);
    const result = await flushSyncNow({ expenses: nextList });
    reportSyncFailure('Expense delete', result);
  };

  const handleSaveEmailTemplate = (updatedTemplate: EmailTemplate) => {
    let nextList: EmailTemplate[] = [];
    setEmailTemplates(prev => {
      const exists = prev.some(t => t.id === updatedTemplate.id);
      nextList = exists
        ? prev.map(t => t.id === updatedTemplate.id ? updatedTemplate : t)
        : [updatedTemplate, ...prev];
      appStateRef.current = { ...appStateRef.current, emailTemplates: nextList };
      return nextList;
    });
    void flushSyncNow({ emailTemplates: nextList }).then(r => reportSyncFailure('Email template', r));
  };

  return (
    <div className="min-h-screen bg-slate-100 text-slate-900 font-sans flex flex-col selection:bg-blue-900 selection:text-white">

      {(!isDbLoaded || dbLoadPhase === 'error') && (
        <DatabaseLoadingScreen
          phase={dbLoadPhase}
          supabase={dbConnectionInfo.supabase}
          mongodb={dbConnectionInfo.mongodb}
          summary={dbLoadSummary}
          error={dbLoadError}
          onRetry={loadFromDatabase}
        />
      )}
      
      {/* Top Navbar & Security Header */}
      <NavbarHeader 
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        isAdminAuthenticated={isAdminAuthenticated}
        onLockAdmin={handleLockAdmin}
        onRequestAdminAuth={handleRequestAdminAuth}
        mobileMenuOpen={mobileMenuOpen}
        setMobileMenuOpen={setMobileMenuOpen}
        siteBranding={siteBranding}
        emailLogsCount={emailLogs.length}
        isSyncing={isSyncing}
        hasSyncErrors={(dbSyncStatus.errors?.length ?? 0) > 0}
        onOpenActivityLogs={() => setIsActivityLogsOpen(true)}
      />

      <ActivityLogsPanel
        isOpen={isActivityLogsOpen}
        onClose={() => setIsActivityLogsOpen(false)}
        emailLogs={emailLogs}
        isSyncing={isSyncing}
        syncStatus={dbSyncStatus}
        schemaHint={schemaHint}
      />

      {/* Main Active Screen Content Wrapper */}
      <main className="flex-1 py-6">
        
        {/* Screen D: Attendance Console (Unprotected Phase 1 & Protected Phase 2) */}
        {activeTab === 'attendance' && (
          <AttendanceConsole 
            students={students}
            teachers={teachers}
            studentAttendance={studentAttendance}
            teacherAttendance={teacherAttendance}
            onSaveStudentAttendance={handleSaveStudentAttendance}
            onSaveTeacherAttendance={handleSaveTeacherAttendance}
            isAdminAuthenticated={isAdminAuthenticated}
            onRequestAdminAuth={() => handleRequestAdminAuth('attendance')}
          />
        )}

        {/* Screen A: Password-Protected Student Admissions */}
        {activeTab === 'admissions' && isAdminAuthenticated && (
          <StudentAdmissions 
            onSaveStudent={handleSaveStudent}
            existingStudents={students}
            customFields={customFields}
            onAddCustomField={handleAddCustomField}
            onUpdateCustomField={handleUpdateCustomField}
            onDeleteCustomField={handleDeleteCustomField}
            onReorderCustomFields={handleReorderCustomFields}
          />
        )}

        {/* Screen B: Master Student Directory & Student Hub */}
        {activeTab === 'students' && isAdminAuthenticated && (
          <StudentHub 
            students={students}
            onUpdateStudent={handleUpdateStudent}
            onDeleteStudent={handleDeleteStudent}
            attendanceList={studentAttendance}
            fees={fees}
            examResults={examResults}
            onDeleteExamResult={handleDeleteExamResult}
            onUpdateExamResult={handleUpdateExamResult}
            onSaveExamResults={handleSaveExamResults}
            customFields={customFields}
            onAddCustomField={handleAddCustomField}
            onUpdateCustomField={handleUpdateCustomField}
            onDeleteCustomField={handleDeleteCustomField}
            onReorderCustomFields={handleReorderCustomFields}
            onRefreshFromServer={silentMergeEntitiesFromServer}
          />
        )}

        {/* Screen C: Teacher Hub & Master Directory */}
        {activeTab === 'teachers' && isAdminAuthenticated && (
          <TeacherHub 
            teachers={teachers}
            onSaveTeacher={handleSaveTeacher}
            onUpdateTeacher={handleUpdateTeacher}
            onDeleteTeacher={handleDeleteTeacher}
            attendanceList={teacherAttendance}
            payrolls={payrolls}
            onSavePayrolls={handleSavePayrolls}
            onUpdatePayroll={handleUpdatePayroll}
            customFields={customFields}
            onAddCustomField={handleAddCustomField}
            onUpdateCustomField={handleUpdateCustomField}
            onDeleteCustomField={handleDeleteCustomField}
            onReorderCustomFields={handleReorderCustomFields}
            onRefreshFromServer={silentMergeEntitiesFromServer}
          />
        )}

        {/* Screen E: Fee Manager Module */}
        {activeTab === 'fees' && isAdminAuthenticated && (
          <FeeManager 
            students={students}
            fees={fees}
            schoolFeeSettings={schoolFeeSettings}
            onUpdateSchoolFeeSettings={handleUpdateSchoolFeeSettings}
            onSaveFees={handleSaveFees}
            onUpdateFeeStatus={handleUpdateFeeStatus}
            onUpdateFee={handleUpdateFee}
            onDeleteFee={handleDeleteFee}
            customFields={customFields}
            onAddCustomField={handleAddCustomField}
            onUpdateCustomField={handleUpdateCustomField}
            onDeleteCustomField={handleDeleteCustomField}
            onReorderCustomFields={handleReorderCustomFields}
          />
        )}

        {/* Screen F: Payroll Manager Module */}
        {activeTab === 'payroll' && isAdminAuthenticated && (
          <PayrollManager 
            teachers={teachers}
            teacherAttendance={teacherAttendance}
            payrolls={payrolls}
            onSavePayrolls={handleSavePayrolls}
            onUpdatePayroll={handleUpdatePayroll}
            onDeletePayroll={handleDeletePayroll}
          />
        )}

        {/* Expense Tracker Module */}
        {activeTab === 'expenses' && isAdminAuthenticated && (
          <ExpenseTracker 
            expenses={expenses}
            onSaveExpense={handleSaveExpense}
            onUpdateExpense={handleUpdateExpense}
            onDeleteExpense={handleDeleteExpense}
            customFields={customFields}
            onAddCustomField={handleAddCustomField}
            onUpdateCustomField={handleUpdateCustomField}
            onDeleteCustomField={handleDeleteCustomField}
            onReorderCustomFields={handleReorderCustomFields}
          />
        )}

        {/* System Email Template Designer */}
        {activeTab === 'email-designer' && isAdminAuthenticated && (
          <EmailDesigner 
            emailTemplates={emailTemplates}
            onSaveTemplate={handleSaveEmailTemplate}
            siteBranding={siteBranding}
          />
        )}

        {/* Screen G: Batch Results Parser */}
        {activeTab === 'batch-results' && isAdminAuthenticated && (
          <BatchResultsParser 
            students={students}
            examResults={examResults}
            onSaveExamResults={handleSaveExamResults}
            onDeleteExamResult={handleDeleteExamResult}
            onUpdateExamResult={handleUpdateExamResult}
          />
        )}

        {/* Screen H: Reporting Center */}
        {activeTab === 'reporting' && isAdminAuthenticated && (
          <ReportingCenter 
            students={students}
            teachers={teachers}
            studentAttendance={studentAttendance}
            teacherAttendance={teacherAttendance}
            fees={fees}
            payrolls={payrolls}
          />
        )}

        {/* Gemini AI Assistant */}
        {activeTab === 'ai-assistant' && isAdminAuthenticated && (
          <GeminiAssistant />
        )}

        {activeTab === 'site-settings' && isAdminAuthenticated && (
          <SiteSettingsPortal
            siteBranding={siteBranding}
            onSaveSiteBranding={handleSaveSiteBranding}
            dbSyncStatus={dbSyncStatus}
            isSyncing={isSyncing}
          />
        )}

      </main>


      {/* Footer Bar */}
      <footer className="bg-slate-900 border-t border-slate-800 text-slate-400 py-6 text-center text-xs space-y-1">
        <p className="font-bold text-slate-300">
          {siteBranding.footer_title} &copy; {new Date().getFullYear()}
        </p>
        <p className="text-[11px] text-slate-500">
          {siteBranding.footer_subtitle}
        </p>
        {siteBranding.footer_contact && (
          <p className="text-[11px] text-slate-500">
            {siteBranding.footer_contact}
          </p>
        )}
      </footer>

      {/* Master Admin Security Password Authentication Modal */}
      <AdminAuthModal 
        isOpen={isAuthModalOpen}
        onAuthenticated={handleAuthenticated}
        onCancel={() => setIsAuthModalOpen(false)}
        targetModuleName={pendingTab ? pendingTab.toUpperCase() : 'ADMIN AREA'}
      />
    </div>
  );
}
