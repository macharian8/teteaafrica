/**
 * lib/notifications/sms.ts
 * SMS delivery via Africa's Talking.
 *
 * Sandbox mode only until AFRICASTALKING_USERNAME is set to a real app username.
 * All sends use the sandbox when username === 'sandbox'.
 *
 * Phone numbers must be in international format: +254XXXXXXXXX
 */

// AT SDK is CommonJS with no bundled TS types
/* eslint-disable @typescript-eslint/no-require-imports */
const AfricasTalking = require('africastalking');
/* eslint-enable @typescript-eslint/no-require-imports */

const SMS_MAX_CHARS = 160;

export interface SmsResult {
  success: boolean;
  messageId?: string;
  error?: string;
}

/**
 * Truncate a notification body to fit in a single SMS.
 * Keeps the last 3 chars for "…" if truncated.
 */
function formatSmsBody(body: string): string {
  if (body.length <= SMS_MAX_CHARS) return body;
  return `${body.slice(0, SMS_MAX_CHARS - 1)}…`;
}

/**
 * Send a single SMS via Africa's Talking.
 *
 * @param phone       Recipient in international format (+254...)
 * @param body        Notification body — will be truncated to 160 chars
 * @param countryCode ISO country code (used for future sender-ID routing)
 */
export async function sendSMS(
  phone: string,
  body: string,
  countryCode: string
): Promise<SmsResult> {
  const apiKey   = process.env.AFRICASTALKING_API_KEY;
  const username = process.env.AFRICASTALKING_USERNAME ?? 'sandbox';

  if (!apiKey) {
    return { success: false, error: 'AFRICASTALKING_API_KEY not set' };
  }

  const message = formatSmsBody(body);

  // Country-specific sender ID (alphanumeric, max 11 chars, must be registered)
  // Omit in sandbox — sandbox ignores senderId anyway
  const senderIdMap: Record<string, string> = {
    KE: 'Tetea',
    TZ: 'Tetea',
    UG: 'Tetea',
  };
  const senderId = username !== 'sandbox'
    ? (senderIdMap[countryCode] ?? undefined)
    : undefined;

  try {
    const at  = AfricasTalking({ apiKey, username });
    const sms = at.SMS;

    const payload: Record<string, unknown> = { to: [phone], message };
    if (senderId) payload.senderId = senderId;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const response: any = await sms.send(payload);

    const recipient = response?.SMSMessageData?.Recipients?.[0];
    if (!recipient) {
      return { success: false, error: 'No recipient in AT response' };
    }

    const status = String(recipient.status ?? '').toLowerCase();
    if (status === 'success' || status.includes('sent')) {
      return { success: true, messageId: String(recipient.messageId ?? '') };
    }

    return {
      success: false,
      error: `AT status: ${recipient.status} — ${recipient.statusCode ?? ''}`,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { success: false, error: message };
  }
}
