import { useEffect, useState } from "react";
import { SW_NEED_REFRESH_EVENT, applyUpdate, isRefreshPending } from "./sw-update";

/**
 * Small fixed banner shown when a new service-worker version is waiting.
 * Listens for the "sw-need-refresh" CustomEvent dispatched from sw-update.ts.
 */
export function UpdatePrompt() {
  const [visible, setVisible] = useState(isRefreshPending);

  useEffect(() => {
    const onNeedRefresh = () => setVisible(true);
    window.addEventListener(SW_NEED_REFRESH_EVENT, onNeedRefresh);
    return () => window.removeEventListener(SW_NEED_REFRESH_EVENT, onNeedRefresh);
  }, []);

  if (!visible) return null;

  return (
    <div
      role="status"
      className="fixed bottom-4 left-1/2 z-50 flex -translate-x-1/2 items-center gap-3 rounded-xl px-4 py-2.5 shadow-lg"
      style={{ background: "var(--raised)", border: "1px solid var(--border)" }}
    >
      <span className="text-sm whitespace-nowrap" style={{ color: "var(--ink)" }}>
        Nieuwe versie beschikbaar
      </span>
      <button
        onClick={() => applyUpdate()}
        className="text-sm font-semibold whitespace-nowrap transition-opacity hover:opacity-60"
        style={{ color: "var(--ink)" }}
      >
        Vernieuwen
      </button>
      <button
        onClick={() => setVisible(false)}
        className="p-1 rounded transition-opacity hover:opacity-60"
        aria-label="Sluiten"
        style={{ color: "var(--muted)" }}
      >
        <svg width="12" height="12" viewBox="0 0 18 18" fill="none">
          <line x1="1" y1="1" x2="17" y2="17" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          <line x1="17" y1="1" x2="1" y2="17" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        </svg>
      </button>
    </div>
  );
}
