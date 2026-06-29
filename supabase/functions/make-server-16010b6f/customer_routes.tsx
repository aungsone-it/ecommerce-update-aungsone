import { Hono } from "npm:hono@4";
import * as kv from "./kv_store.tsx";
import { createClient } from "jsr:@supabase/supabase-js@2.49.8";
import { ensureBucket } from "./storage_bucket_helpers.tsx";
import { deleteOwnedStorageRefs } from "./storage_delete_helpers.tsx";
import { assertDestructiveOperationAllowed } from "./admin_operation_guard.tsx";
import { appendStaffActivity } from "./staff_activity_helpers.tsx";
import {
  queueCustomerReadModelDelete,
  queueCustomerReadModelSync,
} from "./read_model.ts";

const customerApp = new Hono();

// Initialize Supabase client
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

// Bucket name for customer profile images
const BUCKET_NAME = "make-16010b6f-customer-images";
const AUTH_PROFILE_IMAGES_BUCKET = "make-16010b6f-profile-images";

// Timeout wrapper
async function withTimeout<T>(promise: Promise<T>, timeoutMs = 60000): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error("Operation timed out")), timeoutMs)
    )
  ]);
}

// 🔥 OPTIMIZED: Find customer by userId without fetching all customers
async function findCustomerByUserId(userId: string): Promise<any> {
  try {
    const { data, error } = await supabase
      .from("kv_store_16010b6f")
      .select("value")
      .like("key", "customer:%")
      .limit(1000); // Reasonable limit to prevent timeouts
    
    if (error) {
      console.error("❌ Error querying customers by userId:", error);
      return null;
    }
    
    // Find the customer with matching userId in the results
    const customer = data?.find((row: any) => {
      const value = row.value;
      return value && value.userId === userId;
    });
    
    return customer?.value || null;
  } catch (error) {
    console.error("❌ Exception in findCustomerByUserId:", error);
    return null;
  }
}

/** Legacy rows may use auth UUID as id without userId — link audience + deletes correctly. */
function enrichCustomerIdentity(c: any): any {
  const uid = String(c?.userId || "").trim();
  const id = String(c?.id || "").trim();
  if (!uid && /^[0-9a-f-]{36}$/i.test(id)) {
    return { ...c, userId: id };
  }
  return c;
}

/** Resolve KV customer by cust_* id, auth userId, or legacy id field. */
async function resolveCustomerForDelete(
  idParam: string
): Promise<{ customer: any; storageKey: string } | null> {
  const param = String(idParam || "").trim();
  if (!param) return null;

  const direct = await withTimeout(kv.get(`customer:${param}`), 5000);
  if (direct && typeof direct === "object" && !Array.isArray(direct)) {
    const enriched = enrichCustomerIdentity(direct);
    return { customer: enriched, storageKey: String(enriched.id || param) };
  }

  const byUser = await findCustomerByUserId(param);
  if (byUser) {
    const enriched = enrichCustomerIdentity(byUser);
    return { customer: enriched, storageKey: String(enriched.id || param) };
  }

  const all = await withTimeout(kv.getByPrefix("customer:"), 30000).catch(() => []);
  if (Array.isArray(all)) {
    const found = all.find(
      (c: any) => c && typeof c === "object" && String(c.id || "") === param
    );
    if (found) {
      const enriched = enrichCustomerIdentity(found);
      return { customer: enriched, storageKey: String(enriched.id || param) };
    }
  }

  return null;
}

function audienceRowMatches(
  row: any,
  match: { userId?: string; email?: string; phone?: string }
): boolean {
  const uid = String(match.userId || "").trim();
  if (uid && String(row?.userId || "").trim() === uid) return true;
  const em = String(match.email || "").trim().toLowerCase();
  if (em && String(row?.email || "").trim().toLowerCase() === em) return true;
  const phone = normalizeAudiencePhone(match.phone);
  if (phone && normalizeAudiencePhone(row?.phone) === phone) return true;
  return false;
}

async function removeFromAllVendorAudiences(match: {
  userId?: string;
  email?: string;
  phone?: string;
}): Promise<number> {
  if (!match.userId && !match.email && !match.phone) return 0;
  const rows = await withTimeout(kv.getByPrefixWithKeys("vendor:audience:"), 30000).catch(
    () => [] as { key: string; value: unknown }[]
  );
  let removed = 0;
  for (const { key, value } of rows) {
    if (!Array.isArray(value)) continue;
    const next = value.filter((r: any) => !audienceRowMatches(r, match));
    if (next.length !== value.length) {
      removed += value.length - next.length;
      await withTimeout(kv.set(key, next), 5000);
    }
  }
  return removed;
}

async function removeFromAllVendorAudiencesByAny(
  matches: Array<{ userId?: string; email?: string; phone?: string }>
): Promise<number> {
  const normalized = matches.filter(
    (m) => String(m?.userId || m?.email || m?.phone || "").trim() !== ""
  );
  if (normalized.length === 0) return 0;
  const rows = await withTimeout(kv.getByPrefixWithKeys("vendor:audience:"), 30000).catch(
    () => [] as { key: string; value: unknown }[]
  );
  let removed = 0;
  for (const { key, value } of rows) {
    if (!Array.isArray(value)) continue;
    const next = value.filter(
      (r: any) => !normalized.some((m) => audienceRowMatches(r, m))
    );
    if (next.length !== value.length) {
      removed += value.length - next.length;
      await withTimeout(kv.set(key, next), 5000);
    }
  }
  return removed;
}

async function inferUserIdsFromEmail(email: string | undefined): Promise<string[]> {
  const em = String(email || "").trim().toLowerCase();
  if (!em) return [];
  const rows = await withTimeout(kv.getByPrefixWithKeys("userId:"), 30000).catch(
    () => [] as { key: string; value: unknown }[]
  );
  const out: string[] = [];
  for (const row of rows) {
    const key = String(row?.key || "");
    const value = (row?.value || {}) as { email?: unknown };
    const rowEmail = String(value?.email || "").trim().toLowerCase();
    if (!rowEmail || rowEmail !== em) continue;
    const uid = key.startsWith("userId:") ? key.slice("userId:".length) : "";
    if (uid) out.push(uid);
  }
  return [...new Set(out)];
}

function isUuidLike(value: string | undefined): boolean {
  return /^[0-9a-f-]{36}$/i.test(String(value || "").trim());
}

async function purgeAuthAndUserKv(userId: string): Promise<void> {
  const uid = String(userId || "").trim();
  if (!uid) return;
  try {
    const { error: authDeleteError } = await supabase.auth.admin.deleteUser(uid);
    if (authDeleteError) {
      console.error(`❌ Failed to delete auth user ${uid}:`, authDeleteError);
    } else {
      console.log(`✅ Supabase Auth user deleted: ${uid}`);
    }
  } catch (authError) {
    console.error(`❌ Error deleting auth user ${uid}:`, authError);
  }
  try {
    const userLookup = await withTimeout(kv.get(`userId:${uid}`), 5000);
    if (userLookup?.email) {
      await withTimeout(kv.del(`user:${userLookup.email}`), 5000);
    }
    await withTimeout(kv.del(`userId:${uid}`), 5000);
    await withTimeout(kv.del(`auth:user:${uid}`), 5000).catch(() => undefined);
  } catch (userDeleteError) {
    console.warn(`⚠️ Could not delete user KV for ${uid}:`, userDeleteError);
  }
}

// Bucket created lazily via ensureBucket on upload routes (avoids listBuckets on every Edge cold start)

// ============================================
// CUSTOMER MANAGEMENT ENDPOINTS
// ============================================

/** Email on order payload (multiple shapes used across checkout flows). */
function orderCustomerEmail(order: any): string {
  const raw =
    order?.email ||
    order?.customerEmail ||
    (typeof order?.customer === "object" && order?.customer?.email) ||
    "";
  return String(raw).trim().toLowerCase();
}

function orderTotalAmount(order: any): number {
  const t = order?.total;
  if (typeof t === "number" && !Number.isNaN(t)) return t;
  const p = parseFloat(String(t ?? "0").replace(/[^0-9.-]/g, ""));
  return Number.isFinite(p) ? p : 0;
}

/** Sum order totals by email and by userId (excludes cancelled). Checkout often sets both. */
function aggregateCustomerSpendFromOrders(orders: unknown): {
  spendByEmail: Map<string, number>;
  countByEmail: Map<string, number>;
  spendByUserId: Map<string, number>;
  countByUserId: Map<string, number>;
} {
  const spendByEmail = new Map<string, number>();
  const countByEmail = new Map<string, number>();
  const spendByUserId = new Map<string, number>();
  const countByUserId = new Map<string, number>();
  if (!Array.isArray(orders)) {
    return { spendByEmail, countByEmail, spendByUserId, countByUserId };
  }
  for (const order of orders) {
    if (!order || typeof order !== "object") continue;
    const st = String((order as any).status || "").toLowerCase();
    if (st === "cancelled" || st === "canceled") continue;
    const tot = orderTotalAmount(order);
    const em = orderCustomerEmail(order);
    if (em) {
      spendByEmail.set(em, (spendByEmail.get(em) || 0) + tot);
      countByEmail.set(em, (countByEmail.get(em) || 0) + 1);
    }
    const uid = String((order as any).userId || "").trim();
    if (uid) {
      spendByUserId.set(uid, (spendByUserId.get(uid) || 0) + tot);
      countByUserId.set(uid, (countByUserId.get(uid) || 0) + 1);
    }
  }
  return { spendByEmail, countByEmail, spendByUserId, countByUserId };
}

function mergeOrderMetricsIntoCustomer(
  cust: any,
  spendByEmail: Map<string, number>,
  countByEmail: Map<string, number>,
  spendByUserId: Map<string, number>,
  countByUserId: Map<string, number>
) {
  const em = String(cust?.email || "").trim().toLowerCase();
  const uid = String(cust?.userId || cust?.id || "").trim();

  let s: number | undefined;
  let n: number | undefined;

  if (em && spendByEmail.has(em)) {
    s = spendByEmail.get(em);
    n = countByEmail.get(em);
  } else if (uid && spendByUserId.has(uid)) {
    s = spendByUserId.get(uid);
    n = countByUserId.get(uid);
  }

  if (s == null && n == null) return cust;

  const sFinal = s ?? (Number(cust.totalSpent) || 0);
  const nFinal = n ?? (Number(cust.totalOrders) || 0);
  return {
    ...cust,
    totalSpent: sFinal,
    lifetimeValue: sFinal,
    totalOrders: nFinal,
    avgOrderValue: nFinal > 0 ? sFinal / nFinal : Number(cust.avgOrderValue) || 0,
  };
}

async function attachFreshCustomerAvatar(cust: any): Promise<any> {
  if (!cust || typeof cust !== "object") return cust;
  const path = typeof cust.profileImage === "string" ? cust.profileImage.trim() : "";
  if (!path) return cust;
  try {
    const bucketOrder = path.startsWith("profile-images/")
      ? [AUTH_PROFILE_IMAGES_BUCKET, BUCKET_NAME]
      : [BUCKET_NAME, AUTH_PROFILE_IMAGES_BUCKET];
    for (const bucket of bucketOrder) {
      const { data, error } = await supabase.storage
        .from(bucket)
        .createSignedUrl(path, 315360000); // 10 years
      if (!error && data?.signedUrl) {
        return {
          ...cust,
          avatar: data.signedUrl,
          profileImageUrl: data.signedUrl,
        };
      }
    }
  } catch (e) {
    console.warn("⚠️ Could not refresh customer avatar signed URL:", e);
  }
  return cust;
}

function customerSegmentFromRfm(cust: any): string {
  const rfm = cust?.rfmScore;
  if (!rfm || typeof rfm !== "object") return "unknown";
  const recency = Number(rfm.recency) || 0;
  const frequency = Number(rfm.frequency) || 0;
  const monetary = Number(rfm.monetary) || 0;
  const score = recency + frequency + monetary;
  if (score >= 13) return "champions";
  if (score >= 10 && recency >= 4) return "loyal";
  if (score >= 8 && recency >= 3) return "potential-loyalist";
  if (score >= 6 && recency <= 2) return "at-risk";
  if (frequency >= 4 && recency <= 2) return "cant-lose";
  if (score <= 6) return "hibernating";
  return "need-attention";
}

function normalizeAudiencePhone(raw: string | undefined): string {
  const normalized = String(raw || "").replace(/[\s\-]/g, "");
  if (!normalized) return "";
  if (/^09\d{9}$/.test(normalized)) return `+959${normalized.slice(1)}`;
  if (/^\+959\d{9}$/.test(normalized)) return normalized;
  return normalized;
}

function dedupeKeysForContact(opts: { userId?: string; email?: string; phone?: string }): string[] {
  const keys: string[] = [];
  const uid = String(opts.userId || "").trim();
  if (uid) keys.push(`uid:${uid}`);
  const phone = normalizeAudiencePhone(opts.phone);
  if (phone) keys.push(`phone:${phone}`);
  const em = String(opts.email || "").trim().toLowerCase();
  if (em) keys.push(`email:${em}`);
  return keys;
}

/** Super admin: KV customers + registered storefront audience (userId only). No guest order-only rows. */
function mergeSystemCustomerSources(
  kvCustomers: any[],
  spendByEmail: Map<string, number>,
  countByEmail: Map<string, number>,
  spendByUserId: Map<string, number>,
  countByUserId: Map<string, number>,
  audienceEntries: { aud: any }[]
): any[] {
  const rows: any[] = kvCustomers.map((c) => ({ ...c }));
  const aliasToIdx = new Map<string, number>();

  const linkRow = (idx: number) => {
    const c = rows[idx];
    for (const k of dedupeKeysForContact({
      userId: c.userId,
      email: c.email,
      phone: c.phone,
    })) {
      aliasToIdx.set(k, idx);
    }
  };

  rows.forEach((_, i) => linkRow(i));

  const resolveIdx = (opts: { userId?: string; email?: string; phone?: string }): number | undefined => {
    for (const k of dedupeKeysForContact(opts)) {
      const idx = aliasToIdx.get(k);
      if (idx !== undefined) return idx;
    }
    return undefined;
  };

  const mergeInto = (idx: number, patch: Record<string, unknown>) => {
    rows[idx] = { ...rows[idx], ...patch };
    linkRow(idx);
  };

  for (const { aud } of audienceEntries) {
    const uid = String(aud?.userId || "").trim();
    if (!uid) continue;
    const em = String(aud?.email || "").trim().toLowerCase();
    const phone = normalizeAudiencePhone(aud?.phone);

    const idx = resolveIdx({ userId: uid, email: em, phone });
    if (idx !== undefined) {
      const cur = rows[idx];
      const tags = new Set<string>([...(Array.isArray(cur.tags) ? cur.tags : []), "storefront"]);
      mergeInto(idx, {
        name:
          cur.name ||
          String(aud?.name || "").trim() ||
          (em ? em.split("@")[0] : "Customer"),
        email: cur.email || em,
        phone: cur.phone || phone,
        userId: cur.userId || uid,
        avatar: cur.avatar || aud?.avatar,
        tags: [...tags],
      });
      continue;
    }

    const id = uid || (em ? `email:${em}` : `phone:${phone}`);
    rows.push({
      id,
      userId: uid || undefined,
      name: String(aud?.name || "").trim() || (em ? em.split("@")[0] : "Customer"),
      email: em,
      phone,
      status: "active",
      tier: "new",
      joinDate: aud?.firstSeenAt || new Date().toISOString(),
      tags: ["storefront"],
    });
    linkRow(rows.length - 1);
  }

  return rows.map((cust) =>
    mergeOrderMetricsIntoCustomer(cust, spendByEmail, countByEmail, spendByUserId, countByUserId)
  );
}

function customerMatchesSearchQuery(cust: any, qRaw: string): boolean {
  if (!qRaw) return true;
  const name = String(cust.name || "").toLowerCase();
  const email = String(cust.email || "").toLowerCase();
  const phone = String(cust.phone || "").toLowerCase();
  const normPhone = normalizeAudiencePhone(cust.phone).toLowerCase();
  return (
    name.includes(qRaw) ||
    email.includes(qRaw) ||
    phone.includes(qRaw) ||
    (normPhone !== "" && normPhone.toLowerCase().includes(qRaw))
  );
}

/**
 * Read-model path can lag behind `vendor:audience:*` writes and cause count drift
 * versus Vendor Admin customer lists. Keep disabled by default so both panels
 * read from the same unified live sources.
 */
const ENABLE_ADMIN_CUSTOMERS_READ_MODEL = false;

async function jsonAdminCustomersPageFromReadModel(c: any): Promise<Record<string, unknown> | null> {
  if (!ENABLE_ADMIN_CUSTOMERS_READ_MODEL) return null;
  const pageQ = c.req.query("page");
  if (pageQ === undefined || pageQ === "") return null;
  const page = Math.max(1, parseInt(String(pageQ), 10) || 1);
  const pageSize = Math.min(
    100,
    Math.max(1, parseInt(String(c.req.query("pageSize") || "20"), 10) || 20)
  );
  try {
    const { data, error } = await supabase.rpc("rpc_admin_customers_page", {
      p_page: page,
      p_page_size: pageSize,
      p_q: String(c.req.query("q") || "").trim() || null,
      p_status: String(c.req.query("status") || "all").toLowerCase(),
      p_tier: String(c.req.query("tier") || "all").toLowerCase(),
      p_segment: String(c.req.query("segment") || "all").toLowerCase(),
    });
    if (error) {
      console.warn("[customers] read-model page unavailable:", error.message);
      return null;
    }
    if (!data || typeof data !== "object" || Array.isArray(data)) return null;
    const body = data as Record<string, unknown>;
    const readModelRows = Number(body.readModelRows ?? 0);
    if (readModelRows <= 0) return null;
    const rows = Array.isArray(body.customers) ? body.customers : [];
    const freshRows = await Promise.all(rows.map((cust: any) => attachFreshCustomerAvatar(cust)));
    return {
      success: true,
      customers: freshRows,
      total: Number(body.total ?? 0),
      page: Number(body.page ?? page),
      pageSize: Number(body.pageSize ?? pageSize),
      hasMore: Boolean(body.hasMore),
      stats: body.stats && typeof body.stats === "object" ? body.stats : undefined,
      readModel: true,
    };
  } catch (error) {
    console.warn("[customers] read-model page failed:", error);
    return null;
  }
}

// Get all customers
customerApp.get("/customers", async (c) => {
  try {
    console.log("📊 Fetching all customers...");

    const readModelBody = await jsonAdminCustomersPageFromReadModel(c);
    if (readModelBody) {
      return c.json(readModelBody);
    }
    
    const customers = await withTimeout(kv.getByPrefix("customer:"), 45000);
    
    // 🔥 FILTER OUT INVALID DATA - Only return proper customer objects
    const validCustomers = Array.isArray(customers) 
      ? customers.filter(c => {
          // Must not be null/undefined
          if (c == null) {
            return false;
          }
          // Must be an object (not array, not primitive)
          if (typeof c !== 'object' || Array.isArray(c)) {
            // 🔇 SILENTLY SKIP corrupted entries - no need to log every time
            return false;
          }
          // Must have an ID
          if (!c.id || typeof c.id !== 'string') {
            return false;
          }
          return true;
        })
      : [];
    
    console.log(`✅ Found ${validCustomers.length} valid customers (filtered from ${customers?.length || 0} total)`);

    const [allOrdersRaw, audienceKv] = await Promise.all([
      withTimeout(kv.getByPrefix("order:"), 45000).catch(() => []),
      withTimeout(kv.getByPrefixWithKeys("vendor:audience:"), 45000).catch(() => []),
    ]);
    const { spendByEmail, countByEmail, spendByUserId, countByUserId } = aggregateCustomerSpendFromOrders(
      Array.isArray(allOrdersRaw) ? allOrdersRaw : []
    );

    const audienceEntries: { aud: any }[] = [];
    for (const { value } of Array.isArray(audienceKv) ? audienceKv : []) {
      const list = Array.isArray(value) ? value : [];
      for (const aud of list) {
        if (aud && typeof aud === "object") audienceEntries.push({ aud });
      }
    }

    const unifiedCustomers = mergeSystemCustomerSources(
      validCustomers.map((c: any) => enrichCustomerIdentity(c)),
      spendByEmail,
      countByEmail,
      spendByUserId,
      countByUserId,
      audienceEntries
    );

    console.log(
      `✅ Unified ${unifiedCustomers.length} customers (KV ${validCustomers.length}, audience rows ${audienceEntries.length})`
    );

    const pageQ = c.req.query("page");
    if (pageQ !== undefined && pageQ !== "") {
      const page = Math.max(1, parseInt(String(pageQ), 10) || 1);
      const pageSize = Math.min(
        100,
        Math.max(1, parseInt(String(c.req.query("pageSize") || "20"), 10) || 20)
      );
      const qRaw = String(c.req.query("q") || "")
        .trim()
        .toLowerCase();
      const statusF = String(c.req.query("status") || "all").toLowerCase();
      const tierF = String(c.req.query("tier") || "all").toLowerCase();
      const segmentF = String(c.req.query("segment") || "all").toLowerCase();

      let rows = unifiedCustomers.filter((cust: any) => {
        if (statusF !== "all" && String(cust.status || "").toLowerCase() !== statusF) return false;
        if (tierF !== "all" && String(cust.tier || "").toLowerCase() !== tierF) return false;
        if (segmentF !== "all" && customerSegmentFromRfm(cust) !== segmentF) return false;
        if (!customerMatchesSearchQuery(cust, qRaw)) return false;
        return true;
      });

      rows.sort((a: any, b: any) =>
        String(a.name || a.email || a.phone || "").localeCompare(String(b.name || b.email || b.phone || ""))
      );

      const now = new Date();
      const segCount = (tag: string) =>
        rows.filter((cust: any) => customerSegmentFromRfm(cust) === tag).length;
      const stats = {
        total: rows.length,
        active: rows.filter((cust: any) => cust.status === "active").length,
        vip: rows.filter((cust: any) => cust.tier === "vip").length,
        newThisMonth: rows.filter((cust: any) => {
          const d = new Date(cust.joinDate || 0);
          return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
        }).length,
        totalRevenue: rows.reduce((s: number, cust: any) => s + (Number(cust.totalSpent) || 0), 0),
        avgLTV:
          rows.length > 0 ?
            rows.reduce((s: number, cust: any) => s + (Number(cust.lifetimeValue) || 0), 0) / rows.length
          : 0,
        champions: segCount("champions"),
        atRisk: rows.filter((cust: any) => {
          const seg = customerSegmentFromRfm(cust);
          return seg === "at-risk" || seg === "cant-lose";
        }).length,
        segments: {
          champions: segCount("champions"),
          loyal: segCount("loyal"),
          potentialLoyalist: segCount("potential-loyalist"),
          atRisk: segCount("at-risk"),
          cantLose: segCount("cant-lose"),
          hibernating: segCount("hibernating"),
          needAttention: segCount("need-attention"),
          unknown: segCount("unknown"),
        },
      };

      const slice = rows.slice((page - 1) * pageSize, page * pageSize);
      const freshSlice = await Promise.all(slice.map((cust: any) => attachFreshCustomerAvatar(cust)));
      return c.json({
        success: true,
        customers: freshSlice,
        total: rows.length,
        page,
        pageSize,
        hasMore: page * pageSize < rows.length,
        stats,
      });
    }
    
    const freshAll = await Promise.all(unifiedCustomers.map((cust: any) => attachFreshCustomerAvatar(cust)));

    return c.json({
      success: true,
      customers: freshAll,
      total: freshAll.length,
    });
  } catch (error: any) {
    console.error("❌ Error fetching customers:", error);
    return c.json({ 
      error: "Failed to fetch customers", 
      details: String(error),
      customers: [], // Return empty array on error
      total: 0,
    }, 500);
  }
});

// Get customer by ID
customerApp.get("/customers/:customerId", async (c) => {
  try {
    const customerId = c.req.param("customerId");
    console.log(`👤 Fetching customer: ${customerId}`);
    
    const customer = await withTimeout(kv.get(`customer:${customerId}`), 5000);
    
    if (!customer) {
      return c.json({ error: "Customer not found" }, 404);
    }
    
    const freshCustomer = await attachFreshCustomerAvatar(customer);
    return c.json({
      success: true,
      customer: freshCustomer,
    });
  } catch (error: any) {
    console.error("❌ Error fetching customer:", error);
    return c.json({ 
      error: "Failed to fetch customer", 
      details: String(error) 
    }, 500);
  }
});

// Create new customer
customerApp.post("/customers", async (c) => {
  try {
    console.log("📥 Received POST /customers request");
    
    const body = await c.req.json();
    console.log("📦 Request body:", JSON.stringify(body, null, 2));
    
    const { name, email, phone, location, address, city, region, status, tier, avatar } = body;
    
    // Validate required fields
    if (!name || !email || !phone || !location) {
      console.error("❌ Missing required fields:", { name: !!name, email: !!email, phone: !!phone, location: !!location });
      return c.json({ 
        error: "Missing required fields",
        required: ["name", "email", "phone", "location"],
        received: { name: !!name, email: !!email, phone: !!phone, location: !!location }
      }, 400);
    }
    
    console.log(`👤 Creating new customer: ${name} (${email})`);
    
    // 🔥 CHECK FOR DUPLICATE EMAIL - CRITICAL!
    const allCustomers = await withTimeout(kv.getByPrefix("customer:"), 30000);
    const existingCustomer = (Array.isArray(allCustomers) ? allCustomers : [])
      .find(c => c != null && c.email && c.email.toLowerCase() === email.toLowerCase());
    
    if (existingCustomer) {
      console.warn(`⚠️ Customer with email ${email} already exists: ${existingCustomer.id}`);
      return c.json({ 
        error: "Customer with this email already exists",
        existingCustomerId: existingCustomer.id,
        message: `A customer with email "${email}" is already registered`,
      }, 409); // 409 Conflict
    }
    
    // Generate customer ID
    const customerId = `cust_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
    
    const newCustomer = {
      id: customerId,
      name,
      email,
      phone,
      location,
      address: address || "",
      city: city || "",
      region: region || "",
      status: status || "active",
      tier: tier || "new",
      avatar: avatar || `https://api.dicebear.com/7.x/pixel-art/svg?seed=${encodeURIComponent(name)}`,
      joinDate: new Date().toISOString().split('T')[0],
      totalOrders: 0,
      totalSpent: 0,
      lastVisit: new Date().toISOString().split('T')[0],
      avgOrderValue: 0,
      tags: ["new-customer"],
      engagementScore: 0,
      lifetimeValue: 0,
      rfmScore: {
        recency: 5,
        frequency: 1,
        monetary: 1,
      },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    
    console.log(`💾 Saving customer to database: ${customerId}`);
    
    // Save to database
    await withTimeout(kv.set(`customer:${customerId}`, newCustomer), 5000);
    queueCustomerReadModelSync(customerId, newCustomer);
    
    console.log(`✅ Customer created successfully: ${customerId}`);
    console.log(`✅ Customer data:`, JSON.stringify(newCustomer, null, 2));
    
    return c.json({
      success: true,
      customer: newCustomer,
      message: "Customer created successfully",
    }, 201);
  } catch (error: any) {
    console.error("❌ Error creating customer:", error);
    console.error("❌ Error stack:", error?.stack);
    return c.json({ 
      error: "Failed to create customer", 
      details: String(error),
      message: error?.message || "Unknown error"
    }, 500);
  }
});

/** Fields clients may update via PUT (prevents mass-assignment of totals, ids, internal keys). */
const CUSTOMER_UPDATABLE_FIELDS = new Set([
  "name",
  "email",
  "phone",
  "address",
  "city",
  "region",
  "status",
  "tier",
  "avatar",
  "tags",
  "notes",
  "preferences",
]);

// Update customer
customerApp.put("/customers/:customerId", async (c) => {
  try {
    const customerId = c.req.param("customerId");
    const body = await c.req.json();
    
    console.log(`🔄 Updating customer: ${customerId}`);
    
    // Get existing customer
    const existingCustomer = await withTimeout(kv.get(`customer:${customerId}`), 5000);
    
    if (!existingCustomer) {
      return c.json({ error: "Customer not found" }, 404);
    }

    const patches: Record<string, unknown> = {};
    if (body && typeof body === "object") {
      for (const key of Object.keys(body as object)) {
        if (CUSTOMER_UPDATABLE_FIELDS.has(key)) {
          patches[key] = (body as Record<string, unknown>)[key];
        }
      }
    }
    
    // Merge with existing data (only allowed fields from body)
    const updatedCustomer = {
      ...existingCustomer,
      ...patches,
      id: customerId, // Ensure ID doesn't change
      updatedAt: new Date().toISOString(),
    };
    
    // Save updated customer
    await withTimeout(kv.set(`customer:${customerId}`, updatedCustomer), 5000);
    queueCustomerReadModelSync(customerId, updatedCustomer);
    
    console.log(`✅ Customer updated: ${customerId}`);
    
    return c.json({
      success: true,
      customer: updatedCustomer,
      message: "Customer updated successfully",
    });
  } catch (error: any) {
    console.error("❌ Error updating customer:", error);
    return c.json({ 
      error: "Failed to update customer", 
      details: String(error) 
    }, 500);
  }
});

// Delete customer
customerApp.delete("/customers/:customerId", async (c) => {
  try {
    const idParam = c.req.param("customerId");
    const deletedBy = String(c.req.query("deletedBy") || c.req.header("x-actor-user-id") || "").trim();
    console.log(`🗑️ Deleting customer: ${idParam}`);

    const resolved = await resolveCustomerForDelete(idParam);

    if (!resolved) {
      const param = String(idParam || "").trim();
      if (/^[0-9a-f-]{36}$/i.test(param)) {
        const removedAudience = await removeFromAllVendorAudiences({ userId: param });
        await purgeAuthAndUserKv(param);
        if (removedAudience > 0) {
          console.log(`✅ Removed audience-only customer ${param} (${removedAudience} row(s))`);
          return c.json({
            success: true,
            message: "Customer removed from storefront audience",
          });
        }
      }
      return c.json({ error: "Customer not found" }, 404);
    }

    const { customer, storageKey } = resolved;
    const userId = String(customer.userId || "").trim();
    const inferredUserIds = userId ? [] : await inferUserIdsFromEmail(customer.email);
    const audienceMatchers: Array<{ userId?: string; email?: string; phone?: string }> = [
      {
        userId: userId || undefined,
        email: customer.email,
        phone: customer.phone,
      },
    ];
    for (const uid of inferredUserIds) {
      audienceMatchers.push({ userId: uid, email: customer.email, phone: customer.phone });
    }
    if (isUuidLike(idParam)) {
      audienceMatchers.push({ userId: String(idParam).trim() });
    }
    if (isUuidLike(storageKey)) {
      audienceMatchers.push({ userId: String(storageKey).trim() });
    }

    if (userId) {
      await purgeAuthAndUserKv(userId);
    }

    await removeFromAllVendorAudiencesByAny(audienceMatchers);

    await withTimeout(kv.del(`customer:${storageKey}`), 5000);
    queueCustomerReadModelDelete(storageKey);
    if (storageKey !== idParam) {
      await withTimeout(kv.del(`customer:${idParam}`), 5000).catch(() => undefined);
      queueCustomerReadModelDelete(idParam);
    }
    if (userId && userId !== storageKey && userId !== idParam) {
      await withTimeout(kv.del(`customer:${userId}`), 5000).catch(() => undefined);
      queueCustomerReadModelDelete(userId);
    }

    const custImg =
      typeof (customer as { profileImage?: string }).profileImage === "string"
        ? (customer as { profileImage: string }).profileImage.trim()
        : "";
    if (custImg) {
      await deleteOwnedStorageRefs(supabase, [custImg]);
    }

    console.log(`✅ Customer deleted completely: ${storageKey} (requested: ${idParam})`);
    const customerName = String(customer?.name || "").trim();
    const customerEmail = String(customer?.email || customer?.mail || "").trim();
    const customerPhone = String(
      customer?.phone || customer?.phoneNumber || customer?.mobile || ""
    ).trim();
    const detailParts = [
      customerName ? customerName : "",
      customerEmail ? customerEmail : "",
      customerPhone ? customerPhone : "",
    ].filter(Boolean);
    await appendStaffActivity(deletedBy || undefined, {
      type: "admin_action",
      action: "Customer deleted",
      detail:
        detailParts.length > 0
          ? detailParts.join(" | ").slice(0, 220)
          : String(storageKey || idParam).slice(0, 120),
    });

    return c.json({
      success: true,
      message: "Customer and associated auth account deleted successfully",
    });
  } catch (error: any) {
    console.error("❌ Error deleting customer:", error);
    return c.json({
      error: "Failed to delete customer",
      details: String(error),
    }, 500);
  }
});

// Bulk delete customers
customerApp.post("/customers/bulk-delete", async (c) => {
  const denied = assertDestructiveOperationAllowed(c);
  if (denied) return denied;
  try {
    const body = await c.req.json();
    const { customerIds } = body;
    
    if (!Array.isArray(customerIds) || customerIds.length === 0) {
      return c.json({ error: "Invalid customer IDs array" }, 400);
    }
    
    console.log(`🗑️ Bulk deleting ${customerIds.length} customers...`);

    const bulkImageRefs: unknown[] = [];
    const storageKeys = new Set<string>();
    const purgedUserIds = new Set<string>();

    for (const idParam of customerIds) {
      const resolved = await resolveCustomerForDelete(String(idParam));
      if (resolved) {
        const { customer, storageKey } = resolved;
        storageKeys.add(storageKey);
        const userId = String(customer.userId || "").trim();
        if (userId && !purgedUserIds.has(userId)) {
          purgedUserIds.add(userId);
          await purgeAuthAndUserKv(userId);
        }
        await removeFromAllVendorAudiences({
          userId: userId || String(idParam),
          email: customer.email,
          phone: customer.phone,
        });
        const img =
          typeof (customer as { profileImage?: string }).profileImage === "string"
            ? (customer as { profileImage: string }).profileImage.trim()
            : "";
        if (img) bulkImageRefs.push(img);
        continue;
      }

      const param = String(idParam || "").trim();
      if (/^[0-9a-f-]{36}$/i.test(param)) {
        if (!purgedUserIds.has(param)) {
          purgedUserIds.add(param);
          await purgeAuthAndUserKv(param);
        }
        await removeFromAllVendorAudiences({ userId: param });
      }
    }

    for (const key of storageKeys) {
      await withTimeout(kv.del(`customer:${key}`), 5000);
      queueCustomerReadModelDelete(key);
    }
    for (const idParam of customerIds) {
      await withTimeout(kv.del(`customer:${idParam}`), 5000).catch(() => undefined);
      queueCustomerReadModelDelete(String(idParam));
    }

    await deleteOwnedStorageRefs(supabase, bulkImageRefs);

    console.log(`✅ Bulk deleted ${customerIds.length} customers`);

    return c.json({
      success: true,
      deleted: customerIds.length,
      message: `${customerIds.length} customers deleted successfully`,
    });
  } catch (error: any) {
    console.error("❌ Error bulk deleting customers:", error);
    return c.json({ 
      error: "Failed to delete customers", 
      details: String(error) 
    }, 500);
  }
});

// 🔥 UPLOAD CUSTOMER PROFILE IMAGE
customerApp.post("/customers/upload-image", async (c) => {
  try {
    console.log("📤 Uploading customer profile image...");
    
    // Parse form data
    const formData = await c.req.formData();
    const imageFile = formData.get("image") as File;
    const customerName = formData.get("customerName") as string;
    
    if (!imageFile) {
      return c.json({ error: "No image file provided" }, 400);
    }
    
    // Check file size (should be under 500KB after compression, but double-check)
    const fileSizeKB = imageFile.size / 1024;
    console.log(`📦 Image size: ${fileSizeKB.toFixed(2)} KB`);
    
    if (fileSizeKB > 600) {
      return c.json({ 
        error: "Image file too large. Maximum size is 500KB",
        size: `${fileSizeKB.toFixed(2)} KB`
      }, 400);
    }
    
    // Generate unique filename
    const timestamp = Date.now();
    const randomStr = Math.random().toString(36).substring(2, 9);
    const fileExt = imageFile.name.split('.').pop() || 'jpg';
    const fileName = `customer_${timestamp}_${randomStr}.${fileExt}`;
    
    console.log(`📁 Uploading file: ${fileName}`);

    try {
      await ensureBucket(supabase, BUCKET_NAME, {
        public: false,
        fileSizeLimit: 524288,
      });
    } catch (bucketErr: any) {
      console.error("❌ Failed to ensure customer images bucket:", bucketErr);
      return c.json({ error: "Failed to prepare storage bucket" }, 500);
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
      console.error("�� Upload error:", uploadError);
      return c.json({ 
        error: "Failed to upload image", 
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
        error: "Failed to generate image URL", 
        details: urlError?.message 
      }, 500);
    }
    
    console.log(`✅ Image uploaded successfully: ${fileName}`);
    
    return c.json({
      success: true,
      imageUrl: urlData.signedUrl,
      fileName: fileName,
      size: `${fileSizeKB.toFixed(2)} KB`,
    });
  } catch (error: any) {
    console.error("❌ Error uploading image:", error);
    return c.json({ 
      error: "Failed to upload image", 
      details: String(error) 
    }, 500);
  }
});

// Get customer orders by customer ID
customerApp.get("/customers/:customerId/orders", async (c) => {
  try {
    const customerId = c.req.param("customerId");
    console.log(`📦 Fetching orders for customer: ${customerId}`);
    
    // Get customer details first
    const customer = await withTimeout(kv.get(`customer:${customerId}`), 5000);
    
    if (!customer) {
      return c.json({ error: "Customer not found" }, 404);
    }
    
    // Get all orders
    const allOrders = await withTimeout(kv.getByPrefix("order:"), 15000);
    
    // Filter orders for this customer (by email or customer name)
    const customerOrders = Array.isArray(allOrders) 
      ? allOrders.filter(order => 
          order && (
            order.email === customer.email || 
            order.customer === customer.name ||
            order.customerName === customer.name
          )
        )
      : [];
    
    console.log(`✅ Found ${customerOrders.length} orders for customer ${customer.name}`);
    
    // Sort by date (most recent first)
    customerOrders.sort((a, b) => {
      const dateA = new Date(a.date || a.createdAt || 0).getTime();
      const dateB = new Date(b.date || b.createdAt || 0).getTime();
      return dateB - dateA;
    });
    
    return c.json({
      success: true,
      orders: customerOrders,
      total: customerOrders.length,
    });
  } catch (error: any) {
    console.error("❌ Error fetching customer orders:", error);
    return c.json({ 
      error: "Failed to fetch customer orders", 
      details: String(error),
      orders: [],
      total: 0,
    }, 500);
  }
});

// Get customer activities (generated from orders and customer data)
customerApp.get("/customers/:customerId/activities", async (c) => {
  try {
    const customerId = c.req.param("customerId");
    console.log(`📊 Generating activities for customer: ${customerId}`);
    
    // Get customer details
    const customer = await withTimeout(kv.get(`customer:${customerId}`), 5000);
    
    if (!customer) {
      return c.json({ error: "Customer not found" }, 404);
    }
    
    // Get customer orders
    const allOrders = await withTimeout(kv.getByPrefix("order:"), 15000);
    const customerOrders = Array.isArray(allOrders) 
      ? allOrders.filter(order => 
          order && (
            order.email === customer.email || 
            order.customer === customer.name ||
            order.customerName === customer.name
          )
        )
      : [];
    
    // Generate activities from orders
    const activities: any[] = [];
    
    // Add join activity
    activities.push({
      id: `act-join-${customer.id}`,
      type: "join",
      title: "Joined Migoo",
      description: "Created account and completed profile",
      timestamp: customer.joinDate || customer.createdAt || new Date().toISOString(),
    });
    
    // Generate activities from orders
    customerOrders.forEach((order, index) => {
      const orderDate = order.date || order.createdAt || new Date().toISOString();
      const orderId = order.orderNumber || order.id;
      const itemCount = Array.isArray(order.items) ? order.items.length : 0;
      const firstItem = Array.isArray(order.items) && order.items.length > 0 ? order.items[0] : null;
      
      // Order placed activity
      activities.push({
        id: `act-order-${orderId}`,
        type: "order",
        title: "Placed an order",
        description: `Order #${orderId} - ${itemCount} item${itemCount !== 1 ? 's' : ''}`,
        timestamp: orderDate,
        metadata: {
          orderId: orderId,
          amount: order.total || 0,
          productName: firstItem?.name || firstItem?.title || "Multiple Items",
        },
      });
      
      // Payment activity (if paid or delivered)
      if (order.paymentStatus === "paid" || order.status === "delivered") {
        activities.push({
          id: `act-payment-${orderId}`,
          type: "payment",
          title: "Payment completed",
          description: `Order #${orderId}`,
          timestamp: orderDate,
          metadata: {
            orderId: orderId,
            amount: order.total || 0,
          },
        });
      }
      
      // Cancelled activity
      if (order.status === "cancelled") {
        activities.push({
          id: `act-cancel-${orderId}`,
          type: "cancel",
          title: "Cancelled order",
          description: `Order #${orderId}`,
          timestamp: orderDate,
          metadata: {
            orderId: orderId,
          },
        });
      }
    });
    
    // Sort by timestamp (most recent first)
    activities.sort((a, b) => {
      const dateA = new Date(a.timestamp || 0).getTime();
      const dateB = new Date(b.timestamp || 0).getTime();
      return dateB - dateA;
    });
    
    console.log(`✅ Generated ${activities.length} activities for customer ${customer.name}`);
    
    return c.json({
      success: true,
      activities: activities,
      total: activities.length,
    });
  } catch (error: any) {
    console.error("❌ Error generating customer activities:", error);
    return c.json({ 
      error: "Failed to generate customer activities", 
      details: String(error),
      activities: [],
      total: 0,
    }, 500);
  }
});

// Get customer saved products (wishlist)
customerApp.get("/customers/:customerId/saved-products", async (c) => {
  try {
    const customerId = c.req.param("customerId");
    console.log(`💝 Fetching saved products for customer: ${customerId}`);
    
    // Get customer details
    const customer = await withTimeout(kv.get(`customer:${customerId}`), 5000);
    
    if (!customer) {
      console.log(`⚠️ Customer not found: ${customerId}`);
      return c.json({ error: "Customer not found" }, 404);
    }
    
    console.log(`✅ Found customer: ${customer.name || customer.email}`);
    
    // Get saved products key for this customer
    const savedProducts = await withTimeout(
      kv.get(`customer:${customerId}:wishlist`), 
      5000
    );
    
    console.log(`🔍 [Wishlist Debug] customer:${customerId}:wishlist =`, savedProducts);
    console.log(`🔍 [Wishlist Debug] Type: ${typeof savedProducts}, IsArray: ${Array.isArray(savedProducts)}`);
    
    if (!savedProducts || !Array.isArray(savedProducts)) {
      console.log(`⚠️ No saved products found for customer ${customer.name || customer.email}`);
      return c.json({
        success: true,
        products: [],
        total: 0,
      });
    }
    
    console.log(`📝 Found ${savedProducts.length} product IDs in wishlist`);
    
    // Get full product details for each saved product
    const productDetailsPromises = savedProducts.map(async (productId) => {
      try {
        const product = await withTimeout(kv.get(`product:${productId}`), 5000);
        if (!product) {
          console.log(`⚠️ Product not found: ${productId}`);
          return null;
        }
        
        return {
          id: product.id,
          name: product.name,
          price: product.price,
          image: product.images?.[0] || "",
          category: product.category || "Uncategorized",
          savedAt: new Date().toISOString(), // You could store this separately
        };
      } catch (err) {
        console.warn(`⚠️ Could not fetch product ${productId}:`, err);
        return null;
      }
    });
    
    const products = (await Promise.all(productDetailsPromises)).filter(p => p !== null);
    
    console.log(`✅ Found ${products.length} saved products for customer ${customer.name || customer.email}`);
    
    return c.json({
      success: true,
      products: products,
      total: products.length,
    });
  } catch (error: any) {
    console.error("❌ Error fetching saved products:", error);
    return c.json({ 
      error: "Failed to fetch saved products", 
      details: String(error),
      products: [],
      total: 0,
    }, 500);
  }
});

// Get customer shipping addresses
customerApp.get("/customers/:customerId/addresses", async (c) => {
  try {
    const customerId = c.req.param("customerId");
    console.log(`📍 Fetching addresses for customer: ${customerId}`);
    
    // Get customer details - try as customerId first, then as userId
    let customer = await withTimeout(kv.get(`customer:${customerId}`), 5000);
    
    // 🔥 If not found by customerId, try to find by userId (for auth users)
    if (!customer) {
      console.log(`⚠️ Customer not found by customerId, trying userId lookup...`);
      
      // Get all customers and find by userId
      const allCustomers = await withTimeout(kv.getByPrefix("customer:"), 10000);
      customer = Array.isArray(allCustomers) 
        ? allCustomers.find((c: any) => c != null && c.userId === customerId)
        : null;
      
      if (customer) {
        console.log(`✅ Found customer by userId: ${customer.id} (${customer.name})`);
      }
    }
    
    if (!customer) {
      console.log(`❌ Customer not found: ${customerId}`);
      return c.json({ error: "Customer not found" }, 404);
    }
    
    // Use the actual customer ID for addresses lookup
    const actualCustomerId = customer.id;
    console.log(`📍 Looking up addresses for customer ID: ${actualCustomerId}`);
    
    // Get addresses for this customer
    const addresses = await withTimeout(
      kv.get(`customer:${actualCustomerId}:addresses`), 
      5000
    );
    
    if (!addresses || !Array.isArray(addresses)) {
      console.log(`⚠️ No addresses found for customer ${customer.name}`);
      return c.json({
        success: true,
        addresses: [],
        total: 0,
      });
    }
    
    console.log(`✅ Found ${addresses.length} addresses for customer ${customer.name}`);
    
    return c.json({
      success: true,
      addresses: addresses,
      total: addresses.length,
    });
  } catch (error: any) {
    console.error("❌ Error fetching addresses:", error);
    return c.json({ 
      error: "Failed to fetch addresses", 
      details: String(error),
      addresses: [],
      total: 0,
    }, 500);
  }
});

// Save customer shipping addresses
customerApp.post("/customers/:customerId/addresses", async (c) => {
  try {
    const customerId = c.req.param("customerId");
    const body = await c.req.json();
    const { addresses } = body;
    
    console.log(`📍 Saving addresses for customer: ${customerId}`);
    
    // Get customer details - try as customerId first, then as userId
    let customer = await withTimeout(kv.get(`customer:${customerId}`), 5000);
    
    // 🔥 If not found by customerId, try to find by userId (for auth users)
    if (!customer) {
      console.log(`⚠️ Customer not found by customerId, trying userId lookup...`);
      
      // Get all customers and find by userId
      const allCustomers = await withTimeout(kv.getByPrefix("customer:"), 10000);
      customer = Array.isArray(allCustomers) 
        ? allCustomers.find((c: any) => c != null && c.userId === customerId)
        : null;
      
      if (customer) {
        console.log(`✅ Found customer by userId: ${customer.id} (${customer.name})`);
      }
    }
    
    if (!customer) {
      console.log(`❌ Customer not found: ${customerId}`);
      return c.json({ error: "Customer not found" }, 404);
    }
    
    if (!Array.isArray(addresses)) {
      return c.json({ error: "Addresses must be an array" }, 400);
    }
    
    // Use the actual customer ID for addresses storage
    const actualCustomerId = customer.id;
    console.log(`📍 Saving addresses for customer ID: ${actualCustomerId}`);
    
    // Save addresses to database
    await withTimeout(
      kv.set(`customer:${actualCustomerId}:addresses`, addresses), 
      5000
    );
    
    console.log(`✅ Saved ${addresses.length} addresses for customer ${customer.name}`);
    
    return c.json({
      success: true,
      addresses: addresses,
      total: addresses.length,
      message: "Addresses saved successfully",
    });
  } catch (error: any) {
    console.error("❌ Error saving addresses:", error);
    return c.json({ 
      error: "Failed to save addresses", 
      details: String(error)
    }, 500);
  }
});

// 🔥 DEDUPLICATE CUSTOMERS - Merge duplicate emails and keep the most complete record
customerApp.post("/customers/deduplicate", async (c) => {
  try {
    console.log("🧹 Starting customer deduplication process...");
    
    // Get all customers
    const allCustomers = await withTimeout(kv.getByPrefix("customer:"), 15000);
    const validCustomers = (Array.isArray(allCustomers) ? allCustomers : [])
      .filter(c => c != null && typeof c === 'object' && !Array.isArray(c) && c.id && c.email);
    
    console.log(`📊 Found ${validCustomers.length} valid customers to analyze`);
    
    // Group customers by email (case-insensitive)
    const customersByEmail = new Map<string, any[]>();
    
    validCustomers.forEach(customer => {
      const emailKey = customer.email.toLowerCase();
      if (!customersByEmail.has(emailKey)) {
        customersByEmail.set(emailKey, []);
      }
      customersByEmail.get(emailKey)!.push(customer);
    });
    
    // Find duplicates (emails with more than 1 customer)
    const duplicates: Array<{ email: string; customers: any[] }> = [];
    
    customersByEmail.forEach((customers, email) => {
      if (customers.length > 1) {
        duplicates.push({ email, customers });
      }
    });
    
    console.log(`🔍 Found ${duplicates.length} duplicate email(s)`);
    
    if (duplicates.length === 0) {
      return c.json({
        success: true,
        message: "No duplicates found",
        duplicatesRemoved: 0,
        duplicateEmails: [],
      });
    }
    
    let mergedCount = 0;
    let deletedCount = 0;
    const mergedEmails: string[] = [];
    
    // Process each duplicate group
    for (const { email, customers } of duplicates) {
      console.log(`\n🔄 Processing ${customers.length} duplicates for ${email}`);
      
      // Sort by most complete record:
      // 1. Highest totalOrders
      // 2. Highest totalSpent
      // 3. Most recent createdAt
      const sorted = customers.sort((a, b) => {
        const ordersA = a.totalOrders || 0;
        const ordersB = b.totalOrders || 0;
        if (ordersA !== ordersB) return ordersB - ordersA;
        
        const spentA = a.totalSpent || 0;
        const spentB = b.totalSpent || 0;
        if (spentA !== spentB) return spentB - spentA;
        
        const dateA = new Date(a.createdAt || 0).getTime();
        const dateB = new Date(b.createdAt || 0).getTime();
        return dateA - dateB; // Oldest first
      });
      
      // Keep the most complete record (first after sorting)
      const keepCustomer = sorted[0];
      const deleteCustomers = sorted.slice(1);
      
      console.log(`✅ Keeping customer ${keepCustomer.id} (orders: ${keepCustomer.totalOrders || 0}, spent: ${keepCustomer.totalSpent || 0})`);
      
      // Merge data from other customers into the kept one
      let updated = false;
      for (const dupCustomer of deleteCustomers) {
        // Merge any missing fields from duplicates
        if (!keepCustomer.phone && dupCustomer.phone) {
          keepCustomer.phone = dupCustomer.phone;
          updated = true;
        }
        if (!keepCustomer.location && dupCustomer.location) {
          keepCustomer.location = dupCustomer.location;
          updated = true;
        }
        if (!keepCustomer.address && dupCustomer.address) {
          keepCustomer.address = dupCustomer.address;
          updated = true;
        }
        // Prefer non-default avatar
        if (dupCustomer.avatar && !dupCustomer.avatar.includes('dicebear.com')) {
          if (keepCustomer.avatar && keepCustomer.avatar.includes('dicebear.com')) {
            keepCustomer.avatar = dupCustomer.avatar;
            updated = true;
          }
        }
      }
      
      // Update the kept customer if any merge happened
      if (updated) {
        keepCustomer.updatedAt = new Date().toISOString();
        await withTimeout(kv.set(`customer:${keepCustomer.id}`, keepCustomer), 5000);
        queueCustomerReadModelSync(String(keepCustomer.id), keepCustomer);
        console.log(`🔄 Updated kept customer with merged data`);
      }
      
      // Delete duplicate customers
      for (const dupCustomer of deleteCustomers) {
        console.log(`🗑️ Deleting duplicate customer ${dupCustomer.id}`);
        await withTimeout(kv.del(`customer:${dupCustomer.id}`), 5000);
        queueCustomerReadModelDelete(String(dupCustomer.id));
        deletedCount++;
      }
      
      mergedCount++;
      mergedEmails.push(email);
    }
    
    console.log(`\n✅ Deduplication complete!`);
    console.log(`   - ${mergedCount} email(s) deduplicated`);
    console.log(`   - ${deletedCount} duplicate record(s) removed`);
    
    return c.json({
      success: true,
      message: `Successfully deduplicated ${mergedCount} email(s)`,
      duplicatesRemoved: deletedCount,
      duplicateEmails: mergedEmails,
    });
  } catch (error: any) {
    console.error("❌ Error deduplicating customers:", error);
    return c.json({ 
      error: "Failed to deduplicate customers", 
      details: String(error) 
    }, 500);
  }
});

// 🔥 CLEANUP CORRUPTED CUSTOMER DATA - Remove string values from customer: keys
customerApp.post("/customers/cleanup-corrupted", async (c) => {
  try {
    console.log("🧹 Starting corrupted customer data cleanup...");
    
    // Get all keys with customer: prefix
    const allData = await withTimeout(kv.getByPrefix("customer:"), 15000);
    
    if (!Array.isArray(allData)) {
      return c.json({
        success: false,
        error: "No data found",
      });
    }
    
    console.log(`📊 Analyzing ${allData.length} customer: entries...`);
    
    // Find corrupted entries (strings instead of objects)
    const corruptedEntries: string[] = [];
    allData.forEach((entry, index) => {
      // If entry is a string (like "prod_xxxx"), it's corrupted
      if (typeof entry === 'string') {
        corruptedEntries.push(entry);
        console.warn(`🚫 Found corrupted entry at index ${index}: "${entry}"`);
      }
      // If entry is not an object or doesn't have customer structure
      else if (entry == null || typeof entry !== 'object' || Array.isArray(entry) || !entry.id) {
        console.warn(`🚫 Found invalid entry at index ${index}:`, entry);
      }
    });
    
    console.log(`❌ Found ${corruptedEntries.length} corrupted string entries`);
    
    if (corruptedEntries.length === 0) {
      return c.json({
        success: true,
        message: "No corrupted data found",
        cleanedCount: 0,
      });
    }
    
    // We can't delete these without knowing their keys
    // The issue is that getByPrefix returns values, not keys
    // So we need to query the database directly
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL"),
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")
    );
    
    // Get all keys that start with "customer:" and have string values
    const { data: allKeys, error: keysError } = await supabase
      .from("kv_store_16010b6f")
      .select("key, value")
      .like("key", "customer:%");
    
    if (keysError) {
      throw new Error(`Failed to fetch keys: ${keysError.message}`);
    }
    
    console.log(`🔍 Found ${allKeys?.length || 0} total customer: keys in database`);
    
    // Find keys with corrupted values (strings)
    const keysToDelete: string[] = [];
    allKeys?.forEach((row) => {
      const value = row.value;
      // If value is a string or not a valid customer object
      if (
        typeof value === 'string' || 
        value == null || 
        typeof value !== 'object' || 
        Array.isArray(value) || 
        !value.id || 
        !value.name
      ) {
        keysToDelete.push(row.key);
        console.warn(`🗑️ Marking for deletion: ${row.key} (value: ${JSON.stringify(value).substring(0, 100)})`);
      }
    });
    
    console.log(`🗑️ Deleting ${keysToDelete.length} corrupted entries...`);
    
    // Delete corrupted entries
    if (keysToDelete.length > 0) {
      await kv.mdel(keysToDelete);
    }
    
    console.log(`✅ Cleanup complete!`);
    
    return c.json({
      success: true,
      message: `Successfully cleaned ${keysToDelete.length} corrupted entries`,
      cleanedCount: keysToDelete.length,
      deletedKeys: keysToDelete,
    });
  } catch (error: any) {
    console.error("❌ Error during cleanup:", error);
    return c.json({
      success: false,
      error: error.message || "Failed to cleanup corrupted data",
    }, 500);
  }
});

// ============================================
// 🔥 PERSISTENT CART & WISHLIST ENDPOINTS
// ============================================

// Get customer cart
customerApp.get("/customers/:customerId/cart", async (c) => {
  try {
    const customerId = c.req.param("customerId");
    console.log(`🛒 Fetching cart for customer: ${customerId}`);
    
    // Get customer details - try as customerId first, then as userId
    let customer = await withTimeout(kv.get(`customer:${customerId}`), 5000);
    
    // 🔥 OPTIMIZED: If not found by customerId, try to find by userId using direct DB query
    if (!customer) {
      console.log(`⚠️ Customer not found by customerId, trying optimized userId lookup...`);
      customer = await findCustomerByUserId(customerId);
      
      if (customer) {
        console.log(`✅ Found customer by userId: ${customer.id} (${customer.name || customer.email})`);
      }
    }
    
    if (!customer) {
      // Compatibility: accounts can exist without a linked `customer:*` profile row.
      // Persist/read cart by auth user id key so cross-device cart still works.
      const fallbackCart = await kv.get(`customer:${customerId}:cart`);
      const safeFallback = Array.isArray(fallbackCart) ? fallbackCart : [];
      if (safeFallback.length > 0) {
        console.log(
          `✅ Loaded ${safeFallback.length} fallback cart item(s) for user key ${customerId}`
        );
      } else {
        console.log(`⚠️ Customer profile not found; no fallback cart for ${customerId}`);
      }
      return c.json({
        success: true,
        cart: safeFallback,
        total: safeFallback.length,
      });
    }
    
    // Use canonical customer id; also support user-id compat key for realtime sync consumers.
    const actualCustomerId = String(customer.id || customerId);
    console.log(`🛒 Looking up cart for customer ID: ${actualCustomerId}`);
    
    const [primaryCart, compatCart] = await Promise.all([
      kv.get(`customer:${actualCustomerId}:cart`),
      actualCustomerId !== customerId ? kv.get(`customer:${customerId}:cart`) : Promise.resolve(null),
    ]);
    const cart = Array.isArray(primaryCart)
      ? primaryCart
      : Array.isArray(compatCart)
        ? compatCart
        : [];
    
    if (!Array.isArray(cart)) {
      console.log(`⚠️ No cart found for customer ${customer.name || customer.email}`);
      return c.json({
        success: true,
        cart: [],
        total: 0,
      });
    }
    
    console.log(`✅ Found ${cart.length} items in cart for customer ${customer.name || customer.email}`);
    
    return c.json({
      success: true,
      cart: cart,
      total: cart.length,
    });
  } catch (error: any) {
    console.error("❌ Error fetching cart:", error);
    return c.json({ 
      error: "Failed to fetch cart", 
      details: String(error),
      cart: [],
      total: 0,
    }, 500);
  }
});

// Save customer cart
customerApp.post("/customers/:customerId/cart", async (c) => {
  try {
    const customerId = c.req.param("customerId");
    const body = await c.req.json();
    const { cart } = body;
    
    console.log(`🛒 Saving cart for customer: ${customerId}`);
    
    // Get customer details - try as customerId first, then as userId
    // kv.get already has 15s timeout
    let customer = await kv.get(`customer:${customerId}`);
    
    // 🔥 OPTIMIZED: If not found by customerId, try to find by userId using direct DB query
    if (!customer) {
      console.log(`⚠️ Customer not found by customerId, trying optimized userId lookup...`);
      customer = await findCustomerByUserId(customerId);
      
      if (customer) {
        console.log(`✅ Found customer by userId: ${customer.id} (${customer.name || customer.email})`);
      }
    }
    
    if (!Array.isArray(cart)) {
      return c.json({ error: "Cart must be an array" }, 400);
    }

    if (!customer) {
      // Compatibility: no customer profile row yet; keep cart by auth user id key.
      await kv.set(`customer:${customerId}:cart`, cart);
      console.log(
        `✅ Saved ${cart.length} cart item(s) to fallback user key customer:${customerId}:cart`
      );
      return c.json({
        success: true,
        cart,
        total: cart.length,
        message: "Cart saved successfully",
      });
    }
    
    // Canonical storage key + compat user-id key for realtime subscribers.
    const actualCustomerId = String(customer.id || customerId);
    console.log(`🛒 Saving cart for customer ID: ${actualCustomerId}`);
    
    await Promise.all([
      kv.set(`customer:${actualCustomerId}:cart`, cart),
      actualCustomerId !== customerId
        ? kv.set(`customer:${customerId}:cart`, cart)
        : Promise.resolve(),
    ]);
    
    console.log(`✅ Saved ${cart.length} items in cart for customer ${customer.name || customer.email}`);
    
    return c.json({
      success: true,
      cart: cart,
      total: cart.length,
      message: "Cart saved successfully",
    });
  } catch (error: any) {
    console.error("❌ Error saving cart:", error);
    return c.json({ 
      error: "Failed to save cart", 
      details: String(error)
    }, 500);
  }
});

// Save customer wishlist (add/remove items)
customerApp.post("/customers/:customerId/wishlist", async (c) => {
  try {
    const customerId = c.req.param("customerId");
    const body = await c.req.json();
    const { wishlist } = body;
    
    console.log(`💝 Saving wishlist for customer: ${customerId}`);
    
    // Get customer details
    const customer = await withTimeout(kv.get(`customer:${customerId}`), 5000);
    
    if (!customer) {
      return c.json({ error: "Customer not found" }, 404);
    }
    
    if (!Array.isArray(wishlist)) {
      return c.json({ error: "Wishlist must be an array" }, 400);
    }
    
    // Save wishlist to database
    await withTimeout(
      kv.set(`customer:${customerId}:wishlist`, wishlist), 
      5000
    );
    
    console.log(`✅ Saved ${wishlist.length} items in wishlist for customer ${customer.name || customer.email}`);
    
    return c.json({
      success: true,
      wishlist: wishlist,
      total: wishlist.length,
      message: "Wishlist saved successfully",
    });
  } catch (error: any) {
    console.error("❌ Error saving wishlist:", error);
    return c.json({ 
      error: "Failed to save wishlist", 
      details: String(error)
    }, 500);
  }
});

export default customerApp;