import { corsHeaders, gcFetch, getToken } from '../_shared/gocardless.ts'

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders })

  try {
    const token = await getToken()
    const institutions = await gcFetch('/institutions/?country=NL', token)
    return Response.json(institutions, { headers: corsHeaders })
  } catch (err) {
    return Response.json({ error: (err as Error).message }, { status: 500, headers: corsHeaders })
  }
})
