// ============================================
// API CONFIGURATION
// ============================================

export const API_TIMEOUTS = {
  /** Default GET/POST — long cold starts are rare; 90s avoids “stuck skeleton” UIs */
  DEFAULT: 90000,
  /** List/dashboard reads — fail fast; user can refresh */
  LIST: 45000,
  LARGE_PAYLOAD: 240000,
  FILE_UPLOAD: 240000,
  CHAT: 8000,
} as const;

export const PAYLOAD_LIMITS = {
  WARNING_SIZE: 5 * 1024 * 1024, // 5MB - show warning
  MAX_SIZE: 10 * 1024 * 1024, // 10MB - hard limit
} as const;

export const RETRY_CONFIG = {
  MAX_RETRIES: 3,
  INITIAL_DELAY: 1500,
  MAX_DELAY: 12000,
} as const;

/**
 * Client-side polling intervals. Long intervals keep Supabase edge, database, and
 * storage API counts low for small deployments (e.g. one operator).
 * Note: each product image loaded from Storage still counts as its own request;
 * that is separate from these timers.
 */
/** Dispatched by `FloatingChat` so vendor / marketplace shells open the customer Auth modal. */
export const MIGOO_OPEN_CUSTOMER_AUTH_FOR_CHAT_EVENT = "migoo-open-customer-auth-for-chat";

/** After login / register / logout touching `migoo-user` — FloatingChat re-checks auth (same-tab). */
export const MIGOO_USER_SESSION_CHANGED_EVENT = "migoo-user-session-changed";

export function notifyMigooUserSessionChanged(): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(MIGOO_USER_SESSION_CHANGED_EVENT));
}

/** Chat widget: debounce writing message history to localStorage (main thread only; no API impact). */
export const CHAT_LOCAL_STORAGE_DEBOUNCE_MS = 400;
/** Chat widget: coalesce scroll-to-bottom when many messages arrive at once. */
export const CHAT_SCROLL_DEBOUNCE_MS = 72;

export const POLLING_INTERVALS_MS = {
  BADGE_COUNTS: 15 * 60 * 1000,
  /** If badge cache is newer than this, skip network (see useBadgeCounts). */
  BADGE_COUNTS_CACHE_FRESH: 12 * 60 * 1000,
  TOP_NAV_NOTIFICATIONS: 15 * 60 * 1000,
  VENDOR_PORTAL_NOTIFICATIONS: 15 * 60 * 1000,
  CHAT_HTTP_FALLBACK: 15 * 60 * 1000,
  /** When Marketing campaign auto-refresh is enabled. */
  MARKETING_CAMPAIGNS: 10 * 60 * 1000,
} as const;

/** Min gap between ambient GET /auth/profile calls (vendor storefront tab focus, etc.). */
export const AMBIENT_AUTH_PROFILE_REFRESH_MIN_MS = 10 * 60 * 1000;

// ============================================
// SERVER CONFIGURATION
// ============================================

export const SERVER_TIMEOUTS = {
  KV_OPERATION: 5000, // 5 seconds for KV operations
  PRODUCT_FETCH: 30000, // 30 seconds for fetching products
  ORDER_FETCH: 30000, // 30 seconds for fetching orders
  SKU_CHECK: 8000, // 8 seconds for SKU uniqueness check
  LARGE_SAVE: 15000, // 15 seconds for large product saves
} as const;

// ============================================
// PRODUCT STATUS
// ============================================

export const PRODUCT_STATUSES = {
  PUBLISHED: 'Published',
  OFF_SHELF: 'Off Shelf',
} as const;

export const PRODUCT_STATUS_OPTIONS = [
  { value: PRODUCT_STATUSES.PUBLISHED, label: 'Published' },
  { value: PRODUCT_STATUSES.OFF_SHELF, label: 'Off Shelf' },
] as const;

// ============================================
// ORDER STATUS
// ============================================

export const ORDER_STATUSES = {
  PENDING: 'pending',
  PROCESSING: 'processing',
  CONFIRMED: 'confirmed',
  SHIPPED: 'shipped',
  DELIVERED: 'delivered',
  CANCELLED: 'cancelled',
} as const;

export const ORDER_STATUS_OPTIONS = [
  { value: ORDER_STATUSES.PENDING, label: 'Pending', color: 'yellow' },
  { value: ORDER_STATUSES.PROCESSING, label: 'Processing', color: 'blue' },
  { value: ORDER_STATUSES.CONFIRMED, label: 'Confirmed', color: 'green' },
  { value: ORDER_STATUSES.SHIPPED, label: 'Shipped', color: 'purple' },
  { value: ORDER_STATUSES.DELIVERED, label: 'Delivered', color: 'green' },
  { value: ORDER_STATUSES.CANCELLED, label: 'Cancelled', color: 'red' },
] as const;

export const PENDING_ORDER_STATUSES = [
  ORDER_STATUSES.PENDING,
  ORDER_STATUSES.PROCESSING,
  ORDER_STATUSES.CONFIRMED,
] as const;

// ============================================
// PAYMENT
// ============================================

export const PAYMENT_METHODS = {
  CASH: 'cash',
  CARD: 'card',
  ONLINE: 'online',
} as const;

export const PAYMENT_METHOD_OPTIONS = [
  { value: PAYMENT_METHODS.CASH, label: 'Cash on Delivery' },
  { value: PAYMENT_METHODS.CARD, label: 'Credit/Debit Card' },
  { value: PAYMENT_METHODS.ONLINE, label: 'Online Payment' },
] as const;

export const PAYMENT_STATUSES = {
  PENDING: 'pending',
  PAID: 'paid',
  FAILED: 'failed',
  REFUNDED: 'refunded',
} as const;

// ============================================
// USER ROLES & STATUS
// ============================================

export const USER_ROLES = {
  ADMIN: 'admin',
  PRODUCT_MANAGER: 'product-manager',
  VENDOR: 'vendor',
  COLLABORATOR: 'collaborator',
  CUSTOMER: 'customer',
} as const;

export const USER_STATUSES = {
  ACTIVE: 'active',
  INACTIVE: 'inactive',
  PENDING: 'pending',
} as const;

// ============================================
// APPLICATION STATUS
// ============================================

export const APPLICATION_STATUSES = {
  PENDING: 'pending',
  APPROVED: 'approved',
  REJECTED: 'rejected',
} as const;

// ============================================
// BLOG POST STATUS
// ============================================

export const BLOG_STATUSES = {
  DRAFT: 'draft',
  PUBLISHED: 'published',
  ARCHIVED: 'archived',
} as const;

// ============================================
// NOTIFICATION
// ============================================

export const NOTIFICATION_TYPES = {
  ORDER: 'order',
  PRODUCT: 'product',
  SYSTEM: 'system',
  MARKETING: 'marketing',
} as const;

export const NOTIFICATION_PRIORITIES = {
  LOW: 'low',
  MEDIUM: 'medium',
  HIGH: 'high',
} as const;

// ============================================
// PAGINATION
// ============================================

export const PAGINATION_DEFAULTS = {
  PAGE_SIZE: 20,
  INITIAL_PAGE: 1,
} as const;

// ============================================
// VALIDATION
// ============================================

export const VALIDATION_RULES = {
  EMAIL_REGEX: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
  PHONE_REGEX: /^\+?[\d\s\-()]+$/,
  MIN_PASSWORD_LENGTH: 6,
  MIN_PRODUCT_NAME_LENGTH: 3,
  MAX_PRODUCT_NAME_LENGTH: 200,
  MAX_DESCRIPTION_LENGTH: 5000,
  MIN_PRICE: 0.01,
  MAX_PRICE: 999999.99,
} as const;

// ============================================
// IMAGE CONFIGURATION
// ============================================

export const IMAGE_CONFIG = {
  MAX_FILE_SIZE: 5 * 1024 * 1024, // 5MB
  SUPPORTED_FORMATS: ['image/jpeg', 'image/png', 'image/webp', 'image/gif'],
  MAX_IMAGES_PER_PRODUCT: 10,
  COMPRESSION_QUALITY: 0.8,
  MAX_WIDTH: 1920,
  MAX_HEIGHT: 1920,
} as const;

// ============================================
// LOCAL STORAGE KEYS
// ============================================

export const STORAGE_KEYS = {
  USER: 'migoo_user',
  AUTH_TOKEN: 'migoo_auth_token',
  CART: 'migoo_cart',
  WISHLIST: 'migoo_wishlist',
  THEME: 'migoo_theme',
  LANGUAGE: 'migoo_language',
} as const;

// ============================================
// NAVIGATION
// ============================================

export const ADMIN_PAGES = {
  HOME: 'Home',
  PRODUCT: 'Product',
  CATEGORIES: 'Categories',
  INVENTORY: 'Inventory',
  ORDERS: 'Orders',
  CUSTOMERS: 'Customers',
  CHAT: 'Chat',
  MARKETING: 'Marketing',
  LIVE_STREAM: 'Live stream',
  BLOG_POST: 'Blog post',
  VENDOR: 'Vendor',
  VENDOR_PROFILE: 'Vendor profile',
  VENDOR_APPLICATIONS: 'Vendor applications',
  VENDOR_PROMOTIONS: 'Vendor promotions',
  VENDOR_STORE_VIEW: 'Vendor store view',
  COLLABORATOR: 'Collaborator',
  COLLABORATOR_PROFILE: 'Collaborator profile',
  COLLABORATOR_APPLICATIONS: 'Collaborator applications',
  FINANCES: 'Finances',
  LOGISTICS: 'Logistics',
  SETTINGS: 'Settings',
} as const;

// ============================================
// FILTER OPTIONS
// ============================================

export const PRODUCT_FILTER_TABS = {
  ALL: 'All',
  VENDOR: 'Vendor',
  COLLABORATOR: 'Collaborator',
  SALES_VOLUME: 'Sales Volume',
} as const;

// ============================================
// SORT OPTIONS
// ============================================

export const SORT_OPTIONS = {
  DATE_DESC: 'date_desc',
  DATE_ASC: 'date_asc',
  NAME_ASC: 'name_asc',
  NAME_DESC: 'name_desc',
  PRICE_ASC: 'price_asc',
  PRICE_DESC: 'price_desc',
  SALES_DESC: 'sales_desc',
} as const;

// ============================================
// CACHE CONFIGURATION
// ============================================

export const CACHE_TTL = {
  PRODUCTS: 5 * 60 * 1000, // 5 minutes
  ORDERS: 2 * 60 * 1000, // 2 minutes
  CUSTOMERS: 5 * 60 * 1000, // 5 minutes
  STATS: 1 * 60 * 1000, // 1 minute
} as const;

// ============================================
// DEBOUNCE DELAYS
// ============================================

export const DEBOUNCE_DELAYS = {
  SEARCH: 300, // 300ms for search
  SKU_CHECK: 500, // 500ms for SKU uniqueness check
  AUTO_SAVE: 1000, // 1 second for auto-save
} as const;

// ============================================
// ERROR MESSAGES
// ============================================

export const ERROR_MESSAGES = {
  NETWORK_ERROR: 'Network error. Please check your connection.',
  SERVER_ERROR: 'Server error. Please try again later.',
  TIMEOUT_ERROR: 'Request timed out. Please try again.',
  VALIDATION_ERROR: 'Please check your input and try again.',
  UNAUTHORIZED: 'You are not authorized to perform this action.',
  NOT_FOUND: 'The requested resource was not found.',
  CONFLICT: 'A conflict occurred. Please refresh and try again.',
  UNKNOWN_ERROR: 'An unexpected error occurred.',
} as const;

// ============================================
// SUCCESS MESSAGES
// ============================================

export const SUCCESS_MESSAGES = {
  PRODUCT_CREATED: 'Product created successfully',
  PRODUCT_UPDATED: 'Product updated successfully',
  PRODUCT_DELETED: 'Product deleted successfully',
  ORDER_CREATED: 'Order placed successfully',
  ORDER_UPDATED: 'Order updated successfully',
  CUSTOMER_CREATED: 'Customer created successfully',
  CUSTOMER_UPDATED: 'Customer updated successfully',
  PROFILE_UPDATED: 'Profile updated successfully',
  WISHLIST_ADDED: 'Added to wishlist',
  WISHLIST_REMOVED: 'Removed from wishlist',
} as const;

// ============================================
// BRANDING
// ============================================

export const BRANDING = {
  APP_NAME: 'SECURE',
  SYSTEM_NAME: 'SECURE.OS',
  TAGLINE: 'Modern E-commerce Platform',
  COPYRIGHT: `© ${new Date().getFullYear()} SECURE. All rights reserved.`,
} as const;