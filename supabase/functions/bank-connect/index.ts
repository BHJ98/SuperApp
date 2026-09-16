import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { corsHeaders, ebFetch } from '../_shared/enablebanking.ts'

// Starts an Enable Banking authorization: creates an auth session at the
// chosen bank and returns the bank's consent URL. The `state` uuid is our
// stable row key (stored in bank_connections.requisition_id); the bank
// redirects back to the app with ?code=...&state=... and bank-sync
// exchanges that code for a session.
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

    const { data: profile } = await adminClient
      .from('profiles').select('household_id').eq('id', user.id).single()
    if (!profile?.household_id)
      return Response.json({ error: 'No household found' }, { status: 400, headers: corsHeaders })

    const { institution_id, redirect_url, account_id, reauth_requisition_id, country } = await req.json()
    if (!redirect_url)
      return Response.json({ error: 'Missing redirect_url' }, { status: 400, headers: corsHeaders })

    let aspspName: string
    let aspspCountry: string
    let state: string

    if (reauth_requisition_id) {
      // Opnieuw machtigen binnen een bestaande koppeling: hergebruik de rij
      // (en dus de state) zodat er geen tweede kaart ontstaat. Banken als
      // Rabobank staan één machtiging per rekening per app toe — een losse
      // nieuwe koppeling voor dezelfde rekening trekt de vorige in.
      const { data: existing } = await adminClient
        .from('bank_connections')
        .select('requisition_id, institution_name, household_id')
        .eq('requisition_id', reauth_requisition_id)
        .single()
      if (!existing || existing.household_id !== profile.household_id)
        return Response.json({ error: 'Connection not found' }, { status: 404, headers: corsHeaders })
      aspspName = existing.institution_name
      aspspCountry = String(country || 'NL')
      state = existing.requisition_id
    } else {
      if (!institution_id)
        return Response.json({ error: 'Missing institution_id' }, { status: 400, headers: corsHeaders })
      const parts = String(institution_id).split('|')
      if (!parts[0] || !parts[1])
        return Response.json({ error: 'Invalid institution_id' }, { status: 400, headers: corsHeaders })
      aspspName = parts[0]
      aspspCountry = parts[1]
      state = crypto.randomUUID()
    }

    // PSD2 account-access consent runs out after 90 days, then reconnect.
    const validUntil = new Date(Date.now() + 90 * 24 * 3600 * 1000).toISOString()

    const auth = await ebFetch('/auth', {
      method: 'POST',
      body: JSON.stringify({
        access: { valid_until: validUntil },
        aspsp: { name: aspspName, country: aspspCountry },
        state,
        redirect_url,
        psu_type: 'personal',
      }),
    })

    if (reauth_requisition_id) {
      // Oude sessie loslaten: na de redirect wisselt bank-sync de nieuwe code
      // in en zet de status weer op 'active'. Breekt de gebruiker af, dan toont
      // de kaart eerlijk "Wacht op autorisatie" en kan hij het opnieuw proberen.
      await adminClient.from('bank_connections')
        .update({ session_id: null, status: 'pending' })
        .eq('requisition_id', state)
      return Response.json({ link: auth.url, requisition_id: state }, { headers: corsHeaders })
    }

    // Fetch logo for display (best-effort)
    let logo: string | null = null
    try {
      const aspsps = await ebFetch(`/aspsps?country=${aspspCountry}`)
      logo = (aspsps?.aspsps ?? []).find((a: any) => a.name === aspspName)?.logo ?? null
    } catch { /* cosmetic only */ }

    await adminClient.from('bank_connections').insert({
      household_id: profile.household_id,
      account_id: account_id ?? null,
      requisition_id: state,
      institution_id: aspspName,
      institution_name: aspspName,
      institution_logo: logo,
      status: 'pending',
    })

    return Response.json({ link: auth.url, requisition_id: state }, { headers: corsHeaders })
  } catch (err) {
    return Response.json({ error: (err as Error).message }, { status: 500, headers: corsHeaders })
  }
})
