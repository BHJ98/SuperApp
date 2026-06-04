import { lazy, Suspense } from "react";
import { Route, Routes } from "react-router-dom";
import { AuthGate } from "./AuthGate";
import { Nav } from "./Nav";
import { Dashboard } from "./Dashboard";

const Workout = lazy(() => import("@/apps/workout"));
const Groceries = lazy(() => import("@/apps/groceries"));
const Finance = lazy(() => import("@/apps/finance"));
const Bakjes = lazy(() => import("@/apps/bakjes"));
const Marblebag = lazy(() => import("@/apps/marblebag"));

export default function App() {
  return (
    <AuthGate>
      <div className="mx-auto flex min-h-full max-w-2xl flex-col">
        <Nav />
        <main className="flex-1 px-4 pb-8 pt-4">
          <Suspense fallback={<div className="text-slate-500">Loading…</div>}>
            <Routes>
              <Route path="/" element={<Dashboard />} />
              <Route path="/workout/*" element={<Workout />} />
              <Route path="/groceries/*" element={<Groceries />} />
              <Route path="/finance/*" element={<Finance />} />
              <Route path="/bakjes/*" element={<Bakjes />} />
              <Route path="/marblebag/*" element={<Marblebag />} />
              <Route path="*" element={<NotFound />} />
            </Routes>
          </Suspense>
        </main>
      </div>
    </AuthGate>
  );
}

function NotFound() {
  return <div className="text-slate-400">Not found.</div>;
}
