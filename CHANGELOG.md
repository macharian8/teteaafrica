# CHANGELOG — Tetea Africa

Format: `[YYYY-MM-DD] type(scope): description`

---

## Unreleased

---

## [2026-04-03] fix(stack): unblock frontend — downgrade next-intl, revert webpack alias, fix globals.css

### Root causes fixed
- `next-intl@4.9.0` required Next.js 15 — broke `react/jsx-runtime` resolution with Next.js 14.
  Downgraded to `next-intl@3.26.3` (the correct v3 branch for Next.js 14).
- `next.config.mjs` had a webpack `resolve.alias` for React that mapped `react` to an absolute
  index.js path, breaking all `react/jsx-runtime` sub-path imports in client components. Removed.
- `globals.css` contained `@import "shadcn/tailwind.css"` and `border-border` class references
  requiring Tailwind v4 plugin setup. Stripped to bare `@tailwind` directives only.
- `app/[locale]/settings/subscriptions/page.tsx` had unused `createBrowserClient` import and
  unused `useTransition` destructure — caused ESLint build errors. Removed.

### Package changes
- `next-intl`: `^4.9.0` → `3.26.3` (exact, no prefix)
- `typescript`: `^5` → `5.3.3` (exact, pinned per STACK.md)
- `tailwindcss`: `^3.4.1` → `3.4.1` (exact, pinned per STACK.md)
- Switched from pnpm to npm; ran `rm -rf node_modules .next && npm install`

### Verification
- `npm run build` → zero errors, 20 static pages generated ✓
- `curl localhost:3000/en` → HTTP 200 ✓

---

## [2026-04-03] feat(ui): Sprint 2 — complete web UI

### New pages + routes
- `app/[locale]/page.tsx` — landing page with PDF drag-and-drop + URL paste, pipeline loading stages
- `app/[locale]/(auth)/sign-in/page.tsx` — email/phone OTP sign-in (`signInWithOtp` + `verifyOtp`)
- `app/[locale]/(auth)/sign-up/page.tsx` — 6-step onboarding (contact → OTP → country → region → topics → language)
- `app/[locale]/results/[documentId]/page.tsx` — server component fetching document, analysis, actions, user langPref
- `app/[locale]/results/[documentId]/AnalysisResultsClient.tsx` — interactive results with EN↔SW content toggle
- `app/[locale]/settings/subscriptions/page.tsx` — full subscriptions management UI

### New components
- `components/Navbar.tsx` — sticky header with auth state, LanguageSwitcher, sign-in/out
- `components/KeyDatesTimeline.tsx` — sorted dates with urgency colour-coding (overdue/today/urgent/normal)
- `components/ActionCard.tsx` — type icon, executability badge, deadline countdown, expandable legal basis, CTAs
- `components/ActionModal.tsx` — editable draft, confirm flow, submission logging, success + reference ID state

### New API routes
- `POST /api/action-executions` — logs action execution intent to `action_executions`, returns reference ID
- `GET /api/subscriptions` — returns user's subscription, active standing consents, user contact info
- `POST /api/subscriptions` — upserts subscription, syncs standing_consents, updates `users.language_preference`
- `GET /api/admin-units` — returns admin_units filtered by country_code + optional region_level_1
- `GET /api/auth/callback` — PKCE code → session exchange
- `PATCH /api/user/language` — updates `users.language_preference`

### i18n + middleware
- `lib/supabase/middleware.ts` — `updateSession()` for Supabase auth cookie refresh
- `middleware.ts` — composes next-intl routing + Supabase session refresh + `/settings` auth guard
- `components/LanguageSwitcher.tsx` — persists to DB (authenticated) or localStorage (anonymous)
- `messages/en.json` + `messages/sw.json` — all Sprint 2 strings added (auth onboarding, document, action, subscription)

### TypeScript
- Added `"target": "ES2017"` to `tsconfig.json` (enables Set/Map iteration without downlevelIteration flag)
- Excluded `scripts/` from tsconfig compilation
- Zero type errors

---

## [2026-04-02] feat(pipeline): Sprint 1 — document analysis pipeline

### Dependencies
- `pdf-parse@2.4.5` — PDF text extraction (v2 class-based API)
- `@anthropic-ai/sdk@0.82.0` — Claude Opus + Haiku via beta streaming + prompt caching
- `@supabase/supabase-js@2.101.1` + `@supabase/ssr@0.10.0` — typed DB clients
- `openai@6.33.0` — `text-embedding-3-small` (1536-dim) for RAG indexing
- `tsx@4.21.0` — TypeScript seed scripts runner
- Added `type-check`, `seed:law`, `seed:admin-units` scripts to `package.json`
- Added `OPENAI_API_KEY` to `.env.local`

### Shared types + Supabase clients
- `lib/types.ts` — `CountryCode`, `ActionType`, `Executability`, `DocumentAnalysisResult`, `LawChunk`, `ApiResponse`
- `lib/supabase/types.ts` — full typed `Database` interface (all 8 tables + `match_law_chunks` function)
- `lib/supabase/client.ts` — browser client (`createBrowserClient`)
- `lib/supabase/server.ts` — `createServerSupabaseClient` (anon, cookie-aware) + `createServiceRoleClient`
- `lib/supabase/errors.ts` — `logError()` + `logTokenUsage()` helpers writing to `error_logs`

### PDF parsing — `lib/parsers/pdfParser.ts` + `POST /api/documents/parse`
- `parsePdfBuffer(buffer)` using pdf-parse v2 `PDFParse` class
- `parseUrl(url)` — fetches URL, detects PDF vs HTML, extracts text
- `preprocessText()` — collapses whitespace, strips page numbers, truncates at 16 000 chars (≈4000 tokens)
- Scanned PDF detection: flags `is_scanned = true` when text/page < 100 chars
- Deduplication: SHA-256 `content_hash` — returns existing document without re-storing
- File upload → Supabase Storage `documents/` bucket
- API: `POST /api/documents/parse` — accepts multipart (file) or JSON `{ url }`, returns `ParseResult`

### Law seed script — `scripts/seed-law.ts`
- Reads `.txt` files from `supabase/seed/law/{CC}/`
- Section-aware chunker: splits on `PART/SECTION/Article/Chapter` headers first, then sliding window (2000 chars / 200 overlap)
- Embeds in batches of 20 with `text-embedding-3-small`
- Idempotent upsert: skips already-seeded chunks by `(statute_name, chunk_index)`
- `supabase/seed/law/KE/README.md` — lists all 9 KE documents with kenyalaw.org URLs and priority articles

### RAG — `lib/rag/query.ts`
- `queryLawChunks(query, countryCode, threshold)` — embeds query, calls `match_law_chunks` RPC, returns ≤5 chunks
- `formatChunksForPrompt(chunks)` — formats as numbered law context block for system prompt
- `testQuery()` export for manual verification against seeded corpus

### Analysis prompt — `lib/prompts/document-analysis.ts`
- `buildSystemPrompt(countryConfig, ragContext)` — full analysis prompt with KE CountryConfig (EACC/CAJ/NEMA/PPRA), PRD JSON schema embedded, bilingual output rules, confidence scoring guidance
- `buildUserMessage(text, countryCode)` — wraps document text for user turn
- Prompt cached via `cache_control: ephemeral` — cuts repeated RAG context cost ~90%

### Analysis pipeline — `lib/analysis/analyzeDocument.ts` + `POST /api/documents/analyze`
- `analyzeDocument({ documentId, rawText, countryCode })` — full pipeline
- Dedup check: returns existing `document_analyses` row without re-calling Claude
- RAG: 3 targeted queries (doc opening + participation + deadline keywords), dedup by chunk id, hard cap 5
- Streaming via `anthropic.beta.messages.stream()` with `betas: ['prompt-caching-2024-07-31']`
- JSON fence stripping from Claude response
- Persists: `document_analyses` row + individual `actions` rows
- Flags `needs_review = true` when `confidence_score < 0.7`
- Logs token usage (`model`, `input_tokens`, `output_tokens`) to `error_logs` after every call
- Max tokens: 2048 (Opus), per CLAUDE.md cost rule
- `POST /api/documents/analyze` — fetches document by ID, runs pipeline, returns `AnalyzeResult`

### Action prompts — `lib/prompts/actions/`
- `ati-request.ts` — ATI letter prompt (Access to Information Act 2016, s.4); user + system message builders
- `pp-submission.ts` — Public Participation submission prompt (Article 10, 196; County Governments Act s.87)
- `representative-contact.ts` — Constituent letter to MCA/MP/Senator/Governor/CS (Articles 37, 118–119)
- All prompts: return `{ draft_en, draft_sw }` JSON; both languages in one call

### Action drafter — `lib/actions/draftAction.ts`
- `draftAction({ actionType, countryCode, context })` — dispatches to correct prompt by context type
- Uses Haiku (`claude-haiku-4-5-20251001`), max_tokens: 512 — per CLAUDE.md cost rules
- Logs token usage; strict error if `draft_en` or `draft_sw` missing from response
- Exhaustive `never` check on context type for type safety

### TypeScript
- Zero type errors (`npx tsc --noEmit` passes)

---

## [2026-04-02] feat(scaffold): Sprint 0 — complete project scaffolding

### Next.js + UI
- Initialized Next.js 14.2.35 with TypeScript, Tailwind CSS 3, App Router
- Installed shadcn/ui (default theme, `components/ui/button.tsx` baseline)
- Installed next-intl for i18n

### i18n
- `i18n/routing.ts` — defineRouting with locales `['en', 'sw']`, defaultLocale `'en'`
- `i18n/request.ts` — getRequestConfig with dynamic message import
- `middleware.ts` — next-intl middleware matching all non-static routes
- `next.config.mjs` — wrapped with withNextIntl plugin
- `app/[locale]/layout.tsx` — NextIntlClientProvider, locale validation, notFound() guard
- `app/[locale]/page.tsx` — placeholder home page
- `messages/en.json` — full key structure: app, nav, common, auth, document, action, subscription, language, errors
- `messages/sw.json` — complete Kiswahili translations for all keys

### Supabase Migrations (13 files)
- `20260402000001` — enable pgvector extension
- `20260402000002` — users table + auth trigger + RLS
- `20260402000003` — admin_units (country_code, region_level_1/2) + RLS
- `20260402000004` — documents (url, raw_text, storage_path, content_hash) + RLS
- `20260402000005` — document_analyses (JSON output, confidence, summaries EN+SW) + RLS
- `20260402000006` — actions (action_type_enum, executability_enum, EN+SW drafts) + RLS
- `20260402000007` — action_executions (execution_status_enum, draft, reference) + RLS
- `20260402000008` — subscriptions (topics[], channel, language_preference) + RLS
- `20260402000009` — standing_consents (per action_type, revocable) + RLS
- `20260402000010` — notifications (channel, status, sent_at) + RLS
- `20260402000011` — deadlines (deadline_date, notified_7d/3d/1d flags) + RLS
- `20260402000012` — law_chunks (vector(1536), match_law_chunks function) + RLS
- `20260402000013` — error_logs (severity, context JSONB, service-role only)
- All country-scoped tables have `country_code VARCHAR(2) NOT NULL DEFAULT 'KE'`
- All rollback SQL included in migration comments

### Country Config
- `lib/countries/KE/config.ts` — Kenya CountryConfig (EACC, CAJ, NEMA, PPRA)
- `lib/countries/KE/actions/.gitkeep` — placeholder for action templates
- `lib/countries/KE/scrapers/.gitkeep` — placeholder for scraper configs
- `lib/countries/TZ/.gitkeep` and `lib/countries/UG/.gitkeep` — future countries

### Folder Structure
- Full directory tree from CLAUDE.md created with .gitkeep tracking
- `lib/prompts/`, `lib/parsers/`, `lib/actions/`, `lib/scrapers/`, `lib/rag/`, `lib/supabase/`, `lib/analysis/`
- `supabase/seed/law/KE/`, `supabase/seed/law/TZ/`, `supabase/seed/law/UG/`
- `components/LanguageSwitcher.tsx` — EN/SW toggle (locale switch via router.replace)

### Config
- `.env.local.example` — all vars from SETUP.md (Supabase, Anthropic, AT, WhatsApp, Google, feature flags)

---

## [2026-04-02] docs: rebrand Sauti → Tetea Africa + multi-country architecture

- Renamed project from Sauti to Tetea Africa (tetea.africa)
- Added `country_code` (ISO 3166-1 alpha-2) to all country-scoped tables
- Added multi-country architecture: `lib/countries/{CC}/` pattern
- Added `CountryConfig` interface abstracting admin units, action bodies, gazette URLs
- Added i18n architecture: next-intl, `/[locale]/` routing, `messages/{locale}.json`
- Default UI locale: English (`en`). Kiswahili (`sw`) switcher at launch
- i18n pipeline extensible to French, Luganda, Kinyarwanda without schema changes
- Separated UI locale from content language (AI summarization driven by `language_preference`)
- Added Tanzania, Uganda, Rwanda, Nigeria portability estimates to PRD
- Added `LanguageSwitcher` component spec to TODOS Sprint 2
- Updated SETUP.md: i18n env vars, seed scripts now accept `--country` flag
- Updated TODOS.md: country_code migrations, i18n tasks, admin_units seed

## [2026-04-02] docs: initial project documentation (as Sauti)

- Created CLAUDE.md, PRD.md, SETUP.md, TODOS.md, CHANGELOG.md
