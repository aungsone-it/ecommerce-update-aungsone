import { LucideIcon } from "lucide-react";
import type { DateRange } from "react-day-picker";
import { Card } from "./ui/card";
import { cn } from "./ui/utils";
import { AdminDateRangeFilterPopover } from "./AdminDateRangeFilterPopover";
import { useLanguage } from "../contexts/LanguageContext";
import { format } from "date-fns";

interface StatCardProps {
  title: string;
  value: string | number;
  change: string;
  changeType: "positive" | "negative" | "neutral";
  icon: LucideIcon;
  iconBgColor: string;
  dateRange: DateRange | undefined;
  onDateRangeChange: (range: DateRange | undefined) => void;
  hintText: string;
}

export function StatCard({
  title,
  value,
  change,
  changeType,
  icon: Icon,
  iconBgColor,
  dateRange,
  onDateRangeChange,
  hintText,
}: StatCardProps) {
  const { t } = useLanguage();

  return (
    <Card className="@container flex h-full min-h-[11rem] flex-col hover:shadow-lg transition-shadow duration-200 animate-scale-in">
      <div className="flex h-full min-h-0 flex-1 flex-col p-6">
        <div className="flex min-h-0 flex-1 items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium text-slate-600 dark:text-slate-400">{title}</p>
            <p className="mt-1 text-2xl font-semibold tabular-nums text-slate-900 dark:text-white">{value}</p>
            <p
              className={cn(
                "mt-2 text-sm font-medium",
                changeType === "positive" && "text-green-600",
                changeType === "negative" && "text-red-600",
                changeType === "neutral" && "text-slate-500"
              )}
            >
              {change}
            </p>
          </div>
          <div
            className={cn(
              "flex h-12 w-12 shrink-0 items-center justify-center rounded-full",
              iconBgColor
            )}
          >
            <Icon className="h-6 w-6 text-white" />
          </div>
        </div>
        <div className="mt-auto flex flex-wrap items-center gap-x-2 gap-y-1 pt-3">
          <AdminDateRangeFilterPopover
            value={dateRange}
            onChange={onDateRangeChange}
            hintText={hintText}
            align="start"
          >
            <button
              type="button"
              className="text-xs font-medium text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300 underline-offset-2 hover:underline"
            >
              {t("finances.filterByDate")}
            </button>
          </AdminDateRangeFilterPopover>
          {dateRange?.from && dateRange?.to && (
            <span className="text-xs text-slate-500 dark:text-slate-400">
              {format(dateRange.from, "MMM d, yyyy")} – {format(dateRange.to, "MMM d, yyyy")}
            </span>
          )}
        </div>
      </div>
    </Card>
  );
}
