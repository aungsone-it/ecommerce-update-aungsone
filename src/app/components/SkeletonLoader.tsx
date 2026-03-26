import React from 'react';

// Product Card Skeleton
export const ProductCardSkeleton = () => (
  <div className="group bg-white rounded-xl shadow-md overflow-hidden border-0 animate-pulse">
    <div className="relative bg-slate-200 h-64"></div>
    <div className="p-4 space-y-3">
      <div className="h-4 bg-slate-200 rounded w-3/4"></div>
      <div className="h-4 bg-slate-200 rounded w-1/2"></div>
      <div className="flex items-center justify-between pt-2">
        <div className="h-6 bg-slate-200 rounded w-20"></div>
        <div className="h-8 bg-slate-200 rounded w-24"></div>
      </div>
    </div>
  </div>
);

// Product Grid Skeleton
export const ProductGridSkeleton = ({ count = 8 }: { count?: number }) => (
  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
    {Array.from({ length: count }).map((_, i) => (
      <ProductCardSkeleton key={i} />
    ))}
  </div>
);

// Product List Skeleton
export const ProductListSkeleton = ({ count = 5 }: { count?: number }) => (
  <div className="space-y-4">
    {Array.from({ length: count }).map((_, i) => (
      <div key={i} className="bg-white rounded-xl shadow-md border-0 p-4 animate-pulse">
        <div className="flex gap-4">
          <div className="w-32 h-32 bg-slate-200 rounded-lg flex-shrink-0"></div>
          <div className="flex-1 space-y-3">
            <div className="h-5 bg-slate-200 rounded w-3/4"></div>
            <div className="h-4 bg-slate-200 rounded w-1/2"></div>
            <div className="h-4 bg-slate-200 rounded w-2/3"></div>
            <div className="flex items-center justify-between pt-2">
              <div className="h-6 bg-slate-200 rounded w-24"></div>
              <div className="h-9 bg-slate-200 rounded w-32"></div>
            </div>
          </div>
        </div>
      </div>
    ))}
  </div>
);

// Category Skeleton
export const CategorySkeleton = () => (
  <div className="flex gap-3 overflow-x-auto pb-4 scrollbar-hide">
    {Array.from({ length: 6 }).map((_, i) => (
      <div key={i} className="flex-shrink-0 animate-pulse">
        <div className="w-32 h-32 bg-slate-200 rounded-xl"></div>
        <div className="h-4 bg-slate-200 rounded w-24 mt-2 mx-auto"></div>
      </div>
    ))}
  </div>
);

// Banner Skeleton
export const BannerSkeleton = () => (
  <div className="bg-slate-200 rounded-2xl h-96 md:h-[500px] animate-pulse"></div>
);

// Checkout Item Skeleton
export const CheckoutItemSkeleton = ({ count = 2 }: { count?: number }) => (
  <div className="space-y-4">
    {Array.from({ length: count }).map((_, i) => (
      <div key={i} className="flex gap-4 pb-4 border-b border-slate-200 animate-pulse">
        <div className="w-20 h-20 bg-slate-200 rounded-lg flex-shrink-0"></div>
        <div className="flex-1 space-y-2">
          <div className="h-4 bg-slate-200 rounded w-3/4"></div>
          <div className="h-3 bg-slate-200 rounded w-1/2"></div>
          <div className="h-4 bg-slate-200 rounded w-20"></div>
        </div>
      </div>
    ))}
  </div>
);
