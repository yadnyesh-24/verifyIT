# VerifyIT frontend

Next.js 14 (App Router) + TypeScript + Tailwind + shadcn-style UI. Mobile-first,
also works on desktop. English / Hindi toggle lives in the header.

## Run

```bash
cd frontend
npm install
npm run dev          # http://localhost:3000
npm run build        # production build (needs NODE_OPTIONS=--max-old-space-size=4096 on tight-memory hosts)
```

## Configure the backend

Copy `.env.example` to `.env.local` and set `NEXT_PUBLIC_API_URL`:

```env
NEXT_PUBLIC_API_URL=http://localhost:8000     # default
NEXT_PUBLIC_USE_MOCK=false                    # set true to force mock data
```

If `NEXT_PUBLIC_API_URL` is empty **or** `NEXT_PUBLIC_USE_MOCK=true`, the app
loads bundled mock fixtures instead of calling the backend. The mock layer
honours a `?mock=genuine|multi|fake` query param on every page so demos can be
triggered deterministically.

## Demo mock fixtures

- `?mock=genuine` - single party, all checks `pass`, score 92.
- `?mock=multi` - marketer + 2 manufacturer units, `MCA_NAME_ONLY_MATCH` and a
  `STATE_MISMATCH` flag.
- `?mock=fake` - company not found, FSSAI wrong length, score 32.

## Layout

```
frontend/
├─ app/                       # App Router pages
│  ├─ layout.tsx              # ScanProvider + Toaster
│  ├─ page.tsx                # Home (scan CTA + how-it-works)
│  ├─ scanning/page.tsx       # Progress + retry
│  ├─ review/page.tsx         # Edit fields, parties, unassigned licences
│  └─ results/page.tsx        # Trust Score gauge + checks + flags + portals
├─ components/
│  ├─ ui/                     # shadcn-style primitives
│  ├─ header.tsx              # Logo + lang toggle
│  ├─ score-gauge.tsx         # Trust Score arc
│  ├─ party-card.tsx          # Editable party
│  ├─ product-details-card.tsx# Editable product fields
│  └─ error-boundary.tsx      # Top-level React error boundary
└─ lib/
   ├─ types.ts                # ScanResponse / VerifyResponse / etc.
   ├─ i18n.ts                 # Single en+hi dictionary, t(lang, key)
   ├─ mocks.ts                # Demo fixtures + mock-mode detection
   ├─ compress-image.ts       # 1600-px canvas resize before upload
   ├─ api.ts                  # scanLabel / verifyItem / health
   └─ scan-store.tsx          # Context store, localStorage persistence
```

## API contract

The frontend talks to two endpoints. The shapes live in `lib/types.ts`:

- `POST /api/scan` (multipart `file`) - returns the OCR'd fields.
- `POST /api/verify` (JSON body of fields) - returns checks, score, verdict,
  and the official portal buttons.

See [`../API_CONTRACT.md`](../API_CONTRACT.md) for the full contract.

## UI language

Every user-visible string lives in `lib/i18n.ts`. To add a string, add the key
to **both** `en` and `hi`. The `t(lang, key)` helper falls back to English when a
Hindi translation is missing.