import type { AgendaEvent } from "../types";

// Google Calendar live sync via Google Identity Services (implicit token flow),
// completely separate from the SuperApp Supabase login. The OAuth flow runs
// inside Bakjes only, requesting just calendar.readonly. The token lives in
// localStorage and is good for ~1 hour; the user clicks "Synchroniseer" again
// when it expires, same as the upstream Bakjesmethode UX.

export const CALENDAR_READONLY_SCOPE =
  "https://www.googleapis.com/auth/calendar.readonly";

declare global {
  interface Window {
    google?: {
      accounts: {
        oauth2: {
          initTokenClient: (config: TokenClientConfig) => TokenClient;
          revoke: (token: string, done?: () => void) => void;
        };
      };
    };
  }
}

interface TokenClientConfig {
  client_id: string;
  scope: string;
  prompt?: string;
  callback: (resp: TokenResponse) => void;
  error_callback?: (err: unknown) => void;
}

interface TokenClient {
  requestAccessToken: (overrideConfig?: { prompt?: string }) => void;
}

export interface TokenResponse {
  access_token?: string;
  expires_in?: number;
  scope?: string;
  error?: string;
  error_description?: string;
}

export interface StoredToken {
  accessToken: string;
  expiresAt: number;
}

const STORAGE_KEY = "superapp.bakjes.calendarToken";

let gisLoaded: Promise<void> | null = null;
let _client: TokenClient | null = null;
let _resolve: ((t: StoredToken) => void) | null = null;
let _reject: ((e: unknown) => void) | null = null;

export function loadGis(): Promise<void> {
  if (typeof window === "undefined") return Promise.reject(new Error("SSR"));
  if (window.google?.accounts?.oauth2) return Promise.resolve();
  if (!gisLoaded) {
    gisLoaded = new Promise((resolve, reject) => {
      const existing = document.querySelector<HTMLScriptElement>(
        'script[src="https://accounts.google.com/gsi/client"]',
      );
      const onLoad = () => resolve();
      const onError = () =>
        reject(new Error("Kon Google Identity Services niet laden."));
      if (existing) {
        existing.addEventListener("load", onLoad);
        existing.addEventListener("error", onError);
        if (window.google?.accounts?.oauth2) resolve();
        return;
      }
      const script = document.createElement("script");
      script.src = "https://accounts.google.com/gsi/client";
      script.async = true;
      script.defer = true;
      script.addEventListener("load", onLoad);
      script.addEventListener("error", onError);
      document.head.appendChild(script);
    });
  }
  return gisLoaded;
}

export function getClientId(): string {
  const id = import.meta.env.VITE_GOOGLE_CLIENT_ID as string | undefined;
  if (!id) {
    throw new Error(
      "VITE_GOOGLE_CLIENT_ID is niet ingesteld in Vercel — Calendar-sync uitgeschakeld.",
    );
  }
  return id;
}

export function loadToken(): StoredToken | null {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as StoredToken;
    if (!parsed.accessToken || !parsed.expiresAt) return null;
    if (parsed.expiresAt < Date.now()) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function saveToken(token: StoredToken): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(token));
}

export function clearToken(): void {
  localStorage.removeItem(STORAGE_KEY);
}

function handleCallback(resp: TokenResponse) {
  if (!_resolve) return;
  const [res, rej] = [_resolve, _reject!];
  _resolve = _reject = null;
  if (resp.error || !resp.access_token) {
    rej(new Error(resp.error_description || resp.error || "OAuth mislukt"));
    return;
  }
  const token: StoredToken = {
    accessToken: resp.access_token,
    expiresAt: Date.now() + (resp.expires_in ?? 3600) * 1000 - 60_000,
  };
  saveToken(token);
  res(token);
}

function handleError(err: unknown) {
  if (!_reject) return;
  const rej = _reject;
  _resolve = _reject = null;
  rej(err);
}

/**
 * Pre-initialize the GIS token client. Call this on component mount so the
 * popup can be triggered synchronously from a click handler (browsers block
 * popups opened after async delays).
 */
export async function initClient(): Promise<void> {
  await loadGis();
  if (_client) return;
  _client = window.google!.accounts.oauth2.initTokenClient({
    client_id: getClientId(),
    scope: CALENDAR_READONLY_SCOPE,
    callback: handleCallback,
    error_callback: handleError,
  });
}

/**
 * Open the OAuth popup synchronously. Must be called from a click handler
 * with no await in front, otherwise popup blockers will trigger.
 * Requires initClient() to have been called first.
 */
export function openPopup(prompt?: string): Promise<StoredToken> {
  if (!_client) {
    throw new Error(
      "GIS client niet geïnitialiseerd. Probeer de pagina te herladen.",
    );
  }
  return new Promise((resolve, reject) => {
    _resolve = resolve;
    _reject = reject;
    _client!.requestAccessToken({ prompt });
  });
}

export async function ensureToken(): Promise<StoredToken> {
  const existing = loadToken();
  if (existing) return existing;
  await initClient();
  return openPopup("");
}

export function signOut(): void {
  const t = loadToken();
  clearToken();
  if (t && window.google?.accounts?.oauth2) {
    window.google.accounts.oauth2.revoke(t.accessToken);
  }
}

// ---- Calendar API ----

const CALENDAR_API = "https://www.googleapis.com/calendar/v3";

interface CalendarEventRaw {
  id: string;
  summary?: string;
  description?: string;
  start?: { dateTime?: string; date?: string };
  end?: { dateTime?: string; date?: string };
}

async function calendarFetch(endpoint: string): Promise<Response> {
  const token = await ensureToken();
  const headers = new Headers();
  headers.set("Authorization", `Bearer ${token.accessToken}`);
  let resp = await fetch(`${CALENDAR_API}${endpoint}`, { headers });
  if (resp.status === 401) {
    clearToken();
    const fresh = await ensureToken();
    headers.set("Authorization", `Bearer ${fresh.accessToken}`);
    resp = await fetch(`${CALENDAR_API}${endpoint}`, { headers });
  }
  return resp;
}

/**
 * Fetch events from the primary calendar in [timeMin, timeMax) and convert
 * them to the AgendaEvent shape the rest of the app uses.
 */
export async function fetchCalendarEvents(
  timeMin: string,
  timeMax: string,
): Promise<AgendaEvent[]> {
  const params = new URLSearchParams({
    timeMin,
    timeMax,
    singleEvents: "true",
    maxResults: "2500",
  });
  const resp = await calendarFetch(`/calendars/primary/events?${params}`);
  if (!resp.ok) {
    if (resp.status === 403) {
      throw new Error(
        "Toestemming voor Calendar ontbreekt. Klik 'Verbind met Google Calendar' opnieuw.",
      );
    }
    throw new Error(`Calendar API fout: ${resp.status}`);
  }
  const json = (await resp.json()) as { items?: CalendarEventRaw[] };
  return (json.items ?? [])
    .map((ce): AgendaEvent | null => {
      const start = ce.start?.dateTime || ce.start?.date;
      const end = ce.end?.dateTime || ce.end?.date;
      if (!start || !end) return null;
      const heelDag = !ce.start?.dateTime;
      return {
        uid: ce.id,
        titel: ce.summary || "",
        beschrijving: ce.description || "",
        start: new Date(start).toISOString(),
        eind: new Date(end).toISOString(),
        heelDag,
      };
    })
    .filter((e): e is AgendaEvent => e !== null);
}
