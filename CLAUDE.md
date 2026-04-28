# CLAUDE.md — Tetea Africa

## What This Is
AI civic intelligence platform for Africa. Ingests government docs (Gazette, county sites, Parliament), translates to plain language, identifies legal actions, executes them.
**Agentic tool — not a dashboard.** Every analysis ends in action classification + execution.
Domain: tetea.africa | Default locale: en | Supabase ref: gbaqdjbkbbonxdaoazrh

---

## SESSION START
Read CLAUDE.md + SPRINT_CONTEXT.md only. Do NOT read PRD.md, TODOS.md, CHANGELOG.md unless asked.

---

## HARD RULES (never break)
- `next-intl` v3 only — v4 breaks jsx-runtime with Next.js 14
- `moduleResolution: "node"` always — never "bundler"
- `npm` only — never pnpm
- Never expose service role key to client
- Never execute legal action without explicit user confirmation
- Never use `any` type without comment
- Never hardcode KE-specific strings outside `lib/countries/KE/`
- Never delete DB columns — deprecate with `_deprecated` suffix
- Never skip `npm run build` before marking task done
- Never batch-build then test at end — build one component, verify, then next
- IntaSend sandbox by default — never go live without explicit instruction

---

## STACK (pinned — never use ranges ^ ~ *)
```
next@14.2.35 | react@18.3.1 | next-intl@3.26.3
@supabase/supabase-js@2.47.0 | @supabase/ssr@0.5.2
@anthropic-ai/sdk@0.39.0 | tesseract.js@5.1.1
typescript@5.3.3 | tailwindcss@3.4.1 | tsx@4.7.0
playwright@1.59.1 | cheerio@1.2.0 | resend@6.10.0
africastalking@0.7.9 | googleapis@171.4.0
```
tsconfig: `moduleResolution: node`, `target: ES2017`
globals.css: `@tailwind base/components/utilities` ONLY — no shadcn imports

---

## CODE STANDARDS
- TypeScript everywhere, App Router only (no Pages Router)
- All UI strings in `messages/{locale}.json` — never hardcode
- Tailwind only — no inline styles
- Zustand for client state; React Query / Next.js fetch for server state
- Anthropic SDK (not raw fetch); always stream long responses
- API routes return `{ success: boolean, data?, error? }`
- User errors: plain English. Server errors: log to `error_logs` table
- Commits: `type(scope): description`

---

## MODELS + COST RULES
- `claude-opus-4-7`: full document analysis only (legal reasoning, structured JSON). One call per doc.
- `claude-haiku-4-5-20251001`: everything else — translation checks, short summaries, routing, WhatsApp/SMS copy
- Always set max_tokens: Opus analysis=2048, Haiku summary=512, Haiku routing=256
- EN + SW summaries in ONE Opus call — never two
- Cache system prompt (cache_control: ephemeral) on every analysis call — ~90% cost reduction
- Chunk docs before sending — target <4000 tokens input, skip boilerplate/page numbers
- RAG: max 5 chunks × ~300 tokens = 1500 tokens max
- Check `document_analyses` by hash before any API call — never re-analyse
- Log prompt_tokens + completion_tokens + model on every call

---

## SUPABASE RULES
- Every table has RLS enabled
- Migrations in `supabase/migrations/YYYYMMDD_description.sql` (always include rollback SQL in comments)
- `country_code` VARCHAR(2) DEFAULT 'KE' required on all country-scoped tables
- RAG retrieval always filtered by `country_code` — never mix law corpora

---

## i18n RULES
- Locales: `en` (default, launch), `sw` (launch) | Planned: fr, lg, rw
- URL: `/[locale]/...` | Fallback: always `en`
- UI locale (next-intl) and content language (user.language_preference) are separate concerns
- Language switcher in nav, persists to profile if authed, localStorage if not

---

## MULTI-COUNTRY RULES
- Country-specific logic in `lib/countries/{CC}/` only
- Admin units: `region_level_1` / `region_level_2` (County/Ward in KE, Region/District in TZ)
- Adding a country = new `lib/countries/{CC}/` folder + law seed + scraper config. No schema changes.

---

## ACTION EXECUTION RULES
- Always show full draft before any external filing
- Calendar + notifications: auto with standing consent
- Log every attempt + outcome to `action_executions`
- Templates: `lib/countries/{CC}/actions/`

---

## TEST DEFINITION OF DONE
All 4 must pass before marking complete:
1. `npm run build` — zero errors
2. `npm run dev` starts without compilation errors
3. `curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/en` returns 200
4. Target route renders without console errors

---

## PROJECT STRUCTURE
```
app/[locale]/(auth|dashboard)/  |  app/api/
components/                      |  lib/prompts/ parsers/ actions/ scrapers/ rag/ supabase/ countries/
lib/countries/KE/config.ts actions/ scrapers/
messages/en.json sw.json
supabase/migrations/ seed/law/KE/
CLAUDE.md  SPRINT_CONTEXT.md  STACK.md  PRD.md  TODOS.md  CHANGELOG.md
```

---

## GLOSSARY
PP session=Public Participation | ATI=Access to Information | MCA=Member of County Assembly
EACC=Ethics & Anti-Corruption Commission | CAJ=Commission on Administrative Justice (Ombudsman)
NEMA=National Environment Management Authority | PPRA=Public Procurement Regulatory Authority
region_level_1=County(KE)/Region(TZ) | region_level_2=Ward(KE)/District(TZ)

---

## KEY INTEGRATIONS
Anthropic API · Supabase (DB/Auth/Storage/pgvector) · next-intl · Africa's Talking (SMS/USSD)
WhatsApp Business API · Google Calendar API · Mzalendo API (MP/MCA contacts, KE)
