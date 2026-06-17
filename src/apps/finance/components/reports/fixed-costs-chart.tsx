
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";
import { formatCurrency } from "@/apps/finance/lib/utils";

type FixedCostItem = {
  name: string;
  budget: number;
  spent: number;
  costType: "fixed" | "semi_fixed";
};

type Props = {
  fixed: FixedCostItem[];
  semiFix: FixedCostItem[];
};

function CustomTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: Array<{ value: number; name: string; color: string }>;
  label?: string;
}) {
  if (!active || !payload) return null;
  return (
    <div className="rounded-md border bg-background p-3 shadow-sm text-sm">
      <p className="font-medium mb-1">{label}</p>
      {payload.map((p) => (
        <p key={p.name} style={{ color: p.color }}>
          {p.name}: {formatCurrency(p.value)}
        </p>
      ))}
    </div>
  );
}

export function FixedCostsChart({ fixed, semiFix }: Props) {
  const allData = [...fixed, ...semiFix];
  const totalBudget = allData.reduce((sum, d) => sum + d.budget, 0);
  const totalSpent = allData.reduce((sum, d) => sum + d.spent, 0);
  const totalFixedBudget = fixed.reduce((sum, d) => sum + d.budget, 0);
  const totalFixedSpent = fixed.reduce((sum, d) => sum + d.spent, 0);
  const totalSemiBudget = semiFix.reduce((sum, d) => sum + d.budget, 0);
  const totalSemiSpent = semiFix.reduce((sum, d) => sum + d.spent, 0);

  return (
    <div>
      {/* Summary cards */}
      <div className="grid grid-cols-3 gap-3 mb-4">
        <div className="rounded-lg border p-3 text-center">
          <p className="text-xs text-muted-foreground mb-1">Vaste kosten</p>
          <p className="text-lg font-bold font-mono">{formatCurrency(totalFixedSpent)}</p>
          <p className="text-xs text-muted-foreground">van {formatCurrency(totalFixedBudget)}</p>
        </div>
        <div className="rounded-lg border p-3 text-center">
          <p className="text-xs text-muted-foreground mb-1">Semi-vast</p>
          <p className="text-lg font-bold font-mono">{formatCurrency(totalSemiSpent)}</p>
          <p className="text-xs text-muted-foreground">van {formatCurrency(totalSemiBudget)}</p>
        </div>
        <div className="rounded-lg border p-3 text-center">
          <p className="text-xs text-muted-foreground mb-1">Totaal</p>
          <p className="text-lg font-bold font-mono">{formatCurrency(totalSpent)}</p>
          <p className="text-xs text-muted-foreground">van {formatCurrency(totalBudget)}</p>
        </div>
      </div>

      {/* Chart */}
      {allData.length > 0 && (
        <div className="h-[300px]">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={allData}
              margin={{ top: 5, right: 20, left: 10, bottom: 5 }}
            >
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="name" fontSize={12} angle={-30} textAnchor="end" height={60} />
              <YAxis tickFormatter={(v) => `€${v}`} fontSize={12} />
              <Tooltip content={<CustomTooltip />} />
              <Legend />
              <Bar dataKey="budget" name="Budget" fill="#93c5fd" radius={[4, 4, 0, 0]} />
              <Bar dataKey="spent" name="Werkelijk" fill="#3b82f6" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Detailed table */}
      <div className="mt-4 space-y-4">
        {fixed.length > 0 && (
          <div>
            <h4 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-2">
              Vaste kosten
            </h4>
            <div className="space-y-1">
              {fixed.map((item) => (
                <div key={item.name} className="flex justify-between text-sm py-1">
                  <span>{item.name}</span>
                  <span className="font-mono">
                    {formatCurrency(item.spent)} / {formatCurrency(item.budget)}
                  </span>
                </div>
              ))}
              <div className="flex justify-between text-sm font-semibold border-t pt-1">
                <span>Subtotaal vast</span>
                <span className="font-mono">
                  {formatCurrency(totalFixedSpent)} / {formatCurrency(totalFixedBudget)}
                </span>
              </div>
            </div>
          </div>
        )}

        {semiFix.length > 0 && (
          <div>
            <h4 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-2">
              Semi-vaste kosten
            </h4>
            <div className="space-y-1">
              {semiFix.map((item) => (
                <div key={item.name} className="flex justify-between text-sm py-1">
                  <span>{item.name}</span>
                  <span className="font-mono">
                    {formatCurrency(item.spent)} / {formatCurrency(item.budget)}
                  </span>
                </div>
              ))}
              <div className="flex justify-between text-sm font-semibold border-t pt-1">
                <span>Subtotaal semi-vast</span>
                <span className="font-mono">
                  {formatCurrency(totalSemiSpent)} / {formatCurrency(totalSemiBudget)}
                </span>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
