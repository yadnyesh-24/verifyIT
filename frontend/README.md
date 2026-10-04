# VerifyIT frontend

Next.js 14 (App Router) + TypeScript + Tailwind + shadcn-style UI.
Mobile-first, also good on desktop. English / Hindi toggle lives in the header.

## Run

```bash
cd frontend
npm install
npm run dev          # http://localhost:3000
npm run dev:lan      # same, but bound to 0.0.0.0 (open from your phone on the same Wi-Fi)
npm run build        # production build (set NODE_OPTIONS=--max-old-space-size=6144 on Windows)
npm start            # serve the build on :3000
npm run lint         # ESLint
npm run typecheck    # tsc --noEmit
```

## Connect to the backend

1. Start the FastAPI service on port 8000 (the project's default).
2. Copy the env file and pick a mode:
   ```bash
   cp .env.example .env.local
   ```
   Open `.env.local` and set:
   ```env
   BACKEND_URL=http://localhost:8000      # where the FastAPI app lives
   NEXT_PUBLIC_DATA_MODE=live              # or "mock" / "auto"
   ```
3. Restart the Next dev server. If you picked `auto`, the header pill will
   read "Live" once `/api/health` returns 200; if the backend is down, it
   reads "Demo data" and a toast explains the fallback.

### How the connection works

- The browser only ever talks to the frontend origin (`http://localhost:3000`).
- `next.config.mjs` rewrites `/api/:path*` → `${BACKEND_URL}/api/:path*`, so the
  FastAPI service can be on the same machine or a different host without any
  CORS config on the phone.
- `lib/data-mode.ts` owns the live/mock decision. In `auto` it probes
  `/api/health` once on first load, persists the choice in `localStorage`,
  and flips to mock if any request fails - with a toast.
- The mock fixtures live in `lib/mocks.ts`. Pick one via the floating "Demo"
  button (or `?demo=1`): genuine, multi-party, fake.

### Mock fixtures

- `?demo=genuine` (or just click "Genuine" in the Demo menu) - single company,
  all checks `pass`, score 92.
- `?demo=multi` - marketer + 2 manufacturer units, `MCA_NAME_ONLY_MATCH` and
  a `STATE_MISMATCH` flag, score 68.
- `?demo=fake` - company not found, FSSAI wrong length, score 32.

## Layout

```
frontend/
├─ app/                       # App Router pages (force-dynamic)
│  ├─ layout.tsx              # Inter + Noto Sans Devanagari, ScanProvider, Toaster
│  ├─ page.tsx                # Home (hero + drop zone + how-it-works)
│  ├─ scanning/page.tsx       # Progress + scan line + 30s timeout
│  ├─ review/page.tsx         # Edit fields, parties, unassigned licences
│  └─ results/page.tsx        # Trust Score gauge + checks + flags + portals
├─ components/
│  ├─ ui/                     # shadcn-style primitives (button, card, ...)
│  ├─ header.tsx              # Logo + lang toggle + backend status pill
│  ├─ lang-toggle.tsx         # EN | हिंदी segmented control
│  ├─ backend-status.tsx      # "Live" / "Demo data" pill in the header
│  ├─ step-indicator.tsx      # Scan -> Review -> Result progress
│  ├─ score-gauge.tsx         # Animated Trust Score arc
│  ├─ party-card.tsx          # Editable party with role + unit suffix
│  ├─ product-details-card.tsx# Editable product fields
│  ├─ photo-card.tsx          # Zoomable preview (mobile collapsible)
│  ├─ demo-menu.tsx           # Floating "Demo" button (only when ?demo=1 / mock)
│  └─ error-boundary.tsx      # Top-level React error boundary
└─ lib/
   ├─ contract.ts             # Zod-validated types + translation helpers
   ├─ i18n.ts                 # Single en+hi dict, t(lang, key, vars)
   ├─ mocks.ts                # Demo fixtures (genuine / multi / fake)
   ├─ data-mode.ts            # live / mock / auto resolver
   ├─ compress-image.ts       # 1600-px canvas resize before upload
   ├─ api.ts                  # scan(file) / verify(fields), zod-validated
   └─ scan-store.tsx          # Context store, localStorage persistence
```

## Design tokens

All colour, radius and shadow values are declared once in
`app/globals.css` (CSS variables) and `tailwind.config.ts` (Tailwind aliases).
No raw hex appears in component code - reference the tokens (`bg-brand`,
`text-ink`, `border-hairline`, `rounded-card`, ...).

Status colours map to the four non-negotiable UI states:

| State           | FG token | BG token |
|-----------------|----------|----------|
| pass / genuine  | #16A34A  | #DCFCE7  |
| warn / check    | #D97706  | #FEF3C7  |
| risk / fail     | #DC2626  | #FEE2E2  |
| pending         | #64748B  | #F1F5F9  |

`not_checked` is rendered with the pending style on purpose: it must never
look like a failure.

## Design constraints

- Min font size 14px; body 16px mobile / 17px desktop; line-height 1.5.
- Every button and input at least 48px tall; primary action full-width on
  mobile.
- Min card radius `rounded-2xl` (16px), buttons `rounded-xl` (12px).
- Motion 150-200ms; the score gauge eases from 0 to its value over ~800ms.
  `prefers-reduced-motion` disables all animations.
- Lucide icons, 20px (h-5 w-5).

## Language

Every user-visible string lives in `lib/i18n.ts` under both `en` and `hi`. The
helper supports `{name}`-style interpolation and falls back to English when a
Hindi translation is missing. `next/font` swaps Noto Sans Devanagari onto
`<html lang="hi">` automatically.