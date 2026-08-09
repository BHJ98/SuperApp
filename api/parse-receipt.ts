// Vercel serverless function: read line items off a receipt photo with Claude
// vision, for the Verbouwing app's split editor. Only invoked on explicit user
// request ("Bon uitlezen met AI" inside the split flow) — never automatically —
// to keep API usage minimal. Reuses the ANTHROPIC_API_KEY already configured
// for api/extract.ts.
import Anthropic from "@anthropic-ai/sdk";

export const config = { maxDuration: 30 };

const MAX_IMAGE_BYTES = 5 * 1024 * 1024; // ~5MB base64 payload cap

/**
 * Verifieert het meegestuurde Supabase-access-token bij de Supabase-auth-API.
 * Aanmelden is beperkt tot de allow-list (gesloten registratie), dus een geldig
 * token = een toegestane gebruiker. Zonder dit zou dit een open, geld-kostende
 * proxy naar de Anthropic-API zijn.
 */
async function isAuthenticated(req: Request): Promise<boolean> {
  const authHeader = req.headers.get("authorization") ?? "";
  const token = authHeader.replace(/^Bearer\s+/i, "").trim();
  if (!token) return false;
  const url = process.env.VITE_SUPABASE_URL;
  const anonKey = process.env.VITE_SUPABASE_ANON_KEY;
  if (!url || !anonKey) return false;
  try {
    const res = await fetch(`${url}/auth/v1/user`, {
      headers: { apikey: anonKey, Authorization: `Bearer ${token}` },
    });
    return res.ok;
  } catch {
    return false;
  }
}

export default async function handler(req: Request): Promise<Response> {
  if (req.method !== "POST") {
    return Response.json({ error: "Method not allowed" }, { status: 405 });
  }

  if (!(await isAuthenticated(req))) {
    return Response.json({ error: "Niet geautoriseerd" }, { status: 401 });
  }

  let body: { image?: string; mediaType?: string };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Ongeldige aanvraag" }, { status: 400 });
  }

  const image = body.image ?? "";
  const mediaType = body.mediaType ?? "image/jpeg";
  if (!image) {
    return Response.json({ error: "Geen afbeelding meegestuurd" }, { status: 400 });
  }
  if (image.length > MAX_IMAGE_BYTES * 1.4) {
    return Response.json({ error: "Bestand te groot (max ~5MB)" }, { status: 400 });
  }
  if (!["image/jpeg", "image/png", "image/webp", "application/pdf"].includes(mediaType)) {
    return Response.json({ error: "Alleen JPEG/PNG/WebP/PDF wordt ondersteund" }, { status: 400 });
  }

  const sourceBlock: Anthropic.ContentBlockParam =
    mediaType === "application/pdf"
      ? {
          type: "document",
          source: { type: "base64", media_type: "application/pdf", data: image },
        }
      : {
          type: "image",
          source: {
            type: "base64",
            media_type: mediaType as "image/jpeg" | "image/png" | "image/webp",
            data: image,
          },
        };

  const client = new Anthropic();
  try {
    const msg = await client.messages.create({
      model: "claude-sonnet-5",
      max_tokens: 2000,
      messages: [
        {
          role: "user",
          content: [
            sourceBlock,
            {
              type: "text",
              text:
                "Dit is een kassabon of factuur (Nederlands). Lees de individuele " +
                "regelitems uit. Antwoord UITSLUITEND met JSON in dit formaat, geen " +
                "andere tekst:\n" +
                '{"supplier": "winkelnaam of null", "date": "YYYY-MM-DD of null", ' +
                '"total": 123.45, "lines": [{"description": "omschrijving", "amount": 12.34}]}\n' +
                "Bedragen als positieve getallen met punt als decimaalteken. Sla " +
                "kortingsregels op als negatieve amounts. Statiegeld, emballage en " +
                "btw-subtotalen niet als aparte regels opnemen tenzij ze het totaal " +
                "beïnvloeden. Als de bon onleesbaar is, geef {\"error\": \"onleesbaar\"}.",
            },
          ],
        },
      ],
    });

    const text = msg.content
      .filter((b): b is Anthropic.TextBlock => b.type === "text")
      .map((b) => b.text)
      .join("");
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) {
      return Response.json({ error: "Kon de bon niet uitlezen" }, { status: 422 });
    }
    const parsed = JSON.parse(match[0]);
    if (parsed.error) {
      return Response.json({ error: "Bon is onleesbaar — probeer een scherpere foto" }, { status: 422 });
    }
    return Response.json(parsed);
  } catch (err) {
    console.error("parse-receipt failed:", err);
    return Response.json({ error: "Bon uitlezen mislukt — probeer het opnieuw" }, { status: 500 });
  }
}
