-- ============================================================================
-- Task 2 — Auth: allow-list, profiles, signup gate, RLS helper
-- Run this in the HOST (Finance) project's SQL editor:
--   https://gbmioirxxsrvxnitxxso.supabase.co  → SQL Editor → New query → paste → Run
-- Safe to re-run (idempotent).
-- ============================================================================

-- 1. The allow-list. Only these emails may use the app.
create table if not exists public.allowed_emails (
  email text primary key,
  label text
);

-- 2. One profile row per signed-in user (mirrors auth.users).
create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text not null,
  display_name text,
  created_at timestamptz not null default now()
);

-- 3. Auto-create a profile whenever a user is inserted into auth.users.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, email, display_name)
  values (new.id, new.email, coalesce(new.raw_user_meta_data->>'full_name', new.email))
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- 4. Before-User-Created auth hook: reject any email not on the allow-list.
--    Supabase calls this with a jsonb `event`; return it unchanged to allow,
--    or return an {error} object to reject the signup.
create or replace function public.before_user_created(event jsonb)
returns jsonb
language plpgsql
as $$
declare
  candidate text := lower(event #>> '{user_metadata,email}');
begin
  -- The email may arrive under different keys depending on provider/version;
  -- fall back through the common locations.
  if candidate is null then
    candidate := lower(coalesce(event #>> '{claims,email}', event #>> '{email}'));
  end if;

  if candidate is null
     or not exists (
       select 1 from public.allowed_emails ae where lower(ae.email) = candidate
     )
  then
    return jsonb_build_object(
      'error', jsonb_build_object(
        'http_code', 403,
        'message', 'This account is not on the allow-list.'
      )
    );
  end if;

  return event;
end;
$$;

-- The auth server runs hooks as the supabase_auth_admin role.
grant execute on function public.before_user_created(jsonb) to supabase_auth_admin;
grant usage on schema public to supabase_auth_admin;
grant select on public.allowed_emails to supabase_auth_admin;

-- 5. Reusable RLS predicate: is the current request from an allow-listed email?
--    SECURITY DEFINER + fixed search_path so it bypasses RLS when reading
--    allowed_emails (otherwise the policy on allowed_emails would recursively
--    call is_allowed() and every gated query would block forever).
create or replace function public.is_allowed()
returns boolean
language sql stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.allowed_emails ae
    where lower(ae.email) = lower(auth.jwt() ->> 'email')
  );
$$;

-- 6. RLS on the auth tables themselves.
alter table public.allowed_emails enable row level security;
alter table public.profiles enable row level security;

drop policy if exists allowed_emails_read on public.allowed_emails;
create policy allowed_emails_read on public.allowed_emails
  for select using (public.is_allowed());

drop policy if exists profiles_self on public.profiles;
create policy profiles_self on public.profiles
  for all using (public.is_allowed()) with check (public.is_allowed());

-- 7. Seed the allow-list. EDIT THESE before running, or insert later.
insert into public.allowed_emails (email, label) values
  ('budgethorloges@gmail.com', 'owner')
  -- , ('partner@example.com', 'partner')
on conflict (email) do nothing;
