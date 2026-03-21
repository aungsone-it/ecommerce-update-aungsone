import { Loader2 } from "lucide-react";

export function LoadingScreen() {
  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-white py-20">
      {/* Simple Loader2 spinner - same as Storefront */}
      <div className="text-center space-y-4">
        <Loader2 className="w-12 h-12 animate-spin text-amber-600 mx-auto" />
        <p className="text-slate-700 text-sm">Please wait a while</p>
      </div>
    </div>
  );
}