import { Loader2 } from "lucide-react";

/** Lightweight full-width placeholder for lazy route chunks (marketplace, admin, vendor). */
export function RouteLoadingFallback() {
  return (
    <div
      className="min-h-[40vh] w-full flex flex-col items-center justify-center gap-3 bg-gradient-to-b from-slate-50 to-white px-4 py-16"
      role="status"
      aria-live="polite"
      aria-label="Loading page"
    >
      <Loader2 className="h-9 w-9 sm:h-10 sm:w-10 animate-spin text-amber-600" />
      <span className="text-sm text-slate-500">Loading…</span>
    </div>
  );
}
