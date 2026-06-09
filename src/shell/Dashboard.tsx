import { Link } from "react-router-dom";

const apps = [
  {
    to: "/workout",
    label: "Workout",
    description: "Routines, sets & progressive overload",
    accent: "#3636BA",
  },
  {
    to: "/groceries",
    label: "Boodschappen",
    description: "Recipes, meal planning & shopping",
    accent: "#E2E4DC",
  },
  {
    to: "/finance",
    label: "Finance",
    description: "Spending, accounts & budgets",
    accent: "#264319",
  },
  {
    to: "/bakjes",
    label: "Bakjes",
    description: "Budget envelope method",
    accent: "#A42D2D",
  },
];

export function Dashboard() {
  return (
    <div className="-mx-4 -mt-4">
      <ul className="group">
        {apps.map((app) => (
          <li
            key={app.to}
            className="border-b transition-opacity duration-150 group-hover:opacity-40 hover:!opacity-100"
            style={{ borderColor: "var(--border)" }}
          >
            <Link
              to={app.to}
              className="flex items-center justify-between gap-4 px-5 py-7 sm:px-8 sm:py-9"
            >
              <div className="flex items-start gap-4 min-w-0">
                <span
                  className="mt-2 shrink-0 h-2 w-2 rounded-full"
                  style={{ background: app.accent }}
                />
                <div className="min-w-0">
                  <div
                    className="font-display text-3xl font-semibold tracking-tight leading-none sm:text-5xl"
                    style={{ color: "var(--ink)" }}
                  >
                    {app.label}
                  </div>
                  <div
                    className="mt-2 text-sm leading-snug"
                    style={{ color: "var(--muted)" }}
                  >
                    {app.description}
                  </div>
                </div>
              </div>

              <span
                className="shrink-0 text-xl font-light"
                style={{ color: app.accent }}
              >
                →
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
