/** Lightweight full-width placeholder for lazy route chunks (marketplace, admin, vendor). */
export function RouteLoadingFallback() {
  return (
    <div
      className="min-h-[40vh] w-full flex flex-col items-center justify-center gap-3 bg-gradient-to-b from-slate-50 to-white px-4 py-16"
      role="status"
      aria-live="polite"
      aria-label="Loading page"
    >
      <div className="h-2.5 w-40 rounded-full bg-slate-200 animate-pulse" />
      <div className="h-2.5 w-28 rounded-full bg-slate-100 animate-pulse" />
      <span className="text-sm text-slate-500">Preparing page…</span>
    </div>
  );
}
