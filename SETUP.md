# SETUP.md — Tetea Africa Local Development Setup

## Prerequisites
- Node.js 20+
- pnpm (`npm install -g pnpm`)
- Supabase CLI (`npm install -g supabase`)
- Git

---

## 1. Clone and Install

```bash
git clone https://github.com/YOUR_ORG/tetea.git
cd tetea
pnpm install
```

---

## 2. Environment Variables

```bash
cp .env.local.example .env.local
```

`.env.local`:

```env
# Supabase
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key

# Anthropic
ANTHROPIC_API_KEY=your-anthropic-api-key

# Africa's Talking
AT_API_KEY=your-africastalking-api-key
AT_USERNAME=sandbox
AT_SENDER_ID=TETEA

# WhatsApp Business API
WHATSAPP_PHONE_NUMBER_ID=
WHATSAPP_ACCESS_TOKEN=

# Google Calendar API
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
GOOGLE_REDIRECT_URI=http://localhost:3000/api/auth/google/callback

# i18n
NEXT_PUBLIC_DEFAULT_LOCALE=en
NEXT_PUBLIC_SUPPORTED_LOCALES=en,sw

# App
NEXT_PUBLIC_APP_URL=http://localhost:3000
NEXT_PUBLIC_APP_NAME=Tetea
APP_SECRET=generate-with-openssl-rand-hex-32

# Default country for MVP
NEXT_PUBLIC_DEFAULT_COUNTRY=KE

# Feature flags
NEXT_PUBLIC_ENABLE_WHATSAPP=false
NEXT_PUBLIC_ENABLE_SMS=false
NEXT_PUBLIC_ENABLE_CALENDAR=false
NEXT_PUBLIC_ENABLE_MULTI_COUNTRY=false
```

---

## 3. Supabase Setup

```bash
supabase login
supabase link --project-ref your-project-ref
supabase db push
```

Enable pgvector (run once in Supabase SQL editor):
```sql
create extension if not exists vector;
```

---

## 4. i18n Setup

Translation files live in `messages/`. The two required files at launch:

```
messages/
  en.json    # English — always the complete reference file
  sw.json    # Kiswahili
```

Adding a new locale (e.g. French for DRC/Rwanda expansion):
1. Create `messages/fr.json` (copy `en.json` as template)
2. Add `'fr'` to `NEXT_PUBLIC_SUPPORTED_LOCALES`
3. Add country config in `lib/countries/{CC}/config.ts` with `supportedLocales: ['en', 'fr']`
4. Update Claude summarization prompt to generate `summary_fr` field

No routing or schema changes needed.

---

## 5. Seed Law Corpus

```bash
pnpm run seed:law -- --country=KE
```

Reads `.txt` files from `supabase/seed/law/KE/`, chunks, embeds, stores in
`law_chunks` with `country_code = 'KE'`.

**Kenya law documents** (obtain from kenyalaw.org):
```
supabase/seed/law/KE/
  constitution_2010.txt
  access_to_information_act_2016.txt
  county_governments_act_2012.txt
  public_finance_management_act_2012.txt
  emca.txt
  ppra_act_2015.txt
  national_assembly_standing_orders.txt
  senate_standing_orders.txt
  county_assembly_model_standing_orders.txt
```

For future countries:
```bash
pnpm run seed:law -- --country=TZ
pnpm run seed:law -- --country=UG
```

---

## 6. Seed Admin Units

```bash
pnpm run seed:admin-units -- --country=KE
```

Loads Kenya's 47 counties + 1,450 wards into `admin_units` table.
Source: IEBC or KNBS ward boundary data.

---

## 7. Run Locally

```bash
pnpm dev
# App at http://localhost:3000
# Redirects to http://localhost:3000/en (default locale)
```

---

## 8. Key Commands

```bash
pnpm dev                              # Dev server
pnpm build                            # Production build
pnpm lint                             # ESLint
pnpm type-check                       # TypeScript check
pnpm test                             # Tests

supabase db push                      # Apply migrations
supabase db diff                      # Show pending

pnpm run seed:law -- --country=KE     # Seed KE law corpus
pnpm run seed:admin-units -- --country=KE  # Seed KE admin units
pnpm run scrape:gazette -- --country=KE    # Manual gazette scrape (dev)
```

---

## 9. Deployment

### Vercel
```bash
vercel --prod
```
Set all env vars in Vercel → Settings → Environment Variables.
Ensure `NEXT_PUBLIC_DEFAULT_LOCALE=en` and `NEXT_PUBLIC_SUPPORTED_LOCALES=en,sw` are set.

### Supabase
```bash
supabase db push --linked
```

---

## 10. GitHub Setup

**Branches:** `main` (prod), `dev` (integration), `feat/*`, `fix/*`, `i18n/*`

**Required secrets:**
```
VERCEL_TOKEN
SUPABASE_ACCESS_TOKEN
SUPABASE_PROJECT_REF
ANTHROPIC_API_KEY
```

---

## 11. Adding a New Country

1. Create `lib/countries/{CC}/config.ts` implementing `CountryConfig`
2. Create `lib/countries/{CC}/scrapers/` with gazette + parliament scraper configs
3. Create `lib/countries/{CC}/actions/` with action letter templates
4. Add law documents to `supabase/seed/law/{CC}/`
5. Run `pnpm run seed:law -- --country={CC}`
6. Run `pnpm run seed:admin-units -- --country={CC}`
7. Add locale files if new language required (`messages/{locale}.json`)
8. Update `NEXT_PUBLIC_SUPPORTED_LOCALES` and `NEXT_PUBLIC_ENABLE_MULTI_COUNTRY=true`
9. No DB migrations needed — `country_code` column already exists everywhere
