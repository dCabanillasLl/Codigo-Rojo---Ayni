import { config } from '../config.js';

/** Sends a plain-text transactional notice. Delivery is best-effort and never changes the API result. */
export async function sendCommunityEmail(to: string | null, subject: string, text: string): Promise<void> {
  if (!to || !config.resendApiKey || !config.emailFrom) return;
  try {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${config.resendApiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: config.emailFrom, to: [to], subject, text }),
      signal: AbortSignal.timeout(5000),
    });
    if (!response.ok) console.warn('AYNI email delivery failed:', response.status);
  } catch (error) {
    console.warn('AYNI email delivery failed:', error instanceof Error ? error.name : 'UNKNOWN');
  }
}
