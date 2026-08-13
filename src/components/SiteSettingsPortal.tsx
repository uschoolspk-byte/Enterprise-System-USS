import React, { useState, useEffect } from 'react';

import {

  Settings,

  Save,

  RotateCcw,

  Upload,

  Eye,

  GraduationCap,

  Image as ImageIcon,

  AlertCircle,

  CheckCircle2

} from 'lucide-react';

import { LoadingButton } from './LoadingButton';

import { SiteBrandingSettings } from '../types';

import { INITIAL_SITE_BRANDING } from '../lib/initialData';

import { DbSyncStatus, SyncResponse } from '../lib/apiClient';



interface SiteSettingsPortalProps {

  siteBranding: SiteBrandingSettings;

  onSaveSiteBranding: (settings: SiteBrandingSettings) => Promise<SyncResponse | null>;

  dbSyncStatus?: DbSyncStatus;

  isSyncing?: boolean;

}



export const SiteSettingsPortal: React.FC<SiteSettingsPortalProps> = ({

  siteBranding,

  onSaveSiteBranding,

  dbSyncStatus,

  isSyncing = false

}) => {

  const [draft, setDraft] = useState<SiteBrandingSettings>(siteBranding);

  const [toastMsg, setToastMsg] = useState<string | null>(null);

  const [toastType, setToastType] = useState<'success' | 'error'>('success');

  const [isSaving, setIsSaving] = useState(false);



  useEffect(() => {

    setDraft(siteBranding);

  }, [siteBranding]);



  const showToast = (message: string, type: 'success' | 'error' = 'success') => {

    setToastMsg(message);

    setToastType(type);

    setTimeout(() => setToastMsg(null), 5000);

  };



  const handleLogoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {

    const file = e.target.files?.[0];

    if (!file) return;

    if (!file.type.startsWith('image/')) {

      showToast('Please upload an image file (PNG, JPG, SVG, etc.)', 'error');

      return;

    }

    const reader = new FileReader();

    reader.onload = () => {

      setDraft(prev => ({ ...prev, logo_url: reader.result as string }));

    };

    reader.readAsDataURL(file);

  };



  const persistBranding = async (settings: SiteBrandingSettings) => {

    setIsSaving(true);

    try {

      const result = await onSaveSiteBranding(settings);

      const synced = Boolean(result?.success || result?.supabase || result?.mongodb);



      if (synced) {

        const stores = [

          result?.supabase ? 'Supabase' : null,

          result?.mongodb ? 'MongoDB' : null

        ].filter(Boolean).join(' & ');

        showToast(`Site branding saved and synced to ${stores || 'database'}.`);

      } else {

        const errText = result?.errors?.join(' · ') || result?.error || 'Could not sync to database.';

        showToast(`Save failed: ${errText}`, 'error');

      }

    } catch {

      showToast('Save failed: unexpected error while syncing.', 'error');

    } finally {

      setIsSaving(false);

    }

  };



  const handleSave = () => persistBranding(draft);



  const handleReset = async () => {

    if (!confirm('Reset all header & footer branding to defaults?')) return;

    setDraft(INITIAL_SITE_BRANDING);

    await persistBranding(INITIAL_SITE_BRANDING);

  };



  const lastSyncedLabel = dbSyncStatus?.lastSyncedAt

    ? new Date(dbSyncStatus.lastSyncedAt).toLocaleString()

    : null;



  return (

    <div className="max-w-5xl mx-auto p-4 sm:p-6 space-y-6">

      {toastMsg && (

        <div

          className={`p-4 rounded-xl font-bold flex items-center gap-2 shadow-xl ${

            toastType === 'success' ? 'bg-blue-900 text-white' : 'bg-red-900 text-white'

          }`}

        >

          {toastType === 'success' ? (

            <CheckCircle2 className="w-5 h-5 text-emerald-400" />

          ) : (

            <AlertCircle className="w-5 h-5 text-amber-300" />

          )}

          {toastMsg}

        </div>

      )}



      <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-xl">

        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-b pb-4 mb-6">

          <div className="flex items-center gap-3">

            <Settings className="w-7 h-7 text-blue-900" />

            <div>

              <h2 className="text-xl font-black text-slate-900">Site Settings Portal</h2>

              <p className="text-xs text-slate-500">Edit header logo, school name, taglines, and footer text across the admin panel and all email templates.</p>

            </div>

          </div>

          <div className="text-[10px] font-bold text-slate-500 space-y-1 sm:text-right">

            <p className={isSyncing || isSaving ? 'text-amber-600' : 'text-emerald-700'}>

              {isSaving ? 'Saving to database…' : isSyncing ? 'Syncing…' : 'Database sync ready'}

            </p>

            {lastSyncedLabel && (

              <p>Last synced: {lastSyncedLabel}</p>

            )}

            {dbSyncStatus && (

              <p>

                Supabase: {dbSyncStatus.supabase ? '✓' : '—'} · MongoDB: {dbSyncStatus.mongodb ? '✓' : '—'}

              </p>

            )}

          </div>

        </div>



        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">

          {/* Editor */}

          <div className="space-y-5 text-sm">

            <section className="space-y-3">

              <h3 className="font-black text-slate-800 uppercase text-xs tracking-wider">Header Branding</h3>



              <div>

                <label className="block font-bold text-slate-700 mb-1">School Logo</label>

                <div className="flex items-center gap-3">

                  <div className="w-14 h-14 rounded-xl border-2 border-dashed border-slate-300 flex items-center justify-center overflow-hidden bg-slate-50">

                    {draft.logo_url ? (

                      <img src={draft.logo_url} alt="Logo preview" className="w-full h-full object-contain" />

                    ) : (

                      <GraduationCap className="w-7 h-7 text-blue-600" />

                    )}

                  </div>

                  <label className="cursor-pointer px-4 py-2 bg-slate-100 hover:bg-slate-200 rounded-xl font-bold text-xs flex items-center gap-2">

                    <Upload className="w-4 h-4" />

                    Upload Logo

                    <input type="file" accept="image/*" className="hidden" onChange={handleLogoUpload} />

                  </label>

                  {draft.logo_url && (

                    <button

                      type="button"

                      onClick={() => setDraft(prev => ({ ...prev, logo_url: '' }))}

                      className="text-xs text-red-600 font-bold hover:underline"

                    >

                      Remove

                    </button>

                  )}

                </div>

              </div>



              <div>

                <label className="block font-bold text-slate-700 mb-1">School Name (Header)</label>

                <input

                  value={draft.school_name}

                  onChange={e => setDraft({ ...draft, school_name: e.target.value })}

                  className="w-full px-3 py-2 border rounded-xl font-bold"

                />

              </div>



              <div>

                <label className="block font-bold text-slate-700 mb-1">Badge Text</label>

                <input

                  value={draft.badge_text}

                  onChange={e => setDraft({ ...draft, badge_text: e.target.value })}

                  className="w-full px-3 py-2 border rounded-xl"

                  placeholder="e.g. ENTERPRISE ECOSYSTEM"

                />

              </div>



              <div>

                <label className="block font-bold text-slate-700 mb-1">Header Subtitle</label>

                <input

                  value={draft.header_subtitle}

                  onChange={e => setDraft({ ...draft, header_subtitle: e.target.value })}

                  className="w-full px-3 py-2 border rounded-xl"

                  placeholder="Principal name, portal title…"

                />

              </div>



              <div>

                <label className="block font-bold text-slate-700 mb-1">Tagline</label>

                <input

                  value={draft.tagline}

                  onChange={e => setDraft({ ...draft, tagline: e.target.value })}

                  className="w-full px-3 py-2 border rounded-xl"

                />

              </div>

            </section>



            <section className="space-y-3 pt-4 border-t">

              <h3 className="font-black text-slate-800 uppercase text-xs tracking-wider">Footer Branding</h3>



              <div>

                <label className="block font-bold text-slate-700 mb-1">Footer Title Line</label>

                <input

                  value={draft.footer_title}

                  onChange={e => setDraft({ ...draft, footer_title: e.target.value })}

                  className="w-full px-3 py-2 border rounded-xl font-bold"

                />

              </div>



              <div>

                <label className="block font-bold text-slate-700 mb-1">Footer Subtitle Line</label>

                <input

                  value={draft.footer_subtitle}

                  onChange={e => setDraft({ ...draft, footer_subtitle: e.target.value })}

                  className="w-full px-3 py-2 border rounded-xl"

                />

              </div>



              <div>

                <label className="block font-bold text-slate-700 mb-1">Footer Contact / Address Line</label>

                <input

                  value={draft.footer_contact}

                  onChange={e => setDraft({ ...draft, footer_contact: e.target.value })}

                  className="w-full px-3 py-2 border rounded-xl"

                />

              </div>



              <div className="grid grid-cols-2 gap-3">

                <div>

                  <label className="block font-bold text-slate-700 mb-1">Contact Email</label>

                  <input

                    type="email"

                    value={draft.contact_email || ''}

                    onChange={e => setDraft({ ...draft, contact_email: e.target.value })}

                    className="w-full px-3 py-2 border rounded-xl text-xs"

                  />

                </div>

                <div>

                  <label className="block font-bold text-slate-700 mb-1">Contact Phone</label>

                  <input

                    value={draft.contact_phone || ''}

                    onChange={e => setDraft({ ...draft, contact_phone: e.target.value })}

                    className="w-full px-3 py-2 border rounded-xl text-xs"

                  />

                </div>

              </div>



              <div>

                <label className="block font-bold text-slate-700 mb-1">Campus Address</label>

                <input

                  value={draft.address || ''}

                  onChange={e => setDraft({ ...draft, address: e.target.value })}

                  className="w-full px-3 py-2 border rounded-xl text-xs"

                />

              </div>

            </section>



            <div className="flex gap-2 pt-4">

              <LoadingButton

                onClick={handleSave}

                loading={isSaving}

                loadingText="Saving…"

                icon={<Save className="w-4 h-4" />}

                className="flex-1 px-5 py-3 bg-blue-900 hover:bg-blue-800 text-white font-extrabold rounded-xl shadow flex items-center justify-center gap-2 disabled:opacity-70"

              >

                Save Branding

              </LoadingButton>

              <button

                onClick={handleReset}

                disabled={isSaving}

                className="px-4 py-3 bg-slate-200 hover:bg-slate-300 text-slate-800 font-bold rounded-xl flex items-center gap-2 disabled:opacity-60"

              >

                <RotateCcw className="w-4 h-4" />

                Reset

              </button>

            </div>

          </div>



          {/* Live Preview */}

          <div className="space-y-4">

            <div className="flex items-center gap-2 text-xs font-black text-slate-500 uppercase">

              <Eye className="w-4 h-4" />

              Live Preview

            </div>



            <div className="rounded-2xl overflow-hidden border border-slate-200 shadow-lg">

              <div className="bg-slate-900 text-white p-4">

                <div className="flex items-center gap-3">

                  <div className="h-14 w-14 sm:h-16 sm:w-16 shrink-0 flex items-center justify-center">

                    {draft.logo_url ? (

                      <img src={draft.logo_url} alt="" className="h-full w-full object-contain drop-shadow-md" />

                    ) : (

                      <div className="h-full w-full flex items-center justify-center rounded-xl bg-blue-600/15">

                        <GraduationCap className="w-8 h-8 sm:w-10 sm:h-10 text-blue-400" />

                      </div>

                    )}

                  </div>

                  <div>

                    <div className="flex items-center gap-2 flex-wrap">

                      <span className="font-black text-sm uppercase">{draft.school_name || 'School Name'}</span>

                      {draft.badge_text && (

                        <span className="px-2 py-0.5 text-[9px] font-extrabold rounded bg-amber-400/20 text-amber-300 border border-amber-400/30">

                          {draft.badge_text}

                        </span>

                      )}

                    </div>

                    <p className="text-[10px] text-slate-400 mt-0.5">{draft.header_subtitle}</p>

                  </div>

                </div>

              </div>



              <div className="bg-slate-50 p-6 min-h-[120px] flex items-center justify-center text-slate-400 text-xs italic">

                <ImageIcon className="w-5 h-5 mr-2 opacity-50" />

                Main portal content area

              </div>



              <div className="bg-slate-900 text-slate-400 p-4 text-center text-[10px] space-y-1">

                <p className="font-bold text-slate-300">

                  {draft.footer_title} &copy; {new Date().getFullYear()}

                </p>

                <p className="text-slate-500">{draft.footer_subtitle}</p>

                <p className="text-slate-500">{draft.footer_contact}</p>

              </div>

            </div>

          </div>

        </div>

      </div>

    </div>

  );

};


