# STACK.md — Tetea Africa
**Last updated:** 2026-04-04
**Status:** Authoritative version reference — update after every install

---

## Critical Compatibility Notes

### The next-intl trap (how we lost Sprint 2)
next-intl v4.x requires Next.js 15. next-intl v3.x is designed for Next.js 14.
Installing v4 with Next.js 14 breaks jsx-runtime resolution silently.
**Always use next-intl v3.x with Next.js 14. Non-negotiable.**

### moduleResolution trap
Next.js 14 requires `"moduleResolution": "node"` in tsconfig.json.
`"moduleResolution": "bundler"` breaks react/jsx-runtime resolution.
**Never use "bundler" with Next.js 14.**

### shadcn/ui CSS trap
shadcn v2+ generates globals.css with `@import "shadcn/tailwind.css"` and
`border-border` class references. These require Tailwind v4 plugin setup.
With Tailwind v3, use bare `@tailwind base/components/utilities` only.

---

## Pinned Production Dependencies

```json
{
  "next": "14.2.35",
  "react": "18.3.1",
  "react-dom": "18.3.1",
  "next-intl": "3.26.3",
  "@supabase/supabase-js": "2.47.0",
  "@supabase/ssr": "0.5.2",
  "@anthropic-ai/sdk": "0.39.0",
  "openai": "4.77.0",
  "pdf-parse": "1.1.1",
  "xlsx": "0.18.5",
  "zod": "3.23.8",
  "zustand": "4.5.5",
  "playwright": "1.59.1",
  "cheerio": "1.2.0",
  "africastalking": "0.7.9",
  "resend": "6.10.0",
  "googleapis": "171.4.0",
  "tesseract.js": "5.1.1"
}
```

## Pinned Dev Dependencies

```json
{
  "typescript": "5.3.3",
  "tailwindcss": "3.4.1",
  "postcss": "8.4.38",
  "autoprefixer": "10.4.19",
  "@types/node": "20.11.5",
  "@types/react": "18.3.1",
  "@types/react-dom": "18.3.1",
  "tsx": "4.7.0"
}
```

## tsconfig.json Required Settings

```json
{
  "compilerOptions": {
    "target": "ES2017",
    "lib": ["dom", "dom.iterable", "esnext"],
    "allowJs": true,
    "skipLibCheck": true,
    "strict": true,
    "noEmit": true,
    "esModuleInterop": true,
    "module": "esnext",
    "moduleResolution": "node",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "jsx": "preserve",
    "incremental": true,
    "plugins": [{ "name": "next" }],
    "paths": { "@/*": ["./*"] }
  }
}
```

## Node.js

- Minimum: 18.17.0
- Recommended: 20.x LTS
- Check with: `node --version`

## Package Manager

- npm (switched from pnpm due to hoisting failures)
- Version: 10.x+
- Check with: `npm --version`
- **Never mix npm and pnpm in the same project**

## globals.css — Correct Content

```css
@tailwind base;
@tailwind components;
@tailwind utilities;
```

Nothing else. No shadcn imports. No tw-animate-css.

---

## Before Installing Any New Package

1. Search for the package's current stable version
2. Check its peer dependencies against versions in this file
3. Verify it works with Next.js 14 specifically
4. Pin the exact version — no `^` or `~` ranges
5. Run `npm run build` after installing — not just `npm run dev`
6. Update this file immediately after any install

## Red Flags — Never Install These Combinations

- next-intl@4.x + next@14 → jsx-runtime broken
- tailwindcss@4.x + next@14 → CSS pipeline broken
- pnpm + shadcn/ui → hoisting failures
- moduleResolution: bundler + next@14 → jsx-runtime broken
- Any package with `^` or `~` version prefix → unpinned, risky
