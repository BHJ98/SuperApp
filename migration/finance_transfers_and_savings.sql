-- ============================================================================
-- Finance: transfer detection backfill + savings goal <-> account linking
-- Run in the Supabase SQL editor. Safe to re-run (idempotent).
--
-- Fixes a real bug: moving money between your own accounts (e.g. checking ->
-- savings) was counted as an ordinary expense/income, inflating both totals
-- even though it has zero net effect. Going forward this is auto-detected at
-- import time (CSV + bank sync); this migration backfills existing data and
-- upgrades the reporting RPC + savings goals to match.
-- ============================================================================

-- 1. Backfill: flag existing transactions whose counterparty IBAN is another
--    account already owned by the same household as a transfer.
update public.transactions t
set is_transfer = true
from public.accounts src
where src.id = t.account_id
  and t.is_transfer = false
  and t.counterparty_iban is not null
  and exists (
    select 1 from public.accounts dest
    where dest.household_id = src.household_id
      and dest.iban is not null
      and upper(replace(dest.iban, ' ', '')) = upper(replace(t.counterparty_iban, ' ', ''))
  );

-- 2. Recreate the monthly income/expense RPC used by the Dashboard trend
--    chart, guaranteeing it excludes transfers (relies on RLS for household
--    scoping, same as every other query in the app — SECURITY INVOKER, the
--    default for a plain `language sql` function).
create or replace function public.get_monthly_income_expenses(p_start_date date, p_end_date date)
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
  group by date_trunc('month', t.date)
  order by date_trunc('month', t.date);
$$;

grant execute on function public.get_monthly_income_expenses(date, date) to authenticated;

-- 3. Savings goals can optionally link to a real account, so progress is
--    read live from actual transactions instead of a hand-typed number.
alter table public.savings_goals
  add column if not exists account_id uuid references public.accounts(id) on delete set null;
