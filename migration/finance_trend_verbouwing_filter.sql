-- ============================================================================
-- Finance — 3-maands trend-RPC respecteert de "Incl. verbouwing"-toggle.
--
-- Run in de Supabase SQL-editor. Geef de query-tab de naam
-- "finance_trend_verbouwing_filter" vóór het uitvoeren. Veilig om opnieuw te
-- draaien.
--
-- Waarom: get_monthly_income_expenses (gebruikt door de trendgrafiek op het
-- Finance-Dashboard) filterde alleen op is_transfer, niet op is_verbouwing.
-- Verbouwingsuitgaven telden daardoor altijd mee in de trend, ook als de
-- "Incl. verbouwing"-toggle uit stond. Deze versie krijgt een extra parameter
-- zodat de trend dezelfde filter volgt als de maandcijfers.
-- ============================================================================

-- Oude 2-arg-versie eerst weg, anders is een 2-arg-aanroep dubbelzinnig met de
-- nieuwe 3-arg-versie (die een default heeft).
drop function if exists public.get_monthly_income_expenses(date, date);

create or replace function public.get_monthly_income_expenses(
  p_start_date date,
  p_end_date date,
  p_include_verbouwing boolean default false
)
returns table (month text, income numeric, expenses numeric)
language sql
stable
as $$
  select
    to_char(date_trunc('month', t.date), 'YYYY-MM') as month,
    coalesce(sum(t.amount) filter (where t.amount > 0), 0) as income,
    coalesce(sum(abs(t.amount)) filter (where t.amount < 0), 0) as expenses
  from public.transactions t
  where t.date >= p_start_date
    and t.date <= p_end_date
    and t.is_transfer = false
    and (p_include_verbouwing or t.is_verbouwing = false)
  group by date_trunc('month', t.date)
  order by date_trunc('month', t.date);
$$;

grant execute on function public.get_monthly_income_expenses(date, date, boolean) to authenticated;
