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
            className={`rounded-full px-3 py-1 text-sm font-medium transition ${
              active ? "text-white" : "bg-slate-800 text-slate-400"
            }`}
            style={active ? { backgroundColor: p.color } : undefined}
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
      <div className="-mx-4 -mt-4 flex min-h-[calc(100vh-3.25rem)] flex-col">
        <div className="sticky top-[3.25rem] z-[5] flex items-center justify-between gap-3 border-b border-slate-800 bg-slate-900/90 px-4 py-3 backdrop-blur">
          <div>
            <h2 className="text-base font-bold leading-none">Workout</h2>
            {STORAGE_MODE === "local" && (
              <span className="text-[10px] uppercase tracking-wide text-slate-500">
                local storage
              </span>
            )}
          </div>
          <ProfileToggle />
        </div>

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

        <nav className="fixed inset-x-0 bottom-0 z-10 mx-auto flex max-w-2xl justify-around border-t border-slate-800 bg-slate-900/95 px-2 py-2 backdrop-blur">
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) =>
                `rounded-lg px-3 py-1.5 text-xs font-medium ${
                  isActive ? "bg-slate-800 text-blue-400" : "text-slate-400"
                }`
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
