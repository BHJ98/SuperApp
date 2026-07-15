// CORS-wrapper voor de Vercel-functions, alleen nodig voor de native
// Capacitor-app: die draait op origin https://localhost en valt daarmee
// buiten same-origin. Webverkeer (same-origin) stuurt geen Origin-header
// die hier matcht en blijft ongewijzigd. Het underscore-prefix zorgt dat
// Vercel dit bestand niet als route deployt.
const ALLOWED_ORIGINS = new Set(["https://localhost", "capacitor://localhost"]);

export function withCors(
  handler: (req: Request) => Promise<Response>,
): (req: Request) => Promise<Response> {
  return async (req: Request): Promise<Response> => {
    const origin = req.headers.get("origin") ?? "";
    const cors: Record<string, string> = ALLOWED_ORIGINS.has(origin)
      ? {
          "Access-Control-Allow-Origin": origin,
          "Access-Control-Allow-Methods": "POST, OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type, Authorization",
          "Access-Control-Max-Age": "86400",
          Vary: "Origin",
        }
      : {};
    if (req.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: cors });
    }
    const res = await handler(req);
    for (const [key, value] of Object.entries(cors)) {
      res.headers.set(key, value);
    }
    return res;
  };
}
