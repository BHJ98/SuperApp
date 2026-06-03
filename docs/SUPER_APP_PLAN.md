# Super-App Plan (prepared — not yet implemented)

> ⚠️ **See `docs/KICKOFF.md` for the authoritative, locked decisions and corrected facts.**
> Key corrections since this was written: there are only **2 Supabase projects** (Finance,
> Boodschappen); **Bakjesmethode is localhost-only with Google OAuth, not on Supabase**;
> the workout app **keeps the Me/Partner toggle**; **marblebag is ported in but gated**
> (hidden/password); the build happens in a **new repo seeded from proven components**.

## Goal

Collapse five personal/household apps into **one installable PWA** behind **one Google
login (allow-listed to a few accounts)**, backed by **one Supabase project** — getting
back onto the free tiers of both Vercel and Supabase.

Apps in scope (highlighted set):

| App | Needs backend | Current state |
| --- | --- | --- |
| WorkoutTracker | yes (sync planned) | local-only, this repo |
| Boodschappen (groceries) | yes | own Supabase project (no Google OAuth) |
| PersonalFinance1 | yes (shared between both of us) | own Supabase project (no Google OAuth) |
| Bakjesmethode | yes | **localhost only + Google OAuth — NOT on Supabase** |
| marblebag | yes, gated | port in behind hidden/password gate |

## Why this shape

- **Cost:** consolidate the 2 Supabase projects (Finance, Boodschappen) into 1 with a
  schema per app, and fold Bakjes (localhost) + marblebag + workout into the same project.
  Reuse one existing project as the host so you never exceed the 2-project free limit during
  migration. Vercel was never the limit (Hobby = unlimited, non-commercial), so the merge is
  about UX + a single auth, not Vercel cost.
- **PWA install:** one app = one service-worker scope = clean "Add to Home Screen" on both
  phones. Multiple PWAs under subpaths fight over scope — avoided entirely.
- **Auth:** always the same two people → one Google login + allow-list gates everything.

---

## Target architecture

### Frontend — one Vite + React PWA, one Vercel project

```
src/
  shell/            # the super-app frame
    Dashboard.tsx   # menu of apps
    AuthGate.tsx    # Google sign-in + allow-list check
    Nav.tsx
    pwa/            # single manifest + service worker for the whole origin
  lib/
    supabase.ts     # single shared client
    ui/             # shared Tailwind components (seeded from WorkoutTracker)
  apps/
    workout/        # ported from this repo (Repository pattern already fits)
    groceries/
    finance/
    bakjes/
    marblebag/      # may stay local-only
```

Routing (one origin, code-split per app with `React.lazy`):

```
/                → Dashboard (which app?)
/workout/*       /groceries/*       /finance/*       /bakjes/*       /marblebag/*
```

- **Monorepo not required** — a single Vite app with `apps/*` feature folders is simpler
  for apps this size. Revisit Turborepo only if build times or sharing demand it.
- WorkoutTracker's existing `Repository` interface + TanStack Query hooks become the
  template every app follows (swap `LocalRepository` for a Supabase adapter per schema).

### Backend — one Supabase project, schema per app

```
public      → profiles, allowed_emails        (shared)
workout     → exercises, routines, workouts, … (from this repo's schema)
boodschappen→ <imported from existing project>
finance     → <imported from existing project>  (shared between both users)
bakjes      → <imported from existing project>
```

- Expose the app schemas in **Settings → API → Exposed schemas** so PostgREST serves them.
- **RLS on every table**, keyed to the allow-list (and to `profile_id`/`user_id` where an
  app is per-person, e.g. workout). Shared apps (finance, groceries) are readable/writable
  by any allow-listed user.

### Auth — one Google OAuth + allow-list

- Reuse Bakjesmethode's existing Google Cloud OAuth credentials; set the **one** redirect
  URL to the super-app domain.
- `public.allowed_emails(email text primary key, label text)` — you, your girlfriend, etc.
- Two-layer gate:
  1. **Before-User-Created auth hook** rejects any sign-in whose email isn't allow-listed.
  2. **RLS** policies require `auth.jwt() ->> 'email' in (select email from allowed_emails)`
     — so even a stranger who somehow authenticates sees an empty, locked app.
- `profiles` rows link each allowed Google account to a display identity (replaces
  WorkoutTracker's password-less "Me / Partner" toggle once real login exists).

---

## Migration plan (per backend app)

For Boodschappen, Finance, Bakjes (data already backed up per `BACKUP_RUNBOOK.md`):

1. In the **target** project, create the app's schema: `create schema <app>;`
2. Restore that project's `schema.sql` **into the new schema** (namespace-adjust: the dumps
   are `public`-scoped, so either `set search_path` + sed the schema name, or restore to a
   temp project and `ALTER ... SET SCHEMA`). Document the exact rename step when we build it.
3. Load `data.sql`.
4. Re-create RLS policies against `allowed_emails` / `profiles`.
5. Migrate `auth.users` once into the target project (so existing logins/identities survive),
   then dedupe to the allow-listed accounts.
6. Point the app's frontend module at the single Supabase URL + anon key + its schema.
7. Verify row counts vs. the source before decommissioning the old project.

WorkoutTracker is greenfield server-side, so it just gets a fresh `workout` schema (the SQL
already exists in `supabase/migrations/0001_init.sql`) and a Supabase adapter swapped in
behind its `Repository` interface.

---

## Build order (when you give the go-ahead)

1. ✅ Back up all three Supabase projects + secrets (`BACKUP_RUNBOOK.md`).
2. Create the **one** target Supabase project; set up `allowed_emails`, Google OAuth,
   the auth hook, and `profiles`.
3. Scaffold the **shell** (AuthGate + Dashboard + shared UI), reusing WorkoutTracker's
   design system.
4. **Pilot: WorkoutTracker** — port it in as `apps/workout` with a Supabase adapter on the
   `workout` schema. Proves the shell + auth + per-app-schema pattern end-to-end.
5. Migrate Boodschappen → Finance → Bakjes one at a time, each: import schema/data, wire the
   frontend module, verify, then retire the old Supabase + Vercel project.
6. Decide marblebag (port or leave local-only).
7. Single Vercel deploy; install the PWA on both phones; confirm Google login + allow-list.

## Open decisions to settle before step 3

- Custom domain, or `something.vercel.app`? (One redirect URL either way.)
- Workout identity: switch the "Me / Partner" toggle to real per-account login, or keep it?
- marblebag: needs sync or stays local?
- Whether finance needs an extra lock (it's shared, but it's the sensitive one — e.g. a
  re-auth prompt before opening `/finance`).

## Cost outcome

- **Supabase:** 3 projects → **1** (free tier, 500 MB is ample for these).
- **Vercel:** 5 projects → **1** (free Hobby; stays free as long as it's non-commercial).
