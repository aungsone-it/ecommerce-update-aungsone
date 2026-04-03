/**
 * Hard-delete objects from Supabase Storage when admin removes or replaces assets.
 * Only targets known app buckets; skips data: URLs and external http(s) hosts.
 */
import type { SupabaseClient } from "jsr:@supabase/supabase-js@2.49.8";

export const OWNED_STORAGE_BUCKETS = new Set([
  "make-16010b6f-profile-images",
  "make-16010b6f-store-logos",
  "make-16010b6f-banners",
  "make-16010b6f-description-images",
  "make-16010b6f-chat-images",
  "make-16010b6f-customer-images",
  "make-16010b6f-user-avatars",
]);

/** Resolve a stored string to bucket + object path for removal. */
export function parseOwnedStorageRef(value: unknown): { bucket: string; objectPath: string } | null {
  if (typeof value !== "string") return null;
  const s = value.trim();
  if (!s || s.startsWith("data:")) return null;

  // KV convention for staff / storefront profile uploads
  if (s.startsWith("profile-images/")) {
    return { bucket: "make-16010b6f-profile-images", objectPath: s };
  }

  // Signed or public object URL from this project
  const m = s.match(/\/storage\/v1\/object\/(?:sign|public)\/([^/]+)\/([^?]+)/);
  if (m) {
    const bucket = decodeURIComponent(m[1]);
    const objectPath = decodeURIComponent(m[2]);
    if (OWNED_STORAGE_BUCKETS.has(bucket)) {
      return { bucket, objectPath };
    }
    return null;
  }

  // Logo files live at bucket root
  if (/^logo_[a-z0-9_.-]+\.(jpe?g|png|gif|webp)$/i.test(s)) {
    return { bucket: "make-16010b6f-store-logos", objectPath: s };
  }

  // Banner object names: banner_<id>_<ts>_<rand>.ext
  if (/^banner_\d+_/i.test(s)) {
    return { bucket: "make-16010b6f-banners", objectPath: s };
  }

  if (/^customer_\d+_/i.test(s)) {
    return { bucket: "make-16010b6f-customer-images", objectPath: s };
  }

  // User avatars: {uuid}/{timestamp}.ext (KV may store path; signed URLs hit the regex above)
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\/\d+\.(jpe?g|png|gif|webp)$/i.test(s)) {
    return { bucket: "make-16010b6f-user-avatars", objectPath: s };
  }

  return null;
}

export async function deleteOwnedStorageRefs(
  supabase: SupabaseClient,
  values: unknown[]
): Promise<void> {
  const refs: { bucket: string; objectPath: string }[] = [];
  const seen = new Set<string>();
  for (const v of values) {
    const r = parseOwnedStorageRef(v);
    if (!r) continue;
    const k = `${r.bucket}::${r.objectPath}`;
    if (seen.has(k)) continue;
    seen.add(k);
    refs.push(r);
  }
  for (const { bucket, objectPath } of refs) {
    try {
      const { error } = await supabase.storage.from(bucket).remove([objectPath]);
      if (error) {
        console.warn(`⚠️ Storage remove ${bucket}/${objectPath}:`, error.message);
      } else {
        console.log(`🗑️ Removed storage object ${bucket}/${objectPath}`);
      }
    } catch (e) {
      console.warn(`⚠️ Storage remove failed ${bucket}/${objectPath}:`, e);
    }
  }
}

export function collectProductImageRefs(product: any): unknown[] {
  const out: unknown[] = [];
  if (!product || typeof product !== "object") return out;
  if (typeof (product as { image?: string }).image === "string") {
    out.push((product as { image: string }).image);
  }
  const imgs = (product as { images?: unknown }).images;
  if (Array.isArray(imgs)) {
    for (const x of imgs) {
      if (typeof x === "string") out.push(x);
    }
  }
  const variants = (product as { variants?: unknown }).variants;
  if (Array.isArray(variants)) {
    for (const v of variants) {
      if (v && typeof (v as { image?: string }).image === "string") {
        out.push((v as { image: string }).image);
      }
    }
  }
  return out;
}

/** Values present in `before` but not in `after` (by string identity). */
export function refsRemovedSinceUpdate(beforeVals: unknown[], afterVals: unknown[]): unknown[] {
  const after = new Set(afterVals.map((v) => String(v)));
  return beforeVals.filter((v) => !after.has(String(v)));
}
