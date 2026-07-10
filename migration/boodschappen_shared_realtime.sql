-- ============================================================================
-- Boodschappen: household-shared meal plans + favorites, realtime for
-- recipes / meal_plans / favorites
--
-- Run in the Supabase SQL editor. Safe to re-run (idempotent).
-- Geef de query-tab in de SQL editor de naam "boodschappen_shared_realtime"
-- vóór het uitvoeren (zelfde naam als dit bestand, zonder .sql).
--
-- What this does and why:
--   1. meal_plans was per-user (policy meal_plans_self from
--      boodschappen_schema.sql), so each partner had their own week plan.
--      It becomes household-shared: any allow-listed user can read/write
--      every row (policy meal_plans_shared), giving both partners ONE week
--      plan. The unique key changes from (user_id, recipe_id, date) to
--      (recipe_id, date) — a meal on a day exists once for the household.
--      Existing duplicate (recipe_id, date) rows are deduped first, keeping
--      the oldest row.
--   2. favorites likewise becomes household-shared (favorites_shared
--      replaces favorites_self). The primary key (user_id, recipe_id) stays,
--      so we keep track of who favorited; the client treats the union as
--      "our favorites".
--   3. recipes, meal_plans and favorites get replica identity full and are
--      added to the supabase_realtime publication so the client can
--      subscribe to live changes (same pattern as
--      boodschappen_shopping_list.sql).
-- ============================================================================

-- ---- 1. meal_plans: household-shared ----

drop policy if exists meal_plans_self on boodschappen.meal_plans;
drop policy if exists meal_plans_shared on boodschappen.meal_plans;
create policy meal_plans_shared on boodschappen.meal_plans
  for all to authenticated
  using (public.is_allowed())
  with check (public.is_allowed());

-- Dedupe rows sharing (recipe_id, date), keeping the oldest, before the
-- household-wide unique constraint can be added.
delete from boodschappen.meal_plans
where id in (
  select id from (
    select id,
           row_number() over (
             partition by recipe_id, date
             order by created_at asc, id asc
           ) as rn
    from boodschappen.meal_plans
  ) ranked
  where ranked.rn > 1
);

-- Swap the per-user unique constraint for a household-wide one.
alter table boodschappen.meal_plans
  drop constraint if exists meal_plans_user_id_recipe_id_date_key;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'boodschappen.meal_plans'::regclass
      and conname = 'meal_plans_recipe_id_date_key'
  ) then
    alter table boodschappen.meal_plans
      add constraint meal_plans_recipe_id_date_key unique (recipe_id, date);
  end if;
end $$;

-- ---- 2. favorites: household-shared (PK (user_id, recipe_id) stays) ----

drop policy if exists favorites_self on boodschappen.favorites;
drop policy if exists favorites_shared on boodschappen.favorites;
create policy favorites_shared on boodschappen.favorites
  for all to authenticated
  using (public.is_allowed())
  with check (public.is_allowed());

-- ---- 3. Realtime: full row images + add to the publication (guarded) ----

alter table boodschappen.recipes replica identity full;
alter table boodschappen.meal_plans replica identity full;
alter table boodschappen.favorites replica identity full;

do $$
declare t text;
begin
  foreach t in array array['recipes', 'meal_plans', 'favorites']
  loop
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'boodschappen'
        and tablename = t
    ) then
      execute format('alter publication supabase_realtime add table boodschappen.%I;', t);
    end if;
  end loop;
end $$;
