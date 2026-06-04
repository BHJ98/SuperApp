import { Link, useLocation } from "react-router-dom";
import { supabase, isSupabaseConfigured } from "@/lib/supabase";

export function Nav() {
  const location = useLocation();
  const onHome = location.pathname === "/";

  return (
    <header className="sticky top-0 z-10 flex items-center justify-between gap-3 border-b border-slate-800 bg-slate-900/90 px-4 py-3 backdrop-blur">
      <Link to="/" className="flex items-center gap-2">
        <span className="text-lg font-bold leading-none">SuperApp</span>
      </Link>
      <div className="flex items-center gap-2">
        {!onHome && (
          <Link to="/" className="text-sm text-slate-400 hover:text-slate-200">
            Home
          </Link>
        )}
        {isSupabaseConfigured && (
          <button
            onClick={() => supabase?.auth.signOut()}
            className="text-sm text-slate-500 hover:text-slate-300"
          >
            Sign out
          </button>
        )}
      </div>
    </header>
  );
}
