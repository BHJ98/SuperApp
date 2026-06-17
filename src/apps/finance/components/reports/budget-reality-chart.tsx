
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
  Cell,
} from "recharts";
import { formatCurrency } from "@/apps/finance/lib/utils";

type BudgetData = {
  categoryId: string;
  name: string;
  budget: number;
  spent: number;
  isOver: boolean;
};

type Props = {
  data: BudgetData[];
  onCategoryClick?: (categoryId: string, categoryName: string) => void;
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
  const budget = payload.find((p) => p.name === "Budget")?.value || 0;
  const spent = payload.find((p) => p.name === "Werkelijk")?.value || 0;
  const diff = budget - spent;

  return (
    <div className="rounded-md border bg-background p-3 shadow-sm text-sm">
      <p className="font-medium mb-1">{label}</p>
      {payload.map((p) => (
        <p key={p.name} style={{ color: p.color }}>
          {p.name}: {formatCurrency(p.value)}
        </p>
      ))}
      <p className={`font-medium mt-1 ${diff >= 0 ? "text-green-600" : "text-red-600"}`}>
        {diff >= 0 ? "Over: " : "Tekort: "}{formatCurrency(Math.abs(diff))}
      </p>
    </div>
  );
}

export function BudgetRealityChart({ data, onCategoryClick }: Props) {
  return (
    <div>
      <div className="h-[350px]">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            data={data}
            margin={{ top: 5, right: 20, left: 10, bottom: 5 }}
          >
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="name" fontSize={12} angle={-30} textAnchor="end" height={60} />
            <YAxis tickFormatter={(v) => `€${v}`} fontSize={12} />
            <Tooltip content={<CustomTooltip />} />
            <Legend />
            <Bar dataKey="budget" name="Budget" fill="#93c5fd" radius={[4, 4, 0, 0]} />
            <Bar dataKey="spent" name="Werkelijk" radius={[4, 4, 0, 0]}>
              {data.map((entry) => (
                <Cell
                  key={entry.categoryId}
                  fill={entry.isOver ? "#ef4444" : "#22c55e"}
                  className="cursor-pointer"
                />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Summary table */}
      <div className="mt-4 space-y-1">
        {data.map((d) => {
          const diff = d.budget - d.spent;
          return (
            <div
              key={d.categoryId}
              className="flex items-center justify-between text-sm py-1 px-2 rounded hover:bg-accent cursor-pointer"
              onClick={() => onCategoryClick?.(d.categoryId, d.name)}
            >
              <span className="font-medium">{d.name}</span>
              <div className="flex items-center gap-4">
                <span className="font-mono text-muted-foreground">
                  {formatCurrency(d.spent)} / {formatCurrency(d.budget)}
                </span>
                <span
                  className={`font-mono font-medium min-w-[80px] text-right ${
                    d.isOver ? "text-red-600" : "text-green-600"
                  }`}
                >
                  {diff >= 0 ? "+" : ""}{formatCurrency(diff)}
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
