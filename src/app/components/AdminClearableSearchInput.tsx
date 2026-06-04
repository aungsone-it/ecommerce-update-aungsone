import type { ComponentProps } from "react";
import { Search, X } from "lucide-react";
import { Input } from "./ui/input";
import { cn } from "./ui/utils";

export type AdminClearableSearchInputProps = Omit<
  ComponentProps<typeof Input>,
  "value" | "onChange"
> & {
  value: string;
  onValueChange: (value: string) => void;
  /** Extra hook after the field is cleared (e.g. reset committed server query). */
  onClear?: () => void;
  /** Classes on the outer relative wrapper (defaults to full width). */
  wrapperClassName?: string;
  /** Embedded submit — shown only while the field has text. */
  onSubmit?: () => void;
  submitDisabled?: boolean;
  /** Emphasize submit when a server query is pending (e.g. draft ≠ committed). */
  submitPending?: boolean;
  submitLabel?: string;
};

/**
 * Super-admin search fields: leading search icon + optional embedded submit + trailing clear (×).
 */
export function AdminClearableSearchInput({
  value,
  onValueChange,
  onClear,
  wrapperClassName,
  className,
  onSubmit,
  submitDisabled = false,
  submitPending = false,
  submitLabel = "Search",
  ...inputProps
}: AdminClearableSearchInputProps) {
  const showClear = value.length > 0;
  const showSubmit = onSubmit != null && value.trim().length > 0;

  return (
    <div className={cn("relative w-full", wrapperClassName)}>
      <Search
        className="pointer-events-none absolute left-3 top-1/2 z-[1] h-4 w-4 -translate-y-1/2 text-slate-400"
        aria-hidden
      />
      <Input
        {...inputProps}
        value={value}
        onChange={(e) => onValueChange(e.target.value)}
        className={cn(
          "pl-10 text-sm placeholder:text-sm",
          showSubmit && showClear && "pr-[5.75rem]",
          showSubmit && !showClear && "pr-20",
          showClear && !showSubmit && "pr-10",
          className
        )}
      />
      {showSubmit && (
        <button
          type="button"
          disabled={submitDisabled}
          className={cn(
            "absolute top-1/2 z-[1] -translate-y-1/2 rounded-md px-2.5 py-1 text-xs font-medium transition-colors disabled:pointer-events-none disabled:opacity-50",
            showClear ? "right-9" : "right-1.5",
            submitPending
              ? "bg-slate-900 text-white hover:bg-slate-800"
              : "bg-slate-100 text-slate-700 hover:bg-slate-200"
          )}
          onClick={onSubmit}
        >
          {submitLabel}
        </button>
      )}
      {showClear && (
        <button
          type="button"
          className="absolute right-1.5 top-1/2 z-[1] flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-md text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600"
          onClick={() => {
            onValueChange("");
            onClear?.();
          }}
          aria-label="Clear search"
        >
          <X className="h-4 w-4" />
        </button>
      )}
    </div>
  );
}
