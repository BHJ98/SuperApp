import * as jose from 'https://esm.sh/jose@5'

// Enable Banking (enablebanking.com) — free "Restricted Production" open
// banking access for your own accounts. Replaces GoCardless Bank Account
// Data, which closed to new signups in July 2025.
//
// Auth: every request carries a short-lived JWT signed with the
// application's RSA private key (registered at enablebanking.com/cp).
// Secrets required (supabase secrets set ...):
//   ENABLE_BANKING_APP_ID       — application id (JWT `kid`)
//   ENABLE_BANKING_PRIVATE_KEY  — PKCS#8 PEM private key of the application

const EB_BASE = 'https://api.enablebanking.com'

let cachedToken: { token: string; exp: number } | null = null

export async function ebToken(): Promise<string> {
  const now = Math.floor(Date.now() / 1000)
  if (cachedToken && cachedToken.exp - 60 > now) return cachedToken.token

  const appId = Deno.env.get('ENABLE_BANKING_APP_ID')
  const pem = Deno.env.get('ENABLE_BANKING_PRIVATE_KEY')
  if (!appId || !pem) throw new Error('Enable Banking secrets not configured')

  // Secrets set via CLI often arrive with literal \n sequences — normalise.
  const key = await jose.importPKCS8(pem.replace(/\\n/g, '\n'), 'RS256')
  const token = await new jose.SignJWT({})
    .setProtectedHeader({ alg: 'RS256', typ: 'JWT', kid: appId })
    .setIssuer('enablebanking.com')
    .setAudience('api.enablebanking.com')
    .setIssuedAt(now)
    .setExpirationTime(now + 3600)
    .sign(key)

  cachedToken = { token, exp: now + 3600 }
  return token
}

export async function ebFetch(path: string, opts: RequestInit = {}): Promise<any> {
  const token = await ebToken()
  const res = await fetch(`${EB_BASE}${path}`, {
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
    throw new Error(`Enable Banking ${res.status} on ${path}: ${body}`)
  }
  return res.json()
}

export const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

export function normaliseIban(iban: string | null | undefined): string {
  return (iban || '').replace(/\s+/g, '').toUpperCase()
}
