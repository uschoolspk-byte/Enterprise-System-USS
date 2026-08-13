export interface EmailBrandingContext {
  school_name?: string;
  logo_url?: string;
  header_subtitle?: string;
  footer_title?: string;
  footer_subtitle?: string;
  footer_contact?: string;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function formatBodyHtml(body: string, isPlainTextBody: boolean): string {
  if (!isPlainTextBody) return body;
  return escapeHtml(body).replace(/\n/g, '<br/>');
}

export function buildBrandedEmailHtml(options: {
  headerTitle?: string;
  body: string;
  footer?: string;
  accentColor?: string;
  branding?: EmailBrandingContext | null;
  isPlainTextBody?: boolean;
  headerBadge?: string;
}): string {
  const branding = options.branding || {};
  const accent = options.accentColor || '#1e3a8a';
  const headerTitle = escapeHtml(options.headerTitle || branding.school_name || 'UNIQUE SCHOOL SYSTEM');
  const headerSubtitle = escapeHtml(
    options.headerBadge || branding.header_subtitle || 'Official Notification'
  );
  const footerText = escapeHtml(
    options.footer
      || branding.footer_subtitle
      || branding.footer_contact
      || 'Unique School System'
  );
  const bodyHtml = formatBodyHtml(options.body || '', options.isPlainTextBody !== false);

  const logoBlock = branding.logo_url
    ? `<div style="margin-bottom: 12px;">
        <img src="${branding.logo_url}" alt="${escapeHtml(branding.school_name || 'School Logo')}" style="max-height: 80px; max-width: 220px; display: block; margin: 0 auto; object-fit: contain;" />
      </div>`
    : '';

  return `
    <div style="font-family: Arial, Helvetica, sans-serif; max-width: 600px; margin: 0 auto; border: 1px solid #e2e8f0; border-radius: 8px; overflow: hidden; background-color: #ffffff;">
      <div style="background-color: ${accent}; color: #ffffff; padding: 24px 20px; text-align: center;">
        ${logoBlock}
        <h2 style="margin: 0; font-size: 18px; font-weight: bold; letter-spacing: 1px; text-transform: uppercase;">${headerTitle}</h2>
        <p style="margin: 8px 0 0 0; font-size: 11px; opacity: 0.9; letter-spacing: 0.08em; text-transform: uppercase;">${headerSubtitle}</p>
      </div>
      <div style="padding: 24px; color: #1e293b; line-height: 1.65; font-size: 14px;">
        ${bodyHtml}
      </div>
      <div style="background-color: #f8fafc; padding: 16px 20px; border-top: 1px solid #e2e8f0; text-align: center; font-size: 11px; color: #64748b; line-height: 1.5;">
        ${footerText}
      </div>
    </div>
  `.trim();
}
