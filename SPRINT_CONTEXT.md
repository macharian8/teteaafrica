# SPRINT_CONTEXT.md — Tetea Africa
## Source of truth for current state

---

## CURRENT SPRINT: 7 — User Management ✅ BUILT, PENDING ACTIVATION

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
- `analyze:historical` aborts on large docs — fix: reduce `maxChars` to 40,000 in `lib/analysis/analyzeDocument.ts`
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
