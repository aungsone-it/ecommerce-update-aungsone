import { Hono } from "npm:hono@4";
import { cors } from "npm:hono/cors";
import * as kv from "./kv_store.tsx";
import { createClient } from "jsr:@supabase/supabase-js@2.49.8";
import authApp from "./auth_routes.tsx";
import blogEngagementApp from "./blog_engagement_routes.tsx";
import customerApp from "./customer_routes.tsx";
import userApp from "./user_routes.tsx";
import socialProfileApp from "./social_profile_routes.tsx";
import { createPaymentIntent, verifyPayment } from "./stripe_routes.tsx";
import {
  createKPayQr,
  getKPayStatus,
  handleKPayWebhook,
  startKPayPwa,
  handleKPayPwaReturn,
  getPwaCheckoutDraftRoute,
  postPwaFinalizeRoute,
  getOrphanedPwaDraftsRoute,
  getPwaDraftStatusRoute,
  postPwaReconcileRoute,
  enqueueKPayRefundAndPatchOrder,
  syncOrderRefundFromTxn,
  syncOrderRefundForResolved,
  getKPayResolvedUrlsRoute,
  getKPayResolvedEndpointUrls,
} from "./kpay_routes.tsx";
import { ensureBucket } from "./storage_bucket_helpers.tsx";
import {
  collectProductImageRefs,
  deleteOwnedStorageRefs,
  refsRemovedSinceUpdate,
} from "./storage_delete_helpers.tsx";
import { appendStaffActivity, isStaffAuditActor, isValidStaffActorId } from "./staff_activity_helpers.tsx";
import {
  assertAdminMonitoringAllowed,
  assertDestructiveOperationAllowed,
} from "./admin_operation_guard.tsx";
import { hashPasswordPlain, verifyPasswordPlain, isPasswordHashFormat } from "./password_crypto.tsx";
import { applyNormalizedShippingToOrderBody } from "./order_shipping.ts";
import {
  mergeMetaCapiAccessTokenOnSave,
  queueMetaCapiPurchaseFromOrder,
  sanitizeMetaCapiForAdminResponse,
  stripMetaCapiFromPublicSettings,
} from "./meta_capi.tsx";
import {
  queueCustomerReadModelDelete,
  queueCustomerReadModelSync,
  queueOrderReadModelDelete,
  queueOrderReadModelSync,
  queueProductReadModelDelete,
  queueProductReadModelSync,
  queueVendorReadModelDelete,
  queueVendorReadModelSync,
  findProductIdFromReadModelSkuOrVariant,
  findVendorReadModelByEmailNorm,
} from "./read_model.ts";

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

type RouteMetric = {
  count: number;
  errors: number;
  timeouts: number;
  totalMs: number;
  maxMs: number;
  lastStatus: number;
  lastMs: number;
  lastAt: string;
};

const edgeStartedAt = new Date().toISOString();
const routeMetrics = new Map<string, RouteMetric>();
const edgeMetrics = {
  totalRequests: 0,
  totalErrors: 0,
  totalTimeouts: 0,
  slowRequests: 0,
};

function routeMetricKey(method: string, pathname: string): string {
  const normalized = pathname
    .replace(/\/make-server-16010b6f/, "")
    .replace(/\/[0-9a-f]{8,}(?:-[0-9a-f]{4,}){2,}/gi, "/:uuid")
    .replace(/\/(?:prod|product|order|ord|cust|vendor|cat|campaign|coupon|notification|vendor_app)_[^/]+/gi, "/:id")
    .replace(/\/\d{10,}[^/]*/g, "/:id");
  return `${method.toUpperCase()} ${normalized || "/"}`;
}

function recordRouteMetric(method: string, pathname: string, status: number, ms: number, error?: unknown): void {
  const key = routeMetricKey(method, pathname);
  const row = routeMetrics.get(key) || {
    count: 0,
    errors: 0,
    timeouts: 0,
    totalMs: 0,
    maxMs: 0,
    lastStatus: 0,
    lastMs: 0,
    lastAt: "",
  };
  row.count += 1;
  row.totalMs += ms;
  row.maxMs = Math.max(row.maxMs, ms);
  row.lastStatus = status;
  row.lastMs = ms;
  row.lastAt = new Date().toISOString();
  if (status >= 500) row.errors += 1;
  const errorMessage = String((error as { message?: unknown })?.message || "").toLowerCase();
  if (status === 504 || errorMessage.includes("timeout")) row.timeouts += 1;
  routeMetrics.set(key, row);

  edgeMetrics.totalRequests += 1;
  if (status >= 500) edgeMetrics.totalErrors += 1;
  if (status === 504 || errorMessage.includes("timeout")) edgeMetrics.totalTimeouts += 1;
  if (ms > 5000) edgeMetrics.slowRequests += 1;
}

function routeMetricsSnapshot(limit = 30): Array<RouteMetric & { route: string; avgMs: number }> {
  return [...routeMetrics.entries()]
    .map(([route, row]) => ({
      route,
      ...row,
      avgMs: row.count > 0 ? Math.round(row.totalMs / row.count) : 0,
    }))
    .sort((a, b) => b.lastAt.localeCompare(a.lastAt))
    .slice(0, limit);
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
  globalFilter: string;
}): string {
  return `${filters.revenueFilter}|${filters.ordersFilter}|${filters.customersFilter}|${filters.productsFilter}|${filters.globalFilter}`;
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
  allowHeaders: ["Content-Type", "Authorization", "apikey", "x-client-info", "x-actor-user-id"],
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

  let pathname = "";
  try {
    pathname = new URL(c.req.url).pathname;
  } catch {
    pathname = c.req.url;
  }
  const method = c.req.method;
  /** Order writes can run KV scans + stock updates; parallel admin navigation often stacks requests — allow longer than default. */
  const isOrderMutation =
    pathname.includes("make-server-16010b6f/orders") &&
    ["PUT", "POST", "DELETE", "PATCH"].includes(method);
  const budgetMs = isOrderMutation ? 65000 : 25000;
  
  let timeoutId: number | undefined;
  const timeoutPromise = new Promise((_, reject) => {
    timeoutId = setTimeout(() => {
      reject(new Error("Request timeout"));
    }, budgetMs);
  });
  
  try {
    const result = await Promise.race([next(), timeoutPromise]);
    if (timeoutId !== undefined) clearTimeout(timeoutId);
    return result;
  } catch (error: any) {
    if (timeoutId !== undefined) clearTimeout(timeoutId);
    
    if (error?.message === "Request timeout") {
      console.error("⏱️ Request timeout:", c.req.url);
      recordRouteMetric(method, pathname, 504, budgetMs, error);
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

const AUTO_AUDIT_WRITE_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);
/** Only super-admin portal writes — storefront/customer/vendor-host traffic is excluded. */
const SUPER_ADMIN_AUTO_AUDIT_RULES: Array<(pathname: string, method: string) => boolean> = [
  (p) => /^\/make-server-16010b6f\/categories(?:\/|$)/.test(p),
  (p) => /^\/make-server-16010b6f\/settings(?:\/|$)/.test(p),
  (p) => /^\/make-server-16010b6f\/inventory(?:\/|$)/.test(p),
  (p) => /^\/make-server-16010b6f\/discounts(?:\/|$)/.test(p),
  (p, m) => p === "/make-server-16010b6f/campaigns" && m !== "GET",
  (p, m) =>
    /^\/make-server-16010b6f\/campaigns\/[^/]+$/.test(p) &&
    !/\/(validate|increment)$/.test(p),
  (p) => /^\/make-server-16010b6f\/notifications(?:\/|$)/.test(p),
  (p) => /^\/make-server-16010b6f\/collaborators(?:\/|$)/.test(p),
  (p) => /^\/make-server-16010b6f\/admin(?:\/|$)/.test(p),
  (p) => /^\/make-server-16010b6f\/blog-posts(?:\/|$)/.test(p),
  (p) => /^\/make-server-16010b6f\/appearance-settings(?:\/|$)/.test(p),
  (p) => /^\/make-server-16010b6f\/announcement(?:\/|$)/.test(p),
  (p, m) => p === "/make-server-16010b6f/orders" && m === "DELETE",
  (p, m) => p === "/make-server-16010b6f/customers" && m === "POST",
  (p, m) =>
    /^\/make-server-16010b6f\/customers\/[^/]+$/.test(p) &&
    !/\/(cart|wishlist|addresses|activities|orders|saved-products|bulk-delete|deduplicate|cleanup-corrupted)(?:\/|$)/.test(p),
  (p, m) => /^\/make-server-16010b6f\/vendors\/[^/]+$/.test(p) && m !== "DELETE",
];
const AUTO_AUDIT_ACTOR_KEYS = [
  "performedByUserId",
  "updatedBy",
  "createdBy",
  "deletedBy",
  "resetBy",
  "actorUserId",
  "actorId",
  "adminUserId",
  "staffUserId",
];

function isObjectRecord(value: unknown): value is Record<string, unknown> {
  return value != null && typeof value === "object" && !Array.isArray(value);
}

function pickValidActorIdFromRecord(record: Record<string, unknown>): string {
  for (const key of AUTO_AUDIT_ACTOR_KEYS) {
    const raw = record[key];
    if (typeof raw !== "string") continue;
    const trimmed = raw.trim();
    if (isValidStaffActorId(trimmed)) return trimmed;
  }
  const nestedActor = record.actor;
  if (isObjectRecord(nestedActor) && typeof nestedActor.id === "string") {
    const actorId = nestedActor.id.trim();
    if (isValidStaffActorId(actorId)) return actorId;
  }
  return "";
}

function shouldAutoAuditPath(pathname: string, method: string): boolean {
  if (!pathname.startsWith("/make-server-16010b6f/")) return false;
  return SUPER_ADMIN_AUTO_AUDIT_RULES.some((rule) => rule(pathname, method));
}

function actionVerbFromMethod(method: string): string {
  if (method === "POST") return "created";
  if (method === "DELETE") return "deleted";
  return "updated";
}

function resourceLabelFromPath(pathname: string): string {
  const trimmed = pathname.replace("/make-server-16010b6f/", "");
  const [root, second] = trimmed.split("/").filter(Boolean);
  if (root === "vendor" && second === "custom-domain") return "Vendor custom domain";
  if (root === "vendor" && second === "storefront") return "Vendor storefront";
  if (root === "admin" && second === "domain") return "Domain";
  if (root === "vendor-applications") return "Vendor application";
  if (root === "blog-posts") return "Blog post";
  if (root === "appearance-settings") return "Appearance settings";
  if (root === "announcement") return "Announcement";
  if (root === "inventory") return "Inventory";
  if (root === "discounts") return "Discount";
  if (root === "categories" || root === "vendor" || root === "vendors" || root === "orders" || root === "customers" || root === "campaigns" || root === "settings" || root === "notifications" || root === "collaborators" || root === "auth") {
    return root.replace(/-/g, " ").replace(/\b\w/g, (x) => x.toUpperCase()).replace(/s$/, "");
  }
  return "Admin action";
}

function buildAutoAuditAction(method: string, pathname: string): string {
  const label = resourceLabelFromPath(pathname);
  const verb = actionVerbFromMethod(method);
  if (label === "Admin action") return `Admin action ${method}`;
  return `${label} ${verb}`;
}

function buildAutoAuditDetail(pathname: string, query: URLSearchParams, body: Record<string, unknown> | null): string {
  const route = pathname.replace("/make-server-16010b6f/", "");
  const parts: string[] = [route || "/"];
  const candidateLabel = isObjectRecord(body)
    ? [
        body.name,
        body.title,
        body.email,
        body.orderNumber,
        body.sku,
        body.code,
        body.id,
      ].find((x) => typeof x === "string" && String(x).trim())
    : "";
  if (typeof candidateLabel === "string" && candidateLabel.trim()) {
    parts.push(candidateLabel.trim().slice(0, 80));
  }
  const queryId = query.get("id") || query.get("vendorId") || query.get("campaignId");
  if (queryId && queryId.trim()) {
    parts.push(`id ${queryId.trim().slice(0, 40)}`);
  }
  return parts.join(" · ").slice(0, 220);
}

// Auto-capture admin/owner write activities so new routes are tracked without manual instrumentation.
app.use("*", async (c, next) => {
  const method = c.req.method.toUpperCase();
  if (!AUTO_AUDIT_WRITE_METHODS.has(method)) {
    await next();
    return;
  }

  let pathname = "";
  let query = new URLSearchParams();
  try {
    const url = new URL(c.req.url);
    pathname = url.pathname;
    query = url.searchParams;
  } catch {
    pathname = c.req.path;
  }
  if (!shouldAutoAuditPath(pathname, method)) {
    await next();
    return;
  }

  const actorFromHeader = String(c.req.header("x-actor-user-id") || "").trim();
  const actorFromQuery =
    String(
      query.get("performedByUserId") ||
        query.get("updatedBy") ||
        query.get("createdBy") ||
        query.get("deletedBy") ||
        query.get("resetBy") ||
        ""
    ).trim();

  let bodyData: Record<string, unknown> | null = null;
  const contentType = String(c.req.header("content-type") || "").toLowerCase();
  if (contentType.includes("application/json")) {
    try {
      const text = await c.req.raw.clone().text();
      if (text && text.trim()) {
        const parsed = JSON.parse(text);
        if (isObjectRecord(parsed)) bodyData = parsed;
      }
    } catch {
      bodyData = null;
    }
  }

  await next();
  if (c.res.status >= 400) return;

  const actorFromBody = bodyData ? pickValidActorIdFromRecord(bodyData) : "";
  const actorId = actorFromBody || actorFromQuery || actorFromHeader;
  if (!(await isStaffAuditActor(actorId))) return;

  await appendStaffActivity(actorId, {
    type: "admin_action",
    action: buildAutoAuditAction(method, pathname),
    detail: buildAutoAuditDetail(pathname, query, bodyData),
  });
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
    recordRouteMetric(method, path, status, ms);
    
    // Log slow requests as warnings
    if (ms > 5000) {
      console.warn(`⏱️ SLOW: ${method} ${path} - ${status} (${ms}ms)`);
    } else if (ms > 1000) {
      console.log(`${method} ${path} - ${status} (${ms}ms)`);
    }
    // Skip logging fast requests to reduce noise
  } catch (error: any) {
    const ms = Date.now() - start;
    const status = String(error?.message || "").toLowerCase().includes("timeout") ? 504 : 500;
    recordRouteMetric(method, path, status, ms, error);
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

async function countKvRows(prefix: string, opts?: { topLevelOnly?: boolean; excludeLike?: string }): Promise<number | null> {
  try {
    let query = supabase
      .from("kv_store_16010b6f")
      .select("key", { count: "exact", head: true })
      .like("key", `${prefix}%`);
    if (opts?.topLevelOnly) {
      query = query.not("key", "like", `${prefix}%:%`);
    }
    if (opts?.excludeLike) {
      query = query.not("key", "like", opts.excludeLike);
    }
    const { count, error } = await query;
    if (error) {
      console.warn(`[monitoring] countKvRows ${prefix} failed:`, error.message);
      return null;
    }
    return count ?? 0;
  } catch (error) {
    console.warn(`[monitoring] countKvRows ${prefix} exception:`, error);
    return null;
  }
}

async function countTableRows(table: string): Promise<number | null> {
  try {
    const { count, error } = await supabase
      .from(table)
      .select("id", { count: "exact", head: true });
    if (error) {
      console.warn(`[monitoring] countTableRows ${table} failed:`, error.message);
      return null;
    }
    return count ?? 0;
  } catch (error) {
    console.warn(`[monitoring] countTableRows ${table} exception:`, error);
    return null;
  }
}

function parityStatus(kvCount: number | null, sqlCount: number | null): "ok" | "warning" | "unavailable" {
  if (kvCount == null || sqlCount == null) return "unavailable";
  if (kvCount === 0 && sqlCount === 0) return "ok";
  if (kvCount === 0) return "warning";
  const delta = Math.abs(kvCount - sqlCount);
  return delta <= Math.max(2, Math.ceil(kvCount * 0.02)) ? "ok" : "warning";
}

async function readModelParitySummary(): Promise<Record<string, unknown>> {
  const [
    kvProducts,
    kvOrders,
    kvCustomers,
    kvVendors,
    sqlProducts,
    sqlOrders,
    sqlCustomers,
    sqlVendors,
  ] = await Promise.all([
    countKvRows("product:"),
    countKvRows("order:"),
    countKvRows("customer:", { topLevelOnly: true }),
    countKvRows("vendor:", { excludeLike: "vendor:audience:%" }),
    countTableRows("app_products"),
    countTableRows("app_orders"),
    countTableRows("app_customers"),
    countTableRows("app_vendors"),
  ]);

  const rows = [
    { entity: "products", kvCount: kvProducts, sqlCount: sqlProducts },
    { entity: "orders", kvCount: kvOrders, sqlCount: sqlOrders },
    { entity: "customers", kvCount: kvCustomers, sqlCount: sqlCustomers },
    { entity: "vendors", kvCount: kvVendors, sqlCount: sqlVendors },
  ].map((row) => ({
    ...row,
    delta:
      row.kvCount == null || row.sqlCount == null
        ? null
        : row.sqlCount - row.kvCount,
    status: parityStatus(row.kvCount, row.sqlCount),
  }));

  return {
    status: rows.some((row) => row.status === "unavailable")
      ? "unavailable"
      : rows.some((row) => row.status === "warning")
        ? "warning"
        : "ok",
    rows,
  };
}

async function realtimePulseSummary(): Promise<Record<string, unknown>> {
  const summary: Record<string, unknown> = {};
  try {
    const { data, error } = await supabase
      .from("app_order_pulse")
      .select("id,bump,updated_at")
      .eq("id", 1)
      .maybeSingle();
    summary.orderPulse = error ? { available: false, error: error.message } : { available: true, ...data };
  } catch (error) {
    summary.orderPulse = { available: false, error: String(error) };
  }
  try {
    const { data, error } = await supabase
      .from("app_vendor_application_pulse")
      .select("id,bump,updated_at")
      .eq("id", 1)
      .maybeSingle();
    summary.vendorApplicationPulse = error ? { available: false, error: error.message } : { available: true, ...data };
  } catch (error) {
    summary.vendorApplicationPulse = { available: false, error: String(error) };
  }
  try {
    const { data, error } = await supabase
      .from("app_kv_domain_pulse")
      .select("domain,bump,updated_at")
      .order("domain", { ascending: true });
    summary.kvDomainPulse = error ? { available: false, error: error.message } : { available: true, rows: data || [] };
  } catch (error) {
    summary.kvDomainPulse = { available: false, error: String(error) };
  }
  return summary;
}

app.get("/make-server-16010b6f/monitoring/summary", async (c) => {
  const denied = assertAdminMonitoringAllowed(c);
  if (denied) return denied;
  try {
    const [readModels, realtime] = await Promise.all([
      readModelParitySummary(),
      realtimePulseSummary(),
    ]);
    return c.json({
      status: "ok",
      timestamp: new Date().toISOString(),
      edgeInstance: {
        startedAt: edgeStartedAt,
        uptimeSeconds: Math.round((Date.now() - Date.parse(edgeStartedAt)) / 1000),
      },
      requests: {
        ...edgeMetrics,
        routes: routeMetricsSnapshot(40),
      },
      readModels,
      realtime,
      notes: [
        "Request metrics are per Edge Function instance and reset on cold start.",
        "Realtime connection/message totals should still be monitored in the Supabase dashboard; pulse bumps verify app-level event flow.",
      ],
    });
  } catch (error) {
    console.error("❌ Monitoring summary error:", error);
    return c.json({ status: "error", error: String(error) }, 500);
  }
});

app.get("/make-server-16010b6f/read-model/validate", async (c) => {
  const denied = assertAdminMonitoringAllowed(c);
  if (denied) return denied;
  try {
    const readModels = await readModelParitySummary();
    return c.json({
      timestamp: new Date().toISOString(),
      ...readModels,
    });
  } catch (error) {
    console.error("❌ Read-model validation error:", error);
    return c.json({ status: "error", error: String(error) }, 500);
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
        storeName: "SECURE",
        storeEmail: "info@secure.com",
        storePhone: "+95 9 XXX XXX XXX",
        storeAddress: "123 Main St, Yangon, Myanmar",
        termsContent: "",
        privacyPolicyContent: "",
        currency: "MMK",
        timezone: "Asia/Yangon",
        storeLogo: "",
      });
    }
    
    return c.json(settings);
  } catch (error: any) {
    console.error("Error loading general settings:", error);
    // Return default settings on timeout/error to prevent UI breaking
    return c.json({
      storeName: "SECURE",
      storeEmail: "info@secure.com",
      storePhone: "+95 9 XXX XXX XXX",
      storeAddress: "123 Main St, Yangon, Myanmar",
      termsContent: "",
      privacyPolicyContent: "",
      currency: "MMK",
      timezone: "Asia/Yangon",
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

    const prevGeneral = await kv.get("site_settings_general");
    
    // Save settings to KV store
    await kv.set("site_settings_general", body);

    const oldLogo =
      prevGeneral && typeof (prevGeneral as { storeLogo?: string }).storeLogo === "string"
        ? (prevGeneral as { storeLogo: string }).storeLogo.trim()
        : "";
    const newLogo = typeof body.storeLogo === "string" ? body.storeLogo.trim() : "";
    if (oldLogo && oldLogo !== newLogo) {
      await deleteOwnedStorageRefs(supabase, [oldLogo]);
    }
    
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

    const prevGeneral = await kv.get("site_settings_general");
    const prevLogo =
      prevGeneral && typeof (prevGeneral as { storeLogo?: string }).storeLogo === "string"
        ? (prevGeneral as { storeLogo: string }).storeLogo.trim()
        : "";
    if (prevLogo) {
      await deleteOwnedStorageRefs(supabase, [prevLogo]);
    }
    
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

    const prevBanners = await kv.get("settings:banners");
    if (Array.isArray(prevBanners) && bannerId) {
      const bid = String(bannerId);
      const prevBanner = prevBanners.find(
        (b: { id?: string | number }) => b != null && String(b.id) === bid
      ) as { backgroundImage?: string } | undefined;
      const prevBg =
        prevBanner && typeof prevBanner.backgroundImage === "string"
          ? prevBanner.backgroundImage.trim()
          : "";
      if (prevBg) {
        await deleteOwnedStorageRefs(supabase, [prevBg]);
      }
    }
    
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

    const prevBanners = await kv.get("settings:banners");
    
    // Save banners to KV store
    await kv.set("settings:banners", body.banners);

    const toRemove: unknown[] = [];
    if (Array.isArray(prevBanners)) {
      const nextArr = body.banners as { id?: string | number; backgroundImage?: string }[];
      const nextById = new Map(nextArr.map((b) => [String(b?.id), b]));
      for (const ob of prevBanners) {
        if (!ob || typeof ob !== "object") continue;
        const oid = String((ob as { id?: string | number }).id);
        const nb = nextById.get(oid);
        const oimg =
          typeof (ob as { backgroundImage?: string }).backgroundImage === "string"
            ? (ob as { backgroundImage: string }).backgroundImage.trim()
            : "";
        if (!nb) {
          if (oimg) toRemove.push(oimg);
        } else {
          const nimg =
            typeof nb.backgroundImage === "string" ? nb.backgroundImage.trim() : "";
          if (oimg && oimg !== nimg) toRemove.push(oimg);
        }
      }
    }
    await deleteOwnedStorageRefs(supabase, toRemove);
    
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
app.route("/make-server-16010b6f", socialProfileApp);

// ============================================
// STRIPE PAYMENT ROUTES
// ============================================
app.post("/make-server-16010b6f/create-payment-intent", createPaymentIntent);
app.get("/make-server-16010b6f/verify-payment/:paymentIntentId", verifyPayment);

// ============================================
// KPAY QR PAYMENT ROUTES
// ============================================
app.post("/make-server-16010b6f/kpay/create-qr", createKPayQr);
app.get("/make-server-16010b6f/kpay/status/:merchantOrderId", getKPayStatus);
app.post("/make-server-16010b6f/kpay/webhook", handleKPayWebhook);
app.post("/make-server-16010b6f/kpay/pwa/start", startKPayPwa);
app.get("/make-server-16010b6f/kpay/pwa/return", handleKPayPwaReturn);
app.get("/make-server-16010b6f/kpay/pwa/draft/:merchantOrderId", getPwaCheckoutDraftRoute);
app.post("/make-server-16010b6f/kpay/pwa/finalize/:merchantOrderId", postPwaFinalizeRoute);
app.get("/make-server-16010b6f/kpay/pwa/orphaned-drafts", getOrphanedPwaDraftsRoute);
app.get("/make-server-16010b6f/kpay/pwa/draft-status/:merchantOrderId", getPwaDraftStatusRoute);
app.post("/make-server-16010b6f/kpay/pwa/reconcile", postPwaReconcileRoute);
app.get("/make-server-16010b6f/kpay/resolved-urls", getKPayResolvedUrlsRoute);

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
    
    const minimalOrders = dedupeOrdersByCanonical(validOrders.map(order => {
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
    }).filter(o => o !== null));
    
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
  const denied = assertDestructiveOperationAllowed(c);
  if (denied) return denied;
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

    const MAX_PROFILE_BYTES = 524288; // 512 KiB bucket limit; matches client 500KB policy + margin
    if (bytes.length > MAX_PROFILE_BYTES) {
      console.error(
        `❌ Profile image too large after decode: ${bytes.length} bytes (max ${MAX_PROFILE_BYTES})`
      );
      return null;
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

/** Per-isolate memo: GET /customers and auth profile paths repeat createSignedUrl for the same paths. */
const signedImageUrlMemo = new Map<string, { url: string; expiresAt: number }>();
const SIGNED_IMAGE_URL_MEMO_TTL_MS = 55 * 60 * 1000;
const SIGNED_IMAGE_URL_MEMO_MAX = 4000;

const STOREFRONT_PHONE_AUTH_EMAIL_DOMAIN = "phone.migoo.store";

function isSyntheticStorefrontAuthEmail(email: string): boolean {
  return String(email || "").toLowerCase().endsWith(`@${STOREFRONT_PHONE_AUTH_EMAIL_DOMAIN}`);
}

async function getSupabaseAuthEmailForProfile(userId: string): Promise<string> {
  try {
    const { data, error } = await supabase.auth.admin.getUserById(userId);
    if (error || !data?.user?.email) return "";
    return String(data.user.email).trim().toLowerCase();
  } catch {
    return "";
  }
}

async function applyStorefrontProfileEmailUpdate(
  userId: string,
  record: { email?: string },
  emailRaw: unknown
): Promise<{ error?: string; displayEmail?: string; authEmail?: string }> {
  if (emailRaw === undefined) {
    const authEmail = await getSupabaseAuthEmailForProfile(userId);
    const display = isSyntheticStorefrontAuthEmail(String(record.email || ""))
      ? ""
      : String(record.email || "").trim();
    return { displayEmail: display, authEmail: authEmail || undefined };
  }

  const emailTrim = typeof emailRaw === "string" ? emailRaw.trim() : "";
  if (emailTrim) {
    const emailRegex = /^[a-zA-Z0-9._-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
    if (!emailRegex.test(emailTrim)) {
      return { error: "Please enter a valid email address (e.g., name@example.com)" };
    }

    const allCustomers = await withTimeout(kv.getByPrefix("customer:"), 5000);
    const duplicate = Array.isArray(allCustomers)
      ? allCustomers.find(
          (c: any) =>
            c?.email &&
            !isSyntheticStorefrontAuthEmail(String(c.email)) &&
            String(c.email).trim().toLowerCase() === emailTrim.toLowerCase() &&
            String(c.userId || "") !== userId
        )
      : null;
    if (duplicate) {
      return { error: "This email is already registered to another account" };
    }
    record.email = emailTrim;
  } else {
    record.email = "";
  }

  const currentAuthEmail = await getSupabaseAuthEmailForProfile(userId);
  let authEmail = currentAuthEmail;

  if (emailTrim && isSyntheticStorefrontAuthEmail(currentAuthEmail)) {
    const { error } = await supabase.auth.admin.updateUserById(userId, {
      email: emailTrim,
      email_confirm: true,
    });
    if (error) {
      console.error("❌ Supabase Auth email update (profile):", error);
      return { error: error.message || "Failed to update sign-in email" };
    }
    authEmail = emailTrim.toLowerCase();
  } else if (emailTrim) {
    authEmail = emailTrim.toLowerCase();
  }

  const displayEmail = isSyntheticStorefrontAuthEmail(String(record.email || ""))
    ? ""
    : String(record.email || "").trim();

  return { displayEmail, authEmail: authEmail || undefined };
}

// Helper function to get signed URL for profile image
async function getSignedImageUrl(filePath: string): Promise<string | null> {
  try {
    const key = String(filePath || "").trim();
    if (!key) return null;

    const now = Date.now();
    const hit = signedImageUrlMemo.get(key);
    if (hit && hit.expiresAt > now) {
      return hit.url;
    }

    const PROFILE_IMAGES_BUCKET = "make-16010b6f-profile-images";
    const { data, error } = await supabase.storage
      .from(PROFILE_IMAGES_BUCKET)
      .createSignedUrl(key, 60 * 60 * 24 * 365); // 1 year expiry

    if (error) {
      console.error("❌ Error creating signed URL:", error);
      return null;
    }

    const url = data.signedUrl;
    if (signedImageUrlMemo.size >= SIGNED_IMAGE_URL_MEMO_MAX) {
      const first = signedImageUrlMemo.keys().next().value as string | undefined;
      if (first !== undefined) signedImageUrlMemo.delete(first);
    }
    signedImageUrlMemo.set(key, { url, expiresAt: now + SIGNED_IMAGE_URL_MEMO_TTL_MS });
    return url;
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
    queueCustomerReadModelSync(customerId, customerData);
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
        const emailLower = email.trim().toLowerCase();
        const existingUser = await withTimeout(kv.get(`user:${email.trim()}`), 5000);
        if (existingUser) {
          errors.email = "An account with this email already exists";
        } else {
          const allCustomers = await withTimeout(kv.getByPrefix("customer:"), 5000);
          const existingEmailCustomer = Array.isArray(allCustomers)
            ? allCustomers.find((c: any) => {
                if (!c?.email) return false;
                const em = String(c.email).trim().toLowerCase();
                return em && !em.endsWith(`@${STOREFRONT_PHONE_AUTH_EMAIL_DOMAIN}`) && em === emailLower;
              })
            : null;
          if (existingEmailCustomer) {
            errors.email = "An account with this email already exists";
          }
        }
      }
    }
    
    // Check phone if provided
    if (phone && phone.trim()) {
      const normalizedPhone = phone.replace(/[\s\-]/g, '');
      const myanmarPhoneRegex = /^(\+959|09)\d{9}$/;

      if (!myanmarPhoneRegex.test(normalizedPhone)) {
        errors.phone = "Phone must be Myanmar format: +959XXXXXXXXX (12 digits) or 09XXXXXXXXX (11 digits)";
      } else {
        const canon =
          normalizedPhone.startsWith("09")
            ? `+959${normalizedPhone.slice(1)}`
            : normalizedPhone;
        const allCustomers = await withTimeout(kv.getByPrefix("customer:"), 5000);
        const existingPhoneCustomer = Array.isArray(allCustomers)
          ? allCustomers.find((c: any) => {
              if (!c?.phone) return false;
              const p = String(c.phone).replace(/[\s\-]/g, "");
              const existing =
                p.startsWith("09") ? `+959${p.slice(1)}` : p;
              return existing === canon;
            })
          : null;

        if (existingPhoneCustomer) {
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
  const denied = assertDestructiveOperationAllowed(c);
  if (denied) return denied;
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
          email: isSyntheticStorefrontAuthEmail(String(customer.email || "")) ? "" : String(customer.email || "").trim(),
          id: userId,
          customerId: cust.id,
        };
        const authEmail = await getSupabaseAuthEmailForProfile(userId);
        if (authEmail) userPayload.authEmail = authEmail;
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
        const prevAuthImg =
          typeof (authKvProfile as { profileImage?: string }).profileImage === "string"
            ? String((authKvProfile as { profileImage: string }).profileImage).trim()
            : "";
        if (body.profileImage) {
          const uploadedPath = await uploadProfileImage(userId, body.profileImage);
          if (uploadedPath) {
            profileImagePath = uploadedPath;
            console.log(`📸 Profile image uploaded (auth:user KV): ${profileImagePath}`);
            if (prevAuthImg && prevAuthImg !== uploadedPath) {
              await deleteOwnedStorageRefs(supabase, [prevAuthImg]);
            }
          }
        }
        const updatedProfile = {
          ...(authKvProfile as Record<string, unknown>),
          name: typeof body.name === "string" ? body.name : (authKvProfile as { name?: string }).name,
          phone: typeof body.phone === "string" ? body.phone : (authKvProfile as { phone?: string }).phone,
          profileImage: profileImagePath,
          updatedAt: new Date().toISOString(),
        } as { email?: string; name?: string; phone?: string; profileImage?: string; updatedAt?: string };

        const emailResult = await applyStorefrontProfileEmailUpdate(userId, updatedProfile, body.email);
        if (emailResult.error) {
          return c.json({ error: emailResult.error }, 400);
        }

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
        const out = {
          ...userOut,
          email: emailResult.displayEmail ?? "",
          ...(emailResult.authEmail ? { authEmail: emailResult.authEmail } : {}),
        } as Record<string, unknown>;
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
        const prevCustImg =
          typeof customer.profileImage === "string" ? customer.profileImage.trim() : "";

        if (body.profileImage) {
          const uploadedPath = await uploadProfileImage(userId, body.profileImage);
          if (uploadedPath) {
            profileImagePath = uploadedPath;
            console.log(`📸 Profile image uploaded (customer): ${profileImagePath}`);
            if (prevCustImg && prevCustImg !== uploadedPath) {
              await deleteOwnedStorageRefs(supabase, [prevCustImg]);
            }
          }
        }

        if (typeof body.name === "string" && body.name.trim()) {
          customer.name = body.name.trim();
        }
        if (typeof body.phone === "string") {
          customer.phone = body.phone.trim();
        }

        const emailResult = await applyStorefrontProfileEmailUpdate(userId, customer, body.email);
        if (emailResult.error) {
          return c.json({ error: emailResult.error }, 400);
        }

        customer.updatedAt = new Date().toISOString();
        if (profileImagePath) {
          customer.profileImage = profileImagePath;
          const signed = await getSignedImageUrl(profileImagePath);
          if (signed) customer.avatar = signed;
        }

        await withTimeout(kv.set(`customer:${customer.id}`, customer), 5000);
        queueCustomerReadModelSync(String(customer.id), customer);

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
        const authEmail = emailResult.authEmail || (await getSupabaseAuthEmailForProfile(userId));
        const userResponse = {
          ...customerRest,
          email: emailResult.displayEmail ?? (isSyntheticStorefrontAuthEmail(String(customer.email || "")) ? "" : String(customer.email || "").trim()),
          id: userId,
          customerId: customer.id,
          profileImageUrl: profileImagePath ? await getSignedImageUrl(profileImagePath) : customer.avatar,
          ...(authEmail ? { authEmail } : {}),
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
    const prevLegacyImg =
      typeof existingUser.profileImage === "string" ? String(existingUser.profileImage).trim() : "";
    if (body.profileImage) {
      const uploadedPath = await uploadProfileImage(userId, body.profileImage);
      if (uploadedPath) {
        profileImagePath = uploadedPath;
        console.log(`📸 Profile image uploaded: ${profileImagePath}`);
        if (prevLegacyImg && prevLegacyImg !== uploadedPath) {
          await deleteOwnedStorageRefs(supabase, [prevLegacyImg]);
        }
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

    const storageCleanup: unknown[] = [];
    const legacyRow = await withTimeout(kv.get(`user:${userEmail}`), 5000).catch(() => null);
    if (
      legacyRow &&
      typeof (legacyRow as { profileImage?: string }).profileImage === "string" &&
      (legacyRow as { profileImage: string }).profileImage.trim()
    ) {
      storageCleanup.push((legacyRow as { profileImage: string }).profileImage);
    }
    const authKvRow = await withTimeout(kv.get(`auth:user:${userId}`), 5000).catch(() => null);
    if (
      authKvRow &&
      typeof (authKvRow as { profileImage?: string }).profileImage === "string" &&
      (authKvRow as { profileImage: string }).profileImage.trim()
    ) {
      storageCleanup.push((authKvRow as { profileImage: string }).profileImage);
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
        if (
          customer &&
          typeof (customer as { profileImage?: string }).profileImage === "string" &&
          (customer as { profileImage: string }).profileImage.trim()
        ) {
          storageCleanup.push((customer as { profileImage: string }).profileImage);
        }
      }
      
      for (const customer of customerRecords) {
        console.log(`🗑️ Deleting customer:${customer.id}`);
        deletionPromises.push(
          withTimeout(kv.del(`customer:${customer.id}`), 5000)
            .then(() => {
              queueCustomerReadModelDelete(String(customer.id));
              console.log(`✅ Deleted customer:${customer.id}`);
            })
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

    await deleteOwnedStorageRefs(supabase, storageCleanup);
    
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
    
    const fullLoginVendor = await withTimeout(kv.get(`vendor:${vendor.id}`), 5000).catch(() => null) as any;
    const storedPassword = fullLoginVendor?.password ?? vendor.password;
    const passwordOk = await verifyPasswordPlain(password, storedPassword);
    if (!passwordOk) {
      console.log(`❌ [VendorAuth] Invalid password for: ${email}`);
      return c.json({ error: "Invalid email or password" }, 401);
    }
    if (
      fullLoginVendor &&
      typeof fullLoginVendor.password === "string" &&
      fullLoginVendor.password.length > 0 &&
      !isPasswordHashFormat(fullLoginVendor.password)
    ) {
      try {
        const migratedHash = await hashPasswordPlain(password);
        const migratedVendor = {
          ...fullLoginVendor,
          password: migratedHash,
          updatedAt: new Date().toISOString(),
        };
        await withTimeout(
          kv.set(`vendor:${vendor.id}`, migratedVendor),
          5000
        );
        queueVendorReadModelSync(String(vendor.id), migratedVendor);
      } catch (migrateErr) {
        console.warn("[VendorAuth] Password migrate-to-hash skipped:", migrateErr);
      }
    }
    
    // Check if vendor is active
    if (vendor.status !== 'active') {
      console.log(`❌ [VendorAuth] Vendor not active: ${email}, status: ${vendor.status}`);
      return c.json({ error: "Your vendor account is not active. Please contact support." }, 403);
    }
    
    console.log(`✅ [VendorAuth] Login successful for: ${email}`);

    try {
      const fullVendor = await withTimeout(kv.get(`vendor:${vendor.id}`), 5000);
      if (fullVendor && typeof fullVendor === "object") {
        const loginVendor = {
          ...(fullVendor as object),
          lastLoginAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };
        await withTimeout(
          kv.set(`vendor:${vendor.id}`, loginVendor),
          5000
        );
        queueVendorReadModelSync(String(vendor.id), loginVendor);
      }
    } catch (e) {
      console.warn("[VendorAuth] Could not persist lastLoginAt:", e);
    }
    
    // Store label + slug: prefer storefront settings (Store Settings UI), then legacy vendor_settings
    const [vendorSettings, storefrontSettings] = await Promise.all([
      withTimeout(kv.get(`vendor_settings:${vendor.id}`), 5000),
      withTimeout(kv.get(`vendor_storefront_${vendor.id}`), 5000),
    ]);
    
    // Return vendor data without password
    const { password: _, ...vendorWithoutPassword } = vendor;
    
    return c.json({ 
      success: true,
      vendor: {
        ...vendorWithoutPassword,
        storeName: storefrontSettings?.storeName || vendorSettings?.storeName || vendor.name,
        storeSlug: storefrontSettings?.storeSlug || vendorSettings?.storeSlug || vendor.storeSlug,
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
    
    const passwordHash = await hashPasswordPlain(password);
    const fullSetupVendor = await withTimeout(kv.get(`vendor:${vendor.id}`), 5000).catch(() => null) as any;
    const updatedVendor = {
      ...(fullSetupVendor && typeof fullSetupVendor === "object" ? fullSetupVendor : vendor),
      id: vendor.id,
      password: passwordHash,
      credentialsSetAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    
    await withTimeout(
      kv.set(`vendor:${vendor.id}`, updatedVendor),
      5000
    );
    queueVendorReadModelSync(String(vendor.id), updatedVendor);
    
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

/** Signed URL + UI fields for vendor admin User Profile (mirrors staff auth profile shape). */
async function buildVendorAuthProfileUser(vendorRaw: Record<string, unknown>) {
  const rest = { ...vendorRaw };
  delete (rest as { password?: string }).password;

  let profileImageUrl = "";
  const pi = rest.profileImage;
  if (typeof pi === "string" && pi.trim()) {
    const su = await getSignedImageUrl(pi.trim());
    if (su) profileImageUrl = su;
  }
  /** Do not treat `avatar` as profile photo: it may be a storefront logo URL or initials. */

  const created = (rest.createdAt || rest.joinedDate) as string | undefined;
  const id = String(rest.id || "");
  /** Owner / primary contact (from application). Legacy vendors may only have `name` (store). */
  const ownerFromKv =
    (typeof rest.contactName === "string" && rest.contactName.trim()) ||
    (typeof rest.contact_name === "string" && rest.contact_name.trim()) ||
    "";

  return {
    id,
    name: String(rest.name || ""),
    contactName: ownerFromKv || String(rest.name || ""),
    email: String(rest.email || ""),
    phone: String(rest.phone || ""),
    businessName: String(rest.businessName || rest.name || ""),
    role: "vendor-admin",
    status: rest.status === "active" ? "active" : "inactive",
    location: String(rest.location || ""),
    addressLine1: String(rest.addressLine1 || ""),
    addressLine2: String(rest.addressLine2 || ""),
    city: String(rest.city || ""),
    region: String(rest.region || ""),
    postalCode: String(rest.postalCode || ""),
    country: String(rest.country || ""),
    bio: String(rest.bio || ""),
    profileImage: typeof pi === "string" ? pi : "",
    profileImageUrl: profileImageUrl || undefined,
    avatar: profileImageUrl || "",
    createdAt: created,
    authCreatedAt: created,
    lastSignInAt: (rest.lastLoginAt || rest.lastSignInAt || rest.updatedAt) as string | undefined,
    updatedAt: rest.updatedAt as string | undefined,
  };
}

// Vendor self-service profile (KV vendor:{id}) — same anon-key pattern as other vendor routes
app.get("/make-server-16010b6f/vendor-auth/profile/:vendorId", async (c) => {
  try {
    const vendorId = c.req.param("vendorId");
    if (!vendorId?.trim()) {
      return c.json({ error: "vendorId required" }, 400);
    }
    const vendor = await withTimeout(kv.get(`vendor:${vendorId}`), 5000);
    if (!vendor || typeof vendor !== "object") {
      return c.json({ error: "Vendor not found" }, 404);
    }
    const user = await buildVendorAuthProfileUser(vendor as Record<string, unknown>);
    return c.json({ user });
  } catch (error: any) {
    console.error("❌ [VendorAuth] GET profile:", error);
    return c.json({ error: "Failed to load profile", details: String(error) }, 500);
  }
});

app.put("/make-server-16010b6f/vendor-auth/profile/:vendorId", async (c) => {
  try {
    const vendorId = c.req.param("vendorId");
    if (!vendorId?.trim()) {
      return c.json({ error: "vendorId required" }, 400);
    }

    const body = await c.req.json().catch(() => ({}));
    const existing = await withTimeout(kv.get(`vendor:${vendorId}`), 5000);
    if (!existing || typeof existing !== "object") {
      return c.json({ error: "Vendor not found" }, 404);
    }

    const ev = existing as Record<string, unknown>;
    const pwd = ev.password;

    const emailIn = typeof body.email === "string" ? body.email.trim().toLowerCase() : String(ev.email || "").toLowerCase();
    if (emailIn && emailIn !== String(ev.email || "").toLowerCase()) {
      const others = await kv.getVendorProfiles();
      const dup = others.find(
        (v: any) =>
          v?.id !== vendorId &&
          String(v?.email || "").toLowerCase() === emailIn
      );
      if (dup) {
        return c.json({ error: "That email is already in use" }, 409);
      }
    }

    const prevProfileImg =
      typeof ev.profileImage === "string" ? String(ev.profileImage).trim() : "";

    let profileImagePath = prevProfileImg;

    if (body.removeProfileImage) {
      profileImagePath = "";
      if (prevProfileImg) {
        await deleteOwnedStorageRefs(supabase, [prevProfileImg]);
      }
    } else if (typeof body.profileImage === "string" && body.profileImage.length > 0) {
      const uploaded = await uploadProfileImage(vendorId, body.profileImage);
      if (uploaded) {
        profileImagePath = uploaded;
        if (prevProfileImg && prevProfileImg !== uploaded) {
          await deleteOwnedStorageRefs(supabase, [prevProfileImg]);
        }
      } else {
        return c.json(
          {
            error:
              "Could not upload profile image. Use a JPG or PNG under 500 KB and try again.",
          },
          400
        );
      }
    }

    const next: Record<string, unknown> = {
      ...ev,
      contactName:
        typeof body.contactName === "string"
          ? body.contactName.trim()
          : ev.contactName ?? "",
      name: typeof body.name === "string" ? body.name.trim() : ev.name,
      email: typeof body.email === "string" ? body.email.trim() : ev.email,
      phone: typeof body.phone === "string" ? body.phone : ev.phone ?? "",
      location: typeof body.location === "string" ? body.location : ev.location ?? "",
      addressLine1: typeof body.addressLine1 === "string" ? body.addressLine1 : ev.addressLine1 ?? "",
      addressLine2: typeof body.addressLine2 === "string" ? body.addressLine2 : ev.addressLine2 ?? "",
      city: typeof body.city === "string" ? body.city : ev.city ?? "",
      region: typeof body.region === "string" ? body.region : ev.region ?? "",
      postalCode: typeof body.postalCode === "string" ? body.postalCode : ev.postalCode ?? "",
      country: typeof body.country === "string" ? body.country : ev.country ?? "",
      bio: typeof body.bio === "string" ? body.bio : ev.bio ?? "",
      profileImage: profileImagePath,
      updatedAt: new Date().toISOString(),
    };

    if (pwd !== undefined) next.password = pwd;

    if (body.removeProfileImage) {
      const label =
        typeof next.contactName === "string" && String(next.contactName).trim().length >= 2
          ? String(next.contactName).trim()
          : typeof next.name === "string" && String(next.name).trim().length >= 2
            ? String(next.name).trim()
            : "VN";
      next.avatar = label.substring(0, 2).toUpperCase();
    } else if (profileImagePath && typeof next.avatar === "string" && next.avatar.startsWith("http")) {
      /* keep */
    }

    await withTimeout(kv.set(`vendor:${vendorId}`, next), 5000);
    queueVendorReadModelSync(vendorId, next);

    const user = await buildVendorAuthProfileUser(next);
    return c.json({ success: true, user });
  } catch (error: any) {
    console.error("❌ [VendorAuth] PUT profile:", error);
    return c.json({ error: "Failed to update profile", details: String(error) }, 500);
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

function normalizeSkuText(value: unknown): string {
  return String(value || "").trim().toLowerCase();
}

async function findSkuDuplicateFromReadModel(
  sku: string,
  excludeProductId?: string
): Promise<{ isUnique: boolean; existingProduct?: any } | null> {
  const normalizedSku = normalizeSkuText(sku);
  if (!normalizedSku) return { isUnique: true };

  try {
    const { data, error } = await supabase
      .from("app_product_skus")
      .select("sku, product_id, variant_id, app_products!inner(id,name,raw)")
      .eq("normalized_sku", normalizedSku)
      .limit(1);
    if (error) {
      console.warn("[products] SKU read-model lookup unavailable:", error.message);
      return null;
    }
    const row = Array.isArray(data) ? data[0] : null;
    if (!row) return { isUnique: true };
    const productId = String((row as any).product_id || "");
    if (excludeProductId && productId === excludeProductId) return { isUnique: true };
    const product = (row as any).app_products;
    return {
      isUnique: false,
      existingProduct: {
        id: productId,
        name: product?.name || product?.raw?.name || product?.raw?.title || productId,
      },
    };
  } catch (error) {
    console.warn("[products] SKU read-model lookup failed:", error);
    return null;
  }
}

// Helper function to check SKU uniqueness
async function checkSkuUniqueness(sku: string, excludeProductId?: string): Promise<{ isUnique: boolean; existingProduct?: any }> {
  if (!sku || !sku.trim()) {
    return { isUnique: true }; // Empty SKU is allowed (though not recommended)
  }
  
  try {
    console.log(`🔍 Checking SKU uniqueness: "${sku}" (excluding: ${excludeProductId || 'none'})`);
    const readModelResult = await findSkuDuplicateFromReadModel(sku, excludeProductId);
    if (readModelResult) {
      return readModelResult;
    }

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

function collectProductSkusForUniqueness(product: any): string[] {
  const out: string[] = [];
  const add = (value: unknown) => {
    const sku = String(value ?? "").trim();
    if (sku) out.push(sku);
  };

  // For variant products, `product.sku` is an internal mirror of the first variant SKU.
  // Treat variant SKUs as the source of truth to avoid falsely rejecting that mirror.
  if (product?.hasVariants && Array.isArray(product?.variants)) {
    for (const variant of product.variants) add(variant?.sku);
    return out;
  }

  add(product?.sku);
  if (Array.isArray(product?.variants)) {
    for (const variant of product.variants) add(variant?.sku);
  }
  return out;
}

async function checkProductSkusUniqueness(
  product: any,
  excludeProductId?: string
): Promise<{ isUnique: boolean; sku?: string; existingProduct?: any; duplicateWithinProduct?: boolean }> {
  const skus = collectProductSkusForUniqueness(product);
  const seen = new Set<string>();
  for (const sku of skus) {
    const normalized = sku.toLowerCase();
    if (seen.has(normalized)) {
      return { isUnique: false, sku, duplicateWithinProduct: true };
    }
    seen.add(normalized);
  }

  if (seen.size === 0) return { isUnique: true };

  try {
    const allProducts = await withTimeout(kv.getByPrefix("product:"), 25000);
    if (!Array.isArray(allProducts)) return { isUnique: true };

    for (const existingProduct of allProducts) {
      if (!existingProduct || typeof existingProduct !== "object") continue;
      if (excludeProductId && String(existingProduct.id || "") === String(excludeProductId)) continue;
      for (const existingSku of collectProductSkusForUniqueness(existingProduct)) {
        if (seen.has(existingSku.toLowerCase())) {
          return { isUnique: false, sku: existingSku, existingProduct };
        }
      }
    }
  } catch (error) {
    console.error("❌ Error checking product SKU uniqueness:", error);
    return { isUnique: true };
  }

  return { isUnique: true };
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
    trackQuantity: product.trackQuantity !== undefined ? product.trackQuantity : true,
    continueSellingOutOfStock: product.continueSellingOutOfStock || false,
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

/** Stable mock sold count per product — avoids random values changing on every refresh. */
function stableVendorStorefrontSoldCount(p: any): number {
  const fromProduct = Number(p.salesVolume);
  if (Number.isFinite(fromProduct) && fromProduct > 0) {
    return Math.floor(fromProduct);
  }
  const seed = String(p.id ?? p.sku ?? "");
  if (!seed) return 0;
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
  }
  return (hash % 90) + 10;
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
    // Vendor storefront categorization is vendor-owned via category.productIds.
    // Do not expose the super-admin product category on vendor storefront payloads.
    category: "",
    inventory: p.inventory || 0,
    trackQuantity: p.trackQuantity !== undefined ? p.trackQuantity : true,
    continueSellingOutOfStock: p.continueSellingOutOfStock || false,
    rating: 4.8,
    reviewCount: stableVendorStorefrontSoldCount(p),
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
    trackQuantity: p.trackQuantity !== undefined ? p.trackQuantity : true,
    continueSellingOutOfStock: p.continueSellingOutOfStock || false,
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

/** Full platform product list (KV scan) — coalesce concurrent callers on the same isolate to cut duplicate scans. */
let ensureProductsListInflight: Promise<{ products: any[]; total: number }> | null = null;

/** Server TTL for mapped platform list; cleared on product POST/PUT/DELETE. Slightly long to suit many concurrent readers. */
const PRODUCTS_LIST_SERVER_CACHE_MS = 180_000;

async function ensureProductsListResponse(): Promise<{ products: any[]; total: number }> {
  const cached = getCached("products", PRODUCTS_LIST_SERVER_CACHE_MS);
  if (cached && Array.isArray(cached.products)) {
    return cached;
  }

  if (ensureProductsListInflight) {
    return ensureProductsListInflight;
  }

  ensureProductsListInflight = (async () => {
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
  })().finally(() => {
    ensureProductsListInflight = null;
  });

  return ensureProductsListInflight;
}

/** Same storefront / KV id expansion as client `expandVendorWishlistMatchKeys` (wishlist vendor filter). */
function expandStorefrontWishlistVendorKeys(storefront: string, resolvedId: string | null): string[] {
  const s = new Set<string>();
  const add = (v: string) => {
    const t = v.trim();
    if (!t) return;
    s.add(t);
    if (/^vendor-/i.test(t)) {
      const inner = t.replace(/^vendor-/i, "");
      if (inner) s.add(inner);
    }
  };
  add(String(storefront || ""));
  if (resolvedId) add(resolvedId);
  return [...s];
}

function productRawBelongsToWishlistVendorKeys(raw: any, keys: string[]): boolean {
  const pid = String(raw?.vendorId ?? "");
  const pv = String(raw?.vendor ?? "");
  const sv = raw?.selectedVendors;
  for (const key of keys) {
    if (!key) continue;
    if (pid === key || pv === key) return true;
    if (Array.isArray(sv) && sv.some((x: any) => String(x) === key)) return true;
  }
  return false;
}

/**
 * Paginated wishlist rows for one vendor storefront (order preserved, server-filtered).
 * POST body: { vendorStorefront, resolvedVendorId?, productIds[], page, pageSize? }
 */
app.post("/make-server-16010b6f/products/wishlist-vendor-page", async (c) => {
  try {
    const body = (await c.req.json().catch(() => null)) as Record<string, unknown> | null;
    if (!body || typeof body !== "object") {
      return c.json({ error: "invalid json" }, 400);
    }
    const vendorStorefront = String(body.vendorStorefront ?? "").trim();
    const resolvedVendorId =
      body.resolvedVendorId != null && String(body.resolvedVendorId).trim()
        ? String(body.resolvedVendorId).trim()
        : "";
    const rawIds = Array.isArray(body.productIds) ? body.productIds : [];
    const productIds = rawIds.map((x) => String(x ?? "").trim()).filter(Boolean);
    const page = Math.max(1, parseInt(String(body.page ?? "1"), 10) || 1);
    const pageSize = Math.min(100, Math.max(1, parseInt(String(body.pageSize ?? "24"), 10) || 24));
    if (!vendorStorefront) {
      return c.json({ error: "vendorStorefront required" }, 400);
    }

    const canonicalVendorId = resolvedVendorId
      ? await resolveVendorIdFromSlugOrId(resolvedVendorId)
      : await resolveVendorIdFromSlugOrId(vendorStorefront);
    if (canonicalVendorId) {
      const vendorRow = await withTimeout(kv.get(`vendor:${canonicalVendorId}`), 5000).catch(() => null);
      if (vendorRow && typeof vendorRow === "object" && !vendorProfileAllowsPublicStorefront(vendorRow)) {
        return c.json(
          {
            products: [],
            total: 0,
            page,
            pageSize,
            hasMore: false,
            storeUnavailable: true,
            error: "This store is not available.",
          },
          403
        );
      }
    }

    const MAX_IDS = 800;
    const ids = productIds.slice(0, MAX_IDS);
    const matchKeys = expandStorefrontWishlistVendorKeys(vendorStorefront, resolvedVendorId || null);
    const matched: any[] = [];
    for (const id of ids) {
      const raw = await withTimeout(kv.get(`product:${id}`), 5000).catch(() => null);
      if (!raw || typeof raw !== "object") continue;
      const st = String((raw as any).status || "").toLowerCase();
      const active = !st || st === "active";
      if (!active) continue;
      if (!productRawBelongsToWishlistVendorKeys(raw, matchKeys)) continue;
      matched.push(mapPlatformProductToListRow(raw));
    }
    const total = matched.length;
    const start = (page - 1) * pageSize;
    const products = matched.slice(start, start + pageSize);
    const hasMore = start + pageSize < total;
    return c.json({ products, total, page, pageSize, hasMore });
  } catch (e) {
    console.error("wishlist-vendor-page:", e);
    return c.json({ products: [], total: 0, page: 1, pageSize: 24, hasMore: false }, 200);
  }
});

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
        const st = String((raw as any).status || "").toLowerCase();
        const active = !st || st === "active";
        // Include vendor-assigned products (wishlist / cart hydration); callers filter by vendor if needed.
        if (active) {
          out.push(mapPlatformProductToListRow(raw));
        }
      }
      return c.json({ products: out, total: out.length });
    }

    /** Super Admin product grid: server-side filter/sort/pagination (same platform scope as legacy list). */
    const adminList = c.req.query("adminList") === "1";
    if (adminList) {
      const page = Math.max(1, parseInt(c.req.query("page") || "1", 10) || 1);
      const pageSize = Math.min(100, Math.max(1, parseInt(c.req.query("pageSize") || "24", 10) || 24));
      const qRaw = (c.req.query("q") || "").trim();
      const status = (c.req.query("status") || "all").toLowerCase();
      const tab = (c.req.query("tab") || "all").toLowerCase();
      const vendor = (c.req.query("vendor") || "all").trim();
      const collaborator = (c.req.query("collaborator") || "all").trim();
      let sort = (c.req.query("sort") || "newest").toLowerCase();
      if (tab === "sales") sort = "popular";

      const { products: allList } = await ensureProductsListResponse();

      let tabRows = allList as any[];
      if (tab === "vendor" && vendor && vendor.toLowerCase() !== "all") {
        tabRows = tabRows.filter((p: any) => String(p.vendor || "") === vendor);
      } else if (tab === "collaborator" && collaborator && collaborator.toLowerCase() !== "all") {
        tabRows = tabRows.filter((p: any) => String(p.collaborator || "") === collaborator);
      }

      const counts = {
        all: tabRows.length,
        active: tabRows.filter(
          (p: any) => String(p.status || "active").toLowerCase() === "active"
        ).length,
        offShelf: tabRows.filter((p: any) => String(p.status || "").toLowerCase() === "off-shelf")
          .length,
      };

      const adminMatchesSearch = (p: any, qq: string) => {
        if (!qq) return true;
        const q = qq.toLowerCase();
        const name = String(p.name ?? "").toLowerCase();
        const sku = String(p.sku ?? "").toLowerCase();
        const id = String(p.id ?? "").toLowerCase();
        const cat = String(p.category ?? "").toLowerCase();
        if (name.includes(q) || sku.includes(q) || id.includes(q) || cat.includes(q)) return true;
        const vars = p.variants;
        if (Array.isArray(vars)) {
          for (const v of vars) {
            if (String(v?.sku ?? "").toLowerCase().includes(q)) return true;
          }
        }
        return false;
      };

      let filtered = tabRows.filter((p: any) => adminMatchesSearch(p, qRaw));
      if (status !== "all") {
        filtered = filtered.filter(
          (p: any) => String(p.status || "active").toLowerCase() === status
        );
      }

      let sorted: any[];
      if (sort === "oldest") {
        sorted = [...filtered].sort(
          (a, b) =>
            new Date(a.createDate || 0).getTime() - new Date(b.createDate || 0).getTime()
        );
      } else {
        sorted = sortStorefrontProductRows(filtered, sort);
      }

      /** Vendor assign picker: paginate only products not already on this vendor (matches client filter). */
      const excludeVendorId = (c.req.query("excludeVendorId") || "").trim();
      if (excludeVendorId) {
        const vid = excludeVendorId;
        sorted = sorted.filter((p: any) => {
          const sv = p.selectedVendors;
          if (Array.isArray(sv) && sv.some((x: any) => String(x) === vid)) return false;
          if (String(p.vendorId ?? "") === vid) return false;
          return true;
        });
      }

      const total = sorted.length;
      const slice = sorted.slice((page - 1) * pageSize, page * pageSize);

      return c.json({
        adminList: true,
        products: slice,
        total,
        page,
        pageSize,
        hasMore: page * pageSize < total,
        counts,
      });
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

    const cached = getCached("products", PRODUCTS_LIST_SERVER_CACHE_MS);
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
 * Assign and/or unassign one vendor on many platform products in one request.
 * Optional `removeProductIds` removes vendor from selectedVendors (vendor admin + super admin picker).
 */
app.post("/make-server-16010b6f/products/bulk-assign-vendor", async (c) => {
  try {
    const body = await c.req.json();
    const vendorId = String(body.vendorId ?? "").trim();
    const productIds = Array.isArray(body.productIds) ? body.productIds : [];
    const removeProductIds = Array.isArray(body.removeProductIds) ? body.removeProductIds : [];
    if (!vendorId || (productIds.length === 0 && removeProductIds.length === 0)) {
      return c.json(
        { error: "vendorId and at least one of productIds[] or removeProductIds[] are required" },
        400
      );
    }

    const removeResults: { productId: string; ok: boolean; error?: string }[] = [];
    for (const rawId of removeProductIds) {
      const pid = String(rawId ?? "").trim();
      if (!pid) continue;
      try {
        const existing = await withTimeout(kv.get(`product:${pid}`), 8000).catch(() => null);
        if (!existing || typeof existing !== "object" || Array.isArray(existing)) {
          removeResults.push({ productId: pid, ok: false, error: "not_found" });
          continue;
        }
        const existingSel = Array.isArray((existing as any).selectedVendors)
          ? [...(existing as any).selectedVendors]
          : [];
        const nextSel = existingSel.filter((v: string) => String(v) !== vendorId);
        const updated = {
          ...(existing as object),
          selectedVendors: nextSel,
          updatedAt: new Date().toISOString(),
        };
        await withTimeout(kv.set(`product:${pid}`, updated), 8000);
        queueProductReadModelSync(pid, updated);
        removeResults.push({ productId: pid, ok: true });
      } catch (e: any) {
        removeResults.push({ productId: pid, ok: false, error: String(e?.message || e) });
      }
    }

    const addResults: { productId: string; ok: boolean; error?: string }[] = [];
    for (const rawId of productIds) {
      const pid = String(rawId ?? "").trim();
      if (!pid) continue;
      try {
        const existing = await withTimeout(kv.get(`product:${pid}`), 8000).catch(() => null);
        if (!existing || typeof existing !== "object" || Array.isArray(existing)) {
          addResults.push({ productId: pid, ok: false, error: "not_found" });
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
        queueProductReadModelSync(pid, updated);
        addResults.push({ productId: pid, ok: true });
      } catch (e: any) {
        addResults.push({ productId: pid, ok: false, error: String(e?.message || e) });
      }
    }

    invalidateDashboardCache();
    clearCache("products");

    const added = addResults.filter((r) => r.ok).length;
    const addFailed = addResults.length - added;
    const removed = removeResults.filter((r) => r.ok).length;
    const removeFailed = removeResults.length - removed;
    const totalOk = added + removed;
    const totalFail = addFailed + removeFailed;

    return c.json({
      success: totalOk > 0,
      added,
      addFailed,
      removed,
      removeFailed,
      removeResults,
      addResults,
      updated: totalOk,
      failed: totalFail,
    });
  } catch (error: any) {
    console.error("❌ bulk-assign-vendor:", error);
    return c.json({ error: error?.message || "Failed to update vendor products" }, 500);
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
    const rawBody = await c.req.json();
    const performedByUserId =
      typeof rawBody.performedByUserId === "string" ? rawBody.performedByUserId.trim() : "";
    const { performedByUserId: _actorStrip, ...body } = rawBody;
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
    
    // Check all submitted SKUs: main products use `sku`; variant products use every variant SKU.
    const skuCheck = await checkProductSkusUniqueness(productData);
    if (!skuCheck.isUnique) {
      return c.json({ 
        error: "SKU already exists",
        details: skuCheck.duplicateWithinProduct
          ? `SKU "${skuCheck.sku}" is duplicated inside this product`
          : `SKU "${skuCheck.sku}" is already used in product: ${skuCheck.existingProduct?.id}`
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
      queueProductReadModelSync(id, productData);
      console.log(`✅ Product saved successfully: ${id}`);

      const pname = String(productData.name || productData.title || "Product").slice(0, 160);
      const psku = String(productData.sku || "—");
      await appendStaffActivity(performedByUserId, {
        type: "product_created",
        action: "Product created",
        detail: `${pname} · SKU ${psku}`,
      });
      
      // 🗑️ Invalidate dashboard + product list caches since we created a new product
      invalidateDashboardCache();
      clearCache("products");
      
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
    const rawBody = await c.req.json();
    const performedByUserId =
      typeof rawBody.performedByUserId === "string" ? rawBody.performedByUserId.trim() : "";
    const {
      performedByUserId: _actorStrip,
      _addToSelectedVendors,
      selectedVendors: bodySelectedVendors,
      ...restPatch
    } = rawBody;
    
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
    const patchKeys = Object.keys(rawBody || {}).filter((k) => k !== "performedByUserId");
    const isVendorOnlyUpdate =
      patchKeys.length > 0 &&
      patchKeys.every((k) => k === "selectedVendors" || k === "_addToSelectedVendors");

    if (!isVendorOnlyUpdate) {
      const skuCheck = await checkProductSkusUniqueness(updatedProduct, id);
      if (!skuCheck.isUnique) {
        return c.json({ 
          error: "SKU already exists",
          details: skuCheck.duplicateWithinProduct
            ? `SKU "${skuCheck.sku}" is duplicated inside this product`
            : `SKU "${skuCheck.sku}" is already used in product: ${skuCheck.existingProduct?.id}`
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
      queueProductReadModelSync(id, updatedProduct);
      console.log(`✅ Product updated successfully: ${id}`);

      const removedImageRefs = refsRemovedSinceUpdate(
        collectProductImageRefs(existingProduct),
        collectProductImageRefs(updatedProduct)
      );
      await deleteOwnedStorageRefs(supabase, removedImageRefs);

      const uname = String(updatedProduct.name || updatedProduct.title || "Product").slice(0, 160);
      const usku = String(updatedProduct.sku || "—");
      await appendStaffActivity(performedByUserId, {
        type: "product_updated",
        action: "Product updated",
        detail: `${uname} · SKU ${usku}`,
      });
      
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
    const performedByUserId = String(c.req.query("performedByUserId") || "").trim();
    
    console.log(`🗑️ Deleting product: ${id}`);
    const existingProduct = await withTimeout(kv.get(`product:${id}`), 5000);
    if (!existingProduct) {
      return c.json({ error: "Product not found" }, 404);
    }
    
    await withTimeout(kv.del(`product:${id}`), 5000);
    queueProductReadModelDelete(id);
    console.log(`✅ Product deleted: ${id}`);

    const dname = String(existingProduct.name || existingProduct.title || id).slice(0, 160);
    const dsku = String(existingProduct.sku || "—");
    await appendStaffActivity(performedByUserId || undefined, {
      type: "product_deleted",
      action: "Product deleted",
      detail: `${dname} · SKU ${dsku}`,
    });

    await deleteOwnedStorageRefs(supabase, collectProductImageRefs(existingProduct));
    
    // 🗑️ Invalidate dashboard + product list caches since we deleted a product
    invalidateDashboardCache();
    clearCache("products");
    
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
        queueProductReadModelSync(product.id, product);
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

/** When `page` query is set, return a slice + aggregates; legacy clients omit `page` and get the full list. */
function parseAdminOrdersPageQuery(c: any) {
  const pageQ = c.req.query("page");
  if (pageQ === undefined || pageQ === "") return null;
  const page = Math.max(1, parseInt(String(pageQ), 10) || 1);
  const pageSize = Math.min(
    100,
    Math.max(1, parseInt(String(c.req.query("pageSize") || "20"), 10) || 20)
  );
  return {
    page,
    pageSize,
    q: String(c.req.query("q") || "")
      .trim()
      .toLowerCase(),
    status: String(c.req.query("status") || "all").toLowerCase(),
    payment: String(c.req.query("payment") || "all").toLowerCase(),
    vendor: String(c.req.query("vendor") || "all").trim(),
    dateFrom: String(c.req.query("dateFrom") || ""),
    dateTo: String(c.req.query("dateTo") || ""),
    sort: String(c.req.query("sort") || "newest").toLowerCase(),
  };
}

function filterSortOrdersAdmin(minimalOrders: any[], opts: NonNullable<ReturnType<typeof parseAdminOrdersPageQuery>>) {
  let rows = minimalOrders.filter((order: any) => {
    if (opts.status !== "all" && String(order.status || "") !== opts.status) return false;
    if (opts.payment !== "all" && String(order.paymentStatus || "") !== opts.payment) return false;
    const vendorLabel = order.vendor || "SECURE Store";
    if (opts.vendor !== "all" && vendorLabel !== opts.vendor) return false;
    const orderDate = new Date(order.date || order.createdAt || 0);
    if (opts.dateFrom) {
      const from = new Date(opts.dateFrom);
      if (!Number.isNaN(from.getTime()) && orderDate < from) return false;
    }
    if (opts.dateTo) {
      const to = new Date(opts.dateTo + "T23:59:59.999Z");
      if (!Number.isNaN(to.getTime()) && orderDate > to) return false;
    }
    if (opts.q) {
      const customerHay =
        typeof order.customer === "string"
          ? order.customer
          : JSON.stringify(order.customer ?? "");
      const hay = [
        String(order.orderNumber || "").toLowerCase(),
        String(customerHay || "").toLowerCase(),
        String(order.email || "").toLowerCase(),
        String(order.phone || "").toLowerCase(),
        String(order.id || "").toLowerCase(),
      ];
      if (!hay.some((h) => h.includes(opts.q))) return false;
    }
    return true;
  });
  rows.sort((a: any, b: any) => {
    const dateA = new Date(a.createdAt || a.date || 0).getTime();
    const dateB = new Date(b.createdAt || b.date || 0).getTime();
    return opts.sort === "oldest" ? dateA - dateB : dateB - dateA;
  });
  return rows;
}

function buildAdminOrdersAggregates(filtered: any[]) {
  const filteredTotalRevenue = filtered
    .filter((o: any) => o.status !== "cancelled")
    .reduce((s: number, o: any) => s + (Number(o.total) || 0), 0);
  const uniqueVendors = [...new Set(filtered.map((o: any) => o.vendor || "SECURE Store"))].sort();
  const vendorRev = new Map<string, number>();
  for (const o of filtered) {
    if (o.status === "cancelled") continue;
    const v = o.vendor || "SECURE Store";
    vendorRev.set(v, (vendorRev.get(v) || 0) + (Number(o.total) || 0));
  }
  const vendorRevenue = [...vendorRev.entries()]
    .map(([vendor, revenue]) => ({ vendor, revenue }))
    .sort((a, b) => b.revenue - a.revenue);
  return {
    filteredCount: filtered.length,
    filteredTotalRevenue,
    filteredAvgOrderValue:
      filtered.length > 0 ? filteredTotalRevenue / filtered.length : 0,
    statusBreakdown: {
      pending: filtered.filter((o: any) => o.status === "pending").length,
      processing: filtered.filter((o: any) => o.status === "processing").length,
      fulfilled: filtered.filter((o: any) => o.status === "fulfilled").length,
      cancelled: filtered.filter((o: any) => o.status === "cancelled").length,
    },
    uniqueVendors,
    vendorRevenue,
  };
}

function jsonAdminOrdersPage(
  minimalOrders: any[],
  c: any,
  extra?: { warning?: string; cached?: boolean }
) {
  const opts = parseAdminOrdersPageQuery(c);
  if (!opts) return null;
  const filtered = filterSortOrdersAdmin(minimalOrders, opts);
  const aggregates = buildAdminOrdersAggregates(filtered);
  const slice = filtered.slice((opts.page - 1) * opts.pageSize, opts.page * opts.pageSize);
  return {
    orders: slice,
    total: filtered.length,
    page: opts.page,
    pageSize: opts.pageSize,
    hasMore: opts.page * opts.pageSize < filtered.length,
    aggregates,
    ...(extra?.warning ? { warning: extra.warning } : {}),
    ...(extra?.cached ? { cached: true } : {}),
  };
}

async function jsonAdminOrdersPageFromReadModel(
  opts: NonNullable<ReturnType<typeof parseAdminOrdersPageQuery>>
): Promise<Record<string, unknown> | null> {
  try {
    const { data, error } = await supabase.rpc("rpc_admin_orders_page", {
      p_page: opts.page,
      p_page_size: opts.pageSize,
      p_q: opts.q || null,
      p_status: opts.status || "all",
      p_payment: opts.payment || "all",
      p_vendor: opts.vendor || "all",
      p_date_from: opts.dateFrom || null,
      p_date_to: opts.dateTo || null,
      p_sort: opts.sort || "newest",
    });
    if (error) {
      console.warn("[orders] read-model page unavailable:", error.message);
      return null;
    }
    if (!data || typeof data !== "object" || Array.isArray(data)) return null;
    const body = data as Record<string, unknown>;
    const readModelRows = Number(body.readModelRows ?? 0);
    if (readModelRows <= 0) {
      // Migration may be applied before backfill. Do not show a false-empty admin list.
      return null;
    }
    return {
      orders: Array.isArray(body.orders) ? body.orders : [],
      total: Number(body.total ?? 0),
      page: Number(body.page ?? opts.page),
      pageSize: Number(body.pageSize ?? opts.pageSize),
      hasMore: Boolean(body.hasMore),
      aggregates: body.aggregates && typeof body.aggregates === "object" ? body.aggregates : undefined,
      readModel: true,
    };
  } catch (error) {
    console.warn("[orders] read-model page failed:", error);
    return null;
  }
}

function orderCanonicalKey(order: any): string {
  const byNumber = String(order?.orderNumber || "").trim();
  if (byNumber) return `num:${byNumber.toLowerCase()}`;
  const byId = String(order?.id || "").trim();
  if (byId) return `id:${byId}`;
  return "";
}

function orderFreshness(order: any): number {
  return Math.max(
    new Date(order?.updatedAt || 0).getTime() || 0,
    new Date(order?.createdAt || order?.date || 0).getTime() || 0
  );
}

function dedupeOrdersByCanonical(rows: any[]): any[] {
  const out = new Map<string, any>();
  for (const row of Array.isArray(rows) ? rows : []) {
    const key = orderCanonicalKey(row);
    if (!key) continue;
    const prev = out.get(key);
    if (!prev || orderFreshness(row) >= orderFreshness(prev)) {
      out.set(key, row);
    }
  }
  return [...out.values()];
}

app.get("/make-server-16010b6f/orders", async (c) => {
  try {
    // Check if client is still connected
    if (c.req.raw?.signal?.aborted) {
      console.log("⚠️ Client disconnected before orders fetch");
      return new Response(null, { status: 499 });
    }
    
    console.log("📋 Fetching orders...");
    
    const pageOpts = parseAdminOrdersPageQuery(c);

    if (pageOpts) {
      const readModelBody = await jsonAdminOrdersPageFromReadModel(pageOpts);
      if (readModelBody) {
        return c.json(readModelBody);
      }
    }

    // Check server-side cache first (30 second TTL)
    const cached = getCached('orders_minimal', 30000);
    if (cached && Array.isArray(cached.orders)) {
      console.log("⚡ Returning cached orders");
      if (pageOpts) {
        const body = jsonAdminOrdersPage(cached.orders, c, { cached: false, warning: cached.warning });
        if (body) return c.json(body);
      }
      return c.json(cached);
    }
    
    // Check for stale cache (up to 10min old)
    const staleCache = getCached('orders_minimal', 600000);
    if (staleCache && Array.isArray(staleCache.orders)) {
      console.log("⚡ Returning stale cache");
      if (pageOpts) {
        const body = jsonAdminOrdersPage(staleCache.orders, c, {
          cached: true,
          warning: staleCache.warning,
        });
        if (body) return c.json(body);
      }
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
      
      const minimalOrders = dedupeOrdersByCanonical(validOrders.map(order => {
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
            inventoryDeducted: order.inventoryDeducted === true,
            refundStatus: String(order?.kpay?.refund?.status || "").trim().toLowerCase(),
            refundRequestNo: String(order?.kpay?.refund?.refundRequestNo || "").trim(),
            refundAmount: Number(order?.kpay?.refund?.amount || 0) || 0,
            refundedAt: String(order?.kpay?.refund?.refundedAt || order?.kpay?.refund?.failedAt || "").trim(),
            date: order.date || order.createdAt || new Date().toISOString(),
            createdAt: order.createdAt || new Date().toISOString(),
            updatedAt: order.updatedAt || new Date().toISOString(),
          };
        } catch (mapError) {
          console.error("❌ Error mapping order:", mapError);
          return null;
        }
      }).filter(o => o !== null));
      
      const response = {
        orders: minimalOrders,
        total: minimalOrders.length
      };
      
      // Cache the result
      setCache('orders_minimal', response);

      if (pageOpts) {
        const body = jsonAdminOrdersPage(minimalOrders, c);
        if (body) return c.json(body);
      }
      
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
    const resolved = await resolveOrderStorage(id);
    if (!resolved) {
      return c.json({ error: "Order not found" }, 404);
    }
    const { record, orderKvId } = resolved;
    return c.json({ order: { ...record, id: orderKvId } });
  } catch (error) {
    console.error("❌ Error fetching order:", error);
    return c.json({ error: "Failed to fetch order" }, 500);
  }
});

app.get("/make-server-16010b6f/orders/:id/refund-status", async (c) => {
  try {
    const id = c.req.param("id");
    /** Poll requests pass sync=0 — read-only; avoids 504 from VPS retry on every poll. */
    const syncRequested = c.req.query("sync") !== "0";
    let resolved = await resolveOrderStorage(id);
    if (!resolved) {
      return c.json({ error: "Order not found" }, 404);
    }
    const merchantOrderId = String(
      resolved.record?.kpay?.merchantOrderId || resolved.record?.orderNumber || resolved.orderKvId || ""
    ).trim();
    if (merchantOrderId && syncRequested) {
      try {
        const synced = await withTimeout(
          syncOrderRefundForResolved(
            { storageKey: resolved.storageKey, record: resolved.record },
            merchantOrderId,
            { allowVpsRetry: false },
          ),
          8000,
        );
        if (synced) {
          serverCache.delete("orders_minimal");
          const refreshed = await withTimeout(kv.get(resolved.storageKey), 5000);
          if (refreshed && typeof refreshed === "object") {
            resolved = { ...resolved, record: refreshed };
          }
        }
      } catch (syncErr) {
        console.warn("[kpay] refund-status reconcile skipped:", syncErr);
      }
    }
    const { record, orderKvId } = resolved;
    const txn = merchantOrderId
      ? ((await withTimeout(kv.get(`kpay_txn:${merchantOrderId}`), 5000)) as any)
      : null;
    const orderRefund = record?.kpay?.refund || null;
    const txnRefund = txn?.refund || null;
    const merged = txnRefund || orderRefund || null;
    const mergedStatus = String(merged?.status || "").toLowerCase();
    const mergedNetworkErr = String(merged?.networkError || "").toLowerCase();
    const retryRequested = c.req.query("retry") === "1";

    /** After fixing KPAY_PATH_REFUND, re-queue a failed timeout refund (background — no VPS wait here). */
    if (
      syncRequested &&
      retryRequested &&
      merchantOrderId &&
      mergedStatus === "failed" &&
      (mergedNetworkErr === "kpay-timeout" ||
        mergedNetworkErr.includes("timeout") ||
        mergedNetworkErr.includes("abort"))
    ) {
      enqueueKPayRefundAndPatchOrder({
        merchantOrderId,
        amount: record?.total,
        reason: "Manual refund retry after timeout",
        refundRequestNo: `RFND-${merchantOrderId}-${Date.now()}`,
      });
    }

    const liveUrls = getKPayResolvedEndpointUrls();
    return c.json({
      success: true,
      orderId: orderKvId,
      orderNumber: record?.orderNumber || "",
      merchantOrderId,
      paymentMethod: record?.paymentMethod || "",
      paymentStatus: record?.paymentStatus || "",
      status: record?.status || "",
      retryEnqueued: Boolean(retryRequested && mergedStatus === "failed"),
      /** Live config — compare to refund.endpointUsed (last attempt, may be stale). */
      configuredRefundUrl: liveUrls.refund,
      refundConfiguredVia: liveUrls.refundConfiguredVia,
      refund: merged
        ? {
            status: String(merged.status || "").toLowerCase() || "unknown",
            refundRequestNo: merged.refundRequestNo || "",
            amount: Number(merged.amount || 0) || 0,
            providerStatus: merged.providerStatus || "",
            endpointUsed: merged.endpointUsed || "",
            refundedAt: merged.refundedAt || "",
            failedAt: merged.failedAt || "",
            networkError: merged.networkError || "",
            details: merged.details || {},
          }
        : null,
    });
  } catch (error) {
    console.error("❌ Error fetching refund status:", error);
    return c.json({ error: "Failed to fetch refund status" }, 500);
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
    
    // De-duplicate legacy duplicate rows (same order id/orderNumber under different KV keys).
    const dedup = new Map<string, any>();
    const score = (o: any) =>
      Math.max(
        new Date(o?.updatedAt || 0).getTime() || 0,
        new Date(o?.createdAt || o?.date || 0).getTime() || 0
      );
    for (const order of userOrders) {
      const canonical =
        String(order?.id || "").trim() ||
        String(order?.orderNumber || "").trim() ||
        "";
      if (!canonical) continue;
      const prev = dedup.get(canonical);
      if (!prev || score(order) >= score(prev)) {
        dedup.set(canonical, order);
      }
    }
    const finalSortedOrders = dedupeOrdersByCanonical([...dedup.values()]).sort((a: any, b: any) => {
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

function formatOrderStatusLabel(status: unknown): string {
  const normalized = normalizeOrderStatus(String(status || ""));
  if (normalized === "cancelled") return "cancelled";
  if (normalized === "fulfilled") return "fulfilled";
  if (normalized === "processing") return "processing";
  if (normalized === "pending") return "pending";
  if (normalized === "ready-to-ship") return "ready to ship";
  const raw = String(status || "").trim();
  return raw ? raw.replace(/_/g, " ") : "unknown";
}

function buildOrderActivityDetail(
  orderNumber: string,
  nextStatus: unknown,
  statusChanged: boolean,
): string {
  const orderId = String(orderNumber || "").trim() || "Order";
  if (!statusChanged) return `${orderId} · updated`;
  const next = formatOrderStatusLabel(nextStatus);
  return `${orderId} : ${next}`;
}

/** Resolve KV row for GET/PUT/DELETE when :id is the canonical key, document id, or orderNumber. */
async function resolveOrderStorage(orderIdParam: string): Promise<{
  record: any;
  storageKey: string;
  orderKvId: string;
} | null> {
  const trimmed = String(orderIdParam || "").trim();
  if (!trimmed) return null;

  const direct = await withTimeout(kv.get(`order:${trimmed}`), 5000);
  if (direct && typeof direct === "object") {
    return { record: direct, storageKey: `order:${trimmed}`, orderKvId: trimmed };
  }

  const mappedRaw = await withTimeout(kv.get(`order_num:${trimmed}`), 5000).catch(() => null);
  const mappedId = String(mappedRaw ?? "").trim();
  if (mappedId) {
    const mapped = await withTimeout(kv.get(`order:${mappedId}`), 5000).catch(() => null);
    if (mapped && typeof mapped === "object") {
      return { record: mapped, storageKey: `order:${mappedId}`, orderKvId: mappedId };
    }
  }

  const refKvId = `order_ref_${encodeURIComponent(trimmed)}`;
  if (refKvId !== trimmed) {
    const refOrder = await withTimeout(kv.get(`order:${refKvId}`), 5000).catch(() => null);
    if (refOrder && typeof refOrder === "object") {
      return { record: refOrder, storageKey: `order:${refKvId}`, orderKvId: refKvId };
    }
  }

  try {
    const rows = await withTimeout(kv.getByPrefixWithKeys("order:"), 8000);
    const match = rows.find(
      ({ value: o }) =>
        o &&
        typeof o === "object" &&
        (String(o.id || "").trim() === trimmed ||
          String(o.orderNumber || "").trim() === trimmed),
    );
    if (!match) return null;
    const storageKey = match.key;
    const orderKvId = storageKey.startsWith("order:")
      ? storageKey.slice("order:".length)
      : storageKey;
    return { record: match.value, storageKey, orderKvId };
  } catch (e) {
    console.error("resolveOrderStorage: scan failed", e);
    return null;
  }
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

function collectStockProductIdCandidates(item: any): string[] {
  const out: string[] = [];
  const add = (value: unknown) => {
    const s = String(value ?? "").trim();
    if (s && !out.includes(s)) out.push(s);
  };
  const effective = lineItemWithNormalizedProductRef(item);
  add(effective.productId);
  add(effective.product_id);
  add(effective.parentId);
  add(effective.parentProductId);
  add(effective.product?.id);
  return out;
}

async function loadProductsForStockLineItems(items: any[]): Promise<any[]> {
  const productsById = new Map<string, any>();
  const addProduct = (product: any) => {
    const id = String(product?.id ?? "").trim();
    if (id) productsById.set(id, product);
  };

  for (const item of items) {
    const effective = lineItemWithNormalizedProductRef(item);
    let resolved = false;

    for (const candidate of collectStockProductIdCandidates(effective)) {
      const product = await withTimeout(kv.get(`product:${candidate}`), 5000).catch(() => null);
      if (product && typeof product === "object") {
        addProduct(product);
        resolved = true;
        break;
      }
    }

    if (resolved) continue;

    const mappedProductId = await findProductIdFromReadModelSkuOrVariant({
      variantId: effective.productId,
      sku: effective.sku,
    });
    if (!mappedProductId || productsById.has(mappedProductId)) continue;

    const product = await withTimeout(kv.get(`product:${mappedProductId}`), 5000).catch(() => null);
    if (product && typeof product === "object") {
      addProduct(product);
    }
  }

  return [...productsById.values()];
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

function isOnlyCatalogLoadFailure(stockIssues: any[]): boolean {
  if (!Array.isArray(stockIssues) || stockIssues.length === 0) return false;
  return stockIssues.every((issue: any) =>
    String(issue?.issue || "").toLowerCase().includes("error loading products")
  );
}

async function validateStockForOrderLineItems(
  items: any[]
): Promise<{ ok: true } | { ok: false; stockIssues: any[] }> {
  const stockIssues: any[] = [];
  let allProducts: any[] = [];
  try {
    allProducts = await loadProductsForStockLineItems(items);
  } catch {
    stockIssues.push({
      productId: "",
      productName: "Unknown Product",
      issue: "Error loading products for stock check",
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
      const trackQty = product.trackQuantity !== false;
      const continueSelling = !!product.continueSellingOutOfStock;
      if (!trackQty || continueSelling) continue;

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
    allProducts = await loadProductsForStockLineItems(items);
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
      const trackQty = product.trackQuantity !== false;
      if (!trackQty) continue;

      const qty = item.quantity || 1;
      const sign = direction === "deduct" ? -1 : 1;
      const delta = sign * qty;
      const allowNegative = !!product.continueSellingOutOfStock;

      let oldStock = 0;
      let newStock = 0;

      if (variantIndex >= 0) {
        const v = product.variants[variantIndex];
        oldStock = Number(v.inventory ?? v.stock ?? 0);
        if (direction === "deduct") {
          newStock = allowNegative ? oldStock - qty : Math.max(0, oldStock - qty);
        } else {
          newStock = oldStock + qty;
        }
        product.variants[variantIndex] = {
          ...v,
          inventory: newStock,
          stock: newStock,
          updatedAt: new Date().toISOString(),
        };
        recomputeParentStockFromVariants(product);
      } else {
        oldStock = Number(product.inventory ?? product.stock ?? 0);
        if (direction === "deduct") {
          newStock = allowNegative ? oldStock - qty : Math.max(0, oldStock - qty);
        } else {
          newStock = oldStock + qty;
        }
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
      queueProductReadModelSync(id, product);
    }
  }
  serverCache.delete("all_products");
}

app.post("/make-server-16010b6f/orders", async (c) => {
  try {
    console.log("📦 Creating new order...");
    const body = await c.req.json();
    const requestedOrderNumber =
      String(body?.orderNumber || body?.kpay?.merchantOrderId || "").trim();

    // Idempotency guard: prevent duplicate creates for the same logical order (especially PWA retries).
    if (requestedOrderNumber) {
      const mappedId = await withTimeout(kv.get(`order_num:${requestedOrderNumber}`), 5000).catch(() => null);
      if (typeof mappedId === "string" && mappedId.trim()) {
        const existingByMap = await withTimeout(kv.get(`order:${mappedId}`), 5000).catch(() => null);
        if (existingByMap && typeof existingByMap === "object") {
          return c.json({ success: true, order: existingByMap, duplicateIgnored: true }, 200);
        }
      }
      // Backward-compatible fallback for older rows without order_num mapping
      const rows = await withTimeout(kv.getByPrefix("order:"), 10000).catch(() => []);
      const existing = (Array.isArray(rows) ? rows : []).find(
        (o: any) => String(o?.orderNumber || "").trim() === requestedOrderNumber
      );
      if (existing && typeof existing === "object") {
        const eid = String((existing as any).id || "").trim();
        if (eid) {
          await withTimeout(kv.set(`order_num:${requestedOrderNumber}`, eid), 5000).catch(() => {});
        }
        return c.json({ success: true, order: existing, duplicateIgnored: true }, 200);
      }
    }

    const deterministicOrderId = requestedOrderNumber
      ? `order_ref_${encodeURIComponent(requestedOrderNumber)}`
      : "";
    const id = deterministicOrderId || `order_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
    
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
          const trackQty = product.trackQuantity !== false;
          const continueSelling = !!product.continueSellingOutOfStock;
          if (!trackQty || continueSelling) continue;

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
      ...applyNormalizedShippingToOrderBody(body),
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
    queueOrderReadModelSync(id, orderData);
    if (requestedOrderNumber) {
      await withTimeout(kv.set(`order_num:${requestedOrderNumber}`, id), 5000).catch(() => {});
    }
    
    // Clear cache when order is created
    serverCache.delete('orders_minimal');
    
    console.log(`✅ Order ${orderData.orderNumber} created successfully`);

    queueMetaCapiPurchaseFromOrder(orderData);
    
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

    const resolved = await resolveOrderStorage(id);
    if (!resolved) {
      return c.json({ error: "Order not found" }, 404);
    }
    const { record: existingOrder, storageKey, orderKvId } = resolved;
    
    const prevNorm = normalizeOrderStatus(existingOrder.status);
    const newStatusRaw = body.status !== undefined ? body.status : existingOrder.status;
    const newNorm = normalizeOrderStatus(newStatusRaw);
    const wasCancelled = prevNorm === "cancelled";
    const isNowCancelled = newNorm === "cancelled";
    const items = existingOrder.items && Array.isArray(existingOrder.items) ? existingOrder.items : [];
    const paymentStatus = String(existingOrder.paymentStatus || "").toLowerCase();
    const kpayStatus = String(existingOrder?.kpay?.status || "").toLowerCase();
    const isPaidOrder = paymentStatus === "paid" || kpayStatus === "paid";
    const paymentMethodText = String(existingOrder.paymentMethod || "").toLowerCase();
    const isKPayOrder =
      paymentMethodText.includes("kpay") ||
      paymentMethodText.includes("kbzpay") ||
      paymentMethodText.includes("kbz pay") ||
      Boolean(existingOrder?.kpay?.merchantOrderId);
    let refundResult:
      | null
      | {
          ok: true;
          alreadyRefunded: boolean;
          refundState: "success" | "processing";
          merchantOrderId: string;
          refundRequestNo: string;
          refundAmount: string;
          providerStatus: string;
          endpointUsed?: string;
        } = null;

    let nextInventoryFlag: boolean | undefined = existingOrder.inventoryDeducted;
    let inventoryRestored = false;
    let inventoryDeducted = false;

    let refundPendingAfterTimeout = false;

    // Paid KPay cancel: never block the order PUT on VPS/KBZ refund (runs in background).
    if (!wasCancelled && isNowCancelled && isPaidOrder && isKPayOrder) {
      const merchantOrderId = String(
        existingOrder?.kpay?.merchantOrderId || existingOrder.orderNumber || orderKvId || ""
      ).trim();
      const refundRequestNo = `RFND-${merchantOrderId}-${Date.now()}`;
      const existingTxn = (await kv.get(`kpay_txn:${merchantOrderId}`)) as Record<string, unknown> | null;
      const prevTxnRefund =
        existingTxn?.refund && typeof existingTxn.refund === "object"
          ? (existingTxn.refund as Record<string, unknown>)
          : {};
      const orderKpay =
        existingOrder?.kpay && typeof existingOrder.kpay === "object"
          ? (existingOrder.kpay as Record<string, unknown>)
          : {};
      const orderKpayRefund =
        orderKpay.refund && typeof orderKpay.refund === "object"
          ? (orderKpay.refund as Record<string, unknown>)
          : {};
      const payStatus = String(existingOrder?.paymentStatus || "").toLowerCase();
      const prevStatus = String(prevTxnRefund.status || "").toLowerCase();
      const orderRefundStatus = String(orderKpayRefund.status || "").toLowerCase();

      if (
        prevStatus === "success" ||
        orderRefundStatus === "success" ||
        payStatus === "refunded"
      ) {
        refundResult = {
          ok: true,
          alreadyRefunded: true,
          refundState: "success",
          merchantOrderId,
          refundRequestNo: String(orderKpayRefund.refundRequestNo || prevTxnRefund.refundRequestNo || refundRequestNo),
          refundAmount: String(orderKpayRefund.amount || prevTxnRefund.amount || existingOrder.total || ""),
          providerStatus: String(orderKpayRefund.providerStatus || prevTxnRefund.providerStatus || "REFUNDED"),
          endpointUsed: String(orderKpayRefund.endpointUsed || prevTxnRefund.endpointUsed || ""),
        };
      } else if (
        payStatus === "pending_refund" ||
        orderRefundStatus === "processing" ||
        prevStatus === "processing"
      ) {
        refundPendingAfterTimeout = true;
        refundResult = {
          ok: true,
          alreadyRefunded: false,
          refundState: "processing",
          merchantOrderId,
          refundRequestNo: String(orderKpayRefund.refundRequestNo || prevTxnRefund.refundRequestNo || refundRequestNo),
          refundAmount: String(orderKpayRefund.amount || existingOrder.total || ""),
          providerStatus: String(orderKpayRefund.providerStatus || "REFUND_PENDING"),
          endpointUsed: String(orderKpayRefund.endpointUsed || ""),
        };
      } else {
        enqueueKPayRefundAndPatchOrder({
          merchantOrderId,
          amount: existingOrder.total,
          reason: "Order cancelled by admin",
          refundRequestNo,
        });
        refundPendingAfterTimeout = true;
        refundResult = {
          ok: true,
          alreadyRefunded: false,
          refundState: "processing",
          merchantOrderId,
          refundRequestNo,
          refundAmount: String(existingOrder.total ?? ""),
          providerStatus: "REFUND_ENQUEUED",
          endpointUsed: "",
        };
      }
    }

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
        // Keep order-status UX reliable: if catalog read failed transiently,
        // do not reject the status update itself.
        if (isOnlyCatalogLoadFailure(chk.stockIssues)) {
          console.warn(
            `⚠️ Stock precheck skipped for ${existingOrder.orderNumber}: catalog load failure`
          );
        } else {
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
      } else {
        await applyOrderItemsStockDelta(items, "deduct");
        inventoryDeducted = true;
        nextInventoryFlag = true;
      }
    }

    if (inventoryRestored) {
      console.log(`✅ Stock restore complete for order ${existingOrder.orderNumber}`);
    }
    if (inventoryDeducted) {
      console.log(`✅ Stock deduction complete for order ${existingOrder.orderNumber}`);
    }

    const prevPaymentStatus = String(existingOrder.paymentStatus || "").toLowerCase();
    const resolvedPaymentStatus =
      refundResult && isNowCancelled
        ? refundResult.refundState === "success"
          ? "refunded"
          : "pending_refund"
        : !wasCancelled && isNowCancelled
          ? prevPaymentStatus === "refunded"
            ? "refunded"
            : "pending_refund"
          : (body.paymentStatus ?? existingOrder.paymentStatus);

    const updatedOrder = {
      ...existingOrder,
      ...body,
      id: orderKvId,
      updatedAt: new Date().toISOString(),
      inventoryDeducted: nextInventoryFlag,
      shippingStatus: isNowCancelled
        ? "cancelled"
        : (body.shippingStatus ?? existingOrder.shippingStatus ?? "pending"),
      paymentStatus: resolvedPaymentStatus,
      kpay:
        refundResult && isNowCancelled
          ? {
              ...(existingOrder?.kpay || {}),
              ...(body?.kpay || {}),
              merchantOrderId: refundResult.merchantOrderId,
              status: refundResult.refundState === "success" ? "refunded" : "pending_refund",
              refund: {
                status: refundResult.alreadyRefunded
                  ? "already_refunded"
                  : refundResult.refundState === "success"
                    ? "success"
                    : "processing",
                refundRequestNo: refundResult.refundRequestNo,
                amount: refundResult.refundAmount,
                providerStatus: refundResult.providerStatus,
                endpointUsed: refundResult.endpointUsed || "",
                refundedAt: refundResult.refundState === "success" ? new Date().toISOString() : "",
                acceptedAt: new Date().toISOString(),
              },
            }
          : (body?.kpay ?? existingOrder?.kpay),
    };
    
    await withTimeout(kv.set(storageKey, updatedOrder), 5000);
    queueOrderReadModelSync(orderKvId, updatedOrder);

    const nextPaymentStatus = String(updatedOrder.paymentStatus || "").toLowerCase();
    const nextKpayStatus = String((updatedOrder.kpay as Record<string, unknown> | undefined)?.status || "")
      .toLowerCase();
    const becamePaid =
      prevPaymentStatus !== "paid" &&
      (nextPaymentStatus === "paid" || nextKpayStatus === "paid");
    if (becamePaid) {
      queueMetaCapiPurchaseFromOrder(updatedOrder);
    }
    
    // Clear cache when order is updated
    serverCache.delete('orders_minimal');

    const statusChanged = prevNorm !== newNorm;
    const actorFromBody = pickValidActorIdFromRecord(body);
    const actorFromHeader = String(c.req.header("x-actor-user-id") || "").trim();
    const actorId =
      actorFromBody || (isValidStaffActorId(actorFromHeader) ? actorFromHeader : "");
    const orderLabel = String(existingOrder.orderNumber || orderKvId || id).trim();
    await appendStaffActivity(actorId, {
      type: "admin_action",
      action: statusChanged ? "Order status updated" : "Order updated",
      detail: buildOrderActivityDetail(
        orderLabel,
        newStatusRaw,
        statusChanged,
      ),
    });
    
    return c.json({ 
      success: true,
      order: updatedOrder,
      refundPending: refundPendingAfterTimeout,
      message: refundPendingAfterTimeout
        ? "Order cancelled. KBZPay refund is still processing — we will retry automatically."
        : "Order updated successfully",
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

    const resolved = await resolveOrderStorage(id);
    if (!resolved) {
      return c.json({ error: "Order not found" }, 404);
    }
    const { record: existingOrder, storageKey } = resolved;
    
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
    
    // Delete canonical row + any duplicate legacy rows with same id/orderNumber.
    const deleteKeys = new Set<string>([storageKey]);
    const canonicalId = String(existingOrder?.id || "").trim();
    const canonicalOrderNumber = String(existingOrder?.orderNumber || "").trim();
    try {
      const rows = await withTimeout(kv.getByPrefixWithKeys("order:"), 10000);
      for (const row of rows) {
        const o = row?.value;
        if (!o || typeof o !== "object") continue;
        const oid = String((o as any).id || "").trim();
        const onum = String((o as any).orderNumber || "").trim();
        if (
          (canonicalId && oid === canonicalId) ||
          (canonicalOrderNumber && onum === canonicalOrderNumber)
        ) {
          deleteKeys.add(String(row.key));
        }
      }
    } catch {
      // Fallback to deleting only resolved key if scan fails.
    }
    await withTimeout(kv.mdel([...deleteKeys]), 10000);
    if (canonicalId) {
      queueOrderReadModelDelete(canonicalId);
    }
    if (canonicalOrderNumber) {
      await withTimeout(kv.del(`order_num:${canonicalOrderNumber}`), 5000).catch(() => {});
    }
    
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
  const denied = assertDestructiveOperationAllowed(c);
  if (denied) return denied;
  try {
    console.log("🗑️ Deleting ALL orders...");
    
    const orders = await withTimeout(kv.getByPrefix("order:"), 10000);
    const orderIds = orders.map((order: any) => order.id).filter(Boolean);
    
    if (orderIds.length > 0) {
      await withTimeout(kv.mdel(orderIds.map(id => `order:${id}`)), 10000);
      orderIds.forEach((id: string) => queueOrderReadModelDelete(id));
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

function isVendorOwnedCategoryRecord(cat: any): boolean {
  if (!cat || typeof cat !== "object") return false;
  return Boolean(cat.vendorId) || String(cat.id || "").startsWith("category:");
}

function isPlatformCategoryRecord(cat: any): boolean {
  return Boolean(cat && typeof cat === "object" && !isVendorOwnedCategoryRecord(cat));
}

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
      ? categoriesData.filter(isPlatformCategoryRecord)
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

// Get platform categories only (for Migoo Admin). Vendor-owned categories are private to vendor storefronts.
app.get("/make-server-16010b6f/admin/all-categories", async (c) => {
  try {
    console.log("📂 Fetching platform categories for Migoo Admin (vendor categories excluded)...");
    
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
      ? categoriesData.filter(isPlatformCategoryRecord)
      : [];

    let productRows: any[] = [];
    try {
      productRows = await withTimeout(kv.getByPrefix("product:"), 25000);
    } catch {
      productRows = [];
    }
    const productsList = Array.isArray(productRows) ? productRows : [];

    const categoriesWithCounts = validCategories.map((cat: any) => {
      const catName = String(cat?.name || "").trim().toLowerCase();
      const fromPicker = Array.isArray(cat.productIds)
        ? cat.productIds.map((id: unknown) => String(id).trim()).filter(Boolean)
        : [];
      const fromProducts = productsList
        .filter(
          (p: any) =>
            p &&
            typeof p === "object" &&
            String(p.category || "")
              .trim()
              .toLowerCase() === catName &&
            catName
        )
        .map((p: any) => String(p.id || "").trim())
        .filter(Boolean);
      const mergedIds = [...new Set([...fromPicker, ...fromProducts])];
      return {
        ...cat,
        productIds: mergedIds.length > 0 ? mergedIds : fromPicker,
        productCount: mergedIds.length,
      };
    });
    
    console.log(`✅ Found ${categoriesWithCounts.length} platform categories for Migoo Admin`);
    
    return c.json({
      categories: categoriesWithCounts,
      total: categoriesWithCounts.length
    });
  } catch (error) {
    console.error("❌ Error fetching all categories:", error);
    return c.json({ categories: [], total: 0 }, 200);
  }
});

app.get("/make-server-16010b6f/categories/:id", async (c) => {
  try {
    const id = c.req.param("id");
    if (id.startsWith("category:")) {
      return c.json({ error: "Category not found" }, 404);
    }
    const category = await withTimeout(kv.get(`category:${id}`), 5000);
    
    if (!category || isVendorOwnedCategoryRecord(category)) {
      return c.json({ error: "Category not found" }, 404);
    }
    
    return c.json({ category: { id, ...category } });
  } catch (error) {
    console.error("❌ Error fetching category:", error);
    return c.json({ error: "Failed to fetch category" }, 500);
  }
});

/** After category picker save: keep `product.category` in sync with category membership (admin grid + storefront tabs). */
async function syncPlatformCategoryProducts(opts: {
  categoryName: string;
  productIds: string[];
  previousProductIds?: string[];
  previousCategoryName?: string;
}): Promise<void> {
  const name = String(opts.categoryName || "").trim();
  const nextIds = new Set(
    (opts.productIds || []).map((id) => String(id).trim()).filter(Boolean)
  );
  const prevIds = new Set(
    (opts.previousProductIds || []).map((id) => String(id).trim()).filter(Boolean)
  );
  const prevName = String(opts.previousCategoryName || "").trim();
  const prevNameKey = prevName.toLowerCase();
  const nameKey = name.toLowerCase();

  for (const id of nextIds) {
    try {
      const raw = await withTimeout(kv.get(`product:${id}`), 5000);
      if (!raw || typeof raw !== "object") continue;
      const nextProduct = {
        ...(raw as object),
        category: name,
        updatedAt: new Date().toISOString(),
      };
      await withTimeout(kv.set(`product:${id}`, nextProduct), 8000);
      queueProductReadModelSync(id, nextProduct);
    } catch (e) {
      console.warn(`syncPlatformCategoryProducts assign ${id}:`, e);
    }
  }

  const toMaybeClear = new Set<string>([...prevIds]);
  if (prevNameKey) {
    try {
      const all = await withTimeout(kv.getByPrefix("product:"), 20000);
      const rows = Array.isArray(all) ? all : [];
      for (const p of rows) {
        if (!p || typeof p !== "object") continue;
        const pk = String((p as any).category || "")
          .trim()
          .toLowerCase();
        if (pk === prevNameKey || (nameKey && pk === nameKey)) {
          const pid = String((p as any).id || "").trim();
          if (pid && !nextIds.has(pid)) toMaybeClear.add(pid);
        }
      }
    } catch {
      /* non-fatal */
    }
  }

  for (const id of toMaybeClear) {
    if (nextIds.has(id)) continue;
    try {
      const raw = await withTimeout(kv.get(`product:${id}`), 5000);
      if (!raw || typeof raw !== "object") continue;
      const cat = String((raw as any).category || "").trim();
      const catKey = cat.toLowerCase();
      const shouldClear =
        !cat ||
        (nameKey && catKey === nameKey) ||
        (prevNameKey && catKey === prevNameKey);
      if (!shouldClear) continue;
      const nextProduct = {
        ...(raw as object),
        category: "",
        updatedAt: new Date().toISOString(),
      };
      await withTimeout(kv.set(`product:${id}`, nextProduct), 8000);
      queueProductReadModelSync(id, nextProduct);
    } catch (e) {
      console.warn(`syncPlatformCategoryProducts clear ${id}:`, e);
    }
  }

  clearCache("products");
  invalidateDashboardCache();
}

app.post("/make-server-16010b6f/categories", async (c) => {
  try {
    const body = await c.req.json();
    const id = `cat_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
    
    const productIds = body.productIds || [];
    const category = {
      id,
      name: body.name || "",
      description: body.description || "",
      image: body.coverPhoto || body.image || "",
      coverPhoto: body.coverPhoto || "",
      productCount: productIds.length,
      productIds,
      parentCategory: body.parentCategory || "",
      status: body.status || "active",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    
    await withTimeout(kv.set(`category:${id}`, category), 5000);
    console.log(`✅ Category created: ${id} - ${category.name}`);

    await syncPlatformCategoryProducts({
      categoryName: category.name,
      productIds,
    });
    
    // Invalidate categories cache
    serverCache.delete("categories");
    serverCache.delete("platform_categories");
    
    return c.json({ success: true, category });
  } catch (error) {
    console.error("❌ Error creating category:", error);
    return c.json({ error: "Failed to create category" }, 500);
  }
});

app.put("/make-server-16010b6f/categories/:id", async (c) => {
  try {
    const id = c.req.param("id");
    if (id.startsWith("category:")) {
      return c.json({ error: "Use vendor category endpoints for vendor-owned categories." }, 400);
    }
    const body = await c.req.json();
    
    const existing = await withTimeout(kv.get(`category:${id}`), 5000);
    if (!existing) {
      return c.json({ error: "Category not found" }, 404);
    }
    if (isVendorOwnedCategoryRecord(existing)) {
      return c.json({ error: "Use vendor category endpoints for vendor-owned categories." }, 400);
    }
    
    const productIds =
      body.productIds !== undefined ? body.productIds || [] : existing.productIds || [];
    const { vendorId: _ignoredVendorId, vendorName: _ignoredVendorName, ...platformBody } = body;

    const updated = {
      ...existing,
      ...platformBody,
      id,
      productIds,
      productCount: productIds.length,
      updatedAt: new Date().toISOString()
    };
    
    await withTimeout(kv.set(`category:${id}`, updated), 5000);
    console.log(`✅ Category updated: ${id}`);

    await syncPlatformCategoryProducts({
      categoryName: String(updated.name || ""),
      productIds,
      previousProductIds: Array.isArray(existing.productIds) ? existing.productIds : [],
      previousCategoryName: String(existing.name || ""),
    });
    
    // Invalidate categories cache
    serverCache.delete("categories");
    serverCache.delete("platform_categories");
    
    return c.json({ success: true, category: updated });
  } catch (error) {
    console.error("❌ Error updating category:", error);
    return c.json({ error: "Failed to update category" }, 500);
  }
});

app.delete("/make-server-16010b6f/categories/:id", async (c) => {
  try {
    const id = c.req.param("id");
    if (id.startsWith("category:")) {
      return c.json({ error: "Use vendor category endpoints for vendor-owned categories." }, 400);
    }
    
    const deleteKey = `category:${id}`;
    const existing = await withTimeout(kv.get(deleteKey), 5000);
    if (existing?.vendorId) {
      return c.json({ error: "Use vendor category endpoints for vendor-owned categories." }, 400);
    }
    
    console.log(`🗑️ Deleting category with key: ${deleteKey}`);
    await withTimeout(kv.del(deleteKey), 5000);
    console.log(`✅ Category deleted: ${deleteKey}`);
    
    // Invalidate categories cache
    serverCache.delete("categories");
    serverCache.delete("platform_categories");
    
    return c.json({ success: true, message: "Category deleted" });
  } catch (error) {
    console.error("❌ Error deleting category:", error);
    return c.json({ error: "Failed to delete category" }, 500);
  }
});

// Bulk delete categories
app.post("/make-server-16010b6f/categories/bulk-delete", async (c) => {
  const denied = assertDestructiveOperationAllowed(c);
  if (denied) return denied;
  try {
    const body = await c.req.json();
    const ids = body.ids || [];
    
    if (!Array.isArray(ids) || ids.length === 0) {
      return c.json({ error: "No category IDs provided" }, 400);
    }
    
    const vendorCategoryIds = ids.filter((id: unknown) => String(id || "").startsWith("category:"));
    if (vendorCategoryIds.length > 0) {
      return c.json(
        { error: "Use vendor category endpoints for vendor-owned categories." },
        400
      );
    }

    console.log(`🗑️ Bulk deleting ${ids.length} platform categories...`);

    await Promise.all(
      ids.map(id => {
        const deleteKey = `category:${id}`;
        return withTimeout(kv.del(deleteKey), 5000);
      })
    );
    
    console.log(`✅ Deleted ${ids.length} categories successfully`);
    
    // Invalidate categories cache
    serverCache.delete("categories");
    serverCache.delete("platform_categories");
    
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
  const denied = assertDestructiveOperationAllowed(c);
  if (denied) return denied;
  try {
    console.log(`🗑️ Deleting all platform categories...`);
    
    const categories = await withTimeout(kv.getByPrefix("category:"), 30000);
    const validCategories = Array.isArray(categories)
      ? categories.filter(isPlatformCategoryRecord)
      : [];
    
    if (validCategories.length === 0) {
      return c.json({ success: true, message: "No categories to delete", deletedCount: 0 });
    }
    
    // Delete platform categories only; vendor categories are scoped to vendor storefronts.
    await Promise.all(
      validCategories.map(cat => withTimeout(kv.del(`category:${cat.id}`), 25000))
    );
    
    console.log(`✅ Deleted ${validCategories.length} categories successfully`);
    
    // Invalidate categories cache
    serverCache.delete("categories");
    serverCache.delete("platform_categories");
    
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
// CUSTOMERS ENDPOINTS (list/detail/create in customer_routes.tsx)
// ============================================

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
    queueCustomerReadModelSync(id, customerData);
    
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
    queueCustomerReadModelSync(id, updatedCustomer);
    
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
          queueCustomerReadModelSync(String(existingCustomer.id), existingCustomer);
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
      queueCustomerReadModelSync(customerId, customerData);
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

function normalizeVendorLifecycleEmail(email: unknown): string {
  return String(email || "").trim().toLowerCase();
}

type VendorEmailPolicyConflict = {
  blocked: boolean;
  code?: string;
  message?: string;
};

/** One email → one vendor account; block duplicate pending/approved applications too. */
async function vendorEmailPolicyConflict(emailNorm: string): Promise<VendorEmailPolicyConflict> {
  if (!emailNorm) return { blocked: false };

  const [readModelVendor, targetedApplications, validVendors] = await Promise.all([
    findVendorReadModelByEmailNorm(emailNorm),
    withTimeout(kv.findVendorApplicationsByEmailNorm(emailNorm), 8000).catch(() => null),
    withTimeout(kv.getVendorProfiles(), 8000).catch(() => [] as any[]),
  ]);

  if (readModelVendor) {
    return {
      blocked: true,
      code: "VENDOR_EMAIL_TAKEN",
      message: "This email is already registered to a vendor account.",
    };
  }

  const vendorList = Array.isArray(validVendors) ? validVendors : [];
  if (
    vendorList.some(
      (v: any) => normalizeVendorLifecycleEmail(v?.email) === emailNorm
    )
  ) {
    return {
      blocked: true,
      code: "VENDOR_EMAIL_TAKEN",
      message: "This email is already registered to a vendor account.",
    };
  }

  let appList = Array.isArray(targetedApplications) ? targetedApplications : [];
  if (targetedApplications === null) {
    const applications = await withTimeout(kv.getByPrefix("vendor_application:"), 8000).catch(
      () => []
    );
    appList = Array.isArray(applications) ? applications : [];
  }

  const sameEmailApps = appList.filter(
    (a: any) =>
      a &&
      typeof a === "object" &&
      normalizeVendorLifecycleEmail(a.email) === emailNorm
  );

  if (
    sameEmailApps.some(
      (a: any) => String(a?.status || "").toLowerCase() === "pending"
    )
  ) {
    return {
      blocked: true,
      code: "DUPLICATE_PENDING",
      message: "A pending application already exists for this email.",
    };
  }

  if (
    sameEmailApps.some(
      (a: any) => String(a?.status || "").toLowerCase() === "approved"
    )
  ) {
    return {
      blocked: true,
      code: "EMAIL_ALREADY_VENDOR",
      message: "This email is already linked to an approved vendor account.",
    };
  }

  return { blocked: false };
}

// 🔥 Validate vendor email and phone availability (real-time check)
app.post("/make-server-16010b6f/vendors/validate", async (c) => {
  try {
    const body = await c.req.json();
    const { email, phone } = body;
    
    const errors: { email?: string; phone?: string } = {};

    // Check email if provided
    if (email && email.trim()) {
      const emailNorm = normalizeVendorLifecycleEmail(email);
      const conflict = await vendorEmailPolicyConflict(emailNorm);
      if (conflict.blocked) {
        errors.email = conflict.message || "This email cannot be used for a new vendor account.";
      }
    }

    // Check phone if provided
    if (phone && phone.trim()) {
      const validVendors = await withTimeout(kv.getVendorProfiles(), 5000).catch(() => [] as any[]);
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

function compactPublicSlug(value: string): string {
  return String(value || "").toLowerCase().replace(/[^a-z0-9]/g, "");
}

function vendorProfileMatchesPublicSlug(v: any, slug: string): boolean {
  const target = String(slug || "").trim().toLowerCase();
  if (!target) return false;
  if (v.id === target) return true;
  const profileSlug = String(v.storeSlug || "").trim().toLowerCase();
  if (profileSlug && profileSlug === target) return true;
  const hyphenStoreName = v.storeName?.toLowerCase().replace(/\s+/g, "-");
  if (hyphenStoreName === target) return true;
  const hyphenBusinessName = v.businessName?.toLowerCase().replace(/\s+/g, "-");
  if (hyphenBusinessName === target) return true;
  const compactTarget = compactPublicSlug(target);
  if (profileSlug && compactPublicSlug(profileSlug) === compactTarget) return true;
  const compactFromName = storeSlugFromBusinessName(v.storeName || v.businessName || "");
  return compactFromName === compactTarget;
}

function vendorSettingsMatchesPublicSlug(s: any, slug: string): boolean {
  const target = String(slug || "").trim().toLowerCase();
  if (!target) return false;
  const settingsSlug = String(s.storeSlug || "").trim().toLowerCase();
  if (settingsSlug && settingsSlug === target) return true;
  const hyphenStoreName = s.storeName?.toLowerCase().replace(/\s+/g, "-");
  if (hyphenStoreName === target) return true;
  const compactTarget = compactPublicSlug(target);
  if (settingsSlug && compactPublicSlug(settingsSlug) === compactTarget) return true;
  return storeSlugFromBusinessName(s.storeName || "") === compactTarget;
}

// Get vendor by store slug
app.get("/make-server-16010b6f/vendors/by-slug/:slug", async (c) => {
  try {
    const slug = c.req.param('slug');
    console.log(`🔍 Fetching vendor by slug: ${slug}`);
    
    // Check cache first
    const cacheKey = `vendor_by_slug:${slug}`;
    const cached = getCached(cacheKey, 60000); // Cache for 60 seconds
    if (cached) {
      const row = (cached as { vendor?: unknown }).vendor;
      if (row && typeof row === "object" && !vendorProfileAllowsPublicStorefront(row)) {
        clearCache(cacheKey);
      } else {
        console.log(`⚡ Returning cached vendor for slug: ${slug}`);
        return c.json(cached);
      }
    }
    
    // Fetch all vendors and find by slug or ID
    const validVendors = await withTimeout(kv.getVendorProfiles(), 5000);
    
    console.log(`🔍 Searching ${validVendors.length} vendors for slug: ${slug}`);
    
    let vendor: any = null;

    // Fast path: canonical slug → vendorId mapping (same index as /vendor/store/:storeSlug)
    const slugMapping = await withTimeout(kv.get(`vendor_slug_${slug}`), 5000).catch(() => null);
    if (slugMapping?.vendorId) {
      vendor =
        validVendors.find((v: any) => v.id === slugMapping.vendorId) ??
        (await withTimeout(kv.get(`vendor:${slugMapping.vendorId}`), 5000).catch(() => null));
      if (vendor) {
        console.log(`✅ Found vendor by vendor_slug_ mapping: ${slugMapping.vendorId}`);
      }
    }

    // Try to find vendor by storeSlug, storeName, businessName, subdomain label, or ID
    if (!vendor) {
      vendor = validVendors.find((v: any) => {
      console.log(`🔎 Checking vendor:`, {
        id: v.id,
        businessName: v.businessName,
        storeName: v.storeName,
        storeSlug: v.storeSlug,
        email: v.email
      });
      if (vendorProfileMatchesPublicSlug(v, slug)) {
        console.log(`✅ Found vendor by public slug match: ${v.id}`);
        return true;
      }
      return false;
      });
    }
    
    // If not found by settings, check vendor_settings
    if (!vendor) {
      const allSettings = await withTimeout(kv.getByPrefix("vendor_settings:"), 5000);
      const validSettings = Array.isArray(allSettings) ? allSettings.filter(s => s != null) : [];
      
      console.log(`🔍 Checking ${validSettings.length} vendor settings for slug: ${slug}`);
      
      const matchingSettings = validSettings.find((s: any) => vendorSettingsMatchesPublicSlug(s, slug));
      
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
    
    if (!vendorProfileAllowsPublicStorefront(vendor)) {
      console.log(`❌ Vendor not available for public slug lookup: ${vendor.id}`);
      return c.json(
        { error: "This store is not available.", storeUnavailable: true, reason: (vendor as any).status },
        403
      );
    }

    const [settings, storefront] = await Promise.all([
      withTimeout(kv.get(`vendor_settings:${vendor.id}`), 5000),
      withTimeout(kv.get(`vendor_storefront_${vendor.id}`), 5000),
    ]);
    const merged: Record<string, unknown> = { ...vendor, ...settings };
    if (storefront && typeof storefront === "object") {
      if (storefront.storeName) merged.storeName = storefront.storeName;
      if (storefront.storeSlug) merged.storeSlug = storefront.storeSlug;
      if (storefront.logo) merged.logo = storefront.logo;
    }
    const response = { vendor: merged };
    
    // Cache the result
    setCache(cacheKey, response);
    
    console.log(`✅ Found vendor: ${vendor.id}`);
    return c.json(response);
  } catch (error) {
    console.error("❌ Error fetching vendor by slug:", error);
    return c.json({ error: "Failed to fetch vendor" }, 500);
  }
});

/**
 * Lowercase name keys for matching orders/products to a vendor profile.
 * Includes storefront `vendor_settings` (storeName) — often where the public label lives.
 */
function vendorProfileNameKeys(v: any, settings?: any): string[] {
  const keys = [
    v?.name,
    v?.businessName,
    v?.business_name,
    v?.storeName,
    v?.email,
    settings?.storeName,
    settings?.storeSlug,
  ]
    .filter(Boolean)
    .map((x: any) => String(x).trim().toLowerCase())
    .filter(Boolean);
  return [...new Set(keys)];
}

function settingsByVendorIdMap(validSettings: any[]): Map<string, any> {
  const m = new Map<string, any>();
  for (const s of validSettings) {
    if (s && s.vendorId != null) m.set(String(s.vendorId), s);
  }
  return m;
}

/** Per-vendor product counts (KV `product:`) and revenue from non-cancelled orders. */
function aggregateVendorListMetrics(
  validVendors: any[],
  validSettings: any[],
  products: any[] | null | undefined,
  orders: any[] | null | undefined
): { productCountByVendorId: Map<string, number>; revenueByVendorId: Map<string, number> } {
  const vendorIds = new Set(validVendors.map((v: any) => String(v.id)));
  const settingsMap = settingsByVendorIdMap(Array.isArray(validSettings) ? validSettings : []);
  const productCountByVendorId = new Map<string, number>();
  const revenueByVendorId = new Map<string, number>();
  for (const v of validVendors) {
    const id = String(v.id);
    productCountByVendorId.set(id, 0);
    revenueByVendorId.set(id, 0);
  }

  const prodArr = Array.isArray(products) ? products.filter((p) => p != null) : [];
  for (const p of prodArr) {
    if (!p || typeof p !== "object") continue;
    const assigned = new Set<string>();
    const pv = p.vendorId != null ? String(p.vendorId) : "";
    if (pv && pv !== "migoo" && vendorIds.has(pv)) {
      assigned.add(pv);
    }
    if (Array.isArray(p.selectedVendors)) {
      for (const x of p.selectedVendors) {
        const s = String(x);
        if (vendorIds.has(s)) assigned.add(s);
      }
    }
    const pvendorRaw = p.vendor != null ? String(p.vendor).trim() : "";
    if (pvendorRaw) {
      // Many payloads put vendor **id** in `vendor` (see Inventory / migrations), not display name.
      if (vendorIds.has(pvendorRaw)) {
        assigned.add(pvendorRaw);
      } else {
        const pn = pvendorRaw.toLowerCase();
        for (const v of validVendors) {
          const st = settingsMap.get(String(v.id));
          if (vendorProfileNameKeys(v, st).includes(pn)) {
            assigned.add(String(v.id));
            break;
          }
        }
      }
    }
    for (const id of assigned) {
      productCountByVendorId.set(id, (productCountByVendorId.get(id) || 0) + 1);
    }
  }

  const orderArr = Array.isArray(orders) ? orders.filter((o) => o != null) : [];
  for (const order of orderArr) {
    if (!order || typeof order !== "object") continue;
    if (order.status === "cancelled") continue;
    const raw =
      typeof order.total === "string"
        ? parseFloat(String(order.total).replace(/[$,]/g, ""))
        : Number(order.total);
    const orderTotal = Number.isFinite(raw) ? raw : 0;
    let matchedId: string | null = null;
    const oid = order.vendorId != null ? String(order.vendorId) : "";
    if (oid && revenueByVendorId.has(oid)) {
      matchedId = oid;
    } else {
      const ovRaw = order.vendor != null ? String(order.vendor).trim() : "";
      if (ovRaw && vendorIds.has(ovRaw) && revenueByVendorId.has(ovRaw)) {
        matchedId = ovRaw;
      } else if (ovRaw) {
        const vendName = ovRaw.toLowerCase();
        for (const v of validVendors) {
          const st = settingsMap.get(String(v.id));
          if (vendorProfileNameKeys(v, st).includes(vendName)) {
            matchedId = String(v.id);
            break;
          }
        }
      }
    }
    if (matchedId) {
      const next = (revenueByVendorId.get(matchedId) || 0) + orderTotal;
      revenueByVendorId.set(matchedId, Math.round(next * 100) / 100);
    }
  }

  return { productCountByVendorId, revenueByVendorId };
}

app.get("/make-server-16010b6f/vendors", async (c) => {
  try {
    console.log("👥 Fetching vendors...");

    const cached = getCached("vendors_list_v4", 60000); // Cache for 60 seconds
    if (cached) {
      console.log("⚡ Returning cached vendors");
      return c.json(cached);
    }

    const validVendors = await kv.getVendorProfiles();

    const allSettings = await kv.getByPrefix("vendor_settings:");
    const validSettings = Array.isArray(allSettings) ? allSettings.filter((s) => s != null) : [];

    const [productsRaw, ordersRaw] = await Promise.all([
      kv.getByPrefix("product:").catch(() => [] as any[]),
      kv.getByPrefix("order:").catch(() => [] as any[]),
    ]);
    const products = Array.isArray(productsRaw) ? productsRaw : [];
    const orders = Array.isArray(ordersRaw) ? ordersRaw : [];

    const { productCountByVendorId, revenueByVendorId } = aggregateVendorListMetrics(
      validVendors,
      validSettings,
      products,
      orders
    );

    const vendorsWithSettings = validVendors.map((vendor: any) => {
      const settings = validSettings.find((s: any) => s.vendorId === vendor.id);
      const id = String(vendor.id);
      return {
        ...vendor,
        ...(settings && typeof settings === "object" ? settings : {}),
        id,
        // Storefront/settings must not override vendor profile lifecycle fields (breaks admin status filters)
        status: vendor?.status,
        productsCount: productCountByVendorId.get(id) ?? 0,
        totalRevenue: revenueByVendorId.get(id) ?? 0,
      };
    });

    console.log(`✅ Found ${vendorsWithSettings.length} vendors`);

    const response = {
      vendors: vendorsWithSettings,
      total: vendorsWithSettings.length,
    };

    setCache("vendors_list_v4", response);

    return c.json(response);
  } catch (error) {
    console.error("❌ Error fetching vendors:", error);
    const errorResponse = {
      vendors: [],
      total: 0,
    };
    setCache("vendors_list_v4", errorResponse); // Cache to prevent repeated failures
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
    queueVendorReadModelSync(id, {
      ...vendorData,
      storeSlug: baseSlug,
      storeName,
      updatedAt: defaultSettings.updatedAt,
    });
    
    // 🔥 AUTO-CREATE SLUG MAPPING for easy storefront lookup
    const slugMapping = {
      slug: baseSlug,
      vendorId: id,
      businessName: storeName,
      createdAt: new Date().toISOString()
    };
    await withTimeout(kv.set(`vendor_slug_${baseSlug}`, slugMapping), 5000);
    console.log(`✅ Auto-created slug mapping: ${baseSlug} → ${id}`);

    clearCache("vendors_list_v4");
    
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
    
    const vendorSettings = await withTimeout(kv.get(`vendor_settings:${vendorId}`), 5000);
    const vendorStorefront = await withTimeout(kv.get(`vendor_storefront_${vendorId}`), 5000);

    // Hard-delete owned storage files tied to this vendor profile/settings/storefront.
    const vendorStorageRefs: unknown[] = [];
    if (vendor && typeof vendor === "object") {
      vendorStorageRefs.push((vendor as any).logo, (vendor as any).avatar, (vendor as any).banner);
    }
    if (vendorSettings && typeof vendorSettings === "object") {
      vendorStorageRefs.push(
        (vendorSettings as any).logo,
        (vendorSettings as any).avatar,
        (vendorSettings as any).banner
      );
    }
    if (vendorStorefront && typeof vendorStorefront === "object") {
      vendorStorageRefs.push(
        (vendorStorefront as any).logo,
        (vendorStorefront as any).avatar,
        (vendorStorefront as any).banner
      );
    }
    await deleteOwnedStorageRefs(supabase, vendorStorageRefs);

    // Delete vendor settings
    if (vendorSettings) {
      await withTimeout(kv.del(`vendor_settings:${vendorId}`), 5000);
      console.log(`✅ Deleted vendor settings: ${vendorId}`);
      
      // Delete slug mapping if it exists
      if (vendorSettings.storeSlug) {
        await withTimeout(kv.del(`vendor_slug_${vendorSettings.storeSlug}`), 5000);
        console.log(`✅ Deleted slug mapping: ${vendorSettings.storeSlug}`);
      }
    }

    // Delete storefront profile/settings cache row for this vendor
    await withTimeout(kv.del(`vendor_storefront_${vendorId}`), 5000);
    if (vendorStorefront && typeof vendorStorefront === "object" && (vendorStorefront as any).storeSlug) {
      await withTimeout(kv.del(`vendor_slug_${(vendorStorefront as any).storeSlug}`), 5000);
      console.log(`✅ Deleted storefront slug mapping: ${(vendorStorefront as any).storeSlug}`);
    }
    // Release ALL slug aliases pointing to this vendor (legacy + migrated keys).
    try {
      const allSlugRows = await withTimeout(kv.getByPrefixWithKeys("vendor_slug_"), 12000);
      let releasedSlugCount = 0;
      for (const row of Array.isArray(allSlugRows) ? allSlugRows : []) {
        if (!row || typeof row !== "object") continue;
        const rowVendorId =
          row.value && typeof row.value === "object"
            ? String((row.value as { vendorId?: unknown }).vendorId || "").trim()
            : "";
        if (!rowVendorId || rowVendorId !== String(vendorId)) continue;
        if (typeof row.key !== "string" || !row.key.trim()) continue;
        await withTimeout(kv.del(row.key), 5000);
        releasedSlugCount += 1;
      }
      if (releasedSlugCount > 0) {
        console.log(`✅ Released ${releasedSlugCount} slug alias key(s) for vendor ${vendorId}`);
      }
    } catch (slugCleanupError) {
      console.warn(`⚠️ Failed to fully release slug aliases for vendor ${vendorId}:`, slugCleanupError);
    }

    // Remove verified/pending custom-domain host mappings for this vendor.
    const customDomain =
      vendorStorefront && typeof vendorStorefront === "object"
        ? String((vendorStorefront as any).customDomain || "").toLowerCase().trim()
        : "";
    if (customDomain) {
      for (const h of customDomainLookupVariants(customDomain)) {
        await withTimeout(kv.del(`custom_domain_host:${h}`), 5000);
      }
      for (const k of vendorPendingHostKvKeys(customDomain)) {
        await withTimeout(kv.del(k), 5000);
      }
    }
    await withTimeout(kv.del(`vendor_domain_pending:${vendorId}`), 5000);
    // Safety sweep: remove any host/pending mappings that still point to this vendor,
    // even if storefront.customDomain was stale/missing.
    try {
      const hostRows = await withTimeout(kv.getByPrefixWithKeys("custom_domain_host:"), 15000);
      let removedHostRows = 0;
      for (const row of Array.isArray(hostRows) ? hostRows : []) {
        const mappedVendorId =
          row?.value && typeof row.value === "object"
            ? String((row.value as { vendorId?: unknown }).vendorId || "").trim()
            : "";
        if (!mappedVendorId || mappedVendorId !== String(vendorId)) continue;
        if (!row?.key || typeof row.key !== "string") continue;
        await withTimeout(kv.del(row.key), 5000);
        removedHostRows += 1;
        const host = row.key.replace(/^custom_domain_host:/, "").trim().toLowerCase();
        if (host) {
          for (const pendingKey of vendorPendingHostKvKeys(host)) {
            await withTimeout(kv.del(pendingKey), 5000);
          }
        }
      }
      if (removedHostRows > 0) {
        console.log(`✅ Removed ${removedHostRows} custom_domain_host key(s) for vendor ${vendorId}`);
      }
    } catch (hostSweepError) {
      console.warn(`⚠️ Failed custom domain host safety sweep for vendor ${vendorId}:`, hostSweepError);
    }

    const vendorTokens = new Set<string>(
      [
        String(vendorId || "").trim().toLowerCase(),
        String((vendor as any)?.id || "").trim().toLowerCase(),
        String((vendor as any)?.storeSlug || "").trim().toLowerCase(),
        String((vendor as any)?.name || "").trim().toLowerCase(),
        String((vendor as any)?.businessName || "").trim().toLowerCase(),
        String((vendorSettings as any)?.storeSlug || "").trim().toLowerCase(),
        String((vendorStorefront as any)?.storeSlug || "").trim().toLowerCase(),
      ].filter(Boolean)
    );
    const vendorEmail = String((vendor as any)?.email || "").trim().toLowerCase();
    const matchesVendorToken = (value: unknown): boolean => {
      const s = String(value || "").trim().toLowerCase();
      return !!s && vendorTokens.has(s);
    };
    const entryKeyOrId = (entry: any, prefix: string): string | null => {
      if (entry && typeof entry === "object" && typeof entry.key === "string" && entry.key.trim()) {
        return entry.key;
      }
      const value = entry && typeof entry === "object" && "value" in entry ? entry.value : entry;
      const id = value && typeof value === "object" ? (value as any).id : undefined;
      if (id != null && String(id).trim()) {
        return `${prefix}${String(id).trim()}`;
      }
      return null;
    };
    const entryValue = (entry: any): any =>
      entry && typeof entry === "object" && "value" in entry ? entry.value : entry;
    let deletedOrders = 0;
    let deletedNotifications = 0;
    let deletedConversations = 0;
    let deletedMessages = 0;
    let deletedVendorCategories = 0;
    let deletedVendorApplications = 0;
    let deletedAudienceRows = 0;

    // Hard-delete vendor-owned order history.
    const allOrders = await withTimeout(kv.getByPrefix("order:"), 12000).catch(() => []);
    if (Array.isArray(allOrders)) {
      for (const raw of allOrders) {
        const order = entryValue(raw);
        if (!order || typeof order !== "object") continue;
        const orderVendorMatch =
          matchesVendorToken((order as any).vendorId) ||
          matchesVendorToken((order as any).vendor) ||
          (Array.isArray((order as any).items) &&
            (order as any).items.some(
              (item: any) =>
                matchesVendorToken(item?.vendorId) || matchesVendorToken(item?.vendor)
            ));
        if (!orderVendorMatch) continue;
        const key = entryKeyOrId(raw, "order:");
        if (!key) continue;
        await withTimeout(kv.del(key), 5000);
        deletedOrders += 1;
      }
    }
    if (deletedOrders > 0) {
      serverCache.delete("orders_minimal");
      console.log(`✅ Deleted ${deletedOrders} vendor-owned orders`);
    }

    // Hard-delete notifications associated to this vendor.
    const allNotifications = await withTimeout(kv.getByPrefix("notification:"), 12000).catch(() => []);
    if (Array.isArray(allNotifications)) {
      for (const raw of allNotifications) {
        const notification = entryValue(raw);
        if (!notification || typeof notification !== "object") continue;
        const isVendorNotification =
          matchesVendorToken((notification as any).vendorId) ||
          matchesVendorToken((notification as any).vendor) ||
          matchesVendorToken((notification as any).vendorSource);
        if (!isVendorNotification) continue;
        const key = entryKeyOrId(raw, "notification:");
        if (!key) continue;
        await withTimeout(kv.del(key), 5000);
        deletedNotifications += 1;
      }
    }

    // Hard-delete chat conversations + their messages for this vendor.
    const allConversations = await withTimeout(kv.getByPrefix("chat:conversation:"), 15000).catch(() => []);
    if (Array.isArray(allConversations)) {
      for (const raw of allConversations) {
        const conv = entryValue(raw);
        if (!conv || typeof conv !== "object") continue;
        const convId = String((conv as any).id || "").trim();
        if (!convId) continue;
        const belongsToVendor =
          matchesVendorToken((conv as any).vendorId) ||
          matchesVendorToken((conv as any).vendorSource);
        if (!belongsToVendor) continue;
        const convKey = entryKeyOrId(raw, "chat:conversation:");
        if (convKey) {
          await withTimeout(kv.del(convKey), 5000);
          deletedConversations += 1;
        }
        const convMessages = await withTimeout(
          kv.getByPrefix(`chat:message:${convId}:`),
          12000
        ).catch(() => []);
        if (Array.isArray(convMessages)) {
          for (const msgRaw of convMessages) {
            const msgKey = entryKeyOrId(msgRaw, `chat:message:${convId}:`);
            if (!msgKey) continue;
            await withTimeout(kv.del(msgKey), 5000);
            deletedMessages += 1;
          }
        }
      }
    }

    // Hard-delete vendor storefront audience rows (by id and slug alias if any).
    const audienceKeys = new Set<string>([
      `vendor:audience:${vendorId}`,
      `vendor:audience:${(vendorSettings as any)?.storeSlug || ""}`,
      `vendor:audience:${(vendorStorefront as any)?.storeSlug || ""}`,
    ]);
    for (const key of audienceKeys) {
      const k = String(key || "").trim();
      if (!k || k.endsWith(":")) continue;
      await withTimeout(kv.del(k), 5000);
      deletedAudienceRows += 1;
    }

    // Hard-delete vendor categories (key format: category:{vendorId}:{id}).
    const vendorCategories = await withTimeout(kv.getByPrefix(`category:${vendorId}:`), 15000).catch(() => []);
    if (Array.isArray(vendorCategories)) {
      for (const catRaw of vendorCategories) {
        const catKey =
          (catRaw && typeof catRaw === "object" && typeof (catRaw as any).key === "string"
            ? String((catRaw as any).key)
            : "") ||
          (entryValue(catRaw)?.id ? String(entryValue(catRaw).id) : "");
        if (!catKey) continue;
        await withTimeout(kv.del(catKey), 5000);
        deletedVendorCategories += 1;
      }
    }
    if (deletedVendorCategories > 0) {
      serverCache.delete("categories");
      console.log(`✅ Deleted ${deletedVendorCategories} vendor categories`);
    }

    // Hard-delete linked vendor application records.
    const applicationId = String((vendor as any)?.applicationId || "").trim();
    if (applicationId) {
      await withTimeout(kv.del(`vendor_application:${applicationId}`), 5000);
      deletedVendorApplications += 1;
    }
    const allApplications = await withTimeout(kv.getByPrefix("vendor_application:"), 15000).catch(() => []);
    if (Array.isArray(allApplications)) {
      for (const appRaw of allApplications) {
        const app = entryValue(appRaw);
        if (!app || typeof app !== "object") continue;
        const appMatchesVendor =
          matchesVendorToken((app as any).vendorId) ||
          matchesVendorToken((app as any).approvedVendorId) ||
          (vendorEmail && String((app as any).email || "").trim().toLowerCase() === vendorEmail);
        if (!appMatchesVendor) continue;
        const appKey = entryKeyOrId(appRaw, "vendor_application:");
        if (!appKey) continue;
        await withTimeout(kv.del(appKey), 5000);
        deletedVendorApplications += 1;
      }
    }

    // Remove this vendor from product assignments so deleted vendors cannot appear in listings.
    const allProducts = await withTimeout(kv.getByPrefix("product:"), 10000);
    const validProducts = Array.isArray(allProducts) ? allProducts.filter((p) => p && typeof p === "object") : [];
    let detachedCount = 0;
    for (const product of validProducts) {
      const productId = (product as any).id;
      if (!productId) continue;
      const selected = Array.isArray((product as any).selectedVendors)
        ? (product as any).selectedVendors.map((x: any) => String(x))
        : [];
      const nextSelected = selected.filter((x: string) => x !== String(vendorId));
      const hadSelectedVendor = nextSelected.length !== selected.length;
      const hadVendorId = String((product as any).vendorId || "") === String(vendorId);
      const hadVendorField = String((product as any).vendor || "") === String(vendorId);
      if (!hadSelectedVendor && !hadVendorId && !hadVendorField) continue;

      const nextPrimary = nextSelected[0] || "";
      const nextProduct = {
        ...(product as any),
        selectedVendors: nextSelected,
        vendorId: hadVendorId ? nextPrimary : (product as any).vendorId,
        vendor: hadVendorField ? nextPrimary : (product as any).vendor,
        updatedAt: new Date().toISOString(),
      };
      if (!nextPrimary && String(nextProduct.status || "").toLowerCase() === "active") {
        nextProduct.status = "off_shelf";
      }
      await withTimeout(kv.set(`product:${productId}`, nextProduct), 5000);
      queueProductReadModelSync(String(productId), nextProduct);
      detachedCount += 1;
    }
    if (detachedCount > 0) {
      console.log(`✅ Detached deleted vendor ${vendorId} from ${detachedCount} products`);
      clearCache("products");
      serverCache.delete("all_products");
    }
    
    // Delete vendor data
    await withTimeout(kv.del(`vendor:${vendorId}`), 5000);
    queueVendorReadModelDelete(vendorId);
    console.log(`✅ Deleted vendor: ${vendorId}`);

    await logVendorStaffActivity(
      pickActorIdFromRequest(c),
      vendor as Record<string, unknown>,
      "Vendor Deleted"
    );
    
    // Clear vendor cache
    serverCache.delete("vendors");
    serverCache.delete("vendors_list_v4");
    serverCache.delete(`vendor_by_slug:${vendorSettings?.storeSlug}`);
    
    return c.json({ 
      success: true,
      message: "Vendor deleted successfully",
      deleted: {
        vendorId,
        orders: deletedOrders,
        notifications: deletedNotifications,
        chatConversations: deletedConversations,
        chatMessages: deletedMessages,
        categories: deletedVendorCategories,
        vendorApplications: deletedVendorApplications,
        audienceRows: deletedAudienceRows,
      },
    });
  } catch (error) {
    console.error("❌ Error deleting vendor:", error);
    return c.json({ error: "Failed to delete vendor", details: String(error) }, 500);
  }
});

// ============================================
// VENDOR APPLICATION ENDPOINTS
// ============================================

function vendorActivityContactDetail(record: Record<string, unknown>): string {
  const name = String(
    record.storeName ||
      record.businessName ||
      record.companyName ||
      record.name ||
      record.contactName ||
      "Vendor"
  ).trim();
  const email = String(record.email || "").trim();
  const phone = String(record.phone || "").trim();
  return [name, email, phone].filter(Boolean).join(" | ");
}

function pickActorIdFromRequest(c: { req: { query: (key: string) => string; header: (key: string) => string | undefined } }): string {
  const fromQuery = String(c.req.query("performedByUserId") || "").trim();
  if (isValidStaffActorId(fromQuery)) return fromQuery;
  const fromHeader = String(c.req.header("x-actor-user-id") || "").trim();
  if (isValidStaffActorId(fromHeader)) return fromHeader;
  return "";
}

async function logVendorStaffActivity(
  actorUserId: string | undefined,
  vendor: Record<string, unknown>,
  action: string
): Promise<void> {
  if (!isValidStaffActorId(actorUserId)) return;
  await appendStaffActivity(actorUserId, {
    type: "admin_action",
    action,
    detail: vendorActivityContactDetail(vendor),
  });
}

function pickVendorApplicationActorId(body: Record<string, unknown>): string {
  const performedByUserId = body.performedByUserId;
  if (typeof performedByUserId === "string" && isValidStaffActorId(performedByUserId.trim())) {
    return performedByUserId.trim();
  }
  const reviewedBy = body.reviewedBy;
  if (typeof reviewedBy === "string" && isValidStaffActorId(reviewedBy.trim())) {
    return reviewedBy.trim();
  }
  return "";
}

async function logVendorApplicationStaffActivity(
  actorUserId: string | undefined,
  application: Record<string, unknown>,
  action: string
): Promise<void> {
  if (!isValidStaffActorId(actorUserId)) return;
  await appendStaffActivity(actorUserId, {
    type: "admin_action",
    action,
    detail: vendorActivityContactDetail(application),
  });
}

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

    const emailNorm = normalizeVendorLifecycleEmail((application as any).email);
    if (emailNorm) {
      const conflict = await vendorEmailPolicyConflict(emailNorm);
      if (conflict.blocked) {
        return c.json(
          {
            error: conflict.message,
            code: conflict.code,
          },
          409
        );
      }
    }

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
    const body = await c.req.json();
    const { status, reviewNotes, reviewedBy } = body;
    const performedByUserId = pickVendorApplicationActorId(
      body && typeof body === "object" ? body : {}
    );

    const application = await withTimeout(kv.get(`vendor_application:${id}`), 5000);

    if (!application) {
      return c.json({ error: "Application not found" }, 404);
    }

    const nextStatus = String(status ?? "")
      .trim()
      .toLowerCase();
    const allowedStatuses = new Set(["pending", "approved", "rejected"]);
    if (!allowedStatuses.has(nextStatus)) {
      return c.json(
        { error: `Invalid status. Allowed: ${[...allowedStatuses].join(", ")}` },
        400
      );
    }

    const prevStatus = String((application as any).status ?? "pending")
      .trim()
      .toLowerCase();
    if (prevStatus === "approved" && nextStatus === "pending") {
      return c.json({ error: "Cannot move an approved application back to pending." }, 400);
    }

    const reviewedAt = new Date().toISOString();
    const baseUpdate = {
      ...application,
      status: nextStatus,
      reviewNotes,
      reviewedBy,
      reviewedAt,
    };

    if (nextStatus !== "approved") {
      await withTimeout(kv.set(`vendor_application:${id}`, baseUpdate), 5000);
      await logVendorApplicationStaffActivity(
        performedByUserId,
        baseUpdate as Record<string, unknown>,
        nextStatus === "rejected" ? "Vendor Rejected" : "Vendor application updated"
      );
      return c.json({
        success: true,
        application: baseUpdate,
        message: `Application ${nextStatus} successfully`,
      });
    }

    const priorApprovedId = String((application as any).approvedVendorId || "").trim();
    if (priorApprovedId) {
      const existingVendor = await withTimeout(kv.get(`vendor:${priorApprovedId}`), 5000).catch(() => null);
      if (existingVendor && typeof existingVendor === "object") {
        const vs = await withTimeout(kv.get(`vendor_settings:${priorApprovedId}`), 5000).catch(() => null);
        const finalApplication = {
          ...baseUpdate,
          approvedVendorId: priorApprovedId,
          approvedStoreSlug:
            (vs && typeof vs === "object" && String((vs as any).storeSlug || "").trim()) || null,
          approvedAt: String((application as any).approvedAt || "").trim() || reviewedAt,
        };
        await withTimeout(kv.set(`vendor_application:${id}`, finalApplication), 5000);
        clearCache("vendors_list_v4");
        try {
          await withTimeout(kv.del("vendors"), 5000);
        } catch {
          /* non-fatal */
        }
        console.log(`ℹ️ Application ${id} already approved → vendor ${priorApprovedId}`);
        await logVendorApplicationStaffActivity(
          performedByUserId,
          finalApplication as Record<string, unknown>,
          "Vendor Approved"
        );
        return c.json({
          success: true,
          application: finalApplication,
          message: "Application was already approved",
          vendorAlreadyExisted: true,
        });
      }
    }

    const validVendors = await withTimeout(kv.getVendorProfiles(), 8000).catch(() => [] as any[]);
    const appEmail = String((application as any).email || "")
      .trim()
      .toLowerCase();
    if (appEmail) {
      const dup = (Array.isArray(validVendors) ? validVendors : []).find(
        (v: any) => String(v?.email || "").trim().toLowerCase() === appEmail
      );
      if (dup?.id) {
        const vs = await withTimeout(kv.get(`vendor_settings:${dup.id}`), 5000).catch(() => null);
        const finalApplication = {
          ...baseUpdate,
          approvedVendorId: dup.id,
          approvedStoreSlug:
            (vs && typeof vs === "object" && String((vs as any).storeSlug || "").trim()) || null,
          approvedAt: reviewedAt,
        };
        await withTimeout(kv.set(`vendor_application:${id}`, finalApplication), 5000);
        clearCache("vendors_list_v4");
        try {
          await withTimeout(kv.del("vendors"), 5000);
        } catch {
          /* non-fatal */
        }
        console.log(`✅ Application ${id} approved → linked existing vendor ${dup.id} (${appEmail})`);
        await logVendorApplicationStaffActivity(
          performedByUserId,
          finalApplication as Record<string, unknown>,
          "Vendor Approved"
        );
        return c.json({
          success: true,
          application: finalApplication,
          message: "Application approved; linked to existing vendor account",
          linkedExistingVendor: true,
        });
      }
    }

    console.log(`✅ Vendor application approved: ${id}, creating vendor account...`);

    const vendorId = `vendor_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
    const newVendor = {
      id: vendorId,
      name: (application as any).companyName || (application as any).businessName,
      email: (application as any).email,
      phone: (application as any).phone,
      location:
        (application as any).city && (application as any).country
          ? `${(application as any).city}, ${(application as any).country}`
          : (application as any).address || "",
      status: "active",
      productsCount: 0,
      totalRevenue: 0,
      commission: parseInt(String((application as any).requestedCommission || ""), 10) || 15,
      joinedDate: new Date().toISOString(),
      avatar:
        ((application as any).companyName || (application as any).businessName)?.substring(0, 2).toUpperCase() ||
        "VN",
      businessType: (application as any).businessType,
      taxId: (application as any).registrationNumber || (application as any).taxId,
      website: (application as any).website,
      facebook: (application as any).facebook,
      instagram: (application as any).instagram,
      youtube: (application as any).youtube,
      tiktok: (application as any).tiktok,
      description: (application as any).storeDescription || (application as any).description,
      categories: (application as any).categories || [],
      contactName: (application as any).contactName,
      applicationId: id,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    await withTimeout(kv.set(`vendor:${vendorId}`, newVendor), 5000);

    const storeName =
      (application as any).companyName || (application as any).businessName || "Vendor Store";
    const baseSlug = await allocateUniqueVendorSlugFromName(storeName, vendorId);

    const vendorSettings = {
      vendorId: vendorId,
      storeName: storeName,
      storeSlug: baseSlug,
      storeDescription:
        (application as any).storeDescription || (application as any).description || "Welcome to our store",
      storeTagline: "",
      logo: "",
      banner: "",
      isActive: true,
      socialLinks: {
        facebook: (application as any).facebook || "",
        instagram: (application as any).instagram || "",
        youtube: (application as any).youtube || "",
        tiktok: (application as any).tiktok || "",
        website: (application as any).website || "",
      },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    await withTimeout(kv.set(`vendor_settings:${vendorId}`, vendorSettings), 5000);
    queueVendorReadModelSync(vendorId, {
      ...newVendor,
      storeName,
      storeSlug: baseSlug,
      updatedAt: vendorSettings.updatedAt,
    });

    const slugMappingApproved = {
      slug: baseSlug,
      vendorId: vendorId,
      businessName: storeName,
      createdAt: new Date().toISOString(),
    };
    await withTimeout(kv.set(`vendor_slug_${baseSlug}`, slugMappingApproved), 5000);
    console.log(`✅ Slug mapping created for approved application: ${baseSlug} → ${vendorId}`);

    const finalApplication = {
      ...baseUpdate,
      approvedVendorId: vendorId,
      approvedStoreSlug: baseSlug,
      approvedAt: reviewedAt,
    };
    await withTimeout(kv.set(`vendor_application:${id}`, finalApplication), 5000);

    clearCache("vendors_list_v4");
    try {
      await withTimeout(kv.del("vendors"), 5000);
    } catch {
      /* non-fatal */
    }

    console.log(`✅ Vendor account created: ${vendorId} for ${newVendor.name} with slug: ${baseSlug}`);

    await logVendorApplicationStaffActivity(
      performedByUserId,
      finalApplication as Record<string, unknown>,
      "Vendor Approved"
    );

    return c.json({
      success: true,
      application: finalApplication,
      message: "Application approved successfully",
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

    const prevLogoRef =
      typeof (existingVendor as any)?.logo === "string" && (existingVendor as any).logo.trim()
        ? (existingVendor as any).logo
        : typeof (existingVendor as any)?.avatar === "string" && (existingVendor as any).avatar.trim()
          ? (existingVendor as any).avatar
          : "";

    const logoFieldTouched = Object.prototype.hasOwnProperty.call(body, "logo");
    const avatarFieldTouched = Object.prototype.hasOwnProperty.call(body, "avatar");

    /**
     * Storefront `logo` and account `avatar` are separate.
     * New clients send `logo` for store branding only. Legacy clients sent only `avatar` for both.
     */
    if (logoFieldTouched) {
      const raw = body.logo;
      const nextLogo =
        typeof raw === "string"
          ? raw
          : raw === null
            ? ""
            : typeof (existingVendor as any).logo === "string"
              ? (existingVendor as any).logo
              : "";
      (updatedVendor as any).logo = nextLogo;
      const exL = String((existingVendor as any).logo ?? "").trim();
      const exA = String((existingVendor as any).avatar ?? "").trim();
      const mirroredStoreBranding =
        exA === exL &&
        exA.length > 0 &&
        (/^https?:\/\//i.test(exA) || exA.startsWith("data:image/"));
      if (!avatarFieldTouched && mirroredStoreBranding) {
        (updatedVendor as any).avatar = "";
      }
    } else if (avatarFieldTouched) {
      const rawA = body.avatar;
      (updatedVendor as any).avatar =
        typeof rawA === "string" ? rawA : rawA === null || rawA === "" ? "" : (updatedVendor as any).avatar || "";
      const isImageLike =
        typeof rawA === "string" &&
        (/^https?:\/\//i.test(rawA) ||
          rawA.startsWith("data:image/") ||
          rawA.startsWith("blob:"));
      if (isImageLike) {
        (updatedVendor as any).logo = rawA;
      }
    }

    if (avatarFieldTouched && logoFieldTouched) {
      const rawA = body.avatar;
      (updatedVendor as any).avatar =
        typeof rawA === "string" ? rawA : rawA === null || rawA === "" ? "" : (updatedVendor as any).avatar || "";
    }

    const logoTouched = logoFieldTouched || avatarFieldTouched;

    await withTimeout(kv.set(`vendor:${id}`, updatedVendor), 5000);
    queueVendorReadModelSync(id, updatedVendor);

    const nextLifecycleStatus = String(updatedVendor.status || (existingVendor as any).status || "active")
      .trim()
      .toLowerCase();
    if (nextLifecycleStatus !== "active") {
      try {
        for (const key of [`vendor_settings:${id}`, `vendor_storefront_${id}`] as const) {
          const row = await withTimeout(kv.get(key), 5000).catch(() => null);
          if (row && typeof row === "object") {
            await withTimeout(
              kv.set(key, {
                ...row,
                isActive: false,
                updatedAt: new Date().toISOString(),
              }),
              5000
            );
          }
        }
        console.log(`🛑 Public storefront isActive=false (vendor status: ${nextLifecycleStatus}) for ${id}`);
      } catch (deactErr) {
        console.warn("⚠️ Failed to sync isActive on settings/storefront:", deactErr);
      }
    }

    if (logoTouched) {
      const nextLogo =
        typeof updatedVendor.logo === "string"
          ? updatedVendor.logo
          : typeof updatedVendor.avatar === "string"
            ? updatedVendor.avatar
            : "";
      const normalizedPrev = String(prevLogoRef || "").trim();
      const normalizedNext = String(nextLogo || "").trim();
      if (normalizedPrev && normalizedPrev !== normalizedNext) {
        await deleteOwnedStorageRefs(supabase, [normalizedPrev]);
      }
      try {
        const vsKey = `vendor_settings:${id}`;
        const existingVs = await withTimeout(kv.get(vsKey), 5000);
        if (existingVs && typeof existingVs === "object") {
          await withTimeout(
            kv.set(vsKey, {
              ...existingVs,
              logo: nextLogo,
              updatedAt: new Date().toISOString(),
            }),
            5000
          );
        }
        const sfKey = `vendor_storefront_${id}`;
        const existingSf = await withTimeout(kv.get(sfKey), 5000);
        if (existingSf && typeof existingSf === "object") {
          await withTimeout(
            kv.set(sfKey, {
              ...existingSf,
              logo: nextLogo,
              updatedAt: new Date().toISOString(),
            }),
            5000
          );
        }
      } catch (syncErr) {
        console.warn("⚠️ Vendor logo sync to settings/storefront failed (vendor row still saved):", syncErr);
      }
    }

    // 🔥 Clear vendor list cache to force refresh
    try {
      await withTimeout(kv.del("vendors"), 5000);
      clearCache("vendors_list_v4");
      await clearVendorPublicSlugCaches(id);
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
  const denied = assertDestructiveOperationAllowed(c);
  if (denied) return denied;
  try {
    console.log("🗑️ Clearing all vendors...");
    const validVendors = await withTimeout(kv.getVendorProfiles(), 8000);
    
    // Delete each vendor
    for (const vendor of validVendors) {
      if (vendor.id) {
        await withTimeout(kv.del(`vendor:${vendor.id}`), 5000);
        queueVendorReadModelDelete(String(vendor.id));
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
  const denied = assertDestructiveOperationAllowed(c);
  if (denied) return denied;
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

    const prevAppearance = await withRetry(
      () => withTimeout(kv.get("appearance:settings"), 10000),
      3,
      1000
    ).catch(() => null);
    const oldAppearanceImg =
      prevAppearance &&
      typeof (prevAppearance as { image?: string }).image === "string" &&
      (prevAppearance as { image: string }).image.trim()
        ? (prevAppearance as { image: string }).image.trim()
        : "";
    
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

    if (body.image !== undefined && oldAppearanceImg && String(body.image) !== oldAppearanceImg) {
      await deleteOwnedStorageRefs(supabase, [oldAppearanceImg]);
    }
    
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

async function jsonBasicStatsFromReadModel(): Promise<Record<string, unknown> | null> {
  try {
    const { data, error } = await supabase.rpc("rpc_basic_stats");
    if (error) {
      console.warn("[stats] read-model stats unavailable:", error.message);
      return null;
    }
    if (!data || typeof data !== "object" || Array.isArray(data)) return null;
    const body = data as Record<string, unknown>;
    const readModelRows = Number(body.readModelRows ?? 0);
    if (readModelRows <= 0) return null;
    const totalRevenueNumber = Number(body.totalRevenueNumber ?? 0);
    return {
      totalProducts: Number(body.totalProducts ?? 0),
      totalOrders: Number(body.totalOrders ?? 0),
      totalCustomers: Number(body.totalCustomers ?? 0),
      totalRevenue: `$${totalRevenueNumber.toFixed(2)}`,
      pendingOrders: Number(body.pendingOrders ?? 0),
      completedOrders: Number(body.completedOrders ?? 0),
      timestamp: body.timestamp || new Date().toISOString(),
      readModel: true,
    };
  } catch (error) {
    console.warn("[stats] read-model stats failed:", error);
    return null;
  }
}

app.get("/make-server-16010b6f/stats", async (c) => {
  try {
    console.log("📊 Fetching stats...");

    const readModelBody = await jsonBasicStatsFromReadModel();
    if (readModelBody) {
      return c.json(readModelBody);
    }
    
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

async function jsonLandingStatsFromReadModel(): Promise<Record<string, unknown> | null> {
  try {
    const { data, error } = await supabase.rpc("rpc_landing_stats");
    if (error) {
      console.warn("[landing-stats] read-model stats unavailable:", error.message);
      return null;
    }
    if (!data || typeof data !== "object" || Array.isArray(data)) return null;
    const body = data as Record<string, unknown>;
    const readModelRows = Number(body.readModelRows ?? 0);
    if (readModelRows <= 0) return null;
    return {
      activeVendors: Number(body.activeVendors ?? 0),
      totalProducts: Number(body.totalProducts ?? 0),
      totalCustomers: Number(body.totalCustomers ?? 0),
      timestamp: body.timestamp || new Date().toISOString(),
      readModel: true,
    };
  } catch (error) {
    console.warn("[landing-stats] read-model stats failed:", error);
    return null;
  }
}

// Landing page stats endpoint - public stats for visitors
app.get("/make-server-16010b6f/landing-stats", async (c) => {
  try {
    console.log("📊 Fetching landing page stats...");

    const readModelBody = await jsonLandingStatsFromReadModel();
    if (readModelBody) {
      return c.json(readModelBody);
    }
    
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

async function jsonFinancesAnalyticsFromReadModel(): Promise<Record<string, unknown> | null> {
  try {
    const { data, error } = await supabase.rpc("rpc_finances_analytics");
    if (error) {
      console.warn("[finances] read-model analytics unavailable:", error.message);
      return null;
    }
    if (!data || typeof data !== "object" || Array.isArray(data)) return null;
    const body = data as Record<string, unknown>;
    const readModelRows = Number(body.readModelRows ?? 0);
    if (readModelRows <= 0) return null;
    return {
      summary: body.summary,
      transactions: Array.isArray(body.transactions) ? body.transactions : [],
      paymentMethods: Array.isArray(body.paymentMethods) ? body.paymentMethods : [],
      revenueChartData: Array.isArray(body.revenueChartData) ? body.revenueChartData : [],
      vendorPayouts: Array.isArray(body.vendorPayouts) ? body.vendorPayouts : [],
      timestamp: body.timestamp || new Date().toISOString(),
      readModel: true,
    };
  } catch (error) {
    console.warn("[finances] read-model analytics failed:", error);
    return null;
  }
}

app.get("/make-server-16010b6f/finances/analytics", async (c) => {
  try {
    console.log("💰 Fetching financial analytics...");

    const readModelBody = await jsonFinancesAnalyticsFromReadModel();
    if (readModelBody) {
      return c.json(readModelBody);
    }
    
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
    
    const parseMoney = (v: unknown): number => {
      if (typeof v === "number" && Number.isFinite(v)) return v;
      if (typeof v === "string") return parseFloat(v.replace(/[^0-9.-]/g, "")) || 0;
      return 0;
    };

    /** Positive commission % from number or string (e.g. 10, "10", "10%"). */
    const parseCommissionPercent = (v: unknown): number => {
      if (typeof v === "number" && Number.isFinite(v) && v > 0) return v;
      if (v == null || v === "") return 0;
      const n = parseFloat(String(v).replace(/[^0-9.-]/g, ""));
      return Number.isFinite(n) && n > 0 ? n : 0;
    };

    // 🔥 Create product lookup map for commission rates + owning vendor (line-level payout split)
    const productMap = new Map<string, { name: string; commissionRate: unknown; vendorId: string | null }>();
    validProducts.forEach((product: any) => {
      if (product?.id == null || String(product.id).trim() === "") return;
      const vid =
        product.vendorId ??
        (Array.isArray(product.selectedVendors) && product.selectedVendors.length
          ? product.selectedVendors[0]
          : null);
      const info = {
        name: product.name || product.title,
        commissionRate:
          product.commissionRate !== undefined && product.commissionRate !== null
            ? product.commissionRate
            : 0,
        vendorId: vid != null && String(vid).trim() !== "" ? String(vid) : null,
      };
      const idKey = String(product.id).trim();
      productMap.set(idKey, info);
      const sku = product.sku != null ? String(product.sku).trim() : "";
      if (sku && sku !== idKey) {
        productMap.set(sku, info);
      }
    });

    const resolveProductInfo = (item: any) => {
      const keys: string[] = [];
      const rawPid = item?.productId ?? item?.id;
      if (rawPid != null) {
        const s = String(rawPid).trim();
        if (s) {
          keys.push(s);
          if (s.includes(":")) keys.push(s.split(":")[0]!.trim());
        }
      }
      const sku = item?.sku != null ? String(item.sku).trim() : "";
      if (sku) keys.push(sku);
      for (const k of keys) {
        if (!k) continue;
        const hit = productMap.get(k);
        if (hit) return hit;
      }
      return undefined;
    };

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

      const orderTotal = parseMoney(order.total);
      
      const orderVendorFallback = order.vendorId || order.vendor || "Unknown";
      const vendorInfoFallback = vendorMap.get(orderVendorFallback) || {
        name: order.vendor || "Unknown Vendor",
        commission: 15,
        email: "",
      };

      let commission = 0;
      let vendorPayout = 0;
      /** Per-vendor earnings for this order (multi-vendor carts). */
      const orderVendorNetByKey = new Map<
        string,
        { vendorName: string; email: string; net: number }
      >();

      const addVendorNet = (keyRaw: string, vendorName: string, email: string, net: number) => {
        const key = String(keyRaw || "Unknown");
        const cur = orderVendorNetByKey.get(key) || { vendorName, email, net: 0 };
        cur.net += net;
        if (vendorName) cur.vendorName = vendorName;
        if (email) cur.email = email;
        orderVendorNetByKey.set(key, cur);
      };

      if (order.items && Array.isArray(order.items) && order.items.length > 0) {
        type LinePart = {
          vendorKey: string;
          vendorName: string;
          email: string;
          sub: number;
          comm: number;
        };
        const lineParts: LinePart[] = [];

        for (const item of order.items) {
          const productInfo = resolveProductInfo(item);
          const lineSub = parseMoney(item.price) * (item.quantity || 1);
          // Per-line %: prefer snapshot on the order line (checkout), then catalog product.
          const rateFromLine = parseCommissionPercent(
            item.commissionRate ?? item.commission ?? item.product?.commissionRate
          );
          const rateFromProduct = parseCommissionPercent(productInfo?.commissionRate);
          const rate = rateFromLine > 0 ? rateFromLine : rateFromProduct;
          const lineComm = lineSub * (rate / 100);
          commission += lineComm;

          const lineVendorKey =
            (item.vendorId != null && String(item.vendorId).trim() !== "" && String(item.vendorId)) ||
            (item.vendor != null && String(item.vendor).trim() !== "" && String(item.vendor)) ||
            (productInfo?.vendorId != null && String(productInfo.vendorId)) ||
            String(orderVendorFallback);

          const vMeta =
            vendorMap.get(lineVendorKey) ||
            (lineVendorKey === String(orderVendorFallback) ? vendorInfoFallback : null) || {
              name: String(lineVendorKey),
              email: "",
            };

          lineParts.push({
            vendorKey: lineVendorKey,
            vendorName: vMeta.name || String(lineVendorKey),
            email: vMeta.email || "",
            sub: lineSub,
            comm: lineComm,
          });
        }

        const vendorPool = Math.max(0, orderTotal - commission);
        const sumLineNet = lineParts.reduce((s, p) => s + (p.sub - p.comm), 0);
        const delta = vendorPool - sumLineNet;
        if (lineParts.length > 0 && Math.abs(delta) > 0.01) {
          lineParts[0].sub += delta;
        }

        for (const p of lineParts) {
          const net = Math.max(0, p.sub - p.comm);
          addVendorNet(p.vendorKey, p.vendorName, p.email, net);
        }

        vendorPayout = vendorPool;
      } else {
        commission = 0;
        vendorPayout = orderTotal;
        addVendorNet(
          String(orderVendorFallback),
          vendorInfoFallback.name,
          vendorInfoFallback.email,
          vendorPayout
        );
      }

      if (commission === 0 && order.items?.length) {
        console.log(`⚠️ No product commission for order ${order.orderNumber}, using 0%`);
      }

      // Gateway fee (1% for digital payments, 0 for cash)
      const gatewayFee =
        order.paymentMethod !== "Cash" && order.paymentMethod !== "COD" ? orderTotal * 0.01 : 0;

      totalRevenue += orderTotal;
      totalCommission += commission;
      totalVendorPayout += vendorPayout;

      if (order.status === "completed" || order.status === "delivered") {
        pendingPayouts += vendorPayout;
      }

      const paymentMethod = order.paymentMethod || "Cash";
      const existing = paymentMethodsMap.get(paymentMethod) || { count: 0, amount: 0 };
      paymentMethodsMap.set(paymentMethod, {
        count: existing.count + 1,
        amount: existing.amount + orderTotal,
      });

      const orderDate = order.date || order.createdAt;
      if (orderDate) {
        const dateKey = new Date(orderDate).toISOString().split("T")[0];
        const existingDay = dailyRevenueMap.get(dateKey) || { revenue: 0, commission: 0 };
        dailyRevenueMap.set(dateKey, {
          revenue: existingDay.revenue + orderTotal,
          commission: existingDay.commission + commission,
        });
      }

      for (const [vKey, row] of orderVendorNetByKey.entries()) {
        const existingVendor = vendorPayoutsMap.get(vKey) || {
          vendor: row.vendorName,
          email: row.email,
          payout: 0,
          orders: 0,
          status: "pending",
        };
        vendorPayoutsMap.set(vKey, {
          ...existingVendor,
          vendor: row.vendorName || existingVendor.vendor,
          email: row.email || existingVendor.email,
          payout: existingVendor.payout + row.net,
          orders: existingVendor.orders + 1,
        });
      }

      transactionsList.push({
        id: order.orderNumber || order.id,
        date: order.date || order.createdAt,
        customer: order.customer || "Guest",
        customerEmail: order.email || "",
        vendor: vendorInfoFallback.name,
        vendorId: orderVendorFallback,
        amount: orderTotal,
        method: paymentMethod,
        status: order.status === "delivered" || order.status === "completed" ? "completed" : order.status,
        commission,
        vendorPayout,
        products: order.items || [],
        gatewayFee,
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
 * Resolve customer profile image: always prefer canonical sources (`customer:` map, `user:` KV)
 * over whatever is stored on the conversation, so the admin chat list shows the latest profile
 * photo after the customer updates it. Conversation snapshots are only a fallback.
 */
async function resolveCustomerProfileImage(
  email: string,
  existingUrl?: string,
  customerAvatarMap?: Map<string, string>
): Promise<string> {
  const trimmed = (email || "").trim();
  const existing = (existingUrl || "").trim();
  const lower = trimmed.toLowerCase();
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

  if (existing.startsWith("http") && !isPlaceholderAvatarUrl(existing)) {
    return existing;
  }

  return existing;
}

/** Same customer email may have multiple vendor threads; use the avatar from the most recently active thread when KV has no photo. */
function mergeLatestAvatarAcrossConversationsByEmail(conversations: any[]): any[] {
  const emailToBest = new Map<string, { url: string; t: number }>();
  for (const conv of conversations) {
    const em = String(conv?.customerEmail || "")
      .toLowerCase()
      .trim();
    if (!em) continue;
    const img = String(conv?.customerProfileImage || "").trim();
    if (!img.startsWith("http") || isPlaceholderAvatarUrl(img)) continue;
    const t = Date.parse(conv?.timestamp || "") || 0;
    const prev = emailToBest.get(em);
    if (!prev || t >= prev.t) {
      emailToBest.set(em, { url: img, t });
    }
  }
  return conversations.map((conv) => {
    const em = String(conv?.customerEmail || "")
      .toLowerCase()
      .trim();
    const best = em ? emailToBest.get(em) : undefined;
    if (best?.url) {
      return { ...conv, customerProfileImage: best.url };
    }
    return conv;
  });
}

function normalizeChatEmail(email: unknown): string {
  return String(email || "").trim().toLowerCase();
}

function sanitizeChatToken(input: unknown): string {
  return String(input || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-+/g, "-");
}

function normalizeChatVendorThreadToken(vendorId: unknown, vendorSource?: unknown): string {
  const rawId = String(vendorId || "").trim();
  const lowerId = rawId.toLowerCase();
  const looksTechnical =
    /^vendor[_-]vendor_/i.test(rawId) ||
    /^vendor-vendor_/i.test(rawId) ||
    /^vendor_\d/i.test(rawId);

  const sourceToken = sanitizeChatToken(vendorSource);
  const idToken = sanitizeChatToken(rawId);

  if (rawId && !looksTechnical && idToken) return idToken;
  if (sourceToken && sourceToken !== "secure") return sourceToken;
  if (lowerId === "secure" || sourceToken === "secure") return "secure";
  return idToken || sourceToken || "secure";
}

function canonicalConversationIdFor(email: unknown, vendorId: unknown, vendorSource?: unknown): string | null {
  const normalizedEmail = normalizeChatEmail(email);
  if (!normalizedEmail) return null;
  const emailToken = sanitizeChatToken(normalizedEmail);
  if (!emailToken) return null;
  const vendorToken = normalizeChatVendorThreadToken(vendorId, vendorSource);
  if (!vendorToken || vendorToken === "secure") return `conv-${emailToken}`;
  return `conv-vendor-${vendorToken}-${emailToken}`;
}

function conversationBucketKeyFor(conv: any): string {
  const normalizedEmail = normalizeChatEmail(conv?.customerEmail);
  if (!normalizedEmail) return `conv-id:${String(conv?.id || "")}`;
  const vendorToken = normalizeChatVendorThreadToken(conv?.vendorId, conv?.vendorSource);
  return `${normalizedEmail}::${vendorToken || "secure"}`;
}

function mergeConversationsByCustomerVendor(conversations: any[]): any[] {
  const grouped = new Map<string, any>();

  for (const conv of conversations || []) {
    const key = conversationBucketKeyFor(conv);
    const current = grouped.get(key);
    const ts = Date.parse(String(conv?.timestamp || "")) || 0;
    const unread = Number(conv?.unread) || 0;

    if (!current) {
      grouped.set(key, { ...conv, unread, __ts: ts, __ids: [String(conv?.id || "")] });
      continue;
    }

    const currentTs = Number(current.__ts) || 0;
    const nextIds = Array.from(new Set([...(current.__ids || []), String(conv?.id || "")]));
    const merged = ts >= currentTs ? { ...current, ...conv } : { ...conv, ...current };
    merged.unread = (Number(current.unread) || 0) + unread;
    merged.starred = Boolean(current?.starred) || Boolean(conv?.starred);
    merged.__ts = Math.max(currentTs, ts);
    merged.__ids = nextIds;
    // Keep newest conversation id as canonical open target.
    if (ts >= currentTs) merged.id = conv?.id;
    grouped.set(key, merged);
  }

  return Array.from(grouped.values())
    .sort((a, b) => (Number(b.__ts) || 0) - (Number(a.__ts) || 0))
    .map(({ __ts, __ids, ...rest }) => ({
      ...rest,
      aliasConversationIds: Array.isArray(__ids) ? __ids.filter(Boolean) : undefined,
    }));
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
    const enrichedRaw = await Promise.all(
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

    const enriched = mergeLatestAvatarAcrossConversationsByEmail(enrichedRaw);
    const deduped = mergeConversationsByCustomerVendor(enriched);

    console.log(`📨 Retrieved ${enriched.length} conversations (${deduped.length} after dedupe)`);
    return c.json({ conversations: deduped });
  } catch (error: any) {
    console.error("❌ Failed to get conversations:", error);
    return c.json({ error: error.message, conversations: [] }, 500);
  }
});

// Get messages for a specific conversation
app.get("/make-server-16010b6f/chat/messages/:conversationId", async (c) => {
  try {
    const conversationId = c.req.param("conversationId");
    const queryEmail = normalizeChatEmail(c.req.query("customerEmail"));
    
    // Return empty array immediately if query would timeout
    // This allows localStorage to work without blocking
    let messages;
    try {
      messages = await withTimeout(kv.getByPrefix(`chat:message:${conversationId}:`), 8000); // Increased from 5s to 8s
    } catch (timeoutError) {
      console.log(`⚠️ Chat messages query timeout for ${conversationId} - returning empty array`);
      return c.json({ messages: [], cached: false });
    }
    
    const conversation = await withTimeout(
      kv.get(`chat:conversation:${conversationId}`),
      5000
    ).catch(() => null) as any;

    const resolvedEmail = normalizeChatEmail(
      conversation?.customerEmail || queryEmail || ""
    );

    // Merge alias conversation streams for the same customer+vendor bucket
    // so duplicated historic ids still appear as one continuous thread.
    if (conversation?.customerEmail) {
      const allConversations = await withTimeout(kv.getByPrefix("chat:conversation:"), 10000).catch(() => []);
      const bucket = conversationBucketKeyFor(conversation);
      const aliasIds = (allConversations || [])
        .filter((conv: any) => String(conv?.id || "") !== conversationId)
        .filter((conv: any) => conversationBucketKeyFor(conv) === bucket)
        .map((conv: any) => String(conv?.id || ""))
        .filter(Boolean);

      for (const aliasId of aliasIds) {
        const aliasMessages = await withTimeout(
          kv.getByPrefix(`chat:message:${aliasId}:`),
          8000
        ).catch(() => []);
        if (Array.isArray(aliasMessages) && aliasMessages.length > 0) {
          messages = [...messages, ...aliasMessages];
        }
      }
    }

    // Super-admin replies on the main-store thread must appear on vendor storefront threads too.
    if (resolvedEmail) {
      const allConversations = await withTimeout(kv.getByPrefix("chat:conversation:"), 10000).catch(() => []);
      const peerIds = (allConversations || [])
        .filter((conv: any) => {
          const id = String(conv?.id || "").trim();
          if (!id || id === conversationId) return false;
          return normalizeChatEmail(conv?.customerEmail) === resolvedEmail;
        })
        .map((conv: any) => String(conv.id));

      for (const peerId of peerIds) {
        const peerMessages = await withTimeout(
          kv.getByPrefix(`chat:message:${peerId}:`),
          8000
        ).catch(() => []);
        if (!Array.isArray(peerMessages) || peerMessages.length === 0) continue;
        const adminOnly = peerMessages.filter((m: any) => String(m?.sender) === "admin");
        if (adminOnly.length > 0) {
          messages = [...messages, ...adminOnly];
        }
      }
    }

    const dedupedMessages = Array.from(
      new Map((messages || []).map((m: any) => [String(m?.id || `${m?.timestamp}-${Math.random()}`), m])).values()
    ).sort((a: any, b: any) => {
      const ta = Date.parse(String(a?.timestamp || "")) || 0;
      const tb = Date.parse(String(b?.timestamp || "")) || 0;
      return ta - tb;
    });

    console.log(`📨 Retrieved ${dedupedMessages.length} messages for conversation ${conversationId}`);
    return c.json({ messages: dedupedMessages });
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

    // Determine vendor source name (never persist raw technical ids as the display label)
    const looksLikeTechnicalVendorId = (s: string) =>
      /^vendor[_-]vendor_/i.test(s) ||
      /^vendor-vendor_/i.test(s) ||
      /^vendor_\d/i.test(s);

    const vendorLookupKeys = (raw: string): string[] => {
      const id = String(raw || "").trim();
      const out = new Set<string>([id]);
      const lower = id.toLowerCase();
      if (lower.startsWith("vendor-")) {
        out.add(id.slice(7));
        const inner = id.slice(7);
        const m = inner.match(/^(vendor_[\w]+)$/i);
        if (m) out.add(m[1]);
      }
      return [...out];
    };

    let vendorSource = "SECURE"; // Default to SECURE main store
    if (vendorId) {
      const vendorsData = await withTimeout(kv.get("vendors"), 5000);
      const vid = String(vendorId).trim();
      if (vendorsData && Array.isArray(vendorsData)) {
        const keys = vendorLookupKeys(vid);
        const vendor = vendorsData.find((v: any) => {
          if (!v) return false;
          const vId = String(v.id || "");
          const slug = String(v.storeSlug || "");
          return keys.some(
            (k) => k === vId || k === slug || k === `vendor-${vId}` || `vendor-${vId}` === vid
          );
        });
        if (vendor) {
          vendorSource =
            String(vendor.businessName || vendor.name || vendor.storeSlug || vendor.id || "").trim() ||
            "Vendor store";
        } else {
          vendorSource = looksLikeTechnicalVendorId(vid) ? "Vendor store" : vid;
        }
      } else {
        vendorSource = looksLikeTechnicalVendorId(vid) ? "Vendor store" : vid;
      }
    }

    /**
     * Admin replies must stay on the thread the dashboard selected. Previously we always
     * recomputed id from (email, vendorId); admin payloads omitted vendorId, so every reply
     * was stored under the main-store `conv-…` id — vendor floating chat never saw it.
     */
    const rawConversationId = String(conversationId || "").trim();
    const requestEmailNorm = normalizeChatEmail(customerEmail);
    let canonicalConversationId: string | null = null;

    if (sender === "admin" && rawConversationId) {
      const existingRow = await withTimeout(
        kv.get(`chat:conversation:${rawConversationId}`),
        5000
      ).catch(() => null) as any;
      if (existingRow?.customerEmail) {
        const rowEmailNorm = normalizeChatEmail(existingRow.customerEmail);
        if (
          !requestEmailNorm ||
          !rowEmailNorm ||
          rowEmailNorm === requestEmailNorm
        ) {
          canonicalConversationId = rawConversationId;
        }
      } else if (existingRow) {
        canonicalConversationId = rawConversationId;
      } else {
        canonicalConversationId = rawConversationId;
      }
    }

    if (!canonicalConversationId) {
      canonicalConversationId =
        canonicalConversationIdFor(customerEmail, vendorId, vendorSource) ||
        rawConversationId ||
        `conv-${sanitizeChatToken(customerEmail || Date.now())}`;
    }

    const message = {
      id: messageId,
      conversationId: canonicalConversationId,
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
    const nextUnread = sender === "customer" ? prevUnread + 1 : 0;

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
      vendorId: vendorId || null, // Store vendorId for reference
      starred: Boolean(existingConv?.starred),
    };

    await withTimeout(
      kv.set(`chat:conversation:${message.conversationId}`, conversation),
      5000
    );

    // Fan-out admin replies to every thread for this customer (main store + each vendor storefront).
    if (sender === "admin" && resolvedCustomerEmail) {
      const emailNorm = normalizeChatEmail(resolvedCustomerEmail);
      const allConversations = await withTimeout(kv.getByPrefix("chat:conversation:"), 10000).catch(
        () => []
      );
      const peerWrites: Promise<unknown>[] = [];
      for (const peer of allConversations || []) {
        const peerId = String(peer?.id || "").trim();
        if (!peerId || peerId === message.conversationId) continue;
        if (normalizeChatEmail(peer?.customerEmail) !== emailNorm) continue;

        const peerMsg = { ...message, conversationId: peerId };
        peerWrites.push(
          withTimeout(kv.set(`chat:message:${peerId}:${messageId}`, peerMsg), 5000).catch(
            () => undefined
          )
        );

        const peerUnread = Number(peer?.unread) || 0;
        const peerConv = {
          ...peer,
          lastMessage: text,
          timestamp,
          unread: peerUnread + 1,
          customerName: resolvedCustomerName || peer?.customerName,
          customerEmail: resolvedCustomerEmail || peer?.customerEmail,
          customerProfileImage: resolvedCustomerImage || peer?.customerProfileImage,
        };
        peerWrites.push(
          withTimeout(kv.set(`chat:conversation:${peerId}`, peerConv), 5000).catch(() => undefined)
        );
      }
      await Promise.all(peerWrites);
    }

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

    const conversation = (await withTimeout(
      kv.get(`chat:conversation:${conversationId}`),
      5000
    ).catch(() => null)) as any;

    if (conversation) {
      conversation.unread = 0;
      await withTimeout(kv.set(`chat:conversation:${conversationId}`, conversation), 5000);

      // Merged inbox rows sum unread across alias KV keys — clear every record in the same bucket.
      if (conversation?.customerEmail) {
        const allConversations = await withTimeout(kv.getByPrefix("chat:conversation:"), 10000).catch(
          () => []
        );
        const bucket = conversationBucketKeyFor(conversation);
        const aliasWrites = (allConversations || [])
          .filter((conv: any) => String(conv?.id || "") && String(conv?.id) !== String(conversationId))
          .filter((conv: any) => conversationBucketKeyFor(conv) === bucket)
          .map((conv: any) => {
            const next = { ...conv, unread: 0 };
            return withTimeout(kv.set(`chat:conversation:${conv.id}`, next), 5000).catch(() => undefined);
          });
        await Promise.all(aliasWrites);
      }
    }

    console.log(`✅ Marked conversation ${conversationId} as read`);
    return c.json({ success: true });
  } catch (error: any) {
    console.error("❌ Failed to mark as read:", error);
    return c.json({ error: error.message, success: false }, 500);
  }
});

// Star / unstar one conversation
app.put("/make-server-16010b6f/chat/conversations/:conversationId/star", async (c) => {
  try {
    const conversationId = c.req.param("conversationId");
    const body = await c.req.json().catch(() => ({}));
    const starred = Boolean((body as { starred?: unknown }).starred);

    const conversation = await withTimeout(
      kv.get(`chat:conversation:${conversationId}`),
      5000
    );
    if (!conversation) {
      return c.json({ error: "Conversation not found", success: false }, 404);
    }

    const next = { ...conversation, starred };
    await withTimeout(kv.set(`chat:conversation:${conversationId}`, next), 5000);
    return c.json({ success: true, conversation: next });
  } catch (error: any) {
    console.error("❌ Failed to update conversation star:", error);
    return c.json({ error: error.message, success: false }, 500);
  }
});

// 🔥 DELETE ALL CHAT CONVERSATIONS AND MESSAGES
// Must be registered BEFORE `/:conversationId` or the path segment `all` is captured as an id.
app.delete("/make-server-16010b6f/chat/conversations/all", async (c) => {
  const denied = assertDestructiveOperationAllowed(c);
  if (denied) return denied;
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
            .catch((err) => console.error(`❌ Failed to delete conversation ${conversation.id}:`, err))
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
            .catch((err) => console.error(`❌ Failed to delete message ${message.id}:`, err))
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
    return c.json(
      {
        error: "Failed to delete chat history",
        details: String(error),
      },
      500
    );
  }
});

// Delete one conversation and all its messages
app.delete("/make-server-16010b6f/chat/conversations/:conversationId", async (c) => {
  try {
    const conversationId = c.req.param("conversationId");
    if (conversationId === "all") {
      return c.json({ error: "Use DELETE /chat/conversations/all to clear all history" }, 400);
    }
    const messageRows = await withTimeout(
      kv.getByPrefix(`chat:message:${conversationId}:`),
      15000
    ).catch(() => []);

    let messagesDeleted = 0;
    for (const row of messageRows || []) {
      const msg = row as { id?: unknown };
      const id = String(msg?.id || "").trim();
      if (!id) continue;
      await withTimeout(kv.del(`chat:message:${conversationId}:${id}`), 5000).catch(() => undefined);
      messagesDeleted += 1;
    }

    await withTimeout(kv.del(`chat:conversation:${conversationId}`), 5000);
    return c.json({ success: true, conversationDeleted: 1, messagesDeleted });
  } catch (error: any) {
    console.error("❌ Failed to delete conversation:", error);
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

// ============================================
// VENDOR STOREFRONT ROUTES
// ============================================

// Save vendor storefront settings
app.post("/make-server-16010b6f/vendor/storefront", async (c) => {
  try {
    const body = await c.req.json();
    let { settings } = body;

    if (!settings || !settings.vendorId) {
      return c.json({ error: "Vendor ID is required" }, 400);
    }

    // Strip read-only fields from GET response
    if (settings && typeof settings === "object" && "domainVerification" in settings) {
      const { domainVerification: _dv, ...rest } = settings as Record<string, unknown>;
      settings = rest as typeof settings;
    }

    const rawLogoIn = typeof settings.logo === "string" ? settings.logo.trim() : "";
    if (rawLogoIn.startsWith("data:") && rawLogoIn.length > 450_000) {
      return c.json(
        {
          error:
            "Logo is too large to save as inline data. Pick the image again — it will upload to storage first.",
        },
        413
      );
    }

    // Store settings in KV store with vendor ID as key
    const key = `vendor_storefront_${settings.vendorId}`;
    const prevStorefront = await kv.get(key);
    const prevStorefrontLogo =
      prevStorefront && typeof prevStorefront === "object" && typeof (prevStorefront as any).logo === "string"
        ? String((prevStorefront as any).logo).trim()
        : "";
    const prevStorefrontBanner =
      prevStorefront && typeof prevStorefront === "object" && typeof (prevStorefront as any).banner === "string"
        ? String((prevStorefront as any).banner).trim()
        : "";
    const nameForSlug = String(settings.storeName || "").trim() || "Vendor Store";
    // Slug always derived from current store name (a-z0-9 only) — same vendor reuses their slug if still "free"
    const finalSlug = await allocateUniqueVendorSlugFromName(nameForSlug, settings.vendorId);
    const mergedSettings = { ...settings, storeSlug: finalSlug };
    const rawPixel =
      typeof (mergedSettings as Record<string, unknown>).metaPixelId === "string"
        ? String((mergedSettings as Record<string, unknown>).metaPixelId).trim()
        : "";
    if (rawPixel && /^\d{5,20}$/.test(rawPixel)) {
      (mergedSettings as Record<string, unknown>).metaPixelId = rawPixel;
    } else {
      delete (mergedSettings as Record<string, unknown>).metaPixelId;
    }
    mergeMetaCapiAccessTokenOnSave(
      mergedSettings as Record<string, unknown>,
      prevStorefront,
      body?.clearMetaCapiAccessToken === true,
    );
    delete (mergedSettings as Record<string, unknown>).clearMetaCapiAccessToken;
    await kv.set(key, mergedSettings);
    const nextStorefrontLogo =
      typeof (mergedSettings as any).logo === "string" ? String((mergedSettings as any).logo).trim() : "";
    const nextStorefrontBanner =
      typeof (mergedSettings as any).banner === "string" ? String((mergedSettings as any).banner).trim() : "";
    const removedStorefrontAssets: unknown[] = [];
    if (prevStorefrontLogo && prevStorefrontLogo !== nextStorefrontLogo) {
      removedStorefrontAssets.push(prevStorefrontLogo);
    }
    if (prevStorefrontBanner && prevStorefrontBanner !== nextStorefrontBanner) {
      removedStorefrontAssets.push(prevStorefrontBanner);
    }
    if (removedStorefrontAssets.length > 0) {
      await deleteOwnedStorageRefs(supabase, removedStorefrontAssets);
    }

    // Keep `vendor_settings:*` in sync — public catalog and auth still read storeName from there first in some paths
    const vsKey = `vendor_settings:${settings.vendorId}`;
    const existingVs = await kv.get(vsKey);
    const contactPhone =
      typeof (mergedSettings as Record<string, unknown>).contactPhone === "string"
        ? String((mergedSettings as Record<string, unknown>).contactPhone).trim()
        : "";
    if (existingVs && typeof existingVs === "object") {
      await kv.set(vsKey, {
        ...existingVs,
        storeName: mergedSettings.storeName ?? existingVs.storeName,
        storeSlug: mergedSettings.storeSlug ?? existingVs.storeSlug,
        logo: settings.logo ?? existingVs.logo,
        banner: settings.banner ?? existingVs.banner,
        ...(contactPhone ? { storePhone: contactPhone } : {}),
        updatedAt: new Date().toISOString(),
      });
    } else if (mergedSettings.storeName || mergedSettings.storeSlug) {
      await kv.set(vsKey, {
        vendorId: settings.vendorId,
        storeName: mergedSettings.storeName || "Vendor Store",
        storeSlug: mergedSettings.storeSlug || "",
        storeDescription: mergedSettings.storeDescription || "",
        storeTagline: mergedSettings.storeTagline || "",
        logo: mergedSettings.logo || "",
        banner: mergedSettings.banner || "",
        ...(contactPhone ? { storePhone: contactPhone } : {}),
        isActive: mergedSettings.isActive !== false,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
    }

    // 🔥 Get vendor's actual businessName for slug mapping
    const vendorData = await kv.get(`vendor:${settings.vendorId}`);
    const vendorBusinessName = vendorData?.businessName || vendorData?.name;

    // 🔥 SYNC LOGO TO VENDOR AVATAR: Update vendor record with new logo
    if (vendorData) {
      const prevVendorAvatar =
        typeof (vendorData as any)?.avatar === "string" ? String((vendorData as any).avatar).trim() : "";
      const updatedVendor = {
        ...vendorData,
        avatar: typeof mergedSettings.logo === "string" ? mergedSettings.logo : "",
        updatedAt: new Date().toISOString()
      };
      await kv.set(`vendor:${settings.vendorId}`, updatedVendor);
      queueVendorReadModelSync(String(settings.vendorId), {
        ...updatedVendor,
        storeName: mergedSettings.storeName,
        storeSlug: mergedSettings.storeSlug,
        customDomain: mergedSettings.customDomain,
      });
      const nextVendorAvatar =
        typeof updatedVendor.avatar === "string" ? String(updatedVendor.avatar).trim() : "";
      if (prevVendorAvatar && prevVendorAvatar !== nextVendorAvatar) {
        await deleteOwnedStorageRefs(supabase, [prevVendorAvatar]);
      }
      console.log(`✅ Synced logo to vendor avatar for vendor ${settings.vendorId}`);
      
      // 🔥 INVALIDATE VENDORS CACHE so the updated logo appears immediately
      clearCache("vendors");
      clearCache("vendors_list_v4");
      console.log(`🗑️ Cleared vendors cache after logo sync`);
    }

    // 🔥 AUTO-CREATE SLUG MAPPING with storefront's storeSlug (old slug keys kept so bookmarks keep working)
    const slugKey = `vendor_slug_${mergedSettings.storeSlug}`;
    const slugMapping = {
      slug: mergedSettings.storeSlug,
      vendorId: settings.vendorId,
      businessName: mergedSettings.storeName || "Vendor Store",
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
      
      if (businessNameSlug !== mergedSettings.storeSlug) {
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

    serverCache.delete(`vendor_by_slug:${mergedSettings.storeSlug}`);
    if (prevStorefront?.storeSlug && prevStorefront.storeSlug !== mergedSettings.storeSlug) {
      serverCache.delete(`vendor_by_slug:${prevStorefront.storeSlug}`);
    }

    console.log(`✅ Vendor storefront settings saved for vendor ${settings.vendorId} with slug: ${mergedSettings.storeSlug}`);
    return c.json({
      success: true,
      settings: sanitizeMetaCapiForAdminResponse(mergedSettings as Record<string, unknown>),
    });

  } catch (error: any) {
    console.error("❌ Failed to save vendor storefront settings:", error);
    return c.json({ error: error.message || "Failed to save settings" }, 500);
  }
});

/** Vendor admin: upload logo to Storage (avoid huge data: URLs in KV / request body limits). */
app.post("/make-server-16010b6f/vendor/storefront/upload-logo", async (c) => {
  try {
    const body = await c.req.json().catch(() => ({}));
    const vendorId = String((body as { vendorId?: string }).vendorId || "").trim();
    const imageData = String((body as { imageData?: string }).imageData || "").trim();
    const fileName = String((body as { fileName?: string }).fileName || "logo.jpg").trim();
    if (!vendorId || !imageData) {
      return c.json({ error: "vendorId and imageData are required" }, 400);
    }
    const vendor = await kv.get(`vendor:${vendorId}`);
    if (!vendor || typeof vendor !== "object") {
      return c.json({ error: "Vendor not found" }, 404);
    }
    if (!vendorProfileAllowsPublicStorefront(vendor)) {
      return c.json({ error: "Vendor account is not active" }, 403);
    }

    const base64Data = imageData.includes(",") ? imageData.split(",")[1] || imageData : imageData;
    let buffer: Uint8Array;
    try {
      buffer = Uint8Array.from(atob(base64Data), (ch) => ch.charCodeAt(0));
    } catch {
      return c.json({ error: "Invalid image data" }, 400);
    }
    if (buffer.length > 600 * 1024) {
      return c.json({ error: "Image too large (max ~600KB)" }, 400);
    }

    const BUCKET_NAME = "make-16010b6f-store-logos";
    try {
      await ensureBucket(supabase, BUCKET_NAME, {
        public: false,
        fileSizeLimit: 629145,
      });
    } catch (bucketErr: unknown) {
      console.error("❌ vendor storefront logo bucket:", bucketErr);
      return c.json({ error: "Failed to ensure storage bucket" }, 500);
    }

    const safeId = vendorId.replace(/[^a-z0-9_-]/gi, "_").slice(0, 80);
    const ext = (fileName.split(".").pop() || "jpg").toLowerCase().replace(/[^a-z0-9]/g, "") || "jpg";
    const objectPath = `v_${safeId}/${Date.now()}_${Math.random().toString(36).slice(2, 10)}.${ext}`;

    const { error: uploadError } = await supabase.storage
      .from(BUCKET_NAME)
      .upload(objectPath, buffer, {
        contentType: (() => {
          const head = imageData.slice(0, 48).toLowerCase();
          if (head.includes("image/png")) return "image/png";
          if (head.includes("image/webp")) return "image/webp";
          if (head.includes("image/gif")) return "image/gif";
          return "image/jpeg";
        })(),
        upsert: false,
      });
    if (uploadError) {
      console.error("❌ vendor logo upload:", uploadError);
      return c.json({ error: uploadError.message || "Upload failed" }, 500);
    }

    const { data: urlData, error: urlError } = await supabase.storage
      .from(BUCKET_NAME)
      .createSignedUrl(objectPath, 315360000);

    if (urlError || !urlData?.signedUrl) {
      return c.json({ error: urlError?.message || "Failed to sign logo URL" }, 500);
    }

    return c.json({
      success: true,
      imageUrl: urlData.signedUrl,
      objectPath,
    });
  } catch (error: unknown) {
    console.error("❌ vendor storefront upload-logo:", error);
    return c.json({ error: String((error as Error)?.message || error) }, 500);
  }
});

// Get vendor storefront settings by vendor ID
app.get("/make-server-16010b6f/vendor/storefront/:vendorId", async (c) => {
  try {
    const param = c.req.param("vendorId");
    const actualVendorId = await resolveVendorIdFromSlugOrId(param);
    const vendor = await withTimeout(kv.get(`vendor:${actualVendorId}`), 5000).catch(() => null);
    if (!vendor || typeof vendor !== "object") {
      return c.json({ error: "Vendor not found" }, 404);
    }
    if (!vendorProfileAllowsPublicStorefront(vendor)) {
      return c.json(
        {
          error: "This vendor account cannot load storefront settings right now.",
          vendorAccountInactive: true,
          reason: (vendor as { status?: string }).status || "inactive",
        },
        403
      );
    }

    const key = `vendor_storefront_${actualVendorId}`;

    // Get vendor settings
    const settings = await kv.get(key);
    const vendorSettingsRow = (await withTimeout(
      kv.get(`vendor_settings:${actualVendorId}`),
      5000
    ).catch(() => null)) as Record<string, unknown> | null;

    // Get vendor data to populate contact fields from application
    
    const resolvedVendorLogo =
      typeof vendor?.avatar === "string" && vendor.avatar.trim()
        ? vendor.avatar.trim()
        : typeof vendor?.logo === "string" && vendor.logo.trim()
          ? vendor.logo.trim()
          : "";

    const displayName = String(vendor?.name || (vendor as { businessName?: string })?.businessName || "Vendor Store").trim() || "Vendor Store";
    const slugFromVendorSettings =
      typeof vendorSettingsRow?.storeSlug === "string" ? vendorSettingsRow.storeSlug.trim() : "";
    const slugFromStoreName = storeSlugFromBusinessName(displayName);

    if (!settings) {
      console.log(`⚠️ No settings found for vendor ${actualVendorId}, returning defaults`);
      // Return default settings if none exist, populated with vendor data if available
      return c.json({ 
        settings: {
          vendorId: actualVendorId,
          storeName: displayName,
          storeSlug: slugFromVendorSettings || slugFromStoreName,
          storeDescription: "Welcome to our store",
          storeTagline: "",
          logo: resolvedVendorLogo,
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
          termsContent: "",
          privacyPolicyContent: "",
          policies: {
            returnPolicy: "We accept returns within 30 days of purchase.",
            shippingPolicy: "We ship within 2-3 business days.",
            termsPolicy: "",
            privacyPolicy: "We protect your privacy and never share your personal information.",
          },
          isActive: true,
        }
      });
    }

    // Populate empty contact fields from vendor data if they're missing
    const rawSlug =
      typeof (settings as { storeSlug?: unknown }).storeSlug === "string"
        ? String((settings as { storeSlug: string }).storeSlug).trim()
        : "";
    const rawStoreName =
      typeof (settings as { storeName?: unknown }).storeName === "string"
        ? String((settings as { storeName: string }).storeName).trim()
        : "";
    const resolvedStoreSlug =
      rawSlug ||
      slugFromVendorSettings ||
      storeSlugFromBusinessName(rawStoreName || displayName);

    const populatedSettings = {
      ...settings,
      storeSlug: resolvedStoreSlug,
      logo:
        typeof settings.logo === "string" && settings.logo.trim()
          ? settings.logo
          : resolvedVendorLogo,
      contactEmail: settings.contactEmail || vendor?.email || "",
      contactPhone: settings.contactPhone || vendor?.phone || "",
      address: settings.address || vendor?.location || "",
    };

    const pending = await kv.get(`vendor_domain_pending:${actualVendorId}`);
    let domainVerification:
      | {
          txtName: string;
          txtValue: string;
          cnameTarget: string;
          deploymentPlatform: "edgeone" | "vercel";
        }
      | undefined;
    if (
      pending &&
      typeof pending === "object" &&
      (pending as { hostname?: string; token?: string }).hostname &&
      (pending as { hostname?: string; token?: string }).token
    ) {
      const ph = pending as { hostname: string; token: string };
      const ct = customDomainCnameTarget();
      domainVerification = {
        txtName: `_migoo-verify.${ph.hostname}`,
        txtValue: `migoo-verify=${ph.token}`,
        cnameTarget: ct,
        deploymentPlatform: deploymentPlatformName(),
      };
    }

    console.log(`✅ Loaded settings for vendor ${actualVendorId}, isActive: ${populatedSettings.isActive}`);

    return c.json({
      settings: sanitizeMetaCapiForAdminResponse({
        ...(populatedSettings as Record<string, unknown>),
        domainVerification,
      }),
      deploymentPlatform: deploymentPlatformName(),
    });

  } catch (error: any) {
    console.error("❌ Failed to load vendor storefront settings:", error);
    return c.json({ error: error.message || "Failed to load settings" }, 500);
  }
});

// --- Custom domain: DNS TXT (Cloudflare DoH) + KV custom_domain_host:* ---

function normalizeVendorHostnameInput(input: string): string | null {
  if (!input || typeof input !== "string") return null;
  let s = input
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/\/.*$/, "");
  if (!s) return null;
  const domainRegex = /^([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,}$/i;
  if (!domainRegex.test(s)) return null;
  return s;
}

function stripWwwHostname(host: string): string {
  const h = host.trim().toLowerCase();
  return h.startsWith("www.") ? h.slice(4) : h;
}

/** Primary/reserved marketplace apex domains — cannot be vendor custom domains. */
function getReservedPlatformApexDomains(): Set<string> {
  const reserved = new Set<string>();
  for (const part of String(Deno.env.get("PLATFORM_RESERVED_APEX_DOMAINS") || "")
    .split(",")
    .map((s) => stripWwwHostname(s.trim()))
    .filter(Boolean)) {
    reserved.add(part);
  }
  const primary = stripWwwHostname(
    String(Deno.env.get("VENDOR_SUBDOMAIN_BASE_DOMAIN") || "").trim()
  );
  if (primary) reserved.add(primary);
  return reserved;
}

function isReservedPlatformApexHostname(hostname: string): boolean {
  const normalized = normalizeVendorHostnameInput(hostname);
  if (!normalized) return false;
  const bare = stripWwwHostname(normalized);
  return getReservedPlatformApexDomains().has(bare);
}

function isEdgeOneDeploymentBackend(): boolean {
  const platform = String(Deno.env.get("DEPLOYMENT_PLATFORM") || "").trim().toLowerCase();
  return platform === "edgeone" || platform === "tencent";
}

function deploymentPlatformName(): "edgeone" | "vercel" {
  return isEdgeOneDeploymentBackend() ? "edgeone" : "vercel";
}

function customDomainCnameTarget(): string {
  const explicit = String(Deno.env.get("CUSTOM_DOMAIN_CNAME_TARGET") || "").trim();
  if (explicit) return explicit;
  if (isEdgeOneDeploymentBackend()) return "";
  return "cname.vercel-dns.com";
}

/** One TXT RDATA presentation: one or more quoted strings in one field. */
function parseDnsTxtData(data: string): string[] {
  const raw = data.trim();
  const parts: string[] = [];
  const re = /"((?:[^"\\]|\\.)*)"/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(raw)) !== null) {
    parts.push(m[1].replace(/\\"/g, '"'));
  }
  if (parts.length > 0) {
    return parts;
  }
  let s = raw;
  if (s.startsWith('"') && s.endsWith('"')) {
    s = s.slice(1, -1).replace(/\\"/g, '"');
  }
  return [s];
}

/**
 * Resolve TXT at fqdn via several DoH providers and merge answers (avoids one resolver
 * returning empty while another already sees the record). Includes joined form for split TXT.
 */
async function fetchDnsTxtRecords(fqdn: string): Promise<string[]> {
  const endpoints = [
    `https://cloudflare-dns.com/dns-query?name=${encodeURIComponent(fqdn)}&type=TXT`,
    `https://dns.google/resolve?name=${encodeURIComponent(fqdn)}&type=TXT`,
    `https://dns.quad9.net/dns-query?name=${encodeURIComponent(fqdn)}&type=TXT`,
  ];
  const segments: string[] = [];

  for (const url of endpoints) {
    try {
      const res = await fetch(url, {
        headers: { Accept: "application/dns-json" },
      });
      if (!res.ok) continue;
      const j = (await res.json()) as {
        Status?: number;
        Answer?: Array<{ type?: number; data?: string }>;
      };
      if (typeof j.Status === "number" && j.Status !== 0) continue;
      if (!j.Answer || !Array.isArray(j.Answer)) continue;
      for (const a of j.Answer) {
        if (a.type === 16 && typeof a.data === "string") {
          for (const piece of parseDnsTxtData(a.data)) {
            segments.push(piece.trim());
          }
        }
      }
    } catch {
      continue;
    }
  }

  if (segments.length === 0) return [];
  const joined = segments.join("");
  return [...new Set([...segments, joined])];
}

function txtRecordMatchesToken(record: string, needleLower: string): boolean {
  const r = record.trim().replace(/^"+|"+$/g, "").toLowerCase();
  return r.includes(needleLower);
}

/** HTML parking / default pages at the registrar — traffic never reaches Vercel. */
function looksLikeRegistrarParkingPage(html: string): boolean {
  const s = html.slice(0, 10000).toLowerCase();
  if (!s.includes("<html") && !s.includes("<!doctype")) return false;
  if (s.includes("parked domain") && s.includes("hostinger")) return true;
  if (s.includes("registered at hostinger")) return true;
  if (s.includes("domain parking") && s.includes("hostinger")) return true;
  return false;
}

/** HTTPS proof: token is served at /.well-known/migoo-verify.txt on this Vercel deployment (custom domain Host). */
async function verifyViaWellKnownHttps(
  normalized: string,
  needleLower: string
): Promise<{ matched: boolean; sawParkingHtml: boolean }> {
  const path = "/.well-known/migoo-verify.txt";
  const hosts = new Set<string>();
  hosts.add(normalized);
  if (!normalized.startsWith("www.")) {
    hosts.add(`www.${normalized}`);
  } else {
    const apex = normalized.replace(/^www\./, "");
    if (apex) hosts.add(apex);
  }

  let sawParkingHtml = false;

  for (const h of hosts) {
    const url = `https://${h}${path}`;
    const controller = new AbortController();
    const t = setTimeout(() => controller.abort(), 12_000);
    try {
      const r = await fetch(url, {
        redirect: "follow",
        headers: {
          "User-Agent":
            "Mozilla/5.0 (compatible; MigooDomainVerify/1; +https://nexa-mm.com)",
          Accept: "text/plain,text/html;q=0.9,*/*;q=0.8",
        },
        signal: controller.signal,
      });
      if (!r.ok) continue;
      const text = await r.text();
      const probe = text.length > 8192 ? text.slice(0, 8192) : text;
      if (probe.trimStart().startsWith("<") && looksLikeRegistrarParkingPage(text)) {
        sawParkingHtml = true;
      }
      if (txtRecordMatchesToken(probe, needleLower)) {
        return { matched: true, sawParkingHtml: false };
      }
    } catch {
      continue;
    } finally {
      clearTimeout(t);
    }
  }
  return { matched: false, sawParkingHtml };
}

/** KV keys for pending HTTPS check — both apex and www so Host header matches after redirects. */
function vendorPendingHostKvKeys(hostname: string): string[] {
  const n = hostname.toLowerCase().trim();
  const keys = new Set<string>();
  keys.add(`vendor_domain_pending_host:${n}`);
  if (!n.startsWith("www.")) {
    keys.add(`vendor_domain_pending_host:www.${n}`);
  } else {
    const apex = n.replace(/^www\./, "");
    if (apex) keys.add(`vendor_domain_pending_host:${apex}`);
  }
  return [...keys];
}

async function findOtherVendorWithHostname(
  hostname: string,
  excludeVendorId: string
): Promise<boolean> {
  const direct = await kv.get(`custom_domain_host:${hostname}`);
  if (direct?.vendorId && direct.vendorId !== excludeVendorId) {
    const mappedVendor = await kv.get(`vendor:${direct.vendorId}`);
    if (mappedVendor) {
      return true;
    }
    // Self-heal stale domain host mapping pointing to deleted vendor.
    for (const h of customDomainLookupVariants(hostname)) {
      await kv.del(`custom_domain_host:${h}`);
    }
  }
  const all = await kv.getByPrefix("vendor_storefront_");
  const list = Array.isArray(all) ? all : [];
  for (const s of list) {
    if (!s || typeof s !== "object") continue;
    const v = s as { vendorId?: string; customDomain?: string; domainStatus?: string };
    if (!v.vendorId || v.vendorId === excludeVendorId) continue;
    if (
      String(v.customDomain || "").toLowerCase() === hostname &&
      v.domainStatus === "verified"
    ) {
      const mappedVendor = await kv.get(`vendor:${v.vendorId}`);
      if (mappedVendor) {
        return true;
      }
      // Self-heal stale storefront row from deleted vendor.
      await kv.del(`vendor_storefront_${v.vendorId}`);
      for (const h of customDomainLookupVariants(hostname)) {
        await kv.del(`custom_domain_host:${h}`);
      }
      await kv.del(`vendor_domain_pending:${v.vendorId}`);
      for (const k of vendorPendingHostKvKeys(hostname)) {
        await kv.del(k);
      }
    }
  }
  return false;
}

app.post("/make-server-16010b6f/vendor/custom-domain/prepare", async (c) => {
  try {
    const body = await c.req.json();
    const vendorId = String(body?.vendorId || "").trim();
    const hostnameRaw = String(body?.hostname || body?.domain || "").trim();
    const normalized = normalizeVendorHostnameInput(hostnameRaw);
    if (!vendorId || !normalized) {
      return c.json({ error: "vendorId and a valid hostname are required" }, 400);
    }
    if (
      isReservedPlatformApexHostname(normalized) ||
      normalized.endsWith(".vercel.app")
    ) {
      return c.json({ error: "This hostname cannot be used as a custom domain" }, 400);
    }
    if (await findOtherVendorWithHostname(normalized, vendorId)) {
      return c.json({ error: "This domain is already connected to another store" }, 409);
    }

    const token = crypto.randomUUID();
    const txtName = `_migoo-verify.${normalized}`;
    const txtValue = `migoo-verify=${token}`;

    const sfKey = `vendor_storefront_${vendorId}`;
    const prev = (await kv.get(sfKey)) || {};
    const prevHost =
      prev && typeof prev === "object"
        ? String((prev as { customDomain?: string }).customDomain || "").toLowerCase().trim()
        : "";
    if (prevHost && prevHost !== normalized) {
      for (const k of vendorPendingHostKvKeys(prevHost)) {
        await kv.del(k);
      }
    }

    await kv.set(`vendor_domain_pending:${vendorId}`, {
      hostname: normalized,
      token,
      createdAt: new Date().toISOString(),
    });
    const hostPayload = {
      vendorId,
      token,
      createdAt: new Date().toISOString(),
    };
    for (const k of vendorPendingHostKvKeys(normalized)) {
      await kv.set(k, hostPayload);
    }

    await kv.set(sfKey, {
      ...(typeof prev === "object" && prev ? prev : {}),
      vendorId,
      customDomain: normalized,
      domainStatus: "pending",
      dnsVerified: false,
    });

    return c.json({
      hostname: normalized,
      txtName,
      txtValue,
      cnameTarget: customDomainCnameTarget(),
      deploymentPlatform: deploymentPlatformName(),
    });
  } catch (error: any) {
    console.error("❌ custom-domain/prepare:", error);
    return c.json({ error: error.message || "Failed to prepare domain" }, 500);
  }
});

/** Public: token text for HTTPS verification (Host must match a pending domain). */
app.get("/make-server-16010b6f/vendor/custom-domain/challenge-text", async (c) => {
  try {
    const raw = c.req.query("hostname") || c.req.query("host") || "";
    const normalized = normalizeVendorHostnameInput(String(raw));
    if (!normalized) {
      return c.text("Bad request", 400);
    }
    let r: { token?: string } | null = null;
    for (const k of vendorPendingHostKvKeys(normalized)) {
      const row = await kv.get(k);
      const cand =
        row && typeof row === "object" ? (row as { token?: string }) : null;
      if (cand?.token) {
        r = cand;
        break;
      }
    }
    if (!r?.token) {
      return c.text("Not found", 404);
    }
    return c.text(`migoo-verify=${r.token}`, 200, {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-store",
    });
  } catch (error: any) {
    console.error("❌ challenge-text:", error);
    return c.text("Error", 500);
  }
});

/** Hostnames that should resolve to the same vendor (apex ↔ www). */
function customDomainLookupVariants(hostname: string): string[] {
  const h = hostname.toLowerCase().trim();
  const out = new Set<string>();
  out.add(h);
  if (h.startsWith("www.")) {
    const apex = h.slice(4);
    if (apex) out.add(apex);
  } else if (h && !h.startsWith("www.")) {
    out.add(`www.${h}`);
  }
  return [...out];
}

app.post("/make-server-16010b6f/vendor/verify-domain", async (c) => {
  try {
    const body = await c.req.json();
    const vendorId = String(body?.vendorId || "").trim();
    const domainInput = String(body?.domain || body?.hostname || "").trim();
    const normalized = normalizeVendorHostnameInput(domainInput);

    if (!vendorId || !normalized) {
      return c.json({ verified: false, error: "Vendor ID and domain are required" }, 400);
    }

    const pending = await kv.get(`vendor_domain_pending:${vendorId}`);
    const p = pending && typeof pending === "object" ? (pending as { hostname?: string; token?: string }) : null;
    if (!p?.token || p.hostname !== normalized) {
      return c.json({
        verified: false,
        error: "No pending verification for this domain. Use “Save instructions” first.",
      }, 400);
    }

    const fqdn = `_migoo-verify.${normalized}`;
    const needle = `migoo-verify=${p.token}`;
    const needleLower = needle.toLowerCase();

    const httpCheck = await verifyViaWellKnownHttps(normalized, needleLower);
    let verified = httpCheck.matched;
    if (!verified) {
      const txtRecords = await fetchDnsTxtRecords(fqdn);
      verified = txtRecords.some((r) => txtRecordMatchesToken(r, needleLower));
    }

    if (!verified) {
      const checker = `https://dnschecker.org/#TXT/${encodeURIComponent(fqdn)}`;
      const hostingLabel = isEdgeOneDeploymentBackend() ? "EdgeOne" : "Vercel";
      const dnsHint = isEdgeOneDeploymentBackend()
        ? "the CNAME EdgeOne shows for this hostname"
        : `the exact A/CNAME values from Vercel → Project → Domains for ${normalized}`;
      const parkingMsg = httpCheck.sawParkingHtml
        ? ` Right now https://${normalized} still shows your registrar's parking page (e.g. Hostinger), so traffic never reaches this ${hostingLabel} app. In your DNS provider, point this hostname to ${dnsHint}, then wait for DNS to update.`
        : "";
      return c.json({
        verified: false,
        message:
          `Could not confirm your domain yet.${parkingMsg} When https://${normalized} loads this store (not a parking page), Verify will read https://${normalized}/.well-known/migoo-verify.txt automatically. Optional: TXT at "${fqdn}" = ${needle} (see ${checker}).`,
        domain: normalized,
      });
    }

    if (await findOtherVendorWithHostname(normalized, vendorId)) {
      return c.json({ verified: false, error: "This domain is already in use" }, 409);
    }

    const sfKey = `vendor_storefront_${vendorId}`;
    const settings = (await kv.get(sfKey)) || {};
    const merged =
      typeof settings === "object" && settings
        ? settings
        : { vendorId, storeName: "Store", storeSlug: `vendor-${vendorId}` };
    const storeSlug = String((merged as { storeSlug?: string }).storeSlug || "").trim() || `vendor-${vendorId}`;
    const storeName = String((merged as { storeName?: string }).storeName || "").trim() || "Store";

    const prevHostEntry = await kv.get(`custom_domain_host:${normalized}`);
    if (prevHostEntry?.vendorId && prevHostEntry.vendorId !== vendorId) {
      const mappedVendor = await kv.get(`vendor:${prevHostEntry.vendorId}`);
      if (mappedVendor) {
        return c.json({ verified: false, error: "Domain conflict" }, 409);
      }
      // Self-heal stale host keys from deleted vendor before claiming.
      for (const h of customDomainLookupVariants(normalized)) {
        await kv.del(`custom_domain_host:${h}`);
      }
    }

    const oldSettings = await kv.get(sfKey);
    const oldDomain =
      oldSettings && typeof oldSettings === "object"
        ? String((oldSettings as { customDomain?: string }).customDomain || "").toLowerCase()
        : "";
    if (oldDomain && oldDomain !== normalized) {
      for (const h of customDomainLookupVariants(oldDomain)) {
        await kv.del(`custom_domain_host:${h}`);
      }
    }

    await kv.set(sfKey, {
      ...(merged as object),
      vendorId,
      customDomain: normalized,
      domainStatus: "verified",
      dnsVerified: true,
    });
    const hostPayload = { vendorId, storeSlug, storeName };
    for (const hostKey of customDomainLookupVariants(normalized)) {
      await kv.set(`custom_domain_host:${hostKey}`, hostPayload);
    }
    await kv.del(`vendor_domain_pending:${vendorId}`);
    for (const k of vendorPendingHostKvKeys(normalized)) {
      await kv.del(k);
    }

    console.log(`✅ Custom domain verified: ${normalized} → vendor ${vendorId}`);

    return c.json({
      verified: true,
      message: isEdgeOneDeploymentBackend()
        ? "Domain verified. Your storefront can use this hostname once DNS and EdgeOne are aligned."
        : "Domain verified. Your storefront can use this hostname once DNS and Vercel are aligned.",
      domain: normalized,
      storeSlug,
    });
  } catch (error: any) {
    console.error("❌ Failed to verify domain:", error);
    return c.json({ error: error.message || "Failed to verify domain" }, 500);
  }
});

app.delete("/make-server-16010b6f/vendor/custom-domain", async (c) => {
  try {
    const body = await c.req.json().catch(() => ({}));
    const vendorId = String(body?.vendorId || "").trim();
    if (!vendorId) return c.json({ error: "vendorId required" }, 400);

    const sfKey = `vendor_storefront_${vendorId}`;
    const settings = await kv.get(sfKey);
    const dom =
      settings && typeof settings === "object"
        ? String((settings as { customDomain?: string }).customDomain || "").toLowerCase()
        : "";
    if (dom) {
      for (const h of customDomainLookupVariants(dom)) {
        await kv.del(`custom_domain_host:${h}`);
      }
      for (const k of vendorPendingHostKvKeys(dom)) {
        await kv.del(k);
      }
    }
    await kv.del(`vendor_domain_pending:${vendorId}`);

    if (settings && typeof settings === "object") {
      await kv.set(sfKey, {
        ...(settings as object),
        customDomain: "",
        domainStatus: "none",
        dnsVerified: false,
      });
    }

    return c.json({ success: true });
  } catch (error: any) {
    console.error("❌ custom-domain delete:", error);
    return c.json({ error: error.message || "Failed to remove domain" }, 500);
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

// 🔥 Get vendor by custom domain (public — SPA + workers)
app.get("/make-server-16010b6f/vendor/by-domain", async (c) => {
  try {
    const raw = c.req.query("domain");
    if (!raw) {
      return c.json({ error: "Domain parameter required" }, 400);
    }
    const normalized = normalizeVendorHostnameInput(raw) || raw.trim().toLowerCase();
    const variants = customDomainLookupVariants(normalized);
    console.log(`🔍 Looking up vendor for domain: ${normalized} (variants: ${variants.join(", ")})`);

    for (const hostKey of variants) {
      const fast = await kv.get(`custom_domain_host:${hostKey}`);
      if (fast?.vendorId && fast?.storeSlug) {
        const vendor = await kv.get(`vendor:${fast.vendorId}`);
        if (!vendor) {
          // Self-heal stale host mapping when vendor was deleted.
          for (const h of customDomainLookupVariants(hostKey)) {
            await kv.del(`custom_domain_host:${h}`);
          }
          continue;
        }
        if (!vendorProfileAllowsPublicStorefront(vendor)) {
          return c.json(
            {
              error: "This store is not available.",
              storeUnavailable: true,
              reason: (vendor as { status?: string }).status || "inactive",
            },
            403
          );
        }
        return c.json({
          vendorId: fast.vendorId,
          storeSlug: fast.storeSlug,
          storeName: fast.storeName || vendor?.name,
          businessName: vendor?.businessName || vendor?.name,
        });
      }
    }

    const allSettings = await kv.getByPrefix("vendor_storefront_");
    const validSettings = Array.isArray(allSettings) ? allSettings.filter((s) => s != null) : [];

    const vendorSettings = validSettings.find((s: any) => {
      const cd =
        normalizeVendorHostnameInput(String(s.customDomain || "")) ||
        String(s.customDomain || "").toLowerCase().trim();
      if (!variants.includes(cd)) return false;
      return (
        s.domainStatus === "verified" &&
        s.dnsVerified === true &&
        (s.isActive !== false)
      );
    });

    if (!vendorSettings) {
      console.log(`❌ No verified vendor found for domain: ${normalized}`);
      return c.json({ error: "Vendor not found for this domain" }, 404);
    }

    const vendor = await kv.get(`vendor:${vendorSettings.vendorId}`);
    if (!vendorProfileAllowsPublicStorefront(vendor)) {
      return c.json(
        {
          error: "This store is not available.",
          storeUnavailable: true,
          reason: (vendor as { status?: string } | null)?.status || "inactive",
        },
        403
      );
    }

    return c.json({
      vendorId: vendorSettings.vendorId,
      storeSlug: vendorSettings.storeSlug,
      storeName: vendorSettings.storeName,
      businessName: vendor?.businessName || vendor?.name,
    });
  } catch (error: any) {
    console.error("❌ Error looking up vendor by domain:", error);
    return c.json({ error: error.message || "Failed to lookup vendor" }, 500);
  }
});

/**
 * Admin emergency cleanup: hard-purge any domain mapping remnants by hostname.
 * This removes fast host keys + resets matching storefront customDomain fields.
 */
app.post("/make-server-16010b6f/admin/domain/purge", async (c) => {
  try {
    const body = await c.req.json().catch(() => ({}));
    const raw = String(body?.domain || body?.hostname || "").trim();
    const normalized = normalizeVendorHostnameInput(raw) || raw.toLowerCase();
    if (!normalized) {
      return c.json({ error: "domain/hostname required" }, 400);
    }

    const variants = customDomainLookupVariants(normalized);
    const removedHostKeys: string[] = [];
    const touchedVendors: string[] = [];

    for (const host of variants) {
      const key = `custom_domain_host:${host}`;
      const row = await kv.get(key);
      if (row?.vendorId) touchedVendors.push(String(row.vendorId));
      await kv.del(key);
      removedHostKeys.push(key);
      for (const pendingKey of vendorPendingHostKvKeys(host)) {
        await kv.del(pendingKey);
      }
    }

    const allSettings = await kv.getByPrefix("vendor_storefront_");
    const validSettings = Array.isArray(allSettings) ? allSettings.filter((s) => s && typeof s === "object") : [];
    for (const s of validSettings as any[]) {
      const cd = String(s.customDomain || "").toLowerCase().trim();
      if (!cd || !variants.includes(cd)) continue;
      const vendorId = String(s.vendorId || "").trim();
      if (!vendorId) continue;
      touchedVendors.push(vendorId);
      await kv.del(`vendor_domain_pending:${vendorId}`);
      await kv.set(`vendor_storefront_${vendorId}`, {
        ...s,
        customDomain: "",
        domainStatus: "none",
        dnsVerified: false,
      });
    }

    return c.json({
      success: true,
      domain: normalized,
      removedHostKeys,
      touchedVendors: [...new Set(touchedVendors)],
    });
  } catch (error: any) {
    console.error("❌ admin/domain/purge:", error);
    return c.json({ error: error.message || "Failed to purge domain mapping" }, 500);
  }
});

/** Public catalog + storefront require an active vendor profile (not suspended/banned/inactive). */
function vendorProfileAllowsPublicStorefront(vendorRow: unknown): boolean {
  if (!vendorRow || typeof vendorRow !== "object") return true;
  const s = String((vendorRow as { status?: unknown }).status || "active")
    .trim()
    .toLowerCase();
  return s === "active";
}

async function clearVendorPublicSlugCaches(vendorId: string) {
  try {
    const [vs, sf] = await Promise.all([
      withTimeout(kv.get(`vendor_settings:${vendorId}`), 3000).catch(() => null),
      withTimeout(kv.get(`vendor_storefront_${vendorId}`), 3000).catch(() => null),
    ]);
    const slugs = new Set<string>();
    const a = vs && typeof vs === "object" ? (vs as { storeSlug?: unknown }).storeSlug : "";
    const b = sf && typeof sf === "object" ? (sf as { storeSlug?: unknown }).storeSlug : "";
    if (typeof a === "string" && a.trim()) slugs.add(a.trim());
    if (typeof b === "string" && b.trim()) slugs.add(b.trim());
    for (const slug of slugs) {
      clearCache(`vendor_by_slug:${slug}`);
    }
  } catch {
    /* non-fatal */
  }
}

/** Resolve internal vendor id from store slug or `vendor_*` id string. */
async function resolveVendorIdFromSlugOrId(vendorIdOrSlug: string): Promise<string> {
  const raw = String(vendorIdOrSlug || "").trim();
  if (!raw) return "";
  const slugRow = await withTimeout(kv.get(`vendor_slug_${raw}`), 3000).catch(() => null);
  if (slugRow && typeof slugRow === "object") {
    const vid = String((slugRow as { vendorId?: unknown }).vendorId || "").trim();
    if (vid) return vid;
  }
  const direct = await withTimeout(kv.get(`vendor:${raw}`), 3000).catch(() => null);
  if (direct && typeof direct === "object") {
    const id = String((direct as { id?: unknown }).id || "").trim();
    if (id) return id;
  }
  return raw;
}

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

    const vendorRow = await withTimeout(kv.get(`vendor:${slugData.vendorId}`), 5000).catch(() => null);
    if (!vendorRow || typeof vendorRow !== "object") {
      console.log(`❌ Vendor profile missing for slug: ${storeSlug}`);
      return c.json({ error: "Store not found" }, 404);
    }
    if (!vendorProfileAllowsPublicStorefront(vendorRow)) {
      console.log(`❌ Store unavailable (vendor status): ${slugData.vendorId}`);
      return c.json(
        {
          error: "This store is not available.",
          storeUnavailable: true,
          reason: (vendorRow as { status?: string })?.status || "inactive",
        },
        403
      );
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
    return c.json({
      settings: stripMetaCapiFromPublicSettings(settings as Record<string, unknown>),
    });

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
    
    // Display name: Store Settings UI writes `vendor_storefront_*`; legacy `vendor_settings_*` may be stale
    const [vendorSettings, vendorData, storefrontSettings] = await Promise.all([
      kv.get(`vendor_settings:${actualVendorId}`),
      kv.get(`vendor:${actualVendorId}`),
      kv.get(`vendor_storefront_${actualVendorId}`),
    ]);
    let storeName =
      storefrontSettings?.storeName ||
      vendorSettings?.storeName ||
      vendorData?.businessName ||
      vendorData?.name ||
      "Vendor Store";
    const vendorBusinessName = vendorData?.businessName || vendorData?.name;
    const vendorTokens = vendorMatchTokens(actualVendorId, vendorData, [
      vendorBusinessName,
      vendorSettings?.storeName,
      vendorSettings?.storeSlug,
      storefrontSettings?.storeName,
      storefrontSettings?.storeSlug,
    ]);
    
    if (vendorData && typeof vendorData === "object" && !vendorProfileAllowsPublicStorefront(vendorData)) {
      return c.json(
        {
          products: [],
          storeName: "",
          logo: "",
          storePhone: "",
          resolvedVendorId: actualVendorId,
          total: 0,
          page: 1,
          pageSize: Math.min(100, Math.max(1, parseInt(c.req.query("pageSize") || "24", 10) || 24)),
          hasMore: false,
          storeUnavailable: true,
          error: "This store is not available.",
          reason: (vendorData as { status?: string }).status || "inactive",
        },
        403
      );
    }

    console.log(`🏪 Vendor info - ID: ${actualVendorId}, Name: ${vendorBusinessName}, Store: ${storeName}`);

    const page = Math.max(1, parseInt(c.req.query("page") || "1", 10) || 1);
    const pageSize = Math.min(100, Math.max(1, parseInt(c.req.query("pageSize") || "24", 10) || 24));
    const categoryQ = (c.req.query("category") || "").trim();
    const searchQ = (c.req.query("q") || "").trim();
    const resolveSlugRaw = (c.req.query("resolveSlug") || "").trim();
    const resolveSlug = resolveSlugRaw ? decodeURIComponent(resolveSlugRaw) : null;
    const logo = storefrontSettings?.logo || vendorData?.avatar || "";
    const pickPhone = (v: unknown) =>
      typeof v === "string" && v.trim().length > 0 ? v.trim() : "";
    // Vendor admin saves `contactPhone` on `vendor_storefront_*`; legacy may use `storePhone`.
    const storePhoneRaw =
      pickPhone(storefrontSettings?.storePhone) ||
      pickPhone((storefrontSettings as Record<string, unknown>)?.contactPhone) ||
      pickPhone(vendorSettings?.storePhone) ||
      pickPhone((vendorSettings as Record<string, unknown>)?.contactPhone) ||
      pickPhone(vendorData?.phone);
    const storePhone = storePhoneRaw || "+95 9 XXX XXX XXX";
    const rawMetaPixelId =
      typeof (storefrontSettings as Record<string, unknown> | null)?.metaPixelId === "string"
        ? String((storefrontSettings as Record<string, unknown>).metaPixelId).trim()
        : "";
    const metaPixelId = /^\d{5,20}$/.test(rawMetaPixelId) ? rawMetaPixelId : "";
    const hasVendorCategoryFilter = !!categoryQ && categoryQ.toLowerCase() !== "all";
    let categoryProductIdSet: Set<string> | null = null;
    let uncategorizedProductIdSet: Set<string> | null = null;

    if (hasVendorCategoryFilter) {
      const vendorCategoryRows = await withTimeout(
        kv.getByPrefix(`category:${actualVendorId}:`),
        15000
      ).catch(() => []);
      const activeVendorCategories = (Array.isArray(vendorCategoryRows) ? vendorCategoryRows : []).filter(
        (cat: any) => {
          const status = String(cat?.status || "active").trim().toLowerCase();
          return status !== "hide" && status !== "inactive" && status !== "off";
        }
      );
      const categoryLower = categoryQ.toLowerCase();

      if (categoryLower === "uncategorized" || categoryLower === "__uncategorized__") {
        uncategorizedProductIdSet = new Set<string>();
        for (const cat of activeVendorCategories) {
          if (!Array.isArray(cat?.productIds)) continue;
          for (const id of cat.productIds) {
            const productId = String(id || "").trim();
            if (productId) uncategorizedProductIdSet.add(productId);
          }
        }
      } else {
        const matchingCategory = activeVendorCategories.find(
          (cat: any) => String(cat?.name || "").trim().toLowerCase() === categoryLower
        );
        categoryProductIdSet = new Set(
          Array.isArray(matchingCategory?.productIds)
            ? matchingCategory.productIds.map((id: unknown) => String(id || "").trim()).filter(Boolean)
            : []
        );
        if (!matchingCategory || categoryProductIdSet.size === 0) {
          return c.json({
            products: [],
            storeName,
            logo,
            storePhone,
            metaPixelId: metaPixelId || undefined,
            resolvedVendorId: actualVendorId,
            total: 0,
            page,
            pageSize,
            hasMore: false,
          });
        }
      }
    }

    const rpcData = hasVendorCategoryFilter
      ? null
      : await kv.rpcVendorStorefrontProductsPage({
          vendorId: actualVendorId,
          vendorBusinessName: vendorBusinessName ?? null,
          page,
          pageSize,
          category: null,
          q: searchQ || null,
          resolveSlug,
        });

    if (rpcData && Array.isArray(rpcData.products)) {
      const vendorProducts = (rpcData.products as any[]).map(mapVendorStorefrontProductRow);
      return c.json({
        products: vendorProducts,
        storeName,
        logo,
        storePhone,
        metaPixelId: metaPixelId || undefined,
        resolvedVendorId: actualVendorId,
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
      const vendorMatch = productBelongsToVendor(p, vendorTokens);
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
        storePhone,
        metaPixelId: metaPixelId || undefined,
        resolvedVendorId: actualVendorId,
        total: vendorProducts.length,
        page: 1,
        pageSize: 1,
        hasMore: false,
      });
    }

    if (categoryQ && categoryQ.toLowerCase() !== "all") {
      if (uncategorizedProductIdSet) {
        vendorList = vendorList.filter(
          (p: any) => !uncategorizedProductIdSet?.has(String(p?.id || "").trim())
        );
      } else {
        vendorList = vendorList.filter(
          (p: any) => categoryProductIdSet?.has(String(p?.id || "").trim())
        );
      }
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
    const storeSlug =
      String(storefrontSettings?.storeSlug || "").trim() ||
      String(vendorSettings?.storeSlug || "").trim() ||
      String(vendorData?.storeSlug || "").trim() ||
      "";

    return c.json({
      products: vendorProducts,
      storeName,
      storeSlug,
      logo,
      storePhone,
      metaPixelId: metaPixelId || undefined,
      resolvedVendorId: actualVendorId,
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
        // Vendor admin categorization is managed by vendor-owned categories, not product.category.
        category: "",
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

async function jsonVendorOrdersPageFromReadModel(opts: {
  vendorIdentifiers: Set<string>;
  page: number;
  pageSize: number;
  q: string;
  status: string;
  payment: string;
  from: string;
  to: string;
  sort: "newest" | "oldest";
}): Promise<Record<string, unknown> | null> {
  try {
    const vendorIds = [...opts.vendorIdentifiers].map((x) => String(x).trim()).filter(Boolean);
    if (vendorIds.length === 0) return null;
    const { data, error } = await supabase.rpc("rpc_vendor_orders_page", {
      p_vendor_ids: vendorIds,
      p_page: opts.page,
      p_page_size: opts.pageSize,
      p_q: opts.q || null,
      p_status: opts.status || "all",
      p_payment: opts.payment || "all",
      p_from: opts.from || null,
      p_to: opts.to || null,
      p_sort: opts.sort || "newest",
    });
    if (error) {
      console.warn("[vendor-orders] read-model page unavailable:", error.message);
      return null;
    }
    if (!data || typeof data !== "object" || Array.isArray(data)) return null;
    const body = data as Record<string, unknown>;
    const readModelRows = Number(body.readModelRows ?? 0);
    if (readModelRows <= 0) {
      // Migration may be applied before backfill. Do not show a false-empty vendor order list.
      return null;
    }
    return {
      orders: Array.isArray(body.orders) ? body.orders : [],
      total: Number(body.total ?? 0),
      page: Number(body.page ?? opts.page),
      pageSize: Number(body.pageSize ?? opts.pageSize),
      hasMore: Boolean(body.hasMore),
      summary: body.summary && typeof body.summary === "object" ? body.summary : undefined,
      readModel: true,
    };
  } catch (error) {
    console.warn("[vendor-orders] read-model page failed:", error);
    return null;
  }
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
    const page = Math.max(1, parseInt(String(c.req.query("page") || "1"), 10) || 1);
    const pageSize = Math.min(100, Math.max(1, parseInt(String(c.req.query("pageSize") || "20"), 10) || 20));
    const q = String(c.req.query("q") || "").trim().toLowerCase();
    const statusQ = String(c.req.query("status") || "all").trim().toLowerCase();
    const paymentQ = String(c.req.query("payment") || "all").trim().toLowerCase();
    const sortQ = String(c.req.query("sort") || "newest").trim().toLowerCase() === "oldest" ? "oldest" : "newest";
    const fromQ = String(c.req.query("from") || "").trim();
    const toQ = String(c.req.query("to") || "").trim();
    const fromMs = fromQ ? new Date(fromQ).getTime() : Number.NaN;
    const toMs = toQ ? new Date(toQ).getTime() : Number.NaN;
    console.log(`📦 Fetching orders for vendor: ${vendorId}`);

    const vendorIdentifiers = await resolveVendorOrderIdentifierSet(vendorId);
    console.log(`📦 Resolved vendor id aliases for orders filter (${vendorIdentifiers.size}):`, [...vendorIdentifiers]);

    const readModelBody = await jsonVendorOrdersPageFromReadModel({
      vendorIdentifiers,
      page,
      pageSize,
      q,
      status: statusQ,
      payment: paymentQ,
      from: fromQ,
      to: toQ,
      sort: sortQ,
    });
    if (readModelBody) {
      return c.json(readModelBody);
    }
    
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
        status: normalizeOrderStatus(order.status) || "pending",
        paymentStatus: order.paymentStatus || "pending",
        shippingStatus: order.shippingStatus || "pending",
        paymentMethod: order.paymentMethod || "",
        kpay: order.kpay,
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
        ...(order.inventoryDeducted === true
          ? { inventoryDeducted: true }
          : order.inventoryDeducted === false
            ? { inventoryDeducted: false }
            : {}),
      });
    }
    
    const filteredOrders = vendorOrders.filter((order: any) => {
      const searchText = `${String(order.orderNumber || "")} ${String(order.customer || "")} ${String(order.email || "")}`.toLowerCase();
      const matchesSearch = !q || searchText.includes(q);
      const matchesStatus = statusQ === "all" || String(order.status || "").toLowerCase() === statusQ;
      const matchesPayment = paymentQ === "all" || String(order.paymentStatus || "").toLowerCase() === paymentQ;
      const createdMs = new Date(order.createdAt || order.date || Date.now()).getTime();
      const matchesFrom = !Number.isFinite(fromMs) || createdMs >= fromMs;
      const matchesTo = !Number.isFinite(toMs) || createdMs <= toMs;
      return matchesSearch && matchesStatus && matchesPayment && matchesFrom && matchesTo;
    });

    filteredOrders.sort((a: any, b: any) => {
      const aMs = new Date(a.createdAt || a.date || 0).getTime();
      const bMs = new Date(b.createdAt || b.date || 0).getTime();
      return sortQ === "oldest" ? aMs - bMs : bMs - aMs;
    });

    const total = filteredOrders.length;
    const slice = filteredOrders.slice((page - 1) * pageSize, page * pageSize);
    const summary = {
      totalRevenue: filteredOrders
        .filter((o: any) => String(o.status || "").toLowerCase() !== "cancelled")
        .reduce((s: number, o: any) => s + (Number(o.total) || 0), 0),
      pending: filteredOrders.filter((o: any) => String(o.status || "").toLowerCase() === "pending").length,
      processing: filteredOrders.filter((o: any) => String(o.status || "").toLowerCase() === "processing").length,
      fulfilled: filteredOrders.filter((o: any) => String(o.status || "").toLowerCase() === "fulfilled").length,
      cancelled: filteredOrders.filter((o: any) => String(o.status || "").toLowerCase() === "cancelled").length,
    };

    console.log(`✅ Found ${vendorOrders.length} orders for vendor ${vendorId} (filtered ${total}, page ${page})`);
    return c.json({ 
      orders: slice,
      total,
      page,
      pageSize,
      hasMore: page * pageSize < total,
      summary,
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
function normalizeAudiencePhone(raw: string | undefined): string {
  const normalized = String(raw || "").replace(/[\s\-]/g, "");
  if (!normalized) return "";
  if (/^09\d{9}$/.test(normalized)) return `+959${normalized.slice(1)}`;
  if (/^\+959\d{9}$/.test(normalized)) return normalized;
  return normalized;
}

function findAudienceIndex(
  list: any[],
  opts: { userId?: string; phone?: string; email?: string }
): number {
  const uid = String(opts.userId || "").trim();
  if (uid) {
    const byUid = list.findIndex((r: any) => String(r?.userId || "").trim() === uid);
    if (byUid >= 0) return byUid;
  }
  const phone = normalizeAudiencePhone(opts.phone);
  if (phone) {
    const byPhone = list.findIndex(
      (r: any) => normalizeAudiencePhone(r?.phone) === phone
    );
    if (byPhone >= 0) return byPhone;
  }
  const em = String(opts.email || "").trim().toLowerCase();
  if (em) {
    return list.findIndex((r: any) => (r?.email || "").toLowerCase() === em);
  }
  return -1;
}

app.post("/make-server-16010b6f/vendor/audience/:vendorId/track", async (c) => {
  try {
    const vendorIdParam = c.req.param("vendorId");
    const body = await c.req.json();
    const { email, userId, name, phone, avatar, event } = body as Record<string, string | undefined>;

    const normEmail = String(email || "").trim().toLowerCase();
    const normPhone = normalizeAudiencePhone(phone);
    const uid = String(userId || "").trim();

    if (!uid) {
      return c.json({ error: "userId is required (registered account only)" }, 400);
    }

    const resolvedVendorId = await resolveVendorIdFromSlugOrId(vendorIdParam);
    const vendor = await withTimeout(kv.get(`vendor:${resolvedVendorId}`), 5000).catch(() => null);
    if (!vendor) {
      return c.json({ error: "Vendor not found" }, 404);
    }

    const vid = String(vendor.id || resolvedVendorId);
    const storageKey = `vendor:audience:${vid}`;
    let list: any[] = (await withTimeout(kv.get(storageKey), 5000).catch(() => [])) || [];
    if (!Array.isArray(list)) list = [];

    const now = new Date().toISOString();
    const idx = findAudienceIndex(list, {
      userId: uid,
      phone: normPhone,
      email: normEmail,
    });
    const lastEvent = event === "register" ? "register" : "login";

    const nextRecord = {
      email: normEmail,
      userId: uid || (idx >= 0 ? list[idx].userId : undefined),
      name: name || (idx >= 0 ? list[idx].name : undefined),
      phone: normPhone || phone || (idx >= 0 ? list[idx].phone : undefined),
      avatar: avatar || (idx >= 0 ? list[idx].avatar : undefined),
      firstSeenAt: idx >= 0 ? list[idx].firstSeenAt || now : now,
      lastSeenAt: now,
      lastEvent,
    };

    if (idx >= 0) list[idx] = { ...list[idx], ...nextRecord };
    else list.push(nextRecord);

    await withTimeout(kv.set(storageKey, list), 5000);
    const settings = await withTimeout(kv.get(`vendor_settings:${vid}`), 5000).catch(() => null);
    const storeSlug =
      settings?.storeSlug != null && String(settings.storeSlug).trim() !== ""
        ? String(settings.storeSlug).trim()
        : "";
    return c.json({
      success: true,
      vendorId: vid,
      storeSlug: storeSlug || undefined,
      record: nextRecord,
    });
  } catch (error: any) {
    console.error("❌ vendor audience track:", error);
    return c.json({ error: error.message || "Failed to track" }, 500);
  }
});

/** Remove one registered customer from this vendor's storefront audience (vendor-scoped delete). */
app.delete("/make-server-16010b6f/vendor/audience/:vendorId/member/:memberId", async (c) => {
  try {
    const vendorIdParam = c.req.param("vendorId");
    const memberId = decodeURIComponent(String(c.req.param("memberId") || "").trim());
    if (!memberId) {
      return c.json({ error: "memberId is required" }, 400);
    }

    const resolvedVendorId = await resolveVendorIdFromSlugOrId(vendorIdParam);
    const vendor = await withTimeout(kv.get(`vendor:${resolvedVendorId}`), 5000).catch(() => null);
    if (!vendor) {
      return c.json({ error: "Vendor not found" }, 404);
    }

    const vid = String(vendor.id || resolvedVendorId);
    const memberLower = memberId.toLowerCase();
    const memberNormPhone = normalizeAudiencePhone(memberId.replace(/^phone:/i, ""));

    const removeFromList = (list: any[]): { next: any[]; removed: number } => {
      if (!Array.isArray(list)) return { next: [], removed: 0 };
      const next = list.filter((r: any) => {
        const uid = String(r?.userId || "").trim();
        const em = String(r?.email || "").trim().toLowerCase();
        const ph = normalizeAudiencePhone(r?.phone);
        if (uid && (memberId === uid || memberLower === uid.toLowerCase())) return false;
        if (em && (memberId === `email:${em}` || memberLower === em)) return false;
        if (ph && (memberNormPhone === ph || memberId === `phone:${ph}`)) return false;
        return true;
      });
      return { next, removed: list.length - next.length };
    };

    let totalRemoved = 0;
    const storageKey = `vendor:audience:${vid}`;
    const list = (await withTimeout(kv.get(storageKey), 5000).catch(() => [])) || [];
    const { next, removed } = removeFromList(list);
    if (removed > 0) {
      await withTimeout(kv.set(storageKey, next), 5000);
      totalRemoved += removed;
    }

    const settings = await withTimeout(kv.get(`vendor_settings:${vid}`), 5000).catch(() => null);
    const storeSlug =
      settings?.storeSlug != null && String(settings.storeSlug).trim() !== ""
        ? String(settings.storeSlug).trim()
        : "";
    if (storeSlug && storeSlug !== vid) {
      const altKey = `vendor:audience:${storeSlug}`;
      const altList = (await withTimeout(kv.get(altKey), 5000).catch(() => [])) || [];
      const altResult = removeFromList(altList);
      if (altResult.removed > 0) {
        await withTimeout(kv.set(altKey, altResult.next), 5000);
        totalRemoved += altResult.removed;
      }
    }

    if (totalRemoved === 0) {
      return c.json({ error: "Customer not found in vendor audience" }, 404);
    }

    return c.json({ success: true, removed: totalRemoved });
  } catch (error: any) {
    console.error("❌ vendor audience member delete:", error);
    return c.json({ error: error.message || "Failed to remove customer" }, 500);
  }
});

/**
 * Vendor admin: customers who registered/logged in on this storefront only.
 * Guest checkout data stays on orders — not listed here.
 */
app.get("/make-server-16010b6f/vendor/audience/:vendorId", async (c) => {
  try {
    const vendorId = c.req.param("vendorId");
    const pageQ = c.req.query("page");
    const hasPagination = pageQ !== undefined && pageQ !== "";
    const page = Math.max(1, parseInt(String(pageQ || "1"), 10) || 1);
    const pageSize = Math.min(100, Math.max(1, parseInt(String(c.req.query("pageSize") || "20"), 10) || 20));
    const q = String(c.req.query("q") || "").trim().toLowerCase();
    const statusQ = String(c.req.query("status") || "all").trim().toLowerCase();
    const tierQ = String(c.req.query("tier") || "all").trim().toLowerCase();
    const segmentQ = String(c.req.query("segment") || "all").trim();
    const sortQ = String(c.req.query("sort") || "spent-desc").trim().toLowerCase();

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
        const seen = new Set(
          audience.map((r: any) =>
            String(r?.userId || r?.email || normalizeAudiencePhone(r?.phone) || "")
              .trim()
              .toLowerCase()
          )
        );
        for (const row of extra) {
          const dedupeKey = String(
            row?.userId || row?.email || normalizeAudiencePhone(row?.phone) || ""
          )
            .trim()
            .toLowerCase();
          if (dedupeKey && !seen.has(dedupeKey)) {
            seen.add(dedupeKey);
            audience.push(row);
          }
        }
      }
    }

    // Keep Vendor Admin aligned with Super Admin Customers: vendor audience rows are only valid
    // while their canonical customer record still exists. Older deletes could leave audience-only rows.
    const allCustomersForAudience = await withTimeout(kv.getByPrefix("customer:"), 30000).catch(() => []);
    const validCustomers = Array.isArray(allCustomersForAudience)
      ? allCustomersForAudience.filter(
          (cust: any) =>
            cust &&
            typeof cust === "object" &&
            !Array.isArray(cust) &&
            String(cust.id || "").trim() !== ""
        )
      : [];
    const audienceHasCustomer = (aud: any): boolean => {
      const audUid = String(aud?.userId || "").trim();
      const audEmail = String(aud?.email || "").trim().toLowerCase();
      const audPhone = normalizeAudiencePhone(aud?.phone);
      return validCustomers.some((cust: any) => {
        const custId = String(cust?.id || "").trim();
        const custUid = String(cust?.userId || "").trim();
        const custEmail = String(cust?.email || "").trim().toLowerCase();
        const custPhone = normalizeAudiencePhone(cust?.phone);
        if (audUid && (audUid === custUid || audUid === custId)) return true;
        if (audEmail && custEmail && audEmail === custEmail) return true;
        if (audPhone && custPhone && audPhone === custPhone) return true;
        return false;
      });
    };
    const audienceBeforeCanonicalFilter = audience.length;
    audience = audience.filter(audienceHasCustomer);
    if (audience.length !== audienceBeforeCanonicalFilter) {
      const canonicalList = (await withTimeout(kv.get(storageKey), 5000).catch(() => [])) || [];
      if (Array.isArray(canonicalList)) {
        const cleanedCanonical = canonicalList.filter(audienceHasCustomer);
        if (cleanedCanonical.length !== canonicalList.length) {
          await withTimeout(kv.set(storageKey, cleanedCanonical), 5000).catch(() => undefined);
        }
      }
      if (storeSlug && storeSlug !== vid) {
        const altKey = `vendor:audience:${storeSlug}`;
        const altList = (await withTimeout(kv.get(altKey), 5000).catch(() => [])) || [];
        if (Array.isArray(altList)) {
          const cleanedAlt = altList.filter(audienceHasCustomer);
          if (cleanedAlt.length !== altList.length) {
            await withTimeout(kv.set(altKey, cleanedAlt), 5000).catch(() => undefined);
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
    const byUserId = new Map<string, Agg>();

    const addOrderAgg = (key: string, map: Map<string, Agg>, em: string, custName: string, vendorTotal: number) => {
      const prev = map.get(key);
      if (prev) {
        prev.orderCount += 1;
        prev.totalSpent += vendorTotal;
        if (!prev.name && custName) prev.name = String(custName);
      } else {
        map.set(key, {
          email: em,
          name: String(custName || em.split("@")[0] || "Customer"),
          orderCount: 1,
          totalSpent: vendorTotal,
        });
      }
    };

    for (const order of vendorOrders) {
      const raw =
        order.email ||
        order.customerEmail ||
        (typeof order.customer === "object" && order.customer?.email) ||
        "";
      const em = String(raw).trim().toLowerCase();
      const uid = String(order.userId || "").trim();

      const custName =
        order.customerName ||
        order.customer ||
        (typeof order.customer === "object" ? order.customer?.name || order.customer?.fullName : "") ||
        (em ? em.split("@")[0] : "Customer");

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

      if (uid) addOrderAgg(uid, byUserId, em, String(custName), vendorTotal);
      if (em) addOrderAgg(em, byEmail, em, String(custName), vendorTotal);
    }

    type CustomerRow = {
      id: string;
      name: string;
      email: string;
      phone: string;
      role: "customer";
      status: "active";
      avatar?: string;
      joinedDate: string;
      totalOrders: number;
      totalSpent: number;
      avgOrder: number;
      segment: string;
      tags: string[];
      isNew: boolean;
    };

    const customers: CustomerRow[] = [];
    const seenIds = new Set<string>();

    const pushCustomer = (row: {
      id: string;
      aud?: any;
      ord?: Agg;
      em: string;
    }) => {
      if (seenIds.has(row.id)) return;
      seenIds.add(row.id);
      const { aud, ord, em } = row;
      const name =
        aud?.name ||
        ord?.name ||
        (em ? em.split("@")[0] : "Customer");
      const totalOrders = ord?.orderCount || 0;
      const totalSpent = ord?.totalSpent || 0;
      const avgOrder = totalOrders > 0 ? totalSpent / totalOrders : 0;

      let segment = "New";
      if (totalOrders >= 3 || totalSpent >= 500000) segment = "Champions";
      else if (totalOrders > 0) segment = "Active";

      const tags: string[] = [];
      if (aud) tags.push("Storefront");
      if (totalOrders > 0) tags.push("Purchased");

      customers.push({
        id: row.id,
        name,
        email: em,
        phone: aud?.phone ? String(aud.phone) : "",
        role: "customer",
        status: "active",
        avatar: aud?.avatar || undefined,
        joinedDate: aud?.firstSeenAt || new Date().toISOString(),
        totalOrders,
        totalSpent,
        avgOrder,
        segment,
        tags,
        isNew: totalOrders === 0 && !!aud,
      });
    };

    for (const aud of audience) {
      const uid = String(aud?.userId || "").trim();
      if (!uid) continue;
      const em = String(aud?.email || "").trim().toLowerCase();
      const ord = byUserId.get(uid) || (em ? byEmail.get(em) : undefined);
      pushCustomer({ id: uid, aud, ord, em });
    }

    const tierOf = (u: any): "new" | "regular" | "vip" => {
      if (u?.isNew || Number(u?.totalOrders || 0) === 0) return "new";
      if (Number(u?.totalSpent || 0) >= 500000 || Number(u?.totalOrders || 0) >= 5) return "vip";
      return "regular";
    };
    const filtered = customers.filter((u: any) => {
      const matchesQ =
        !q ||
        String(u.name || "").toLowerCase().includes(q) ||
        String(u.email || "").toLowerCase().includes(q) ||
        String(u.phone || "").toLowerCase().includes(q) ||
        (Array.isArray(u.tags) ? u.tags.join(" ").toLowerCase().includes(q) : false);
      const matchesStatus = statusQ === "all" || String(u.status || "").toLowerCase() === statusQ;
      const matchesTier = tierQ === "all" || tierOf(u) === tierQ;
      const matchesSegment = segmentQ === "all" || String(u.segment || "Other") === segmentQ;
      return matchesQ && matchesStatus && matchesTier && matchesSegment;
    });

    filtered.sort((a: any, b: any) => {
      if (sortQ === "name-asc") return String(a.name || "").localeCompare(String(b.name || ""));
      if (sortQ === "orders-desc") return (Number(b.totalOrders) || 0) - (Number(a.totalOrders) || 0);
      return (Number(b.totalSpent) || 0) - (Number(a.totalSpent) || 0);
    });

    const total = filtered.length;
    const rows = hasPagination ? filtered.slice((page - 1) * pageSize, page * pageSize) : filtered;
    const totalCustomers = total;
    const activeCustomers = filtered.filter((u: any) => String(u.status || "").toLowerCase() === "active").length;
    const champions = filtered.filter((u: any) => String(u.segment || "") === "Champions").length;
    const atRisk = filtered.filter((u: any) => String(u.segment || "") === "At Risk").length;
    const totalRevenue = filtered.reduce((sum: number, u: any) => sum + (Number(u.totalSpent) || 0), 0);
    const avgLtv = totalCustomers > 0 ? totalRevenue / totalCustomers : 0;

    return c.json({
      success: true,
      customers: rows,
      total,
      page: hasPagination ? page : 1,
      pageSize: hasPagination ? pageSize : total,
      hasMore: hasPagination ? page * pageSize < total : false,
      summary: {
        totalCustomers,
        activeCustomers,
        champions,
        atRisk,
        totalRevenue,
        avgLtv,
      },
    });
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
    const vendorIdOrSlug = c.req.param("vendorId");
    const actualVendorId = await resolveVendorIdFromSlugOrId(vendorIdOrSlug);
    console.log(`📁 Getting categories for vendor: ${actualVendorId}`);

    const vendorData = await kv.get(`vendor:${actualVendorId}`);
    if (vendorData && typeof vendorData === "object" && !vendorProfileAllowsPublicStorefront(vendorData)) {
      return c.json(
        { categories: [], storeUnavailable: true, error: "This store is not available." },
        403
      );
    }

    const allCategories = await withRetry(
      () => withTimeout(kv.getByPrefix(`category:${actualVendorId}:`), 15000),
      5,
      1000
    );
    const categoryList = allCategories
      .filter((cat: any) => cat && String(cat.name || "").trim())
      .map((cat: any) => String(cat.name).trim());

    console.log(`✅ Found ${categoryList.length} categories for vendor ${actualVendorId}`);
    return c.json({ categories: categoryList });
  } catch (error: any) {
    console.error("❌ Failed to load categories:", error);
    return c.json({ categories: [] });
  }
});

// Get category details with product count
app.get("/make-server-16010b6f/vendor/categories-details/:vendorId", async (c) => {
  try {
    const vendorIdOrSlug = c.req.param("vendorId");
    console.log(`📁 Getting category details for vendor identifier: ${vendorIdOrSlug}`);

    let slugData = await kv.get(`vendor_slug_${vendorIdOrSlug}`);
    let actualVendorId = slugData?.vendorId as string | undefined;
    if (!actualVendorId) {
      const vd = await kv.get(`vendor:${vendorIdOrSlug}`);
      if (vd?.id) {
        actualVendorId = vd.id;
        console.log(`🔍 categories-details: resolved vendor by id key: ${actualVendorId}`);
      } else {
        console.log(`⚠️ categories-details: no slug map for ${vendorIdOrSlug}, using param as id`);
        actualVendorId = vendorIdOrSlug;
      }
    }

    const vendorData = await kv.get(`vendor:${actualVendorId}`);
    if (vendorData && typeof vendorData === "object" && !vendorProfileAllowsPublicStorefront(vendorData)) {
      return c.json(
        { categories: [], storeUnavailable: true, error: "This store is not available." },
        403
      );
    }
    const vendorBusinessName = vendorData?.businessName || vendorData?.name;
    const storefrontSettings = await kv.get(`vendor_storefront_${actualVendorId}`).catch(() => null);
    const vendorTokens = vendorMatchTokens(actualVendorId, vendorData, [
      vendorBusinessName,
      storefrontSettings?.storeName,
      storefrontSettings?.storeSlug,
    ]);
    const allCategories = await withRetry(
      () => withTimeout(kv.getByPrefix(`category:${actualVendorId}:`), 30000),
      5,
      1500
    );

    const vendorMatches = (p: any) => {
      if (!p) return false;
      const vendorMatch = productBelongsToVendor(p, vendorTokens);
      const statusMatch = p.status && String(p.status).toLowerCase() === "active";
      return vendorMatch && statusMatch;
    };

    const kvList: any[] = Array.isArray(allCategories)
      ? allCategories.filter((cat: any) => cat?.source === "vendor" || cat?.createdByVendor === true)
      : [];
    const categoryProductIds = new Set<string>();
    for (const cat of kvList) {
      if (!Array.isArray(cat?.productIds)) continue;
      for (const id of cat.productIds) {
        const productId = String(id || "").trim();
        if (productId) categoryProductIds.add(productId);
      }
    }

    let vendorProducts: any[] = [];
    if (categoryProductIds.size > 0) {
      const allProducts = await withRetry(
        () => withTimeout(kv.getByPrefix("product:"), 30000),
        5,
        1500
      );
      const productRows = Array.isArray(allProducts) ? allProducts : [];
      vendorProducts = productRows.filter((p: any) => {
        if (!vendorMatches(p)) return false;
        return categoryProductIds.has(String(p?.id || "").trim());
      });
    }

    const categoriesWithCount = kvList.map((cat: any) => {
      const assignedIds = Array.isArray(cat?.productIds)
        ? cat.productIds.map((id: unknown) => String(id || "").trim()).filter(Boolean)
        : [];
      const assignedSet = new Set(assignedIds);
      const productsInCategory = vendorProducts.filter(
        (p: any) => assignedSet.has(String(p?.id || "").trim())
      );

      return {
        ...cat,
        productCount: productsInCategory.length,
        productIds: assignedIds,
        products: productsInCategory.map((p: any) => ({
          id: p.id,
          name: p.name,
          sku: p.sku,
          price: p.price,
          image: p.image,
          status: p.status,
          inventory: p.inventory,
        })),
      };
    });

    console.log(
      `✅ categories-details: ${categoriesWithCount.length} vendor-owned categories (vendor ${actualVendorId})`
    );
    return c.json({ categories: categoriesWithCount });
  } catch (error: any) {
    console.error("❌ Failed to load category details:", error);
    return c.json({ error: error.message || "Failed to load category details", categories: [] }, 500);
  }
});

async function sanitizeVendorCategoryProductIds(vendorId: string, productIds: unknown): Promise<string[]> {
  const requestedIds = Array.isArray(productIds)
    ? [...new Set(productIds.map((id: unknown) => String(id || "").trim()).filter(Boolean))]
    : [];
  if (requestedIds.length === 0) return [];

  const [vendorData, storefrontSettings] = await Promise.all([
    kv.get(`vendor:${vendorId}`),
    kv.get(`vendor_storefront_${vendorId}`).catch(() => null),
  ]);
  const vendorTokens = vendorMatchTokens(vendorId, vendorData, [
    storefrontSettings?.storeName,
    storefrontSettings?.storeSlug,
  ]);
  const allowedIds: string[] = [];

  await Promise.all(
    requestedIds.map(async (id) => {
      try {
        const product = await withTimeout(kv.get(`product:${id}`), 5000);
        if (!product || typeof product !== "object") return;
        if (productBelongsToVendor(product, vendorTokens)) allowedIds.push(id);
      } catch {
        /* Ignore stale product ids in category assignments. */
      }
    })
  );

  const allowedSet = new Set(allowedIds);
  return requestedIds.filter((id) => allowedSet.has(id));
}

function assertVendorCategoryOwnership(categoryId: string, vendorId: string, category: any) {
  const normalizedVendorId = String(vendorId || "").trim();
  if (!normalizedVendorId) {
    return "vendorId is required";
  }
  if (!String(categoryId || "").startsWith(`category:${normalizedVendorId}:`)) {
    return "Category does not belong to this vendor";
  }
  if (String(category?.vendorId || "").trim() !== normalizedVendorId) {
    return "Category does not belong to this vendor";
  }
  return null;
}

function vendorMatchTokens(vendorId: string, vendorData?: any, extraTokens: unknown[] = []): Set<string> {
  const tokens = new Set<string>();
  const add = (value: unknown) => {
    const raw = String(value ?? "").trim();
    if (!raw) return;
    tokens.add(raw);
    tokens.add(raw.toLowerCase());
  };

  add(vendorId);
  add(vendorData?.id);
  add(vendorData?.name);
  add(vendorData?.businessName);
  add(vendorData?.storeName);
  add(vendorData?.storeSlug);
  for (const token of extraTokens) add(token);
  return tokens;
}

function productBelongsToVendor(product: any, vendorTokens: Set<string>): boolean {
  if (!product || typeof product !== "object" || vendorTokens.size === 0) return false;
  const matchesToken = (value: unknown) => {
    const raw = String(value ?? "").trim();
    return !!raw && (vendorTokens.has(raw) || vendorTokens.has(raw.toLowerCase()));
  };

  if (Array.isArray(product.selectedVendors) && product.selectedVendors.some(matchesToken)) {
    return true;
  }
  return (
    matchesToken(product.vendorId) ||
    matchesToken(product.vendor) ||
    matchesToken(product.vendorName) ||
    matchesToken(product.vendorSource)
  );
}

app.post("/make-server-16010b6f/vendor/categories/cleanup-imported", async (c) => {
  try {
    const { vendorId } = await c.req.json();
    const actualVendorId = await resolveVendorIdFromSlugOrId(String(vendorId || "").trim());
    if (!actualVendorId) {
      return c.json({ error: "vendorId is required" }, 400);
    }

    const allCategories = await withTimeout(kv.getByPrefix(`category:${actualVendorId}:`), 15000);
    const rows = Array.isArray(allCategories) ? allCategories : [];
    const importedRows = rows.filter(
      (cat: any) => cat && cat.source !== "vendor" && cat.createdByVendor !== true
    );

    await Promise.all(
      importedRows.map((cat: any) => {
        const id = String(cat?.id || "").trim();
        if (!id.startsWith(`category:${actualVendorId}:`)) return Promise.resolve();
        return withTimeout(kv.del(id), 5000);
      })
    );

    return c.json({ success: true, deletedCount: importedRows.length });
  } catch (error: any) {
    console.error("❌ Failed to cleanup imported vendor categories:", error);
    return c.json({ error: error.message || "Failed to cleanup imported categories" }, 500);
  }
});

// Create a new category
app.post("/make-server-16010b6f/vendor/categories", async (c) => {
  try {
    const { vendorId, name, description, coverPhoto, status, productIds } = await c.req.json();
    const actualVendorId = await resolveVendorIdFromSlugOrId(String(vendorId || "").trim());
    if (!actualVendorId) {
      return c.json({ error: "vendorId is required" }, 400);
    }
    const categoryName = String(name || "").trim();
    if (!categoryName) {
      return c.json({ error: "Category name is required" }, 400);
    }
    const scopedProductIds = await sanitizeVendorCategoryProductIds(actualVendorId, productIds);
    
    console.log(`📁 Creating category for vendor ${actualVendorId}: ${categoryName}`);
    
    const categoryId = `category:${actualVendorId}:${Date.now()}`;
    const category = {
      id: categoryId,
      name: categoryName,
      description: description || "",
      coverPhoto: coverPhoto || "",
      status: status || "active",
      productIds: scopedProductIds,
      productCount: scopedProductIds.length,
      vendorId: actualVendorId,
      source: "vendor",
      createdByVendor: true,
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
    const categoryId = decodeURIComponent(c.req.param("categoryId"));
    const { name, description, coverPhoto, status, productIds, vendorId } = await c.req.json();
    const actualVendorId = await resolveVendorIdFromSlugOrId(String(vendorId || "").trim());
    
    console.log(`📁 Updating category: ${categoryId}`);
    
    const existingCategory = await kv.get(categoryId);
    if (!existingCategory) {
      return c.json({ error: "Category not found" }, 404);
    }
    const ownershipError = assertVendorCategoryOwnership(categoryId, actualVendorId, existingCategory);
    if (ownershipError) {
      return c.json({ error: ownershipError }, 403);
    }
    const nextProductIds =
      productIds !== undefined
        ? await sanitizeVendorCategoryProductIds(actualVendorId, productIds)
        : (existingCategory.productIds || []);
    
    const updatedCategory = {
      ...existingCategory,
      name: String(name || "").trim() || existingCategory.name,
      description: description || "",
      coverPhoto: coverPhoto !== undefined ? coverPhoto : existingCategory.coverPhoto,
      status: status || existingCategory.status || "active",
      productIds: nextProductIds,
      productCount: nextProductIds.length,
      vendorId: actualVendorId,
      source: "vendor",
      createdByVendor: true,
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
    const categoryId = decodeURIComponent(c.req.param("categoryId"));
    const body = await c.req.json().catch(() => ({}));
    const actualVendorId = await resolveVendorIdFromSlugOrId(String(body.vendorId || "").trim());
    
    console.log(`📁 Deleting category: ${categoryId}`);
    
    const category = await kv.get(categoryId);
    if (!category) {
      return c.json({ error: "Category not found" }, 404);
    }
    const ownershipError = assertVendorCategoryOwnership(categoryId, actualVendorId, category);
    if (ownershipError) {
      return c.json({ error: ownershipError }, 403);
    }
    
    const assignedProductCount = Array.isArray(category.productIds)
      ? category.productIds.filter((id: unknown) => String(id || "").trim()).length
      : 0;
    
    if (assignedProductCount > 0) {
      return c.json({ 
        error: `Cannot delete category with ${assignedProductCount} assigned products. Please move or remove products first.` 
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

async function jsonDashboardStatsFromReadModel(filters: {
  revenueFilter: string;
  ordersFilter: string;
  customersFilter: string;
  productsFilter: string;
  globalFilter: string;
}): Promise<Record<string, unknown> | null> {
  try {
    const { data, error } = await supabase.rpc("rpc_dashboard_stats", {
      p_revenue_filter: filters.revenueFilter,
      p_orders_filter: filters.ordersFilter,
      p_customers_filter: filters.customersFilter,
      p_products_filter: filters.productsFilter,
      p_global_filter: filters.globalFilter,
    });
    if (error) {
      console.warn("[dashboard] read-model stats unavailable:", error.message);
      return null;
    }
    if (!data || typeof data !== "object" || Array.isArray(data)) return null;
    const body = data as Record<string, unknown>;
    const readModelRows = Number(body.readModelRows ?? 0);
    if (readModelRows <= 0) {
      // Migration may be applied before backfill. Do not cache a false-empty dashboard.
      return null;
    }
    return {
      totalRevenue: Number(body.totalRevenue ?? 0),
      totalOrders: Number(body.totalOrders ?? 0),
      totalCustomers: Number(body.totalCustomers ?? 0),
      totalProducts: Number(body.totalProducts ?? 0),
      revenueChange: Number(body.revenueChange ?? 0),
      ordersChange: Number(body.ordersChange ?? 0),
      customersChange: Number(body.customersChange ?? 0),
      productsChange: Number(body.productsChange ?? 0),
      salesTrend: Array.isArray(body.salesTrend) ? body.salesTrend : [],
      topProducts: Array.isArray(body.topProducts) ? body.topProducts : [],
      recentOrders: Array.isArray(body.recentOrders) ? body.recentOrders : [],
      lastUpdated: body.lastUpdated || new Date().toISOString(),
      readModel: true,
      readModelCounts:
        body.readModelCounts && typeof body.readModelCounts === "object" ? body.readModelCounts : undefined,
    };
  } catch (error) {
    console.warn("[dashboard] read-model stats failed:", error);
    return null;
  }
}

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
    /** Sales trend, top products, recent orders — independent of per-card KPI filters. */
    const globalFilter = c.req.query("globalFilter") || "All time";
    const forceRefresh = c.req.query("forceRefresh") === "true"; // Allow manual cache bypass
    
    console.log("🔍 Filters:", { revenueFilter, ordersFilter, customersFilter, productsFilter, globalFilter, forceRefresh });
    
    // 🚀 CHECK CACHE FIRST
    const cacheKey = getDashboardCacheKey({ revenueFilter, ordersFilter, customersFilter, productsFilter, globalFilter });
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

    const readModelStats = await jsonDashboardStatsFromReadModel({
      revenueFilter,
      ordersFilter,
      customersFilter,
      productsFilter,
      globalFilter,
    });
    if (readModelStats) {
      dashboardStatsCache.set(cacheKey, {
        data: readModelStats,
        timestamp: Date.now(),
      });
      return c.json({
        ...readModelStats,
        cached: false,
      });
    }
    
    // Helper function to get date range based on filter
    const getDateRange = (filter: string) => {
      const now = new Date();
      const custom = filter.match(/^DashboardRange:(\d{4}-\d{2}-\d{2}):(\d{4}-\d{2}-\d{2})$/);
      if (custom) {
        const [, ymdFrom, ymdTo] = custom;
        const startDate = new Date(`${ymdFrom}T00:00:00`);
        const endDate = new Date(`${ymdTo}T23:59:59.999`);
        const periodMs = Math.max(24 * 60 * 60 * 1000, endDate.getTime() - startDate.getTime() + 1);
        const compareEndDate = new Date(startDate.getFullYear(), startDate.getMonth(), startDate.getDate(), 0, 0, 0, 0);
        const compareStartDate = new Date(compareEndDate.getTime() - periodMs);
        return { startDate, endDate, compareStartDate, compareEndDate };
      }

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
    
    const globalRange = getDateRange(globalFilter);
    
    const sectionOrders = orders.filter(order => {
      const orderDate = new Date(order.date || order.createdAt);
      return orderDate >= globalRange.startDate && orderDate <= globalRange.endDate;
    });
    
    // ============================================
    // SALES TREND (global date scope)
    // ============================================
    const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    const salesTrend: { name: string; sales: number; orders: number }[] = [];
    const MAX_TREND_MONTHS = 36;
    
    if (globalFilter === "All time") {
      const now = new Date();
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
    } else {
      let cursor = new Date(globalRange.startDate.getFullYear(), globalRange.startDate.getMonth(), 1);
      let n = 0;
      while (cursor.getTime() <= globalRange.endDate.getTime() && n < MAX_TREND_MONTHS) {
        const monthStart = new Date(cursor.getFullYear(), cursor.getMonth(), 1);
        const monthEnd = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0, 23, 59, 59, 999);
        const sliceStart = monthStart.getTime() < globalRange.startDate.getTime() ? globalRange.startDate : monthStart;
        const sliceEnd = monthEnd.getTime() > globalRange.endDate.getTime() ? globalRange.endDate : monthEnd;
        
        const monthOrders = orders.filter(order => {
          const orderDate = new Date(order.date || order.createdAt);
          return orderDate >= sliceStart && orderDate <= sliceEnd;
        });
        
        const monthRevenue = monthOrders.reduce((sum, order) => {
          const total = typeof order.total === 'number' ? order.total : parseFloat(order.total) || 0;
          return sum + total;
        }, 0);
        
        salesTrend.push({
          name: `${monthNames[cursor.getMonth()]} ${cursor.getFullYear()}`,
          sales: Math.round(monthRevenue),
          orders: monthOrders.length
        });
        
        cursor.setMonth(cursor.getMonth() + 1);
        n++;
      }
    }
    
    // ============================================
    // TOP PRODUCTS (global date scope — not KPI card revenue filter)
    // ============================================
    const productSalesMap = new Map();
    
    sectionOrders.forEach(order => {
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
    // RECENT ORDERS (global date scope, max 5)
    // ============================================
    const recentOrders = sectionOrders
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

function inventoryItemsFromProducts(products: any[]): any[] {
  const inventory: any[] = [];

  products.forEach((product: any) => {
    const inventoryQty = product.inventory || product.stock || 0;
    const committed = Math.floor(inventoryQty * 0.05);
    const available = inventoryQty - committed;
    const reorderPoint = 50;
    const location = product.vendor || product.vendorName ? `Vendor: ${product.vendor || product.vendorName}` : "Warehouse A";
    const image = product.images && product.images.length > 0
      ? product.images[0]
      : product.image || "https://images.unsplash.com/photo-1505740420928-5e560c06d30e?w=100&h=100&fit=crop";

    inventory.push({
      id: product.id,
      product: product.name || product.title,
      sku: product.sku,
      image,
      available,
      committed,
      onHand: inventoryQty,
      reorderPoint,
      location,
      vendorId: product.vendor || product.vendorId,
      createdAt: product.createdAt || product.createDate,
      updatedAt: product.updatedAt,
      isVariant: false,
    });

    if (product.hasVariants && Array.isArray(product.variants)) {
      product.variants.forEach((variant: any, vIndex: number) => {
        const variantInventory = variant.inventory || 0;
        const variantCommitted = Math.floor(variantInventory * 0.05);
        const variantAvailable = variantInventory - variantCommitted;
        const variantName =
          variant.name ||
          (variant.options ? Object.values(variant.options).join(" / ") : `Variant ${vIndex + 1}`);

        inventory.push({
          id: variant.id,
          product: `${product.name || product.title} - ${variantName}`,
          sku: variant.sku,
          image: variant.image || image,
          available: variantAvailable,
          committed: variantCommitted,
          onHand: variantInventory,
          reorderPoint,
          location,
          vendorId: product.vendor || product.vendorId,
          createdAt: product.createdAt || product.createDate,
          updatedAt: product.updatedAt,
          isVariant: true,
          parentId: product.id,
          parentName: product.name || product.title,
        });
      });
    }
  });

  return inventory;
}

async function loadInventoryProductsFromReadModel(): Promise<any[] | null> {
  try {
    const { data, error } = await supabase
      .from("app_products")
      .select("id,name,sku,vendor_id,vendor_name,inventory,raw,source_created_at,source_updated_at")
      .order("source_created_at", { ascending: false, nullsFirst: false });
    if (error) {
      console.warn("[inventory] read-model product list unavailable:", error.message);
      return null;
    }
    if (!Array.isArray(data) || data.length === 0) return null;
    return data.map((row: any) => ({
      ...(row.raw && typeof row.raw === "object" ? row.raw : {}),
      id: row.id,
      name: row.name || row.raw?.name || row.raw?.title,
      sku: row.sku || row.raw?.sku,
      vendorId: row.vendor_id || row.raw?.vendorId,
      vendor: row.vendor_name || row.raw?.vendor,
      inventory: row.inventory ?? row.raw?.inventory ?? row.raw?.stock,
      createdAt: row.raw?.createdAt || row.source_created_at,
      updatedAt: row.raw?.updatedAt || row.source_updated_at,
    }));
  } catch (error) {
    console.warn("[inventory] read-model product list failed:", error);
    return null;
  }
}

async function findProductIdForVariantFromReadModel(variantId: string): Promise<string | null> {
  const id = String(variantId || "").trim();
  if (!id) return null;
  try {
    const { data, error } = await supabase
      .from("app_product_skus")
      .select("product_id")
      .eq("variant_id", id)
      .limit(1);
    if (error) {
      console.warn("[inventory] variant read-model lookup unavailable:", error.message);
      return null;
    }
    const row = Array.isArray(data) ? data[0] : null;
    return row?.product_id ? String(row.product_id) : null;
  } catch (error) {
    console.warn("[inventory] variant read-model lookup failed:", error);
    return null;
  }
}

// Get all inventory items
app.get("/make-server-16010b6f/inventory", async (c) => {
  try {
    console.log("📦 [INVENTORY] Starting inventory fetch...");
    
    let allProducts = await loadInventoryProductsFromReadModel();
    const loadedFromReadModel = Array.isArray(allProducts);
    if (!allProducts) {
      console.log("📦 [INVENTORY] Read model unavailable, fetching products with prefix: 'product:'");
      allProducts = await kv.getByPrefix("product:");
    }
    
    console.log(`📦 [INVENTORY] Raw fetch result:`, {
      isArray: Array.isArray(allProducts),
      length: allProducts?.length || 0,
      type: typeof allProducts,
      readModel: loadedFromReadModel,
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
    
    const inventory = inventoryItemsFromProducts(allProducts);
    
    console.log(`✅ [INVENTORY] Conversion complete!`);
    console.log(`✅ [INVENTORY] Total: ${allProducts.length} products → ${inventory.length} inventory items`);
    
    return c.json({ 
      success: true,
      inventory: inventory,
      totalProducts: allProducts.length,
      totalItems: inventory.length,
      readModel: loadedFromReadModel,
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
    const param = c.req.param("vendorId");
    const vendorId = await resolveVendorIdFromSlugOrId(param);
    console.log(`📦 Getting inventory for vendor: ${vendorId}`);

    const vendorRow = await withTimeout(kv.get(`vendor:${vendorId}`), 5000).catch(() => null);
    if (vendorRow && typeof vendorRow === "object" && !vendorProfileAllowsPublicStorefront(vendorRow)) {
      return c.json(
        {
          error: "This vendor account cannot load inventory right now.",
          inventory: [],
          vendorAccountInactive: true,
        },
        403
      );
    }

    const readModelProducts = await loadInventoryProductsFromReadModel();
    if (readModelProducts) {
      const vendorInventory = inventoryItemsFromProducts(readModelProducts).filter(
        (item: any) => String(item.vendorId || "") === String(vendorId)
      );
      console.log(`✅ Found ${vendorInventory.length} read-model inventory items for vendor ${vendorId}`);
      return c.json({ inventory: vendorInventory, readModel: true });
    }

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
    
    // If not found, resolve variant ID/SKU through the SQL read model instead of scanning every product.
    if (!product) {
      console.log(`🔍 Item not found as product, resolving variant via read model...`);
      const mappedProductId = await findProductIdFromReadModelSkuOrVariant({
        variantId: itemId,
        sku: newSku,
      });
      if (mappedProductId) {
        const mappedProduct = await kv.get(`product:${mappedProductId}`);
        if (mappedProduct && typeof mappedProduct === "object") {
          product = mappedProduct;
          isVariant = true;
          variantId = itemId;
          console.log(`✅ Found as variant in product: ${mappedProductId}`);
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
      queueProductReadModelSync(String(product.id), product);
      
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
      queueProductReadModelSync(String(product.id), updatedProduct);
      
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
          if (String(itemId).startsWith("product:")) {
            const productId = String(updatedProduct.id || "").trim() || String(itemId).slice("product:".length);
            queueProductReadModelSync(productId, updatedProduct);
          }
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