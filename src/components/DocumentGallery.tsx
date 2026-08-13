import React, { useMemo, useRef, useState } from 'react';
import {
  FileText,
  Upload,
  Eye,
  Trash2,
  PlusCircle,
  Image as ImageIcon,
  FolderOpen
} from 'lucide-react';
import { DynamicCustomField, GalleryDocument } from '../types';
import {
  CollectedDocument,
  collectStudentDocuments,
  collectTeacherDocuments,
  readFileAsDataUrl,
  sourceLabel
} from '../lib/documentGalleryUtils';
import { uploadEntityDocumentViaApi } from '../../entityDocumentStorage';
import { isImageUrl } from '../lib/pdfViewerUtils';

const FILE_ACCEPT = 'application/pdf,.pdf,image/jpeg,image/png,image/webp,image/gif,image/*';

type GalleryEntity = {
  id?: string;
  custom_fields?: Record<string, any>;
  document_gallery?: GalleryDocument[];
  profile_image_url?: string;
  b_form_doc?: string;
  father_cnic_doc?: string;
  death_certificate_doc?: string;
  leaving_cert_doc?: string;
  cnic_doc?: string;
  degree_doc?: string;
  work_exp_doc?: string;
};

interface DocumentGalleryProps {
  entityType: 'student' | 'teacher';
  entity: GalleryEntity;
  customFields: DynamicCustomField[];
  onUpdateEntity: (patch: Partial<GalleryEntity>) => void;
  onPreview: (title: string, url: string) => void;
  onNotify?: (message: string) => void;
  readOnly?: boolean;
}

export const DocumentGallery: React.FC<DocumentGalleryProps> = ({
  entityType,
  entity,
  customFields,
  onUpdateEntity,
  onPreview,
  onNotify,
  readOnly = false
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [customTitle, setCustomTitle] = useState('');
  const [uploadTarget, setUploadTarget] = useState<string>('__gallery__');
  const [isUploading, setIsUploading] = useState(false);

  const documents = useMemo(() => {
    if (entityType === 'student') {
      return collectStudentDocuments(entity as any, customFields);
    }
    return collectTeacherDocuments(entity as any, customFields);
  }, [entity, entityType, customFields]);

  const targetOptions = useMemo(() => {
    const options: Array<{ value: string; label: string }> = [
      { value: '__gallery__', label: 'Custom Gallery Upload (new document)' }
    ];

    if (entityType === 'student') {
      options.push(
        { value: 'profile_image_url', label: 'Profile Photo' },
        { value: 'b_form_doc', label: 'B-Form / Birth Certificate' },
        { value: 'father_cnic_doc', label: 'Father CNIC Scan' },
        { value: 'death_certificate_doc', label: 'Death Certificate' },
        { value: 'leaving_cert_doc', label: 'Leaving Certificate' }
      );
    } else {
      options.push(
        { value: 'profile_image_url', label: 'Profile Photo' },
        { value: 'cnic_doc', label: 'CNIC Card Scan' },
        { value: 'degree_doc', label: 'Degree Certificate' },
        { value: 'work_exp_doc', label: 'Work Experience Certificate' }
      );
    }

    customFields
      .filter(f => f.target === entityType && f.fieldType === 'file')
      .forEach(f => {
        options.push({ value: `cf:${f.fieldName}`, label: `Custom: ${f.fieldName}` });
      });

    return options;
  }, [entityType, customFields]);

  const notify = (msg: string) => onNotify?.(msg);

  const persistDocumentUrl = async (
    docId: string,
    dataUrl: string,
    fileName: string
  ): Promise<{ url: string; storage_path?: string; storage_bucket?: string; storagePersisted?: boolean }> => {
    const entityId = entity.id;
    if (!entityId) {
      throw new Error('Save the record before uploading documents.');
    }

    const folder = entityType === 'student' ? 'students' : 'teachers';
    const uploaded = await uploadEntityDocumentViaApi(folder, entityId, docId, dataUrl, fileName);
    return uploaded;
  };

  const handleUpload = async (file: File) => {
    setIsUploading(true);
    try {
      const dataUrl = await readFileAsDataUrl(file);

      if (uploadTarget === '__gallery__') {
        const title = customTitle.trim() || file.name.replace(/\.[^.]+$/, '');
        const docId = 'gal-' + Date.now();
        const stored = await persistDocumentUrl(docId, dataUrl, file.name);
        const newDoc: GalleryDocument = {
          id: docId,
          title,
          url: stored.url,
          uploaded_at: new Date().toISOString(),
          storage_path: stored.storage_path,
          storage_bucket: stored.storage_bucket,
          storage_persisted: stored.storagePersisted
        };
        onUpdateEntity({
          document_gallery: [...(entity.document_gallery || []), newDoc]
        });
        setCustomTitle('');
        notify(`"${title}" added to document gallery.`);
        return;
      }

      if (uploadTarget.startsWith('cf:')) {
        const fieldName = uploadTarget.slice(3);
        const stored = await persistDocumentUrl(`cf-${fieldName}`, dataUrl, file.name);
        onUpdateEntity({
          custom_fields: { ...(entity.custom_fields || {}), [fieldName]: stored.url }
        });
        notify(`Uploaded to custom field "${fieldName}".`);
        return;
      }

      const stored = await persistDocumentUrl(uploadTarget, dataUrl, file.name);
      onUpdateEntity({ [uploadTarget]: stored.url });
      const label = targetOptions.find(o => o.value === uploadTarget)?.label || 'Document';
      notify(`"${label}" updated successfully.`);
    } catch {
      notify('Upload failed — document could not be saved to database. Please try again.');
    } finally {
      setIsUploading(false);
    }
  };

  const handleDelete = (doc: CollectedDocument) => {
    if (!confirm(`Remove "${doc.title}" from the gallery?`)) return;

    if (doc.source === 'gallery_upload') {
      onUpdateEntity({
        document_gallery: (entity.document_gallery || []).filter(d => d.id !== doc.id)
      });
      notify(`Removed "${doc.title}" from gallery.`);
      return;
    }

    if (doc.source === 'custom_field' && doc.fieldKey) {
      const next = { ...(entity.custom_fields || {}) };
      delete next[doc.fieldKey];
      onUpdateEntity({ custom_fields: next });
      notify(`Removed custom field document "${doc.title}".`);
      return;
    }

    if (doc.source === 'standard' && doc.fieldKey) {
      onUpdateEntity({ [doc.fieldKey]: undefined });
      notify(`Removed "${doc.title}".`);
    }
  };

  const handleReplace = async (doc: CollectedDocument, file: File) => {
    try {
      const dataUrl = await readFileAsDataUrl(file);
      const stored = await persistDocumentUrl(doc.id, dataUrl, file.name);

      if (doc.source === 'gallery_upload') {
        onUpdateEntity({
          document_gallery: (entity.document_gallery || []).map(d =>
            d.id === doc.id
              ? {
                  ...d,
                  url: stored.url,
                  uploaded_at: new Date().toISOString(),
                  storage_path: stored.storage_path ?? d.storage_path,
                  storage_bucket: stored.storage_bucket ?? d.storage_bucket,
                  storage_persisted: stored.storagePersisted ?? d.storage_persisted
                }
              : d
          )
        });
      } else if (doc.source === 'custom_field' && doc.fieldKey) {
        onUpdateEntity({
          custom_fields: { ...(entity.custom_fields || {}), [doc.fieldKey]: stored.url }
        });
      } else if (doc.fieldKey) {
        onUpdateEntity({ [doc.fieldKey]: stored.url });
      }

      notify(`Replaced "${doc.title}".`);
    } catch {
      notify('Failed to replace file.');
    }
  };

  const sourceBadgeClass = (source: CollectedDocument['source']) => {
    switch (source) {
      case 'standard': return 'bg-blue-100 text-blue-800 border-blue-200';
      case 'custom_field': return 'bg-indigo-100 text-indigo-800 border-indigo-200';
      case 'gallery_upload': return 'bg-amber-100 text-amber-900 border-amber-200';
    }
  };

  const openFilePicker = () => fileInputRef.current?.click();

  return (
    <div className="space-y-5 text-xs pb-24">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b pb-3">
        <div>
          <h3 className="text-sm font-black text-slate-900 uppercase tracking-wider flex items-center gap-2">
            <FolderOpen className="w-4 h-4 text-blue-900" />
            Complete Document Gallery
          </h3>
          <p className="text-[11px] text-slate-500 mt-1">
            All PDFs and images — from standard fields, custom fields, and gallery uploads.
          </p>
        </div>
        <span className="text-[10px] font-bold text-blue-900 bg-blue-50 px-3 py-1.5 rounded-full border border-blue-200">
          {documents.length} document{documents.length !== 1 ? 's' : ''} total
        </span>
      </div>

      {!readOnly && (
        <>
          {/* Hidden file input — shared by all upload triggers */}
          <input
            ref={fileInputRef}
            type="file"
            accept={FILE_ACCEPT}
            className="hidden"
            onChange={e => {
              const file = e.target.files?.[0];
              if (file) handleUpload(file);
              e.target.value = '';
            }}
          />

          {/* Prominent upload banner */}
          <div className="p-5 bg-gradient-to-r from-blue-900 via-indigo-900 to-slate-900 rounded-2xl text-white space-y-4 shadow-xl">
            <div className="flex items-center gap-2">
              <Upload className="w-5 h-5 text-amber-400" />
              <span className="font-black uppercase tracking-wider text-sm">Upload PDF or Image</span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block font-bold text-blue-100 mb-1 text-[11px]">Save To</label>
                <select
                  value={uploadTarget}
                  onChange={e => setUploadTarget(e.target.value)}
                  className="w-full px-3 py-2.5 rounded-xl border-0 font-semibold text-slate-900"
                >
                  {targetOptions.map(opt => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
                </select>
              </div>

              {uploadTarget === '__gallery__' && (
                <div>
                  <label className="block font-bold text-blue-100 mb-1 text-[11px]">Document Title</label>
                  <input
                    type="text"
                    value={customTitle}
                    onChange={e => setCustomTitle(e.target.value)}
                    placeholder="e.g. Medical Report, Transfer Letter"
                    className="w-full px-3 py-2.5 rounded-xl border-0 text-slate-900"
                  />
                </div>
              )}
            </div>

            <button
              type="button"
              disabled={isUploading}
              onClick={openFilePicker}
              className="w-full py-3.5 bg-amber-500 hover:bg-amber-400 disabled:opacity-60 text-slate-900 font-black text-sm rounded-xl flex items-center justify-center gap-2 shadow-lg transition-all"
            >
              <PlusCircle className="w-5 h-5" />
              {isUploading ? 'Uploading…' : 'Choose PDF / Image File to Upload'}
            </button>
          </div>
        </>
      )}

      {/* All documents grid */}
      {documents.length > 0 ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {documents.map(doc => (
            <div
              key={doc.id}
              className="p-4 bg-white border border-slate-200 rounded-2xl space-y-3 hover:border-blue-400 hover:shadow-md transition-all"
            >
              <div className="flex items-start gap-3">
                <div className="w-14 h-14 rounded-xl bg-slate-100 border border-slate-200 overflow-hidden flex items-center justify-center shrink-0">
                  {isImageUrl(doc.url) ? (
                    <img src={doc.url} alt={doc.title} className="w-full h-full object-cover" />
                  ) : (
                    <FileText className="w-7 h-7 text-blue-900" />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <span className="block font-black text-slate-900 text-sm truncate">{doc.title}</span>
                  <span className={`inline-block mt-1 px-2 py-0.5 rounded-md text-[9px] font-bold border ${sourceBadgeClass(doc.source)}`}>
                    {sourceLabel(doc.source)}
                  </span>
                  {doc.uploadedAt && (
                    <span className="block text-[10px] text-slate-400 mt-1">
                      {new Date(doc.uploadedAt).toLocaleDateString()}
                    </span>
                  )}
                </div>
              </div>

              <div className="flex flex-wrap gap-1.5">
                <button
                  type="button"
                  onClick={() => onPreview(doc.title, doc.url)}
                  className="px-2.5 py-1.5 bg-amber-500 hover:bg-amber-600 text-slate-900 rounded-lg font-bold text-[10px] flex items-center gap-1"
                >
                  <Eye className="w-3 h-3" /> Preview
                </button>

                {!readOnly && (
                  <>
                    <label className="px-2.5 py-1.5 bg-blue-900 hover:bg-blue-800 text-white rounded-lg font-bold text-[10px] cursor-pointer flex items-center gap-1">
                      <Upload className="w-3 h-3" /> Replace
                      <input
                        type="file"
                        accept={FILE_ACCEPT}
                        className="hidden"
                        onChange={e => {
                          const file = e.target.files?.[0];
                          if (file) handleReplace(doc, file);
                          e.target.value = '';
                        }}
                      />
                    </label>

                    <button
                      type="button"
                      onClick={() => handleDelete(doc)}
                      className="px-2 py-1.5 bg-red-100 hover:bg-red-200 text-red-700 rounded-lg font-bold text-[10px] flex items-center gap-1"
                    >
                      <Trash2 className="w-3 h-3" /> Remove
                    </button>
                  </>
                )}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="p-8 text-center bg-slate-50 border border-dashed border-slate-300 rounded-2xl space-y-3">
          <ImageIcon className="w-10 h-10 text-slate-400 mx-auto" />
          <p className="font-bold text-slate-600">No documents uploaded yet</p>
          <p className="text-[11px] text-slate-500">
            Click the amber <strong>Choose PDF / Image File to Upload</strong> button above to add documents.
          </p>
          {!readOnly && (
            <button
              type="button"
              onClick={openFilePicker}
              className="mt-2 px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl inline-flex items-center gap-2"
            >
              <Upload className="w-4 h-4" /> Upload First Document
            </button>
          )}
        </div>
      )}

      {/* Sticky bottom upload bar — always visible while scrolling */}
      {!readOnly && (
        <div className="sticky bottom-0 left-0 right-0 z-10 pt-3 pb-1 bg-gradient-to-t from-white via-white to-transparent">
          <button
            type="button"
            disabled={isUploading}
            onClick={openFilePicker}
            className="w-full py-3 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 text-white font-extrabold text-sm rounded-xl flex items-center justify-center gap-2 shadow-xl border border-indigo-500"
          >
            <Upload className="w-5 h-5" />
            {isUploading ? 'Uploading…' : 'Upload PDF / Image to Gallery'}
          </button>
        </div>
      )}
    </div>
  );
};

/** Compact read-only / upload preview for admission forms */
export const DocumentGalleryPreview: React.FC<{
  entityType: 'student' | 'teacher';
  entity: GalleryEntity;
  customFields: DynamicCustomField[];
  extraGallery?: GalleryDocument[];
  onAddGalleryDoc?: (doc: GalleryDocument) => void;
  onPreview: (title: string, url: string) => void;
}> = ({ entityType, entity, customFields, extraGallery = [], onAddGalleryDoc, onPreview }) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [title, setTitle] = useState('');

  const mergedEntity = useMemo(
    () => ({ ...entity, document_gallery: [...(entity.document_gallery || []), ...extraGallery] }),
    [entity, extraGallery]
  );

  const documents = useMemo(() => {
    if (entityType === 'student') return collectStudentDocuments(mergedEntity as any, customFields);
    return collectTeacherDocuments(mergedEntity as any, customFields);
  }, [mergedEntity, entityType, customFields]);

  const handleFile = async (file: File) => {
    if (!onAddGalleryDoc) return;
    const dataUrl = await readFileAsDataUrl(file);
    onAddGalleryDoc({
      id: 'gal-' + Date.now(),
      title: title.trim() || file.name.replace(/\.[^.]+$/, ''),
      url: dataUrl,
      uploaded_at: new Date().toISOString()
    });
    setTitle('');
  };

  return (
    <div className="border-t border-slate-200 pt-4 space-y-3">
      <h3 className="text-sm font-black uppercase text-blue-900 tracking-wider flex items-center gap-2">
        <FolderOpen className="w-4 h-4" />
        Document Gallery Preview ({documents.length})
      </h3>

      {onAddGalleryDoc && (
        <div className="flex flex-col sm:flex-row gap-2 p-3 bg-indigo-50 rounded-xl border border-indigo-200">
          <input
            type="text"
            value={title}
            onChange={e => setTitle(e.target.value)}
            placeholder="Document title (optional)"
            className="flex-1 px-3 py-2 rounded-lg border border-slate-300 text-sm"
          />
          <input ref={fileInputRef} type="file" accept={FILE_ACCEPT} className="hidden" onChange={e => {
            const f = e.target.files?.[0];
            if (f) handleFile(f);
            e.target.value = '';
          }} />
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-lg flex items-center justify-center gap-2 whitespace-nowrap"
          >
            <Upload className="w-4 h-4" /> Upload PDF / Image
          </button>
        </div>
      )}

      {documents.length > 0 ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
          {documents.map(doc => (
            <button
              key={doc.id}
              type="button"
              onClick={() => onPreview(doc.title, doc.url)}
              className="p-3 bg-slate-50 border border-slate-200 rounded-xl text-left hover:border-blue-400 hover:bg-blue-50 transition-all"
            >
              <FileText className="w-6 h-6 text-blue-800 mb-1" />
              <span className="block text-[11px] font-bold text-slate-800 truncate">{doc.title}</span>
              <span className="text-[9px] text-indigo-600">{sourceLabel(doc.source)}</span>
            </button>
          ))}
        </div>
      ) : (
        <p className="text-xs text-slate-500 italic">Upload documents above — they will appear here instantly.</p>
      )}
    </div>
  );
};
