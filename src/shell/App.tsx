import { lazy, Suspense } from "react";
import { Route, Routes } from "react-router-dom";
import { AuthGate } from "./AuthGate";
import { Nav } from "./Nav";
import { Dashboard } from "./Dashboard";

const Workout   = lazy(() => import("@/apps/workout"));
const Groceries = lazy(() => import("@/apps/groceries"));
const Finance   = lazy(() => import("@/apps/finance"));
const Bakjes    = lazy(() => import("@/apps/bakjes"));
const Marblebag = lazy(() => import("@/apps/marblebag"));

export default function App() {
  return (
    <AuthGate>
      <div className="flex min-h-full flex-col">
        {/* Nav spans full width on all screen sizes */}
        <Nav />
        {/* Content column is max-w-2xl centered */}
        <main className="mx-auto w-full max-w-2xl flex-1 px-4 pb-8 pt-4">
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
              <Route path="*"            element={<NotFound />} />
            </Routes>
          </Suspense>
        </main>
      </div>
    </AuthGate>
  );
}

function NotFound() {
  return (
    <div className="pt-12 text-center text-sm" style={{ color: "var(--muted)" }}>
      Page not found.
    </div>
  );
}
