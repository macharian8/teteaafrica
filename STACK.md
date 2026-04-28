# STACK.md — Tetea Africa
**Updated:** 2026-04-21 | **Package manager: npm only (never pnpm)**

---

## TRAPS (never repeat)
- `next-intl@4.x` + `next@14` → jsx-runtime broken. Use v3 only.
- `moduleResolution: "bundler"` + `next@14` → jsx-runtime broken. Use "node".
- shadcn globals.css with `@import "shadcn/tailwind.css"` → broken with Tailwind v3. Use bare directives only.
- `pnpm` + shadcn/ui → hoisting failures. npm only.

---

## Pinned Dependencies (no ^ or ~ ever)
```json
{
  "next": "14.2.35",
  "react": "18.3.1",
  "react-dom": "18.3.1",
  "next-intl": "3.26.3",
  "@supabase/supabase-js": "2.47.0",
  "@supabase/ssr": "0.5.2",
  "@anthropic-ai/sdk": "0.39.0",
  "pdf-parse": "1.1.1",
  "xlsx": "0.18.5",
  "zod": "3.23.8",
  "zustand": "4.5.5",
  "playwright": "1.59.1",
  "cheerio": "1.2.0",
  "africastalking": "0.7.9",
  "resend": "6.10.0",
  "googleapis": "171.4.0",
  "tesseract.js": "5.1.1",
  "openai": "4.77.0"
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

## tsconfig.json (required settings)
```json
{
  "compilerOptions": {
    "target": "ES2017",
    "moduleResolution": "node",
    "module": "esnext",
    "jsx": "preserve",
    "strict": true,
    "noEmit": true,
    "esModuleInterop": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "incremental": true,
    "plugins": [{ "name": "next" }],
    "paths": { "@/*": ["./*"] }
  }
}
```

## globals.css
```css
@tailwind base;
@tailwind components;
@tailwind utilities;
```
Nothing else. No shadcn imports. No tw-animate-css.

## Node.js: 20.x LTS minimum

## Before installing any package
1. Search current stable version
2. Check peer deps against this file
3. Verify Next.js 14 compatibility
4. Pin exact version
5. `npm run build` after install
6. Update this file immediately
