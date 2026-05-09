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
};

/**
 * Super-admin search fields: leading search icon + optional trailing clear (×).
 */
export function AdminClearableSearchInput({
  value,
  onValueChange,
  onClear,
  wrapperClassName,
  className,
  ...inputProps
}: AdminClearableSearchInputProps) {
  const showClear = value.length > 0;

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
        className={cn("pl-10", showClear && "pr-10", className)}
      />
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
