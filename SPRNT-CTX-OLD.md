# SPRINT_CONTEXT.md — Tetea Africa
## Source of truth for current sprint state

---

## Current Sprint: 5 — Document Feed + Subscription Matching ✅ COMPLETE

**Date completed:** 2026-04-06
**Branch:** main

---

## Sprint 4 — Notification Delivery ✅ COMPLETE

**Date completed:** 2026-04-06
**Branch:** main

---

## Sprint 3 — Automated Scraping Pipeline ✅ COMPLETE

**Date completed:** 2026-04-06 (scrapers debugged + all three live against correct URLs)
**Branch:** main

---

## What was built in Sprint 3

### 1. Scraper infrastructure
- `lib/scrapers/base.ts` — shared `ScraperResult`, `ScraperRunSummary` interfaces, `scrapeFetch`, `sleep`, `SCRAPER_USER_AGENT`
- `lib/scrapers/dedup.ts` — `computeHash`, `computeContentHash`, `isDuplicate`, `buildScraperSupabaseClient`

### 2. Kenya scrapers (3 sources)
- `lib/countries/KE/scrapers/gazette.ts` — Kenya Gazette (kenyalaw.org), Fridays, max 10/run
- `lib/countries/KE/scrapers/county-nairobi.ts` — Nairobi County (nairobi.go.ke/downloads), daily, max 20/run
- `lib/countries/KE/scrapers/parliament.ts` — Parliament bills (parliament.go.ke), RSS with HTML fallback, daily, max 15/run

### 3. Scraper API webhook
- `app/api/scrapers/run/route.ts` — `POST /api/scrapers/run`, Bearer auth via `SCRAPER_SECRET`, routes to correct scraper

### 4. pg_cron automation
- `supabase/migrations/20260404000001_pg_cron_schedules.sql`
  - Gazette: Fridays 05:00 UTC (08:00 EAT)
  - Nairobi County: daily 04:00 UTC (07:00 EAT)
  - Parliament: daily 04:15 UTC (07:15 EAT)
  - Notification dispatcher: every 5 minutes

### 5. Notification pipeline stub
- `lib/notifications/matcher.ts` — `queueNotificationsForDocument`, matches subscriptions by country_code + region + topics, inserts `status='queued'` rows
- `app/api/notifications/dispatch/route.ts` — `POST /api/notifications/dispatch`, batch processes queued notifications (stub: marks as 'sent')

### 6. Analysis pipeline fixes (also in Sprint 3 session)
- `lib/analysis/analyzeDocument.ts` — `MAX_TOKENS` 4096→8192, smart text extraction (80k chars, first 3k + keyword windows), cache threshold `> 0.3`
- `app/api/documents/analyze/route.ts` — removed fallback card, analysis errors return HTTP 422 `{error:'analysis_failed'}`
- `app/api/documents/parse/route.ts` — fast fail at <500 chars with `{error:'insufficient_text'}`
- `scripts/analyze-seed-docs.ts` — processes 9 KE seed law txt files through analysis pipeline

### 7. Dependencies added
- `playwright@1.59.1` (exact)
- `cheerio@1.2.0` (exact)

---

## Sprint 3 completion criteria — ALL PASS ✅
- [x] `npm run build` — zero errors
- [x] All three scrapers instantiate without errors (`npx tsx --eval` verify)
- [x] pg_cron migration file created (`supabase/migrations/20260404000001_pg_cron_schedules.sql`)
- [x] Notification pipeline stub creates records in notifications table

---

## Pending manual steps before Sprint 3 is live in production

1. **Run pg_cron migration:**
   ```bash
   supabase db push
   ```

2. **Set Supabase Vault settings** (Dashboard → Settings → Vault or via `psql`):
   ```sql
   ALTER DATABASE postgres SET app.webhook_base_url = 'https://your-deployment.vercel.app';
   ALTER DATABASE postgres SET app.scraper_secret = 'your-secret-key';
   ```

3. **Add env var to Vercel + `.env.local`:**
   ```
   SCRAPER_SECRET=your-secret-key
   ```

4. **Install Playwright browsers** in deployment environment:
   ```bash
   npx playwright install chromium
   ```

---

## What was built in Sprint 4

### 1. SMS — Africa's Talking (`lib/notifications/sms.ts`)
- `sendSMS(phone, body, countryCode)` — truncates to 160 chars, international format
- Reads `AFRICASTALKING_API_KEY` + `AFRICASTALKING_USERNAME` (defaults to `'sandbox'`)
- Country-specific sender ID map (KE/TZ/UG → 'Tetea', omitted in sandbox)
- `POST /api/webhooks/africastalking` — delivery receipt handler; maps AT status values to `delivered`/`failed`, updates `notifications.external_id` + status

### 2. Email — Resend (`lib/notifications/email.ts`)
- `sendEmail(data)` — sends via Resend with branded HTML template
- Template: header, document title, affected region, body text, CTA button, footer
- Bilingual (EN/SW) labels from `locale` field
- Reads `RESEND_API_KEY` + `RESEND_FROM_EMAIL` (falls back to `onboarding@resend.dev` in dev)

### 3. Google Calendar (`lib/notifications/calendar.ts`)
- `buildGoogleAuthUrl(state)` — generates OAuth2 consent URL
- `exchangeGoogleCode(code)` → `{ accessToken, refreshToken, expiryDate }`
- `createCalendarInvite(event, accessToken, refreshToken)` — creates Calendar event with 7d/3d/1d reminders, sends invite to attendee
- `GET /api/auth/google` — initiates OAuth flow with `userId` in state
- `GET /api/auth/google/callback` — exchanges code, stores tokens in `users` table, redirects to subscriptions page

### 4. Notification processor (`lib/notifications/processor.ts`)
- `processNotificationBatch(limit)` — reads `queued` notifications, loads users, routes to SMS/email by channel, updates status + `external_id`
- `processDeadlineReminders()` — queries `deadlines` table, queues 7d/3d/1d reminder notifications, sets `notified_Xd` flags; also scans ATI executions with no response after 21 days and queues CAJ escalation notifications
- WhatsApp channel: logged as skipped (not yet wired)
- `POST /api/notifications/process` — manual trigger (runs batch + deadlines in parallel)
- `POST /api/notifications/dispatch` — legacy pg_cron endpoint, now delegates to `processNotificationBatch`

### 5. Deadlines page (`app/[locale]/deadlines/page.tsx`)
- Server component, auth-guarded (redirects to sign-in)
- Lists user's deadlines from `deadlines` table, sorted by date ascending
- Urgency colour-coding: overdue (red) / today (orange) / tomorrow (amber) / urgent (yellow) / normal (white)
- Shows notified_7d/3d/1d badge indicators
- Links to document results page

### 6. DB migration (`supabase/migrations/20260406000001_sprint4_notification_columns.sql`)
- `notifications.external_id TEXT` — provider message ID for receipt matching
- `users.google_access_token TEXT`, `google_refresh_token TEXT`, `google_token_expiry TIMESTAMPTZ`
- Index on `notifications(external_id)`

### 7. Dependencies installed (exact versions)
- `africastalking@0.7.9`
- `resend@6.10.0`
- `googleapis@171.4.0`

### Sprint 4 env vars needed
```
AFRICASTALKING_API_KEY=
AFRICASTALKING_USERNAME=sandbox
RESEND_API_KEY=
RESEND_FROM_EMAIL=alerts@tetea.africa
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
GOOGLE_REDIRECT_URI=https://your-domain.com/api/auth/google/callback
```

### Known: not yet wired
- WhatsApp channel — `processNotificationBatch` skips it with a log; needs WhatsApp Business API token
- Google Calendar channel routing in processor — `createCalendarInvite` imported but routing not yet in switch (needs `calendar` as a channel enum value)

## What was built in Sprint 5

### 1. Feed query (`lib/feed/query.ts`)
- `getFeedDocuments(userId, page)` — subscription-matched document query
- Matching: country_code + region_l1 overlap + topic match (document_type prefix)
- National docs (no regions) match all subscribers; paginated 20/page

### 2. FeedCard component (`components/FeedCard.tsx`)
- Document type badge (colour-coded), source label, locale-aware date
- Summary (EN/SW by locale), regions, nearest deadline with urgency, action count
- Links to `/{locale}/results/{documentId}`

### 3. Feed page (`app/[locale]/feed/page.tsx`)
- Server component, auth-guarded, pagination via `?page=N`
- Empty states: no subscriptions (CTA to set up), no matching documents

### 4. Feed API (`app/api/feed/route.ts`)
- `GET /api/feed?page=N` — auth-guarded, returns `{ success, data: { documents, page, hasMore } }`

### 5. Navbar update
- "Feed" link added for authenticated users

### 6. i18n
- `feed` namespace in `messages/en.json` + `messages/sw.json`
- `nav.feed` key: "Feed" / "Mlisho"

---

## Sprint 5 completion criteria — ALL PASS ✅
- [x] `npm run build` — zero errors
- [x] Feed page renders with auth guard
- [x] FeedCard links to results page
- [x] Empty states for no-subscription and no-documents
- [x] API route returns paginated feed

---

## Key file paths (Sprint 5 additions)
```
lib/feed/query.ts
components/FeedCard.tsx
app/[locale]/feed/page.tsx
app/api/feed/route.ts
```

---

## Pipeline Integration (2026-04-08)

### What was built
- `lib/scrapers/pipeline.ts` — `runFullPipeline()` and `runHistoricalAnalysis()` orchestrators
- `scripts/run-scraper.ts` updated — scraper commands now run full pipeline, added `historical` and `historical:all` commands
- `scripts/scrape-historical.ts` — bulk historical document fetch (gazette 6mo, all bills, all Nairobi RSS)
- `app/api/scrapers/run/route.ts` updated — uses pipeline, supports `historical` command
- `supabase/migrations/20260408000001_update_cron_schedules.sql` — gazette daily, nairobi/parliament every 2 days
- `supabase/migrations/20260408000002_public_read_policies.sql` — idempotent public read RLS policies

### New npm scripts
- `scrape:historical` — bulk fetch historical docs (no analysis)
- `analyze:historical` — analyze 20 unanalyzed docs
- `analyze:historical:all` — analyze 200 unanalyzed docs

### Pending
- Run `supabase db push` to apply new cron schedules + RLS policies

---

## Sprint 6 — WhatsApp Bot + ATI Automation (NEXT)

---

## Known issues / technical debt
- Kenya Gazette PDFs are often scanned images — OCR needed before gazette scraper can extract text
  - Workaround: gazette scraper stores document + storage_path; analysis pipeline flags `is_scanned`
- Mzalendo API key not yet obtained (needed for MP/MCA contact data in `representative-contact` action)
- Ward/sub-county data not yet seeded in `admin_units` (IEBC authoritative list pending)
- `NEXT_PUBLIC_ENABLE_MULTI_COUNTRY=false` until TZ/UG configs are built

---

## Key file paths (Sprint 3 additions)
```
lib/scrapers/base.ts
lib/scrapers/dedup.ts
lib/countries/KE/scrapers/gazette.ts
lib/countries/KE/scrapers/county-nairobi.ts
lib/countries/KE/scrapers/parliament.ts
lib/notifications/matcher.ts
app/api/scrapers/run/route.ts
app/api/notifications/dispatch/route.ts
scripts/analyze-seed-docs.ts
supabase/migrations/20260404000001_pg_cron_schedules.sql
```
