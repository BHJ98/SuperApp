import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Capacitor } from "@capacitor/core";
import App from "./shell/App";
import { registerServiceWorker } from "./shell/sw-update";
import "./index.css";

// In de native app zitten de assets al in de APK; een service worker voegt
// niets toe en kan na een app-update juist verouderde assets serveren.
if (!Capacitor.isNativePlatform()) registerServiceWorker();

const queryClient = new QueryClient({
  defaultOptions: { queries: { refetchOnWindowFocus: false } },
});

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </QueryClientProvider>
  </React.StrictMode>,
);
