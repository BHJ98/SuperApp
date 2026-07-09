-- ============================================================================
-- Finance: bank_connections — GoCardless Open Banking integration
-- Run in the Supabase SQL editor (same project as the Finance tables).
-- Safe to re-run (idempotent).
--
-- After running:
--   1. Deploy the three Supabase Edge Functions (see supabase/functions/).
--   2. Set secrets in Supabase: GOCARDLESS_SECRET_ID, GOCARDLESS_SECRET_KEY
--      Dashboard → Edge Functions → Manage secrets
--      or: supabase secrets set GOCARDLESS_SECRET_ID=xxx GOCARDLESS_SECRET_KEY=xxx
-- ============================================================================

create table if not exists public.bank_connections (
  id                    uuid primary key default gen_random_uuid(),
  household_id          uuid not null references public.households(id) on delete cascade,
  account_id            uuid references public.accounts(id) on delete set null,
  requisition_id        text not null unique,
  gocardless_account_id text,
  institution_id        text not null,
  institution_name      text not null,
  institution_logo      text,
  iban                  text,
  status                text not null default 'pending'
                          check (status in ('pending','active','expired','error')),
  last_synced_at        timestamptz,
  created_at            timestamptz not null default now()
);

alter table public.bank_connections enable row level security;

drop policy if exists household_members on public.bank_connections;
create policy household_members on public.bank_connections
  for all to authenticated
  using (
    household_id in (
      select household_id from public.profiles where id = auth.uid()
    )
  )
  with check (
    household_id in (
      select household_id from public.profiles where id = auth.uid()
    )
  );

grant select, insert, update, delete on public.bank_connections to authenticated;
