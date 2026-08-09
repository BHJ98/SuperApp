-- ============================================================================
-- Verbouwing — categorieën als tweede snijvlak naast ruimtes, plus drie
-- extra ruimtes (Werkkamer, Kledingkamer, Gang).
--
-- Run in de Supabase SQL-editor. Geef de query-tab de naam
-- "verbouwing_categories" vóór het uitvoeren. Veilig om opnieuw te draaien.
--
-- Model: elke verdeel-regel (verbouwing.expense_parts) krijgt een optionele
-- category_id. Categorie op regel-niveau i.p.v. uitgave-niveau, zodat één bon
-- deels "Verf" en deels "Lampen" kan zijn en rapportages per ruimte × categorie
-- mogelijk blijven. Bevat ook de bijgewerkte schrijf-RPC's (vervangen de
-- versies uit verbouwing_atomic_writes.sql) die category_id meeschrijven.
-- ============================================================================

-- ---- Categorieën-tabel ----

create table if not exists verbouwing.categories (
  id         uuid primary key default gen_random_uuid(),
  name       text not null unique,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);

alter table verbouwing.categories enable row level security;
drop policy if exists allow_listed on verbouwing.categories;
create policy allow_listed on verbouwing.categories
  for all to authenticated using (public.is_allowed()) with check (public.is_allowed());
grant select, insert, update, delete on verbouwing.categories to authenticated;

-- ---- category_id op de verdeel-regels ----

alter table verbouwing.expense_parts
  add column if not exists category_id uuid references verbouwing.categories(id) on delete set null;

create index if not exists idx_vb_parts_category on verbouwing.expense_parts(category_id);

-- ---- Seed: startcategorieën (guarded, daarna vrij aanpasbaar) ----

insert into verbouwing.categories (name, sort_order)
select v.naam, v.volgorde
from (values
  ('Verf', 10),
  ('Vloer', 20),
  ('Schakelmateriaal', 30),
  ('Meubels', 40),
  ('Lampen', 50),
  ('Ander interieur', 60)
) as v(naam, volgorde)
where not exists (select 1 from verbouwing.categories c where c.name = v.naam);

-- ---- Seed: extra ruimtes (guarded, net als de oorspronkelijke seed) ----

do $$
declare
  ruimte text;
  ruimtes text[] := array['Werkkamer','Kledingkamer','Gang'];
  i int := 100;
begin
  foreach ruimte in array ruimtes loop
    if not exists (select 1 from verbouwing.rooms where name = ruimte and parent_id is null) then
      insert into verbouwing.rooms (name, sort_order) values (ruimte, i);
    end if;
    i := i + 10;
  end loop;
end $$;

-- ---- Bijgewerkte schrijf-RPC's: category_id gaat mee in de parts ----
-- (create or replace vervangt de versies uit verbouwing_atomic_writes.sql;
-- de validatie in verbouwing.assert_parts_valid blijft ongewijzigd.)

create or replace function verbouwing.create_expense_with_parts(
  p_expense jsonb,
  p_parts jsonb
) returns verbouwing.expenses
language plpgsql
as $$
declare
  new_expense verbouwing.expenses;
begin
  perform verbouwing.assert_parts_valid((p_expense->>'total_amount')::numeric, p_parts);

  insert into verbouwing.expenses (transaction_id, date, description, supplier, total_amount)
  values (
    nullif(p_expense->>'transaction_id', '')::uuid,
    (p_expense->>'date')::date,
    coalesce(p_expense->>'description', ''),
    p_expense->>'supplier',
    (p_expense->>'total_amount')::numeric
  )
  returning * into new_expense;

  insert into verbouwing.expense_parts (expense_id, room_id, amount, note, category_id)
  select new_expense.id,
         (elem->>'room_id')::uuid,
         (elem->>'amount')::numeric,
         elem->>'note',
         nullif(elem->>'category_id', '')::uuid
  from jsonb_array_elements(p_parts) as elem;

  return new_expense;
end;
$$;

create or replace function verbouwing.update_expense_with_parts(
  p_id uuid,
  p_patch jsonb,
  p_parts jsonb
) returns void
language plpgsql
as $$
begin
  perform verbouwing.assert_parts_valid((p_patch->>'total_amount')::numeric, p_parts);

  update verbouwing.expenses set
    date         = (p_patch->>'date')::date,
    description  = coalesce(p_patch->>'description', ''),
    supplier     = p_patch->>'supplier',
    total_amount = (p_patch->>'total_amount')::numeric
  where id = p_id;

  if not found then
    raise exception 'Uitgave % bestaat niet', p_id;
  end if;

  delete from verbouwing.expense_parts where expense_id = p_id;

  insert into verbouwing.expense_parts (expense_id, room_id, amount, note, category_id)
  select p_id,
         (elem->>'room_id')::uuid,
         (elem->>'amount')::numeric,
         elem->>'note',
         nullif(elem->>'category_id', '')::uuid
  from jsonb_array_elements(p_parts) as elem;
end;
$$;

grant execute on function verbouwing.create_expense_with_parts(jsonb, jsonb) to authenticated;
grant execute on function verbouwing.update_expense_with_parts(uuid, jsonb, jsonb) to authenticated;
