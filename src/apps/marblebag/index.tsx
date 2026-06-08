import { useState } from "react";
import TheBag from "./TheBag.jsx";

const expected = import.meta.env.VITE_MARBLEBAG_PASSWORD ?? "";
const STORAGE_KEY = "marblebag.unlocked";

export default function Marblebag() {
  const [unlocked, setUnlocked] = useState(
    () => sessionStorage.getItem(STORAGE_KEY) === "1",
  );
  const [attempt, setAttempt] = useState("");
  const [error, setError] = useState(false);

  if (!unlocked) {
    return (
      <form
        className="card max-w-sm"
        onSubmit={(e) => {
          e.preventDefault();
          if (expected && attempt === expected) {
            sessionStorage.setItem(STORAGE_KEY, "1");
            setUnlocked(true);
          } else {
            setError(true);
          }
        }}
      >
        <h2 className="text-lg font-semibold">Locked</h2>
        <p className="mt-1 text-sm text-slate-400">Password required.</p>
        <input
          className="input mt-3"
          type="password"
          value={attempt}
          onChange={(e) => {
            setAttempt(e.target.value);
            setError(false);
          }}
          autoFocus
        />
        {error && <p className="mt-2 text-sm text-red-400">Wrong password.</p>}
        <button type="submit" className="btn-primary mt-3 w-full">
          Unlock
        </button>
      </form>
    );
  }

  // TheBag is a full-screen, inline-styled experience with its own theming.
  // Break it out of the shell's centered container so it owns the viewport.
  return (
    <div className="-mx-4 -mt-4">
      <TheBag />
    </div>
  );
}
