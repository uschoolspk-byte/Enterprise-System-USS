import React, { useState, useMemo, useEffect } from 'react';
import { 
  Users, 
  Search, 
  FileSpreadsheet, 
  X, 
  HeartHandshake, 
  FileText, 
  Calendar, 
  FolderTree, 
  Send, 
  CreditCard, 
  CheckCircle2, 
  Download, 
  Mail, 
  Award,
  Sparkles,
  ShieldCheck,
  Edit3,
  Save,
  Printer,
  Share2,
  Eye,
  Trash2,
  Plus,
  Filter,
  ExternalLink,
  Folder,
  RefreshCw,
  Upload
} from 'lucide-react';
import { Student, StudentAttendance, FeeLedger, ExamResult, DynamicCustomField } from '../types';
import { exportStudentsToExcel, exportSingleStudentAttendanceToExcel } from '../lib/excelExporter';
import { generateStudentProfilePDF, generateNOCClearancePDF, generateProgressReportPDF } from '../lib/pdfGenerator';
import { DocumentPreviewModal } from './DocumentPreviewModal';
import { DocumentGallery } from './DocumentGallery';
import { collectStudentDocuments, readFileAsDataUrl } from '../lib/documentGalleryUtils';
import { uploadDrawerDocument } from '../lib/drawerDocumentUpload';
import { resolveExamResultPdfUrl } from '../lib/pdfViewerUtils';
import { dedupeFeeVouchers } from '../lib/feeUtils';
import { DynamicFieldSection, validateDynamicFieldValues } from './DynamicFieldSection';

function getPdfDocUrl(result: ExamResult): string {
  return resolveExamResultPdfUrl(result);
}

interface StudentHubProps {
  students: Student[];
  onUpdateStudent: (student: Student) => void;
  onDeleteStudent?: (studentId: string) => void;
  attendanceList: StudentAttendance[];
  fees: FeeLedger[];
  examResults: ExamResult[];
  onDeleteExamResult?: (id: string) => void;
  onUpdateExamResult?: (updated: ExamResult) => void;
  onSaveExamResults?: (results: ExamResult[]) => void;
  customFields: DynamicCustomField[];
  onAddCustomField: (field: DynamicCustomField) => void;
  onUpdateCustomField: (field: DynamicCustomField) => void;
  onDeleteCustomField: (fieldId: string) => void;
  onReorderCustomFields: (orderedIds: string[]) => void;
  onRefreshFromServer?: () => Promise<void>;
}

export const StudentHub: React.FC<StudentHubProps> = ({
  students,
  onUpdateStudent,
  onDeleteStudent,
  attendanceList,
  fees,
  examResults,
  onDeleteExamResult,
  onUpdateExamResult,
  onSaveExamResults,
  customFields,
  onAddCustomField,
  onUpdateCustomField,
  onDeleteCustomField,
  onReorderCustomFields,
  onRefreshFromServer
}) => {
  // Search & Filter State
  const [searchTerm, setSearchTerm] = useState('');
  const [filterClass, setFilterClass] = useState('All');
  const [orphanOnly, setOrphanOnly] = useState(false);
  const [activeDirectoryTab, setActiveDirectoryTab] = useState<'all' | 'orphans' | 'classRosters' | 'feeLedger' | 'nocClearance'>('all');

  // Selected Student Drawer Modal State
  const [selectedStudent, setSelectedStudent] = useState<Student | null>(null);
  const [drawerTab, setDrawerTab] = useState<'profile' | 'docs' | 'attendance' | 'exams' | 'fees' | 'noc'>('profile');

  // Inline Profile Edit State inside Drawer
  const [isEditing, setIsEditing] = useState(false);
  const [editForm, setEditForm] = useState<Partial<Student>>({});

  // Share Profile Modal State
  const [isShareModalOpen, setIsShareModalOpen] = useState(false);
  const [shareRecipientEmail, setShareRecipientEmail] = useState('');
  const [shareRecipientName, setShareRecipientName] = useState('');
  const [shareNote, setShareNote] = useState('');

  // Exam Result Preview Modal State
  const [previewExamResult, setPreviewExamResult] = useState<ExamResult | null>(null);

  // Document Gallery Asset Preview Modal State
  const [docPreviewModal, setDocPreviewModal] = useState<{ title: string; url: string } | null>(null);

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
    if (!selectedStudent) return;
    const fresh = students.find(s => s.id === selectedStudent.id);
    if (!fresh) return;
    if (isEditing && drawerTab === 'profile') return;
    setSelectedStudent(fresh);
  }, [students, selectedStudent?.id, isEditing, drawerTab]);

  // Filtered Student Attendance Logs for Drawer
  const filteredStudentAttendanceLogs = useMemo(() => {
    if (!selectedStudent) return [];
    const logs = attendanceList.filter(a => a.student_id === selectedStudent.id);
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
  }, [selectedStudent, attendanceList, attendanceRangePreset, attendanceStartDate, attendanceEndDate]);

  // Evaluation Tree Filters inside Drawer
  const [evalSearchTerm, setEvalSearchTerm] = useState('');
  const [evalSessionFilter, setEvalSessionFilter] = useState('ALL');
  const [evalCategoryFilter, setEvalCategoryFilter] = useState('ALL');
  const [evalGradeFilter, setEvalGradeFilter] = useState('ALL');

  // Evaluation Tree CRUD State inside Drawer
  const [editingExamResult, setEditingExamResult] = useState<ExamResult | null>(null);
  const [isAddExamModalOpen, setIsAddExamModalOpen] = useState(false);
  const [newExamForm, setNewExamForm] = useState({
    exam_name: 'Weekly Test 1',
    evaluation_type: 'Weekly Test',
    session_name: 'Session 2026',
    week_number: 'Week 1',
    month_name: 'August',
    subject_name: 'Mathematics',
    marks_obtained: 85,
    total_marks: 100,
    grade: 'A',
    remarks: 'Good progress',
    file_url: ''
  });

  // Toast & Email Dispatch State
  const [toastMsg, setToastMsg] = useState<string | null>(null);
  const [isDispatching, setIsDispatching] = useState(false);

  // Unique Classes list for filter
  const allClasses = Array.from(new Set(students.map(s => s.class_name)));

  // Filtered Students
  const filteredStudents = students.filter(s => {
    const matchesSearch = s.full_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                          s.roll_no.toLowerCase().includes(searchTerm.toLowerCase()) ||
                          s.father_name.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesClass = filterClass === 'All' || s.class_name === filterClass;
    const isOrphanTab = activeDirectoryTab === 'orphans';
    const matchesOrphan = isOrphanTab ? s.is_orphan : (!orphanOnly || s.is_orphan);
    return matchesSearch && matchesClass && matchesOrphan;
  });

  // Open Drawer Modal
  const handleOpenDrawer = (student: Student) => {
    setSelectedStudent(student);
    setEditForm(student);
    setIsEditing(false);
    setDrawerTab('profile');
  };

  // Upload student photo file — persisted to database immediately
  const handleStudentPhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !selectedStudent) return;
    try {
      const dataUrl = await readFileAsDataUrl(file);
      const url = await uploadDrawerDocument(
        'students',
        selectedStudent.id,
        'profile_image_url',
        dataUrl,
        file.name
      );
      setEditForm(prev => ({ ...prev, profile_image_url: url }));
      const updated = { ...selectedStudent, profile_image_url: url };
      onUpdateStudent(updated);
      setSelectedStudent(updated);
      setToastMsg('Profile picture saved to database.');
      setTimeout(() => setToastMsg(null), 3000);
    } catch {
      setToastMsg('Failed to save profile picture. Please try again.');
      setTimeout(() => setToastMsg(null), 3000);
    }
    e.target.value = '';
  };

  const handleCloseDrawer = () => {
    if (
      isEditing &&
      selectedStudent &&
      JSON.stringify(editForm) !== JSON.stringify(selectedStudent)
    ) {
      if (!confirm('You have unsaved profile changes. Discard them?')) return;
    }
    setSelectedStudent(null);
    setIsEditing(false);
    setEditForm({});
  };

  // Save Inline Profile Edits
  const handleSaveEdits = () => {
    if (selectedStudent && editForm) {
      const studentFields = customFields.filter(f => f.target === 'student');
      const fieldValidationError = validateDynamicFieldValues(studentFields, editForm.custom_fields || {});
      if (fieldValidationError) {
        setToastMsg(fieldValidationError);
        setTimeout(() => setToastMsg(null), 3000);
        return;
      }

      const updated = { ...selectedStudent, ...editForm } as Student;
      onUpdateStudent(updated);
      setSelectedStudent(updated);
      setIsEditing(false);
      setToastMsg(`Student profile for ${updated.full_name} updated successfully!`);
      setTimeout(() => setToastMsg(null), 3000);
    }
  };

  // Trigger Brevo SMTP Email Progress Report Dispatch according to SPEC 3
  const handleSendProgressReport = async (student: Student, examName: string, sessionName: string) => {
    setIsDispatching(true);
    setToastMsg(`Generating PDF & dispatching Brevo SMTP email for ${student.full_name}...`);

    try {
      // 1. Generate Report PDF Base64
      const doc = generateProgressReportPDF(student, examName, sessionName);
      const pdfBase64 = doc.output('datauristring');

      // 2. Call Express API Brevo Dispatch Route
      const res = await fetch('/api/email/dispatch-progress-report', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          student,
          termName: `${examName} (${sessionName})`,
          pdfBase64
        })
      });

      const data = await res.json();
      setIsDispatching(false);

      if (data.success) {
        setToastMsg(`SUCCESS: Progress Report sent via Brevo SMTP to ${data.recipientEmail} (${data.recipientType}: ${data.recipientName})`);
      } else {
        setToastMsg(`Email Dispatch Completed: ${data.message}`);
      }
    } catch (err: any) {
      setIsDispatching(false);
      setToastMsg(`Brevo Dispatch Error: ${err.message || 'Server connection error'}`);
    }
    setTimeout(() => setToastMsg(null), 5000);
  };

  // Export Student Profile as PDF
  const handleExportProfilePDF = (student: Student) => {
    const doc = generateStudentProfilePDF(student, [], customFields);
    doc.save(`Student_Profile_${student.roll_no}_${student.full_name.replace(/\s+/g, '_')}.pdf`);
  };

  // Open Share Modal Pre-populated
  const handleOpenShareModal = (student: Student) => {
    setSelectedStudent(student);
    if (student.is_orphan && student.donor_email) {
      setShareRecipientEmail(student.donor_email);
      setShareRecipientName(student.donor_name || 'Sponsoring Donor');
    } else {
      setShareRecipientEmail(student.guardian_email || '');
      setShareRecipientName(student.guardian_name || student.father_name || 'Guardian');
    }
    setShareNote(`Respected ${student.is_orphan ? 'Donor' : 'Guardian'}, please review the verified academic & attendance profile for ${student.full_name} (${student.roll_no}).`);
    setIsShareModalOpen(true);
  };

  // Dispatch Share Profile Email via Brevo
  const handleExecuteShare = async () => {
    if (!selectedStudent || !shareRecipientEmail) return;
    const studentRecord = students.find(s => s.id === selectedStudent.id) || selectedStudent;
    setIsDispatching(true);
    setToastMsg(`Preparing verified profile package and dispatching email to ${shareRecipientEmail}...`);

    try {
      const doc = generateStudentProfilePDF(
        studentRecord,
        attendanceList.filter(a => a.student_id === studentRecord.id),
        customFields
      );
      const pdfBase64 = doc.output('datauristring');

      const profileFilename = `Student_Profile_${studentRecord.roll_no}_${studentRecord.full_name.replace(/\s+/g, '_')}.pdf`;
      const galleryDocCount = collectStudentDocuments(studentRecord, customFields).length;

      const res = await fetch('/api/email/dispatch-progress-report', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          student: studentRecord,
          termName: 'Student Profile',
          pdfBase64,
          attachmentFilename: profileFilename,
          customRecipientEmail: shareRecipientEmail,
          customNote: shareNote,
          galleryDocCount
        })
      });

      const data = await res.json();
      setIsDispatching(false);
      setIsShareModalOpen(false);

      if (data.success) {
        const extra = galleryDocCount > 0 ? ` (+ ${galleryDocCount} gallery document${galleryDocCount !== 1 ? 's' : ''})` : '';
        setToastMsg(`SUCCESS: Profile shared with ${shareRecipientName} (${shareRecipientEmail})${extra} via Brevo SMTP!`);
      } else {
        setToastMsg(`Profile Shared: ${data.message || 'Dispatched successfully'}`);
      }
    } catch (err: any) {
      setIsDispatching(false);
      setToastMsg(`Share Dispatch Error: ${err.message || 'Network error'}`);
    }
    setTimeout(() => setToastMsg(null), 5000);
  };

  // Generate & Download Graduation NOC Certificate
  const handleIssueNOC = (student: Student) => {
    const doc = generateNOCClearancePDF(student);
    doc.save(`${student.roll_no}_Graduation_NOC_Certificate.pdf`);
    setToastMsg(`Official Graduation NOC Clearance Certificate generated for ${student.full_name}!`);
    setTimeout(() => setToastMsg(null), 3000);
  };

  return (
    <div className="max-w-7xl mx-auto p-4 sm:p-6 space-y-6">
      
      {/* Toast Alert */}
      {toastMsg && (
        <div className="p-4 rounded-xl bg-blue-900 text-white font-bold flex items-center justify-between shadow-2xl animate-in slide-in-from-top border border-blue-700">
          <div className="flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-amber-400" />
            <span>{toastMsg}</span>
          </div>
          <button onClick={() => setToastMsg(null)} className="text-blue-200 hover:text-white">
            <X className="w-5 h-5" />
          </button>
        </div>
      )}

      {/* Control Header & Extraction Center */}
      <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-xl space-y-4">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b pb-4">
          <div>
            <div className="flex items-center gap-2">
              <Users className="w-6 h-6 text-blue-900" />
              <h2 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight">
                Master Student Directory & Student Hub
              </h2>
            </div>
            <p className="text-xs text-slate-500 mt-1">
              Active Roster: {students.length} Students | Orphan Sponsorships: {students.filter(s => s.is_orphan).length}
            </p>
          </div>

          {/* Global Extraction Trigger Button */}
          <button
            onClick={() => exportStudentsToExcel(students)}
            className="px-5 py-2.5 bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-bold rounded-xl shadow-lg shadow-emerald-700/20 flex items-center justify-center gap-2 transition-all active:scale-[0.98]"
          >
            <FileSpreadsheet className="w-4 h-4" />
            Download All Students Master Excel Report
          </button>
        </div>

        {/* Directory Navigation Tabs */}
        <div className="flex border-b border-slate-200 overflow-x-auto gap-2 pb-2">
          <button
            onClick={() => { setActiveDirectoryTab('all'); setOrphanOnly(false); setFilterClass('All'); }}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-black transition-all whitespace-nowrap ${
              activeDirectoryTab === 'all'
                ? 'bg-blue-900 text-white shadow-md'
                : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
            }`}
          >
            <Users className="w-4 h-4" />
            All Active Roster ({students.length})
          </button>

          <button
            onClick={() => { setActiveDirectoryTab('orphans'); setOrphanOnly(true); }}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-black transition-all whitespace-nowrap ${
              activeDirectoryTab === 'orphans'
                ? 'bg-amber-500 text-slate-900 shadow-md font-black'
                : 'bg-amber-50 text-amber-900 border border-amber-200 hover:bg-amber-100'
            }`}
          >
            <HeartHandshake className="w-4 h-4 text-amber-600" />
            Orphans & Sponsored ({students.filter(s => s.is_orphan).length})
          </button>

          <button
            onClick={() => { setActiveDirectoryTab('classRosters'); setOrphanOnly(false); }}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-black transition-all whitespace-nowrap ${
              activeDirectoryTab === 'classRosters'
                ? 'bg-blue-900 text-white shadow-md'
                : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
            }`}
          >
            <FolderTree className="w-4 h-4" />
            Class Rosters
          </button>

          <button
            onClick={() => { setActiveDirectoryTab('feeLedger'); setOrphanOnly(false); }}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-black transition-all whitespace-nowrap ${
              activeDirectoryTab === 'feeLedger'
                ? 'bg-emerald-700 text-white shadow-md'
                : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
            }`}
          >
            <CreditCard className="w-4 h-4" />
            Fee Payment Status
          </button>

          <button
            onClick={() => { setActiveDirectoryTab('nocClearance'); setOrphanOnly(false); }}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-black transition-all whitespace-nowrap ${
              activeDirectoryTab === 'nocClearance'
                ? 'bg-indigo-900 text-white shadow-md'
                : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
            }`}
          >
            <Award className="w-4 h-4" />
            Graduation NOC Clearances
          </button>
        </div>

        {/* Class Roster Pills Selector when Class Rosters tab active */}
        {activeDirectoryTab === 'classRosters' && (
          <div className="flex items-center gap-2 overflow-x-auto pb-1 pt-1 bg-slate-50 p-3 rounded-xl border border-slate-200">
            <span className="text-xs font-bold text-slate-500 whitespace-nowrap">Select Class Roster:</span>
            <button
              onClick={() => setFilterClass('All')}
              className={`px-3 py-1 rounded-lg text-xs font-bold whitespace-nowrap transition-all ${
                filterClass === 'All' ? 'bg-blue-800 text-white font-extrabold shadow' : 'bg-white text-slate-700 hover:bg-slate-200 border'
              }`}
            >
              All Classes
            </button>
            {allClasses.map(c => (
              <button
                key={c}
                onClick={() => setFilterClass(c)}
                className={`px-3 py-1 rounded-lg text-xs font-bold whitespace-nowrap transition-all ${
                  filterClass === c ? 'bg-blue-800 text-white font-extrabold shadow' : 'bg-white text-slate-700 hover:bg-slate-200 border'
                }`}
              >
                Class {c}
              </button>
            ))}
          </div>
        )}

        {/* Search & Filter Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="relative">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
            <input 
              type="text"
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              placeholder="Search by Roll No, Student Name, or Father Name..."
              className="w-full pl-9 pr-3 py-2 rounded-xl border border-slate-300 text-sm focus:ring-2 focus:ring-blue-800"
            />
          </div>

          <div>
            <select
              value={filterClass}
              onChange={e => setFilterClass(e.target.value)}
              className="w-full px-3 py-2 rounded-xl border border-slate-300 text-sm focus:ring-2 focus:ring-blue-800"
            >
              <option value="All">All Classes Roster</option>
              {allClasses.map(c => (
                <option key={c} value={c}>Class {c}</option>
              ))}
            </select>
          </div>

          <div className="flex items-center gap-2 bg-amber-50 px-4 py-2 rounded-xl border border-amber-200">
            <input 
              type="checkbox"
              id="orphanFilter"
              checked={orphanOnly}
              onChange={e => setOrphanOnly(e.target.checked)}
              className="w-4 h-4 text-amber-600 rounded focus:ring-amber-500 cursor-pointer"
            />
            <label htmlFor="orphanFilter" className="text-xs font-bold text-amber-900 cursor-pointer flex items-center gap-1.5">
              <HeartHandshake className="w-4 h-4 text-amber-600" />
              Filter Orphan / Sponsored Only
            </label>
          </div>
        </div>
      </div>

      {/* Scannable Data Engine Grid */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-900 text-white text-[11px] font-black uppercase tracking-wider">
                <th className="p-3">Roll Number</th>
                <th className="p-3">Student Name</th>
                <th className="p-3">Class</th>
                <th className="p-3">Father / Guardian Name</th>
                <th className="p-3">Category</th>
                <th className="p-3">Donor / Sponsor Info</th>
                <th className="p-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 text-xs text-slate-700">
              {filteredStudents.length > 0 ? (
                filteredStudents.map((student) => (
                  <tr 
                    key={student.id} 
                    className="hover:bg-blue-50/50 cursor-pointer transition-all"
                    onClick={() => handleOpenDrawer(student)}
                  >
                    <td className="p-3 font-mono font-bold text-blue-900">
                      {student.roll_no}
                    </td>
                    <td className="p-3 font-bold text-slate-900">
                      <div className="flex items-center gap-2">
                        {student.profile_image_url ? (
                          <img src={student.profile_image_url} alt="" className="w-7 h-7 rounded-full object-cover border" />
                        ) : (
                          <div className="w-7 h-7 rounded-full bg-slate-200 flex items-center justify-center font-bold text-slate-600">
                            {student.full_name.charAt(0)}
                          </div>
                        )}
                        <span>{student.full_name}</span>
                      </div>
                    </td>
                    <td className="p-3 font-bold">
                      <span className="px-2.5 py-1 rounded-full bg-slate-100 text-slate-800 font-bold border border-slate-200">
                        Class {student.class_name}
                      </span>
                    </td>
                    <td className="p-3">
                      <div>{student.guardian_name || student.father_name}</div>
                      <div className="text-[10px] text-slate-400">{student.guardian_phone || student.parent_phone}</div>
                    </td>
                    <td className="p-3">
                      {student.is_orphan ? (
                        <span className="px-2.5 py-1 rounded-full bg-red-100 text-red-800 font-extrabold border border-red-200 flex items-center gap-1 w-fit">
                          <HeartHandshake className="w-3 h-3 text-red-600" /> Orphan Category
                        </span>
                      ) : (
                        <span className="px-2.5 py-1 rounded-full bg-emerald-100 text-emerald-800 font-bold border border-emerald-200 w-fit">
                          Regular
                        </span>
                      )}
                    </td>
                    <td className="p-3">
                      {student.is_orphan ? (
                        <div>
                          <div className="font-bold text-slate-900">{student.donor_name}</div>
                          <div className="text-[10px] text-blue-700">{student.donor_email}</div>
                        </div>
                      ) : (
                        <span className="text-slate-400">N/A</span>
                      )}
                    </td>
                    <td className="p-3 text-right">
                      <div className="flex items-center justify-end gap-2">
                        {activeDirectoryTab === 'nocClearance' && (
                          <button
                            onClick={(e) => { e.stopPropagation(); handleIssueNOC(student); }}
                            className="px-2.5 py-1.5 bg-amber-500 hover:bg-amber-600 text-slate-900 rounded-lg font-black text-xs shadow flex items-center gap-1 transition-all"
                            title="Issue Official Graduation NOC Certificate"
                          >
                            <Award className="w-3.5 h-3.5" /> Issue NOC
                          </button>
                        )}
                        <button
                          onClick={(e) => { e.stopPropagation(); handleOpenDrawer(student); }}
                          className="px-3 py-1.5 bg-blue-900 text-white rounded-lg font-bold text-xs hover:bg-blue-800 transition-all"
                        >
                          Open Student Hub
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={7} className="p-8 text-center text-slate-400 font-medium">
                    No student records match the active search filter.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* MASTER PROFILE DRAWER MODAL (STUDENT HUB SOURCE OF TRUTH) */}
      {selectedStudent && (
        <div className="fixed inset-0 z-50 flex justify-end bg-slate-900/80 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="w-full max-w-4xl bg-white h-full overflow-y-auto shadow-2xl flex flex-col">
            
            {/* Sticky Drawer Header & Tabs Bar */}
            <div className="sticky top-0 z-20 bg-slate-900 shadow-md">
              {/* Drawer Header */}
              <div className="bg-gradient-to-r from-blue-900 via-indigo-900 to-slate-900 p-4 sm:p-6 text-white flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                <div className="flex items-center gap-4">
                  {selectedStudent.profile_image_url ? (
                    <img src={selectedStudent.profile_image_url} alt="" className="w-16 h-16 rounded-2xl object-cover border-2 border-amber-400 shadow-xl" />
                  ) : (
                    <div className="w-16 h-16 rounded-2xl bg-amber-400 text-slate-900 flex items-center justify-center font-black text-2xl shadow-xl">
                      {selectedStudent.full_name.charAt(0)}
                    </div>
                  )}
                  <div>
                    <div className="flex items-center gap-2">
                      <h2 className="text-xl font-black">{selectedStudent.full_name}</h2>
                      <span className="px-2 py-0.5 rounded bg-blue-800 text-blue-200 text-xs font-mono font-bold">
                        {selectedStudent.roll_no}
                      </span>
                    </div>
                    <p className="text-xs text-blue-200 mt-1">
                      Class {selectedStudent.class_name} | Father: {selectedStudent.father_name} | Phone: {selectedStudent.parent_phone}
                    </p>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <button
                    onClick={() => handleExportProfilePDF(selectedStudent)}
                    className="px-3 py-1.5 bg-amber-500 hover:bg-amber-600 text-slate-900 font-extrabold text-xs rounded-xl flex items-center gap-1.5 shadow transition-all"
                    title="Print / Save Profile in PDF Format"
                  >
                    <Printer className="w-3.5 h-3.5" /> Print / Save PDF
                  </button>
                  <button
                    onClick={() => handleOpenShareModal(selectedStudent)}
                    className="px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white font-extrabold text-xs rounded-xl flex items-center gap-1.5 shadow transition-all"
                    title="Share Student Profile via Brevo Email to Guardian or Donor"
                  >
                    <Share2 className="w-3.5 h-3.5 text-amber-300" /> Share Profile
                  </button>
                  <button
                    onClick={() => handleSendProgressReport(selectedStudent, 'All Terms', 'Session 2026')}
                    className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white font-extrabold text-xs rounded-xl flex items-center gap-1.5 shadow transition-all"
                    title="Dispatch All Progress Reports to Guardian / Donor via Brevo"
                  >
                    <Mail className="w-3.5 h-3.5 text-amber-300" /> Send All Results
                  </button>
                  <button
                    onClick={() => {
                      if (isEditing) {
                        handleSaveEdits();
                      } else {
                        setDrawerTab('profile');
                        setEditForm({ ...selectedStudent });
                        setIsEditing(true);
                      }
                    }}
                    className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white font-extrabold text-xs rounded-xl flex items-center gap-1.5 shadow transition-all"
                    title="Edit Profile Attributes"
                  >
                    <Edit3 className="w-3.5 h-3.5" /> {isEditing ? 'Save Edits' : 'Edit Profile Details'}
                  </button>
                  {onDeleteStudent && (
                    <button
                      onClick={() => {
                        if (confirm(`Are you sure you want to permanently delete student record for "${selectedStudent.full_name}" (${selectedStudent.roll_no})?`)) {
                          onDeleteStudent(selectedStudent.id);
                          setSelectedStudent(null);
                        }
                      }}
                      className="px-3 py-1.5 bg-red-600 hover:bg-red-700 text-white font-extrabold text-xs rounded-xl flex items-center gap-1.5 shadow transition-all"
                      title="Delete Student Record"
                    >
                      <Trash2 className="w-3.5 h-3.5" /> Delete Student
                    </button>
                  )}
                  <button 
                    onClick={handleCloseDrawer}
                    className="p-2 bg-white/10 hover:bg-white/20 text-white rounded-xl transition-all"
                    title="Close Student Hub"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>
              </div>

              {/* Drawer Navigation Tabs Bar */}
              <div className="bg-slate-100 border-b border-slate-300 px-4 sm:px-6 py-3 flex space-x-2 overflow-x-auto shadow-inner">
                {[
                  { id: 'profile', label: 'Profile & Docs', icon: <Users className="w-4 h-4 text-blue-900" /> },
                  { id: 'attendance', label: 'Attendance Grid', icon: <Calendar className="w-4 h-4 text-blue-900" /> },
                  { id: 'fees', label: 'Fee Ledger', icon: <CreditCard className="w-4 h-4 text-emerald-800" /> },
                  { id: 'exams', label: 'Evaluations Tree', icon: <FolderTree className="w-4 h-4 text-indigo-900" /> },
                  { id: 'docs', label: 'Document Gallery', icon: <FileText className="w-4 h-4 text-amber-800" /> },
                  { id: 'noc', label: 'Graduation NOC Clearance', icon: <Award className="w-4 h-4 text-purple-900" /> }
                ].map(t => (
                  <button
                    key={t.id}
                    onClick={() => setDrawerTab(t.id as any)}
                    className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-black whitespace-nowrap transition-all shadow-sm ${
                      drawerTab === t.id
                        ? 'bg-blue-900 text-white shadow-md ring-2 ring-blue-900/50'
                        : 'bg-white text-slate-800 hover:bg-slate-200 border border-slate-300 hover:border-slate-400'
                    }`}
                  >
                    {t.icon}
                    {t.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Drawer Content Views */}
            <div className="p-6 flex-1 space-y-6">
              
              {/* TAB 1: CORE PROFILE VIEW & FULL EDITABLE ENGINE */}
              {drawerTab === 'profile' && (
                <div className="space-y-6">
                  <div className="flex justify-between items-center border-b pb-3">
                    <h3 className="text-sm font-black text-slate-900 uppercase tracking-wider flex items-center gap-2">
                      <ShieldCheck className="w-4 h-4 text-blue-900" />
                      Complete Student Record & Profile Attributes
                    </h3>
                    {isEditing ? (
                      <button 
                        onClick={handleSaveEdits}
                        className="px-4 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-xl flex items-center gap-1 shadow"
                      >
                        <Save className="w-4 h-4" /> Save All Edits
                      </button>
                    ) : (
                      <button 
                        onClick={() => setIsEditing(true)}
                        className="px-4 py-1.5 bg-blue-900 hover:bg-blue-800 text-white text-xs font-bold rounded-xl flex items-center gap-1 shadow"
                      >
                        <Edit3 className="w-4 h-4" /> Edit Profile Attributes
                      </button>
                    )}
                  </div>

                  {/* Profile Photo Display / Edit */}
                  <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200 flex flex-col sm:flex-row items-center gap-4">
                    {editForm.profile_image_url || selectedStudent.profile_image_url ? (
                      <img 
                        src={editForm.profile_image_url || selectedStudent.profile_image_url} 
                        alt="" 
                        className="w-20 h-20 rounded-2xl object-cover border-2 border-amber-400 shadow" 
                      />
                    ) : (
                      <div className="w-20 h-20 rounded-2xl bg-amber-400 text-slate-900 flex items-center justify-center font-black text-3xl shadow">
                        {selectedStudent.full_name.charAt(0)}
                      </div>
                    )}

                    <div className="flex-1 w-full text-xs space-y-2">
                      <span className="block font-bold text-slate-700">Student Profile Picture</span>
                      <div className="flex items-center gap-2 flex-wrap">
                        <label className="px-3.5 py-2 bg-blue-900 hover:bg-blue-800 text-white font-bold rounded-xl text-xs cursor-pointer shadow flex items-center gap-1.5 transition-all">
                          <Upload className="w-4 h-4 text-amber-400" />
                          <span>Upload Photo File</span>
                          <input 
                            type="file" 
                            accept="image/*" 
                            onChange={handleStudentPhotoUpload} 
                            className="hidden" 
                          />
                        </label>
                        {(editForm.profile_image_url || selectedStudent.profile_image_url) && (
                          <button
                            type="button"
                            onClick={() => {
                              setEditForm(prev => ({ ...prev, profile_image_url: '' }));
                              if (selectedStudent) {
                                const updated = { ...selectedStudent, profile_image_url: '' };
                                onUpdateStudent(updated);
                                setSelectedStudent(updated);
                              }
                            }}
                            className="px-3 py-2 bg-red-100 hover:bg-red-200 text-red-700 font-bold rounded-xl text-xs transition-all"
                          >
                            Remove Photo
                          </button>
                        )}
                      </div>
                      <p className="text-[11px] text-slate-500 font-medium">
                        {(editForm.profile_image_url || selectedStudent.profile_image_url) ? '✓ Verified profile image uploaded' : 'Select a JPG or PNG image file to set student photo'}
                      </p>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 text-xs">
                    <div className="bg-slate-50 p-3 rounded-xl border">
                      <span className="block font-bold text-slate-500 uppercase mb-1">Student Name</span>
                      {isEditing ? (
                        <input 
                          type="text" 
                          value={editForm.full_name || ''} 
                          onChange={e => setEditForm({ ...editForm, full_name: e.target.value })}
                          className="w-full px-2 py-1 border rounded bg-white"
                        />
                      ) : (
                        <span className="font-bold text-slate-900 text-sm">{selectedStudent.full_name}</span>
                      )}
                    </div>

                    <div className="bg-slate-50 p-3 rounded-xl border">
                      <span className="block font-bold text-slate-500 uppercase mb-1">Roll Number</span>
                      {isEditing ? (
                        <input 
                          type="text" 
                          value={editForm.roll_no || ''} 
                          onChange={e => setEditForm({ ...editForm, roll_no: e.target.value })}
                          className="w-full px-2 py-1 border rounded bg-white font-mono"
                        />
                      ) : (
                        <span className="font-bold text-blue-900 text-sm font-mono">{selectedStudent.roll_no}</span>
                      )}
                    </div>

                    <div className="bg-slate-50 p-3 rounded-xl border">
                      <span className="block font-bold text-slate-500 uppercase mb-1">Class Assigned</span>
                      {isEditing ? (
                        <input 
                          type="text" 
                          value={editForm.class_name || ''} 
                          onChange={e => setEditForm({ ...editForm, class_name: e.target.value })}
                          className="w-full px-2 py-1 border rounded bg-white"
                        />
                      ) : (
                        <span className="font-bold text-slate-900 text-sm">Class {selectedStudent.class_name}</span>
                      )}
                    </div>

                    <div className="bg-slate-50 p-3 rounded-xl border">
                      <span className="block font-bold text-slate-500 uppercase mb-1">Date of Birth</span>
                      {isEditing ? (
                        <input 
                          type="date" 
                          value={editForm.dob || ''} 
                          onChange={e => setEditForm({ ...editForm, dob: e.target.value })}
                          className="w-full px-2 py-1 border rounded bg-white"
                        />
                      ) : (
                        <span className="font-bold text-slate-900">{selectedStudent.dob}</span>
                      )}
                    </div>

                    <div className="bg-slate-50 p-3 rounded-xl border">
                      <span className="block font-bold text-slate-500 uppercase mb-1">Gender / Blood Group</span>
                      {isEditing ? (
                        <div className="flex gap-2">
                          <input 
                            type="text" 
                            value={editForm.gender || ''} 
                            onChange={e => setEditForm({ ...editForm, gender: e.target.value })}
                            className="w-1/2 px-2 py-1 border rounded bg-white"
                          />
                          <input 
                            type="text" 
                            value={editForm.blood_group || ''} 
                            onChange={e => setEditForm({ ...editForm, blood_group: e.target.value })}
                            className="w-1/2 px-2 py-1 border rounded bg-white"
                          />
                        </div>
                      ) : (
                        <span className="font-bold text-slate-900">{selectedStudent.gender} | {selectedStudent.blood_group || 'O+'}</span>
                      )}
                    </div>

                    <div className="bg-slate-50 p-3 rounded-xl border">
                      <span className="block font-bold text-slate-500 uppercase mb-1">B-Form Number</span>
                      {isEditing ? (
                        <input 
                          type="text" 
                          value={editForm.b_form_no || ''} 
                          onChange={e => setEditForm({ ...editForm, b_form_no: e.target.value })}
                          className="w-full px-2 py-1 border rounded bg-white"
                        />
                      ) : (
                        <span className="font-bold text-slate-900">{selectedStudent.b_form_no}</span>
                      )}
                    </div>
                  </div>

                  {/* Parents & Guardians Section */}
                  <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200 space-y-3">
                    <h4 className="text-xs font-black text-slate-800 uppercase border-b pb-2">Parents & Guardian Information</h4>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 text-xs">
                      <div>
                        <span className="block text-slate-500 font-bold">Father Name</span>
                        {isEditing ? (
                          <input 
                            type="text" 
                            value={editForm.father_name || ''} 
                            onChange={e => setEditForm({ ...editForm, father_name: e.target.value })}
                            className="w-full px-2 py-1 border rounded bg-white mt-1"
                          />
                        ) : (
                          <span className="font-bold text-slate-900">{selectedStudent.father_name}</span>
                        )}
                      </div>

                      <div>
                        <span className="block text-slate-500 font-bold">Father CNIC</span>
                        {isEditing ? (
                          <input 
                            type="text" 
                            value={editForm.father_cnic || ''} 
                            onChange={e => setEditForm({ ...editForm, father_cnic: e.target.value })}
                            className="w-full px-2 py-1 border rounded bg-white mt-1"
                          />
                        ) : (
                          <span className="font-bold text-slate-900">{selectedStudent.father_cnic}</span>
                        )}
                      </div>

                      <div>
                        <span className="block text-slate-500 font-bold">Mother Name</span>
                        {isEditing ? (
                          <input 
                            type="text" 
                            value={editForm.mother_name || ''} 
                            onChange={e => setEditForm({ ...editForm, mother_name: e.target.value })}
                            className="w-full px-2 py-1 border rounded bg-white mt-1"
                          />
                        ) : (
                          <span className="font-bold text-slate-900">{selectedStudent.mother_name || 'N/A'}</span>
                        )}
                      </div>

                      <div>
                        <span className="block text-slate-500 font-bold">Parent Phone</span>
                        {isEditing ? (
                          <input 
                            type="text" 
                            value={editForm.parent_phone || ''} 
                            onChange={e => setEditForm({ ...editForm, parent_phone: e.target.value })}
                            className="w-full px-2 py-1 border rounded bg-white mt-1"
                          />
                        ) : (
                          <span className="font-bold text-slate-900">{selectedStudent.parent_phone}</span>
                        )}
                      </div>

                      <div>
                        <span className="block text-slate-500 font-bold">Emergency Contact Phone</span>
                        {isEditing ? (
                          <input 
                            type="text" 
                            value={editForm.emergency_phone || ''} 
                            onChange={e => setEditForm({ ...editForm, emergency_phone: e.target.value })}
                            className="w-full px-2 py-1 border rounded bg-white mt-1"
                          />
                        ) : (
                          <span className="font-bold text-slate-900">{selectedStudent.emergency_phone || selectedStudent.parent_phone}</span>
                        )}
                      </div>

                      <div>
                        <span className="block text-slate-500 font-bold">Mailing / Home Address</span>
                        {isEditing ? (
                          <input 
                            type="text" 
                            value={editForm.mailing_address || ''} 
                            onChange={e => setEditForm({ ...editForm, mailing_address: e.target.value })}
                            className="w-full px-2 py-1 border rounded bg-white mt-1"
                          />
                        ) : (
                          <span className="font-bold text-slate-900">{selectedStudent.mailing_address || 'Lahore Campus'}</span>
                        )}
                      </div>

                      <div>
                        <span className="block text-slate-500 font-bold">Guardian Name & Relation</span>
                        {isEditing ? (
                          <div className="flex gap-1 mt-1">
                            <input 
                              type="text" 
                              value={editForm.guardian_name || ''} 
                              onChange={e => setEditForm({ ...editForm, guardian_name: e.target.value })}
                              className="w-2/3 px-2 py-1 border rounded bg-white"
                              placeholder="Guardian Name"
                            />
                            <input 
                              type="text" 
                              value={editForm.guardian_relation || ''} 
                              onChange={e => setEditForm({ ...editForm, guardian_relation: e.target.value })}
                              className="w-1/3 px-2 py-1 border rounded bg-white"
                              placeholder="Relation"
                            />
                          </div>
                        ) : (
                          <span className="font-bold text-slate-900">{selectedStudent.guardian_name} ({selectedStudent.guardian_relation || 'Guardian'})</span>
                        )}
                      </div>

                      <div>
                        <span className="block text-slate-500 font-bold">Guardian CNIC & Phone</span>
                        {isEditing ? (
                          <div className="flex gap-1 mt-1">
                            <input 
                              type="text" 
                              value={editForm.guardian_cnic || ''} 
                              onChange={e => setEditForm({ ...editForm, guardian_cnic: e.target.value })}
                              className="w-1/2 px-2 py-1 border rounded bg-white"
                              placeholder="CNIC"
                            />
                            <input 
                              type="text" 
                              value={editForm.guardian_phone || ''} 
                              onChange={e => setEditForm({ ...editForm, guardian_phone: e.target.value })}
                              className="w-1/2 px-2 py-1 border rounded bg-white"
                              placeholder="Phone"
                            />
                          </div>
                        ) : (
                          <span className="font-bold text-slate-900">{selectedStudent.guardian_cnic || 'N/A'} | {selectedStudent.guardian_phone || selectedStudent.parent_phone}</span>
                        )}
                      </div>

                      <div>
                        <span className="block text-slate-500 font-bold">Guardian Profession & Income</span>
                        {isEditing ? (
                          <div className="flex gap-1 mt-1">
                            <input 
                              type="text" 
                              value={editForm.guardian_profession || ''} 
                              onChange={e => setEditForm({ ...editForm, guardian_profession: e.target.value })}
                              className="w-1/2 px-2 py-1 border rounded bg-white"
                              placeholder="Profession"
                            />
                            <input 
                              type="text" 
                              value={editForm.guardian_income_source || ''} 
                              onChange={e => setEditForm({ ...editForm, guardian_income_source: e.target.value })}
                              className="w-1/2 px-2 py-1 border rounded bg-white"
                              placeholder="Income Source"
                            />
                          </div>
                        ) : (
                          <span className="font-bold text-slate-900">{selectedStudent.guardian_profession || 'N/A'} ({selectedStudent.guardian_income_source || 'N/A'})</span>
                        )}
                      </div>

                      <div>
                        <span className="block text-slate-500 font-bold">Guardian Target Email</span>
                        {isEditing ? (
                          <input 
                            type="email" 
                            value={editForm.guardian_email || ''} 
                            onChange={e => setEditForm({ ...editForm, guardian_email: e.target.value })}
                            className="w-full px-2 py-1 border rounded bg-white mt-1 font-bold text-blue-900"
                          />
                        ) : (
                          <span className="font-bold text-blue-900">{selectedStudent.guardian_email}</span>
                        )}
                      </div>

                      <div>
                        <span className="block text-slate-500 font-bold">Enrollment Date & Graduation NOC</span>
                        {isEditing ? (
                          <div className="flex gap-1 mt-1">
                            <input 
                              type="date" 
                              value={editForm.enrollment_date || ''} 
                              onChange={e => setEditForm({ ...editForm, enrollment_date: e.target.value })}
                              className="w-1/2 px-2 py-1 border rounded bg-white"
                            />
                            <select
                              value={editForm.noc_status || 'Pending'}
                              onChange={e => setEditForm({ ...editForm, noc_status: e.target.value as any })}
                              className="w-1/2 px-2 py-1 border rounded bg-white font-bold"
                            >
                              <option value="Pending">NOC: Pending</option>
                              <option value="Cleared">NOC: Cleared</option>
                            </select>
                          </div>
                        ) : (
                          <span className="font-bold text-slate-900">{selectedStudent.enrollment_date} | NOC: {selectedStudent.noc_status || 'Pending'}</span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Fee & Concession Structure */}
                  <div className="p-4 bg-blue-50/60 rounded-2xl border border-blue-200 space-y-3">
                    <h4 className="text-xs font-black text-blue-900 uppercase border-b border-blue-200 pb-2">Fee, Scholarship & Installment Term Plan</h4>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 text-xs">
                      <div>
                        <span className="block text-slate-500 font-bold">Monthly Tuition Fee</span>
                        {isEditing ? (
                          <input 
                            type="number" 
                            value={editForm.standard_tuition_fee || 0} 
                            onChange={e => setEditForm({ ...editForm, standard_tuition_fee: Number(e.target.value) })}
                            className="w-full px-2 py-1 border rounded bg-white mt-1"
                          />
                        ) : (
                          <span className="font-bold text-slate-900">PKR {(selectedStudent.standard_tuition_fee || 3000).toLocaleString()}</span>
                        )}
                      </div>

                      <div>
                        <span className="block text-slate-500 font-bold">Scholarship / Discount</span>
                        {isEditing ? (
                          <input 
                            type="number" 
                            value={editForm.discount_amount || 0} 
                            onChange={e => setEditForm({ ...editForm, discount_amount: Number(e.target.value) })}
                            className="w-full px-2 py-1 border rounded bg-white mt-1"
                          />
                        ) : (
                          <span className="font-bold text-slate-900">PKR {(selectedStudent.discount_amount || 0).toLocaleString()}</span>
                        )}
                      </div>

                      <div>
                        <span className="block text-slate-500 font-bold">Concession Reason</span>
                        {isEditing ? (
                          <input 
                            type="text" 
                            value={editForm.discount_reason || ''} 
                            onChange={e => setEditForm({ ...editForm, discount_reason: e.target.value })}
                            className="w-full px-2 py-1 border rounded bg-white mt-1"
                          />
                        ) : (
                          <span className="font-bold text-slate-900">{selectedStudent.discount_reason || 'Standard'}</span>
                        )}
                      </div>

                      <div>
                        <span className="block text-slate-500 font-bold">Payment Agreement Plan</span>
                        {isEditing ? (
                          <select
                            value={editForm.payment_plan || 'Full'}
                            onChange={e => setEditForm({ ...editForm, payment_plan: e.target.value as any })}
                            className="w-full px-2 py-1 border rounded bg-white mt-1 font-bold text-blue-900"
                          >
                            <option value="Full">Full Payment</option>
                            <option value="Half">Half Fee Payment</option>
                            <option value="Installments_3">3-Installments Plan</option>
                            <option value="Custom">Custom Agreement</option>
                          </select>
                        ) : (
                          <span className="font-extrabold text-blue-900">{selectedStudent.payment_plan || 'Full Payment'}</span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Orphan Category & Sponsoring Donor Data Block */}
                  <div className="p-4 bg-amber-50 border border-amber-300 rounded-2xl space-y-3">
                    <div className="flex justify-between items-center border-b border-amber-200 pb-2">
                      <h4 className="text-xs font-black text-amber-900 uppercase flex items-center gap-1.5">
                        <HeartHandshake className="w-4 h-4 text-amber-600" />
                        Orphan Category, Sponsorship & Deceased Father Records
                      </h4>
                      {isEditing && (
                        <label className="flex items-center gap-2 cursor-pointer bg-white px-3 py-1 rounded-lg border border-amber-300 text-xs font-bold text-amber-900 shadow-sm">
                          <input 
                            type="checkbox"
                            checked={!!editForm.is_orphan}
                            onChange={e => setEditForm({ ...editForm, is_orphan: e.target.checked })}
                            className="rounded text-amber-600 focus:ring-amber-500"
                          />
                          Orphan Category Student
                        </label>
                      )}
                    </div>

                    {(isEditing ? editForm.is_orphan : selectedStudent.is_orphan) ? (
                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 text-xs">
                        <div>
                          <span className="block text-slate-500 font-bold">Donor ID / Code</span>
                          {isEditing ? (
                            <input 
                              type="text" 
                              value={editForm.donor_id || ''} 
                              onChange={e => setEditForm({ ...editForm, donor_id: e.target.value })}
                              className="w-full px-2 py-1 border rounded bg-white mt-1 font-mono"
                            />
                          ) : (
                            <span className="font-bold text-slate-900 font-mono">{selectedStudent.donor_id || 'DONOR-2026'}</span>
                          )}
                        </div>

                        <div>
                          <span className="block text-slate-500 font-bold">Donor Name</span>
                          {isEditing ? (
                            <input 
                              type="text" 
                              value={editForm.donor_name || ''} 
                              onChange={e => setEditForm({ ...editForm, donor_name: e.target.value })}
                              className="w-full px-2 py-1 border rounded bg-white mt-1"
                            />
                          ) : (
                            <span className="font-bold text-slate-900">{selectedStudent.donor_name || 'N/A'}</span>
                          )}
                        </div>

                        <div>
                          <span className="block text-slate-500 font-bold">Donor Phone / Contact</span>
                          {isEditing ? (
                            <input 
                              type="text" 
                              value={editForm.donor_number || ''} 
                              onChange={e => setEditForm({ ...editForm, donor_number: e.target.value })}
                              className="w-full px-2 py-1 border rounded bg-white mt-1"
                            />
                          ) : (
                            <span className="font-bold text-slate-900">{selectedStudent.donor_number || 'N/A'}</span>
                          )}
                        </div>

                        <div>
                          <span className="block text-slate-500 font-bold">Donor Contact Email</span>
                          {isEditing ? (
                            <input 
                              type="email" 
                              value={editForm.donor_email || ''} 
                              onChange={e => setEditForm({ ...editForm, donor_email: e.target.value })}
                              className="w-full px-2 py-1 border rounded bg-white mt-1 font-bold text-blue-800"
                            />
                          ) : (
                            <span className="font-bold text-blue-800">{selectedStudent.donor_email || 'N/A'}</span>
                          )}
                        </div>

                        <div>
                          <span className="block text-slate-500 font-bold">Father's Profession Before Death</span>
                          {isEditing ? (
                            <input 
                              type="text" 
                              value={editForm.father_profession_before_death || ''} 
                              onChange={e => setEditForm({ ...editForm, father_profession_before_death: e.target.value })}
                              className="w-full px-2 py-1 border rounded bg-white mt-1"
                            />
                          ) : (
                            <span className="font-bold text-slate-900">{selectedStudent.father_profession_before_death || 'N/A'}</span>
                          )}
                        </div>

                        <div>
                          <span className="block text-slate-500 font-bold">How Death Occurred (Cause of Death)</span>
                          {isEditing ? (
                            <input 
                              type="text" 
                              value={editForm.cause_of_death || ''} 
                              onChange={e => setEditForm({ ...editForm, cause_of_death: e.target.value })}
                              className="w-full px-2 py-1 border rounded bg-white mt-1"
                            />
                          ) : (
                            <span className="font-bold text-slate-900">{selectedStudent.cause_of_death || 'N/A'}</span>
                          )}
                        </div>
                      </div>
                    ) : (
                      <p className="text-xs text-amber-800 italic">
                        This student is currently classified under the Standard / Regular fee category. {isEditing && 'Toggle "Orphan Category Student" above to configure donor sponsorship & deceased father details.'}
                      </p>
                    )}
                  </div>

                  <DynamicFieldSection
                    target="student"
                    customFields={customFields}
                    onAddCustomField={onAddCustomField}
                    onUpdateCustomField={onUpdateCustomField}
                    onDeleteCustomField={onDeleteCustomField}
                    onReorderCustomFields={onReorderCustomFields}
                    values={isEditing ? (editForm.custom_fields || {}) : (selectedStudent.custom_fields || {})}
                    onValuesChange={vals => setEditForm({ ...editForm, custom_fields: vals })}
                    readOnlyValues={!isEditing}
                    sectionTitle="Custom Fields"
                    onNotify={msg => {
                      setToastMsg(msg);
                      setTimeout(() => setToastMsg(null), 3000);
                    }}
                  />
                </div>
              )}

              {/* TAB 2: DOCUMENT GALLERY — all standard, custom field & gallery uploads */}
              {drawerTab === 'docs' && selectedStudent && (
                <DocumentGallery
                  entityType="student"
                  entity={selectedStudent}
                  customFields={customFields}
                  onUpdateEntity={patch => {
                    const base = students.find(s => s.id === selectedStudent.id) || selectedStudent;
                    const next = { ...base, ...patch } as Student;
                    onUpdateStudent(next);
                    setSelectedStudent(next);
                  }}
                  onPreview={(title, url) => setDocPreviewModal({ title, url })}
                  onNotify={msg => {
                    setToastMsg(msg);
                    setTimeout(() => setToastMsg(null), 3000);
                  }}
                />
              )}

              {/* TAB 3: INTERACTIVE ATTENDANCE TERMINAL WITH RANGE FILTERS */}
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
                              setToastMsg('Attendance data refreshed from server.');
                            } else {
                              setToastMsg('Attendance synchronization refreshed successfully.');
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
                            exportSingleStudentAttendanceToExcel(selectedStudent, filteredStudentAttendanceLogs, presetLabel);
                            setToastMsg(`Downloaded attendance report for ${selectedStudent.full_name} (${presetLabel})`);
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
                        {filteredStudentAttendanceLogs.length > 0 ? (
                          filteredStudentAttendanceLogs.map(a => (
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
                              No attendance records logged for this student in the selected date range.
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* TAB 4: EVALUATION TREE WITH FILTER, CRUD & FULL PDF PREVIEW CONTROLLERS */}
              {drawerTab === 'exams' && (
                <div className="space-y-6">
                  {/* Top Bar with Title, Email Target & Action Buttons */}
                  <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-3 border-b pb-3">
                    <div>
                      <h3 className="text-sm font-black text-slate-900 uppercase tracking-wider flex items-center gap-2">
                        <FolderTree className="w-4 h-4 text-blue-900" />
                        Student Test & Examination Folder Hierarchy
                      </h3>
                      <p className="text-xs text-slate-500">
                        Target Email: {selectedStudent.is_orphan ? `DONOR (${selectedStudent.donor_email})` : `GUARDIAN (${selectedStudent.guardian_email})`}
                      </p>
                    </div>

                    <div className="flex items-center gap-2 flex-wrap">
                      <button
                        onClick={() => setIsAddExamModalOpen(true)}
                        className="px-3 py-2 bg-emerald-700 hover:bg-emerald-800 text-white font-extrabold text-xs rounded-xl shadow flex items-center gap-1.5 transition-all"
                      >
                        <Plus className="w-3.5 h-3.5" />
                        Add Result
                      </button>

                      <button
                        disabled={isDispatching}
                        onClick={() => handleSendProgressReport(selectedStudent, '1st Term Examination 2026', 'Session 2026')}
                        className="px-3 py-2 bg-blue-900 hover:bg-blue-800 text-white font-extrabold text-xs rounded-xl shadow flex items-center gap-1.5 transition-all"
                      >
                        <Send className="w-3.5 h-3.5 text-amber-400" />
                        Dispatch All Results Email
                      </button>
                    </div>
                  </div>

                  {/* Filter Bar */}
                  <div className="p-3 bg-slate-100/80 border border-slate-200 rounded-2xl space-y-3">
                    <div className="flex items-center gap-2 text-xs font-bold text-slate-700">
                      <Filter className="w-3.5 h-3.5 text-blue-900" />
                      <span>Filter Student Evaluations</span>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2 text-xs">
                      {/* Search */}
                      <div className="relative">
                        <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2.5" />
                        <input
                          type="text"
                          placeholder="Search exam, subject, path..."
                          value={evalSearchTerm}
                          onChange={e => setEvalSearchTerm(e.target.value)}
                          className="w-full pl-8 pr-2 py-1.5 border rounded-xl bg-white text-slate-800 font-medium focus:ring-2 focus:ring-blue-800"
                        />
                      </div>

                      {/* Session Filter */}
                      <div>
                        <select
                          value={evalSessionFilter}
                          onChange={e => setEvalSessionFilter(e.target.value)}
                          className="w-full px-2.5 py-1.5 border rounded-xl bg-white font-semibold text-slate-800"
                        >
                          <option value="ALL">All Sessions</option>
                          <option value="Session 2026">Session 2026</option>
                          <option value="Session 2025">Session 2025</option>
                        </select>
                      </div>

                      {/* Category Filter */}
                      <div>
                        <select
                          value={evalCategoryFilter}
                          onChange={e => setEvalCategoryFilter(e.target.value)}
                          className="w-full px-2.5 py-1.5 border rounded-xl bg-white font-semibold text-slate-800"
                        >
                          <option value="ALL">All Categories</option>
                          <option value="Weekly Test">Weekly Tests</option>
                          <option value="Monthly Test">Monthly Tests</option>
                          <option value="Term Exam">Term Examinations</option>
                        </select>
                      </div>

                      {/* Grade Filter */}
                      <div>
                        <select
                          value={evalGradeFilter}
                          onChange={e => setEvalGradeFilter(e.target.value)}
                          className="w-full px-2.5 py-1.5 border rounded-xl bg-white font-semibold text-slate-800"
                        >
                          <option value="ALL">All Grades / Status</option>
                          <option value="Pass">Pass Status</option>
                          <option value="Fail">Fail Status</option>
                          <option value="A+">Grade A+</option>
                          <option value="A">Grade A</option>
                          <option value="B">Grade B</option>
                          <option value="C">Grade C</option>
                        </select>
                      </div>
                    </div>
                  </div>

                  {/* Student Specific Filtered Results */}
                  {(() => {
                    // Base student results
                    const allStudentResults = examResults.filter(
                      r => r.student_id === selectedStudent.id || r.student_roll === selectedStudent.roll_no
                    );

                    // Apply filters
                    const filteredResults = allStudentResults.filter(r => {
                      const matchesSearch = !evalSearchTerm || 
                        r.exam_name.toLowerCase().includes(evalSearchTerm.toLowerCase()) ||
                        r.subject_name.toLowerCase().includes(evalSearchTerm.toLowerCase()) ||
                        (r.storage_path && r.storage_path.toLowerCase().includes(evalSearchTerm.toLowerCase())) ||
                        (r.week_number && r.week_number.toLowerCase().includes(evalSearchTerm.toLowerCase())) ||
                        (r.month_name && r.month_name.toLowerCase().includes(evalSearchTerm.toLowerCase()));

                      const matchesSession = evalSessionFilter === 'ALL' || (r.session_name || 'Session 2026') === evalSessionFilter;

                      const matchesCategory = evalCategoryFilter === 'ALL' ||
                        (evalCategoryFilter === 'Weekly Test' && (r.evaluation_type === 'Weekly' || r.evaluation_type === 'Weekly Test' || r.exam_name.toLowerCase().includes('weekly'))) ||
                        (evalCategoryFilter === 'Monthly Test' && (r.evaluation_type === 'Monthly' || r.evaluation_type === 'Monthly Test' || r.exam_name.toLowerCase().includes('monthly'))) ||
                        (evalCategoryFilter === 'Term Exam' && (r.evaluation_type === 'Term' || r.evaluation_type === 'Term Exam' || (!r.exam_name.toLowerCase().includes('weekly') && !r.exam_name.toLowerCase().includes('monthly'))));

                      const matchesGrade = evalGradeFilter === 'ALL' ||
                        (evalGradeFilter === 'Pass' && r.status === 'Pass') ||
                        (evalGradeFilter === 'Fail' && r.status === 'Fail') ||
                        r.grade === evalGradeFilter;

                      return matchesSearch && matchesSession && matchesCategory && matchesGrade;
                    });

                    const weeklyResults = filteredResults.filter(r => r.evaluation_type === 'Weekly' || r.evaluation_type === 'Weekly Test' || r.exam_name.toLowerCase().includes('weekly'));
                    const monthlyResults = filteredResults.filter(r => r.evaluation_type === 'Monthly' || r.evaluation_type === 'Monthly Test' || r.exam_name.toLowerCase().includes('monthly'));
                    const termResults = filteredResults.filter(r => 
                      r.evaluation_type === 'Term' || r.evaluation_type === 'Term Exam' ||
                      (!r.evaluation_type && !r.exam_name.toLowerCase().includes('weekly') && !r.exam_name.toLowerCase().includes('monthly'))
                    );

                    return (
                      <div className="space-y-6">
                        {/* Summary Counter & Bulk Delete */}
                        <div className="flex justify-between items-center text-xs px-1 font-bold">
                          <span className="text-slate-600">
                            Showing <strong className="text-blue-900">{filteredResults.length}</strong> of {allStudentResults.length} evaluation results
                          </span>

                          {filteredResults.length > 0 && onDeleteExamResult && (
                            <button
                              onClick={() => {
                                if (confirm(`Delete ALL ${filteredResults.length} filtered evaluation results for ${selectedStudent.full_name}?`)) {
                                  filteredResults.forEach(r => onDeleteExamResult(r.id));
                                  setToastMsg(`Deleted ${filteredResults.length} evaluation results.`);
                                  setTimeout(() => setToastMsg(null), 3000);
                                }
                              }}
                              className="text-red-700 hover:text-red-900 underline flex items-center gap-1 font-bold"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                              Delete All Filtered ({filteredResults.length})
                            </button>
                          )}
                        </div>

                        {/* 1. WEEKLY TESTS FOLDER */}
                        <div className="border border-amber-300 rounded-2xl overflow-hidden bg-amber-50/40 shadow-sm">
                          <div className="bg-amber-900 text-white p-3 font-bold text-xs flex justify-between items-center">
                            <span className="flex items-center gap-2 uppercase tracking-wide">
                              <FolderTree className="w-4 h-4 text-amber-300" />
                              📁 Weekly Tests Archive (Month & Week Folders)
                            </span>
                            <span className="bg-amber-800 px-2 py-0.5 rounded text-[11px] font-mono">
                              {weeklyResults.length} Tests Logged
                            </span>
                          </div>

                          <div className="p-4 space-y-3">
                            {weeklyResults.length > 0 ? (
                              weeklyResults.map(res => (
                                <div key={res.id} className="p-3 bg-white border border-amber-200 rounded-xl flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 shadow-sm hover:border-amber-400 transition-all">
                                  <div>
                                    <div className="flex items-center gap-2 flex-wrap">
                                      <span className="font-extrabold text-xs text-slate-900">{res.exam_name}</span>
                                      <span className="px-2 py-0.5 rounded bg-amber-100 text-amber-900 text-[10px] font-bold">
                                        {res.month_name || 'August'} - {res.week_number || 'Week 1'}
                                      </span>
                                      <span className="px-2 py-0.5 rounded bg-slate-100 text-slate-700 text-[10px] font-mono">
                                        {res.session_name || 'Session 2026'}
                                      </span>
                                    </div>
                                    <div className="text-[11px] text-slate-500 mt-1">
                                      Subject: <strong className="text-slate-800">{res.subject_name}</strong> | Score: <strong className="text-blue-900">{res.marks_obtained} / {res.total_marks}</strong> ({res.percentage}%) | Grade: <strong className="text-emerald-700">{res.grade}</strong>
                                    </div>
                                  </div>

                                  <div className="flex items-center gap-1.5 w-full sm:w-auto justify-end flex-wrap">
                                    <button
                                      onClick={() => setPreviewExamResult(res)}
                                      className="px-2.5 py-1 bg-blue-100 hover:bg-blue-200 text-blue-900 font-bold text-xs rounded-lg flex items-center gap-1"
                                      title="Preview Result PDF"
                                    >
                                      <Eye className="w-3.5 h-3.5" />
                                      Preview
                                    </button>
                                    <button
                                      onClick={() => setEditingExamResult(res)}
                                      className="px-2.5 py-1 bg-amber-100 hover:bg-amber-200 text-amber-900 font-bold text-xs rounded-lg flex items-center gap-1"
                                      title="Edit Result Data"
                                    >
                                      <Edit3 className="w-3.5 h-3.5" />
                                      Edit
                                    </button>
                                    <button
                                      onClick={() => handleSendProgressReport(selectedStudent, res.exam_name, res.subject_name)}
                                      className="px-2.5 py-1 bg-amber-500 hover:bg-amber-600 text-slate-900 font-bold text-xs rounded-lg flex items-center gap-1"
                                    >
                                      <Mail className="w-3.5 h-3.5" />
                                      Send/Email
                                    </button>
                                    {onDeleteExamResult && (
                                      <button
                                        onClick={() => {
                                          if (confirm(`Are you sure you want to delete result for ${res.exam_name}?`)) {
                                            onDeleteExamResult(res.id);
                                            setToastMsg(`Exam result deleted successfully.`);
                                            setTimeout(() => setToastMsg(null), 3000);
                                          }
                                        }}
                                        className="px-2 py-1 bg-red-100 hover:bg-red-200 text-red-800 font-bold text-xs rounded-lg flex items-center gap-1"
                                      >
                                        <Trash2 className="w-3.5 h-3.5" />
                                      </button>
                                    )}
                                  </div>
                                </div>
                              ))
                            ) : (
                              <p className="text-xs text-slate-500 italic p-2">No weekly tests matching current filter.</p>
                            )}
                          </div>
                        </div>

                        {/* 2. MONTHLY TESTS FOLDER */}
                        <div className="border border-blue-300 rounded-2xl overflow-hidden bg-blue-50/40 shadow-sm">
                          <div className="bg-blue-900 text-white p-3 font-bold text-xs flex justify-between items-center">
                            <span className="flex items-center gap-2 uppercase tracking-wide">
                              <FolderTree className="w-4 h-4 text-blue-300" />
                              📁 Monthly Tests Archive (By Month Name)
                            </span>
                            <span className="bg-blue-800 px-2 py-0.5 rounded text-[11px] font-mono">
                              {monthlyResults.length} Tests Logged
                            </span>
                          </div>

                          <div className="p-4 space-y-3">
                            {monthlyResults.length > 0 ? (
                              monthlyResults.map(res => (
                                <div key={res.id} className="p-3 bg-white border border-blue-200 rounded-xl flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 shadow-sm hover:border-blue-400 transition-all">
                                  <div>
                                    <div className="flex items-center gap-2 flex-wrap">
                                      <span className="font-extrabold text-xs text-slate-900">{res.exam_name}</span>
                                      <span className="px-2 py-0.5 rounded bg-blue-100 text-blue-900 text-[10px] font-bold">
                                        Month: {res.month_name || 'August'}
                                      </span>
                                      <span className="px-2 py-0.5 rounded bg-slate-100 text-slate-700 text-[10px] font-mono">
                                        {res.session_name || 'Session 2026'}
                                      </span>
                                    </div>
                                    <div className="text-[11px] text-slate-500 mt-1">
                                      Subject: <strong className="text-slate-800">{res.subject_name}</strong> | Score: <strong className="text-blue-900">{res.marks_obtained} / {res.total_marks}</strong> ({res.percentage}%) | Grade: <strong className="text-emerald-700">{res.grade}</strong>
                                    </div>
                                  </div>

                                  <div className="flex items-center gap-1.5 w-full sm:w-auto justify-end flex-wrap">
                                    <button
                                      onClick={() => setPreviewExamResult(res)}
                                      className="px-2.5 py-1 bg-blue-100 hover:bg-blue-200 text-blue-900 font-bold text-xs rounded-lg flex items-center gap-1"
                                    >
                                      <Eye className="w-3.5 h-3.5" />
                                      Preview
                                    </button>
                                    <button
                                      onClick={() => setEditingExamResult(res)}
                                      className="px-2.5 py-1 bg-amber-100 hover:bg-amber-200 text-amber-900 font-bold text-xs rounded-lg flex items-center gap-1"
                                    >
                                      <Edit3 className="w-3.5 h-3.5" />
                                      Edit
                                    </button>
                                    <button
                                      onClick={() => handleSendProgressReport(selectedStudent, res.exam_name, res.subject_name)}
                                      className="px-2.5 py-1 bg-amber-500 hover:bg-amber-600 text-slate-900 font-bold text-xs rounded-lg flex items-center gap-1"
                                    >
                                      <Mail className="w-3.5 h-3.5" />
                                      Send/Email
                                    </button>
                                    {onDeleteExamResult && (
                                      <button
                                        onClick={() => {
                                          if (confirm(`Are you sure you want to delete result for ${res.exam_name}?`)) {
                                            onDeleteExamResult(res.id);
                                            setToastMsg(`Exam result deleted successfully.`);
                                            setTimeout(() => setToastMsg(null), 3000);
                                          }
                                        }}
                                        className="px-2 py-1 bg-red-100 hover:bg-red-200 text-red-800 font-bold text-xs rounded-lg flex items-center gap-1"
                                      >
                                        <Trash2 className="w-3.5 h-3.5" />
                                      </button>
                                    )}
                                  </div>
                                </div>
                              ))
                            ) : (
                              <p className="text-xs text-slate-500 italic p-2">No monthly tests matching current filter.</p>
                            )}
                          </div>
                        </div>

                        {/* 3. TERM EXAMINATIONS FOLDER */}
                        <div className="border border-slate-300 rounded-2xl overflow-hidden bg-slate-50 shadow-sm">
                          <div className="bg-slate-900 text-white p-3 font-bold text-xs flex justify-between items-center">
                            <span className="flex items-center gap-2 uppercase tracking-wide">
                              <FolderTree className="w-4 h-4 text-emerald-400" />
                              📁 Term Examinations Folder
                            </span>
                            <span className="bg-slate-800 px-2 py-0.5 rounded text-[11px] font-mono text-emerald-400">
                              {termResults.length} Terms Recorded
                            </span>
                          </div>

                          <div className="p-4 space-y-3">
                            {termResults.length > 0 ? (
                              termResults.map(res => (
                                <div key={res.id} className="p-3 bg-white border border-slate-200 rounded-xl flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 shadow-sm hover:border-slate-400 transition-all">
                                  <div>
                                    <div className="flex items-center gap-2 flex-wrap">
                                      <span className="block font-extrabold text-xs text-slate-900">{res.exam_name}</span>
                                      <span className="px-2 py-0.5 rounded bg-emerald-100 text-emerald-900 text-[10px] font-bold">
                                        Term Exam
                                      </span>
                                      <span className="px-2 py-0.5 rounded bg-slate-100 text-slate-700 text-[10px] font-mono">
                                        {res.session_name || 'Session 2026'}
                                      </span>
                                    </div>
                                    <div className="text-[11px] text-slate-500 mt-1">
                                      Subject: <strong className="text-slate-800">{res.subject_name}</strong> | Score: <strong className="text-blue-900">{res.marks_obtained} / {res.total_marks}</strong> ({res.percentage}%) | Grade: <strong className="text-emerald-700">{res.grade}</strong>
                                    </div>
                                  </div>

                                  <div className="flex items-center gap-1.5 flex-wrap">
                                    <button
                                      onClick={() => setPreviewExamResult(res)}
                                      className="px-2.5 py-1 bg-blue-100 hover:bg-blue-200 text-blue-900 font-bold text-xs rounded-lg flex items-center gap-1"
                                    >
                                      <Eye className="w-3.5 h-3.5" />
                                      Preview
                                    </button>
                                    <button
                                      onClick={() => setEditingExamResult(res)}
                                      className="px-2.5 py-1 bg-amber-100 hover:bg-amber-200 text-amber-900 font-bold text-xs rounded-lg flex items-center gap-1"
                                    >
                                      <Edit3 className="w-3.5 h-3.5" />
                                      Edit
                                    </button>
                                    <button
                                      onClick={() => handleSendProgressReport(selectedStudent, res.exam_name, 'Session 2026')}
                                      className="px-2.5 py-1 bg-amber-500 hover:bg-amber-600 text-slate-900 font-bold text-xs rounded-lg flex items-center gap-1"
                                    >
                                      <Mail className="w-3.5 h-3.5" />
                                      Send/Email
                                    </button>
                                    {onDeleteExamResult && (
                                      <button
                                        onClick={() => {
                                          if (confirm(`Delete result for ${res.exam_name}?`)) {
                                            onDeleteExamResult(res.id);
                                            setToastMsg(`Exam result deleted.`);
                                            setTimeout(() => setToastMsg(null), 3000);
                                          }
                                        }}
                                        className="px-2 py-1 bg-red-100 hover:bg-red-200 text-red-800 font-bold text-xs rounded-lg flex items-center gap-1"
                                      >
                                        <Trash2 className="w-3.5 h-3.5" />
                                      </button>
                                    )}
                                  </div>
                                </div>
                              ))
                            ) : (
                              <p className="text-xs text-slate-500 italic p-2">No term examinations uploaded yet. Use Batch Results Parser to upload PDFs by roll number.</p>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })()}
                </div>
              )}

              {/* TAB 5: INLINE FEE MANAGEMENT TERMINAL */}
              {drawerTab === 'fees' && (
                <div className="space-y-4">
                  <h3 className="text-sm font-black text-slate-900 uppercase">
                    Inline Fee Management Ledger
                  </h3>
                  <div className="space-y-2">
                    {(() => {
                      const studentFees = dedupeFeeVouchers(
                        fees.filter(f => f.student_id === selectedStudent.id)
                      ).sort((a, b) => `${b.year}${b.month}`.localeCompare(`${a.year}${a.month}`));

                      return studentFees.length > 0 ? (
                        studentFees.map(f => (
                        <div key={f.id} className="p-4 bg-slate-50 border rounded-2xl flex justify-between items-center text-xs">
                          <div>
                            <span className="block font-bold text-slate-900 text-sm">{f.month} {f.year} Fee Voucher</span>
                            <span className="text-slate-500">Net Fee: PKR {(f.net_fee || 0).toLocaleString()} | Paid: PKR {(f.paid_amount || 0).toLocaleString()}</span>
                          </div>
                          <span className={`px-3 py-1 rounded-full font-bold uppercase ${
                            f.status === 'Paid' ? 'bg-emerald-100 text-emerald-800' :
                            f.status === 'Overdue' ? 'bg-red-100 text-red-800' : 'bg-amber-100 text-amber-800'
                          }`}>
                            {f.status}
                          </span>
                        </div>
                      ))
                      ) : (
                        <p className="text-xs text-slate-400 italic">No fee invoices recorded for this student.</p>
                      );
                    })()}
                  </div>
                </div>
              )}

              {/* TAB 6: INTEGRATED GRADUATION NOC CLEARANCE TAB */}
              {drawerTab === 'noc' && (
                <div className="space-y-6">
                  <div className="p-5 bg-emerald-50 border border-emerald-300 rounded-2xl space-y-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <CheckCircle2 className="w-8 h-8 text-emerald-600" />
                        <div>
                          <h4 className="text-base font-black text-emerald-900">Graduation NOC Clearance Audit</h4>
                          <p className="text-xs text-emerald-700">Verifying Fee Ledger Zero Dues & Legal Documents Verification</p>
                        </div>
                      </div>

                      <span className="px-3 py-1 rounded-full bg-emerald-600 text-white font-extrabold text-xs">
                        NOC Cleared
                      </span>
                    </div>

                    <p className="text-xs text-slate-700 leading-relaxed">
                      Student has completed all requirements. Click the button below to generate the official printable Graduation & Transfer Clearance Certificate PDF.
                    </p>

                    <button
                      onClick={() => handleIssueNOC(selectedStudent)}
                      className="px-6 py-2.5 bg-emerald-700 hover:bg-emerald-800 text-white font-extrabold text-xs rounded-xl shadow-lg flex items-center gap-2"
                    >
                      <Award className="w-4 h-4 text-amber-300" />
                      [Issue NOC & Clearance Certificate]
                    </button>
                  </div>
                </div>
              )}

            </div>
          </div>
        </div>
      )}

      {/* SHARE PROFILE MODAL FOR GUARDIANS AND DONORS */}
      {isShareModalOpen && selectedStudent && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-slate-900/80 backdrop-blur-sm animate-in fade-in">
          <div className="bg-white rounded-3xl max-w-lg w-full p-6 space-y-4 shadow-2xl border border-blue-200">
            <div className="flex justify-between items-center border-b pb-3">
              <div className="flex items-center gap-2">
                <Send className="w-5 h-5 text-blue-900" />
                <h3 className="text-base font-black text-slate-900">
                  Share Student Profile & Verified Records
                </h3>
              </div>
              <button onClick={() => setIsShareModalOpen(false)} className="text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-3 bg-blue-50 rounded-2xl border border-blue-200 text-xs text-blue-900 flex items-center gap-3">
              <Sparkles className="w-6 h-6 text-amber-500 shrink-0" />
              <div>
                <strong>Student:</strong> {selectedStudent.full_name} ({selectedStudent.roll_no})<br />
                <strong>Category:</strong> {selectedStudent.is_orphan ? 'Orphan / Sponsored' : 'Regular'}<br />
                <strong>Email attachments:</strong> Profile PDF
                {collectStudentDocuments(selectedStudent, customFields).length > 0 && (
                  <> + {collectStudentDocuments(selectedStudent, customFields).length} Document Gallery file(s)</>
                )}
              </div>
            </div>

            <div className="space-y-3 text-xs">
              <div>
                <label className="block font-bold text-slate-700 mb-1">Recipient Name</label>
                <input 
                  type="text" 
                  value={shareRecipientName}
                  onChange={e => setShareRecipientName(e.target.value)}
                  className="w-full px-3 py-2 border rounded-xl bg-slate-50 focus:ring-2 focus:ring-blue-800"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Recipient Email Address (Brevo Delivery Target)</label>
                <input 
                  type="email" 
                  value={shareRecipientEmail}
                  onChange={e => setShareRecipientEmail(e.target.value)}
                  className="w-full px-3 py-2 border rounded-xl bg-slate-50 font-bold text-blue-900 focus:ring-2 focus:ring-blue-800"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Custom Message / Notes</label>
                <textarea 
                  rows={3}
                  value={shareNote}
                  onChange={e => setShareNote(e.target.value)}
                  className="w-full px-3 py-2 border rounded-xl bg-slate-50 focus:ring-2 focus:ring-blue-800"
                />
              </div>
            </div>

            <div className="flex gap-2 pt-2">
              <button
                disabled={isDispatching}
                onClick={handleExecuteShare}
                className="flex-1 py-3 bg-blue-900 hover:bg-blue-800 text-white font-extrabold text-xs rounded-xl shadow-lg flex items-center justify-center gap-2"
              >
                <Send className="w-4 h-4 text-amber-400" />
                Dispatch Profile PDF + Gallery via Email
              </button>
              <button
                onClick={() => {
                  navigator.clipboard.writeText(`Student Profile: ${selectedStudent.full_name} (${selectedStudent.roll_no}) - Class ${selectedStudent.class_name}`);
                  setToastMsg('Profile summary copied to clipboard!');
                  setTimeout(() => setToastMsg(null), 3000);
                }}
                className="px-4 py-3 bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold text-xs rounded-xl"
              >
                Copy Text
              </button>
            </div>
          </div>
        </div>
      )}

      {/* EXAM RESULT CLEAN PDF PREVIEW MODAL */}
      {previewExamResult && (() => {
        const pdfUrl = getPdfDocUrl(previewExamResult);
        return (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-2 sm:p-4 bg-slate-950/85 backdrop-blur-md animate-in fade-in">
          <div className="bg-slate-900 text-white rounded-2xl sm:rounded-3xl max-w-5xl w-full h-[90vh] flex flex-col shadow-2xl border border-slate-800 overflow-hidden">
            
            {/* Header: Document Title + Action Controls */}
            <div className="bg-slate-900 text-white px-5 py-3 border-b border-slate-800 flex justify-between items-center shrink-0">
              <div className="flex items-center gap-2.5">
                <FileText className="w-5 h-5 text-amber-400" />
                <h3 className="font-extrabold text-sm sm:text-base text-white truncate max-w-md">
                  {previewExamResult.file_name || `${previewExamResult.student_roll || 'Result'}_${(previewExamResult.exam_name || 'Report').replace(/\s+/g, '_')}.pdf`}
                </h3>
              </div>

              <div className="flex items-center gap-2">
                {pdfUrl && (
                  <a
                    href={pdfUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold rounded-xl flex items-center gap-1.5 border border-slate-700 transition-all"
                  >
                    <ExternalLink className="w-3.5 h-3.5 text-blue-400" />
                    <span className="hidden sm:inline">Open New Tab</span>
                  </a>
                )}

                <button 
                  onClick={() => setPreviewExamResult(null)}
                  className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Body: PDF Viewer or missing-file message */}
            <div className="flex-1 bg-slate-950 p-2 sm:p-4 overflow-hidden flex flex-col items-center justify-center">
              {pdfUrl ? (
                <object
                  data={pdfUrl}
                  type="application/pdf"
                  className="w-full h-full rounded-xl"
                >
                  <iframe 
                    src={pdfUrl} 
                    title={previewExamResult.exam_name || 'PDF Document'}
                    className="w-full h-full border-none bg-white rounded-xl"
                  />
                </object>
              ) : (
                <div className="text-center p-8 space-y-3 text-slate-300">
                  <FileText className="w-12 h-12 text-amber-500 mx-auto" />
                  <p className="font-extrabold text-white text-base">No PDF File Attached</p>
                  <p className="text-xs text-slate-400">This result has no uploaded PDF. Re-upload via Batch Results Parser.</p>
                </div>
              )}
            </div>

          </div>
        </div>
        );
      })()}

      {/* EDIT EXAM RESULT MODAL */}
      {editingExamResult && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-slate-900/80 backdrop-blur-sm animate-in fade-in">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 space-y-4 shadow-2xl border border-slate-200">
            <div className="flex justify-between items-center border-b pb-3">
              <div className="flex items-center gap-2">
                <Edit3 className="w-5 h-5 text-amber-600" />
                <h3 className="text-base font-black text-slate-900">
                  Edit Evaluation Record
                </h3>
              </div>
              <button onClick={() => setEditingExamResult(null)} className="text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div>
                <label className="block font-bold text-slate-700 mb-1">Exam / Test Name</label>
                <input
                  type="text"
                  value={editingExamResult.exam_name}
                  onChange={e => setEditingExamResult({ ...editingExamResult, exam_name: e.target.value })}
                  className="w-full px-3 py-2 border rounded-xl bg-slate-50 font-bold text-slate-900"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Subject</label>
                  <input
                    type="text"
                    value={editingExamResult.subject_name}
                    onChange={e => setEditingExamResult({ ...editingExamResult, subject_name: e.target.value })}
                    className="w-full px-3 py-2 border rounded-xl bg-slate-50 font-semibold"
                  />
                </div>

                <div>
                  <label className="block font-bold text-slate-700 mb-1">Evaluation Type</label>
                  <select
                    value={editingExamResult.evaluation_type || 'Weekly Test'}
                    onChange={e => setEditingExamResult({ ...editingExamResult, evaluation_type: e.target.value })}
                    className="w-full px-3 py-2 border rounded-xl bg-slate-50 font-semibold"
                  >
                    <option value="Weekly Test">Weekly Test</option>
                    <option value="Monthly Test">Monthly Test</option>
                    <option value="Term Exam">Term Exam</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-2">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Marks Obtained</label>
                  <input
                    type="number"
                    value={editingExamResult.marks_obtained}
                    onChange={e => {
                      const obt = Number(e.target.value);
                      const tot = editingExamResult.total_marks || 100;
                      const pct = Math.round((obt / tot) * 100);
                      setEditingExamResult({
                        ...editingExamResult,
                        marks_obtained: obt,
                        percentage: pct,
                        status: pct >= 50 ? 'Pass' : 'Fail'
                      });
                    }}
                    className="w-full px-3 py-2 border rounded-xl bg-slate-50 font-extrabold text-blue-900"
                  />
                </div>

                <div>
                  <label className="block font-bold text-slate-700 mb-1">Total Marks</label>
                  <input
                    type="number"
                    value={editingExamResult.total_marks}
                    onChange={e => {
                      const tot = Number(e.target.value);
                      const obt = editingExamResult.marks_obtained || 0;
                      const pct = Math.round((obt / tot) * 100);
                      setEditingExamResult({
                        ...editingExamResult,
                        total_marks: tot,
                        percentage: pct,
                        status: pct >= 50 ? 'Pass' : 'Fail'
                      });
                    }}
                    className="w-full px-3 py-2 border rounded-xl bg-slate-50 font-bold"
                  />
                </div>

                <div>
                  <label className="block font-bold text-slate-700 mb-1">Grade</label>
                  <input
                    type="text"
                    value={editingExamResult.grade}
                    onChange={e => setEditingExamResult({ ...editingExamResult, grade: e.target.value })}
                    className="w-full px-3 py-2 border rounded-xl bg-slate-50 font-bold text-center text-emerald-700"
                  />
                </div>
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Remarks</label>
                <input
                  type="text"
                  value={editingExamResult.remarks || ''}
                  onChange={e => setEditingExamResult({ ...editingExamResult, remarks: e.target.value })}
                  className="w-full px-3 py-2 border rounded-xl bg-slate-50"
                  placeholder="Teacher remarks..."
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                onClick={() => setEditingExamResult(null)}
                className="px-4 py-2 bg-slate-200 text-slate-800 font-bold text-xs rounded-xl"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  if (onUpdateExamResult && editingExamResult) {
                    onUpdateExamResult(editingExamResult);
                    setEditingExamResult(null);
                    setToastMsg('Evaluation result updated successfully!');
                    setTimeout(() => setToastMsg(null), 3000);
                  }
                }}
                className="px-5 py-2 bg-blue-900 hover:bg-blue-800 text-white font-extrabold text-xs rounded-xl shadow"
              >
                Save Changes
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ADD NEW EXAM RESULT MODAL */}
      {isAddExamModalOpen && selectedStudent && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-slate-900/80 backdrop-blur-sm animate-in fade-in">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 space-y-4 shadow-2xl border border-slate-200">
            <div className="flex justify-between items-center border-b pb-3">
              <div className="flex items-center gap-2">
                <Plus className="w-5 h-5 text-emerald-600" />
                <h3 className="text-base font-black text-slate-900">
                  Add New Evaluation Record
                </h3>
              </div>
              <button onClick={() => setIsAddExamModalOpen(false)} className="text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div>
                <label className="block font-bold text-slate-700 mb-1">Exam / Test Title</label>
                <input
                  type="text"
                  value={newExamForm.exam_name}
                  onChange={e => setNewExamForm({ ...newExamForm, exam_name: e.target.value })}
                  className="w-full px-3 py-2 border rounded-xl bg-slate-50 font-bold text-slate-900"
                  placeholder="Weekly Test 1 or 1st Term Exam"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Evaluation Type</label>
                  <select
                    value={newExamForm.evaluation_type}
                    onChange={e => setNewExamForm({ ...newExamForm, evaluation_type: e.target.value })}
                    className="w-full px-3 py-2 border rounded-xl bg-slate-50 font-semibold"
                  >
                    <option value="Weekly Test">Weekly Test</option>
                    <option value="Monthly Test">Monthly Test</option>
                    <option value="Term Exam">Term Exam</option>
                  </select>
                </div>

                <div>
                  <label className="block font-bold text-slate-700 mb-1">Session</label>
                  <select
                    value={newExamForm.session_name}
                    onChange={e => setNewExamForm({ ...newExamForm, session_name: e.target.value })}
                    className="w-full px-3 py-2 border rounded-xl bg-slate-50 font-semibold"
                  >
                    <option value="Session 2026">Session 2026</option>
                    <option value="Session 2025">Session 2025</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Subject Name</label>
                  <input
                    type="text"
                    value={newExamForm.subject_name}
                    onChange={e => setNewExamForm({ ...newExamForm, subject_name: e.target.value })}
                    className="w-full px-3 py-2 border rounded-xl bg-slate-50 font-semibold"
                  />
                </div>

                <div>
                  <label className="block font-bold text-slate-700 mb-1">Month / Week</label>
                  <input
                    type="text"
                    value={`${newExamForm.month_name} - ${newExamForm.week_number}`}
                    onChange={e => {
                      const parts = e.target.value.split('-');
                      setNewExamForm({
                        ...newExamForm,
                        month_name: parts[0]?.trim() || 'August',
                        week_number: parts[1]?.trim() || 'Week 1'
                      });
                    }}
                    className="w-full px-3 py-2 border rounded-xl bg-slate-50"
                  />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-2">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Marks Obtained</label>
                  <input
                    type="number"
                    value={newExamForm.marks_obtained}
                    onChange={e => setNewExamForm({ ...newExamForm, marks_obtained: Number(e.target.value) })}
                    className="w-full px-3 py-2 border rounded-xl bg-slate-50 font-extrabold text-blue-900"
                  />
                </div>

                <div>
                  <label className="block font-bold text-slate-700 mb-1">Total Marks</label>
                  <input
                    type="number"
                    value={newExamForm.total_marks}
                    onChange={e => setNewExamForm({ ...newExamForm, total_marks: Number(e.target.value) })}
                    className="w-full px-3 py-2 border rounded-xl bg-slate-50 font-bold"
                  />
                </div>

                <div>
                  <label className="block font-bold text-slate-700 mb-1">Grade</label>
                  <input
                    type="text"
                    value={newExamForm.grade}
                    onChange={e => setNewExamForm({ ...newExamForm, grade: e.target.value })}
                    className="w-full px-3 py-2 border rounded-xl bg-slate-50 font-bold text-center text-emerald-700"
                  />
                </div>
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Remarks</label>
                <input
                  type="text"
                  value={newExamForm.remarks}
                  onChange={e => setNewExamForm({ ...newExamForm, remarks: e.target.value })}
                  className="w-full px-3 py-2 border rounded-xl bg-slate-50"
                  placeholder="Teacher feedback..."
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                onClick={() => setIsAddExamModalOpen(false)}
                className="px-4 py-2 bg-slate-200 text-slate-800 font-bold text-xs rounded-xl"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  if (onSaveExamResults) {
                    const pct = Math.round((newExamForm.marks_obtained / newExamForm.total_marks) * 100);
                    const newRecord: ExamResult = {
                      id: `EX-${Date.now()}`,
                      student_id: selectedStudent.id,
                      student_roll: selectedStudent.roll_no,
                      student_name: selectedStudent.full_name,
                      exam_name: newExamForm.exam_name,
                      evaluation_type: newExamForm.evaluation_type,
                      session_name: newExamForm.session_name,
                      week_number: newExamForm.week_number,
                      month_name: newExamForm.month_name,
                      subject_name: newExamForm.subject_name,
                      marks_obtained: newExamForm.marks_obtained,
                      total_marks: newExamForm.total_marks,
                      percentage: pct,
                      grade: newExamForm.grade,
                      status: pct >= 50 ? 'Pass' : 'Fail',
                      remarks: newExamForm.remarks,
                      storage_path: `${newExamForm.session_name}/${newExamForm.evaluation_type}/${newExamForm.month_name}/${selectedStudent.roll_no}.pdf`
                    };
                    onSaveExamResults([newRecord]);
                    setIsAddExamModalOpen(false);
                    setToastMsg('New evaluation result created and added to hierarchy!');
                    setTimeout(() => setToastMsg(null), 3000);
                  }
                }}
                className="px-5 py-2 bg-emerald-700 hover:bg-emerald-800 text-white font-extrabold text-xs rounded-xl shadow"
              >
                Create Result
              </button>
            </div>
          </div>
        </div>
      )}
      {/* DOCUMENT ASSET PREVIEW MODAL */}
      <DocumentPreviewModal 
        isOpen={!!docPreviewModal}
        onClose={() => setDocPreviewModal(null)}
        title={docPreviewModal?.title || 'Student Document Preview'}
        url={docPreviewModal?.url}
      />
    </div>
  );
};
