// Vercel serverless function: extract a recipe from a webpage URL using Claude.
// Lives outside src/ so Vercel deploys it as a Node function alongside the Vite
// static build. Requires ANTHROPIC_API_KEY in the Vercel project env.
//
// Note: the original Boodschappen app also handled social-media URLs (Instagram/
// TikTok) by downloading audio with yt-dlp + Whisper. That can't run on Vercel's
// serverless runtime, so it's dropped here — social URLs fall back to the plain
// HTML path, which usually yields little. Normal recipe sites work well.
import Anthropic from "@anthropic-ai/sdk";

export const config = { maxDuration: 30 };

async function fetchPageContent(url: string): Promise<string> {
  const res = await fetch(url, {
    headers: {
      "User-Agent": "Mozilla/5.0 (compatible; SuperApp/1.0; recipe extractor)",
      Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    },
  });
  if (!res.ok) throw new Error(`Kon pagina niet ophalen: ${res.status}`);
  const html = await res.text();
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 12000);
}

const PROMPT = (pageContent: string) =>
  `Je bent een recept-extractie assistent. Analyseer de volgende tekst en extraheer het recept.

Geef het resultaat als JSON met exact dit formaat:
{
  "title": "Naam van het gerecht",
  "servings": <aantal personen als nummer, of null als onbekend>,
  "ingredients": [ { "name": "ingredient naam", "amount": "hoeveelheid", "unit": "eenheid" } ],
  "instructions": [ "Stap 1...", "Stap 2..." ]
}

Regels:
- Antwoord ALLEEN met geldige JSON, geen andere tekst
- Vertaal ingrediënten en instructies naar het Nederlands als ze in een andere taal zijn
- Als amount of unit niet duidelijk is, gebruik dan een lege string ""
- Splits samengestelde ingrediënten op in aparte items
- Nummer de instructies niet, geef ze als losse strings

Tekst:
${pageContent}`;

export default async function handler(req: Request): Promise<Response> {
  if (req.method !== "POST") {
    return Response.json({ error: "Method not allowed" }, { status: 405 });
  }
  if (!process.env.ANTHROPIC_API_KEY) {
    return Response.json(
      { error: "ANTHROPIC_API_KEY is niet ingesteld op de server." },
      { status: 500 },
    );
  }
  try {
    const { url } = (await req.json()) as { url?: string };
    if (!url || typeof url !== "string") {
      return Response.json({ error: "URL is verplicht" }, { status: 400 });
    }

    const pageContent = await fetchPageContent(url);
    const anthropic = new Anthropic();
    const message = await anthropic.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 2048,
      messages: [{ role: "user", content: PROMPT(pageContent) }],
    });

    const block = message.content[0];
    if (block.type !== "text") throw new Error("Onverwacht antwoord van AI");
    const match = block.text.match(/\{[\s\S]*\}/);
    if (!match) throw new Error("Kon geen recept herkennen in de pagina");
    const recipe = JSON.parse(match[0]);

    return Response.json({ ...recipe, sourceUrl: url });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Er ging iets mis";
    return Response.json({ error: msg }, { status: 500 });
  }
}
