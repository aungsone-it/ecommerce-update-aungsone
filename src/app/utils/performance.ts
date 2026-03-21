// ============================================
// PERFORMANCE MONITORING UTILITIES
// ============================================

export function logPerformanceMetrics() {
  if (typeof window === 'undefined' || !window.performance) {
    console.log('⚠️ Performance API not available');
    return;
  }

  try {
    const perfData = window.performance.timing;
    const loadTime = perfData.loadEventEnd - perfData.navigationStart;
    const domReadyTime = perfData.domContentLoadedEventEnd - perfData.navigationStart;
    const renderTime = perfData.domComplete - perfData.domLoading;

    console.log('📊 Performance Metrics:');
    console.log(`  ⏱️  Total Load Time: ${loadTime}ms`);
    console.log(`  📄 DOM Ready Time: ${domReadyTime}ms`);
    console.log(`  🎨 Render Time: ${renderTime}ms`);

    // Log memory usage if available
    if ('memory' in performance) {
      const memory = (performance as any).memory;
      console.log(`  💾 Memory Used: ${(memory.usedJSHeapSize / 1048576).toFixed(2)} MB`);
      console.log(`  📦 Memory Limit: ${(memory.jsHeapSizeLimit / 1048576).toFixed(2)} MB`);
    }
  } catch (error) {
    console.error('❌ Error logging performance metrics:', error);
  }
}

export function measureComponentRender(componentName: string) {
  const startTime = performance.now();
  
  return () => {
    const endTime = performance.now();
    const renderTime = endTime - startTime;
    console.log(`🎨 ${componentName} rendered in ${renderTime.toFixed(2)}ms`);
  };
}

export function measureApiCall(apiName: string) {
  const startTime = performance.now();
  
  return () => {
    const endTime = performance.now();
    const callTime = endTime - startTime;
    console.log(`🌐 ${apiName} completed in ${callTime.toFixed(2)}ms`);
  };
}
