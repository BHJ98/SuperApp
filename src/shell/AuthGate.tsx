import { useEffect, useState, type ReactNode } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase, isSupabaseConfigured } from "@/lib/supabase";
import { AuthContext } from "@/lib/auth";

interface AuthGateProps {
  children: ReactNode;
}

type GateState =
  | { kind: "loading" }
  | { kind: "passthrough" }
  | { kind: "signedOut"; oauthError?: string }
  | { kind: "signedIn"; session: Session };

export function AuthGate({ children }: AuthGateProps) {
  const [state, setState] = useState<GateState>(
    isSupabaseConfigured ? { kind: "loading" } : { kind: "passthrough" },
  );

  useEffect(() => {
    if (!supabase) return;
    let active = true;

    // OAuth redirect with an error in the hash means Supabase rejected the
    // sign-in (almost always the Before-User-Created hook denying a
    // non-allow-listed email). Capture it and clear the URL.
    const oauthError = readOauthErrorFromHash();
    if (oauthError) history.replaceState(null, "", window.location.pathname);

    supabase.auth.getSession().then(({ data }) => {
      if (!active) return;
      setState(resolve(data.session, oauthError));
    });

    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      setState(resolve(session, oauthError));
    });

    return () => {
      active = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  if (state.kind === "passthrough") {
    return (
      <AuthContext.Provider value={{ user: null }}>
        <DevBanner />
        {children}
      </AuthContext.Provider>
    );
  }
  if (state.kind === "loading") return <CenteredMessage>Loading…</CenteredMessage>;
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
  const onClick = async () => {
    if (!supabase) return;
    await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: window.location.origin },
    });
  };
  return (
    <CenteredMessage>
      <div className="text-center">
        <h1 className="mb-2 text-2xl font-bold">SuperApp</h1>
        <p className="mb-6 text-slate-400">Sign in to continue.</p>
        <button onClick={onClick} className="btn-primary">
          Sign in with Google
        </button>
      </div>
    </CenteredMessage>
  );
}

function Denied({ reason }: { reason: string }) {
  const onTryAgain = () => supabase?.auth.signOut().then(() => window.location.reload());
  return (
    <CenteredMessage>
      <div className="text-center max-w-sm">
        <h1 className="mb-2 text-2xl font-bold">No access</h1>
        <p className="mb-1 text-slate-400">{reason}</p>
        <p className="mb-6 text-xs text-slate-500">
          This account isn't on the allow-list.
        </p>
        <button onClick={onTryAgain} className="btn-ghost">
          Try a different account
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
    <div className="bg-amber-900/40 border-b border-amber-700/40 px-4 py-1.5 text-center text-[11px] uppercase tracking-wide text-amber-200">
      dev mode — auth disabled (no VITE_SUPABASE_URL)
    </div>
  );
}
