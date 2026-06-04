# Super-App — Project status

Living progress log. Update as we move through KICKOFF.md tasks.

## Done ✅

- **Task 1 — Shell.** Vite + React + Tailwind + PWA. `src/shell/{App,AuthGate,
  Nav,Dashboard}.tsx`, `src/lib/{supabase,auth}.ts`, lazy routes per app.
- **Task 2 — Auth (host project PersonalFinance1, `gbmioirxxsrvxnitxxso`).**
  `migration/supabase_auth_setup.sql` applied; Google provider on; Before-User-
  Created hook ENABLED; RLS via `public.is_allowed()`. **Login verified end to
  end** at https://super-app-omega-hazel.vercel.app (lands on the dashboard;
  signed-in email + Sign out shown in the nav; non-allow-listed accounts hit a
  "No access" screen).
- **Task 3 — Workout port.** Full WorkoutTracker app under `src/apps/workout/`,
  routes under `/workout/*`, Me/Partner toggle kept. IndexedDB backend by
  default; a Supabase backend now also exists (see below).
- **marblebag** (part of task 6) — ported under `src/apps/marblebag/`, unlisted
  + session-password gated, keeps its own Firebase backend. Lazy-loaded.
- **Boodschappen port** (task 5, frontend) — `src/apps/groceries/`: recipes,
  week planner, shopping list. Wired to the shared session + a `boodschappen`
  schema. Recipe-URL extraction runs via `api/extract.ts` (Vercel function).

Build is green; `npm run lint` and the 11 vitest tests pass; dev server boots
and every app module transforms cleanly. Vendor split: react + supabase load
eagerly (~108 KB gz total); each app is a lazy chunk.

## Needs YOU before the new code goes live (do these tomorrow)

Run in the Supabase SQL editor (PersonalFinance1 project), then expose schemas
under **Settings → API → Exposed schemas**:

1. `migration/workout_schema.sql` → then expose **`workout`**.
2. `migration/boodschappen_schema.sql` → then expose **`boodschappen`**.

In **Vercel** (super-app project → Settings → Environment Variables):

3. Add `ANTHROPIC_API_KEY` (server-side; for recipe extraction). Get one at
   console.anthropic.com. Mark it for Production. Do NOT prefix with VITE_.
4. (Optional) Add `VITE_WORKOUT_CLOUD=1` to switch the workout app from per-
   device IndexedDB to the shared Supabase backend. Only after step 1. Without
   it, workout stays local-only (each phone separate) — which still works.
5. (Optional) Add `VITE_MARBLEBAG_PASSWORD=<something>` to set the marblebag
   gate password (otherwise it can't be unlocked).

Then **redeploy** (Deployments → ⋮ → Redeploy) so env + the new branch build
are picked up. Note: production deploys from `main`; tonight's work is on
`claude/happy-noether-LeOpf`. Merge it to `main` (fast-forward) or point Vercel
at the branch to test first.

### Test checklist after the above
- Groceries: paste a normal recipe URL → it extracts + saves; planner + list work.
- Workout (if cloud enabled): log a set on one device, see it on the other.
- marblebag: open `/marblebag`, enter the password, the bag loads.

## Pending ⏳

- **Task 5 — Finance frontend.** NOT started. This is the sensitive one (real
  data, 9 migrations, currently-live PersonalFinance1 app). Needs a real plan
  with you before touching: it requires moving Finance's `public` tables into a
  `finance` schema as one coordinated cut (the standalone app breaks until the
  port points at the new schema), with row-count verification. Do this last.
- **Task 6 — Bakjes.** Its data is in localhost (localStorage/IndexedDB); needs
  a one-shot importer you run in your browser, then a frontend port. marblebag
  (the other half of task 6) is already done.
- **Task 7 — Decommission the second Supabase project (Boodschappen), confirm
  final row counts, install the PWA on both phones.**

## Decisions / notes

- marblebag keeps Firebase (KICKOFF only requires it ported + gated, not
  migrated). Its Firebase web config is committed (client-side, not secret).
- Boodschappen's social-media (Instagram/TikTok) recipe import is dropped —
  it relied on yt-dlp + Whisper, which can't run on Vercel. Normal recipe
  sites work via `api/extract.ts`.
- Workout Supabase backend is opt-in (`VITE_WORKOUT_CLOUD`) and unverified
  against a live schema — switch on only after running the schema.

## Open action items

See [`ACTION_ITEMS.md`](./ACTION_ITEMS.md) — notably rotating the Google OAuth
client secret (exposed in chat during setup).

## Source repos (kept public for porting; re-private after all ports land)

- `BHJ98/WorkoutTracker` — ported ✅
- `BHJ98/Boodschappen` — frontend ported ✅ (schema = `boodschappen`)
- `BHJ98/marblebag` — ported ✅
- `BHJ98/PersonalFinance1` — task 5 (9 migrations under `supabase/migrations/`)
- `BHJ98/Bakjesmethode` — task 6 (localStorage-based, no SQL schema)
