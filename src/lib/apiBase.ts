import { Capacitor } from "@capacitor/core";

// In de native app (Capacitor WebView) is de origin https://localhost, dus
// relatieve /api/-paden komen niet bij Vercel uit. Op web blijft alles
// same-origin en is er geen prefix nodig.
const API_BASE = Capacitor.isNativePlatform()
  ? ((import.meta.env.VITE_API_BASE_URL as string | undefined) ??
    "https://superapp.vercel.app")
  : "";

export function apiUrl(path: string): string {
  return `${API_BASE}${path}`;
}
