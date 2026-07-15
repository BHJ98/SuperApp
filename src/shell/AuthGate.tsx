import { useEffect, useState, type ReactNode } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase, isSupabaseConfigured } from "@/lib/supabase";
import { AuthContext } from "@/lib/auth";
import {
  isNativePlatform,
  nativeGoogleIdToken,
  nativeGoogleSignOut,
} from "@/lib/nativeGoogleAuth";

interface AuthGateProps {
  children: ReactNode;
}

type GateState =
  | { kind: "loading" }
  | { kind: "passthrough" }
  | { kind: "error" }
  | { kind: "signedOut"; oauthError?: string }
  | { kind: "signedIn"; session: Session };

export function AuthGate({ children }: AuthGateProps) {
  const [state, setState] = useState<GateState>(
    isSupabaseConfigured ? { kind: "loading" } : { kind: "passthrough" },
  );
  const [retryCount, setRetryCount] = useState(0);

  useEffect(() => {
    if (!supabase) return;
    let active = true;
    setState({ kind: "loading" });

    const oauthError = readOauthErrorFromHash();
    if (oauthError) history.replaceState(null, "", window.location.pathname);

    supabase.auth
      .getSession()
      .then(({ data }) => {
        if (!active) return;
        setState(resolve(data.session, oauthError));
      })
      .catch((err) => {
        console.error("Failed to load auth session:", err);
        if (!active) return;
        setState({ kind: "error" });
      });

    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      setState(resolve(session, oauthError));
    });

    return () => {
      active = false;
      sub.subscription.unsubscribe();
    };
  }, [retryCount]);

  if (state.kind === "passthrough") {
    return (
      <AuthContext.Provider value={{ user: null }}>
        <DevBanner />
        {children}
      </AuthContext.Provider>
    );
  }
  if (state.kind === "loading") return <CenteredMessage>Loading…</CenteredMessage>;
  if (state.kind === "error") {
    return <LoadError onRetry={() => setRetryCount((n) => n + 1)} />;
  }
  if (state.kind === "signedOut") {
    return state.oauthError ? <Denied reason={state.oauthError} /> : <SignIn />;
  }
  return (
    <AuthContext.Provider value={{ user: state.session.user }}>
      {children}
    </AuthContext.Provider>
  );
}

function resolve(session: Session | null, oauthError: string | undefined): GateState {
  if (!session) return { kind: "signedOut", oauthError };
  return { kind: "signedIn", session };
}

function readOauthErrorFromHash(): string | undefined {
  if (!window.location.hash) return undefined;
  const params = new URLSearchParams(window.location.hash.replace(/^#/, ""));
  const description = params.get("error_description");
  const code = params.get("error");
  if (!description && !code) return undefined;
  return decodeURIComponent(description ?? code ?? "");
}

function SignIn() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onClick = async () => {
    if (!supabase) return;
    if (!isNativePlatform) {
      // Web: OAuth-redirect via de browser, zoals altijd.
      await supabase.auth.signInWithOAuth({
        provider: "google",
        options: { redirectTo: window.location.origin },
      });
      return;
    }
    // Native (Capacitor): Chrome kan geblokkeerd zijn op het toestel, dus
    // geen browser-redirect — Credential Manager geeft een ID-token dat we
    // rechtstreeks bij Supabase inwisselen.
    setBusy(true);
    setError(null);
    try {
      const idToken = await nativeGoogleIdToken();
      const { error: authError } = await supabase.auth.signInWithIdToken({
        provider: "google",
        token: idToken,
      });
      // Allow-list-afwijzing (Before-User-Created hook) komt hier terug als
      // error; bij succes flipt onAuthStateChange de gate naar signedIn.
      if (authError) throw authError;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Inloggen mislukt");
    } finally {
      setBusy(false);
    }
  };

  return (
    <CenteredMessage>
      <div className="w-full max-w-sm text-center">
        <div className="mb-10">
          <h1
            className="font-display text-5xl font-bold tracking-tight leading-none mb-3"
            style={{ color: "var(--ink)" }}
          >
            SuperApp
          </h1>
          <p className="text-sm" style={{ color: "var(--muted)" }}>
            Sign in to continue.
          </p>
        </div>
        <div
          className="rounded-2xl p-6"
          style={{
            background: "var(--surface)",
            border: "1px solid var(--border)",
          }}
        >
          <button
            onClick={onClick}
            disabled={busy}
            className="btn-primary w-full py-3"
          >
            {busy ? "Signing in…" : "Sign in with Google"}
          </button>
          {error && (
            <p className="mt-4 text-sm" style={{ color: "var(--muted)" }}>
              {error}
            </p>
          )}
        </div>
      </div>
    </CenteredMessage>
  );
}

function Denied({ reason }: { reason: string }) {
  const onTryAgain = async () => {
    await nativeGoogleSignOut();
    await supabase?.auth.signOut();
    window.location.reload();
  };
  return (
    <CenteredMessage>
      <div
        className="w-full max-w-sm rounded-2xl p-8 text-center"
        style={{
          background: "var(--surface)",
          border: "1px solid var(--border)",
        }}
      >
        <h1
          className="font-display text-3xl font-bold tracking-tight mb-3"
          style={{ color: "var(--ink)" }}
        >
          No access
        </h1>
        <p className="text-sm mb-1" style={{ color: "var(--muted)" }}>
          {reason}
        </p>
        <p className="text-xs mb-6" style={{ color: "var(--faint)" }}>
          This account isn't on the allow-list.
        </p>
        <button onClick={onTryAgain} className="btn-ghost w-full">
          Try a different account
        </button>
      </div>
    </CenteredMessage>
  );
}

function LoadError({ onRetry }: { onRetry: () => void }) {
  return (
    <CenteredMessage>
      <div
        className="w-full max-w-sm rounded-2xl p-8 text-center"
        style={{
          background: "var(--surface)",
          border: "1px solid var(--border)",
        }}
      >
        <h1
          className="font-display text-2xl font-bold tracking-tight mb-3"
          style={{ color: "var(--ink)" }}
        >
          Kon niet verbinden
        </h1>
        <p className="text-sm mb-6" style={{ color: "var(--muted)" }}>
          Controleer je internetverbinding en probeer het opnieuw.
        </p>
        <button onClick={onRetry} className="btn-primary w-full">
          Opnieuw proberen
        </button>
      </div>
    </CenteredMessage>
  );
}

function CenteredMessage({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-full items-center justify-center p-6">{children}</div>
  );
}

function DevBanner() {
  return (
    <div
      className="px-4 py-1.5 text-center text-[11px] uppercase tracking-widest"
      style={{
        background: "rgba(163, 45, 45, 0.15)",
        borderBottom: "1px solid rgba(163, 45, 45, 0.3)",
        color: "#A42D2D",
      }}
    >
      dev mode — auth disabled
    </div>
  );
}
