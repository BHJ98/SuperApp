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
        muted:   "var(--muted)",
        faint:   "var(--faint)",
        accent:  "var(--accent)",
        // Legacy aliases — keeps existing groceries/bakjes component classes working
        bg:     "var(--bg)",
        gold:   "var(--gold)",
        border: "var(--border)",  // used as border-border in groceries components
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
