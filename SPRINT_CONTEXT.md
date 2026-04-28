# SPRINT_CONTEXT.md — Tetea Africa
## Source of truth for current state

---

## CURRENT SPRINT: 8 — Analysis pipeline fix + automation activation ✅ COMPLETE

### What's built (Sprint 8)
- **Large-doc abort fix**: `lib/analysis/analyzeDocument.ts` `extractRelevantText` default `maxChars` reduced 80,000 → 40,000. `max_tokens: 8192` already explicit on the Anthropic call (never omitted).
- **Webhook auth audit**: `app/api/scrapers/run/route.ts` already enforces `Authorization: Bearer <SCRAPER_SECRET>` strict-equality. No change needed.
- **pg_cron → Vault migration**: `supabase/migrations/20260404000001_pg_cron_schedules.sql` rewritten to read `scraper_secret` from `vault.decrypted_secrets` and hardcode `https://dev.tetea.africa` as the webhook base URL (the old `current_setting('app.*')` approach failed because Supabase Cloud `postgres` is non-superuser, so `ALTER DATABASE postgres SET …` is denied). New migration `20260428000001_update_cron_vault.sql` drops + reschedules the 4 live jobs (gazette / nairobi-county / parliament / notification-dispatcher) against the Vault-based SQL. One-time setup is `SELECT vault.create_secret('<value>', 'scraper_secret', '…')` — already done on the linked project.
- **OCR coverage controls**:
  - `lib/parsers/ocrParser.ts` — `ocrPdfBuffer(buffer, maxPages = 20)` parameterised; old `MAX_PAGES` const removed.
  - `scripts/ocr-backfill.ts` — `--limit` (default 3) and `--max-pages` (default 20) flags. Saves `raw_text` + `page_count` together; log line now includes `pages=N`.
  - `supabase/migrations/20260428000002_document_page_count.sql` — adds `page_count INTEGER` to `documents`. `lib/supabase/types.ts` `documents` Row + Insert updated.
- **`scripts/status.ts`**: live ops dashboard. Documents (total/analyzed/unanalyzed via distinct `document_id` with confidence>0.3), cron jobs (best-effort RPC, falls back to SQL-editor hint since `cron` schema isn't on PostgREST), last scrape, last analysis, **Needs OCR** (count of docs with `storage_path` and `raw_text` null/<100 chars), **Last OCR run** (proxy: most recent `scraped_at` among OCR'd docs — `documents` has no `updated_at`), notifications sent in last 24h, users, waitlist, plus a partial-coverage warning counting `page_count > 20 AND raw_text NOT NULL` (re-run OCR with `--max-pages=999`). No new deps.

### Run commands
```bash
npx tsx --env-file=.env.local scripts/status.ts
npx tsx --env-file=.env.local scripts/ocr-backfill.ts --limit=3 --max-pages=999
```

### Optional follow-ups (not required)
- To make `Cron jobs:` show a real number, create an SQL function:
  ```sql
  CREATE FUNCTION public.active_cron_job_count() RETURNS int LANGUAGE sql SECURITY DEFINER AS $$ SELECT count(*)::int FROM cron.job WHERE active $$;
  ```
  `status.ts` already calls `rpc('active_cron_job_count')` and uses it when present.
- For accurate "Last OCR run", add `updated_at TIMESTAMPTZ` + an update trigger on `documents` so `ocr-backfill.ts` writes bump it.

---

## PREVIOUS SPRINT: 7 — User Management ✅ BUILT, PENDING ACTIVATION

### What's built (Sprint 7)
- **Onboarding** `app/[locale]/onboarding/page.tsx` — full-screen dark (#0f1a13), 4-step, no navbar
  - Step 1: county (searchable dropdown from admin_units)
  - Step 2: topics (pill grid, "Everything" mutual-excludes others)
  - Step 3: notifications (email always-on + verified badge, SMS gated by NEXT_PUBLIC_ENABLE_SMS)
  - Step 4: full_name / national_id / ward with inline benefit hints
  - Skip always visible top-right; partial saves fine (skipped = null)
- **Account page** `app/[locale]/account/page.tsx` — 3 sections:
  - Profile: avatar (initials), editable fields, display/edit mode toggle, save confirmation
  - Preferences: county + topics + notifications + language (auto-save with toast)
  - My Actions: action_executions timeline, expand to draft, empty state → feed
- **Middleware**: unboarded users → `/[locale]/onboarding`; `/account`, `/onboarding`, `/settings` require auth
- **Sign-out** redirects to `/[locale]/` (feed)
- **Navbar**: "Subscriptions" → "My Account" → `/account`; old `/settings/subscriptions` redirects to `/account`
- **API routes**: POST `/api/onboarding`, PATCH `/api/account/profile`, PATCH `/api/account/preferences`, GET `/api/account/actions`
- **Migration**: `20260421000001_onboarding_columns.sql` — adds `onboarding_completed BOOL DEFAULT false`, `full_name`, `national_id`, `ward`, `phone`, `one_click_consent BOOL DEFAULT false`

### ⚠️ PENDING — must run before Sprint 7 is live
```bash
supabase db push
# then in Supabase SQL editor:
UPDATE users SET onboarding_completed = true WHERE created_at < '2026-04-21';
# sign out → sign in → should hit /onboarding
```

### Sprint 7 known issues
- Profile save shows "Error — try again" until `supabase db push` runs (columns missing)
- One-click send copy is wrong — needs fix: "When enabled, submit ATI/PP in one tap — no copy-paste"
- Profile display/edit mode: after save should flip to read-only with "Edit profile" button

---

## INFRASTRUCTURE STATE

### pg_cron schedules (built, NOT yet active)
- Gazette: Fridays 05:00 UTC | Nairobi County: daily 04:00 UTC | Parliament: daily 04:15 UTC
- Notification dispatcher: every 5 min
- **Blocked by**: Vault vars not set. Run in Supabase SQL editor:
  ```sql
  ALTER DATABASE postgres SET app.webhook_base_url = 'https://dev.tetea.africa';
  ALTER DATABASE postgres SET app.scraper_secret = 'your-secret';
  ```

### Scraper commands (manual run)
```bash
npx tsx --env-file=.env.local scripts/run-scraper.ts gazette
npx tsx --env-file=.env.local scripts/run-scraper.ts parliament
npm run scraper:counties   # runs all 5 county scrapers
```
Dedup is active (skipped= in logs). ~30 docs unanalyzed — needs Anthropic credit top-up.

### Known technical debt
- RLS public read policies applied manually in prod — NOT in migration file yet
  Must add: `supabase/migrations/20260408000002_public_read_policies.sql`
- Ward data not seeded in `admin_units` (IEBC list pending)
- Mzalendo API key not obtained (needed for representative-contact action)
- Google OAuth still in test mode — only whitelisted emails can sign in
- Resend custom domain not set — emails send from generic domain (need `alerts@tetea.africa`)

---

## COMPLETED SPRINTS (summary)

**Sprint 6** ✅ — WhatsApp bot stub, ATI automation, OCR pipeline, civic relevance scoring, feed UX, analysis prompt improvements, county scrapers (Mombasa/Kisumu/Nakuru/Kisii), channel preferences, Google OAuth

**Sprint 5** ✅ — Feed as homepage, subscription-matched query, FeedCard, filters, 2-up grid, feed API, pagination
- Fix: RLS public read policies added manually (see debt above)
- Fix: `shapeDocs()` Supabase 1:1 relation array handling

**Sprint 4** ✅ — SMS (Africa's Talking sandbox), Email (Resend), Google Calendar OAuth, notification processor, deadline reminders, ATI 21-day CAJ escalation stub

**Sprint 3** ✅ — Gazette + Nairobi County + Parliament scrapers, dedup, pg_cron migration, notification matcher, analysis pipeline fixes (8192 tokens, smart text extraction)

**Sprints 0–2** ✅ — Full scaffold, 13 migrations, PDF parsing + OCR (Tesseract eng+swa), Claude analysis pipeline, pgvector RAG (2,554 chunks, 9 KE statutes), action drafting (ATI/PP/rep-contact), auth (OTP + Google OAuth), i18n (EN/SW), Vercel deployment

---

## KEY FILE PATHS
```
app/[locale]/onboarding/page.tsx         # Sprint 7
app/[locale]/account/page.tsx            # Sprint 7
app/api/onboarding/route.ts              # Sprint 7
app/api/account/profile/route.ts         # Sprint 7
app/api/account/preferences/route.ts     # Sprint 7
app/api/account/actions/route.ts         # Sprint 7
lib/scrapers/base.ts + dedup.ts          # Sprint 3
lib/countries/KE/scrapers/gazette.ts     # Sprint 3
lib/countries/KE/scrapers/parliament.ts  # Sprint 3
lib/countries/KE/scrapers/county-*.ts    # Sprint 3 + 6
lib/notifications/processor.ts           # Sprint 4
lib/feed/query.ts                        # Sprint 5
components/FeedCard.tsx                  # Sprint 5
supabase/migrations/20260404000001_pg_cron_schedules.sql
supabase/migrations/20260421000001_onboarding_columns.sql
```
