import { Hono } from "npm:hono@4";
import { createClient } from "jsr:@supabase/supabase-js@2.49.8";
import * as kv from "./kv_store.tsx";
import { ensureBucket } from "./storage_bucket_helpers.tsx";
import { deleteOwnedStorageRefs } from "./storage_delete_helpers.tsx";
import {
  appendStaffActivity,
  clearAllStaffActivities,
  getGlobalStaffActivityFeed,
  isValidStaffActorId,
} from "./staff_activity_helpers.tsx";
import { queueCustomerReadModelSync } from "./read_model.ts";

const authApp = new Hono();

// Helper function to wrap operations with timeout
async function withTimeout<T>(promise: Promise<T>, timeoutMs = 60000): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error(`Operation timed out after ${timeoutMs}ms`)), timeoutMs)
    )
  ]);
}

const supabaseAdmin = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  }
);

// 🔥 SEPARATE CLIENT FOR CUSTOMER AUTH (uses anon key for signInWithPassword)
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

// Storage bucket for profile images (lazy `ensureBucket` on upload — no listBuckets on every cold start)
const PROFILE_IMAGES_BUCKET = "make-16010b6f-profile-images";

const MYANMAR_PHONE_RE = /^(\+959|09)\d{9}$/;
const PHONE_AUTH_EMAIL_DOMAIN = "phone.migoo.store";

function normalizeMyanmarPhone(raw: string): string | null {
  const normalized = String(raw || "").replace(/[\s\-]/g, "");
  if (!MYANMAR_PHONE_RE.test(normalized)) return null;
  if (normalized.startsWith("09")) return `+959${normalized.slice(1)}`;
  return normalized;
}

function phoneToAuthEmail(normalizedPhone: string): string {
  const digits = normalizedPhone.replace(/\D/g, "");
  return `${digits}@${PHONE_AUTH_EMAIL_DOMAIN}`;
}

function isSyntheticAuthEmail(email: string): boolean {
  return String(email || "").toLowerCase().endsWith(`@${PHONE_AUTH_EMAIL_DOMAIN}`);
}

function rowToCustomer(row: any): any | null {
  if (!row) return null;
  const raw = row.raw && typeof row.raw === "object" ? row.raw : {};
  return {
    ...raw,
    id: row.id || raw.id,
    userId: row.user_id || raw.userId,
    email: row.email || raw.email,
    phone: row.phone || raw.phone,
    name: row.name || raw.name,
  };
}

async function findCustomerByUserIdFromReadModel(userId: string): Promise<any | null> {
  const uid = String(userId || "").trim();
  if (!uid) return null;
  try {
    const { data, error } = await supabaseAdmin
      .from("app_customers")
      .select("id,user_id,name,email,phone,raw")
      .eq("user_id", uid)
      .limit(1);
    if (error) {
      console.warn("[auth] customer userId read-model lookup unavailable:", error.message);
      return null;
    }
    return rowToCustomer(Array.isArray(data) ? data[0] : null);
  } catch (error) {
    console.warn("[auth] customer userId read-model lookup failed:", error);
    return null;
  }
}

function pickNonEmpty(...values: unknown[]): string {
  for (const value of values) {
    const trimmed = String(value ?? "").trim();
    if (trimmed) return trimmed;
  }
  return "";
}

/** KV is authoritative for storefront customers; read-model can lag or omit phone/email. */
async function findStorefrontCustomerByUserId(userId: string): Promise<any | null> {
  const uid = String(userId || "").trim();
  if (!uid) return null;

  const allCustomers = await withTimeout(kv.getByPrefix("customer:"), 30000);
  const fromKv = Array.isArray(allCustomers)
    ? allCustomers.find((c: any) => c != null && c.userId === uid)
    : null;

  const fromReadModel = await findCustomerByUserIdFromReadModel(uid);
  if (!fromKv && !fromReadModel) return null;
  if (!fromKv) return fromReadModel;
  if (!fromReadModel) return fromKv;

  return {
    ...fromReadModel,
    ...fromKv,
    id: fromKv.id || fromReadModel.id,
    userId: uid,
    name: pickNonEmpty(fromKv.name, fromReadModel.name),
    email: pickNonEmpty(fromKv.email, fromReadModel.email),
    phone: pickNonEmpty(fromKv.phone, fromReadModel.phone),
  };
}

async function getSupabaseAuthEmail(userId: string): Promise<string> {
  try {
    const { data, error } = await supabaseAdmin.auth.admin.getUserById(userId);
    if (error || !data?.user?.email) return "";
    return String(data.user.email).trim().toLowerCase();
  } catch {
    return "";
  }
}

function buildStorefrontUserResponse(customer: any, userId: string, authEmail?: string) {
  const displayEmail = isSyntheticAuthEmail(String(customer?.email || "")) ? "" : String(customer?.email || "").trim();
  const normalizedPhone = normalizeMyanmarPhone(String(customer?.phone || ""));
  const phoneAuth = normalizedPhone ? phoneToAuthEmail(normalizedPhone) : "";
  const resolvedAuthEmail = pickNonEmpty(
    authEmail,
    displayEmail && !isSyntheticAuthEmail(displayEmail) ? displayEmail : "",
    phoneAuth
  );

  return {
    ...customer,
    email: displayEmail,
    id: userId,
    customerId: customer.id,
    ...(resolvedAuthEmail ? { authEmail: resolvedAuthEmail } : {}),
  };
}

async function enrichCustomerFromAuthUser(customer: any, authUser: { user_metadata?: Record<string, unknown>; email?: string | null }): Promise<any> {
  if (!customer || typeof customer !== "object") return customer;

  const metaPhone = normalizeMyanmarPhone(String(authUser.user_metadata?.phone || ""));
  const metaName = String(authUser.user_metadata?.name || "").trim();
  let changed = false;

  if (metaPhone && !pickNonEmpty(customer.phone)) {
    customer.phone = metaPhone;
    changed = true;
  }
  if (metaName && !pickNonEmpty(customer.name)) {
    customer.name = metaName;
    changed = true;
  }

  const authEmail = String(authUser.email || "").trim().toLowerCase();
  if (authEmail && !pickNonEmpty(customer.email) && !isSyntheticAuthEmail(authEmail)) {
    customer.email = authEmail;
    changed = true;
  }

  if (changed && customer.id) {
    customer.updatedAt = new Date().toISOString();
    await withTimeout(kv.set(`customer:${customer.id}`, customer), 5000);
    queueCustomerReadModelSync(String(customer.id), customer);
  }

  return customer;
}

async function findCustomerByEmailFromReadModel(email: string): Promise<any | null> {
  const em = String(email || "").trim();
  if (!em) return null;
  try {
    const { data, error } = await supabaseAdmin
      .from("app_customers")
      .select("id,user_id,name,email,phone,raw")
      .ilike("email", em)
      .limit(1);
    if (error) {
      console.warn("[auth] customer email read-model lookup unavailable:", error.message);
      return null;
    }
    return rowToCustomer(Array.isArray(data) ? data[0] : null);
  } catch (error) {
    console.warn("[auth] customer email read-model lookup failed:", error);
    return null;
  }
}

async function findCustomerByPhone(normalizedPhone: string): Promise<any | null> {
  try {
    const phone09 = normalizedPhone.startsWith("+959") ? `09${normalizedPhone.slice(4)}` : normalizedPhone;
    const { data, error } = await supabaseAdmin
      .from("app_customers")
      .select("id,user_id,name,email,phone,raw")
      .in("phone", [normalizedPhone, phone09])
      .limit(1);
    if (!error) {
      const customer = rowToCustomer(Array.isArray(data) ? data[0] : null);
      if (customer) return customer;
    } else {
      console.warn("[auth] customer phone read-model lookup unavailable:", error.message);
    }
  } catch (error) {
    console.warn("[auth] customer phone read-model lookup failed:", error);
  }

  const allCustomers = await withTimeout(kv.getByPrefix("customer:"), 30000);
  if (!Array.isArray(allCustomers)) return null;
  return (
    allCustomers.find((c: any) => {
      if (!c?.phone) return false;
      return normalizeMyanmarPhone(c.phone) === normalizedPhone;
    }) ?? null
  );
}

async function resolveCustomerLoginEmail(
  identifier: string
): Promise<{ email: string; error?: string }> {
  const trimmed = String(identifier || "").trim();
  if (!trimmed) {
    return { email: "", error: "Email or phone number is required" };
  }
  const asPhone = normalizeMyanmarPhone(trimmed);
  if (asPhone) {
    const customer = await findCustomerByPhone(asPhone);
    if (customer?.email?.trim()) {
      return { email: customer.email.trim() };
    }
    return { email: phoneToAuthEmail(asPhone) };
  }
  return { email: trimmed };
}

// Helper function to upload profile image to Supabase Storage
async function uploadProfileImage(userId: string, imageDataUrl: string): Promise<string | null> {
  try {
    await ensureBucket(supabaseAdmin, PROFILE_IMAGES_BUCKET, {
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
    const { data, error } = await supabaseAdmin.storage
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
    const { data, error } = await supabaseAdmin.storage
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

/** Only these may be stored on new/updated staff (setup still creates `super-admin`). */
const CANONICAL_STAFF_ROLES = new Set([
  "store-owner",
  "administrator",
  "data-entry",
  "warehouse",
]);

const OWNER_ROLES = new Set(["super-admin", "store-owner"]);
const ADMIN_TIER_ROLES = new Set([
  "administrator",
  "platform-admin",
  "product-manager",
  "developer",
]);

function canAssignStaffRoleBackend(creatorRole: string, targetRole: string): boolean {
  const t = String(targetRole || "").trim();
  if (!CANONICAL_STAFF_ROLES.has(t)) return false;
  const c = String(creatorRole || "").trim();
  if (OWNER_ROLES.has(c)) return true;
  if (ADMIN_TIER_ROLES.has(c)) return t === "warehouse" || t === "data-entry";
  if (c === "vendor-admin") return true;
  return false;
}

/** Same email twice in auth:users-list (legacy sync / duplicate IDs) → one row for Settings UI. */
function profileRolePriority(role: string): number {
  const r = String(role || "").trim();
  if (OWNER_ROLES.has(r)) return 100;
  if (ADMIN_TIER_ROLES.has(r)) return 50;
  return 10;
}

function formatAuditRoleLabel(role: unknown): string {
  const raw = String(role || "").trim();
  if (!raw) return "Unknown";
  return raw
    .split("-")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function formatAuditStatusLabel(status: unknown): string {
  const raw = String(status || "").trim().toLowerCase();
  if (!raw) return "Unknown";
  return raw.charAt(0).toUpperCase() + raw.slice(1);
}

function formatUserAuditDetail(opts: {
  name?: unknown;
  email?: unknown;
  role?: unknown;
}): string {
  const parts = [
    String(opts.name || "").trim(),
    String(opts.email || "").trim(),
    opts.role ? formatAuditRoleLabel(opts.role) : "",
  ].filter(Boolean);
  return parts.join(" | ").slice(0, 220);
}

function dedupeAuthProfilesByEmail(profiles: any[]): any[] {
  const byEmail = new Map<string, any[]>();
  const noEmail: any[] = [];
  for (const p of profiles) {
    if (!p || typeof p !== "object") continue;
    const em = String(p.email || "").trim().toLowerCase();
    if (!em) {
      noEmail.push(p);
      continue;
    }
    const g = byEmail.get(em) || [];
    g.push(p);
    byEmail.set(em, g);
  }
  const out: any[] = [...noEmail];
  for (const [em, group] of byEmail) {
    if (group.length === 1) {
      out.push(group[0]);
      continue;
    }
    console.warn(
      `⚠️ Deduped ${group.length} staff profiles for email ${em} — kept one canonical row (merge auth:users-list in KV if needed)`
    );
    group.sort((a, b) => {
      const pr = profileRolePriority(b.role) - profileRolePriority(a.role);
      if (pr !== 0) return pr;
      const ta = new Date(a.createdAt || 0).getTime();
      const tb = new Date(b.createdAt || 0).getTime();
      if (tb !== ta) return tb - ta;
      return String(a.id || "").localeCompare(String(b.id || ""));
    });
    out.push(group[0]);
  }
  return out;
}

/** All Supabase Auth user ids (source of truth for who can log in / reset password). */
async function listSupabaseAuthUserIds(): Promise<Set<string>> {
  const ids = new Set<string>();
  let page = 1;
  const perPage = 200;
  while (true) {
    const { data, error } = await withTimeout(
      supabaseAdmin.auth.admin.listUsers({ page, perPage }),
      30000
    );
    if (error) throw error;
    for (const u of data.users) {
      if (u.id) ids.add(u.id);
    }
    if (data.users.length < perPage) break;
    page += 1;
  }
  return ids;
}

/** Drop KV staff rows whose id no longer exists in Supabase Auth. */
async function pruneOrphanedStaffProfiles(validAuthIds: Set<string>): Promise<number> {
  const raw = await kv.get("auth:users-list");
  const userIds = Array.isArray(raw) ? raw.map((id) => String(id)) : [];
  if (userIds.length === 0) return 0;

  const orphans = userIds.filter((id) => !validAuthIds.has(id));
  if (orphans.length === 0) return 0;

  const nextList = userIds.filter((id) => validAuthIds.has(id));
  await kv.set("auth:users-list", nextList);
  for (const id of orphans) {
    await kv.del(`auth:user:${id}`).catch(() => undefined);
  }
  console.warn(
    `🧹 Pruned ${orphans.length} orphaned staff profile(s) from KV (missing in Supabase Auth): ${orphans.join(", ")}`
  );
  return orphans.length;
}

// Generate random password
function generatePassword(): string {
  const length = 12;
  const charset = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%";
  let password = "";
  for (let i = 0; i < length; i++) {
    password += charset.charAt(Math.floor(Math.random() * charset.length));
  }
  return password;
}

// ============================================
// CHECK IF SETUP IS NEEDED
// ============================================
authApp.get("/check-setup", async (c) => {
  try {
    const setupComplete = await kv.get("auth:super-admin-created");
    return c.json({ setupComplete: !!setupComplete });
  } catch (error: any) {
    console.error("Check setup error:", error);
    return c.json({ error: error.message }, 500);
  }
});

// ============================================
// EMAIL DELIVERY HEALTH (Resend config quick check)
// ============================================
authApp.get("/email-health", async (c) => {
  try {
    const resendApiKey = String(Deno.env.get("RESEND_API_KEY") || "").trim();
    const resendFromEmail = String(Deno.env.get("RESEND_FROM_EMAIL") || "").trim();
    const resendFromName = String(Deno.env.get("RESEND_FROM_NAME") || "Migoo Marketplace").trim();
    const allowDebugOtp = String(Deno.env.get("ALLOW_DEBUG_OTP") || "").toLowerCase() === "true";

    const issues: string[] = [];
    if (!resendApiKey) issues.push("Missing RESEND_API_KEY");
    if (!resendFromEmail) issues.push("Missing RESEND_FROM_EMAIL");

    return c.json({
      ok: issues.length === 0,
      provider: "resend",
      debugOtpEnabled: allowDebugOtp,
      fromEmailConfigured: !!resendFromEmail,
      fromName: resendFromName,
      issues,
    }, issues.length === 0 ? 200 : 503);
  } catch (error: any) {
    console.error("Email health check error:", error);
    return c.json({ ok: false, error: error.message || "Email health check failed" }, 500);
  }
});

// ============================================
// SETUP: Create super admin (one-time only)
// ============================================
authApp.post("/setup", async (c) => {
  try {
    const { name, email, password, phone } = await c.req.json();

    // Check if super admin already exists
    const existing = await kv.get("auth:super-admin-created");
    if (existing) {
      return c.json({ error: "Super admin already exists" }, 400);
    }

    // Create user in Supabase Auth
    const { data, error } = await supabaseAdmin.auth.admin.createUser({
      email,
      password,
      email_confirm: true, // Auto-confirm since email server not configured
      user_metadata: {
        name,
        phone: phone || "",
        role: "store-owner",
      },
    });

    if (error || !data.user) {
      console.error("Error creating super admin:", error);
      return c.json({ error: error?.message || "Failed to create user" }, 500);
    }

    // Store user profile in KV
    await kv.set(`auth:user:${data.user.id}`, {
      id: data.user.id,
      email,
      name,
      phone: phone || "",
      role: "store-owner",
      tempPassword: false,
      createdAt: new Date().toISOString(),
    });

    // Add super admin to users list
    const usersList = (await kv.get("auth:users-list")) || [];
    usersList.push(data.user.id);
    await kv.set("auth:users-list", usersList);

    // Mark super admin as created
    await kv.set("auth:super-admin-created", true);

    console.log(`✅ Super admin created: ${email}`);

    return c.json({ success: true, userId: data.user.id });
  } catch (error: any) {
    console.error("Setup error:", error);
    return c.json({ error: error.message || "Setup failed" }, 500);
  }
});

// ============================================
// GET USER PROFILE
// ============================================
authApp.get("/profile/:userId", async (c) => {
  try {
    let userId = c.req.param("userId");
    console.log(`📡 API Request: GET /auth/profile/${userId}`);
    
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

    const profile = await kv.get(`auth:user:${userId}`);

    if (profile && typeof profile === "object") {
      const { password: _, ...rest } = profile as Record<string, unknown> & {
        password?: string;
        profileImage?: string;
      };
      const out = { ...rest } as Record<string, unknown>;
      if (typeof out.profileImage === "string" && out.profileImage.trim()) {
        const signedUrl = await getSignedImageUrl(out.profileImage.trim());
        if (signedUrl) out.profileImageUrl = signedUrl;
      }
      try {
        const { data: au, error: authErr } = await supabaseAdmin.auth.admin.getUserById(userId);
        if (!authErr && au?.user) {
          const u = au.user;
          if (u.last_sign_in_at) out.lastSignInAt = u.last_sign_in_at;
          if (u.created_at) out.authCreatedAt = u.created_at;
        }
      } catch (e) {
        console.warn("⚠️ Profile: could not enrich from Supabase Auth:", e);
      }
      console.log(`✅ API Success: auth:user profile for ${userId}`);
      return c.json({ user: out });
    }

    // Storefront customers (Supabase) live in customer:* — same as login payload, not auth:user.
    // If auth account no longer exists, force 404 so storefront session is invalidated client-side.
    let authUserEmail = "";
    try {
      const { data: authData, error: authErr } = await supabaseAdmin.auth.admin.getUserById(userId);
      if (authErr || !authData?.user) {
        console.log(`❌ API Error (/auth/profile/${userId}): Auth account missing`);
        return c.json({ error: "User not found" }, 404);
      }
      authUserEmail = String(authData.user.email || "").trim().toLowerCase();
    } catch {
      return c.json({ error: "User not found" }, 404);
    }

    let customer = await findStorefrontCustomerByUserId(userId);

    if (customer && typeof customer === "object") {
      const authEmail = authUserEmail || (await getSupabaseAuthEmail(userId));
      customer = await enrichCustomerFromAuthUser(customer, { email: authEmail });
      const { password: __, ...customerRest } = customer as Record<string, unknown> & {
        password?: string;
      };
      const cust = customer as {
        id?: string;
        profileImage?: string;
        avatar?: string;
      };
      const userPayload: Record<string, unknown> = buildStorefrontUserResponse(
        { ...customerRest, customerId: cust.id },
        userId,
        authEmail
      );
      if (typeof cust.profileImage === "string" && cust.profileImage.trim()) {
        const su = await getSignedImageUrl(cust.profileImage.trim());
        if (su) userPayload.profileImageUrl = su;
      } else if (typeof cust.avatar === "string" && cust.avatar.trim()) {
        userPayload.profileImageUrl = cust.avatar.trim();
      }
      console.log(`✅ API Success: customer profile for userId ${userId}`);
      return c.json({ user: userPayload });
    }

    console.log(`❌ API Error (/auth/profile/${userId}): User not found`);
    return c.json({ error: "User not found" }, 404);
  } catch (error: any) {
    console.error(`❌ API Request Failed (/auth/profile/${c.req.param("userId")}):`, error.message);
    return c.json({ error: error.message }, 500);
  }
});

// ============================================
// UPDATE TEMP PASSWORD FLAG
// ============================================
authApp.post("/update-temp-password", async (c) => {
  try {
    const { userId } = await c.req.json();
    const profile = await kv.get(`auth:user:${userId}`);

    if (!profile) {
      return c.json({ error: "User not found" }, 404);
    }

    await kv.set(`auth:user:${userId}`, {
      ...profile,
      tempPassword: false,
    });

    return c.json({ success: true });
  } catch (error: any) {
    console.error("Update temp password error:", error);
    return c.json({ error: error.message }, 500);
  }
});

// ============================================
// CREATE USER (by super admin)
// ============================================
authApp.post("/create-user", async (c) => {
  try {
    const { name, email, phone, role, storeId, createdBy, profileImage } = await c.req.json();

    if (!createdBy || String(createdBy).trim() === "") {
      return c.json({ error: "createdBy is required" }, 400);
    }

    const creator = await kv.get(`auth:user:${createdBy}`);
    if (!creator || typeof creator !== "object") {
      return c.json({ error: "Unauthorized" }, 403);
    }

    const cr = String((creator as { role?: string }).role || "");
    const canCreate =
      OWNER_ROLES.has(cr) || ADMIN_TIER_ROLES.has(cr) || cr === "vendor-admin";
    if (!canCreate) {
      return c.json({ error: "Unauthorized" }, 403);
    }

    const targetRole = String(role || "data-entry").trim();
    if (!canAssignStaffRoleBackend(cr, targetRole)) {
      return c.json({ error: "You cannot assign this role" }, 403);
    }

    // Generate temporary password
    const tempPassword = generatePassword();

    // Create user in Supabase Auth
    const { data, error } = await supabaseAdmin.auth.admin.createUser({
      email,
      password: tempPassword,
      email_confirm: true,
      user_metadata: {
        name,
        phone: phone || "",
        role: targetRole,
        storeId: storeId || "",
      },
    });

    if (error || !data.user) {
      console.error("Error creating user:", error);
      return c.json({ error: error?.message || "Failed to create user" }, 500);
    }

    let profileImagePath: string | undefined;
    if (profileImage && typeof profileImage === "string" && profileImage.startsWith("data:image/")) {
      const uploaded = await uploadProfileImage(data.user.id, profileImage);
      if (uploaded) profileImagePath = uploaded;
    }

    const kvProfile: Record<string, unknown> = {
      id: data.user.id,
      email,
      name,
      phone: phone || "",
      role: targetRole,
      storeId: storeId || "",
      tempPassword: true,
      createdBy,
      createdAt: new Date().toISOString(),
    };
    if (profileImagePath) kvProfile.profileImage = profileImagePath;

    await kv.set(`auth:user:${data.user.id}`, kvProfile);

    if (profileImagePath) {
      const { error: metaErr } = await supabaseAdmin.auth.admin.updateUserById(data.user.id, {
        user_metadata: {
          name,
          phone: phone || "",
          role: targetRole,
          storeId: storeId || "",
          profileImage: profileImagePath,
        },
      });
      if (metaErr) console.error("⚠️ Auth metadata profileImage update:", metaErr);
    }

    // Add to users list
    const users = (await kv.get("auth:users-list")) || [];
    users.push(data.user.id);
    await kv.set("auth:users-list", users);

    console.log(`✅ User created: ${email} with role ${targetRole}`);
    const createdName = String(name || email || "User").trim();
    const createdMail = String(email || "").trim();
    await appendStaffActivity(createdBy, {
      type: "user_created",
      action: "User created",
      detail: formatUserAuditDetail({ name: createdName, email: createdMail, role: targetRole }),
    });

    let profileImageUrl: string | undefined;
    if (profileImagePath) {
      const su = await getSignedImageUrl(profileImagePath);
      if (su) profileImageUrl = su;
    }

    return c.json({
      success: true,
      userId: data.user.id,
      tempPassword, // Return this so admin can share it
      profileImageUrl,
    });
  } catch (error: any) {
    console.error("Create user error:", error);
    return c.json({ error: error.message }, 500);
  }
});

// ============================================
// GET ALL USERS
// ============================================
authApp.get("/users", async (c) => {
  try {
    const validAuthIds = await listSupabaseAuthUserIds();
    await pruneOrphanedStaffProfiles(validAuthIds);

    const userIds = (await withTimeout(kv.get("auth:users-list"), 30000)) || [];
    const users = [];

    for (const userId of userIds) {
      const id = String(userId);
      if (!validAuthIds.has(id)) continue;

      const profile = await withTimeout(kv.get(`auth:user:${id}`), 30000);
      if (profile && typeof profile === "object") {
        const safe = { ...(profile as Record<string, unknown>) };
        delete (safe as { tempPassword?: unknown }).tempPassword;
        const path = typeof safe.profileImage === "string" ? safe.profileImage.trim() : "";
        if (path) {
          const signed = await getSignedImageUrl(path);
          if (signed) (safe as { profileImageUrl?: string }).profileImageUrl = signed;
        }
        users.push(safe);
      }
    }

    return c.json(dedupeAuthProfilesByEmail(users));
  } catch (error: any) {
    console.error("Get users error:", error);
    return c.json({ error: error.message }, 500);
  }
});

// ============================================
// UPDATE USER
// ============================================
authApp.put("/user/:userId", async (c) => {
  try {
    const userId = c.req.param("userId");
    const body = await c.req.json();
    const {
      name,
      email,
      phone,
      status,
      role,
      storeId,
      profileImage,
      updatedBy,
      removeProfileImage,
      location,
      addressLine1,
      addressLine2,
      city,
      region,
      postalCode,
      country,
      bio,
    } = body;

    const profile = await kv.get(`auth:user:${userId}`);
    if (!profile) {
      return c.json({ error: "User not found" }, 404);
    }

    const p = profile as Record<string, unknown> & {
      email?: string;
      name?: string;
      phone?: string;
      role?: string;
      storeId?: string;
      profileImage?: string;
    };

    if (role !== undefined && role !== p.role) {
      if (!updatedBy || String(updatedBy).trim() === "") {
        return c.json({ error: "updatedBy is required when changing role" }, 400);
      }
      const actor = await kv.get(`auth:user:${updatedBy}`);
      const ar = actor && typeof actor === "object" ? String((actor as { role?: string }).role || "") : "";
      const newRole = String(role || "").trim();
      if (!canAssignStaffRoleBackend(ar, newRole)) {
        return c.json({ error: "You cannot assign this role" }, 403);
      }
      const prevRole = String(p.role || "");
      if (OWNER_ROLES.has(prevRole) && !OWNER_ROLES.has(ar)) {
        return c.json({ error: "Only store owners can change owner-level roles" }, 403);
      }
    }

    const hasNewImageData =
      profileImage && typeof profileImage === "string" && profileImage.startsWith("data:image/");
    const shouldClearImage = removeProfileImage === true && !hasNewImageData;

    let uploadedPath: string | null = null;
    if (hasNewImageData) {
      uploadedPath = await uploadProfileImage(userId, profileImage);
    }

    console.log(`🔄 Updating user ${userId}:`, { name, email, phone, role, shouldClearImage });

    const supabaseUpdates: Record<string, unknown> = {};
    if (email && email !== p.email) {
      supabaseUpdates.email = email;
      console.log(`📧 Email will be updated to: ${email}`);
    }

    const needsAuthMetaUpdate =
      shouldClearImage ||
      !!uploadedPath ||
      (name !== undefined && name !== p.name) ||
      (phone !== undefined && phone !== p.phone) ||
      (role !== undefined && role !== p.role) ||
      (storeId !== undefined && storeId !== p.storeId);

    if (Object.keys(supabaseUpdates).length > 0 || needsAuthMetaUpdate) {
      const { data: guData, error: guErr } = await supabaseAdmin.auth.admin.getUserById(userId);
      if (guErr || !guData?.user) {
        console.error("❌ getUserById failed:", guErr);
        return c.json({ error: guErr?.message || "User lookup failed" }, 500);
      }
      const merged: Record<string, unknown> = { ...(guData.user.user_metadata || {}) };
      if (name !== undefined) merged.name = name;
      if (phone !== undefined) merged.phone = phone;
      if (role !== undefined && String(role).trim() !== "") merged.role = role;
      if (storeId !== undefined) merged.storeId = storeId;
      if (shouldClearImage) {
        delete merged.profileImage;
      } else if (uploadedPath) {
        merged.profileImage = uploadedPath;
      }

      const updatePayload: Record<string, unknown> = { ...supabaseUpdates, user_metadata: merged };
      console.log(`🔄 Updating Supabase Auth (merged metadata)`);

      const { error } = await supabaseAdmin.auth.admin.updateUserById(userId, updatePayload);
      if (error) {
        console.error("❌ Error updating Supabase Auth:", error);
        return c.json({ error: error.message }, 500);
      }
      console.log(`✅ Supabase Auth updated successfully`);
    }

    const updatedProfile: Record<string, unknown> = {
      ...p,
      name: name !== undefined ? name : p.name,
      email: email !== undefined ? email : p.email,
      phone: phone !== undefined ? phone : p.phone,
      status: status !== undefined ? status : (p as { status?: unknown }).status,
      role: role !== undefined ? role : p.role,
      storeId: storeId !== undefined ? storeId : p.storeId,
      updatedAt: new Date().toISOString(),
    };

    if (location !== undefined) updatedProfile.location = location;
    if (addressLine1 !== undefined) updatedProfile.addressLine1 = addressLine1;
    if (addressLine2 !== undefined) updatedProfile.addressLine2 = addressLine2;
    if (city !== undefined) updatedProfile.city = city;
    if (region !== undefined) updatedProfile.region = region;
    if (postalCode !== undefined) updatedProfile.postalCode = postalCode;
    if (country !== undefined) updatedProfile.country = country;
    if (bio !== undefined) updatedProfile.bio = bio;

    if (shouldClearImage) {
      delete updatedProfile.profileImage;
      delete updatedProfile.profileImageUrl;
    } else if (uploadedPath) {
      updatedProfile.profileImage = uploadedPath;
    }

    await kv.set(`auth:user:${userId}`, updatedProfile);
    console.log(`✅ KV profile updated successfully`);

    const prevImg = typeof p.profileImage === "string" ? p.profileImage.trim() : "";
    if (shouldClearImage && prevImg) {
      await deleteOwnedStorageRefs(supabaseAdmin, [prevImg]);
    } else if (uploadedPath && prevImg && prevImg !== uploadedPath) {
      await deleteOwnedStorageRefs(supabaseAdmin, [prevImg]);
    }

    if (typeof updatedProfile.profileImage === "string" && updatedProfile.profileImage.trim()) {
      const signedUrl = await getSignedImageUrl(String(updatedProfile.profileImage).trim());
      if (signedUrl) {
        updatedProfile.profileImageUrl = signedUrl;
      }
    } else {
      delete updatedProfile.profileImageUrl;
    }

    const actorId = typeof updatedBy === "string" && updatedBy.trim() ? updatedBy.trim() : userId;
    const targetName = String(updatedProfile.name || "").trim();
    const targetEmail = String(updatedProfile.email || "").trim();
    const targetLabel = String(targetName || targetEmail || userId).slice(0, 120);
    const detailParts: string[] = [];
    const prevRole = String(p.role || "").trim();
    const nextRole = String(updatedProfile.role || "").trim();
    if (prevRole !== nextRole) {
      detailParts.push(
        formatUserAuditDetail({
          name: targetName,
          email: targetEmail,
          role: nextRole,
        })
      );
    }
    const prevStatus = String((p as { status?: unknown }).status || "").trim().toLowerCase();
    const nextStatus = String(updatedProfile.status || "").trim().toLowerCase();
    if (prevStatus !== nextStatus && nextStatus) {
      detailParts.push(
        [targetLabel, formatAuditStatusLabel(nextStatus)].filter(Boolean).join(" | ")
      );
    }
    const prevName = String(p.name || "").trim();
    const nextName = String(updatedProfile.name || "").trim();
    if (prevName !== nextName && nextName) {
      detailParts.push(formatUserAuditDetail({ name: nextName, email: targetEmail, role: nextRole }));
    }
    const prevEmail = String(p.email || "").trim().toLowerCase();
    const nextEmail = String(updatedProfile.email || "").trim().toLowerCase();
    if (prevEmail !== nextEmail && nextEmail) {
      detailParts.push(formatUserAuditDetail({ name: targetName, email: nextEmail, role: nextRole }));
    }
    if (detailParts.length === 0) {
      detailParts.push(targetLabel);
    }
    await appendStaffActivity(actorId, {
      type: "user_updated",
      action: "User updated",
      detail: detailParts.join(" · "),
    });

    return c.json({ success: true, user: updatedProfile });
  } catch (error: any) {
    console.error("❌ Update user error:", error);
    return c.json({ error: error.message }, 500);
  }
});

// ============================================
// DELETE USER
// ============================================
authApp.delete("/user/:userId", async (c) => {
  try {
    const userId = c.req.param("userId");
    const deletedBy = String(c.req.query("deletedBy") || "").trim();

    const profile = await kv.get(`auth:user:${userId}`);
    if (!profile) {
      return c.json({ error: "User not found" }, 404);
    }

    const profileRole = String((profile as { role?: string }).role || "").trim();
    if (profileRole === "super-admin" || profileRole === "store-owner") {
      const blockedName = String(
        (profile as { name?: string }).name || (profile as { email?: string }).email || userId
      ).slice(0, 120);
      const blockedMail = String((profile as { email?: string }).email || "").slice(0, 120);
      await appendStaffActivity(deletedBy || undefined, {
        type: "admin_action",
        action: "User delete blocked",
        detail: formatUserAuditDetail({
          name: blockedName,
          email: blockedMail,
          role: profileRole,
        }),
      });
      return c.json({ error: "Cannot delete owner-level account" }, 400);
    }

    // Delete from Supabase Auth
    const { error } = await supabaseAdmin.auth.admin.deleteUser(userId);
    if (error) {
      console.error("Error deleting user from auth:", error);
    }

    // Delete from KV
    await kv.del(`auth:user:${userId}`);

    // Remove from users list
    const userIds = (await kv.get("auth:users-list")) || [];
    const filtered = userIds.filter((id: string) => id !== userId);
    await kv.set("auth:users-list", filtered);

    const staffImg =
      profile && typeof (profile as { profileImage?: string }).profileImage === "string"
        ? (profile as { profileImage: string }).profileImage.trim()
        : "";
    if (staffImg) {
      await deleteOwnedStorageRefs(supabaseAdmin, [staffImg]);
    }

    console.log(`✅ User deleted: ${profile.email}`);
    const deletedName = String(
      (profile as { name?: string }).name || (profile as { email?: string }).email || userId
    ).slice(0, 120);
    const deletedMail = String((profile as { email?: string }).email || "").slice(0, 120);
    await appendStaffActivity(deletedBy || undefined, {
      type: "user_deleted",
      action: "User deleted",
      detail: formatUserAuditDetail({
        name: deletedName,
        email: deletedMail,
        role: profileRole,
      }),
    });

    return c.json({ success: true });
  } catch (error: any) {
    console.error("Delete user error:", error);
    return c.json({ error: error.message }, 500);
  }
});

// ============================================
// RESET PASSWORD (generate new temp password)
// ============================================
authApp.post("/reset-password/:userId", async (c) => {
  try {
    const userId = c.req.param("userId");
    let resetBy = "";
    try {
      const body = await c.req.json();
      resetBy = typeof body?.resetBy === "string" ? body.resetBy.trim() : "";
    } catch {
      resetBy = "";
    }

    const profile = await kv.get(`auth:user:${userId}`);
    if (!profile) {
      return c.json({ error: "User not found" }, 404);
    }

    // Generate new temp password
    const tempPassword = generatePassword();

    // Update password in Supabase
    const { error } = await supabaseAdmin.auth.admin.updateUserById(userId, {
      password: tempPassword,
    });

    if (error) {
      console.error("Error resetting password:", error);
      return c.json({ error: error.message }, 500);
    }

    // Mark as temp password
    await kv.set(`auth:user:${userId}`, {
      ...profile,
      tempPassword: true,
      updatedAt: new Date().toISOString(),
    });

    console.log(`✅ Password reset for: ${profile.email}`);
    await appendStaffActivity(resetBy || undefined, {
      type: "password_reset",
      action: "Password reset",
      detail: formatUserAuditDetail({
        name: (profile as { name?: string }).name,
        email: (profile as { email?: string }).email,
        role: (profile as { role?: string }).role,
      }),
    });

    return c.json({
      success: true,
      tempPassword, // Return so admin can share it
    });
  } catch (error: any) {
    console.error("Reset password error:", error);
    return c.json({ error: error.message }, 500);
  }
});

// ============================================
// SEND EMAIL OTP (for password reset)
// ============================================
authApp.post("/send-email-otp", async (c) => {
  try {
    const { email } = await c.req.json();

    if (!email) {
      return c.json({ error: "Email is required" }, 400);
    }

    console.log(`📧 Generating OTP for email: ${email}`);

    // Check if user exists in Supabase Auth
    const { data: authUsers, error: userError } = await supabaseAdmin.auth.admin.listUsers();

    if (userError) {
      console.error("Error listing users:", userError);
      return c.json({ error: "Failed to check user" }, 500);
    }

    // Find user by email (case-insensitive)
    const user = authUsers.users.find(u => u.email?.toLowerCase() === email.toLowerCase());

    if (!user) {
      console.log(`❌ No user found with email: ${email}`);
      return c.json({ 
        error: "This email is not registered in the system. Please contact your administrator or use the email you registered with.",
      }, 404);
    }

    console.log(`✅ User found: ${user.id} (${email})`);

    // Generate 6-digit OTP
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    const expiresAt = Date.now() + 10 * 60 * 1000; // 10 minutes

    // Store OTP in KV with expiry
    await kv.set(`otp:email:${email.toLowerCase()}`, {
      code: otp,
      expiresAt,
      userId: user.id,
      createdAt: new Date().toISOString(),
    });

    console.log(`📧 OTP stored for ${email} (expires in 10 minutes)`);

    // Send REAL email via Resend (debug OTP is opt-in via ALLOW_DEBUG_OTP=true)
    try {
      const resendApiKey = String(Deno.env.get("RESEND_API_KEY") || "").trim();
      const resendFromEmail = String(Deno.env.get("RESEND_FROM_EMAIL") || "").trim();
      const resendFromName = String(Deno.env.get("RESEND_FROM_NAME") || "Migoo Marketplace").trim();
      const allowDebugOtp = String(Deno.env.get("ALLOW_DEBUG_OTP") || "").toLowerCase() === "true";

      if (!resendApiKey) {
        console.error("❌ RESEND_API_KEY not configured");
        if (allowDebugOtp) {
          return c.json({
            success: true,
            message: "OTP generated (debug mode enabled)",
            debug_otp: otp,
          });
        }
        return c.json({
          error: "Password reset email is not configured. Please contact support.",
        }, 503);
      }

      if (!resendFromEmail) {
        console.error("❌ RESEND_FROM_EMAIL not configured");
        if (allowDebugOtp) {
          return c.json({
            success: true,
            message: "OTP generated (debug mode enabled)",
            debug_otp: otp,
          });
        }
        return c.json({
          error: "Password reset sender is not configured. Please contact support.",
        }, 503);
      }

      const emailResponse = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${resendApiKey}`,
        },
        body: JSON.stringify({
          from: `${resendFromName} <${resendFromEmail}>`,
          to: [email],
          subject: 'Password Reset Code - Migoo',
          html: `
            <!DOCTYPE html>
            <html>
              <head>
                <meta charset="utf-8">
                <style>
                  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Arial, sans-serif; line-height: 1.6; color: #0f172a; background: #f1f5f9; margin: 0; padding: 24px; }
                  .container { max-width: 600px; margin: 0 auto; }
                  .card { background: #ffffff; border: 1px solid #e2e8f0; border-radius: 16px; overflow: hidden; box-shadow: 0 10px 40px rgba(15, 23, 42, 0.08); }
                  .header { background: linear-gradient(135deg, #1a1d29 0%, #0f172a 55%, #1e3a8a 100%); color: #ffffff; padding: 28px 30px; text-align: center; }
                  .header h1 { margin: 0; font-size: 24px; font-weight: 700; letter-spacing: 0.02em; }
                  .content { padding: 32px 30px; color: #334155; }
                  .content p { margin: 0 0 16px; }
                  .otp-box { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 12px; padding: 24px 20px; text-align: center; margin: 24px 0; }
                  .otp-label { margin: 0; color: #64748b; font-size: 13px; font-weight: 500; text-transform: uppercase; letter-spacing: 0.06em; }
                  .otp-code { font-size: 36px; font-weight: 700; color: #0f172a; letter-spacing: 8px; margin: 12px 0; font-variant-numeric: tabular-nums; }
                  .otp-expiry { margin: 0; color: #64748b; font-size: 13px; }
                  .content ul { margin: 0 0 16px; padding-left: 20px; color: #475569; }
                  .content li { margin-bottom: 6px; }
                  .footer { text-align: center; margin-top: 28px; padding-top: 20px; border-top: 1px solid #e2e8f0; font-size: 12px; color: #64748b; }
                  .footer p { margin: 0 0 6px; }
                </style>
              </head>
              <body>
                <div class="container">
                  <div class="card">
                    <div class="header">
                      <h1>Password Reset</h1>
                    </div>
                    <div class="content">
                      <p>Hello,</p>
                      <p>You requested to reset your password for your Migoo account. Use the verification code below:</p>
                      
                      <div class="otp-box">
                        <p class="otp-label">Your verification code</p>
                        <div class="otp-code">${otp}</div>
                        <p class="otp-expiry">Valid for 10 minutes</p>
                      </div>
                      
                      <p><strong>Important:</strong></p>
                      <ul>
                        <li>This code expires in <strong>10 minutes</strong></li>
                        <li>Do not share this code with anyone</li>
                        <li>If you didn't request this, please ignore this email</li>
                      </ul>
                      
                      <div class="footer">
                        <p>© 2026 Migoo Marketplace — Myanmar's Premier E-Commerce Platform</p>
                        <p>This is an automated email, please do not reply.</p>
                      </div>
                    </div>
                  </div>
                </div>
              </body>
            </html>
          `,
        }),
      });

      const emailResult = await emailResponse.json();

      if (!emailResponse.ok) {
        console.error('❌ Resend API error:', emailResult);
        throw new Error(emailResult.message || 'Failed to send email');
      }

      console.log(`✅ Email sent successfully via Resend:`, emailResult.id);

      return c.json({
        success: true,
        message: "Password reset code sent to your email",
      });
    } catch (emailError: any) {
      console.error('Email sending error:', emailError);
      const allowDebugOtp = String(Deno.env.get("ALLOW_DEBUG_OTP") || "").toLowerCase() === "true";
      const exposeEmailErrors = String(Deno.env.get("EXPOSE_EMAIL_ERRORS") || "").toLowerCase() === "true";
      if (allowDebugOtp) {
        return c.json({
          success: true,
          message: "OTP generated (debug mode enabled)",
          debug_otp: otp,
          email_error: emailError?.message || "Unknown email error",
        });
      }
      return c.json({
        error: exposeEmailErrors
          ? (emailError?.message || "Failed to send password reset email")
          : "Failed to send password reset email. Please try again later.",
        email_error: emailError?.message || "Unknown email error",
      }, 502);
    }
  } catch (error: any) {
    console.error("Send email OTP error:", error);
    return c.json({ error: error.message || "Failed to send OTP" }, 500);
  }
});

// ============================================
// VERIFY OTP AND UPDATE PASSWORD
// ============================================
authApp.post("/verify-otp-and-reset", async (c) => {
  try {
    const { email, otp, newPassword } = await c.req.json();

    if (!email || !otp || !newPassword) {
      return c.json({ error: "Email, OTP, and new password are required" }, 400);
    }

    console.log(`🔐 Verifying OTP for: ${email}`);

    // Get stored OTP (normalize email to lowercase)
    const normalizedEmail = email.toLowerCase().trim();
    const storedOtpData = await kv.get(`otp:email:${normalizedEmail}`);

    if (!storedOtpData) {
      console.log(`❌ No OTP found for: ${normalizedEmail}`);
      return c.json({ error: "OTP not found or expired. Please request a new code." }, 404);
    }

    // Check if expired
    if (Date.now() > storedOtpData.expiresAt) {
      console.log(`⏰ OTP expired for: ${normalizedEmail}`);
      await kv.del(`otp:email:${normalizedEmail}`);
      return c.json({ error: "OTP has expired. Please request a new code." }, 400);
    }

    // Verify OTP
    if (storedOtpData.code !== otp) {
      console.warn(`❌ Invalid OTP attempt for: ${normalizedEmail}`);
      return c.json({ error: "Invalid OTP code. Please check and try again." }, 400);
    }

    console.log(`✅ OTP verified for: ${normalizedEmail}`);

    // Update password in Supabase
    const { error } = await supabaseAdmin.auth.admin.updateUserById(
      storedOtpData.userId,
      { password: newPassword }
    );

    if (error) {
      console.error("Error updating password:", error);
      return c.json({ error: "Failed to update password: " + error.message }, 500);
    }

    // Delete used OTP
    await kv.del(`otp:email:${normalizedEmail}`);

    console.log(`✅ Password updated successfully for: ${normalizedEmail}`);

    return c.json({
      success: true,
      message: "Password updated successfully",
    });
  } catch (error: any) {
    console.error("Verify OTP error:", error);
    return c.json({ error: error.message || "Failed to verify OTP" }, 500);
  }
});

// ============================================
// DEBUG: LIST ALL REGISTERED EMAILS (for password reset)
// ============================================
authApp.get("/list-emails", async (c) => {
  try {
    console.log("📧 Listing all registered emails...");
    
    const { data: authUsers, error } = await supabaseAdmin.auth.admin.listUsers();

    if (error) {
      console.error("Error listing users:", error);
      return c.json({ error: error.message }, 500);
    }

    const emails = authUsers.users.map(u => ({
      email: u.email,
      role: u.user_metadata?.role || 'N/A',
      created: u.created_at,
    }));

    console.log(`📊 Found ${emails.length} registered emails`);

    return c.json({
      success: true,
      total: emails.length,
      emails: emails,
    });
  } catch (error: any) {
    console.error("List emails error:", error);
    return c.json({ error: error.message }, 500);
  }
});

// ============================================
// STOREFRONT: LOGIN (for customers)
// ============================================
authApp.post("/login", async (c) => {
  try {
    const { email, password } = await c.req.json();

    if (!email || !password) {
      return c.json({ error: "Email or phone and password are required" }, 400);
    }

    const resolved = await resolveCustomerLoginEmail(email);
    if (resolved.error || !resolved.email) {
      return c.json({ error: resolved.error || "Invalid login" }, 400);
    }
    const loginEmail = resolved.email;

    console.log(`🔐 Customer login attempt: ${email} → ${loginEmail}`);

    // Sign in with Supabase Auth
    const { data, error } = await supabaseAuth.auth.signInWithPassword({
      email: loginEmail,
      password,
    });

    if (error) {
      console.error(`❌ Login failed for ${email}:`, error.message);
      return c.json({ error: error.message }, 401);
    }

    if (!data.user) {
      return c.json({ error: "Login failed" }, 401);
    }

    console.log(`✅ Auth successful for ${email}, user ID: ${data.user.id}`);

    // Find or create customer record
    let customer = null;
    
    // Try to find existing customer by userId
    customer = await findStorefrontCustomerByUserId(data.user.id);
    let allCustomers: any[] | null = null;
    if (!customer) {
      allCustomers = await withTimeout(kv.getByPrefix("customer:"), 30000);
      customer = Array.isArray(allCustomers)
        ? allCustomers.find((c: any) => c != null && c.userId === data.user!.id)
        : null;
    }

    // If no customer found, create one
    if (!customer) {
      console.log(`📝 Creating new customer record for user: ${data.user.id}`);
      
      const customerId = `cust_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
      const userName = data.user.user_metadata?.name || loginEmail.split('@')[0];
      const loginPhone = normalizeMyanmarPhone(String(email || ""));
      const userPhoneRaw = data.user.user_metadata?.phone || loginPhone || "";
      const userPhone = normalizeMyanmarPhone(String(userPhoneRaw)) || String(userPhoneRaw).trim();
      const profileImage = data.user.user_metadata?.profileImage || null;
      const displayEmail = isSyntheticAuthEmail(loginEmail) ? "" : loginEmail;
      
      // 🔥 CHECK FOR DUPLICATE EMAIL (should never happen since auth succeeded, but double-check)
      const duplicateEmail = displayEmail
        ? await findCustomerByEmailFromReadModel(displayEmail)
        : null;
      const duplicateEmailConflict =
        duplicateEmail && duplicateEmail.userId !== data.user!.id
          ? duplicateEmail
          : null;
      
      if (duplicateEmailConflict) {
        console.error(`❌ CRITICAL: Customer with email ${displayEmail} already exists but has different userId!`);
        console.error(`   Existing customer: ${duplicateEmailConflict.id} (userId: ${duplicateEmailConflict.userId})`);
        console.error(`   Current auth user: ${data.user.id}`);
        return c.json({ 
          error: "Account conflict detected. Please contact support.",
          details: "Another customer account is using this email address."
        }, 409);
      }
      
      // 🔥 CHECK FOR DUPLICATE PHONE (if phone is provided)
      if (userPhone && userPhone.trim() !== "") {
        const normalizedPhone = normalizeMyanmarPhone(userPhone) || userPhone.replace(/\s+/g, '');
        const duplicatePhone = await findCustomerByPhone(normalizedPhone);
        const duplicatePhoneConflict =
          duplicatePhone && duplicatePhone.userId !== data.user!.id ? duplicatePhone : null;
        
        if (duplicatePhoneConflict) {
          console.error(`❌ Phone number ${userPhone} is already registered to another customer: ${duplicatePhoneConflict.id}`);
          return c.json({ 
            error: "This phone number is already registered to another account.",
            details: `Phone ${userPhone} is already in use.`
          }, 409);
        }
      }
      
      customer = {
        id: customerId,
        userId: data.user.id, // Link to Supabase Auth user
        name: userName,
        email: displayEmail,
        phone: userPhone,
        location: "", // Can be updated later
        address: "",
        city: "",
        region: "",
        status: "active",
        tier: "new",
        avatar: profileImage 
          ? await getSignedImageUrl(profileImage) || `https://api.dicebear.com/7.x/pixel-art/svg?seed=${encodeURIComponent(userName)}`
          : `https://api.dicebear.com/7.x/pixel-art/svg?seed=${encodeURIComponent(userName)}`,
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

      await withTimeout(kv.set(`customer:${customerId}`, customer), 5000);
      queueCustomerReadModelSync(customerId, customer);
      console.log(`✅ Customer record created: ${customerId}`);
    } else {
      customer = await enrichCustomerFromAuthUser(customer, data.user);
      // Update last visit
      customer.lastVisit = new Date().toISOString().split('T')[0];
      customer.updatedAt = new Date().toISOString();
      await withTimeout(kv.set(`customer:${customer.id}`, customer), 5000);
      queueCustomerReadModelSync(String(customer.id), customer);
      console.log(`✅ Customer record updated: ${customer.id}`);
    }

    // Prepare user object for frontend - IMPORTANT: Ensure id is the Supabase userId (UUID)
    // so profile fetching works correctly. Store the customerId separately.
    const userResponse = buildStorefrontUserResponse(
      customer,
      data.user.id,
      String(data.user.email || "").trim().toLowerCase()
    );

    return c.json({
      success: true,
      user: userResponse,
      session: {
        access_token: data.session?.access_token,
        refresh_token: data.session?.refresh_token,
      },
    });
  } catch (error: any) {
    console.error("Login error:", error);
    return c.json({ error: error.message || "Login failed" }, 500);
  }
});

// ============================================
// STOREFRONT: REGISTER (for customers)
// ============================================
authApp.post("/register", async (c) => {
  try {
    const { email, password, name, phone, profileImage } = await c.req.json();

    if (!password || !name || !phone?.trim()) {
      return c.json({ error: "Phone number, password, and name are required" }, 400);
    }

    const normalizedPhone = normalizeMyanmarPhone(phone);
    if (!normalizedPhone) {
      return c.json({
        error: "Phone must be Myanmar format: +959XXXXXXXXX (12 digits) or 09XXXXXXXXX (11 digits)",
      }, 400);
    }

    const emailTrimmed = String(email || "").trim();
    let authEmail = emailTrimmed;
    let displayEmail = emailTrimmed;

    if (emailTrimmed) {
      const emailRegex = /^[a-zA-Z0-9._-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
      if (!emailRegex.test(emailTrimmed)) {
        return c.json({ error: "Please enter a valid email address (e.g., name@example.com)" }, 400);
      }
    } else {
      authEmail = phoneToAuthEmail(normalizedPhone);
      displayEmail = "";
    }

    console.log(`📝 Customer registration attempt: phone=${normalizedPhone} authEmail=${authEmail}`);

    const allCustomers = await withTimeout(kv.getByPrefix("customer:"), 30000);

    const duplicatePhone = await findCustomerByPhone(normalizedPhone);
    if (duplicatePhone) {
      console.log(`❌ Phone number already registered: ${normalizedPhone}`);
      return c.json({
        error: "This phone number is already registered. Please sign in or use a different number.",
      }, 409);
    }

    if (displayEmail) {
      const { data: authUsers } = await supabaseAdmin.auth.admin.listUsers();
      const existingUser = authUsers?.users.find(
        (u) => u.email?.toLowerCase() === displayEmail.toLowerCase()
      );

      if (existingUser) {
        console.log(`❌ Email already registered: ${displayEmail}`);
        return c.json({
          error: "This email is already registered. Please use a different email or sign in instead.",
        }, 409);
      }

      const duplicateEmail = Array.isArray(allCustomers)
        ? allCustomers.find(
            (cust: any) =>
              cust != null &&
              cust.email &&
              !isSyntheticAuthEmail(cust.email) &&
              cust.email.toLowerCase() === displayEmail.toLowerCase()
          )
        : null;

      if (duplicateEmail) {
        console.log(`❌ Email already exists in customer records: ${displayEmail}`);
        return c.json({
          error: "This email is already registered. Please use a different email or sign in instead.",
        }, 409);
      }
    } else {
      const { data: authUsers } = await supabaseAdmin.auth.admin.listUsers();
      const existingSynthetic = authUsers?.users.find(
        (u) => u.email?.toLowerCase() === authEmail.toLowerCase()
      );
      if (existingSynthetic) {
        return c.json({
          error: "This phone number is already registered. Please sign in instead.",
        }, 409);
      }
    }

    // Create user in Supabase Auth
    const { data, error } = await supabaseAdmin.auth.admin.createUser({
      email: authEmail,
      password,
      email_confirm: true, // Auto-confirm since email server not configured
      user_metadata: {
        name,
        phone: normalizedPhone,
        role: "customer",
      },
    });

    if (error || !data.user) {
      console.error(`❌ Registration failed for ${email}:`, error);
      return c.json({ error: error?.message || "Registration failed" }, 500);
    }

    console.log(`✅ Auth user created: ${data.user.id}`);

    // Upload profile image if provided
    let uploadedImagePath = null;
    if (profileImage) {
      uploadedImagePath = await uploadProfileImage(data.user.id, profileImage);
    }

    // Create customer record
    const customerId = `cust_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
    
    const customer = {
      id: customerId,
      userId: data.user.id, // Link to Supabase Auth user
      name: name,
      email: displayEmail,
      phone: normalizedPhone,
      location: "",
      address: "",
      city: "",
      region: "",
      status: "active",
      tier: "new",
      avatar: uploadedImagePath
        ? await getSignedImageUrl(uploadedImagePath) || `https://api.dicebear.com/7.x/pixel-art/svg?seed=${encodeURIComponent(name)}`
        : `https://api.dicebear.com/7.x/pixel-art/svg?seed=${encodeURIComponent(name)}`,
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

    await withTimeout(kv.set(`customer:${customerId}`, customer), 5000);
    queueCustomerReadModelSync(customerId, customer);
    console.log(`✅ Customer record created: ${customerId}`);

    // Prepare user object for frontend - IMPORTANT: Ensure id is the Supabase userId (UUID)
    // so profile fetching works correctly. Store the customerId separately.
    const userResponse = buildStorefrontUserResponse(
      customer,
      data.user.id,
      authEmail.toLowerCase()
    );

    return c.json({
      success: true,
      user: userResponse,
    });
  } catch (error: any) {
    console.error("Registration error:", error);
    return c.json({ error: error.message || "Registration failed" }, 500);
  }
});

// Aggregated staff actions — reads single global feed (cheap); ?since= for incremental poll
authApp.get("/staff-activities", async (c) => {
  try {
    const since = String(c.req.query("since") || "").trim();
    const activities = await getGlobalStaffActivityFeed(since || undefined);
    return c.json({ activities });
  } catch (error: any) {
    console.error("staff-activities GET:", error);
    return c.json({ activities: [] });
  }
});

// Clear all staff activity logs — store owner / super-admin only (for fresh testing)
authApp.delete("/staff-activities", async (c) => {
  try {
    const clearedBy = String(c.req.query("clearedBy") || "").trim();
    if (!isValidStaffActorId(clearedBy)) {
      return c.json({ error: "Invalid actor" }, 400);
    }

    const profile = await kv.get(`auth:user:${clearedBy}`);
    if (!profile || typeof profile !== "object") {
      return c.json({ error: "Unauthorized" }, 403);
    }

    const role = String((profile as { role?: string }).role || "").trim();
    if (!OWNER_ROLES.has(role)) {
      return c.json({ error: "Only store owner can clear activity log" }, 403);
    }

    const deletedKeys = await clearAllStaffActivities();
    return c.json({ success: true, deletedKeys });
  } catch (error: any) {
    console.error("staff-activities DELETE:", error);
    return c.json({ error: error.message || "Failed to clear activities" }, 500);
  }
});

// Recent staff actions (product create/update/delete) for profile timeline
authApp.get("/staff-activity/:userId", async (c) => {
  try {
    const userId = c.req.param("userId");
    if (!isValidStaffActorId(userId)) {
      return c.json({ activities: [] });
    }
    const data = await kv.get(`staff:activity:${userId.trim()}`);
    const activities = Array.isArray(data) ? data : [];
    return c.json({ activities });
  } catch (error: any) {
    console.error("staff-activity GET:", error);
    return c.json({ activities: [] });
  }
});

export default authApp;