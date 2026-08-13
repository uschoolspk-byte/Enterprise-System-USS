import React, { useState } from 'react';
import { 
  Palette, 
  Mail, 
  Send, 
  Save, 
  Eye, 
  RotateCcw, 
  CheckCircle2, 
  AlertCircle, 
  Sparkles, 
  Tag, 
  Sliders, 
  FileText, 
  Layers,
  X,
  Code,
  Loader2
} from 'lucide-react';
import { EmailTemplate, SiteBrandingSettings } from '../types';

interface EmailDesignerProps {
  emailTemplates: EmailTemplate[];
  onSaveTemplate: (updatedTemplate: EmailTemplate) => void;
  onResetTemplates?: () => void;
  siteBranding: SiteBrandingSettings;
}

const VARIABLE_TAGS = [
  { tag: '{{student_name}}', desc: 'Student Full Name' },
  { tag: '{{roll_no}}', desc: 'Student Roll ID (S-USS-XX)' },
  { tag: '{{class_name}}', desc: 'Class Name (e.g. 9th-A)' },
  { tag: '{{parent_name}}', desc: 'Parent / Guardian Name' },
  { tag: '{{amount}}', desc: 'Fee or Salary Amount (PKR)' },
  { tag: '{{due_date}}', desc: 'Fee Due Date' },
  { tag: '{{month}}', desc: 'Month (e.g. August)' },
  { tag: '{{year}}', desc: 'Year (e.g. 2026)' },
  { tag: '{{teacher_name}}', desc: 'Faculty Member Name' },
  { tag: '{{teacher_id}}', desc: 'Faculty Employee ID' },
  { tag: '{{designation}}', desc: 'Faculty Designation' },
  { tag: '{{term_name}}', desc: 'Exam Term (e.g. 1st Term)' },
  { tag: '{{grade}}', desc: 'Academic Grade (e.g. A+)' },
  { tag: '{{percentage}}', desc: 'Academic Percentage (e.g. 92%)' },
  { tag: '{{donor_name}}', desc: 'Orphan Sponsor Name' },
  { tag: '{{school_name}}', desc: 'Unique School System' }
];

const PRESET_ACCENTS = [
  { label: 'Navy Blue', color: '#1e3a8a' },
  { label: 'Emerald Green', color: '#047857' },
  { label: 'Royal Purple', color: '#6d28d9' },
  { label: 'Amber Gold', color: '#b45309' },
  { label: 'Crimson Slate', color: '#9f1239' },
  { label: 'Midnight Black', color: '#0f172a' }
];

export const EmailDesigner: React.FC<EmailDesignerProps> = ({
  emailTemplates,
  onSaveTemplate,
  siteBranding
}) => {
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>(
    emailTemplates[0]?.id || 'tpl-1'
  );

  const currentTemplate = emailTemplates.find(t => t.id === selectedTemplateId) || emailTemplates[0];

  // Editor Form State
  const [subject, setSubject] = useState(currentTemplate?.subject || '');
  const [headerTitle, setHeaderTitle] = useState(currentTemplate?.header_title || 'UNIQUE SCHOOL SYSTEM');
  const [body, setBody] = useState(currentTemplate?.body || '');
  const [footer, setFooter] = useState(currentTemplate?.footer || 'Unique School System | Main Campus, Lahore');
  const [accentColor, setAccentColor] = useState(currentTemplate?.accent_color || '#1e3a8a');
  
  const [saveStatus, setSaveStatus] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Test Mail Sending State
  const [isTestModalOpen, setIsTestModalOpen] = useState(false);
  const [testEmail, setTestEmail] = useState('abdullah12233332@gmail.com');
  const [isSendingTest, setIsSendingTest] = useState(false);
  const [testLog, setTestLog] = useState<string | null>(null);

  // When switching templates, sync state
  const handleSelectTemplate = (tplId: string) => {
    setSelectedTemplateId(tplId);
    const tpl = emailTemplates.find(t => t.id === tplId);
    if (tpl) {
      setSubject(tpl.subject);
      setHeaderTitle(tpl.header_title || 'UNIQUE SCHOOL SYSTEM');
      setBody(tpl.body);
      setFooter(tpl.footer || 'Unique School System | Main Campus, Lahore');
      setAccentColor(tpl.accent_color || '#1e3a8a');
    }
    setSaveStatus(null);
  };

  const handleInsertTag = (tagStr: string) => {
    setBody(prev => prev + ' ' + tagStr);
  };

  const handleSave = () => {
    if (!currentTemplate) return;
    const updated: EmailTemplate = {
      ...currentTemplate,
      subject,
      header_title: headerTitle,
      body,
      footer,
      accent_color: accentColor,
      updated_at: new Date().toISOString()
    };

    onSaveTemplate(updated);
    setSaveStatus({
      type: 'success',
      text: `Template "${currentTemplate.name}" saved globally and synced to Supabase!`
    });

    setTimeout(() => {
      setSaveStatus(null);
    }, 3000);
  };

  // Replace tags with sample realistic data for Live Preview
  const renderPreviewText = (textStr: string) => {
    return textStr
      .replace(/\{\{student_name\}\}/g, 'Muhammad Ali Raza')
      .replace(/\{\{roll_no\}\}/g, 'S-USS-01')
      .replace(/\{\{class_name\}\}/g, '9th-A')
      .replace(/\{\{parent_name\}\}/g, 'Tariq Mahmood Raza')
      .replace(/\{\{amount\}\}/g, '12,500')
      .replace(/\{\{due_date\}\}/g, '2026-08-25')
      .replace(/\{\{month\}\}/g, 'August')
      .replace(/\{\{year\}\}/g, '2026')
      .replace(/\{\{teacher_name\}\}/g, 'Dr. Sarah Ahmad')
      .replace(/\{\{teacher_id\}\}/g, 'T-2026-004')
      .replace(/\{\{designation\}\}/g, 'Senior Physics Lecturer')
      .replace(/\{\{term_name\}\}/g, '1st Term Examination')
      .replace(/\{\{grade\}\}/g, 'A+')
      .replace(/\{\{percentage\}\}/g, '92%')
      .replace(/\{\{donor_name\}\}/g, 'Engr. Tariq Mahmood')
      .replace(/\{\{school_name\}\}/g, 'Unique School System');
  };

  const handleSendTestEmail = async () => {
    if (!testEmail || !testEmail.includes('@')) {
      setTestLog('Please enter a valid recipient email address.');
      return;
    }

    setIsSendingTest(true);
    setTestLog('Connecting to Brevo SMTP Relay (smtp-relay.brevo.com:587)...');

    try {
      const res = await fetch('/api/email/send-test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          recipientEmail: testEmail,
          subject: renderPreviewText(subject),
          headerTitle: renderPreviewText(headerTitle),
          body: renderPreviewText(body),
          footer: renderPreviewText(footer),
          accentColor,
          siteBranding
        })
      });

      const data = await res.json();
      if (res.ok && data.success) {
        setTestLog(`Success: ${data.message}`);
      } else {
        setTestLog(`Error: ${data.error || 'Failed to dispatch test email.'}`);
      }
    } catch (err: any) {
      setTestLog(`Connection Error: ${err.message}`);
    } finally {
      setIsSendingTest(false);
    }
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-6">
      
      {/* Top Banner Header */}
      <div className="bg-gradient-to-r from-slate-900 via-purple-950 to-slate-900 rounded-2xl p-6 text-white shadow-xl border border-slate-800 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <span className="p-2 bg-purple-500/20 text-purple-300 rounded-xl border border-purple-400/30">
              <Palette className="w-6 h-6" />
            </span>
            <h2 className="text-xl font-black uppercase tracking-wide">SYSTEM EMAIL TEMPLATE DESIGNER</h2>
          </div>
          <p className="text-xs text-slate-300">
            Customize official email layouts, placeholders, headers & color themes for all automated dispatches.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={() => setIsTestModalOpen(true)}
            className="flex items-center gap-2 px-4 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold rounded-xl border border-slate-700 transition"
          >
            <Send className="w-4 h-4 text-emerald-400" />
            Send Test Preview Mail
          </button>
          <button
            onClick={handleSave}
            className="flex items-center gap-2 px-4 py-2.5 bg-purple-600 hover:bg-purple-500 text-white text-xs font-bold rounded-xl shadow-lg shadow-purple-600/30 transition"
          >
            <Save className="w-4 h-4" />
            Save System Template
          </button>
        </div>
      </div>

      {saveStatus && (
        <div className={`p-4 rounded-2xl text-xs font-bold flex items-center gap-2 shadow-sm ${
          saveStatus.type === 'success' ? 'bg-emerald-50 text-emerald-900 border border-emerald-200' : 'bg-rose-50 text-rose-900 border border-rose-200'
        }`}>
          {saveStatus.type === 'success' ? <CheckCircle2 className="w-5 h-5 text-emerald-600" /> : <AlertCircle className="w-5 h-5 text-rose-600" />}
          {saveStatus.text}
        </div>
      )}

      {/* Main Grid: Template Selector + Editor + Live Preview */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        
        {/* Column 1: Template Switcher Tabs (3 cols) */}
        <div className="lg:col-span-3 space-y-3">
          <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm space-y-3">
            <h3 className="text-xs font-extrabold uppercase tracking-wider text-slate-500 flex items-center gap-2">
              <Layers className="w-4 h-4 text-purple-600" />
              Active System Templates
            </h3>

            <div className="space-y-1.5">
              {emailTemplates.map(tpl => {
                const isSelected = tpl.id === selectedTemplateId;
                return (
                  <button
                    key={tpl.id}
                    onClick={() => handleSelectTemplate(tpl.id)}
                    className={`w-full text-left p-3 rounded-xl text-xs transition border flex flex-col gap-1 ${
                      isSelected 
                        ? 'bg-purple-50 border-purple-300 text-purple-900 font-bold shadow-sm' 
                        : 'bg-slate-50/50 border-slate-200 text-slate-700 hover:bg-slate-100 font-medium'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="truncate">{tpl.name}</span>
                      <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: tpl.accent_color || '#1e3a8a' }} />
                    </div>
                    <span className="text-[10px] text-slate-400 font-mono">Type: {tpl.type}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Variable Tags Cheat-sheet Box */}
          <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm space-y-3">
            <h3 className="text-xs font-extrabold uppercase tracking-wider text-slate-500 flex items-center gap-2">
              <Tag className="w-4 h-4 text-purple-600" />
              Click Tag to Insert
            </h3>

            <div className="flex flex-wrap gap-1.5 max-h-56 overflow-y-auto">
              {VARIABLE_TAGS.map(vt => (
                <button
                  key={vt.tag}
                  onClick={() => handleInsertTag(vt.tag)}
                  title={vt.desc}
                  className="px-2 py-1 bg-slate-100 hover:bg-purple-100 text-slate-700 hover:text-purple-900 border border-slate-200 rounded-lg text-[11px] font-mono font-semibold transition"
                >
                  {vt.tag}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Column 2: Template Editor Controls (5 cols) */}
        <div className="lg:col-span-5 bg-white p-5 rounded-2xl border border-slate-200 shadow-sm space-y-4">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
              <Sliders className="w-4 h-4 text-purple-600" />
              Template Settings: {currentTemplate?.name}
            </h3>
          </div>

          <div className="space-y-3 text-xs">
            
            {/* Header Title Banner */}
            <div>
              <label className="block font-bold text-slate-700 mb-1">Header Title Banner</label>
              <input 
                type="text"
                value={headerTitle}
                onChange={e => setHeaderTitle(e.target.value)}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl font-bold text-slate-800 focus:ring-2 focus:ring-purple-500"
              />
            </div>

            {/* Email Subject Line */}
            <div>
              <label className="block font-bold text-slate-700 mb-1">Email Subject Line</label>
              <input 
                type="text"
                value={subject}
                onChange={e => setSubject(e.target.value)}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl font-medium text-slate-800 focus:ring-2 focus:ring-purple-500"
              />
            </div>

            {/* Accent Theme Color */}
            <div>
              <label className="block font-bold text-slate-700 mb-1">Theme Accent Color</label>
              <div className="flex items-center gap-2">
                <input 
                  type="color"
                  value={accentColor}
                  onChange={e => setAccentColor(e.target.value)}
                  className="w-9 h-9 rounded-xl border border-slate-200 cursor-pointer p-0.5"
                />
                <div className="flex flex-wrap gap-1">
                  {PRESET_ACCENTS.map(pa => (
                    <button
                      key={pa.color}
                      type="button"
                      onClick={() => setAccentColor(pa.color)}
                      className={`w-6 h-6 rounded-lg border border-slate-300 transition ${accentColor === pa.color ? 'ring-2 ring-purple-600 scale-110' : ''}`}
                      style={{ backgroundColor: pa.color }}
                      title={pa.label}
                    />
                  ))}
                </div>
              </div>
            </div>

            {/* Template Body */}
            <div>
              <label className="block font-bold text-slate-700 mb-1">
                Body Message Content (Supports Placeholders)
              </label>
              <textarea 
                rows={10}
                value={body}
                onChange={e => setBody(e.target.value)}
                className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-slate-800 font-mono text-[11px] leading-relaxed focus:ring-2 focus:ring-purple-500"
              />
            </div>

            {/* Footer Text */}
            <div>
              <label className="block font-bold text-slate-700 mb-1">Footer Disclaimer Text</label>
              <input 
                type="text"
                value={footer}
                onChange={e => setFooter(e.target.value)}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-slate-800 focus:ring-2 focus:ring-purple-500"
              />
            </div>

          </div>
        </div>

        {/* Column 3: Live Rendered Preview Pane (4 cols) */}
        <div className="lg:col-span-4 bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex flex-col space-y-3">
          
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
              <Eye className="w-4 h-4 text-emerald-600" />
              Live Email Render Preview
            </h3>
            <span className="text-[10px] font-extrabold uppercase bg-emerald-50 text-emerald-700 px-2 py-0.5 rounded-full border border-emerald-200">
              Interactive
            </span>
          </div>

          {/* Simulated Email Canvas */}
          <div className="flex-1 bg-slate-100 p-3 rounded-2xl overflow-y-auto">
            
            <div className="bg-white rounded-xl shadow-md border border-slate-200 overflow-hidden text-xs">
              
              {/* Header Banner */}
              <div 
                className="p-4 text-white text-center space-y-2 transition-colors duration-300"
                style={{ backgroundColor: accentColor }}
              >
                {siteBranding.logo_url && (
                  <div className="flex justify-center">
                    <img
                      src={siteBranding.logo_url}
                      alt="School logo"
                      className="max-h-20 max-w-[200px] object-contain"
                    />
                  </div>
                )}
                <h4 className="font-extrabold text-sm uppercase tracking-wider">
                  {renderPreviewText(headerTitle)}
                </h4>
                <p className="text-[10px] opacity-80 uppercase tracking-widest font-mono">
                  Official Notification
                </p>
              </div>

              {/* Subject Bar */}
              <div className="bg-slate-50 p-3 border-b border-slate-200 text-slate-700 font-bold text-[11px]">
                <span className="text-slate-400 font-mono mr-1">Subject:</span>
                {renderPreviewText(subject)}
              </div>

              {/* Body Content */}
              <div className="p-4 text-slate-800 space-y-2 whitespace-pre-line text-xs leading-relaxed font-sans">
                {renderPreviewText(body)}
              </div>

              {/* Attachment Badge Simulation */}
              <div className="mx-4 mb-4 p-2.5 bg-slate-50 rounded-xl border border-slate-200 flex items-center gap-2 text-[11px] text-slate-600 font-semibold">
                <FileText className="w-4 h-4 text-purple-600" />
                <span>[ Attached Official Document PDF ]</span>
              </div>

              {/* Footer */}
              <div className="bg-slate-50 p-3 border-t border-slate-200 text-center text-[10px] text-slate-500 font-medium">
                {renderPreviewText(footer)}
              </div>

            </div>

          </div>

        </div>

      </div>

      {/* Send Test Email Modal */}
      {isTestModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-200 space-y-4 relative">
            
            <button
              onClick={() => setIsTestModalOpen(false)}
              className="absolute top-4 right-4 text-slate-400 hover:text-slate-600 p-1 rounded-lg"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="flex items-center gap-3 border-b border-slate-100 pb-3">
              <div className="p-2.5 bg-emerald-50 text-emerald-600 rounded-xl">
                <Send className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-900">Dispatch Test Email</h3>
                <p className="text-xs text-slate-500">Test live Brevo SMTP delivery with current template</p>
              </div>
            </div>

            <div className="space-y-3 text-xs">
              <div>
                <label className="block font-bold text-slate-700 mb-1">Target Email Address</label>
                <input
                  type="email"
                  value={testEmail}
                  onChange={e => setTestEmail(e.target.value)}
                  placeholder="e.g. name@example.com"
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-slate-800 font-semibold focus:ring-2 focus:ring-emerald-500"
                />
              </div>

              {testLog && (
                <div className={`p-3 rounded-xl text-[11px] font-mono leading-relaxed whitespace-pre-wrap ${
                  testLog.startsWith('Success') ? 'bg-emerald-50 text-emerald-900 border border-emerald-200' : 'bg-slate-100 text-slate-800 border border-slate-200'
                }`}>
                  {testLog}
                </div>
              )}

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsTestModalOpen(false)}
                  className="px-4 py-2 bg-slate-100 text-slate-700 font-semibold rounded-xl hover:bg-slate-200 transition"
                >
                  Close
                </button>
                <button
                  type="button"
                  onClick={handleSendTestEmail}
                  disabled={isSendingTest}
                  className="px-5 py-2 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-xl shadow-lg shadow-emerald-600/30 transition disabled:opacity-50 flex items-center gap-2"
                >
                  {isSendingTest ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Sending via SMTP…
                    </>
                  ) : (
                    'Send Live Test Email'
                  )}
                </button>
              </div>
            </div>

          </div>
        </div>
      )}

    </div>
  );
};
