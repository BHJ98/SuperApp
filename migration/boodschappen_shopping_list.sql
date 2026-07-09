-- ============================================================================
-- Boodschappen: persistent, shared, realtime shopping list
-- Run in the Supabase SQL editor. Safe to re-run (idempotent).
--
-- The shopping list previously existed only as ephemeral local React state —
-- checked/removed items and ad-hoc (non-recipe) items were never saved
-- anywhere, so a page reload wiped everything and the two household members
-- never saw each other's changes while shopping together.
--
-- This table is SHARED (any allow-listed user can read/write, like recipes),
-- not per-user like favorites/meal_plans, since the whole point is that both
-- partners see the same live list.
--
-- After running:
--   Realtime is enabled below via the publication; no extra dashboard clicks
--   needed (the schema itself is already exposed from the original
--   boodschappen_schema.sql migration).
-- ============================================================================

create table if not exists boodschappen.shopping_list_items (
  item_key   text primary key,
  kind       text not null check (kind in ('recipe', 'manual')),
  recipe_id  uuid references boodschappen.recipes(id) on delete cascade,
  label      text,
  checked    boolean not null default false,
  removed    boolean not null default false,
  created_at timestamptz not null default now()
);

alter table boodschappen.shopping_list_items enable row level security;

drop policy if exists shopping_list_items_shared on boodschappen.shopping_list_items;
create policy shopping_list_items_shared on boodschappen.shopping_list_items
  for all to authenticated
  using (public.is_allowed())
  with check (public.is_allowed());

grant select, insert, update, delete on boodschappen.shopping_list_items to authenticated;

-- ---- Realtime: full row images, add to the publication (guarded for re-runs) ----
alter table boodschappen.shopping_list_items replica identity full;
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'boodschappen'
      and tablename = 'shopping_list_items'
  ) then
    alter publication supabase_realtime add table boodschappen.shopping_list_items;
  end if;
end $$;
