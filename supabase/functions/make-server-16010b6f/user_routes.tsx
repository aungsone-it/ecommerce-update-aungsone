import { Hono } from "npm:hono@4";
import * as kv from "./kv_store.tsx";
import { createClient } from "jsr:@supabase/supabase-js@2.49.8";
import { ensureBucket } from "./storage_bucket_helpers.tsx";
import { deleteOwnedStorageRefs } from "./storage_delete_helpers.tsx";

const userApp = new Hono();

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

// Get user profile by ID
userApp.get("/users/:userId", async (c) => {
  try {
    const userId = c.req.param("userId");
    console.log(`📖 Fetching user profile: ${userId}`);

    const user = await kv.get(`user:${userId}`);

    if (!user) {
      return c.json({ error: "User not found" }, 404);
    }

    console.log(`✅ User profile fetched successfully:`, user);
    return c.json({ user });
  } catch (error: any) {
    console.error("❌ Error fetching user profile:", error);
    return c.json({ error: error.message }, 500);
  }
});

// Update user profile
userApp.put("/users/:userId", async (c) => {
  try {
    const userId = c.req.param("userId");
    const updates = await c.req.json();
    console.log(`📝 Updating user profile: ${userId}`, updates);

    // Get existing user
    const existingUser = await kv.get(`user:${userId}`);

    if (!existingUser) {
      console.log(`⚠️ User not found in KV store, creating new entry: ${userId}`);
      // Create a new user entry if it doesn't exist
      const newUser = {
        ...updates,
        id: userId,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      
      await kv.set(`user:${userId}`, newUser);
      console.log(`✅ New user profile created:`, newUser);
      return c.json({ user: newUser });
    }

    // Merge updates with existing user data
    const updatedUser = {
      ...existingUser,
      ...updates,
      id: userId, // Ensure ID doesn't change
      updatedAt: new Date().toISOString(),
    };

    // Save updated user
    await kv.set(`user:${userId}`, updatedUser);

    console.log(`✅ User profile updated successfully:`, updatedUser);
    return c.json({ user: updatedUser });
  } catch (error: any) {
    console.error("❌ Error updating user profile:", error);
    return c.json({ error: error.message }, 500);
  }
});

// Upload user avatar
userApp.post("/users/:userId/avatar", async (c) => {
  try {
    const userId = c.req.param("userId");
    const body = await c.req.json();
    const { imageData, fileName } = body;

    console.log(`🖼️ Uploading avatar for user: ${userId}`);

    if (!imageData) {
      return c.json({ error: "No image data provided" }, 400);
    }

    const existingForAvatar = await kv.get(`user:${userId}`);
    const prevAvatarUrl =
      existingForAvatar &&
      typeof (existingForAvatar as { avatar?: string }).avatar === "string"
        ? (existingForAvatar as { avatar: string }).avatar.trim()
        : "";

    const bucketName = "make-16010b6f-user-avatars";
    await ensureBucket(supabase, bucketName, {
      public: false,
      fileSizeLimit: 5242880,
    });

    // Convert base64 to buffer
    const base64Data = imageData.split(",")[1] || imageData;
    const buffer = Uint8Array.from(atob(base64Data), (c) => c.charCodeAt(0));

    // Generate unique filename
    const timestamp = Date.now();
    const extension = fileName?.split(".").pop() || "png";
    const filePath = `${userId}/${timestamp}.${extension}`;

    // Upload to Supabase Storage
    const { error: uploadError } = await supabase.storage
      .from(bucketName)
      .upload(filePath, buffer, {
        contentType: `image/${extension}`,
        upsert: true,
      });

    if (uploadError) {
      console.error("❌ Error uploading avatar:", uploadError);
      throw uploadError;
    }

    // Get signed URL (valid for 1 year)
    const { data: urlData, error: urlError } = await supabase.storage
      .from(bucketName)
      .createSignedUrl(filePath, 31536000); // 1 year in seconds

    if (urlError) {
      console.error("❌ Error creating signed URL:", urlError);
      throw urlError;
    }

    const avatarUrl = urlData.signedUrl;

    // Update user profile with new avatar URL
    const existingUser = await kv.get(`user:${userId}`);
    if (existingUser) {
      const updatedUser = {
        ...existingUser,
        avatar: avatarUrl,
        updatedAt: new Date().toISOString(),
      };
      await kv.set(`user:${userId}`, updatedUser);
    }

    if (prevAvatarUrl) {
      await deleteOwnedStorageRefs(supabase, [prevAvatarUrl]);
    }

    console.log(`✅ Avatar uploaded successfully: ${avatarUrl}`);
    return c.json({ avatarUrl });
  } catch (error: any) {
    console.error("❌ Error uploading avatar:", error);
    return c.json({ error: error.message }, 500);
  }
});

export default userApp;