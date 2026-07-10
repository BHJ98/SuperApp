// Vercel Cron target: pings Supabase daily so the free-tier project never
// hits the ~7-day-inactivity auto-pause that took the whole app down once
// already. See vercel.json's `crons` entry.
export const config = { maxDuration: 10 };

export default async function handler() {
  const url = process.env.VITE_SUPABASE_URL;
  const anonKey = process.env.VITE_SUPABASE_ANON_KEY;
  if (!url || !anonKey) {
    return new Response("Supabase not configured", { status: 200 });
  }
  try {
    await fetch(`${url}/rest/v1/profiles?select=id&limit=1`, {
      headers: { apikey: anonKey, Authorization: `Bearer ${anonKey}` },
    });
  } catch {
    // Best-effort — a failed ping just means we try again tomorrow.
  }
  return new Response("ok", { status: 200 });
}
