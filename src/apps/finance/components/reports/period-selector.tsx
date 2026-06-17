
import { useState } from "react";
import { Select } from "@/apps/finance/components/ui/select";
import { Input } from "@/apps/finance/components/ui/input";
import { Button } from "@/apps/finance/components/ui/button";
import { PeriodType, getDateRange, formatPeriodLabel } from "@/apps/finance/lib/report-helpers";
import { ChevronLeft, ChevronRight } from "lucide-react";

type Props = {
  periodType: PeriodType;
  startDate: string;
  endDate: string;
  onPeriodTypeChange: (type: PeriodType) => void;
  onDateRangeChange: (start: string, end: string) => void;
};

export function PeriodSelector({
  periodType,
  startDate,
  endDate,
  onPeriodTypeChange,
  onDateRangeChange,
}: Props) {
  const [customStart, setCustomStart] = useState(startDate);
  const [customEnd, setCustomEnd] = useState(endDate);

  function handlePeriodChange(type: PeriodType) {
    onPeriodTypeChange(type);
    if (type !== "custom") {
      const range = getDateRange(type);
      onDateRangeChange(range.start, range.end);
    }
  }

  function navigate(direction: -1 | 1) {
    const start = new Date(startDate);
    const end = new Date(endDate);

    switch (periodType) {
      case "month":
        start.setMonth(start.getMonth() + direction);
        end.setMonth(end.getMonth() + direction);
        // Fix end of month
        const newEnd = new Date(start.getFullYear(), start.getMonth() + 1, 0);
        onDateRangeChange(fmt(start), fmt(newEnd));
        break;
      case "quarter":
        start.setMonth(start.getMonth() + direction * 3);
        const qEnd = new Date(start.getFullYear(), start.getMonth() + 3, 0);
        onDateRangeChange(fmt(start), fmt(qEnd));
        break;
      case "year":
        start.setFullYear(start.getFullYear() + direction);
        onDateRangeChange(`${start.getFullYear()}-01-01`, `${start.getFullYear()}-12-31`);
        break;
      default:
        break;
    }
  }

  function fmt(d: Date): string {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  }

  function applyCustomRange() {
    onDateRangeChange(customStart, customEnd);
  }

  return (
    <div className="flex flex-wrap items-center gap-3">
      <Select
        value={periodType}
        onChange={(e) => handlePeriodChange(e.target.value as PeriodType)}
        className="w-36"
      >
        <option value="month">Maand</option>
        <option value="quarter">Kwartaal</option>
        <option value="year">Jaar</option>
        <option value="custom">Aangepast</option>
      </Select>

      {periodType !== "custom" && (
        <div className="flex items-center gap-1">
          <Button variant="outline" size="sm" onClick={() => navigate(-1)}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span className="text-sm font-medium min-w-[160px] text-center capitalize">
            {formatPeriodLabel(startDate, endDate)}
          </span>
          <Button variant="outline" size="sm" onClick={() => navigate(1)}>
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      )}

      {periodType === "custom" && (
        <div className="flex items-center gap-2">
          <Input
            type="date"
            value={customStart}
            onChange={(e) => setCustomStart(e.target.value)}
            className="w-40"
          />
          <span className="text-sm text-muted-foreground">t/m</span>
          <Input
            type="date"
            value={customEnd}
            onChange={(e) => setCustomEnd(e.target.value)}
            className="w-40"
          />
          <Button size="sm" onClick={applyCustomRange}>
            Toepassen
          </Button>
        </div>
      )}
    </div>
  );
}
