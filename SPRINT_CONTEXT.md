# SPRINT_CONTEXT.md — Tetea Africa
## Source of truth for current sprint state

---

## Current Sprint: 4 — Notification Delivery (IN PROGRESS)

**Started:** 2026-04-06
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

## Sprint 4 — Notification Delivery (NEXT)

### What needs to be done
1. **WhatsApp integration** — Africa's Talking or WhatsApp Business API
   - Implement `sendWhatsAppNotification` in `lib/notifications/matcher.ts`
   - Wire in `app/api/notifications/dispatch/route.ts`

2. **SMS integration** — Africa's Talking
   - Implement `sendSmsNotification`
   - Handle SMS truncation (160 char limit) — use Haiku for copy

3. **Email integration** — Resend or similar
   - Implement `sendEmailNotification`
   - HTML template for email body

4. **Deadline tracker cron**
   - Query `deadlines` table for upcoming deadlines (7d, 3d, 1d)
   - Set `notified_7d`, `notified_3d`, `notified_1d` flags
   - Create notifications rows for each due deadline

5. **WhatsApp inbound bot**
   - Receive webhook from WhatsApp Business API
   - Intent detection (Haiku)
   - Return document summaries / action status via conversational replies

### Africa's Talking env vars needed
```
AFRICASTALKING_API_KEY=
AFRICASTALKING_USERNAME=
WHATSAPP_API_TOKEN=
WHATSAPP_PHONE_NUMBER_ID=
```

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
