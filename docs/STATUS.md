# Super-App — Project status

Living progress log. Update as we move through KICKOFF.md tasks.

## Tasks 1–3 ✅ done

- **Task 1 — Shell.** Vite + React + Tailwind + PWA shell on
  `claude/happy-noether-LeOpf`. `src/shell/{App,AuthGate,Nav,Dashboard}.tsx`
  + `src/lib/{supabase,auth}.ts` + placeholders for each app under
  `src/apps/{workout,groceries,finance,bakjes,marblebag}/`.
- **Task 2 — Auth (host project: PersonalFinance1, `gbmioirxxsrvxnitxxso`).**
  SQL ran (`migration/supabase_auth_setup.sql`): `allowed_emails`, `profiles`,
  `before_user_created` hook, `is_allowed()` predicate, RLS. Hook is enabled.
  Google provider enabled with the Bakjes OAuth client. Vercel deploy lives at
  the `super-app` project under `bhj98's projects`.
- **Task 3 — Workout port.** WorkoutTracker source vendored under
  `src/apps/workout/`, routes rewritten under `/workout/*`, internal session
  page at `/workout/session/:id` (avoids collision with the mount). Backed by
  `LocalRepository` (IndexedDB, store `superapp-workout`). Me/Partner toggle
  kept as a sub-header inside the workout module. Profile storage key
  namespaced to `superapp.workout.activeProfileId`.

## Last-mile fix before task 4 (start here tomorrow)

After signing in, Supabase redirects to its configured **Site URL**, which is
still **PersonalFinance1's** Vercel URL — so the user lands on the old finance
app instead of SuperApp. Google OAuth itself succeeded (session was issued —
seen in the URL fragment `#access_token=…`). Two-minute fix:

SuperApp Vercel URL (confirmed): **https://super-app-omega-hazel.vercel.app**

1. Supabase → PersonalFinance1 → **Authentication → URL Configuration**:
   - **Site URL:** `https://super-app-omega-hazel.vercel.app`
   - **Redirect URLs (add both):**
     - `https://super-app-omega-hazel.vercel.app/**`
     - `http://localhost:5173/**`
   - Save.
2. Open https://super-app-omega-hazel.vercel.app → Sign in with Google →
   should land on the SuperApp dashboard.
3. Verify the gate: sign out, try a non-allow-listed Google account → should
   land on the new **"No access"** screen.

Note: changing the Site URL will redirect any future PersonalFinance1
standalone logins to SuperApp instead. That's intended — PersonalFinance1 is
being retired into SuperApp anyway.

When (3) and (4) work, task 2's verification is done.

## Tasks 4–7 ⏳ pending

- **Task 4 — Consolidate the DB on the host project.** Plan (deferred until
  task 2 is verified):
  - Create fresh `workout` and `boodschappen` schemas (zero data risk; both
    will be recreated from scratch). SQL is ready to write.
  - **Defer Finance's `public` → `finance` schema move** until the finance
    frontend port lands in task 5, doing it as one verified cut with row-count
    checks. Moving the tables now would break the live PersonalFinance1 app
    before its replacement is ready.
  - Expose `workout, boodschappen, finance` in Settings → API → Exposed schemas.
- **Task 5 — Port Boodschappen + Finance frontends.** Both are Next.js
  upstream; they'll be converted to Vite + React Router routes inside the
  shared shell. Boodschappen is a fresh recreation (no data migration).
- **Task 6 — Port Bakjes + marblebag.** Bakjes data is in localhost
  (localStorage / IndexedDB); needs a one-shot importer. Marblebag goes behind
  the existing password gate (`VITE_MARBLEBAG_PASSWORD`).
- **Task 7 — Decommission second Supabase project, install PWA on both
  phones, verify final row counts.**

## Open action items

See [`ACTION_ITEMS.md`](./ACTION_ITEMS.md). The big one is rotating the Google
OAuth client secret (exposed in chat during setup).

## Source repos (public for porting)

- `BHJ98/WorkoutTracker` — task 3 source ✅ cloned & ported.
- `BHJ98/Boodschappen` — task 5 input (schema in `supabase-schema.sql`).
- `BHJ98/PersonalFinance1` — task 5 input (9 migration files in `supabase/migrations/`).
- `BHJ98/Bakjesmethode` — task 6 input (localStorage-based, no SQL schema).
- `BHJ98/marblebag` — task 6 input.

These are kept public so cloning works between sessions. Once all ports land
they can go private again.
