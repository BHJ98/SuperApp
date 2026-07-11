-- ============================================================================
-- Verbouwing — atomaire schrijf-RPC's voor uitgaven + parts.
--
-- Run in de Supabase SQL-editor. Geef de query-tab de naam
-- "verbouwing_atomic_writes" vóór het uitvoeren. Veilig om opnieuw te draaien.
--
-- Waarom: een uitgave (verbouwing.expenses) en haar verdeling
-- (verbouwing.expense_parts) moeten samen consistent blijven — de som van de
-- parts hoort (binnen een cent) gelijk te zijn aan total_amount, en er hoort
-- altijd minstens één part te zijn. De client deed dit voorheen met losse
-- insert/delete/insert-calls; mislukte de tweede stap, dan bleef een uitgave
-- zónder verdeling achter (telde nergens mee, toonde als "Onbekend").
--
-- Deze twee functies doen alles in één transactie (een plpgsql-functie draait
-- automatisch als één transactie): faalt een stap, dan rolt alles terug.
-- SECURITY INVOKER (default) → de RLS-policies op de tabellen blijven gelden,
-- de aanroeper kan dus alleen zijn eigen household muteren.
-- ============================================================================

-- Gedeelde validatie: som van de parts ≈ total, en ≥1 part.
create or replace function verbouwing.assert_parts_valid(
  p_total numeric,
  p_parts jsonb
) returns void
language plpgsql
as $$
declare
  part_sum numeric;
  part_count int;
begin
  select coalesce(sum((elem->>'amount')::numeric), 0), count(*)
    into part_sum, part_count
  from jsonb_array_elements(coalesce(p_parts, '[]'::jsonb)) as elem;

  if part_count < 1 then
    raise exception 'Een uitgave moet minstens één verdeel-regel hebben';
  end if;
  if abs(part_sum - p_total) > 0.01 then
    raise exception 'De som van de verdeel-regels (%) wijkt af van het totaal (%)',
      part_sum, p_total;
  end if;
end;
$$;

-- Nieuwe uitgave + parts in één transactie.
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

  insert into verbouwing.expense_parts (expense_id, room_id, amount, note)
  select new_expense.id,
         (elem->>'room_id')::uuid,
         (elem->>'amount')::numeric,
         elem->>'note'
  from jsonb_array_elements(p_parts) as elem;

  return new_expense;
end;
$$;

-- Bestaande uitgave bijwerken + parts vervangen in één transactie.
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

  insert into verbouwing.expense_parts (expense_id, room_id, amount, note)
  select p_id,
         (elem->>'room_id')::uuid,
         (elem->>'amount')::numeric,
         elem->>'note'
  from jsonb_array_elements(p_parts) as elem;
end;
$$;

grant execute on function verbouwing.assert_parts_valid(numeric, jsonb) to authenticated;
grant execute on function verbouwing.create_expense_with_parts(jsonb, jsonb) to authenticated;
grant execute on function verbouwing.update_expense_with_parts(uuid, jsonb, jsonb) to authenticated;
