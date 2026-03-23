// ============================================
// SERVER HELPER FUNCTIONS
// ============================================

import * as kv from "./kv_store.tsx";

// ============================================
// TIMEOUT WRAPPER
// ============================================

/**
 * Wraps a promise with a timeout
 */
export async function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number = 20000
): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error("Operation timed out")), timeoutMs)
    ),
  ]);
}

// ============================================
// ID GENERATION
// ============================================

/**
 * Generate unique ID with prefix
 */
export function generateId(prefix: string): string {
  const timestamp = Date.now();
  const random = Math.random().toString(36).substring(2, 9);
  return `${prefix}_${timestamp}_${random}`;
}

// ============================================
// RESPONSE HELPERS
// ============================================

/**
 * Create success response
 */
export function successResponse(data: any, message?: string, statusCode: number = 200) {
  return {
    success: true,
    ...data,
    ...(message && { message }),
  };
}

/**
 * Create error response
 */
export function errorResponse(error: string, details?: string, statusCode: number = 500) {
  return {
    error,
    ...(details && { details }),
    timestamp: new Date().toISOString(),
  };
}

// ============================================
// DATA VALIDATION
// ============================================

/**
 * Validate required fields
 */
export function validateRequiredFields(
  data: any,
  requiredFields: string[]
): { valid: boolean; missing: string[] } {
  const missing = requiredFields.filter(field => !data[field]);
  return {
    valid: missing.length === 0,
    missing,
  };
}

/**
 * Sanitize user input (remove sensitive fields)
 */
export function sanitizeUser(user: any): any {
  const { password, ...sanitized } = user;
  return sanitized;
}

// ============================================
// SKU VALIDATION
// ============================================

/**
 * Check SKU uniqueness across all products
 */
export async function checkSkuUniqueness(
  sku: string,
  excludeProductId?: string
): Promise<{ isUnique: boolean; existingProduct?: any }> {
  if (!sku || !sku.trim()) {
    return { isUnique: true };
  }

  try {
    console.log(`🔍 Checking SKU uniqueness: "${sku}" (excluding: ${excludeProductId || 'none'})`);
    
    const allProducts = await withTimeout(kv.getByPrefix("product:"), 25000);

    if (!Array.isArray(allProducts)) {
      return { isUnique: true };
    }

    // Check if any product has the same SKU (case-insensitive)
    const normalizedSku = sku.trim().toLowerCase();
    const duplicateProduct = allProducts.find(product => {
      if (!product || typeof product !== 'object') return false;

      // Skip the product being edited
      if (excludeProductId && product.id === excludeProductId) {
        return false;
      }

      // Check main product SKU
      if (product.sku && product.sku.trim().toLowerCase() === normalizedSku) {
        return true;
      }

      // Check variant SKUs
      if (product.variants && Array.isArray(product.variants)) {
        return product.variants.some((variant: any) =>
          variant.sku && variant.sku.trim().toLowerCase() === normalizedSku
        );
      }

      return false;
    });

    if (duplicateProduct) {
      console.log(`❌ SKU "${sku}" already exists in product: ${duplicateProduct.id}`);
      return { isUnique: false, existingProduct: duplicateProduct };
    }

    console.log(`✅ SKU "${sku}" is unique`);
    return { isUnique: true };
  } catch (error) {
    console.error("❌ Error checking SKU uniqueness:", error);
    // In case of error, allow the operation (fail open)
    return { isUnique: true };
  }
}

// ============================================
// PRODUCT DATA HELPERS
// ============================================

/**
 * Extract minimal product data for list views
 */
export function extractProductListData(product: any): any {
  if (!product || typeof product !== 'object') return null;

  return {
    id: product.id,
    name: product.name || product.title,
    price: product.price,
    sku: product.sku,
    category: product.category,
    vendor: product.vendor,
    collaborator: product.collaborator,
    status: product.status,
    inventory: product.inventory,
    salesVolume: product.salesVolume || 0,
    createDate: product.createDate || product.createdAt,
    // Only first image
    image: product.images?.[0] || product.image || null,
    images: product.images?.[0] ? [product.images[0]] : [],
    // Minimal description
    description: product.description
      ? String(product.description).substring(0, 150)
      : '',
    // Metadata only
    imageCount: Array.isArray(product.images) ? product.images.length : 0,
    hasImages: Array.isArray(product.images) && product.images.length > 0,
    variantCount: Array.isArray(product.variants) ? product.variants.length : 0,
    hasVariants: product.hasVariants || false,
  };
}

// ============================================
// BATCH PROCESSING
// ============================================

/**
 * Process array in chunks to avoid memory issues
 */
export async function processInChunks<T, R>(
  items: T[],
  chunkSize: number,
  processor: (item: T) => R | Promise<R>
): Promise<R[]> {
  const results: R[] = [];
  
  for (let i = 0; i < items.length; i += chunkSize) {
    const chunk = items.slice(i, i + chunkSize);
    const chunkResults = await Promise.all(chunk.map(processor));
    results.push(...chunkResults);
  }
  
  return results;
}

// ============================================
// LOGGING HELPERS
// ============================================

/**
 * Log payload size for debugging
 */
export function logPayloadSize(data: any, label: string = "Payload"): void {
  const payloadSize = JSON.stringify(data).length;
  console.log(`📦 ${label} size: ${(payloadSize / 1024).toFixed(2)} KB`);
}

/**
 * Calculate appropriate timeout based on payload size
 */
export function calculateTimeout(payloadSize: number): number {
  return payloadSize > 500000 ? 15000 : 8000;
}
