-- ============================================================================
-- Finance: switch bank sync from GoCardless to Enable Banking
-- Run in the Supabase SQL editor. Safe to re-run (idempotent).
--
-- GoCardless Bank Account Data closed to new signups (July 2025). The Edge
-- Functions now talk to Enable Banking (enablebanking.com), which offers
-- free "Restricted Production" access for your own accounts.
--
-- Column reuse on public.bank_connections:
--   requisition_id        -> now stores the Enable Banking auth `state`
--                            (still the stable unique row key)
--   session_id (NEW)      -> Enable Banking session id, set on first sync
--   gocardless_account_id -> unused going forward (left in place, harmless)
--
-- One-time setup after running this:
--   1. Create an account at enablebanking.com and register an application
--      (Control Panel). Redirect URL:
--        https://super-app-omega-hazel.vercel.app/finance/bank-sync
--      Download the application's PRIVATE KEY (PEM) and note the APP ID.
--   2. Set the Edge Function secrets:
--        supabase secrets set ENABLE_BANKING_APP_ID=xxx
--        supabase secrets set ENABLE_BANKING_PRIVATE_KEY="$(cat private.pem)"
--      (the old GOCARDLESS_* secrets can be removed)
--   3. Redeploy the functions:
--        supabase functions deploy bank-institutions bank-connect bank-sync
--   4. Existing GoCardless connections can't be reused — delete them on the
--      Bank page and connect again through Enable Banking.
-- ============================================================================

alter table public.bank_connections
  add column if not exists session_id text;

-- Old GoCardless connections can never sync again; mark them expired so the
-- UI shows clearly that they need to be re-connected.
update public.bank_connections
set status = 'expired'
where session_id is null
  and gocardless_account_id is not null;
