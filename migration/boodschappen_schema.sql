-- ============================================================================
-- Task 4/5 — Boodschappen schema (fresh; recreated from git, no data migration)
-- Run in the HOST (PersonalFinance1) project SQL editor. Idempotent.
--
-- Recipes are SHARED across allow-listed users (household); favorites and
-- meal_plans are per-user. Access gated by public.is_allowed() (from
-- supabase_auth_setup.sql).
--
-- After running, expose the schema:
--   Settings -> API -> Exposed schemas -> add "boodschappen".
-- ============================================================================

create schema if not exists boodschappen;
grant usage on schema boodschappen to authenticated;

create table if not exists boodschappen.recipes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  servings integer,
  ingredients jsonb not null default '[]',
  instructions text[] not null default '{}',
  source_url text,
  created_at timestamptz not null default now()
);

create table if not exists boodschappen.favorites (
  user_id uuid not null references auth.users(id) on delete cascade,
  recipe_id uuid not null references boodschappen.recipes(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, recipe_id)
);

create table if not exists boodschappen.meal_plans (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  recipe_id uuid not null references boodschappen.recipes(id) on delete cascade,
  date date not null,
  servings integer not null default 4,
  created_at timestamptz not null default now(),
  unique (user_id, recipe_id, date)
);

create index if not exists idx_b_recipes_user on boodschappen.recipes(user_id);
create index if not exists idx_b_meal_plans_user on boodschappen.meal_plans(user_id);

-- ---- RLS ----
alter table boodschappen.recipes enable row level security;
alter table boodschappen.favorites enable row level security;
alter table boodschappen.meal_plans enable row level security;

grant select, insert, update, delete on boodschappen.recipes to authenticated;
grant select, insert, update, delete on boodschappen.favorites to authenticated;
grant select, insert, update, delete on boodschappen.meal_plans to authenticated;

-- Recipes: any allow-listed user can read; only the owner can write.
drop policy if exists recipes_read on boodschappen.recipes;
create policy recipes_read on boodschappen.recipes
  for select to authenticated using (public.is_allowed());

drop policy if exists recipes_insert on boodschappen.recipes;
create policy recipes_insert on boodschappen.recipes
  for insert to authenticated with check (public.is_allowed() and auth.uid() = user_id);

drop policy if exists recipes_update on boodschappen.recipes;
create policy recipes_update on boodschappen.recipes
  for update to authenticated using (public.is_allowed() and auth.uid() = user_id);

drop policy if exists recipes_delete on boodschappen.recipes;
create policy recipes_delete on boodschappen.recipes
  for delete to authenticated using (public.is_allowed() and auth.uid() = user_id);

-- Favorites + meal_plans: per-user, allow-listed only.
do $$
declare t text;
begin
  foreach t in array array['favorites','meal_plans']
  loop
    execute format('drop policy if exists %I_self on boodschappen.%I;', t, t);
    execute format(
      'create policy %I_self on boodschappen.%I for all to authenticated using (public.is_allowed() and auth.uid() = user_id) with check (public.is_allowed() and auth.uid() = user_id);',
      t, t
    );
  end loop;
end $$;
