import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { corsHeaders, gcFetch, getToken } from '../_shared/gocardless.ts'

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders })

  const authHeader = req.headers.get('Authorization')
  if (!authHeader) return Response.json({ error: 'Unauthorized' }, { status: 401, headers: corsHeaders })

  try {
    // Verify caller
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

    const token = await getToken()

    // Fetch institution name + logo
    const institutions = await gcFetch('/institutions/?country=NL', token)
    const inst = institutions.find((i: any) => i.id === institution_id)
    const institution_name: string = inst?.name ?? institution_id
    const institution_logo: string | null = inst?.logo ?? null

    // Create GoCardless requisition
    const requisition = await gcFetch('/requisitions/', token, {
      method: 'POST',
      body: JSON.stringify({
        redirect: redirect_url,
        institution_id,
        reference: `superapp_${user.id.slice(0, 8)}_${Date.now()}`,
        user_language: 'NL',
      }),
    })

    // Persist to DB
    await adminClient.from('bank_connections').insert({
      household_id: profile.household_id,
      account_id: account_id ?? null,
      requisition_id: requisition.id,
      institution_id,
      institution_name,
      institution_logo,
      status: 'pending',
    })

    return Response.json({ link: requisition.link, requisition_id: requisition.id }, { headers: corsHeaders })
  } catch (err) {
    return Response.json({ error: (err as Error).message }, { status: 500, headers: corsHeaders })
  }
})
