"use client";
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from "recharts";
import type { PercentageReport } from "../lib/bakjes/percentages";

export function BakjesDonut({ report }: { report: PercentageReport }) {
  const data = report.perBakje
    .filter((b) => b.minuten > 0)
    .map((b) => ({
      naam: b.bakje.naam,
      kleur: b.bakje.kleur,
      minuten: b.minuten,
    }));
  if (report.ongecategoriseerd.minuten > 0) {
    data.push({
      naam: "Ongecategoriseerd",
      kleur: "#94a3b8",
      minuten: report.ongecategoriseerd.minuten,
    });
  }
  if (data.length === 0) {
    return (
      <div className="h-64 flex items-center justify-center text-sm text-slate-500">
        Geen events in deze week.
      </div>
    );
  }
  return (
    <div className="h-64 w-full">
      <ResponsiveContainer>
        <PieChart>
          <Pie
            data={data}
            dataKey="minuten"
            nameKey="naam"
            innerRadius="55%"
            outerRadius="85%"
            strokeWidth={0}
            paddingAngle={1}
          >
            {data.map((d, i) => (
              <Cell key={i} fill={d.kleur} />
            ))}
          </Pie>
          <Tooltip
            formatter={(value: number) => {
              const u = Math.floor(value / 60);
              const m = value % 60;
              return u === 0 ? `${m}m` : m === 0 ? `${u}u` : `${u}u ${m}m`;
            }}
          />
        </PieChart>
      </ResponsiveContainer>
    </div>
  );
}
