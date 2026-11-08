import { config } from '../config.js';
import nodemailer, { type Transporter } from 'nodemailer';

export type EmailSendResult = { sent: true } | { sent: false; status: number | null; providerCode: string };

let gmailTransporter: Transporter | undefined;
function getGmailTransporter() {
  if (!gmailTransporter) {
    gmailTransporter = nodemailer.createTransport({
      host: 'smtp.gmail.com',
      port: 465,
      secure: true,
      auth: { user: config.gmailUser, pass: config.gmailAppPassword },
      connectionTimeout: 8_000,
      greetingTimeout: 8_000,
      socketTimeout: 12_000,
    });
  }
  return gmailTransporter;
}

/** Sends a plain-text transactional notice. Delivery is best-effort and never changes the API result. */
export async function sendCommunityEmail(to: string | null, subject: string, text: string): Promise<EmailSendResult> {
  if (!to || !config.emailConfigured) return { sent: false, status: null, providerCode: 'missing_configuration' };
  if (config.emailProvider === 'gmail') {
    try {
      await getGmailTransporter().sendMail({ from: config.emailFrom, to, subject, text });
      return { sent: true };
    } catch (error) {
      const providerCode = error && typeof error === 'object' && 'code' in error && typeof error.code === 'string'
        ? error.code : error instanceof Error ? error.name : 'UNKNOWN';
      console.warn('AYNI email delivery failed:', providerCode);
      return { sent: false, status: providerCode === 'EAUTH' ? 401 : null, providerCode };
    }
  }
  try {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${config.resendApiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: config.emailFrom, to: [to], subject, text }),
      signal: AbortSignal.timeout(5000),
    });
    if (!response.ok) {
      let providerCode = 'provider_rejected';
      try {
        const payload = await response.json() as { name?: unknown; code?: unknown };
        const value = typeof payload.name === 'string' ? payload.name : typeof payload.code === 'string' ? payload.code : '';
        if (/^[a-zA-Z0-9_.-]{1,80}$/.test(value)) providerCode = value;
      } catch { /* Ignore the provider body; it can contain private address details. */ }
      console.warn('AYNI email delivery failed:', response.status, providerCode);
      return { sent: false, status: response.status, providerCode };
    }
    return { sent: true };
  } catch (error) {
    const providerCode = error instanceof Error ? error.name : 'UNKNOWN';
    console.warn('AYNI email delivery failed:', providerCode);
    return { sent: false, status: null, providerCode };
  }
}
