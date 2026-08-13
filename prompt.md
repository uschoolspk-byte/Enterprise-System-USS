# Unique School System (USS) - Comprehensive Cursor Prompt & Project Guide

> **Instructions for Cursor AI / Developer**: Read this entire file carefully when opening or importing this codebase into Cursor IDE. This document specifies the full architecture, backend-frontend connection, environment variables, Supabase primary data persistence, MongoDB custom form field & expense management, email designer & dispatch integration, and student ID formatting.

---

## 🚀 Quick Start & How to Run Locally

1. **Install Dependencies**:
   ```bash
   npm install
   ```

2. **Environment Configuration**:
   Create a `.env` file in the project root by copying `.env.example`:
   ```env
   # App Host
   PORT=3000
   APP_URL="http://localhost:3000"

   # Gemini AI Key
   GEMINI_API_KEY="YOUR_GEMINI_API_KEY"

   # Supabase Credentials (PRIMARY DATA STORE - All Entities & App Data)
   SUPABASE_URL="https://YOUR_PROJECT.supabase.co"
   SUPABASE_ANON_KEY="YOUR_SUPABASE_ANON_KEY"
   VITE_SUPABASE_URL="https://YOUR_PROJECT.supabase.co"
   VITE_SUPABASE_ANON_KEY="YOUR_SUPABASE_ANON_KEY"

   # MongoDB Atlas Database (DYNAMIC CUSTOM FORM FIELDS & EXPENSE TRACKER STORAGE)
   MONGODB_URI="mongodb+srv://YOUR_USER:YOUR_PASSWORD@YOUR_CLUSTER.mongodb.net"
   MONGODB_DB_NAME="uschools_db"

   # Brevo SMTP Email Relay (set in .env only — never commit real keys)
   SMTP_HOST="smtp-relay.brevo.com"
   SMTP_PORT="587"
   SMTP_USER="YOUR_BREVO_SMTP_LOGIN"
   SMTP_PASS="YOUR_BREVO_SMTP_KEY"
   SMTP_FROM_EMAIL="your-school@example.com"
   SMTP_FROM_NAME="Unique School System"
   ```

3. **Start Development Server**:
   ```bash
   npm run dev
   ```
   *The server runs on `http://localhost:3000` using Vite middleware inside Express (`server.ts`).*

4. **Production Build & Execution**:
   ```bash
   npm run build
   npm start
   ```

---

## 🔌 FRONTEND TO BACKEND CONNECTION GUIDE FOR CURSOR AI

If the backend becomes disconnected or APIs fail to respond after downloading the codebase:

### 1. How the Frontend Connects to the Backend
- **API Client Entrypoint**: `src/lib/apiClient.ts` contains all REST methods (`fetchAllData`, `syncStateToMongo`, `sendTestEmail`, `scanReceiptImage`, etc.).
- **Backend Entrypoint**: `server.ts` is an Express app running on port `3000` that embeds Vite middleware in development mode.
- **Data Flow**:
  1. On initial load, `App.tsx` calls `fetchAllData()` from `src/lib/apiClient.ts` which requests `GET /api/db/all`.
  2. `server.ts` fetches entity collections from Supabase (`students`, `teachers`, `fees`, `payrolls`, `exam_results`, `expenses`, `email_templates`) and MongoDB Atlas (`custom_fields`, `expenses`, `email_templates`).
  3. Whenever state changes in React, `App.tsx` calls `syncStateToMongo(statePayload)` which posts to `POST /api/db/sync`.
  4. `server.ts` writes upserts into Supabase tables/store and MongoDB Atlas collections (`uschools_db`).

### 2. Troubleshooting Disconnected Backend in Cursor
If you receive connection errors or empty data:
1. **Check Express Server Status**: Ensure `server.ts` is running (`npm run dev` or `npx tsx server.ts`).
2. **Verify CORS / Relative Paths**: Frontend API calls in `src/lib/apiClient.ts` use relative paths like `/api/db/all` and `/api/db/sync`. Since Express serves Vite on port 3000, relative fetch URLs automatically target the server.
3. **Verify Database Connection Strings**:
   - Check that `MONGODB_URI` connects to `cluster0.5u9exix.mongodb.net`.
   - Check that `SUPABASE_URL` and `SUPABASE_ANON_KEY` in `.env` match your Supabase project settings.
4. **Fixing Stale State**: If database network is blocked, `App.tsx` gracefully falls back to `src/lib/initialData.ts` and `localStorage` so the UI never crashes.

---

## 🎯 Key System Specifications & Connected Modules

### 1. Expense Tracker Module (Saved in MongoDB Atlas & Supabase)
- **Database Persistence**: Expense records are stored in MongoDB Atlas `expenses` collection (`uschools_db.expenses`) as well as Supabase `expenses` table.
- **AI Receipt Scanner**: Users can upload/scan receipt images via the UI. The request is sent to `POST /api/expense/scan-receipt`, which uses Gemini Vision AI (`gemini-3.6-flash`) to extract `amount`, `date`, `category`, `description`, and `payment_mode`.
- **Manual Payment Category & Payment Mode Customization**: Users can manually add custom expense categories and custom payment modes (e.g., "JazzCash", "EasyPaisa", "Petty Cash", "SadaPay", "Bank Deposit") directly in the UI without breaking existing records.

### 2. Email Designer & Brevo SMTP Integration Engine
- **Template Builder**: Visual template editor (`EmailDesigner.tsx`) allows creating, editing, and previewing custom HTML email templates (Fee Reminders, Progress Reports, Salary Payslips, Donor Updates).
- **Global System Saving**: Templates are saved globally to `email_templates` collection in MongoDB Atlas and Supabase.
- **SMTP Test Dispatcher**: Integrated test email dispatcher (`POST /api/email/send-test`) tests live email delivery via Brevo SMTP.

### 3. Dynamic Custom Form Fields in MongoDB Atlas
- **Form Field Customization**: MongoDB Atlas (`uschools_db` cluster) is specifically allocated for managing custom form fields schema (`custom_fields` collection) — allowing administrators to add, edit, remove, and drag-and-drop dynamic input fields across all forms.

### 4. Primary Data Storage in Supabase
- **All Application Data**: Students, Teachers, Fee Ledgers, Payroll Records, Exam Results, and Email Logs are persisted directly into **Supabase** database tables / stores (`students`, `teachers`, `fees`, `payrolls`, `exam_results`, `email_logs`, `app_store`).

### 5. Scanned Documents & Salary Pay Slips Full CRUD & Universal Preview
- **Universal Document Preview Modal**: `DocumentPreviewModal.tsx` provides iframe/PDF.js/image preview capabilities across all modules.
- **Scanned Documents CRUD**:
  - **Faculty Documents**: Scanned CNIC, Degree Certificates, Work Experience certificates, and Profile Photos in `TeacherHub.tsx` support Upload (`<Upload />`), Replace (`FileReader`/Supabase Storage), Preview (`<Eye />` button in `DocumentPreviewModal`), and Deletion (`<Trash2 />`).
  - **Student Documents**: Birth Certificate / B-Form, Guardian CNIC, Previous School Transfer Certificates, and Exam Result PDF Slips in `StudentHub.tsx` support Upload, Replace, Preview, and Deletion.
  - **Expense Receipts**: Operational expense vouchers and bills in `ExpenseTracker.tsx` support Gemini AI OCR scanning, manual image/PDF upload, live receipt preview, and deletion.
- **Salary Pay Slips CRUD & Preview**:
  - **Payroll Management**: `PayrollManager.tsx` and `TeacherHub.tsx` allow creating monthly salary records, editing base salary/deductions/bonuses, deleting salary entries, previewing generated PDF pay slips instantly via `DocumentPreviewModal`, downloading slips, and emailing slips directly to faculty using Brevo SMTP.

### 6. Student ID Generation Format (`S-USS-XX`)
- **Format Constraint**: All student identifiers MUST strictly follow the prefix format `S-USS-01`, `S-USS-02`, `S-USS-03`, `S-USS-04`, etc.
- **Initial Data**: Standard students in `src/lib/initialData.ts` start at `S-USS-01`.
- **New Admissions**: The admission handler in `src/components/StudentAdmissions.tsx` dynamically formats generated student roll numbers as `S-USS-XX`.

---

## 📧 BREVO SMTP EMAIL RELAY & DISPATCH SYSTEM (COMPLETE SPECIFICATION)

### 1. Brevo SMTP Connection DSN & Credentials
Brevo (formerly Sendinblue) provides the primary SMTP relay server for sending transactional emails and attachments.

- **SMTP Relay Host**: `smtp-relay.brevo.com`
- **Port**: `587` (TLS / STARTTLS) or `465` (SSL)
- **SMTP Username**: set `SMTP_USER` in `.env` (from Brevo dashboard)
- **SMTP Password / Key**: set `SMTP_PASS` in `.env` only — never hardcode in source
- **Default Sender Email (`SMTP_FROM_EMAIL`)**: your verified sender in Brevo
- **Default Sender Name (`SMTP_FROM_NAME`)**: `Unique School System`

### 2. Backend Nodemailer Implementation in `server.ts`
The Express server initializes an on-demand Nodemailer transporter (`createTransporter()` function in `server.ts`):

```ts
function createTransporter() {
  const host = process.env.SMTP_HOST || 'smtp-relay.brevo.com';
  const port = parseInt(process.env.SMTP_PORT || '587');
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;

  if (user && pass) {
    return nodemailer.createTransport({
      host,
      port,
      secure: port === 465,
      auth: { user, pass }
    });
  }
  return null;
}
```

### 3. Complete Brevo Email Endpoints in `server.ts`

| Endpoint | Method | Trigger Component | Description & Attachments |
| :--- | :--- | :--- | :--- |
| `/api/email/send-test` | `POST` | `EmailDesigner.tsx` | Sends live custom template HTML test email to specified recipient address. |
| `/api/email/dispatch-progress-report` | `POST` | `BatchResultsParser.tsx` | Dispatches academic term progress report with base64 PDF attachment to parent/guardian or orphan sponsor. |
| `/api/email/dispatch-fee-reminder` | `POST` | `FeeManager.tsx` | Dispatches monthly fee payment reminder or paid fee receipt with fee challan PDF attachment. |
| `/api/email/dispatch-salary-slip` | `POST` | `PayrollManager.tsx` | Dispatches official monthly salary disbursement slip PDF to faculty member email. |
| `/api/email/dispatch-teacher-profile` | `POST` | `TeacherHub.tsx` | Dispatches complete faculty dossier package including profile PDF, CNIC, degree, and photo attachments. |
| `/api/email/batch-progress-reports` | `POST` | `BatchResultsParser.tsx` | Batch dispatches multiple term report cards in a single API loop with email logging. |

### 4. Attachment Processing & Encoding
- Frontend PDF generators (`src/lib/pdfGenerator.ts`) compile jsPDF documents into Data URIs (`data:application/pdf;base64,JVBERi...`).
- When sending to backend email endpoints, the data URI header is stripped using `pdfBase64.split(',')[1] || pdfBase64`.
- Nodemailer attaches the raw base64 buffer via `{ filename: '...', content: base64Buffer, encoding: 'base64' }`.

### 5. Smart Fallback & Email Audit Logging
- **Fallback Simulation**: If `SMTP_PASS` is missing or the target address contains `example.com`, the server automatically logs the dispatch with status `'Simulated'` so no API calls break in offline/test environments.
- **Persistent Email Logs**: Every dispatch attempt creates a log object containing `recipient_email`, `recipient_type` (`Guardian`, `Donor`, `Faculty`), `subject`, `status` (`Success` / `Simulated`), `timestamp`, and `attachment_name`. These entries are stored in:
  1. MongoDB Atlas `email_logs` collection (`uschools_db.email_logs`)
  2. Supabase `email_logs` database table / store
  3. In-memory `emailLogs` array in `server.ts`

---

## 🛠 Project Architecture & File Hierarchy

```
├── server.ts                  # Express Backend Server + Vite Dev Middleware + Supabase & MongoDB APIs
├── src/
│   ├── App.tsx                # Master Application Container, State Holders & Auto-Sync Hooks
│   ├── types.ts               # Shared TypeScript Interfaces (Student, Teacher, FeeLedger, Payroll, Expense, EmailTemplate, etc.)
│   ├── lib/
│   │   ├── apiClient.ts       # Frontend REST API Client for Supabase, MongoDB & Email Dispatch
│   │   ├── initialData.ts     # Seed Data (S-USS-01 formatted Students, Teachers, Ledgers, Expenses)
│   │   ├── supabaseClient.ts  # Client-side Supabase Connection SDK
│   │   ├── supabaseStorage.ts # Supabase Storage PDF Document Manager
│   │   ├── pdfGenerator.ts    # jsPDF Engines (Fee Vouchers, Payslips, Report Cards, Dossiers)
│   │   ├── excelExporter.ts   # XLSX Export Engine for Ledgers and Attendance
│   │   └── pdfViewerUtils.ts  # Cross-Browser PDF/Image Modal Utilities
│   └── components/
│       ├── NavbarHeader.tsx       # Master Navigation Header
│       ├── AttendanceConsole.tsx  # Unprotected Phase-1 Attendance Portal
│       ├── StudentAdmissions.tsx # Admission Portal with S-USS-XX ID Generator & Orphan Verification
│       ├── StudentHub.tsx        # Student Directory, Dossier Export, Photo Upload & NOC Manager
│       ├── TeacherHub.tsx        # Faculty Hub, Document Scans, Salary Disbursement & Dossier Mailer
│       ├── FeeManager.tsx        # Fee Ledger, Challan Generator, Partial Payments & Email Reminders
│       ├── PayrollManager.tsx    # Payroll Matrix, Deductions & Salary Slip Mailer
│       ├── ExpenseTracker.tsx    # Operational Expense Tracker, AI Receipt OCR & Custom Payment Modes
│       ├── EmailDesigner.tsx     # Visual HTML Email Template Editor & SMTP Dispatch Test
│       ├── BatchResultsParser.tsx# Exam Results Parser & Report Card PDF/Email Generator
│       ├── ReportingCenter.tsx   # Comprehensive Analytics & Audit Center
│       └── GeminiAssistant.tsx   # AI Academic Assistant
├── .env.example               # Template Environment Configuration
└── prompt.md                  # Comprehensive Cursor AI Instructions
```

---

## ✅ Verification Checklist for Cursor AI / Developer

When working on this application in Cursor:
1. Ensure `npm run dev` starts without errors and binds to port `3000`.
2. Verify that primary data (`students`, `teachers`, `fees`, `payrolls`, `exam_results`) is loaded from and saved to **Supabase**.
3. Verify that dynamic custom form fields and expenses are stored in **MongoDB Atlas** (`uschools_db`).
4. Verify that the AI Receipt Scanner works or gracefully falls back when scanning bills in `ExpenseTracker.tsx`.
5. Verify that custom payment categories and payment modes can be added manually without affecting existing records.
6. Verify that `S-USS-XX` student IDs are visible in the Student Hub and generated during new admissions.
7. Test sending a test email in `EmailDesigner.tsx` or fee voucher email to confirm Brevo SMTP sends real emails.

