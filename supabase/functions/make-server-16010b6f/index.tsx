import { Hono } from "npm:hono@4";
import { cors } from "npm:hono/cors";
import * as kv from "./kv_store.tsx";
import { createClient } from "jsr:@supabase/supabase-js@2.49.8";
import authApp from "./auth_routes.tsx";
import blogEngagementApp from "./blog_engagement_routes.tsx";
import customerApp from "./customer_routes.tsx";
import userApp from "./user_routes.tsx";
import { createPaymentIntent, verifyPayment } from "./stripe_routes.tsx";
import { ensureBucket } from "./storage_bucket_helpers.tsx";

// FIRST: Override console.error to filter out HTTP connection errors from Deno runtime
const originalConsoleError = console.error;
console.error = (...args: any[]) => {
  const message = args.join(' ').toLowerCase();
  
  // Filter out Deno HTTP connection errors - these are normal client disconnections
  if (
    message.includes('http:') ||
    message.includes('connection closed') ||
    message.includes('message completed') ||
    message.includes('connectionerror') ||
    (message.includes('at async') && message.includes('respondwith'))
  ) {
    // Silently ignore these - they're just clients disconnecting
    return;
  }
  
  // Log everything else normally
  originalConsoleError(...args);
};

// Global error handlers to suppress connection errors at runtime level
globalThis.addEventListener("error", (event) => {
  const error = event.error;
  const errorMsg = String(error?.message || "").toLowerCase();
  const errorName = String(error?.name || "").toLowerCase();
  
  // Suppress ALL HTTP connection-related errors - these are normal client disconnections
  if (errorName === "http" || 
      errorMsg.includes("connection") ||
      errorMsg.includes("message") ||
      errorMsg.includes("closed") ||
      errorMsg.includes("completed") ||
      errorMsg.includes("reset") ||
      errorMsg.includes("broken") ||
      errorMsg.includes("pipe") ||
      errorMsg.includes("epipe") ||
      errorMsg.includes("econnreset")) {
    // Silently suppress - client disconnected, this is expected
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();
    return;
  }
});

globalThis.addEventListener("unhandledrejection", (event) => {
  const error = event.reason;
  const errorMsg = String(error?.message || "").toLowerCase();
  const errorName = String(error?.name || "").toLowerCase();
  
  // Suppress ALL HTTP connection-related errors - these are normal client disconnections
  if (errorName === "http" || 
      errorMsg.includes("connection") ||
      errorMsg.includes("message") ||
      errorMsg.includes("closed") ||
      errorMsg.includes("completed") ||
      errorMsg.includes("reset") ||
      errorMsg.includes("broken") ||
      errorMsg.includes("pipe") ||
      errorMsg.includes("epipe") ||
      errorMsg.includes("econnreset")) {
    // Silently suppress - client disconnected, this is expected
    event.preventDefault();
    return;
  }
});

const app = new Hono();

// Initialize Supabase client with connection pool settings
const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  }
);

/** Used to verify current password via signInWithPassword (storefront customers use Supabase Auth, not KV). */
const supabaseAuth = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_ANON_KEY")!,
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  }
);

// Helper function to wrap KV operations with timeout
// NOTE: KV operations now have built-in timeouts, so this is just a pass-through
// Kept for backward compatibility with existing code
async function withTimeout<T>(promise: Promise<T>, timeoutMs = 60000): Promise<T> {
  // Just return the promise directly - KV operations handle their own timeouts now
  return promise;
}

/**
 * Store slug for URLs + subdomains: lowercase a-z0-9 only (no spaces/hyphens).
 * "City Mart Online Store" → citymartonlinestore — matches citymartonlinestore.walwal.online
 */
function storeSlugFromBusinessName(name: string): string {
  const raw = String(name || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
  const s = raw.replace(/[^a-z0-9]+/g, "");
  const trimmed = s.slice(0, 63);
  return trimmed.length > 0 ? trimmed : "store";
}

/** First free vendor_slug_* key for this vendor (collision → citymart1, citymart2, …). */
async function allocateUniqueVendorSlugFromName(
  storeName: string,
  vendorId: string
): Promise<string> {
  const base = storeSlugFromBusinessName(storeName);
  for (let i = 0; i < 500; i++) {
    const slug = i === 0 ? base : `${base}${i}`;
    if (slug.length > 63) break;
    const key = `vendor_slug_${slug}`;
    const existing = await withTimeout(kv.get(key), 5000);
    if (
      !existing ||
      String((existing as { vendorId?: string }).vendorId) === String(vendorId)
    ) {
      return slug;
    }
  }
  return `${base}${Date.now().toString(36)}`.slice(0, 63);
}

// Server version and initialization  
const SERVER_VERSION = "1.5.1-FIXED";
console.log(`🚀 SECURE server v${SERVER_VERSION} starting...`);
console.log(`📅 Deployed at: ${new Date().toISOString()}`);
console.log("🎯 Marketing campaigns module loaded");

// Storage buckets are created lazily via ensureBucket() (cached listBuckets) to avoid
// hammering the Storage API on every cold start and on every upload.

// ============================================
// 🚀 DASHBOARD CACHE - Module-level caching to reduce database calls
// ============================================
// Cache stores: { cacheKey: { data: statsObject, timestamp: Date } }
const dashboardStatsCache = new Map<string, { data: any; timestamp: number }>();
const DASHBOARD_CACHE_TTL = 5 * 60 * 1000; // 5 minutes in milliseconds

// Helper function to generate cache key based on filters
function getDashboardCacheKey(filters: {
  revenueFilter: string;
  ordersFilter: string;
  customersFilter: string;
  productsFilter: string;
}): string {
  return `${filters.revenueFilter}|${filters.ordersFilter}|${filters.customersFilter}|${filters.productsFilter}`;
}

// Helper function to check if cache is valid
function isCacheValid(timestamp: number): boolean {
  return Date.now() - timestamp < DASHBOARD_CACHE_TTL;
}

// Helper function to invalidate dashboard cache
function invalidateDashboardCache(): void {
  const cacheSize = dashboardStatsCache.size;
  dashboardStatsCache.clear();
  console.log(`🗑️ Invalidated dashboard cache (cleared ${cacheSize} entries)`);
}

// CORS middleware - MUST BE FIRST
app.use("*", cors({
  origin: "*",
  allowMethods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  allowHeaders: ["Content-Type", "Authorization"],
  exposeHeaders: ["Content-Length"],
  maxAge: 86400,
  credentials: false,
}));

// Global request timeout middleware - prevents hanging connections
app.use("*", async (c, next) => {
  // Skip timeout for specific endpoints that need more time
  if (c.req.url.includes('/chat/upload-image') || 
      c.req.url.includes('/health') ||
      c.req.url.includes('/stats') ||
      c.req.url.includes('/vendors') ||
      c.req.url.includes('/campaigns') ||
      c.req.url.includes('/bulk-assign-vendor')) {
    return await next();
  }
  
  let timeoutId: number | undefined;
  const timeoutPromise = new Promise((_, reject) => {
    timeoutId = setTimeout(() => {
      reject(new Error("Request timeout"));
    }, 25000); // Reduced to 25s
  });
  
  try {
    const result = await Promise.race([next(), timeoutPromise]);
    if (timeoutId !== undefined) clearTimeout(timeoutId);
    return result;
  } catch (error: any) {
    if (timeoutId !== undefined) clearTimeout(timeoutId);
    
    if (error?.message === "Request timeout") {
      console.error("⏱️ Request timeout:", c.req.url);
      try {
        return c.json({ error: "Request timeout" }, 504);
      } catch (e) {
        // Connection lost, can't send response
        return new Response(null, { status: 504 });
      }
    }
    throw error;
  }
});

// Request logging middleware - lightweight
app.use("*", async (c, next) => {
  const start = Date.now();
  const method = c.req.method;
  const path = new URL(c.req.url).pathname;
  
  try {
    await next();
    const ms = Date.now() - start;
    const status = c.res.status;
    
    // Log slow requests as warnings
    if (ms > 5000) {
      console.warn(`⏱️ SLOW: ${method} ${path} - ${status} (${ms}ms)`);
    } else if (ms > 1000) {
      console.log(`${method} ${path} - ${status} (${ms}ms)`);
    }
    // Skip logging fast requests to reduce noise
  } catch (error: any) {
    const ms = Date.now() - start;
    const errorMsg = String(error?.message || "").toLowerCase();
    const errorName = String(error?.name || "").toLowerCase();
    
    // Only log if it's not a connection error (those are already suppressed)
    if (errorName !== "http" && 
        !errorMsg.includes("connection") && 
        !errorMsg.includes("pipe") &&
        !errorMsg.includes("reset") &&
        !errorMsg.includes("closed")) {
      console.error(`❌ ${method} ${path} - ERROR (${ms}ms):`, error?.message);
    }
    throw error;
  }
});

// Global error handler - catches ALL errors including connection issues
app.use("*", async (c, next) => {
  try {
    await next();
  } catch (error: any) {
    const errorMsg = String(error?.message || "").toLowerCase();
    const errorName = String(error?.name || "").toLowerCase();
    
    // Silently handle ALL connection errors - client already gone
    if (errorName === "http" || 
        error?.code === "EPIPE" || 
        error?.code === "ECONNRESET" ||
        errorMsg.includes("connection") ||
        errorMsg.includes("message completed") ||
        errorMsg.includes("pipe") ||
        errorMsg.includes("broken") ||
        errorMsg.includes("reset") ||
        errorMsg.includes("closed")) {
      // Don't log these - they're expected when clients disconnect
      return new Response(null, { status: 499 }); // Client Closed Request
    }
    
    // Log other errors
    console.error("❌ Server error:", error);
    
    // Try to return JSON error, but catch if connection is broken
    try {
      return c.json({ 
        error: String(error?.message || "Internal server error"),
        timestamp: new Date().toISOString()
      }, 500);
    } catch (responseError) {
      console.warn("⚠️ Could not send error response (connection lost)");
      return new Response(null, { status: 499 });
    }
  }
});

// ============================================
// HEALTH CHECK ENDPOINT
// ============================================
app.get("/make-server-16010b6f/health", async (c) => {
  try {
    return c.json({ 
      status: "ok", 
      timestamp: new Date().toISOString(),
      server: "SECURE E-commerce Server",
      version: SERVER_VERSION,
      message: "✅ Server startup simplified - v1.4.0"
    });
  } catch (error) {
    console.error("❌ Health check error:", error);
    return c.json({ status: "error", message: String(error) }, 500);
  }
});

// ============================================
// AUTH ROUTES
// ============================================
app.route("/make-server-16010b6f/auth", authApp);

// ============================================
// SETTINGS ROUTES (General Settings)
// ============================================
app.get("/make-server-16010b6f/settings/general", async (c) => {
  try {
    const settings = await kv.get("site_settings_general");
    
    if (!settings) {
      // Return default settings if none exist
      return c.json({
        storeName: "SECURE E-commerce",
        storeEmail: "info@secure.com",
        storePhone: "+95 9 XXX XXX XXX",
        storeAddress: "123 Main St, Yangon, Myanmar",
        currency: "MMK",
        timezone: "Asia/Yangon",
        kpayPhone: "+95 9 XXX XXX XXX",
        kpayQrCode: "",
        storeLogo: "",
      });
    }
    
    return c.json(settings);
  } catch (error: any) {
    console.error("Error loading general settings:", error);
    // Return default settings on timeout/error to prevent UI breaking
    return c.json({
      storeName: "SECURE E-commerce",
      storeEmail: "info@secure.com",
      storePhone: "+95 9 XXX XXX XXX",
      storeAddress: "123 Main St, Yangon, Myanmar",
      currency: "MMK",
      timezone: "Asia/Yangon",
      kpayPhone: "+95 9 XXX XXX XXX",
      kpayQrCode: "",
      storeLogo: "",
    });
  }
});

app.post("/make-server-16010b6f/settings/general", async (c) => {
  try {
    const body = await c.req.json();
    
    // Validate required fields
    if (!body.storeName || !body.storeEmail || !body.currency) {
      return c.json({ error: "Missing required fields" }, 400);
    }
    
    // Save settings to KV store
    await kv.set("site_settings_general", body);
    
    console.log("✅ General settings saved:", body);
    return c.json({ success: true, settings: body });
  } catch (error: any) {
    console.error("Error saving general settings:", error);
    return c.json({ error: "Failed to save settings" }, 500);
  }
});

// Get banners endpoint
app.get("/make-server-16010b6f/settings/banners", async (c) => {
  try {
    const banners = await kv.get("settings:banners");
    
    if (!banners) {
      // Return default banners if none exist
      return c.json([
        {
          id: 1,
          title: "Exclusive Collection",
          subtitle: "Discover premium products crafted for elegance",
          bg: "from-teal-600 to-cyan-600",
          badgeText: "Premium Selection",
          cta: "Explore Collection",
          textColor: 'light',
          backgroundImage: ""
        },
        {
          id: 2,
          title: "New Arrivals",
          subtitle: "Be the first to discover our latest selections",
          bg: "from-cyan-900 to-teal-900",
          badgeText: "Premium Selection",
          cta: "Shop Now",
          textColor: 'light',
          backgroundImage: ""
        },
        {
          id: 3,
          title: "Premium Experience",
          subtitle: "Complimentary delivery on all orders",
          bg: "from-indigo-900 to-slate-900",
          badgeText: "Premium Selection",
          cta: "Learn More",
          textColor: 'light',
          backgroundImage: ""
        }
      ]);
    }
    
    return c.json(banners);
  } catch (error: any) {
    console.error("Error loading banners:", error);
    // Return default banners on timeout/error to prevent UI breaking
    return c.json([
      {
        id: 1,
        title: "Exclusive Collection",
        subtitle: "Discover premium products crafted for elegance",
        bg: "from-teal-600 to-cyan-600",
        badgeText: "Premium Selection",
        cta: "Explore Collection",
        textColor: 'light',
        backgroundImage: ""
      }
    ]);
  }
});

// Logo upload endpoint
app.post("/make-server-16010b6f/settings/upload-logo", async (c) => {
  try {
    console.log("📤 Uploading store logo...");
    
    // Parse form data
    const formData = await c.req.formData();
    const imageFile = formData.get("image") as File;
    const storeName = formData.get("storeName") as string;
    
    if (!imageFile) {
      return c.json({ error: "No image file provided" }, 400);
    }
    
    // Check file size (should be under 500KB after compression)
    const fileSizeKB = imageFile.size / 1024;
    console.log(`📦 Logo size: ${fileSizeKB.toFixed(2)} KB`);
    
    if (fileSizeKB > 600) {
      return c.json({ 
        error: "Image file too large. Maximum size is 500KB",
        size: `${fileSizeKB.toFixed(2)} KB`
      }, 400);
    }
    
    // Generate unique filename
    const timestamp = Date.now();
    const randomStr = Math.random().toString(36).substring(2, 9);
    const fileExt = imageFile.name ? imageFile.name.split('.').pop() : 'jpg';
    const fileName = `logo_${timestamp}_${randomStr}.${fileExt}`;
    
    console.log(`📁 Uploading logo file: ${fileName}`);
    
    const BUCKET_NAME = "make-16010b6f-store-logos";
    try {
      await ensureBucket(supabase, BUCKET_NAME, {
        public: false,
        fileSizeLimit: 524288,
      });
    } catch (bucketErr: any) {
      console.error("❌ Failed to ensure bucket:", bucketErr);
      return c.json({ error: "Failed to create storage bucket" }, 500);
    }
    
    // Convert File to ArrayBuffer
    const arrayBuffer = await imageFile.arrayBuffer();
    const uint8Array = new Uint8Array(arrayBuffer);
    
    // Upload to Supabase Storage
    const { data: uploadData, error: uploadError } = await supabase.storage
      .from(BUCKET_NAME)
      .upload(fileName, uint8Array, {
        contentType: imageFile.type,
        upsert: false,
      });
    
    if (uploadError) {
      console.error("❌ Upload error:", uploadError);
      return c.json({ 
        error: "Failed to upload logo", 
        details: uploadError.message 
      }, 500);
    }
    
    // Generate signed URL (valid for 10 years)
    const { data: urlData, error: urlError } = await supabase.storage
      .from(BUCKET_NAME)
      .createSignedUrl(fileName, 315360000); // 10 years in seconds
    
    if (urlError || !urlData) {
      console.error("❌ URL generation error:", urlError);
      return c.json({ 
        error: "Failed to generate logo URL", 
        details: urlError?.message 
      }, 500);
    }
    
    console.log(`✅ Logo uploaded successfully: ${fileName}`);
    
    return c.json({
      success: true,
      imageUrl: urlData.signedUrl,
      fileName: fileName,
      size: `${fileSizeKB.toFixed(2)} KB`,
    });
  } catch (error: any) {
    console.error("❌ Error uploading logo:", error);
    return c.json({ 
      error: "Failed to upload logo", 
      details: String(error) 
    }, 500);
  }
});

// Banner upload endpoint
app.post("/make-server-16010b6f/settings/upload-banner", async (c) => {
  try {
    console.log("📤 Uploading banner image...");
    
    // Parse form data
    const formData = await c.req.formData();
    const imageFile = formData.get("image") as File;
    const bannerId = formData.get("bannerId") as string;
    
    if (!imageFile) {
      return c.json({ error: "No image file provided" }, 400);
    }
    
    // Check file size (banners can be larger, up to 2MB)
    const fileSizeKB = imageFile.size / 1024;
    console.log(`📦 Banner size: ${fileSizeKB.toFixed(2)} KB`);
    
    if (fileSizeKB > 2048) {
      return c.json({ 
        error: "Image file too large. Maximum size is 2MB",
        size: `${fileSizeKB.toFixed(2)} KB`
      }, 400);
    }
    
    // Generate unique filename
    const timestamp = Date.now();
    const randomStr = Math.random().toString(36).substring(2, 9);
    const fileExt = imageFile.name ? imageFile.name.split('.').pop() : 'jpg';
    const fileName = `banner_${bannerId}_${timestamp}_${randomStr}.${fileExt}`;
    
    console.log(`📁 Uploading banner file: ${fileName}`);
    
    const BUCKET_NAME = "make-16010b6f-banners";
    try {
      await ensureBucket(supabase, BUCKET_NAME, {
        public: false,
        fileSizeLimit: 2097152,
      });
    } catch (bucketErr: any) {
      console.error("❌ Failed to ensure bucket:", bucketErr);
      return c.json({ error: "Failed to create storage bucket" }, 500);
    }
    
    // Convert File to ArrayBuffer
    const arrayBuffer = await imageFile.arrayBuffer();
    const uint8Array = new Uint8Array(arrayBuffer);
    
    // Upload to Supabase Storage
    const { data: uploadData, error: uploadError } = await supabase.storage
      .from(BUCKET_NAME)
      .upload(fileName, uint8Array, {
        contentType: imageFile.type,
        upsert: false,
      });
    
    if (uploadError) {
      console.error("❌ Upload error:", uploadError);
      return c.json({ 
        error: "Failed to upload banner", 
        details: uploadError.message 
      }, 500);
    }
    
    // Generate signed URL (valid for 10 years)
    const { data: urlData, error: urlError } = await supabase.storage
      .from(BUCKET_NAME)
      .createSignedUrl(fileName, 315360000); // 10 years in seconds
    
    if (urlError || !urlData) {
      console.error("❌ URL generation error:", urlError);
      return c.json({ 
        error: "Failed to generate banner URL", 
        details: urlError?.message 
      }, 500);
    }
    
    console.log(`✅ Banner uploaded successfully: ${fileName}`);
    
    return c.json({
      success: true,
      imageUrl: urlData.signedUrl,
      fileName: fileName,
      size: `${fileSizeKB.toFixed(2)} KB`,
    });
  } catch (error: any) {
    console.error("❌ Error uploading banner:", error);
    return c.json({ 
      error: "Failed to upload banner", 
      details: String(error) 
    }, 500);
  }
});

// Save banners endpoint
app.post("/make-server-16010b6f/settings/banners", async (c) => {
  try {
    const body = await c.req.json();
    
    if (!body.banners || !Array.isArray(body.banners)) {
      return c.json({ error: "Invalid banners data" }, 400);
    }
    
    // Save banners to KV store
    await kv.set("settings:banners", body.banners);
    
    console.log("✅ Banners saved:", body.banners.length, "banners");
    return c.json({ success: true, banners: body.banners });
  } catch (error: any) {
    console.error("Error saving banners:", error);
    return c.json({ error: "Failed to save banners" }, 500);
  }
});

// ============================================
// BLOG ENGAGEMENT ROUTES (Comments, Likes, Notifications)
// ============================================
app.route("/make-server-16010b6f", blogEngagementApp);

// ============================================
// CUSTOMER MANAGEMENT ROUTES
// ============================================
app.route("/make-server-16010b6f", customerApp);

// ============================================
// USER PROFILE ROUTES
// ============================================
app.route("/make-server-16010b6f", userApp);

// ============================================
// STRIPE PAYMENT ROUTES
// ============================================
app.post("/make-server-16010b6f/create-payment-intent", createPaymentIntent);
app.get("/make-server-16010b6f/verify-payment/:paymentIntentId", verifyPayment);

// Retry wrapper for database operations with exponential backoff
async function withRetry<T>(
  operation: () => Promise<T>,
  maxRetries = 5,
  initialDelay = 500
): Promise<T> {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      console.log(`🔄 Attempt ${attempt}/${maxRetries}...`);
      const result = await operation();
      console.log(`✅ Operation successful on attempt ${attempt}`);
      return result;
    } catch (error: any) {
      const errorMsg = String(error?.message || "").toLowerCase();
      const isConnectionError = 
        errorMsg.includes("connection reset") ||
        errorMsg.includes("connection error") ||
        errorMsg.includes("econnreset") ||
        errorMsg.includes("network") ||
        errorMsg.includes("fetch failed");
      
      console.error(`❌ Attempt ${attempt} failed:`, error?.message || error);
      
      if (attempt === maxRetries) {
        throw error; // Final attempt failed
      }
      
      // For connection errors, wait longer
      const baseDelay = isConnectionError ? initialDelay * 2 : initialDelay;
      const waitTime = Math.min(baseDelay * Math.pow(2, attempt - 1), 10000);
      console.log(`⏳ Waiting ${waitTime}ms before retry (connection error: ${isConnectionError})...`);
      await new Promise(resolve => setTimeout(resolve, waitTime));
    }
  }
  throw new Error('All retry attempts failed');
}

// Helper to respond immediately while processing in background
function respondAndProcess<T>(
  c: any,
  responseData: any,
  backgroundTask?: () => Promise<T>
) {
  // Send response immediately
  const response = c.json(responseData);
  
  // Process in background if provided
  if (backgroundTask) {
    backgroundTask().catch(err => console.error("Background task error:", err));
  }
  
  return response;
}

// ============================================
// SERVER-SIDE CACHE
// Prevent repeated slow DB queries
// ============================================

const serverCache = new Map<string, { data: any; timestamp: number }>();

function getCached(key: string, maxAge = 10000): any | null {
  const cached = serverCache.get(key);
  if (cached && Date.now() - cached.timestamp < maxAge) {
    console.log(`✅ Server cache HIT: ${key}`);
    return cached.data;
  }
  return null;
}

function setCache(key: string, data: any): void {
  serverCache.set(key, { data, timestamp: Date.now() });
  // Clean old cache entries (keep last 50)
  if (serverCache.size > 50) {
    const oldestKey = serverCache.keys().next().value;
    serverCache.delete(oldestKey);
  }
}

function clearCache(key: string): void {
  serverCache.delete(key);
  console.log(`🗑️ Cache cleared: ${key}`);
}

// ============================================
// BACKGROUND CACHE REBUILDER
// Rebuilds orders cache without blocking client requests
// ============================================

let cacheRebuildInProgress = false;

async function rebuildOrdersCache() {
  if (cacheRebuildInProgress) {
    console.log('⏩ Cache rebuild already in progress, skipping...');
    return;
  }

  try {
    cacheRebuildInProgress = true;
    console.log('🔨 Starting background cache rebuild...');
    
    // Fetch orders with retry logic (KV operations now have their own timeouts)
    const orders = await withRetry(
      () => kv.getByPrefix("order:"),
      3, // Reduced retries
      1000 // Faster retry
    );
    const validOrders = Array.isArray(orders) ? orders.filter(o => o != null && typeof o === 'object') : [];
    
    console.log(`📊 Processing ${validOrders.length} orders...`);
    
    const minimalOrders = validOrders.map(order => {
      try {
        return {
          id: order.id || '',
          orderNumber: order.orderNumber || '',
          customer: order.customer || '',
          email: order.email || '',
          status: order.status || 'pending',
          paymentStatus: order.paymentStatus || 'pending',
          total: order.total || 0,
          date: order.date || order.createdAt || new Date().toISOString(),
          createdAt: order.createdAt || new Date().toISOString(),
          vendor: order.vendor || '',
          itemCount: order.items?.length || 0,
        };
      } catch (mapError) {
        console.error("❌ Error mapping order:", mapError, order);
        return null;
      }
    }).filter(o => o !== null);
    
    const response = {
      orders: minimalOrders,
      total: minimalOrders.length
    };
    
    setCache('orders_minimal', response);
    console.log(`✅ Cache rebuilt with ${minimalOrders.length} orders`);
    
  } catch (error) {
    console.error('❌ Failed to rebuild cache:', error);
    console.error('❌ Rebuild error stack:', error?.stack);
  } finally {
    cacheRebuildInProgress = false;
  }
}

// Endpoint to manually trigger cache rebuild
app.post("/make-server-16010b6f/rebuild-cache", async (c) => {
  rebuildOrdersCache(); // Don't await - run in background
  return c.json({ 
    success: true, 
    message: "Cache rebuild started in background" 
  });
});

// ============================================
// USER AUTHENTICATION ENDPOINTS
// ============================================

// Helper function to upload profile image
async function uploadProfileImage(userId: string, imageDataUrl: string): Promise<string | null> {
  try {
    const PROFILE_IMAGES_BUCKET = "make-16010b6f-profile-images";
    await ensureBucket(supabase, PROFILE_IMAGES_BUCKET, {
      public: false,
      fileSizeLimit: 524288,
    });

    // Extract base64 data from data URL
    const matches = imageDataUrl.match(/^data:image\/(png|jpg|jpeg|gif|webp);base64,(.+)$/);
    if (!matches) {
      console.error("Invalid image data URL format");
      return null;
    }

    const [, imageType, base64Data] = matches;
    
    // Convert base64 to Uint8Array
    const binaryString = atob(base64Data);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }

    // Generate unique filename
    const filename = `${userId}_${Date.now()}.${imageType === 'jpg' ? 'jpeg' : imageType}`;
    const filePath = `profile-images/${filename}`;

    // Upload to Supabase Storage
    const { data, error } = await supabase.storage
      .from(PROFILE_IMAGES_BUCKET)
      .upload(filePath, bytes, {
        contentType: `image/${imageType}`,
        upsert: false,
      });

    if (error) {
      console.error("❌ Error uploading image to storage:", error);
      return null;
    }

    console.log(`✅ Profile image uploaded: ${filePath}`);
    return filePath;
  } catch (error) {
    console.error("❌ Error processing profile image:", error);
    return null;
  }
}

// Helper function to get signed URL for profile image
async function getSignedImageUrl(filePath: string): Promise<string | null> {
  try {
    const PROFILE_IMAGES_BUCKET = "make-16010b6f-profile-images";
    const { data, error } = await supabase.storage
      .from(PROFILE_IMAGES_BUCKET)
      .createSignedUrl(filePath, 60 * 60 * 24 * 365); // 1 year expiry

    if (error) {
      console.error("❌ Error creating signed URL:", error);
      return null;
    }

    return data.signedUrl;
  } catch (error) {
    console.error("❌ Error getting signed URL:", error);
    return null;
  }
}

// Register new user
app.post("/make-server-16010b6f/auth/register", async (c) => {
  try {
    const body = await c.req.json();
    const { email, password, name, phone, profileImage } = body;
    
    if (!email || !password) {
      return c.json({ error: "Email and password are required" }, 400);
    }
    
    console.log(`👤 Registering user: ${email}`);
    
    // 🔥 VALIDATE EMAIL FORMAT (must have proper TLD like .com, .net, etc.)
    const emailRegex = /^[a-zA-Z0-9._-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
    if (!emailRegex.test(email.trim())) {
      return c.json({ error: "Please enter a valid email address with a proper domain (e.g., name@example.com)" }, 400);
    }
    
    // 🔥 VALIDATE PHONE FORMAT (Myanmar format if phone is provided)
    if (phone && phone.trim()) {
      const normalizedPhone = phone.replace(/[\s\-]/g, ''); // Remove spaces/hyphens
      const myanmarPhoneRegex = /^(\+959|09)\d{9}$/; // Exactly 11 digits for 09XXXXXXXXX or 12 for +959XXXXXXXXX
      
      if (!myanmarPhoneRegex.test(normalizedPhone)) {
        return c.json({ error: "Phone must be Myanmar format: +959XXXXXXXXX (12 digits) or 09XXXXXXXXX (11 digits)" }, 400);
      }
    }
    
    // Check if user with this email already exists
    const existingUser = await withTimeout(kv.get(`user:${email}`), 5000);
    if (existingUser) {
      return c.json({ error: "An account with this email already exists" }, 409);
    }
    
    // 🔥 Check if user with this phone number already exists (if phone provided)
    if (phone && phone.trim()) {
      const normalizedPhone = phone.replace(/\s+/g, ''); // Remove spaces for comparison
      const allUsersWithPrefix = await withTimeout(kv.getByPrefix('user:'), 5000);
      
      // Check if any user has this phone number
      const existingPhoneUser = allUsersWithPrefix.find((userData: any) => {
        if (userData && userData.phone) {
          const existingNormalizedPhone = userData.phone.replace(/\s+/g, '');
          return existingNormalizedPhone === normalizedPhone;
        }
        return false;
      });
      
      if (existingPhoneUser) {
        return c.json({ error: "An account with this phone number already exists" }, 409);
      }
    }
    
    const userId = `user_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
    
    // Upload profile image to storage if provided
    let profileImagePath = "";
    let profileImageSignedUrl = "";
    if (profileImage) {
      try {
        profileImagePath = await uploadProfileImage(userId, profileImage) || "";
        console.log(`📸 Profile image uploaded: ${profileImagePath}`);
        
        // 🔥 Generate signed URL for the uploaded image
        if (profileImagePath) {
          const signedUrl = await getSignedImageUrl(profileImagePath);
          if (signedUrl) {
            profileImageSignedUrl = signedUrl;
            console.log(`🔗 Generated signed URL for profile image`);
          }
        }
      } catch (imgError) {
        console.error("❌ Error uploading profile image:", imgError);
        // Continue registration even if image upload fails
      }
    }
    
    // 🔥 Use signed URL for avatar, fallback to default avatar if no image
    const avatarUrl = profileImageSignedUrl || `https://api.dicebear.com/7.x/pixel-art/svg?seed=${encodeURIComponent(name || email)}`;
    
    const userData = {
      id: userId,
      email,
      password, // In production, this should be hashed
      name: name || "",
      phone: phone || "",
      profileImage: profileImagePath,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    
    await withTimeout(kv.set(`user:${email}`, userData), 5000);
    await withTimeout(kv.set(`userId:${userId}`, { email }), 5000);
    
    // Create empty wishlist for user
    await withTimeout(kv.set(`wishlist:${userId}`, { productIds: [] }), 5000);
    
    // 🔥 CREATE CUSTOMER RECORD FOR ADMIN PORTAL
    const customerId = `cust_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
    const customerData = {
      id: customerId,
      userId: userId, // Link to user account
      name: name || email.split('@')[0],
      email: email,
      avatar: avatarUrl, // 🔥 Use signed URL for uploaded images
      phone: phone || "",
      location: "",
      joinDate: new Date().toISOString(),
      totalOrders: 0,
      totalSpent: 0,
      status: "active",
      tier: "new",
      lastVisit: new Date().toISOString(),
      avgOrderValue: 0,
      tags: ["new-customer"],
      engagementScore: 0,
      lifetimeValue: 0,
      rfmScore: {
        recency: 5,
        frequency: 1,
        monetary: 1
      },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    
    await withTimeout(kv.set(`customer:${customerId}`, customerData), 5000);
    console.log(`✅ Customer record created: ${customerId}`);
    
    console.log(`✅ User registered: ${email}`);
    
    // Return user without password
    const { password: _, ...userWithoutPassword } = userData;
    
    // Generate signed URL for profile image if exists
    if (userWithoutPassword.profileImage) {
      const signedUrl = await getSignedImageUrl(userWithoutPassword.profileImage);
      if (signedUrl) {
        userWithoutPassword.profileImageUrl = signedUrl;
        console.log(`📸 Generated signed URL for profile image`);
      }
    }
    
    return c.json({ 
      success: true,
      user: userWithoutPassword,
      message: "User registered successfully"
    }, 201);
  } catch (error) {
    console.error("❌ Error registering user:", error);
    return c.json({ error: "Failed to register user", details: String(error) }, 500);
  }
});

// Admin signup - Create user from Settings page
app.post("/make-server-16010b6f/auth/signup", async (c) => {
  try {
    const body = await c.req.json();
    const { email, name, phone, role, storeId } = body;
    
    if (!email || !name) {
      return c.json({ error: "Email and name are required" }, 400);
    }
    
    console.log(`👤 Admin creating user: ${email} with role: ${role}${storeId ? ` for store: ${storeId}` : ''}`);
    
    // Check if user already exists
    const existingUser = await withTimeout(kv.get(`user:${email}`), 5000);
    if (existingUser) {
      return c.json({ error: "User already exists" }, 409);
    }
    
    const userId = `user_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
    
    // Generate a temporary password (user should change this on first login)
    const tempPassword = `temp_${Math.random().toString(36).substring(2, 9)}`;
    
    const userData = {
      id: userId,
      email,
      password: tempPassword, // In production, this should be hashed
      name: name || "",
      phone: phone || "",
      role: role || "user",
      storeId: storeId || "", // Store the storeId if provided
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      status: "active",
    };
    
    await withTimeout(kv.set(`user:${email}`, userData), 5000);
    await withTimeout(kv.set(`userId:${userId}`, { email }), 5000);
    
    // Create empty wishlist for user
    await withTimeout(kv.set(`wishlist:${userId}`, { productIds: [] }), 5000);
    
    console.log(`✅ User created by admin: ${email}`);
    
    // Return user without password
    const { password: _, ...userWithoutPassword } = userData;
    return c.json({ 
      success: true,
      user: userWithoutPassword,
      message: "User created successfully",
      tempPassword: tempPassword, // Send temp password to admin
    }, 201);
  } catch (error) {
    console.error("❌ Error creating user:", error);
    return c.json({ error: "Failed to create user", details: String(error) }, 500);
  }
});

// Initialize user in auth system (idempotent - won't fail if user already exists)
app.post("/make-server-16010b6f/auth/init-user", async (c) => {
  try {
    const body = await c.req.json();
    const { id, email, name, phone, role, password } = body;
    
    if (!email || !id) {
      return c.json({ error: "Email and ID are required" }, 400);
    }
    
    console.log(`🔧 Initializing auth user: ${email}`);
    
    // Check if user already exists
    const existingUser = await withTimeout(kv.get(`user:${email}`), 5000);
    if (existingUser) {
      console.log(`✅ User already exists: ${email}`);
      return c.json({ success: true, message: "User already exists", existed: true });
    }
    
    // Create user data
    const userData = {
      id,
      email,
      password: password || "default_password_123",
      name: name || "",
      phone: phone || "",
      role: role || "user",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      status: "active",
    };
    
    await withTimeout(kv.set(`user:${email}`, userData), 5000);
    await withTimeout(kv.set(`userId:${id}`, { email }), 5000);
    
    // Create empty wishlist for user
    await withTimeout(kv.set(`wishlist:${id}`, { productIds: [] }), 5000);
    
    console.log(`✅ Auth user initialized: ${email}`);
    
    return c.json({ 
      success: true,
      message: "User initialized successfully",
      existed: false
    });
  } catch (error) {
    console.error("❌ Error initializing auth user:", error);
    return c.json({ error: "Failed to initialize user", details: String(error) }, 500);
  }
});

// Get all users (admin only)
app.get("/make-server-16010b6f/auth/users", async (c) => {
  try {
    console.log("📋 Fetching all users...");
    
    // Get all user keys
    const userKeys = await withTimeout(kv.getByPrefix("user:"), 10000);
    
    if (!userKeys || userKeys.length === 0) {
      console.log("⚠️ No users found in database");
      return c.json([]);
    }
    
    // Filter out userId mappings and return only user data
    const users = userKeys
      .filter((item: any) => item.value && item.value.email) // Only get actual user objects
      .map((item: any) => {
        const { password, ...userWithoutPassword } = item.value;
        return userWithoutPassword;
      });
    
    console.log(`✅ Found ${users.length} users`);
    return c.json(users);
  } catch (error) {
    console.error("❌ Error fetching users:", error);
    return c.json({ error: "Failed to fetch users", details: String(error) }, 500);
  }
});

// Update user (admin only)
app.put("/make-server-16010b6f/auth/user/:userId", async (c) => {
  try {
    const userId = c.req.param("userId");
    const body = await c.req.json();
    const { name, phone, role, avatar, status } = body;
    
    console.log(`🔄 Updating user: ${userId}`);
    
    // Get userId -> email mapping
    const userIdMapping = await withTimeout(kv.get(`userId:${userId}`), 5000);
    if (!userIdMapping || !userIdMapping.email) {
      return c.json({ error: "User not found" }, 404);
    }
    
    const email = userIdMapping.email;
    
    // Get existing user data
    const existingUser = await withTimeout(kv.get(`user:${email}`), 5000);
    if (!existingUser) {
      return c.json({ error: "User not found" }, 404);
    }
    
    // Update user data
    const updatedUser = {
      ...existingUser,
      name: name !== undefined ? name : existingUser.name,
      phone: phone !== undefined ? phone : existingUser.phone,
      role: role !== undefined ? role : existingUser.role,
      avatar: avatar !== undefined ? avatar : existingUser.avatar,
      status: status !== undefined ? status : existingUser.status,
      updatedAt: new Date().toISOString(),
    };
    
    await withTimeout(kv.set(`user:${email}`, updatedUser), 5000);
    
    console.log(`✅ User updated: ${email}`);
    
    // Return user without password
    const { password: _, ...userWithoutPassword } = updatedUser;
    return c.json({ 
      success: true,
      user: userWithoutPassword,
      message: "User updated successfully"
    });
  } catch (error) {
    console.error("❌ Error updating user:", error);
    return c.json({ error: "Failed to update user", details: String(error) }, 500);
  }
});

// 🔥 Validate email and phone availability (real-time check)
app.post("/make-server-16010b6f/auth/validate", async (c) => {
  try {
    const body = await c.req.json();
    const { email, phone } = body;
    
    const errors: { email?: string; phone?: string } = {};
    
    // Check email if provided
    if (email && email.trim()) {
      // Validate email format - MUST have proper domain with TLD (.com, .net, .org, etc.)
      // Pattern: username@domain.tld (domain must have at least 2 chars, TLD at least 2 chars)
      const emailRegex = /^[a-zA-Z0-9._-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
      
      if (!emailRegex.test(email.trim())) {
        errors.email = "Please enter a valid email address (e.g., name@example.com)";
      } else {
        const existingUser = await withTimeout(kv.get(`user:${email.trim()}`), 5000);
        if (existingUser) {
          errors.email = "An account with this email already exists";
        }
      }
    }
    
    // Check phone if provided
    if (phone && phone.trim()) {
      // Normalize phone: remove all spaces and hyphens for validation
      const normalizedPhone = phone.replace(/[\s\-]/g, '');
      
      // Validate Myanmar phone format: +959XXXXXXXXX or 09XXXXXXXXX
      // International: +959 followed by 9 digits (12 total)
      // Local: 09 followed by 9 digits (11 total)
      const myanmarPhoneRegex = /^(\+959|09)\d{9}$/;
      
      if (!myanmarPhoneRegex.test(normalizedPhone)) {
        errors.phone = "Phone must be Myanmar format: +959XXXXXXXXX (12 digits) or 09XXXXXXXXX (11 digits)";
      } else {
        const allUsersWithPrefix = await withTimeout(kv.getByPrefix('user:'), 5000);
        
        // Check if any user has this phone number
        const existingPhoneUser = allUsersWithPrefix.find((userData: any) => {
          if (userData && userData.phone) {
            const existingNormalizedPhone = userData.phone.replace(/[\s\-]/g, '');
            return existingNormalizedPhone === normalizedPhone;
          }
          return false;
        });
        
        if (existingPhoneUser) {
          errors.phone = "An account with this phone number already exists";
        }
      }
    }
    
    return c.json({ 
      valid: Object.keys(errors).length === 0,
      errors 
    }, 200);
  } catch (error) {
    console.error("❌ Error validating user data:", error);
    return c.json({ error: "Failed to validate", details: String(error) }, 500);
  }
});

// 🔧 Admin: Clear all test data (customers and users)
app.post("/make-server-16010b6f/admin/clear-test-data", async (c) => {
  try {
    const body = await c.req.json();
    const { confirmDelete } = body;
    
    if (!confirmDelete) {
      return c.json({ error: "Confirmation required" }, 400);
    }
    
    console.log("🗑️ Clearing all test data...");
    
    // Get all users
    const allUsers = await withTimeout(kv.getByPrefix('user:'), 5000);
    const allUserIds = await withTimeout(kv.getByPrefix('userId:'), 5000);
    const allCustomers = await withTimeout(kv.getByPrefix('cust_'), 5000);
    const allWishlists = await withTimeout(kv.getByPrefix('wishlist:'), 5000);
    
    let deletedCount = 0;
    
    // Delete all users
    for (const user of allUsers) {
      if (user && user.email) {
        await withTimeout(kv.del(`user:${user.email}`), 5000);
        deletedCount++;
      }
    }
    
    // Delete all userId mappings
    for (const mapping of allUserIds) {
      if (mapping && mapping.email) {
        // Extract the user ID from the mapping object
        const userId = Object.keys(mapping).find(k => !['email'].includes(k));
        if (userId) {
          await withTimeout(kv.del(`userId:${userId}`), 5000);
        }
      }
    }
    
    // Delete all customers
    for (const customer of allCustomers) {
      if (customer && customer.id) {
        await withTimeout(kv.del(customer.id), 5000);
        deletedCount++;
      }
    }
    
    // Delete all wishlists  
    const wishlistKeys = Object.keys(allWishlists || {}).filter(k => k.startsWith('wishlist:'));
    for (const key of wishlistKeys) {
      await withTimeout(kv.del(key), 5000);
    }
    
    console.log(`✅ Deleted ${deletedCount} records`);
    
    return c.json({ 
      success: true,
      message: `Successfully cleared all test data (${deletedCount} records deleted)`,
      deletedCount 
    }, 200);
  } catch (error) {
    console.error("❌ Error clearing test data:", error);
    return c.json({ error: "Failed to clear test data", details: String(error) }, 500);
  }
});

// Login user
app.post("/make-server-16010b6f/auth/login", async (c) => {
  try {
    const body = await c.req.json();
    const { email, password } = body;
    
    if (!email || !password) {
      return c.json({ error: "Email and password are required" }, 400);
    }
    
    console.log(`🔐 Login attempt: ${email}`);
    
    const user = await withTimeout(kv.get(`user:${email}`), 5000);
    if (!user || user.password !== password) {
      return c.json({ error: "Invalid email or password" }, 401);
    }
    
    console.log(`✅ User logged in: ${email}`);
    
    // Ensure userId mapping exists (create if missing)
    if (user.id) {
      const existingMapping = await withTimeout(kv.get(`userId:${user.id}`), 5000);
      if (!existingMapping) {
        console.log(`🔧 Creating missing userId mapping for ${user.id} -> ${email}`);
        await withTimeout(kv.set(`userId:${user.id}`, { email }), 5000);
      }
    }
    
    // Return user without password
    const { password: _, ...userWithoutPassword } = user;
    
    // Generate signed URL for profile image if exists
    if (userWithoutPassword.profileImage) {
      const signedUrl = await getSignedImageUrl(userWithoutPassword.profileImage);
      if (signedUrl) {
        userWithoutPassword.profileImageUrl = signedUrl;
        console.log(`📸 Generated signed URL for profile image`);
      }
    }
    
    return c.json({ 
      success: true,
      user: userWithoutPassword,
      message: "Login successful"
    });
  } catch (error) {
    console.error("❌ Error logging in:", error);
    return c.json({ error: "Failed to login", details: String(error) }, 500);
  }
});

// Sync users endpoint - for Settings component
app.post("/make-server-16010b6f/auth/sync-users", async (c) => {
  try {
    console.log("🔄 Syncing users...");
    
    // Get all users
    const userKeys = await withTimeout(kv.getByPrefix("user:"), 10000);
    
    if (!userKeys || userKeys.length === 0) {
      console.log("⚠️ No users found to sync");
      return c.json({ success: true, message: "No users to sync", count: 0 });
    }
    
    // Filter and count users
    const users = userKeys.filter((item: any) => item.value && item.value.email);
    
    console.log(`✅ Synced ${users.length} users`);
    return c.json({ 
      success: true, 
      message: "Users synced successfully",
      count: users.length 
    });
  } catch (error) {
    console.error("❌ Error syncing users:", error);
    return c.json({ error: "Failed to sync users", details: String(error) }, 500);
  }
});

// Change user password (legacy KV users + Supabase Auth storefront customers)
app.post("/make-server-16010b6f/auth/change-password", async (c) => {
  try {
    const body = await c.req.json();
    const { email, currentPassword, newPassword } = body;
    
    if (!email || !currentPassword || !newPassword) {
      return c.json({ error: "Email, current password, and new password are required" }, 400);
    }
    
    const emailTrim = String(email).trim();
    const emailLower = emailTrim.toLowerCase();
    
    console.log(`🔐 Password change attempt for: ${emailTrim}`);
    
    // Legacy: password stored in KV (user:${email})
    let legacyUser = await withTimeout(kv.get(`user:${emailTrim}`), 5000);
    if (!legacyUser) {
      legacyUser = await withTimeout(kv.get(`user:${emailLower}`), 5000);
    }
    
    if (legacyUser && typeof legacyUser === "object" && (legacyUser as { password?: string }).password !== undefined) {
      if ((legacyUser as { password?: string }).password !== currentPassword) {
        console.log(`❌ Current password verification failed (legacy KV) for: ${emailTrim}`);
        return c.json({ error: "Current password is incorrect" }, 401);
      }
      const updatedUser = {
        ...legacyUser,
        password: newPassword,
      };
      const key = (legacyUser as { email?: string }).email || emailTrim;
      await withTimeout(kv.set(`user:${key}`, updatedUser), 5000);
      console.log(`✅ Password changed successfully (legacy KV) for: ${emailTrim}`);
      return c.json({
        success: true,
        message: "Password changed successfully",
      });
    }
    
    // Storefront customers: Supabase Auth (no KV user: record)
    const { data: signInData, error: signInErr } = await supabaseAuth.auth.signInWithPassword({
      email: emailLower,
      password: currentPassword,
    });
    
    if (signInErr || !signInData.user) {
      console.log(`❌ Supabase sign-in failed for password change:`, signInErr?.message);
      return c.json(
        { error: signInErr?.message?.includes("Invalid") ? "Current password is incorrect" : (signInErr?.message || "Current password is incorrect") },
        401
      );
    }
    
    const { error: updErr } = await supabase.auth.admin.updateUserById(signInData.user.id, {
      password: newPassword,
    });
    
    if (updErr) {
      console.error("❌ Error updating Supabase Auth password:", updErr);
      return c.json({ error: updErr.message || "Failed to update password" }, 500);
    }
    
    console.log(`✅ Password changed successfully (Supabase Auth) for: ${emailTrim}`);
    return c.json({
      success: true,
      message: "Password changed successfully",
    });
  } catch (error) {
    console.error("❌ Error changing password:", error);
    return c.json({ error: "Failed to change password", details: String(error) }, 500);
  }
});

// Get user profile
app.get("/make-server-16010b6f/auth/profile/:userId", async (c) => {
  try {
    let userId = c.req.param("userId");
    console.log(`👤 Fetching profile: ${userId}`);
    
    // 🔥 AUTO-FIX: If a customer ID was passed instead of a userId, resolve it
    if (userId.startsWith('cust_')) {
      console.log(`⚠️ Customer ID detected in profile fetch: ${userId}. Resolving to userId...`);
      const customer = await kv.get(`customer:${userId}`);
      if (customer && customer.userId) {
        console.log(`✅ Resolved ${userId} -> ${customer.userId}`);
        userId = customer.userId;
      } else {
        // Try searching by ID if it's not a prefix
        const allCustomers = await kv.getByPrefix("customer:");
        const found = allCustomers.find((c: any) => c && c.id === userId);
        if (found && found.userId) {
          userId = found.userId;
        }
      }
    }

    // First try to get user by userId mapping
    const userIdData = await withTimeout(kv.get(`userId:${userId}`), 5000);
    
    let user;
    if (userIdData && userIdData.email) {
      // Found userId mapping, get user by email
      user = await withTimeout(kv.get(`user:${userIdData.email}`), 5000);
    } else {
      // No userId mapping found, try to find user by searching all users
      console.log(`⚠️ No userId mapping found for ${userId}, searching all users...`);
      
      // Get all user keys
      const allUsers = await withTimeout(kv.getByPrefix(`user:`), 5000);
      
      // Find user with matching id
      user = allUsers.find((u: any) => u.id === userId);
      
      if (user) {
        // Create the missing userId mapping for future requests
        console.log(`🔧 Creating missing userId mapping for ${userId} -> ${user.email}`);
        await withTimeout(kv.set(`userId:${userId}`, { email: user.email }), 5000);
      }
    }
    
    if (!user) {
      // Supabase storefront customers + profile PUT often live in auth:user:${userId} or customer:* — not legacy user:${email}
      const authProfile = await withTimeout(kv.get(`auth:user:${userId}`), 5000);
      if (authProfile && typeof authProfile === "object") {
        const { password: __, ...authRest } = authProfile as Record<string, unknown> & {
          password?: string;
        };
        const out = { ...authRest } as Record<string, unknown>;
        if (typeof out.profileImage === "string" && out.profileImage.trim()) {
          const signedUrl = await getSignedImageUrl(out.profileImage.trim());
          if (signedUrl) {
            out.profileImageUrl = signedUrl;
            console.log(`📸 GET profile: auth:user — signed profile image URL`);
          }
        }
        console.log(`✅ Profile from auth:user:${userId}`);
        return c.json({ user: out });
      }

      const allCustomers = await withTimeout(kv.getByPrefix("customer:"), 5000);
      const customer = Array.isArray(allCustomers)
        ? allCustomers.find((c: any) => c != null && c.userId === userId)
        : null;
      if (customer && typeof customer === "object") {
        const { password: ___, ...customerRest } = customer as Record<string, unknown> & {
          password?: string;
        };
        const cust = customer as {
          id?: string;
          profileImage?: string;
          avatar?: string;
        };
        const userPayload: Record<string, unknown> = {
          ...customerRest,
          id: userId,
          customerId: cust.id,
        };
        if (typeof cust.profileImage === "string" && cust.profileImage.trim()) {
          const su = await getSignedImageUrl(cust.profileImage.trim());
          if (su) userPayload.profileImageUrl = su;
        } else if (typeof cust.avatar === "string" && cust.avatar.trim()) {
          userPayload.profileImageUrl = cust.avatar.trim();
        }
        console.log(`✅ Profile from customer record for userId ${userId}`);
        return c.json({ user: userPayload });
      }

      console.log(`❌ User not found: ${userId}`);
      return c.json({ error: "User not found" }, 404);
    }

    const { password: _, ...userWithoutPassword } = user;

    // Generate signed URL for profile image if exists
    if (userWithoutPassword.profileImage) {
      const signedUrl = await getSignedImageUrl(userWithoutPassword.profileImage);
      if (signedUrl) {
        userWithoutPassword.profileImageUrl = signedUrl;
        console.log(`📸 Generated signed URL for profile image`);
      }
    }

    return c.json({ user: userWithoutPassword });
  } catch (error) {
    console.error("❌ Error fetching profile:", error);
    return c.json({ error: "Failed to fetch profile" }, 500);
  }
});

// Update user profile
app.put("/make-server-16010b6f/auth/profile/:userId", async (c) => {
  try {
    let userId = c.req.param("userId");
    const body = await c.req.json();
    
    console.log(`🔄 Updating profile for userId: ${userId}`);
    
    // 🔥 AUTO-FIX: If a customer ID was passed instead of a userId, resolve it
    if (userId.startsWith('cust_')) {
      console.log(`⚠️ Customer ID detected in profile update: ${userId}. Resolving to userId...`);
      const customer = await kv.get(`customer:${userId}`);
      if (customer && customer.userId) {
        console.log(`✅ Resolved ${userId} -> ${customer.userId}`);
        userId = customer.userId;
      } else {
        // Try searching by ID if it's not a prefix
        const allCustomers = await kv.getByPrefix("customer:");
        const found = allCustomers.find((c: any) => c && c.id === userId);
        if (found && found.userId) {
          userId = found.userId;
        }
      }
    }

    console.log(`📦 Request body:`, { ...body, profileImage: body.profileImage ? '[IMAGE DATA]' : undefined });
    
    // First try to get user by userId mapping
    let userIdData = await withTimeout(kv.get(`userId:${userId}`), 5000);
    console.log(`🔍 userId mapping result:`, userIdData);
    
    let existingUser;
    if (userIdData && userIdData.email) {
      // Found userId mapping, get user by email
      console.log(`📧 Looking up user by email: ${userIdData.email}`);
      existingUser = await withTimeout(kv.get(`user:${userIdData.email}`), 5000);
      console.log(`👤 User found by email:`, existingUser ? 'YES' : 'NO');
    } else {
      // No userId mapping found, try to find user by searching all users
      console.log(`⚠️ No userId mapping found for ${userId}, searching all users...`);
      
      // Get all user keys
      const allUsers = await withTimeout(kv.getByPrefix(`user:`), 5000);
      console.log(`📊 Total users found in database: ${allUsers.length}`);
      
      // Find user with matching id
      existingUser = allUsers.find((u: any) => u.id === userId);
      console.log(`🔍 User found by searching:`, existingUser ? 'YES' : 'NO');
      
      if (existingUser) {
        // Create the missing userId mapping for future requests
        console.log(`🔧 Creating missing userId mapping for ${userId} -> ${existingUser.email}`);
        await withTimeout(kv.set(`userId:${userId}`, { email: existingUser.email }), 5000);
        userIdData = { email: existingUser.email };
      }
    }
    
    // Storefront customers (login/register via auth_routes) live in customer: KV + Supabase Auth,
    // not in legacy user:${email}. Resolve and update them when legacy user is missing.
    if (!existingUser) {
      const authKvProfile = await withTimeout(kv.get(`auth:user:${userId}`), 5000);
      if (authKvProfile && typeof authKvProfile === "object") {
        let profileImagePath = (authKvProfile as { profileImage?: string }).profileImage;
        if (body.profileImage) {
          const uploadedPath = await uploadProfileImage(userId, body.profileImage);
          if (uploadedPath) {
            profileImagePath = uploadedPath;
            console.log(`📸 Profile image uploaded (auth:user KV): ${profileImagePath}`);
          }
        }
        const updatedProfile = {
          ...(authKvProfile as Record<string, unknown>),
          name: typeof body.name === "string" ? body.name : (authKvProfile as { name?: string }).name,
          phone: typeof body.phone === "string" ? body.phone : (authKvProfile as { phone?: string }).phone,
          profileImage: profileImagePath,
          updatedAt: new Date().toISOString(),
        };
        await withTimeout(kv.set(`auth:user:${userId}`, updatedProfile), 5000);
        const metadataUpdates: Record<string, unknown> = {
          name: updatedProfile.name,
          phone: updatedProfile.phone,
        };
        if (profileImagePath) {
          metadataUpdates.profileImage = profileImagePath;
        }
        const { error: authUpdErr } = await supabase.auth.admin.updateUserById(userId, {
          user_metadata: metadataUpdates,
        });
        if (authUpdErr) {
          console.error("❌ Supabase Auth update (auth:user profile):", authUpdErr);
        }
        const { password: __, ...userOut } = updatedProfile as Record<string, unknown> & { password?: string };
        const out = { ...userOut } as Record<string, unknown>;
        if (out.profileImage && typeof out.profileImage === "string") {
          const signedUrl = await getSignedImageUrl(out.profileImage as string);
          if (signedUrl) out.profileImageUrl = signedUrl;
        }
        return c.json({
          success: true,
          user: out,
          message: "Profile updated successfully",
        });
      }

      const allCustomers = await withTimeout(kv.getByPrefix("customer:"), 5000);
      const customer = Array.isArray(allCustomers)
        ? allCustomers.find((c: any) => c != null && c.userId === userId)
        : null;

      if (customer) {
        let profileImagePath: string | undefined =
          typeof customer.profileImage === "string" ? customer.profileImage : undefined;

        if (body.profileImage) {
          const uploadedPath = await uploadProfileImage(userId, body.profileImage);
          if (uploadedPath) {
            profileImagePath = uploadedPath;
            console.log(`📸 Profile image uploaded (customer): ${profileImagePath}`);
          }
        }

        if (typeof body.name === "string" && body.name.trim()) {
          customer.name = body.name.trim();
        }
        if (typeof body.phone === "string") {
          customer.phone = body.phone.trim();
        }
        customer.updatedAt = new Date().toISOString();
        if (profileImagePath) {
          customer.profileImage = profileImagePath;
          const signed = await getSignedImageUrl(profileImagePath);
          if (signed) customer.avatar = signed;
        }

        await withTimeout(kv.set(`customer:${customer.id}`, customer), 5000);

        const metadataUpdates: Record<string, unknown> = {
          name: customer.name,
          phone: customer.phone,
        };
        if (profileImagePath) {
          metadataUpdates.profileImage = profileImagePath;
        }
        const { error: authUpdErr } = await supabase.auth.admin.updateUserById(userId, {
          user_metadata: metadataUpdates,
        });
        if (authUpdErr) {
          console.error("❌ Supabase Auth update (customer profile):", authUpdErr);
        }

        const { password: _, ...customerRest } = customer as Record<string, unknown> & { password?: string };
        const userResponse = {
          ...customerRest,
          id: userId,
          customerId: customer.id,
          profileImageUrl: profileImagePath ? await getSignedImageUrl(profileImagePath) : customer.avatar,
        };
        if (profileImagePath) {
          const su = await getSignedImageUrl(profileImagePath);
          if (su) (userResponse as { profileImageUrl?: string }).profileImageUrl = su;
        }

        return c.json({
          success: true,
          user: userResponse,
          message: "Profile updated successfully",
        });
      }

      console.error(`❌ User not found for userId: ${userId}`);
      return c.json({ error: "User not found" }, 404);
    }
    
    // Handle profile image upload if provided
    let profileImagePath = existingUser.profileImage;
    if (body.profileImage) {
      const uploadedPath = await uploadProfileImage(userId, body.profileImage);
      if (uploadedPath) {
        profileImagePath = uploadedPath;
        console.log(`📸 Profile image uploaded: ${profileImagePath}`);
      }
      // Remove the data URL from body before saving
      delete body.profileImage;
    }
    
    const updatedUser = {
      ...existingUser,
      ...body,
      id: userId,
      email: existingUser.email, // Email shouldn't be changed
      profileImage: profileImagePath,
      updatedAt: new Date().toISOString(),
    };
    
    await withTimeout(kv.set(`user:${userIdData.email}`, updatedUser), 5000);
    
    const { password: _, ...userWithoutPassword } = updatedUser;
    
    // Generate signed URL for profile image if exists
    if (userWithoutPassword.profileImage) {
      const signedUrl = await getSignedImageUrl(userWithoutPassword.profileImage);
      if (signedUrl) {
        userWithoutPassword.profileImageUrl = signedUrl;
        console.log(`📸 Generated signed URL for profile image`);
      }
    }
    
    return c.json({ 
      success: true,
      user: userWithoutPassword,
      message: "Profile updated successfully"
    });
  } catch (error) {
    console.error("❌ Error updating profile:", error);
    return c.json({ error: "Failed to update profile" }, 500);
  }
});

// 🔥 DELETE USER - Complete removal from database
app.delete("/make-server-16010b6f/auth/user/:userId", async (c) => {
  try {
    const userId = c.req.param("userId");
    
    console.log(`🗑️ COMPLETE USER DELETION INITIATED for userId: ${userId}`);
    
    // Step 1: Get user email from userId mapping
    const userIdData = await withTimeout(kv.get(`userId:${userId}`), 5000);
    let userEmail: string | null = null;
    
    if (userIdData && userIdData.email) {
      userEmail = userIdData.email;
      console.log(`📧 Found user email: ${userEmail}`);
    } else {
      // Try to find user by searching all users
      console.log(`⚠️ No userId mapping found, searching all users...`);
      const allUsers = await withTimeout(kv.getByPrefix(`user:`), 5000);
      const user = allUsers.find((u: any) => u.id === userId);
      
      if (user && user.email) {
        userEmail = user.email;
        console.log(`📧 Found user email from search: ${userEmail}`);
      }
    }
    
    if (!userEmail) {
      console.log(`❌ Could not find user with userId: ${userId}`);
      return c.json({ error: "User not found" }, 404);
    }
    
    // Step 2: Delete all user-related data
    const deletionPromises: Promise<any>[] = [];
    
    // Delete main user record (by email)
    console.log(`🗑️ Deleting user:${userEmail}`);
    deletionPromises.push(
      withTimeout(kv.del(`user:${userEmail}`), 5000)
        .then(() => console.log(`✅ Deleted user:${userEmail}`))
        .catch(err => console.error(`❌ Failed to delete user:${userEmail}:`, err))
    );
    
    // Delete userId lookup mapping
    console.log(`🗑️ Deleting userId:${userId}`);
    deletionPromises.push(
      withTimeout(kv.del(`userId:${userId}`), 5000)
        .then(() => console.log(`✅ Deleted userId:${userId}`))
        .catch(err => console.error(`❌ Failed to delete userId:${userId}:`, err))
    );
    
    // Delete wishlist
    console.log(`🗑️ Deleting wishlist:${userId}`);
    deletionPromises.push(
      withTimeout(kv.del(`wishlist:${userId}`), 5000)
        .then(() => console.log(`✅ Deleted wishlist:${userId}`))
        .catch(err => console.error(`❌ Failed to delete wishlist:${userId}:`, err))
    );
    
    // Step 3: Find and delete associated customer record
    console.log(`🔍 Searching for customer record with email: ${userEmail}`);
    const allCustomers = await withTimeout(kv.getByPrefix("customer:"), 10000);
    const customerRecords = (Array.isArray(allCustomers) ? allCustomers : [])
      .filter(c => c != null && (
        c.email === userEmail || 
        c.userId === userId
      ));
    
    if (customerRecords.length > 0) {
      console.log(`🗑️ Found ${customerRecords.length} customer record(s) to delete`);
      
      for (const customer of customerRecords) {
        console.log(`🗑️ Deleting customer:${customer.id}`);
        deletionPromises.push(
          withTimeout(kv.del(`customer:${customer.id}`), 5000)
            .then(() => console.log(`✅ Deleted customer:${customer.id}`))
            .catch(err => console.error(`❌ Failed to delete customer:${customer.id}:`, err))
        );
        
        // Delete customer-related data
        deletionPromises.push(
          withTimeout(kv.del(`customer:${customer.id}:wishlist`), 5000).catch(() => {}),
          withTimeout(kv.del(`customer:${customer.id}:addresses`), 5000).catch(() => {})
        );
      }
    } else {
      console.log(`ℹ️ No customer records found for this user`);
    }
    
    // Step 4: Delete Supabase Auth user (if exists)
    try {
      console.log(`🗑️ Attempting to delete Supabase Auth user...`);
      
      // First, try to get the auth user by email
      const { data: authUsers, error: listError } = await supabase.auth.admin.listUsers();
      
      if (!listError && authUsers?.users) {
        const authUser = authUsers.users.find(u => u.email === userEmail);
        
        if (authUser) {
          const { error: deleteAuthError } = await supabase.auth.admin.deleteUser(authUser.id);
          
          if (deleteAuthError) {
            console.error(`⚠️ Failed to delete Supabase Auth user:`, deleteAuthError);
          } else {
            console.log(`✅ Deleted Supabase Auth user: ${authUser.id}`);
          }
        } else {
          console.log(`ℹ️ No Supabase Auth user found for ${userEmail}`);
        }
      }
    } catch (authError) {
      console.error(`⚠️ Error deleting Supabase Auth user (non-critical):`, authError);
      // Don't fail the whole operation if auth deletion fails
    }
    
    // Execute all deletions
    await Promise.allSettled(deletionPromises);
    
    console.log(`✅ USER DELETION COMPLETE for ${userEmail} (${userId})`);
    
    return c.json({
      success: true,
      message: "User completely deleted from database",
      deletedEmail: userEmail,
      deletedUserId: userId,
    });
  } catch (error: any) {
    console.error("❌ Error deleting user:", error);
    return c.json({ 
      error: "Failed to delete user", 
      details: String(error) 
    }, 500);
  }
});

// ============================================
// WISHLIST ENDPOINTS
// ============================================

// Get user wishlist
app.get("/make-server-16010b6f/wishlist/:userId", async (c) => {
  try {
    const userId = c.req.param("userId");
    console.log(`❤️ Fetching wishlist for: ${userId}`);
    
    const wishlist = await withTimeout(kv.get(`wishlist:${userId}`), 5000);
    
    if (!wishlist) {
      // Create empty wishlist if doesn't exist
      const emptyWishlist = { productIds: [] };
      await withTimeout(kv.set(`wishlist:${userId}`, emptyWishlist), 5000);
      await withTimeout(kv.set(`customer:${userId}:wishlist`, []), 5000);
      return c.json({ productIds: [] });
    }
    
    // Ensure customer key is also synced
    const productIds = wishlist.productIds || [];
    await withTimeout(kv.set(`customer:${userId}:wishlist`, productIds), 5000);
    
    return c.json(wishlist);
  } catch (error) {
    console.error("❌ Error fetching wishlist:", error);
    return c.json({ error: "Failed to fetch wishlist", productIds: [] }, 500);
  }
});

// Update user wishlist
app.put("/make-server-16010b6f/wishlist/:userId", async (c) => {
  try {
    const userId = c.req.param("userId");
    const body = await c.req.json();
    const { productIds } = body;
    
    console.log(`❤️ Updating wishlist for: ${userId}, products: ${productIds?.length || 0}`);
    
    const wishlistData = {
      productIds: productIds || [],
      updatedAt: new Date().toISOString(),
    };
    
    // Save to primary wishlist key - kv.set already has 15s timeout
    await withRetry(() => kv.set(`wishlist:${userId}`, wishlistData), 2, 1000);
    
    // 🔥 ALSO save to customer wishlist key (for admin panel compatibility)
    await withRetry(() => kv.set(`customer:${userId}:wishlist`, productIds || []), 2, 1000);
    console.log(`✅ Wishlist synced to both keys for user: ${userId}`);
    
    return c.json({ 
      success: true,
      wishlist: wishlistData,
      message: "Wishlist updated successfully"
    });
  } catch (error) {
    console.error("❌ [Supabase] ❌ Error updating wishlist:", error);
    return c.json({ error: "Failed to update wishlist" }, 500);
  }
});

// Add product to wishlist
app.post("/make-server-16010b6f/wishlist/:userId/add/:productId", async (c) => {
  try {
    const userId = c.req.param("userId");
    const productId = c.req.param("productId");
    
    console.log(`❤️ Adding to wishlist: ${productId} for user: ${userId}`);
    
    // kv.get already has 15s timeout
    let wishlist = await withRetry(() => kv.get(`wishlist:${userId}`), 2, 1000);
    if (!wishlist) {
      wishlist = { productIds: [] };
    }
    
    const productIds = wishlist.productIds || [];
    if (!productIds.includes(productId)) {
      productIds.push(productId);
    }
    
    const updatedWishlist = {
      productIds,
      updatedAt: new Date().toISOString(),
    };
    
    // Save to both keys - kv.set already has 15s timeout
    await withRetry(() => kv.set(`wishlist:${userId}`, updatedWishlist), 2, 1000);
    await withRetry(() => kv.set(`customer:${userId}:wishlist`, productIds), 2, 1000);
    
    return c.json({ 
      success: true,
      wishlist: updatedWishlist,
      message: "Added to wishlist"
    });
  } catch (error) {
    console.error("❌ [Supabase] ❌ Error adding to wishlist:", error);
    return c.json({ error: "Failed to add to wishlist" }, 500);
  }
});

// Remove product from wishlist
app.delete("/make-server-16010b6f/wishlist/:userId/remove/:productId", async (c) => {
  try {
    const userId = c.req.param("userId");
    const productId = c.req.param("productId");
    
    console.log(`❤️ Removing from wishlist: ${productId} for user: ${userId}`);
    
    // kv.get already has 15s timeout
    const wishlist = await withRetry(() => kv.get(`wishlist:${userId}`), 2, 1000);
    if (!wishlist) {
      return c.json({ success: true, message: "Product not in wishlist" });
    }
    
    const productIds = (wishlist.productIds || []).filter(id => id !== productId);
    
    const updatedWishlist = {
      productIds,
      updatedAt: new Date().toISOString(),
    };
    
    // Save to both keys - kv.set already has 15s timeout
    await withRetry(() => kv.set(`wishlist:${userId}`, updatedWishlist), 2, 1000);
    await withRetry(() => kv.set(`customer:${userId}:wishlist`, productIds), 2, 1000);
    
    return c.json({ 
      success: true,
      wishlist: updatedWishlist,
      message: "Removed from wishlist"
    });
  } catch (error) {
    console.error("❌ [Supabase] ❌ Error removing from wishlist:", error);
    return c.json({ error: "Failed to remove from wishlist" }, 500);
  }
});

// ============================================
// VENDOR AUTHENTICATION ENDPOINTS
// ============================================

// Vendor login endpoint
app.post("/make-server-16010b6f/vendor-auth/login", async (c) => {
  try {
    const body = await c.req.json();
    const { email, password } = body;
    
    if (!email || !password) {
      return c.json({ error: "Email and password are required" }, 400);
    }
    
    console.log(`🔐 [VendorAuth] Login attempt for: ${email}`);
    
    // Vendor profiles only (excludes vendor:audience:* KV rows)
    const validVendors = await kv.getVendorProfiles();
    
    // Find vendor by email
    const vendor = validVendors.find((v: any) => v.email?.toLowerCase() === email.toLowerCase());
    
    if (!vendor) {
      console.log(`❌ [VendorAuth] Vendor not found: ${email}`);
      return c.json({ error: "Invalid email or password" }, 401);
    }
    
    // Check if vendor has no password set yet (needs to complete setup)
    if (!vendor.password) {
      console.log(`⚠️ [VendorAuth] Vendor has no password set: ${email}`);
      return c.json({ 
        error: "Please complete your vendor setup first. Visit the setup page to set your credentials.",
        needsSetup: true 
      }, 401);
    }
    
    // Check password (in production, this should use hashed passwords)
    if (vendor.password !== password) {
      console.log(`❌ [VendorAuth] Invalid password for: ${email}`);
      return c.json({ error: "Invalid email or password" }, 401);
    }
    
    // Check if vendor is active
    if (vendor.status !== 'active') {
      console.log(`❌ [VendorAuth] Vendor not active: ${email}, status: ${vendor.status}`);
      return c.json({ error: "Your vendor account is not active. Please contact support." }, 403);
    }
    
    console.log(`✅ [VendorAuth] Login successful for: ${email}`);
    
    // Get vendor settings for store info
    const vendorSettings = await withTimeout(kv.get(`vendor_settings:${vendor.id}`), 5000);
    
    // Return vendor data without password
    const { password: _, ...vendorWithoutPassword } = vendor;
    
    return c.json({ 
      success: true,
      vendor: {
        ...vendorWithoutPassword,
        storeName: vendorSettings?.storeName || vendor.name,
        storeSlug: vendorSettings?.storeSlug || vendor.storeSlug,
      },
      message: "Login successful"
    });
  } catch (error) {
    console.error("❌ [VendorAuth] Error during login:", error);
    return c.json({ error: "Failed to login", details: String(error) }, 500);
  }
});

// Verify vendor email for setup (checks if vendor exists and is approved but has no password)
app.post("/make-server-16010b6f/vendor-auth/verify-email", async (c) => {
  try {
    const body = await c.req.json();
    const { email } = body;
    
    if (!email) {
      return c.json({ error: "Email is required" }, 400);
    }
    
    console.log(`🔍 [VendorAuth] Verifying email for setup: ${email}`);
    
    const validVendors = await kv.getVendorProfiles();
    
    // Find vendor by email
    const vendor = validVendors.find((v: any) => v.email?.toLowerCase() === email.toLowerCase());
    
    if (!vendor) {
      console.log(`❌ [VendorAuth] Vendor not found: ${email}`);
      return c.json({ error: "No vendor account found with this email. Please contact support." }, 404);
    }
    
    // Check if vendor already has a password
    if (vendor.password) {
      console.log(`⚠️ [VendorAuth] Vendor already has credentials: ${email}`);
      return c.json({ 
        success: true,
        vendor: {
          id: vendor.id,
          name: vendor.name,
          email: vendor.email,
          businessName: vendor.businessName || vendor.name,
          hasCredentials: true,
        },
        message: "This vendor account is already set up. Please login instead."
      }, 200);
    }
    
    // Check if vendor is active
    if (vendor.status !== 'active') {
      console.log(`❌ [VendorAuth] Vendor not active: ${email}, status: ${vendor.status}`);
      return c.json({ error: "Your vendor account is not active. Please contact support." }, 403);
    }
    
    console.log(`✅ [VendorAuth] Email verified for setup: ${email}`);
    
    // Return vendor data without sensitive info
    return c.json({ 
      success: true,
      vendor: {
        id: vendor.id,
        name: vendor.name,
        email: vendor.email,
        businessName: vendor.businessName || vendor.name,
        hasCredentials: false,
      },
      message: "Email verified successfully"
    });
  } catch (error) {
    console.error("❌ [VendorAuth] Error verifying email:", error);
    return c.json({ error: "Failed to verify email", details: String(error) }, 500);
  }
});

// Setup vendor credentials (set password for approved vendor)
app.post("/make-server-16010b6f/vendor-auth/setup-credentials", async (c) => {
  try {
    const body = await c.req.json();
    const { email, password } = body;
    
    if (!email || !password) {
      return c.json({ error: "Email and password are required" }, 400);
    }
    
    // Validate password strength
    if (password.length < 8) {
      return c.json({ error: "Password must be at least 8 characters long" }, 400);
    }
    
    console.log(`🔐 [VendorAuth] Setting up credentials for: ${email}`);
    
    const validVendors = await kv.getVendorProfiles();
    
    // Find vendor by email
    const vendor = validVendors.find((v: any) => v.email?.toLowerCase() === email.toLowerCase());
    
    if (!vendor) {
      console.log(`❌ [VendorAuth] Vendor not found: ${email}`);
      return c.json({ error: "Vendor account not found" }, 404);
    }
    
    // Check if vendor already has a password
    if (vendor.password) {
      console.log(`⚠️ [VendorAuth] Vendor already has credentials: ${email}`);
      return c.json({ error: "Credentials already set for this account" }, 400);
    }
    
    // Check if vendor is active
    if (vendor.status !== 'active') {
      console.log(`❌ [VendorAuth] Vendor not active: ${email}, status: ${vendor.status}`);
      return c.json({ error: "Vendor account is not active" }, 403);
    }
    
    // Update vendor with password
    const updatedVendor = {
      ...vendor,
      password: password, // In production, this should be hashed
      credentialsSetAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    
    await withTimeout(
      kv.set(`vendor:${vendor.id}`, updatedVendor),
      5000
    );
    
    // 🔥 AUTO-CREATE SLUG MAPPING if it doesn't exist
    const storeName = vendor.businessName || vendor.name || "Vendor Store";
    const existingSettings = await withTimeout(
      kv.get(`vendor_settings:${vendor.id}`),
      5000
    );
    const baseSlug =
      existingSettings?.storeSlug && String(existingSettings.storeSlug).trim()
        ? String(existingSettings.storeSlug).trim()
        : await allocateUniqueVendorSlugFromName(storeName, vendor.id);
    
    // Check if slug mapping already exists
    const existingMapping = await kv.get(`vendor_slug_${baseSlug}`);
    if (!existingMapping) {
      const slugMapping = {
        slug: baseSlug,
        vendorId: vendor.id,
        businessName: storeName,
        createdAt: new Date().toISOString()
      };
      await withTimeout(kv.set(`vendor_slug_${baseSlug}`, slugMapping), 5000);
      console.log(`✅ Auto-created slug mapping during setup: ${baseSlug} → ${vendor.id}`);
    } else {
      console.log(`ℹ️ Slug mapping already exists: ${baseSlug}`);
    }
    
    console.log(`✅ [VendorAuth] Credentials set successfully for: ${email}`);
    
    return c.json({ 
      success: true,
      message: "Credentials set successfully. You can now login."
    });
  } catch (error) {
    console.error("❌ [VendorAuth] Error setting up credentials:", error);
    return c.json({ error: "Failed to set up credentials", details: String(error) }, 500);
  }
});

// ============================================
// PLATFORM SETTINGS ENDPOINT (Public)
// ============================================
app.get("/make-server-16010b6f/platform-settings", async (c) => {
  try {
    console.log("🔍 [PlatformSettings] Fetching platform settings...");
    const settings = await kv.get("site_settings_general");
    
    console.log("📊 [PlatformSettings] Retrieved settings:", settings);
    
    if (!settings) {
      // Return default settings if none exist
      console.log("⚠️ [PlatformSettings] No settings found, returning defaults");
      return c.json({
        settings: {
          supportPhone: "+95 9 XXX XXX XXX",
          supportEmail: "support@secure.com",
        }
      });
    }
    
    // Return only public-facing settings
    const platformSettings = {
      supportPhone: settings.storePhone || "+95 9 XXX XXX XXX",
      supportEmail: settings.storeEmail || "support@secure.com",
    };
    
    console.log("✅ [PlatformSettings] Returning settings:", platformSettings);
    return c.json({
      settings: platformSettings
    });
  } catch (error: any) {
    console.error("❌ [PlatformSettings] Error loading platform settings:", error);
    // Return default settings on error
    return c.json({
      settings: {
        supportPhone: "+95 9 XXX XXX XXX",
        supportEmail: "support@secure.com",
      }
    });
  }
});

// ============================================
// PRODUCTS ENDPOINTS
// ============================================

// Helper function to check SKU uniqueness
async function checkSkuUniqueness(sku: string, excludeProductId?: string): Promise<{ isUnique: boolean; existingProduct?: any }> {
  if (!sku || !sku.trim()) {
    return { isUnique: true }; // Empty SKU is allowed (though not recommended)
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

// Check SKU uniqueness endpoint (for real-time validation)
app.get("/make-server-16010b6f/check-sku/:sku", async (c) => {
  try {
    const sku = c.req.param("sku");
    const excludeProductId = c.req.query("excludeProductId");
    
    console.log(`🔍 Real-time SKU check: "${sku}"`);
    
    if (!sku || !sku.trim()) {
      return c.json({ isUnique: true, message: "SKU is empty" });
    }
    
    const result = await checkSkuUniqueness(sku, excludeProductId);
    
    if (!result.isUnique) {
      return c.json({
        isUnique: false,
        message: `SKU "${sku}" already exists in product: ${result.existingProduct?.name || result.existingProduct?.id}`,
        existingProduct: {
          id: result.existingProduct?.id,
          name: result.existingProduct?.name,
        }
      });
    }
    
    return c.json({ isUnique: true, message: "SKU is available" });
  } catch (error) {
    console.error("❌ Error checking SKU:", error);
    return c.json({ 
      error: "Failed to check SKU",
      details: String(error)
    }, 500);
  }
});

// --- Storefront catalog: shared list mapping + pagination (reduces egress vs. shipping full catalog) ---
function mapPlatformProductToListRow(product: any) {
  return {
    id: product.id,
    name: product.name || product.title,
    price: product.price,
    sku: product.sku,
    category: product.category,
    vendor: product.vendor,
    collaborator: product.collaborator,
    status: product.status,
    inventory: product.inventory ?? product.stock ?? 0,
    stock: product.inventory ?? product.stock ?? 0,
    salesVolume: product.salesVolume || 0,
    createDate: product.createDate || product.createdAt,
    image: product.images?.[0] || product.image || null,
    images: product.images?.[0] ? [product.images[0]] : [],
    description: product.description || "",
    hasVariants: product.hasVariants || false,
    variantOptions: product.variantOptions || [],
    variants: product.variants || [],
    vendorId: product.vendorId,
    commissionRate: product.commissionRate || 0,
    selectedVendors: product.selectedVendors || [],
  };
}

function storefrontParsePriceRow(p: any): number {
  const s = String(p?.price ?? "0").replace(/[^0-9.]/g, "");
  return parseFloat(s) || 0;
}

function sortStorefrontProductRows(rows: any[], sort: string): any[] {
  const copy = [...rows];
  switch (sort) {
    case "price-low":
      copy.sort((a, b) => storefrontParsePriceRow(a) - storefrontParsePriceRow(b));
      break;
    case "price-high":
      copy.sort((a, b) => storefrontParsePriceRow(b) - storefrontParsePriceRow(a));
      break;
    case "popular":
      copy.sort((a, b) => (b.salesVolume || 0) - (a.salesVolume || 0));
      break;
    case "newest":
      copy.sort(
        (a, b) =>
          new Date(b.createDate || 0).getTime() - new Date(a.createDate || 0).getTime()
      );
      break;
    default:
      break;
  }
  return copy;
}

/**
 * Slim list payload for bootstrap/catalog pages — trims description etc., but MUST keep
 * variantOptions + variants so product detail can render selectors without waiting on GET /products/:id.
 * (Stripping them caused hasVariants === true with no chips on PDP.)
 */
function mapVendorStorefrontProductRow(p: any) {
  return {
    id: p.id,
    name: p.name || p.title,
    sku: p.sku,
    price: parseFloat(String(p.price).replace(/[$,]/g, "")),
    compareAtPrice: p.compareAtPrice ? parseFloat(String(p.compareAtPrice).replace(/[$,]/g, "")) : undefined,
    description: p.description || "",
    images: p.images || [],
    category: p.category || "Uncategorized",
    inventory: p.inventory || 0,
    rating: 4.5,
    reviewCount: Math.floor(Math.random() * 100),
    hasVariants: p.hasVariants || false,
    variants: p.variants || [],
    variantOptions: p.variantOptions || [],
    commissionRate: p.commissionRate || 0,
  };
}

function toSlimListRow(p: any) {
  return {
    id: p.id,
    name: p.name,
    price: p.price,
    sku: p.sku,
    category: p.category,
    vendor: p.vendor,
    collaborator: p.collaborator,
    status: p.status,
    inventory: p.inventory,
    stock: p.stock,
    salesVolume: p.salesVolume,
    createDate: p.createDate,
    image: p.image,
    images: p.images,
    description: "",
    hasVariants: p.hasVariants,
    variantOptions: Array.isArray(p.variantOptions) ? p.variantOptions : [],
    variants: Array.isArray(p.variants) ? p.variants : [],
    vendorId: p.vendorId,
    commissionRate: p.commissionRate,
    selectedVendors: p.selectedVendors || [],
  };
}

async function ensureProductsListResponse(): Promise<{ products: any[]; total: number }> {
  const cached = getCached("products", 120000);
  if (cached && Array.isArray(cached.products)) {
    return cached;
  }

  let productsData;
  try {
    productsData = await withRetry(
      () => withTimeout(kv.getByPrefix("product:"), 30000),
      5,
      1500
    );
  } catch (timeoutError) {
    console.error("⚠️ Database query failed - returning empty array");
    const emptyResponse = { products: [], total: 0 };
    setCache("products", emptyResponse);
    return emptyResponse;
  }

  const products = Array.isArray(productsData) ? productsData.filter((p) => p != null) : [];
  const platformProducts = products.filter((p) => !p.vendorId || p.vendorId === "migoo");
  const productsForList = platformProducts.map((product) => mapPlatformProductToListRow(product));
  const response = { products: productsForList, total: productsForList.length };
  setCache("products", response);
  return response;
}

app.get("/make-server-16010b6f/products", async (c) => {
  try {
    console.log("📦 Fetching products...");

    const ids = c.req.query("ids");
    if (ids) {
      const idList = ids
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean)
        .slice(0, 200);
      const out: any[] = [];
      for (const id of idList) {
        const raw = await withTimeout(kv.get(`product:${id}`), 5000).catch(() => null);
        if (!raw || typeof raw !== "object") continue;
        const platform = !(raw as any).vendorId || (raw as any).vendorId === "migoo";
        const st = String((raw as any).status || "").toLowerCase();
        const active = !st || st === "active";
        if (platform && active) {
          out.push(mapPlatformProductToListRow(raw));
        }
      }
      return c.json({ products: out, total: out.length });
    }

    const bootstrap = c.req.query("bootstrap") === "1";
    const catalog = c.req.query("catalog") === "1";

    if (bootstrap || catalog) {
      const qRaw = (c.req.query("q") || "").trim();
      const category = (c.req.query("category") || "").trim();
      const sort = (c.req.query("sort") || "featured").toLowerCase();
      const minPrice = parseFloat(c.req.query("minPrice") || "");
      const maxPrice = parseFloat(c.req.query("maxPrice") || "");
      const page = Math.max(1, parseInt(c.req.query("page") || "1", 10) || 1);
      const pageSize = Math.min(100, Math.max(1, parseInt(c.req.query("pageSize") || "24", 10) || 24));

      const rpcData = await kv.rpcStorefrontCatalog({
        kind: bootstrap ? "bootstrap" : "catalog",
        page,
        pageSize,
        category: category || null,
        q: qRaw || null,
        sort,
        minPrice: Number.isNaN(minPrice) ? null : minPrice,
        maxPrice: Number.isNaN(maxPrice) ? null : maxPrice,
      });

      const mapRpcArrToSlim = (arr: unknown) =>
        (Array.isArray(arr) ? arr : []).map((raw: any) =>
          toSlimListRow(mapPlatformProductToListRow(raw))
        );

      if (rpcData && Array.isArray(rpcData.products)) {
        const sortOut =
          typeof rpcData.sort === "string"
            ? rpcData.sort
            : sort;
        if (bootstrap) {
          return c.json({
            bootstrap: true,
            products: mapRpcArrToSlim(rpcData.products),
            total: Number(rpcData.total ?? 0),
            page: Number(rpcData.page ?? 1),
            pageSize: Number(rpcData.pageSize ?? pageSize),
            hasMore: !!rpcData.hasMore,
            dealProducts: mapRpcArrToSlim(rpcData.dealProducts),
            newArrivals: mapRpcArrToSlim(rpcData.newArrivals),
            sort: sortOut,
          });
        }
        return c.json({
          catalog: true,
          products: mapRpcArrToSlim(rpcData.products),
          total: Number(rpcData.total ?? 0),
          page: Number(rpcData.page ?? page),
          pageSize: Number(rpcData.pageSize ?? pageSize),
          hasMore: !!rpcData.hasMore,
          sort: sortOut,
        });
      }

      const data = await ensureProductsListResponse();
      const rows = data.products.filter((p) => {
        const s = String(p.status || "").toLowerCase();
        return !s || s === "active";
      });

      const q = qRaw.toLowerCase();

      const filtered = rows.filter((p) => {
        if (category && category.toLowerCase() !== "all") {
          if (String(p.category || "").toLowerCase() !== category.toLowerCase()) return false;
        }
        if (q && !String(p.name || "").toLowerCase().includes(q)) return false;
        if (!Number.isNaN(minPrice) && storefrontParsePriceRow(p) < minPrice) return false;
        if (!Number.isNaN(maxPrice) && storefrontParsePriceRow(p) > maxPrice) return false;
        return true;
      });

      const sorted = sortStorefrontProductRows(filtered, sort);

      if (bootstrap) {
        const deals = sortStorefrontProductRows(filtered, "popular").slice(0, 10).map(toSlimListRow);
        const news = sortStorefrontProductRows(filtered, "newest").slice(0, 6).map(toSlimListRow);
        const firstPage = sorted.slice(0, pageSize).map(toSlimListRow);
        return c.json({
          bootstrap: true,
          products: firstPage,
          total: sorted.length,
          page: 1,
          pageSize,
          hasMore: sorted.length > pageSize,
          dealProducts: deals,
          newArrivals: news,
          sort,
        });
      }

      const total = sorted.length;
      const slice = sorted.slice((page - 1) * pageSize, page * pageSize).map(toSlimListRow);
      return c.json({
        catalog: true,
        products: slice,
        total,
        page,
        pageSize,
        hasMore: page * pageSize < total,
        sort,
      });
    }

    const cached = getCached("products", 120000);
    if (cached) {
      console.log("⚡ Returning cached products (legacy)");
      return c.json(cached);
    }

    const resp = await ensureProductsListResponse();
    console.log(`✅ Returning ${resp.products.length} products (legacy)`);
    return c.json(resp);
  } catch (error) {
    console.error("❌ Error fetching products:", error);
    const errorResponse = { products: [], total: 0 };
    setCache("products", errorResponse);
    return c.json(errorResponse, 200);
  }
});

app.get("/make-server-16010b6f/products/by-sku/:sku", async (c) => {
  try {
    const sku = decodeURIComponent(c.req.param("sku") || "").trim();
    if (!sku) {
      return c.json({ error: "sku required" }, 400);
    }
    const data = await ensureProductsListResponse();
    const lower = sku.toLowerCase();
    let row = data.products.find((p) => String(p.sku).toLowerCase() === lower);
    if (!row) {
      row = data.products.find(
        (p) =>
          Array.isArray(p.variants) &&
          p.variants.some((v: { sku?: string }) => String(v?.sku || "").toLowerCase() === lower)
      );
    }
    if (!row) {
      return c.json({ error: "Product not found" }, 404);
    }
    const full = await withTimeout(kv.get(`product:${row.id}`), 8000).catch(() => null);
    if (!full || typeof full !== "object") {
      return c.json({ error: "Product not found" }, 404);
    }
    return c.json({ product: { id: row.id, ...full } });
  } catch (error) {
    console.error("❌ by-sku:", error);
    return c.json({ error: "Failed to fetch product" }, 500);
  }
});

/**
 * Assign one vendor to many platform products in one request (super admin vendor profile).
 * Avoids N parallel PUTs each scanning all products for SKU uniqueness (timeouts / failures).
 */
app.post("/make-server-16010b6f/products/bulk-assign-vendor", async (c) => {
  try {
    const body = await c.req.json();
    const vendorId = String(body.vendorId ?? "").trim();
    const productIds = Array.isArray(body.productIds) ? body.productIds : [];
    if (!vendorId || productIds.length === 0) {
      return c.json({ error: "vendorId and non-empty productIds[] are required" }, 400);
    }

    const results: { productId: string; ok: boolean; error?: string }[] = [];
    for (const rawId of productIds) {
      const pid = String(rawId ?? "").trim();
      if (!pid) continue;
      try {
        const existing = await withTimeout(kv.get(`product:${pid}`), 8000).catch(() => null);
        if (!existing || typeof existing !== "object" || Array.isArray(existing)) {
          results.push({ productId: pid, ok: false, error: "not_found" });
          continue;
        }
        const existingSel = Array.isArray((existing as any).selectedVendors)
          ? [...(existing as any).selectedVendors]
          : [];
        if (!existingSel.includes(vendorId)) existingSel.push(vendorId);
        const updated = {
          ...(existing as object),
          selectedVendors: existingSel,
          updatedAt: new Date().toISOString(),
        };
        await withTimeout(kv.set(`product:${pid}`, updated), 8000);
        results.push({ productId: pid, ok: true });
      } catch (e: any) {
        results.push({ productId: pid, ok: false, error: String(e?.message || e) });
      }
    }

    invalidateDashboardCache();
    clearCache("products");

    const updated = results.filter((r) => r.ok).length;
    return c.json({
      success: updated > 0,
      updated,
      failed: results.length - updated,
      results,
    });
  } catch (error: any) {
    console.error("❌ bulk-assign-vendor:", error);
    return c.json({ error: error?.message || "Failed to assign products" }, 500);
  }
});

app.get("/make-server-16010b6f/products/:id", async (c) => {
  try {
    const id = c.req.param("id");
    console.log(`📦 Fetching product: ${id}`);
    const product = await withTimeout(kv.get(`product:${id}`), 5000);
    
    if (!product) {
      return c.json({ error: "Product not found" }, 404);
    }
    
    return c.json({ product: { id, ...product } });
  } catch (error) {
    console.error("❌ Error fetching product:", error);
    return c.json({ error: "Failed to fetch product", details: String(error) }, 500);
  }
});

app.post("/make-server-16010b6f/products", async (c) => {
  try {
    console.log(`➕ Starting product creation...`);
    const body = await c.req.json();
    const id = `prod_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
    
    // Format price properly for storage and display
    let formattedPrice = body.price;
    if (typeof body.price === 'number') {
      formattedPrice = `$${body.price.toFixed(2)}`;
    } else if (typeof body.price === 'string' && !body.price.startsWith('$')) {
      const numPrice = parseFloat(body.price);
      formattedPrice = isNaN(numPrice) ? '$0.00' : `$${numPrice.toFixed(2)}`;
    }
    
    // Format variant prices if variants exist
    let formattedVariants = body.variants;
    if (body.hasVariants && body.variants && Array.isArray(body.variants)) {
      formattedVariants = body.variants.map((variant: any) => {
        let variantPrice = variant.price;
        if (typeof variant.price === 'number') {
          variantPrice = `$${variant.price.toFixed(2)}`;
        } else if (typeof variant.price === 'string' && !variant.price.startsWith('$')) {
          const numPrice = parseFloat(variant.price);
          variantPrice = isNaN(numPrice) ? '$0.00' : `$${numPrice.toFixed(2)}`;
        }
        return {
          ...variant,
          price: variantPrice
        };
      });
    }
    
    // ✅ Ensure description is properly encoded for Unicode (Burmese text)
    const safeDescription = body.description ? String(body.description) : '';
    
    const productData = {
      ...body,
      id,
      price: formattedPrice, // Store formatted price
      name: body.title || body.name, // Ensure name field exists
      description: safeDescription, // ✅ Safe Unicode description
      variants: formattedVariants, // Store formatted variants
      commissionRate: body.commissionRate !== undefined ? parseFloat(body.commissionRate) : 0, // 🔥 Product-level commission rate (%)
      selectedVendors: body.selectedVendors || [], // 🔥 Multi-vendor support
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    
    // Log for debugging Burmese text
    console.log(`📝 Product details:`, {
      name: productData.name,
      nameLength: productData.name?.length,
      description: safeDescription.substring(0, 100),
      descLength: safeDescription.length,
      hasDescription: !!safeDescription,
      selectedVendors: productData.selectedVendors, // 🔥 Log vendors
      commissionRate: productData.commissionRate, // 🔥 Log commission
    });
    
    // Check SKU uniqueness
    const skuCheck = await checkSkuUniqueness(productData.sku);
    if (!skuCheck.isUnique) {
      return c.json({ 
        error: "SKU already exists",
        details: `SKU "${productData.sku}" is already used in product: ${skuCheck.existingProduct?.id}`
      }, 409);
    }
    
    // Log payload size for debugging
    let payloadSize = 0;
    try {
      payloadSize = JSON.stringify(productData).length;
    } catch (jsonError) {
      console.error('❌ JSON serialization error:', jsonError);
      return c.json({ 
        error: "Invalid product data",
        details: "Failed to serialize product data. Check for invalid characters in description."
      }, 400);
    }
    console.log(`📦 Product payload size: ${(payloadSize / 1024).toFixed(2)} KB`);
    console.log(`💰 Product price: ${body.price} → ${formattedPrice}`);
    console.log(`📝 Product data:`, { 
      title: productData.title || productData.name, 
      category: productData.category, 
      vendor: productData.vendor,
      vendorId: productData.vendorId, // ✅ Log vendorId
      hasVariants: productData.hasVariants,
      variantCount: productData.variants?.length || 0
    });
    
    if (productData.hasVariants && productData.variants) {
      console.log(`🎨 Variants:`, productData.variants.map((v: any) => ({
        options: v.options,
        price: v.price,
        inventory: v.inventory,
        sku: v.sku
      })));
    }
    
    // Save product with proper timeout and await
    const timeoutMs = payloadSize > 500000 ? 15000 : 8000;
    console.log(`⏱️ Saving with timeout: ${timeoutMs}ms`);
    
    try {
      await withTimeout(kv.set(`product:${id}`, productData), timeoutMs);
      console.log(`✅ Product saved successfully: ${id}`);
      
      // 🗑️ Invalidate dashboard cache since we created a new product
      invalidateDashboardCache();
      
      return c.json({ 
        success: true,
        product: productData,
        message: "Product created successfully"
      }, 201);
    } catch (saveError) {
      console.error(`❌ Failed to save product ${id}:`, saveError);
      return c.json({ 
        error: "Failed to save product", 
        details: String(saveError),
        hint: "Database operation timed out. Please try again with smaller images."
      }, 500);
    }
  } catch (error) {
    console.error("❌ Error creating product:", error);
    const errorMessage = error instanceof Error ? error.message : String(error);
    return c.json({ 
      error: "Failed to create product", 
      details: errorMessage,
      hint: errorMessage.includes("timeout") 
        ? "The product data is too large. Try using fewer or smaller images."
        : "An unexpected error occurred."
    }, 500);
  }
});

app.put("/make-server-16010b6f/products/:id", async (c) => {
  try {
    const id = c.req.param("id");
    const body = await c.req.json();
    const { _addToSelectedVendors, selectedVendors: bodySelectedVendors, ...restPatch } = body;
    
    console.log(`🔄 Updating product: ${id}`);
    
    // Check if product exists first (with quick timeout)
    const existingProduct = await withTimeout(kv.get(`product:${id}`), 3000).catch(() => null);
    if (!existingProduct) {
      return c.json({ error: "Product not found" }, 404);
    }
    
    // Format price properly for storage and display
    let formattedPrice = restPatch.price !== undefined ? restPatch.price : existingProduct.price;
    if (restPatch.price !== undefined) {
      if (typeof restPatch.price === 'number') {
        formattedPrice = `$${restPatch.price.toFixed(2)}`;
      } else if (typeof restPatch.price === 'string' && !restPatch.price.startsWith('$')) {
        const numPrice = parseFloat(restPatch.price);
        formattedPrice = isNaN(numPrice) ? '$0.00' : `$${numPrice.toFixed(2)}`;
      }
    }
    
    // Format variant prices if variants exist
    let formattedVariants = restPatch.variants || existingProduct.variants;
    if (restPatch.variants && Array.isArray(restPatch.variants)) {
      formattedVariants = restPatch.variants.map((variant: any) => {
        let variantPrice = variant.price;
        if (typeof variant.price === 'number') {
          variantPrice = `$${variant.price.toFixed(2)}`;
        } else if (typeof variant.price === 'string' && !variant.price.startsWith('$')) {
          const numPrice = parseFloat(variant.price);
          variantPrice = isNaN(numPrice) ? '$0.00' : `$${numPrice.toFixed(2)}`;
        }
        return {
          ...variant,
          price: variantPrice
        };
      });
    }
    
    // ✅ Ensure description is properly encoded for Unicode (Burmese text)
    const safeDescription = restPatch.description !== undefined 
      ? String(restPatch.description) 
      : (existingProduct.description || '');
    
    const existingSel = Array.isArray(existingProduct.selectedVendors) ? [...existingProduct.selectedVendors] : [];
    let nextSelectedVendors = existingSel;
    if (_addToSelectedVendors === true && Array.isArray(bodySelectedVendors)) {
      const set = new Set(existingSel.map(String));
      for (const v of bodySelectedVendors) {
        if (v != null && String(v).trim()) set.add(String(v).trim());
      }
      nextSelectedVendors = [...set];
    } else if (bodySelectedVendors !== undefined) {
      nextSelectedVendors = Array.isArray(bodySelectedVendors) ? bodySelectedVendors : existingSel;
    }

    const updatedProduct = {
      ...existingProduct,
      ...restPatch,
      variants: formattedVariants, // Use formatted variants
      id,
      price: formattedPrice, // Store formatted price
      name: restPatch.title || restPatch.name || existingProduct.name, // Ensure name field exists
      description: safeDescription, // ✅ Safe Unicode description
      commissionRate: restPatch.commissionRate !== undefined ? parseFloat(restPatch.commissionRate) : (existingProduct.commissionRate || 0), // 🔥 Product-level commission rate (%)
      selectedVendors: nextSelectedVendors,
      updatedAt: new Date().toISOString(),
    };
    
    // Log for debugging Burmese text
    console.log(`📝 Product update details:`, {
      name: updatedProduct.name,
      nameLength: updatedProduct.name?.length,
      description: safeDescription.substring(0, 100),
      descLength: safeDescription.length,
      hasDescription: !!safeDescription,
      selectedVendors: updatedProduct.selectedVendors, // 🔥 Log vendors
      commissionRate: updatedProduct.commissionRate, // 🔥 Log commission
      commissionRateType: typeof updatedProduct.commissionRate, // 🔥 Check type
    });
    
    // Super-admin vendor assignment: only selectedVendors/_add (skip full-catalog SKU scan — avoids timeouts)
    const patchKeys = Object.keys(body || {});
    const isVendorOnlyUpdate =
      patchKeys.length > 0 &&
      patchKeys.every((k) => k === "selectedVendors" || k === "_addToSelectedVendors");

    if (!isVendorOnlyUpdate) {
      const skuCheck = await checkSkuUniqueness(updatedProduct.sku, id);
      if (!skuCheck.isUnique) {
        return c.json({ 
          error: "SKU already exists",
          details: `SKU "${updatedProduct.sku}" is already used in product: ${skuCheck.existingProduct?.id}`
        }, 409);
      }
    }
    
    // Log payload size for debugging
    let payloadSize = 0;
    try {
      payloadSize = JSON.stringify(updatedProduct).length;
    } catch (jsonError) {
      console.error('❌ JSON serialization error:', jsonError);
      return c.json({ 
        error: "Invalid product data",
        details: "Failed to serialize product data. Check for invalid characters in description."
      }, 400);
    }
    console.log(`📦 Product update payload size: ${(payloadSize / 1024).toFixed(2)} KB`);
    
    // Save product with proper await
    const timeoutMs = payloadSize > 500000 ? 15000 : 8000;
    console.log(`⏱️ Saving with timeout: ${timeoutMs}ms`);
    
    try {
      await withTimeout(kv.set(`product:${id}`, updatedProduct), timeoutMs);
      console.log(`✅ Product updated successfully: ${id}`);
      
      // 🗑️ Invalidate dashboard cache since we updated a product
      invalidateDashboardCache();
      clearCache("products");
      
      return c.json({ 
        success: true,
        product: updatedProduct,
        message: "Product updated successfully"
      });
    } catch (saveError) {
      console.error(`❌ Failed to update product ${id}:`, saveError);
      return c.json({ 
        error: "Failed to save product update", 
        details: String(saveError),
        hint: "Database operation timed out. Please try again with smaller images."
      }, 500);
    }
  } catch (error) {
    console.error("❌ Error updating product:", error);
    const errorMessage = error instanceof Error ? error.message : String(error);
    return c.json({ 
      error: "Failed to update product", 
      details: errorMessage,
      hint: errorMessage.includes("timeout") 
        ? "The product data is too large. Try using fewer or smaller images."
        : "An unexpected error occurred."
    }, 500);
  }
});

app.delete("/make-server-16010b6f/products/:id", async (c) => {
  try {
    const id = c.req.param("id");
    
    console.log(`🗑️ Deleting product: ${id}`);
    const existingProduct = await withTimeout(kv.get(`product:${id}`), 5000);
    if (!existingProduct) {
      return c.json({ error: "Product not found" }, 404);
    }
    
    await withTimeout(kv.del(`product:${id}`), 5000);
    console.log(`✅ Product deleted: ${id}`);
    
    // 🗑️ Invalidate dashboard cache since we deleted a product
    invalidateDashboardCache();
    
    return c.json({ 
      success: true,
      message: "Product deleted successfully"
    });
  } catch (error) {
    console.error("❌ Error deleting product:", error);
    return c.json({ error: "Failed to delete product", details: String(error) }, 500);
  }
});

// ============================================
// SEED DATA ENDPOINT
// Populate database with sample products for testing/demo
// ============================================
app.post("/make-server-16010b6f/seed-products", async (c) => {
  try {
    console.log("🌱 Seeding sample products and campaigns...");
    
    // Check if sample campaigns already exist (to avoid duplicates)
    const existingCampaigns = await withTimeout(kv.getByPrefix("campaign:"), 8000);
    const hasPromoCode = Array.isArray(existingCampaigns) && existingCampaigns.some(c => c?.code === "PROMO");
    
    if (hasPromoCode) {
      console.log("ℹ️ Sample coupons already exist! Skipping campaign creation.");
      console.log("ℹ️ Available coupons: PROMO (10% off), OFF ($50 off orders $100+), SAVE15 (15% off orders $50+)");
    }
    
    const sampleProducts = [
      {
        id: `prod_${Date.now()}_1`,
        sku: "ME001",
        name: "Premium Wireless Headphones",
        price: "$299.99",
        compareAtPrice: "$399.99",
        category: "Electronics",
        vendor: "Migoo Direct",
        collaborator: "",
        status: "active",
        inventory: 50,
        salesVolume: 0,
        description: "High-quality wireless headphones with active noise cancellation and 30-hour battery life.",
        images: ["https://images.unsplash.com/photo-1505740420928-5e560c06d30e?w=800&h=800&fit=crop"],
        hasVariants: false,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
      {
        id: `prod_${Date.now()}_2`,
        sku: "ME002",
        name: "Smart Watch Pro",
        price: "$399.99",
        compareAtPrice: "$599.99",
        category: "Electronics",
        vendor: "Migoo Direct",
        collaborator: "",
        status: "active",
        inventory: 30,
        salesVolume: 0,
        description: "Advanced smartwatch with health tracking, GPS, and 7-day battery life.",
        images: ["https://images.unsplash.com/photo-1523275335684-37898b6baf30?w=800&h=800&fit=crop"],
        hasVariants: false,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
      {
        id: `prod_${Date.now()}_3`,
        sku: "ME003",
        name: "Luxury Leather Bag",
        price: "$249.99",
        compareAtPrice: "$349.99",
        category: "Fashion",
        vendor: "Migoo Direct",
        collaborator: "",
        status: "active",
        inventory: 25,
        salesVolume: 0,
        description: "Handcrafted genuine leather bag with elegant design and spacious interior.",
        images: ["https://images.unsplash.com/photo-1548036328-c9fa89d128fa?w=800&h=800&fit=crop"],
        hasVariants: true,
        variantOptions: [
          { name: "Color", values: ["Black", "Brown", "Tan"] }
        ],
        variants: [
          {
            id: "var_1_black",
            option1: "Black",
            price: "$249.99",
            sku: "ME003-Black",
            inventory: 10,
          },
          {
            id: "var_1_brown",
            option1: "Brown",
            price: "$249.99",
            sku: "ME003-Brown",
            inventory: 8,
          },
          {
            id: "var_1_tan",
            option1: "Tan",
            price: "$249.99",
            sku: "ME003-Tan",
            inventory: 7,
          },
        ],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
      {
        id: `prod_${Date.now()}_4`,
        sku: "ME004",
        name: "4K Ultra HD Camera",
        price: "$899.99",
        compareAtPrice: "$1299.99",
        category: "Electronics",
        vendor: "Migoo Direct",
        collaborator: "",
        status: "active",
        inventory: 15,
        salesVolume: 0,
        description: "Professional 4K camera with image stabilization and 20MP sensor.",
        images: ["https://images.unsplash.com/photo-1526170375885-4d8ecf77b99f?w=800&h=800&fit=crop"],
        hasVariants: false,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
      {
        id: `prod_${Date.now()}_5`,
        sku: "ME005",
        name: "Designer Sunglasses",
        price: "$159.99",
        compareAtPrice: "$229.99",
        category: "Fashion",
        vendor: "Migoo Direct",
        collaborator: "",
        status: "active",
        inventory: 40,
        salesVolume: 0,
        description: "Stylish designer sunglasses with UV protection and premium frames.",
        images: ["https://images.unsplash.com/photo-1572635196237-14b3f281503f?w=800&h=800&fit=crop"],
        hasVariants: false,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    ];
    
    console.log(`🌱 Creating ${sampleProducts.length} sample products...`);
    
    // Save all products
    for (const product of sampleProducts) {
      try {
        await withTimeout(kv.set(`product:${product.id}`, product), 8000);
        console.log(`✅ Created: ${product.sku} - ${product.name}`);
      } catch (error) {
        console.error(`❌ Failed to create ${product.sku}:`, error);
      }
    }
    
    // ============================================
    // CREATE SAMPLE CAMPAIGNS/COUPONS
    // ============================================
    const now = new Date();
    const startDate = new Date(now);
    startDate.setDate(startDate.getDate() - 1); // Start yesterday
    const endDate = new Date(now);
    endDate.setMonth(endDate.getMonth() + 3); // Valid for 3 months
    
    const sampleCampaigns = [
      {
        id: `campaign_${Date.now()}_1`,
        name: "Welcome Discount",
        type: "coupon",
        status: "active",
        creator: "Admin Team",
        creatorType: "admin",
        creatorAvatar: "https://api.dicebear.com/7.x/pixel-art/svg?seed=Admin",
        startDate: startDate.toISOString(),
        endDate: endDate.toISOString(),
        createdDate: now.toISOString(),
        code: "PROMO",
        discount: 10,
        discountType: "percentage",
        targetAudience: "All Customers",
        usageCount: 0,
        usageLimit: 1000,
        revenue: 0,
        clicks: 0,
        conversions: 0,
        minQuantity: 1,
        minAmount: 0,
      },
      {
        id: `campaign_${Date.now()}_2`,
        name: "February Special",
        type: "seasonal",
        status: "active",
        creator: "Admin Team",
        creatorType: "admin",
        creatorAvatar: "https://api.dicebear.com/7.x/pixel-art/svg?seed=Admin",
        startDate: startDate.toISOString(),
        endDate: endDate.toISOString(),
        createdDate: now.toISOString(),
        code: "OFF",
        discount: 50,
        discountType: "fixed",
        targetAudience: "All Customers",
        usageCount: 0,
        usageLimit: 500,
        revenue: 0,
        clicks: 0,
        conversions: 0,
        minQuantity: 1,
        minAmount: 100,
      },
      {
        id: `campaign_${Date.now()}_3`,
        name: "Save 15%",
        type: "discount-code",
        status: "active",
        creator: "Admin Team",
        creatorType: "admin",
        creatorAvatar: "https://api.dicebear.com/7.x/pixel-art/svg?seed=Admin",
        startDate: startDate.toISOString(),
        endDate: endDate.toISOString(),
        createdDate: now.toISOString(),
        code: "SAVE15",
        discount: 15,
        discountType: "percentage",
        targetAudience: "All Customers",
        usageCount: 0,
        usageLimit: 2000,
        revenue: 0,
        clicks: 0,
        conversions: 0,
        minQuantity: 1,
        minAmount: 50,
      },
    ];
    
    console.log(`🎫 Creating ${sampleCampaigns.length} sample campaigns/coupons...`);
    
    // Save all campaigns (only if they don't already exist)
    if (!hasPromoCode) {
      for (const campaign of sampleCampaigns) {
        try {
          await withTimeout(kv.set(`campaign:${campaign.id}`, campaign), 8000);
          console.log(`✅ Created coupon: ${campaign.code} - ${campaign.name} (${campaign.discountType === 'percentage' ? campaign.discount + '%' : '$' + campaign.discount})`);
        } catch (error) {
          console.error(`��� Failed to create campaign ${campaign.code}:`, error);
        }
      }
    } else {
      console.log("⏩ Skipped campaign creation (already exist)");
    }
    
    console.log(`🎉 Seeding complete! Created ${sampleProducts.length} products and ${!hasPromoCode ? sampleCampaigns.length : 0} coupons (${hasPromoCode ? sampleCampaigns.length + ' already existed' : ''})`);
    
    // 🗑️ Invalidate dashboard cache since we created new products
    invalidateDashboardCache();
    
    return c.json({ 
      success: true,
      message: hasPromoCode 
        ? `Successfully created ${sampleProducts.length} sample products. Coupons already exist!` 
        : `Successfully created ${sampleProducts.length} sample products and ${sampleCampaigns.length} coupons`,
      count: sampleProducts.length,
      products: sampleProducts.map(p => ({ sku: p.sku, name: p.name })),
      coupons: sampleCampaigns.map(c => ({ 
        code: c.code, 
        discount: c.discountType === 'percentage' ? `${c.discount}%` : `$${c.discount}`, 
        minAmount: c.minAmount > 0 ? `$${c.minAmount}` : 'No minimum' 
      }))
    });
  } catch (error) {
    console.error("❌ Error seeding products:", error);
    return c.json({ 
      error: "Failed to seed products", 
      details: String(error) 
    }, 500);
  }
});

// Upload description image to Supabase Storage
app.post("/make-server-16010b6f/upload-description-image", async (c) => {
  try {
    console.log("📤 Uploading description image to storage...");
    
    const formData = await c.req.formData();
    const file = formData.get('file');
    const fileName = formData.get('fileName') as string;
    
    if (!file || !(file instanceof File)) {
      return c.json({ error: "No file provided" }, 400);
    }
    
    const bucketName = "make-16010b6f-description-images";
    try {
      await ensureBucket(supabase, bucketName, {
        public: true,
        fileSizeLimit: 10485760,
      });
    } catch (bucketErr: any) {
      console.error("❌ Bucket creation error:", bucketErr);
      return c.json({ error: "Failed to create storage bucket" }, 500);
    }
    
    // Upload file
    const buffer = await file.arrayBuffer();
    const uint8Array = new Uint8Array(buffer);
    
    const { data: uploadData, error: uploadError } = await supabase.storage
      .from(bucketName)
      .upload(fileName, uint8Array, {
        contentType: file.type,
        cacheControl: '3600',
        upsert: true,
      });
    
    if (uploadError) {
      console.error("❌ Upload error:", uploadError);
      return c.json({ error: "Failed to upload image", details: uploadError.message }, 500);
    }
    
    // Get public URL
    const { data: urlData } = supabase.storage
      .from(bucketName)
      .getPublicUrl(fileName);
    
    console.log("✅ Image uploaded successfully:", urlData.publicUrl);
    
    return c.json({ 
      success: true,
      url: urlData.publicUrl 
    });
  } catch (error) {
    console.error("❌ Error uploading description image:", error);
    return c.json({ error: "Failed to upload image", details: String(error) }, 500);
  }
});

// ============================================
// ORDERS ENDPOINTS
// ============================================

app.get("/make-server-16010b6f/orders", async (c) => {
  try {
    // Check if client is still connected
    if (c.req.raw?.signal?.aborted) {
      console.log("⚠️ Client disconnected before orders fetch");
      return new Response(null, { status: 499 });
    }
    
    console.log("📋 Fetching orders...");
    
    // Check server-side cache first (30 second TTL)
    const cached = getCached('orders_minimal', 30000);
    if (cached) {
      console.log("⚡ Returning cached orders");
      return c.json(cached);
    }
    
    // Check for stale cache (up to 10min old)
    const staleCache = getCached('orders_minimal', 600000);
    if (staleCache) {
      console.log("⚡ Returning stale cache");
      return c.json({ 
        ...staleCache, 
        cached: true 
      });
    }
    
    // No cache - query database directly
    console.log("📭 No cache found, querying database...");
    
    try {
      // Fetch orders from database with timeout
      const orders = await withTimeout(kv.getByPrefix("order:"), 8000);
      const validOrders = Array.isArray(orders) ? orders.filter(o => o != null && typeof o === 'object') : [];
      
      console.log(`📊 Found ${validOrders.length} orders in database`);
      
      const minimalOrders = validOrders.map(order => {
        try {
          return {
            id: order.id || '',
            orderNumber: order.orderNumber || '',
            customer: order.customer || '',
            email: order.email || '',
            phone: order.phone || '',
            vendor: order.vendor || '',
            status: order.status || 'pending',
            paymentStatus: order.paymentStatus || 'pending',
            shippingStatus: order.shippingStatus || 'pending',
            paymentMethod: order.paymentMethod || '',
            total: order.total || 0,
            items: order.items || [],
            shippingAddress: order.shippingAddress || '',
            trackingNumber: order.trackingNumber,
            notes: order.notes,
            deliveryService: order.deliveryService,
            deliveryServiceLogo: order.deliveryServiceLogo,
            date: order.date || order.createdAt || new Date().toISOString(),
            createdAt: order.createdAt || new Date().toISOString(),
            updatedAt: order.updatedAt || new Date().toISOString(),
          };
        } catch (mapError) {
          console.error("❌ Error mapping order:", mapError);
          return null;
        }
      }).filter(o => o !== null);
      
      const response = {
        orders: minimalOrders,
        total: minimalOrders.length
      };
      
      // Cache the result
      setCache('orders_minimal', response);
      
      return c.json(response);
    } catch (dbError) {
      console.error("❌ Database query failed:", dbError);
      
      // Return empty result but don't cache it
      return c.json({ 
        orders: [],
        total: 0,
        warning: "Orders temporarily unavailable"
      }, 200);
    }
  } catch (error) {
    console.error("❌ Error in orders endpoint:", error);
    
    // Always return 200 with empty data to prevent frontend errors
    return c.json({ 
      orders: [],
      total: 0,
      warning: "Orders temporarily unavailable"
    }, 200);
  }
});

app.get("/make-server-16010b6f/orders/:id", async (c) => {
  try {
    const id = c.req.param("id");
    const order = await withTimeout(kv.get(`order:${id}`), 5000);
    
    if (!order) {
      return c.json({ error: "Order not found" }, 404);
    }
    
    return c.json({ order: { id, ...order } });
  } catch (error) {
    console.error("❌ Error fetching order:", error);
    return c.json({ error: "Failed to fetch order" }, 500);
  }
});

// Get orders by user ID
app.get("/make-server-16010b6f/user/:userId/orders", async (c) => {
  try {
    const userId = c.req.param("userId");
    console.log(`📋 Fetching orders for user: ${userId}`);
    
    // First try to get user's email from various mappings
    let userEmail: string | null = null;
    
    // 1. Try userId mapping
    const userIdData = await withTimeout(kv.get(`userId:${userId}`), 5000);
    if (userIdData && userIdData.email) {
      userEmail = userIdData.email;
    }
    
    // 2. Try searching auth:user: (most common for customers)
    if (!userEmail) {
      const authUser = await withTimeout(kv.get(`auth:user:${userId}`), 5000);
      if (authUser && authUser.email) {
        userEmail = authUser.email;
        // Create mapping for next time
        await withTimeout(kv.set(`userId:${userId}`, { email: userEmail }), 5000);
      }
    }
    
    // 3. Same as GET /auth/profile/:userId — keys are user:${email}, not user:${userId}
    if (!userEmail) {
      const allUsers = await withTimeout(kv.getByPrefix(`user:`), 10000);
      const arr = Array.isArray(allUsers) ? allUsers : [];
      const found = arr.find((u: any) => u && u.id === userId);
      if (found && found.email) {
        userEmail = found.email;
        await withTimeout(kv.set(`userId:${userId}`, { email: userEmail }), 5000);
        console.log(`🔧 Resolved email for ${userId} via user: scan`);
      }
    }

    console.log(`👤 User email for lookup: ${userEmail || "None found"}`);
    
    // Fetch all orders
    const allOrders = await withTimeout(kv.getByPrefix("order:"), 10000);
    const validOrders = Array.isArray(allOrders) ? allOrders.filter(o => o != null && typeof o === 'object') : [];
    
    console.log(`📊 Total orders in DB: ${validOrders.length}`);
    
    // Filter orders by userId OR email
    const userOrders = validOrders.filter((order: any) => {
      const matchesUserId = order.userId === userId;
      const matchesEmail = userEmail && order.email?.toLowerCase() === userEmail.toLowerCase();
      
      // Also check nested customer object just in case
      const matchesCustomerUserId = order.customer?.userId === userId;
      const matchesCustomerEmail = userEmail && order.customer?.email?.toLowerCase() === userEmail.toLowerCase();
      
      return matchesUserId || matchesEmail || matchesCustomerUserId || matchesCustomerEmail;
    });
    
    console.log(`✅ Found ${userOrders.length} orders for user ${userId}`);
    
    // Sort by date descending (newest first)
    const sortedOrders = userOrders.sort((a: any) => {
      const dateA = new Date(a.createdAt || a.date || 0).getTime();
      const dateB = new Date(a.createdAt || a.date || 0).getTime(); // Note: This sorting logic in original code was slightly off, I'll fix it below
      return dateB - dateA;
    });

    // Actually fix the sorting logic correctly
    const finalSortedOrders = userOrders.sort((a: any, b: any) => {
      const dateA = new Date(a.createdAt || a.date || 0).getTime();
      const dateB = new Date(b.createdAt || b.date || 0).getTime();
      return dateB - dateA;
    });
    
    return c.json({ 
      orders: finalSortedOrders,
      total: finalSortedOrders.length 
    });
  } catch (error) {
    console.error("❌ Error fetching user orders:", error);
    return c.json({ 
      orders: [], 
      total: 0,
      error: "Failed to fetch orders" 
    }, 500);
  }
});

/** Normalize order status (e.g. "Ready to Ship" → "ready-to-ship") */
function normalizeOrderStatus(s: string | undefined): string {
  if (s == null || s === "") return "";
  return String(s).trim().toLowerCase().replace(/\s+/g, "-");
}

function isInventoryCommitStatus(status: string | undefined): boolean {
  const n = normalizeOrderStatus(status);
  return n === "ready-to-ship" || n === "fulfilled";
}

/**
 * Stock was persisted (deducted) only after admin sets ready-to-ship / fulfilled — see `inventoryDeducted`.
 */
function physicallyReducedInventory(order: { inventoryDeducted?: boolean }): boolean {
  return order.inventoryDeducted === true;
}

async function loadAllProductsForStock(): Promise<any[]> {
  const all = await withTimeout(kv.getByPrefix("product:"), 10000);
  return Array.isArray(all) ? all : [];
}

function findVariantIndexBySku(product: any, sku: string | undefined): number {
  if (!sku || !Array.isArray(product?.variants)) return -1;
  const skuNorm = String(sku).trim().toLowerCase();
  if (!skuNorm || skuNorm === "n/a") return -1;
  return product.variants.findIndex(
    (v: any) => String(v.sku || "").trim().toLowerCase() === skuNorm
  );
}

/**
 * Vendor cart/checkout sometimes stored cart line `id` (`parentId:variantSku`) as `productId`.
 * Normalize to real parent product id + SKU so KV `product:${uuid}` resolves.
 */
function lineItemWithNormalizedProductRef(item: any): any {
  const raw = String(item?.productId ?? "").trim();
  const colon = raw.indexOf(":");
  if (colon > 0) {
    const parent = raw.slice(0, colon);
    const tail = raw.slice(colon + 1).trim();
    if (parent && tail) {
      const skuFromField = String(item?.sku ?? "").trim();
      return {
        ...item,
        productId: parent,
        sku: skuFromField || tail,
      };
    }
  }
  return item;
}

/**
 * Resolve line item to a KV product + optional variant index (matches client `applyLineItemStockDeltaToAdminCache`).
 */
function resolveProductForLineItem(
  item: any,
  allProducts: any[]
): { product: any; variantIndex: number } | null {
  const effective = lineItemWithNormalizedProductRef(item);
  const product = allProducts.find((p: any) => p && p.id === effective.productId) || null;
  if (product) {
    const vi = findVariantIndexBySku(product, effective.sku);
    return { product, variantIndex: vi };
  }
  for (const p of allProducts) {
    if (!p?.variants?.length) continue;
    const vi = p.variants.findIndex((v: any) => v.id === effective.productId);
    if (vi >= 0) {
      return { product: p, variantIndex: vi };
    }
  }
  return null;
}

/** Parent has variants but line SKU did not match any variant — do not fall back to parent aggregate. */
function variantSkuUnmatched(product: any, variantIndex: number, item: any): boolean {
  if (variantIndex >= 0) return false;
  if (!Array.isArray(product?.variants) || product.variants.length === 0) return false;
  const s = String(item.sku ?? "").trim();
  return s.length > 0 && s.toLowerCase() !== "n/a";
}

function recomputeParentStockFromVariants(product: any): void {
  if (!Array.isArray(product.variants) || product.variants.length === 0) return;
  const total = product.variants.reduce(
    (s: number, v: any) => s + (Number(v.inventory ?? v.stock ?? 0) || 0),
    0
  );
  product.inventory = total;
  product.stock = total;
}

async function validateStockForOrderLineItems(
  items: any[]
): Promise<{ ok: true } | { ok: false; stockIssues: any[] }> {
  const stockIssues: any[] = [];
  let allProducts: any[] = [];
  try {
    allProducts = await loadAllProductsForStock();
  } catch {
    stockIssues.push({
      productId: "",
      productName: "Unknown Product",
      issue: "Error loading products",
    });
    return { ok: false, stockIssues };
  }
  for (const item of items) {
    try {
      const resolved = resolveProductForLineItem(item, allProducts);
      if (!resolved) continue;
      const { product, variantIndex } = resolved;
      const eff = lineItemWithNormalizedProductRef(item);
      if (variantSkuUnmatched(product, variantIndex, eff)) {
        stockIssues.push({
          productId: item.productId,
          productName: product.name || item.name,
          requested: item.quantity || 1,
          available: 0,
          issue: "Variant SKU does not match this product",
        });
        continue;
      }
      const requestedQty = item.quantity || 1;
      const availableStock =
        variantIndex >= 0
          ? Number(product.variants[variantIndex].inventory ?? product.variants[variantIndex].stock ?? 0)
          : Number(product.inventory ?? product.stock ?? 0);
      if (availableStock < requestedQty) {
        stockIssues.push({
          productId: item.productId,
          productName: product.name || item.name,
          requested: requestedQty,
          available: availableStock,
          issue: "Insufficient stock",
        });
      }
    } catch {
      stockIssues.push({
        productId: item.productId,
        productName: item.name || "Unknown Product",
        issue: "Error checking stock",
      });
    }
  }
  if (stockIssues.length > 0) return { ok: false, stockIssues };
  return { ok: true };
}

async function applyOrderItemsStockDelta(items: any[], direction: "deduct" | "restore") {
  let allProducts: any[] = [];
  try {
    allProducts = await loadAllProductsForStock();
  } catch (e) {
    console.error("❌ Stock delta: failed to load products", e);
    return;
  }
  const touched = new Set<string>();

  for (const item of items) {
    try {
      const resolved = resolveProductForLineItem(item, allProducts);
      if (!resolved) {
        console.warn(`  ⚠️ Product not found: ${item.productId}`);
        continue;
      }
      const { product, variantIndex } = resolved;
      const eff = lineItemWithNormalizedProductRef(item);
      if (variantSkuUnmatched(product, variantIndex, eff)) {
        console.warn(
          `  ⚠️ Skip stock line: SKU ${eff.sku} does not match a variant on product ${product.id}`
        );
        continue;
      }
      const qty = item.quantity || 1;
      const sign = direction === "deduct" ? -1 : 1;
      const delta = sign * qty;

      let oldStock = 0;
      let newStock = 0;

      if (variantIndex >= 0) {
        const v = product.variants[variantIndex];
        oldStock = Number(v.inventory ?? v.stock ?? 0);
        newStock = Math.max(0, oldStock + delta);
        product.variants[variantIndex] = {
          ...v,
          inventory: newStock,
          stock: newStock,
          updatedAt: new Date().toISOString(),
        };
        recomputeParentStockFromVariants(product);
      } else {
        oldStock = Number(product.inventory ?? product.stock ?? 0);
        newStock =
          direction === "deduct"
            ? Math.max(0, oldStock - qty)
            : oldStock + qty;
        product.inventory = newStock;
        product.stock = newStock;
      }

      product.updatedAt = new Date().toISOString();
      touched.add(product.id);

      const idx = allProducts.findIndex((p: any) => p.id === product.id);
      if (idx >= 0) allProducts[idx] = product;

      console.log(
        `  ✅ ${item.name || "Unknown"}: ${oldStock} → ${newStock} (${direction} ${qty})`
      );
    } catch (stockError) {
      console.error(`  ❌ Stock ${direction} failed for ${item.name || item.productId}:`, stockError);
    }
  }

  for (const id of touched) {
    const product = allProducts.find((p: any) => p.id === id);
    if (product) {
      await withTimeout(kv.set(`product:${id}`, product), 5000);
    }
  }
  serverCache.delete("all_products");
}

app.post("/make-server-16010b6f/orders", async (c) => {
  try {
    console.log("📦 Creating new order...");
    const body = await c.req.json();
    const id = `order_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
    
    // 🚨 STEP 1: VALIDATE STOCK AVAILABILITY BEFORE ORDER CREATION (variant-aware — same as PUT deduct)
    if (body.items && Array.isArray(body.items)) {
      console.log(`🔍 Validating stock for ${body.items.length} items...`);
      
      const stockIssues = [];
      const missingProducts = []; // Track missing products separately
      let allProductsForValidation: any[] = [];
      try {
        allProductsForValidation = await loadAllProductsForStock();
      } catch (e) {
        console.error("❌ Failed to load products for stock validation:", e);
        return c.json(
          {
            success: false,
            error: "Insufficient stock",
            stockIssues: [{ productName: "Catalog", issue: "Error loading products for stock check" }],
            message: "Could not validate stock",
          },
          400
        );
      }

      for (const item of body.items) {
        try {
          const resolved = resolveProductForLineItem(item, allProductsForValidation);
          
          if (!resolved) {
            // Product deleted - log warning but don't reject order (historical data)
            missingProducts.push({
              productId: item.productId,
              productName: item.name || 'Unknown Product',
            });
            console.warn(`⚠️ Product not found (may be deleted): ${item.productId} - ${item.name}`);
            continue;
          }
          
          const { product, variantIndex } = resolved;
          const effPost = lineItemWithNormalizedProductRef(item);
          if (variantSkuUnmatched(product, variantIndex, effPost)) {
            stockIssues.push({
              productId: item.productId,
              productName: product.name || item.name,
              requested: item.quantity || 1,
              available: 0,
              issue: "Variant SKU does not match this product",
            });
            continue;
          }
          const requestedQty = item.quantity || 1;
          const availableStock =
            variantIndex >= 0
              ? Number(product.variants[variantIndex].inventory ?? product.variants[variantIndex].stock ?? 0)
              : Number(product.inventory ?? product.stock ?? 0);
          
          if (availableStock < requestedQty) {
            stockIssues.push({
              productId: item.productId,
              productName: product.name || item.name,
              requested: requestedQty,
              available: availableStock,
              issue: 'Insufficient stock',
            });
          }
        } catch (error) {
          console.error(`❌ Error checking stock for ${item.productId}:`, error);
          stockIssues.push({
            productId: item.productId,
            productName: item.name || 'Unknown Product',
            issue: 'Error checking stock',
          });
        }
      }
      
      // Only reject if there are ACTUAL stock issues (not just missing products)
      if (stockIssues.length > 0) {
        console.error(`❌ Order rejected due to stock issues:`, stockIssues);
        return c.json({
          success: false,
          error: 'Insufficient stock',
          stockIssues,
          message: stockIssues.map(issue => 
            `${issue.productName}: ${issue.issue}${issue.requested ? ` (need ${issue.requested}, only ${issue.available} available)` : ''}`
          ).join('; ')
        }, 400);
      }
      
      // Log missing products but allow order to proceed
      if (missingProducts.length > 0) {
        console.warn(`⚠️ Order contains ${missingProducts.length} deleted product(s):`, missingProducts);
      }
      
      console.log(`✅ Stock validation passed for all items`);
    }
    
    // Parse numeric fields to ensure proper storage
    const parsedTotal = typeof body.total === 'string' ? parseFloat(body.total) : (body.total || 0);
    const parsedSubtotal = body.subtotal ? (typeof body.subtotal === 'string' ? parseFloat(body.subtotal) : body.subtotal) : parsedTotal;
    const parsedDiscount = body.discount ? (typeof body.discount === 'string' ? parseFloat(body.discount) : body.discount) : 0;
    
    const orderData = {
      ...body,
      id,
      total: parsedTotal,
      subtotal: parsedSubtotal,
      discount: parsedDiscount,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      date: body.date || new Date().toISOString().split('T')[0],
      paymentStatus: body.paymentStatus || 'unpaid',
      shippingStatus: body.shippingStatus || 'pending',
      /** Inventory is reduced only when admin sets status to ready-to-ship or fulfilled */
      inventoryDeducted: false,
    };
    
    console.log(`💾 Saving order ${orderData.orderNumber} with total: ${orderData.total}, discount: ${orderData.discount}, couponCode: ${orderData.couponCode || 'NONE'} (inventory unchanged until ready-to-ship/fulfilled)`);
    
    await withTimeout(kv.set(`order:${id}`, orderData), 5000);
    
    // Clear cache when order is created
    serverCache.delete('orders_minimal');
    
    console.log(`✅ Order ${orderData.orderNumber} created successfully`);
    
    return c.json({ 
      success: true,
      order: orderData,
      message: "Order created successfully"
    }, 201);
  } catch (error) {
    console.error("❌ Error creating order:", error);
    return c.json({ 
      error: "Failed to create order",
      details: String(error)
    }, 500);
  }
});

app.put("/make-server-16010b6f/orders/:id", async (c) => {
  try {
    const id = c.req.param("id");
    const body = await c.req.json();
    
    const existingOrder = await withTimeout(kv.get(`order:${id}`), 5000);
    if (!existingOrder) {
      return c.json({ error: "Order not found" }, 404);
    }
    
    const prevNorm = normalizeOrderStatus(existingOrder.status);
    const newStatusRaw = body.status !== undefined ? body.status : existingOrder.status;
    const newNorm = normalizeOrderStatus(newStatusRaw);
    const wasCancelled = prevNorm === "cancelled";
    const isNowCancelled = newNorm === "cancelled";
    const items = existingOrder.items && Array.isArray(existingOrder.items) ? existingOrder.items : [];

    let nextInventoryFlag: boolean | undefined = existingOrder.inventoryDeducted;
    let inventoryRestored = false;
    let inventoryDeducted = false;

    // 1) Cancel → restore only if inventory had already been reduced (legacy checkout deduct or admin commit)
    if (!wasCancelled && isNowCancelled && items.length > 0 && physicallyReducedInventory(existingOrder)) {
      console.log(`📈 Restoring stock for cancelled order ${existingOrder.orderNumber}...`);
      await applyOrderItemsStockDelta(items, "restore");
      inventoryRestored = true;
      nextInventoryFlag = false;
    }

    // 2) Admin moved away from ready-to-ship / fulfilled → restore (new flow only; inventoryDeducted === true)
    else if (
      !inventoryRestored &&
      items.length > 0 &&
      isInventoryCommitStatus(existingOrder.status) &&
      !isInventoryCommitStatus(newStatusRaw) &&
      !isNowCancelled &&
      existingOrder.inventoryDeducted === true
    ) {
      console.log(`📈 Restoring stock for order ${existingOrder.orderNumber} (status reverted before fulfilment)...`);
      await applyOrderItemsStockDelta(items, "restore");
      inventoryRestored = true;
      nextInventoryFlag = false;
    }

    // 3) First move to ready-to-ship or fulfilled → deduct once (not yet committed in KV)
    if (
      !isNowCancelled &&
      body.status !== undefined &&
      isInventoryCommitStatus(body.status) &&
      existingOrder.inventoryDeducted !== true &&
      items.length > 0
    ) {
      console.log(`📉 Deducting stock for order ${existingOrder.orderNumber} (status → ${body.status})...`);
      const chk = await validateStockForOrderLineItems(items);
      if (!chk.ok) {
        return c.json(
          {
            success: false,
            error: "Insufficient stock",
            stockIssues: chk.stockIssues,
            message: chk.stockIssues
              .map((issue: any) =>
                `${issue.productName}: ${issue.issue}${issue.requested != null ? ` (need ${issue.requested}, only ${issue.available} available)` : ""}`
              )
              .join("; "),
          },
          400
        );
      }
      await applyOrderItemsStockDelta(items, "deduct");
      inventoryDeducted = true;
      nextInventoryFlag = true;
    }

    if (inventoryRestored) {
      console.log(`✅ Stock restore complete for order ${existingOrder.orderNumber}`);
    }
    if (inventoryDeducted) {
      console.log(`✅ Stock deduction complete for order ${existingOrder.orderNumber}`);
    }

    const updatedOrder = {
      ...existingOrder,
      ...body,
      id,
      updatedAt: new Date().toISOString(),
      inventoryDeducted: nextInventoryFlag,
    };
    
    await withTimeout(kv.set(`order:${id}`, updatedOrder), 5000);
    
    // Clear cache when order is updated
    serverCache.delete('orders_minimal');
    
    return c.json({ 
      success: true,
      order: updatedOrder,
      message: "Order updated successfully"
    });
  } catch (error) {
    console.error("❌ Error updating order:", error);
    return c.json({ error: "Failed to update order" }, 500);
  }
});

// Delete a single order
app.delete("/make-server-16010b6f/orders/:id", async (c) => {
  try {
    const id = c.req.param("id");
    
    const existingOrder = await withTimeout(kv.get(`order:${id}`), 5000);
    if (!existingOrder) {
      return c.json({ error: "Order not found" }, 404);
    }
    
    // Restore stock when deleting only if inventory had been reduced (legacy, admin-committed, or checkout-time)
    if (
      existingOrder.status !== "cancelled" &&
      existingOrder.items &&
      Array.isArray(existingOrder.items) &&
      physicallyReducedInventory(existingOrder)
    ) {
      console.log(`📈 Restoring stock for deleted order ${existingOrder.orderNumber}...`);
      await applyOrderItemsStockDelta(existingOrder.items, "restore");
      console.log(`✅ Stock restoration complete for deleted order ${existingOrder.orderNumber}`);
    }
    
    await withTimeout(kv.del(`order:${id}`), 5000);
    
    // Clear cache when order is deleted
    serverCache.delete('orders_minimal');
    
    return c.json({ 
      success: true,
      message: "Order deleted successfully"
    });
  } catch (error) {
    console.error("❌ Error deleting order:", error);
    return c.json({ error: "Failed to delete order" }, 500);
  }
});

// Delete ALL orders (for testing/cleanup)
app.delete("/make-server-16010b6f/orders", async (c) => {
  try {
    console.log("🗑️ Deleting ALL orders...");
    
    const orders = await withTimeout(kv.getByPrefix("order:"), 10000);
    const orderIds = orders.map((order: any) => order.id).filter(Boolean);
    
    if (orderIds.length > 0) {
      await withTimeout(kv.mdel(orderIds.map(id => `order:${id}`)), 10000);
      console.log(`✅ Deleted ${orderIds.length} orders`);
    }
    
    // Clear cache
    serverCache.delete('orders_minimal');
    
    return c.json({ 
      success: true,
      deletedCount: orderIds.length,
      message: `Successfully deleted ${orderIds.length} orders`
    });
  } catch (error) {
    console.error("❌ Error deleting all orders:", error);
    return c.json({ error: "Failed to delete orders" }, 500);
  }
});

// ============================================
// CATEGORIES ENDPOINTS
// ============================================

app.get("/make-server-16010b6f/categories", async (c) => {
  try {
    console.log("📂 Fetching PLATFORM categories (for Migoo storefront - vendor categories excluded)...");
    
    // Check cache first - increased cache time
    const cached = getCached("platform_categories", 180000); // Cache for 3 minutes
    if (cached) {
      console.log("⚡ Returning cached platform categories");
      return c.json(cached);
    }
    
    // Try to get categories with increased timeout
    let categoriesData;
    try {
      categoriesData = await withRetry(
        () => withTimeout(kv.getByPrefix("category:"), 30000), // Increased from 10s to 30s
        5, // Increased retries to 5
        1500 // Increased delay to 1500ms
      );
    } catch (timeoutError) {
      console.error("⚠️ Database query failed - returning empty array");
      console.error("⚠️ Error details:", timeoutError);
      
      // Return empty array immediately to prevent timeout
      const emptyResponse = { categories: [], total: 0 };
      setCache("platform_categories", emptyResponse); // Cache empty result briefly
      return c.json(emptyResponse, 200);
    }
    
    // Filter OUT vendor categories (only return platform categories for Migoo storefront)
    // Platform categories have key format: category:{id}
    // Vendor categories have key format: category:{vendorId}:{id} and have vendorId field
    const validCategories = Array.isArray(categoriesData) 
      ? categoriesData.filter(cat => {
          if (!cat || typeof cat !== 'object') return false;
          // Exclude vendor categories by checking if they have vendorId field
          return !cat.vendorId;
        })
      : [];
    
    console.log(`✅ Found ${validCategories.length} PLATFORM categories (vendor categories excluded)`);
    
    const response = {
      categories: validCategories,
      total: validCategories.length
    };
    
    // Cache the result
    setCache("platform_categories", response);
    
    return c.json(response);
  } catch (error) {
    console.error("❌ Error fetching categories:", error);
    const errorResponse = { categories: [], total: 0 };
    setCache("platform_categories", errorResponse); // Cache to prevent repeated failures
    return c.json(errorResponse, 200); // Return 200 with empty array instead of 500
  }
});

// Get ALL categories including vendor categories (for Migoo Admin)
app.get("/make-server-16010b6f/admin/all-categories", async (c) => {
  try {
    console.log("📂 Fetching ALL categories including vendor categories (for Migoo Admin)...");
    
    // Try to get ALL categories
    let categoriesData;
    try {
      categoriesData = await withRetry(
        () => withTimeout(kv.getByPrefix("category:"), 30000),
        5,
        1500
      );
    } catch (timeoutError) {
      console.error("⚠️ Database query failed - returning empty array");
      return c.json({ categories: [], total: 0 }, 200);
    }
    
    const validCategories = Array.isArray(categoriesData) 
      ? categoriesData.filter(cat => cat != null && typeof cat === 'object')
      : [];
    
    // Fetch vendor names for categories that have vendorId
    const categoriesWithVendorNames = await Promise.all(
      validCategories.map(async (cat) => {
        if (cat.vendorId) {
          try {
            const vendor = await kv.get(`vendor:${cat.vendorId}`);
            return {
              ...cat,
              vendorName: vendor?.name || vendor?.businessName || 'Unknown Vendor'
            };
          } catch (error) {
            console.error(`Failed to fetch vendor name for ${cat.vendorId}:`, error);
            return {
              ...cat,
              vendorName: 'Unknown Vendor'
            };
          }
        }
        return cat;
      })
    );
    
    console.log(`✅ Found ${categoriesWithVendorNames.length} total categories (including ${categoriesWithVendorNames.filter(c => c.vendorId).length} vendor categories)`);
    
    return c.json({
      categories: categoriesWithVendorNames,
      total: categoriesWithVendorNames.length
    });
  } catch (error) {
    console.error("❌ Error fetching all categories:", error);
    return c.json({ categories: [], total: 0 }, 200);
  }
});

app.get("/make-server-16010b6f/categories/:id", async (c) => {
  try {
    const id = c.req.param("id");
    const category = await withTimeout(kv.get(`category:${id}`), 5000);
    
    if (!category) {
      return c.json({ error: "Category not found" }, 404);
    }
    
    return c.json({ category: { id, ...category } });
  } catch (error) {
    console.error("❌ Error fetching category:", error);
    return c.json({ error: "Failed to fetch category" }, 500);
  }
});

app.post("/make-server-16010b6f/categories", async (c) => {
  try {
    const body = await c.req.json();
    const id = `cat_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
    
    const category = {
      id,
      name: body.name || "",
      description: body.description || "",
      image: body.coverPhoto || body.image || "",
      coverPhoto: body.coverPhoto || "",
      productCount: 0,
      productIds: body.productIds || [],
      parentCategory: body.parentCategory || "",
      status: body.status || "active",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    
    await withTimeout(kv.set(`category:${id}`, category), 5000);
    console.log(`✅ Category created: ${id} - ${category.name}`);
    
    // Invalidate categories cache
    serverCache.delete("categories");
    
    return c.json({ success: true, category });
  } catch (error) {
    console.error("❌ Error creating category:", error);
    return c.json({ error: "Failed to create category" }, 500);
  }
});

app.put("/make-server-16010b6f/categories/:id", async (c) => {
  try {
    const id = c.req.param("id");
    const body = await c.req.json();
    
    const existing = await withTimeout(kv.get(`category:${id}`), 5000);
    if (!existing) {
      return c.json({ error: "Category not found" }, 404);
    }
    
    const updated = {
      ...existing,
      ...body,
      id,
      updatedAt: new Date().toISOString()
    };
    
    await withTimeout(kv.set(`category:${id}`, updated), 5000);
    console.log(`✅ Category updated: ${id}`);
    
    // Invalidate categories cache
    serverCache.delete("categories");
    
    return c.json({ success: true, category: updated });
  } catch (error) {
    console.error("❌ Error updating category:", error);
    return c.json({ error: "Failed to update category" }, 500);
  }
});

app.delete("/make-server-16010b6f/categories/:id", async (c) => {
  try {
    const id = c.req.param("id");
    
    // 🔧 FIX: Vendor categories already have "category:" prefix in their ID
    // Platform categories: "cat_123456" -> stored as "category:cat_123456"
    // Vendor categories: "category:vendor123:123456" -> stored as "category:vendor123:123456"
    const deleteKey = id.startsWith("category:") ? id : `category:${id}`;
    
    console.log(`🗑️ Deleting category with key: ${deleteKey}`);
    await withTimeout(kv.del(deleteKey), 5000);
    console.log(`✅ Category deleted: ${deleteKey}`);
    
    // Invalidate categories cache
    serverCache.delete("categories");
    
    return c.json({ success: true, message: "Category deleted" });
  } catch (error) {
    console.error("❌ Error deleting category:", error);
    return c.json({ error: "Failed to delete category" }, 500);
  }
});

// Bulk delete categories
app.post("/make-server-16010b6f/categories/bulk-delete", async (c) => {
  try {
    const body = await c.req.json();
    const ids = body.ids || [];
    
    if (!Array.isArray(ids) || ids.length === 0) {
      return c.json({ error: "No category IDs provided" }, 400);
    }
    
    console.log(`🗑️ Bulk deleting ${ids.length} categories...`);
    
    // 🔧 FIX: Handle both platform and vendor category ID formats
    // Delete all categories
    await Promise.all(
      ids.map(id => {
        const deleteKey = id.startsWith("category:") ? id : `category:${id}`;
        return withTimeout(kv.del(deleteKey), 5000);
      })
    );
    
    console.log(`✅ Deleted ${ids.length} categories successfully`);
    
    // Invalidate categories cache
    serverCache.delete("categories");
    
    return c.json({ 
      success: true, 
      message: `Deleted ${ids.length} categories`,
      deletedCount: ids.length
    });
  } catch (error) {
    console.error("❌ Error bulk deleting categories:", error);
    return c.json({ error: "Failed to bulk delete categories" }, 500);
  }
});

// Delete ALL categories (for cleanup)
app.delete("/make-server-16010b6f/categories/all", async (c) => {
  try {
    console.log(`🗑️ Deleting ALL categories...`);
    
    const categories = await withTimeout(kv.getByPrefix("category:"), 30000);
    const validCategories = Array.isArray(categories) ? categories.filter(cat => cat != null) : [];
    
    if (validCategories.length === 0) {
      return c.json({ success: true, message: "No categories to delete", deletedCount: 0 });
    }
    
    // Delete all categories
    await Promise.all(
      validCategories.map(cat => withTimeout(kv.del(`category:${cat.id}`), 25000))
    );
    
    console.log(`✅ Deleted ${validCategories.length} categories successfully`);
    
    // Invalidate categories cache
    serverCache.delete("categories");
    
    return c.json({ 
      success: true, 
      message: `Deleted all ${validCategories.length} categories`,
      deletedCount: validCategories.length
    });
  } catch (error) {
    console.error("❌ Error deleting all categories:", error);
    return c.json({ error: "Failed to delete all categories" }, 500);
  }
});

// ============================================
// CUSTOMERS ENDPOINTS
// ============================================

app.get("/make-server-16010b6f/customers", async (c) => {
  try {
    const customers = await withTimeout(kv.getByPrefix("customer:"), 8000);
    const validCustomers = Array.isArray(customers) ? customers.filter(c => c != null) : [];
    
    // 🔥 Generate signed URLs for customer avatars
    const customersWithSignedUrls = await Promise.all(
      validCustomers.map(async (customer) => {
        if (customer.avatar && customer.avatar.trim() !== "") {
          try {
            const signedUrl = await getSignedImageUrl(customer.avatar);
            if (signedUrl) {
              return { ...customer, avatar: signedUrl };
            }
          } catch (error) {
            console.error(`⚠️ Error generating signed URL for customer ${customer.id}:`, error);
          }
        }
        return customer;
      })
    );
    
    return c.json({ 
      customers: customersWithSignedUrls,
      total: customersWithSignedUrls.length
    });
  } catch (error) {
    console.error("❌ Error fetching customers:", error);
    return c.json({ 
      error: "Failed to fetch customers",
      customers: [],
      total: 0
    }, 500);
  }
});

app.get("/make-server-16010b6f/customers/:id", async (c) => {
  try {
    const id = c.req.param("id");
    const customer = await withTimeout(kv.get(`customer:${id}`), 5000);
    
    if (!customer) {
      return c.json({ error: "Customer not found" }, 404);
    }
    
    // 🔥 Generate signed URL for customer avatar
    if (customer.avatar && customer.avatar.trim() !== "") {
      try {
        const signedUrl = await getSignedImageUrl(customer.avatar);
        if (signedUrl) {
          customer.avatar = signedUrl;
        }
      } catch (error) {
        console.error(`⚠️ Error generating signed URL for customer ${id}:`, error);
      }
    }
    
    return c.json({ customer: { id, ...customer } });
  } catch (error) {
    console.error("❌ Error fetching customer:", error);
    return c.json({ error: "Failed to fetch customer" }, 500);
  }
});

app.post("/make-server-16010b6f/customers", async (c) => {
  try {
    const body = await c.req.json();
    const id = `cust_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
    
    const customerData = {
      ...body,
      id,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    
    await withTimeout(kv.set(`customer:${id}`, customerData), 5000);
    
    return c.json({ 
      success: true,
      customer: customerData,
      message: "Customer created successfully"
    }, 201);
  } catch (error) {
    console.error("❌ Error creating customer:", error);
    return c.json({ error: "Failed to create customer" }, 500);
  }
});

app.put("/make-server-16010b6f/customers/:id", async (c) => {
  try {
    const id = c.req.param("id");
    const body = await c.req.json();
    
    const existingCustomer = await withTimeout(kv.get(`customer:${id}`), 5000);
    if (!existingCustomer) {
      return c.json({ error: "Customer not found" }, 404);
    }
    
    const updatedCustomer = {
      ...existingCustomer,
      ...body,
      id,
      updatedAt: new Date().toISOString(),
    };
    
    await withTimeout(kv.set(`customer:${id}`, updatedCustomer), 5000);
    
    return c.json({ 
      success: true,
      customer: updatedCustomer,
      message: "Customer updated successfully"
    });
  } catch (error) {
    console.error("❌ Error updating customer:", error);
    return c.json({ error: "Failed to update customer" }, 500);
  }
});

// 🔥 SYNC EXISTING USERS TO CUSTOMERS
app.post("/make-server-16010b6f/customers/sync-users", async (c) => {
  try {
    console.log("🔄 Syncing existing users to customer list...");
    
    // Get all users
    const allKeys = await withTimeout(kv.getByPrefix("user:"), 10000);
    const users = Array.isArray(allKeys) ? allKeys.filter(u => u != null && u.id) : [];
    
    console.log(`📊 Found ${users.length} users to sync`);
    
    // Get all existing customers
    const existingCustomers = await withTimeout(kv.getByPrefix("customer:"), 10000);
    const customerEmails = new Set(
      (Array.isArray(existingCustomers) ? existingCustomers : [])
        .filter(c => c != null && c.email)
        .map(c => c.email.toLowerCase())
    );
    
    console.log(`📊 Found ${customerEmails.size} existing customers`);
    
    let syncedCount = 0;
    let skippedCount = 0;
    
    for (const user of users) {
      // Skip users without email
      if (!user.email || !user.email.trim()) {
        console.log(`⚠️ Skipping user without email`);
        skippedCount++;
        continue;
      }
      
      // Check if customer already exists for this email
      const existingCustomer = (Array.isArray(existingCustomers) ? existingCustomers : [])
        .find(c => c != null && c.email && c.email.toLowerCase() === user.email.toLowerCase());
      
      if (existingCustomer) {
        // 🔥 UPDATE EXISTING CUSTOMER AVATAR IF MISSING OR DIFFERENT
        // Generate avatar URL (use signed URL for profile image if exists, otherwise use default)
        let avatarUrl = `https://api.dicebear.com/7.x/pixel-art/svg?seed=${encodeURIComponent(user.name || user.email)}`;
        if (user.profileImage && user.profileImage.trim() !== "") {
          const signedUrl = await getSignedImageUrl(user.profileImage);
          if (signedUrl) {
            avatarUrl = signedUrl;
          }
        }
        
        if (avatarUrl && existingCustomer.avatar !== avatarUrl) {
          console.log(`🔄 Updating avatar for ${user.email}`);
          existingCustomer.avatar = avatarUrl;
          existingCustomer.updatedAt = new Date().toISOString();
          await withTimeout(kv.set(`customer:${existingCustomer.id}`, existingCustomer), 5000);
          syncedCount++;
        } else {
          console.log(`⏭️ Skipping ${user.email} - customer already up to date`);
          skippedCount++;
        }
        continue;
      }
      
      // Create customer record
      const customerId = `cust_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
      // 🔥 Generate signed URL for avatar if user has profile image, otherwise use default
      let avatarUrl = `https://api.dicebear.com/7.x/pixel-art/svg?seed=${encodeURIComponent(user.name || user.email)}`;
      if (user.profileImage && user.profileImage.trim() !== "") {
        const signedUrl = await getSignedImageUrl(user.profileImage);
        if (signedUrl) {
          avatarUrl = signedUrl;
        }
      }
      const customerData = {
        id: customerId,
        userId: user.id,
        name: user.name || user.email.split('@')[0],
        email: user.email,
        avatar: avatarUrl, // 🔥 Use signed URL or default avatar
        phone: user.phone || "",
        location: "",
        joinDate: user.createdAt || new Date().toISOString(),
        totalOrders: 0,
        totalSpent: 0,
        status: "active",
        tier: "new",
        lastVisit: new Date().toISOString(),
        avgOrderValue: 0,
        tags: ["synced-customer"],
        engagementScore: 0,
        lifetimeValue: 0,
        rfmScore: {
          recency: 5,
          frequency: 1,
          monetary: 1
        },
        createdAt: user.createdAt || new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      
      await withTimeout(kv.set(`customer:${customerId}`, customerData), 5000);
      console.log(`✅ Created customer record for: ${user.email}`);
      syncedCount++;
    }
    
    console.log(`✅ Sync complete: ${syncedCount} created, ${skippedCount} skipped`);
    
    return c.json({
      success: true,
      message: `Synced ${syncedCount} users to customers (${skippedCount} already existed)`,
      synced: syncedCount,
      skipped: skippedCount
    });
  } catch (error) {
    console.error("❌ Error syncing users to customers:", error);
    return c.json({ error: "Failed to sync users", details: String(error) }, 500);
  }
});

// ============================================
// VENDORS ENDPOINTS
// ============================================

// 🔥 Validate vendor email and phone availability (real-time check)
app.post("/make-server-16010b6f/vendors/validate", async (c) => {
  try {
    const body = await c.req.json();
    const { email, phone } = body;
    
    const errors: { email?: string; phone?: string } = {};
    
    // Get all vendors for validation
    const validVendors = await withTimeout(kv.getVendorProfiles(), 5000);
    
    // Check email if provided
    if (email && email.trim()) {
      const existingVendor = validVendors.find((v: any) => 
        v.email?.toLowerCase() === email.trim().toLowerCase()
      );
      if (existingVendor) {
        errors.email = "A vendor with this email already exists";
      }
    }
    
    // Check phone if provided
    if (phone && phone.trim()) {
      const normalizedPhone = phone.replace(/\s+/g, ''); // Remove spaces for comparison
      const existingPhoneVendor = validVendors.find((v: any) => {
        if (v && v.phone) {
          const existingNormalizedPhone = v.phone.replace(/\s+/g, '');
          return existingNormalizedPhone === normalizedPhone;
        }
        return false;
      });
      
      if (existingPhoneVendor) {
        errors.phone = "A vendor with this phone number already exists";
      }
    }
    
    return c.json({ 
      valid: Object.keys(errors).length === 0,
      errors 
    }, 200);
  } catch (error) {
    console.error("❌ Error validating vendor data:", error);
    return c.json({ error: "Failed to validate", details: String(error) }, 500);
  }
});

// Get vendor by store slug
app.get("/make-server-16010b6f/vendors/by-slug/:slug", async (c) => {
  try {
    const slug = c.req.param('slug');
    console.log(`🔍 Fetching vendor by slug: ${slug}`);
    
    // Check cache first
    const cacheKey = `vendor_by_slug:${slug}`;
    const cached = getCached(cacheKey, 60000); // Cache for 60 seconds
    if (cached) {
      console.log(`⚡ Returning cached vendor for slug: ${slug}`);
      return c.json(cached);
    }
    
    // Fetch all vendors and find by slug or ID
    const validVendors = await withTimeout(kv.getVendorProfiles(), 5000);
    
    console.log(`🔍 Searching ${validVendors.length} vendors for slug: ${slug}`);
    
    // Try to find vendor by storeSlug, storeName, businessName, or ID
    let vendor = validVendors.find((v: any) => {
      console.log(`🔎 Checking vendor:`, {
        id: v.id,
        businessName: v.businessName,
        storeName: v.storeName,
        storeSlug: v.storeSlug,
        email: v.email
      });
      
      // Check if slug matches vendor ID directly
      if (v.id === slug) {
        console.log(`✅ Found vendor by ID: ${v.id}`);
        return true;
      }
      
      // Check storeSlug
      if (v.storeSlug === slug) {
        console.log(`✅ Found vendor by storeSlug: ${v.storeSlug}`);
        return true;
      }
      
      // Check if slug is constructed from storeName
      const storeName = v.storeName?.toLowerCase().replace(/\s+/g, '-');
      if (storeName === slug) {
        console.log(`✅ Found vendor by storeName: ${v.storeName}`);
        return true;
      }
      
      // Check if slug is constructed from businessName
      const businessName = v.businessName?.toLowerCase().replace(/\s+/g, '-');
      if (businessName === slug) {
        console.log(`✅ Found vendor by businessName: ${v.businessName}`);
        return true;
      }
      
      return false;
    });
    
    // If not found by settings, check vendor_settings
    if (!vendor) {
      const allSettings = await withTimeout(kv.getByPrefix("vendor_settings:"), 5000);
      const validSettings = Array.isArray(allSettings) ? allSettings.filter(s => s != null) : [];
      
      console.log(`🔍 Checking ${validSettings.length} vendor settings for slug: ${slug}`);
      
      const matchingSettings = validSettings.find((s: any) => 
        s.storeSlug === slug || s.storeName?.toLowerCase().replace(/\s+/g, '-') === slug
      );
      
      if (matchingSettings) {
        console.log(`✅ Found matching settings for vendorId: ${matchingSettings.vendorId}`);
        vendor = validVendors.find((v: any) => v.id === matchingSettings.vendorId);
      }
    }
    
    if (!vendor) {
      console.log(`❌ Vendor not found for slug: ${slug}`);
      console.log(`📋 Available vendors:`, validVendors.map(v => ({
        id: v.id,
        businessName: v.businessName,
        email: v.email
      })));
      return c.json({ error: "Vendor not found" }, 404);
    }
    
    // Fetch vendor settings
    const settings = await withTimeout(kv.get(`vendor_settings:${vendor.id}`), 5000);
    
    const response = { 
      vendor: {
        ...vendor,
        ...settings,
      }
    };
    
    // Cache the result
    setCache(cacheKey, response);
    
    console.log(`✅ Found vendor: ${vendor.id}`);
    return c.json(response);
  } catch (error) {
    console.error("❌ Error fetching vendor by slug:", error);
    return c.json({ error: "Failed to fetch vendor" }, 500);
  }
});

app.get("/make-server-16010b6f/vendors", async (c) => {
  try {
    console.log("👥 Fetching vendors...");
    
    // Check cache first (v2 key: excludes legacy cached responses that included vendor:audience:* rows)
    const cached = getCached("vendors_list_v2", 60000); // Cache for 60 seconds
    if (cached) {
      console.log("⚡ Returning cached vendors");
      return c.json(cached);
    }
    
    const validVendors = await kv.getVendorProfiles();
    
    // Fetch all vendor settings
    const allSettings = await kv.getByPrefix("vendor_settings:");
    const validSettings = Array.isArray(allSettings) ? allSettings.filter(s => s != null) : [];
    
    // Merge vendor data with settings
    const vendorsWithSettings = validVendors.map((vendor: any) => {
      const settings = validSettings.find((s: any) => s.vendorId === vendor.id);
      return {
        ...vendor,
        ...settings,
      };
    });
    
    console.log(`✅ Found ${vendorsWithSettings.length} vendors`);
    
    const response = { 
      vendors: vendorsWithSettings,
      total: vendorsWithSettings.length
    };
    
    // Cache the result
    setCache("vendors_list_v2", response);
    
    return c.json(response);
  } catch (error) {
    console.error("❌ Error fetching vendors:", error);
    const errorResponse = { 
      vendors: [],
      total: 0
    };
    setCache("vendors_list_v2", errorResponse); // Cache to prevent repeated failures
    return c.json(errorResponse, 200); // Return 200 instead of 500
  }
});

app.post("/make-server-16010b6f/vendors", async (c) => {
  try {
    const body = await c.req.json();

    const name = typeof body.name === "string" ? body.name.trim() : "";
    const email = typeof body.email === "string" ? body.email.trim() : "";
    if (!name || !email) {
      return c.json(
        { error: "Vendor name and email are required and cannot be empty" },
        400
      );
    }
    
    // 🔥 Check for duplicate email and phone
    const validVendors = await withTimeout(kv.getVendorProfiles(), 5000);
    
    // Check if vendor with this email already exists
    if (body.email && body.email.trim()) {
      const existingVendor = validVendors.find((v: any) => 
        v.email?.toLowerCase() === body.email.trim().toLowerCase()
      );
      if (existingVendor) {
        return c.json({ error: "A vendor with this email already exists" }, 409);
      }
    }
    
    // Check if vendor with this phone number already exists
    if (body.phone && body.phone.trim()) {
      const normalizedPhone = body.phone.replace(/\s+/g, '');
      const existingPhoneVendor = validVendors.find((v: any) => {
        if (v && v.phone) {
          const existingNormalizedPhone = v.phone.replace(/\s+/g, '');
          return existingNormalizedPhone === normalizedPhone;
        }
        return false;
      });
      
      if (existingPhoneVendor) {
        return c.json({ error: "A vendor with this phone number already exists" }, 409);
      }
    }
    
    const id = `vendor_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
    
    const vendorData = {
      ...body,
      name,
      email,
      id,
      status: body.status && typeof body.status === "string" ? body.status : "pending",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    
    await withTimeout(kv.set(`vendor:${id}`, vendorData), 5000);
    
    // Create default vendor settings with store name from business name
    const storeName = (typeof body.businessName === "string" && body.businessName.trim()) || name || "Vendor Store";
    const baseSlug = await allocateUniqueVendorSlugFromName(storeName, id);
    
    const defaultSettings = {
      vendorId: id,
      storeName: storeName,
      storeSlug: baseSlug,
      storeDescription: "Welcome to our store",
      storeTagline: "",
      logo: "",
      banner: "",
      isActive: true,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    await withTimeout(kv.set(`vendor_settings:${id}`, defaultSettings), 5000);
    
    // 🔥 AUTO-CREATE SLUG MAPPING for easy storefront lookup
    const slugMapping = {
      slug: baseSlug,
      vendorId: id,
      businessName: storeName,
      createdAt: new Date().toISOString()
    };
    await withTimeout(kv.set(`vendor_slug_${baseSlug}`, slugMapping), 5000);
    console.log(`✅ Auto-created slug mapping: ${baseSlug} → ${id}`);
    
    return c.json({ 
      success: true,
      vendor: vendorData,
      storeSlug: baseSlug, // Return the slug so frontend knows the storefront URL
      message: "Vendor created successfully"
    }, 201);
  } catch (error) {
    console.error("❌ Error creating vendor:", error);
    return c.json({ error: "Failed to create vendor" }, 500);
  }
});

// Delete vendor
app.delete("/make-server-16010b6f/vendors/:vendorId", async (c) => {
  try {
    const vendorId = c.req.param("vendorId");
    console.log(`🗑️ Deleting vendor: ${vendorId}`);
    
    // Get vendor data first to retrieve slug and other info
    const vendor = await withTimeout(kv.get(`vendor:${vendorId}`), 5000);
    if (!vendor) {
      console.log(`⚠️ Vendor not found: ${vendorId}`);
      return c.json({ error: "Vendor not found" }, 404);
    }
    
    // Delete vendor settings
    const vendorSettings = await withTimeout(kv.get(`vendor_settings:${vendorId}`), 5000);
    if (vendorSettings) {
      await withTimeout(kv.del(`vendor_settings:${vendorId}`), 5000);
      console.log(`✅ Deleted vendor settings: ${vendorId}`);
      
      // Delete slug mapping if it exists
      if (vendorSettings.storeSlug) {
        await withTimeout(kv.del(`vendor_slug_${vendorSettings.storeSlug}`), 5000);
        console.log(`✅ Deleted slug mapping: ${vendorSettings.storeSlug}`);
      }
    }
    
    // Delete vendor data
    await withTimeout(kv.del(`vendor:${vendorId}`), 5000);
    console.log(`✅ Deleted vendor: ${vendorId}`);
    
    // Clear vendor cache
    serverCache.delete("vendors");
    serverCache.delete("vendors_list_v2");
    serverCache.delete(`vendor_by_slug:${vendorSettings?.storeSlug}`);
    
    return c.json({ 
      success: true,
      message: "Vendor deleted successfully"
    });
  } catch (error) {
    console.error("❌ Error deleting vendor:", error);
    return c.json({ error: "Failed to delete vendor", details: String(error) }, 500);
  }
});

// ============================================
// VENDOR APPLICATION ENDPOINTS
// ============================================

// Submit vendor application
app.post("/make-server-16010b6f/vendor-applications", async (c) => {
  try {
    const applicationData = await c.req.json();
    const id = `vendor_app_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
    
    const application = {
      id,
      ...applicationData,
      status: "pending",
      submittedAt: new Date().toISOString(),
      reviewedAt: null,
      reviewedBy: null,
      reviewNotes: null,
    };
    
    // Save application to KV store
    await withTimeout(kv.set(`vendor_application:${id}`, application), 5000);
    
    console.log(`✅ Vendor application submitted: ${id}`);
    
    return c.json({ 
      success: true,
      applicationId: id,
      message: "Application submitted successfully"
    }, 201);
  } catch (error: any) {
    console.error("❌ Error submitting vendor application:", error);
    return c.json({ 
      error: "Failed to submit application",
      details: error?.message || String(error)
    }, 500);
  }
});

// Get all vendor applications
app.get("/make-server-16010b6f/vendor-applications", async (c) => {
  try {
    console.log("📋 Fetching vendor applications...");
    
    // Increase timeout and add better error handling
    const applications = await withTimeout(
      kv.getByPrefix("vendor_application:"),
      20000 // Increased to 20 second timeout to handle slow connections
    );
    
    // Ensure applications is an array and filter null values
    const validApplications = Array.isArray(applications) 
      ? applications.filter(app => app != null && typeof app === 'object')
      : [];
    
    console.log(`✅ Found ${validApplications.length} vendor applications`);
    
    // Sort by submission date (newest first)
    const sortedApplications = validApplications.sort((a: any, b: any) => {
      const dateA = a.submittedAt ? new Date(a.submittedAt).getTime() : 0;
      const dateB = b.submittedAt ? new Date(b.submittedAt).getTime() : 0;
      return dateB - dateA;
    });
    
    return c.json({ 
      success: true,
      data: sortedApplications,
      total: sortedApplications.length
    });
  } catch (error: any) {
    console.error("❌ Error fetching vendor applications:", error);
    
    // Don't throw error - return empty array to prevent UI from breaking
    return c.json({ 
      success: true,
      data: [],
      total: 0,
      warning: error.message || "Failed to fetch applications - please try again later"
    }, 200); // Return 200 with warning instead of error
  }
});

// Get single vendor application
app.get("/make-server-16010b6f/vendor-applications/:id", async (c) => {
  try {
    const { id } = c.req.param();
    const application = await withTimeout(
      kv.get(`vendor_application:${id}`),
      5000
    );
    
    if (!application) {
      return c.json({ error: "Application not found" }, 404);
    }
    
    return c.json({ 
      success: true,
      application
    });
  } catch (error: any) {
    console.error("❌ Error fetching vendor application:", error);
    return c.json({ error: "Failed to fetch application" }, 500);
  }
});

// Update vendor application status (approve/reject)
app.put("/make-server-16010b6f/vendor-applications/:id", async (c) => {
  try {
    const { id } = c.req.param();
    const { status, reviewNotes, reviewedBy } = await c.req.json();
    
    const application = await withTimeout(
      kv.get(`vendor_application:${id}`),
      5000
    );
    
    if (!application) {
      return c.json({ error: "Application not found" }, 404);
    }
    
    const updatedApplication = {
      ...application,
      status,
      reviewNotes,
      reviewedBy,
      reviewedAt: new Date().toISOString(),
    };
    
    await withTimeout(
      kv.set(`vendor_application:${id}`, updatedApplication),
      5000
    );
    
    // If approved, automatically create vendor account
    if (status === "approved") {
      console.log(`✅ Vendor application approved: ${id}, creating vendor account...`);
      
      // Create vendor from application data
      const vendorId = `vendor_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
      const newVendor = {
        id: vendorId,
        name: application.companyName || application.businessName,
        email: application.email,
        phone: application.phone,
        location: application.city && application.country ? `${application.city}, ${application.country}` : application.address || "",
        status: "active",
        productsCount: 0,
        totalRevenue: 0,
        commission: parseInt(application.requestedCommission) || 15,
        joinedDate: new Date().toISOString(),
        avatar: (application.companyName || application.businessName)?.substring(0, 2).toUpperCase() || "VN",
        businessType: application.businessType,
        taxId: application.registrationNumber || application.taxId,
        website: application.website,
        description: application.storeDescription || application.description,
        categories: application.categories || [],
        contactName: application.contactName,
        applicationId: id, // Link back to the application
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      
      await withTimeout(
        kv.set(`vendor:${vendorId}`, newVendor),
        5000
      );
      
      // Create vendor settings with friendly slug (subdomain-safe: a-z0-9 only)
      const storeName = application.companyName || application.businessName || "Vendor Store";
      const baseSlug = await allocateUniqueVendorSlugFromName(storeName, vendorId);
      
      const vendorSettings = {
        vendorId: vendorId,
        storeName: storeName,
        storeSlug: baseSlug,
        storeDescription: application.storeDescription || application.description || "Welcome to our store",
        storeTagline: "",
        logo: "",
        banner: "",
        isActive: true,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      
      await withTimeout(
        kv.set(`vendor_settings:${vendorId}`, vendorSettings),
        5000
      );

      const slugMappingApproved = {
        slug: baseSlug,
        vendorId: vendorId,
        businessName: storeName,
        createdAt: new Date().toISOString(),
      };
      await withTimeout(kv.set(`vendor_slug_${baseSlug}`, slugMappingApproved), 5000);
      console.log(`✅ Slug mapping created for approved application: ${baseSlug} → ${vendorId}`);
      
      console.log(`✅ Vendor account created: ${vendorId} for ${newVendor.name} with slug: ${baseSlug}`);
    }
    
    return c.json({ 
      success: true,
      application: updatedApplication,
      message: `Application ${status} successfully`
    });
  } catch (error: any) {
    console.error("❌ Error updating vendor application:", error);
    return c.json({ error: "Failed to update application" }, 500);
  }
});

app.put("/make-server-16010b6f/vendors/:id", async (c) => {
  try {
    const id = c.req.param("id");
    const body = await c.req.json();
    
    // 🔒 Validate vendor ID
    if (!id || id.trim() === "") {
      console.error("❌ Invalid vendor ID:", id);
      return c.json({ success: false, error: "Invalid vendor ID" }, 400);
    }
    
    const existingVendor = await withTimeout(kv.get(`vendor:${id}`), 5000);
    if (!existingVendor) {
      console.error("❌ Vendor not found:", id);
      return c.json({ success: false, error: "Vendor not found" }, 404);
    }
    
    // 🔒 Validate status if it's being updated
    if (body.status) {
      const validStatuses = ["active", "inactive", "pending", "suspended", "banned"];
      if (!validStatuses.includes(body.status)) {
        console.error("❌ Invalid status:", body.status);
        return c.json({ 
          success: false, 
          error: `Invalid status. Must be one of: ${validStatuses.join(", ")}` 
        }, 400);
      }
    }
    
    const updatedVendor = {
      ...existingVendor,
      ...body,
      id,
      updatedAt: new Date().toISOString(),
    };
    
    await withTimeout(kv.set(`vendor:${id}`, updatedVendor), 5000);
    
    // 🔥 Clear vendor list cache to force refresh
    try {
      await withTimeout(kv.del("vendors"), 5000);
      clearCache("vendors_list_v2");
      console.log("🔄 Cleared vendor list cache after vendor update");
    } catch (cacheError) {
      console.warn("⚠️ Failed to clear vendor cache, but vendor update succeeded:", cacheError);
      // Don't fail the request if cache clearing fails
    }
    
    console.log(`✅ Vendor ${id} updated successfully. Status: ${updatedVendor.status || 'unchanged'}`);
    
    return c.json({ 
      success: true,
      vendor: updatedVendor,
      message: "Vendor updated successfully"
    });
  } catch (error) {
    console.error("❌ Error updating vendor:", error);
    return c.json({ 
      success: false,
      error: "Failed to update vendor",
      details: error instanceof Error ? error.message : "Unknown error"
    }, 500);
  }
});

// Delete all vendors (clear database)
app.delete("/make-server-16010b6f/vendors/all/clear", async (c) => {
  try {
    console.log("🗑️ Clearing all vendors...");
    const validVendors = await withTimeout(kv.getVendorProfiles(), 8000);
    
    // Delete each vendor
    for (const vendor of validVendors) {
      if (vendor.id) {
        await withTimeout(kv.del(`vendor:${vendor.id}`), 5000);
      }
    }
    
    console.log(`✅ Deleted ${validVendors.length} vendors`);
    
    return c.json({ 
      success: true,
      deletedCount: validVendors.length,
      message: `Successfully deleted ${validVendors.length} vendors`
    });
  } catch (error) {
    console.error("❌ Error clearing vendors:", error);
    return c.json({ error: "Failed to clear vendors" }, 500);
  }
});

// ============================================
// COLLABORATORS ENDPOINTS
// ============================================

app.get("/make-server-16010b6f/collaborators", async (c) => {
  try {
    console.log("🤝 Fetching collaborators...");
    
    // Check cache first
    const cached = getCached("collaborators", 60000); // Cache for 60 seconds
    if (cached) {
      console.log("⚡ Returning cached collaborators");
      return c.json(cached);
    }
    
    const collaborators = await withTimeout(kv.getByPrefix("collaborator:"), 25000);
    const validCollaborators = Array.isArray(collaborators) ? collaborators.filter(c => c != null) : [];
    
    console.log(`✅ Found ${validCollaborators.length} collaborators`);
    
    const response = { 
      collaborators: validCollaborators,
      total: validCollaborators.length
    };
    
    // Cache the result
    setCache("collaborators", response);
    
    return c.json(response);
  } catch (error) {
    console.error("❌ Error fetching collaborators:", error);
    const errorResponse = { 
      collaborators: [],
      total: 0
    };
    setCache("collaborators", errorResponse); // Cache to prevent repeated failures
    return c.json(errorResponse, 200); // Return 200 instead of 500
  }
});

app.post("/make-server-16010b6f/collaborators", async (c) => {
  try {
    const body = await c.req.json();
    const id = `collab_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
    
    const collaboratorData = {
      ...body,
      id,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    
    await withTimeout(kv.set(`collaborator:${id}`, collaboratorData), 5000);
    
    return c.json({ 
      success: true,
      collaborator: collaboratorData,
      message: "Collaborator created successfully"
    }, 201);
  } catch (error) {
    console.error("❌ Error creating collaborator:", error);
    return c.json({ error: "Failed to create collaborator" }, 500);
  }
});

app.put("/make-server-16010b6f/collaborators/:id", async (c) => {
  try {
    const id = c.req.param("id");
    const body = await c.req.json();
    
    const existingCollaborator = await withTimeout(kv.get(`collaborator:${id}`), 5000);
    if (!existingCollaborator) {
      return c.json({ error: "Collaborator not found" }, 404);
    }
    
    const updatedCollaborator = {
      ...existingCollaborator,
      ...body,
      id,
      updatedAt: new Date().toISOString(),
    };
    
    await withTimeout(kv.set(`collaborator:${id}`, updatedCollaborator), 5000);
    
    return c.json({ 
      success: true,
      collaborator: updatedCollaborator,
      message: "Collaborator updated successfully"
    });
  } catch (error) {
    console.error("❌ Error updating collaborator:", error);
    return c.json({ error: "Failed to update collaborator" }, 500);
  }
});

// ============================================
// BLOG POSTS ENDPOINTS
// ============================================

app.get("/make-server-16010b6f/blog-posts", async (c) => {
  try {
    console.log("🔍 GET /blog-posts - Fetching blog posts from database...");
    const posts = await withTimeout(kv.getByPrefix("blog:"), 8000);
    console.log("📦 Raw posts from KV store:", posts);
    const validPosts = Array.isArray(posts) ? posts.filter(p => p != null) : [];
    
    console.log(`✅ Fetched ${validPosts.length} blog posts from database`);
    console.log("📋 Blog posts:", JSON.stringify(validPosts, null, 2));
    
    return c.json({ 
      success: true,
      data: validPosts
    });
  } catch (error) {
    console.error("❌ Error fetching blog posts:", error);
    return c.json({ 
      success: false,
      error: "Failed to fetch blog posts",
      data: []
    }, 500);
  }
});

app.post("/make-server-16010b6f/blog-posts", async (c) => {
  try {
    console.log("📝 POST /blog-posts - Creating new blog post...");
    const body = await c.req.json();
    console.log("📦 Request body:", JSON.stringify(body, null, 2));
    
    const id = `post_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
    
    const postData = {
      ...body,
      id,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    
    console.log("💾 Saving to KV store with key: blog:" + id);
    console.log("💾 Post data:", JSON.stringify(postData, null, 2));
    
    await withTimeout(kv.set(`blog:${id}`, postData), 5000);
    
    console.log(`✅ Blog post created successfully: ${id}`);
    console.log(`✅ Verifying save...`);
    
    // Verify the post was saved
    const savedPost = await withTimeout(kv.get(`blog:${id}`), 5000);
    console.log("🔍 Verification - Post retrieved from DB:", savedPost ? "YES" : "NO");
    
    return c.json({ 
      success: true,
      data: postData,
      message: "Blog post created successfully"
    }, 201);
  } catch (error) {
    console.error("❌ Error creating blog post:", error);
    return c.json({ success: false, error: "Failed to create blog post" }, 500);
  }
});

app.put("/make-server-16010b6f/blog-posts/:id", async (c) => {
  try {
    const id = c.req.param("id");
    const body = await c.req.json();
    
    const existingPost = await withTimeout(kv.get(`blog:${id}`), 5000);
    if (!existingPost) {
      return c.json({ success: false, error: "Blog post not found" }, 404);
    }
    
    const updatedPost = {
      ...existingPost,
      ...body,
      id,
      updatedAt: new Date().toISOString(),
    };
    
    await withTimeout(kv.set(`blog:${id}`, updatedPost), 5000);
    
    console.log(`✅ Blog post updated: ${id}`);
    
    return c.json({ 
      success: true,
      data: updatedPost,
      message: "Blog post updated successfully"
    });
  } catch (error) {
    console.error("❌ Error updating blog post:", error);
    return c.json({ success: false, error: "Failed to update blog post" }, 500);
  }
});

app.delete("/make-server-16010b6f/blog-posts/:id", async (c) => {
  try {
    const id = c.req.param("id");
    
    const existingPost = await withTimeout(kv.get(`blog:${id}`), 5000);
    if (!existingPost) {
      return c.json({ success: false, error: "Blog post not found" }, 404);
    }
    
    await withTimeout(kv.del(`blog:${id}`), 5000);
    
    console.log(`✅ Blog post deleted: ${id}`);
    
    return c.json({ 
      success: true,
      message: "Blog post deleted successfully"
    });
  } catch (error) {
    console.error("❌ Error deleting blog post:", error);
    return c.json({ success: false, error: "Failed to delete blog post" }, 500);
  }
});

// ============================================
// MARKETING CAMPAIGNS API
// ============================================

// Get all campaigns
app.get("/make-server-16010b6f/campaigns", async (c) => {
  try {
    // Check if client is still connected
    if (c.req.raw?.signal?.aborted) {
      console.log("⚠️ Client disconnected before campaigns fetch");
      return new Response(null, { status: 499 });
    }
    
    console.log("🎯 Fetching campaigns...");
    
    // Check cache first
    const cached = getCached("campaigns", 30000); // Cache for 30 seconds
    if (cached) {
      console.log("⚡ Returning cached campaigns");
      return c.json(cached);
    }
    
    const campaigns = await withTimeout(kv.getByPrefix("campaign:"), 30000);
    const validCampaigns = Array.isArray(campaigns) ? campaigns.filter(c => c != null) : [];
    
    console.log(`✅ Found ${validCampaigns.length} campaigns`);
    
    const response = { 
      campaigns: validCampaigns,
      total: validCampaigns.length
    };
    
    // Cache the result
    setCache("campaigns", response);
    
    return c.json(response);
  } catch (error) {
    console.error("❌ Error fetching campaigns:", error);
    // Return empty array on error instead of 500 to prevent frontend crashes
    const errorResponse = { 
      campaigns: [],
      total: 0
    };
    setCache("campaigns", errorResponse); // Cache to prevent repeated failures
    return c.json(errorResponse, 200);
  }
});

// Debug endpoint - Get ALL campaigns with full details for debugging
app.get("/make-server-16010b6f/campaigns-debug", async (c) => {
  try {
    console.log(`🔍 DEBUG: Fetching ALL campaigns for debugging...`);
    
    const campaigns = await withTimeout(kv.getByPrefix("campaign:"), 10000);
    const validCampaigns = Array.isArray(campaigns) ? campaigns.filter(c => c != null) : [];
    
    console.log(`🔍 DEBUG: Found ${validCampaigns.length} campaigns`);
    
    // Return full details for each campaign
    const debugInfo = validCampaigns.map(c => ({
      id: c.id,
      name: c.name,
      code: c.code,
      status: c.status,
      type: c.type,
      discount: c.discount,
      discountType: c.discountType,
      startDate: c.startDate,
      endDate: c.endDate,
      createdAt: c.createdAt,
      // Check if dates are valid
      isDateValid: (() => {
        const now = new Date();
        const start = new Date(c.startDate);
        const end = new Date(c.endDate);
        return now >= start && now <= end;
      })(),
      // Check all validation conditions
      validationChecks: {
        hasCode: !!c.code,
        statusIsActive: c.status === "active",
        hasDiscount: !!c.discount,
        hasValidDates: !!c.startDate && !!c.endDate
      }
    }));
    
    return c.json({ 
      total: validCampaigns.length,
      campaigns: debugInfo,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error("❌ Error in debug endpoint:", error);
    return c.json({ error: String(error) }, 500);
  }
});

// Get featured campaigns for storefront promotional section
app.get("/make-server-16010b6f/campaigns/featured", async (c) => {
  try {
    // Check if client is still connected
    if (c.req.raw?.signal?.aborted) {
      console.log("⚠️ Client disconnected before featured campaigns fetch");
      return new Response(null, { status: 499 });
    }
    
    console.log("🎯 Fetching featured campaigns for promotional section...");
    
    // Check cache first
    const cached = getCached("featured_campaigns", 30000); // Cache for 30 seconds
    if (cached) {
      console.log("⚡ Returning cached featured campaigns");
      return c.json(cached);
    }
    
    const campaigns = await withTimeout(kv.getByPrefix("campaign:"), 30000);
    const validCampaigns = Array.isArray(campaigns) ? campaigns.filter(c => c != null) : [];
    
    // Filter active campaigns within date range
    const now = new Date();
    const activeCampaigns = validCampaigns.filter(c => {
      if (c.status !== "active") return false;
      
      const startDate = new Date(c.startDate);
      const endDate = new Date(c.endDate);
      
      return now >= startDate && now <= endDate;
    });
    
    // Sort by creation date (newest first) and take the latest 3
    const featuredCampaigns = activeCampaigns
      .sort((a, b) => new Date(b.createdDate || b.createdAt || 0).getTime() - new Date(a.createdDate || a.createdAt || 0).getTime())
      .slice(0, 3);
    
    console.log(`✅ Found ${featuredCampaigns.length} featured campaigns out of ${activeCampaigns.length} active campaigns`);
    
    const response = { 
      campaigns: featuredCampaigns,
      total: featuredCampaigns.length
    };
    
    // Cache the result
    setCache("featured_campaigns", response);
    
    return c.json(response);
  } catch (error) {
    console.error("❌ Error fetching featured campaigns:", error);
    // Return empty array on error instead of 500 to prevent frontend crashes
    const errorResponse = { 
      campaigns: [],
      total: 0
    };
    setCache("featured_campaigns", errorResponse); // Cache to prevent repeated failures
    return c.json(errorResponse, 200);
  }
});

// Get single campaign
app.get("/make-server-16010b6f/campaigns/:id", async (c) => {
  try {
    const id = c.req.param("id");
    console.log(`🎯 Fetching campaign: ${id}`);
    
    const campaign = await withTimeout(kv.get(`campaign:${id}`), 5000);
    
    if (!campaign) {
      return c.json({ error: "Campaign not found" }, 404);
    }
    
    return c.json({ campaign });
  } catch (error) {
    console.error("❌ Error fetching campaign:", error);
    return c.json({ error: "Failed to fetch campaign" }, 500);
  }
});

// Create campaign
app.post("/make-server-16010b6f/campaigns", async (c) => {
  try {
    const body = await c.req.json();
    const id = `campaign_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
    
    console.log(`➕ Creating campaign: ${body.name}`);
    
    const campaignData = {
      ...body,
      id,
      usageCount: 0,
      revenue: 0,
      conversions: 0,
      clicks: 0,
      createdDate: new Date().toISOString(),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    
    await withTimeout(kv.set(`campaign:${id}`, campaignData), 5000);
    
    console.log(`✅ Campaign created: ${id}`);
    
    return c.json({ 
      success: true,
      campaign: campaignData,
      message: "Campaign created successfully"
    }, 201);
  } catch (error) {
    console.error("❌ Error creating campaign:", error);
    return c.json({ error: "Failed to create campaign", details: String(error) }, 500);
  }
});

// Update campaign
app.put("/make-server-16010b6f/campaigns/:id", async (c) => {
  try {
    const id = c.req.param("id");
    const body = await c.req.json();
    
    console.log(`🔄 Updating campaign: ${id}`);
    
    const existingCampaign = await withTimeout(kv.get(`campaign:${id}`), 5000);
    if (!existingCampaign) {
      return c.json({ error: "Campaign not found" }, 404);
    }
    
    const updatedCampaign = {
      ...existingCampaign,
      ...body,
      id,
      updatedAt: new Date().toISOString(),
    };
    
    await withTimeout(kv.set(`campaign:${id}`, updatedCampaign), 5000);
    
    // 🔄 Clear campaigns cache to force refresh
    clearCache("campaigns");
    
    console.log(`✅ Campaign updated: ${id}`);
    
    return c.json({ 
      success: true,
      campaign: updatedCampaign,
      message: "Campaign updated successfully"
    });
  } catch (error) {
    console.error("❌ Error updating campaign:", error);
    return c.json({ error: "Failed to update campaign" }, 500);
  }
});

// Delete campaign
app.delete("/make-server-16010b6f/campaigns/:id", async (c) => {
  try {
    const id = c.req.param("id");
    
    console.log(`🗑️ Deleting campaign: ${id}`);
    
    if (!id || id.trim() === '') {
      console.error("❌ Invalid campaign ID provided");
      return c.json({ 
        success: false,
        error: "Invalid campaign ID" 
      }, 400);
    }
    
    const existingCampaign = await withTimeout(kv.get(`campaign:${id}`), 5000);
    if (!existingCampaign) {
      console.error(`❌ Campaign not found: ${id}`);
      return c.json({ 
        success: false,
        error: "Campaign not found" 
      }, 404);
    }
    
    await withTimeout(kv.del(`campaign:${id}`), 5000);
    
    console.log(`✅ Campaign deleted: ${id}`);
    
    return c.json({ 
      success: true,
      message: "Campaign deleted successfully"
    });
  } catch (error) {
    console.error("❌ Error deleting campaign:", error);
    return c.json({ 
      success: false,
      error: "Failed to delete campaign",
      details: error instanceof Error ? error.message : String(error)
    }, 500);
  }
});

// Clear all campaigns (cleanup route)
app.delete("/make-server-16010b6f/campaigns-clear-all", async (c) => {
  try {
    console.log("🗑️ Clearing all campaigns...");
    
    const campaigns = await withTimeout(kv.getByPrefix("campaign:"), 8000);
    const validCampaigns = Array.isArray(campaigns) ? campaigns.filter(c => c != null && c.id) : [];
    
    console.log(`Found ${validCampaigns.length} campaigns to delete`);
    
    // Delete each campaign using its id property
    for (const campaign of validCampaigns) {
      await withTimeout(kv.del(`campaign:${campaign.id}`), 5000);
      console.log(`🗑️ Deleted: ${campaign.id}`);
    }
    
    console.log(`✅ All campaigns cleared: ${validCampaigns.length} deleted`);
    
    return c.json({ 
      success: true,
      deleted: validCampaigns.length,
      message: `${validCampaigns.length} campaigns cleared successfully`
    });
  } catch (error) {
    console.error("❌ Error clearing campaigns:", error);
    return c.json({ error: "Failed to clear campaigns" }, 500);
  }
});

// Validate and apply coupon code
app.post("/make-server-16010b6f/campaigns/validate", async (c) => {
  try {
    // Check if client is still connected
    if (c.req.raw?.signal?.aborted) {
      console.log("⚠️ Client disconnected before coupon validation");
      return new Response(null, { status: 499 });
    }
    
    const body = await c.req.json();
    const { code, cartTotal, cartItems = [] } = body;
    
    console.log(`🎫 Validating coupon code: "${code}"`);
    console.log(`💰 Cart total: $${cartTotal}`);
    console.log(`🛒 Cart items:`, cartItems.map((item: any) => item.sku || item.id).join(', '));
    
    if (!code || !code.trim()) {
      return c.json({ 
        valid: false, 
        error: "Please enter a coupon code" 
      }, 400);
    }
    
    // Get all campaigns with shorter timeout
    const campaigns = await withTimeout(kv.getByPrefix("campaign:"), 5000);
    const validCampaigns = Array.isArray(campaigns) ? campaigns.filter(c => c != null) : [];
    
    console.log(`📋 Total campaigns found: ${validCampaigns.length}`);
    
    // Log all available coupon codes for debugging
    const availableCoupons = validCampaigns
      .filter(c => c.code && c.code.trim())
      .map(c => ({ code: c.code, status: c.status, type: c.type }));
    console.log(`🎫 Available coupons in database:`, JSON.stringify(availableCoupons, null, 2));
    
    // Find campaign by code (case-insensitive)
    const campaign = validCampaigns.find(c => 
      c.code && c.code.trim().toLowerCase() === code.trim().toLowerCase()
    );
    
    if (!campaign) {
      console.log(`❌ Coupon code not found: "${code}"`);
      console.log(`💡 Available codes: ${availableCoupons.map(c => c.code).join(', ') || 'none'}`);
      return c.json({ 
        valid: false, 
        error: `Invalid coupon code. Available codes: ${availableCoupons.map(c => c.code).join(', ') || 'none'}` 
      });
    }
    
    console.log(`✅ Found campaign:`, {
      id: campaign.id,
      name: campaign.name,
      code: campaign.code,
      status: campaign.status,
      productScope: campaign.productScope || 'all'
    });
    
    // Check if campaign is active
    if (campaign.status !== "active") {
      console.log(`❌ Campaign not active: ${campaign.status}`);
      return c.json({ 
        valid: false, 
        error: `This coupon is ${campaign.status}` 
      });
    }
    
    // Check date validity
    const now = new Date();
    const startDate = new Date(campaign.startDate);
    const endDate = new Date(campaign.endDate);
    
    if (now < startDate) {
      console.log(`❌ Campaign not started yet`);
      return c.json({ 
        valid: false, 
        error: "This coupon is not valid yet" 
      });
    }
    
    if (now > endDate) {
      console.log(`❌ Campaign expired`);
      return c.json({ 
        valid: false, 
        error: "This coupon has expired" 
      });
    }
    
    // Check usage limit
    if (campaign.usageLimit && campaign.usageCount >= campaign.usageLimit) {
      console.log(`❌ Usage limit reached`);
      return c.json({ 
        valid: false, 
        error: "This coupon has reached its usage limit" 
      });
    }
    
    // Check product eligibility
    if (campaign.productScope === "specific" && campaign.specificProducts && campaign.specificProducts.length > 0) {
      const eligibleSkus = campaign.specificProducts.map((sku: string) => sku.toUpperCase());
      const cartSkus = cartItems.map((item: any) => (item.sku || item.id || '').toUpperCase());
      const hasEligibleProduct = cartSkus.some((sku: string) => eligibleSkus.includes(sku));
      
      if (!hasEligibleProduct) {
        console.log(`❌ No eligible products in cart. Required: ${eligibleSkus.join(', ')}, Found: ${cartSkus.join(', ')}`);
        return c.json({ 
          valid: false, 
          error: `This coupon only applies to: ${campaign.specificProducts.join(', ')}` 
        });
      }
      
      console.log(`✅ Cart contains eligible products`);
    }
    
    // Calculate discount based on eligible items
    let discountAmount = 0;
    let eligibleTotal = cartTotal;
    
    // If specific products, calculate total of only eligible items
    if (campaign.productScope === "specific" && campaign.specificProducts && campaign.specificProducts.length > 0) {
      const eligibleSkus = campaign.specificProducts.map((sku: string) => sku.toUpperCase());
      eligibleTotal = cartItems
        .filter((item: any) => eligibleSkus.includes((item.sku || item.id || '').toUpperCase()))
        .reduce((sum: number, item: any) => sum + (item.price * item.quantity), 0);
      
      console.log(`💵 Eligible items total: $${eligibleTotal.toFixed(2)}`);
    }
    
    // Check minimum order amount (based on eligible items)
    if (campaign.minAmount && eligibleTotal < campaign.minAmount) {
      console.log(`❌ Minimum amount not met: ${eligibleTotal} < ${campaign.minAmount}`);
      return c.json({ 
        valid: false, 
        error: `Minimum order amount is $${campaign.minAmount}` 
      });
    }
    
    // Calculate discount
    if (campaign.discountType === "percentage") {
      discountAmount = (eligibleTotal * campaign.discount) / 100;
    } else if (campaign.discountType === "fixed") {
      discountAmount = campaign.discount;
    }
    
    // Ensure discount doesn't exceed eligible total
    discountAmount = Math.min(discountAmount, eligibleTotal);
    
    console.log(`✅ Coupon valid! Discount: $${discountAmount.toFixed(2)}`);
    
    return c.json({ 
      valid: true,
      campaign: {
        id: campaign.id,
        name: campaign.name,
        code: campaign.code,
        discount: campaign.discount,
        discountType: campaign.discountType,
        discountAmount: discountAmount,
        productScope: campaign.productScope || 'all',
        specificProducts: campaign.specificProducts || [],
      },
      message: `Coupon applied! You saved $${discountAmount.toFixed(2)}`
    });
  } catch (error) {
    console.error("❌ Error validating coupon:", error);
    console.error("❌ Error stack:", error instanceof Error ? error.stack : 'No stack trace');
    console.error("❌ Error message:", error instanceof Error ? error.message : String(error));
    return c.json({ 
      valid: false,
      error: `Failed to validate coupon code: ${error instanceof Error ? error.message : String(error)}` 
    }, 500);
  }
});

// Increment campaign usage (called after successful order)
app.post("/make-server-16010b6f/campaigns/:id/increment", async (c) => {
  try {
    const id = c.req.param("id");
    const body = await c.req.json();
    const { revenue = 0 } = body;
    
    console.log(`📊 Incrementing campaign usage: ${id}`);
    console.log(`💰 Revenue to add: ${revenue} MMK`);
    
    const campaign = await withTimeout(kv.get(`campaign:${id}`), 5000);
    if (!campaign) {
      console.error(`❌ Campaign not found: ${id}`);
      return c.json({ error: "Campaign not found" }, 404);
    }
    
    console.log(`📈 Current metrics - Usage: ${campaign.usageCount || 0}, Revenue: ${campaign.revenue || 0}, Conversions: ${campaign.conversions || 0}`);
    
    const updatedCampaign = {
      ...campaign,
      usageCount: (campaign.usageCount || 0) + 1,
      conversions: (campaign.conversions || 0) + 1,
      revenue: (campaign.revenue || 0) + revenue,
      updatedAt: new Date().toISOString(),
    };
    
    console.log(`📈 New metrics - Usage: ${updatedCampaign.usageCount}, Revenue: ${updatedCampaign.revenue}, Conversions: ${updatedCampaign.conversions}`);
    
    await withTimeout(kv.set(`campaign:${id}`, updatedCampaign), 5000);
    
    // 🔄 Clear campaigns cache to force refresh
    clearCache("campaigns");
    console.log(`🗑️ Cleared campaigns cache`);
    
    console.log(`✅ Campaign usage incremented successfully!`);
    
    return c.json({ 
      success: true,
      campaign: updatedCampaign
    });
  } catch (error) {
    console.error("❌ Error incrementing campaign usage:", error);
    return c.json({ error: "Failed to increment campaign usage" }, 500);
  }
});

// Get announcement bar settings
app.get("/make-server-16010b6f/announcement", async (c) => {
  try {
    console.log("��� Fetching announcement bar settings...");
    
    const settings = await withTimeout(kv.get("announcement:settings"), 30000);
    
    if (!settings) {
      // Return default settings
      return c.json({
        enabled: false,
        text: "Welcome to SECURE! Free shipping on orders over $50 🚚",
        bgColor: "#1e293b",
        textColor: "#ffffff",
        icon: "megaphone",
        link: ""
      });
    }
    
    return c.json(settings);
  } catch (error) {
    console.error("❌ Error fetching announcement settings:", error);
    return c.json({ error: "Failed to fetch announcement settings" }, 500);
  }
});

// Update announcement bar settings
app.put("/make-server-16010b6f/announcement", async (c) => {
  try {
    const body = await c.req.json();
    
    console.log("📢 Updating announcement bar settings...");
    
    const settings = {
      ...body,
      updatedAt: new Date().toISOString(),
    };
    
    await withTimeout(kv.set("announcement:settings", settings), 30000);
    
    console.log("✅ Announcement bar settings updated");
    
    return c.json({ 
      success: true,
      settings,
      message: "Announcement bar updated successfully"
    });
  } catch (error) {
    console.error("❌ Error updating announcement settings:", error);
    return c.json({ error: "Failed to update announcement settings" }, 500);
  }
});

// ============================================
// APPEARANCE SETTINGS API
// ============================================

// Get appearance settings
app.get("/make-server-16010b6f/appearance-settings", async (c) => {
  try {
    console.log("🎨 Fetching appearance settings...");
    
    // Use retry logic with longer timeout for appearance settings
    const settings = await withRetry(
      () => withTimeout(kv.get("appearance:settings"), 10000),
      3,
      1000
    );
    
    if (!settings) {
      // Return default settings
      return c.json({
        image: null,
        title: "",
        description: "",
      });
    }
    
    return c.json(settings);
  } catch (error) {
    console.error("❌ Error fetching appearance settings:", error);
    
    // Fallback to default settings on error
    return c.json({
      image: null,
      title: "",
      description: "",
    });
  }
});

// Save appearance settings
app.post("/make-server-16010b6f/appearance-settings", async (c) => {
  try {
    const body = await c.req.json();
    
    console.log("🎨 Saving appearance settings...");
    
    const settings = {
      ...body,
      updatedAt: new Date().toISOString(),
    };
    
    // Use retry logic with longer timeout
    await withRetry(
      () => withTimeout(kv.set("appearance:settings", settings), 10000),
      3,
      1000
    );
    
    console.log("✅ Appearance settings saved successfully");
    
    return c.json({ 
      success: true,
      settings,
      message: "Appearance settings saved successfully"
    });
  } catch (error) {
    console.error("❌ Error saving appearance settings:", error);
    return c.json({ error: "Failed to save appearance settings" }, 500);
  }
});

// ============================================
// NOTIFICATIONS API
// ============================================

app.get("/make-server-16010b6f/notifications", async (c) => {
  try {
    console.log("📬 Fetching notifications...");
    
    // Get all notification keys
    const notificationKeys = await withTimeout(kv.getByPrefix("notification:"), 8000);
    
    // Sort by timestamp (newest first)
    const sortedNotifications = notificationKeys
      .map(item => ({
        id: item.key.replace("notification:", ""),
        ...item.value
      }))
      .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
    
    console.log(`✅ Found ${sortedNotifications.length} notifications`);
    
    return c.json({ 
      notifications: sortedNotifications,
      total: sortedNotifications.length 
    });
  } catch (error) {
    console.error("❌ Error fetching notifications:", error);
    return c.json({ notifications: [], total: 0 }, 200);
  }
});

app.post("/make-server-16010b6f/notifications", async (c) => {
  try {
    const body = await c.req.json();
    const id = `notif_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
    
    const notificationData = {
      ...body,
      timestamp: new Date().toISOString(),
      isRead: false,
    };
    
    await withTimeout(kv.set(`notification:${id}`, notificationData), 5000);
    
    console.log(`✅ Notification created: ${id}`);
    return c.json({ success: true, notification: { id, ...notificationData } });
  } catch (error) {
    console.error("❌ Error creating notification:", error);
    return c.json({ error: "Failed to create notification" }, 500);
  }
});

app.put("/make-server-16010b6f/notifications/:id/read", async (c) => {
  try {
    const id = c.req.param("id");
    const notification = await withTimeout(kv.get(`notification:${id}`), 3000);
    
    if (!notification) {
      return c.json({ error: "Notification not found" }, 404);
    }
    
    const updatedNotification = {
      ...notification,
      isRead: true,
    };
    
    await withTimeout(kv.set(`notification:${id}`, updatedNotification), 5000);
    
    console.log(`✅ Notification marked as read: ${id}`);
    return c.json({ success: true, notification: updatedNotification });
  } catch (error) {
    console.error("❌ Error marking notification as read:", error);
    return c.json({ error: "Failed to update notification" }, 500);
  }
});

app.put("/make-server-16010b6f/notifications/mark-all-read", async (c) => {
  try {
    console.log("📬 Marking all notifications as read...");
    
    const notificationKeys = await withTimeout(kv.getByPrefix("notification:"), 8000);
    
    // Update all to read
    const updatePromises = notificationKeys.map(item => {
      const updatedData = { ...item.value, isRead: true };
      return kv.set(item.key, updatedData);
    });
    
    await Promise.all(updatePromises);
    
    console.log(`✅ Marked ${notificationKeys.length} notifications as read`);
    return c.json({ success: true, count: notificationKeys.length });
  } catch (error) {
    console.error("❌ Error marking all as read:", error);
    return c.json({ error: "Failed to mark all as read" }, 500);
  }
});

app.delete("/make-server-16010b6f/notifications/:id", async (c) => {
  try {
    const id = c.req.param("id");
    await withTimeout(kv.del(`notification:${id}`), 5000);
    
    console.log(`✅ Notification deleted: ${id}`);
    return c.json({ success: true });
  } catch (error) {
    console.error("❌ Error deleting notification:", error);
    return c.json({ error: "Failed to delete notification" }, 500);
  }
});

// ============================================
// DASHBOARD STATS ENDPOINT
// ============================================

app.get("/make-server-16010b6f/stats", async (c) => {
  try {
    console.log("📊 Fetching stats...");
    
    const [products, orders, customers] = await Promise.all([
      withTimeout(kv.getByPrefix("product:"), 25000).catch(() => []),
      withTimeout(kv.getByPrefix("order:"), 25000).catch(() => []),
      withTimeout(kv.getByPrefix("customer:"), 25000).catch(() => []),
    ]);

    const validOrders = Array.isArray(orders) ? orders : [];
    const totalRevenue = validOrders
      .filter(order => order?.status !== 'cancelled') // 🔥 Exclude cancelled orders from revenue
      .reduce((sum, order) => {
        const total = order?.total || order?.amount || 0;
        return sum + (typeof total === 'string' ? parseFloat(total.replace('$', '')) : total);
      }, 0);

    const pendingOrders = validOrders.filter(o => o?.status === 'pending').length;
    const completedOrders = validOrders.filter(o => o?.status === 'delivered' || o?.status === 'completed').length;

    console.log("✅ Stats calculated successfully");

    return c.json({
      totalProducts: Array.isArray(products) ? products.length : 0,
      totalOrders: validOrders.length,
      totalCustomers: Array.isArray(customers) ? customers.length : 0,
      totalRevenue: `$${totalRevenue.toFixed(2)}`,
      pendingOrders,
      completedOrders,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("❌ Error fetching stats:", error);
    return c.json({ 
      error: "Failed to fetch stats",
      totalProducts: 0,
      totalOrders: 0,
      totalCustomers: 0,
      totalRevenue: "$0.00",
      pendingOrders: 0,
      completedOrders: 0
    }, 500);
  }
});

// ============================================
// LANDING PAGE STATS ENDPOINT
// ============================================

// Landing page stats endpoint - public stats for visitors
app.get("/make-server-16010b6f/landing-stats", async (c) => {
  try {
    console.log("📊 Fetching landing page stats...");
    
    // Fetch vendors, products, and customers in parallel
    const [vendors, products, customers] = await Promise.all([
      withTimeout(kv.getVendorProfiles(), 25000).catch(() => []),
      withTimeout(kv.getByPrefix("product:"), 25000).catch(() => []),
      withTimeout(kv.getByPrefix("customer:"), 25000).catch(() => []),
    ]);

    // Count active vendors only
    const activeVendors = Array.isArray(vendors) 
      ? vendors.filter(v => v?.status === 'active')
      : [];
    
    // Count all products
    const totalProducts = Array.isArray(products) ? products.length : 0;
    
    // Count all customers
    const totalCustomers = Array.isArray(customers) ? customers.length : 0;

    console.log(`✅ Landing stats: ${activeVendors.length} vendors, ${totalProducts} products, ${totalCustomers} customers`);

    return c.json({
      activeVendors: activeVendors.length,
      totalProducts: totalProducts,
      totalCustomers: totalCustomers,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("❌ Error fetching landing stats:", error);
    return c.json({ 
      error: "Failed to fetch landing stats",
      activeVendors: 0,
      totalProducts: 0,
      totalCustomers: 0,
    }, 500);
  }
});

// ============================================
// FINANCIAL ANALYTICS ENDPOINT
// ============================================

// Base finances endpoint for health check
app.get("/make-server-16010b6f/finances", async (c) => {
  return c.json({ 
    status: "ok",
    message: "Finances endpoint is available",
    endpoints: [
      "/make-server-16010b6f/finances/analytics"
    ]
  });
});

app.get("/make-server-16010b6f/finances/analytics", async (c) => {
  try {
    console.log("💰 Fetching financial analytics...");
    
    // Fetch orders, vendors, and products in parallel
    const [orders, vendors, products] = await Promise.all([
      withTimeout(kv.getByPrefix("order:"), 30000).catch(() => []),
      withTimeout(kv.getVendorProfiles(), 30000).catch(() => []),
      withTimeout(kv.getByPrefix("product:"), 30000).catch(() => []), // 🔥 Fetch products for commission rates
    ]);

    const validOrders = Array.isArray(orders) ? orders : [];
    const validVendors = Array.isArray(vendors) ? vendors : [];
    const validProducts = Array.isArray(products) ? products : [];
    
    // Create vendor lookup map
    const vendorMap = new Map();
    validVendors.forEach(vendor => {
      if (vendor?.id) {
        vendorMap.set(vendor.id, {
          name: vendor.name || vendor.businessName,
          commission: vendor.commission || 15, // Default 15% (fallback only)
          email: vendor.email,
        });
      }
    });
    
    // 🔥 Create product lookup map for commission rates
    const productMap = new Map();
    validProducts.forEach(product => {
      if (product?.id) {
        productMap.set(product.id, {
          name: product.name || product.title,
          commissionRate: product.commissionRate !== undefined ? product.commissionRate : 0, // Product-level commission
        });
      }
    });

    // Calculate financial metrics from orders
    let totalRevenue = 0;
    let totalCommission = 0;
    let totalVendorPayout = 0;
    let pendingPayouts = 0;
    const paymentMethodsMap = new Map();
    const dailyRevenueMap = new Map();
    const vendorPayoutsMap = new Map();
    const transactionsList = [];

    validOrders.forEach(order => {
      if (!order?.id) return;
      
      // 🔥 EXCLUDE CANCELLED ORDERS FROM REVENUE CALCULATIONS
      if (order.status === 'cancelled') {
        return; // Skip cancelled orders entirely
      }

      const orderTotal = typeof order.total === 'string' 
        ? parseFloat(order.total.replace('$', '')) 
        : (order.total || 0);
      
      const vendorInfo = vendorMap.get(order.vendorId || order.vendor) || { 
        name: order.vendor || "Unknown Vendor", 
        commission: 15,
        email: "" 
      };
      
      // 🔥 CALCULATE COMMISSION FROM PRODUCT RATES (not vendor rate)
      let orderCommission = 0;
      
      if (order.items && Array.isArray(order.items) && order.items.length > 0) {
        // Calculate commission per product in the order
        order.items.forEach(item => {
          const productId = item.productId || item.id;
          const productInfo = productMap.get(productId);
          
          if (productInfo && productInfo.commissionRate > 0) {
            // Use product's commission rate
            const itemTotal = (item.price || 0) * (item.quantity || 1);
            const itemCommission = itemTotal * (productInfo.commissionRate / 100);
            orderCommission += itemCommission;
            console.log(`💰 Product "${productInfo.name}" commission: ${productInfo.commissionRate}% of ${itemTotal} = ${itemCommission}`);
          }
        });
      }
      
      // If no product commission calculated (old orders or missing data), fallback to 0
      if (orderCommission === 0) {
        console.log(`⚠️ No product commission for order ${order.orderNumber}, using 0%`);
      }
      
      const commission = orderCommission;
      const vendorPayout = orderTotal - commission;
      
      // Gateway fee (1% for digital payments, 0 for cash)
      const gatewayFee = (order.paymentMethod !== "Cash" && order.paymentMethod !== "COD") 
        ? orderTotal * 0.01 
        : 0;

      // Add to totals
      totalRevenue += orderTotal;
      totalCommission += commission;
      totalVendorPayout += vendorPayout;

      // Track pending payouts (completed/delivered orders)
      if (order.status === 'completed' || order.status === 'delivered') {
        pendingPayouts += vendorPayout;
      }

      // Track payment methods
      const paymentMethod = order.paymentMethod || "Cash";
      const existing = paymentMethodsMap.get(paymentMethod) || { count: 0, amount: 0 };
      paymentMethodsMap.set(paymentMethod, {
        count: existing.count + 1,
        amount: existing.amount + orderTotal,
      });

      // Track daily revenue
      const orderDate = order.date || order.createdAt;
      if (orderDate) {
        const dateKey = new Date(orderDate).toISOString().split('T')[0];
        const existing = dailyRevenueMap.get(dateKey) || { revenue: 0, commission: 0 };
        dailyRevenueMap.set(dateKey, {
          revenue: existing.revenue + orderTotal,
          commission: existing.commission + commission,
        });
      }

      // Track vendor payouts
      const vendorKey = order.vendorId || order.vendor || "Unknown";
      const existingVendor = vendorPayoutsMap.get(vendorKey) || {
        vendor: vendorInfo.name,
        email: vendorInfo.email,
        payout: 0,
        orders: 0,
        status: "pending"
      };
      vendorPayoutsMap.set(vendorKey, {
        ...existingVendor,
        payout: existingVendor.payout + vendorPayout,
        orders: existingVendor.orders + 1,
      });

      // Create transaction record
      transactionsList.push({
        id: order.orderNumber || order.id,
        date: order.date || order.createdAt,
        customer: order.customer || "Guest",
        customerEmail: order.email || "",
        vendor: vendorInfo.name,
        vendorId: order.vendorId || order.vendor,
        amount: orderTotal,
        method: paymentMethod,
        status: order.status === 'delivered' || order.status === 'completed' ? 'completed' : order.status,
        commission: commission,
        vendorPayout: vendorPayout,
        products: order.items || [],
        gatewayFee: gatewayFee,
        shippingAddress: order.shippingAddress || "",
        trackingNumber: order.trackingNumber || "",
      });
    });

    // Convert maps to arrays and sort
    const paymentMethods = Array.from(paymentMethodsMap.entries()).map(([method, data]) => ({
      method,
      transactions: data.count,
      amount: data.amount,
      percentage: totalRevenue > 0 ? (data.amount / totalRevenue * 100) : 0,
    }));

    const revenueChartData = Array.from(dailyRevenueMap.entries())
      .sort((a, b) => new Date(a[0]).getTime() - new Date(b[0]).getTime())
      .slice(-30) // Last 30 days
      .map(([date, data]) => ({
        date: new Date(date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
        revenue: data.revenue,
        commission: data.commission,
      }));

    const vendorPayouts = Array.from(vendorPayoutsMap.entries()).map(([id, data]) => ({
      id,
      ...data,
    }));

    // Sort transactions by date (newest first)
    transactionsList.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

    console.log(`✅ Financial analytics calculated: ${transactionsList.length} transactions`);

    return c.json({
      summary: {
        totalRevenue,
        totalCommission,
        totalVendorPayout,
        pendingPayouts,
      },
      transactions: transactionsList,
      paymentMethods,
      revenueChartData,
      vendorPayouts,
      timestamp: new Date().toISOString(),
    });
  } catch (error: any) {
    console.error("❌ Error fetching financial analytics:", error);
    return c.json({ 
      error: "Failed to fetch financial analytics",
      summary: {
        totalRevenue: 0,
        totalCommission: 0,
        totalVendorPayout: 0,
        pendingPayouts: 0,
      },
      transactions: [],
      paymentMethods: [],
      revenueChartData: [],
      vendorPayouts: [],
    }, 500);
  }
});

// ============================================
// CHAT MESSAGE ENDPOINTS
// ============================================

/** Treat Dicebear / generic avatar URLs as non-final so we can replace with a real profile photo. */
function isPlaceholderAvatarUrl(url: string): boolean {
  const u = (url || "").trim().toLowerCase();
  if (!u.startsWith("http")) return true;
  return (
    u.includes("dicebear.com") ||
    u.includes("ui-avatars.com") ||
    u.includes("robohash.org") ||
    u.includes("avatar.vercel.sh")
  );
}

/** Build email (lowercase) → avatar URL from admin customer records (signed URLs). */
async function buildCustomerEmailToAvatarMap(): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  try {
    const customers = await withTimeout(kv.getByPrefix("customer:"), 12000);
    for (const c of customers || []) {
      if (!c?.email || !c?.avatar) continue;
      const av = String(c.avatar).trim();
      if (av.startsWith("http") && !isPlaceholderAvatarUrl(av)) {
        map.set(String(c.email).toLowerCase().trim(), av);
      }
    }
  } catch (e) {
    console.warn("⚠️ buildCustomerEmailToAvatarMap failed:", e);
  }
  return map;
}

/**
 * Resolve customer profile image: prefer real photos from `user:` KV or `customer:` records.
 * Replaces empty values and placeholder (Dicebear) URLs when a real image exists.
 */
async function resolveCustomerProfileImage(
  email: string,
  existingUrl?: string,
  customerAvatarMap?: Map<string, string>
): Promise<string> {
  const trimmed = (email || "").trim();
  const existing = (existingUrl || "").trim();
  const lower = trimmed.toLowerCase();

  const shouldReplace =
    !existing ||
    !existing.startsWith("http") ||
    isPlaceholderAvatarUrl(existing);

  if (!shouldReplace) return existing;
  if (!trimmed) return existing;

  if (customerAvatarMap?.has(lower)) {
    const fromCustomer = customerAvatarMap.get(lower)!;
    if (fromCustomer.startsWith("http") && !isPlaceholderAvatarUrl(fromCustomer)) {
      return fromCustomer;
    }
  }

  let userRecord: any = null;
  try {
    userRecord = await withTimeout(kv.get(`user:${trimmed}`), 4000);
    if (!userRecord) {
      userRecord = await withTimeout(kv.get(`user:${lower}`), 4000);
    }
  } catch {
    userRecord = null;
  }
  if (userRecord?.profileImage && String(userRecord.profileImage).trim() !== "") {
    const signed = await getSignedImageUrl(String(userRecord.profileImage).trim());
    if (signed) return signed;
  }

  if (!customerAvatarMap) {
    try {
      const customers = await withTimeout(kv.getByPrefix("customer:"), 10000);
      const match = (customers || []).find(
        (c: any) =>
          c?.email &&
          String(c.email).toLowerCase().trim() === lower
      );
      if (match?.avatar) {
        const av = String(match.avatar).trim();
        if (av.startsWith("http") && !isPlaceholderAvatarUrl(av)) return av;
      }
    } catch {
      /* ignore */
    }
  }

  return existing;
}

// Get all chat conversations
app.get("/make-server-16010b6f/chat/conversations", async (c) => {
  try {
    // Increase timeout to 10 seconds and add fallback for large datasets
    let conversations;
    try {
      conversations = await withTimeout(kv.getByPrefix("chat:conversation:"), 10000);
    } catch (timeoutError) {
      console.warn("⚠️ Conversations query timed out, returning empty array for now");
      // Return empty array instead of failing - UI will handle gracefully
      return c.json({ conversations: [], warning: "Conversations loading slowly, please refresh" });
    }

    // Enrich avatars from customer: + user: KV (replaces Dicebear/empty when a real photo exists)
    const customerAvatarMap = await buildCustomerEmailToAvatarMap();
    const enriched = await Promise.all(
      (conversations || []).map(async (conv: any) => {
        if (!conv?.customerEmail) return conv;
        const img = await resolveCustomerProfileImage(
          conv.customerEmail,
          conv.customerProfileImage,
          customerAvatarMap
        );
        if (img && img !== conv.customerProfileImage) {
          const next = { ...conv, customerProfileImage: img };
          try {
            await withTimeout(kv.set(`chat:conversation:${conv.id}`, next), 5000);
          } catch {
            /* non-fatal */
          }
          return next;
        }
        return conv;
      })
    );

    console.log(`📨 Retrieved ${enriched.length} conversations`);
    return c.json({ conversations: enriched });
  } catch (error: any) {
    console.error("❌ Failed to get conversations:", error);
    return c.json({ error: error.message, conversations: [] }, 500);
  }
});

// Get messages for a specific conversation
app.get("/make-server-16010b6f/chat/messages/:conversationId", async (c) => {
  try {
    const conversationId = c.req.param("conversationId");
    
    // Return empty array immediately if query would timeout
    // This allows localStorage to work without blocking
    let messages;
    try {
      messages = await withTimeout(kv.getByPrefix(`chat:message:${conversationId}:`), 8000); // Increased from 5s to 8s
    } catch (timeoutError) {
      console.log(`⚠️ Chat messages query timeout for ${conversationId} - returning empty array`);
      return c.json({ messages: [], cached: false });
    }
    
    console.log(`📨 Retrieved ${messages.length} messages for conversation ${conversationId}`);
    return c.json({ messages });
  } catch (error: any) {
    console.error("❌ Failed to get messages:", error);
    // Return empty array instead of error to allow localStorage fallback
    return c.json({ messages: [], error: error.message }, 200);
  }
});

// Send a new message
app.post("/make-server-16010b6f/chat/messages", async (c) => {
  try {
    const body = await c.req.json();
    const { conversationId, text, sender, senderName, customerEmail, imageUrl, vendorId, customerProfileImage } = body;

    if (!text || !sender || !senderName) {
      return c.json({ error: "Missing required fields" }, 400);
    }

    const messageId = `msg-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
    const timestamp = new Date().toISOString();

    // Store message
    const message = {
      id: messageId,
      conversationId: conversationId || `conv-${customerEmail || Date.now()}`,
      text,
      sender,
      senderName,
      timestamp,
      status: "sent",
      imageUrl: imageUrl || undefined,
    };

    await withTimeout(
      kv.set(`chat:message:${message.conversationId}:${messageId}`, message),
      5000
    );

    // Determine vendor source name
    let vendorSource = "SECURE"; // Default to SECURE main store
    if (vendorId) {
      // Get vendor name from vendors list
      const vendorsData = await withTimeout(kv.get("vendors"), 5000);
      if (vendorsData && Array.isArray(vendorsData)) {
        const vendor = vendorsData.find((v: any) => v.storeSlug === vendorId || v.id === vendorId);
        if (vendor) {
          vendorSource = vendor.businessName || vendor.storeSlug || vendorId;
        } else {
          vendorSource = vendorId; // Use vendorId as fallback
        }
      } else {
        vendorSource = vendorId; // Use vendorId as fallback
      }
    }

    // Preserve customer identity — do not overwrite with admin's senderName ("Admin")
    const existingConv = await withTimeout(
      kv.get(`chat:conversation:${message.conversationId}`),
      5000
    ).catch(() => null) as any;

    const bodyCustomerName = (body as any).customerName as string | undefined;
    const bodyCustomerProfileImage = (body as any).customerProfileImage as string | undefined;

    let resolvedCustomerName = "";
    let resolvedCustomerEmail = (customerEmail || existingConv?.customerEmail || "").trim();
    let resolvedCustomerImage = (customerProfileImage || bodyCustomerProfileImage || existingConv?.customerProfileImage || "").trim();

    if (sender === "customer") {
      resolvedCustomerName = (senderName || existingConv?.customerName || "").trim();
    } else {
      const fromClient = (bodyCustomerName || "").trim();
      const fromExisting = (existingConv?.customerName || "").trim();
      const emailLocal = resolvedCustomerEmail ? resolvedCustomerEmail.split("@")[0] : "";
      if (fromClient && fromClient !== "Admin") {
        resolvedCustomerName = fromClient;
      } else if (fromExisting && fromExisting !== "Admin") {
        resolvedCustomerName = fromExisting;
      } else if (emailLocal) {
        resolvedCustomerName = emailLocal;
      } else {
        resolvedCustomerName = "Customer";
      }
    }

    if (!resolvedCustomerName) {
      resolvedCustomerName = resolvedCustomerEmail ? resolvedCustomerEmail.split("@")[0] : "Customer";
    }

    if (resolvedCustomerEmail) {
      const customerAvatarMap = await buildCustomerEmailToAvatarMap();
      resolvedCustomerImage = await resolveCustomerProfileImage(
        resolvedCustomerEmail,
        resolvedCustomerImage,
        customerAvatarMap
      );
    }

    const prevUnread = Number(existingConv?.unread) || 0;
    const nextUnread =
      sender === "customer"
        ? prevUnread + 1
        : prevUnread;

    // Update or create conversation
    const conversation = {
      id: message.conversationId,
      customerName: resolvedCustomerName,
      customerEmail: resolvedCustomerEmail,
      customerProfileImage: resolvedCustomerImage,
      lastMessage: text,
      timestamp,
      unread: nextUnread,
      status: "online",
      vendorSource: vendorSource, // Add vendor source
      vendorId: vendorId || null // Store vendorId for reference
    };

    await withTimeout(
      kv.set(`chat:conversation:${message.conversationId}`, conversation),
      5000
    );

    console.log(`✅ Message sent: ${messageId} in conversation ${message.conversationId} (source: ${vendorSource})`);
    return c.json({ message, success: true });
  } catch (error: any) {
    console.error("❌ Failed to send message:", error);
    return c.json({ error: error.message, success: false }, 500);
  }
});

// Mark messages as read
app.put("/make-server-16010b6f/chat/messages/:conversationId/read", async (c) => {
  try {
    const conversationId = c.req.param("conversationId");
    
    // Update conversation unread count
    const conversation = await withTimeout(kv.get(`chat:conversation:${conversationId}`), 5000);
    if (conversation) {
      conversation.unread = 0;
      await withTimeout(kv.set(`chat:conversation:${conversationId}`, conversation), 5000);
    }

    console.log(`✅ Marked conversation ${conversationId} as read`);
    return c.json({ success: true });
  } catch (error: any) {
    console.error("❌ Failed to mark as read:", error);
    return c.json({ error: error.message, success: false }, 500);
  }
});

// Upload image for chat
app.post("/make-server-16010b6f/chat/upload-image", async (c) => {
  try {
    console.log("📤 Uploading chat image...");
    
    const body = await c.req.json();
    const { imageData, fileName, conversationId } = body;

    if (!imageData || !fileName) {
      return c.json({ error: "Missing image data or fileName" }, 400);
    }

    const bucketName = "make-16010b6f-chat-images";
    try {
      await ensureBucket(supabase, bucketName, {
        public: false,
        fileSizeLimit: 5242880,
      });
    } catch (bucketErr: any) {
      console.error("❌ Bucket creation error:", bucketErr);
      return c.json({ error: "Failed to create storage bucket" }, 500);
    }

    // Decode base64 and upload
    const base64Data = imageData.split(',')[1] || imageData;
    const buffer = Uint8Array.from(atob(base64Data), c => c.charCodeAt(0));
    
    const filePath = `${conversationId || 'general'}/${Date.now()}-${fileName}`;
    
    const { data: uploadData, error: uploadError } = await supabase.storage
      .from(bucketName)
      .upload(filePath, buffer, {
        contentType: 'image/jpeg',
        cacheControl: '3600',
      });

    if (uploadError) {
      console.error("❌ Upload error:", uploadError);
      return c.json({ error: "Failed to upload image" }, 500);
    }

    // Get signed URL (valid for 1 year)
    const { data: signedUrlData, error: signedUrlError } = await supabase.storage
      .from(bucketName)
      .createSignedUrl(filePath, 31536000); // 1 year

    if (signedUrlError) {
      console.error("❌ Signed URL error:", signedUrlError);
      return c.json({ error: "Failed to generate signed URL" }, 500);
    }

    console.log(`✅ Image uploaded successfully: ${filePath}`);
    return c.json({ 
      success: true, 
      imageUrl: signedUrlData.signedUrl,
      filePath 
    });

  } catch (error: any) {
    console.error("❌ Failed to upload image:", error);
    return c.json({ error: error.message || "Failed to upload image" }, 500);
  }
});

// 🔥 DELETE ALL CHAT CONVERSATIONS AND MESSAGES
app.delete("/make-server-16010b6f/chat/conversations/all", async (c) => {
  try {
    console.log("🗑️ DELETING ALL CHAT CONVERSATIONS AND MESSAGES...");
    
    // Step 1: Get all conversations
    const conversations = await withTimeout(kv.getByPrefix("chat:conversation:"), 15000);
    console.log(`📊 Found ${conversations.length} conversations to delete`);
    
    // Step 2: Get all messages
    const messages = await withTimeout(kv.getByPrefix("chat:message:"), 15000);
    console.log(`📊 Found ${messages.length} messages to delete`);
    
    const deletionPromises: Promise<any>[] = [];
    let conversationCount = 0;
    let messageCount = 0;
    
    // Delete all conversations
    for (const conversation of conversations) {
      if (conversation && conversation.id) {
        const key = `chat:conversation:${conversation.id}`;
        deletionPromises.push(
          withTimeout(kv.del(key), 5000)
            .then(() => {
              conversationCount++;
              console.log(`✅ Deleted conversation: ${conversation.id}`);
            })
            .catch(err => console.error(`❌ Failed to delete conversation ${conversation.id}:`, err))
        );
      }
    }
    
    // Delete all messages
    for (const message of messages) {
      if (message && message.id && message.conversationId) {
        const key = `chat:message:${message.conversationId}:${message.id}`;
        deletionPromises.push(
          withTimeout(kv.del(key), 5000)
            .then(() => {
              messageCount++;
            })
            .catch(err => console.error(`❌ Failed to delete message ${message.id}:`, err))
        );
      }
    }
    
    // Execute all deletions in parallel
    await Promise.allSettled(deletionPromises);
    
    console.log(`✅ CHAT HISTORY DELETION COMPLETE!`);
    console.log(`   - ${conversationCount} conversations deleted`);
    console.log(`   - ${messageCount} messages deleted`);
    
    return c.json({
      success: true,
      message: "All chat history deleted successfully",
      conversationsDeleted: conversationCount,
      messagesDeleted: messageCount,
    });
  } catch (error: any) {
    console.error("❌ Error deleting chat history:", error);
    return c.json({ 
      error: "Failed to delete chat history", 
      details: String(error) 
    }, 500);
  }
});

// ============================================
// VENDOR STOREFRONT ROUTES
// ============================================

// Save vendor storefront settings
app.post("/make-server-16010b6f/vendor/storefront", async (c) => {
  try {
    const body = await c.req.json();
    const { settings } = body;

    if (!settings || !settings.vendorId) {
      return c.json({ error: "Vendor ID is required" }, 400);
    }

    // Store settings in KV store with vendor ID as key
    const key = `vendor_storefront_${settings.vendorId}`;
    await kv.set(key, settings);

    // 🔥 Get vendor's actual businessName for slug mapping
    const vendorData = await kv.get(`vendor:${settings.vendorId}`);
    const vendorBusinessName = vendorData?.businessName || vendorData?.name;

    // 🔥 SYNC LOGO TO VENDOR AVATAR: Update vendor record with new logo
    if (settings.logo && vendorData) {
      const updatedVendor = {
        ...vendorData,
        avatar: settings.logo,
        updatedAt: new Date().toISOString()
      };
      await kv.set(`vendor:${settings.vendorId}`, updatedVendor);
      console.log(`✅ Synced logo to vendor avatar for vendor ${settings.vendorId}`);
      
      // 🔥 INVALIDATE VENDORS CACHE so the updated logo appears immediately
      clearCache("vendors");
      clearCache("vendors_list_v2");
      console.log(`🗑️ Cleared vendors cache after logo sync`);
    }

    // 🔥 AUTO-CREATE SLUG MAPPING with storefront's storeSlug
    const slugKey = `vendor_slug_${settings.storeSlug}`;
    const slugMapping = {
      slug: settings.storeSlug,
      vendorId: settings.vendorId,
      businessName: settings.storeName || "Vendor Store",
      createdAt: new Date().toISOString()
    };
    await kv.set(slugKey, slugMapping);

    // 🔥 ALSO CREATE SLUG MAPPING for vendor's businessName (if different)
    if (vendorBusinessName) {
      const businessNameSlug = vendorBusinessName
        .toLowerCase()
        .replace(/[^a-z0-9\s-]/g, '')
        .replace(/\s+/g, '-')
        .replace(/-+/g, '-')
        .trim();
      
      if (businessNameSlug !== settings.storeSlug) {
        const businessSlugKey = `vendor_slug_${businessNameSlug}`;
        const businessSlugMapping = {
          slug: businessNameSlug,
          vendorId: settings.vendorId,
          businessName: vendorBusinessName,
          createdAt: new Date().toISOString()
        };
        await kv.set(businessSlugKey, businessSlugMapping);
        console.log(`✅ Created additional slug mapping: ${businessNameSlug} → ${settings.vendorId}`);
      }
    }

    console.log(`✅ Vendor storefront settings saved for vendor ${settings.vendorId} with slug: ${settings.storeSlug}`);
    return c.json({ success: true, settings });

  } catch (error: any) {
    console.error("❌ Failed to save vendor storefront settings:", error);
    return c.json({ error: error.message || "Failed to save settings" }, 500);
  }
});

// Get vendor storefront settings by vendor ID
app.get("/make-server-16010b6f/vendor/storefront/:vendorId", async (c) => {
  try {
    const vendorId = c.req.param("vendorId");
    const key = `vendor_storefront_${vendorId}`;
    
    // Get vendor settings
    const settings = await kv.get(key);
    
    // Get vendor data to populate contact fields from application
    const vendor = await kv.get(`vendor:${vendorId}`);
    
    if (!settings) {
      console.log(`⚠️ No settings found for vendor ${vendorId}, returning defaults`);
      // Return default settings if none exist, populated with vendor data if available
      return c.json({ 
        settings: {
          vendorId,
          storeName: vendor?.name || "Vendor Store",
          storeSlug: `vendor-${vendorId}`,
          storeDescription: "Welcome to our store",
          storeTagline: "",
          logo: "",
          banner: "",
          primaryColor: "#1e293b",
          secondaryColor: "#64748b",
          accentColor: "#3b82f6",
          fontFamily: "Inter",
          contactEmail: vendor?.email || "",
          contactPhone: vendor?.phone || "",
          address: vendor?.location || "",
          customDomain: "",
          domainStatus: "none",
          dnsVerified: false,
          socialLinks: {},
          policies: {
            returnPolicy: "We accept returns within 30 days of purchase.",
            shippingPolicy: "We ship within 2-3 business days.",
            privacyPolicy: "We protect your privacy and never share your personal information.",
          },
          isActive: true,
        }
      });
    }

    // Populate empty contact fields from vendor data if they're missing
    const populatedSettings = {
      ...settings,
      contactEmail: settings.contactEmail || vendor?.email || "",
      contactPhone: settings.contactPhone || vendor?.phone || "",
      address: settings.address || vendor?.location || "",
    };

    console.log(`✅ Loaded settings for vendor ${vendorId}, isActive: ${populatedSettings.isActive}`);

    return c.json({ settings: populatedSettings });

  } catch (error: any) {
    console.error("❌ Failed to load vendor storefront settings:", error);
    return c.json({ error: error.message || "Failed to load settings" }, 500);
  }
});

// Verify vendor custom domain
app.post("/make-server-16010b6f/vendor/verify-domain", async (c) => {
  try {
    const body = await c.req.json();
    const { vendorId, domain } = body;

    if (!vendorId || !domain) {
      return c.json({ error: "Vendor ID and domain are required" }, 400);
    }

    console.log(`🔍 Verifying domain ${domain} for vendor ${vendorId}`);

    // Simple domain validation (check format)
    const domainRegex = /^([a-zA-Z0-9]([a-zA-Z0-9\-]{0,61}[a-zA-Z0-9])?\.)+[a-zA-Z]{2,}$/;
    const cleanDomain = domain.replace(/^https?:\/\//, '').replace(/^www\./, '');
    
    if (!domainRegex.test(cleanDomain)) {
      console.log(`❌ Invalid domain format: ${domain}`);
      return c.json({ verified: false, error: "Invalid domain format" }, 400);
    }

    // In a real production environment, you would:
    // 1. Query DNS records to check CNAME/A records
    // 2. Verify SSL certificate
    // 3. Check domain ownership via DNS TXT record
    //
    // For this prototype, we'll simulate verification:
    // - If domain contains certain keywords, auto-verify for demo purposes
    // - Otherwise, return pending status
    
    let verified = false;
    let message = "DNS records not detected. Please ensure you've added the required DNS records.";
    
    // Demo: Auto-verify domains containing "test" or "demo" for prototyping
    if (cleanDomain.includes('test') || cleanDomain.includes('demo') || cleanDomain.includes('localhost')) {
      verified = true;
      message = "Domain verified successfully!";
      console.log(`✅ Auto-verified demo domain: ${cleanDomain}`);
    } else {
      console.log(`⏳ Domain pending verification: ${cleanDomain}`);
    }

    // Store domain verification status
    const key = `vendor_domain_${vendorId}`;
    await kv.set(key, {
      domain: cleanDomain,
      verified,
      verifiedAt: verified ? new Date().toISOString() : null,
      lastChecked: new Date().toISOString()
    });

    return c.json({ 
      verified, 
      message,
      domain: cleanDomain 
    });

  } catch (error: any) {
    console.error("❌ Failed to verify domain:", error);
    return c.json({ error: error.message || "Failed to verify domain" }, 500);
  }
});

// Get all vendor custom domains (admin only)
app.get("/make-server-16010b6f/admin/vendor-domains", async (c) => {
  try {
    console.log("🌐 Fetching all vendor custom domains...");

    // Get all vendors
    const validVendors = await kv.getVendorProfiles();

    // Get all vendor storefront settings
    const allSettings = await kv.getByPrefix("vendor_storefront_");
    const validSettings = Array.isArray(allSettings) ? allSettings.filter(s => s != null) : [];

    // Combine vendor info with domain settings
    const domainsData = validVendors.map((vendor: any) => {
      const settings = validSettings.find((s: any) => s.vendorId === vendor.id);
      
      return {
        vendorId: vendor.id,
        vendorName: vendor.businessName || vendor.name || "Unknown Vendor",
        customDomain: settings?.customDomain || "",
        domainStatus: settings?.domainStatus || "none",
        dnsVerified: settings?.dnsVerified || false,
      };
    });

    console.log(`✅ Found ${domainsData.length} vendors with domain settings`);

    return c.json({ 
      domains: domainsData,
      total: domainsData.length 
    });

  } catch (error: any) {
    console.error("❌ Failed to fetch vendor domains:", error);
    return c.json({ error: error.message || "Failed to fetch vendor domains" }, 500);
  }
});

// 🔥 Get vendor by custom domain (public access for Cloudflare Worker routing)
app.get("/make-server-16010b6f/vendor/by-domain", async (c) => {
  try {
    const domain = c.req.query("domain");
    
    if (!domain) {
      return c.json({ error: "Domain parameter required" }, 400);
    }

    console.log(`🔍 Looking up vendor for domain: ${domain}`);

    // Get all vendor storefront settings
    const allSettings = await kv.getByPrefix("vendor_storefront_");
    const validSettings = Array.isArray(allSettings) ? allSettings.filter(s => s != null) : [];

    // Find vendor with matching custom domain
    const vendorSettings = validSettings.find((s: any) => 
      s.customDomain === domain && 
      s.domainStatus === 'verified' &&
      s.isActive === true
    );

    if (!vendorSettings) {
      console.log(`❌ No verified vendor found for domain: ${domain}`);
      return c.json({ error: "Vendor not found for this domain" }, 404);
    }

    // Get vendor info
    const vendor = await kv.get(`vendor:${vendorSettings.vendorId}`);

    console.log(`✅ Found vendor ${vendorSettings.vendorId} for domain ${domain}`);

    return c.json({
      vendorId: vendorSettings.vendorId,
      storeSlug: vendorSettings.storeSlug,
      storeName: vendorSettings.storeName,
      businessName: vendor?.businessName || vendor?.name
    });

  } catch (error: any) {
    console.error("❌ Error looking up vendor by domain:", error);
    return c.json({ error: error.message || "Failed to lookup vendor" }, 500);
  }
});

// Get vendor storefront by slug (public access)
app.get("/make-server-16010b6f/vendor/store/:storeSlug", async (c) => {
  try {
    const storeSlug = c.req.param("storeSlug");
    console.log(`🏪 Looking up store by slug: ${storeSlug}`);
    
    // Get vendor ID from slug
    const slugKey = `vendor_slug_${storeSlug}`;
    const slugData = await kv.get(slugKey);
    
    if (!slugData || !slugData.vendorId) {
      console.log(`❌ No vendor found for slug: ${storeSlug}`);
      return c.json({ error: "Store not found" }, 404);
    }

    console.log(`✅ Found vendor ${slugData.vendorId} for slug ${storeSlug}`);

    // Get storefront settings
    const settingsKey = `vendor_storefront_${slugData.vendorId}`;
    const settings = await kv.get(settingsKey);

    if (!settings) {
      console.log(`❌ No settings found for vendor ${slugData.vendorId}`);
      return c.json({ error: "Store not configured" }, 404);
    }

    console.log(`✅ Returning settings for vendor ${slugData.vendorId}, isActive: ${settings.isActive}`);
    return c.json({ settings });

  } catch (error: any) {
    console.error("❌ Failed to load vendor store:", error);
    return c.json({ error: error.message || "Failed to load store" }, 500);
  }
});

// Get vendor products (for storefront display)
app.get("/make-server-16010b6f/vendor/products/:vendorId", async (c) => {
  try {
    const vendorIdOrSlug = c.req.param("vendorId");
    
    console.log(`🏪 Fetching products for vendor identifier: ${vendorIdOrSlug}`);
    
    // Try multiple methods to resolve vendor ID:
    // 1. Look up by slug mapping (with underscore format)
    let slugData = await kv.get(`vendor_slug_${vendorIdOrSlug}`);
    
    // 2. If not found, check if this IS the vendor ID directly
    let actualVendorId = slugData?.vendorId;
    
    if (!actualVendorId) {
      // Try to get vendor data directly (maybe vendorIdOrSlug is already the vendor ID)
      const vendorData = await kv.get(`vendor:${vendorIdOrSlug}`);
      if (vendorData) {
        actualVendorId = vendorData.id;
        console.log(`🔍 Found vendor directly by ID: ${actualVendorId}`);
      } else {
        // OPTIMIZATION: Removed expensive vendor scan to prevent database timeouts
        // Slug mapping should have been created during vendor setup
        console.log(`⚠️ No slug mapping found for: ${vendorIdOrSlug}, using as vendor ID`);
        actualVendorId = vendorIdOrSlug;
      }
    }
    
    console.log(`🔍 Resolved vendor ID: ${actualVendorId} (from identifier: ${vendorIdOrSlug})`);
    
    // Get vendor settings to include store name
    const vendorSettings = await kv.get(`vendor_settings:${actualVendorId}`);
    
    // Fallback to vendor's business name if settings don't exist
    const vendorData = await kv.get(`vendor:${actualVendorId}`);
    let storeName = vendorSettings?.storeName || vendorData?.businessName || vendorData?.name || "Vendor Store";
    const vendorBusinessName = vendorData?.businessName || vendorData?.name;
    
    console.log(`🏪 Vendor info - ID: ${actualVendorId}, Name: ${vendorBusinessName}, Store: ${storeName}`);

    const page = Math.max(1, parseInt(c.req.query("page") || "1", 10) || 1);
    const pageSize = Math.min(100, Math.max(1, parseInt(c.req.query("pageSize") || "24", 10) || 24));
    const categoryQ = (c.req.query("category") || "").trim();
    const searchQ = (c.req.query("q") || "").trim();
    const resolveSlugRaw = (c.req.query("resolveSlug") || "").trim();
    const resolveSlug = resolveSlugRaw ? decodeURIComponent(resolveSlugRaw) : null;

    const rpcData = await kv.rpcVendorStorefrontProductsPage({
      vendorId: actualVendorId,
      vendorBusinessName: vendorBusinessName ?? null,
      page,
      pageSize,
      category: categoryQ && categoryQ.toLowerCase() !== "all" ? categoryQ : null,
      q: searchQ || null,
      resolveSlug,
    });

    const storefrontSettings = await kv.get(`vendor_storefront_${actualVendorId}`);
    const logo = storefrontSettings?.logo || vendorData?.avatar || "";

    if (rpcData && Array.isArray(rpcData.products)) {
      const vendorProducts = (rpcData.products as any[]).map(mapVendorStorefrontProductRow);
      return c.json({
        products: vendorProducts,
        storeName,
        logo,
        total: Number(rpcData.total ?? vendorProducts.length),
        page: Number(rpcData.page ?? page),
        pageSize: Number(rpcData.pageSize ?? pageSize),
        hasMore: !!rpcData.hasMore,
      });
    }

    const allProducts = await withRetry(
      () => withTimeout(kv.getByPrefix("product:"), 25000),
      3,
      1000
    );

    const vendorMatches = (p: any) => {
      if (!p) return false;
      let vendorMatch = false;
      if (Array.isArray(p.selectedVendors)) {
        vendorMatch = p.selectedVendors.some(
          (v: string) => v === actualVendorId || (vendorBusinessName && v === vendorBusinessName)
        );
      } else {
        vendorMatch =
          p.vendorId === actualVendorId ||
          p.vendor === actualVendorId ||
          (vendorBusinessName && p.vendor === vendorBusinessName);
      }
      const statusMatch = p.status && String(p.status).toLowerCase() === "active";
      return vendorMatch && statusMatch;
    };

    const slugMatchesProduct = (p: any, slug: string) => {
      const s = slug.toLowerCase();
      const nameSeg = String(p.name || p.title || "")
        .trim()
        .toLowerCase()
        .replace(/[^\w\s-]/g, "")
        .replace(/\s+/g, "-")
        .replace(/-+/g, "-")
        .trim();
      if (String(p.sku || "").toLowerCase() === s || String(p.id || "").toLowerCase() === s) return true;
      if (nameSeg === s) return true;
      if (Array.isArray(p.variants)) {
        return p.variants.some((v: any) => String(v?.sku || "").toLowerCase() === s);
      }
      return false;
    };

    let vendorList = allProducts.filter(vendorMatches);

    if (resolveSlug) {
      vendorList = vendorList.filter((p: any) => slugMatchesProduct(p, resolveSlug)).slice(0, 1);
      const vendorProducts = vendorList.map(mapVendorStorefrontProductRow);
      return c.json({
        products: vendorProducts,
        storeName,
        logo,
        total: vendorProducts.length,
        page: 1,
        pageSize: 1,
        hasMore: false,
      });
    }

    if (categoryQ && categoryQ.toLowerCase() !== "all") {
      const cl = categoryQ.toLowerCase();
      vendorList = vendorList.filter((p: any) => String(p.category || "").toLowerCase() === cl);
    }
    if (searchQ) {
      const sq = searchQ.toLowerCase();
      vendorList = vendorList.filter(
        (p: any) =>
          String(p.name || p.title || "").toLowerCase().includes(sq) ||
          String(p.sku || "").toLowerCase().includes(sq)
      );
    }
    vendorList.sort((a: any, b: any) => {
      const da = String(a.createDate || a.createdAt || "");
      const db = String(b.createDate || b.createdAt || "");
      if (da !== db) return db.localeCompare(da);
      return String(a.name || "").localeCompare(String(b.name || ""));
    });
    const totalLegacy = vendorList.length;
    const slice = vendorList.slice((page - 1) * pageSize, page * pageSize);
    const vendorProducts = slice.map(mapVendorStorefrontProductRow);

    return c.json({
      products: vendorProducts,
      storeName,
      logo,
      total: totalLegacy,
      page,
      pageSize,
      hasMore: page * pageSize < totalLegacy,
    });

  } catch (error: any) {
    console.error("❌ Failed to load vendor products:", error);
    return c.json({ error: error.message || "Failed to load products", products: [] }, 500);
  }
});

// Get ALL vendor products (for admin panel - includes all statuses)
app.get("/make-server-16010b6f/vendor/products-admin/:vendorId", async (c) => {
  try {
    const vendorId = c.req.param("vendorId");
    
    console.log(`🛠️ Fetching ALL products (admin) for vendor: ${vendorId}`);
    
    // 🔥 Get vendor data to match by current name too (in case products have old name)
    const vendorData = await withTimeout(kv.get(`vendor:${vendorId}`), 5000);
    const vendorBusinessName = vendorData?.name || vendorData?.businessName || null;
    console.log(`🏢 Vendor current name: "${vendorBusinessName}"`);
    
    // Get all products from KV store with correct prefix and retry logic
    const allProducts = await withRetry(
      () => withTimeout(kv.getByPrefix("product:"), 30000),
      5,
      1500
    );
    
    console.log(`📦 Total products in database: ${allProducts.length}`);
    console.log(`📋 All products vendor fields:`, allProducts.map((p: any) => ({ 
      sku: p.sku, 
      vendor: p.vendor, 
      vendorId: p.vendorId,
      selectedVendors: p.selectedVendors 
    })));
    
    // Filter products by vendor only (show ALL statuses for admin)
    const vendorProducts = allProducts
      .filter((p: any) => {
        if (!p) return false;
        
        // 🔥 Support multi-vendor products with selectedVendors array (by ID OR name)
        let vendorMatch = false;
        
        if (Array.isArray(p.selectedVendors)) {
          // Check if vendor is in selectedVendors array (by ID or current/old name)
          vendorMatch = p.selectedVendors.some((v: string) => 
            v === vendorId || 
            (vendorBusinessName && v === vendorBusinessName)
          );
        } else {
          // Legacy: Support old single vendor field format (vendor field could be ID or name)
          vendorMatch = 
            p.vendor === vendorId || 
            p.vendorId === vendorId ||
            (vendorBusinessName && p.vendor === vendorBusinessName);
        }
        
        console.log('📦 Product:', p.sku, 'selectedVendors:', p.selectedVendors, 'Looking for ID:', vendorId, 'Looking for Name:', vendorBusinessName, 'Match:', vendorMatch);
        
        return vendorMatch;
      })
      .map((p: any) => ({
        id: p.id,
        name: p.name || p.title,
        sku: p.sku,
        price: parseFloat(String(p.price).replace(/[$,]/g, '')),
        compareAtPrice: p.compareAtPrice ? parseFloat(String(p.compareAtPrice).replace(/[$,]/g, '')) : undefined,
        costPerItem: p.costPerItem ? parseFloat(String(p.costPerItem).replace(/[$,]/g, '')) : undefined,
        description: p.description || "",
        images: p.images || [],
        category: p.category || "Uncategorized",
        inventory: p.inventory || 0,
        status: p.status || "Active",
        hasVariants: p.hasVariants || false,
        variants: p.variants || [],
        variantOptions: p.variantOptions || [],
        tags: p.tags || [],
        productType: p.productType || "",
        weight: p.weight || "",
        barcode: p.barcode || "",
        trackQuantity: p.trackQuantity !== undefined ? p.trackQuantity : true,
        continueSellingOutOfStock: p.continueSellingOutOfStock || false,
        createdAt: p.createdAt,
        updatedAt: p.updatedAt,
        commissionRate: p.commissionRate || 0, // 🔥 Include commission rate
      }));

    console.log(`✅ Found ${vendorProducts.length} products (all statuses) for vendor ${vendorId}`);
    return c.json({ products: vendorProducts });

  } catch (error: any) {
    console.error("❌ Failed to load vendor admin products:", error);
    return c.json({ error: error.message || "Failed to load products", products: [] }, 500);
  }
});

/**
 * Storefront checkout often saves line items with URL slug (e.g. "abc-store") while vendor admin
 * queries with the canonical vendor id (e.g. "vendor_xxx..."). Resolve all identifiers that should match.
 */
async function resolveVendorOrderIdentifierSet(param: string): Promise<Set<string>> {
  const ids = new Set<string>();
  const raw = decodeURIComponent((param || "").trim());
  if (!raw) return ids;
  ids.add(raw);

  let vendor: any = await withTimeout(kv.get(`vendor:${raw}`), 5000).catch(() => null);
  if (vendor?.id) ids.add(String(vendor.id));

  if (!vendor) {
    const slugMap = await withTimeout(kv.get(`vendor_slug_${raw}`), 5000).catch(() => null);
    if (slugMap?.vendorId) {
      ids.add(String(slugMap.vendorId));
      vendor = await withTimeout(kv.get(`vendor:${slugMap.vendorId}`), 5000).catch(() => null);
      if (vendor?.id) ids.add(String(vendor.id));
    }
  }

  const resolvedId = vendor?.id || [...ids].find((x) => String(x).startsWith("vendor_"));
  if (resolvedId) {
    ids.add(String(resolvedId));
    const settings = await withTimeout(kv.get(`vendor_settings:${resolvedId}`), 5000).catch(() => null);
    if (settings?.storeSlug) ids.add(String(settings.storeSlug));
  }

  // Reverse lookup: every vendor_slug_* row that points at this vendor id (covers missing/outdated settings.storeSlug)
  if (resolvedId) {
    try {
      const slugRows = await withTimeout(kv.getByPrefixWithKeys("vendor_slug_"), 10000).catch(() => []);
      for (const row of slugRows) {
        const vid = row.value?.vendorId;
        if (vid != null && String(vid) === String(resolvedId)) {
          const slug = row.key.replace(/^vendor_slug_/, "");
          if (slug) ids.add(slug);
        }
      }
    } catch {
      /* ignore */
    }
  }

  if (vendor?.storeSlug) ids.add(String(vendor.storeSlug));
  if (vendor?.name) ids.add(String(vendor.name));
  if (vendor?.businessName) ids.add(String(vendor.businessName));

  return ids;
}

/** KV sometimes stores items as JSON string or legacy object map — normalize to an array. */
function normalizeOrderItems(raw: unknown): any[] {
  if (raw == null) return [];
  if (Array.isArray(raw)) return raw;
  if (typeof raw === "string") {
    try {
      const p = JSON.parse(raw);
      return Array.isArray(p) ? p : [];
    } catch {
      return [];
    }
  }
  if (typeof raw === "object") {
    const vals = Object.values(raw as Record<string, unknown>);
    if (vals.length > 0 && vals.every((v) => v != null && typeof v === "object")) {
      return vals as any[];
    }
  }
  return [];
}

/** Prefer `items`, then alternate keys used by older clients or other checkouts. */
function orderLineItemsFromOrder(order: any): any[] {
  if (!order || typeof order !== "object") return [];
  for (const key of ["items", "lineItems", "line_items", "products", "cartItems"]) {
    const arr = normalizeOrderItems((order as any)[key]);
    if (arr.length > 0) return arr;
  }
  return [];
}

function vendorIdentifiersHas(vendorIds: Set<string>, candidate: unknown): boolean {
  if (candidate == null) return false;
  const c = String(candidate).trim();
  if (!c) return false;
  for (const id of vendorIds) {
    const s = String(id).trim();
    if (s === c) return true;
    if (s.toLowerCase() === c.toLowerCase()) return true;
  }
  return false;
}

function orderLineItemMatchesVendor(item: any, vendorIds: Set<string>): boolean {
  const candidates = [
    item.vendorId,
    item.vendor,
    item.vendorName,
    item.vendor_id,
    item.sellerId,
    item.product?.vendorId,
    item.product?.vendor,
    Array.isArray(item.product?.selectedVendors) ? item.product.selectedVendors[0] : undefined,
  ].filter((x) => x != null && String(x).trim() !== "");
  for (const c of candidates) {
    if (vendorIdentifiersHas(vendorIds, c)) return true;
  }
  return false;
}

async function enrichLineItemsWithProductVendors(
  items: any[],
  productCache: Map<string, any>
): Promise<any[]> {
  const out: any[] = [];
  for (const raw of items) {
    const item = raw && typeof raw === "object" ? { ...raw } : raw;
    if (!item || typeof item !== "object") {
      out.push(item);
      continue;
    }
    const hasLineVendor = [item.vendorId, item.vendor, item.vendorName].some(
      (x) => x != null && String(x).trim() !== ""
    );
    const pid = item.productId ?? item.id;
    if (hasLineVendor || !pid) {
      out.push(item);
      continue;
    }
    const pk = String(pid);
    if (!productCache.has(pk)) {
      const p = await withTimeout(kv.get(`product:${pk}`), 3000).catch(() => null);
      productCache.set(pk, p);
    }
    const p = productCache.get(pk);
    if (p && typeof p === "object") {
      const vid = p.vendorId ?? (Array.isArray(p.selectedVendors) && p.selectedVendors.length ? p.selectedVendors[0] : undefined);
      if (vid != null && String(vid).trim() !== "") {
        (item as any).vendorId = (item as any).vendorId ?? vid;
        (item as any).vendor = (item as any).vendor ?? vid;
      }
    }
    out.push(item);
  }
  return out;
}

// Get vendor-specific orders (for vendor admin portal)
app.get("/make-server-16010b6f/vendor/orders/:vendorId", async (c) => {
  try {
    const vendorId = c.req.param("vendorId");
    console.log(`📦 Fetching orders for vendor: ${vendorId}`);

    const vendorIdentifiers = await resolveVendorOrderIdentifierSet(vendorId);
    console.log(`📦 Resolved vendor id aliases for orders filter (${vendorIdentifiers.size}):`, [...vendorIdentifiers]);
    
    // Get all orders - kv.getByPrefix already has 30s timeout, no need to wrap
    const allOrders = await withRetry(
      () => kv.getByPrefix("order:"),
      2, // Reduced retries since kv has its own timeout
      2000
    );
    
    console.log(`📊 Total orders in database: ${allOrders.length}`);
    
    const productCache = new Map<string, any>();
    const vendorOrders: any[] = [];

    for (const order of allOrders) {
      if (!order) continue;

      let normalizedItems = orderLineItemsFromOrder(order);
      normalizedItems = await enrichLineItemsWithProductVendors(normalizedItems, productCache);

      let passes = false;
      if (normalizedItems.length > 0) {
        passes = normalizedItems.some((item: any) => orderLineItemMatchesVendor(item, vendorIdentifiers));
      }
      if (!passes) {
        const top = [order.vendor, order.vendorName, order.vendorId].filter(
          (x) => x != null && String(x).trim() !== ""
        );
        passes = top.some((v) => vendorIdentifiersHas(vendorIdentifiers, v));
      }
      if (!passes) continue;

      let vendorItems = normalizedItems.filter((item: any) =>
        orderLineItemMatchesVendor(item, vendorIdentifiers)
      );
      if (vendorItems.length === 0 && normalizedItems.length > 0) {
        const topMatch = [order.vendor, order.vendorName, order.vendorId].filter(
          (x) => x != null && String(x).trim() !== ""
        );
        if (topMatch.some((v) => vendorIdentifiersHas(vendorIdentifiers, v))) {
          vendorItems = normalizedItems;
        }
      }

      const parsedOrderTotal =
        typeof order.total === "string" ? parseFloat(order.total) : Number(order.total ?? 0);

      let vendorLinesSubtotal = vendorItems.reduce((sum: number, item: any) => {
        const itemPrice = typeof item.price === "number" ? item.price : parseFloat(String(item.price || "0").replace("$", "")) || 0;
        const itemQuantity = item.quantity || 1;
        return sum + itemPrice * itemQuantity;
      }, 0);

      if (
        vendorLinesSubtotal === 0 &&
        vendorItems.length > 0 &&
        Number.isFinite(parsedOrderTotal) &&
        parsedOrderTotal > 0
      ) {
        vendorLinesSubtotal = parsedOrderTotal;
      }

      const parsedSubtotal =
        order.subtotal != null
          ? typeof order.subtotal === "string"
            ? parseFloat(order.subtotal)
            : Number(order.subtotal)
          : vendorLinesSubtotal;
      const parsedDiscount =
        order.discount != null
          ? typeof order.discount === "string"
            ? parseFloat(order.discount)
            : Number(order.discount)
          : 0;

      const orderSubtotalNum = Number.isFinite(parsedSubtotal) ? parsedSubtotal : vendorLinesSubtotal;
      const orderDiscountNum = Number.isFinite(parsedDiscount) ? parsedDiscount : 0;

      /** This vendor's lines are the entire order — use stored grand total (includes discount + shipping). */
      const vendorCoversWholeOrder =
        normalizedItems.length > 0 && vendorItems.length === normalizedItems.length;

      let vendorDisplayTotal: number;
      if (
        vendorCoversWholeOrder &&
        Number.isFinite(parsedOrderTotal) &&
        parsedOrderTotal >= 0
      ) {
        vendorDisplayTotal = parsedOrderTotal;
      } else if (orderSubtotalNum > 0 && orderDiscountNum > 0 && vendorLinesSubtotal > 0) {
        const discountShare = (orderDiscountNum * vendorLinesSubtotal) / orderSubtotalNum;
        vendorDisplayTotal = Math.max(
          0,
          Math.round((vendorLinesSubtotal - discountShare) * 100) / 100
        );
      } else {
        vendorDisplayTotal = vendorLinesSubtotal;
      }

      vendorOrders.push({
        id: order.id,
        orderNumber: order.orderNumber,
        customer: order.customer || order.customerName,
        customerName: order.customerName || order.customer,
        email: order.email,
        phone: order.phone,
        status: order.status || "pending",
        paymentStatus: order.paymentStatus || "pending",
        paymentMethod: order.paymentMethod || "",
        total: vendorDisplayTotal,
        subtotal: Number.isFinite(parsedSubtotal) ? parsedSubtotal : vendorLinesSubtotal,
        discount: Number.isFinite(parsedDiscount) ? parsedDiscount : 0,
        date: order.date || order.createdAt,
        createdAt: order.createdAt,
        items: vendorItems,
        shippingAddress: order.shippingAddress || "",
        trackingNumber: order.trackingNumber || "",
        notes: order.notes || "",
        deliveryService: order.deliveryService || "",
        deliveryServiceLogo: order.deliveryServiceLogo || "",
      });
    }
    
    console.log(`✅ Found ${vendorOrders.length} orders for vendor ${vendorId}`);
    return c.json({ 
      orders: vendorOrders,
      total: vendorOrders.length 
    });

  } catch (error: any) {
    console.error("❌ Failed to load vendor orders:", error);
    return c.json({ 
      error: error.message || "Failed to load orders", 
      orders: [],
      total: 0 
    }, 500);
  }
});

/**
 * Track a global customer account as belonging to this vendor's audience (login/register on vendor storefront).
 * KV: vendor:audience:{vendorId} → array of { email, userId, name, phone, avatar, firstSeenAt, lastSeenAt, lastEvent }
 */
app.post("/make-server-16010b6f/vendor/audience/:vendorId/track", async (c) => {
  try {
    const vendorId = c.req.param("vendorId");
    const body = await c.req.json();
    const { email, userId, name, phone, avatar, event } = body as Record<string, string | undefined>;

    if (!email || typeof email !== "string" || !email.trim()) {
      return c.json({ error: "email is required" }, 400);
    }

    const vendor = await withTimeout(kv.get(`vendor:${vendorId}`), 5000).catch(() => null);
    if (!vendor) {
      return c.json({ error: "Vendor not found" }, 404);
    }

    const normEmail = email.trim().toLowerCase();
    const storageKey = `vendor:audience:${vendorId}`;
    let list: any[] = (await withTimeout(kv.get(storageKey), 5000).catch(() => [])) || [];
    if (!Array.isArray(list)) list = [];

    const now = new Date().toISOString();
    const idx = list.findIndex((r: any) => (r?.email || "").toLowerCase() === normEmail);
    const lastEvent = event === "register" ? "register" : "login";

    const nextRecord = {
      email: normEmail,
      userId: userId || (idx >= 0 ? list[idx].userId : undefined),
      name: name || (idx >= 0 ? list[idx].name : undefined),
      phone: phone || (idx >= 0 ? list[idx].phone : undefined),
      avatar: avatar || (idx >= 0 ? list[idx].avatar : undefined),
      firstSeenAt: idx >= 0 ? list[idx].firstSeenAt || now : now,
      lastSeenAt: now,
      lastEvent,
    };

    if (idx >= 0) list[idx] = { ...list[idx], ...nextRecord };
    else list.push(nextRecord);

    await withTimeout(kv.set(storageKey, list), 5000);
    return c.json({ success: true });
  } catch (error: any) {
    console.error("❌ vendor audience track:", error);
    return c.json({ error: error.message || "Failed to track" }, 500);
  }
});

/**
 * Vendor admin: customers who registered/logged in on this storefront OR placed an order with this vendor.
 */
app.get("/make-server-16010b6f/vendor/audience/:vendorId", async (c) => {
  try {
    const vendorId = c.req.param("vendorId");

    const vendorIdentifiers = await resolveVendorOrderIdentifierSet(vendorId);
    const canonicalVendorId =
      [...vendorIdentifiers].find((x) => String(x).startsWith("vendor_")) || vendorId;

    const vendor = await withTimeout(kv.get(`vendor:${canonicalVendorId}`), 5000).catch(() => null);
    if (!vendor) {
      return c.json({ error: "Vendor not found", customers: [] }, 404);
    }

    const vid = String(vendor.id || canonicalVendorId);
    const storageKey = `vendor:audience:${vid}`;
    let audience: any[] = (await withTimeout(kv.get(storageKey), 5000).catch(() => [])) || [];
    if (!Array.isArray(audience)) audience = [];

    const settings = await withTimeout(kv.get(`vendor_settings:${vid}`), 5000).catch(() => null);
    const storeSlug =
      settings?.storeSlug != null && String(settings.storeSlug).trim() !== ""
        ? String(settings.storeSlug).trim()
        : "";
    if (storeSlug && storeSlug !== vid) {
      const altKey = `vendor:audience:${storeSlug}`;
      const extra = (await withTimeout(kv.get(altKey), 5000).catch(() => [])) || [];
      if (Array.isArray(extra) && extra.length) {
        const seen = new Set(audience.map((r: any) => String(r?.email || "").toLowerCase()));
        for (const row of extra) {
          const em = String(row?.email || "")
            .trim()
            .toLowerCase();
          if (em && !seen.has(em)) {
            seen.add(em);
            audience.push(row);
          }
        }
      }
    }

    const allOrders = await withRetry(
      () => kv.getByPrefix("order:"),
      2,
      2000
    );

    const vendorOrders = (allOrders || []).filter((order: any) => {
      if (!order || !order.items) return false;
      return order.items.some((item: any) => orderLineItemMatchesVendor(item, vendorIdentifiers));
    });

    type Agg = {
      email: string;
      name: string;
      orderCount: number;
      totalSpent: number;
    };
    const byEmail = new Map<string, Agg>();

    for (const order of vendorOrders) {
      const raw =
        order.email ||
        order.customerEmail ||
        (typeof order.customer === "object" && order.customer?.email) ||
        "";
      const em = String(raw).trim().toLowerCase();
      if (!em) continue;

      const custName =
        order.customerName ||
        order.customer ||
        (typeof order.customer === "object" ? order.customer?.name || order.customer?.fullName : "") ||
        em.split("@")[0];

      const vendorItems = order.items.filter((item: any) =>
        orderLineItemMatchesVendor(item, vendorIdentifiers)
      );
      const vendorTotal = vendorItems.reduce((sum: number, item: any) => {
        const itemPrice =
          typeof item.price === "number"
            ? item.price
            : parseFloat(String(item.price || "0").replace("$", "")) || 0;
        return sum + itemPrice * (item.quantity || 1);
      }, 0);

      const prev = byEmail.get(em);
      if (prev) {
        prev.orderCount += 1;
        prev.totalSpent += vendorTotal;
        if (!prev.name && custName) prev.name = String(custName);
      } else {
        byEmail.set(em, {
          email: em,
          name: String(custName || em.split("@")[0]),
          orderCount: 1,
          totalSpent: vendorTotal,
        });
      }
    }

    const audienceByEmail = new Map<string, any>();
    for (const row of audience) {
      if (!row?.email) continue;
      audienceByEmail.set(String(row.email).toLowerCase().trim(), row);
    }

    const allEmails = new Set<string>([...byEmail.keys(), ...audienceByEmail.keys()]);

    const customers = [...allEmails].map((em) => {
      const ord = byEmail.get(em);
      const aud = audienceByEmail.get(em);
      const name =
        aud?.name ||
        ord?.name ||
        em.split("@")[0];
      const totalOrders = ord?.orderCount || 0;
      const totalSpent = ord?.totalSpent || 0;
      const avgOrder = totalOrders > 0 ? totalSpent / totalOrders : 0;

      let segment = "New";
      if (totalOrders >= 3 || totalSpent >= 500000) segment = "Champions";
      else if (totalOrders > 0) segment = "Active";

      const tags: string[] = [];
      if (aud) tags.push("Storefront");
      if (totalOrders > 0) tags.push("Purchased");

      const id = aud?.userId || `email:${em}`;

      return {
        id,
        name,
        email: em,
        phone: aud?.phone || "",
        role: "customer" as const,
        status: "active" as const,
        avatar: aud?.avatar || undefined,
        joinedDate: aud?.firstSeenAt || new Date().toISOString(),
        totalOrders,
        totalSpent,
        avgOrder,
        segment,
        tags,
        isNew: totalOrders === 0 && !!aud,
      };
    });

    customers.sort((a, b) => (b.totalSpent || 0) - (a.totalSpent || 0));

    return c.json({ success: true, customers, total: customers.length });
  } catch (error: any) {
    console.error("❌ vendor audience get:", error);
    return c.json(
      { error: error.message || "Failed to load customers", customers: [], total: 0 },
      500
    );
  }
});

// ============================================
// CATEGORIES ENDPOINTS
// ============================================

// Get all categories for a vendor
app.get("/make-server-16010b6f/vendor/categories/:vendorId", async (c) => {
  try {
    const vendorId = c.req.param("vendorId");
    console.log(`📁 Getting categories for vendor: ${vendorId}`);
    
    const allCategories = await withRetry(
      () => withTimeout(kv.getByPrefix(`category:${vendorId}:`), 15000),
      5,
      1000
    );
    const categoryList = allCategories.map((cat: any) => cat.name);
    
    console.log(`✅ Found ${categoryList.length} categories for vendor ${vendorId}`);
    return c.json({ categories: categoryList });

  } catch (error: any) {
    console.error("❌ Failed to load categories:", error);
    // Return default categories on error
    return c.json({ categories: ["Electronics", "Clothing", "Home & Garden", "Books", "Sports", "Toys"] });
  }
});

// Get category details with product count
app.get("/make-server-16010b6f/vendor/categories-details/:vendorId", async (c) => {
  try {
    const vendorId = c.req.param("vendorId");
    console.log(`📁 Getting category details for vendor: ${vendorId}`);
    
    // Get all categories and products with retry logic
    const [allCategories, allProducts] = await Promise.all([
      withRetry(
        () => withTimeout(kv.getByPrefix(`category:${vendorId}:`), 30000),
        5,
        1500
      ),
      withRetry(
        () => withTimeout(kv.getByPrefix("product:"), 30000),
        5,
        1500
      )
    ]);
    
    // Filter products by vendor (support both vendor name and vendorId for compatibility)
    const vendorProducts = allProducts.filter((p: any) => {
      if (!p) return false;
      return p.vendor === vendorId || p.vendorId === vendorId;
    });
    
    // Count products per category and include product details
    const categoriesWithCount = allCategories.map((cat: any) => {
      const productsInCategory = vendorProducts.filter((p: any) => p.category === cat.name);
      // Extract product IDs from products in category
      const productIds = productsInCategory.map((p: any) => p.id);
      
      return {
        ...cat,
        productCount: productsInCategory.length,
        productIds: cat.productIds || productIds, // Use stored IDs or compute from products
        products: productsInCategory.map((p: any) => ({
          id: p.id,
          name: p.name,
          sku: p.sku,
          price: p.price,
          image: p.image,
          status: p.status,
          inventory: p.inventory
        }))
      };
    });
    
    console.log(`✅ Found ${categoriesWithCount.length} categories with product counts`);
    console.log(`📊 Total products for vendor ${vendorId}: ${vendorProducts.length}`);
    console.log(`📦 Category breakdown:`, categoriesWithCount.map(c => ({ name: c.name, count: c.productCount })));
    return c.json({ categories: categoriesWithCount });

  } catch (error: any) {
    console.error("❌ Failed to load category details:", error);
    return c.json({ error: error.message || "Failed to load category details", categories: [] }, 500);
  }
});

// Create a new category
app.post("/make-server-16010b6f/vendor/categories", async (c) => {
  try {
    const { vendorId, name, description, coverPhoto, status, productIds } = await c.req.json();
    
    console.log(`📁 Creating category for vendor ${vendorId}: ${name}`);
    
    const categoryId = `category:${vendorId}:${Date.now()}`;
    const category = {
      id: categoryId,
      name,
      description: description || "",
      coverPhoto: coverPhoto || "",
      status: status || "active",
      productIds: productIds || [],
      productCount: (productIds || []).length,
      vendorId,
      createdAt: new Date().toISOString().split('T')[0],
      updatedAt: new Date().toISOString()
    };
    
    await kv.set(categoryId, category);
    
    console.log(`✅ Category created: ${categoryId}`);
    return c.json({ success: true, category });

  } catch (error: any) {
    console.error("❌ Failed to create category:", error);
    return c.json({ error: error.message || "Failed to create category" }, 500);
  }
});

// Update a category
app.put("/make-server-16010b6f/vendor/categories/:categoryId", async (c) => {
  try {
    const categoryId = c.req.param("categoryId");
    const { name, description, coverPhoto, status, productIds, vendorId } = await c.req.json();
    
    console.log(`📁 Updating category: ${categoryId}`);
    
    const existingCategory = await kv.get(categoryId);
    if (!existingCategory) {
      return c.json({ error: "Category not found" }, 404);
    }
    
    const updatedCategory = {
      ...existingCategory,
      name,
      description: description || "",
      coverPhoto: coverPhoto !== undefined ? coverPhoto : existingCategory.coverPhoto,
      status: status || existingCategory.status || "active",
      productIds: productIds !== undefined ? productIds : (existingCategory.productIds || []),
      productCount: productIds !== undefined ? productIds.length : (existingCategory.productIds || []).length,
      updatedAt: new Date().toISOString()
    };
    
    await kv.set(categoryId, updatedCategory);
    
    console.log(`✅ Category updated: ${categoryId}`);
    return c.json({ success: true, category: updatedCategory });

  } catch (error: any) {
    console.error("❌ Failed to update category:", error);
    return c.json({ error: error.message || "Failed to update category" }, 500);
  }
});

// Delete a category
app.delete("/make-server-16010b6f/vendor/categories/:categoryId", async (c) => {
  try {
    const categoryId = c.req.param("categoryId");
    
    console.log(`📁 Deleting category: ${categoryId}`);
    
    const category = await kv.get(categoryId);
    if (!category) {
      return c.json({ error: "Category not found" }, 404);
    }
    
    // Check if any products use this category
    const allProducts = await kv.getByPrefix("product:");
    const productsInCategory = allProducts.filter((p: any) => p.category === category.name);
    
    if (productsInCategory.length > 0) {
      return c.json({ 
        error: `Cannot delete category with ${productsInCategory.length} products. Please move or delete products first.` 
      }, 400);
    }
    
    await kv.del(categoryId);
    
    console.log(`✅ Category deleted: ${categoryId}`);
    return c.json({ success: true });

  } catch (error: any) {
    console.error("❌ Failed to delete category:", error);
    return c.json({ error: error.message || "Failed to delete category" }, 500);
  }
});

// ============================================
// DISCOUNT CODES ENDPOINTS
// ============================================

// Get all discounts for a vendor
app.get("/make-server-16010b6f/vendor/discounts/:vendorId", async (c) => {
  try {
    const vendorId = c.req.param("vendorId");
    console.log(`🏷️ Getting discounts for vendor: ${vendorId}`);
    
    const allDiscounts = await withTimeout(kv.getByPrefix("discount:"), 5000);
    const vendorDiscounts = allDiscounts.filter((d: any) => d.vendorId === vendorId);
    
    // Check expiry dates
    const now = new Date();
    const discountsWithStatus = vendorDiscounts.map((discount: any) => {
      if (discount.endDate && new Date(discount.endDate) < now && discount.status !== "expired") {
        return { ...discount, status: "expired" };
      }
      return discount;
    });
    
    return c.json({ discounts: discountsWithStatus });
  } catch (error) {
    console.error("�� Error fetching discounts:", error);
    return c.json({ error: "Failed to fetch discounts" }, 500);
  }
});

// Create a new discount code
app.post("/make-server-16010b6f/discounts", async (c) => {
  try {
    const discountData = await c.req.json();
    console.log(`🏷️ Creating discount code: ${discountData.code}`);
    
    // Check if code already exists
    const allDiscounts = await withTimeout(kv.getByPrefix("discount:"), 5000);
    const existingCode = allDiscounts.find((d: any) => 
      d.code.toLowerCase() === discountData.code.toLowerCase()
    );
    
    if (existingCode) {
      return c.json({ error: "Discount code already exists", message: "This code is already in use" }, 400);
    }
    
    const discountId = `discount-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
    const discount = {
      id: discountId,
      ...discountData,
      createdAt: new Date().toISOString(),
    };
    
    await withTimeout(kv.set(`discount:${discountId}`, discount), 5000);
    
    return c.json({ success: true, discount });
  } catch (error) {
    console.error("❌ Error creating discount:", error);
    return c.json({ error: "Failed to create discount" }, 500);
  }
});

// Update a discount code
app.put("/make-server-16010b6f/discounts/:id", async (c) => {
  try {
    const discountId = c.req.param("id");
    const updates = await c.req.json();
    console.log(`🏷️ Updating discount: ${discountId}`);
    
    const existing = await withTimeout(kv.get(`discount:${discountId}`), 5000);
    if (!existing) {
      return c.json({ error: "Discount not found" }, 404);
    }
    
    // If code is being changed, check uniqueness
    if (updates.code && updates.code !== existing.code) {
      const allDiscounts = await withTimeout(kv.getByPrefix("discount:"), 5000);
      const codeExists = allDiscounts.find((d: any) => 
        d.code.toLowerCase() === updates.code.toLowerCase() && d.id !== discountId
      );
      
      if (codeExists) {
        return c.json({ error: "Discount code already exists" }, 400);
      }
    }
    
    const updated = {
      ...existing,
      ...updates,
      id: discountId, // Ensure ID doesn't change
      updatedAt: new Date().toISOString(),
    };
    
    await withTimeout(kv.set(`discount:${discountId}`, updated), 5000);
    
    return c.json({ success: true, discount: updated });
  } catch (error) {
    console.error("❌ Error updating discount:", error);
    return c.json({ error: "Failed to update discount" }, 500);
  }
});

// Delete a discount code
app.delete("/make-server-16010b6f/discounts/:id", async (c) => {
  try {
    const discountId = c.req.param("id");
    console.log(`🏷️ Deleting discount: ${discountId}`);
    
    await withTimeout(kv.del(`discount:${discountId}`), 5000);
    
    return c.json({ success: true });
  } catch (error) {
    console.error("❌ Error deleting discount:", error);
    return c.json({ error: "Failed to delete discount" }, 500);
  }
});

// Validate and apply a discount code
app.post("/make-server-16010b6f/discounts/validate", async (c) => {
  try {
    const { code, orderTotal, vendorId, productIds } = await c.req.json();
    console.log(`🏷️ Validating discount code: ${code}`);
    
    const allDiscounts = await withTimeout(kv.getByPrefix("discount:"), 5000);
    const discount = allDiscounts.find((d: any) => 
      d.code.toLowerCase() === code.toLowerCase() && 
      d.vendorId === vendorId
    );
    
    if (!discount) {
      return c.json({ valid: false, error: "Invalid discount code" }, 400);
    }
    
    // Check if active
    if (discount.status !== "active") {
      return c.json({ valid: false, error: "This discount code is not active" }, 400);
    }
    
    // Check date range
    const now = new Date();
    if (discount.startDate && new Date(discount.startDate) > now) {
      return c.json({ valid: false, error: "This discount code is not yet valid" }, 400);
    }
    if (discount.endDate && new Date(discount.endDate) < now) {
      return c.json({ valid: false, error: "This discount code has expired" }, 400);
    }
    
    // Check usage limit
    if (discount.maxUses && discount.usedCount >= discount.maxUses) {
      return c.json({ valid: false, error: "This discount code has reached its usage limit" }, 400);
    }
    
    // Check minimum order amount
    if (discount.minOrderAmount && orderTotal < discount.minOrderAmount) {
      return c.json({ 
        valid: false, 
        error: `Minimum order amount of $${discount.minOrderAmount} required` 
      }, 400);
    }
    
    // Calculate discount amount
    let discountAmount = 0;
    if (discount.type === "percentage") {
      discountAmount = (orderTotal * discount.value) / 100;
    } else if (discount.type === "fixed_amount") {
      discountAmount = discount.value;
    }
    
    return c.json({ 
      valid: true, 
      discount: {
        id: discount.id,
        code: discount.code,
        type: discount.type,
        value: discount.value,
        discountAmount,
      }
    });
  } catch (error) {
    console.error("❌ Error validating discount:", error);
    return c.json({ error: "Failed to validate discount" }, 500);
  }
});

// Increment usage count for a discount
app.post("/make-server-16010b6f/discounts/:id/use", async (c) => {
  try {
    const discountId = c.req.param("id");
    console.log(`🏷️ Incrementing usage for discount: ${discountId}`);
    
    const discount = await withTimeout(kv.get(`discount:${discountId}`), 5000);
    if (!discount) {
      return c.json({ error: "Discount not found" }, 404);
    }
    
    const updated = {
      ...discount,
      usedCount: (discount.usedCount || 0) + 1,
      updatedAt: new Date().toISOString(),
    };
    
    await withTimeout(kv.set(`discount:${discountId}`, updated), 5000);
    
    return c.json({ success: true, discount: updated });
  } catch (error) {
    console.error("❌ Error updating discount usage:", error);
    return c.json({ error: "Failed to update discount usage" }, 500);
  }
});

// 404 handler
app.notFound((c) => {
  console.log(`⚠️ 404 Not Found: ${c.req.url}`);
  return c.json({ error: "Not found", path: c.req.url }, 404);
});

// ============================================
// DASHBOARD STATS ENDPOINT
// ============================================

app.get("/make-server-16010b6f/dashboard/stats", async (c) => {
  try {
    console.log("📊 Fetching dashboard stats...");
    
    // Get filter parameters from query
    const revenueFilter = c.req.query("revenueFilter") || "Last 30 days";
    const ordersFilter = c.req.query("ordersFilter") || "Last 30 days";
    const customersFilter = c.req.query("customersFilter") || "Last 30 days";
    const productsFilter = c.req.query("productsFilter") || "Last 30 days";
    const forceRefresh = c.req.query("forceRefresh") === "true"; // Allow manual cache bypass
    
    console.log("🔍 Filters:", { revenueFilter, ordersFilter, customersFilter, productsFilter, forceRefresh });
    
    // 🚀 CHECK CACHE FIRST
    const cacheKey = getDashboardCacheKey({ revenueFilter, ordersFilter, customersFilter, productsFilter });
    const cachedEntry = dashboardStatsCache.get(cacheKey);
    
    if (!forceRefresh && cachedEntry && isCacheValid(cachedEntry.timestamp)) {
      const cacheAge = Math.round((Date.now() - cachedEntry.timestamp) / 1000);
      console.log(`⚡ CACHE HIT! Returning cached dashboard stats (age: ${cacheAge}s, TTL: ${DASHBOARD_CACHE_TTL / 1000}s)`);
      console.log(`📊 Saved database queries by using cache!`);
      return c.json({
        ...cachedEntry.data,
        cached: true,
        cacheAge,
      });
    }
    
    console.log(`🔄 CACHE MISS or FORCE REFRESH - Fetching fresh data from database...`);
    
    // Helper function to get date range based on filter
    const getDateRange = (filter: string) => {
      const now = new Date();
      let startDate: Date;
      let compareStartDate: Date;
      let compareEndDate: Date;
      
      switch (filter) {
        case "Last 7 days":
          startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
          compareStartDate = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);
          compareEndDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
          break;
        case "Last 30 days":
          startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
          compareStartDate = new Date(now.getTime() - 60 * 24 * 60 * 60 * 1000);
          compareEndDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
          break;
        case "Last 3 months":
          startDate = new Date(now.getFullYear(), now.getMonth() - 3, now.getDate());
          compareStartDate = new Date(now.getFullYear(), now.getMonth() - 6, now.getDate());
          compareEndDate = new Date(now.getFullYear(), now.getMonth() - 3, now.getDate());
          break;
        case "Last 6 months":
          startDate = new Date(now.getFullYear(), now.getMonth() - 6, now.getDate());
          compareStartDate = new Date(now.getFullYear(), now.getMonth() - 12, now.getDate());
          compareEndDate = new Date(now.getFullYear(), now.getMonth() - 6, now.getDate());
          break;
        case "Last year":
          startDate = new Date(now.getFullYear() - 1, now.getMonth(), now.getDate());
          compareStartDate = new Date(now.getFullYear() - 2, now.getMonth(), now.getDate());
          compareEndDate = new Date(now.getFullYear() - 1, now.getMonth(), now.getDate());
          break;
        case "All time":
          startDate = new Date(0); // Beginning of time
          compareStartDate = new Date(0);
          compareEndDate = new Date(0);
          break;
        default:
          startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
          compareStartDate = new Date(now.getTime() - 60 * 24 * 60 * 60 * 1000);
          compareEndDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      }
      
      return { startDate, endDate: now, compareStartDate, compareEndDate };
    };
    
    // Fetch all data in parallel - kv.getByPrefix already has 30s timeout
    const startTime = Date.now();
    const [ordersData, productsData, usersData] = await Promise.all([
      withRetry(() => kv.getByPrefix("order:"), 2, 2000).catch(() => []),
      withRetry(() => kv.getByPrefix("product:"), 2, 2000).catch(() => []),
      withRetry(() => kv.getByPrefix("user:"), 2, 2000).catch(() => []),
    ]);
    const fetchTime = Date.now() - startTime;
    
    const orders = Array.isArray(ordersData) ? ordersData.filter(o => o != null) : [];
    const products = Array.isArray(productsData) ? productsData.filter(p => p != null) : [];
    const users = Array.isArray(usersData) ? usersData.filter(u => u != null) : [];
    
    console.log(`📊 Data fetched in ${fetchTime}ms: ${orders.length} orders, ${products.length} products, ${users.length} users`);
    
    // ============================================
    // REVENUE CALCULATION
    // ============================================
    const revenueRange = getDateRange(revenueFilter);
    const currentPeriodOrders = orders.filter(order => {
      const orderDate = new Date(order.date || order.createdAt);
      return orderDate >= revenueRange.startDate && orderDate <= revenueRange.endDate;
    });
    
    const comparePeriodOrders = revenueFilter !== "All time" ? orders.filter(order => {
      const orderDate = new Date(order.date || order.createdAt);
      return orderDate >= revenueRange.compareStartDate && orderDate < revenueRange.compareEndDate;
    }) : [];
    
    const currentPeriodRevenue = currentPeriodOrders.reduce((sum, order) => {
      const total = typeof order.total === 'number' ? order.total : parseFloat(order.total) || 0;
      return sum + total;
    }, 0);
    
    const comparePeriodRevenue = comparePeriodOrders.reduce((sum, order) => {
      const total = typeof order.total === 'number' ? order.total : parseFloat(order.total) || 0;
      return sum + total;
    }, 0);
    
    const revenueChange = comparePeriodRevenue > 0 
      ? ((currentPeriodRevenue - comparePeriodRevenue) / comparePeriodRevenue * 100)
      : 0;
    
    // ============================================
    // ORDERS CALCULATION
    // ============================================
    const ordersRange = getDateRange(ordersFilter);
    const currentOrdersPeriod = orders.filter(order => {
      const orderDate = new Date(order.date || order.createdAt);
      return orderDate >= ordersRange.startDate && orderDate <= ordersRange.endDate;
    });
    
    const compareOrdersPeriod = ordersFilter !== "All time" ? orders.filter(order => {
      const orderDate = new Date(order.date || order.createdAt);
      return orderDate >= ordersRange.compareStartDate && orderDate < ordersRange.compareEndDate;
    }) : [];
    
    const ordersChange = compareOrdersPeriod.length > 0
      ? ((currentOrdersPeriod.length - compareOrdersPeriod.length) / compareOrdersPeriod.length * 100)
      : 0;
    
    // ============================================
    // CUSTOMERS CALCULATION
    // ============================================
    const customersRange = getDateRange(customersFilter);
    const currentCustomersPeriod = users.filter(user => {
      const createdDate = new Date(user.createdAt);
      return createdDate >= customersRange.startDate && createdDate <= customersRange.endDate;
    });
    
    const compareCustomersPeriod = customersFilter !== "All time" ? users.filter(user => {
      const createdDate = new Date(user.createdAt);
      return createdDate >= customersRange.compareStartDate && createdDate < customersRange.compareEndDate;
    }) : [];
    
    const customersChange = compareCustomersPeriod.length > 0
      ? ((currentCustomersPeriod.length - compareCustomersPeriod.length) / compareCustomersPeriod.length * 100)
      : 0;
    
    // ============================================
    // PRODUCTS CALCULATION
    // ============================================
    const productsRange = getDateRange(productsFilter);
    const currentProductsPeriod = products.filter(product => {
      const createdDate = new Date(product.createdAt || product.createDate);
      return createdDate >= productsRange.startDate && createdDate <= productsRange.endDate;
    });
    
    const compareProductsPeriod = productsFilter !== "All time" ? products.filter(product => {
      const createdDate = new Date(product.createdAt || product.createDate);
      return createdDate >= productsRange.compareStartDate && createdDate < productsRange.compareEndDate;
    }) : [];
    
    const productsChange = compareProductsPeriod.length > 0
      ? ((currentProductsPeriod.length - compareProductsPeriod.length) / compareProductsPeriod.length * 100)
      : 0;
    
    // ============================================
    // SALES TREND DATA (Last 7 months)
    // ============================================
    const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    const now = new Date();
    const salesTrend = [];
    
    for (let i = 6; i >= 0; i--) {
      const monthDate = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const monthStart = new Date(monthDate.getFullYear(), monthDate.getMonth(), 1);
      const monthEnd = new Date(monthDate.getFullYear(), monthDate.getMonth() + 1, 0, 23, 59, 59);
      
      const monthOrders = orders.filter(order => {
        const orderDate = new Date(order.date || order.createdAt);
        return orderDate >= monthStart && orderDate <= monthEnd;
      });
      
      const monthRevenue = monthOrders.reduce((sum, order) => {
        const total = typeof order.total === 'number' ? order.total : parseFloat(order.total) || 0;
        return sum + total;
      }, 0);
      
      salesTrend.push({
        name: monthNames[monthDate.getMonth()],
        sales: Math.round(monthRevenue),
        orders: monthOrders.length
      });
    }
    
    // ============================================
    // TOP PRODUCTS (based on revenue filter period)
    // ============================================
    // Count sales per product from filtered orders
    const productSalesMap = new Map();
    
    currentPeriodOrders.forEach(order => {
      if (order.items && Array.isArray(order.items)) {
        order.items.forEach((item: any) => {
          const productId = item.productId || item.id;
          if (productId) {
            const existing = productSalesMap.get(productId) || {
              count: 0,
              revenue: 0,
              name: item.name || item.title || "Unknown Product"
            };
            existing.count += item.quantity || 1;
            
            // Try to get price from item, then fall back to product's actual price
            let itemPrice = item.price || item.salePrice || item.originalPrice || 0;
            if (itemPrice === 0) {
              // If item doesn't have a price, try to find the product
              const product = products.find((p: any) => p.id === productId);
              if (product) {
                // Parse price from product (it might be a string like "15000" or "15000 MMK")
                let productPrice = product.price || product.salePrice || product.originalPrice || 0;
                if (typeof productPrice === 'string') {
                  // Remove any non-numeric characters except decimal point
                  productPrice = parseFloat(productPrice.replace(/[^0-9.]/g, '')) || 0;
                }
                itemPrice = productPrice;
              }
            } else if (typeof itemPrice === 'string') {
              // Parse if itemPrice is a string
              itemPrice = parseFloat(itemPrice.replace(/[^0-9.]/g, '')) || 0;
            }
            
            existing.revenue += itemPrice * (item.quantity || 1);
            productSalesMap.set(productId, existing);
          }
        });
      }
    });
    
    // Sort by sales count and get top 4
    const topProducts = Array.from(productSalesMap.entries())
      .map(([productId, data]) => ({
        productId,
        name: data.name,
        sales: data.count,
        revenue: data.revenue
      }))
      .sort((a, b) => b.sales - a.sales)
      .slice(0, 4)
      .map(product => ({
        name: product.name,
        sales: product.sales,
        revenue: Math.round(product.revenue)
      }));
    
    // ============================================
    // RECENT ORDERS (Last 5)
    // ============================================
    const recentOrders = orders
      .sort((a, b) => {
        const dateA = new Date(a.date || a.createdAt).getTime();
        const dateB = new Date(b.date || b.createdAt).getTime();
        return dateB - dateA; // Most recent first
      })
      .slice(0, 5)
      .map(order => {
        const firstItem = order.items?.[0];
        return {
          id: order.orderNumber || order.id,
          customer: order.customer || "Unknown Customer",
          product: firstItem?.name || firstItem?.title || "Multiple Items",
          amount: typeof order.total === 'number' ? order.total : parseFloat(order.total) || 0,
          status: order.status || "pending"
        };
      });
    
    const stats = {
      totalRevenue: currentPeriodRevenue,
      totalOrders: currentOrdersPeriod.length,
      totalCustomers: customersFilter === "All time" ? users.length : currentCustomersPeriod.length,
      totalProducts: productsFilter === "All time" ? products.length : currentProductsPeriod.length,
      revenueChange: parseFloat(revenueChange.toFixed(1)),
      ordersChange: parseFloat(ordersChange.toFixed(1)),
      customersChange: parseFloat(customersChange.toFixed(1)),
      productsChange: parseFloat(productsChange.toFixed(1)),
      salesTrend,
      topProducts,
      recentOrders,
      lastUpdated: new Date().toISOString(),
    };
    
    console.log("📊 Dashboard stats:", {
      ...stats,
      salesTrendLength: salesTrend.length,
      topProductsLength: topProducts.length,
      recentOrdersLength: recentOrders.length
    });
    
    // 🚀 STORE IN CACHE for next request
    dashboardStatsCache.set(cacheKey, {
      data: stats,
      timestamp: Date.now(),
    });
    console.log(`💾 Cached dashboard stats for key: ${cacheKey}`);
    
    return c.json({
      ...stats,
      cached: false,
    });
  } catch (error) {
    console.error("❌ Error fetching dashboard stats:", error);
    return c.json({ 
      error: "Failed to fetch dashboard stats",
      details: String(error)
    }, 500);
  }
});

// ============================================
// INVENTORY MANAGEMENT ENDPOINTS
// ============================================

// Get all inventory items
app.get("/make-server-16010b6f/inventory", async (c) => {
  try {
    console.log("📦 [INVENTORY] Starting inventory fetch...");
    
    // Get all products from database
    console.log("📦 [INVENTORY] Fetching products with prefix: 'product:'");
    const allProducts = await kv.getByPrefix("product:");
    
    console.log(`📦 [INVENTORY] Raw fetch result:`, {
      isArray: Array.isArray(allProducts),
      length: allProducts?.length || 0,
      type: typeof allProducts
    });
    
    if (!allProducts || allProducts.length === 0) {
      console.log("⚠️ [INVENTORY] No products found in database!");
      console.log("⚠️ [INVENTORY] This means either:");
      console.log("   1. No products have been created yet");
      console.log("   2. Products are stored with a different key prefix");
      
      // Try to fetch without prefix to debug
      try {
        const allKeys = await kv.getByPrefix("");
        console.log(`🔍 [INVENTORY] Found ${allKeys?.length || 0} total keys in database`);
        if (allKeys && allKeys.length > 0) {
          console.log(`🔍 [INVENTORY] Sample keys:`, allKeys.slice(0, 5).map((k: any) => k.id || 'unknown'));
        }
      } catch (debugError) {
        console.log("🔍 [INVENTORY] Debug fetch failed:", debugError);
      }
      
      return c.json({ 
        success: true,
        inventory: [],
        message: "No products found. Please create products first in the Products section."
      });
    }
    
    console.log(`✅ [INVENTORY] Found ${allProducts.length} products in database`);
    console.log(`📋 [INVENTORY] First product sample:`, {
      id: allProducts[0]?.id,
      name: allProducts[0]?.name || allProducts[0]?.title,
      sku: allProducts[0]?.sku,
      hasVariants: allProducts[0]?.hasVariants,
      variantCount: allProducts[0]?.variants?.length || 0,
      inventory: allProducts[0]?.inventory
    });
    
    // Convert products AND variants to inventory items
    const inventory: any[] = [];
    
    allProducts.forEach((product: any, index: number) => {
      console.log(`🔄 [INVENTORY] Processing product ${index + 1}/${allProducts.length}: ${product.name || product.title}`);
      
      // Calculate inventory metrics
      const inventoryQty = product.inventory || 0;
      const committed = Math.floor(inventoryQty * 0.05); // 5% committed (simulated)
      const available = inventoryQty - committed;
      const reorderPoint = 50; // Default reorder point
      
      // Determine location based on vendor or default
      const location = product.vendor ? `Vendor: ${product.vendor}` : "Warehouse A";
      
      // Get product image
      const image = product.images && product.images.length > 0 
        ? product.images[0] 
        : product.image || "https://images.unsplash.com/photo-1505740420928-5e560c06d30e?w=100&h=100&fit=crop";
      
      // Add main product
      inventory.push({
        id: product.id,
        product: product.name || product.title,
        sku: product.sku,
        image: image,
        available: available,
        committed: committed,
        onHand: inventoryQty,
        reorderPoint: reorderPoint,
        location: location,
        vendorId: product.vendor,
        createdAt: product.createdAt,
        updatedAt: product.updatedAt,
        isVariant: false,
      });
      
      console.log(`   ✅ Added main product: ${product.sku}`);
      
      // Add variants if they exist
      if (product.hasVariants && product.variants && Array.isArray(product.variants)) {
        console.log(`   🎨 Product has ${product.variants.length} variants`);
        
        product.variants.forEach((variant: any, vIndex: number) => {
          const variantInventory = variant.inventory || 0;
          const variantCommitted = Math.floor(variantInventory * 0.05);
          const variantAvailable = variantInventory - variantCommitted;
          
          // Build variant name from options
          const variantName = variant.name || 
            (variant.options ? Object.values(variant.options).join(' / ') : `Variant ${vIndex + 1}`);
          
          inventory.push({
            id: variant.id,
            product: `${product.name || product.title} - ${variantName}`,
            sku: variant.sku,
            image: variant.image || image,
            available: variantAvailable,
            committed: variantCommitted,
            onHand: variantInventory,
            reorderPoint: reorderPoint,
            location: location,
            vendorId: product.vendor,
            createdAt: product.createdAt,
            updatedAt: product.updatedAt,
            isVariant: true,
            parentId: product.id,
            parentName: product.name || product.title,
          });
          
          console.log(`      ✅ Added variant: ${variant.sku} (${variantName})`);
        });
      } else {
        console.log(`   ℹ️ Product has no variants`);
      }
    });
    
    console.log(`✅ [INVENTORY] Conversion complete!`);
    console.log(`✅ [INVENTORY] Total: ${allProducts.length} products → ${inventory.length} inventory items`);
    
    return c.json({ 
      success: true,
      inventory: inventory,
      totalProducts: allProducts.length,
      totalItems: inventory.length
    });
  } catch (error: any) {
    console.error("❌ [INVENTORY] Failed to load inventory:", error);
    console.error("❌ [INVENTORY] Error stack:", error.stack);
    return c.json({ 
      error: error.message || "Failed to load inventory",
      inventory: [],
      details: String(error)
    }, 500);
  }
});

// Get inventory for specific vendor
app.get("/make-server-16010b6f/inventory/:vendorId", async (c) => {
  try {
    const vendorId = c.req.param("vendorId");
    console.log(`📦 Getting inventory for vendor: ${vendorId}`);
    
    const allInventory = await kv.getByPrefix("inventory:");
    const vendorInventory = allInventory.filter((item: any) => item.vendorId === vendorId);
    
    console.log(`✅ Found ${vendorInventory.length} inventory items for vendor ${vendorId}`);
    return c.json({ inventory: vendorInventory });
  } catch (error: any) {
    console.error("❌ Failed to load vendor inventory:", error);
    return c.json({ 
      error: error.message || "Failed to load vendor inventory",
      inventory: [] 
    }, 500);
  }
});

// Adjust single inventory item
app.post("/make-server-16010b6f/inventory/adjust", async (c) => {
  try {
    const { itemId, adjustmentQty, newSku, reason } = await c.req.json();
    
    console.log(`📦 [INVENTORY ADJUST] Starting adjustment for: ${itemId} by ${adjustmentQty}`);
    
    // Try to find the product - itemId could be a product ID or variant ID
    // First, try as a product key
    let product = await kv.get(`product:${itemId}`);
    let isVariant = false;
    let variantId = null;
    
    // If not found, search all products for this variant ID
    if (!product) {
      console.log(`🔍 Item not found as product, searching variants...`);
      const allProducts = await kv.getByPrefix("product:");
      
      for (const p of allProducts) {
        if (p && p.variants && Array.isArray(p.variants)) {
          const variant = p.variants.find((v: any) => v.id === itemId);
          if (variant) {
            product = p;
            isVariant = true;
            variantId = itemId;
            console.log(`✅ Found as variant in product: ${p.id}`);
            break;
          }
        }
      }
    }
    
    if (!product) {
      console.error(`❌ Product/variant not found: ${itemId}`);
      return c.json({ error: "Product not found" }, 404);
    }
    
    const adjustment = parseInt(adjustmentQty || "0");
    
    if (isVariant) {
      // Update variant inventory
      const variantIndex = product.variants.findIndex((v: any) => v.id === variantId);
      if (variantIndex === -1) {
        return c.json({ error: "Variant not found" }, 404);
      }
      
      const variant = product.variants[variantIndex];
      const currentInventory = variant.inventory || 0;
      const newInventory = currentInventory + adjustment;
      
      if (newInventory < 0) {
        return c.json({ error: "Cannot reduce inventory below zero" }, 400);
      }
      
      // Update the variant
      product.variants[variantIndex] = {
        ...variant,
        inventory: newInventory,
        updatedAt: new Date().toISOString(),
      };
      
      product.updatedAt = new Date().toISOString();
      
      // Save the updated product (with updated variant)
      await kv.set(`product:${product.id}`, product);
      
      console.log(`✅ Variant inventory adjusted: ${variant.name || variant.sku} (${currentInventory} → ${newInventory})`);
      return c.json({ success: true, product, variant: product.variants[variantIndex] });
      
    } else {
      // Update main product inventory
      const currentInventory = product.inventory || 0;
      const newInventory = currentInventory + adjustment;
      
      if (newInventory < 0) {
        return c.json({ error: "Cannot reduce inventory below zero" }, 400);
      }
      
      // Update product with new inventory
      const updatedProduct = {
        ...product,
        inventory: newInventory,
        sku: newSku || product.sku,
        updatedAt: new Date().toISOString(),
        lastAdjustment: {
          quantity: adjustment,
          reason: reason || "Manual adjustment",
          timestamp: new Date().toISOString(),
        }
      };
      
      await kv.set(`product:${product.id}`, updatedProduct);
      
      console.log(`✅ Product inventory adjusted: ${product.name} (${currentInventory} → ${newInventory})`);
      return c.json({ success: true, product: updatedProduct });
    }
  } catch (error: any) {
    console.error("❌ Failed to adjust inventory:", error);
    return c.json({ 
      error: error.message || "Failed to adjust inventory"
    }, 500);
  }
});

// Bulk adjust inventory
app.post("/make-server-16010b6f/inventory/bulk-adjust", async (c) => {
  try {
    const { itemIds, adjustmentQty, reason } = await c.req.json();
    
    console.log(`📦 Bulk adjusting inventory for ${itemIds.length} products by ${adjustmentQty}`);
    
    const adjustment = parseInt(adjustmentQty || "0");
    const updatedProducts = [];
    
    for (const itemId of itemIds) {
      const product = await kv.get(itemId);
      if (product) {
        const currentInventory = product.inventory || 0;
        const newInventory = currentInventory + adjustment;
        
        if (newInventory >= 0) {
          const updatedProduct = {
            ...product,
            inventory: newInventory,
            updatedAt: new Date().toISOString(),
            lastAdjustment: {
              quantity: adjustment,
              reason: reason || "Bulk adjustment",
              timestamp: new Date().toISOString(),
            }
          };
          
          await kv.set(itemId, updatedProduct);
          updatedProducts.push(updatedProduct);
        }
      }
    }
    
    console.log(`✅ Bulk adjusted ${updatedProducts.length} products`);
    return c.json({ success: true, count: updatedProducts.length });
  } catch (error: any) {
    console.error("❌ Failed to bulk adjust inventory:", error);
    return c.json({ 
      error: error.message || "Failed to bulk adjust inventory"
    }, 500);
  }
});

// Create/Update inventory item
app.post("/make-server-16010b6f/inventory", async (c) => {
  try {
    const inventoryData = await c.req.json();
    
    console.log(`📦 Creating/updating inventory item: ${inventoryData.product}`);
    
    const itemId = inventoryData.id || `inventory:${inventoryData.vendorId}:${Date.now()}`;
    const item = {
      id: itemId,
      product: inventoryData.product,
      sku: inventoryData.sku,
      image: inventoryData.image || "",
      available: inventoryData.available || 0,
      committed: inventoryData.committed || 0,
      onHand: inventoryData.onHand || 0,
      reorderPoint: inventoryData.reorderPoint || 0,
      location: inventoryData.location || "Warehouse A",
      vendorId: inventoryData.vendorId || "all",
      createdAt: inventoryData.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    
    await kv.set(itemId, item);
    
    console.log(`✅ Inventory item saved: ${itemId}`);
    return c.json({ success: true, item });
  } catch (error: any) {
    console.error("❌ Failed to save inventory item:", error);
    return c.json({ 
      error: error.message || "Failed to save inventory item"
    }, 500);
  }
});

// Delete inventory item
app.delete("/make-server-16010b6f/inventory/:itemId", async (c) => {
  try {
    const itemId = c.req.param("itemId");
    
    console.log(`📦 Deleting inventory item: ${itemId}`);
    
    await kv.del(itemId);
    
    console.log(`✅ Inventory item deleted: ${itemId}`);
    return c.json({ success: true });
  } catch (error: any) {
    console.error("❌ Failed to delete inventory item:", error);
    return c.json({ 
      error: error.message || "Failed to delete inventory item"
    }, 500);
  }
});

// 🔧 ADMIN: Fix/create slug mappings for all existing vendors
app.post("/make-server-16010b6f/admin/fix-vendor-slugs", async (c) => {
  try {
    console.log("🔧 Starting vendor slug fix...");
    
    // Get all vendors (excludes vendor:audience:*)
    const validVendors = (await kv.getVendorProfiles()).filter((v: any) => v && v.id);
    
    console.log(`Found ${validVendors.length} vendors to process`);
    
    const results = [];
    
    for (const vendor of validVendors) {
      try {
        const businessName = vendor.businessName || vendor.name || "Vendor Store";
        const businessNameSlug = businessName
          .toLowerCase()
          .replace(/[^a-z0-9\s-]/g, '')
          .replace(/\s+/g, '-')
          .replace(/-+/g, '-')
          .trim();
        
        // Create slug mapping for businessName
        const slugMapping = {
          slug: businessNameSlug,
          vendorId: vendor.id,
          businessName: businessName,
          createdAt: new Date().toISOString()
        };
        
        await kv.set(`vendor_slug_${businessNameSlug}`, slugMapping);
        
        results.push({
          vendorId: vendor.id,
          businessName,
          slug: businessNameSlug,
          status: "created"
        });
        
        console.log(`✅ Created slug mapping: ${businessNameSlug} → ${vendor.id}`);
      } catch (error) {
        console.error(`❌ Failed to process vendor ${vendor.id}:`, error);
        results.push({
          vendorId: vendor.id,
          status: "failed",
          error: String(error)
        });
      }
    }
    
    console.log(`✅ Slug fix complete: ${results.length} processed`);
    
    return c.json({
      success: true,
      processed: results.length,
      results
    });
  } catch (error) {
    console.error("❌ Failed to fix vendor slugs:", error);
    return c.json({ error: String(error) }, 500);
  }
});

console.log("🚀 Starting SECURE server...");

// Wrap fetch handler with comprehensive error suppression at Deno.serve level
Deno.serve({
  handler: async (req) => {
    try {
      const response = await app.fetch(req);
      
      // Try to return the response, but catch HTTP errors during response sending
      try {
        return response;
      } catch (httpError: any) {
        const errorMsg = String(httpError?.message || "").toLowerCase();
        const errorName = String(httpError?.name || "").toLowerCase();
        
        // Suppress HTTP runtime errors when trying to send response
        if (errorName === "http" || 
            errorMsg.includes("connection") ||
            errorMsg.includes("closed") ||
            errorMsg.includes("message completed")) {
          // Connection already closed, can't send response
          return new Response(null);
        }
        throw httpError;
      }
    } catch (error: any) {
      const errorMsg = String(error?.message || "").toLowerCase();
      const errorName = String(error?.name || "").toLowerCase();
      
      // Silently handle ALL connection errors
      if (errorName === "http" || 
          error?.code === "EPIPE" ||
          error?.code === "ECONNRESET" ||
          errorMsg.includes("connection") ||
          errorMsg.includes("message") ||
          errorMsg.includes("completed") ||
          errorMsg.includes("closed") ||
          errorMsg.includes("pipe") ||
          errorMsg.includes("broken") ||
          errorMsg.includes("reset")) {
        // Don't log these - they're expected
        try {
          return new Response(null, { status: 499 });
        } catch {
          return new Response(null);
        }
      }
      
      // Log actual server errors
      console.error("❌ Unhandled server error:", error?.message || error);
      
      // Try to return error response
      try {
        return new Response(
          JSON.stringify({ 
            error: "Internal server error",
            message: String(error?.message || error)
          }),
          {
            status: 500,
            headers: { "Content-Type": "application/json" }
          }
        );
      } catch (responseError) {
        console.warn("⚠️ Could not send error response (connection lost)");
        try {
          return new Response(null, { status: 499 });
        } catch {
          return new Response(null);
        }
      }
    }
  },
  onError: (error) => {
    // Catch errors at the Deno.serve level (lowest/runtime level)
    const errorMsg = String(error?.message || "").toLowerCase();
    const errorName = String(error?.name || "").toLowerCase();
    
    // Suppress ALL HTTP connection errors at runtime level
    if (errorName === "http" || 
        errorMsg.includes("connection") ||
        errorMsg.includes("closed") ||
        errorMsg.includes("message") ||
        errorMsg.includes("completed") ||
        errorMsg.includes("pipe") ||
        errorMsg.includes("reset")) {
      // Silently ignore - client disconnections are normal
      return new Response(null);
    }
    
    // Log other errors
    console.error("❌ Deno.serve onError:", error);
    return new Response("Internal Server Error", { status: 500 });
  }
});