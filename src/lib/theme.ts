import { useEffect, useState } from "react";

export type Theme = "light" | "dark";

const STORAGE_KEY = "superapp-theme";

function systemTheme(): Theme {
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

/** The theme currently in effect: the stored choice, else the OS preference. */
export function effectiveTheme(): Theme {
  const stored = localStorage.getItem(STORAGE_KEY);
  if (stored === "light" || stored === "dark") return stored;
  return systemTheme();
}

function apply(theme: Theme) {
  document.documentElement.dataset.theme = theme;
  localStorage.setItem(STORAGE_KEY, theme);
  // Keep the browser chrome colour in sync (both media-scoped meta tags,
  // since an explicit choice overrides the OS preference).
  const color = theme === "dark" ? "#141416" : "#F7F7F4";
  document
    .querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]')
    .forEach((m) => (m.content = color));
}

export function useTheme(): { theme: Theme; toggle: () => void } {
  const [theme, setTheme] = useState<Theme>(() => effectiveTheme());

  // Follow OS changes while the user hasn't made an explicit choice.
  useEffect(() => {
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => {
      if (!localStorage.getItem(STORAGE_KEY)) setTheme(systemTheme());
    };
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  const toggle = () => {
    const next: Theme = effectiveTheme() === "dark" ? "light" : "dark";
    apply(next);
    setTheme(next);
  };

  return { theme, toggle };
}
