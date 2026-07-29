import { matchPath, NavLink, Route, Routes, useLocation } from "react-router-dom";
import { ProfileProvider, useProfile } from "./state/profile";
import { STORAGE_MODE } from "./lib/db";
import { useWorkout } from "./queries";
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

// Switching profiles mid-session would silently make progression suggestions
// reflect the wrong person's history for the rest of the workout (a bug
// flagged in an earlier audit) — so the switcher locks while an unfinished
// workout session is on screen.
function useActiveSessionId(): string | undefined {
  const location = useLocation();
  const match = matchPath("/workout/session/:id", location.pathname);
  return match?.params.id;
}

const navItems = [
  { to: "/workout", label: "Home", end: true },
  { to: "/workout/exercises", label: "Exercises" },
  { to: "/workout/routines", label: "Routines" },
  { to: "/workout/history", label: "History" },
  { to: "/workout/stats", label: "Stats" },
];

function ProfileToggle() {
  const { profiles, activeProfile, setActiveProfileId } = useProfile();
  const sessionId = useActiveSessionId();
  const { data: session } = useWorkout(sessionId);
  const locked = !!sessionId && !!session && !session.finishedAt;

  if (profiles.length === 0) return null;
  return (
    <div
      className="flex gap-1.5"
      title={locked ? "Kan niet wisselen tijdens een actieve workout" : undefined}
    >
      {profiles.map((p) => {
        const active = p.id === activeProfile?.id;
        return (
          <button
            key={p.id}
            disabled={locked}
            onClick={() => !locked && setActiveProfileId(p.id)}
            className="rounded-full px-3 py-1 text-sm font-medium transition-opacity hover:opacity-80 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:opacity-40"
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
          className="sticky z-[5] backdrop-blur-md"
          style={{
            top: "calc(3.25rem + var(--safe-top))",
            borderBottom: "1px solid var(--border)",
            background: "color-mix(in srgb, var(--base) 92%, transparent)",
          }}
        >
          <div className="flex items-center justify-between gap-3 px-5 py-3">
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
        </div>

        {/* Page content */}
        <div className="flex-1 w-full px-4 pb-24 pt-4">
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
          className="fixed inset-x-0 bottom-0 z-10 flex justify-around px-2 py-2 backdrop-blur-md"
          style={{
            paddingBottom: "calc(0.5rem + var(--safe-bottom))",
            borderTop: "1px solid var(--border)",
            background: "color-mix(in srgb, var(--base) 95%, transparent)",
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
