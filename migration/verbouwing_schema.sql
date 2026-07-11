-- ============================================================================
-- Verbouwing schema — renovation expense tracking as a tag-layer on top of
-- the existing bank-synced public.transactions (no second bank sync).
--
-- Run in the Supabase SQL editor. Safe to re-run (idempotent).
-- Geef de query-tab de naam "verbouwing_schema" vóór het uitvoeren.
--
-- Na het draaien, eenmalig in het dashboard:
--   Settings -> API -> Exposed schemas -> voeg "verbouwing" toe.
--
-- Model:
--   rooms                  ruimtes en subdelen (parent_id), elk met optioneel
--                          eigen budget (ook subdelen, bijv. Woonkamer→Vloer)
--   expenses               één aankoop: gekoppeld aan een banktransactie
--                          (transaction_id, uniek) óf handmatig (null)
--   expense_parts          verdeling van een aankoop over ruimtes/subdelen;
--                          ongesplitst = precies 1 part met het volle bedrag
--   receipts               bonfoto's (meerdere per aankoop), in bucket "bonnen"
--   dismissed_transactions "beoordeeld: niet relevant" — inbox toont
--                          transacties die noch expense noch dismissed zijn
--   settings               singleton met het totaalbudget
--
-- public.transactions krijgt een is_verbouwing-vlag (bijgehouden door een
-- trigger op expenses) zodat Finance-rapportages goedkoop kunnen filteren,
-- naar het voorbeeld van is_transfer.
-- ============================================================================

create schema if not exists verbouwing;
grant usage on schema verbouwing to authenticated;

-- ---- tables ----

create table if not exists verbouwing.rooms (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  parent_id  uuid references verbouwing.rooms(id) on delete cascade,
  budget     numeric,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists verbouwing.expenses (
  id             uuid primary key default gen_random_uuid(),
  transaction_id uuid unique references public.transactions(id) on delete cascade,
  date           date not null,
  description    text not null default '',
  supplier       text,
  total_amount   numeric not null,
  created_at     timestamptz not null default now()
);

create table if not exists verbouwing.expense_parts (
  id         uuid primary key default gen_random_uuid(),
  expense_id uuid not null references verbouwing.expenses(id) on delete cascade,
  room_id    uuid not null references verbouwing.rooms(id) on delete restrict,
  amount     numeric not null,
  note       text
);

create table if not exists verbouwing.receipts (
  id           uuid primary key default gen_random_uuid(),
  expense_id   uuid not null references verbouwing.expenses(id) on delete cascade,
  storage_path text not null,
  created_at   timestamptz not null default now()
);

create table if not exists verbouwing.dismissed_transactions (
  transaction_id uuid primary key references public.transactions(id) on delete cascade,
  dismissed_at   timestamptz not null default now()
);

create table if not exists verbouwing.settings (
  id           int primary key default 1 check (id = 1),
  total_budget numeric
);
insert into verbouwing.settings (id) values (1) on conflict do nothing;

create index if not exists idx_vb_parts_expense on verbouwing.expense_parts(expense_id);
create index if not exists idx_vb_parts_room on verbouwing.expense_parts(room_id);
create index if not exists idx_vb_receipts_expense on verbouwing.receipts(expense_id);

-- ---- RLS: household-shared via the allow-list ----
do $$
declare t text;
begin
  foreach t in array array['rooms','expenses','expense_parts','receipts','dismissed_transactions','settings']
  loop
    execute format('alter table verbouwing.%I enable row level security;', t);
    execute format('drop policy if exists allow_listed on verbouwing.%I;', t);
    execute format(
      'create policy allow_listed on verbouwing.%I for all to authenticated using (public.is_allowed()) with check (public.is_allowed());',
      t
    );
    execute format('grant select, insert, update, delete on verbouwing.%I to authenticated;', t);
  end loop;
end $$;

-- ---- is_verbouwing flag on public.transactions, kept by trigger ----

alter table public.transactions
  add column if not exists is_verbouwing boolean not null default false;

create or replace function verbouwing.sync_transaction_flag()
returns trigger
language plpgsql
security definer
set search_path = public, verbouwing
as $$
begin
  if tg_op = 'INSERT' then
    if new.transaction_id is not null then
      update public.transactions set is_verbouwing = true where id = new.transaction_id;
    end if;
    return new;
  elsif tg_op = 'DELETE' then
    if old.transaction_id is not null then
      update public.transactions set is_verbouwing = false where id = old.transaction_id;
    end if;
    return old;
  elsif tg_op = 'UPDATE' then
    if old.transaction_id is distinct from new.transaction_id then
      if old.transaction_id is not null then
        update public.transactions set is_verbouwing = false where id = old.transaction_id;
      end if;
      if new.transaction_id is not null then
        update public.transactions set is_verbouwing = true where id = new.transaction_id;
      end if;
    end if;
    return new;
  end if;
  return null;
end;
$$;

drop trigger if exists trg_vb_sync_flag on verbouwing.expenses;
create trigger trg_vb_sync_flag
  after insert or update or delete on verbouwing.expenses
  for each row execute function verbouwing.sync_transaction_flag();

-- ---- Realtime ----
do $$
declare t text;
begin
  foreach t in array array['rooms','expenses','expense_parts','receipts','dismissed_transactions']
  loop
    execute format('alter table verbouwing.%I replica identity full;', t);
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'verbouwing' and tablename = t
    ) then
      execute format('alter publication supabase_realtime add table verbouwing.%I;', t);
    end if;
  end loop;
end $$;

-- ---- Storage: private bucket "bonnen" for receipt photos ----

insert into storage.buckets (id, name, public)
values ('bonnen', 'bonnen', false)
on conflict (id) do nothing;

drop policy if exists bonnen_select on storage.objects;
create policy bonnen_select on storage.objects
  for select to authenticated
  using (bucket_id = 'bonnen' and public.is_allowed());

drop policy if exists bonnen_insert on storage.objects;
create policy bonnen_insert on storage.objects
  for insert to authenticated
  with check (bucket_id = 'bonnen' and public.is_allowed());

drop policy if exists bonnen_delete on storage.objects;
create policy bonnen_delete on storage.objects
  for delete to authenticated
  using (bucket_id = 'bonnen' and public.is_allowed());

-- ---- Seed: starter rooms + sub-parts (guarded, fully editable in-app) ----

do $$
declare
  ruimte text;
  ruimtes text[] := array['Keuken','Badkamer','Toilet','Woonkamer','Slaapkamer','Zolder','Hal & Trap','Buiten & Tuin','Algemeen'];
  i int := 0;
begin
  foreach ruimte in array ruimtes loop
    i := i + 10;
    if not exists (select 1 from verbouwing.rooms where name = ruimte and parent_id is null) then
      insert into verbouwing.rooms (name, sort_order) values (ruimte, i);
    end if;
  end loop;

  -- A few example sub-parts under Algemeen so the two-level pattern is visible
  if not exists (
    select 1 from verbouwing.rooms sub
    join verbouwing.rooms parent on sub.parent_id = parent.id
    where parent.name = 'Algemeen'
  ) then
    insert into verbouwing.rooms (name, parent_id, sort_order)
    select v.naam, r.id, v.volgorde
    from (values ('Gereedschap', 10), ('Container & Afvoer', 20), ('Vergunningen', 30)) as v(naam, volgorde)
    cross join (select id from verbouwing.rooms where name = 'Algemeen' and parent_id is null limit 1) r;
  end if;
end $$;
