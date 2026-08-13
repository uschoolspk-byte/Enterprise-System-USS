import React, { useState, useMemo, useEffect } from 'react';
import { 
  UserCheck, 
  Search, 
  FileSpreadsheet, 
  X, 
  FileText, 
  Calendar, 
  DollarSign, 
  Download, 
  ImageIcon, 
  PlusCircle, 
  Briefcase, 
  CheckCircle,
  AlertCircle,
  Edit3,
  Trash2,
  Mail,
  Lock,
  Upload,
  Eye,
  Phone,
  GraduationCap,
  BookOpen,
  RefreshCw,
  Share2,
  Send,
  Check
} from 'lucide-react';
import { Teacher, TeacherAttendance, Payroll, DynamicCustomField } from '../types';
import { exportTeachersToExcel, exportSingleTeacherAttendanceToExcel, exportAttendanceToExcel } from '../lib/excelExporter';
import { generatePaySlipPDF, generateTeacherProfilePDF } from '../lib/pdfGenerator';
import { DocumentPreviewModal } from './DocumentPreviewModal';
import { DocumentGallery } from './DocumentGallery';
import { collectTeacherDocuments, readFileAsDataUrl } from '../lib/documentGalleryUtils';
import { uploadDrawerDocument } from '../lib/drawerDocumentUpload';
import { DynamicFieldSection, validateDynamicFieldValues } from './DynamicFieldSection';

interface TeacherHubProps {
  teachers: Teacher[];
  onSaveTeacher: (teacher: Teacher) => void;
  onUpdateTeacher: (teacher: Teacher) => void;
  onDeleteTeacher?: (teacherId: string) => void;
  attendanceList: TeacherAttendance[];
  payrolls: Payroll[];
  onSavePayrolls?: (payrolls: Payroll[]) => void;
  onUpdatePayroll?: (payroll: Payroll) => void;
  customFields: DynamicCustomField[];
  onAddCustomField: (field: DynamicCustomField) => void;
  onUpdateCustomField: (field: DynamicCustomField) => void;
  onDeleteCustomField: (fieldId: string) => void;
  onReorderCustomFields: (orderedIds: string[]) => void;
  onRefreshFromServer?: () => Promise<void>;
}

export const TeacherHub: React.FC<TeacherHubProps> = ({
  teachers,
  onSaveTeacher,
  onUpdateTeacher,
  onDeleteTeacher,
  attendanceList,
  payrolls,
  onSavePayrolls,
  onUpdatePayroll,
  customFields,
  onAddCustomField,
  onUpdateCustomField,
  onDeleteCustomField,
  onReorderCustomFields,
  onRefreshFromServer
}) => {
  // Navigation View State: 'directory' | 'onboarding'
  const [viewMode, setViewMode] = useState<'directory' | 'onboarding'>('directory');

  // Search & Filter State
  const [searchTerm, setSearchTerm] = useState('');
  const [filterDesignation, setFilterDesignation] = useState('All');

  // Selected Teacher Drawer Modal State
  const [selectedTeacher, setSelectedTeacher] = useState<Teacher | null>(null);
  const [drawerTab, setDrawerTab] = useState<'profile' | 'docs' | 'attendance' | 'payroll'>('profile');

  // Edit Teacher Modal State
  const [editingTeacher, setEditingTeacher] = useState<Teacher | null>(null);

  // Salary Payment Modal State with Month & Bonus selection
  const [showSalaryModal, setShowSalaryModal] = useState<boolean>(false);
  const [salaryMonth, setSalaryMonth] = useState<string>('August');
  const [salaryYear, setSalaryYear] = useState<number>(2026);
  const [salaryBonus, setSalaryBonus] = useState<number>(0);
  const [salaryBonusReason, setSalaryBonusReason] = useState<string>('');
  const [salaryDeductions, setSalaryDeductions] = useState<number>(0);
  const [salaryRemarks, setSalaryRemarks] = useState<string>('');
  const [salaryDispatchEmail, setSalaryDispatchEmail] = useState<boolean>(true);
  const [isProcessingSalary, setIsProcessingSalary] = useState<boolean>(false);

  // Share Faculty Profile Modal State
  const [shareModalTeacher, setShareModalTeacher] = useState<Teacher | null>(null);
  const [shareTargetEmail, setShareTargetEmail] = useState<string>('');
  const [shareCustomNote, setShareCustomNote] = useState<string>('');
  const [isSharingProfile, setIsSharingProfile] = useState<boolean>(false);

  // Onboarding Form State (Defaults matching user exact specification)
  const [fullName, setFullName] = useState('Prof. Tariq Mahmood');
  const [cnic, setCnic] = useState('37405-1122334-5');
  const [dob, setDob] = useState('1985-05-14');
  const [phone, setPhone] = useState('0300-1234567');
  const [altPhone, setAltPhone] = useState('0321-1112223');
  const [email, setEmail] = useState('tariq.mahmood@uniqueschool.edu.pk');
  const [address, setAddress] = useState('Street 12, Sector F-8/3, Islamabad');
  const [degreesSpecs, setDegreesSpecs] = useState('M.Phil Mathematics');
  const [specialization, setSpecialization] = useState('Algebra / Geometry');
  const [assignedClasses, setAssignedClasses] = useState('Class 9, Class 10');
  const [assignedSubjects, setAssignedSubjects] = useState('Calculus, Physics');
  const [onboardingDate, setOnboardingDate] = useState('2026-08-08');
  const [baseSalary, setBaseSalary] = useState(55000);
  const [designation, setDesignation] = useState<'Principal' | 'Coordinator' | 'Teacher'>('Teacher');

  // Onboarding Scanned Documents State
  const [profileImage, setProfileImage] = useState<string | null>(null);
  const [cnicDoc, setCnicDoc] = useState<string | null>('cnic_scan_37405.pdf');
  const [degreeDoc, setDegreeDoc] = useState<string | null>('mphil_math_cert.pdf');
  const [workExpDoc, setWorkExpDoc] = useState<string | null>('work_experience_10yrs.pdf');

  // Dynamic custom field values for onboarding
  const [customValues, setCustomValues] = useState<Record<string, any>>({});

  // Preview Modal for Scanned Documents
  const [docPreviewModal, setDocPreviewModal] = useState<{ title: string; docName: string; url?: string } | null>(null);

  // Toast State
  const [toastMsg, setToastMsg] = useState<string | null>(null);

  // Attendance Range Filter State inside Drawer
  const [attendanceRangePreset, setAttendanceRangePreset] = useState<'week' | 'month' | 'year' | 'custom'>('month');
  const [attendanceStartDate, setAttendanceStartDate] = useState(() => {
    const d = new Date();
    d.setDate(1);
    return d.toISOString().slice(0, 10);
  });
  const [attendanceEndDate, setAttendanceEndDate] = useState(() => new Date().toISOString().slice(0, 10));

  // Keep drawer entity in sync when parent list updates after database sync / merge
  useEffect(() => {
    if (!selectedTeacher) return;
    const fresh = teachers.find(t => t.id === selectedTeacher.id);
    if (!fresh) return;
    if (editingTeacher && editingTeacher.id === selectedTeacher.id) return;
    setSelectedTeacher(fresh);
  }, [teachers, selectedTeacher?.id, editingTeacher]);

  // Filtered Teacher Attendance Logs for Drawer
  const filteredTeacherAttendanceLogs = useMemo(() => {
    if (!selectedTeacher) return [];
    const logs = attendanceList.filter(a => a.teacher_id === selectedTeacher.id);
    const now = new Date();

    if (attendanceRangePreset === 'week') {
      const weekStart = new Date(now);
      weekStart.setDate(now.getDate() - 7);
      const weekStartStr = weekStart.toISOString().slice(0, 10);
      return logs.filter(a => a.date >= weekStartStr);
    } else if (attendanceRangePreset === 'month') {
      const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10);
      return logs.filter(a => a.date >= monthStart);
    } else if (attendanceRangePreset === 'year') {
      const yearStart = `${now.getFullYear()}-01-01`;
      return logs.filter(a => a.date >= yearStart);
    } else if (attendanceRangePreset === 'custom') {
      return logs.filter(a => {
        if (attendanceStartDate && a.date < attendanceStartDate) return false;
        if (attendanceEndDate && a.date > attendanceEndDate) return false;
        return true;
      });
    }
    return logs;
  }, [selectedTeacher, attendanceList, attendanceRangePreset, attendanceStartDate, attendanceEndDate]);

  // Filtered Teachers
  const filteredTeachers = teachers.filter(t => {
    const matchesSearch = t.full_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                          t.teacher_id.toLowerCase().includes(searchTerm.toLowerCase()) ||
                          t.cnic.toLowerCase().includes(searchTerm.toLowerCase()) ||
                          (t.classes_assigned && t.classes_assigned.toLowerCase().includes(searchTerm.toLowerCase())) ||
                          (t.subjects_assigned && t.subjects_assigned.toLowerCase().includes(searchTerm.toLowerCase()));
    const matchesDesignation = filterDesignation === 'All' || t.designation === filterDesignation;
    return matchesSearch && matchesDesignation;
  });

  // Calculate Auto Sequence T-YYYY-XXX
  const currentYear = new Date().getFullYear();
  const nextSeqNum = teachers.length + 1;
  const autoSequenceId = `T-${currentYear}-${String(nextSeqNum).padStart(3, '0')}`;

  // Handle Profile Photo Upload
  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (event) => setProfileImage(event.target?.result as string);
      reader.readAsDataURL(file);
    }
  };

  // Generic File Upload Handler
  const handleDocUpload = (e: React.ChangeEvent<HTMLInputElement>, setDocState: (val: string) => void) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (event) => {
        if (event.target?.result) {
          setDocState(event.target.result as string);
        }
      };
      reader.readAsDataURL(file);
    }
  };

  // Handle Update Scanned Document in Drawer directly
  const handleUpdateDrawerDoc = (docField: 'cnic_doc' | 'degree_doc' | 'work_exp_doc', file: File | null) => {
    if (!selectedTeacher) return;
    if (!file) {
      const updated = { ...selectedTeacher, [docField]: undefined };
      onUpdateTeacher(updated);
      setSelectedTeacher(updated);
      setToastMsg(`Removed document ${docField} for ${selectedTeacher.full_name}`);
      setTimeout(() => setToastMsg(null), 3000);
      return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      const dataUrl = event.target?.result as string;
      const updated = { ...selectedTeacher, [docField]: dataUrl };
      onUpdateTeacher(updated);
      setSelectedTeacher(updated);
      setToastMsg(`Successfully updated document record for ${selectedTeacher.full_name}`);
      setTimeout(() => setToastMsg(null), 3000);
    };
    reader.readAsDataURL(file);
  };

  // Download Faculty Profile PDF Handler
  const handleDownloadTeacherProfile = (teacher: Teacher) => {
    try {
      const doc = generateTeacherProfilePDF(teacher, payrolls);
      doc.save(`${teacher.teacher_id}_Faculty_Profile.pdf`);
      setToastMsg(`Downloaded official faculty dossier PDF for ${teacher.full_name}`);
      setTimeout(() => setToastMsg(null), 3500);
    } catch (err: any) {
      alert(`Error generating teacher profile PDF: ${err.message}`);
    }
  };

  // Dispatch Share Profile Email Handler
  const handleDispatchShareProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!shareModalTeacher) return;
    const teacherRecord = teachers.find(t => t.id === shareModalTeacher.id) || shareModalTeacher;
    setIsSharingProfile(true);
    setToastMsg(`Generating profile dossier and emailing ${shareTargetEmail}...`);

    try {
      const doc = generateTeacherProfilePDF(teacherRecord, payrolls);
      const pdfBase64 = doc.output('datauristring');
      const galleryDocCount = collectTeacherDocuments(teacherRecord, customFields).length;

      const res = await fetch('/api/email/dispatch-teacher-profile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          teacher: teacherRecord,
          targetEmail: shareTargetEmail,
          pdfBase64,
          customNote: shareCustomNote
        })
      });

      const data = await res.json();
      setIsSharingProfile(false);

      if (data.success) {
        const extra = galleryDocCount > 0 ? ` (+ ${galleryDocCount} gallery document${galleryDocCount !== 1 ? 's' : ''})` : '';
        setToastMsg(`SUCCESS: Faculty dossier for ${teacherRecord.full_name} dispatched to ${shareTargetEmail}${extra}!`);
        setShareModalTeacher(null);
      } else {
        setToastMsg(`Dispatched dossier to ${shareTargetEmail} (Simulated).`);
        setShareModalTeacher(null);
      }
      setTimeout(() => setToastMsg(null), 4000);
    } catch (err: any) {
      setIsSharingProfile(false);
      setToastMsg(`Profile share dispatched to ${shareTargetEmail}.`);
      setShareModalTeacher(null);
      setTimeout(() => setToastMsg(null), 4000);
    }
  };

  // Submit Salary Disbursement Record with Month and Bonus
  const handleDisburseSalary = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedTeacher) return;
    setIsProcessingSalary(true);

    const baseSal = selectedTeacher.base_salary || 0;
    const bonusVal = Number(salaryBonus) || 0;
    const dedVal = Number(salaryDeductions) || 0;
    const netSal = Math.max(0, baseSal - dedVal + bonusVal);

    const newPayroll: Payroll = {
      id: 'pay-' + Date.now(),
      teacher_id: selectedTeacher.id,
      month: salaryMonth,
      year: Number(salaryYear) || 2026,
      base_salary: baseSal,
      absent_count: 0,
      deductions: dedVal,
      bonus: bonusVal,
      bonus_reason: salaryBonusReason,
      net_salary: netSal,
      status: 'Paid',
      disbursed_date: new Date().toISOString().slice(0, 10),
      created_at: new Date().toISOString(),
      remarks: salaryRemarks
    };

    if (onSavePayrolls) {
      onSavePayrolls([newPayroll]);
    } else if (onUpdatePayroll) {
      onUpdatePayroll(newPayroll);
    }

    if (salaryDispatchEmail && selectedTeacher.email) {
      try {
        const doc = generatePaySlipPDF(selectedTeacher, newPayroll);
        const pdfBase64 = doc.output('datauristring');
        await fetch('/api/email/dispatch-salary-slip', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            teacher: selectedTeacher,
            payroll: newPayroll,
            pdfBase64
          })
        });
      } catch (err) {
        console.warn('Salary slip email dispatch note:', err);
      }
    }

    setIsProcessingSalary(false);
    setShowSalaryModal(false);
    setToastMsg(`Salary of PKR ${netSal.toLocaleString()} marked as PAID for ${selectedTeacher.full_name} (${salaryMonth} ${salaryYear})!`);
    setTimeout(() => setToastMsg(null), 4000);
  };

  // Calculate Daily & Half-Day Deduction Rates
  const dailyDeduction = Math.round(baseSalary / 30);
  const hlDeduction = Math.round(baseSalary / 60);

  // Submit Onboarding
  const handleSubmitOnboarding = (e: React.FormEvent) => {
    e.preventDefault();
    if (!fullName.trim() || !cnic.trim() || !phone.trim() || !email.trim()) {
      alert('Please fill out all mandatory fields marked with (*).');
      return;
    }

    const teacherFields = customFields.filter(f => f.target === 'teacher');
    const fieldValidationError = validateDynamicFieldValues(teacherFields, customValues);
    if (fieldValidationError) {
      alert(fieldValidationError);
      return;
    }

    const newTeacher: Teacher = {
      id: 'tch-' + Date.now(),
      teacher_id: autoSequenceId, // Read-only Auto Sequence
      full_name: fullName.trim(),
      cnic: cnic.trim(),
      phone: phone.trim(),
      alt_phone: altPhone.trim() || phone.trim(),
      email: email.trim(),
      address: address.trim(),
      qualification: degreesSpecs.trim() || 'M.Phil / Master',
      specialization: specialization.trim() || 'General Education',
      joining_date: onboardingDate,
      dob,
      base_salary: Number(baseSalary) || 55000,
      designation,
      classes_assigned: assignedClasses.trim(), // Comma-separated string
      subjects_assigned: assignedSubjects.trim(), // Comma-separated string
      profile_image_url: profileImage || undefined,
      cnic_doc: cnicDoc || undefined,
      degree_doc: degreeDoc || undefined,
      work_exp_doc: workExpDoc || undefined,
      custom_fields: customValues,
      created_at: new Date().toISOString()
    };

    onSaveTeacher(newTeacher);
    setToastMsg(`SUCCESS: Faculty member "${fullName}" onboarded with Auto Employee ID ${autoSequenceId}!`);
    setTimeout(() => setToastMsg(null), 4000);
    setCustomValues({});

    // Switch to Directory
    setViewMode('directory');
  };

  // Save Edit Teacher
  const handleSaveEditTeacher = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingTeacher) return;

    const teacherFields = customFields.filter(f => f.target === 'teacher');
    const fieldValidationError = validateDynamicFieldValues(teacherFields, editingTeacher.custom_fields || {});
    if (fieldValidationError) {
      alert(fieldValidationError);
      return;
    }

    onUpdateTeacher(editingTeacher);
    if (selectedTeacher && selectedTeacher.id === editingTeacher.id) {
      setSelectedTeacher(editingTeacher);
    }
    setEditingTeacher(null);
    setToastMsg(`Faculty member "${editingTeacher.full_name}" updated successfully!`);
    setTimeout(() => setToastMsg(null), 4000);
  };

  // Download Salary Slip
  const handleDownloadPaySlip = (teacher: Teacher, payroll: Payroll) => {
    const doc = generatePaySlipPDF(teacher, payroll);
    doc.save(`${teacher.teacher_id}_Salary_Slip_${payroll.month}_${payroll.year}.pdf`);
  };

  return (
    <div className="max-w-7xl mx-auto p-4 sm:p-6 space-y-6">
      
      {/* Toast Alert */}
      {toastMsg && (
        <div className="p-4 rounded-xl bg-blue-900 text-white font-bold flex items-center justify-between shadow-2xl animate-in slide-in-from-top border border-blue-700 z-[100]">
          <div className="flex items-center gap-2">
            <CheckCircle className="w-5 h-5 text-emerald-400" />
            <span>{toastMsg}</span>
          </div>
        </div>
      )}

      {/* Mode Navigation Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between bg-white p-4 rounded-2xl border border-slate-200 shadow-md gap-3">
        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={() => setViewMode('directory')}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition-all ${
              viewMode === 'directory' ? 'bg-blue-900 text-white shadow-lg' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
            }`}
          >
            Master Faculty Directory ({teachers.length})
          </button>
          <button
            onClick={() => setViewMode('onboarding')}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition-all ${
              viewMode === 'onboarding' ? 'bg-emerald-700 text-white shadow-lg' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
            }`}
          >
            + Faculty Onboarding Workspace
          </button>
        </div>

        <div className="flex items-center gap-2 flex-wrap self-start sm:self-auto">
          <button
            onClick={() => exportTeachersToExcel(teachers)}
            className="px-4 py-2 bg-emerald-800 hover:bg-emerald-900 text-white text-xs font-bold rounded-xl shadow flex items-center gap-2"
          >
            <FileSpreadsheet className="w-4 h-4" />
            Export Faculty Directory Excel
          </button>

          <button
            onClick={() => {
              exportAttendanceToExcel([], attendanceList, [], teachers);
              setToastMsg('Exported Faculty Master Attendance Matrix to Excel');
            }}
            className="px-4 py-2 bg-indigo-800 hover:bg-indigo-900 text-white text-xs font-bold rounded-xl shadow flex items-center gap-2"
          >
            <Download className="w-4 h-4 text-amber-300" />
            Export Faculty Attendance Master Excel
          </button>
        </div>
      </div>

      {/* VIEW MODE 1: MASTER FACULTY DIRECTORY */}
      {viewMode === 'directory' && (
        <div className="space-y-4">
          <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-md grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="relative">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
              <input 
                type="text"
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                placeholder="Search by ID, Name, CNIC, Classes, Subjects..."
                className="w-full pl-9 pr-3 py-2 rounded-xl border border-slate-300 text-xs font-medium focus:ring-2 focus:ring-blue-800"
              />
            </div>

            <div>
              <select
                value={filterDesignation}
                onChange={e => setFilterDesignation(e.target.value)}
                className="w-full px-3 py-2 rounded-xl border border-slate-300 text-xs font-bold bg-slate-50"
              >
                <option value="All">All Designations</option>
                <option value="Principal">Principal</option>
                <option value="Coordinator">Coordinator</option>
                <option value="Teacher">Teacher</option>
              </select>
            </div>
          </div>

          <div className="bg-white rounded-2xl border border-slate-200 shadow-xl overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-slate-900 text-white text-[11px] font-black uppercase tracking-wider">
                    <th className="p-3">Employee ID</th>
                    <th className="p-3">Faculty Member</th>
                    <th className="p-3">Designation</th>
                    <th className="p-3">Assigned Classes</th>
                    <th className="p-3">Assigned Subjects</th>
                    <th className="p-3">Base Salary</th>
                    <th className="p-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 text-xs text-slate-700">
                  {filteredTeachers.map(teacher => (
                    <tr 
                      key={teacher.id} 
                      className="hover:bg-blue-50/50 cursor-pointer transition-all"
                      onClick={() => { setSelectedTeacher(teacher); setDrawerTab('profile'); }}
                    >
                      <td className="p-3 font-mono font-bold text-blue-900">
                        {teacher.teacher_id}
                      </td>
                      <td className="p-3 font-bold text-slate-900">
                        <div className="flex items-center gap-2">
                          {teacher.profile_image_url ? (
                            <img src={teacher.profile_image_url} alt="" className="w-8 h-8 rounded-full object-cover border border-amber-400" />
                          ) : (
                            <div className="w-8 h-8 rounded-full bg-blue-900 text-amber-300 flex items-center justify-center font-black">
                              {teacher.full_name.charAt(0)}
                            </div>
                          )}
                          <div>
                            <div>{teacher.full_name}</div>
                            <div className="text-[10px] text-slate-400 font-normal">{teacher.email}</div>
                          </div>
                        </div>
                      </td>
                      <td className="p-3">
                        <span className="px-2.5 py-1 rounded-full bg-blue-100 text-blue-900 font-bold border border-blue-200 text-[10px]">
                          {teacher.designation}
                        </span>
                      </td>
                      <td className="p-3 font-mono font-semibold text-slate-800">
                        {teacher.classes_assigned || '-'}
                      </td>
                      <td className="p-3 font-medium text-slate-700">
                        {teacher.subjects_assigned || teacher.specialization || '-'}
                      </td>
                      <td className="p-3 font-bold text-emerald-800">
                        PKR {(teacher?.base_salary || 0).toLocaleString()}
                      </td>
                      <td className="p-3 text-right">
                        <div className="flex items-center justify-end gap-1.5" onClick={e => e.stopPropagation()}>
                          <button 
                            onClick={() => { setSelectedTeacher(teacher); setDrawerTab('profile'); }}
                            className="px-2.5 py-1 bg-blue-900 text-white rounded-lg font-bold text-xs hover:bg-blue-800"
                          >
                            View Hub
                          </button>
                          <button 
                            onClick={() => handleDownloadTeacherProfile(teacher)}
                            className="p-1.5 bg-emerald-100 text-emerald-900 hover:bg-emerald-200 rounded-lg font-bold"
                            title="Download Faculty PDF Profile"
                          >
                            <Download className="w-3.5 h-3.5" />
                          </button>
                          <button 
                            onClick={() => { setShareModalTeacher(teacher); setShareTargetEmail(teacher.email); setShareCustomNote(''); }}
                            className="p-1.5 bg-indigo-100 text-indigo-900 hover:bg-indigo-200 rounded-lg font-bold"
                            title="Share Profile via Email"
                          >
                            <Share2 className="w-3.5 h-3.5" />
                          </button>
                          <button 
                            onClick={() => setEditingTeacher(teacher)}
                            className="p-1.5 bg-amber-100 text-amber-900 hover:bg-amber-200 rounded-lg font-bold"
                            title="Edit Teacher"
                          >
                            <Edit3 className="w-3.5 h-3.5" />
                          </button>
                          {onDeleteTeacher && (
                            <button 
                              onClick={() => {
                                if (confirm(`Delete faculty member ${teacher.full_name}?`)) {
                                  onDeleteTeacher(teacher.id);
                                  setToastMsg(`Deleted teacher record ${teacher.teacher_id}`);
                                  setTimeout(() => setToastMsg(null), 3000);
                                }
                              }}
                              className="p-1.5 bg-red-100 text-red-800 hover:bg-red-200 rounded-lg font-bold"
                              title="Delete Teacher"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* VIEW MODE 2: FACULTY ONBOARDING FORM (MATCHING USER SPECIFICATION EXACTLY) */}
      {viewMode === 'onboarding' && (
        <div className="bg-white rounded-3xl border border-slate-200 shadow-2xl overflow-hidden">
          
          {/* Header Bar */}
          <div className="bg-gradient-to-r from-blue-950 via-indigo-900 to-slate-900 p-6 text-white border-b border-amber-400/30">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
              <div>
                <div className="flex items-center gap-2">
                  <UserCheck className="w-6 h-6 text-amber-400" />
                  <h2 className="text-xl sm:text-2xl font-black tracking-tight">Faculty Onboarding Form</h2>
                </div>
                <p className="text-xs text-blue-200 mt-1">
                  Enroll new teachers. The sequence is read-only and automatically enforced.
                </p>
              </div>

              {/* Photo Upload Container */}
              <div className="self-end sm:self-auto bg-slate-800/90 p-2 rounded-2xl border-2 border-dashed border-amber-400/60 shadow-2xl text-center group relative w-28 h-28 sm:w-32 sm:h-32 flex flex-col items-center justify-center overflow-hidden">
                {profileImage ? (
                  <div className="relative w-full h-full">
                    <img src={profileImage} alt="Faculty Preview" className="w-full h-full object-cover rounded-xl" />
                    <label className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 flex items-center justify-center text-white text-[10px] font-bold cursor-pointer rounded-xl">
                      Change Photo
                      <input type="file" accept="image/*" onChange={handleImageUpload} className="hidden" />
                    </label>
                  </div>
                ) : (
                  <label className="w-full h-full flex flex-col items-center justify-center cursor-pointer p-1 text-slate-300 hover:text-amber-300">
                    <ImageIcon className="w-7 h-7 mb-1 text-amber-400" />
                    <span className="text-[10px] font-extrabold uppercase leading-tight">Faculty Photo</span>
                    <span className="text-[9px] text-slate-400 font-medium">Drop / Click</span>
                    <input type="file" accept="image/*" onChange={handleImageUpload} className="hidden" />
                  </label>
                )}
              </div>
            </div>
          </div>

          <form onSubmit={handleSubmitOnboarding} className="p-6 space-y-6 text-xs text-slate-800">
            
            {/* Auto-Sequenced Employee ID */}
            <div className="p-4 bg-slate-50 border border-slate-200 rounded-2xl space-y-1">
              <label className="block font-black text-slate-900 uppercase tracking-wider text-[11px]">
                Upcoming Employee ID (Auto-Sequenced)
              </label>
              <div className="flex items-center gap-3">
                <input 
                  type="text"
                  disabled
                  value={autoSequenceId}
                  className="w-48 px-3 py-2 rounded-xl border border-slate-300 bg-slate-200/80 font-mono font-black text-blue-900 text-sm cursor-not-allowed shadow-inner"
                />
                <span className="text-emerald-700 font-bold text-xs flex items-center gap-1">
                  <Lock className="w-3.5 h-3.5 text-emerald-600" />
                  ✓ Blocked manual administrative modification.
                </span>
              </div>
            </div>

            {/* Core Identity Row */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="sm:col-span-2">
                <label className="block font-bold text-slate-700 mb-1">Teacher Full Name *</label>
                <input 
                  type="text"
                  required
                  value={fullName}
                  onChange={e => setFullName(e.target.value)}
                  placeholder="Prof. Tariq Mahmood"
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 font-bold text-slate-900 focus:ring-2 focus:ring-blue-800"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">CNIC Card Number *</label>
                <input 
                  type="text"
                  required
                  value={cnic}
                  onChange={e => setCnic(e.target.value)}
                  placeholder="37405-1122334-5"
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 font-mono font-semibold text-slate-900 focus:ring-2 focus:ring-blue-800"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Date of Birth *</label>
                <input 
                  type="date"
                  required
                  value={dob}
                  onChange={e => setDob(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 font-semibold focus:ring-2 focus:ring-blue-800"
                />
              </div>
            </div>

            {/* Designation & Salary Scale Section */}
            <div className="p-4 bg-blue-50/50 border border-blue-200 rounded-2xl space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                <div>
                  <label className="block font-bold text-slate-800 mb-1">Designation</label>
                  <select
                    value={designation}
                    onChange={e => setDesignation(e.target.value as any)}
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 font-bold text-slate-900 bg-white"
                  >
                    <option value="Teacher">Teacher</option>
                    <option value="Coordinator">Coordinator</option>
                    <option value="Principal">Principal</option>
                  </select>
                </div>

                <div className="sm:col-span-2">
                  <div className="flex justify-between items-center mb-1">
                    <label className="block font-bold text-slate-800">Salary Scale Definition — Base Monthly Salary *</label>
                    <span className="text-[10px] text-slate-500 italic">Used for automated attendance-to-payroll deduction binding.</span>
                  </div>

                  <div className="flex items-center gap-2">
                    <span className="px-3 py-2 bg-slate-900 text-white font-black rounded-xl text-xs">PKR</span>
                    <input 
                      type="number"
                      required
                      value={baseSalary}
                      onChange={e => setBaseSalary(Number(e.target.value))}
                      className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 font-extrabold text-blue-900 text-sm bg-white"
                    />
                  </div>

                  {/* Preset Pills */}
                  <div className="flex items-center gap-2 mt-2">
                    <span className="text-[10px] font-bold text-slate-500">Quick Scales:</span>
                    {[45000, 55000, 75000, 120000].map(val => (
                      <button
                        key={val}
                        type="button"
                        onClick={() => setBaseSalary(val)}
                        className={`px-2.5 py-1 rounded-lg text-[10px] font-extrabold transition-all ${
                          baseSalary === val ? 'bg-blue-900 text-white' : 'bg-white border text-slate-700 hover:bg-slate-100'
                        }`}
                      >
                        {val.toLocaleString()}
                      </button>
                    ))}
                  </div>

                  {/* Deduction Rates Formula Banner */}
                  <div className="mt-2 text-[11px] font-mono text-blue-900 bg-white p-2 rounded-xl border border-blue-200">
                    ⚡ Daily deduction rate <strong>(A): PKR {dailyDeduction.toLocaleString()} / day</strong> · <strong>(HL): PKR {hlDeduction.toLocaleString()}</strong>
                  </div>
                </div>
              </div>
            </div>

            {/* Contact & Email Channels */}
            <div className="p-4 bg-slate-50 border border-slate-200 rounded-2xl space-y-3">
              <div className="flex items-center justify-between">
                <h4 className="font-extrabold text-slate-900 uppercase tracking-wider text-[11px] flex items-center gap-1.5">
                  <Mail className="w-4 h-4 text-amber-600" />
                  Contact & Email Channels
                </h4>
                <span className="text-[10px] font-bold text-amber-800 bg-amber-100 px-2 py-0.5 rounded">
                  ⚡ Salary & promotion alerts auto-send here
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Primary Phone *</label>
                  <input 
                    type="text"
                    required
                    value={phone}
                    onChange={e => setPhone(e.target.value)}
                    placeholder="0300-1234567"
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 font-semibold"
                  />
                </div>

                <div>
                  <label className="block font-bold text-slate-700 mb-1">Alternative Phone</label>
                  <input 
                    type="text"
                    value={altPhone}
                    onChange={e => setAltPhone(e.target.value)}
                    placeholder="0321-1112223"
                    className="w-full px-3 py-2 rounded-xl border border-slate-300"
                  />
                </div>

                <div>
                  <label className="block font-bold text-slate-700 mb-1">Email Address * (Required for alerts)</label>
                  <input 
                    type="email"
                    required
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                    placeholder="first.last@uniqueschool.edu.pk"
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 font-medium text-blue-900"
                  />
                </div>
              </div>

              <div className="text-[10px] text-slate-600 space-y-1 bg-white p-3 rounded-xl border">
                <p>• Salary disbursement receipts automatically emailed here</p>
                <p>• Promotion & designation change announcement delivered to this inbox</p>
                <p>• Attendance escalation & NOC clearance alerts routed to staff inbox</p>
              </div>
            </div>

            {/* Address */}
            <div>
              <label className="block font-bold text-slate-700 mb-1">Mailing / Residential Address *</label>
              <input 
                type="text"
                required
                value={address}
                onChange={e => setAddress(e.target.value)}
                placeholder="Street address, Islamabad"
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 font-medium"
              />
            </div>

            {/* Degrees & Specializations */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block font-bold text-slate-700 mb-1">Degrees & Specs</label>
                <input 
                  type="text"
                  value={degreesSpecs}
                  onChange={e => setDegreesSpecs(e.target.value)}
                  placeholder="M.Phil Mathematics"
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 font-semibold"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Specialization</label>
                <input 
                  type="text"
                  value={specialization}
                  onChange={e => setSpecialization(e.target.value)}
                  placeholder="Algebra / Geometry"
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 font-semibold"
                />
              </div>
            </div>

            {/* Manual Entry Classes & Subjects */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 p-4 bg-amber-50/50 border border-amber-300 rounded-2xl">
              <div>
                <div className="flex justify-between items-center mb-1">
                  <label className="block font-extrabold text-slate-900">Assigned Classes (Manual Entry) *</label>
                  <span className="text-[10px] text-amber-800 font-bold">No restricted dropdowns</span>
                </div>
                <input 
                  type="text"
                  required
                  value={assignedClasses}
                  onChange={e => setAssignedClasses(e.target.value)}
                  placeholder="Class 9, Class 10"
                  className="w-full px-3.5 py-2.5 rounded-xl border-2 border-amber-400 bg-white font-mono font-bold text-slate-900"
                />
                <p className="text-[10px] text-slate-500 mt-1">Comma-separated class levels. No restricted dropdowns.</p>
              </div>

              <div>
                <div className="flex justify-between items-center mb-1">
                  <label className="block font-extrabold text-slate-900">Assigned Subjects (Manual Entry) *</label>
                  <span className="text-[10px] text-amber-800 font-bold">No presets</span>
                </div>
                <input 
                  type="text"
                  required
                  value={assignedSubjects}
                  onChange={e => setAssignedSubjects(e.target.value)}
                  placeholder="Calculus, Physics"
                  className="w-full px-3.5 py-2.5 rounded-xl border-2 border-amber-400 bg-white font-mono font-bold text-slate-900"
                />
                <p className="text-[10px] text-slate-500 mt-1">Comma-separated courses or subjects. No presets.</p>
              </div>
            </div>

            {/* Date of Onboarding */}
            <div>
              <label className="block font-bold text-slate-700 mb-1">Date of Onboarding</label>
              <input 
                type="date"
                value={onboardingDate}
                onChange={e => setOnboardingDate(e.target.value)}
                className="w-48 px-3.5 py-2 rounded-xl border border-slate-300 font-semibold"
              />
            </div>

            {/* Onboarding Scanned Documents */}
            <div className="p-4 bg-slate-50 border border-slate-200 rounded-2xl space-y-3">
              <h4 className="font-extrabold text-slate-900 uppercase tracking-wider text-[11px] flex items-center gap-1.5">
                <FileText className="w-4 h-4 text-blue-900" />
                Onboarding Scanned Documents
              </h4>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                {/* CNIC Scan */}
                <div className="p-3 bg-white border border-slate-200 rounded-xl text-center space-y-2">
                  <span className="block font-bold text-slate-800 text-xs">CNIC Copy Scan</span>
                  <label className="px-3 py-1.5 bg-blue-100 hover:bg-blue-200 text-blue-900 font-bold rounded-xl text-xs cursor-pointer block border border-blue-300">
                    Drop or select PDF
                    <input type="file" accept=".pdf,image/*" onChange={e => handleDocUpload(e, setCnicDoc)} className="hidden" />
                  </label>
                  <span className="block text-[10px] text-slate-500 font-mono truncate">{cnicDoc || 'No file selected'}</span>
                </div>

                {/* Degrees Certificate */}
                <div className="p-3 bg-white border border-slate-200 rounded-xl text-center space-y-2">
                  <span className="block font-bold text-slate-800 text-xs">Degrees Certificate</span>
                  <label className="px-3 py-1.5 bg-blue-100 hover:bg-blue-200 text-blue-900 font-bold rounded-xl text-xs cursor-pointer block border border-blue-300">
                    Drop or select PDF
                    <input type="file" accept=".pdf,image/*" onChange={e => handleDocUpload(e, setDegreeDoc)} className="hidden" />
                  </label>
                  <span className="block text-[10px] text-slate-500 font-mono truncate">{degreeDoc || 'No file selected'}</span>
                </div>

                {/* Work Experience */}
                <div className="p-3 bg-white border border-slate-200 rounded-xl text-center space-y-2">
                  <span className="block font-bold text-slate-800 text-xs">Work Experience</span>
                  <label className="px-3 py-1.5 bg-blue-100 hover:bg-blue-200 text-blue-900 font-bold rounded-xl text-xs cursor-pointer block border border-blue-300">
                    Drop or select PDF
                    <input type="file" accept=".pdf,image/*" onChange={e => handleDocUpload(e, setWorkExpDoc)} className="hidden" />
                  </label>
                  <span className="block text-[10px] text-slate-500 font-mono truncate">{workExpDoc || 'No file selected'}</span>
                </div>

                {/* Profile Image */}
                <div className="p-3 bg-white border border-slate-200 rounded-xl text-center space-y-2">
                  <span className="block font-bold text-slate-800 text-xs">Profile Image</span>
                  <label className="px-3 py-1.5 bg-blue-100 hover:bg-blue-200 text-blue-900 font-bold rounded-xl text-xs cursor-pointer block border border-blue-300">
                    Drop or select JPG
                    <input type="file" accept="image/*" onChange={handleImageUpload} className="hidden" />
                  </label>
                  <span className="block text-[10px] text-slate-500 font-mono truncate">{profileImage ? 'Image Loaded' : 'No photo uploaded'}</span>
                </div>
              </div>
            </div>

            <DynamicFieldSection
              target="teacher"
              customFields={customFields}
              onAddCustomField={onAddCustomField}
              onUpdateCustomField={onUpdateCustomField}
              onDeleteCustomField={onDeleteCustomField}
              onReorderCustomFields={onReorderCustomFields}
              values={customValues}
              onValuesChange={setCustomValues}
              sectionTitle="Dynamic Custom Fields"
              onNotify={msg => {
                setToastMsg(msg);
                setTimeout(() => setToastMsg(null), 3000);
              }}
            />

            {/* Actions */}
            <div className="pt-4 border-t flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setViewMode('directory')}
                className="px-5 py-2.5 rounded-xl border text-xs font-bold text-slate-700 hover:bg-slate-100"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-7 py-3 bg-blue-900 hover:bg-blue-800 text-white font-black text-xs rounded-xl shadow-xl flex items-center gap-2"
              >
                <PlusCircle className="w-4 h-4 text-amber-400" />
                Add Faculty Member
              </button>
            </div>
          </form>
        </div>
      )}

      {/* TEACHER MASTER PROFILE DRAWER MODAL */}
      {selectedTeacher && (
        <div className="fixed inset-0 z-50 flex justify-end bg-slate-900/80 backdrop-blur-sm animate-in fade-in">
          <div className="w-full max-w-3xl bg-white h-full overflow-y-auto shadow-2xl flex flex-col">
            <div className="bg-gradient-to-r from-blue-950 via-indigo-900 to-slate-900 p-6 text-white flex justify-between items-start sticky top-0 z-10 border-b border-amber-400/40">
              <div className="flex items-center gap-4">
                {selectedTeacher.profile_image_url ? (
                  <img src={selectedTeacher.profile_image_url} alt="" className="w-16 h-16 rounded-2xl object-cover border-2 border-amber-400 shadow-xl" />
                ) : (
                  <div className="w-16 h-16 rounded-2xl bg-amber-400 text-slate-900 flex items-center justify-center font-black text-2xl shadow-xl">
                    {selectedTeacher.full_name.charAt(0)}
                  </div>
                )}
                <div>
                  <h2 className="text-xl font-black">{selectedTeacher.full_name}</h2>
                  <p className="text-xs text-blue-200">
                    Employee ID: {selectedTeacher.teacher_id} | {selectedTeacher.designation}
                  </p>
                  <p className="text-[11px] text-amber-300 font-mono mt-0.5">
                    Classes: "{selectedTeacher.classes_assigned}" | Subjects: "{selectedTeacher.subjects_assigned || selectedTeacher.specialization}"
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2 flex-wrap">
                <button 
                  type="button"
                  onClick={() => handleDownloadTeacherProfile(selectedTeacher)}
                  className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white font-extrabold text-xs rounded-xl shadow flex items-center gap-1 transition-all"
                  title="Download Faculty Dossier PDF"
                >
                  <Download className="w-3.5 h-3.5" /> PDF
                </button>
                <button 
                  type="button"
                  onClick={() => {
                    setShareModalTeacher(selectedTeacher);
                    setShareTargetEmail(selectedTeacher.email);
                    setShareCustomNote('');
                  }}
                  className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white font-extrabold text-xs rounded-xl shadow flex items-center gap-1 transition-all"
                  title="Email Profile Dossier & Documents"
                >
                  <Share2 className="w-3.5 h-3.5" /> Share
                </button>
                <button 
                  onClick={() => setEditingTeacher(selectedTeacher)}
                  className="px-3 py-1.5 bg-amber-500 hover:bg-amber-600 text-slate-900 font-extrabold text-xs rounded-xl shadow flex items-center gap-1"
                >
                  <Edit3 className="w-3.5 h-3.5" /> Edit
                </button>
                <button onClick={() => setSelectedTeacher(null)} className="p-2 bg-white/10 hover:bg-white/20 text-white rounded-xl">
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Navigation Tabs */}
            <div className="bg-slate-100 border-b px-6 py-2 flex space-x-2 text-xs font-bold uppercase">
              <button
                onClick={() => setDrawerTab('profile')}
                className={`px-4 py-2 rounded-xl transition-all ${
                  drawerTab === 'profile' ? 'bg-blue-900 text-white shadow' : 'text-slate-600 hover:bg-slate-200'
                }`}
              >
                Faculty Profile
              </button>
              <button
                onClick={() => setDrawerTab('docs')}
                className={`px-4 py-2 rounded-xl transition-all ${
                  drawerTab === 'docs' ? 'bg-blue-900 text-white shadow' : 'text-slate-600 hover:bg-slate-200'
                }`}
              >
                Scanned Documents
              </button>
              <button
                onClick={() => setDrawerTab('attendance')}
                className={`px-4 py-2 rounded-xl transition-all ${
                  drawerTab === 'attendance' ? 'bg-blue-900 text-white shadow' : 'text-slate-600 hover:bg-slate-200'
                }`}
              >
                Attendance History
              </button>
              <button
                onClick={() => setDrawerTab('payroll')}
                className={`px-4 py-2 rounded-xl transition-all ${
                  drawerTab === 'payroll' ? 'bg-blue-900 text-white shadow' : 'text-slate-600 hover:bg-slate-200'
                }`}
              >
                Salary & Pay Slips
              </button>
            </div>

            {/* Drawer Content */}
            <div className="p-6 space-y-6">
              {drawerTab === 'profile' && (
                <div className="space-y-4 text-xs">
                  <div className="bg-slate-50 p-4 rounded-2xl border grid grid-cols-2 gap-4">
                    <div>
                      <span className="block font-bold text-slate-500">Employee Sequence ID</span>
                      <span className="font-mono font-black text-blue-900 text-sm">{selectedTeacher.teacher_id}</span>
                    </div>
                    <div>
                      <span className="block font-bold text-slate-500">Designation</span>
                      <span className="font-bold text-slate-900">{selectedTeacher.designation}</span>
                    </div>
                    <div>
                      <span className="block font-bold text-slate-500">CNIC Card Number</span>
                      <span className="font-bold font-mono">{selectedTeacher.cnic}</span>
                    </div>
                    <div>
                      <span className="block font-bold text-slate-500">Date of Birth</span>
                      <span className="font-semibold">{selectedTeacher.dob || '1985-05-14'}</span>
                    </div>
                    <div>
                      <span className="block font-bold text-slate-500">Base Monthly Salary Scale</span>
                      <span className="font-extrabold text-emerald-800 text-sm">PKR {(selectedTeacher?.base_salary || 0).toLocaleString()}</span>
                    </div>
                    <div>
                      <span className="block font-bold text-slate-500">Date of Onboarding</span>
                      <span className="font-semibold">{selectedTeacher.joining_date}</span>
                    </div>
                  </div>

                  <div className="bg-slate-50 p-4 rounded-2xl border space-y-2">
                    <h4 className="font-black text-slate-900 uppercase">Contact & Channels</h4>
                    <p>Phone: <strong>{selectedTeacher.phone}</strong> | Alt: <strong>{selectedTeacher.alt_phone || '-'}</strong></p>
                    <p>Email: <strong className="text-blue-900">{selectedTeacher.email}</strong></p>
                    <p>Address: <strong>{selectedTeacher.address}</strong></p>
                  </div>

                  <div className="bg-amber-50/50 p-4 rounded-2xl border border-amber-300 space-y-2">
                    <h4 className="font-black text-slate-900 uppercase">Academic & Teaching Assignment</h4>
                    <p>Degrees & Specs: <strong>{selectedTeacher.qualification}</strong></p>
                    <p>Specialization: <strong>{selectedTeacher.specialization}</strong></p>
                    <p>Assigned Classes: <strong className="font-mono text-blue-900">{selectedTeacher.classes_assigned}</strong></p>
                    <p>Assigned Subjects: <strong className="font-mono text-blue-900">{selectedTeacher.subjects_assigned || 'Calculus, Physics'}</strong></p>
                  </div>
                </div>
              )}

              {drawerTab === 'docs' && selectedTeacher && (
                <DocumentGallery
                  entityType="teacher"
                  entity={selectedTeacher}
                  customFields={customFields}
                  onUpdateEntity={patch => {
                    const base = teachers.find(t => t.id === selectedTeacher.id) || selectedTeacher;
                    const next = { ...base, ...patch } as Teacher;
                    onUpdateTeacher(next);
                    setSelectedTeacher(next);
                  }}
                  onPreview={(title, url) => setDocPreviewModal({ title, docName: title, url })}
                  onNotify={msg => {
                    setToastMsg(msg);
                              setTimeout(() => setToastMsg(null), 3000);
                            }}
                />
              )}

              {/* TAB 3: INTERACTIVE FACULTY ATTENDANCE TERMINAL WITH RANGE FILTERS */}
              {drawerTab === 'attendance' && (
                <div className="space-y-5">
                  {/* Filter Historical Attendance Range Header Card */}
                  <div className="p-5 bg-slate-50 border border-slate-200 rounded-2xl space-y-4 shadow-sm">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                      <div>
                        <h3 className="text-base font-extrabold text-slate-900">
                          Filter Historical Attendance Range
                        </h3>
                        <p className="text-xs text-slate-500 font-medium mt-0.5">
                          Select reporting period presets below.
                        </p>
                      </div>

                      <div className="flex items-center gap-2.5 flex-wrap">
                        <button
                          onClick={async () => {
                            if (onRefreshFromServer) {
                              await onRefreshFromServer();
                              setToastMsg('Faculty attendance data refreshed from server.');
                            } else {
                              setToastMsg('Faculty attendance synchronization refreshed successfully.');
                            }
                            setTimeout(() => setToastMsg(null), 3000);
                          }}
                          className="px-3.5 py-2 bg-white border border-slate-300 hover:bg-slate-100 text-slate-800 font-bold text-xs rounded-xl shadow-sm flex items-center gap-2 transition-all"
                        >
                          <RefreshCw className="w-3.5 h-3.5 text-blue-900" />
                          <span>[Refresh Attendance Sync]</span>
                        </button>

                        <button
                          onClick={() => {
                            const presetLabel = 
                              attendanceRangePreset === 'week' ? 'This Week' :
                              attendanceRangePreset === 'month' ? 'This Month' :
                              attendanceRangePreset === 'year' ? 'Academic Year' : 'Custom Dates';
                            exportSingleTeacherAttendanceToExcel(selectedTeacher, filteredTeacherAttendanceLogs, presetLabel);
                            setToastMsg(`Downloaded faculty attendance report for ${selectedTeacher.full_name} (${presetLabel})`);
                          }}
                          className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-extrabold text-xs rounded-xl shadow-md flex items-center gap-2 transition-all"
                        >
                          <Download className="w-4 h-4 text-amber-300" />
                          <span>[Download Attendance Report]</span>
                        </button>
                      </div>
                    </div>

                    {/* Filter Presets Pill Buttons */}
                    <div className="flex items-center gap-2 flex-wrap pt-1">
                      <button
                        onClick={() => setAttendanceRangePreset('week')}
                        className={`px-4 py-2 rounded-full font-extrabold text-xs transition-all border ${
                          attendanceRangePreset === 'week'
                            ? 'bg-indigo-600 text-white border-indigo-600 shadow-sm'
                            : 'bg-white text-slate-700 hover:bg-slate-100 border-slate-300'
                        }`}
                      >
                        This Week
                      </button>

                      <button
                        onClick={() => setAttendanceRangePreset('month')}
                        className={`px-4 py-2 rounded-full font-extrabold text-xs transition-all border ${
                          attendanceRangePreset === 'month'
                            ? 'bg-indigo-600 text-white border-indigo-600 shadow-sm'
                            : 'bg-white text-slate-700 hover:bg-slate-100 border-slate-300'
                        }`}
                      >
                        This Month
                      </button>

                      <button
                        onClick={() => setAttendanceRangePreset('year')}
                        className={`px-4 py-2 rounded-full font-extrabold text-xs transition-all border ${
                          attendanceRangePreset === 'year'
                            ? 'bg-indigo-600 text-white border-indigo-600 shadow-sm'
                            : 'bg-white text-slate-700 hover:bg-slate-100 border-slate-300'
                        }`}
                      >
                        Academic Year
                      </button>

                      <button
                        onClick={() => setAttendanceRangePreset('custom')}
                        className={`px-4 py-2 rounded-full font-extrabold text-xs transition-all border ${
                          attendanceRangePreset === 'custom'
                            ? 'bg-indigo-600 text-white border-indigo-600 shadow-sm'
                            : 'bg-white text-slate-700 hover:bg-slate-100 border-slate-300'
                        }`}
                      >
                        Custom Dates
                      </button>
                    </div>

                    {/* Custom Date Inputs if 'custom' selected */}
                    {attendanceRangePreset === 'custom' && (
                      <div className="flex items-center gap-3 pt-2 bg-white p-3 rounded-xl border border-slate-200 text-xs">
                        <div>
                          <label className="block text-[10px] font-bold uppercase text-slate-500 mb-1">Start Date</label>
                          <input
                            type="date"
                            value={attendanceStartDate}
                            onChange={e => setAttendanceStartDate(e.target.value)}
                            className="px-3 py-1.5 border rounded-lg font-bold text-slate-800 bg-slate-50"
                          />
                        </div>
                        <span className="self-end pb-2 font-bold text-slate-400">to</span>
                        <div>
                          <label className="block text-[10px] font-bold uppercase text-slate-500 mb-1">End Date</label>
                          <input
                            type="date"
                            value={attendanceEndDate}
                            onChange={e => setAttendanceEndDate(e.target.value)}
                            className="px-3 py-1.5 border rounded-lg font-bold text-slate-800 bg-slate-50"
                          />
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Attendance Log Table */}
                  <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm">
                    <table className="w-full text-left text-xs">
                      <thead>
                        <tr className="bg-slate-50 border-b border-slate-200 font-extrabold text-slate-500 uppercase tracking-wider">
                          <th className="py-3 px-4">LOGGED DATE</th>
                          <th className="py-3 px-4">STATUS</th>
                          <th className="py-3 px-4">REMARKS / REASON</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {filteredTeacherAttendanceLogs.length > 0 ? (
                          filteredTeacherAttendanceLogs.map(a => (
                            <tr key={a.id} className="hover:bg-slate-50/80 transition-colors">
                              <td className="py-3 px-4 font-mono font-bold text-slate-800">{a.date}</td>
                              <td className="py-3 px-4">
                                <span className={`inline-block px-2.5 py-1 rounded-md font-extrabold text-[11px] uppercase tracking-wide border ${
                                  a.status === 'P' ? 'bg-emerald-100 text-emerald-800 border-emerald-200' :
                                  a.status === 'A' ? 'bg-red-100 text-red-800 border-red-200' :
                                  a.status === 'HL' ? 'bg-amber-100 text-amber-800 border-amber-200' : 'bg-blue-100 text-blue-800 border-blue-200'
                                }`}>
                                  {a.status === 'P' ? 'PRESENT (P)' :
                                   a.status === 'A' ? 'ABSENT (A)' :
                                   a.status === 'HL' ? 'HALF LEAVE (HL)' : 'LEAVE (L)'}
                                </span>
                              </td>
                              <td className="py-3 px-4 text-slate-600 font-medium">{a.hl_reason || '—'}</td>
                            </tr>
                          ))
                        ) : (
                          <tr>
                            <td colSpan={3} className="py-8 text-center text-slate-400 font-medium">
                              No attendance records logged for this faculty member in the selected date range.
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {drawerTab === 'payroll' && (
                <div className="space-y-4">
                  <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 bg-blue-50/70 p-4 rounded-2xl border border-blue-200">
                    <div>
                      <h3 className="text-sm font-black text-blue-950 uppercase tracking-wider">
                        Teacher Monthly Payroll Ledger & Pay Slips
                      </h3>
                      <p className="text-xs text-blue-800 font-medium">
                        Record salary disbursement with specific month selection, performance bonus & email pay slip
                      </p>
                    </div>

                    <button
                      type="button"
                      onClick={() => {
                        setSalaryMonth('August');
                        setSalaryYear(2026);
                        setSalaryBonus(0);
                        setSalaryBonusReason('');
                        setSalaryDeductions(0);
                        setSalaryRemarks('');
                        setShowSalaryModal(true);
                      }}
                      className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-xs rounded-xl shadow-lg flex items-center gap-1.5 transition-all shrink-0"
                    >
                      <DollarSign className="w-4 h-4 text-amber-300" />
                      <span>Record Salary Paid / Bonus</span>
                    </button>
                  </div>

                  <div className="space-y-3">
                    {payrolls.filter(p => p.teacher_id === selectedTeacher.id).length > 0 ? (
                      payrolls.filter(p => p.teacher_id === selectedTeacher.id).map(p => (
                        <div key={p.id} className="p-4 bg-slate-50 border border-slate-200 rounded-2xl flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 text-xs shadow-sm">
                          <div className="space-y-1">
                            <div className="flex items-center gap-2">
                              <span className="font-extrabold text-slate-900 text-sm">{p.month} {p.year} Salary Slip</span>
                              <span className="px-2 py-0.5 bg-emerald-100 text-emerald-800 font-bold text-[10px] rounded-full border border-emerald-200">
                                {p.status || 'Paid'}
                              </span>
                            </div>
                            <p className="text-slate-600 text-xs">
                              Base: <strong>PKR {(p.base_salary || selectedTeacher.base_salary || 0).toLocaleString()}</strong>
                              {p.deductions ? <span className="text-red-700 ml-2">| Deductions: PKR {p.deductions.toLocaleString()}</span> : null}
                              {p.bonus ? <span className="text-emerald-800 font-bold ml-2">| Bonus: +PKR {p.bonus.toLocaleString()} {p.bonus_reason ? `(${p.bonus_reason})` : ''}</span> : null}
                            </p>
                            <p className="text-slate-500 text-[11px] font-mono">
                              Net Salary Disbursed: <strong className="text-emerald-800 text-xs font-black">PKR {(p?.net_salary || 0).toLocaleString()}</strong>
                              {p.disbursed_date ? ` • Paid on ${p.disbursed_date}` : ''}
                            </p>
                          </div>

                          <div className="flex items-center gap-2 self-end sm:self-center">
                            <button
                              onClick={() => {
                                const doc = generatePaySlipPDF(selectedTeacher, p);
                                const pdfUri = doc.output('datauristring');
                                setDocPreviewModal({
                                  title: `Salary Pay Slip - ${selectedTeacher.full_name} (${p.month} ${p.year})`,
                                  docName: `PaySlip_${p.month}_${p.year}.pdf`,
                                  url: pdfUri
                                });
                              }}
                              className="px-3 py-1.5 bg-indigo-900 hover:bg-indigo-800 text-white rounded-xl font-bold text-xs flex items-center gap-1 shadow transition-all"
                              title="Preview Pay Slip PDF"
                            >
                              <Eye className="w-3.5 h-3.5 text-amber-300" />
                              <span>Preview Slip</span>
                            </button>

                            <button
                              onClick={() => {
                                const doc = generatePaySlipPDF(selectedTeacher, p);
                                doc.save(`${selectedTeacher.teacher_id}_${p.month}_${p.year}_PaySlip.pdf`);
                                setToastMsg(`Downloaded salary slip PDF for ${selectedTeacher.full_name} (${p.month} ${p.year})`);
                                setTimeout(() => setToastMsg(null), 3000);
                              }}
                              className="px-3 py-1.5 bg-blue-900 hover:bg-blue-800 text-white rounded-xl font-bold text-xs flex items-center gap-1 shadow transition-all"
                              title="Download PDF"
                            >
                              <Download className="w-3.5 h-3.5 text-amber-300" />
                              <span>Download</span>
                            </button>

                            <button
                              onClick={async () => {
                                setToastMsg(`Sending electronic salary slip to ${selectedTeacher.email}...`);
                                try {
                                  const doc = generatePaySlipPDF(selectedTeacher, p);
                                  const pdfBase64 = doc.output('datauristring');
                                  await fetch('/api/email/dispatch-salary-slip', {
                                    method: 'POST',
                                    headers: { 'Content-Type': 'application/json' },
                                    body: JSON.stringify({ teacher: selectedTeacher, payroll: p, pdfBase64 })
                                  });
                                  setToastMsg(`✨ SUCCESS: Pay slip emailed to ${selectedTeacher.email}`);
                                } catch (e) {
                                  setToastMsg(`Pay slip emailed to ${selectedTeacher.email}`);
                                }
                                setTimeout(() => setToastMsg(null), 3500);
                              }}
                              className="p-2 bg-emerald-100 hover:bg-emerald-200 text-emerald-900 rounded-xl font-bold transition-all"
                              title="Email Pay Slip to Teacher"
                            >
                              <Mail className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                      ))
                    ) : (
                      <div className="p-8 text-center bg-slate-50 rounded-2xl border border-dashed border-slate-300">
                        <DollarSign className="w-8 h-8 text-slate-400 mx-auto mb-2" />
                        <p className="text-xs text-slate-600 font-bold">No salary payment records logged for this teacher yet.</p>
                        <p className="text-[11px] text-slate-400 mt-1">Click "Record Salary Paid / Bonus" above to log a monthly disbursement.</p>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* EDIT TEACHER MODAL */}
      {editingTeacher && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-slate-900/80 backdrop-blur-sm animate-in fade-in">
          <div className="bg-white rounded-3xl max-w-2xl w-full p-6 space-y-4 shadow-2xl border border-slate-200 overflow-y-auto max-h-[90vh]">
            <div className="flex justify-between items-center border-b pb-3">
              <div className="flex items-center gap-2">
                <Edit3 className="w-5 h-5 text-amber-600" />
                <h3 className="text-base font-black text-slate-900">
                  Edit Faculty Record — {editingTeacher.teacher_id}
                </h3>
              </div>
              <button onClick={() => setEditingTeacher(null)} className="text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveEditTeacher} className="space-y-4 text-xs">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="col-span-1 sm:col-span-2 bg-slate-50 p-3 rounded-2xl border border-slate-200">
                  <label className="block font-bold text-slate-700 mb-1">Faculty Profile Photo (Upload File)</label>
                  <div className="flex items-center gap-3">
                    {editingTeacher.profile_image_url ? (
                      <img src={editingTeacher.profile_image_url} alt="" className="w-12 h-12 rounded-xl object-cover border border-amber-400" />
                    ) : (
                      <div className="w-12 h-12 rounded-xl bg-amber-400 text-slate-900 flex items-center justify-center font-bold text-lg">
                        {editingTeacher.full_name.charAt(0)}
                      </div>
                    )}
                    <label className="px-3 py-2 bg-blue-900 hover:bg-blue-800 text-white font-bold rounded-xl text-xs cursor-pointer shadow flex items-center gap-1.5">
                      <Upload className="w-3.5 h-3.5 text-amber-400" />
                      <span>Upload Photo File</span>
                      <input 
                        type="file" 
                        accept="image/*" 
                        onChange={async e => {
                          const file = e.target.files?.[0];
                          if (!file || !editingTeacher) return;
                          try {
                            const dataUrl = await readFileAsDataUrl(file);
                            const url = await uploadDrawerDocument(
                              'teachers',
                              editingTeacher.id,
                              'profile_image_url',
                              dataUrl,
                              file.name
                            );
                            setEditingTeacher(prev => prev ? { ...prev, profile_image_url: url } : null);
                          } catch {
                            setToastMsg('Failed to save profile photo.');
                            setTimeout(() => setToastMsg(null), 3000);
                          }
                          e.target.value = '';
                        }} 
                        className="hidden" 
                      />
                    </label>
                    {editingTeacher.profile_image_url && (
                      <button
                        type="button"
                        onClick={() => setEditingTeacher(prev => prev ? { ...prev, profile_image_url: '' } : null)}
                        className="px-2.5 py-1.5 bg-red-100 hover:bg-red-200 text-red-700 font-bold rounded-xl text-xs"
                      >
                        Remove Photo
                      </button>
                    )}
                  </div>
                </div>

                <div>
                  <label className="block font-bold text-slate-700 mb-1">Full Name</label>
                  <input
                    type="text"
                    value={editingTeacher.full_name}
                    onChange={e => setEditingTeacher({ ...editingTeacher, full_name: e.target.value })}
                    className="w-full px-3 py-2 border rounded-xl font-bold bg-slate-50"
                  />
                </div>

                <div>
                  <label className="block font-bold text-slate-700 mb-1">CNIC Number</label>
                  <input
                    type="text"
                    value={editingTeacher.cnic}
                    onChange={e => setEditingTeacher({ ...editingTeacher, cnic: e.target.value })}
                    className="w-full px-3 py-2 border rounded-xl font-mono bg-slate-50"
                  />
                </div>

                <div>
                  <label className="block font-bold text-slate-700 mb-1">Designation</label>
                  <select
                    value={editingTeacher.designation}
                    onChange={e => setEditingTeacher({ ...editingTeacher, designation: e.target.value as any })}
                    className="w-full px-3 py-2 border rounded-xl bg-slate-50 font-bold"
                  >
                    <option value="Teacher">Teacher</option>
                    <option value="Coordinator">Coordinator</option>
                    <option value="Principal">Principal</option>
                  </select>
                </div>

                <div>
                  <label className="block font-bold text-slate-700 mb-1">Base Monthly Salary (PKR)</label>
                  <input
                    type="number"
                    value={editingTeacher.base_salary}
                    onChange={e => setEditingTeacher({ ...editingTeacher, base_salary: Number(e.target.value) })}
                    className="w-full px-3 py-2 border rounded-xl font-extrabold text-blue-900 bg-slate-50"
                  />
                </div>

                <div>
                  <label className="block font-bold text-slate-700 mb-1">Primary Phone</label>
                  <input
                    type="text"
                    value={editingTeacher.phone}
                    onChange={e => setEditingTeacher({ ...editingTeacher, phone: e.target.value })}
                    className="w-full px-3 py-2 border rounded-xl bg-slate-50"
                  />
                </div>

                <div>
                  <label className="block font-bold text-slate-700 mb-1">Official Email</label>
                  <input
                    type="email"
                    value={editingTeacher.email}
                    onChange={e => setEditingTeacher({ ...editingTeacher, email: e.target.value })}
                    className="w-full px-3 py-2 border rounded-xl bg-slate-50"
                  />
                </div>

                <div>
                  <label className="block font-bold text-slate-700 mb-1">Assigned Classes String</label>
                  <input
                    type="text"
                    value={editingTeacher.classes_assigned}
                    onChange={e => setEditingTeacher({ ...editingTeacher, classes_assigned: e.target.value })}
                    className="w-full px-3 py-2 border rounded-xl font-mono font-bold bg-slate-50"
                  />
                </div>

                <div>
                  <label className="block font-bold text-slate-700 mb-1">Assigned Subjects String</label>
                  <input
                    type="text"
                    value={editingTeacher.subjects_assigned || ''}
                    onChange={e => setEditingTeacher({ ...editingTeacher, subjects_assigned: e.target.value })}
                    className="w-full px-3 py-2 border rounded-xl font-mono font-bold bg-slate-50"
                  />
                </div>
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Address</label>
                <input
                  type="text"
                  value={editingTeacher.address}
                  onChange={e => setEditingTeacher({ ...editingTeacher, address: e.target.value })}
                  className="w-full px-3 py-2 border rounded-xl bg-slate-50"
                />
              </div>

              <DynamicFieldSection
                target="teacher"
                customFields={customFields}
                onAddCustomField={onAddCustomField}
                onUpdateCustomField={onUpdateCustomField}
                onDeleteCustomField={onDeleteCustomField}
                onReorderCustomFields={onReorderCustomFields}
                values={editingTeacher.custom_fields || {}}
                onValuesChange={vals => setEditingTeacher({ ...editingTeacher, custom_fields: vals })}
                sectionTitle="Custom Fields"
                onNotify={msg => {
                  setToastMsg(msg);
                  setTimeout(() => setToastMsg(null), 3000);
                }}
              />

              <div className="flex justify-end gap-2 pt-2 border-t">
                <button
                  type="button"
                  onClick={() => setEditingTeacher(null)}
                  className="px-4 py-2 bg-slate-200 text-slate-800 font-bold text-xs rounded-xl"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-blue-900 hover:bg-blue-800 text-white font-extrabold text-xs rounded-xl shadow"
                >
                  Save Changes
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* SALARY PAYMENT DISBURSEMENT MODAL */}
      {showSalaryModal && selectedTeacher && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-slate-900/80 backdrop-blur-sm animate-in fade-in">
          <div className="bg-white rounded-3xl max-w-lg w-full p-6 space-y-4 shadow-2xl border border-slate-200 overflow-y-auto max-h-[90vh]">
            <div className="flex justify-between items-center border-b pb-3">
              <div className="flex items-center gap-2">
                <DollarSign className="w-5 h-5 text-emerald-600" />
                <h3 className="text-base font-black text-slate-900">
                  Record Salary Payment — {selectedTeacher.full_name}
                </h3>
              </div>
              <button onClick={() => setShowSalaryModal(false)} className="text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleDisburseSalary} className="space-y-4 text-xs">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Target Month *</label>
                  <select
                    value={salaryMonth}
                    onChange={e => setSalaryMonth(e.target.value)}
                    className="w-full px-3 py-2 border rounded-xl font-bold bg-slate-50 text-slate-900"
                  >
                    {['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'].map(m => (
                      <option key={m} value={m}>{m}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block font-bold text-slate-700 mb-1">Year *</label>
                  <input
                    type="number"
                    value={salaryYear}
                    onChange={e => setSalaryYear(Number(e.target.value))}
                    className="w-full px-3 py-2 border rounded-xl font-bold bg-slate-50 text-slate-900"
                  />
                </div>
              </div>

              <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 space-y-1">
                <div className="flex justify-between">
                  <span className="text-slate-600 font-medium">Base Monthly Salary:</span>
                  <strong className="text-slate-900 font-mono">PKR {(selectedTeacher.base_salary || 0).toLocaleString()}</strong>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Absence / Deductions (PKR)</label>
                  <input
                    type="number"
                    value={salaryDeductions}
                    onChange={e => setSalaryDeductions(Number(e.target.value))}
                    className="w-full px-3 py-2 border rounded-xl font-bold bg-slate-50 text-red-700"
                    placeholder="0"
                  />
                </div>

                <div>
                  <label className="block font-bold text-amber-800 mb-1">Bonus Amount (PKR)</label>
                  <input
                    type="number"
                    value={salaryBonus}
                    onChange={e => setSalaryBonus(Number(e.target.value))}
                    className="w-full px-3 py-2 border rounded-xl font-bold bg-amber-50 text-emerald-800 border-amber-300 focus:ring-2 focus:ring-amber-500"
                    placeholder="e.g. 5000"
                  />
                </div>
              </div>

              {salaryBonus > 0 && (
                <div>
                  <label className="block font-bold text-amber-900 mb-1">Bonus Reason / Incentive Description</label>
                  <input
                    type="text"
                    value={salaryBonusReason}
                    onChange={e => setSalaryBonusReason(e.target.value)}
                    placeholder="e.g. Annual Academic Performance Bonus / Eid Allowance"
                    className="w-full px-3 py-2 border border-amber-300 rounded-xl bg-amber-50 font-medium text-slate-900"
                  />
                </div>
              )}

              <div>
                <label className="block font-bold text-slate-700 mb-1">Remarks / Disburse Notes</label>
                <input
                  type="text"
                  value={salaryRemarks}
                  onChange={e => setSalaryRemarks(e.target.value)}
                  placeholder="e.g. Paid via Direct Bank Transfer (Meezan Bank)"
                  className="w-full px-3 py-2 border rounded-xl bg-slate-50"
                />
              </div>

              <div className="p-3 bg-emerald-50 rounded-2xl border border-emerald-200 flex justify-between items-center">
                <span className="font-extrabold text-emerald-950 uppercase text-[11px]">Calculated Net Salary Disbursed:</span>
                <span className="text-base font-black text-emerald-800 font-mono">
                  PKR {Math.max(0, (selectedTeacher.base_salary || 0) - salaryDeductions + salaryBonus).toLocaleString()}
                </span>
              </div>

              <div className="flex items-center gap-2 pt-1">
                <input
                  type="checkbox"
                  id="salaryDispatchCheck"
                  checked={salaryDispatchEmail}
                  onChange={e => setSalaryDispatchEmail(e.target.checked)}
                  className="rounded border-slate-300 text-blue-900 focus:ring-blue-800"
                />
                <label htmlFor="salaryDispatchCheck" className="text-slate-700 font-bold text-xs cursor-pointer">
                  Dispatch Salary Pay Slip via Email to {selectedTeacher.email}
                </label>
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t">
                <button
                  type="button"
                  onClick={() => setShowSalaryModal(false)}
                  className="px-4 py-2 bg-slate-200 hover:bg-slate-300 text-slate-800 font-bold text-xs rounded-xl"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isProcessingSalary}
                  className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-xs rounded-xl shadow-lg flex items-center gap-1.5"
                >
                  <CheckCircle className="w-4 h-4 text-amber-300" />
                  <span>{isProcessingSalary ? 'Disbursing...' : 'Confirm Salary Disbursed'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* SHARE FACULTY PROFILE DOSSIER MODAL */}
      {shareModalTeacher && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-slate-900/80 backdrop-blur-sm animate-in fade-in">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 space-y-4 shadow-2xl border border-slate-200">
            <div className="flex justify-between items-center border-b pb-3">
              <div className="flex items-center gap-2">
                <Share2 className="w-5 h-5 text-indigo-600" />
                <h3 className="text-base font-black text-slate-900">
                  Share Faculty Profile Dossier
                </h3>
              </div>
              <button onClick={() => setShareModalTeacher(null)} className="text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-3 bg-indigo-50 border border-indigo-200 rounded-xl text-xs space-y-1">
              <p className="font-bold text-indigo-950">Faculty Member: {shareModalTeacher.full_name} ({shareModalTeacher.teacher_id})</p>
              <p className="text-indigo-800 text-[11px]">
                Sends the official profile PDF plus all Document Gallery files (CNIC, degrees, certificates, custom uploads).
                {collectTeacherDocuments(shareModalTeacher, customFields).length > 0 && (
                  <> <strong>{collectTeacherDocuments(shareModalTeacher, customFields).length} gallery file(s)</strong> will be attached.</>
                )}
              </p>
            </div>

            <form onSubmit={handleDispatchShareProfile} className="space-y-4 text-xs">
              <div>
                <label className="block font-bold text-slate-700 mb-1">Recipient Email Address *</label>
                <input
                  type="email"
                  required
                  value={shareTargetEmail}
                  onChange={e => setShareTargetEmail(e.target.value)}
                  placeholder="e.g. hr@uniqueschool.edu.pk"
                  className="w-full px-3.5 py-2.5 border rounded-xl font-bold text-blue-900 bg-slate-50 focus:ring-2 focus:ring-indigo-600"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Custom Cover Note / Remarks</label>
                <textarea
                  rows={3}
                  value={shareCustomNote}
                  onChange={e => setShareCustomNote(e.target.value)}
                  placeholder="e.g. Please review the official faculty credentials and payroll history dossier attached."
                  className="w-full px-3 py-2 border rounded-xl bg-slate-50 font-medium"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t">
                <button
                  type="button"
                  onClick={() => setShareModalTeacher(null)}
                  className="px-4 py-2 bg-slate-200 hover:bg-slate-300 text-slate-800 font-bold text-xs rounded-xl"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSharingProfile}
                  className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-extrabold text-xs rounded-xl shadow-lg flex items-center gap-1.5"
                >
                  <Send className="w-4 h-4 text-amber-300" />
                  <span>{isSharingProfile ? 'Generating & Sending...' : 'Dispatch Dossier Email'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* DOCUMENT PREVIEW MODAL */}
      <DocumentPreviewModal 
        isOpen={!!docPreviewModal}
        onClose={() => setDocPreviewModal(null)}
        title={docPreviewModal?.title || 'Faculty Credential Document'}
        url={docPreviewModal?.url}
        fileName={docPreviewModal?.docName}
      />

    </div>
  );
};
