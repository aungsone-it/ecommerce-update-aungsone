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
