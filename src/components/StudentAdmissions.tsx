import React, { useState } from 'react';
import { 
  UserPlus, 
  Upload, 
  HeartHandshake, 
  FileText, 
  ShieldCheck, 
  CheckCircle, 
  AlertCircle,
  Image as ImageIcon,
  Sparkles,
  Eye,
  Download,
  X
} from 'lucide-react';
import { Student, DynamicCustomField, GalleryDocument } from '../types';
import { getPDFViewerUrl, isPDFUrl, isImageUrl } from '../lib/pdfViewerUtils';
import { DynamicFieldSection, validateDynamicFieldValues } from './DynamicFieldSection';
import { DocumentGalleryPreview } from './DocumentGallery';
import { uploadDrawerDocument } from '../lib/drawerDocumentUpload';

interface StudentAdmissionsProps {
  onSaveStudent: (student: Student) => void;
  existingStudents: Student[];
  customFields: DynamicCustomField[];
  onAddCustomField: (field: DynamicCustomField) => void;
  onUpdateCustomField: (field: DynamicCustomField) => void;
  onDeleteCustomField: (fieldId: string) => void;
  onReorderCustomFields: (orderedIds: string[]) => void;
}

function generateNextRollNo(existingStudents: Student[]): string {
  const maxSeq = existingStudents.reduce((max, s) => {
    const match = s.roll_no?.match(/^S-USS-(\d+)$/i);
    return match ? Math.max(max, parseInt(match[1], 10)) : max;
  }, 0);
  return `S-USS-${String(maxSeq + 1).padStart(2, '0')}`;
}

export const StudentAdmissions: React.FC<StudentAdmissionsProps> = ({
  onSaveStudent,
  existingStudents,
  customFields,
  onAddCustomField,
  onUpdateCustomField,
  onDeleteCustomField,
  onReorderCustomFields
}) => {
  // Form State
  const [fullName, setFullName] = useState('');
  const [dob, setDob] = useState('2015-01-01');
  const [bFormNo, setBFormNo] = useState('');
  const [gender, setGender] = useState<'Male' | 'Female' | 'Other'>('Male');
  const [bloodGroup, setBloodGroup] = useState('B+');
  const [fatherName, setFatherName] = useState('');
  const [fatherCnic, setFatherCnic] = useState('');
  const [motherName, setMotherName] = useState('');
  const [parentPhone, setParentPhone] = useState('');
  const [emergencyPhone, setEmergencyPhone] = useState('');
  const [mailingAddress, setMailingAddress] = useState('');
  const [enrollmentDate, setEnrollmentDate] = useState(new Date().toISOString().slice(0, 10));
  const [className, setClassName] = useState('1');

  // Guardian Fields
  const [guardianName, setGuardianName] = useState('');
  const [guardianRelation, setGuardianRelation] = useState('Father');
  const [guardianCnic, setGuardianCnic] = useState('');
  const [guardianPhone, setGuardianPhone] = useState('');
  const [guardianEmail, setGuardianEmail] = useState('');
  const [guardianProfession, setGuardianProfession] = useState('');
  const [guardianIncomeSource, setGuardianIncomeSource] = useState('');

  // Orphan & Donor Tracking
  const [isOrphan, setIsOrphan] = useState(false);
  const [donorId, setDonorId] = useState('');
  const [donorName, setDonorName] = useState('');
  const [donorNumber, setDonorNumber] = useState('');
  const [donorEmail, setDonorEmail] = useState('');
  const [fatherProfessionBeforeDeath, setFatherProfessionBeforeDeath] = useState('');
  const [causeOfDeath, setCauseOfDeath] = useState('');

  // Student Fee & Discounts
  const [standardTuitionFee, setStandardTuitionFee] = useState<number>(3000);
  const [discountAmount, setDiscountAmount] = useState<number>(0);
  const [discountReason, setDiscountReason] = useState('');
  const [paymentPlan, setPaymentPlan] = useState<'Full' | 'Half' | 'Installments_3' | 'Custom'>('Full');

  // Media & Documents
  const [profileImage, setProfileImage] = useState<string | null>(null);
  const [bFormDoc, setBFormDoc] = useState<string | null>(null);
  const [fatherCnicDoc, setFatherCnicDoc] = useState<string | null>(null);
  const [deathCertificateDoc, setDeathCertificateDoc] = useState<string | null>(null);
  const [leavingCertDoc, setLeavingCertDoc] = useState<string | null>(null);
  const [previewModalDoc, setPreviewModalDoc] = useState<{ title: string; url: string } | null>(null);

  // Dynamic Custom Values
  const [customValues, setCustomValues] = useState<Record<string, any>>({});
  const [admissionGalleryDocs, setAdmissionGalleryDocs] = useState<GalleryDocument[]>([]);

  // UI Toast & Validation
  const [toastMsg, setToastMsg] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Handle Profile Photo Upload
  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (event) => {
        setProfileImage(event.target?.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  // Generic File Reader Helper for PDFs & Image Documents
  const handleDocUpload = (e: React.ChangeEvent<HTMLInputElement>, setter: (val: string) => void, docName: string) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (event) => {
        if (event.target?.result) {
          const dataUrl = event.target.result as string;
          setter(dataUrl);
          setToastMsg(`Document "${docName}" (${file.name}) uploaded & ready for preview!`);
          setTimeout(() => setToastMsg(null), 3500);
        }
      };
      reader.readAsDataURL(file);
    }
  };

  // Form Submit Handler — uploads all documents to database before saving student record
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);

    const studentFields = customFields.filter(f => f.target === 'student');
    const fieldValidationError = validateDynamicFieldValues(studentFields, customValues);
    if (fieldValidationError) {
      setErrorMsg(fieldValidationError);
      return;
    }

    // SPEC 4 & User Requirement Validation for Orphans:
    if (isOrphan) {
      if (!deathCertificateDoc) {
        setErrorMsg('MANDATORY REQUIREMENT: Death Certificate attachment is MUST for Orphan Category students!');
        return;
      }
      if (!fatherCnic.trim()) {
        setErrorMsg('MANDATORY REQUIREMENT: Father CNIC number is required for Orphan Category students!');
        return;
      }
      if (!fatherProfessionBeforeDeath.trim()) {
        setErrorMsg('MANDATORY REQUIREMENT: Father\'s Profession Before Death is required for Orphan Category students!');
        return;
      }
      if (!causeOfDeath.trim()) {
        setErrorMsg('MANDATORY REQUIREMENT: How Death Occurred field is required for Orphan Category students!');
        return;
      }
      if (!donorName.trim() || !donorNumber.trim() || !donorEmail.trim()) {
        setErrorMsg('Sponsorship Rule: Orphan Category requires Donor Name, Donor Contact, and Donor Email!');
        return;
      }
    }

    if (!fullName.trim() || !fatherName.trim() || !parentPhone.trim()) {
      setErrorMsg('Please complete mandatory Student Name, Father Name, and Primary Parent Phone Number.');
      return;
    }

    // Generate sequential Student ID (S-USS-01, S-USS-02, etc.)
    const newRollNo = generateNextRollNo(existingStudents);
    const studentId = 'std-' + Date.now();

    const persistDataUrl = async (fieldKey: string, value: string | null | undefined) => {
      if (!value) return undefined;
      if (!value.startsWith('data:')) return value;
      try {
        return await uploadDrawerDocument('students', studentId, fieldKey, value);
      } catch {
        return value;
      }
    };

    setToastMsg('Saving student record and uploading documents to database…');

    const persistedCustom: Record<string, unknown> = { ...customValues };
    for (const field of studentFields.filter(f => f.fieldType === 'file')) {
      const val = persistedCustom[field.fieldName];
      if (typeof val === 'string' && val.startsWith('data:')) {
        persistedCustom[field.fieldName] = await persistDataUrl(
          `custom_${field.fieldName}`,
          val
        );
      }
    }

    const persistedGallery = await Promise.all(
      admissionGalleryDocs.map(async doc => {
        if (doc.url?.startsWith('data:')) {
          try {
            const url = await uploadDrawerDocument('students', studentId, doc.id, doc.url, doc.title);
            return { ...doc, url, storage_persisted: true as const };
          } catch {
            return doc;
          }
        }
        return doc;
      })
    );

    const newStudent: Student = {
      id: studentId,
      roll_no: newRollNo,
      full_name: fullName.trim(),
      dob,
      b_form_no: bFormNo || 'N/A',
      gender,
      blood_group: bloodGroup,
      father_name: fatherName.trim(),
      father_cnic: fatherCnic.trim() || 'N/A',
      mother_name: motherName || 'N/A',
      parent_phone: parentPhone.trim(),
      emergency_phone: emergencyPhone || parentPhone,
      mailing_address: mailingAddress || 'Lahore Campus',
      enrollment_date: enrollmentDate,
      class_name: className,
      
      guardian_name: guardianName || fatherName,
      guardian_relation: guardianRelation || 'Father',
      guardian_cnic: guardianCnic || fatherCnic,
      guardian_phone: guardianPhone || parentPhone,
      guardian_email: guardianEmail || 'parent@uniqueschool.edu.pk',
      guardian_profession: guardianProfession || 'N/A',
      guardian_income_source: guardianIncomeSource || 'N/A',

      is_orphan: isOrphan,
      donor_id: isOrphan ? (donorId.trim() || `DONOR-${Date.now().toString().slice(-4)}`) : null,
      donor_name: isOrphan ? donorName.trim() : null,
      donor_number: isOrphan ? donorNumber.trim() : null,
      donor_email: isOrphan ? donorEmail.trim() : null,
      father_profession_before_death: isOrphan ? fatherProfessionBeforeDeath.trim() : null,
      cause_of_death: isOrphan ? causeOfDeath.trim() : null,

      standard_tuition_fee: Number(standardTuitionFee) || 0,
      discount_amount: Number(discountAmount) || 0,
      discount_reason: discountReason || (isOrphan ? '100% Orphan Scholarship' : 'Standard'),
      payment_plan: paymentPlan,

      profile_image_url: await persistDataUrl('profile_image_url', profileImage),
      b_form_doc: await persistDataUrl('b_form_doc', bFormDoc),
      father_cnic_doc: await persistDataUrl('father_cnic_doc', fatherCnicDoc),
      death_certificate_doc: await persistDataUrl('death_certificate_doc', deathCertificateDoc),
      leaving_cert_doc: await persistDataUrl('leaving_cert_doc', leavingCertDoc),

      custom_fields: persistedCustom,
      document_gallery: persistedGallery.length > 0 ? persistedGallery : undefined,
      noc_status: 'Pending',
      created_at: new Date().toISOString()
    };

    onSaveStudent(newStudent);
    setToastMsg(`Student "${fullName}" admitted successfully! Assigned Roll No: ${newRollNo}`);
    setTimeout(() => setToastMsg(null), 4000);

    // Reset Form
    setFullName('');
    setFatherName('');
    setFatherCnic('');
    setBFormNo('');
    setParentPhone('');
    setIsOrphan(false);
    setDonorId('');
    setDonorName('');
    setDonorNumber('');
    setDonorEmail('');
    setFatherProfessionBeforeDeath('');
    setCauseOfDeath('');
    setDeathCertificateDoc(null);
    setProfileImage(null);
    setCustomValues({});
    setAdmissionGalleryDocs([]);
  };

  return (
    <div className="max-w-6xl mx-auto p-4 sm:p-6 space-y-6">
      
      {/* Toast & Error Alerts */}
      {toastMsg && (
        <div className="p-4 rounded-xl bg-emerald-600 text-white font-bold flex items-center justify-between shadow-lg animate-in slide-in-from-top">
          <div className="flex items-center gap-2">
            <CheckCircle className="w-5 h-5 text-emerald-200" />
            <span>{toastMsg}</span>
          </div>
        </div>
      )}

      {errorMsg && (
        <div className="p-4 rounded-xl bg-red-600 text-white font-bold flex items-center justify-between shadow-lg animate-in slide-in-from-top">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-5 h-5 text-red-200" />
            <span>{errorMsg}</span>
          </div>
        </div>
      )}

      {/* Main Workspace Box */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xl overflow-hidden">
        
        {/* Header Bar with CRITICAL RIGHT-TOP PROFILE IMAGE CONTAINER */}
        <div className="bg-gradient-to-r from-blue-900 via-indigo-900 to-slate-900 p-6 text-white relative">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
            <div>
              <div className="flex items-center gap-2">
                <UserPlus className="w-6 h-6 text-amber-400" />
                <h2 className="text-xl sm:text-2xl font-black tracking-tight">Student Admission Gateway</h2>
              </div>
              <p className="text-xs text-blue-200 mt-1">
                Unique School System | Complete Student Onboarding & Verification Portal
              </p>
            </div>

            {/* CRITICAL VISUAL REQUIREMENT: Profile Image Container on RIGHT TOP CORNER */}
            <div className="self-end sm:self-auto bg-slate-800/80 p-2 rounded-2xl border-2 border-dashed border-amber-400/50 shadow-2xl text-center group relative w-28 h-28 sm:w-32 sm:h-32 flex flex-col items-center justify-center overflow-hidden">
              {profileImage ? (
                <div className="relative w-full h-full">
                  <img 
                    src={profileImage} 
                    alt="Student Thumbnail" 
                    className="w-full h-full object-cover rounded-xl"
                  />
                  <label className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 flex items-center justify-center text-white text-[10px] font-bold cursor-pointer rounded-xl transition-all">
                    Change Photo
                    <input type="file" accept="image/*" onChange={handleImageUpload} className="hidden" />
                  </label>
                </div>
              ) : (
                <label className="w-full h-full flex flex-col items-center justify-center cursor-pointer p-1 text-slate-300 hover:text-amber-300 transition-all">
                  <ImageIcon className="w-8 h-8 mb-1 text-amber-400" />
                  <span className="text-[10px] font-extrabold uppercase leading-tight text-center">
                    Top-Right Photo Drop
                  </span>
                  <span className="text-[9px] text-slate-400">Click to Upload</span>
                  <input type="file" accept="image/*" onChange={handleImageUpload} className="hidden" />
                </label>
              )}
            </div>
          </div>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-6 space-y-8">
          
          {/* SECTION 1: Standard Demographic Metadata */}
          <div>
            <h3 className="text-sm font-black uppercase text-blue-900 tracking-wider mb-4 flex items-center gap-2 border-b pb-2">
              <FileText className="w-4 h-4 text-blue-700" />
              1. Primary Demographic & Identity Metadata
            </h3>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Student Full Name *</label>
                <input 
                  type="text" 
                  required
                  value={fullName}
                  onChange={e => setFullName(e.target.value)}
                  placeholder="e.g. Muhammad Ali Raza"
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 text-sm focus:ring-2 focus:ring-blue-800"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Date of Birth (DOB) *</label>
                <input 
                  type="date" 
                  required
                  value={dob}
                  onChange={e => setDob(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 text-sm focus:ring-2 focus:ring-blue-800"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">B-Form / CNIC Number *</label>
                <input 
                  type="text" 
                  value={bFormNo}
                  onChange={e => setBFormNo(e.target.value)}
                  placeholder="35202-1234567-1"
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 text-sm focus:ring-2 focus:ring-blue-800"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Gender</label>
                <select 
                  value={gender}
                  onChange={e => setGender(e.target.value as any)}
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 text-sm focus:ring-2 focus:ring-blue-800"
                >
                  <option value="Male">Male</option>
                  <option value="Female">Female</option>
                  <option value="Other">Other</option>
                </select>
              </div>

          

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Class Assigned String *</label>
                <input 
                  type="text" 
                  required
                  value={className}
                  onChange={e => setClassName(e.target.value)}
                  placeholder='e.g. "1", "2", "3", "Prep", "9th-A"'
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 text-sm font-semibold focus:ring-2 focus:ring-blue-800"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Father's Full Name *</label>
                <input 
                  type="text" 
                  required
                  value={fatherName}
                  onChange={e => setFatherName(e.target.value)}
                  placeholder="Father's full name"
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 text-sm focus:ring-2 focus:ring-blue-800"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Father's CNIC Number</label>
                <input 
                  type="text" 
                  value={fatherCnic}
                  onChange={e => setFatherCnic(e.target.value)}
                  placeholder="35202-0000000-0"
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 text-sm focus:ring-2 focus:ring-blue-800"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Mother's Name</label>
                <input 
                  type="text" 
                  value={motherName}
                  onChange={e => setMotherName(e.target.value)}
                  placeholder="Mother's name"
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 text-sm focus:ring-2 focus:ring-blue-800"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Primary Parent Phone *</label>
                <input 
                  type="text" 
                  required
                  value={parentPhone}
                  onChange={e => setParentPhone(e.target.value)}
                  placeholder="+92 300 0000000"
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 text-sm focus:ring-2 focus:ring-blue-800"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Whatsapp Number</label>
                <input 
                  type="text" 
                  value={emergencyPhone}
                  onChange={e => setEmergencyPhone(e.target.value)}
                  placeholder="+92 321 0000000"
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 text-sm focus:ring-2 focus:ring-blue-800"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Date of Enrollment</label>
                <input 
                  type="date" 
                  value={enrollmentDate}
                  onChange={e => setEnrollmentDate(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 text-sm focus:ring-2 focus:ring-blue-800"
                />
              </div>

              <div className="sm:col-span-2 lg:col-span-3">
                <label className="block text-xs font-bold text-slate-700 mb-1">Mailing / Residential Address</label>
                <input 
                  type="text" 
                  value={mailingAddress}
                  onChange={e => setMailingAddress(e.target.value)}
                  placeholder="House number, street, sector, city"
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 text-sm focus:ring-2 focus:ring-blue-800"
                />
              </div>
            </div>
          </div>

          {/* SECTION 2: Dedicated Guardian Sub-Form Section */}
          <div className="bg-slate-50 p-5 rounded-2xl border border-slate-200">
            <h3 className="text-sm font-black uppercase text-blue-900 tracking-wider mb-4 flex items-center gap-2 border-b pb-2">
              <ShieldCheck className="w-4 h-4 text-blue-700" />
              2. Legal Guardian Sub-Form Information
            </h3>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Guardian's Full Name</label>
                <input 
                  type="text" 
                  value={guardianName}
                  onChange={e => setGuardianName(e.target.value)}
                  placeholder="Guardian's name (defaults to Father)"
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 text-sm focus:ring-2 focus:ring-blue-800 bg-white"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Relationship to Student</label>
                <select 
                  value={guardianRelation}
                  onChange={e => setGuardianRelation(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 text-sm focus:ring-2 focus:ring-blue-800 bg-white"
                >
                  <option value="Father">Father</option>
                  <option value="Mother">Mother</option>
                  <option value="Uncle">Uncle</option>
                  <option value="Grandfather">Grandfather</option>
                  <option value="Legal Trustee">Legal Trustee</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Guardian National CNIC</label>
                <input 
                  type="text" 
                  value={guardianCnic}
                  onChange={e => setGuardianCnic(e.target.value)}
                  placeholder="35202-0000000-0"
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 text-sm focus:ring-2 focus:ring-blue-800 bg-white"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Guardian Phone Number</label>
                <input 
                  type="text" 
                  value={guardianPhone}
                  onChange={e => setGuardianPhone(e.target.value)}
                  placeholder="+92 300 0000000"
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 text-sm focus:ring-2 focus:ring-blue-800 bg-white"
                />
              </div>

              <div className="sm:col-span-2">
                <label className="block text-xs font-bold text-slate-700 mb-1">Guardian Email Address (Target for Progress Reports)</label>
                <input 
                  type="email" 
                  value={guardianEmail}
                  onChange={e => setGuardianEmail(e.target.value)}
                  placeholder="guardian.email@domain.com"
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 text-sm focus:ring-2 focus:ring-blue-800 bg-white"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Guardian Profession *</label>
                <input 
                  type="text" 
                  value={guardianProfession}
                  onChange={e => setGuardianProfession(e.target.value)}
                  placeholder="e.g. Government Employee / Shopkeeper"
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 text-sm focus:ring-2 focus:ring-blue-800 bg-white"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Guardian Income Source *</label>
                <input 
                  type="text" 
                  value={guardianIncomeSource}
                  onChange={e => setGuardianIncomeSource(e.target.value)}
                  placeholder="e.g. Monthly Salary / Agriculture"
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 text-sm focus:ring-2 focus:ring-blue-800 bg-white"
                />
              </div>
            </div>
          </div>

          {/* SECTION 3: Interactive Toggle - Orphan Category */}
          <div className="bg-gradient-to-r from-amber-500/10 via-orange-500/10 to-amber-500/10 p-5 rounded-2xl border border-amber-300/50 space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-amber-500 text-white flex items-center justify-center shadow-lg shadow-amber-500/20">
                  <HeartHandshake className="w-6 h-6" />
                </div>
                <div>
                  <h4 className="text-sm font-black text-amber-900 uppercase tracking-tight">
                    3. Orphan / Sponsored Category Toggle
                  </h4>
                  <p className="text-xs text-amber-800">
                    If checked true, renders mandatory donor fields and routes Brevo progress reports to Donor Email.
                  </p>
                </div>
              </div>

              <label className="relative inline-flex items-center cursor-pointer">
                <input 
                  type="checkbox" 
                  checked={isOrphan}
                  onChange={e => setIsOrphan(e.target.checked)}
                  className="sr-only peer"
                />
                <div className="w-14 h-7 bg-slate-300 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-6 after:w-6 after:transition-all peer-checked:bg-amber-600"></div>
              </label>
            </div>

            {/* Slide-open Mandatory Donor & Orphan Deceased Father Inputs when isOrphan is TRUE */}
            {isOrphan && (
              <div className="p-4 bg-white rounded-xl border border-amber-300 space-y-4 animate-in slide-in-from-top duration-300">
                <div className="flex items-center gap-2 text-xs font-bold text-amber-900 uppercase border-b border-amber-200 pb-2">
                  <Sparkles className="w-4 h-4 text-amber-600" />
                  Mandatory Orphan Verification & Sponsoring Donor Metadata
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">Donor ID / Code</label>
                    <input 
                      type="text" 
                      value={donorId}
                      onChange={e => setDonorId(e.target.value)}
                      placeholder="e.g. DNR-8802"
                      className="w-full px-3 py-2 rounded-xl border border-slate-300 text-sm focus:ring-2 focus:ring-amber-500 font-mono"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">Sponsoring Donor Name *</label>
                    <input 
                      type="text" 
                      required={isOrphan}
                      value={donorName}
                      onChange={e => setDonorName(e.target.value)}
                      placeholder="e.g. Haji Usman / Al-Khidmat Trust"
                      className="w-full px-3 py-2 rounded-xl border border-slate-300 text-sm focus:ring-2 focus:ring-amber-500"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">Donor Contact Number *</label>
                    <input 
                      type="text" 
                      required={isOrphan}
                      value={donorNumber}
                      onChange={e => setDonorNumber(e.target.value)}
                      placeholder="+92 321 0000000"
                      className="w-full px-3 py-2 rounded-xl border border-slate-300 text-sm focus:ring-2 focus:ring-amber-500"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">Donor Direct Email *</label>
                    <input 
                      type="email" 
                      required={isOrphan}
                      value={donorEmail}
                      onChange={e => setDonorEmail(e.target.value)}
                      placeholder="donor.sponsor@organization.org"
                      className="w-full px-3 py-2 rounded-xl border border-slate-300 text-sm focus:ring-2 focus:ring-amber-500"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2 border-t border-amber-100">
                  <div>
                    <label className="block text-xs font-bold text-amber-900 mb-1">Father's Profession Before Death *</label>
                    <input 
                      type="text" 
                      required={isOrphan}
                      value={fatherProfessionBeforeDeath}
                      onChange={e => setFatherProfessionBeforeDeath(e.target.value)}
                      placeholder="e.g. Shopkeeper / Laborer / Teacher"
                      className="w-full px-3 py-2 rounded-xl border border-amber-300 text-sm focus:ring-2 focus:ring-amber-500 bg-amber-50/30"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-amber-900 mb-1">How Death Occurred (Cause of Death) *</label>
                    <input 
                      type="text" 
                      required={isOrphan}
                      value={causeOfDeath}
                      onChange={e => setCauseOfDeath(e.target.value)}
                      placeholder="e.g. Natural illness / Accident / Heart Failure"
                      className="w-full px-3 py-2 rounded-xl border border-amber-300 text-sm focus:ring-2 focus:ring-amber-500 bg-amber-50/30"
                    />
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* SECTION 4: Student Fee, Discounts & Installments Structure */}
          <div className="bg-blue-50/50 p-5 rounded-2xl border border-blue-200 space-y-4">
            <h3 className="text-sm font-black uppercase text-blue-900 tracking-wider flex items-center gap-2 border-b border-blue-200 pb-2">
              <FileText className="w-4 h-4 text-blue-700" />
              4. Fee Structure, Concessions & Installment Plans
            </h3>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Standard Tuition Fee (PKR)</label>
                <input 
                  type="number" 
                  value={standardTuitionFee}
                  onChange={e => setStandardTuitionFee(Number(e.target.value))}
                  placeholder="3000"
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 text-sm focus:ring-2 focus:ring-blue-800 bg-white"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Scholarship / Discount (PKR)</label>
                <input 
                  type="number" 
                  value={discountAmount}
                  onChange={e => setDiscountAmount(Number(e.target.value))}
                  placeholder="0"
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 text-sm focus:ring-2 focus:ring-blue-800 bg-white"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Concession Category / Reason</label>
                <input 
                  type="text" 
                  value={discountReason}
                  onChange={e => setDiscountReason(e.target.value)}
                  placeholder={isOrphan ? '100% Orphan Scholarship' : 'Need Based / Merit Concession'}
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 text-sm focus:ring-2 focus:ring-blue-800 bg-white"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Payment Plan Term</label>
                <select
                  value={paymentPlan}
                  onChange={e => setPaymentPlan(e.target.value as any)}
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 text-sm focus:ring-2 focus:ring-blue-800 bg-white font-bold text-blue-900"
                >
                  <option value="Full">Full Regular Monthly Payment</option>
                  <option value="Half">Half Fee Payment Plan (50%)</option>
                  <option value="Installments_3">3-Installments Extended Term</option>
                  <option value="Custom">Custom Donor/Trust Agreement</option>
                </select>
              </div>
            </div>

            <div className="text-xs text-blue-900 font-bold bg-blue-100/60 p-3 rounded-xl flex items-center justify-between">
              <span>Net Monthly Payable Fee Amount:</span>
              <span className="text-base font-black text-blue-900">
                PKR {(Math.max(0, (standardTuitionFee || 0) - (discountAmount || 0))).toLocaleString()} / month
              </span>
            </div>
          </div>

          {/* SECTION 5: Legal Document Management */}
          <div>
            <h3 className="text-sm font-black uppercase text-blue-900 tracking-wider mb-4 flex items-center gap-2 border-b pb-2">
              <Upload className="w-4 h-4 text-blue-700" />
              5. Legal Documents Upload & Verification
            </h3>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="p-4 border-2 border-dashed border-slate-300 rounded-2xl text-center bg-slate-50 hover:bg-slate-100 transition-all">
                <FileText className="w-8 h-8 text-blue-800 mx-auto mb-2" />
                <span className="block text-xs font-bold text-slate-800 mb-1">B-Form Scan</span>
                <span className="block text-[11px] text-slate-500 mb-2 truncate">
                  {bFormDoc ? (bFormDoc.startsWith('data:') ? 'Document Attached (Data URI)' : bFormDoc) : 'No file attached'}
                </span>
                <div className="flex justify-center gap-1.5">
                  {bFormDoc && (
                    <button
                      type="button"
                      onClick={() => setPreviewModalDoc({ title: 'B-Form / Birth Cert Scan', url: bFormDoc })}
                      className="px-2.5 py-1.5 bg-amber-500 hover:bg-amber-600 text-slate-900 font-extrabold text-xs rounded-lg flex items-center gap-1 shadow-sm"
                    >
                      <Eye className="w-3.5 h-3.5" /> Preview
                    </button>
                  )}
                  <label className="inline-block px-3 py-1.5 bg-blue-900 hover:bg-blue-800 text-white text-xs font-bold rounded-lg cursor-pointer">
                    {bFormDoc ? 'Re-upload' : 'Select File'}
                    <input type="file" accept=".pdf,image/*" onChange={e => handleDocUpload(e, setBFormDoc, 'B-Form Scan')} className="hidden" />
                  </label>
                </div>
              </div>

              <div className="p-4 border-2 border-dashed border-slate-300 rounded-2xl text-center bg-slate-50 hover:bg-slate-100 transition-all">
                <FileText className="w-8 h-8 text-blue-800 mx-auto mb-2" />
                <span className="block text-xs font-bold text-slate-800 mb-1">Father CNIC Scan</span>
                <span className="block text-[11px] text-slate-500 mb-2 truncate">
                  {fatherCnicDoc ? (fatherCnicDoc.startsWith('data:') ? 'Document Attached (Data URI)' : fatherCnicDoc) : 'No file attached'}
                </span>
                <div className="flex justify-center gap-1.5">
                  {fatherCnicDoc && (
                    <button
                      type="button"
                      onClick={() => setPreviewModalDoc({ title: 'Father CNIC Scan', url: fatherCnicDoc })}
                      className="px-2.5 py-1.5 bg-amber-500 hover:bg-amber-600 text-slate-900 font-extrabold text-xs rounded-lg flex items-center gap-1 shadow-sm"
                    >
                      <Eye className="w-3.5 h-3.5" /> Preview
                    </button>
                  )}
                  <label className="inline-block px-3 py-1.5 bg-blue-900 hover:bg-blue-800 text-white text-xs font-bold rounded-lg cursor-pointer">
                    {fatherCnicDoc ? 'Re-upload' : 'Select File'}
                    <input type="file" accept=".pdf,image/*" onChange={e => handleDocUpload(e, setFatherCnicDoc, 'Father CNIC Scan')} className="hidden" />
                  </label>
                </div>
              </div>

              {/* DEATH CERTIFICATE CARD - MUST IF ORPHAN */}
              <div className={`p-4 border-2 border-dashed rounded-2xl text-center transition-all ${
                isOrphan ? 'border-amber-500 bg-amber-50/60 shadow-md' : 'border-slate-300 bg-slate-50'
              }`}>
                <FileText className={`w-8 h-8 mx-auto mb-2 ${isOrphan ? 'text-amber-600 animate-bounce' : 'text-blue-800'}`} />
                <span className="block text-xs font-bold text-slate-800 mb-1">
                  Death Cert {isOrphan && <span className="text-amber-700 font-extrabold uppercase ml-1">(MUST*)</span>}
                </span>
                <span className="block text-[11px] text-slate-500 mb-2 truncate">
                  {deathCertificateDoc ? (deathCertificateDoc.startsWith('data:') ? 'Document Attached (Data URI)' : deathCertificateDoc) : 'No file attached'}
                </span>
                <div className="flex justify-center gap-1.5">
                  {deathCertificateDoc && (
                    <button
                      type="button"
                      onClick={() => setPreviewModalDoc({ title: 'Deceased Father Death Certificate', url: deathCertificateDoc })}
                      className="px-2.5 py-1.5 bg-amber-500 hover:bg-amber-600 text-slate-900 font-extrabold text-xs rounded-lg flex items-center gap-1 shadow-sm"
                    >
                      <Eye className="w-3.5 h-3.5" /> Preview
                    </button>
                  )}
                  <label className={`inline-block px-3 py-1.5 text-white text-xs font-bold rounded-lg cursor-pointer ${
                    isOrphan ? 'bg-amber-600 hover:bg-amber-700 shadow' : 'bg-blue-900 hover:bg-blue-800'
                  }`}>
                    {deathCertificateDoc ? 'Re-upload' : 'Select Certificate'}
                    <input type="file" accept=".pdf,image/*" onChange={e => handleDocUpload(e, setDeathCertificateDoc, 'Death Certificate')} className="hidden" />
                  </label>
                </div>
              </div>

              <div className="p-4 border-2 border-dashed border-slate-300 rounded-2xl text-center bg-slate-50 hover:bg-slate-100 transition-all">
                <FileText className="w-8 h-8 text-blue-800 mx-auto mb-2" />
                <span className="block text-xs font-bold text-slate-800 mb-1">Leaving Cert & Character Certificate</span>
                <span className="block text-[11px] text-slate-500 mb-2 truncate">
                  {leavingCertDoc ? (leavingCertDoc.startsWith('data:') ? 'Document Attached (Data URI)' : leavingCertDoc) : 'No file attached'}
                </span>
                <div className="flex justify-center gap-1.5">
                  {leavingCertDoc && (
                    <button
                      type="button"
                      onClick={() => setPreviewModalDoc({ title: 'School Leaving Certificate', url: leavingCertDoc })}
                      className="px-2.5 py-1.5 bg-amber-500 hover:bg-amber-600 text-slate-900 font-extrabold text-xs rounded-lg flex items-center gap-1 shadow-sm"
                    >
                      <Eye className="w-3.5 h-3.5" /> Preview
                    </button>
                  )}
                  <label className="inline-block px-3 py-1.5 bg-blue-900 hover:bg-blue-800 text-white text-xs font-bold rounded-lg cursor-pointer">
                    {leavingCertDoc ? 'Re-upload' : 'Select File'}
                    <input type="file" accept=".pdf,image/*" onChange={e => handleDocUpload(e, setLeavingCertDoc, 'Leaving Certificate')} className="hidden" />
                  </label>
                </div>
              </div>
            </div>
          </div>

          {/* SECTION 6: Dynamic Custom Extension Zone */}
          <DynamicFieldSection
            target="student"
            customFields={customFields}
            onAddCustomField={onAddCustomField}
            onUpdateCustomField={onUpdateCustomField}
            onDeleteCustomField={onDeleteCustomField}
            onReorderCustomFields={onReorderCustomFields}
            values={customValues}
            onValuesChange={setCustomValues}
            sectionTitle="6. Dynamic Admin Custom Fields Zone"
            onNotify={msg => {
              setToastMsg(msg);
              setTimeout(() => setToastMsg(null), 3000);
            }}
          />

          <DocumentGalleryPreview
            entityType="student"
            entity={{
              profile_image_url: profileImage || undefined,
              b_form_doc: bFormDoc || undefined,
              father_cnic_doc: fatherCnicDoc || undefined,
              death_certificate_doc: deathCertificateDoc || undefined,
              leaving_cert_doc: leavingCertDoc || undefined,
              custom_fields: customValues
            }}
            customFields={customFields}
            extraGallery={admissionGalleryDocs}
            onAddGalleryDoc={doc => {
              setAdmissionGalleryDocs(prev => [...prev, doc]);
              setToastMsg(`"${doc.title}" added to gallery preview.`);
              setTimeout(() => setToastMsg(null), 3000);
            }}
            onPreview={(title, url) => setPreviewModalDoc({ title, url })}
          />

          {/* Submit Action Bar */}
          <div className="pt-4 border-t border-slate-200 flex justify-end">
            <button
              type="submit"
              className="w-full sm:w-auto px-8 py-3 bg-blue-900 hover:bg-blue-800 text-white font-extrabold text-sm rounded-xl shadow-xl shadow-blue-900/20 hover:shadow-blue-900/30 flex items-center justify-center gap-2 transition-all active:scale-[0.98]"
            >
              <UserPlus className="w-5 h-5" />
              Complete Student Admission & Save Record
            </button>
          </div>
        </form>
      </div>

      {/* DOCUMENT ASSET PREVIEW MODAL */}
      {previewModalDoc && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/80 backdrop-blur-sm animate-in fade-in">
          <div className="bg-white rounded-3xl max-w-3xl w-full p-6 space-y-4 shadow-2xl border border-slate-200">
            <div className="flex justify-between items-center border-b pb-3">
              <h3 className="text-base font-black text-slate-900 flex items-center gap-2">
                <FileText className="w-5 h-5 text-blue-900" />
                {previewModalDoc.title}
              </h3>
              <button onClick={() => setPreviewModalDoc(null)} className="text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-2 bg-slate-900 rounded-2xl flex items-center justify-center min-h-[350px] max-h-[550px] overflow-hidden">
              {isPDFUrl(previewModalDoc.url) ? (
                <iframe
                  src={getPDFViewerUrl(previewModalDoc.url)}
                  title={previewModalDoc.title}
                  className="w-full h-[500px] rounded-xl border border-slate-700 bg-white"
                />
              ) : isImageUrl(previewModalDoc.url) ? (
                <img src={previewModalDoc.url} alt={previewModalDoc.title} className="max-w-full max-h-[500px] object-contain rounded-xl" />
              ) : (
                <div className="p-8 text-center text-slate-300 space-y-3">
                  <FileText className="w-12 h-12 text-amber-400 mx-auto animate-pulse" />
                  <p className="font-bold text-sm text-white">Document Attached</p>
                  <p className="font-mono text-xs text-blue-300 break-all">{previewModalDoc.url}</p>
                </div>
              )}
            </div>

            <div className="flex justify-between items-center pt-2">
              <a
                href={getPDFViewerUrl(previewModalDoc.url)}
                download={`${previewModalDoc.title.replace(/\s+/g, '_')}.${isPDFUrl(previewModalDoc.url) ? 'pdf' : 'png'}`}
                target="_blank"
                rel="noreferrer"
                className="px-4 py-2 bg-blue-900 hover:bg-blue-800 text-white font-extrabold text-xs rounded-xl shadow flex items-center gap-1.5"
              >
                <Download className="w-4 h-4 text-amber-300" />
                Download Document
              </a>

              <button
                onClick={() => setPreviewModalDoc(null)}
                className="px-5 py-2 bg-slate-200 hover:bg-slate-300 text-slate-800 font-bold text-xs rounded-xl"
              >
                Close Preview
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
