import { lazy, Suspense, useEffect, type ReactNode } from "react";
import { Route, Routes, useLocation } from "react-router-dom";
import { App as CapApp } from "@capacitor/app";
import { StatusBar, Style } from "@capacitor/status-bar";
import { isNativePlatform } from "@/lib/nativeGoogleAuth";
import { AuthGate } from "./AuthGate";
import { Nav } from "./Nav";
import { Dashboard } from "./Dashboard";
import { ErrorBoundary } from "./ErrorBoundary";
import { UpdatePrompt } from "./UpdatePrompt";
import { ToastProvider } from "@/lib/toast";

const Workout   = lazy(() => import("@/apps/workout"));
const Groceries = lazy(() => import("@/apps/groceries"));
const Finance   = lazy(() => import("@/apps/finance"));
const Bakjes    = lazy(() => import("@/apps/bakjes"));
const Marblebag = lazy(() => import("@/apps/marblebag"));
const Verbouwing = lazy(() => import("@/apps/verbouwing"));

export default function App() {
  useNativeShell();
  return (
    <AuthGate>
      <ToastProvider>
      <div className="flex min-h-full flex-col">
        {/* Nav spans full width on all screen sizes */}
        <Nav />
        {/* Full-width content column — apps span the whole viewport. */}
        <main className="w-full flex-1 px-4 pb-8 pt-4">
          <RouteErrorBoundary>
            <Suspense
              fallback={
                <div className="pt-12 text-center text-sm" style={{ color: "var(--muted)" }}>
                  Loading…
                </div>
              }
            >
              <Routes>
                <Route path="/"            element={<Dashboard />} />
                <Route path="/workout/*"   element={<Workout />} />
                <Route path="/groceries/*" element={<Groceries />} />
                <Route path="/finance/*"   element={<Finance />} />
                <Route path="/bakjes/*"    element={<Bakjes />} />
                <Route path="/marblebag/*" element={<Marblebag />} />
                <Route path="/verbouwing/*" element={<Verbouwing />} />
                <Route path="*"            element={<NotFound />} />
              </Routes>
            </Suspense>
          </RouteErrorBoundary>
        </main>
      </div>
      <UpdatePrompt />
      </ToastProvider>
    </AuthGate>
  );
}

// Android-shell (Capacitor): hardware-terugknop volgt de router-history in
// plaats van de app te sluiten, en de statusbalk krijgt de thema-achtergrond.
function useNativeShell() {
  useEffect(() => {
    if (!isNativePlatform) return;
    void StatusBar.setBackgroundColor({ color: "#141416" });
    void StatusBar.setStyle({ style: Style.Dark });
    const handle = CapApp.addListener("backButton", ({ canGoBack }) => {
      if (canGoBack) window.history.back();
      else void CapApp.minimizeApp();
    });
    return () => {
      void handle.then((h) => h.remove());
    };
  }, []);
}

function RouteErrorBoundary({ children }: { children: ReactNode }) {
  const location = useLocation();
  // Key on the top-level app segment so a crash in one app resets once the
  // user navigates to a different app, rather than staying stuck forever.
  const appSegment = location.pathname.split("/")[1] ?? "";
  return <ErrorBoundary key={appSegment}>{children}</ErrorBoundary>;
}

function NotFound() {
  return (
    <div className="pt-12 text-center text-sm" style={{ color: "var(--muted)" }}>
      Page not found.
    </div>
  );
}
