import { useState, type ReactElement } from "react";
import type { DateRange } from "react-day-picker";
import { useLanguage } from "../contexts/LanguageContext";
import { Popover, PopoverContent, PopoverTrigger } from "./ui/popover";
import { Calendar as CalendarComponent } from "./ui/calendar";
import { Button } from "./ui/button";

export type AdminDateRangeFilterPopoverProps = {
  value: DateRange | undefined;
  onChange: (range: DateRange | undefined) => void;
  /** Shown under the title in the popover header */
  hintText: string;
  /** Defaults to the same label as Finances (“Filter by date”) */
  titleText?: string;
  children: ReactElement;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  align?: "start" | "center" | "end";
  /** Close when both start and end are chosen (default: true) */
  closeOnComplete?: boolean;
};

export function AdminDateRangeFilterPopover({
  value,
  onChange,
  hintText,
  titleText,
  children,
  open: openProp,
  onOpenChange: onOpenChangeProp,
  align = "start",
  closeOnComplete = true,
}: AdminDateRangeFilterPopoverProps) {
  const { t } = useLanguage();
  const [internalOpen, setInternalOpen] = useState(false);
  const open = openProp ?? internalOpen;

  const handleOpenChange = (next: boolean) => {
    onOpenChangeProp?.(next);
    if (openProp === undefined) setInternalOpen(next);
  };

  const title = titleText ?? t("finances.filterByDate");

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger asChild>{children}</PopoverTrigger>
      <PopoverContent className="w-auto p-0" align={align}>
        <div className="border-b border-slate-200 p-3 dark:border-slate-700">
          <p className="text-sm font-medium text-slate-900 dark:text-white">{title}</p>
          <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">{hintText}</p>
        </div>
        <CalendarComponent
          mode="range"
          defaultMonth={value?.from}
          selected={value}
          onSelect={(range) => {
            onChange(range);
            if (closeOnComplete && range?.from && range?.to) handleOpenChange(false);
          }}
          numberOfMonths={2}
        />
        {value?.from && (
          <div className="flex justify-end border-t border-slate-200 p-2 dark:border-slate-700">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                onChange(undefined);
                handleOpenChange(false);
              }}
            >
              {t("finances.clearDateFilter")}
            </Button>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}
