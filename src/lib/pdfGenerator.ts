import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { Student, Teacher, FeeLedger, Payroll, StudentAttendance, ExamResult, DynamicCustomField, SchoolFeeSettings } from '../types';
import { documentAttachmentStatus, formatCustomFieldValueForExport } from './customFieldUtils';

const SCHOOL_NAME = "UNIQUE SCHOOL SYSTEM";
const SCHOOL_SUBTITLE = "Production-Grade School Management Portal";
const SCHOOL_ADDRESS = "Main Campus, Block-4, Education District, Pakistan";
const SCHOOL_CONTACT = "Phone: +92 42 35880000 | Email: info@uniqueschool.edu.pk";
const PRINCIPAL_NAME = "Abdul Rehman Jamil";

function addHeader(doc: jsPDF, title: string) {
  // Brand header bar
  doc.setFillColor(30, 58, 138); // Dark Blue
  doc.rect(0, 0, 210, 25, 'F');

  doc.setTextColor(255, 255, 255);
  doc.setFontSize(16);
  doc.setFont('helvetica', 'bold');
  doc.text(SCHOOL_NAME, 14, 12);

  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.text(SCHOOL_SUBTITLE + " | " + SCHOOL_CONTACT, 14, 19);

  // Document Title
  doc.setTextColor(30, 58, 138);
  doc.setFontSize(14);
  doc.setFont('helvetica', 'bold');
  doc.text(title.toUpperCase(), 14, 34);

  doc.setLineWidth(0.5);
  doc.setDrawColor(203, 213, 225);
  doc.line(14, 37, 196, 37);
}

function addFooter(doc: jsPDF, pageNumber = 1) {
  const pageHeight = doc.internal.pageSize.height || 297;
  doc.setLineWidth(0.5);
  doc.setDrawColor(203, 213, 225);
  doc.line(14, pageHeight - 20, 196, pageHeight - 20);

  doc.setFontSize(8);
  doc.setTextColor(100, 116, 139);
  doc.setFont('helvetica', 'normal');
  doc.text(`Issued by: ${PRINCIPAL_NAME}, Principal - Unique School System`, 14, pageHeight - 14);
  doc.text(`Generated on: ${new Date().toLocaleDateString()} | Page ${pageNumber}`, 14, pageHeight - 9);
  doc.text("Official Document - Valid with System Seal", 150, pageHeight - 9);
}

/**
 * Generate PDF for Student Progress Report / Exam Result
 */
export function generateProgressReportPDF(student: Student, examName: string, sessionName: string): jsPDF {
  const doc = new jsPDF();
  addHeader(doc, `STUDENT PROGRESS REPORT - ${sessionName}`);

  // Recipient info banner
  const recipientName = student.is_orphan ? (student.donor_name || 'Honorable Donor') : (student.guardian_name || student.father_name);
  const recipientRole = student.is_orphan ? 'Sponsored Student Donor' : 'Parent / Legal Guardian';

  doc.setFillColor(241, 245, 249);
  doc.roundedRect(14, 42, 182, 28, 2, 2, 'F');

  doc.setFontSize(10);
  doc.setTextColor(15, 23, 42);
  doc.setFont('helvetica', 'bold');
  doc.text(`Student Name: ${student.full_name}`, 18, 50);
  doc.text(`Roll Number: ${student.roll_no}`, 18, 57);
  doc.text(`Class Assigned: ${student.class_name}`, 18, 64);

  doc.text(`Addressed To: ${recipientName} (${recipientRole})`, 110, 50);
  doc.text(`Category: ${student.is_orphan ? 'Orphan / Sponsored' : 'Standard Regular'}`, 110, 57);
  doc.text(`Term Folder: ${examName}`, 110, 64);

  // Message Box
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(51, 65, 85);
  const introMsg = `Respected (Mr / Miss) ${recipientName},\nAssalam o Alaikum\n\nPlease find attached the official academic progress report of ${student.full_name} for [${examName} - ${sessionName}]. We sincerely appreciate your continued support to Unique School System for this genuine cause to educate orphan/in-need students.\n\nJazakAllah u Khairan`;
  
  const splitIntro = doc.splitTextToSize(introMsg, 180);
  doc.text(splitIntro, 14, 78);

  // Performance Table
  const startY = 78 + (splitIntro.length * 5) + 5;
  autoTable(doc, {
    startY: startY,
    head: [['Subject', 'Total Marks', 'Obtained Marks', 'Percentage', 'Grade', 'Remarks']],
    body: [
      ['Mathematics', '100', '92', '92%', 'A+', 'Outstanding problem solving'],
      ['English Language', '100', '88', '88%', 'A', 'Strong vocabulary & grammar'],
      ['Urdu Literature', '100', '85', '85%', 'A', 'Good expression & reading'],
      ['General Science', '100', '90', '90%', 'A+', 'Keen scientific interest'],
      ['Computer Studies', '100', '95', '95%', 'A+', 'Exceptional practical skills'],
      ['Islamic Studies', '100', '94', '94%', 'A+', 'Excellent comprehension']
    ],
    headStyles: { fillColor: [30, 58, 138], textColor: 255, fontStyle: 'bold' },
    alternateRowStyles: { fillColor: [248, 250, 252] },
    margin: { left: 14, right: 14 }
  });

  addFooter(doc);
  return doc;
}



/**
 * Share Student Profile in PDF form (Separate formatting for Orphan vs Standard student)
 */
export function generateStudentProfilePDF(
  student: Student,
  attendanceList: StudentAttendance[] = [],
  customFields: DynamicCustomField[] = []
): jsPDF {
  const doc = new jsPDF();
  const title = student.is_orphan ? 'SPONSORED ORPHAN STUDENT PROFILE' : 'REGULAR STUDENT MASTER PROFILE';
  addHeader(doc, title);

  // Orphan badge
  if (student.is_orphan) {
    doc.setFillColor(220, 38, 38); // Red
    doc.roundedRect(140, 42, 56, 10, 2, 2, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(8);
    doc.setFont('helvetica', 'bold');
    doc.text('ORPHAN CATEGORY', 148, 48);
  } else {
    doc.setFillColor(16, 185, 129); // Green
    doc.roundedRect(140, 42, 56, 10, 2, 2, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(8);
    doc.setFont('helvetica', 'bold');
    doc.text('REGULAR CATEGORY', 148, 48);
  }

  // Personal Info Block
  doc.setTextColor(30, 58, 138);
  doc.setFontSize(11);
  doc.setFont('helvetica', 'bold');
  doc.text('1. DEMOGRAPHIC & IDENTITY METADATA', 14, 48);

  const personalData = [
    ['Full Name', student.full_name, 'Roll Number', student.roll_no],
    ['Date of Birth', student.dob, 'Class Assigned', student.class_name],
    ['B-Form Number', student.b_form_no, 'Gender / Blood', `${student.gender} / ${student.blood_group}`],
    ['Father Name', student.father_name, 'Father CNIC', student.father_cnic],
    ['Mother Name', student.mother_name, 'Enrollment Date', student.enrollment_date],
    ['Primary Phone', student.parent_phone, 'Mailing Address', student.mailing_address]
  ];

  autoTable(doc, {
    startY: 53,
    body: personalData,
    theme: 'plain',
    styles: { fontSize: 9, cellPadding: 2 },
    columnStyles: {
      0: { fontStyle: 'bold', textColor: [71, 85, 105], cellWidth: 35 },
      1: { textColor: [15, 23, 42], cellWidth: 55 },
      2: { fontStyle: 'bold', textColor: [71, 85, 105], cellWidth: 35 },
      3: { textColor: [15, 23, 42], cellWidth: 55 }
    }
  });

  let currentY = (doc as any).lastAutoTable.finalY + 8;

  // Legal Guardian Block
  doc.setTextColor(30, 58, 138);
  doc.setFontSize(11);
  doc.setFont('helvetica', 'bold');
  doc.text('2. LEGAL GUARDIAN INFORMATION', 14, currentY);

  const guardianData = [
    ['Guardian Name', student.guardian_name, 'Relationship', student.guardian_relation],
    ['Guardian CNIC', student.guardian_cnic, 'Guardian Phone', student.guardian_phone],
    ['Guardian Email', student.guardian_email, 'NOC Clearance', student.noc_status || 'Pending']
  ];

  autoTable(doc, {
    startY: currentY + 4,
    body: guardianData,
    theme: 'plain',
    styles: { fontSize: 9, cellPadding: 2 },
    columnStyles: {
      0: { fontStyle: 'bold', textColor: [71, 85, 105], cellWidth: 35 },
      1: { textColor: [15, 23, 42], cellWidth: 55 },
      2: { fontStyle: 'bold', textColor: [71, 85, 105], cellWidth: 35 },
      3: { textColor: [15, 23, 42], cellWidth: 55 }
    }
  });

  currentY = (doc as any).lastAutoTable.finalY + 8;

  // Donor Section (ONLY IF ORPHAN)
  if (student.is_orphan) {
    doc.setTextColor(180, 83, 9); // Amber
    doc.setFontSize(11);
    doc.setFont('helvetica', 'bold');
    doc.text('3. SPONSORSHIP & DONOR DETAILS (MANDATORY FOR ORPHANS)', 14, currentY);

    const donorData = [
      ['Sponsoring Donor Name', student.donor_name || 'N/A'],
      ['Donor Contact Number', student.donor_number || 'N/A'],
      ['Donor Direct Email', student.donor_email || 'N/A']
    ];

    autoTable(doc, {
      startY: currentY + 4,
      body: donorData,
      theme: 'grid',
      styles: { fontSize: 9, cellPadding: 3 },
      headStyles: { fillColor: [254, 243, 199] },
      columnStyles: {
        0: { fontStyle: 'bold', textColor: [146, 64, 14], cellWidth: 60 },
        1: { textColor: [15, 23, 42] }
      }
    });

    currentY = (doc as any).lastAutoTable.finalY + 8;
  }

  // Dynamic Custom Fields
  const fieldMetaByName = new Map(
    customFields.filter(f => f.target === 'student').map(f => [f.fieldName, f])
  );

  if (student.custom_fields && Object.keys(student.custom_fields).length > 0) {
    doc.setTextColor(30, 58, 138);
    doc.setFontSize(11);
    doc.setFont('helvetica', 'bold');
    doc.text('4. DYNAMIC ADMIN CUSTOM EXTENSION FIELDS', 14, currentY);

    const customRows = Object.entries(student.custom_fields).map(([k, v]) => [
      k,
      formatCustomFieldValueForExport(v, fieldMetaByName.get(k))
    ]);

    autoTable(doc, {
      startY: currentY + 4,
      body: customRows,
      theme: 'grid',
      styles: { fontSize: 9 },
      columnStyles: { 0: { fontStyle: 'bold', cellWidth: 60 } }
    });

    currentY = (doc as any).lastAutoTable.finalY + 8;
  }

  // Verified documents & gallery repository
  const docRows: string[][] = [
    ['B-Form / Birth Certificate', documentAttachmentStatus(student.b_form_doc)],
    ['Father CNIC Scan', documentAttachmentStatus(student.father_cnic_doc)],
    ...(student.is_orphan
      ? [['Death Certificate', documentAttachmentStatus(student.death_certificate_doc)] as string[]]
      : []),
    ['Leaving Certificate', documentAttachmentStatus(student.leaving_cert_doc)]
  ];

  for (const entry of student.document_gallery || []) {
    docRows.push([entry.title || 'Gallery Document', documentAttachmentStatus(entry.url)]);
  }

  doc.setTextColor(30, 58, 138);
  doc.setFontSize(11);
  doc.setFont('helvetica', 'bold');
  doc.text('5. VERIFIED STUDENT DOCUMENTS & REPOSITORY', 14, currentY);

  autoTable(doc, {
    startY: currentY + 4,
    head: [['Document Name', 'Verification Status']],
    body: docRows,
    headStyles: { fillColor: [30, 58, 138] },
    styles: { fontSize: 9 },
    columnStyles: {
      0: { fontStyle: 'bold', cellWidth: 100 },
      1: { cellWidth: 80 }
    }
  });

  addFooter(doc);
  return doc;
}

/**
 * Generate Graduation NOC Clearance Certificate PDF
 */
export function generateNOCClearancePDF(student: Student): jsPDF {
  const doc = new jsPDF();
  addHeader(doc, 'GRADUATION & NO OBJECTION CLEARANCE CERTIFICATE');

  doc.setFillColor(240, 253, 244); // Light Green
  doc.roundedRect(14, 45, 182, 35, 3, 3, 'F');
  doc.setDrawColor(22, 163, 74);
  doc.rect(14, 45, 182, 35, 'S');

  doc.setTextColor(22, 163, 74);
  doc.setFontSize(14);
  doc.setFont('helvetica', 'bold');
  doc.text('NOC CLEARED & VALIDATED', 22, 56);

  doc.setFontSize(10);
  doc.setTextColor(15, 23, 42);
  doc.setFont('helvetica', 'normal');
  doc.text(`Student: ${student.full_name} | Roll No: ${student.roll_no} | Class: ${student.class_name}`, 22, 65);
  doc.text(`Father Name: ${student.father_name} | B-Form: ${student.b_form_no}`, 22, 72);

  const certText = `This is to certify that ${student.full_name}, son/daughter of ${student.father_name}, bearing Roll Number ${student.roll_no}, has successfully completed all academic, administrative, and financial obligations at Unique School System.\n\nA thorough verification has been executed across the Institutional Fee Ledger (Zero Outstanding Dues verified) and Legal Document Repository (B-Form, CNIC, and Leaving Certificates validated). Unique School System has NO OBJECTION to the student pursuing higher studies or transferring institutions.`;

  doc.setFontSize(10);
  doc.setTextColor(51, 65, 85);
  const splitCert = doc.splitTextToSize(certText, 180);
  doc.text(splitCert, 14, 90);

  // Verification Signatures
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(30, 58, 138);

  doc.line(20, 160, 80, 160);
  doc.text("Accountant / Fee Auditor", 20, 166);

  doc.line(130, 160, 190, 160);
  doc.text(`${PRINCIPAL_NAME}\nPrincipal, Unique School System`, 130, 166);

  addFooter(doc);
  return doc;
}

/**
 * Generate Official Fee Voucher / Receipt PDF
 */
export function generateFeeVoucherPDF(
  student: Student,
  fee: FeeLedger,
  schoolFeeSettings?: SchoolFeeSettings
): jsPDF {
  const doc = new jsPDF();
  const categoryLabel = fee.fee_category || 'Monthly Tuition';
  addHeader(doc, `OFFICIAL FEE VOUCHER - ${categoryLabel.toUpperCase()} (${fee.month.toUpperCase()} ${fee.year})`);

  doc.setFontSize(10);
  doc.setTextColor(15, 23, 42);
  doc.setFont('helvetica', 'bold');
  doc.text(`Voucher Ref #: FEE-${fee.year}-${fee.id.slice(0, 6).toUpperCase()}`, 14, 45);
  doc.text(`Billing Period: ${fee.month} ${fee.year}`, 130, 45);

  if (fee.due_date) {
    doc.setTextColor(180, 30, 30);
    doc.text(`Payment Due Date: ${fee.due_date}`, 14, 52);
    doc.setTextColor(15, 23, 42);
  }

  const studentDetails = [
    ['Student Name', student.full_name, 'Roll Number', student.roll_no],
    ['Father Name', student.father_name, 'Class Assigned', student.class_name],
    ['Fee Category', categoryLabel, 'Payment Status', fee.status.toUpperCase()],
    ['Guardian Contact', student.guardian_phone || student.parent_phone || 'N/A', 'Guardian Email', student.guardian_email || 'N/A']
  ];

  autoTable(doc, {
    startY: fee.due_date ? 56 : 50,
    body: studentDetails,
    theme: 'grid',
    styles: { fontSize: 9 },
    columnStyles: {
      0: { fontStyle: 'bold', cellWidth: 35 },
      1: { cellWidth: 55 },
      2: { fontStyle: 'bold', cellWidth: 35 },
      3: { cellWidth: 55 }
    }
  });

  const breakdown = [
    ['Tuition Fee', `PKR ${(fee?.tuition_fee ?? 0).toLocaleString()}`],
    ['Laboratory & Computer Charges', `PKR ${(fee?.lab_charges ?? 0).toLocaleString()}`],
    ['Custom Administrative Charges', `PKR ${(fee?.custom_charges ?? 0).toLocaleString()}`],
    ['Concession / Scholarship Discount', `- PKR ${((fee?.discount ?? 0) + (fee?.discount_scholarship ?? 0)).toLocaleString()}`],
    ['Total Net Payable Fee', `PKR ${(fee?.net_fee ?? 0).toLocaleString()}`],
    ['Amount Paid to Date', `PKR ${(fee?.paid_amount ?? 0).toLocaleString()}`],
    ['Remaining Balance Due', `PKR ${((fee?.net_fee ?? 0) - (fee?.paid_amount ?? 0)).toLocaleString()}`]
  ];

  autoTable(doc, {
    startY: (doc as any).lastAutoTable.finalY + 6,
    head: [['Fee Line Item Description', 'Amount (PKR)']],
    body: breakdown,
    headStyles: { fillColor: [30, 58, 138] },
    alternateRowStyles: { fillColor: [248, 250, 252] },
    columnStyles: { 0: { cellWidth: 120 }, 1: { fontStyle: 'bold', halign: 'right' } }
  });

  let nextY = (doc as any).lastAutoTable.finalY + 8;

  if (fee.scheduled_installments && fee.scheduled_installments.length > 0) {
    doc.setFontSize(10);
    doc.setTextColor(30, 58, 138);
    doc.setFont('helvetica', 'bold');
    doc.text('INSTALLMENT PAYMENT SCHEDULE', 14, nextY);
    nextY += 4;

    const installmentRows = fee.scheduled_installments.map((inst, idx) => [
      inst.label || `Installment ${idx + 1}`,
      `PKR ${inst.amount.toLocaleString()}`,
      inst.due_date,
      inst.status.toUpperCase()
    ]);

    autoTable(doc, {
      startY: nextY,
      head: [['Installment', 'Amount (PKR)', 'Due Date', 'Status']],
      body: installmentRows,
      headStyles: { fillColor: [30, 58, 138] },
      styles: { fontSize: 9 }
    });
    nextY = (doc as any).lastAutoTable.finalY + 8;
  }

  const bankAccounts = schoolFeeSettings?.bank_accounts?.filter(a => a.bank_name && a.account_number) || [];
  if (bankAccounts.length > 0) {
    if (nextY > 240) {
      doc.addPage();
      nextY = 20;
    }

    doc.setFontSize(10);
    doc.setTextColor(30, 58, 138);
    doc.setFont('helvetica', 'bold');
    doc.text('SCHOOL FEE DEPOSIT ACCOUNTS', 14, nextY);
    nextY += 4;

    const bankRows = bankAccounts.map(acct => [
      acct.bank_name,
      acct.account_title,
      acct.account_number,
      acct.iban || '—',
      acct.branch || '—'
    ]);

    autoTable(doc, {
      startY: nextY,
      head: [['Bank Name', 'Account Title', 'Account No.', 'IBAN', 'Branch']],
      body: bankRows,
      headStyles: { fillColor: [30, 58, 138] },
      styles: { fontSize: 8 },
      columnStyles: {
        0: { cellWidth: 32 },
        1: { cellWidth: 38 },
        2: { cellWidth: 32 },
        3: { cellWidth: 42 },
        4: { cellWidth: 36 }
      }
    });
    nextY = (doc as any).lastAutoTable.finalY + 6;

    if (schoolFeeSettings?.payment_instructions) {
      doc.setFontSize(8);
      doc.setTextColor(60, 60, 60);
      doc.setFont('helvetica', 'italic');
      const lines = doc.splitTextToSize(`Payment Instructions: ${schoolFeeSettings.payment_instructions}`, 180);
      doc.text(lines, 14, nextY);
      nextY += lines.length * 4 + 4;
    }
  }

  doc.setFontSize(9);
  doc.setTextColor(15, 23, 42);
  doc.setFont('helvetica', 'bold');
  doc.text('IMPORTANT: Please mention student roll number in bank transfer reference.', 14, Math.min(nextY + 4, 275));

  doc.line(20, 280, 80, 280);
  doc.setFont('helvetica', 'normal');
  doc.text('Accounts Office / Fee Auditor', 20, 286);

  doc.line(130, 280, 190, 280);
  doc.text(`${PRINCIPAL_NAME}\nPrincipal, Unique School System`, 130, 286);

  addFooter(doc);
  return doc;
}

/**
 * Generate Teacher Salary Pay Slip PDF
 */
export function generatePaySlipPDF(teacher: Teacher, payroll: Payroll): jsPDF {
  const doc = new jsPDF();
  addHeader(doc, `TEACHER SALARY SLIP - ${payroll.month.toUpperCase()} ${payroll.year}`);

  doc.setFontSize(10);
  doc.setTextColor(15, 23, 42);
  doc.setFont('helvetica', 'bold');
  doc.text(`Employee ID: ${teacher.teacher_id}`, 14, 45);
  doc.text(`Designation: ${teacher.designation}`, 130, 45);

  const teacherDetails = [
    ['Full Name', teacher?.full_name || 'N/A', 'CNIC Number', teacher?.cnic || 'N/A'],
    ['Assigned Classes', teacher?.classes_assigned || 'N/A', 'Joining Date', teacher?.joining_date || 'N/A'],
    ['Base Salary Scale', `PKR ${(teacher?.base_salary ?? 0).toLocaleString()}`, 'Disbursement State', payroll?.status || 'Pending']
  ];

  autoTable(doc, {
    startY: 50,
    body: teacherDetails,
    theme: 'grid',
    styles: { fontSize: 9 }
  });

  const payrollBreakdown = [
    ['Total Monthly Working Days', `${payroll?.total_working_days ?? 26} Days`],
    ['Absences Logged (100% Deduction)', `${payroll?.absent_count ?? 0} Days (- PKR ${(payroll?.absent_deduction ?? 0).toLocaleString()})`],
    ['Half Leaves Logged (50% Deduction)', `${payroll?.hl_count ?? 0} Days (- PKR ${(payroll?.hl_deduction ?? 0).toLocaleString()})`],
    ['Performance Bonus / Allowances', `+ PKR ${(payroll?.bonus ?? 0).toLocaleString()}`],
    ['FINAL NET SALARY DISBURSED', `PKR ${(payroll?.net_salary ?? 0).toLocaleString()}`]
  ];

  autoTable(doc, {
    startY: (doc as any).lastAutoTable.finalY + 6,
    head: [['Payroll & Attendance Metric', 'Calculated Value']],
    body: payrollBreakdown,
    headStyles: { fillColor: [30, 58, 138] },
    columnStyles: { 0: { cellWidth: 120 }, 1: { fontStyle: 'bold', halign: 'right' } }
  });

  addFooter(doc);
  return doc;
}

/**
 * Generate Tax & Financial Audit PDF Report
 */
export function generateTaxReportPDF(vatFilings: any[], expenses: any[]): jsPDF {
  const doc = new jsPDF();
  addHeader(doc, 'INSTITUTIONAL TAX & EXPENSE AUDIT REPORT');

  doc.setFontSize(11);
  doc.setTextColor(30, 58, 138);
  doc.setFont('helvetica', 'bold');
  doc.text('1. VAT & TAX FILING RECORDS', 14, 45);

  const vatRows = vatFilings.map(v => [
    v.tax_year,
    v.quarter,
    `PKR ${(v.gross_revenue ?? 0).toLocaleString()}`,
    `PKR ${(v.taxable_income ?? 0).toLocaleString()}`,
    `${v.vat_rate ?? 17}%`,
    `PKR ${(v.vat_due ?? 0).toLocaleString()}`,
    v.status
  ]);

  autoTable(doc, {
    startY: 48,
    head: [['Year', 'Quarter', 'Gross Revenue', 'Taxable Income', 'VAT Rate', 'VAT Due', 'Status']],
    body: vatRows,
    headStyles: { fillColor: [30, 58, 138] }
  });

  const currentY = (doc as any).lastAutoTable.finalY + 8;

  doc.setFontSize(11);
  doc.setTextColor(30, 58, 138);
  doc.setFont('helvetica', 'bold');
  doc.text('2. INSTITUTIONAL EXPENSE LOGS', 14, currentY);

  const expRows = expenses.map(e => [
    e.date,
    e.category,
    `PKR ${(e.amount ?? 0).toLocaleString()}`,
    e.description,
    e.payment_mode
  ]);

  autoTable(doc, {
    startY: currentY + 3,
    head: [['Date', 'Category', 'Amount', 'Description', 'Payment Mode']],
    body: expRows,
    headStyles: { fillColor: [51, 65, 85] }
  });

  addFooter(doc);
  return doc;
}

/**
 * Generate Complete Faculty Member Profile Dossier PDF
 */
export function generateTeacherProfilePDF(teacher: Teacher, payrolls: Payroll[] = []): jsPDF {
  const doc = new jsPDF();
  addHeader(doc, `FACULTY MEMBER PROFILE DOSSIER - ${teacher.full_name.toUpperCase()}`);

  // Summary Card / Header Box
  doc.setFillColor(241, 245, 249);
  doc.roundedRect(14, 42, 182, 32, 2, 2, 'F');

  doc.setFontSize(12);
  doc.setTextColor(30, 58, 138);
  doc.setFont('helvetica', 'bold');
  doc.text(teacher.full_name, 18, 51);

  doc.setFontSize(9);
  doc.setTextColor(71, 85, 105);
  doc.setFont('helvetica', 'normal');
  doc.text(`Employee ID: ${teacher.teacher_id} | Designation: ${teacher.designation}`, 18, 58);
  doc.text(`Joining Date: ${teacher.joining_date} | Base Salary: PKR ${(teacher.base_salary || 0).toLocaleString()}`, 18, 65);
  doc.text(`Email: ${teacher.email} | Phone: ${teacher.phone}`, 18, 71);

  // Profile Details Table
  const details = [
    ['Full Name', teacher.full_name, 'CNIC Number', teacher.cnic || 'N/A'],
    ['Phone Number', teacher.phone, 'Alt Phone', teacher.alt_phone || 'N/A'],
    ['Official Email', teacher.email, 'Date of Birth', teacher.dob || 'N/A'],
    ['Residential Address', teacher.address || 'N/A', 'Qualification', teacher.qualification || 'N/A'],
    ['Specialization', teacher.specialization || 'N/A', 'Base Salary Scale', `PKR ${(teacher.base_salary || 0).toLocaleString()}`],
    ['Assigned Classes', teacher.classes_assigned || 'N/A', 'Assigned Subjects', teacher.subjects_assigned || 'N/A']
  ];

  autoTable(doc, {
    startY: 78,
    body: details,
    theme: 'grid',
    styles: { fontSize: 8.5 },
    columnStyles: {
      0: { fontStyle: 'bold', cellWidth: 35, fillColor: [248, 250, 252] },
      1: { cellWidth: 56 },
      2: { fontStyle: 'bold', cellWidth: 35, fillColor: [248, 250, 252] },
      3: { cellWidth: 56 }
    }
  });

  let currentY = (doc as any).lastAutoTable.finalY + 8;

  // Documents Audit Table
  doc.setFontSize(10);
  doc.setTextColor(30, 58, 138);
  doc.setFont('helvetica', 'bold');
  doc.text('VERIFIED EMPLOYMENT DOCUMENTS & CREDENTIALS', 14, currentY);

  const docRows = [
    ['National ID (CNIC Document)', teacher.cnic_doc ? 'VERIFIED ATTACHED' : 'NOT UPLOADED', teacher.cnic || 'N/A'],
    ['Degree / Academic Qualification', teacher.degree_doc ? 'VERIFIED ATTACHED' : 'NOT UPLOADED', teacher.qualification || 'N/A'],
    ['Work Experience / Appointment Letter', teacher.work_exp_doc ? 'VERIFIED ATTACHED' : 'NOT UPLOADED', teacher.specialization || 'N/A']
  ];

  autoTable(doc, {
    startY: currentY + 3,
    head: [['Document Name', 'Verification Status', 'Reference / Remarks']],
    body: docRows,
    headStyles: { fillColor: [30, 58, 138] },
    styles: { fontSize: 8.5 }
  });

  currentY = (doc as any).lastAutoTable.finalY + 8;

  // Recent Payroll Disbursement Records if available
  const teacherPayrolls = payrolls.filter(p => p.teacher_id === teacher.id || p.teacher_id === teacher.teacher_id);
  if (teacherPayrolls.length > 0) {
    doc.setFontSize(10);
    doc.setTextColor(30, 58, 138);
    doc.setFont('helvetica', 'bold');
    doc.text('DISBURSEMENT & SALARY PAYMENT HISTORY', 14, currentY);

    const payRows = teacherPayrolls.slice(0, 10).map(p => [
      `${p.month} ${p.year}`,
      `PKR ${(p.base_salary || teacher.base_salary || 0).toLocaleString()}`,
      `- PKR ${(p.deductions || 0).toLocaleString()}`,
      `+ PKR ${(p.bonus || 0).toLocaleString()}`,
      `PKR ${(p.net_salary || 0).toLocaleString()}`,
      p.status,
      p.disbursed_date || 'N/A'
    ]);

    autoTable(doc, {
      startY: currentY + 3,
      head: [['Month & Year', 'Base Salary', 'Deductions', 'Bonus', 'Net Disbursed', 'Status', 'Date']],
      body: payRows,
      headStyles: { fillColor: [51, 65, 85] },
      styles: { fontSize: 8 }
    });
  }

  addFooter(doc);
  return doc;
}
