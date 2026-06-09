import { useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/lib/supabase";
import { useCurrentUser } from "@/lib/auth";

const appLinks = [
  { to: "/workout",   label: "Workout",      accent: "#3636BA" },
  { to: "/groceries", label: "Boodschappen", accent: "#E2E4DC" },
  { to: "/finance",   label: "Finance",      accent: "#264319" },
  { to: "/bakjes",    label: "Bakjes",        accent: "#A42D2D" },
  { to: "/marblebag", label: "Marblebag",    accent: "#1d8787" },
];

export function Nav() {
  const [open, setOpen] = useState(false);
  const user = useCurrentUser();

  return (
    <>
      {/* ── Top bar ── */}
      <header
        className="sticky top-0 z-10 flex items-center justify-between px-5 py-4 backdrop-blur-md"
        style={{
          background: "rgba(10, 10, 15, 0.88)",
          borderBottom: "1px solid var(--border)",
        }}
      >
        <Link
          to="/"
          className="font-display text-base font-semibold tracking-tight leading-none transition-opacity hover:opacity-60"
          style={{ color: "var(--ink)" }}
        >
          SuperApp
        </Link>

        <button
          onClick={() => setOpen(true)}
          className="flex flex-col justify-center gap-[5px] p-2 rounded-lg transition-opacity hover:opacity-60"
          aria-label="Open menu"
        >
          <span className="block h-px w-5" style={{ background: "var(--ink)" }} />
          <span className="block h-px w-5" style={{ background: "var(--ink)" }} />
          <span className="block h-px w-5" style={{ background: "var(--ink)" }} />
        </button>
      </header>

      {/* ── Full-screen overlay menu ── */}
      {open && (
        <div
          className="fixed inset-0 z-50 flex flex-col px-6 pt-5 pb-8"
          style={{ background: "var(--base)" }}
        >
          {/* Header row */}
          <div className="flex items-center justify-between mb-10">
            <span
              className="font-display text-base font-semibold tracking-tight"
              style={{ color: "var(--faint)" }}
            >
              SuperApp
            </span>
            <button
              onClick={() => setOpen(false)}
              className="p-2 rounded-lg transition-opacity hover:opacity-60"
              aria-label="Close menu"
              style={{ color: "var(--muted)" }}
            >
              <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
                <line x1="1" y1="1" x2="17" y2="17" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                <line x1="17" y1="1" x2="1" y2="17" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
              </svg>
            </button>
          </div>

          {/* App links */}
          <nav className="flex-1">
            <ul className="group">
              {appLinks.map((app) => (
                <li
                  key={app.to}
                  className="border-b"
                  style={{ borderColor: "var(--border)" }}
                >
                  <Link
                    to={app.to}
                    onClick={() => setOpen(false)}
                    className="group-hover:opacity-40 hover:!opacity-100 flex items-center gap-4 py-5 transition-opacity duration-150"
                  >
                    <span
                      className="shrink-0 h-2 w-2 rounded-full"
                      style={{ background: app.accent }}
                    />
                    <span
                      className="font-display text-3xl font-semibold tracking-tight leading-none sm:text-4xl"
                      style={{ color: "var(--ink)" }}
                    >
                      {app.label}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </nav>

          {/* Footer */}
          <div
            className="pt-6 flex items-center justify-between"
            style={{ borderTop: "1px solid var(--border)" }}
          >
            {user ? (
              <>
                <span
                  className="text-sm truncate max-w-[200px]"
                  style={{ color: "var(--muted)" }}
                >
                  {user.email}
                </span>
                <button
                  onClick={() => {
                    supabase?.auth.signOut();
                    setOpen(false);
                  }}
                  className="text-sm transition-opacity hover:opacity-60"
                  style={{ color: "var(--muted)" }}
                >
                  Sign out
                </button>
              </>
            ) : (
              <span className="text-sm" style={{ color: "var(--faint)" }}>
                Not signed in
              </span>
            )}
          </div>
        </div>
      )}
    </>
  );
}
