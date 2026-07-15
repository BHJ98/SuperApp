import { Capacitor } from "@capacitor/core";
import { SocialLogin } from "@capgo/capacitor-social-login";

export const isNativePlatform = Capacitor.isNativePlatform();

let initialized = false;

async function ensureInit(): Promise<void> {
  if (initialized) return;
  const webClientId = import.meta.env.VITE_GOOGLE_CLIENT_ID as
    | string
    | undefined;
  if (!webClientId) {
    throw new Error("VITE_GOOGLE_CLIENT_ID ontbreekt in deze build.");
  }
  // webClientId (niet de Android-client-ID) is de audience van het ID-token;
  // Supabase controleert daartegen bij signInWithIdToken.
  await SocialLogin.initialize({ google: { webClientId } });
  initialized = true;
}

// Geen nonce meesturen: Supabase wijst tokens af met een nonce die het niet
// zelf heeft uitgegeven.
export async function nativeGoogleIdToken(): Promise<string> {
  await ensureInit();
  const { result } = await SocialLogin.login({
    provider: "google",
    options: {},
  });
  const idToken =
    result.responseType === "online" ? result.idToken : null;
  if (!idToken) throw new Error("Google gaf geen ID-token terug.");
  return idToken;
}

// Wist de Credential Manager-state, zodat een volgende login weer de
// accountkiezer toont in plaats van stil hetzelfde account te pakken.
export async function nativeGoogleSignOut(): Promise<void> {
  if (!isNativePlatform) return;
  try {
    await ensureInit();
    await SocialLogin.logout({ provider: "google" });
  } catch {
    // Best effort — uitloggen bij Supabase is al gebeurd of volgt.
  }
}
