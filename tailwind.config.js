/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx,jsx}"],
  theme: {
    extend: {
      colors: {
        // Global design tokens (theme-aware via CSS variables)
        base:    "var(--base)",
        surface: "var(--surface)",
        raised:  "var(--raised)",
        subtle:  "var(--subtle)",
        ink:     "var(--ink)",
        muted:   { DEFAULT: "var(--muted)", foreground: "var(--muted)" },
        faint:   "var(--faint)",
        accent:  { DEFAULT: "var(--accent)", foreground: "var(--ink)" },
        // Semantic
        ok:      { DEFAULT: "var(--ok)",     soft: "var(--ok-soft)" },
        warn:    { DEFAULT: "var(--warn)",   soft: "var(--warn-soft)" },
        danger:  { DEFAULT: "var(--danger)", soft: "var(--danger-soft)" },
        info:    { DEFAULT: "var(--info)",   soft: "var(--info-soft)" },
        // Legacy aliases — keeps existing groceries/bakjes component classes working
        bg:     "var(--bg)",
        gold:   "var(--gold)",
        border: "var(--border)",  // used as border-border in groceries components
        // shadcn semantic names — used by the ported Finance app. Mapped onto
        // SuperApp's palette so Finance renders in the shared theme.
        background: "var(--base)",
        foreground: "var(--ink)",
        input:      "var(--border-strong)",
        ring:       "var(--info)",
        primary:     { DEFAULT: "var(--primary)", foreground: "var(--primary-ink)" },
        secondary:   { DEFAULT: "var(--subtle)",  foreground: "var(--ink)" },
        destructive: { DEFAULT: "var(--danger)",  foreground: "#ffffff" },
        card:        { DEFAULT: "var(--surface)", foreground: "var(--ink)" },
        popover:     { DEFAULT: "var(--raised)",  foreground: "var(--ink)" },
      },
      boxShadow: {
        e1: "var(--shadow-1)",
        e2: "var(--shadow-2)",
        e3: "var(--shadow-3)",
      },
      fontFamily: {
        // Syne is the brand/display face — remap font-bebas so existing classes get Syne
        display: ["Syne", "system-ui", "sans-serif"],
        bebas:   ["Syne", "system-ui", "sans-serif"],
        sans: [
          "-apple-system", "BlinkMacSystemFont", "Segoe UI", "Roboto",
          "Helvetica Neue", "Arial", "sans-serif",
        ],
      },
      letterSpacing: {
        widest2: "0.2em",
      },
    },
  },
  plugins: [],
};
