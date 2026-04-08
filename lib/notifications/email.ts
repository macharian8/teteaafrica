/**
 * lib/notifications/email.ts
 * Email delivery via Resend.
 *
 * One email per notification row (not per digest).
 * Template: document summary + affected region + action CTAs.
 *
 * Env vars required:
 *   RESEND_API_KEY     — Resend API key
 *   RESEND_FROM_EMAIL  — Verified sender address (e.g. alerts@tetea.africa)
 *                        Falls back to onboarding@resend.dev in dev/sandbox
 */

import { Resend } from 'resend';

export interface EmailResult {
  success: boolean;
  emailId?: string;
  error?: string;
}

export interface EmailNotificationData {
  to: string;
  subject: string;
  body: string;                   // plain-text summary (used in HTML body)
  documentTitle?: string;
  affectedRegion?: string;
  actionUrl?: string;             // link to /[locale]/results/[documentId]
  locale?: string;                // 'en' | 'sw'
}

/** Build a minimal but readable HTML email */
function buildHtml(data: EmailNotificationData): string {
  const { body, documentTitle, affectedRegion, actionUrl, locale = 'en' } = data;

  const viewLabel   = locale === 'sw' ? 'Angalia Hati' : 'View Document';
  const regionLabel = locale === 'sw' ? 'Eneo linaloathiriwa' : 'Affected region';
  const titleLabel  = locale === 'sw' ? 'Hati' : 'Document';
  const footerText  = locale === 'sw'
    ? 'Ulipata barua pepe hii kwa sababu ulijiandikisha kwa arifa za Tetea Africa.'
    : 'You received this because you subscribed to Tetea Africa civic alerts.';

  const regionBlock = affectedRegion
    ? `<p style="color:#555;font-size:14px;margin:4px 0">
         <strong>${regionLabel}:</strong> ${affectedRegion}
       </p>`
    : '';

  const titleBlock = documentTitle
    ? `<p style="color:#555;font-size:14px;margin:4px 0">
         <strong>${titleLabel}:</strong> ${documentTitle}
       </p>`
    : '';

  const ctaBlock = actionUrl
    ? `<a href="${actionUrl}"
          style="display:inline-block;margin-top:20px;padding:12px 24px;
                 background:#1a56db;color:#fff;border-radius:6px;
                 text-decoration:none;font-weight:600;font-size:15px">
         ${viewLabel}
       </a>`
    : '';

  return `<!DOCTYPE html>
<html lang="${locale}">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width,initial-scale=1"/>
  <title>${data.subject}</title>
</head>
<body style="margin:0;padding:0;background:#f5f5f5;font-family:system-ui,sans-serif">
  <table width="100%" cellpadding="0" cellspacing="0">
    <tr>
      <td align="center" style="padding:32px 16px">
        <table width="600" cellpadding="0" cellspacing="0"
               style="background:#fff;border-radius:8px;overflow:hidden;
                      box-shadow:0 1px 4px rgba(0,0,0,.08)">
          <!-- Header -->
          <tr>
            <td style="background:#1a56db;padding:20px 32px">
              <span style="color:#fff;font-size:20px;font-weight:700">Tetea Africa</span>
            </td>
          </tr>
          <!-- Body -->
          <tr>
            <td style="padding:32px">
              ${titleBlock}
              ${regionBlock}
              <p style="color:#111;font-size:16px;line-height:1.6;margin:16px 0 0">
                ${body.replace(/\n/g, '<br/>')}
              </p>
              ${ctaBlock}
            </td>
          </tr>
          <!-- Footer -->
          <tr>
            <td style="background:#f9f9f9;padding:16px 32px;
                       border-top:1px solid #eee;font-size:12px;color:#888">
              ${footerText}
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

/**
 * Send a notification email via Resend.
 *
 * @param data  Notification data including recipient, subject and body
 */
export async function sendEmail(data: EmailNotificationData): Promise<EmailResult> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    return { success: false, error: 'RESEND_API_KEY not set' };
  }

  const from = process.env.RESEND_FROM_EMAIL ?? 'onboarding@resend.dev';
  const resend = new Resend(apiKey);

  try {
    const { data: resendData, error } = await resend.emails.send({
      from,
      to: [data.to],
      subject: data.subject,
      html: buildHtml(data),
    });

    if (error) {
      return { success: false, error: error.message };
    }

    return { success: true, emailId: resendData?.id };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { success: false, error: msg };
  }
}
