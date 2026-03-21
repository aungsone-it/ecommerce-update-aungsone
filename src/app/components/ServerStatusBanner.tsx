import { Loader2, ServerCrash, RefreshCw, Clock } from "lucide-react";
import { Button } from "./ui/button";
import { LoadingScreen } from "./LoadingScreen";

interface ServerStatusBannerProps {
  status: 'checking' | 'healthy' | 'unhealthy';
  onRetry?: () => void;
  storeName?: string;
}

export function ServerStatusBanner({ status, onRetry, storeName = "SECURE E-commerce" }: ServerStatusBannerProps) {
  if (status === 'healthy') {
    return null; // Don't show anything when server is healthy
  }

  if (status === 'checking') {
    return <LoadingScreen />;
  }

  if (status === 'unhealthy') {
    return (
      <div className="fixed top-0 left-0 right-0 z-40 bg-gradient-to-r from-amber-50 to-orange-50 border-b-2 border-amber-300 shadow-lg">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Clock className="w-6 h-6 text-amber-600 flex-shrink-0 animate-pulse" />
              <div>
                <p className="text-sm font-semibold text-amber-900">
                  ⏳ Server Starting - Auto-retrying in background...
                </p>
                <p className="text-xs text-amber-700 mt-0.5">
                  Please wait, the system will connect automatically within 30-60 seconds. No action needed!
                </p>
              </div>
            </div>
            {onRetry && (
              <Button
                onClick={onRetry}
                variant="outline"
                size="sm"
                className="border-amber-400 hover:bg-amber-100 text-amber-900 font-medium flex-shrink-0"
              >
                <RefreshCw className="w-4 h-4 mr-2" />
                Retry Now
              </Button>
            )}
          </div>
        </div>
      </div>
    );
  }

  return null;
}