# Backup Runbook — do this BEFORE any consolidation

Goal: pull a complete, restorable backup of all data + config from each app so the
super-app migration can never lose anything. Your **code** is already safe on GitHub;
this is about the **databases, auth users, storage, and secrets**.

Apps with their own Supabase project (3 separate projects → this is what exceeds the
free 2-project limit):

- PersonalFinance1
- Boodschappen
- Bakjesmethode (also has Google OAuth)

WorkoutTracker is local-only today (data lives in each browser), so nothing to back up
server-side yet.

---

## 0. Prerequisites (once)

Install a Postgres 17 client (matches Supabase) and the Supabase CLI:

```bash
# macOS
brew install postgresql@17 supabase/tap/supabase
# the pg_dump you call must be >= the server's major version
pg_dump --version
```

---

## 1. For EACH Supabase project, grab the connection string

Supabase Dashboard → your project → **Project Settings → Database → Connection string →
URI**. Use the **Direct connection** (port 5432). It looks like:

```
postgresql://postgres:[YOUR-PASSWORD]@db.<project-ref>.supabase.co:5432/postgres
```

(If direct connection is disabled/IPv4-gated, use the **Session pooler** URI instead —
also fine for dumps.)

Export it so the commands below are copy-paste:

```bash
export DBURL="postgresql://postgres:PASSWORD@db.REF.supabase.co:5432/postgres"
export APP="finance"   # change per project: finance | boodschappen | bakjes
```

## 2. Logical backup (the official, migration-ready set)

This produces three SQL files per project — the exact inputs a clean re-import wants:

```bash
mkdir -p backups/$APP

# Custom roles/grants
supabase db dump --db-url "$DBURL" -f backups/$APP/roles.sql --role-only
# Schema (tables, RLS policies, functions, triggers)
supabase db dump --db-url "$DBURL" -f backups/$APP/schema.sql
# Data only
supabase db dump --db-url "$DBURL" -f backups/$APP/data.sql --data-only
```

## 3. Belt-and-braces binary backup (whole DB, restorable as one file)

Captures everything including the `auth` schema (your Google-OAuth users in
`auth.users` / `auth.identities`) so logins can be preserved later:

```bash
pg_dump "$DBURL" \
  --schema=public --schema=auth --schema=storage \
  --no-owner --no-privileges -Fc \
  -f backups/$APP/${APP}_full.dump
```

> If you created custom schemas, add `--schema=<name>` for each. `-Fc` is the compressed,
> selectively-restorable custom format (`pg_restore` reads it).

## 4. Storage files (only if the app uses Supabase Storage)

Dashboard → **Storage**. If there are buckets with files, download them (small apps:
just download from the UI; many files: use `rclone`/`s3` against the storage endpoint).
Note bucket names + public/private settings.

## 5. Secrets & config to write down (per project)

- **API keys:** Settings → API → `Project URL`, `anon` key, `service_role` key.
- **Auth providers:** Authentication → Providers → **Google**: note the Client ID and
  Client Secret, and the **Authorized redirect URI** currently configured. (These come
  from your Google Cloud OAuth credentials — note that project too.)
- **Auth settings:** Site URL, redirect allow-list, any email templates.
- **Edge Functions:** if any, make sure their source is committed to GitHub.

## 6. Verify the backups are real

```bash
# schema/data files should be non-empty and end cleanly
tail -n 3 backups/finance/schema.sql
# the binary dump should list a table of contents
pg_restore --list backups/finance/finance_full.dump | head
```

Then store the `backups/` folder somewhere durable (encrypted cloud drive / password
manager for the secrets). **Do not commit dumps or keys to git.**

---

## Checklist

- [ ] Finance: roles.sql + schema.sql + data.sql + full.dump + keys noted
- [ ] Boodschappen: roles.sql + schema.sql + data.sql + full.dump + keys noted
- [ ] Bakjesmethode: roles.sql + schema.sql + data.sql + full.dump + Google OAuth creds noted
- [ ] Storage files downloaded (if any)
- [ ] All three `pg_restore --list` checks pass
- [ ] Backups stored off the ephemeral environment

Once these are green, we proceed to the super-app build in `SUPER_APP_PLAN.md`.
