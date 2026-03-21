import { projectId, publicAnonKey } from '../../../utils/supabase/info';

interface DiagnosticResult {
  endpoint: string;
  status: 'pending' | 'success' | 'error';
  message: string;
  responseTime?: number;
}

export function ServerDiagnostics() {
  const [results, setResults] = useState<DiagnosticResult[]>([]);
  const [isRunning, setIsRunning] = useState(false);

  const endpoints = [
    { name: '/health', url: `/make-server-16010b6f/health` },
    { name: '/products', url: `/make-server-16010b6f/products` },
    { name: '/orders', url: `/make-server-16010b6f/orders` },
    { name: '/vendor-applications', url: `/make-server-16010b6f/vendor-applications` },
    { name: '/categories', url: `/make-server-16010b6f/categories` },
    { name: '/finances', url: `/make-server-16010b6f/finances` },
  ];

  const testEndpoint = async (endpoint: { name: string; url: string }): Promise<DiagnosticResult> => {
    const startTime = Date.now();
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000);

      const response = await fetch(
        `https://${projectId}.supabase.co/functions/v1${endpoint.url}`,
        {
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${publicAnonKey}`,
            'Content-Type': 'application/json',
          },
          signal: controller.signal,
        }
      );

      clearTimeout(timeoutId);
      const responseTime = Date.now() - startTime;

      if (response.ok) {
        return {
          endpoint: endpoint.name,
          status: 'success',
          message: `✅ OK (${response.status}) - ${responseTime}ms`,
          responseTime,
        };
      } else {
        const text = await response.text();
        return {
          endpoint: endpoint.name,
          status: 'error',
          message: `❌ ${response.status}: ${text.substring(0, 100)}`,
          responseTime,
        };
      }
    } catch (error: any) {
      const responseTime = Date.now() - startTime;
      if (error.name === 'AbortError') {
        return {
          endpoint: endpoint.name,
          status: 'error',
          message: '⏱️ Timeout (10s)',
          responseTime,
        };
      }
      return {
        endpoint: endpoint.name,
        status: 'error',
        message: `❌ ${error.message || 'Failed to fetch'}`,
        responseTime,
      };
    }
  };

  const runDiagnostics = async () => {
    setIsRunning(true);
    setResults([]);

    // Initialize with pending status
    const initialResults = endpoints.map(ep => ({
      endpoint: ep.name,
      status: 'pending' as const,
      message: '⏳ Testing...',
    }));
    setResults(initialResults);

    // Test each endpoint sequentially
    for (let i = 0; i < endpoints.length; i++) {
      const result = await testEndpoint(endpoints[i]);
      setResults(prev => {
        const newResults = [...prev];
        newResults[i] = result;
        return newResults;
      });
    }

    setIsRunning(false);
  };

  useEffect(() => {
    // Auto-run diagnostics only if explicitly requested
    // Don't auto-run on mount to avoid flooding logs
    console.log('📊 ServerDiagnostics component mounted');
  }, []);

  return (
    <div className="fixed bottom-4 right-4 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg shadow-xl p-4 max-w-md z-50">
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-semibold text-slate-900 dark:text-white">
          🔍 Server Diagnostics
        </h3>
        <button
          onClick={runDiagnostics}
          disabled={isRunning}
          className="px-3 py-1 text-sm bg-blue-500 hover:bg-blue-600 disabled:bg-slate-300 text-white rounded"
        >
          {isRunning ? 'Testing...' : results.length === 0 ? 'Run Test' : 'Retest'}
        </button>
      </div>

      {results.length === 0 ? (
        <div className="text-sm text-slate-600 dark:text-slate-400 p-4 text-center">
          <p className="mb-2">⚠️ Server health check failed</p>
          <p className="text-xs">Click "Run Test" to diagnose the issue</p>
        </div>
      ) : (
        <div className="space-y-2 text-sm font-mono">
          {results.map((result, index) => (
            <div
              key={index}
              className={`p-2 rounded ${
                result.status === 'success'
                  ? 'bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-300'
                  : result.status === 'error'
                  ? 'bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-300'
                  : 'bg-slate-50 dark:bg-slate-700 text-slate-600 dark:text-slate-300'
              }`}
            >
              <div className="font-semibold">{result.endpoint}</div>
              <div className="text-xs mt-1">{result.message}</div>
            </div>
          ))}
        </div>
      )}

      <div className="mt-3 pt-3 border-t border-slate-200 dark:border-slate-700 text-xs text-slate-600 dark:text-slate-400">
        <p>
          <strong>Server:</strong> {projectId}.supabase.co
        </p>
        <p className="mt-1">
          {results.length === 0 && (
            <span className="text-amber-600 dark:text-amber-400">
              ⏳ Waiting for diagnostics...
            </span>
          )}
          {results.every(r => r.status === 'success') && results.length > 0 && (
            <span className="text-green-600 dark:text-green-400">
              ✅ All systems operational
            </span>
          )}
          {results.some(r => r.status === 'error') && (
            <span className="text-red-600 dark:text-red-400">
              ❌ Some endpoints are failing
            </span>
          )}
          {isRunning && (
            <span className="text-blue-600 dark:text-blue-400">
              ⏳ Testing in progress...
            </span>
          )}
        </p>
      </div>
    </div>
  );
}