/**
 * lib/notifications/calendar.ts
 * Google Calendar invite creation for civic deadline events.
 *
 * Only fires for actions where:
 *   1. action.action_type === 'calendar_invite'
 *   2. User has a standing consent for calendar_invite
 *   3. User has connected Google Calendar (google_refresh_token is set)
 *
 * Token storage: users.google_access_token / google_refresh_token / google_token_expiry
 * NOTE: tokens stored plaintext in dev/sandbox. Encrypt at app layer before prod.
 *
 * Env vars required:
 *   GOOGLE_CLIENT_ID
 *   GOOGLE_CLIENT_SECRET
 *   GOOGLE_REDIRECT_URI  (e.g. https://your-domain.com/api/auth/google/callback)
 */

import { google, calendar_v3 } from 'googleapis';

export interface CalendarEvent {
  summary: string;          // Event title
  description: string;      // Plain-text body
  location?: string;        // e.g. "Nairobi County Hall"
  startDateTime: string;    // ISO 8601
  endDateTime: string;      // ISO 8601
  attendeeEmail: string;    // Invite this user
}

export interface CalendarResult {
  success: boolean;
  eventId?: string;
  eventUrl?: string;
  error?: string;
}

function getOAuthClient() {
  return new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI
  );
}

/**
 * Build the Google OAuth2 authorisation URL.
 * User is redirected here from GET /api/auth/google.
 */
export function buildGoogleAuthUrl(state: string): string {
  const oauth2 = getOAuthClient();
  return oauth2.generateAuthUrl({
    access_type: 'offline',
    prompt: 'consent',          // force refresh_token on every auth
    scope: ['https://www.googleapis.com/auth/calendar.events'],
    state,
  });
}

/**
 * Exchange an authorisation code for access + refresh tokens.
 * Returns tokens to be stored in users table.
 */
export async function exchangeGoogleCode(code: string): Promise<{
  accessToken: string;
  refreshToken: string;
  expiryDate: string;
}> {
  const oauth2 = getOAuthClient();
  const { tokens } = await oauth2.getToken(code);

  if (!tokens.access_token || !tokens.refresh_token) {
    throw new Error('Incomplete token response from Google');
  }

  return {
    accessToken:  tokens.access_token,
    refreshToken: tokens.refresh_token,
    expiryDate:   new Date(tokens.expiry_date ?? Date.now() + 3600_000).toISOString(),
  };
}

/**
 * Create a Google Calendar event and invite the user.
 *
 * @param event         Event details
 * @param accessToken   User's current Google access token
 * @param refreshToken  User's Google refresh token (used to get a new access token if expired)
 */
export async function createCalendarInvite(
  event: CalendarEvent,
  accessToken: string,
  refreshToken: string
): Promise<CalendarResult> {
  if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET) {
    return { success: false, error: 'Google OAuth env vars not set' };
  }

  const oauth2 = getOAuthClient();
  oauth2.setCredentials({ access_token: accessToken, refresh_token: refreshToken });

  const cal = google.calendar({ version: 'v3', auth: oauth2 });

  const calEvent: calendar_v3.Schema$Event = {
    summary:     event.summary,
    description: event.description,
    location:    event.location,
    start: { dateTime: event.startDateTime, timeZone: 'Africa/Nairobi' },
    end:   { dateTime: event.endDateTime,   timeZone: 'Africa/Nairobi' },
    attendees: [{ email: event.attendeeEmail }],
    reminders: {
      useDefault: false,
      overrides: [
        { method: 'email',  minutes: 24 * 60 * 7 }, // 7 days
        { method: 'email',  minutes: 24 * 60 * 3 }, // 3 days
        { method: 'popup',  minutes: 24 * 60 },      // 1 day
      ],
    },
  };

  try {
    const response = await cal.events.insert({
      calendarId: 'primary',
      requestBody: calEvent,
      sendUpdates: 'all',     // sends invite email to attendees
    });

    return {
      success:  true,
      eventId:  response.data.id ?? undefined,
      eventUrl: response.data.htmlLink ?? undefined,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { success: false, error: msg };
  }
}
