# Super-App — Kickoff & Handoff

Authoritative starting point for the **new agent in the new repo**. Read this first;
`SUPER_APP_PLAN.md` has the fuller rationale, `BACKUP_RUNBOOK.md` has how backups were taken.

## Mission

Merge the owner's personal/household apps into **one installable PWA**, backed by **one
Supabase project**, behind **one Google login gated to a short allow-list of accounts**.
Outcome: back on the free tiers, one URL, one home-screen install on both phones.

---

## Locked decisions (from the owner — do not relitigate)

1. **New dedicated repo** (this one). Don't rebuild from scratch — **seed it from proven,
   already-working code**:
   - From **WorkoutTracker**: app shell, Tailwind design system, the `Repository` interface
     + TanStack Query setup, PWA manifest/service-worker config.
   - From **Bakjesmethode**: the **working Google OAuth integration** (login flow + token
     handling) as the reference for wiring auth. Reuse its **Google Cloud OAuth credentials**
     (same client ID/secret), just add the super-app's redirect URL.
2. **Supabase: reuse ONE existing project as the host** — do **not** create a new one. Move
   the host app's tables into a named schema, import the other app as a second schema. This
   stays within the 2-project free limit at every step.
3. **Workout app keeps the password-less Me/Partner toggle.** The hub's Google login handles
   *access control*; the toggle is just profile-switching inside the workout module.
4. **marblebag is ported in, but gated** — a hidden/unlisted menu entry plus a simple
   password prompt before it opens.

## Corrected facts (earlier drafts were wrong about these)

- **Only 2 Supabase projects exist:** Finance and Boodschappen. Both have data + RLS.
  **Neither has Google OAuth.**
- **Bakjesmethode is NOT on Supabase.** It runs on localhost with its own Google OAuth; its
  data lives locally (localStorage or a local DB).
  ⚠️ **VERIFY Bakjes' local data was actually exported** in the backups — the original
  `BACKUP_RUNBOOK.md` assumed Supabase and won't have covered a localhost store.
- Google OAuth lives in a **Google Cloud project** (created for Bakjes). Reuse it.

---

## Target architecture (short form)

**Frontend** — single Vite + React PWA, one Vercel project:

```
src/
  shell/        AuthGate · Dashboard (app menu) · Nav · pwa/ (one manifest + SW)
  lib/          supabase.ts (one client) · ui/ (shared components from WorkoutTracker)
  apps/
    workout/    groceries/  finance/  bakjes/  marblebag/
```
Routes (one origin, `React.lazy` per app): `/  /workout/*  /groceries/*  /finance/*
/bakjes/*  /marblebag/*`. `marblebag` route unlisted + password-gated.

**Backend** — one Supabase project (the reused host), schema per app:

```
public        profiles, allowed_emails           (shared)
workout       (fresh — keep Me/Partner via profile rows, not auth)
boodschappen  (imported)    finance (imported, shared)   bakjes (migrated from localhost)
marblebag     (gated)
```
Expose app schemas in Settings → API → Exposed schemas. **RLS on every table**, keyed to
`allowed_emails` (and to a profile/user id where an app is per-person).

**Auth** — Supabase **Google provider** using the existing Google Cloud credentials, plus:
- `public.allowed_emails(email pk, label)` — the few permitted accounts.
- A **Before-User-Created auth hook** that rejects any non-allow-listed email.
- RLS requiring `auth.jwt()->>'email'` ∈ `allowed_emails` → a stranger who signs in sees an
  empty, locked app.

---

## What the OWNER must provide to the new session

**Secrets — never commit; supply via the web environment's env vars / secrets:**
- `SUPABASE_URL` + anon key of the chosen **host** project
- Supabase **service_role** key (migration/admin scripts only; keep server-side)
- **Google OAuth client ID + secret** (from the Bakjes Google Cloud project)
- DB connection strings for **Finance** and **Boodschappen** (for the import step)

**Files to commit into the new repo (data-free, non-secret) so the agent can build schemas:**
- `migration/finance.schema.sql` — the `schema.sql` from backups (DDL only, **no data, no keys**)
- `migration/boodschappen.schema.sql`
- `migration/bakjes.*` — Bakjes has no SQL schema; provide its **local data shape** instead
  (the localStorage keys / JSON structure, or a local DB dump if it has one)
- The **WorkoutTracker** and **Bakjesmethode** source trees available on disk to copy the
  shell/design/auth components from (or point the agent at their repos)

---

## First tasks for the new agent (in order)

1. **Scaffold the shell** by copying from WorkoutTracker: AuthGate, Dashboard menu, Nav,
   shared UI, single Supabase client, PWA config.
2. **Wire Supabase Google Auth** on the host project using the existing Google Cloud creds;
   build `allowed_emails`, the Before-User-Created hook, and `profiles`; gate the whole app
   behind AuthGate.
3. **Pilot: port WorkoutTracker** as `apps/workout` against a fresh `workout` schema, keeping
   the Me/Partner toggle. Proves shell + auth + per-app-schema end-to-end.
4. **Consolidate the DB on the host project:** move the host app's tables into its named
   schema; import the other app's schema + data into its schema; recreate RLS keyed to
   `allowed_emails`. **Verify row counts vs backups before deleting anything.**
5. **Port Boodschappen and Finance** frontends as `apps/*` against their schemas.
6. **Port Bakjes:** create `bakjes` schema, migrate the localhost data in, port the frontend,
   reuse its Google flow via Supabase Auth. Then **port marblebag** behind its hidden +
   password gate.
7. **Decommission** the now-empty second Supabase project; single Vercel deploy; install the
   PWA on both phones; confirm Google login + allow-list + final row counts.

## Guardrails

- Never commit dumps, keys, or real finance data.
- Keep **both** existing Supabase projects intact until migration is verified end-to-end.
- Confirm row counts against the backups before deleting any source project.

## Still-open (sensible defaults if unanswered)

- Domain: default to `*.vercel.app` unless the owner wants a custom domain (one redirect URL
  either way).
- Which existing project is the **host** (Finance vs Boodschappen) — either works; pick one
  and document it. Finance is the shared/sensitive one if you want it as the primary.
- Optional extra lock on `/finance` (re-auth prompt) since it's the sensitive module.

---

## How to bootstrap the new repo + web session (owner)

1. Create the empty GitHub repo (e.g. `home-hub`).
2. Copy this `docs/` folder into it as the first commit (this file is the entry point).
3. Add the `migration/*.schema.sql` files and the secrets/env described above.
4. Point a new Claude-Code-on-web environment at the new repo, then tell the agent:
   *"Read docs/KICKOFF.md and start at task 1."*
