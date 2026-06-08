-- ============================================================================
-- Task 6 — Bakjes schema (jsonb-per-user, no normalization)
-- Run in the HOST (PersonalFinance1) project SQL editor. Idempotent.
--
-- Bakjes was originally a localhost app with a single AppData blob (bakjes,
-- regels, assignments, reflecties, intakes, instellingen) synced to Google
-- Drive. We mirror that here as one JSONB row per user — keeps the migration
-- trivial (drop the user's backup JSON into `app_data` and we're done) and
-- preserves easy round-trip backup/restore.
--
-- Calendar events (potentially thousands of rows, regenerable from ICS) stay
-- in browser IndexedDB. They aren't backup-worthy.
--
-- After running, expose the schema:
--   Settings -> API -> Exposed schemas -> add "bakjes".
-- ============================================================================

create schema if not exists bakjes;
grant usage on schema bakjes to authenticated;

create table if not exists bakjes.app_data (
  user_id uuid primary key references auth.users(id) on delete cascade,
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

create or replace function bakjes.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists app_data_touch on bakjes.app_data;
create trigger app_data_touch before update on bakjes.app_data
  for each row execute function bakjes.touch_updated_at();

-- ---- RLS: per-user, allow-listed ----
alter table bakjes.app_data enable row level security;
grant select, insert, update, delete on bakjes.app_data to authenticated;

drop policy if exists app_data_self on bakjes.app_data;
create policy app_data_self on bakjes.app_data
  for all to authenticated
  using (public.is_allowed() and auth.uid() = user_id)
  with check (public.is_allowed() and auth.uid() = user_id);
