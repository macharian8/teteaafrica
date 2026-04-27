# SPRINT_CONTEXT.md — Tetea Africa
## Source of truth for current sprint state

---

## Current Sprint: 7 — User Management (Onboarding + Account)

**Started:** 2026-04-21
**Branch:** sprint-7/design

### Sprint 7 — What was built

#### PART A — Session fixes
- Sign-out now redirects to `/[locale]/` (the feed), not to sign-in
- Middleware onboarding gate: authed + `onboarding_completed=false` → `/[locale]/onboarding`
- Protected routes: `/account`, `/onboarding`, `/settings` require auth
- `/api/*`, `/_next/*`, auth routes exempt from all redirects

#### PART B — Onboarding flow (`app/[locale]/onboarding/page.tsx`)
- Full-screen, dark green (#0f1a13) background, centered white card
- 4 steps, no progress bar, conversation feel with slide transitions
- Step 1: "What county are you in?" — searchable dropdown from admin_units
- Step 2: "What matters to you?" — 2-col pill grid with emoji, mutual-exclude "Everything"
- Step 3: "How should we reach you?" — email toggle (always on, verified badge), SMS toggle (ENABLE_SMS gate)
- Step 4: "Want us to write your letters?" — optional full_name, national_id, ward with inline benefit hints
- Skip always visible top-right, never greyed out
- All data saved via POST /api/onboarding, sets onboarding_completed=true
- Partial saves: skipped fields stay null

#### PART C — Account page (`app/[locale]/account/page.tsx`)
- Three-section single-scroll page
- Section 1 — Profile: avatar (initials), full name, national ID, ward, phone, save button
- Section 2 — Preferences: county (searchable), topics (pill grid), notifications (toggles), content language (EN/SW). Auto-saves on change with "Saved" indicator
- Section 3 — My Actions: timeline of action_executions with type/status badges, expand to show draft_content. Empty state links to feed
- Navbar updated: "Subscriptions" → "My Account" linking to /account
- Old /settings/subscriptions redirects to /account (client-side)

#### PART D — API routes
- `POST /api/onboarding` — saves county/topics/notifications/credentials, marks onboarding complete
- `PATCH /api/account/profile` — updates full_name, national_id, ward, phone
- `PATCH /api/account/preferences` — updates county, topics, notifications, language (auto-save)
- `GET /api/account/actions` — returns action_executions with joined action data

#### PART E — Infrastructure
- Migration: `supabase/migrations/20260421000001_onboarding_columns.sql`
  - `users.onboarding_completed BOOLEAN NOT NULL DEFAULT FALSE`
  - `users.full_name TEXT`, `users.national_id TEXT`, `users.ward TEXT`
  - Partial index on unboarded users
- Types: `lib/supabase/types.ts` updated with new columns
- i18n: `onboarding.*` + `account.*` namespaces in en.json + sw.json
- nav.account key added to both locale files

### Sprint 7 completion criteria
- [x] `npm run build` — zero errors
- [x] Onboarding page renders at /en/onboarding
- [x] Account page renders at /en/account
- [x] All 4 API routes created
- [x] Middleware redirects unboarded users
- [x] Old /settings/subscriptions redirects to /account

### Manual steps needed
- Run migration: `supabase db push` (adds onboarding columns)
- Existing users in DB will have `onboarding_completed=false` — run SQL to set true for existing users:
  `UPDATE users SET onboarding_completed = true WHERE created_at < '2026-04-21';`

---

## Sprint 6 — Automation + Feed UX + OCR ✅ COMPLETE

**Date completed:** 2026-04-13
**Branch:** main

---

## Sprint 5 — Document Feed + Subscription Matching ✅ COMPLETE

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

## Manual fixes applied outside Claude Code (Sprint 5)

### Fix 1 — RLS blocking feed query
**Symptom:** Feed API returned `documents: []` despite 72 matching
rows confirmed via raw SQL join.
**Root cause:** RLS policies on documents/document_analyses/actions
blocked the anon Supabase client used by the server component.
Query returned 0 rows with no error.
**Fix:** Added public read policies manually in Supabase Dashboard.
These are NOT yet in a migration file — must be codified before
next `supabase db push`.

Policies applied in production Supabase:
```sql
CREATE POLICY "Public can read documents"
ON documents FOR SELECT USING (true);

CREATE POLICY "Public can read analyses"
ON document_analyses FOR SELECT USING (true);

CREATE POLICY "Public can read actions"
ON actions FOR SELECT USING (true);

CREATE POLICY "Public can read action_executions count"
ON action_executions FOR SELECT USING (true);
```

### Fix 2 — shapeDocs() filtered all documents
**Symptom:** Feed still empty after RLS fix. Debug log showed
`docs count: 0` — Supabase returning nothing from nested select.
**Root cause:** `shapeDocs()` in `lib/feed/query.ts` treated
`document_analyses` as an array. Supabase returns it as a single
object for 1:1 relations. `.length` was undefined, every doc skipped.
**Fix applied in `lib/feed/query.ts`:**
```typescript
// Before (broken):
const analysesArr = doc.document_analyses as unknown as RawAnalysis[];
if (!analysesArr || analysesArr.length === 0) continue;
const a = analysesArr[0];

// After (fixed):
const rawAnalysis = doc.document_analyses;
if (!rawAnalysis) continue;
const analysesArr = Array.isArray(rawAnalysis)
  ? rawAnalysis
  : [rawAnalysis];
if (analysesArr.length === 0) continue;
const a = analysesArr[0];
```

### Analysis pipeline state as of 2026-04-08
- Total documents with raw_text: 57
- Analyzed (confidence_score > 0.3): 20
- Unanalyzed remaining: ~27
- Reason stopped: Anthropic 529 overload after bulk run (attempt 10/10)
- Fix: run `npm run analyze:historical` once API recovers

---

## Key file paths (Sprint 5 additions)
```
lib/feed/query.ts
components/FeedCard.tsx
app/[locale]/feed/page.tsx
app/api/feed/route.ts
```

---

## Sprint 6 — WhatsApp Bot + ATI Automation (NEXT)

---

## County Scrapers Expansion (2026-04-13)

### 4 new county scrapers added

1. **Mombasa County** (`lib/countries/KE/scrapers/county-mombasa.ts`)
   - Source: `web.mombasa.go.ke/downloads/` (RSS + HTML fallback)
   - SSL: `rejectUnauthorized: false` (cert issues like Nairobi)
   - Max 15 docs/run

2. **Kisumu County** (`lib/countries/KE/scrapers/county-kisumu.ts`)
   - Sources: RSS `/feed/`, `/downloads/` page, `/county-acts/`
   - Standard SSL, uses `scrapeFetch`
   - Max 15 docs/run

3. **Nakuru County** (`lib/countries/KE/scrapers/county-nakuru.ts`)
   - Source A: County RSS (`nakuru.go.ke/feed/`) — news posts checked for embedded PDFs
   - Source B: County Assembly (`nakuruassembly.go.ke/downloads/` + `/bills/`) — HIGH VALUE for PP notices, bills, budget consultations
   - SSL: `rejectUnauthorized: false` for assembly site
   - Max 20 docs/run (10 per source)
   - Note: `assembly.nakuru.go.ke` (old domain) is unreachable; correct domain is `nakuruassembly.go.ke`

4. **Kisii County** (`lib/countries/KE/scrapers/county-kisii.ts`)
   - Source: Joomla CMS (not WordPress) at `kisii.go.ke/index.php/media-center/cdownloads` + `/index.php/county-downloads`
   - URL pattern: `/index.php/files/153/Downloads/{id}/{filename}.pdf`
   - SSL: `rejectUnauthorized: false` (precaution)
   - Max 15 docs/run

### Integration
- `scripts/run-scraper.ts` — new commands: `county-mombasa`, `county-kisumu`, `county-nakuru`, `county-kisii`, `counties` (all 5)
- `lib/scrapers/pipeline.ts` — `ScraperName` type exported, all new scrapers in switch
- `package.json` — 5 new npm scripts added

### Initial run results (2026-04-13)
- Mombasa: 1 doc inserted (HTML fallback, RSS empty)
- Kisumu: 158 items found (RSS + downloads page), 1+ inserted
- Nakuru: 4 assembly docs inserted (bills, vetting, PP notice), 2 errors (old domain URLs)
- Kisii: 9+ docs inserted (Joomla pattern), 0 errors

### Key file paths
```
lib/countries/KE/scrapers/county-mombasa.ts
lib/countries/KE/scrapers/county-kisumu.ts
lib/countries/KE/scrapers/county-nakuru.ts
lib/countries/KE/scrapers/county-kisii.ts
```

---

## Known issues / technical debt
- Kenya Gazette PDFs are often scanned images — OCR needed before gazette scraper can extract text
  - Workaround: gazette scraper stores document + storage_path; analysis pipeline flags `is_scanned`
- Mzalendo API key not yet obtained (needed for MP/MCA contact data in `representative-contact` action)
- Ward/sub-county data not yet seeded in `admin_units` (IEBC authoritative list pending)
- `NEXT_PUBLIC_ENABLE_MULTI_COUNTRY=false` until TZ/UG configs are built
- RLS public read policies applied manually — not yet in a migration file
  Must be added to `supabase/migrations/20260408000002_public_read_policies.sql`
  before next `supabase db push`
- ~27 documents unanalyzed — run `npm run analyze:historical` to process after design sprint


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