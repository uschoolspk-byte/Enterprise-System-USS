import React, { useState, useEffect, useMemo } from 'react';
import { 
  CalendarCheck, 
  UserCheck, 
  GraduationCap, 
  Lock, 
  Unlock, 
  CheckCircle, 
  AlertCircle,
  CheckSquare,
  ShieldCheck
} from 'lucide-react';
import { Student, Teacher, StudentAttendance, TeacherAttendance, AttendanceState } from '../types';

interface AttendanceConsoleProps {
  students: Student[];
  teachers: Teacher[];
  studentAttendance: StudentAttendance[];
  teacherAttendance: TeacherAttendance[];
  onSaveStudentAttendance: (records: StudentAttendance[]) => void;
  onSaveTeacherAttendance: (records: TeacherAttendance[]) => void;
  isAdminAuthenticated: boolean;
  onRequestAdminAuth: () => void;
}

export const AttendanceConsole: React.FC<AttendanceConsoleProps> = ({
  students,
  teachers,
  studentAttendance,
  teacherAttendance,
  onSaveStudentAttendance,
  onSaveTeacherAttendance,
  isAdminAuthenticated,
  onRequestAdminAuth
}) => {
  const [activePhase, setActivePhase] = useState<'phase1_students' | 'phase2_staff'>('phase1_students');
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().slice(0, 10));
  const [selectedClass, setSelectedClass] = useState('1');
  const [studentFormState, setStudentFormState] = useState<Record<string, { status: AttendanceState; hl_reason: string }>>({});
  const [teacherFormState, setTeacherFormState] = useState<Record<string, { status: AttendanceState; hl_reason: string }>>({});
  const [toastMsg, setToastMsg] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const existingStudentRecords = useMemo(
    () => studentAttendance.filter(a => a.date === selectedDate && a.class_name === selectedClass),
    [studentAttendance, selectedDate, selectedClass]
  );
  const existingTeacherRecords = useMemo(
    () => teacherAttendance.filter(a => a.date === selectedDate),
    [teacherAttendance, selectedDate]
  );

  const isStudentSheetLocked = existingStudentRecords.length > 0;
  const isTeacherSheetLocked = existingTeacherRecords.length > 0;

  const canEditStudentSheet = !isStudentSheetLocked || isAdminAuthenticated;
  const canEditTeacherSheet = !isTeacherSheetLocked || isAdminAuthenticated;

  const existingStudentById = useMemo(
    () => new Map(existingStudentRecords.map(r => [r.student_id, r])),
    [existingStudentRecords]
  );
  const existingTeacherById = useMemo(
    () => new Map(existingTeacherRecords.map(r => [r.teacher_id, r])),
    [existingTeacherRecords]
  );

  useEffect(() => {
    const next: Record<string, { status: AttendanceState; hl_reason: string }> = {};
    for (const rec of existingStudentRecords) {
      next[rec.student_id] = { status: rec.status, hl_reason: rec.hl_reason || '' };
    }
    setStudentFormState(next);
  }, [selectedDate, selectedClass, existingStudentRecords]);

  useEffect(() => {
    const next: Record<string, { status: AttendanceState; hl_reason: string }> = {};
    for (const rec of existingTeacherRecords) {
      next[rec.teacher_id] = { status: rec.status, hl_reason: rec.hl_reason || '' };
    }
    setTeacherFormState(next);
  }, [selectedDate, existingTeacherRecords]);

  const classStudents = students.filter(s => s.class_name === selectedClass);
  const allClasses = Array.from(new Set(students.map(s => s.class_name)));

  const handleStudentStatusChange = (studentId: string, status: AttendanceState) => {
    setStudentFormState(prev => ({
      ...prev,
      [studentId]: {
        status,
        hl_reason: prev[studentId]?.hl_reason || ''
      }
    }));
  };

  const handleStudentHLReasonChange = (studentId: string, reason: string) => {
    setStudentFormState(prev => ({
      ...prev,
      [studentId]: {
        status: prev[studentId]?.status || 'HL',
        hl_reason: reason
      }
    }));
  };

  const handleSubmitStudentAttendance = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);

    if (isStudentSheetLocked && !isAdminAuthenticated) {
      setErrorMsg(`LOCKED: Attendance for Class ${selectedClass} on ${selectedDate} is locked. Admin login required to edit.`);
      return;
    }

    for (const student of classStudents) {
      const state = studentFormState[student.id] || { status: 'P', hl_reason: '' };
      if (state.status === 'HL' && !state.hl_reason.trim()) {
        setErrorMsg(`VALIDATION FAILED: Student "${student.full_name}" marked Half Leave (HL) MUST have a "Reason for Half Leave" supplied before submission.`);
        return;
      }
    }

    const records: StudentAttendance[] = classStudents.map(student => {
      const state = studentFormState[student.id] || { status: 'P', hl_reason: '' };
      const existing = existingStudentById.get(student.id);
      return {
        id: existing?.id ?? 'sa-' + Date.now() + '-' + Math.random().toString(36).slice(2, 6),
        date: selectedDate,
        class_name: selectedClass,
        student_id: student.id,
        status: state.status,
        hl_reason: state.status === 'HL' ? state.hl_reason.trim() : undefined,
        created_at: existing?.created_at ?? new Date().toISOString()
      };
    });

    onSaveStudentAttendance(records);
    const action = isStudentSheetLocked ? 'updated' : 'locked';
    setToastMsg(`SUCCESS: Class ${selectedClass} attendance (${records.length} students) ${action} for ${selectedDate}!`);
    setTimeout(() => setToastMsg(null), 4000);
  };

  const handleMarkAllStaffPresent = () => {
    const newState: Record<string, { status: AttendanceState; hl_reason: string }> = {};
    teachers.forEach(t => {
      newState[t.id] = { status: 'P', hl_reason: '' };
    });
    setTeacherFormState(newState);
    setToastMsg(`Administrative override: All ${teachers.length} faculty members marked PRESENT!`);
    setTimeout(() => setToastMsg(null), 3000);
  };

  const handleSubmitTeacherAttendance = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);

    if (isTeacherSheetLocked && !isAdminAuthenticated) {
      setErrorMsg(`LOCKED: Staff attendance for ${selectedDate} is locked. Admin login required to edit.`);
      return;
    }

    for (const teacher of teachers) {
      const state = teacherFormState[teacher.id] || { status: 'P', hl_reason: '' };
      if (state.status === 'HL' && !state.hl_reason.trim()) {
        setErrorMsg(`VALIDATION FAILED: Faculty member "${teacher.full_name}" marked Half Leave (HL) MUST have a "Reason for Half Leave" supplied before submission.`);
        return;
      }
    }

    const records: TeacherAttendance[] = teachers.map(teacher => {
      const state = teacherFormState[teacher.id] || { status: 'P', hl_reason: '' };
      const existing = existingTeacherById.get(teacher.id);
      return {
        id: existing?.id ?? 'ta-' + Date.now() + '-' + Math.random().toString(36).slice(2, 6),
        date: selectedDate,
        teacher_id: teacher.id,
        status: state.status,
        hl_reason: state.status === 'HL' ? state.hl_reason.trim() : undefined,
        created_at: existing?.created_at ?? new Date().toISOString()
      };
    });

    onSaveTeacherAttendance(records);
    const action = isTeacherSheetLocked ? 'updated' : 'locked';
    setToastMsg(`SUCCESS: Faculty attendance (${records.length} records) ${action} for ${selectedDate}!`);
    setTimeout(() => setToastMsg(null), 4000);
  };

  const handleAdminEditStudent = () => {
    if (!isAdminAuthenticated) onRequestAdminAuth();
  };

  const handleAdminEditTeacher = () => {
    if (!isAdminAuthenticated) onRequestAdminAuth();
  };

  return (
    <div className="max-w-6xl mx-auto p-4 sm:p-6 space-y-6">
      
      {toastMsg && (
        <div className="p-4 rounded-xl bg-emerald-600 text-white font-bold flex items-center gap-2 shadow-xl animate-in slide-in-from-top">
          <CheckCircle className="w-5 h-5 text-emerald-200" />
          <span>{toastMsg}</span>
        </div>
      )}

      {errorMsg && (
        <div className="p-4 rounded-xl bg-red-600 text-white font-bold flex items-center gap-2 shadow-xl animate-in slide-in-from-top">
          <AlertCircle className="w-5 h-5 text-red-200" />
          <span>{errorMsg}</span>
        </div>
      )}

      <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-xl space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b pb-4">
          <div>
            <div className="flex items-center gap-2">
              <CalendarCheck className="w-6 h-6 text-blue-900" />
              <h2 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight">
                Dual-Phase Attendance Logging Console
              </h2>
            </div>
            <p className="text-xs text-slate-500 mt-1">
              Submitted sheets are locked for staff. Admins can unlock and update locked student &amp; teacher attendance.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-xs font-bold text-slate-600">Calendar Date:</span>
            <input 
              type="date"
              value={selectedDate}
              onChange={e => setSelectedDate(e.target.value)}
              className="px-3 py-1.5 rounded-xl border border-slate-300 font-bold text-sm bg-slate-50"
            />
          </div>
        </div>

        <div className="flex flex-col sm:flex-row gap-3">
          <button
            onClick={() => setActivePhase('phase1_students')}
            className={`flex-1 p-4 rounded-2xl border-2 text-left transition-all ${
              activePhase === 'phase1_students'
                ? 'border-blue-900 bg-blue-50/80 shadow-md'
                : 'border-slate-200 bg-white hover:border-slate-300'
            }`}
          >
            <div className="flex justify-between items-start mb-1">
              <span className="text-xs font-black uppercase tracking-wider text-blue-900 flex items-center gap-1.5">
                <GraduationCap className="w-4 h-4" />
                Phase 1: Student Class Roster
              </span>
              <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-200">
                Unprotected / Public
              </span>
            </div>
            <p className="text-[11px] text-slate-500">
              On-the-fly classroom logging per class section. No password required to submit.
            </p>
          </button>

          <button
            onClick={() => {
              if (!isAdminAuthenticated) {
                onRequestAdminAuth();
              } else {
                setActivePhase('phase2_staff');
              }
            }}
            className={`flex-1 p-4 rounded-2xl border-2 text-left transition-all ${
              activePhase === 'phase2_staff'
                ? 'border-amber-600 bg-amber-50/80 shadow-md'
                : 'border-slate-200 bg-white hover:border-slate-300'
            }`}
          >
            <div className="flex justify-between items-start mb-1">
              <span className="text-xs font-black uppercase tracking-wider text-amber-900 flex items-center gap-1.5">
                <UserCheck className="w-4 h-4 text-amber-700" />
                Phase 2: Master Staff Logs
              </span>
              {isAdminAuthenticated ? (
                <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-200 flex items-center gap-1">
                  <Unlock className="w-3 h-3" /> Unlocked
                </span>
              ) : (
                <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-100 text-amber-800 border border-amber-200 flex items-center gap-1">
                  <Lock className="w-3 h-3" /> Protected
                </span>
              )}
            </div>
            <p className="text-[11px] text-slate-500">
              Master faculty logs with [Mark All Staff Present] override capability.
            </p>
          </button>
        </div>
      </div>

      {activePhase === 'phase1_students' && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-xl overflow-hidden">
          <div className="bg-slate-900 p-4 text-white flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
            <div className="flex items-center gap-3">
              <span className="text-xs font-bold uppercase text-slate-300">Target Classroom:</span>
              <select
                value={selectedClass}
                onChange={e => setSelectedClass(e.target.value)}
                className="px-3 py-1.5 rounded-xl bg-slate-800 border border-slate-700 text-white font-bold text-sm"
              >
                {allClasses.map(c => (
                  <option key={c} value={c}>Class {c}</option>
                ))}
              </select>
            </div>

            {isStudentSheetLocked && (
              isAdminAuthenticated ? (
                <div className="px-3 py-1 rounded-full bg-amber-500/20 text-amber-200 border border-amber-400/40 text-xs font-bold flex items-center gap-1.5">
                  <ShieldCheck className="w-3.5 h-3.5 text-amber-300" />
                  ADMIN EDIT MODE — Class {selectedClass} on {selectedDate}
                </div>
              ) : (
                <div className="flex flex-wrap items-center gap-2">
                  <div className="px-3 py-1 rounded-full bg-red-500/20 text-red-300 border border-red-500/40 text-xs font-bold flex items-center gap-1.5">
                    <Lock className="w-3.5 h-3.5 text-red-400" />
                    LOCKED: Submitted for Class {selectedClass} on {selectedDate}
                  </div>
                  <button
                    type="button"
                    onClick={handleAdminEditStudent}
                    className="px-3 py-1 rounded-full bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold"
                  >
                    Admin Login to Edit
                  </button>
                </div>
              )
            )}
          </div>

          <form onSubmit={handleSubmitStudentAttendance} className="p-6 space-y-6">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b text-[11px] font-black uppercase text-slate-500">
                    <th className="p-3">Roll No</th>
                    <th className="p-3">Student Full Name</th>
                    <th className="p-3">Status Selector ('P', 'A', 'L', 'HL')</th>
                    <th className="p-3">Mandatory Reason for Half Leave (HL)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 text-xs text-slate-800">
                  {classStudents.map(student => {
                    const currentState = studentFormState[student.id] || { status: 'P', hl_reason: '' };
                    const isHL = currentState.status === 'HL';

                    return (
                      <tr key={student.id} className="hover:bg-slate-50">
                        <td className="p-3 font-mono font-bold text-blue-900">{student.roll_no}</td>
                        <td className="p-3 font-bold">{student.full_name}</td>
                        <td className="p-3">
                          <div className="flex items-center gap-2">
                            {(['P', 'A', 'L', 'HL'] as AttendanceState[]).map(st => (
                              <button
                                type="button"
                                key={st}
                                disabled={!canEditStudentSheet}
                                onClick={() => handleStudentStatusChange(student.id, st)}
                                className={`w-10 h-9 rounded-xl font-black text-xs transition-all disabled:opacity-40 disabled:cursor-not-allowed ${
                                  currentState.status === st
                                    ? st === 'P' ? 'bg-emerald-600 text-white shadow-md' :
                                      st === 'A' ? 'bg-red-600 text-white shadow-md' :
                                      st === 'HL' ? 'bg-amber-600 text-white shadow-md' : 'bg-blue-600 text-white shadow-md'
                                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                                }`}
                              >
                                {st}
                              </button>
                            ))}
                          </div>
                        </td>
                        <td className="p-3">
                          <input 
                            type="text"
                            disabled={!canEditStudentSheet || !isHL}
                            value={currentState.hl_reason}
                            onChange={e => handleStudentHLReasonChange(student.id, e.target.value)}
                            placeholder={isHL ? 'MANDATORY: Reason for Half Leave...' : 'Only required for HL status'}
                            className={`w-full px-3 py-1.5 rounded-xl border text-xs ${
                              isHL 
                                ? 'border-amber-400 bg-amber-50 focus:ring-2 focus:ring-amber-500 font-bold' 
                                : 'border-slate-200 bg-slate-50 text-slate-400'
                            }`}
                          />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div className="pt-4 border-t flex justify-end">
              <button
                type="submit"
                disabled={!canEditStudentSheet}
                className="px-8 py-3 bg-blue-900 hover:bg-blue-800 disabled:bg-slate-300 text-white font-extrabold text-sm rounded-xl shadow-xl flex items-center gap-2"
              >
                <CheckSquare className="w-5 h-5 text-amber-400" />
                {isStudentSheetLocked
                  ? `Save Admin Updates — Class ${selectedClass}`
                  : `Submit & Lock Class ${selectedClass} Attendance`}
              </button>
            </div>
          </form>
        </div>
      )}

      {activePhase === 'phase2_staff' && isAdminAuthenticated && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-xl overflow-hidden">
          <div className="bg-slate-900 p-4 text-white flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
            <div>
              <h3 className="text-sm font-black uppercase text-amber-400">Master Faculty & Staff Attendance Sheet</h3>
              <p className="text-xs text-slate-300">Total Working Faculty: {teachers.length} Members</p>
              {isTeacherSheetLocked && (
                <p className="text-[10px] text-amber-300 mt-1 flex items-center gap-1">
                  <ShieldCheck className="w-3 h-3" /> Admin edit mode — update locked staff attendance below
                </p>
              )}
            </div>

            <button
              type="button"
              disabled={!canEditTeacherSheet}
              onClick={handleMarkAllStaffPresent}
              className="px-4 py-2 bg-amber-500 hover:bg-amber-600 disabled:bg-slate-600 text-slate-900 font-extrabold text-xs rounded-xl shadow flex items-center gap-1.5 transition-all"
            >
              <CheckSquare className="w-4 h-4" />
              [Mark All Staff Present Override]
            </button>
          </div>

          <form onSubmit={handleSubmitTeacherAttendance} className="p-6 space-y-6">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b text-[11px] font-black uppercase text-slate-500">
                    <th className="p-3">Teacher ID</th>
                    <th className="p-3">Faculty Name & Designation</th>
                    <th className="p-3">Assigned Classes String</th>
                    <th className="p-3">Status Selector ('P', 'A', 'L', 'HL')</th>
                    <th className="p-3">Mandatory Reason for Half Leave (HL)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 text-xs text-slate-800">
                  {teachers.map(teacher => {
                    const currentState = teacherFormState[teacher.id] || { status: 'P', hl_reason: '' };
                    const isHL = currentState.status === 'HL';

                    return (
                      <tr key={teacher.id} className="hover:bg-slate-50">
                        <td className="p-3 font-mono font-bold text-blue-900">{teacher.teacher_id}</td>
                        <td className="p-3">
                          <div className="font-bold text-slate-900">{teacher.full_name}</div>
                          <div className="text-[10px] text-slate-500">{teacher.designation}</div>
                        </td>
                        <td className="p-3 font-mono font-bold">&quot;{teacher.classes_assigned}&quot;</td>
                        <td className="p-3">
                          <div className="flex items-center gap-2">
                            {(['P', 'A', 'L', 'HL'] as AttendanceState[]).map(st => (
                              <button
                                type="button"
                                key={st}
                                disabled={!canEditTeacherSheet}
                                onClick={() => {
                                  setTeacherFormState(prev => ({
                                    ...prev,
                                    [teacher.id]: {
                                      status: st,
                                      hl_reason: prev[teacher.id]?.hl_reason || ''
                                    }
                                  }));
                                }}
                                className={`w-10 h-9 rounded-xl font-black text-xs transition-all disabled:opacity-40 disabled:cursor-not-allowed ${
                                  currentState.status === st
                                    ? st === 'P' ? 'bg-emerald-600 text-white shadow-md' :
                                      st === 'A' ? 'bg-red-600 text-white shadow-md' :
                                      st === 'HL' ? 'bg-amber-600 text-white shadow-md' : 'bg-blue-600 text-white shadow-md'
                                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                                }`}
                              >
                                {st}
                              </button>
                            ))}
                          </div>
                        </td>
                        <td className="p-3">
                          <input 
                            type="text"
                            disabled={!canEditTeacherSheet || !isHL}
                            value={currentState.hl_reason}
                            onChange={e => {
                              setTeacherFormState(prev => ({
                                ...prev,
                                [teacher.id]: {
                                  status: prev[teacher.id]?.status || 'HL',
                                  hl_reason: e.target.value
                                }
                              }));
                            }}
                            placeholder={isHL ? 'MANDATORY: Reason for Half Leave...' : 'Only required for HL status'}
                            className={`w-full px-3 py-1.5 rounded-xl border text-xs ${
                              isHL 
                                ? 'border-amber-400 bg-amber-50 focus:ring-2 focus:ring-amber-500 font-bold' 
                                : 'border-slate-200 bg-slate-50 text-slate-400'
                            }`}
                          />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div className="pt-4 border-t flex justify-end">
              <button
                type="submit"
                disabled={!canEditTeacherSheet}
                className="px-8 py-3 bg-blue-900 hover:bg-blue-800 disabled:bg-slate-300 text-white font-extrabold text-sm rounded-xl shadow-xl flex items-center gap-2"
              >
                <CheckSquare className="w-5 h-5 text-amber-400" />
                {isTeacherSheetLocked
                  ? `Save Admin Updates — Staff ${selectedDate}`
                  : `Submit & Lock Faculty Attendance for ${selectedDate}`}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};
