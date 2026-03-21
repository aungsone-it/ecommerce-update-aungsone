// ⚡ Performance monitoring utilities

/**
 * Measure component render performance
 */
export const measureRender = (componentName: string, callback: () => void) => {
  const startTime = performance.now();
  callback();
  const endTime = performance.now();
  console.log(`⚡ ${componentName} rendered in ${(endTime - startTime).toFixed(2)}ms`);
};

/**
 * Log performance metrics
 */
export const logPerformanceMetrics = () => {
  if (typeof window !== 'undefined' && 'performance' in window) {
    const navigation = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming;
    
    if (navigation) {
      const metrics = {
        'DNS Lookup': navigation.domainLookupEnd - navigation.domainLookupStart,
        'TCP Connection': navigation.connectEnd - navigation.connectStart,
        'Request Time': navigation.responseStart - navigation.requestStart,
        'Response Time': navigation.responseEnd - navigation.responseStart,
        'DOM Processing': navigation.domComplete - navigation.domLoading,
        'Total Load Time': navigation.loadEventEnd - navigation.fetchStart,
      };

      console.log('⚡ Performance Metrics:');
      Object.entries(metrics).forEach(([key, value]) => {
        console.log(`  ${key}: ${value.toFixed(2)}ms`);
      });
    }
  }
};

/**
 * Prefetch resource (for images, etc.)
 */
export const prefetchResource = (url: string, type: 'image' | 'script' | 'style' = 'image') => {
  const link = document.createElement('link');
  link.rel = 'prefetch';
  link.as = type;
  link.href = url;
  document.head.appendChild(link);
};

/**
 * Debounce function
 */
export function debounce<T extends (...args: any[]) => any>(
  func: T,
  wait: number
): (...args: Parameters<T>) => void {
  let timeout: NodeJS.Timeout | null = null;

  return function executedFunction(...args: Parameters<T>) {
    const later = () => {
      timeout = null;
      func(...args);
    };

    if (timeout) {
      clearTimeout(timeout);
    }
    timeout = setTimeout(later, wait);
  };
}

/**
 * Throttle function
 */
export function throttle<T extends (...args: any[]) => any>(
  func: T,
  limit: number
): (...args: Parameters<T>) => void {
  let inThrottle: boolean;

  return function executedFunction(...args: Parameters<T>) {
    if (!inThrottle) {
      func(...args);
      inThrottle = true;
      setTimeout(() => (inThrottle = false), limit);
    }
  };
}
