import { NavLink, Route, Routes } from "react-router-dom";
import { ProfileProvider, useProfile } from "./state/profile";
import { STORAGE_MODE } from "./lib/db";
import Home from "./pages/Home";
import Exercises from "./pages/Exercises";
import ExerciseForm from "./pages/ExerciseForm";
import ExerciseDetail from "./pages/ExerciseDetail";
import Routines from "./pages/Routines";
import RoutineEdit from "./pages/RoutineEdit";
import Workout from "./pages/Workout";
import History from "./pages/History";
import WorkoutDetail from "./pages/WorkoutDetail";
import Stats from "./pages/Stats";

const navItems = [
  { to: "/workout", label: "Home", end: true },
  { to: "/workout/exercises", label: "Exercises" },
  { to: "/workout/routines", label: "Routines" },
  { to: "/workout/history", label: "History" },
  { to: "/workout/stats", label: "Stats" },
];

function ProfileToggle() {
  const { profiles, activeProfile, setActiveProfileId } = useProfile();
  if (profiles.length === 0) return null;
  return (
    <div className="flex gap-1.5">
      {profiles.map((p) => {
        const active = p.id === activeProfile?.id;
        return (
          <button
            key={p.id}
            onClick={() => setActiveProfileId(p.id)}
            className="rounded-full px-3 py-1 text-sm font-medium transition-opacity hover:opacity-80"
            style={
              active
                ? { backgroundColor: p.color, color: "#fff" }
                : { background: "var(--raised)", color: "var(--muted)" }
            }
          >
            {p.name}
          </button>
        );
      })}
    </div>
  );
}

export default function WorkoutApp() {
  return (
    <ProfileProvider>
      <div
        className="-mx-4 -mt-4 flex min-h-[calc(100vh-3.25rem)] flex-col"
        data-app="workout"
      >
        {/* Sub-header */}
        <div
          className="sticky top-[3.25rem] z-[5] flex items-center justify-between gap-3 px-5 py-3 backdrop-blur-md"
          style={{
            borderBottom: "1px solid var(--border)",
            background: "rgba(10, 10, 15, 0.92)",
          }}
        >
          <div>
            <h2
              className="font-display text-base font-semibold leading-none tracking-tight"
              style={{ color: "var(--ink)" }}
            >
              Workout
            </h2>
            {STORAGE_MODE === "local" && (
              <span
                className="text-[10px] uppercase tracking-widest"
                style={{ color: "var(--muted)" }}
              >
                local
              </span>
            )}
          </div>
          <ProfileToggle />
        </div>

        {/* Page content */}
        <div className="flex-1 px-4 pb-24 pt-4">
          <Routes>
            <Route index element={<Home />} />
            <Route path="exercises" element={<Exercises />} />
            <Route path="exercises/new" element={<ExerciseForm />} />
            <Route path="exercises/:id/edit" element={<ExerciseForm />} />
            <Route path="exercises/:id" element={<ExerciseDetail />} />
            <Route path="routines" element={<Routines />} />
            <Route path="routines/new" element={<RoutineEdit />} />
            <Route path="routines/:id/edit" element={<RoutineEdit />} />
            <Route path="session/:id" element={<Workout />} />
            <Route path="history" element={<History />} />
            <Route path="history/:id" element={<WorkoutDetail />} />
            <Route path="stats" element={<Stats />} />
          </Routes>
        </div>

        {/* Bottom tab nav */}
        <nav
          className="fixed inset-x-0 bottom-0 z-10 mx-auto flex max-w-2xl justify-around px-2 py-2 backdrop-blur-md"
          style={{
            borderTop: "1px solid var(--border)",
            background: "rgba(10, 10, 15, 0.95)",
          }}
        >
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className="rounded-lg px-3 py-1.5 text-xs font-medium transition-all"
              style={({ isActive }) =>
                isActive
                  ? { background: "var(--accent-workout)", color: "#fff" }
                  : { color: "var(--muted)" }
              }
            >
              {item.label}
            </NavLink>
          ))}
        </nav>
      </div>
    </ProfileProvider>
  );
}
