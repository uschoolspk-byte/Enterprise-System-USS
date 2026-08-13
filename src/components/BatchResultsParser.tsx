import React, { useState, useRef, useMemo, useEffect } from 'react';
import { 
  UploadCloud, 
  FileSpreadsheet, 
  CheckCircle2, 
  Send, 
  Sparkles, 
  AlertCircle,
  FileText,
  Table,
  FolderTree,
  FileCheck,
  Terminal,
  RefreshCw,
  FolderUp,
  Mail,
  UserCheck,
  UserX,
  Eye,
  Edit3,
  Trash2,
  Plus,
  Search,
  Filter,
  ChevronRight,
  ChevronDown,
  Folder,
  File,
  Download,
  X,
  ExternalLink,
  Settings,
  Play,
  Loader2
} from 'lucide-react';
import { LoadingButton } from './LoadingButton';
import { Student, ExamResult, ExamTypeEnum } from '../types';
import { parseExcelFile } from '../lib/excelExporter';
import { generateProgressReportPDF } from '../lib/pdfGenerator';
import { resolveExamResultPdfUrl } from '../lib/pdfViewerUtils';
import { 
  constructSupabaseStoragePath, 
  parseSupabaseStoragePath, 
  uploadToSupabaseStorageBucket 
} from '../lib/supabaseStorage';

interface BatchResultsParserProps {
  students: Student[];
  examResults?: ExamResult[];
  onSaveExamResults: (results: ExamResult[]) => void;
  onDeleteExamResult?: (id: string) => void;
  onUpdateExamResult?: (updated: ExamResult) => void;
}

interface PDFBatchItem {
  file: File;
  fileName: string;
  fileSizeFormatted: string;
  extractedRollNo: string;
  matchedStudent: Student | null;
  status: 'matched' | 'unmatched';
  customTargetPath?: string;
}

export const BatchResultsParser: React.FC<BatchResultsParserProps> = ({
  students,
  examResults = [],
  onSaveExamResults,
  onDeleteExamResult,
  onUpdateExamResult
}) => {
  // Mode selection: 'folder' | 'spreadsheet' | 'tree'
  const [activeMode, setActiveMode] = useState<'folder' | 'spreadsheet' | 'tree'>('folder');

  // Target Parameters for Batch Upload
  const [sessionName, setSessionName] = useState('Session 2026');
  const [evaluationCategory, setEvaluationCategory] = useState<ExamTypeEnum>('1st Term');
  const [subPeriodWeek, setSubPeriodWeek] = useState('Week 1');
  const [subPeriodMonth, setSubPeriodMonth] = useState('August');
  const [evalDate, setEvalDate] = useState(new Date().toISOString().slice(0, 10));
  const [examName, setExamName] = useState('1st Term Examination Result');
  const [subjectName, setSubjectName] = useState('All Subjects (Official Report)');

  // PDF Batch Items
  const [pdfBatch, setPdfBatch] = useState<PDFBatchItem[]>([]);
  const folderInputRef = useRef<HTMLInputElement>(null);
  const filesInputRef = useRef<HTMLInputElement>(null);

  // Raw Rows from Excel Spreadsheet
  const [parsedRows, setParsedRows] = useState<any[]>([]);
  const [spreadsheetName, setSpreadsheetName] = useState<string | null>(null);

  // Status & Progress
  const [toastMsg, setToastMsg] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [processedCount, setProcessedCount] = useState(0);
  const [sendBatchEmails, setSendBatchEmails] = useState(false);

  // Real-Time Console Terminal Logs
  const [consoleLogs, setConsoleLogs] = useState<string[]>([]);

  // Document Tree Filters & State
  const [treeSearch, setTreeSearch] = useState('');
  const [customSessionName, setCustomSessionName] = useState('');
  const [expandedFolders, setExpandedFolders] = useState<Record<string, boolean>>({
    'Session 2026': true
  });

  const EXAM_TREE_CATEGORIES: { id: ExamTypeEnum; label: string }[] = [
    { id: 'Weekly Test', label: 'Weekly Test' },
    { id: 'Monthly Test', label: 'Monthly Test' },
    { id: '1st Term', label: '1st Term Examination' },
    { id: '2nd Term', label: '2nd Term Examination' },
    { id: 'Final', label: 'Final Examination' }
  ];

  // Modal States for CRUD
  const [previewModalDoc, setPreviewModalDoc] = useState<ExamResult | null>(null);
  const [editModalDoc, setEditModalDoc] = useState<ExamResult | null>(null);
  const [editReplaceFile, setEditReplaceFile] = useState<File | null>(null);
  const [isAddSingleModalOpen, setIsAddSingleModalOpen] = useState(false);

  // Single Upload Modal Form State
  const [singleRollNo, setSingleRollNo] = useState('');
  const [singleFile, setSingleFile] = useState<File | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const addLog = (msg: string) => {
    const timestamp = new Date().toLocaleTimeString();
    setConsoleLogs(prev => [`[${timestamp}] ${msg}`, ...prev]);
  };

  const DEFAULT_SESSIONS = ['Session 2026', 'Session 2025', 'Session 2024'];

  const availableSessions = useMemo(() => {
    const fromResults = examResults
      .map(r => r.session_name?.trim())
      .filter((s): s is string => Boolean(s));
    return Array.from(new Set([...DEFAULT_SESSIONS, sessionName, ...fromResults]))
      .sort((a, b) => b.localeCompare(a));
  }, [examResults, sessionName]);

  useEffect(() => {
    if (activeMode !== 'tree') return;
    setExpandedFolders(prev => ({
      ...prev,
      [sessionName]: prev[sessionName] ?? true
    }));
  }, [activeMode, sessionName]);

  const handleSelectTreeCategory = (session: string, category: ExamTypeEnum) => {
    setSessionName(session);
    setEvaluationCategory(category);
    setExpandedFolders(prev => ({
      ...prev,
      [session]: true,
      [`${session}/${category}`]: true
    }));
  };

  const handleAddCustomSession = () => {
    const trimmed = customSessionName.trim();
    if (!trimmed) return;
    setSessionName(trimmed);
    setExpandedFolders(prev => ({ ...prev, [trimmed]: true }));
    setCustomSessionName('');
    setToastMsg(`Session "${trimmed}" added to evaluation tree.`);
    setTimeout(() => setToastMsg(null), 3000);
  };

  // Auto calculate Week and Month from Evaluation Date
  const calculateWeekAndMonthFromDate = (dateStr: string) => {
    if (!dateStr) return { month: 'August', week: 'Week 1' };
    const d = new Date(dateStr + 'T00:00:00');
    if (isNaN(d.getTime())) return { month: 'August', week: 'Week 1' };

    const monthNames = [
      'January', 'February', 'March', 'April', 'May', 'June',
      'July', 'August', 'September', 'October', 'November', 'December'
    ];
    const month = monthNames[d.getMonth()] || 'August';
    const dayOfMonth = d.getDate();
    const weekNum = Math.min(Math.ceil(dayOfMonth / 7), 5);
    const week = `Week ${weekNum}`;

    return { month, week };
  };

  useEffect(() => {
    if (!evalDate) return;
    const { month, week } = calculateWeekAndMonthFromDate(evalDate);
    setSubPeriodMonth(month);
    setSubPeriodWeek(week);

    if (evaluationCategory === 'Weekly Test') {
      setExamName(`Weekly Test - ${week} (${month})`);
    } else if (evaluationCategory === 'Monthly Test') {
      setExamName(`Monthly Test - ${month}`);
    } else if (evaluationCategory === '1st Term') {
      setExamName('1st Term Examination Result');
    } else if (evaluationCategory === '2nd Term') {
      setExamName('2nd Term Examination Result');
    } else if (evaluationCategory === 'Final') {
      setExamName('Final Examination Result');
    }
  }, [evalDate, evaluationCategory]);

  // Helper to construct dynamic storage path string for current parameter settings
  const currentTargetPattern = useMemo(() => {
    return constructSupabaseStoragePath(
      sessionName,
      evaluationCategory,
      subPeriodWeek,
      subPeriodMonth,
      '[RollNumber].pdf'
    );
  }, [sessionName, evaluationCategory, subPeriodWeek, subPeriodMonth]);

  // Extract roll number from filename
  const extractRollNumberFromFilename = (filename: string): string => {
    const baseName = filename.replace(/\.[^/.]+$/, '').trim();

    // 1. Direct check
    const directStudent = students.find(s => s.roll_no?.toLowerCase() === baseName.toLowerCase());
    if (directStudent) return directStudent.roll_no;

    // 2. Contains match
    const matchedByContains = students.find(s => 
      s.roll_no && baseName.toLowerCase().includes(s.roll_no.toLowerCase())
    );
    if (matchedByContains) return matchedByContains.roll_no;

    // 3. Fallback split
    const parts = baseName.split(/[_ ]/);
    for (const part of parts) {
      const match = students.find(s => s.roll_no && s.roll_no.toLowerCase() === part.toLowerCase());
      if (match) return match.roll_no;
    }

    return baseName;
  };

  // Match roll number to student object
  const findStudentByRoll = (extractedRoll: string): Student | null => {
    if (!extractedRoll) return null;
    const cleanExtracted = extractedRoll.toLowerCase().replace(/[^a-z0-9]/g, '');
    
    return students.find(s => {
      if (!s.roll_no) return false;
      const cleanRoll = s.roll_no.toLowerCase().replace(/[^a-z0-9]/g, '');
      return cleanRoll === cleanExtracted || s.roll_no.toLowerCase() === extractedRoll.toLowerCase();
    }) || null;
  };

  const getEvaluationType = (category: ExamTypeEnum): ExamResult['evaluation_type'] => {
    if (category === 'Weekly Test') return 'Weekly Test';
    if (category === 'Monthly Test') return 'Monthly Test';
    return 'Term Exam';
  };

  const getTermName = (category: ExamTypeEnum): string | undefined => {
    if (category === '1st Term' || category === '2nd Term' || category === 'Final') return category;
    return undefined;
  };

  /** Parse subject marks from spreadsheet row — only real columns, no dummy defaults */
  const parseSpreadsheetMarks = (row: Record<string, unknown>) => {
    const skip = new Set([
      'roll number', 'rollno', 'roll_no', 'roll no', 'name', 'student name', 'full name',
      'grade', 'percentage', 'remarks', 'status', 'total', 'total marks', 'obtained',
      'obtained marks', 'obtained_marks', 'total_marks', 'class', 'section', 'session'
    ]);
    const marks: Record<string, number> = {};
    for (const [key, val] of Object.entries(row)) {
      if (skip.has(key.toLowerCase().trim())) continue;
      const num = Number(val);
      if (val !== '' && val != null && !Number.isNaN(num)) marks[key] = num;
    }
    const obtainedFromRow = Number(row['Obtained Marks'] ?? row['Obtained'] ?? row['obtained_marks'] ?? 0);
    const obtained = obtainedFromRow > 0 ? obtainedFromRow : Object.values(marks).reduce((a, b) => a + b, 0);
    const totalFromRow = Number(row['Total Marks'] ?? row['Total'] ?? row['total_marks'] ?? 0);
    const total = totalFromRow > 0 ? totalFromRow : obtained;
    const gradeRaw = String(row['Grade'] ?? row['grade'] ?? '').trim();
    const percentage = total > 0 ? Math.round((obtained / total) * 100) : undefined;
    const grade = gradeRaw || (percentage != null
      ? percentage >= 80 ? 'A+' : percentage >= 70 ? 'A' : percentage >= 60 ? 'B' : percentage >= 50 ? 'C' : 'F'
      : undefined);
    return { marks, obtained, total, grade, percentage };
  };

  /** Build exam result linked to a real student record for the evaluation tree */
  const buildStudentExamResult = (
    student: Student,
    storagePath: string,
    extras: Partial<ExamResult> & { id: string }
  ): ExamResult => ({
    id: extras.id,
    student_id: student.id,
    student_roll: student.roll_no,
    student_name: student.full_name,
    session_name: sessionName,
    exam_category: evaluationCategory,
    exam_name: examName,
    evaluation_type: getEvaluationType(evaluationCategory),
    term_name: getTermName(evaluationCategory),
    week_number: evaluationCategory === 'Weekly Test' ? subPeriodWeek : undefined,
    month_name: (evaluationCategory === 'Weekly Test' || evaluationCategory === 'Monthly Test') ? subPeriodMonth : undefined,
    month: subPeriodMonth,
    subject_name: subjectName,
    storage_path: storagePath,
    file_name: `${student.roll_no}.pdf`,
    created_at: new Date().toISOString(),
    ...extras
  });

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  };

  // Folder/Files Selection Handler
  const handlePdfFilesSelected = (files: FileList | null) => {
    if (!files || files.length === 0) return;

    const items: PDFBatchItem[] = [];
    const fileArray = Array.from(files).filter(f => f.name.toLowerCase().endsWith('.pdf'));

    if (fileArray.length === 0) {
      alert('No PDF files found in the selected folder.');
      return;
    }

    fileArray.forEach(file => {
      const roll = extractRollNumberFromFilename(file.name);
      const student = findStudentByRoll(roll);
      const storagePath = constructSupabaseStoragePath(
        sessionName,
        evaluationCategory,
        subPeriodWeek,
        subPeriodMonth,
        roll
      );

      items.push({
        file,
        fileName: file.name,
        fileSizeFormatted: formatFileSize(file.size),
        extractedRollNo: roll,
        matchedStudent: student,
        status: student ? 'matched' : 'unmatched',
        customTargetPath: storagePath
      });
    });

    setPdfBatch(items);
    setToastMsg(`Folder Ingested: Detected ${items.length} PDF result files. Target Pattern: ${currentTargetPattern}`);
    addLog(`📂 Folder ingested: ${items.length} PDF files. Target path template: "${currentTargetPattern}"`);
    setTimeout(() => setToastMsg(null), 4000);
  };

  // Quick Demo Bundle Loader
  const handleLoadTestBundle = () => {
    const sampleList = students.length > 0 ? students.slice(0, 5) : [
      { id: '1', roll_no: 'BS-SE-8201', full_name: 'Muhammad Ali', guardian_email: 'ali.guardian@example.com' },
      { id: '2', roll_no: 'BS-SE-8202', full_name: 'Fatima Zahra', guardian_email: 'fatima.guardian@example.com' },
      { id: '3', roll_no: 'BS-SE-8203', full_name: 'Zainab Bibi', is_orphan: true, donor_email: 'donor.zainab@example.com' }
    ] as Student[];

    const testItems: PDFBatchItem[] = sampleList.map(st => {
      const fileName = `${st.roll_no}.pdf`;
      const dummyBlob = new Blob(['%PDF-1.4 Student Result Document for ' + st.full_name], { type: 'application/pdf' });
      const dummyFile = new File([dummyBlob], fileName, { type: 'application/pdf' });
      const storagePath = constructSupabaseStoragePath(
        sessionName,
        evaluationCategory,
        subPeriodWeek,
        subPeriodMonth,
        st.roll_no
      );

      return {
        file: dummyFile,
        fileName,
        fileSizeFormatted: '128.4 KB',
        extractedRollNo: st.roll_no,
        matchedStudent: st,
        status: 'matched',
        customTargetPath: storagePath
      };
    });

    setPdfBatch(testItems);
    setToastMsg(`Loaded test bundle: ${testItems.length} sample report card PDFs queued for execution.`);
    addLog(`📦 Test bundle loaded: ${testItems.length} student result cards staged in queue.`);
    setTimeout(() => setToastMsg(null), 3500);
  };

  const fileToBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = err => reject(err);
      reader.readAsDataURL(file);
    });
  };

  // Execute Batch PDF Upload into Supabase Storage; emails only when checkbox is on
  const handleExecutePdfBatch = async () => {
    if (pdfBatch.length === 0) return;

    const matchedCount = pdfBatch.filter(item => item.matchedStudent).length;
    const shouldSendEmails = sendBatchEmails && matchedCount > 0;

    setIsProcessing(true);
    setProcessedCount(0);
    setConsoleLogs([]);
    addLog(`🚀 Initializing Supabase Storage Document Routing Engine for ${pdfBatch.length} files...`);
    if (shouldSendEmails) {
      addLog(`✉️ Email dispatch enabled for ${matchedCount} matched student(s).`);
    } else {
      addLog(`📭 Email dispatch skipped — results will be uploaded only.`);
    }

    const newResults: ExamResult[] = [];
    let successEmails = 0;

    for (let i = 0; i < pdfBatch.length; i++) {
      const item = pdfBatch[i];
      const matchedStudent = item.matchedStudent ?? findStudentByRoll(item.extractedRollNo);

      if (!matchedStudent) {
        addLog(`  ⚠️ SKIPPED "${item.fileName}": roll "${item.extractedRollNo}" not found in student directory — not saved to evaluation tree.`);
        setProcessedCount(i + 1);
        continue;
      }

      const rollNo = matchedStudent.roll_no;
      const storagePath = constructSupabaseStoragePath(
        sessionName,
        evaluationCategory,
        subPeriodWeek,
        subPeriodMonth,
        rollNo
      );

      addLog(`📄 [${i + 1}/${pdfBatch.length}] Processing "${item.fileName}" -> Target Path: "${storagePath}"`);

      try {
        const base64Url = await fileToBase64(item.file);

        // Upload to Supabase Storage endpoint
        addLog(`  ☁️ Uploading document to Supabase Storage bucket 'student-results'...`);
        const uploadRes = await uploadToSupabaseStorageBucket(storagePath, base64Url);
        addLog(`  ✅ Supabase Storage: ${uploadRes.message}`);

        const resultObj = buildStudentExamResult(matchedStudent, storagePath, {
          id: `exam-pdf-${Date.now()}-${i}-${Math.random().toString(36).slice(2, 6)}`,
          status: 'Uploaded',
          file_name: item.fileName,
          file_url: uploadRes.publicUrl || base64Url,
          uploaded_at: new Date().toISOString()
        });

        newResults.push(resultObj);

        if (shouldSendEmails) {
          const targetEmail = matchedStudent.is_orphan 
            ? (matchedStudent.donor_email || 'Donor Email')
            : (matchedStudent.guardian_email || matchedStudent.parent_phone || 'Guardian Email');

          addLog(`  ✉️ Dispatching Brevo SMTP Progress Report Email to ${matchedStudent.is_orphan ? 'DONOR' : 'GUARDIAN'} (${targetEmail})...`);

          try {
            const res = await fetch('/api/email/dispatch-progress-report', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                student: matchedStudent,
                termName: `${examName} (${sessionName} - ${storagePath})`,
                pdfBase64: base64Url
              })
            });

            if (res.ok) {
              const data = await res.json();
              addLog(`  ✨ Brevo Email Delivered: ${data.message || 'Success'}`);
              successEmails++;
            } else {
              addLog(`  ⚠️ Email Dispatch Warning: Server status ${res.status}`);
            }
          } catch (emailErr: any) {
            addLog(`  ❌ Email Dispatch Failed: ${emailErr.message || 'Network error'}`);
          }
        } else {
          addLog(`  📭 Email skipped for "${matchedStudent.full_name}" (upload only).`);
        }
        addLog(`  🌳 Saved to evaluation tree: ${matchedStudent.full_name} (${rollNo})`);

      } catch (err: any) {
        addLog(`  ❌ ERROR reading file "${item.fileName}": ${err.message}`);
      }

      setProcessedCount(i + 1);
    }

    onSaveExamResults(newResults);
    setIsProcessing(false);
    setToastMsg(
      shouldSendEmails
        ? `SUCCESS: Routed ${newResults.length} PDF documents into Supabase Storage & sent ${successEmails} emails!`
        : `SUCCESS: Routed ${newResults.length} PDF documents into Supabase Storage. No emails sent.`
    );
    addLog(`🎉 BATCH COMPLETED: ${newResults.length} PDFs stored in Supabase Storage tree.`);
  };

  // Spreadsheet File Upload Handler
  const handleSpreadsheetUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setSpreadsheetName(file.name);
      try {
        const rows = await parseExcelFile(file);
        setParsedRows(rows);
        setToastMsg(`Parsed ${rows.length} rows successfully from "${file.name}"! Verify preview below.`);
        setTimeout(() => setToastMsg(null), 3000);
      } catch (err: any) {
        alert('Failed to parse Excel spreadsheet: ' + err.message);
      }
    }
  };

  // Commit Spreadsheet Results
  const handleCommitSpreadsheetRows = async () => {
    if (parsedRows.length === 0) return;

    const matchedCount = parsedRows.filter(row => {
      const rollNo = row['Roll Number'] || row['RollNo'] || row['roll_no'] || '';
      return students.some(s => s.roll_no?.toString().toLowerCase() === rollNo.toString().toLowerCase());
    }).length;

    const shouldSendEmails = sendBatchEmails && matchedCount > 0;

    setIsProcessing(true);
    setToastMsg(`Committing grades & routing into Supabase Storage tree...`);
    setConsoleLogs([]);
    addLog(`📊 Committing ${parsedRows.length} spreadsheet row(s) to student evaluation trees...`);

    const newResults: ExamResult[] = [];
    let sentCount = 0;

    for (let rowIdx = 0; rowIdx < parsedRows.length; rowIdx++) {
      const row = parsedRows[rowIdx];
      const rollNo = String(row['Roll Number'] || row['RollNo'] || row['roll_no'] || '').trim();
      if (!rollNo) {
        addLog(`⚠️ Spreadsheet row ${rowIdx + 1}: missing roll number — skipped.`);
        continue;
      }

      const student = findStudentByRoll(rollNo);
      if (!student) {
        addLog(`⚠️ Spreadsheet row ${rowIdx + 1}: roll "${rollNo}" not in student directory — skipped.`);
        continue;
      }

      const { marks, obtained, total, grade, percentage } = parseSpreadsheetMarks(row);

      const storagePath = constructSupabaseStoragePath(
        sessionName,
        evaluationCategory,
        subPeriodWeek,
        subPeriodMonth,
        student.roll_no
      );

      let fileUrl: string | undefined;
      try {
        const doc = generateProgressReportPDF(student, examName, sessionName);
        const pdfBase64 = doc.output('datauristring');
        const uploadRes = await uploadToSupabaseStorageBucket(storagePath, pdfBase64);
        fileUrl = uploadRes.publicUrl || pdfBase64;
      } catch (err) {
        console.error('PDF generation/upload failed for', student.roll_no, err);
      }

      const resultObj = buildStudentExamResult(student, storagePath, {
        id: `exam-sheet-${Date.now()}-${rowIdx}-${Math.random().toString(36).slice(2, 6)}`,
        marks: Object.keys(marks).length > 0 ? marks : undefined,
        marks_obtained: obtained || undefined,
        obtained_marks: obtained || undefined,
        total_marks: total || undefined,
        percentage,
        grade,
        status: percentage != null ? (percentage >= 50 ? 'Pass' : 'Fail') : 'Committed',
        file_url: fileUrl,
        uploaded_at: fileUrl ? new Date().toISOString() : undefined
      });

      newResults.push(resultObj);
      addLog(`🌳 Saved to evaluation tree: ${student.full_name} (${student.roll_no})`);

      if (shouldSendEmails && fileUrl) {
        try {
          await fetch('/api/email/dispatch-progress-report', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              student,
              termName: `${examName} (${sessionName})`,
              pdfBase64: fileUrl
            })
          });
          sentCount++;
        } catch (err) {
          console.error('Email dispatch error for student', student.roll_no, err);
        }
      }
    }

    onSaveExamResults(newResults);
    setIsProcessing(false);
    setToastMsg(
      shouldSendEmails
        ? `SUCCESS: Committed ${newResults.length} exam records and sent ${sentCount} emails!`
        : `SUCCESS: Committed ${newResults.length} exam records. No emails sent.`
    );
    setTimeout(() => setToastMsg(null), 5000);

    setParsedRows([]);
    setSpreadsheetName(null);
  };

  // Single Manual Upload Submission
  const handleAddSingleDocumentSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!singleRollNo || !singleFile) {
      alert('Please provide student roll number and attach a PDF document.');
      return;
    }

    setActionLoading('upload-single');
    const matchedStudent = findStudentByRoll(singleRollNo);
    if (!matchedStudent) {
      alert(`Roll number "${singleRollNo}" not found in student directory. Add the student first.`);
      setActionLoading(null);
      return;
    }

    const storagePath = constructSupabaseStoragePath(
      sessionName,
      evaluationCategory,
      subPeriodWeek,
      subPeriodMonth,
      matchedStudent.roll_no
    );

    try {
      const base64Url = await fileToBase64(singleFile);
      const uploadRes = await uploadToSupabaseStorageBucket(storagePath, base64Url);

      const resultObj = buildStudentExamResult(matchedStudent, storagePath, {
        id: 'exam-single-' + Date.now(),
        status: 'Uploaded',
        file_name: singleFile.name,
        file_url: uploadRes.publicUrl || base64Url,
        uploaded_at: new Date().toISOString()
      });

      onSaveExamResults([resultObj]);
      setIsAddSingleModalOpen(false);
      setSingleRollNo('');
      setSingleFile(null);
      setToastMsg(`Document uploaded & routed to "${storagePath}" successfully!`);
      setTimeout(() => setToastMsg(null), 4000);
    } catch (err: any) {
      alert('Upload failed: ' + err.message);
    } finally {
      setActionLoading(null);
    }
  };

  // Re-send progress report email for an existing document in tree
  const handleResendDocumentEmail = async (doc: ExamResult) => {
    const student = students.find(s => s.id === doc.student_id || s.roll_no === doc.student_roll);
    if (!student) {
      alert('No student profile matched to this result record.');
      return;
    }

    setActionLoading(`email-${doc.id}`);
    try {
      setToastMsg(`Dispatching email to ${student.is_orphan ? 'Donor' : 'Guardian'}...`);
      let pdfBase64 = doc.file_url;
      if (!pdfBase64 || !pdfBase64.startsWith('data:')) {
        const generatedPdf = generateProgressReportPDF(student, doc.exam_name || 'Progress Report', doc.session_name || 'Session 2026');
        pdfBase64 = generatedPdf.output('datauristring');
      }

      const res = await fetch('/api/email/dispatch-progress-report', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          student,
          termName: `${doc.exam_name || 'Result PDF'} (${doc.storage_path || doc.session_name})`,
          pdfBase64
        })
      });

      if (res.ok) {
        setToastMsg(`✨ Brevo Email dispatched successfully to ${student.is_orphan ? student.donor_email : student.guardian_email}!`);
      } else {
        alert('Email dispatch issue: HTTP ' + res.status);
      }
    } catch (err: any) {
      alert('Email dispatch failed: ' + err.message);
    } finally {
      setActionLoading(null);
    }
    setTimeout(() => setToastMsg(null), 4000);
  };

  const handleDeleteDoc = async (doc: ExamResult) => {
    if (!confirm(`Delete this result from the evaluation tree?\n\nStudent: ${doc.student_name || doc.student_roll}\nPath: ${doc.storage_path || doc.file_name}`)) {
      return;
    }
    setActionLoading(`delete-${doc.id}`);
    try {
      onDeleteExamResult?.(doc.id);
      if (previewModalDoc?.id === doc.id) setPreviewModalDoc(null);
      if (editModalDoc?.id === doc.id) setEditModalDoc(null);
      setToastMsg('Result deleted from evaluation tree.');
      setTimeout(() => setToastMsg(null), 3000);
    } finally {
      setActionLoading(null);
    }
  };

  // Edit / Re-route Document submit handler
  const handleSaveEditDoc = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editModalDoc) return;

    setActionLoading('edit-save');
    const newStoragePath = constructSupabaseStoragePath(
      editModalDoc.session_name || 'Session 2026',
      editModalDoc.exam_category || '1st Term',
      editModalDoc.week_number || 'Week 1',
      editModalDoc.month_name || 'August',
      editModalDoc.student_roll || 'UNKNOWN'
    );

    let updated: ExamResult = {
      ...editModalDoc,
      storage_path: newStoragePath,
      file_name: editModalDoc.student_roll ? `${editModalDoc.student_roll}.pdf` : editModalDoc.file_name,
      uploaded_at: new Date().toISOString()
    };

    try {
      if (editReplaceFile) {
        const base64Url = await fileToBase64(editReplaceFile);
        const uploadRes = await uploadToSupabaseStorageBucket(newStoragePath, base64Url);
        updated = {
          ...updated,
          file_url: uploadRes.publicUrl || base64Url
        };
      }

      if (onUpdateExamResult) {
        onUpdateExamResult(updated);
      }

      setEditModalDoc(null);
      setEditReplaceFile(null);
      setToastMsg(`Result updated & re-routed to "${newStoragePath}"`);
      setTimeout(() => setToastMsg(null), 4000);
    } catch (err: any) {
      alert('Update failed: ' + err.message);
    } finally {
      setActionLoading(null);
    }
  };

  // Toggle tree node expand/collapse
  const toggleFolderExpand = (folderKey: string) => {
    setExpandedFolders(prev => ({
      ...prev,
      [folderKey]: !prev[folderKey]
    }));
  };

  // Organize ExamResults into tree: Session -> Category -> SubPeriod -> Results[]
  const documentTreeData = useMemo(() => {
    let filtered = [...examResults];

    if (treeSearch.trim()) {
      const q = treeSearch.toLowerCase();
      filtered = filtered.filter(r =>
        (r.student_name && r.student_name.toLowerCase().includes(q)) ||
        (r.student_roll && r.student_roll.toLowerCase().includes(q)) ||
        (r.storage_path && r.storage_path.toLowerCase().includes(q)) ||
        (r.exam_name && r.exam_name.toLowerCase().includes(q))
      );
    }

    const dataFromResults: Record<string, Record<string, Record<string, ExamResult[]>>> = {};

    filtered.forEach(res => {
      const parsedPath = parseSupabaseStoragePath(
        res.storage_path || `${res.session_name || 'Session 2026'}/${res.exam_category || '1st Term'}/${res.student_roll || 'BS-SE-8201'}.pdf`
      );

      const sessionKey = parsedPath.session || res.session_name || 'Session 2026';
      const categoryKey = parsedPath.category || res.exam_category || '1st Term';
      const subPeriodKey = parsedPath.subPeriod || res.week_number || res.month_name || 'General';

      if (!dataFromResults[sessionKey]) dataFromResults[sessionKey] = {};
      if (!dataFromResults[sessionKey][categoryKey]) dataFromResults[sessionKey][categoryKey] = {};
      if (!dataFromResults[sessionKey][categoryKey][subPeriodKey]) {
        dataFromResults[sessionKey][categoryKey][subPeriodKey] = [];
      }

      dataFromResults[sessionKey][categoryKey][subPeriodKey].push(res);
    });

    const sessionKeys = Array.from(
      new Set([...availableSessions, ...Object.keys(dataFromResults)])
    ).sort((a, b) => b.localeCompare(a));

    const tree: Record<string, Record<string, Record<string, ExamResult[]>>> = {};

    for (const sessionKey of sessionKeys) {
      tree[sessionKey] = {};
      for (const cat of EXAM_TREE_CATEGORIES) {
        tree[sessionKey][cat.id] = dataFromResults[sessionKey]?.[cat.id] || {};
      }
      // Include any extra categories from legacy data
      const extraCats = dataFromResults[sessionKey]
        ? Object.keys(dataFromResults[sessionKey]).filter(
            k => !EXAM_TREE_CATEGORIES.some(c => c.id === k)
          )
        : [];
      for (const extra of extraCats) {
        tree[sessionKey][extra] = dataFromResults[sessionKey][extra];
      }
    }

    return tree;
  }, [examResults, treeSearch, availableSessions]);

  return (
    <div className="max-w-7xl mx-auto p-4 sm:p-6 space-y-6">
      
      {/* Toast Alert Banner */}
      {toastMsg && (
        <div className="p-4 rounded-2xl bg-blue-900 text-white font-bold flex items-center justify-between shadow-2xl animate-in slide-in-from-top border border-blue-700">
          <div className="flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-amber-400" />
            <span>{toastMsg}</span>
          </div>
          <button onClick={() => setToastMsg(null)} className="text-white hover:text-amber-300">
            <X className="w-5 h-5" />
          </button>
        </div>
      )}

      {/* Main Header & Routing Parameter Engine */}
      <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-xl space-y-6">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 border-b pb-5">
          <div>
            <div className="flex items-center gap-2.5">
              <FolderUp className="w-7 h-7 text-blue-900" />
              <h2 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight">
                Batch PDF Folder Upload & Supabase Storage Routing Engine
              </h2>
            </div>
            <p className="text-xs text-slate-500 mt-1">
              Automated path structure routing: <code className="bg-slate-100 px-1.5 py-0.5 rounded text-blue-900 font-bold font-mono">Session/ExamType/if week month (which week or month) RollNumber.pdf</code>
            </p>
          </div>

          {/* Mode Switcher Buttons */}
          <div className="flex flex-wrap bg-slate-100 p-1.5 rounded-2xl border border-slate-200">
            <button
              onClick={() => setActiveMode('folder')}
              className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-black transition-all ${
                activeMode === 'folder'
                  ? 'bg-blue-900 text-white shadow-md'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <FolderTree className="w-4 h-4 text-amber-300" />
              📁 Batch Folder Upload
            </button>

            <button
              onClick={() => setActiveMode('spreadsheet')}
              className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-black transition-all ${
                activeMode === 'spreadsheet'
                  ? 'bg-blue-900 text-white shadow-md'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <FileSpreadsheet className="w-4 h-4 text-emerald-300" />
              📊 Excel Spreadsheet
            </button>

            <button
              onClick={() => setActiveMode('tree')}
              className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-black transition-all ${
                activeMode === 'tree'
                  ? 'bg-blue-900 text-white shadow-md'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Folder className="w-4 h-4 text-amber-400" />
              🌳 Supabase Storage Tree ({examResults.length})
            </button>
          </div>
        </div>

        {/* Global Routing Target Parameters Bar */}
        <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-xl space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 pb-3">
            <div>
              <div className="flex items-center gap-2">
                <Settings className="w-5 h-5 text-indigo-600" />
                <h2 className="text-base sm:text-lg font-black text-slate-900 tracking-tight">
                  ⚙️ Target Evaluation Parameters (Configure Once)
                </h2>
              </div>
              <p className="text-xs text-slate-500 mt-0.5">
                Define target category, session, evaluation date, and auto-computed week/month details.
              </p>
            </div>

            {/* Target Storage Path Preview */}
            <div className="px-3 py-1.5 rounded-xl bg-slate-900 text-amber-300 font-mono text-[11px] font-bold border border-slate-800 shadow-inner flex items-center gap-1.5 self-start sm:self-auto">
              <span className="text-slate-400">☁️ Storage Target:</span>
              <span className="text-amber-300">{currentTargetPattern}</span>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4 pt-1">
            
            {/* Evaluation Category / Exam Type */}
            <div>
              <div className="flex justify-between items-center mb-1">
                <label className="text-xs font-bold text-slate-700">Evaluation Category</label>
                <span className="px-2 py-0.5 bg-indigo-100 text-indigo-800 font-extrabold text-[10px] rounded uppercase">
                  PRESET
                </span>
              </div>
              <select
                value={evaluationCategory}
                onChange={e => setEvaluationCategory(e.target.value as ExamTypeEnum)}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl font-bold text-xs text-slate-800 focus:ring-2 focus:ring-indigo-600 focus:bg-white"
              >
                <option value="Weekly Test">Weekly Test</option>
                <option value="Monthly Test">Monthly Test</option>
                <option value="1st Term">1st Term Examination</option>
                <option value="2nd Term">2nd Term Examination</option>
                <option value="Final">Final Examination</option>
              </select>
            </div>

            {/* Evaluation Date */}
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">Evaluation Date</label>
              <input 
                type="date"
                value={evalDate}
                onChange={e => setEvalDate(e.target.value)}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl font-bold text-xs text-slate-800 focus:ring-2 focus:ring-indigo-600 focus:bg-white"
              />
            </div>

            {/* Academic Session Folder Name — type manually or pick from suggestions */}
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">Academic Session Folder</label>
              <input
                type="text"
                list="batch-session-suggestions"
                value={sessionName}
                onChange={e => setSessionName(e.target.value)}
                placeholder="e.g. Session 2026, Session 2027, Summer 2026"
                className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl font-bold text-xs text-slate-800 focus:ring-2 focus:ring-indigo-600 focus:bg-white"
              />
              <datalist id="batch-session-suggestions">
                {availableSessions.map(session => (
                  <option key={session} value={session} />
                ))}
              </datalist>
              <p className="text-[10px] text-slate-400 mt-1">Type any folder name — used in storage path & evaluation tree.</p>
            </div>

            {/* Report Title / Name */}
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">Exam / Report Title</label>
              <input 
                type="text"
                value={examName}
                onChange={e => setExamName(e.target.value)}
                placeholder="e.g. Weekly Test - Week 2 (August)"
                className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl font-bold text-xs text-slate-800 focus:ring-2 focus:ring-indigo-600 focus:bg-white"
              />
            </div>

          </div>

          {/* Email opt-in — off by default */}
          {(activeMode === 'folder' || activeMode === 'spreadsheet') && (
            <label className="flex items-start gap-3 p-4 bg-slate-50 border border-slate-200 rounded-2xl cursor-pointer hover:bg-indigo-50/40 transition-colors">
              <input
                type="checkbox"
                checked={sendBatchEmails}
                onChange={e => setSendBatchEmails(e.target.checked)}
                className="mt-0.5 w-4 h-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
              />
              <div>
                <span className="flex items-center gap-1.5 text-xs font-black text-slate-800">
                  <Mail className="w-4 h-4 text-indigo-600" />
                  Send progress report emails after batch commit
                </span>
                <span className="block text-[11px] text-slate-500 mt-0.5">
                  Off by default. When enabled, Brevo emails go to guardians (or donors for orphan students) for matched roll numbers only.
                </span>
              </div>
            </label>
          )}

          {/* Conditional Sub-Period Controls: Calculated Week & Month */}
          {evaluationCategory === 'Weekly Test' && (
            <div className="p-4 bg-amber-50/80 border border-amber-200 rounded-2xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
              <div className="flex items-center gap-2">
                <span className="text-xl">📅</span>
                <div>
                  <span className="block font-black text-xs text-amber-950 uppercase tracking-wide">
                    Weekly Test Parameters (Auto-Calculated)
                  </span>
                  <span className="text-[11px] text-amber-800 font-medium">
                    Date {evalDate} resolves to <strong className="text-amber-950 font-extrabold">{subPeriodWeek}</strong> of <strong className="text-amber-950 font-extrabold">{subPeriodMonth}</strong>.
                  </span>
                </div>
              </div>

              <div className="flex items-center gap-3 w-full sm:w-auto">
                <div>
                  <label className="block text-[10px] font-bold text-amber-900 uppercase mb-0.5">Which Month?</label>
                  <select
                    value={subPeriodMonth}
                    onChange={e => {
                      setSubPeriodMonth(e.target.value);
                      setExamName(`Weekly Test - ${subPeriodWeek} (${e.target.value})`);
                    }}
                    className="px-3 py-1.5 bg-white border border-amber-300 rounded-xl font-extrabold text-xs text-amber-950 focus:ring-2 focus:ring-amber-500"
                  >
                    {['January','February','March','April','May','June','July','August','September','October','November','December'].map(m => (
                      <option key={m} value={m}>{m}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-[10px] font-bold text-amber-900 uppercase mb-0.5">Which Week No?</label>
                  <select
                    value={subPeriodWeek}
                    onChange={e => {
                      setSubPeriodWeek(e.target.value);
                      setExamName(`Weekly Test - ${e.target.value} (${subPeriodMonth})`);
                    }}
                    className="px-3 py-1.5 bg-white border border-amber-300 rounded-xl font-extrabold text-xs text-amber-950 focus:ring-2 focus:ring-amber-500"
                  >
                    <option value="Week 1">Week 1</option>
                    <option value="Week 2">Week 2</option>
                    <option value="Week 3">Week 3</option>
                    <option value="Week 4">Week 4</option>
                    <option value="Week 5">Week 5</option>
                  </select>
                </div>
              </div>
            </div>
          )}

          {evaluationCategory === 'Monthly Test' && (
            <div className="p-4 bg-blue-50/80 border border-blue-200 rounded-2xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
              <div className="flex items-center gap-2">
                <span className="text-xl">📆</span>
                <div>
                  <span className="block font-black text-xs text-blue-950 uppercase tracking-wide">
                    Monthly Test Parameters (Auto-Calculated)
                  </span>
                  <span className="text-[11px] text-blue-800 font-medium">
                    Date {evalDate} resolves to Month: <strong className="text-blue-950 font-extrabold">{subPeriodMonth}</strong>.
                  </span>
                </div>
              </div>

              <div>
                <label className="block text-[10px] font-bold text-blue-900 uppercase mb-0.5">Which Month?</label>
                <select
                  value={subPeriodMonth}
                  onChange={e => {
                    setSubPeriodMonth(e.target.value);
                    setExamName(`Monthly Test - ${e.target.value}`);
                  }}
                  className="px-3 py-1.5 bg-white border border-blue-300 rounded-xl font-extrabold text-xs text-blue-950 focus:ring-2 focus:ring-blue-500"
                >
                  {['January','February','March','April','May','June','July','August','September','October','November','December'].map(m => (
                    <option key={m} value={m}>{m}</option>
                  ))}
                </select>
              </div>
            </div>
          )}
        </div>

        {/* TAB 1: BATCH PDF FOLDER UPLOAD MODE */}
        {activeMode === 'folder' && (
          <div className="space-y-6">
            
            {/* 2-Column Dashboard Grid: Drop Center + Processing Queue */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              
              {/* LEFT CARD: FOLDER / FILES DROP CENTER */}
              <div className="bg-white rounded-3xl border border-slate-200 shadow-xl p-6 flex flex-col justify-between space-y-4">
                <div className="space-y-2">
                  <h3 className="text-xs font-black text-slate-700 uppercase tracking-wider flex items-center gap-2">
                    FOLDER / FILES DROP CENTER
                  </h3>
                  <p className="text-xs text-slate-500 leading-relaxed">
                    Upload or drop thousands of report card PDFs. Filenames will parse automatically against registered student roll numbers. You can also drag files anywhere on the page — a drop box will appear.
                  </p>
                </div>

                {/* Dashed Ingestion Dropzone */}
                <div 
                  onClick={() => folderInputRef.current?.click()}
                  className="p-8 border-2 border-dashed border-slate-300 hover:border-indigo-500 rounded-2xl bg-slate-50/70 hover:bg-indigo-50/30 transition-all cursor-pointer text-center space-y-3 flex flex-col items-center justify-center my-2 group"
                >
                  <div className="w-12 h-12 rounded-full bg-slate-100 group-hover:bg-indigo-100 flex items-center justify-center text-slate-400 group-hover:text-indigo-600 transition-colors">
                    <UploadCloud className="w-7 h-7" />
                  </div>
                  <div>
                    <span className="block text-sm font-black text-slate-800 group-hover:text-indigo-900">
                      Drop files or click to upload folder
                    </span>
                    <span className="block text-xs text-slate-400 font-medium mt-1">
                      Accepts PDFs & Images - Drag anywhere on page for quick drop
                    </span>
                  </div>

                  {/* Hidden File Inputs */}
                  <input 
                    ref={folderInputRef}
                    type="file" 
                    {...({ webkitdirectory: "", directory: "" } as any)}
                    onChange={e => handlePdfFilesSelected(e.target.files)} 
                    className="hidden" 
                  />
                  <input 
                    ref={filesInputRef}
                    type="file" 
                    multiple
                    accept=".pdf,application/pdf"
                    onChange={e => handlePdfFilesSelected(e.target.files)} 
                    className="hidden" 
                  />
                </div>

                {/* Footer bar inside Left Card */}
                <div className="flex flex-wrap items-center justify-between pt-2 gap-2 border-t border-slate-100">
                  <span className="text-xs font-bold text-slate-600">Want to demo high-speed parsing?</span>
                  <button
                    type="button"
                    onClick={handleLoadTestBundle}
                    className="px-4 py-2 bg-indigo-50 hover:bg-indigo-100 text-indigo-900 font-extrabold text-xs rounded-xl flex items-center gap-1.5 transition-all border border-indigo-200 shadow-sm"
                  >
                    <Sparkles className="w-4 h-4 text-amber-500" />
                    Load Test Bundle
                  </button>
                </div>
              </div>

              {/* RIGHT CARD: FILE PROCESSING QUEUE */}
              <div className="bg-white rounded-3xl border border-slate-200 shadow-xl p-6 flex flex-col justify-between space-y-4">
                <div className="space-y-2">
                  <div className="flex justify-between items-center">
                    <h3 className="text-xs font-black text-slate-700 uppercase tracking-wider">
                      FILE PROCESSING QUEUE ({pdfBatch.length})
                    </h3>
                    {pdfBatch.length > 0 && (
                      <button 
                        onClick={() => setPdfBatch([])} 
                        className="text-[11px] font-bold text-red-600 hover:underline"
                      >
                        Clear Queue
                      </button>
                    )}
                  </div>
                </div>

                {/* Queue Body */}
                <div className="flex-1 flex flex-col justify-center min-h-[180px]">
                  {pdfBatch.length === 0 ? (
                    <div className="py-10 border border-slate-100 rounded-2xl bg-slate-50/50 flex flex-col items-center justify-center text-center space-y-2">
                      <div className="w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center text-slate-300">
                        <FileText className="w-6 h-6" />
                      </div>
                      <div>
                        <span className="block text-xs font-bold text-slate-600">Queue is empty. Select files to start.</span>
                        <span className="block text-[11px] text-slate-400 mt-0.5">Previews appear once files are dropped / selected.</span>
                      </div>
                    </div>
                  ) : (
                    <div className="max-h-52 overflow-y-auto space-y-2 pr-1">
                      {pdfBatch.map((item, idx) => (
                        <div key={idx} className="p-2.5 bg-slate-50 border border-slate-200 rounded-xl flex items-center justify-between text-xs">
                          <div className="flex items-center gap-2 overflow-hidden">
                            <FileText className="w-4 h-4 text-indigo-600 shrink-0" />
                            <div className="truncate">
                              <span className="font-bold text-slate-800 truncate block">{item.fileName}</span>
                              <span className="text-[10px] text-slate-500 font-mono">
                                Roll: {item.extractedRollNo} | {item.matchedStudent ? item.matchedStudent.full_name : 'Unmatched'}
                              </span>
                            </div>
                          </div>
                          <span className={`px-2 py-0.5 rounded text-[10px] font-bold shrink-0 ${item.status === 'matched' ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'}`}>
                            {item.status === 'matched' ? 'Matched' : 'Unmatched'}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Execute Button Footer */}
                <LoadingButton
                  disabled={pdfBatch.length === 0 || isProcessing}
                  loading={isProcessing}
                  loadingText="Processing batch…"
                  onClick={handleExecutePdfBatch}
                  icon={<Play className="w-4 h-4 fill-current" />}
                  className="w-full py-3.5 bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-200 disabled:text-slate-400 text-white font-extrabold text-xs rounded-2xl shadow-lg flex items-center justify-center gap-2 transition-all cursor-pointer disabled:cursor-not-allowed"
                >
                  Execute Parser & Upload Results
                </LoadingButton>
              </div>

            </div>

            {/* Bottom Full-Width Terminal Console */}
            <div className="bg-slate-950 text-emerald-400 rounded-3xl p-6 border border-slate-800 shadow-2xl space-y-3 font-mono text-xs">
              <div className="flex justify-between items-center border-b border-slate-800 pb-3">
                <div className="flex items-center gap-2">
                  <Terminal className="w-4 h-4 text-indigo-400" />
                  <span className="font-bold text-slate-200 text-xs">
                    &gt;_ Programmatic Parser Terminal Console
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  {isProcessing && (
                    <span className="flex items-center gap-1.5 text-xs text-amber-300 font-bold mr-2">
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                      Processing {processedCount} / {pdfBatch.length}...
                    </span>
                  )}
                  <span className="px-2.5 py-0.5 rounded bg-slate-800 text-slate-300 font-mono text-[10px] font-bold border border-slate-700">
                    REAL-TIME EXEC
                  </span>
                </div>
              </div>

              <div className="h-44 overflow-y-auto space-y-1 pr-2 font-mono text-xs text-slate-300 flex flex-col justify-start">
                {consoleLogs.length === 0 && !isProcessing ? (
                  <div className="my-auto text-center">
                    <p className="italic text-slate-500 font-mono">Terminal idling. Awaiting target execution...</p>
                  </div>
                ) : (
                  consoleLogs.map((log, index) => (
                    <div key={index} className="leading-relaxed text-emerald-400">
                      {log}
                    </div>
                  ))
                )}
              </div>
            </div>

          </div>
        )}

        {/* TAB 2: EXCEL SPREADSHEET IMPORT MODE */}
        {activeMode === 'spreadsheet' && (
          <div className="space-y-6">
            <div className="p-8 border-2 border-dashed border-blue-900/30 rounded-3xl text-center bg-blue-50/50 hover:bg-blue-50 transition-all space-y-3">
              <FileSpreadsheet className="w-12 h-12 text-blue-900 mx-auto" />
              <h3 className="text-sm font-black text-slate-900 uppercase">Upload Batch Results Spreadsheet (.xlsx / .csv)</h3>
              <p className="text-xs text-slate-500 max-w-md mx-auto">
                Spreadsheet rows will be parsed and mapped into the Supabase Storage document tree at <span className="font-mono font-bold text-blue-900">{currentTargetPattern}</span>.
              </p>

              <label className="inline-block px-6 py-3 bg-blue-900 hover:bg-blue-800 text-white font-extrabold text-xs rounded-2xl shadow-lg cursor-pointer transition-all">
                Browse Excel File
                <input type="file" accept=".xlsx, .xls, .csv" onChange={handleSpreadsheetUpload} className="hidden" />
              </label>

              {spreadsheetName && (
                <span className="block text-xs font-mono font-bold text-emerald-700 mt-2">
                  Attached: {spreadsheetName} ({parsedRows.length} rows parsed)
                </span>
              )}
            </div>

            {parsedRows.length > 0 && (
              <div className="bg-white rounded-3xl border border-slate-200 shadow-xl overflow-hidden space-y-4 p-6">
                <div className="flex justify-between items-center border-b pb-3">
                  <h3 className="text-sm font-black text-slate-900 uppercase flex items-center gap-2">
                    <Table className="w-4 h-4 text-blue-900" />
                    Spreadsheet Results Preview & Supabase Target Route
                  </h3>

                  <button
                    disabled={isProcessing}
                    onClick={handleCommitSpreadsheetRows}
                    className="px-6 py-2.5 bg-emerald-700 hover:bg-emerald-800 text-white font-extrabold text-xs rounded-2xl shadow-lg flex items-center gap-2 transition-all"
                  >
                    <Send className="w-4 h-4 text-amber-300" />
                    Commit Results to Supabase Tree
                  </button>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead>
                      <tr className="bg-slate-900 text-white uppercase text-[10px] font-bold">
                        <th className="p-3">Roll Number</th>
                        <th className="p-3">Student Name</th>
                        <th className="p-3">Target Supabase Storage Path</th>
                        <th className="p-3">Math</th>
                        <th className="p-3">English</th>
                        <th className="p-3">Science</th>
                        <th className="p-3">Obtained / Total</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200">
                      {parsedRows.map((row, idx) => {
                        const rollNo = row['Roll Number'] || row['RollNo'] || row['roll_no'] || 'N/A';
                        const matchedStudent = students.find(s => s.roll_no?.toString().toLowerCase() === rollNo.toString().toLowerCase());
                        const storagePath = constructSupabaseStoragePath(
                          sessionName,
                          evaluationCategory,
                          subPeriodWeek,
                          subPeriodMonth,
                          rollNo
                        );

                        return (
                          <tr key={idx} className="hover:bg-slate-50">
                            <td className="p-3 font-mono font-bold text-blue-900">{rollNo}</td>
                            <td className="p-3 font-bold text-slate-900">{matchedStudent ? matchedStudent.full_name : row['Name'] || 'Student'}</td>
                            <td className="p-3 font-mono text-[11px] text-blue-900 font-bold bg-blue-50/50">
                              ☁️ {storagePath}
                            </td>
                            <td className="p-3 font-bold">{row['Mathematics'] || row['Math'] || 85}</td>
                            <td className="p-3 font-bold">{row['English'] || 80}</td>
                            <td className="p-3 font-bold">{row['Science'] || 90}</td>
                            <td className="p-3 font-bold text-emerald-800">435 / 500 (Grade A+)</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        )}

        {/* TAB 3: SUPABASE STORAGE DOCUMENT TREE EXPLORER & FULL CRUD MANAGER */}
        {activeMode === 'tree' && (
          <div className="space-y-6">
            
            {/* Tree Controls Header */}
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-slate-900 text-white p-5 rounded-3xl">
              <div>
                <h3 className="text-base font-black flex items-center gap-2">
                  <Folder className="w-5 h-5 text-amber-400" />
                  Evaluation Tree
                </h3>
                <p className="text-xs text-slate-400">
                  Expand each session → Weekly, Monthly, Term exams
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <input
                  type="text"
                  value={customSessionName}
                  onChange={e => setCustomSessionName(e.target.value)}
                  placeholder="New session e.g. Session 2027"
                  className="px-3 py-2 bg-slate-800 border border-slate-700 rounded-xl text-xs font-bold text-white placeholder:text-slate-500 min-w-[160px]"
                />
                <button
                  type="button"
                  onClick={handleAddCustomSession}
                  className="px-3 py-2 bg-blue-600 hover:bg-blue-500 text-white font-black text-xs rounded-xl"
                >
                  + Session
                </button>
                <button
                  onClick={() => setIsAddSingleModalOpen(true)}
                  className="px-4 py-2 bg-amber-500 hover:bg-amber-600 text-slate-900 font-black text-xs rounded-xl flex items-center gap-1.5 shadow"
                >
                  <Plus className="w-4 h-4" />
                  Upload PDF
                </button>
              </div>
            </div>

            {/* Search */}
            <div className="relative bg-slate-50 p-4 rounded-2xl border border-slate-200">
              <Search className="w-4 h-4 text-slate-400 absolute left-7 top-7" />
              <input
                type="text"
                value={treeSearch}
                onChange={e => setTreeSearch(e.target.value)}
                placeholder="Search roll no, student name, or path..."
                className="w-full pl-9 pr-3 py-2.5 bg-white border border-slate-300 rounded-xl text-xs font-bold"
              />
            </div>

            {/* Session → Category dropdown tree */}
            <div className="bg-white rounded-3xl border border-slate-200 shadow-xl overflow-hidden">
              {Object.keys(documentTreeData).length === 0 ? (
                <div className="py-12 text-center space-y-3 px-6">
                  <FolderUp className="w-12 h-12 text-slate-300 mx-auto" />
                  <p className="text-sm font-bold text-slate-500">No sessions in evaluation tree yet.</p>
                  <p className="text-xs text-slate-400">Add a session above or upload results from Batch Folder Upload.</p>
                </div>
              ) : (
                <div className="divide-y divide-slate-100">
                  {Object.entries(documentTreeData).map(([sessionKey, categories]) => {
                    const sessionExpanded = expandedFolders[sessionKey] === true;
                    const sessionDocCount = Object.values(categories).reduce(
                      (acc, subPeriods) => acc + Object.values(subPeriods).reduce((a, b) => a + b.length, 0),
                      0
                    );

                    return (
                      <div key={sessionKey} className="bg-white">
                        {/* Session dropdown row */}
                        <button
                          type="button"
                          onClick={() => toggleFolderExpand(sessionKey)}
                          className="w-full flex items-center justify-between px-5 py-4 hover:bg-slate-50 transition-colors text-left"
                        >
                          <div className="flex items-center gap-3">
                            {sessionExpanded ? (
                              <ChevronDown className="w-5 h-5 text-blue-900 shrink-0" />
                            ) : (
                              <ChevronRight className="w-5 h-5 text-slate-400 shrink-0" />
                            )}
                            <span className="font-black text-sm text-slate-900 uppercase tracking-wide">
                              {sessionKey}
                            </span>
                          </div>
                          <span className="text-[10px] font-bold text-slate-500 bg-slate-100 px-2.5 py-1 rounded-full">
                            {sessionDocCount} doc{sessionDocCount !== 1 ? 's' : ''}
                          </span>
                        </button>

                        {/* Category dropdown rows */}
                        {sessionExpanded && (
                          <div className="pb-3 bg-slate-50/80 border-t border-slate-100">
                            {EXAM_TREE_CATEGORIES.map(cat => {
                              const subPeriods = categories[cat.id] || {};
                              const catPathKey = `${sessionKey}/${cat.id}`;
                              const catExpanded = expandedFolders[catPathKey] === true;
                              const catDocCount = Object.values(subPeriods).reduce(
                                (a, b) => a + b.length,
                                0
                              );
                              const isActive =
                                sessionName === sessionKey && evaluationCategory === cat.id;

                              return (
                                <div key={cat.id} className="border-b border-slate-100 last:border-b-0">
                                  <button
                                    type="button"
                                    onClick={() => {
                                      handleSelectTreeCategory(sessionKey, cat.id);
                                      toggleFolderExpand(catPathKey);
                                    }}
                                    className={`w-full flex items-center justify-between pl-10 pr-5 py-3 hover:bg-white transition-colors text-left ${
                                      isActive ? 'bg-blue-50' : ''
                                    }`}
                                  >
                                    <div className="flex items-center gap-2.5">
                                      {catExpanded ? (
                                        <ChevronDown className="w-4 h-4 text-indigo-600 shrink-0" />
                                      ) : (
                                        <ChevronRight className="w-4 h-4 text-slate-400 shrink-0" />
                                      )}
                                      <span className={`font-bold text-xs ${isActive ? 'text-blue-900' : 'text-slate-700'}`}>
                                        {cat.label}
                                      </span>
                                    </div>
                                    <span className="text-[10px] font-bold text-slate-400">
                                      {catDocCount} file{catDocCount !== 1 ? 's' : ''}
                                    </span>
                                  </button>

                                  {catExpanded && (
                                    <div className="px-5 pb-4 pl-14 space-y-3">
                                      {catDocCount === 0 ? (
                                        <p className="text-[11px] text-slate-400 italic py-2">
                                          No documents in {cat.label} for {sessionKey}.
                                        </p>
                                      ) : (
                                        Object.entries(subPeriods).map(([subPeriodKey, docList]) => {
                                          const subPathKey = `${sessionKey}/${cat.id}/${subPeriodKey}`;
                                          const subExpanded = expandedFolders[subPathKey] !== false;
                                          const showSubFolder = subPeriodKey && subPeriodKey !== 'General';

                                          return (
                                            <div key={subPeriodKey} className="space-y-2">
                                              {showSubFolder && (
                                                <button
                                                  type="button"
                                                  onClick={() => toggleFolderExpand(subPathKey)}
                                                  className="flex items-center gap-2 text-[11px] font-bold text-slate-600 hover:text-blue-900 w-full text-left py-1"
                                                >
                                                  {subExpanded ? (
                                                    <ChevronDown className="w-3.5 h-3.5" />
                                                  ) : (
                                                    <ChevronRight className="w-3.5 h-3.5" />
                                                  )}
                                                  <span>{subPeriodKey}</span>
                                                  <span className="text-slate-400 font-mono">({docList.length})</span>
                                                </button>
                                              )}

                                              {(subExpanded || !showSubFolder) && (
                                                <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                                                  {docList.map(doc => {
                                                    const student = students.find(
                                                      s => s.id === doc.student_id || s.roll_no === doc.student_roll
                                                    );

                                                    return (
                                                      <div
                                                        key={doc.id}
                                                        className="p-3 rounded-xl border border-slate-200 bg-white hover:border-blue-300 hover:shadow-md transition-all flex justify-between items-center gap-2"
                                                      >
                                                        <div className="space-y-1 min-w-0 flex-1">
                                                          <div className="flex items-center gap-1.5 font-bold text-slate-900 text-xs">
                                                            <FileText className="w-4 h-4 text-amber-600 shrink-0" />
                                                            <span className="truncate">
                                                              {doc.file_name || `${doc.student_roll || 'Result'}.pdf`}
                                                            </span>
                                                          </div>
                                                          <p className="text-[11px] text-slate-600 font-semibold truncate">
                                                            {doc.student_name || student?.full_name || 'N/A'} ({doc.student_roll})
                                                          </p>
                                                        </div>

                                                        <div className="flex flex-col gap-1 shrink-0">
                                                          <button
                                                            onClick={() => setPreviewModalDoc(doc)}
                                                            className="px-2 py-1 rounded-lg bg-blue-100 hover:bg-blue-200 text-blue-900 text-[10px] font-bold flex items-center gap-1"
                                                          >
                                                            <Eye className="w-3 h-3" /> View
                                                          </button>
                                                          <button
                                                            onClick={() => {
                                                              setEditModalDoc(doc);
                                                              setEditReplaceFile(null);
                                                            }}
                                                            className="px-2 py-1 rounded-lg bg-amber-100 hover:bg-amber-200 text-amber-900 text-[10px] font-bold flex items-center gap-1"
                                                          >
                                                            <Edit3 className="w-3 h-3" /> Edit
                                                          </button>
                                                          <button
                                                            onClick={() => handleDeleteDoc(doc)}
                                                            disabled={actionLoading === `delete-${doc.id}`}
                                                            className="px-2 py-1 rounded-lg bg-red-100 hover:bg-red-200 text-red-800 text-[10px] font-bold flex items-center gap-1 disabled:opacity-60"
                                                          >
                                                            {actionLoading === `delete-${doc.id}` ? (
                                                              <Loader2 className="w-3 h-3 animate-spin" />
                                                            ) : (
                                                              <Trash2 className="w-3 h-3" />
                                                            )}
                                                            Delete
                                                          </button>
                                                          <button
                                                            onClick={() => handleResendDocumentEmail(doc)}
                                                            disabled={actionLoading === `email-${doc.id}`}
                                                            className="px-2 py-1 rounded-lg bg-emerald-100 hover:bg-emerald-200 text-emerald-900 text-[10px] font-bold flex items-center gap-1 disabled:opacity-60"
                                                          >
                                                            {actionLoading === `email-${doc.id}` ? (
                                                              <Loader2 className="w-3 h-3 animate-spin" />
                                                            ) : (
                                                              <Mail className="w-3 h-3" />
                                                            )}
                                                            Email
                                                          </button>
                                                        </div>
                                                      </div>
                                                    );
                                                  })}
                                                </div>
                                              )}
                                            </div>
                                          );
                                        })
                                      )}
                                    </div>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

          </div>
        )}

      </div>

      {/* MODAL 1: CLEAN PDF DOCUMENT PREVIEW MODAL */}
      {previewModalDoc && (() => {
        const pdfUrl = resolveExamResultPdfUrl(previewModalDoc);
        return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-slate-950/85 backdrop-blur-md animate-in fade-in">
          <div className="bg-slate-900 text-white rounded-2xl sm:rounded-3xl max-w-5xl w-full h-[90vh] flex flex-col shadow-2xl border border-slate-800 overflow-hidden">
            
            {/* Header: File Title + Action Controls */}
            <div className="bg-slate-900 text-white px-5 py-3 border-b border-slate-800 flex justify-between items-center shrink-0">
              <div className="flex items-center gap-2.5">
                <FileText className="w-5 h-5 text-amber-400" />
                <h3 className="font-extrabold text-sm sm:text-base text-white truncate max-w-md">
                  {previewModalDoc.file_name || `${previewModalDoc.student_roll || 'Result'}.pdf`}
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
                  onClick={() => {
                    setEditModalDoc(previewModalDoc);
                    setEditReplaceFile(null);
                    setPreviewModalDoc(null);
                  }}
                  className="px-3 py-1.5 bg-amber-600 hover:bg-amber-500 text-white text-xs font-bold rounded-xl flex items-center gap-1.5"
                >
                  <Edit3 className="w-3.5 h-3.5" />
                  Edit
                </button>
                <button
                  onClick={() => handleDeleteDoc(previewModalDoc)}
                  className="px-3 py-1.5 bg-red-600 hover:bg-red-500 text-white text-xs font-bold rounded-xl flex items-center gap-1.5"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  Delete
                </button>
                <button 
                  onClick={() => setPreviewModalDoc(null)}
                  className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Body: uploaded PDF viewer */}
            <div className="flex-1 bg-slate-950 p-2 sm:p-4 overflow-hidden flex flex-col items-center justify-center">
              {pdfUrl ? (
                <object
                  data={pdfUrl}
                  type="application/pdf"
                  className="w-full h-full rounded-xl"
                >
                  <iframe 
                    src={pdfUrl} 
                    title={previewModalDoc.file_name || 'PDF Document'}
                    className="w-full h-full border-none bg-white rounded-xl"
                  />
                </object>
              ) : (
                <div className="text-center p-8 space-y-3 text-slate-300">
                  <AlertCircle className="w-12 h-12 text-amber-500 mx-auto" />
                  <p className="font-extrabold text-white text-base">No PDF File Attached</p>
                  <p className="text-xs text-slate-400">The selected record does not contain an uploaded PDF document.</p>
                </div>
              )}
            </div>

          </div>
        </div>
        );
      })()}

      {/* MODAL 2: EDIT PARAMETERS & RE-ROUTE STORAGE PATH MODAL */}
      {editModalDoc && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/80 backdrop-blur-sm animate-in fade-in">
          <div className="bg-white rounded-3xl max-w-lg w-full p-6 space-y-4 shadow-2xl border border-amber-200">
            <div className="flex justify-between items-center border-b pb-3">
              <h3 className="font-black text-slate-900 text-base flex items-center gap-2">
                <Edit3 className="w-5 h-5 text-amber-600" />
                Edit Parameters & Re-route Storage Path
              </h3>
              <button onClick={() => setEditModalDoc(null)} className="text-slate-400 hover:text-slate-700">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveEditDoc} className="space-y-4 text-xs">
              <div>
                <label className="block text-[11px] font-bold text-slate-700 uppercase mb-1">Student Roll Number</label>
                <input 
                  type="text"
                  value={editModalDoc.student_roll || ''}
                  onChange={e => setEditModalDoc({ ...editModalDoc, student_roll: e.target.value })}
                  className="w-full px-3 py-2 border rounded-xl font-mono font-bold"
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-700 uppercase mb-1">Student Name</label>
                <input
                  type="text"
                  value={editModalDoc.student_name || ''}
                  onChange={e => setEditModalDoc({ ...editModalDoc, student_name: e.target.value })}
                  className="w-full px-3 py-2 border rounded-xl font-bold"
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-700 uppercase mb-1">Exam / Report Title</label>
                <input
                  type="text"
                  value={editModalDoc.exam_name || ''}
                  onChange={e => setEditModalDoc({ ...editModalDoc, exam_name: e.target.value })}
                  className="w-full px-3 py-2 border rounded-xl font-bold"
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-700 uppercase mb-1">Session Name</label>
                <select
                  value={editModalDoc.session_name || 'Session 2026'}
                  onChange={e => setEditModalDoc({ ...editModalDoc, session_name: e.target.value })}
                  className="w-full px-3 py-2 border rounded-xl font-bold"
                >
                  {availableSessions.map(session => (
                    <option key={session} value={session}>{session}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-700 uppercase mb-1">Exam Type Category</label>
                <select
                  value={editModalDoc.exam_category || '1st Term'}
                  onChange={e => setEditModalDoc({ ...editModalDoc, exam_category: e.target.value as ExamTypeEnum })}
                  className="w-full px-3 py-2 border rounded-xl font-bold"
                >
                  <option value="Weekly Test">Weekly Test</option>
                  <option value="Monthly Test">Monthly Test</option>
                  <option value="1st Term">1st Term Examination</option>
                  <option value="2nd Term">2nd Term Examination</option>
                  <option value="Final">Final Examination</option>
                </select>
              </div>

              {editModalDoc.exam_category === 'Weekly Test' && (
                <div>
                  <label className="block text-[11px] font-bold text-amber-800 uppercase mb-1">Week Number</label>
                  <select
                    value={editModalDoc.week_number || 'Week 1'}
                    onChange={e => setEditModalDoc({ ...editModalDoc, week_number: e.target.value })}
                    className="w-full px-3 py-2 border border-amber-300 rounded-xl font-bold bg-amber-50"
                  >
                    <option value="Week 1">Week 1</option>
                    <option value="Week 2">Week 2</option>
                    <option value="Week 3">Week 3</option>
                    <option value="Week 4">Week 4</option>
                    <option value="Week 5">Week 5</option>
                  </select>
                </div>
              )}

              {editModalDoc.exam_category === 'Monthly Test' && (
                <div>
                  <label className="block text-[11px] font-bold text-emerald-800 uppercase mb-1">Month Name</label>
                  <select
                    value={editModalDoc.month_name || 'August'}
                    onChange={e => setEditModalDoc({ ...editModalDoc, month_name: e.target.value })}
                    className="w-full px-3 py-2 border border-emerald-300 rounded-xl font-bold bg-emerald-50"
                  >
                    <option value="January">January</option>
                    <option value="February">February</option>
                    <option value="March">March</option>
                    <option value="April">April</option>
                    <option value="May">May</option>
                    <option value="June">June</option>
                    <option value="July">July</option>
                    <option value="August">August</option>
                    <option value="September">September</option>
                    <option value="October">October</option>
                    <option value="November">November</option>
                    <option value="December">December</option>
                  </select>
                </div>
              )}

              <div>
                <label className="block text-[11px] font-bold text-slate-700 uppercase mb-1">Replace Result PDF (Optional)</label>
                <input
                  type="file"
                  accept=".pdf,application/pdf"
                  onChange={e => setEditReplaceFile(e.target.files?.[0] || null)}
                  className="w-full text-xs"
                />
                {editReplaceFile && (
                  <p className="text-[10px] text-emerald-700 font-bold mt-1">New file selected: {editReplaceFile.name}</p>
                )}
              </div>

              <div className="bg-blue-50 p-3 rounded-xl border border-blue-200">
                <span className="block text-[10px] font-black text-blue-900 uppercase">Calculated Re-route Target Path</span>
                <span className="font-mono text-[11px] font-bold text-blue-900">
                  ☁️ {constructSupabaseStoragePath(
                    editModalDoc.session_name || 'Session 2026',
                    editModalDoc.exam_category || '1st Term',
                    editModalDoc.week_number,
                    editModalDoc.month_name,
                    editModalDoc.student_roll || 'UNKNOWN'
                  )}
                </span>
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setEditModalDoc(null)}
                  className="px-4 py-2 bg-slate-200 text-slate-800 font-bold rounded-xl"
                >
                  Cancel
                </button>
                <LoadingButton
                  type="submit"
                  loading={actionLoading === 'edit-save'}
                  loadingText="Saving…"
                  className="px-5 py-2 bg-amber-600 hover:bg-amber-700 text-white font-extrabold rounded-xl flex items-center justify-center gap-2 disabled:opacity-70"
                >
                  Save & Re-route Document
                </LoadingButton>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 3: MANUAL SINGLE DOCUMENT UPLOAD MODAL */}
      {isAddSingleModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/80 backdrop-blur-sm animate-in fade-in">
          <div className="bg-white rounded-3xl max-w-lg w-full p-6 space-y-4 shadow-2xl border border-blue-200">
            <div className="flex justify-between items-center border-b pb-3">
              <h3 className="font-black text-slate-900 text-base flex items-center gap-2">
                <Plus className="w-5 h-5 text-blue-900" />
                Upload & Route Single Result PDF
              </h3>
              <button onClick={() => setIsAddSingleModalOpen(false)} className="text-slate-400 hover:text-slate-700">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleAddSingleDocumentSubmit} className="space-y-4 text-xs">
              <div>
                <label className="block text-[11px] font-bold text-slate-700 uppercase mb-1">Student Roll Number</label>
                <input 
                  type="text"
                  required
                  value={singleRollNo}
                  onChange={e => setSingleRollNo(e.target.value)}
                  placeholder="e.g. BS-SE-8201"
                  className="w-full px-3 py-2 border rounded-xl font-mono font-bold"
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-700 uppercase mb-1">Select Result PDF Document</label>
                <input 
                  type="file"
                  required
                  accept=".pdf,application/pdf"
                  onChange={e => setSingleFile(e.target.files?.[0] || null)}
                  className="w-full text-xs"
                />
              </div>

              <div className="bg-blue-50 p-3 rounded-xl border border-blue-200">
                <span className="block text-[10px] font-black text-blue-900 uppercase">Calculated Target Path</span>
                <span className="font-mono text-[11px] font-bold text-blue-900">
                  ☁️ {constructSupabaseStoragePath(
                    sessionName,
                    evaluationCategory,
                    subPeriodWeek,
                    subPeriodMonth,
                    singleRollNo || '[RollNo]'
                  )}
                </span>
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsAddSingleModalOpen(false)}
                  className="px-4 py-2 bg-slate-200 text-slate-800 font-bold rounded-xl"
                >
                  Cancel
                </button>
                <LoadingButton
                  type="submit"
                  loading={actionLoading === 'upload-single'}
                  loadingText="Uploading…"
                  className="px-5 py-2 bg-blue-900 hover:bg-blue-800 text-white font-extrabold rounded-xl flex items-center justify-center gap-2 disabled:opacity-70"
                >
                  Upload & Store Document
                </LoadingButton>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
};
