# TODOS.md — Tetea Africa

**Current Phase:** Phase 1 MVP
**Current Sprint:** 0 — Project scaffolding

Status: `[ ]` todo · `[~]` in progress · `[x]` done · `[!]` blocked

---

## Sprint 0 — Scaffolding (Current)

### Project Setup
- [ ] Init Next.js 14 with TypeScript + Tailwind + shadcn/ui
- [ ] Install and configure next-intl (i18n)
- [ ] Create `/app/[locale]/` routing structure
- [ ] Create `messages/en.json` and `messages/sw.json` (empty shells with key structure)
- [ ] Configure ESLint, Prettier, Husky pre-commit hooks
- [ ] Set up Supabase project, link CLI
- [ ] Create `.env.local.example` with all required vars
- [ ] Push to GitHub (`main` + `dev` branches)
- [ ] Set up Vercel project linked to `main`

### Database Migrations
- [ ] Enable pgvector extension
- [ ] Migration: `users` (id, email, phone, country_code, language_preference, created_at) + RLS
- [ ] Migration: `admin_units` (id, country_code, region_level_1, region_level_2) + RLS
- [ ] Migration: `documents` (id, country_code, url, raw_text, storage_path, scraped_at) + RLS
- [ ] Migration: `document_analyses` (id, document_id, country_code, analysis_json, confidence_score) + RLS
- [ ] Migration: `actions` (id, analysis_id, country_code, action_type, executability, deadline) + RLS
- [ ] Migration: `action_executions` (id, action_id, user_id, country_code, status, draft_content, executed_at) + RLS
- [ ] Migration: `subscriptions` (id, user_id, country_code, region_l1, region_l2, topics[], channel, language_preference) + RLS
- [ ] Migration: `standing_consents` (id, user_id, country_code, action_type, granted_at) + RLS
- [ ] Migration: `notifications` (id, user_id, country_code, channel, status, sent_at) + RLS
- [ ] Migration: `deadlines` (id, user_id, document_id, country_code, deadline_date, label) + RLS
- [ ] Migration: `law_chunks` (id, country_code, statute_name, chunk_text, embedding vector(1536), chunk_index) + RLS
- [ ] Migration: `error_logs` (id, error_message, stack, context, created_at)
- [ ] Verify all tables have `country_code` column with DEFAULT 'KE'

### Country Config
- [ ] Create `lib/countries/KE/config.ts` implementing `CountryConfig`
- [ ] Create `lib/countries/KE/actions/` folder with template stubs
- [ ] Create `lib/countries/KE/scrapers/` folder with config stubs

---

## Sprint 1 — Document Analysis Pipeline (Weeks 1–2)

### PDF Parsing
- [ ] Install + configure `pdf-parse`
- [ ] `POST /api/documents/parse` — URL or file upload → extracted text
- [ ] Handle text PDFs, scanned PDFs (flag for OCR), HTML pages
- [ ] Store raw text in `documents.raw_text`, file in Supabase Storage

### Law RAG Index
- [ ] Collect 9 KE law documents from kenyalaw.org → `supabase/seed/law/KE/`
- [ ] Write `scripts/seed-law.ts` (chunk 500 tokens + overlap, embed, store with country_code)
- [ ] Implement `lib/rag/query.ts` — semantic search filtered by `country_code`
- [ ] Test: query "right to petition" → returns Article 37 + Article 119 from KE corpus

### Admin Units
- [ ] Source Kenya 47 counties + 1,450 wards data (IEBC/KNBS)
- [ ] Write `scripts/seed-admin-units.ts`
- [ ] Verify ward names match official IEBC list

### Claude Analysis Pipeline
- [ ] Write system prompt `lib/prompts/document-analysis.ts`
  - [ ] Generates `summary_en` + `summary_sw` in single call
  - [ ] Uses `CountryConfig` for action body names
  - [ ] Returns structured JSON per PRD schema
- [ ] Implement `lib/analysis/analyzeDocument.ts` with streaming
- [ ] `POST /api/documents/analyze` → stores in `document_analyses`
- [ ] Action classifier mapping to `ActionType` enum
- [ ] Flag analyses with `confidence_score < 0.7` for review

### Action Drafting
- [ ] `lib/prompts/actions/ati-request.ts` — KE ATI Act 2016 template
- [ ] `lib/prompts/actions/pp-submission.ts` — structured PP submission
- [ ] `lib/prompts/actions/representative-contact.ts` — MCA/MP letter
- [ ] `lib/actions/draftAction.ts` — takes ActionType + doc context → EN + SW draft

---

## Sprint 2 — Web UI (Weeks 2–3)

### i18n Foundation
- [ ] Configure next-intl middleware for `/[locale]/` routing
- [ ] Set default locale to `en`, supported: `['en', 'sw']`
- [ ] `components/LanguageSwitcher.tsx` — EN/SW toggle in nav
  - [ ] Persists to `users.language_preference` if authenticated
  - [ ] Falls back to localStorage if not authenticated
  - [ ] Renders flag + language name, not just code
- [ ] Populate `messages/en.json` with all UI strings as features are built
- [ ] Populate `messages/sw.json` in parallel — never leave SW keys missing

### Auth
- [ ] Supabase Auth: email + phone OTP (default country code +254 KE)
- [ ] Sign-up flow: contact → OTP → country (KE default) → region → topics → language pref
- [ ] Protected route middleware
- [ ] Country selector in sign-up (KE only for now, others grayed out with "coming soon")

### Document Upload UI
- [ ] `/[locale]` landing: URL paste or PDF upload
- [ ] Loading state: "Extracting text… Checking Kenyan law… Identifying actions…"
- [ ] Error states: unsupported file, parse failure, low confidence warning

### Analysis Results UI
- [ ] Summary card: EN↔SW toggle (independent of UI locale), document type badge, regions
- [ ] Key dates timeline: deadline items highlighted with day countdown
- [ ] Action cards:
  - [ ] Type icon + label (localized)
  - [ ] Description + legal basis (expandable, localized)
  - [ ] Deadline badge + countdown
  - [ ] Executability badge
  - [ ] "Preview draft" / "Execute" / "Save deadline" CTA
- [ ] Confidence score: show warning banner if < 0.7

### Action Execution UI
- [ ] Modal: preview draft (EN or SW per user pref), editable, legal basis footnote
- [ ] Confirm → execute → success state with reference + "Track this"
- [ ] Log to `action_executions`

### Subscription UI (`/[locale]/settings/subscriptions`)
- [ ] Country selector (KE active, others "coming soon")
- [ ] Region level 1 picker (Counties for KE — from `admin_units`)
- [ ] Region level 2 picker (Wards, filtered by selected county)
- [ ] Topic checkboxes (localized labels)
- [ ] Language preference (EN / SW) — note: independent of UI locale
- [ ] Notification channel (WhatsApp / SMS / email) + verification
- [ ] Standing consent toggles per action type

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
