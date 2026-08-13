/**
 * Resolve a document URL into something the browser can display inline.
 * Fetches /api/supabase/file paths as blobs so PDF/image viewers work reliably.
 */
export async function resolveDocumentPreviewUrl(url: string | undefined | null): Promise<string> {
  if (!url) return '';

  const trimmed = url.trim();
  if (!trimmed) return '';

  if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
    return trimmed;
  }

  if (trimmed.startsWith('data:') || trimmed.startsWith('blob:')) {
    return dataUrlToBlobUrl(trimmed);
  }

  if (trimmed.startsWith('/api/')) {
    try {
      const res = await fetch(trimmed);
      if (!res.ok) {
        const ct = res.headers.get('content-type') || '';
        if (ct.includes('application/json')) {
          const err = await res.json().catch(() => ({}));
          throw new Error(err.error || `Could not load document (${res.status})`);
        }
        throw new Error(`Could not load document (${res.status})`);
      }
      const blob = await res.blob();
      return URL.createObjectURL(blob);
    } catch (err) {
      throw err instanceof Error ? err : new Error('Could not load document preview.');
    }
  }

  if (trimmed.length > 100) {
    try {
      return dataUrlToBlobUrl(`data:application/octet-stream;base64,${trimmed}`);
    } catch {
      return trimmed;
    }
  }

  return trimmed;
}

function dataUrlToBlobUrl(dataUrl: string): string {
  if (dataUrl.startsWith('blob:')) return dataUrl;

  const parts = dataUrl.split(',');
  if (parts.length < 2) return dataUrl;

  const mimeMatch = parts[0].match(/^data:([^;]+);/);
  const mime = mimeMatch?.[1] || 'application/octet-stream';
  const binaryString = window.atob(parts[1]);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return URL.createObjectURL(new Blob([bytes], { type: mime }));
}

export function revokeDocumentPreviewUrl(previewUrl: string): void {
  if (previewUrl.startsWith('blob:')) {
    URL.revokeObjectURL(previewUrl);
  }
}
