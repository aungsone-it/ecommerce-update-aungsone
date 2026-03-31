// Skeleton Loader Components for Premium Loading Experience

export function ProductCardSkeleton() {
  return (
    <div className="border-0 rounded-lg overflow-hidden bg-white shadow-md animate-pulse">
      {/* Image Skeleton */}
      <div className="aspect-square bg-slate-200" />
      
      {/* Content Skeleton */}
      <div className="p-3 space-y-2">
        {/* Title */}
        <div className="space-y-2">
          <div className="h-4 bg-slate-200 rounded w-3/4" />
          <div className="h-4 bg-slate-200 rounded w-1/2" />
        </div>
        
        {/* Rating */}
        <div className="h-3 bg-slate-200 rounded w-20" />
        
        {/* Price */}
        <div className="h-5 bg-slate-200 rounded w-24" />
      </div>
    </div>
  );
}

export function ProductGridSkeleton({ count = 8 }: { count?: number }) {
  return (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
      {Array.from({ length: count }).map((_, i) => (
        <ProductCardSkeleton key={i} />
      ))}
    </div>
  );
}

/** Full viewport: nav skeleton + (category chips OR saved banner) + product grid. */
export function VendorStorefrontFullSkeleton({
  count = 10,
  savedLayout = false,
}: {
  count?: number;
  /** `/saved` loading — hide category row, show dark banner skeleton (covers nav + body like shop home). */
  savedLayout?: boolean;
}) {
  return (
    <div className="flex min-h-[100svh] w-full flex-1 flex-col bg-white">
      <div className="shrink-0 border-b border-[rgba(15,23,42,0.08)] bg-white shadow-[0_2px_10px_-2px_rgba(15,23,42,0.08)]">
        <div className="max-w-7xl mx-auto w-full px-4">
          <div className="relative flex h-16 items-center md:justify-between md:gap-3">
            <div className="flex min-w-0 items-center gap-2 pr-[9.25rem] md:max-w-xs md:pr-0 animate-pulse">
              <div className="h-9 w-9 md:h-10 md:w-10 shrink-0 rounded-xl bg-slate-200" />
              <div className="h-5 w-28 rounded bg-slate-200 sm:w-36" />
            </div>
            <div className="hidden min-w-0 flex-1 justify-center px-2 md:flex animate-pulse">
              <div className="h-10 w-full max-w-lg rounded-lg bg-slate-200" />
            </div>
            <div className="absolute right-0 top-1/2 z-10 flex -translate-y-1/2 gap-0.5 md:static md:z-auto md:translate-y-0 md:gap-1 animate-pulse">
              <div className="h-9 w-9 shrink-0 rounded-full bg-slate-200 md:h-10 md:w-10" />
              <div className="h-9 w-9 shrink-0 rounded-full bg-slate-200 md:h-10 md:w-10" />
              <div className="h-9 w-9 shrink-0 rounded-full bg-slate-200 md:h-10 md:w-10" />
              <div className="hidden h-10 w-10 shrink-0 rounded-full bg-slate-200 md:block" />
              <div className="h-9 w-9 shrink-0 rounded-full bg-slate-200 md:hidden" />
            </div>
          </div>
          {!savedLayout && (
            <div className="flex gap-2 py-3 overflow-hidden scrollbar-hide">
              {Array.from({ length: 7 }).map((_, i) => (
                <div key={i} className="h-8 w-[5.5rem] shrink-0 rounded-full bg-slate-200 animate-pulse" />
              ))}
            </div>
          )}
        </div>
      </div>

      {savedLayout && (
        <div className="w-screen max-w-none ml-[calc(50%-50vw)] shrink-0">
          <div className="animate-pulse bg-gradient-to-r from-slate-800 to-slate-700 py-10 sm:py-12 md:py-16">
            <div className="max-w-7xl mx-auto space-y-3 px-4 sm:px-6 sm:space-y-4 lg:px-8">
              <div className="flex items-center gap-2 sm:gap-3">
                <div className="h-7 w-7 shrink-0 rounded bg-white/25 sm:h-8 sm:w-8" />
                <div className="h-6 w-40 rounded bg-white/25 sm:h-7 sm:w-48" />
              </div>
              <div className="h-4 w-36 max-w-[85%] rounded bg-white/15 sm:w-44" />
            </div>
          </div>
        </div>
      )}

      <div className="flex flex-1 flex-col max-w-7xl mx-auto w-full px-4 py-8">
        <div className="animate-smooth-fade grid flex-1 grid-cols-2 content-start md:grid-cols-3 lg:grid-cols-5 gap-3 md:gap-4 lg:gap-6">
          {Array.from({ length: count }).map((_, i) => (
            <ProductCardSkeleton key={i} />
          ))}
        </div>
      </div>
    </div>
  );
}

export function ProductDetailSkeleton() {
  return (
    <div className="max-w-7xl mx-auto px-4 py-8 animate-pulse">
      {/* Back Button */}
      <div className="h-10 bg-slate-200 rounded w-40 mb-6" />
      
      <div className="grid lg:grid-cols-2 gap-8 lg:gap-12">
        {/* Left: Image Skeleton */}
        <div className="space-y-4">
          <div className="aspect-square rounded-2xl bg-slate-200" />
          <div className="grid grid-cols-4 gap-3">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="aspect-square rounded-lg bg-slate-200" />
            ))}
          </div>
        </div>
        
        {/* Right: Info Skeleton */}
        <div className="space-y-6">
          {/* Title */}
          <div className="space-y-3">
            <div className="h-10 bg-slate-200 rounded w-3/4" />
            <div className="h-6 bg-slate-200 rounded w-1/3" />
          </div>
          
          {/* Price */}
          <div className="h-12 bg-slate-200 rounded w-48" />
          
          {/* Stock */}
          <div className="h-14 bg-slate-200 rounded w-full" />
          
          {/* Quantity */}
          <div className="space-y-3">
            <div className="h-6 bg-slate-200 rounded w-24" />
            <div className="h-12 bg-slate-200 rounded w-32" />
          </div>
          
          {/* Buttons */}
          <div className="flex gap-3">
            <div className="h-14 bg-slate-200 rounded flex-1" />
            <div className="h-14 bg-slate-200 rounded flex-1" />
          </div>
          
          <div className="h-12 bg-slate-200 rounded w-full" />
        </div>
      </div>
    </div>
  );
}
