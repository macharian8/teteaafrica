# TODOS.md — Tetea Africa

**Current Phase:** Phase 1 MVP
**Current Sprint:** 2 — Web UI

Status: `[ ]` todo · `[~]` in progress · `[x]` done · `[!]` blocked

---

## Sprint 0 — Scaffolding (Current)

### Project Setup
- [x] Init Next.js 14 with TypeScript + Tailwind + shadcn/ui
- [x] Install and configure next-intl (i18n)
- [x] Create `/app/[locale]/` routing structure
- [x] Create `messages/en.json` and `messages/sw.json` (empty shells with key structure)
- [ ] Configure ESLint, Prettier, Husky pre-commit hooks
- [ ] Set up Supabase project, link CLI
- [x] Create `.env.local.example` with all required vars
- [ ] Push to GitHub (`main` + `dev` branches)
- [ ] Set up Vercel project linked to `main`

### Database Migrations
- [x] Enable pgvector extension
- [x] Migration: `users` (id, email, phone, country_code, language_preference, created_at) + RLS
- [x] Migration: `admin_units` (id, country_code, region_level_1, region_level_2) + RLS
- [x] Migration: `documents` (id, country_code, url, raw_text, storage_path, scraped_at) + RLS
- [x] Migration: `document_analyses` (id, document_id, country_code, analysis_json, confidence_score) + RLS
- [x] Migration: `actions` (id, analysis_id, country_code, action_type, executability, deadline) + RLS
- [x] Migration: `action_executions` (id, action_id, user_id, country_code, status, draft_content, executed_at) + RLS
- [x] Migration: `subscriptions` (id, user_id, country_code, region_l1, region_l2, topics[], channel, language_preference) + RLS
- [x] Migration: `standing_consents` (id, user_id, country_code, action_type, granted_at) + RLS
- [x] Migration: `notifications` (id, user_id, country_code, channel, status, sent_at) + RLS
- [x] Migration: `deadlines` (id, user_id, document_id, country_code, deadline_date, label) + RLS
- [x] Migration: `law_chunks` (id, country_code, statute_name, chunk_text, embedding vector(1536), chunk_index) + RLS
- [x] Migration: `error_logs` (id, error_message, stack, context, created_at)
- [x] Verify all tables have `country_code` column with DEFAULT 'KE'

### Country Config
- [x] Create `lib/countries/KE/config.ts` implementing `CountryConfig`
- [x] Create `lib/countries/KE/actions/` folder with template stubs
- [x] Create `lib/countries/KE/scrapers/` folder with config stubs

---

## Sprint 1 — Document Analysis Pipeline (Weeks 1–2)

### PDF Parsing
- [x] Install + configure `pdf-parse`
- [x] `POST /api/documents/parse` — URL or file upload → extracted text
- [x] Handle text PDFs, scanned PDFs (flag for OCR), HTML pages
- [x] Store raw text in `documents.raw_text`, file in Supabase Storage

### Law RAG Index
- [ ] Collect 9 KE law documents from kenyalaw.org → `supabase/seed/law/KE/`
- [x] Write `scripts/seed-law.ts` (chunk 500 tokens + overlap, embed, store with country_code)
- [x] Implement `lib/rag/query.ts` — semantic search filtered by `country_code`
- [ ] Test: query "right to petition" → returns Article 37 + Article 119 from KE corpus

### Admin Units
- [ ] Source Kenya 47 counties + 1,450 wards data (IEBC/KNBS)
- [ ] Write `scripts/seed-admin-units.ts`
- [ ] Verify ward names match official IEBC list

### Claude Analysis Pipeline
- [x] Write system prompt `lib/prompts/document-analysis.ts`
  - [x] Generates `summary_en` + `summary_sw` in single call
  - [x] Uses `CountryConfig` for action body names
  - [x] Returns structured JSON per PRD schema
- [x] Implement `lib/analysis/analyzeDocument.ts` with streaming
- [x] `POST /api/documents/analyze` → stores in `document_analyses`
- [x] Action classifier mapping to `ActionType` enum
- [x] Flag analyses with `confidence_score < 0.7` for review

### Action Drafting
- [x] `lib/prompts/actions/ati-request.ts` — KE ATI Act 2016 template
- [x] `lib/prompts/actions/pp-submission.ts` — structured PP submission
- [x] `lib/prompts/actions/representative-contact.ts` — MCA/MP letter
- [x] `lib/actions/draftAction.ts` — takes ActionType + doc context → EN + SW draft

---

## Sprint 2 — Web UI (Weeks 2–3) ✅ COMPLETE

### i18n Foundation
- [x] Configure next-intl middleware for `/[locale]/` routing
- [x] Set default locale to `en`, supported: `['en', 'sw']`
- [x] `components/LanguageSwitcher.tsx` — EN/SW toggle in nav
  - [x] Persists to `users.language_preference` if authenticated
  - [x] Falls back to localStorage if not authenticated
- [x] Populate `messages/en.json` with all UI strings
- [x] Populate `messages/sw.json` in parallel — no missing SW keys

### Auth
- [x] Supabase Auth: email + phone OTP (PKCE flow)
- [x] Sign-up flow: contact → OTP → country (KE) → region → topics → language pref (6-step onboarding)
- [x] Protected route middleware (`/settings` requires auth)
- [x] Country selector in sign-up (KE only, others grayed out with "coming soon")
- [x] `app/api/auth/callback/route.ts` — PKCE code exchange
- [x] `app/api/user/language/route.ts` — PATCH language preference

### Document Upload UI
- [x] `/[locale]` landing: URL paste + PDF upload (drag-and-drop + click)
- [x] Loading state: "Extracting text… Checking Kenyan law… Identifying actions…"
- [x] Error states: unsupported file, parse failure, low confidence warning, file too large

### Analysis Results UI
- [x] `app/[locale]/results/[documentId]/page.tsx` — server component, fetches all data
- [x] `AnalysisResultsClient.tsx` — summary card with EN↔SW content toggle (independent of UI locale)
- [x] Document type badge + URL link
- [x] Affected regions with MapPin badges (or "National" fallback)
- [x] `components/KeyDatesTimeline.tsx` — key dates with urgency colour-coding
- [x] Action cards with type icon, description, legal basis (expandable), deadline badge, executability badge, CTAs
- [x] Confidence score: warning banner if `needs_review = true`

### Action Execution UI
- [x] `components/ActionModal.tsx` — editable draft, legal basis, confirm/done states
- [x] Status machine: editing → confirming → submitting → done | error
- [x] Logs to `action_executions` via `POST /api/action-executions`
- [x] Success: reference ID + "Track this" button

### Subscription UI (`/[locale]/settings/subscriptions`)
- [x] Country selector (KE active, TZ/UG/RW grayed "coming soon")
- [x] County + Ward pickers from `admin_units` via `GET /api/admin-units`
- [x] Topic checkboxes (all 6 topics, localized)
- [x] Language preference (EN/SW) — independent of UI locale
- [x] Notification channel (WhatsApp/SMS/Email) with verified-contact display
- [x] Standing consent toggles (calendar_invite, ati_request, petition)
- [x] `POST /api/subscriptions` — upserts subscription + syncs standing_consents + updates users.language_preference

### TypeScript
- [x] Zero type errors (`pnpm run type-check` passes)
- [x] Added `target: ES2017` to tsconfig.json
- [x] Excluded `scripts/` from tsconfig (no app impact)

---

## Sprint 3 — Automated Scraping (Weeks 3–4)

- [ ] Scraper: Kenya Gazette (kenyalaw.org) — weekly, `country_code = 'KE'`
- [ ] Scraper: Nairobi County downloads — daily
- [ ] Scraper: Parliament bills RSS
- [ ] Deduplication: content hash, skip already-processed
- [ ] Scheduling: Supabase pg_cron or Inngest
- [ ] Pipeline: new doc → analyze → match subscriptions → queue notifications

---

## Sprint 4 — Notifications (Weeks 4–5)

- [ ] SMS via Africa's Talking (KE +254)
- [ ] Email digest via Resend
- [ ] Google Calendar OAuth + invite send
- [ ] Notification log in `notifications` table with `country_code`
- [ ] Deadline reminders: 7d, 3d, 1d

---

## Sprint 5 — WhatsApp Bot (Weeks 5–6)

- [ ] Webhook: `POST /api/webhooks/whatsapp`
- [ ] Intent routing: link → analyze | keyword → subscribe | "help" → menu
- [ ] Send analysis summary (EN or SW per user pref)
- [ ] Interactive buttons: "File ATI", "Save deadline", "Full report →"
- [ ] Subscription management via WhatsApp commands
- [ ] Language detection: if incoming message is SW, respond in SW

---

## Backlog (Phase 2+)

### Collective Action
- [ ] Petition generation + signature collection
- [ ] Joint submission when N users same region flag same doc
- [ ] Outcome tracking (ATI response monitoring, escalation chains)

### Expansion
- [ ] Tanzania: `lib/countries/TZ/`, TZ law corpus, TZ gazette scraper
- [ ] Uganda: `lib/countries/UG/`, `messages/lg.json`, UG law corpus
- [ ] French locale: `messages/fr.json` (Rwanda/DRC prep)
- [ ] Kinyarwanda locale: `messages/rw.json`

### Monetisation
- [ ] CSO/NGO subscription tiers + billing (IntaSend)
- [ ] Donate/tip button (IntaSend + Ko-fi — add Phase 2)
- [ ] County government portal (B2G)

### Infrastructure
- [ ] USSD interface via Africa's Talking (zero data)
- [ ] Historical document search
- [ ] Public outcome transparency feed

---

## Blockers / Notes
- Mzalendo API — email them for API key before Sprint 2 ends
- Google Calendar OAuth — needs domain verification for production
- Kenya Gazette scanned PDFs — OCR pipeline needed before gazette scraper ships
- Ward data — source authoritative list from IEBC before seeding admin_units
- `NEXT_PUBLIC_ENABLE_MULTI_COUNTRY=false` until TZ config is complete
