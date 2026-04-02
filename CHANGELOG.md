# CHANGELOG — Tetea Africa

Format: `[YYYY-MM-DD] type(scope): description`

---

## Unreleased

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
