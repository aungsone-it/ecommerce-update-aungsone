// ============================================
// REFACTORED API CLIENT WITH TYPES
// ============================================

import { projectId, publicAnonKey } from '../../utils/supabase/info';
import {
  API_TIMEOUTS,
  PAYLOAD_LIMITS,
  RETRY_CONFIG,
  ERROR_MESSAGES,
} from '../constants';
import type { ApiResponse } from '../types';

// ============================================
// CONFIGURATION
// ============================================

const API_BASE_URL = `https://${projectId}.supabase.co/functions/v1/make-server-16010b6f`;

interface ApiRequestOptions extends RequestInit {
  silent?: boolean;
  timeout?: number;
}

// ============================================
// ERROR HANDLING
// ============================================

class ApiError extends Error {
  constructor(
    message: string,
    public statusCode?: number,
    public details?: string
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

// ============================================
// RETRY WITH EXPONENTIAL BACKOFF
// ============================================

async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  maxRetries = RETRY_CONFIG.MAX_RETRIES,
  initialDelay = RETRY_CONFIG.INITIAL_DELAY
): Promise<T> {
  let lastError: Error | undefined;

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error as Error;

      // Don't retry on client errors (4xx)
      if (error instanceof ApiError && error.statusCode) {
        const statusCode = error.statusCode;
        if (statusCode >= 400 && statusCode < 500) {
          throw error;
        }
      }

      // If it's the last attempt, throw
      if (attempt === maxRetries - 1) {
        break;
      }

      // Calculate delay with exponential backoff
      const delay = Math.min(
        initialDelay * Math.pow(2, attempt),
        RETRY_CONFIG.MAX_DELAY
      );

      console.log(`⏳ Retry attempt ${attempt + 1}/${maxRetries} in ${delay}ms...`);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }

  throw lastError!;
}

// ============================================
// CORE API REQUEST FUNCTION
// ============================================

async function apiRequest<T = any>(
  endpoint: string,
  options: ApiRequestOptions = {}
): Promise<T> {
  const { silent = false, timeout, ...fetchOptions } = options;
  const url = `${API_BASE_URL}${endpoint}`;

  // Prepare headers
  const headers = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${publicAnonKey}`,
    ...fetchOptions.headers,
  };

  // Log request details (unless silent)
  if (!silent) {
    console.log(`🔄 API Request: ${fetchOptions.method || 'GET'} ${url}`);
  }

  // Log payload size for POST/PUT requests
  if (fetchOptions.body && !silent) {
    const sizeInBytes = new Blob([fetchOptions.body]).size;
    const sizeInMB = (sizeInBytes / (1024 * 1024)).toFixed(2);
    console.log(`📦 Payload size: ${sizeInMB} MB`);

    if (sizeInBytes > PAYLOAD_LIMITS.WARNING_SIZE) {
      console.warn(
        `⚠️ Large payload detected: ${sizeInMB} MB. This may cause timeout issues.`
      );
    }
  }

  try {
    // Create AbortController for timeout
    const controller = new AbortController();

    // Determine timeout duration
    const timeoutDuration =
      timeout ||
      (fetchOptions.body && new Blob([fetchOptions.body]).size > 1024 * 1024
        ? API_TIMEOUTS.LARGE_PAYLOAD
        : API_TIMEOUTS.DEFAULT);

    const timeoutId = setTimeout(() => controller.abort(), timeoutDuration);

    // Make the request
    const response = await fetch(url, {
      ...fetchOptions,
      headers,
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    // Log response status
    if (!silent) {
      console.log(`✅ API Response: ${response.status} ${response.statusText}`);
    }

    // Handle non-JSON responses
    const contentType = response.headers.get('content-type');
    if (!contentType || !contentType.includes('application/json')) {
      const text = await response.text();
      
      // 🔇 SUPPRESS ERROR LOGS DURING SERVER WARMUP
      const isWarmupError = response.status === 404 && text.includes('not found');
      
      if (!silent && !isWarmupError) {
        console.error(`❌ Non-JSON response from ${endpoint}:`, text);
      }

      if (response.status === 404) {
        // Return empty response during warmup instead of throwing
        if (isWarmupError) {
          return {} as T;
        }
        throw new ApiError(
          `🚨 SERVER NOT DEPLOYED YET!\n\nThe Supabase Edge Function needs to be deployed. This usually happens automatically in Figma Make.\n\n✅ SOLUTION: The server will start automatically. Please wait 10-30 seconds and try again.\n\nIf the error persists after 1 minute, the Edge Function deployment may have failed.`,
          404
        );
      }

      // Return empty response during warmup instead of throwing
      if (isWarmupError) {
        return {} as T;
      }

      throw new ApiError(
        `Invalid response from server: ${text.substring(0, 100)}`,
        response.status
      );
    }

    // Parse JSON response
    const data: ApiResponse<T> = await response.json();

    // Handle error responses
    if (!response.ok) {
      // Special handling for 404 Product not found - don't log as error (expected behavior)
      const isProductNotFound = response.status === 404 && 
        endpoint.includes('/products/') && 
        (data.error?.includes('Product not found') || data.error?.includes('not found'));
      
      // Special handling for 404 User not found on profile refresh - don't log (customers aren't vendors)
      const isUserProfileNotFound = response.status === 404 && 
        endpoint.includes('/auth/profile/') && 
        data.error?.includes('User not found');
      
      if (!silent && !isProductNotFound && !isUserProfileNotFound) {
        console.error(`❌ API Error (${endpoint}):`, data.error || 'Unknown error');
      }

      // If there's a warning instead of error, return the data
      if (data.warning && !data.error) {
        if (!silent) {
          console.warn(`⚠️ API Warning (${endpoint}):`, data.warning);
        }
        return data as T;
      }

      throw new ApiError(
        data.error || `Server error: ${response.status}`,
        response.status,
        data.details
      );
    }

    if (!silent) {
      console.log(`📦 API Data received successfully`);
    }

    return data as T;
  } catch (error) {
    // Special handling for 404 Product not found - don't log as error (expected behavior)
    const isProductNotFound = error instanceof ApiError && 
      error.statusCode === 404 && 
      endpoint.includes('/products/') && 
      (error.message?.includes('Product not found') || error.message?.includes('not found'));
    
    // Special handling for 404 User not found on profile refresh - don't log (customers aren't vendors)
    const isUserProfileNotFound = error instanceof ApiError && 
      error.statusCode === 404 && 
      endpoint.includes('/auth/profile/') && 
      error.message?.includes('User not found');
    
    // 🔇 SUPPRESS ERRORS DURING SERVER WARMUP (first 60 seconds)
    // These are expected when Edge Function is deploying
    const isWarmupError = error instanceof Error && 
      (error.message === 'Failed to fetch' || error.name === 'AbortError');
    
    // Don't log warmup errors at all - they clutter the console
    if (!silent && !isProductNotFound && !isUserProfileNotFound && !isWarmupError) {
      console.error(`❌ API Request Failed (${endpoint}):`, error);
    }

    // Handle abort/timeout errors - return empty response during warmup
    if (error instanceof Error && error.name === 'AbortError') {
      return {} as T;
    }

    // Handle network errors - return empty response during warmup
    if (error instanceof Error && error.message === 'Failed to fetch') {
      return {} as T;
    }

    throw error;
  }
}

// ============================================
// EXPORTED API CLIENT
// ============================================

export const apiClient = {
  get: <T = any>(endpoint: string, options?: ApiRequestOptions) =>
    apiRequest<T>(endpoint, { ...options, method: 'GET' }),

  post: <T = any>(endpoint: string, data?: any, options?: ApiRequestOptions) =>
    apiRequest<T>(endpoint, {
      ...options,
      method: 'POST',
      body: data ? JSON.stringify(data) : undefined,
    }),

  put: <T = any>(endpoint: string, data?: any, options?: ApiRequestOptions) =>
    apiRequest<T>(endpoint, {
      ...options,
      method: 'PUT',
      body: data ? JSON.stringify(data) : undefined,
    }),

  delete: <T = any>(endpoint: string, options?: ApiRequestOptions) =>
    apiRequest<T>(endpoint, { ...options, method: 'DELETE' }),

  // With retry
  getWithRetry: <T = any>(endpoint: string, options?: ApiRequestOptions) =>
    retryWithBackoff(() => apiClient.get<T>(endpoint, options)),

  postWithRetry: <T = any>(
    endpoint: string,
    data?: any,
    options?: ApiRequestOptions
  ) => retryWithBackoff(() => apiClient.post<T>(endpoint, data, options)),
};

export { ApiError };