const GC_BASE = 'https://bankaccountdata.gocardless.com/api/v2'

export async function getToken(): Promise<string> {
  const res = await fetch(`${GC_BASE}/token/new/`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
    body: JSON.stringify({
      secret_id: Deno.env.get('GOCARDLESS_SECRET_ID'),
      secret_key: Deno.env.get('GOCARDLESS_SECRET_KEY'),
    }),
  })
  if (!res.ok) {
    const body = await res.text()
    throw new Error(`GoCardless auth failed (${res.status}): ${body}`)
  }
  const data = await res.json()
  return data.access as string
}

export async function gcFetch(path: string, token: string, opts: RequestInit = {}): Promise<any> {
  const res = await fetch(`${GC_BASE}${path}`, {
    ...opts,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
      ...(opts.headers ?? {}),
    },
  })
  if (!res.ok) {
    const body = await res.text()
    throw new Error(`GoCardless ${res.status} on ${path}: ${body}`)
  }
  return res.json()
}

export const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, content-type',
}

export function normaliseIban(iban: string | null | undefined): string {
  return (iban || '').replace(/\s+/g, '').toUpperCase()
}
