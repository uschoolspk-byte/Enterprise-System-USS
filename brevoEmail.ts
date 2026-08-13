import nodemailer from 'nodemailer';
import type Transporter from 'nodemailer/lib/smtp-transport';

export type EmailAttachment = {
  filename: string;
  content: string;
  encoding?: 'base64';
};

export type EmailSendResult = {
  status: 'Success' | 'Failed' | 'Simulated';
  channel?: 'brevo-api' | 'smtp';
  error?: string;
};

/** Trim Render-style quoted env values: "value" → value */
function env(key: string): string {
  const raw = process.env[key];
  if (!raw) return '';
  return raw.replace(/^["']|["']$/g, '').trim();
}

export function getEmailConfig() {
  const smtpUser = env('SMTP_USER');
  const smtpPass = env('SMTP_PASS');
  const brevoApiKey = env('BREVO_API_KEY');
  const fromEmail = env('SMTP_FROM_EMAIL') || 'uschools.pk@gmail.com';
  const fromName = env('SMTP_FROM_NAME') || 'Unique School System';
  const host = env('SMTP_HOST') || 'smtp-relay.brevo.com';
  const port = parseInt(env('SMTP_PORT') || '587', 10);

  return {
    fromEmail,
    fromName,
    host,
    port,
    smtpConfigured: Boolean(smtpUser && smtpPass),
    apiConfigured: Boolean(brevoApiKey),
    configured: Boolean((smtpUser && smtpPass) || brevoApiKey),
    smtpUser: smtpUser ? `${smtpUser.slice(0, 6)}…` : '',
    hasFromEmail: Boolean(fromEmail && fromEmail.includes('@'))
  };
}

function createSmtpTransporter(): Transporter | null {
  const cfg = getEmailConfig();
  const user = env('SMTP_USER');
  const pass = env('SMTP_PASS');
  if (!user || !pass) return null;

  return nodemailer.createTransport({
    host: cfg.host,
    port: cfg.port,
    secure: cfg.port === 465,
    requireTLS: cfg.port === 587,
    auth: { user, pass },
    tls: { minVersion: 'TLSv1.2' }
  });
}

function isDeliverableAddress(email: string): boolean {
  const e = String(email || '').trim().toLowerCase();
  if (!e.includes('@')) return false;
  if (e.includes('example.com')) return false;
  return true;
}

async function sendViaBrevoApi(options: {
  to: string;
  subject: string;
  text?: string;
  html: string;
  fromEmail: string;
  fromName: string;
  attachments?: EmailAttachment[];
}): Promise<EmailSendResult> {
  const apiKey = env('BREVO_API_KEY');
  if (!apiKey) {
    return { status: 'Failed', error: 'BREVO_API_KEY not configured' };
  }

  const body: Record<string, unknown> = {
    sender: { name: options.fromName, email: options.fromEmail },
    to: [{ email: options.to }],
    subject: options.subject,
    htmlContent: options.html,
    textContent: options.text || undefined
  };

  if (options.attachments?.length) {
    body.attachment = options.attachments.map(att => ({
      name: att.filename,
      content: att.encoding === 'base64' ? att.content : Buffer.from(att.content).toString('base64')
    }));
  }

  const res = await fetch('https://api.brevo.com/v3/smtp/email', {
    method: 'POST',
    headers: {
      'api-key': apiKey,
      'Content-Type': 'application/json',
      Accept: 'application/json'
    },
    body: JSON.stringify(body)
  });

  if (res.ok) {
    return { status: 'Success', channel: 'brevo-api' };
  }

  let detail = `HTTP ${res.status}`;
  try {
    const json = await res.json();
    detail = json?.message || json?.code || detail;
  } catch {
    detail = `${detail}: ${(await res.text()).slice(0, 200)}`;
  }

  return { status: 'Failed', channel: 'brevo-api', error: detail };
}

async function sendViaSmtp(options: {
  to: string;
  subject: string;
  text?: string;
  html: string;
  fromEmail: string;
  fromName: string;
  attachments?: EmailAttachment[];
}): Promise<EmailSendResult> {
  const transporter = createSmtpTransporter();
  if (!transporter) {
    return { status: 'Failed', error: 'SMTP_USER/SMTP_PASS not configured' };
  }

  try {
    await transporter.sendMail({
      from: `"${options.fromName}" <${options.fromEmail}>`,
      to: options.to,
      subject: options.subject,
      text: options.text,
      html: options.html,
      attachments: options.attachments?.map(att => ({
        filename: att.filename,
        content: att.content,
        encoding: att.encoding || 'base64'
      }))
    });
    return { status: 'Success', channel: 'smtp' };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return { status: 'Failed', channel: 'smtp', error: message };
  }
}

/** Send email via Brevo HTTP API (preferred on Render) with SMTP fallback. */
export async function sendTransactionalEmail(options: {
  to: string;
  subject: string;
  text?: string;
  html: string;
  attachments?: EmailAttachment[];
}): Promise<EmailSendResult> {
  const cfg = getEmailConfig();

  if (!isDeliverableAddress(options.to)) {
    return {
      status: 'Simulated',
      error: `Non-deliverable or test address: ${options.to}`
    };
  }

  if (!cfg.configured) {
    return {
      status: 'Simulated',
      error: 'Email not configured — set BREVO_API_KEY and/or SMTP_USER+SMTP_PASS on Render'
    };
  }

  if (cfg.apiConfigured) {
    const apiResult = await sendViaBrevoApi({
      ...options,
      fromEmail: cfg.fromEmail,
      fromName: cfg.fromName
    });
    if (apiResult.status === 'Success') return apiResult;
    console.warn('[Email] Brevo API failed, trying SMTP fallback:', apiResult.error);
  }

  if (cfg.smtpConfigured) {
    const smtpResult = await sendViaSmtp({
      ...options,
      fromEmail: cfg.fromEmail,
      fromName: cfg.fromName
    });
    if (smtpResult.status === 'Success') return smtpResult;
    console.error('[Email] SMTP failed:', smtpResult.error);
    return smtpResult;
  }

  return {
    status: 'Failed',
    error: cfg.apiConfigured ? 'Brevo API and SMTP both failed' : 'No SMTP credentials after API failure'
  };
}

export async function verifyEmailConnectivity(): Promise<{
  ok: boolean;
  config: ReturnType<typeof getEmailConfig>;
  smtpVerify?: string;
  apiReachable?: boolean;
  hint?: string;
}> {
  const config = getEmailConfig();

  if (!config.configured) {
    return {
      ok: false,
      config,
      hint: 'Set BREVO_API_KEY (recommended on Render) and SMTP_FROM_EMAIL in Render Environment variables.'
    };
  }

  let smtpVerify: string | undefined;
  if (config.smtpConfigured) {
    try {
      const t = createSmtpTransporter();
      await t?.verify();
      smtpVerify = 'ok';
    } catch (err: unknown) {
      smtpVerify = err instanceof Error ? err.message : String(err);
    }
  }

  let apiReachable: boolean | undefined;
  if (config.apiConfigured) {
    try {
      const res = await fetch('https://api.brevo.com/v3/account', {
        headers: { 'api-key': env('BREVO_API_KEY'), Accept: 'application/json' }
      });
      apiReachable = res.ok;
    } catch {
      apiReachable = false;
    }
  }

  const ok = Boolean(apiReachable || smtpVerify === 'ok');
  return {
    ok,
    config,
    smtpVerify,
    apiReachable,
    hint: ok
      ? undefined
      : 'Verify BREVO_API_KEY and that SMTP_FROM_EMAIL is a verified sender in Brevo dashboard.'
  };
}
