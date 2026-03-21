// ============================================
// SERVER HEALTH MONITORING
// ============================================

import { projectId, publicAnonKey } from '../../utils/supabase/info';

const HEALTH_CHECK_URL = `https://${projectId}.supabase.co/functions/v1/make-server-16010b6f/health`;

export interface HealthCheckResult {
  isHealthy: boolean;
  message: string;
  serverInfo?: {
    version: string;
    status: string;
    timestamp: string;
  };
}

/**
 * Check if the Edge Function server is healthy and responding
 */
export async function checkServerHealth(timeoutMs = 10000): Promise<HealthCheckResult> {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    const response = await fetch(HEALTH_CHECK_URL, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${publicAnonKey}`,
      },
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (response.ok) {
      const data = await response.json();
      return {
        isHealthy: true,
        message: '✅ Server is healthy and ready',
        serverInfo: {
          version: data.version || 'unknown',
          status: data.status || 'ok',
          timestamp: data.timestamp || new Date().toISOString(),
        },
      };
    } else {
      return {
        isHealthy: false,
        message: `⚠️ Server responded with status ${response.status}`,
      };
    }
  } catch (error: any) {
    if (error.name === 'AbortError') {
      return {
        isHealthy: false,
        message: '⏳ Server is taking longer than expected. This is normal during cold starts. Auto-retry in progress...',
      };
    }

    if (error.message === 'Failed to fetch') {
      return {
        isHealthy: false,
        message: '⏳ Server is starting up. This is normal on first load. Auto-retry in progress...',
      };
    }

    return {
      isHealthy: false,
      message: `⚠️ Health check error: ${error.message}`,
    };
  }
}

/**
 * Check server health with retries
 */
export async function checkServerHealthWithRetries(
  maxRetries = 3,
  delayMs = 2000
): Promise<HealthCheckResult> {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    console.log(`🔍 Health check attempt ${attempt}/${maxRetries}...`);
    
    const result = await checkServerHealth();
    
    if (result.isHealthy) {
      console.log('✅ Server is healthy!');
      return result;
    }

    if (attempt < maxRetries) {
      console.log(`⏳ Waiting ${delayMs}ms before retry...`);
      await new Promise(resolve => setTimeout(resolve, delayMs));
    }
  }

  return {
    isHealthy: false,
    message: '❌ Server is not responding after multiple attempts. Please refresh the page or check the console for details.',
  };
}
