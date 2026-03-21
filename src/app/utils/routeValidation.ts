/**
 * Route Validation Utilities
 * Ensures safe navigation and prevents crashes from malformed URLs
 */

/**
 * Validates and sanitizes store name for URL usage
 * Prevents XSS and ensures URL-safe characters
 */
export function validateStoreName(storeName: string | undefined): string | null {
  if (!storeName || typeof storeName !== 'string') {
    return null;
  }

  // Remove any potentially dangerous characters
  const sanitized = storeName.trim();
  
  // Check if it's empty after trimming
  if (sanitized.length === 0) {
    return null;
  }

  // Must contain at least one alphanumeric character
  if (!/[a-zA-Z0-9]/.test(sanitized)) {
    return null;
  }

  return sanitized;
}

/**
 * Validates product slug for URL usage
 */
export function validateProductSlug(slug: string | undefined): string | null {
  if (!slug || typeof slug !== 'string') {
    return null;
  }

  const sanitized = slug.trim();
  
  if (sanitized.length === 0) {
    return null;
  }

  return sanitized;
}

/**
 * Validates section name for admin routes
 */
export function validateSection(section: string | undefined): string | null {
  if (!section || typeof section !== 'string') {
    return null;
  }

  const validSections = [
    'dashboard',
    'products',
    'categories',
    'orders',
    'settings',
    'finances',
    'marketing',
    'users',
    'vendors',
    'customers',
    'analytics',
    'reports',
  ];

  const sanitized = section.trim().toLowerCase();
  
  if (!validSections.includes(sanitized)) {
    console.warn(`Invalid section: ${section}. Defaulting to dashboard.`);
    return 'dashboard';
  }

  return sanitized;
}

/**
 * Safely builds vendor admin URL
 */
export function buildVendorAdminUrl(storeName: string, section?: string): string {
  const validStoreName = validateStoreName(storeName);
  
  if (!validStoreName) {
    console.error('Invalid store name for vendor admin URL');
    return '/vendor/login';
  }

  if (!section || section === 'dashboard') {
    return `/vendor/${encodeURIComponent(validStoreName)}/admin`;
  }

  const validSection = validateSection(section);
  return `/vendor/${encodeURIComponent(validStoreName)}/admin/${validSection}`;
}

/**
 * Safely builds vendor storefront URL
 */
export function buildVendorStorefrontUrl(storeName: string, productSlug?: string): string {
  const validStoreName = validateStoreName(storeName);
  
  if (!validStoreName) {
    console.error('Invalid store name for storefront URL');
    return '/';
  }

  if (!productSlug) {
    return `/store/${encodeURIComponent(validStoreName)}`;
  }

  const validSlug = validateProductSlug(productSlug);
  if (!validSlug) {
    return `/store/${encodeURIComponent(validStoreName)}`;
  }

  return `/store/${encodeURIComponent(validStoreName)}/product/${encodeURIComponent(validSlug)}`;
}

/**
 * Checks if the current route is a vendor admin route
 */
export function isVendorAdminRoute(pathname: string): boolean {
  return pathname.includes('/vendor/') && pathname.includes('/admin');
}

/**
 * Checks if the current route is a vendor storefront route
 */
export function isVendorStorefrontRoute(pathname: string): boolean {
  return pathname.startsWith('/store/') || (pathname.includes('/vendor/') && !pathname.includes('/admin'));
}

/**
 * Checks if the current route is a super admin route
 */
export function isSuperAdminRoute(pathname: string): boolean {
  return pathname.startsWith('/admin') && !pathname.includes('/vendor/');
}

/**
 * Extracts store name from current pathname
 */
export function extractStoreNameFromPath(pathname: string): string | null {
  // Match /vendor/:storeName/admin or /store/:storeName
  const vendorMatch = pathname.match(/\/vendor\/([^\/]+)/);
  const storeMatch = pathname.match(/\/store\/([^\/]+)/);
  
  const storeName = vendorMatch?.[1] || storeMatch?.[1];
  
  if (!storeName) {
    return null;
  }

  // Decode URI component and validate
  try {
    const decoded = decodeURIComponent(storeName);
    return validateStoreName(decoded);
  } catch (error) {
    console.error('Error decoding store name from path:', error);
    return null;
  }
}
