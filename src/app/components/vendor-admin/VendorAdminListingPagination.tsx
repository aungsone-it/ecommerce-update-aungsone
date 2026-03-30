import type { ReactNode } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "../ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../ui/select";

export type VendorAdminListingPaginationVariant = "cardFooter" | "standalone";

export interface VendorAdminListingPaginationProps {
  /** `cardFooter`: bottom bar inside a Card (border-t). `standalone`: bordered bar (e.g. dialog). */
  variant?: VendorAdminListingPaginationVariant;
  page: number;
  pageSize: number;
  totalCount: number;
  onPageChange: (page: number) => void;
  onPageSizeChange: (size: number) => void;
  /** Lowercase plural, e.g. "products", "orders", "categories" */
  itemLabel: string;
  loading?: boolean;
  /** When set, replaces “Page X of Y · N items” (e.g. picker hint). */
  statusMessage?: ReactNode;
  className?: string;
}

export function VendorAdminListingPagination({
  variant = "cardFooter",
  page,
  pageSize,
  totalCount,
  onPageChange,
  onPageSizeChange,
  itemLabel,
  loading = false,
  statusMessage,
  className = "",
}: VendorAdminListingPaginationProps) {
  const totalPages = Math.max(1, Math.ceil(Math.max(0, totalCount) / pageSize) || 1);
  const safePage = Math.min(Math.max(1, page), totalPages);
  const canPrev = safePage > 1 && !loading;
  const canNext = safePage < totalPages && !loading;

  const barClass =
    variant === "cardFooter"
      ? `flex flex-col sm:flex-row items-center justify-between gap-3 px-4 py-3 border-t border-slate-200 bg-slate-50/80 ${className}`.trim()
      : `flex flex-col sm:flex-row items-center justify-between gap-3 px-1 py-2 border border-slate-200 rounded-lg bg-slate-50/80 ${className}`.trim();

  return (
    <div className={barClass}>
      <div className="flex items-center gap-2 text-sm text-slate-600 flex-wrap">
        <span>Rows per page</span>
        <Select
          value={String(pageSize)}
          onValueChange={(v) => {
            onPageSizeChange(Number(v));
            onPageChange(1);
          }}
        >
          <SelectTrigger className="w-[88px] h-8">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="10">10</SelectItem>
            <SelectItem value="15">15</SelectItem>
            <SelectItem value="20">20</SelectItem>
            <SelectItem value="50">50</SelectItem>
          </SelectContent>
        </Select>
        <span className="text-slate-500">
          {statusMessage ?? (
            <>
              Page {safePage} of {totalPages} · {totalCount} {itemLabel}
            </>
          )}
        </span>
      </div>
      <div className="flex items-center gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-8"
          disabled={!canPrev}
          onClick={() => onPageChange(Math.max(1, safePage - 1))}
        >
          <ChevronLeft className="w-4 h-4" />
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-8"
          disabled={!canNext}
          onClick={() => onPageChange(safePage + 1)}
        >
          <ChevronRight className="w-4 h-4" />
        </Button>
      </div>
    </div>
  );
}
