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
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: any) {
    console.error('ErrorBoundary caught an error:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-slate-50 flex items-center justify-center p-4">
          <div className="max-w-2xl w-full text-center">
            {/* Error Icon */}
            <div className="mb-8 flex justify-center">
              <div className="relative">
                <div className="absolute inset-0 bg-gradient-to-br from-orange-500 to-amber-500 rounded-full blur-2xl opacity-20"></div>
                <div className="relative bg-gradient-to-br from-orange-500 to-amber-500 rounded-full p-6">
                  <AlertTriangle className="w-16 h-16 text-white" />
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
                className="bg-gradient-to-r from-orange-600 to-amber-600 hover:from-orange-700 hover:to-amber-700 text-white px-8 py-3 text-base font-semibold shadow-lg hover:shadow-xl transition-all"
              >
                <RefreshCcw className="w-5 h-5 mr-2" />
                Reload Page
              </Button>
              <Button
                onClick={() => window.location.href = '/store'}
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