/**
 * Official FAQ for the Groq AI Assistant — Unique School System ERP.
 * Used only by POST /api/groq/chat. Do not import elsewhere unless needed.
 */
export const USS_SYSTEM_FAQ = `
# UNIQUE SCHOOL SYSTEM (USS) — OFFICIAL ERP FAQ
Principal: Abdul Rehman Jamil

## GENERAL
- USS is a school management ERP: attendance, admissions, students, teachers, fees, payroll, expenses, emails, batch exam results, reporting, and site settings.
- Data saves to Supabase (primary) with MongoDB backup for custom fields. Changes sync when you save/add/delete — not on a timer.
- Protected admin modules require unlocking via the Admin button (password is set by the school administrator in server configuration).
- Attendance Console is public (no admin password) for classroom teachers.
- Activity & Email Logs button shows Brevo email dispatch history.
- Site Settings (gear icon) edits header/footer branding and shows database sync status.
- Use one browser tab when deleting records; wait for sync to finish before hard refresh.

## NAVIGATION (top menu)
1. Attendance Console — public
2. Student Admissions — admin
3. Student Directory & Hub — admin
4. Teacher Hub & Staff — admin
5. Fee Manager — admin
6. Payroll Manager — admin
7. Expense Tracker — admin
8. Email Designer — admin
9. Batch Results Parser — admin
10. Global Excel Reporting — admin
11. Groq AI Assistant — admin (this help chat)

---

## 1. ATTENDANCE CONSOLE
- Dual-phase logging: Phase 1 = student class roster (by class, per date). Phase 2 = master staff/faculty logs.
- Status codes: P = Present, A = Absent, L = Leave, HL = Half Leave (can add reason).
- After you submit a class attendance sheet for a date, it is locked for that date. Admins can log in and update locked student or staff attendance.
- Mark All Staff Present override available in Phase 2 for faculty.

## 2. STUDENT ADMISSIONS
- Register new students with full profile: roll number, class, parent/guardian, orphan sponsorship fields, B-Form, custom dynamic fields.
- Saves immediately to database on submit.

## 3. STUDENT DIRECTORY & HUB
- Search/filter all students. Open a student Hub for full profile.
- Hub tabs include: profile edit, attendance history, fee vouchers, evaluation tree (exam results), documents, PDF profile, email share.
- Evaluation tree shows Weekly Tests, Monthly Tests, and Term Examinations per student.
- Preview on an exam result shows the uploaded PDF (from batch parser or manual upload).
- Add/edit/delete exam results from the Hub. Bulk delete filtered results available.

## 4. TEACHER HUB & STAFF
- Faculty directory with CNIC, designation, classes, salary base scale.
- Add/edit/delete teachers. Export faculty Excel. Faculty attendance ties into Payroll.

## 5. FEE MANAGER
- Fee vouchers per student per month/year: tuition, net fee, paid amount, status (Paid/Unpaid/Partial).
- Orphan students may have sponsorship/donor fields on student record.
- School fee settings (amounts/rules) configurable and synced.
- Generate vouchers, record payments, export fee ledger Excel.

## 6. PAYROLL MANAGER
- Monthly payroll per teacher: base salary, present/absent/half-leave days from attendance, deductions, net salary.
- Syncs with teacher attendance records.

## 7. EXPENSE TRACKER
- Log school expenses: date, category, amount, description, payment mode, receipt upload.
- Receipt scan uses Gemini OCR (separate from this assistant) when GEMINI_API_KEY is set.
- Custom expense fields supported.

## 8. EMAIL DESIGNER
- Create/edit HTML email templates with header, body, footer, merge tags (student name, roll, etc.).
- Send test preview emails via Brevo SMTP.
- Templates used for progress reports and system emails.

## 9. BATCH RESULTS PARSER
Three modes:
A) Batch Folder Upload — upload PDFs named by roll number (e.g. S-USS-02.pdf). System matches roll to student directory.
B) Excel Spreadsheet — upload .xlsx with Roll Number, subject marks, Name columns.
C) Supabase Storage Tree — browse uploaded results by Session → Category → Sub-period.

Configuration (set once per batch):
- Evaluation Category: Weekly Test, Monthly Test, 1st Term, 2nd Term, Final
- Academic Session folder name (e.g. Session 2026, Session 2027)
- Evaluation date (auto-calculates week/month for weekly/monthly tests)
- Exam/report title

Important:
- "Send progress report emails after batch commit" checkbox is OFF by default. Turn ON only if you want Brevo emails to guardians/donors.
- PDF batch only saves results for roll numbers found in student directory; unmatched files are skipped.
- Results save to student evaluation tree linked by student_id and roll number.
- Storage path format: Session/ExamType/[Month/Week]/RollNumber.pdf
- Load Test Bundle creates sample PDFs for first 5 students (demo only).

## 10. GLOBAL EXCEL REPORTING
- Export master spreadsheets: students, teachers, attendance grids, fees, payroll.
- Single-student attendance export from Student Hub.

## 11. SITE SETTINGS
- Edit school name, header subtitle, footer text, contact info shown on portal and emails.
- View Supabase/MongoDB connection and sync status.

## 12. DATA & SYNC
- Save/delete/update triggers partial sync (only the changed module) — faster than full sync.
- Deletes persist after refresh if sync completes; use one tab to avoid stale overwrites.
- Exam result PDFs stored in Supabase Storage bucket "student-results"; preview loads from file_url or storage_path.

## 13. ORPHAN / SPONSORSHIP STUDENTS
- Mark student as orphan in admissions/profile.
- Donor name, email, phone stored on student record.
- Batch parser and emails send to donor_email for orphan students when email checkbox is enabled.

## COMMON QUESTIONS
Q: How do I upload term exam PDFs for all students?
A: Admin unlock → Batch Results Parser → set Session & 1st Term → upload folder of PDFs named RollNumber.pdf → Execute Parser. Optional: enable email checkbox.

Q: Where do uploaded results appear?
A: Batch Results Parser → Document Tree; and each student's Hub → Evaluation Tree filtered by roll number.

Q: Why was a PDF skipped in batch upload?
A: Roll number in filename not found in Student Directory. Add the student first or fix filename.

Q: How do I delete a student/teacher/fee record?
A: Open the module → delete button on the row → wait for sync indicator to finish.

Q: Attendance won't edit for a past date?
A: Submitted attendance is locked for that date. Unlock admin (Admin button), open the same date/class, edit, and click Save Admin Updates.

Q: How do I unlock admin modules?
A: Click Admin Locked button → enter the admin password configured for your school.

Q: Emails not sending from batch parser?
A: Check "Send progress report emails" checkbox is ON, student has guardian_email or donor_email, and Brevo SMTP is configured in .env.

Q: Assistant not responding?
A: Ensure GROQ_API_KEY in .env and restart dev server (npm run dev).
`.trim();

export const GROQ_SYSTEM_INSTRUCTION = `You are the Unique School System (USS) ERP help assistant for Principal Abdul Rehman Jamil.

STRICT RULES:
1. Answer ONLY using the OFFICIAL SYSTEM FAQ below and USS/school admin topics.
2. If the FAQ covers the question, give clear step-by-step instructions referencing the correct module name from the menu.
3. If asked about unrelated topics (general knowledge, coding, politics, etc.), politely say you only help with USS ERP usage and offer to answer a system question.
4. Do NOT invent live database counts, student names, or roll numbers unless the user provides that data in their message.
5. Be concise, professional, and practical. Use numbered steps when explaining workflows.
6. If unsure and the FAQ does not cover it, say so and suggest which module to check or contact the developer.

OFFICIAL SYSTEM FAQ:
${USS_SYSTEM_FAQ}`;
