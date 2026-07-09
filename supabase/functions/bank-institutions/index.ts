import { corsHeaders, ebFetch } from '../_shared/enablebanking.ts'

// Lists Dutch banks available through Enable Banking. ASPSPs are identified
// by (name, country) rather than a stable id, so the frontend id is
// "name|country" and bank-connect splits it back apart.
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders })

  try {
    const data = await ebFetch('/aspsps?country=NL')
    const institutions = (data?.aspsps ?? []).map((a: any) => ({
      id: `${a.name}|${a.country}`,
      name: a.name,
      logo: a.logo ?? null,
    }))
    return Response.json(institutions, { headers: corsHeaders })
  } catch (err) {
    return Response.json({ error: (err as Error).message }, { status: 500, headers: corsHeaders })
  }
})
