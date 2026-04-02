# PRD — Tetea Africa Civic Intelligence Platform
**Version:** 0.2
**Last updated:** 2026-04-02
**Status:** Active development

---

## Problem Statement

Across Africa, constitutions guarantee citizens the right to participate in governance.
In practice this right is inaccessible: government documents are written in dense legalese,
public participation notices are buried in official gazettes nobody reads, and even when
citizens find relevant information they have no idea what to *do* with it.

The result: public participation is a legal checkbox for governments, not genuine dialogue.
Only lawyers, NGOs, and the highly educated navigate the system. Ward-level citizens —
the people most affected by county budgets, land notices, and development plans — are
structurally excluded.

**Tetea fixes this** by being a civic agent: it finds documents, translates them into
plain language (English and Kiswahili, with French/Luganda/Kinyarwanda to follow),
determines what legal actions citizens can take, and executes or scaffolds those actions.

---

## Vision

> Every African citizen, regardless of education, language, or location, can understand
> what their government is doing and take meaningful action — directly from WhatsApp.

---

## Target Users

**Primary:** Citizens in covered countries
- WhatsApp-first; may be feature phone users
- Prefer local language over English
- Unlikely to install an app

**Secondary:** CSOs, NGOs, journalists, law firms
- Need monitored feeds by topic/region
- May pay for structured data access

**Tertiary:** County/district governments (future B2G)
- Pay to publish participation notices in structured form
- Receive aggregated citizen input as data

---

## Language Architecture

| Locale | Code | Status | Scope |
|---|---|---|---|
| English | `en` | ✅ Launch | UI default + AI summaries |
| Kiswahili | `sw` | ✅ Launch | UI switcher + AI summaries |
| French | `fr` | 🔜 Phase 3 | Required for DRC, Rwanda, West Africa |
| Luganda | `lg` | 🔜 Phase 3 | Uganda expansion |
| Kinyarwanda | `rw` | 🔜 Phase 3 | Rwanda expansion |

**Two separate language concerns:**
1. **UI locale** — controlled by next-intl, `messages/{locale}.json`, URL prefix `/[locale]/`
2. **Content language** — AI generates summaries in user's `language_preference` (EN + SW
   generated together in every analysis call; additional languages added per country rollout)

Default UI locale: `en`. Language switcher visible in nav at all times.

---

## Multi-Country Architecture

### MVP (Phase 1–2): Kenya only
### Phase 3: Tanzania, Uganda
### Phase 4+: Rwanda, Ghana, Nigeria, South Africa

**What's reusable across countries (built once):**
- Claude analysis pipeline (language param drives output language)
- WhatsApp/SMS delivery (Africa's Talking covers 40+ countries)
- Web UI, auth, subscription model, action execution framework
- pgvector RAG pipeline (filtered by `country_code`)

**What's country-specific (one folder per country):**
- Law corpus (`supabase/seed/law/{CC}/`)
- Admin unit labels and data (counties/wards vs regions/districts)
- Action body names (EACC → PCCB → IGG)
- Gazette + parliament scraper configs
- Action letter templates

**Schema rule:** `country_code` (ISO 3166-1 alpha-2) on every country-scoped table
from day one. Adding Tanzania = new config folder + law seed + scraper. No migrations.

### Country Portability Estimate
| Country | Effort from KE baseline | Notes |
|---|---|---|
| Tanzania | 2–3 weeks | Same Swahili, similar constitution, RTI Act 2016 exists |
| Uganda | 4–6 weeks | Luganda layer, ATI Act 2005, different admin structure |
| Rwanda | 6–8 weeks | French + Kinyarwanda, strong RTI law, different gazette |
| Nigeria | 8–12 weeks | 36 states, complex federal/state split, multiple languages |

---

## Phase 1 — Core Pipeline (MVP, Weeks 1–6)

### P1.1 Document Ingestion
- Manual URL/PDF upload via web UI
- Auto-scraper: Kenya Gazette (kenyalaw.org) weekly releases
- Auto-scraper: Nairobi County downloads page
- Store raw + extracted text in Supabase Storage + `documents` table
- All records tagged `country_code = 'KE'`

### P1.2 Document Analysis Pipeline
Claude pipeline producing structured JSON per document:

```json
{
  "country_code": "KE",
  "title": "string",
  "document_type": "gazette_notice | county_policy | parliamentary_bill | budget | tender | nema | land | other",
  "summary_en": "3-sentence plain English summary",
  "summary_sw": "3-sentence Kiswahili summary",
  "affected_region_l1": ["Nairobi County"],
  "affected_region_l2": ["Westlands Ward"],
  "key_dates": [{ "label": "string", "date": "ISO date", "is_deadline": boolean }],
  "actions": [
    {
      "id": "string",
      "type": "ati_request | petition | calendar_invite | submission | complaint_anticorruption | complaint_ombudsman | environment_objection | representative_contact | media_pitch | inform_only",
      "title_en": "string",
      "title_sw": "string",
      "description_en": "string",
      "description_sw": "string",
      "legal_basis": "Article/statute reference",
      "deadline": "ISO date or null",
      "executability": "auto | scaffolded | inform_only",
      "draft_content_en": "string",
      "draft_content_sw": "string"
    }
  ],
  "raw_legal_provisions": ["relevant statute references"],
  "confidence_score": 0.0–1.0
}
```

### P1.3 Kenyan Law RAG Index
Embed + store in Supabase pgvector, all tagged `country_code = 'KE'`:
- Constitution of Kenya 2010 (Articles 10, 35, 37, 118, 119, 196)
- Access to Information Act 2016
- County Governments Act 2012
- Public Finance Management Act 2012
- Environment Management and Coordination Act (EMCA)
- PPRA Act 2015
- National Assembly + Senate Standing Orders
- County Assembly (Model) Standing Orders

### P1.4 Web UI (MVP)
- Landing: URL paste or PDF upload → analysis
- Language switcher (EN/SW) in nav — persists to profile/localStorage
- Analysis results: summary with EN↔SW toggle, affected regions, key dates, action cards
- Action card: description, legal basis, deadline countdown, executability badge, CTA
- Auth: Supabase Auth (email + phone OTP, Kenya +254 default)

### P1.5 Action Executors (MVP)
- **Calendar invite** — Google Calendar API, auto with standing consent
- **ATI request draft** — generated letter, download or send via email
- **Written submission draft** — structured PP submission document
- **Representative contact** — Mzalendo lookup (KE), pre-filled draft, user confirms

### P1.6 User Subscriptions
- Country (defaults to KE, selector for future expansion)
- Region level 1 + 2 (county + ward for KE)
- Topic: land, environment, budget, health, tenders, general
- Language preference: en / sw (drives AI content language, independent of UI locale)
- Channel: WhatsApp, SMS, email
- Standing consents: what fires automatically vs. needs confirmation

---

## Phase 2 — Reach + Notifications (Weeks 7–12)

### P2.1 WhatsApp Bot
- Send PDF link → structured analysis returned
- Keyword subscribe: "SUBSCRIBE WESTLANDS LAND"
- Interactive buttons for action execution
- Africa's Talking or Twilio WhatsApp API

### P2.2 SMS Fallback
- Feature phone compatible via Africa's Talking
- Brief alert format, USSD flow (stretch)

### P2.3 Automated Scrapers
- Scheduled weekly: Kenya Gazette
- Scheduled daily: County downloads (Nairobi first)
- Scheduled on-publish: Parliament bills RSS
- Pipeline: new doc → analysis → match subscriptions → notify

### P2.4 Deadline Tracking
- Active deadline dashboard
- Push alerts at 7d, 3d, 1d before deadline
- ATI non-response at day 21 → auto-draft CAJ escalation

---

## Phase 3 — Collective Action + Expansion (Weeks 13–24)

### P3.1 Tanzania Rollout
- Add `lib/countries/TZ/` config
- Tanzania law corpus seeded (`country_code = 'TZ'`)
- Tanzania Gazette scraper (Code for Africa hosts TZ gazette data)
- Region/district admin units loaded
- Kiswahili content generation same pipeline — no new language work needed

### P3.2 Uganda Rollout
- Add `lib/countries/UG/` config
- Uganda law corpus + ATI Act 2005
- Luganda locale file (`messages/lg.json`)
- Sub-county/county admin units

### P3.3 Petition Platform
- Auto-generate petitions from analysis
- Signature collection (name, region, phone/email)
- Filing via appropriate channel per country
- Status tracking + signatory notifications

### P3.4 Collective Aggregation
- N users from same ward flag same document → joint submission
- "47 people in Embakasi East flagged this" notification
- Drives visible organized pressure

### P3.5 Outcome Tracking
- Log every filed action
- ATI deadline monitoring, auto-escalation chains
- Public outcome feed: transparency on what Tetea has filed and what responses came back

### P3.6 CSO/NGO Dashboard (B2B)
- Filtered feed by topic + country + region
- CSV/JSON export, webhook integration
- Pricing: KES 3,000–20,000/month (see PRD revenue section)

### P3.7 County/District Government Portal (B2G)
- Structured PP notice publishing
- Aggregated citizen input as structured data
- Compliance reporting

---

## Revenue Model

| Stream | Year 1 | Year 2 | Year 3 |
|---|---|---|---|
| Donations (citizens) | KES 60K | KES 150K | KES 300K |
| CSO/NGO subscriptions | KES 400K | KES 1.2M | KES 3M |
| County/Govt SaaS | — | KES 1.2M | KES 5M |
| Grants (EU, AU, GIZ, UNDP) | KES 2M | KES 1.5M | KES 1M |
| **Total** | **~KES 2.5M** | **~KES 4M** | **~KES 9M** |

Donate/tip button: add in Phase 2 once user base exists. IntaSend + Ko-fi.

---

## Non-Goals
- Legal advice (surfaces rights and mechanisms, not legal counsel)
- Voter registration or election monitoring
- Real-time news aggregation
- Court filing or legal representation

---

## Data Model

```sql
-- All country-scoped tables include country_code VARCHAR(2) NOT NULL DEFAULT 'KE'

documents           -- raw ingested docs, extracted text, storage path
document_analyses   -- structured JSON output, summaries EN+SW, affected regions
actions             -- available actions per document analysis
action_executions   -- user-initiated attempts + outcomes + draft content
users               -- auth + profile (language_preference, country_code)
subscriptions       -- region prefs + topic + channel + country_code
standing_consents   -- per action type, per user
notifications       -- sent log (channel, status, country_code)
deadlines           -- tracked deadline items per user + doc
law_chunks          -- pgvector embeddings, country_code, statute_name, chunk_index
admin_units         -- region_level_1 + region_level_2 per country_code
error_logs          -- server-side error log
```

---

## Tech Stack

| Layer | Choice | Notes |
|---|---|---|
| Frontend | Next.js 14 App Router | `/[locale]/` routing |
| i18n | next-intl | EN default, SW at launch |
| Styling | Tailwind + shadcn/ui | |
| Auth | Supabase Auth | Phone OTP |
| Database | Supabase Postgres | pgvector for RAG |
| Storage | Supabase Storage | PDFs |
| AI | Anthropic (Opus + Haiku) | |
| SMS/USSD | Africa's Talking | 40+ African countries |
| WhatsApp | Africa's Talking / Twilio | |
| Calendar | Google Calendar API | |
| Scraping | Playwright + Cheerio | |
| Jobs | Supabase pg_cron / Inngest | |
| Deployment | Vercel + Supabase | |

---

## Key Risks

| Risk | Mitigation |
|---|---|
| Gazette PDFs are scanned | pdfplumber OCR fallback; flag low-confidence extractions |
| Claude misidentifies legal basis | Show confidence score + source provision; human review for legal actions |
| Citizens don't trust AI petitions | Always show full draft; human authorizes every legal filing |
| County sites change/go down | Store raw HTML; manual upload always works |
| Government blocks scraping | Respectful crawl delays; cached copies |
| Translation quality (SW/FR/LG) | Human review pipeline for AI-generated civic content |
| Multi-country law complexity | Strict `country_code` isolation in RAG — never mix corpora |
