# NEXT_STEPS.md — Tetea Africa
**As of:** 2026-04-22

Work through these in order. Each is a discrete task.

---

## IMMEDIATE (unblock production)

1. **Run `supabase db push`**
   Applies Sprint 7 migration (onboarding columns). Everything else is blocked until this runs.
   Then: `UPDATE users SET onboarding_completed = true WHERE created_at < '2026-04-21';`

2. **Set Supabase Vault variables**
   Unblocks pg_cron automation (scrapers + notifications stop being manual).
   ```sql
   ALTER DATABASE postgres SET app.webhook_base_url = 'https://dev.tetea.africa';
   ALTER DATABASE postgres SET app.scraper_secret = 'your-secret';
   ```

3. **Fix profile save UX** (Claude Code prompt ready)
   After save: flip to read-only display mode with "Edit profile" button.
   Fix one-click send copy.

4. **Codify RLS public read policies into migration**
   Currently applied manually in prod — will be lost on next `supabase db reset`.
   Create: `supabase/migrations/20260408000002_public_read_policies.sql`

5. **Fix large-doc analysis abort**
   Reduce `maxChars` to 40,000 in `lib/analysis/analyzeDocument.ts`.
   Then run: `npm run analyze:historical` to process ~30 unanalyzed docs.

---

## PRODUCTION READINESS

6. **Switch Google OAuth to production mode**
   Currently test mode — only whitelisted emails can sign in.
   Google Console → OAuth consent screen → Publish app.

7. **Set Resend custom domain**
   Emails currently send from generic domain.
   Configure `alerts@tetea.africa` in Resend dashboard + DNS.

8. **Test full action flow end-to-end**
   Sign in → find doc → open action → submit ATI draft → confirm email fires → check `action_executions` row.

9. **Test onboarding end-to-end on production**
   Sign out → sign in → hits `/onboarding` → complete all 4 steps → lands on feed → account page shows saved data.

10. **Top up Anthropic credits**
    ~30 docs unanalyzed. Run historical analysis after fix #5.

---

## QUALITY

11. **Mobile review of ActionModal**
    `min-h` still needs checking on small screens.

12. **Error monitoring — Sentry**
    Currently flying blind on production errors.

13. **Analytics — Plausible or PostHog**
    Need baseline before any user acquisition.

---

## CONTENT PIPELINE

14. **Run parliament scraper**
    ```bash
    npx tsx --env-file=.env.local scripts/run-scraper.ts parliament
    ```

15. **Verify pg_cron fired after Vault vars are set**
    Check: `SELECT * FROM cron.job_run_details ORDER BY start_time DESC LIMIT 20;`

---

## FEATURES (Sprint 8+)

16. **Seed ward data in `admin_units`**
    Ward field in onboarding/account is free-text — needs IEBC list.

17. **Get Mzalendo API key**
    Required for representative-contact action (MP/MCA lookup). Email them.

18. **Senate bills verification**
    Check parliament scraper is catching `/bill/senate/` URLs.

19. **Remaining 42 county scrapers** (have 5 of 47)

20. **One-click action execution**
    Pre-fill citizen credentials (name, ward, ID) into letter drafts automatically.
    Gated by `users.one_click_consent`.

21. **AI semantic search via pgvector**
    Natural language queries over document corpus.

22. **ATI 21-day auto-escalation to CAJ**
    Partially built in `processor.ts` — complete the chain.

23. **WhatsApp bot**
    Pending Meta/Africa's Talking Business API approval.

---

## BUSINESS

24. **Register Company Limited by Guarantee (CLG)** via eCitizen
25. **Apply to ACIF $75K grant** (needs co-applicant, open now)
26. **Watch for AU Civic Tech Fund Round 3** (civictech.africa/auctf-2-2/)
27. **Pitch**: Code for Africa, KHRC, Mzalendo Trust, iHub, Katiba Institute
