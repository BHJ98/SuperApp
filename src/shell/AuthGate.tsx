import { useEffect, useState, type ReactNode } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase, isSupabaseConfigured } from "@/lib/supabase";

interface AuthGateProps {
  children: ReactNode;
}

type GateState =
  | { kind: "loading" }
  | { kind: "passthrough" }
  | { kind: "signedOut" }
  | { kind: "signedIn"; session: Session }
  | { kind: "denied"; email: string };

export function AuthGate({ children }: AuthGateProps) {
  const [state, setState] = useState<GateState>(
    isSupabaseConfigured ? { kind: "loading" } : { kind: "passthrough" },
  );

  useEffect(() => {
    if (!supabase) return;
    let active = true;

    supabase.auth.getSession().then(({ data }) => {
      if (!active) return;
      setState(resolve(data.session));
    });

    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      setState(resolve(session));
    });

    return () => {
      active = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  if (state.kind === "passthrough") {
    return (
      <>
        <DevBanner />
        {children}
      </>
    );
  }
  if (state.kind === "loading") return <CenteredMessage>Loading…</CenteredMessage>;
  if (state.kind === "signedOut") return <SignIn />;
  if (state.kind === "denied") return <Denied email={state.email} />;
  return <>{children}</>;
}

// Allow-list check happens server-side via Supabase Before-User-Created hook +
// RLS keyed to allowed_emails (task 2). Until that hook is wired, we let any
// signed-in account through — the client cannot be trusted to gate access.
function resolve(session: Session | null): GateState {
  if (!session) return { kind: "signedOut" };
  return { kind: "signedIn", session };
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

function Denied({ email }: { email: string }) {
  const onSignOut = () => supabase?.auth.signOut();
  return (
    <CenteredMessage>
      <div className="text-center">
        <h1 className="mb-2 text-2xl font-bold">No access</h1>
        <p className="mb-1 text-slate-400">{email}</p>
        <p className="mb-6 text-slate-500 text-sm">
          This account isn't on the allow-list.
        </p>
        <button onClick={onSignOut} className="btn-ghost">
          Sign out
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
