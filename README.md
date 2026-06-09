# SuperApp

One installable PWA that merges the household's personal apps —
**Workout**, **Boodschappen** (groceries), **Finance**, **Bakjes**, and a
hidden **marblebag** — behind one Google login gated to a short allow-list,
backed by one Supabase project. See [`docs/KICKOFF.md`](docs/KICKOFF.md) for
the full rationale and [`docs/STATUS.md`](docs/STATUS.md) for live progress.

## Stack

- **Vite + React + TypeScript**, one SPA, deployed to one Vercel project.
- **Tailwind** design system (from WorkoutTracker), **PWA** via `vite-plugin-pwa`.
- **Supabase** (project `gbmioirxxsrvxnitxxso`, "PersonalFinance1") — Google
  auth + a schema per app. RLS keyed to an `allowed_emails` allow-list.
- One serverless function (`api/extract.ts`) for recipe extraction.

## Layout

```
api/          extract.ts            Vercel serverless fn (recipe extraction)
migration/    *.sql                 schema + auth setup, run in Supabase
src/
  shell/      App · AuthGate · Nav · Dashboard
  lib/        supabase.ts (one client) · auth.ts (useCurrentUser)
  apps/
    workout/      ported from WorkoutTracker (IndexedDB or Supabase backend)
    groceries/    ported from Boodschappen (Supabase `boodschappen` schema)
    finance/      placeholder — see docs/FINANCE_PLAN.md
    bakjes/       ported from Bakjesmethode (Supabase `bakjes` schema, ICS upload)
    marblebag/    ported; unlisted + password-gated; Firebase backend
```

Routes are one origin with `React.lazy` per app: `/  /workout/*  /groceries/*
/finance/*  /bakjes/*  /marblebag/*`. `marblebag` is unlisted (no dashboard
card) and behind a session password.

## Develop

```bash
npm install
cp .env.example .env   # fill in Supabase URL + anon key (optional for dev)
npm run dev            # http://localhost:5173
npm run lint           # tsc --noEmit
npm run test           # vitest
npm run build          # tsc -b && vite build
```

Without `VITE_SUPABASE_URL`, AuthGate runs in dev-passthrough mode (no login)
and the workout app uses local IndexedDB. With it set, the app requires Google
sign-in and an allow-listed email.

## Environment variables

| Var | Where | Purpose |
|-----|-------|---------|
| `VITE_SUPABASE_URL` | Vercel + env | Supabase project URL (public) |
| `VITE_SUPABASE_ANON_KEY` | Vercel + env | Supabase anon key (public) |
| `VITE_WORKOUT_CLOUD` | optional | `1` to use the Supabase workout backend instead of IndexedDB (requires the `workout` schema) |
| `VITE_GOOGLE_CLIENT_ID` | optional | Google OAuth client ID for Bakjes' Calendar live sync (same ID Supabase Google auth uses) |
| `ANTHROPIC_API_KEY` | Vercel only (server) | used by `api/extract.ts`; never exposed to the client |

## Database setup

Run these in the Supabase SQL editor (idempotent), then expose the schemas
under Settings → API → Exposed schemas:

1. `migration/supabase_auth_setup.sql` — allow-list, profiles, signup gate, RLS.
2. `migration/workout_schema.sql` — `workout` schema (expose `workout`).
3. `migration/boodschappen_schema.sql` — `boodschappen` schema (expose `boodschappen`).
4. `migration/bakjes_schema.sql` — `bakjes` schema (expose `bakjes`).
