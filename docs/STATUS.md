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
- **Bakjes port** (task 6, frontend) — `src/apps/bakjes/`: Dashboard, Bakjes,
  Regels, Inventariseren, Instellingen. Persisted as one JSONB row per user
  in the `bakjes` schema (mirrors the original AppData blob — your backup
  JSON imports as-is via Instellingen → "Upload backup"). Calendar events
  stay in IndexedDB (regenerable from ICS). **Dropped this round:** Google
  Drive sync (Supabase replaces it) and Google Calendar API live sync (use
  the ICS upload path instead). The Bakjes-specific OAuth flow is gone —
  login is the shell's regular Supabase session.
- **Finance plan** — `docs/FINANCE_PLAN.md`. Decisions needed from you on
  Phase 4 (identity bridging) and Phase 5 (cutover window) before I touch any
  Finance data. The plan is "review and push back," not "go execute."

Build is green; `npm run lint` and **57 vitest tests pass** (workout
progression engine + Boodschappen scaling + Bakjes percentages/targets/
rules/CSV export/ical expand/backup roundtrip); dev server boots and every
app module transforms cleanly. Vendor split: react + supabase load eagerly
(~108 KB gz total); each app is a lazy chunk.

## Needs YOU before the new code goes live (do these tomorrow)

Run in the Supabase SQL editor (PersonalFinance1 project), then expose schemas
under **Settings → API → Exposed schemas**:

1. `migration/workout_schema.sql` → then expose **`workout`**.
2. `migration/boodschappen_schema.sql` → then expose **`boodschappen`**.
3. `migration/bakjes_schema.sql` → then expose **`bakjes`**.

Then in SuperApp → `/bakjes/instellingen` → **Upload backup**, drop in your
Bakjesmethode backup JSON. It restores into `bakjes.app_data` as one row.

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

- **Task 5 — Finance frontend.** Plan written in `docs/FINANCE_PLAN.md`. NOT
  started — needs your sign-off on Phase 4 (identity bridging) and Phase 5
  (cutover window) first.
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
