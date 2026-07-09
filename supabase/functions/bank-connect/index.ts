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

    const { institution_id, redirect_url, account_id } = await req.json()
    if (!institution_id || !redirect_url)
      return Response.json({ error: 'Missing institution_id or redirect_url' }, { status: 400, headers: corsHeaders })

    const [aspspName, aspspCountry] = String(institution_id).split('|')
    if (!aspspName || !aspspCountry)
      return Response.json({ error: 'Invalid institution_id' }, { status: 400, headers: corsHeaders })

    const state = crypto.randomUUID()
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
