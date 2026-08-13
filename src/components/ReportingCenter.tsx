import React, { useState } from 'react';
import { 
  FileSpreadsheet, 
  Users, 
  UserCheck, 
  Calendar, 
  CreditCard, 
  DollarSign, 
  Download,
  Building,
  CalendarCheck
} from 'lucide-react';
import { Student, Teacher, StudentAttendance, TeacherAttendance, FeeLedger, Payroll } from '../types';
import { exportStudentsToExcel, exportTeachersToExcel, exportPayrollToExcel, exportFeesToExcel, exportAttendanceToExcel } from '../lib/excelExporter';

interface ReportingCenterProps {
  students: Student[];
  teachers: Teacher[];
  studentAttendance: StudentAttendance[];
  teacherAttendance: TeacherAttendance[];
  fees: FeeLedger[];
  payrolls: Payroll[];
}

export const ReportingCenter: React.FC<ReportingCenterProps> = ({
  students,
  teachers,
  studentAttendance,
  teacherAttendance,
  fees,
  payrolls
}) => {
  const [attendanceFilter, setAttendanceFilter] = useState<'weekly' | 'monthly' | 'yearly' | 'all'>('all');

  const getFilteredAttendance = () => {
    const now = new Date();
    if (attendanceFilter === 'weekly') {
      const weekAgo = new Date(now);
      weekAgo.setDate(now.getDate() - 7);
      const weekStr = weekAgo.toISOString().slice(0, 10);
      return {
        students: studentAttendance.filter(a => a.date >= weekStr),
        teachers: teacherAttendance.filter(a => a.date >= weekStr)
      };
    } else if (attendanceFilter === 'monthly') {
      const monthAgo = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10);
      return {
        students: studentAttendance.filter(a => a.date >= monthAgo),
        teachers: teacherAttendance.filter(a => a.date >= monthAgo)
      };
    } else if (attendanceFilter === 'yearly') {
      const yearStart = `${now.getFullYear()}-01-01`;
      return {
        students: studentAttendance.filter(a => a.date >= yearStart),
        teachers: teacherAttendance.filter(a => a.date >= yearStart)
      };
    }
    return { students: studentAttendance, teachers: teacherAttendance };
  };

  const filteredLogs = getFilteredAttendance();

  return (
    <div className="max-w-7xl mx-auto p-4 sm:p-6 space-y-6">
      <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-xl space-y-2">
        <div className="flex items-center gap-2">
          <FileSpreadsheet className="w-6 h-6 text-blue-900" />
          <h2 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight">
            System Utilities & Global Excel Reporting Center
          </h2>
        </div>
        <p className="text-xs text-slate-500">
          Export full institutional operational archives into structured Excel (.xlsx) workbooks for local auditing.
        </p>
      </div>

      {/* Grid of Report Extraction Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        
        {/* Report 1: Whole School Attendance Master Report */}
        <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-xl space-y-4 hover:border-blue-900 transition-all col-span-1 md:col-span-2 lg:col-span-3">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b pb-4">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 bg-indigo-100 text-indigo-900 rounded-2xl flex items-center justify-center font-bold shrink-0">
                <CalendarCheck className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-lg font-extrabold text-slate-900">Whole School Attendance Master Report</h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Download complete institutional attendance sheets for all students and faculty staff across classes.
                </p>
              </div>
            </div>

            <div className="text-xs font-mono font-bold text-indigo-900 bg-indigo-50 px-3 py-1.5 rounded-xl border border-indigo-200">
              {filteredLogs.students.length} Student Logs &bull; {filteredLogs.teachers.length} Staff Logs Ready
            </div>
          </div>

          {/* Timeframe Filter Pills & Action Button */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pt-1">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs font-extrabold text-slate-700 mr-1">Filter Timeframe:</span>
              <button
                onClick={() => setAttendanceFilter('weekly')}
                className={`px-3.5 py-1.5 rounded-xl text-xs font-extrabold transition-all border ${
                  attendanceFilter === 'weekly'
                    ? 'bg-blue-900 text-white border-blue-900 shadow-sm'
                    : 'bg-slate-50 text-slate-700 hover:bg-slate-100 border-slate-300'
                }`}
              >
                Weekly (Last 7 Days)
              </button>
              <button
                onClick={() => setAttendanceFilter('monthly')}
                className={`px-3.5 py-1.5 rounded-xl text-xs font-extrabold transition-all border ${
                  attendanceFilter === 'monthly'
                    ? 'bg-blue-900 text-white border-blue-900 shadow-sm'
                    : 'bg-slate-50 text-slate-700 hover:bg-slate-100 border-slate-300'
                }`}
              >
                Monthly (Current Month)
              </button>
              <button
                onClick={() => setAttendanceFilter('yearly')}
                className={`px-3.5 py-1.5 rounded-xl text-xs font-extrabold transition-all border ${
                  attendanceFilter === 'yearly'
                    ? 'bg-blue-900 text-white border-blue-900 shadow-sm'
                    : 'bg-slate-50 text-slate-700 hover:bg-slate-100 border-slate-300'
                }`}
              >
                Yearly (Academic Year)
              </button>
              <button
                onClick={() => setAttendanceFilter('all')}
                className={`px-3.5 py-1.5 rounded-xl text-xs font-extrabold transition-all border ${
                  attendanceFilter === 'all'
                    ? 'bg-blue-900 text-white border-blue-900 shadow-sm'
                    : 'bg-slate-50 text-slate-700 hover:bg-slate-100 border-slate-300'
                }`}
              >
                All Time (Full Logs)
              </button>
            </div>

            <button
              onClick={() => exportAttendanceToExcel(filteredLogs.students, filteredLogs.teachers, students, teachers)}
              className="px-5 py-2.5 bg-blue-900 hover:bg-blue-800 text-white font-extrabold text-xs rounded-xl shadow-md flex items-center justify-center gap-2 transition-all shrink-0"
            >
              <Download className="w-4 h-4 text-amber-300" />
              Download Whole School Attendance Report (.xlsx)
            </button>
          </div>
        </div>

        {/* Report 2: Student Master Directory */}
        <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-xl space-y-4 hover:border-blue-900 transition-all">
          <div className="w-12 h-12 bg-blue-100 text-blue-900 rounded-2xl flex items-center justify-center font-bold">
            <Users className="w-6 h-6" />
          </div>
          <div>
            <h3 className="text-base font-bold text-slate-900">Master Student Roster Report</h3>
            <p className="text-xs text-slate-500 mt-1">
              Complete demographic records, B-Forms, guardian information, orphan sponsorship donor emails, and class assignments.
            </p>
          </div>
          <div className="text-xs font-mono font-bold text-blue-900">
            {students.length} Student Records Ready
          </div>
          <button
            onClick={() => exportStudentsToExcel(students)}
            className="w-full py-2.5 bg-blue-900 hover:bg-blue-800 text-white font-extrabold text-xs rounded-xl shadow flex items-center justify-center gap-2 transition-all"
          >
            <Download className="w-4 h-4 text-amber-300" />
            Download Student Excel Report
          </button>
        </div>

        {/* Report 2: Faculty Master Directory */}
        <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-xl space-y-4 hover:border-blue-900 transition-all">
          <div className="w-12 h-12 bg-indigo-100 text-indigo-900 rounded-2xl flex items-center justify-center font-bold">
            <UserCheck className="w-6 h-6" />
          </div>
          <div>
            <h3 className="text-base font-bold text-slate-900">Master Faculty & Staff Report</h3>
            <p className="text-xs text-slate-500 mt-1">
              Faculty sequence IDs (T-YYYY-XXX), plain text class assignment strings, salary scales, qualifications, and contacts.
            </p>
          </div>
          <div className="text-xs font-mono font-bold text-indigo-900">
            {teachers.length} Faculty Members Ready
          </div>
          <button
            onClick={() => exportTeachersToExcel(teachers)}
            className="w-full py-2.5 bg-blue-900 hover:bg-blue-800 text-white font-extrabold text-xs rounded-xl shadow flex items-center justify-center gap-2 transition-all"
          >
            <Download className="w-4 h-4 text-amber-300" />
            Download Faculty Excel Report
          </button>
        </div>

        {/* Report 3: Fee Manager & Defaulters Ledger */}
        <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-xl space-y-4 hover:border-blue-900 transition-all">
          <div className="w-12 h-12 bg-amber-100 text-amber-900 rounded-2xl flex items-center justify-center font-bold">
            <CreditCard className="w-6 h-6" />
          </div>
          <div>
            <h3 className="text-base font-bold text-slate-900">Fee Ledger & Defaulters Report</h3>
            <p className="text-xs text-slate-500 mt-1">
              Issued vouchers, overdue accounts, scholarship discounts, and electronic Brevo email targets.
            </p>
          </div>
          <div className="text-xs font-mono font-bold text-amber-900">
            {fees.length} Fee Invoices Recorded
          </div>
          <button
            onClick={() => exportFeesToExcel(fees, students)}
            className="w-full py-2.5 bg-blue-900 hover:bg-blue-800 text-white font-extrabold text-xs rounded-xl shadow flex items-center justify-center gap-2 transition-all"
          >
            <Download className="w-4 h-4 text-amber-300" />
            Download Fee Ledger Excel Report
          </button>
        </div>

        {/* Report 4: Payroll Master Disburse Archive */}
        <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-xl space-y-4 hover:border-blue-900 transition-all">
          <div className="w-12 h-12 bg-emerald-100 text-emerald-900 rounded-2xl flex items-center justify-center font-bold">
            <DollarSign className="w-6 h-6" />
          </div>
          <div>
            <h3 className="text-base font-bold text-slate-900">Payroll Disbursement Summary</h3>
            <p className="text-xs text-slate-500 mt-1">
              Monthly disbursements, bound attendance statistics, calculated absence/half-leave deductions, and net payouts.
            </p>
          </div>
          <div className="text-xs font-mono font-bold text-emerald-900">
            {payrolls.length} Payroll Sheets Archived
          </div>
          <button
            onClick={() => exportPayrollToExcel(payrolls, teachers)}
            className="w-full py-2.5 bg-blue-900 hover:bg-blue-800 text-white font-extrabold text-xs rounded-xl shadow flex items-center justify-center gap-2 transition-all"
          >
            <Download className="w-4 h-4 text-amber-300" />
            Download Payroll Excel Report
          </button>
        </div>

      </div>
    </div>
  );
};
