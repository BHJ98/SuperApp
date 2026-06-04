import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

export interface ChartPoint {
  label: string;
  e1rm: number;
  top: number;
}

// Isolated so recharts lands in its own lazy chunk (it's large and only the
// exercise-detail view needs it).
export default function ProgressChart({ data }: { data: ChartPoint[] }) {
  return (
    <ResponsiveContainer width="100%" height={220}>
      <LineChart data={data} margin={{ top: 5, right: 8, bottom: 0, left: -20 }}>
        <CartesianGrid stroke="#1e293b" />
        <XAxis dataKey="label" stroke="#64748b" fontSize={11} />
        <YAxis stroke="#64748b" fontSize={11} />
        <Tooltip
          contentStyle={{
            background: "#0f172a",
            border: "1px solid #334155",
            borderRadius: 12,
          }}
        />
        <Line
          type="monotone"
          dataKey="e1rm"
          name="Est. 1RM"
          stroke="#3b82f6"
          strokeWidth={2}
          dot={false}
        />
        <Line
          type="monotone"
          dataKey="top"
          name="Top set"
          stroke="#22c55e"
          strokeWidth={2}
          dot={false}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}
