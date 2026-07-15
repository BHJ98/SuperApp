import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "nl.bhj.superapp",
  appName: "SuperApp",
  webDir: "dist",
  // WebView-origin wordt https://localhost — moet overeenkomen met de
  // CORS-allowlist in api/_cors.ts.
  server: { androidScheme: "https" },
  plugins: {
    StatusBar: {
      style: "DARK",
      backgroundColor: "#141416",
      overlaysWebView: false,
    },
  },
};

export default config;
