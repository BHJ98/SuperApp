import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { corsHeaders, ebFetch, normaliseIban } from '../_shared/enablebanking.ts'

// Syncs transactions from Enable Banking into public.transactions.
// First call after the bank redirect carries the one-time `code`, which is
// exchanged for a session (stored in bank_connections.session_id); later
// calls reuse that session until the 90-day consent expires.
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders })

  const authHeader = req.headers.get('Authorization')
  if (!authHeader) return Response.json({ error: 'Unauthorized' }, { status: 401, headers: corsHeaders })

  try {
    const userClient = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } },
    )
    const { data: { user }, error: authErr } = await userClient.auth.getUser()
    if (authErr || !user) return Response.json({ error: 'Unauthorized' }, { status: 401, headers: corsHeaders })

    const adminClient = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    )

    const { requisition_id, code } = await req.json()
    if (!requisition_id)
      return Response.json({ error: 'Missing requisition_id' }, { status: 400, headers: corsHeaders })

    // Load connection and verify it belongs to the caller's household — the
    // requisition id travels through browser URLs and must not grant access
    // to another household's connection.
    const { data: conn } = await adminClient
      .from('bank_connections').select('*').eq('requisition_id', requisition_id).single()
    if (!conn) return Response.json({ error: 'Connection not found' }, { status: 404, headers: corsHeaders })

    const { data: profile } = await adminClient
      .from('profiles').select('household_id').eq('id', user.id).single()
    const householdId = profile?.household_id
    if (!householdId || conn.household_id !== householdId)
      return Response.json({ error: 'Forbidden' }, { status: 403, headers: corsHeaders })

    // ── Resolve the Enable Banking session ──
    let sessionId: string | null = conn.session_id ?? null
    let accountUids: string[] = []

    if (!sessionId) {
      if (!code) {
        return Response.json(
          { error: 'Bank not yet authorized', status: 'pending' },
          { status: 400, headers: corsHeaders },
        )
      }
      const session = await ebFetch('/sessions', {
        method: 'POST',
        body: JSON.stringify({ code }),
      })
      sessionId = session.session_id as string
      accountUids = (session.accounts ?? []).map((a: any) =>
        typeof a === 'string' ? a : a.uid,
      )
      await adminClient.from('bank_connections')
        .update({ session_id: sessionId, status: 'active' })
        .eq('requisition_id', requisition_id)
    } else {
      let session: any
      try {
        session = await ebFetch(`/sessions/${sessionId}`)
      } catch {
        await adminClient.from('bank_connections')
          .update({ status: 'expired' }).eq('requisition_id', requisition_id)
        return Response.json(
          { error: 'Sessie verlopen — koppel de bank opnieuw', status: 'expired' },
          { status: 400, headers: corsHeaders },
        )
      }
      accountUids = (session.accounts ?? []).map((a: any) =>
        typeof a === 'string' ? a : a.uid,
      )
    }

    // Own-account IBANs, for auto-detecting internal transfers (net-zero
    // moves between the household's own accounts, e.g. checking -> savings).
    const ownIbanSet = new Set<string>()
    const { data: ownAccounts } = await adminClient
      .from('accounts').select('iban').eq('household_id', householdId)
    for (const a of ownAccounts ?? []) {
      if (a.iban) ownIbanSet.add(normaliseIban(a.iban))
    }

    let totalImported = 0
    let totalSkipped = 0

    const dateFrom = new Date()
    dateFrom.setDate(dateFrom.getDate() - 90)
    const dateFromStr = dateFrom.toISOString().split('T')[0]

    for (const uid of accountUids) {
      // Resolve Finance account by IBAN
      let financeAccountId: string | null = conn.account_id ?? null
      let iban: string | null = conn.iban ?? null

      if (!iban) {
        try {
          const details = await ebFetch(`/accounts/${uid}/details`)
          iban = details?.account_id?.iban ?? details?.iban ?? null
        } catch { /* fall through */ }
      }
      if (iban && !financeAccountId) {
        const { data: matched } = await adminClient
          .from('accounts').select('id')
          .eq('household_id', householdId).eq('iban', iban).maybeSingle()
        financeAccountId = matched?.id ?? null
      }
      if (!financeAccountId) continue  // no matching Finance account — skip

      if (!conn.iban || !conn.account_id) {
        await adminClient.from('bank_connections')
          .update({ iban, account_id: financeAccountId, status: 'active' })
          .eq('requisition_id', requisition_id)
      }

      // Fetch transactions, following continuation pages
      const txs: any[] = []
      let continuation: string | null = null
      let pages = 0
      do {
        const qs = new URLSearchParams({ date_from: dateFromStr })
        if (continuation) qs.set('continuation_key', continuation)
        const page = await ebFetch(`/accounts/${uid}/transactions?${qs}`)
        txs.push(...(page?.transactions ?? []))
        continuation = page?.continuation_key ?? null
        pages++
      } while (continuation && pages < 20)

      const rows = txs.map((t: any, idx: number) => {
        const raw = parseFloat(t.transaction_amount?.amount ?? '0')
        const isDebit = t.credit_debit_indicator === 'DBIT'
        const amount = isDebit ? -Math.abs(raw) : Math.abs(raw)
        const counterparty_name: string | null =
          (isDebit ? (t.creditor?.name ?? t.creditor_name) : (t.debtor?.name ?? t.debtor_name)) ?? null
        const counterparty_iban: string | null =
          (isDebit ? t.creditor_account?.iban : t.debtor_account?.iban) ?? null
        const ref: string = t.entry_reference ?? ''
        const importHash = `eb_${ref || `${uid}_${t.booking_date}_${amount}_${idx}`}`
        const description = Array.isArray(t.remittance_information)
          ? t.remittance_information.join(' ')
          : (t.remittance_information ?? '')
        const isTransfer = !!counterparty_iban && ownIbanSet.has(normaliseIban(counterparty_iban))

        return {
          account_id: financeAccountId,
          date: t.booking_date ?? t.value_date ?? dateFromStr,
          amount,
          description,
          counterparty_name,
          counterparty_iban,
          import_hash: importHash,
          is_categorized: false,
          is_transfer: isTransfer,
        }
      })

      if (rows.length > 0) {
        const { data: inserted, error: upsertErr } = await adminClient
          .from('transactions')
          .upsert(rows, { onConflict: 'import_hash', ignoreDuplicates: true })
          .select('id')
        if (!upsertErr) {
          totalImported += inserted?.length ?? 0
          totalSkipped += rows.length - (inserted?.length ?? 0)
        }
      }

      // Apply categorization rules to newly imported uncategorised transactions
      const { data: rules } = await adminClient
        .from('categorization_rules')
        .select('match_type, match_value, category_id')
        .eq('household_id', householdId)
        .eq('is_active', true)

      for (const rule of rules ?? []) {
        let q = adminClient
          .from('transactions')
          .update({ category_id: rule.category_id, is_categorized: true })
          .eq('account_id', financeAccountId)
          .eq('is_categorized', false)

        if (rule.match_type === 'iban') {
          q = q.eq('counterparty_iban', rule.match_value)
        } else if (rule.match_type === 'name_contains') {
          q = q.ilike('counterparty_name', `%${rule.match_value}%`)
        } else if (rule.match_type === 'description_contains') {
          q = q.ilike('description', `%${rule.match_value}%`)
        }
        await q
      }
    }

    await adminClient.from('bank_connections')
      .update({ last_synced_at: new Date().toISOString(), status: 'active' })
      .eq('requisition_id', requisition_id)

    return Response.json(
      { imported: totalImported, skipped: totalSkipped, total: totalImported + totalSkipped },
      { headers: corsHeaders },
    )
  } catch (err) {
    return Response.json({ error: (err as Error).message }, { status: 500, headers: corsHeaders })
  }
})
