import { Component, ReactNode } from 'react';
import { Button } from './ui/button';
import { Home, RefreshCcw, AlertTriangle } from 'lucide-react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  private static isPaymentReturnPath(pathname: string): boolean {
    return /\/summary$/.test(pathname) || pathname === "/kpay/return";
  }

  private static autoRecoverKey(pathname: string): string {
    return `migoo-eb-auto-recover:${pathname}`;
  }

  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: any) {
    console.error('ErrorBoundary caught an error:', error, errorInfo);
    try {
      const pathname = window.location.pathname;
      const isPaymentReturnPath = ErrorBoundary.isPaymentReturnPath(pathname);
      if (!isPaymentReturnPath) return;
      const key = ErrorBoundary.autoRecoverKey(pathname);
      if (sessionStorage.getItem(key) === "1") return;
      // One-shot self-heal for transient first-return runtime hiccups after KBZ app handoff.
      sessionStorage.setItem(key, "1");
      setTimeout(() => {
        window.location.reload();
      }, 120);
    } catch {
      /* ignore */
    }
  }

  render() {
    // Successful render clears one-shot recover marker so future genuine errors still surface.
    try {
      const key = ErrorBoundary.autoRecoverKey(window.location.pathname);
      if (!this.state.hasError) {
        sessionStorage.removeItem(key);
      }
    } catch {
      /* ignore */
    }
    if (this.state.hasError) {
      const onPaymentReturnPath =
        typeof window !== "undefined" &&
        ErrorBoundary.isPaymentReturnPath(window.location.pathname);
      if (onPaymentReturnPath) {
        // Keep payment return UX clean: avoid flashing the generic error card while one-shot auto-recovery reload runs.
        return <div className="min-h-screen bg-white" />;
      }
      return (
        <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-slate-50 flex items-center justify-center p-4">
          <div className="max-w-2xl w-full text-center">
            {/* Error Icon */}
            <div className="mb-8 flex justify-center">
              <div className="relative">
                <div className="absolute inset-0 bg-slate-900/10 rounded-full blur-2xl" />
                <div className="relative bg-slate-900 dark:bg-white rounded-full p-6 shadow-lg ring-1 ring-slate-900/10 dark:ring-slate-200/20">
                  <AlertTriangle className="w-16 h-16 text-white dark:text-slate-900" />
                </div>
              </div>
            </div>

            {/* Error Message */}
            <h1 className="text-4xl md:text-5xl font-bold text-slate-900 mb-4">
              Oops! Something went wrong
            </h1>
            <p className="text-lg text-slate-600 mb-8 max-w-lg mx-auto">
              We encountered an unexpected error. Don't worry, our team has been notified and we're working on it.
            </p>

            {/* Action Buttons */}
            <div className="flex flex-col sm:flex-row gap-4 justify-center items-center">
              <Button
                onClick={() => window.location.reload()}
                size="lg"
                className="bg-slate-900 hover:bg-slate-800 dark:bg-white dark:hover:bg-slate-100 text-white dark:text-slate-900 px-8 py-3 text-base font-semibold rounded-full shadow-lg hover:shadow-xl transition-all"
              >
                <RefreshCcw className="w-5 h-5 mr-2" />
                Reload Page
              </Button>
              <Button
                onClick={() => window.location.href = '/'}
                size="lg"
                variant="outline"
                className="border-2 border-slate-300 hover:border-slate-400 text-slate-700 hover:text-slate-900 px-8 py-3 text-base font-semibold transition-all"
              >
                <Home className="w-5 h-5 mr-2" />
                Go Home
              </Button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}