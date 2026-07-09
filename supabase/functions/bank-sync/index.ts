import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { corsHeaders, gcFetch, getToken, normaliseIban } from '../_shared/gocardless.ts'

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

    const { requisition_id } = await req.json()
    if (!requisition_id)
      return Response.json({ error: 'Missing requisition_id' }, { status: 400, headers: corsHeaders })

    // Load connection
    const { data: conn } = await adminClient
      .from('bank_connections').select('*').eq('requisition_id', requisition_id).single()
    if (!conn) return Response.json({ error: 'Connection not found' }, { status: 404, headers: corsHeaders })

    const token = await getToken()

    // Check requisition status
    const requisition = await gcFetch(`/requisitions/${requisition_id}/`, token)
    if (requisition.status !== 'LN') {
      const newStatus = requisition.status === 'CR' ? 'pending' : 'error'
      await adminClient.from('bank_connections').update({ status: newStatus }).eq('requisition_id', requisition_id)
      return Response.json(
        { error: 'Bank not yet authorized', status: requisition.status },
        { status: 400, headers: corsHeaders },
      )
    }

    // Get household for applying rules
    const { data: profile } = await adminClient
      .from('profiles').select('household_id').eq('id', user.id).single()
    const householdId = conn.household_id ?? profile?.household_id

    // Own-account IBANs, for auto-detecting internal transfers (net-zero moves
    // between the household's own accounts, e.g. checking -> savings).
    const ownIbanSet = new Set<string>()
    if (householdId) {
      const { data: ownAccounts } = await adminClient
        .from('accounts').select('iban').eq('household_id', householdId)
      for (const a of ownAccounts ?? []) {
        if (a.iban) ownIbanSet.add(normaliseIban(a.iban))
      }
    }

    const gcAccountIds: string[] = requisition.accounts ?? []
    let totalImported = 0
    let totalSkipped = 0

    for (const gcAccountId of gcAccountIds) {
      // Resolve Finance account by IBAN
      let financeAccountId: string | null = conn.account_id ?? null
      let iban: string | null = conn.iban ?? null

      if (!financeAccountId || !iban) {
        try {
          const details = await gcFetch(`/accounts/${gcAccountId}/details/`, token)
          iban = details?.account?.iban ?? null
        } catch { /* ignore */ }

        if (iban && !financeAccountId) {
          const { data: matched } = await adminClient
            .from('accounts').select('id').eq('iban', iban).maybeSingle()
          financeAccountId = matched?.id ?? null
        }
      }

      if (!financeAccountId) continue  // no matching account — skip

      // Update connection with resolved info on first sync
      if (!conn.gocardless_account_id) {
        await adminClient.from('bank_connections').update({
          gocardless_account_id: gcAccountId,
          iban,
          status: 'active',
          account_id: financeAccountId,
        }).eq('requisition_id', requisition_id)
      }

      // Fetch last 90 days of transactions
      const dateFrom = new Date()
      dateFrom.setDate(dateFrom.getDate() - 90)
      const dateFromStr = dateFrom.toISOString().split('T')[0]

      let booked: any[] = []
      try {
        const txRes = await gcFetch(`/accounts/${gcAccountId}/transactions/?date_from=${dateFromStr}`, token)
        booked = txRes?.transactions?.booked ?? []
      } catch { /* ignore */ }

      const rows = booked.map((tx: any, idx: number) => {
        const amount = parseFloat(tx.transactionAmount?.amount ?? '0')
        const isExpense = amount < 0
        const counterparty_name: string | null = (isExpense ? tx.creditorName : tx.debtorName) ?? null
        const counterparty_iban: string | null =
          (isExpense ? tx.creditorAccount?.iban : tx.debtorAccount?.iban) ?? null
        const txId: string = tx.transactionId ?? tx.internalTransactionId ?? ''
        const importHash = `gc_${txId || `${gcAccountId}_${tx.bookingDate}_${amount}_${idx}`}`
        const isTransfer = !!counterparty_iban && ownIbanSet.has(normaliseIban(counterparty_iban))

        return {
          account_id: financeAccountId,
          date: tx.bookingDate ?? tx.valueDate ?? dateFromStr,
          amount,
          description: tx.remittanceInformationUnstructured
            ?? tx.remittanceInformationStructured?.unstructuredInformation
            ?? '',
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
      if (householdId) {
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
