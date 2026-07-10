import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/lib/supabase";
import { useCurrentUser } from "@/lib/auth";
import { useTheme } from "@/lib/theme";

const appLinks = [
  { to: "/workout",   label: "Workout",      accent: "var(--accent-workout)" },
  { to: "/groceries", label: "Boodschappen", accent: "var(--accent-groceries)" },
  { to: "/finance",   label: "Finance",      accent: "var(--accent-finance)" },
  { to: "/bakjes",    label: "Bakjes",        accent: "var(--accent-bakjes)" },
  { to: "/marblebag", label: "Marblebag",    accent: "var(--accent-marblebag)" },
];

function ThemeToggle() {
  const { theme, toggle } = useTheme();
  return (
    <button
      onClick={toggle}
      className="p-2 rounded-lg transition-opacity hover:opacity-60"
      aria-label={theme === "dark" ? "Schakel naar licht thema" : "Schakel naar donker thema"}
      title={theme === "dark" ? "Licht thema" : "Donker thema"}
      style={{ color: "var(--muted)" }}
    >
      {theme === "dark" ? (
        /* sun */
        <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
          <circle cx="12" cy="12" r="4.2" />
          <path d="M12 2.5v2.4M12 19.1v2.4M2.5 12h2.4M19.1 12h2.4M5 5l1.7 1.7M17.3 17.3 19 19M19 5l-1.7 1.7M6.7 17.3 5 19" />
        </svg>
      ) : (
        /* moon */
        <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <path d="M20.5 14.5A8.5 8.5 0 1 1 9.5 3.5a7 7 0 0 0 11 11Z" />
        </svg>
      )}
    </button>
  );
}

export function Nav() {
  const [open, setOpen] = useState(false);
  const user = useCurrentUser();
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const openButtonRef = useRef<HTMLButtonElement>(null);

  // Focus trap + Escape-to-close + focus restoration, so the overlay behaves
  // like a real modal for keyboard/screen-reader users.
  useEffect(() => {
    if (!open) return;
    closeButtonRef.current?.focus();

    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        setOpen(false);
        return;
      }
      if (e.key !== "Tab" || !menuRef.current) return;
      const focusable = menuRef.current.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled])',
      );
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      openButtonRef.current?.focus();
    };
  }, [open]);

  return (
    <>
      {/* ── Top bar ── */}
      <header
        className="sticky top-0 z-10 flex items-center justify-between px-5 py-4 backdrop-blur-md"
        style={{
          background: "color-mix(in srgb, var(--base) 88%, transparent)",
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

        <div className="flex items-center gap-1">
          <ThemeToggle />
          <button
            ref={openButtonRef}
            onClick={() => setOpen(true)}
            className="flex flex-col justify-center gap-[5px] p-2 rounded-lg transition-opacity hover:opacity-60"
            aria-label="Open menu"
          >
            <span className="block h-px w-5" style={{ background: "var(--ink)" }} />
            <span className="block h-px w-5" style={{ background: "var(--ink)" }} />
            <span className="block h-px w-5" style={{ background: "var(--ink)" }} />
          </button>
        </div>
      </header>

      {/* ── Full-screen overlay menu ── */}
      {open && (
        <div
          ref={menuRef}
          role="dialog"
          aria-modal="true"
          aria-label="Menu"
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
              ref={closeButtonRef}
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
