-- ============================================================================
-- Marblebag schema — migrate "The Bag" off Firebase onto the shared Supabase.
-- Run in the HOST (PersonalFinance1 / gbmioirxxsrvxnitxxso) project SQL editor.
-- Safe to re-run (idempotent).
--
-- The app stores its whole state as one JSON blob that syncs live across
-- devices (it was a single Firebase Realtime Database node). The faithful
-- equivalent is ONE shared row holding jsonb, gated by the allow-list via
-- public.is_allowed(), with Realtime turned on for cross-device sync.
--
-- After running, two one-time dashboard steps:
--   1. Settings -> API -> Exposed schemas -> add "marblebag".
--   2. (Realtime is enabled below via the publication; no extra clicks.)
-- ============================================================================

create schema if not exists marblebag;
grant usage on schema marblebag to authenticated;

-- Single shared state row. id is always 1 (singleton), data holds the blob.
create table if not exists marblebag.state (
  id         int primary key default 1,
  data       jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  constraint marblebag_state_singleton check (id = 1)
);

-- ---- RLS: any allow-listed signed-in account shares the single row ----
alter table marblebag.state enable row level security;
drop policy if exists allow_listed on marblebag.state;
create policy allow_listed on marblebag.state
  for all to authenticated
  using (public.is_allowed()) with check (public.is_allowed());

grant select, insert, update, delete on marblebag.state to authenticated;

-- ---- Realtime: full row images so UPDATE payloads carry the new data, and
--      add the table to the realtime publication (guarded for re-runs) ----
alter table marblebag.state replica identity full;
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'marblebag'
      and tablename = 'state'
  ) then
    alter publication supabase_realtime add table marblebag.state;
  end if;
end $$;

-- No seed: the user imports their existing data through the app's Import
-- button, so the (very personal) blob never has to live in this file.
