/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx,jsx}"],
  theme: {
    extend: {
      colors: {
        // Global design tokens
        base:    "var(--base)",
        surface: "var(--surface)",
        raised:  "var(--raised)",
        ink:     "var(--ink)",
        muted:   { DEFAULT: "var(--muted)", foreground: "var(--muted)" },
        faint:   "var(--faint)",
        accent:  { DEFAULT: "var(--accent)", foreground: "var(--ink)" },
        // Legacy aliases — keeps existing groceries/bakjes component classes working
        bg:     "var(--bg)",
        gold:   "var(--gold)",
        border: "var(--border)",  // used as border-border in groceries components
        // shadcn semantic names — used by the ported Finance app. Mapped onto
        // SuperApp's palette so Finance renders in the same dark theme as the
        // rest of the app. Additive: no existing app references these names.
        background: "var(--base)",
        foreground: "var(--ink)",
        input:      "var(--border)",
        ring:       "var(--faint)",
        primary:     { DEFAULT: "var(--accent-finance)", foreground: "#f0f0f8" },
        secondary:   { DEFAULT: "var(--raised)",         foreground: "var(--ink)" },
        destructive: { DEFAULT: "#ef4444",               foreground: "#f0f0f8" },
        card:        { DEFAULT: "var(--surface)",        foreground: "var(--ink)" },
        popover:     { DEFAULT: "var(--raised)",         foreground: "var(--ink)" },
      },
      fontFamily: {
        // Syne is the new display font — remap font-bebas so existing classes get Syne
        display: ["Syne", "system-ui", "sans-serif"],
        bebas:   ["Syne", "system-ui", "sans-serif"],
        sans:    ["DM Sans", "system-ui", "sans-serif"],
      },
      letterSpacing: {
        widest2: "0.2em",
      },
    },
  },
  plugins: [],
};
