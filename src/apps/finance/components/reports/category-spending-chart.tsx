
import {
  PieChart,
  Pie,
  Cell,
  Tooltip,
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
} from "recharts";
import { getCategoryColor } from "@/apps/finance/lib/report-helpers";
import { formatCurrency } from "@/apps/finance/lib/utils";
import { useState, useMemo } from "react";
import { Eye, ChevronDown, ChevronRight } from "lucide-react";

type ChildData = {
  categoryId?: string;
  name: string;
  spent: number;
};

type CategoryData = {
  categoryId: string;
  name: string;
  spent: number;
  children?: ChildData[];
};

type Props = {
  data: CategoryData[];
  onCategoryClick?: (categoryId: string, categoryName: string) => void;
};

function CustomTooltip({ active, payload }: { active?: boolean; payload?: Array<{ payload: { name: string; spent: number } }> }) {
  if (!active || !payload?.[0]) return null;
  const d = payload[0].payload;
  return (
    <div className="rounded-md border bg-background p-2 shadow-sm text-sm">
      <p className="font-medium">{d.name}</p>
      <p className="font-mono">{formatCurrency(d.spent)}</p>
    </div>
  );
}

export function CategorySpendingChart({ data, onCategoryClick }: Props) {
  // Track hidden by categoryId (works for both main and sub)
  const [hiddenIds, setHiddenIds] = useState<Set<string>>(new Set());
  // Track which main categories are expanded to show subcategories
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());

  function toggleHidden(id: string) {
    setHiddenIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleHiddenMain(cat: CategoryData) {
    // Toggling a main category also toggles all its children
    setHiddenIds((prev) => {
      const next = new Set(prev);
      const isHidden = next.has(cat.categoryId);
      if (isHidden) {
        next.delete(cat.categoryId);
        cat.children?.forEach((c) => { if (c.categoryId) next.delete(c.categoryId); });
      } else {
        next.add(cat.categoryId);
        cat.children?.forEach((c) => { if (c.categoryId) next.add(c.categoryId); });
      }
      return next;
    });
  }

  function toggleExpanded(id: string) {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function showAll() {
    setHiddenIds(new Set());
  }

  // Compute visible spending per main category (subtracting hidden children)
  const pieData = useMemo(() => {
    return data
      .filter((cat) => !hiddenIds.has(cat.categoryId))
      .map((cat) => {
        if (!cat.children || cat.children.length === 0) {
          return { name: cat.name, spent: cat.spent, categoryId: cat.categoryId };
        }
        // Sum only visible children
        const visibleSpent = cat.children
          .filter((c) => !c.categoryId || !hiddenIds.has(c.categoryId))
          .reduce((sum, c) => sum + c.spent, 0);
        return { name: cat.name, spent: visibleSpent, categoryId: cat.categoryId };
      })
      .filter((d) => d.spent > 0);
  }, [data, hiddenIds]);

  const visibleTotal = pieData.reduce((sum, d) => sum + d.spent, 0);

  function handlePieClick(_data: unknown, index: number) {
    const entry = pieData[index];
    if (!entry) return;
    const cat = data.find((d) => d.categoryId === entry.categoryId);
    if (!cat) return;
    if (cat.children && cat.children.length > 0) {
      toggleExpanded(cat.categoryId);
    } else if (onCategoryClick) {
      onCategoryClick(cat.categoryId, cat.name);
    }
  }

  function handleOpenModal(id: string, name: string) {
    if (onCategoryClick) onCategoryClick(id, name);
  }

  return (
    <div>
      {hiddenIds.size > 0 && (
        <div className="flex items-center gap-2 mb-3">
          <span className="text-xs text-muted-foreground">
            {hiddenIds.size} {hiddenIds.size === 1 ? "categorie" : "categorieën"} verborgen
          </span>
          <button
            onClick={showAll}
            className="text-xs text-blue-600 hover:underline flex items-center gap-1"
          >
            <Eye className="h-3 w-3" />
            Alles tonen
          </button>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Pie chart */}
        <div className="h-[300px]">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={pieData}
                dataKey="spent"
                nameKey="name"
                cx="50%"
                cy="50%"
                innerRadius={60}
                outerRadius={110}
                onClick={handlePieClick}
                className="cursor-pointer"
              >
                {pieData.map((entry) => {
                  const origIdx = data.findIndex((d) => d.categoryId === entry.categoryId);
                  return (
                    <Cell
                      key={entry.categoryId}
                      fill={getCategoryColor(entry.name, origIdx)}
                    />
                  );
                })}
              </Pie>
              <Tooltip content={<CustomTooltip />} />
            </PieChart>
          </ResponsiveContainer>
        </div>

        {/* Legend + amounts */}
        <div className="flex flex-col justify-center space-y-0.5 max-h-[400px] overflow-y-auto">
          {data.map((cat, i) => {
            const isMainHidden = hiddenIds.has(cat.categoryId);
            const hasChildren = cat.children && cat.children.length > 0;
            const isExpanded = expandedIds.has(cat.categoryId);

            // Calculate visible spent for this category
            const visibleSpent = hasChildren
              ? cat.children!
                  .filter((c) => !c.categoryId || !hiddenIds.has(c.categoryId))
                  .reduce((sum, c) => sum + c.spent, 0)
              : cat.spent;
            const pct = !isMainHidden && visibleTotal > 0 ? ((visibleSpent / visibleTotal) * 100).toFixed(1) : "0";

            return (
              <div key={cat.categoryId}>
                {/* Main category row */}
                <div className={`flex items-center gap-1 text-sm ${isMainHidden ? "opacity-40" : ""}`}>
                  {/* Expand/collapse toggle */}
                  {hasChildren ? (
                    <button
                      onClick={() => toggleExpanded(cat.categoryId)}
                      className="p-1 rounded hover:bg-accent flex-shrink-0"
                      title={isExpanded ? "Inklappen" : "Uitklappen"}
                    >
                      {isExpanded
                        ? <ChevronDown className="h-4 w-4" />
                        : <ChevronRight className="h-4 w-4" />
                      }
                    </button>
                  ) : (
                    <span className="w-6 flex-shrink-0" />
                  )}
                  {/* Color dot = toggle visibility */}
                  <button
                    onClick={() => toggleHiddenMain(cat)}
                    className="p-0.5 rounded hover:bg-accent flex-shrink-0"
                    title={isMainHidden ? "Tonen" : "Verbergen"}
                  >
                    <div
                      className={`h-3 w-3 rounded-full ${isMainHidden ? "ring-1 ring-muted-foreground" : ""}`}
                      style={{ backgroundColor: isMainHidden ? "transparent" : getCategoryColor(cat.name, i) }}
                    />
                  </button>
                  {/* Name + amounts */}
                  <button
                    onClick={() => !isMainHidden && handleOpenModal(cat.categoryId, cat.name)}
                    className={`flex items-center gap-2 flex-1 rounded px-1 py-1 text-left ${isMainHidden ? "cursor-default" : "hover:bg-accent"}`}
                    disabled={isMainHidden}
                  >
                    <span className={`flex-1 ${isMainHidden ? "line-through" : ""}`}>{cat.name}</span>
                    <span className="font-mono text-muted-foreground">
                      {isMainHidden ? "" : `${pct}%`}
                    </span>
                    <span className={`font-mono ${isMainHidden ? "text-muted-foreground" : "font-medium"}`}>
                      {formatCurrency(isMainHidden ? cat.spent : visibleSpent)}
                    </span>
                  </button>
                </div>

                {/* Subcategories (expanded) */}
                {hasChildren && isExpanded && !isMainHidden && (
                  <div className="ml-4 border-l pl-2 my-0.5">
                    {cat.children!.map((child) => {
                      const childId = child.categoryId || child.name;
                      const isChildHidden = child.categoryId ? hiddenIds.has(child.categoryId) : false;
                      return (
                        <div
                          key={childId}
                          className={`flex items-center gap-1 text-xs py-0.5 ${isChildHidden ? "opacity-40" : ""}`}
                        >
                          <span className="w-4 flex-shrink-0" />
                          {/* Child toggle dot */}
                          <button
                            onClick={() => child.categoryId && toggleHidden(child.categoryId)}
                            className="p-0.5 rounded hover:bg-accent flex-shrink-0"
                            title={isChildHidden ? "Tonen" : "Verbergen"}
                          >
                            <div
                              className={`h-2.5 w-2.5 rounded-full ${isChildHidden ? "ring-1 ring-muted-foreground" : ""}`}
                              style={{ backgroundColor: isChildHidden ? "transparent" : getCategoryColor(cat.name, i) }}
                            />
                          </button>
                          <button
                            onClick={() => !isChildHidden && child.categoryId && handleOpenModal(child.categoryId, child.name)}
                            className={`flex items-center gap-2 flex-1 rounded px-1 py-0.5 text-left ${isChildHidden ? "cursor-default" : "hover:bg-accent"}`}
                            disabled={isChildHidden}
                          >
                            <span className={`flex-1 ${isChildHidden ? "line-through" : ""}`}>{child.name}</span>
                            <span className={`font-mono ${isChildHidden ? "text-muted-foreground" : "font-medium"}`}>
                              {formatCurrency(child.spent)}
                            </span>
                          </button>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
          <div className="flex items-center gap-2 text-sm font-bold border-t pt-2 px-2">
            <span className="flex-1">Totaal</span>
            <span className="font-mono">{formatCurrency(visibleTotal)}</span>
          </div>
        </div>
      </div>
    </div>
  );
}

// Compact version for dashboard
export function CategorySpendingChartCompact({ data }: { data: CategoryData[] }) {
  return (
    <div className="h-[200px]">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data.slice(0, 8)} layout="vertical" margin={{ left: 80, right: 20 }}>
          <CartesianGrid strokeDasharray="3 3" horizontal={false} />
          <XAxis type="number" tickFormatter={(v) => `€${v}`} fontSize={12} />
          <YAxis type="category" dataKey="name" fontSize={12} width={75} />
          <Tooltip
            formatter={(value) => [formatCurrency(Number(value)), "Uitgaven"]}
          />
          <Bar dataKey="spent" radius={[0, 4, 4, 0]}>
            {data.slice(0, 8).map((entry, i) => (
              <Cell key={entry.name} fill={getCategoryColor(entry.name, i)} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
