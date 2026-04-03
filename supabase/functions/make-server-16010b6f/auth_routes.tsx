import { Hono } from "npm:hono@4";
import { createClient } from "jsr:@supabase/supabase-js@2.49.8";
import * as kv from "./kv_store.tsx";
import { ensureBucket } from "./storage_bucket_helpers.tsx";
import { deleteOwnedStorageRefs } from "./storage_delete_helpers.tsx";
import { isValidStaffActorId } from "./staff_activity_helpers.tsx";

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

    // Storefront customers (Supabase) live in customer:* — same as login payload, not auth:user
    const allCustomers = await withTimeout(kv.getByPrefix("customer:"), 30000);
    const customer = Array.isArray(allCustomers)
      ? allCustomers.find((x: any) => x != null && x.userId === userId)
      : null;

    if (customer && typeof customer === "object") {
      const { password: __, ...customerRest } = customer as Record<string, unknown> & {
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
    const userIds = (await withTimeout(kv.get("auth:users-list"), 30000)) || [];
    const users = [];

    for (const userId of userIds) {
      const profile = await withTimeout(kv.get(`auth:user:${userId}`), 30000);
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

    const profile = await kv.get(`auth:user:${userId}`);
    if (!profile) {
      return c.json({ error: "User not found" }, 404);
    }

    if (profile.role === "super-admin" || profile.role === "store-owner") {
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
      console.log(`📊 Available emails in system:`, authUsers.users.map(u => u.email));
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

    console.log(`📧 OTP CODE for ${email}: ${otp} (expires in 10 minutes)`);

    // Send REAL email via Resend
    try {
      const resendApiKey = Deno.env.get('RESEND_API_KEY');
      
      if (!resendApiKey) {
        console.warn('⚠️ RESEND_API_KEY not configured, showing debug OTP instead');
        return c.json({
          success: true,
          message: "OTP generated (email service not configured)",
          debug_otp: otp,
        });
      }

      const emailResponse = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${resendApiKey}`,
        },
        body: JSON.stringify({
          from: 'Migoo Marketplace <onboarding@resend.dev>',
          to: [email],
          subject: 'Password Reset Code - Migoo',
          html: `
            <!DOCTYPE html>
            <html>
              <head>
                <meta charset="utf-8">
                <style>
                  body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
                  .container { max-width: 600px; margin: 0 auto; padding: 20px; }
                  .header { background: linear-gradient(135deg, #ea580c 0%, #f97316 100%); color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }
                  .content { background: #f8fafc; padding: 30px; border-radius: 0 0 10px 10px; }
                  .otp-box { background: white; border: 2px solid #ea580c; border-radius: 10px; padding: 20px; text-align: center; margin: 20px 0; }
                  .otp-code { font-size: 36px; font-weight: bold; color: #ea580c; letter-spacing: 8px; margin: 10px 0; }
                  .footer { text-align: center; margin-top: 20px; font-size: 12px; color: #64748b; }
                </style>
              </head>
              <body>
                <div class="container">
                  <div class="header">
                    <h1 style="margin: 0; font-size: 28px;">🔐 Password Reset</h1>
                  </div>
                  <div class="content">
                    <p>Hello,</p>
                    <p>You requested to reset your password for your Migoo account. Use the verification code below:</p>
                    
                    <div class="otp-box">
                      <p style="margin: 0; color: #64748b; font-size: 14px;">Your verification code</p>
                      <div class="otp-code">${otp}</div>
                      <p style="margin: 0; color: #64748b; font-size: 14px;">Valid for 10 minutes</p>
                    </div>
                    
                    <p><strong>Important:</strong></p>
                    <ul>
                      <li>This code expires in <strong>10 minutes</strong></li>
                      <li>Do not share this code with anyone</li>
                      <li>If you didn't request this, please ignore this email</li>
                    </ul>
                    
                    <div class="footer">
                      <p>© 2026 Migoo Marketplace - Myanmar's Premier E-Commerce Platform</p>
                      <p>This is an automated email, please do not reply.</p>
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
      // Fallback: return debug OTP if email fails
      return c.json({
        success: true,
        message: "OTP generated (email delivery failed)",
        debug_otp: otp,
        email_error: emailError.message,
      });
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
      console.log(`❌ Invalid OTP. Expected: ${storedOtpData.code}, Got: ${otp}`);
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
      return c.json({ error: "Email and password are required" }, 400);
    }

    console.log(`🔐 Customer login attempt: ${email}`);

    // Sign in with Supabase Auth
    const { data, error } = await supabaseAuth.auth.signInWithPassword({
      email,
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
    const allCustomers = await withTimeout(kv.getByPrefix("customer:"), 30000);
    customer = Array.isArray(allCustomers) 
      ? allCustomers.find((c: any) => c != null && c.userId === data.user!.id)
      : null;

    // If no customer found, create one
    if (!customer) {
      console.log(`📝 Creating new customer record for user: ${data.user.id}`);
      
      const customerId = `cust_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
      const userName = data.user.user_metadata?.name || email.split('@')[0];
      const userPhone = data.user.user_metadata?.phone || "";
      const profileImage = data.user.user_metadata?.profileImage || null;
      
      // 🔥 CHECK FOR DUPLICATE EMAIL (should never happen since auth succeeded, but double-check)
      const duplicateEmail = Array.isArray(allCustomers)
        ? allCustomers.find((c: any) => c != null && c.email && c.email.toLowerCase() === email.toLowerCase() && c.userId !== data.user!.id)
        : null;
      
      if (duplicateEmail) {
        console.error(`❌ CRITICAL: Customer with email ${email} already exists but has different userId!`);
        console.error(`   Existing customer: ${duplicateEmail.id} (userId: ${duplicateEmail.userId})`);
        console.error(`   Current auth user: ${data.user.id}`);
        return c.json({ 
          error: "Account conflict detected. Please contact support.",
          details: "Another customer account is using this email address."
        }, 409);
      }
      
      // 🔥 CHECK FOR DUPLICATE PHONE (if phone is provided)
      if (userPhone && userPhone.trim() !== "") {
        const normalizedPhone = userPhone.replace(/\s+/g, ''); // Remove spaces for comparison
        const duplicatePhone = Array.isArray(allCustomers)
          ? allCustomers.find((c: any) => {
              if (!c || !c.phone) return false;
              const existingPhone = c.phone.replace(/\s+/g, '');
              return existingPhone === normalizedPhone && c.userId !== data.user!.id;
            })
          : null;
        
        if (duplicatePhone) {
          console.error(`❌ Phone number ${userPhone} is already registered to another customer: ${duplicatePhone.id}`);
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
        email: email,
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
      console.log(`✅ Customer record created: ${customerId}`);
    } else {
      // Update last visit
      customer.lastVisit = new Date().toISOString().split('T')[0];
      customer.updatedAt = new Date().toISOString();
      await withTimeout(kv.set(`customer:${customer.id}`, customer), 5000);
      console.log(`✅ Customer record updated: ${customer.id}`);
    }

    // Prepare user object for frontend - IMPORTANT: Ensure id is the Supabase userId (UUID)
    // so profile fetching works correctly. Store the customerId separately.
    const userResponse = {
      ...customer,
      id: data.user.id, // Always use UUID as the primary ID
      customerId: customer.id, // Keep the original customerId just in case
    };

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

    if (!email || !password || !name) {
      return c.json({ error: "Email, password, and name are required" }, 400);
    }

    console.log(`📝 Customer registration attempt: ${email}`);

    // 🔥 CHECK FOR DUPLICATE EMAIL in Supabase Auth
    const { data: authUsers } = await supabaseAdmin.auth.admin.listUsers();
    const existingUser = authUsers?.users.find(u => u.email?.toLowerCase() === email.toLowerCase());
    
    if (existingUser) {
      console.log(`❌ Email already registered: ${email}`);
      return c.json({ error: "This email is already registered. Please use a different email or login instead." }, 409);
    }

    // 🔥 CHECK FOR DUPLICATE EMAIL in customer records (double-check)
    const allCustomers = await withTimeout(kv.getByPrefix("customer:"), 30000);
    const duplicateEmail = Array.isArray(allCustomers)
      ? allCustomers.find((c: any) => c != null && c.email && c.email.toLowerCase() === email.toLowerCase())
      : null;
    
    if (duplicateEmail) {
      console.log(`❌ Email already exists in customer records: ${email}`);
      return c.json({ error: "This email is already registered. Please use a different email or login instead." }, 409);
    }

    // 🔥 CHECK FOR DUPLICATE PHONE (if phone is provided)
    if (phone && phone.trim() !== "") {
      const normalizedPhone = phone.replace(/\s+/g, ''); // Remove spaces for comparison
      const duplicatePhone = Array.isArray(allCustomers)
        ? allCustomers.find((c: any) => {
            if (!c || !c.phone) return false;
            const existingPhone = c.phone.replace(/\s+/g, '');
            return existingPhone === normalizedPhone;
          })
        : null;
      
      if (duplicatePhone) {
        console.log(`❌ Phone number already registered: ${phone}`);
        return c.json({ 
          error: "This phone number is already registered to another account. Please use a different phone number or login instead.",
          details: `Phone ${phone} is already in use.`
        }, 409);
      }
    }

    // Create user in Supabase Auth
    const { data, error } = await supabaseAdmin.auth.admin.createUser({
      email,
      password,
      email_confirm: true, // Auto-confirm since email server not configured
      user_metadata: {
        name,
        phone: phone || "",
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
      email: email,
      phone: phone || "",
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
    console.log(`✅ Customer record created: ${customerId}`);

    // Prepare user object for frontend - IMPORTANT: Ensure id is the Supabase userId (UUID)
    // so profile fetching works correctly. Store the customerId separately.
    const userResponse = {
      ...customer,
      id: data.user.id, // Always use UUID as the primary ID
      customerId: customer.id, // Keep the original customerId just in case
    };

    return c.json({
      success: true,
      user: userResponse,
    });
  } catch (error: any) {
    console.error("Registration error:", error);
    return c.json({ error: error.message || "Registration failed" }, 500);
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