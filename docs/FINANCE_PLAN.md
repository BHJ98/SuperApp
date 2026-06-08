# Finance migration plan

How we move **PersonalFinance1** into SuperApp's `/finance` route without
losing data, without breaking the live finance app before its replacement is
ready, and without surprising you with edge cases at the worst time.

> **Status:** plan only — not yet implemented. Read through, push back where
> you disagree, and we'll execute together. None of the steps below run
> automatically.

---

## What makes this risky

Three things, in descending order of "would actually hurt":

1. **Real, irreplaceable data.** PersonalFinance1 holds your bank
   transactions, categories, budgets, savings goals. A botched migration =
   re-importing CSVs and re-categorizing months of transactions. So: backup
   first, dual-run during cutover, row-count + spot-check after.
2. **The live app shares this Supabase project.** PersonalFinance1's frontend
   (deployed separately at `personal-finance1-…vercel.app`) reads from
   `public`. The moment we move tables to a `finance` schema, that app starts
   throwing 4xx. So we either accept that downtime as the cutover, or run a
   compatibility shim (views in `public` that point at `finance`) during a
   transition window.
3. **Auth identity bridging.** Your PersonalFinance1 account is an
   email/password user in `auth.users`. Your SuperApp login uses Google. By
   default these are **two different rows** in `auth.users`, even with the
   same email. `profiles.id` (and every `household_id` derived from it) point
   at the old email/password user — so signing into SuperApp via Google would
   see "no household" and an empty finance app. We need to bridge identities
   before the cutover, not after.

Items 1 and 3 are the showstoppers. Item 2 is just operational.

---

## What we're not doing

To name risks explicitly:

- **Not migrating the data twice.** One careful cut, verified.
- **Not running both apps against the same tables long-term.** PersonalFinance1
  gets retired into SuperApp; that's the whole point of consolidation.
- **Not changing the data model during the migration.** The schema lands in
  `finance` exactly as it stands today (9 migrations' worth). Cleanups, if any,
  come later as their own change.
- **Not touching `public`'s auth tables** (`allowed_emails`, the SuperApp
  `profiles`, the hook). Finance's own `profiles` is a different concept —
  a household member, not the allow-list — and gets moved to `finance.profiles`
  to remove the name collision.

---

## Phase 0 — Pre-flight checks (you + me, ~15 min)

Before touching anything, we answer these:

- **Who's the existing user?** Query `auth.users` to find the row that owns
  your PersonalFinance1 data. Capture its `id`, `email`, `email_confirmed_at`.
- **Identity linking enabled?** Supabase → Authentication → Providers →
  "Allow account linking by email". If enabled, signing in with Google on an
  email that already has a verified email/password account links them into
  one user. If disabled, Google creates a second user — we'd see that as a
  separate row. *(This is the single setting that decides Phase 4's
  approach.)*
- **Household membership.** `select household_id, count(*) from profiles
  group by 1`. We expect 1 row (one household, your two profiles). Anything
  unexpected gets sorted before we move on.
- **Snapshot row counts** for every table we'll move (see Phase 3's checklist).
  These become the source of truth for Phase 5's verification.
- **Confirm Boodschappen is the project we'll decommission later** (KICKOFF
  task 7). It is — Finance/PersonalFinance1 is the host we're consolidating
  into.

I run the queries; you confirm the results look right.

---

## Phase 1 — Backup (irreversible operations need an undo button)

- **Logical backup via `pg_dump`** of every table, function, view, and policy
  in `public` that belongs to Finance (and only those — we don't touch the
  SuperApp auth/profiles/allow-list tables, which now live in `public` too).
- Stored locally on your machine, **not committed.** Plus a Supabase native
  Point-in-Time-Restore (PITR) checkpoint if your plan supports it.
- Independent CSV export of `accounts`, `transactions`, `categories`,
  `budgets`, `savings_goals` to a folder you keep — so even if the SQL backup
  is corrupt, the data is human-readable.

The backup is the rollback for everything that follows. We don't proceed past
this phase until I've confirmed the backup files restore cleanly into a scratch
database.

---

## Phase 2 — Build the new schema in parallel (zero impact on live app)

Reversible, can be redone any time:

- Generate `migration/finance_schema.sql` by reading all 9 PersonalFinance1
  migrations and emitting them as a single idempotent file targeted at a
  `finance` schema (not `public`).
- Strip `public.` references; rewrite RLS predicates that currently use
  Finance's own `get_user_household_id()` helper to use ours (`finance.
  get_user_household_id()` so the function lives in the schema too).
- Layer SuperApp's `is_allowed()` check on top — same belt-and-braces RLS as
  workout/boodschappen.
- Run the file. Schema and tables exist, empty. The live app still works.

At this point, we have **the destination ready and provably empty**. Nothing
has changed for users.

---

## Phase 3 — Port the frontend (in this repo, against staging data)

Mirrors how Boodschappen was ported. Largest single piece of work.

- Vendor PersonalFinance1's Next.js source under `src/apps/finance/` and
  adapt to Vite + React Router (drop `next/link`, `next/image`, server
  components, middleware, the `app/auth/*` flow we replace with our shell's
  AuthGate).
- Replace the app's two Supabase clients (`lib/supabase/client.ts`,
  `lib/supabase/server.ts`) with the shell's single client, schema-scoped to
  `finance`. Same pattern as `src/apps/groceries/lib/data.ts`.
- Rewire CSV import. The Rabobank parser is pure logic and copies verbatim.
- Charts (Recharts) get lazy-loaded the same way ProgressChart does in
  workout.
- Add tests around the pure logic: `lib/categories.ts`,
  `lib/csv/rabobank.ts`, `lib/report-helpers.ts`. These tests stay valid
  forever and are cheap insurance.
- Test against the new (empty) `finance` schema by manually inserting a few
  fake rows. Verify reads, writes, RLS denial of strangers.

Up to here, nothing touches your real data and the live app is unaffected.
This phase is also a natural stopping point for review before the cutover.

---

## Phase 4 — Bridge identities (the part most likely to bite us)

Two scenarios depending on Phase 0's findings.

**Scenario A — identity linking is enabled.** When you next sign in to
SuperApp with Google, Supabase matches by email and merges the providers on
your existing `auth.users` row. `profiles.id` stays the same, `household_id`
stays the same, all your data is reachable as-is. *Easy path.*

**Scenario B — identity linking is disabled (default), or your old email isn't
confirmed.** SuperApp's Google sign-in creates a **second** `auth.users` row.
We have to do one of:

- **B1: Enable linking and confirm the old email** *(recommended).* Toggle on
  account linking. Manually flag the old email/password user's
  `email_confirmed_at` as set. Sign in with Google → linking happens. Verify
  the resulting `auth.users.id` matches the original.
- **B2: Re-point the data to the new Google user.** Find the new Google
  `auth.users.id`. `UPDATE finance.profiles SET id = <new>` and any
  `created_by`/`user_id` foreign keys (saved_views, invites, etc). Delete the
  old user. *Riskier, more touch points, but doesn't require linking.*

Both options are done in one transaction, with the queries written out and
reviewed before we run them.

We do this **before** the cutover (Phase 5), so signing into SuperApp already
sees the household the moment finance schema is exposed.

---

## Phase 5 — The cutover

This is the only step with downtime for the standalone PersonalFinance1 app.
~10 minutes of unavailable, with a clean rollback at every step.

In Supabase SQL editor, in **one transaction**:

1. Verify Phase 0 row counts still match (no surprise writes since).
2. For each Finance table (`accounts`, `transactions`, `categories`,
   `categorization_rules`, `budgets`, `savings_goals`, `saved_views`,
   `households`, `invites`, `profiles`):
   - `ALTER TABLE public.<t> SET SCHEMA finance;`
   - Update any functions/views in `public` that referenced
     `public.<t>` to reference `finance.<t>` (the new schema file already
     handles fresh creates; ALTER preserves data).
3. Drop the empty Finance-shaped tables in `finance` that Phase 2 created (so
   the moved tables aren't shadowed). *Or:* truncate them and let the move
   overwrite. Cleaner is: build Phase 2's schema with `CREATE TABLE IF NOT
   EXISTS`, then move the populated `public` tables on top — that's the
   approach the plan uses.
4. Re-run RLS / `is_allowed()` policies against the moved tables. They were
   already in `public` form before the move; the ALTER carries them, but we
   add the `is_allowed()` layer.
5. Verify row counts table-by-table — must equal Phase 0 numbers exactly.
6. Expose `finance` under Settings → API → Exposed schemas.
7. Set Vercel env `VITE_FINANCE_LIVE=1` (or whatever flag we use) so the
   `/finance` route in SuperApp goes from "not yet wired" to live.
8. Smoke test: sign into SuperApp, open `/finance`, confirm your accounts and
   recent transactions look right. Spot-check a categorized total against
   what you see on the old app's last screenshot.

Only after step 8 passes do we accept the cutover as done. If anything looks
off:

- **Quick rollback:** `ALTER TABLE finance.<t> SET SCHEMA public;` reverses
  the move. Live app works again. We diagnose, fix, re-cut.
- **Worst-case rollback:** restore from the Phase 1 backup.

---

## Phase 6 — Decommission the old (only after we're sure)

We don't do this same-day. We give the new setup at least a week of normal
use first.

- Take down the `personal-finance1-…vercel.app` deployment.
- Archive the `BHJ98/PersonalFinance1` repo (or rename / make private).
- Drop the standalone Vercel project.
- Remove its env vars + the GitHub Actions auto-deploy workflow.
- Note in `docs/ACTION_ITEMS.md` that we've validated this so we don't
  re-check.

KICKOFF task 7 also calls for decommissioning the second **Supabase**
project — that's the Boodschappen one, not Finance. We're already
consolidating into Finance as the host.

---

## What I want your sign-off on before executing any of it

1. **Phase 4 scenario preference.** A or B1 or B2. Honest pick: A if available,
   B1 if not.
2. **Phase 5 cutover window.** Pick a time when neither of you is mid-import
   or mid-categorization. Friday evening / Saturday morning are usual choices.
3. **Whether to keep the old PersonalFinance1 deployment running in
   read-only** through cutover (we'd point it at a snapshot DB) — overkill for
   a household app, but possible. I lean against it.
4. **One last sanity check:** if there's a feature in PersonalFinance1 you
   haven't used yet but want before consolidating (e.g. an unfinished
   migration #10), we should know now. Re-doing schema changes after the
   cutover is annoying.

Reply with answers and I'll execute Phases 0–3 (everything that doesn't
touch live data) so we're ready to push the button on Phase 5 whenever you
say go.
