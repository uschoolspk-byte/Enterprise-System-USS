import * as XLSX from 'xlsx';
import { Student, Teacher, FeeLedger, StudentAttendance, TeacherAttendance } from '../types';

/**
 * Export Master Students Excel Spreadsheet
 */
export function exportStudentsToExcel(students: Student[]): void {
  const data = students.map(s => ({
    'Roll Number': s.roll_no,
    'Full Name': s.full_name,
    'Class Assigned': s.class_name,
    'Date of Birth': s.dob,
    'B-Form Number': s.b_form_no,
    'Gender': s.gender,
    'Blood Group': s.blood_group,
    'Father Name': s.father_name,
    'Father CNIC': s.father_cnic,
    'Mother Name': s.mother_name,
    'Parent Phone': s.parent_phone,
    'Emergency Contact': s.emergency_phone,
    'Mailing Address': s.mailing_address,
    'Enrollment Date': s.enrollment_date,
    'Guardian Name': s.guardian_name,
    'Guardian Relationship': s.guardian_relation,
    'Guardian CNIC': s.guardian_cnic,
    'Guardian Phone': s.guardian_phone,
    'Guardian Email': s.guardian_email,
    'Orphan Category': s.is_orphan ? 'YES (Sponsorship Active)' : 'NO (Regular)',
    'Donor Name': s.donor_name || 'N/A',
    'Donor Phone': s.donor_number || 'N/A',
    'Donor Email': s.donor_email || 'N/A',
    'NOC Status': s.noc_status || 'Pending',
    'Custom Dynamic Fields': JSON.stringify(s.custom_fields || {})
  }));

  const worksheet = XLSX.utils.json_to_sheet(data);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Master Student Directory');
  XLSX.writeFile(workbook, `Unique_School_Master_Students_${new Date().toISOString().slice(0, 10)}.xlsx`);
}

/**
 * Export Master Teachers Excel Spreadsheet
 */
export function exportTeachersToExcel(teachers: Teacher[]): void {
  const data = teachers.map(t => ({
    'Teacher Sequence ID': t.teacher_id,
    'Full Name': t.full_name,
    'Designation': t.designation,
    'CNIC Number': t.cnic,
    'Phone Number': t.phone,
    'Alternative Phone': t.alt_phone,
    'Email Address': t.email,
    'Residential Address': t.address,
    'Academic Qualification': t.qualification,
    'Specialization': t.specialization,
    'Joining Date': t.joining_date,
    'Base Salary (PKR)': t.base_salary,
    'Assigned Classes String': t.classes_assigned,
    'Custom Fields': JSON.stringify(t.custom_fields || {})
  }));

  const worksheet = XLSX.utils.json_to_sheet(data);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Master Teacher Directory');
  XLSX.writeFile(workbook, `Unique_School_Master_Teachers_${new Date().toISOString().slice(0, 10)}.xlsx`);
}

/**
 * Export Master Attendance Logs Spreadsheet in Matrix/Grid Layout
 * Columns: Roll No, Student Name, Class, [Date 1], [Date 2]..., Totals
 * Cell Values: P, A, L, HL or "P (Remark)", "HL (Fever)", "A (Urgent Work)"
 */
export function exportAttendanceToExcel(
  studentLogs: StudentAttendance[],
  teacherLogs: TeacherAttendance[],
  students: Student[],
  teachers: Teacher[]
): void {
  // 1. Build Student Attendance Matrix
  const studentDates = Array.from(new Set(studentLogs.map(l => l.date))).sort();
  const studentAttendanceMap = new Map<string, Map<string, StudentAttendance>>();
  studentLogs.forEach(log => {
    if (!studentAttendanceMap.has(log.student_id)) {
      studentAttendanceMap.set(log.student_id, new Map());
    }
    studentAttendanceMap.get(log.student_id)!.set(log.date, log);
  });

  const studentIdsWithLogs = new Set(studentLogs.map(l => l.student_id));
  const activeStudents = students.length > 0 
    ? students.filter(s => studentIdsWithLogs.has(s.id) || studentLogs.length === 0)
    : Array.from(studentIdsWithLogs).map(id => ({ id, full_name: id, roll_no: 'N/A', class_name: 'N/A' } as unknown as Student));

  const studentMatrixRows = activeStudents.map(student => {
    const studentLogsForThisStudent = studentAttendanceMap.get(student.id) || new Map();
    
    let presentCount = 0;
    let absentCount = 0;
    let leaveCount = 0;
    let halfLeaveCount = 0;

    const rowObj: Record<string, any> = {
      'Roll No': student.roll_no || 'N/A',
      'Student Name': student.full_name,
      'Class': student.class_name,
    };

    studentDates.forEach(date => {
      const log = studentLogsForThisStudent.get(date);
      if (!log) {
        rowObj[date] = '—';
      } else {
        const status = log.status || 'P';
        if (status === 'P') presentCount++;
        else if (status === 'A') absentCount++;
        else if (status === 'L') leaveCount++;
        else if (status === 'HL') halfLeaveCount++;

        if (log.hl_reason && log.hl_reason.trim()) {
          rowObj[date] = `${status} (${log.hl_reason.trim()})`;
        } else {
          rowObj[date] = status;
        }
      }
    });

    rowObj['Total Present'] = presentCount;
    rowObj['Total Absent'] = absentCount;
    rowObj['Total Leave'] = leaveCount;
    rowObj['Total Half Leave'] = halfLeaveCount;

    return rowObj;
  });

  // 2. Build Faculty / Staff Attendance Matrix
  const teacherDates = Array.from(new Set(teacherLogs.map(l => l.date))).sort();
  const teacherAttendanceMap = new Map<string, Map<string, TeacherAttendance>>();
  teacherLogs.forEach(log => {
    if (!teacherAttendanceMap.has(log.teacher_id)) {
      teacherAttendanceMap.set(log.teacher_id, new Map());
    }
    teacherAttendanceMap.get(log.teacher_id)!.set(log.date, log);
  });

  const teacherIdsWithLogs = new Set(teacherLogs.map(l => l.teacher_id));
  const activeTeachers = teachers.length > 0
    ? teachers.filter(t => teacherIdsWithLogs.has(t.id) || teacherLogs.length === 0)
    : Array.from(teacherIdsWithLogs).map(id => ({ id, full_name: id, teacher_id: 'N/A', designation: 'N/A' } as unknown as Teacher));

  const teacherMatrixRows = activeTeachers.map(teacher => {
    const logsForTeacher = teacherAttendanceMap.get(teacher.id) || new Map();
    let presentCount = 0;
    let absentCount = 0;
    let leaveCount = 0;
    let halfLeaveCount = 0;

    const rowObj: Record<string, any> = {
      'Faculty ID': teacher.teacher_id || 'N/A',
      'Faculty Name': teacher.full_name,
      'Designation': teacher.designation || 'Staff',
    };

    teacherDates.forEach(date => {
      const log = logsForTeacher.get(date);
      if (!log) {
        rowObj[date] = '—';
      } else {
        const status = log.status || 'P';
        if (status === 'P') presentCount++;
        else if (status === 'A') absentCount++;
        else if (status === 'L') leaveCount++;
        else if (status === 'HL') halfLeaveCount++;

        if (log.hl_reason && log.hl_reason.trim()) {
          rowObj[date] = `${status} (${log.hl_reason.trim()})`;
        } else {
          rowObj[date] = status;
        }
      }
    });

    rowObj['Total Present'] = presentCount;
    rowObj['Total Absent'] = absentCount;
    rowObj['Total Leave'] = leaveCount;
    rowObj['Total Half Leave'] = halfLeaveCount;

    return rowObj;
  });

  const workbook = XLSX.utils.book_new();
  const wsStudents = XLSX.utils.json_to_sheet(studentMatrixRows.length > 0 ? studentMatrixRows : [{ 'Roll No': 'No attendance records found' }]);
  const wsTeachers = XLSX.utils.json_to_sheet(teacherMatrixRows.length > 0 ? teacherMatrixRows : [{ 'Faculty ID': 'No attendance records found' }]);

  XLSX.utils.book_append_sheet(workbook, wsStudents, 'Student Attendance Grid');
  XLSX.utils.book_append_sheet(workbook, wsTeachers, 'Faculty Attendance Grid');

  XLSX.writeFile(workbook, `Unique_School_Attendance_Master_${new Date().toISOString().slice(0, 10)}.xlsx`);
}

/**
 * Export Individual Student Attendance Matrix & Report Spreadsheet
 */
export function exportSingleStudentAttendanceToExcel(
  student: Student,
  attendanceLogs: StudentAttendance[],
  presetLabel: string
): void {
  const dates = Array.from(new Set(attendanceLogs.map(l => l.date))).sort();
  const logByDate = new Map(attendanceLogs.map(l => [l.date, l]));

  let presentCount = 0;
  let absentCount = 0;
  let leaveCount = 0;
  let halfLeaveCount = 0;

  const matrixRow: Record<string, any> = {
    'Roll No': student.roll_no || 'N/A',
    'Student Name': student.full_name,
    'Class': student.class_name,
  };

  dates.forEach(date => {
    const log = logByDate.get(date);
    if (!log) {
      matrixRow[date] = '—';
    } else {
      const status = log.status || 'P';
      if (status === 'P') presentCount++;
      else if (status === 'A') absentCount++;
      else if (status === 'L') leaveCount++;
      else if (status === 'HL') halfLeaveCount++;

      if (log.hl_reason && log.hl_reason.trim()) {
        matrixRow[date] = `${status} (${log.hl_reason.trim()})`;
      } else {
        matrixRow[date] = status;
      }
    }
  });

  matrixRow['Total Present'] = presentCount;
  matrixRow['Total Absent'] = absentCount;
  matrixRow['Total Leave'] = leaveCount;
  matrixRow['Total Half Leave'] = halfLeaveCount;

  const detailedRows = attendanceLogs.map(l => ({
    'Logged Date': l.date,
    'Class': l.class_name,
    'Status': l.status === 'P' ? 'PRESENT (P)' : l.status === 'A' ? 'ABSENT (A)' : l.status === 'HL' ? 'HALF LEAVE (HL)' : 'LEAVE (L)',
    'Remarks / Reason': l.hl_reason || '—'
  }));

  const workbook = XLSX.utils.book_new();
  const wsMatrix = XLSX.utils.json_to_sheet([matrixRow]);
  const wsDetail = XLSX.utils.json_to_sheet(detailedRows.length > 0 ? detailedRows : [{ 'Logged Date': 'No logs recorded' }]);

  XLSX.utils.book_append_sheet(workbook, wsMatrix, 'Attendance Matrix');
  XLSX.utils.book_append_sheet(workbook, wsDetail, 'Detailed Logs');

  const sanitizedRoll = (student.roll_no || 'Student').replace(/[^a-zA-Z0-9_-]/g, '_');
  const sanitizedPreset = presetLabel.replace(/\s+/g, '_');
  XLSX.writeFile(workbook, `Attendance_Report_${sanitizedRoll}_${sanitizedPreset}_${new Date().toISOString().slice(0, 10)}.xlsx`);
}

/**
 * Export Individual Teacher / Faculty Attendance Matrix & Report Spreadsheet
 */
export function exportSingleTeacherAttendanceToExcel(
  teacher: Teacher,
  attendanceLogs: TeacherAttendance[],
  presetLabel: string
): void {
  const dates = Array.from(new Set(attendanceLogs.map(l => l.date))).sort();
  const logByDate = new Map(attendanceLogs.map(l => [l.date, l]));

  let presentCount = 0;
  let absentCount = 0;
  let leaveCount = 0;
  let halfLeaveCount = 0;

  const matrixRow: Record<string, any> = {
    'Faculty ID': teacher.teacher_id || 'N/A',
    'Faculty Name': teacher.full_name,
    'Designation': teacher.designation || 'Staff',
  };

  dates.forEach(date => {
    const log = logByDate.get(date);
    if (!log) {
      matrixRow[date] = '—';
    } else {
      const status = log.status || 'P';
      if (status === 'P') presentCount++;
      else if (status === 'A') absentCount++;
      else if (status === 'L') leaveCount++;
      else if (status === 'HL') halfLeaveCount++;

      if (log.hl_reason && log.hl_reason.trim()) {
        matrixRow[date] = `${status} (${log.hl_reason.trim()})`;
      } else {
        matrixRow[date] = status;
      }
    }
  });

  matrixRow['Total Present'] = presentCount;
  matrixRow['Total Absent'] = absentCount;
  matrixRow['Total Leave'] = leaveCount;
  matrixRow['Total Half Leave'] = halfLeaveCount;

  const detailedRows = attendanceLogs.map(l => ({
    'Logged Date': l.date,
    'Status': l.status === 'P' ? 'PRESENT (P)' : l.status === 'A' ? 'ABSENT (A)' : l.status === 'HL' ? 'HALF LEAVE (HL)' : 'LEAVE (L)',
    'Remarks / Reason': l.hl_reason || '—'
  }));

  const workbook = XLSX.utils.book_new();
  const wsMatrix = XLSX.utils.json_to_sheet([matrixRow]);
  const wsDetail = XLSX.utils.json_to_sheet(detailedRows.length > 0 ? detailedRows : [{ 'Logged Date': 'No logs recorded' }]);

  XLSX.utils.book_append_sheet(workbook, wsMatrix, 'Attendance Matrix');
  XLSX.utils.book_append_sheet(workbook, wsDetail, 'Detailed Logs');

  const sanitizedId = (teacher.teacher_id || 'Faculty').replace(/[^a-zA-Z0-9_-]/g, '_');
  const sanitizedPreset = presetLabel.replace(/\s+/g, '_');
  XLSX.writeFile(workbook, `Faculty_Attendance_Report_${sanitizedId}_${sanitizedPreset}_${new Date().toISOString().slice(0, 10)}.xlsx`);
}

/**
 * Export Fee Ledger Spreadsheet
 */
export function exportFeesToExcel(fees: FeeLedger[], students: Student[]): void {
  exportFeeLedgerToExcel(fees, students);
}

export function exportFeeLedgerToExcel(fees: FeeLedger[], students: Student[]): void {
  const studentMap = new Map(students.map(s => [s.id, s]));

  const data = fees.map(f => {
    const s = studentMap.get(f.student_id);
    return {
      'Student Name': s?.full_name || 'N/A',
      'Roll Number': s?.roll_no || 'N/A',
      'Class': s?.class_name || 'N/A',
      'Category': s?.is_orphan ? 'Orphan' : 'Regular',
      'Billing Month': f.month,
      'Billing Year': f.year,
      'Tuition Fee': f.tuition_fee,
      'Net Payable Fee': f.net_fee,
      'Paid Amount': f.paid_amount,
      'Payment Status': f.status
    };
  });

  const worksheet = XLSX.utils.json_to_sheet(data);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Fee Ledger');
  XLSX.writeFile(workbook, `Unique_School_Fee_Ledger_${new Date().toISOString().slice(0, 10)}.xlsx`);
}

/**
 * Export Payroll Ledger Spreadsheet
 */
export function exportPayrollToExcel(payrolls: any[], teachers: Teacher[]): void {
  const teacherMap = new Map(teachers.map(t => [t.id, t]));

  const data = payrolls.map(p => {
    const t = teacherMap.get(p.teacher_id);
    return {
      'Teacher ID': t?.teacher_id || 'N/A',
      'Full Name': t?.full_name || 'N/A',
      'Designation': t?.designation || 'N/A',
      'Month': p.month,
      'Year': p.year,
      'Base Scale': p.base_salary,
      'P Days': p.present_count,
      'A Days': p.absent_count,
      'HL Days': p.half_leave_count,
      'Deductions': p.deductions,
      'Net Disbursed': p.net_salary
    };
  });

  const worksheet = XLSX.utils.json_to_sheet(data);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Payroll Summary');
  XLSX.writeFile(workbook, `Unique_School_Payroll_${new Date().toISOString().slice(0, 10)}.xlsx`);
}

/**
 * Ingest and Parse Generic Excel File
 */
export async function parseExcelFile(file: File): Promise<any[]> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target?.result as ArrayBuffer);
        const workbook = XLSX.read(data, { type: 'array' });
        const firstSheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[firstSheetName];
        const json = XLSX.utils.sheet_to_json(worksheet);
        resolve(json);
      } catch (err) {
        reject(err);
      }
    };
    reader.onerror = (err) => reject(err);
    reader.readAsArrayBuffer(file);
  });
}

/**
 * Ingest and Parse Tahir Tax Excel File
 */
export async function parseTahirTaxExcel(file: File): Promise<any> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target?.result as ArrayBuffer);
        const workbook = XLSX.read(data, { type: 'array' });
        const firstSheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[firstSheetName];
        const json = XLSX.utils.sheet_to_json(worksheet);

        // Summarize Tax & Financial Data
        let totalRevenue = 0;
        let totalTaxable = 0;
        let totalVatDue = 0;

        json.forEach((row: any) => {
          totalRevenue += Number(row['Revenue'] || row['Gross Revenue'] || row['Amount'] || 0);
          totalTaxable += Number(row['Taxable'] || row['Taxable Income'] || 0);
          totalVatDue += Number(row['VAT'] || row['Tax Due'] || row['VAT Due'] || 0);
        });

        resolve({
          sheetName: firstSheetName,
          rowCount: json.length,
          rawRows: json.slice(0, 50),
          totalRevenue,
          totalTaxable,
          totalVatDue
        });
      } catch (err) {
        reject(err);
      }
    };
    reader.onerror = (err) => reject(err);
    reader.readAsArrayBuffer(file);
  });
}
