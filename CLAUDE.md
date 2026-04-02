# CLAUDE.md — Tetea Africa Civic Intelligence Platform

## What This Project Is
Tetea ("advocate/defend" in Swahili) is an AI-powered civic intelligence platform
for Africa. It ingests government documents (Gazettes, county/district websites,
Parliament), translates them into plain language, determines what legal actions
citizens can take, and executes or scaffolds those actions on their behalf.

This is an **agentic civic tool** — not a dashboard. Every document analysis ends in
an action classification and, where possible, execution.

**Domain:** tetea.africa
**Default language:** English (en). Kiswahili (sw) switcher at launch.
**i18n pipeline must support** French (fr), Luganda (lg), Kinyarwanda (rw) without
structural changes — add locale file + country config, nothing else.

---

## AI ENGINEER STANDARDS

### Before Every Task
- Read TODOS.md to understand current priorities
- Read CHANGELOG.md to understand what's already been done
- Read PRD.md if working on a feature for the first time
- Never implement a feature that contradicts the PRD without flagging it first

### Code Standards
- **Language:** TypeScript everywhere. No `any` types without explicit comment
- **Framework:** Next.js 14 App Router. No Pages Router patterns
- **i18n:** next-intl. All user-facing strings in `messages/{locale}.json`. Never hardcode UI strings
- **Database:** Supabase. Always use RLS. Never expose service role key to client
- **Styling:** Tailwind CSS only. No inline styles
- **State:** Zustand for client state. Server state via React Query or Next.js fetch
- **AI calls:** Anthropic SDK (not raw fetch). Always stream long responses
- **Payments:** IntaSend (sandbox by default — never go live without explicit instruction)

### Search Before Implementing
- Before any library, API, or CLI tool: search for current docs first
- Before any Supabase schema change: check existing migrations
- Before upgrading any dependency: check for breaking changes

### File Naming
- Components: `PascalCase.tsx`
- Utilities: `camelCase.ts`
- API routes: `route.ts` inside `app/api/`
- DB migrations: `YYYYMMDD_description.sql`
- Translation files: `messages/en.json`, `messages/sw.json`, etc.

### i18n Rules
- Default locale: `en` (English)
- Supported at launch: `en`, `sw`
- Planned: `fr`, `lg`, `rw`
- All UI strings live in `messages/{locale}.json` — never hardcode
- AI-generated content (summaries, action drafts) language is driven by user's
  `language_preference` in DB, not the UI locale — these are separate concerns
- Generate both EN + SW summaries in a single Claude API call at analysis time
- URL structure: `/[locale]/...` e.g. `/en/dashboard`, `/sw/dashboard`
- Fallback: always `en` if translation key missing
- Language switcher: visible in nav, persists to user profile if authenticated,
  localStorage if not

### Multi-Country Rules
- `country_code` (ISO 3166-1 alpha-2: 'KE', 'TZ', 'UG', 'RW') is **required** on:
  `documents`, `document_analyses`, `actions`, `action_executions`, `subscriptions`,
  `law_chunks`, `notifications`, `deadlines`, `standing_consents`
- Default `country_code` is `'KE'` for MVP
- Country-specific logic lives in `lib/countries/{countryCode}/` — never hardcode
  Kenya-specific body names, admin unit labels, or gazette URLs outside this folder
- Admin unit hierarchy abstracted as `region_level_1` / `region_level_2` in DB.
  Country config maps these to local names (County/Ward in KE, Region/District in TZ)
- Adding a country = new `lib/countries/{CC}/` folder + law seed files + scraper config.
  No schema changes required if country_code column exists from day one.

### Supabase Rules
- Every table has RLS enabled
- Migrations in `supabase/migrations/`
- Always include rollback SQL in migration comments
- Never delete columns — deprecate with `_deprecated` suffix

### Claude API Usage
- Model: `claude-opus-4-6` for document analysis
- Model: `claude-haiku-4-5-20251001` for fast ops (routing, short summaries)
- Always stream for document analysis
- System prompts in `lib/prompts/`
- RAG retrieval filtered by `country_code` — never mix law corpora across countries

### Action Execution Rules
- NEVER execute a legal action without explicit user confirmation
- Calendar invites + notifications can fire with standing consent
- Always show full draft before any action creating an external record
- Log every attempt + outcome to `action_executions` table
- Action templates are country-specific: `lib/countries/{CC}/actions/`

### Error Handling
- All API routes: `{ success: boolean, data?, error? }`
- User-facing errors: plain English, no stack traces
- Server errors: logged to `error_logs` table
- Distinguish 4xx (user error) from 5xx (system error)

### Commits
- Format: `type(scope): description`
- Types: feat, fix, refactor, docs, chore, test, i18n
- Update CHANGELOG.md with every meaningful commit

### What NOT to Do
- Don't hardcode country-specific strings, body names, admin unit labels, or gazette URLs
- Don't create DB tables without a migration
- Don't write mock data resembling real citizen PII
- Don't use `console.log` in production paths
- Don't implement features not in TODOS.md without flagging

---

## Project Structure
```
tetea/
├── app/
│   ├── [locale]/               # i18n root — all pages under locale prefix
│   │   ├── (auth)/
│   │   ├── (dashboard)/
│   │   └── layout.tsx
│   ├── api/
│   └── layout.tsx
├── components/
│   └── LanguageSwitcher.tsx    # EN/SW toggle, extensible
├── lib/
│   ├── prompts/                # Claude system prompts
│   ├── parsers/                # PDF + HTML parsers
│   ├── actions/                # Civic action executors (generic)
│   ├── scrapers/               # Scraper base classes
│   ├── rag/                    # pgvector query logic
│   ├── supabase/               # DB client + generated types
│   └── countries/              # All country-specific config
│       ├── KE/
│       │   ├── config.ts
│       │   ├── actions/        # KE action templates
│       │   └── scrapers/       # KE scraper configs
│       ├── TZ/                 # Tanzania (Phase 3)
│       └── UG/                 # Uganda (Phase 3)
├── messages/                   # next-intl translation files
│   ├── en.json                 # English (default, always complete)
│   └── sw.json                 # Kiswahili
├── supabase/
│   ├── migrations/
│   └── seed/
│       └── law/
│           ├── KE/             # Kenya law corpus text files
│           ├── TZ/             # Tanzania (future)
│           └── UG/             # Uganda (future)
├── public/
├── CLAUDE.md
├── PRD.md
├── SETUP.md
├── CHANGELOG.md
└── TODOS.md
```

---

## Country Config Shape (`lib/countries/{CC}/config.ts`)
```typescript
export interface CountryConfig {
  code: string                   // 'KE'
  name: string                   // 'Kenya'
  defaultLocale: string          // 'en'
  supportedLocales: string[]     // ['en', 'sw']
  regionLevel1Label: string      // 'County'  (Region in TZ/UG)
  regionLevel2Label: string      // 'Ward'    (District in TZ, County in UG)
  phonePrefix: string            // '+254'
  gazetteUrl: string
  parliamentUrl: string
  actionBodies: {
    anticorruption: string       // 'EACC' / 'PCCB' / 'IGG'
    ombudsman: string            // 'CAJ' / 'CHRAGG' / 'IGG'
    environment: string          // 'NEMA' / 'NEMC' / 'NEMA'
    procurement: string          // 'PPRA' / 'PPRA' / 'PPDA'
  }
}
```

---

## Key Integrations
| Service | Purpose |
|---|---|
| Anthropic API | Document analysis, summarization, action generation |
| Supabase | DB, Auth, Storage, pgvector RAG |
| next-intl | i18n routing + translations |
| Africa's Talking | SMS + USSD (40+ African countries) |
| WhatsApp Business API | Rich notifications + conversational bot |
| Google Calendar API | Calendar invites for PP sessions |
| Mzalendo API | MP/MCA contact data (Kenya) |

---

## Domain Glossary
- **country_code** — ISO 3166-1 alpha-2 ('KE', 'TZ', 'UG', 'RW')
- **region_level_1** — Top admin division (County/Region/Province by country)
- **region_level_2** — Sub division (Ward/District/Sub-county by country)
- **PP session** — Public Participation session
- **ATI/RTI request** — Access/Right to Information request
- **Gazette** — Official government notice publication
- **MCA** — Member of County Assembly (Kenya)
- **EACC** — Ethics and Anti-Corruption Commission (Kenya)
- **CAJ** — Commission on Administrative Justice / Ombudsman (Kenya)
- **NEMA** — National Environment Management Authority (Kenya)
- **PPRA** — Public Procurement Regulatory Authority (Kenya)
- **PCCB** — Prevention and Combating of Corruption Bureau (Tanzania)
- **IGG** — Inspector General of Government (Uganda)
