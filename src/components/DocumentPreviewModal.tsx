import React, { useState, useEffect } from 'react';
import { FileText, Download, ExternalLink, X, AlertCircle } from 'lucide-react';
import { getPDFViewerUrl, isPDFUrl, isImageUrl } from '../lib/pdfViewerUtils';
import { resolveDocumentPreviewUrl, revokeDocumentPreviewUrl } from '../lib/documentPreviewUtils';

interface DocumentPreviewModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  url?: string | null;
  fileName?: string;
  subTitle?: string;
}

export const DocumentPreviewModal: React.FC<DocumentPreviewModalProps> = ({
  isOpen,
  onClose,
  title,
  url,
  fileName,
  subTitle
}) => {
  const [blobUrl, setBlobUrl] = useState<string>('');
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [viewMode, setViewMode] = useState<'embedded' | 'object' | 'fallback'>('embedded');

  useEffect(() => {
    let active = true;
    let createdBlob = '';

    const load = async () => {
      if (!url) {
        setBlobUrl('');
        setLoadError(null);
        return;
      }

      setIsLoading(true);
      setLoadError(null);
      setViewMode('embedded');

      try {
        const resolved = isPDFUrl(url) || url.startsWith('/api/')
          ? await resolveDocumentPreviewUrl(url)
          : getPDFViewerUrl(url) || url;
        if (!active) {
          revokeDocumentPreviewUrl(resolved);
          return;
        }
        createdBlob = resolved;
        setBlobUrl(resolved);
      } catch (err) {
        if (!active) return;
        setBlobUrl('');
        setLoadError(err instanceof Error ? err.message : 'Could not load document preview.');
      } finally {
        if (active) setIsLoading(false);
      }
    };

    void load();

    return () => {
      active = false;
      if (createdBlob) revokeDocumentPreviewUrl(createdBlob);
    };
  }, [url]);

  if (!isOpen) return null;

  const effectiveFileName = fileName || `${title.replace(/\s+/g, '_')}.${isPDFUrl(url) ? 'pdf' : 'png'}`;
  const isPdf = isPDFUrl(url);
  const isImg = isImageUrl(url);

  const handleDownload = () => {
    if (!url && !blobUrl) return;
    const downloadUrl = blobUrl || url || '';
    const link = document.createElement('a');
    link.href = downloadUrl;
    link.download = effectiveFileName;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleOpenNewTab = () => {
    if (!url && !blobUrl) return;
    const targetUrl = blobUrl || url || '';
    window.open(targetUrl, '_blank');
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-3 sm:p-6 bg-slate-950/80 backdrop-blur-md animate-in fade-in">
      <div className="bg-slate-900 text-white rounded-3xl max-w-5xl w-full flex flex-col max-h-[92vh] shadow-2xl border border-slate-800 overflow-hidden">
        
        {/* Modal Header */}
        <div className="px-6 py-4 bg-slate-900 border-b border-slate-800 flex justify-between items-center shrink-0">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-blue-900/60 text-amber-400 rounded-2xl border border-blue-800/80">
              <FileText className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-extrabold text-white tracking-wide flex items-center gap-2">
                {title}
                {isPdf && (
                  <span className="px-2 py-0.5 bg-amber-500/20 text-amber-300 font-mono text-[10px] font-black rounded-md border border-amber-500/30 uppercase">
                    PDF Document
                  </span>
                )}
              </h3>
              {subTitle && <p className="text-xs text-slate-400">{subTitle}</p>}
            </div>
          </div>

          <div className="flex items-center gap-2">
            {(url || blobUrl) && (
              <>
                <button
                  type="button"
                  onClick={handleOpenNewTab}
                  title="Open in New Window / Fullscreen"
                  className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold rounded-xl flex items-center gap-1.5 border border-slate-700 transition-all"
                >
                  <ExternalLink className="w-3.5 h-3.5 text-blue-400" />
                  <span className="hidden sm:inline">Open New Tab</span>
                </button>

                <button
                  type="button"
                  onClick={handleDownload}
                  title="Download File"
                  className="px-3 py-1.5 bg-blue-900 hover:bg-blue-800 text-white text-xs font-extrabold rounded-xl flex items-center gap-1.5 shadow-md transition-all border border-blue-700"
                >
                  <Download className="w-3.5 h-3.5 text-amber-300" />
                  <span className="hidden sm:inline">Download</span>
                </button>
              </>
            )}

            <button
              type="button"
              onClick={onClose}
              className="p-2 text-slate-400 hover:text-white bg-slate-800 hover:bg-slate-700 rounded-xl transition-all"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Modal Main Content Container */}
        <div className="flex-1 bg-slate-950 p-4 sm:p-6 overflow-hidden flex flex-col items-center justify-center min-h-[420px]">
          {isLoading ? (
            <div className="text-center p-8 space-y-3">
              <FileText className="w-16 h-16 text-blue-400 mx-auto animate-pulse" />
              <p className="text-slate-300 font-bold text-sm">Loading document preview…</p>
            </div>
          ) : loadError ? (
            <div className="text-center p-8 space-y-3 max-w-md">
              <AlertCircle className="w-16 h-16 text-amber-400 mx-auto" />
              <p className="text-white font-bold text-sm">Preview unavailable</p>
              <p className="text-slate-400 text-xs">{loadError}</p>
              <p className="text-slate-500 text-[11px]">
                If this document was uploaded before storage was configured, open the record and re-upload the file once.
              </p>
            </div>
          ) : (!url && !blobUrl) ? (
            <div className="text-center p-8 space-y-3">
              <FileText className="w-16 h-16 text-slate-600 mx-auto" />
              <p className="text-slate-400 font-bold text-sm">No Document File Attached</p>
              <p className="text-slate-500 text-xs">Please upload or generate a PDF file for this record.</p>
            </div>
          ) : isPdf ? (
            <div className="w-full h-full min-h-[480px] max-h-[70vh] flex flex-col rounded-2xl overflow-hidden border border-slate-800 bg-slate-900 shadow-inner">
              {viewMode === 'embedded' ? (
                <object
                  data={blobUrl || url || undefined}
                  type="application/pdf"
                  className="w-full h-full min-h-[480px] rounded-2xl"
                  onError={() => setViewMode('fallback')}
                >
                  <iframe
                    src={blobUrl || url || undefined}
                    title={title}
                    className="w-full h-full min-h-[480px] rounded-2xl border-0"
                    onError={() => setViewMode('fallback')}
                  >
                    <div className="p-8 text-center text-slate-300 space-y-4 my-auto">
                      <FileText className="w-12 h-12 text-amber-400 mx-auto animate-bounce" />
                      <p className="font-extrabold text-base text-white">Interactive PDF Viewer</p>
                      <p className="text-xs text-slate-400 max-w-md mx-auto">
                        Your browser security settings prevented inline PDF rendering inside iframe. Click below to view or download.
                      </p>
                      <div className="flex justify-center gap-3 pt-2">
                        <button
                          onClick={handleOpenNewTab}
                          className="px-4 py-2 bg-blue-900 hover:bg-blue-800 text-white text-xs font-bold rounded-xl flex items-center gap-2"
                        >
                          <ExternalLink className="w-4 h-4 text-amber-300" /> Open PDF Document
                        </button>
                        <button
                          onClick={handleDownload}
                          className="px-4 py-2 bg-amber-500 hover:bg-amber-600 text-slate-950 text-xs font-black rounded-xl flex items-center gap-2"
                        >
                          <Download className="w-4 h-4" /> Download PDF
                        </button>
                      </div>
                    </div>
                  </iframe>
                </object>
              ) : (
                <div className="p-12 text-center text-slate-300 space-y-4 my-auto">
                  <FileText className="w-16 h-16 text-amber-400 mx-auto" />
                  <p className="font-extrabold text-lg text-white">PDF Document Ready</p>
                  <p className="text-xs text-slate-400 max-w-md mx-auto">
                    The PDF file is parsed and ready in high quality vector format.
                  </p>
                  <div className="flex justify-center gap-3 pt-3">
                    <button
                      onClick={handleOpenNewTab}
                      className="px-5 py-2.5 bg-blue-900 hover:bg-blue-800 text-white text-xs font-extrabold rounded-xl flex items-center gap-2 shadow-lg"
                    >
                      <ExternalLink className="w-4 h-4 text-amber-300" /> Open PDF Viewer
                    </button>
                    <button
                      onClick={handleDownload}
                      className="px-5 py-2.5 bg-amber-500 hover:bg-amber-600 text-slate-950 text-xs font-black rounded-xl flex items-center gap-2 shadow-lg"
                    >
                      <Download className="w-4 h-4" /> Download PDF
                    </button>
                  </div>
                </div>
              )}
            </div>
          ) : isImg ? (
            <div className="w-full h-full flex items-center justify-center p-2">
              <img
                src={url || blobUrl}
                alt={title}
                className="max-w-full max-h-[65vh] object-contain rounded-2xl shadow-2xl border border-slate-800 bg-slate-900"
              />
            </div>
          ) : (
            <div className="text-center p-8 space-y-4">
              <FileText className="w-16 h-16 text-blue-400 mx-auto" />
              <p className="font-extrabold text-base text-white">Document File Preview</p>
              <p className="text-xs text-slate-400 font-mono max-w-lg break-all">
                {fileName || 'Document attached to record.'}
              </p>
              <div className="flex justify-center gap-3 pt-2">
                <button
                  onClick={handleDownload}
                  className="px-5 py-2.5 bg-amber-500 hover:bg-amber-600 text-slate-950 font-black text-xs rounded-xl flex items-center gap-2"
                >
                  <Download className="w-4 h-4" /> Download Document
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="px-6 py-3 bg-slate-900 border-t border-slate-800 flex justify-between items-center shrink-0 text-xs text-slate-400">
          <span className="font-mono text-[11px] text-slate-500 truncate max-w-md">
            File: {effectiveFileName}
          </span>
          <button
            type="button"
            onClick={onClose}
            className="px-5 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold text-xs rounded-xl transition-all"
          >
            Close
          </button>
        </div>

      </div>
    </div>
  );
};
