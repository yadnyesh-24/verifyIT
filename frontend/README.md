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

The fixtures only use states the backend can actually return today, and their
`score` / `checks_ran` / `verdict` follow the real formula, so a demo can never show
a number the API would not produce (see the honesty rules at the top of
`lib/mocks.ts`).

| `?mock=` | What it shows | `score` | `checks_ran` | `verdict` |
| -------- | ------------- | ------- | ------------ | --------- |
| `genuine` | one manufacturer, CIN found and Active | 100 | 1 | `low_risk` |
| `multi` | marketer + 2 units, `MCA_NAME_ONLY_MATCH` (low) + `FSSAI_FORMAT_INVALID` | 66 | 2 | `medium_risk` |
| `fake` | CIN matched to a `Strike Off` company + `FSSAI_FORMAT_INVALID` | 23 | 2 | `high_risk` |

No fixture shows `licence: "pass"`: the FSSAI/BIS registries are not connected, so
that state cannot occur and a green licence badge would misrepresent the system. The
OCR'd fields are illustrative too — the real `/api/scan` returns `fields: {}` until
the OCR pipeline lands.

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
   ├─ types.ts                # ScanResponse / VerifyResponse / Verdict / etc.
   ├─ i18n.ts                 # Single en+hi dictionary, t(lang, key[, params])
   ├─ mocks.ts                # Demo fixtures + mock-mode detection
   ├─ api.ts                  # scanLabel / verifyItem / health / toVerifyBody
   ├─ scan-store.tsx          # Context store (language persisted to localStorage)
   └─ utils.ts                # cn()
```

> `lib/` was reconstructed from how the app consumes it — the original modules were
> never committed. In particular **`compress-image.ts` does not exist**, so
> `scanLabel()` uploads the picked file as-is; add the resize step here before the
> OCR pipeline ships. Keep `toVerifyBody()` in step with
> `backend.main.LABEL_FIELD_NAMES` whenever the contract grows.

## API contract

The frontend talks to two endpoints. The shapes live in `lib/types.ts`:

- `POST /api/scan` (multipart `file`) - returns the OCR'd fields.
- `POST /api/verify` (JSON body of fields) - returns checks, score, `checks_ran`,
  verdict, and the official portal buttons.

Two rules the UI must follow, because re-deriving either in the client disagrees
with the API:

- The gauge takes its colour and wording from `verdict` — never from a local score
  threshold (`API_CONTRACT.md` -> "The trust score" explains why the two differ).
- Always print the coverage next to the number: `"Based on X of 3 checks"`. A bare
  score reads as a whole-label verdict, which it is not unless all three checks ran.

See [`../API_CONTRACT.md`](../API_CONTRACT.md) for the full contract.

## UI language

Every user-visible string lives in `lib/i18n.ts`. To add a string, add the key
to **both** `en` and `hi`. The `t(lang, key)` helper falls back to English when a
Hindi translation is missing.