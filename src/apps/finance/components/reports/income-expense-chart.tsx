
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
  ReferenceLine,
} from "recharts";
import { formatCurrency } from "@/apps/finance/lib/utils";
import { formatChangePercent, formatChangeCurrency } from "@/apps/finance/lib/report-helpers";
import { TrendingUp, TrendingDown } from "lucide-react";

type MonthData = {
  label: string;
  income: number;
  expenses: number;
  net: number;
};

type ComparisonData = {
  currentLabel: string;
  previousLabel: string;
  current: { income: number; expenses: number; net: number };
  previous: { income: number; expenses: number; net: number };
};

type Props = {
  data: MonthData[];
  comparison?: ComparisonData;
};

function CustomTooltip({ active, payload, label }: { active?: boolean; payload?: Array<{ value: number; name: string; color: string }>; label?: string }) {
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

export function IncomeExpenseChart({ data, comparison }: Props) {
  return (
    <div>
      {/* Comparison summary */}
      {comparison && (
        <div className="grid grid-cols-3 gap-3 mb-4">
          {(["income", "expenses", "net"] as const).map((key) => {
            const labels = { income: "Inkomsten", expenses: "Uitgaven", net: "Netto" };
            const curr = comparison.current[key];
            const prev = comparison.previous[key];
            const change = formatChangePercent(
              curr,
              prev
            );
            const changeCur = formatChangeCurrency(curr, prev);
            const isExpense = key === "expenses";
            // For expenses, going down is good. For income/net, going up is good.
            const positive = isExpense ? curr <= prev : curr >= prev;

            return (
              <div key={key} className="rounded-lg border p-3 text-center">
                <p className="text-xs text-muted-foreground mb-1">{labels[key]}</p>
                <p className="text-lg font-bold font-mono">{formatCurrency(curr)}</p>
                <div className={`flex items-center justify-center gap-1 text-sm ${positive ? "text-green-600" : "text-red-600"}`}>
                  {positive ? <TrendingDown className="h-3 w-3" /> : <TrendingUp className="h-3 w-3" />}
                  <span>{changeCur}</span>
                  <span className="text-xs">({change.text})</span>
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  vs {comparison.previousLabel}: {formatCurrency(prev)}
                </p>
              </div>
            );
          })}
        </div>
      )}

      {/* Bar chart */}
      <div className="h-[300px]">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="label" fontSize={12} />
            <YAxis tickFormatter={(v) => `€${v}`} fontSize={12} />
            <Tooltip content={<CustomTooltip />} />
            <Legend />
            <ReferenceLine y={0} stroke="#666" />
            <Bar dataKey="income" name="Inkomsten" fill="#22c55e" radius={[4, 4, 0, 0]} />
            <Bar dataKey="expenses" name="Uitgaven" fill="#ef4444" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

// Compact version for dashboard
export function IncomeExpenseChartCompact({ data }: { data: MonthData[] }) {
  return (
    <div className="h-[200px]">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 5, right: 10, left: 10, bottom: 5 }}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis dataKey="label" fontSize={11} />
          <YAxis tickFormatter={(v) => `€${v}`} fontSize={11} />
          <Tooltip
            formatter={(value) => [formatCurrency(Number(value)), ""]}
          />
          <Bar dataKey="income" name="Inkomsten" fill="#22c55e" radius={[3, 3, 0, 0]} />
          <Bar dataKey="expenses" name="Uitgaven" fill="#ef4444" radius={[3, 3, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
