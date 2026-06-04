# Open action items

Running list of things we deliberately deferred. Check these off before
calling the project done.

## Security

- [ ] **Rotate the Google OAuth client secret.** The current secret for the
  shared Bakjes OAuth client (ID `615104272993-e9l0evjakimkr5ocnjo0gotukb89g8dk`)
  was exposed in a chat transcript during setup. After login is confirmed
  working end-to-end:
  1. Google Cloud Console → Bakjes project → APIs & Services → Credentials →
     the Web-application OAuth client → **Add secret**.
  2. Paste the new secret into Supabase → Finance project → Authentication →
     Providers → Google → **Client Secret (for OAuth)** → Save.
  3. Delete the old secret in Google Cloud.
  - Safe for Bakjesmethode: it uses only the *client ID* in the browser
    (implicit token flow) and never the secret, so rotating won't break it.

- [ ] **Move secrets out of the shared cloud-environment env box for prod.**
  The web environment's env vars are visible to anyone using the environment.
  The anon key is fine there; for the real Vercel deploy, set
  `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` as Vercel project env vars.
  Never put the service_role key or the Google client secret in either place.

## Migration / cleanup (from KICKOFF.md)

- [ ] Verify Bakjesmethode's localStorage/local data was actually captured in
  the backups before relying on it (KICKOFF.md flagged the runbook assumed
  Supabase).
- [ ] After full migration + row-count verification, decommission the
  now-empty second Supabase project (task 7).
- [ ] Once the app ports are done, remove the temporarily-vendored upstream
  source if any was copied in.
