/**
 * Caches storage.listBuckets() per Edge isolate to cut Storage API volume.
 * Every upload route was calling listBuckets() — that adds up fast under demo traffic.
 */
import type { SupabaseClient } from "jsr:@supabase/supabase-js@2.49.8";

type CreateBucketOptions = {
  public: boolean;
  fileSizeLimit?: number;
};

let cachedNames: Set<string> | null = null;
let cacheExpiresAt = 0;
/** Long TTL: bucket set rarely changes; invalidates naturally on new isolate. */
const LIST_BUCKETS_TTL_MS = 60 * 60 * 1000;

export async function getBucketNames(supabase: SupabaseClient): Promise<Set<string>> {
  const now = Date.now();
  if (cachedNames && now < cacheExpiresAt) {
    return cachedNames;
  }
  const { data, error } = await supabase.storage.listBuckets();
  if (error) {
    console.error("storage.listBuckets:", error);
    return cachedNames ?? new Set<string>();
  }
  cachedNames = new Set((data ?? []).map((b: { name: string }) => b.name));
  cacheExpiresAt = now + LIST_BUCKETS_TTL_MS;
  return cachedNames;
}

export async function ensureBucket(
  supabase: SupabaseClient,
  bucketName: string,
  options: CreateBucketOptions
): Promise<void> {
  const names = await getBucketNames(supabase);
  if (names.has(bucketName)) return;

  const { error } = await supabase.storage.createBucket(bucketName, options);
  if (error && error.message !== "The resource already exists") {
    throw error;
  }
  names.add(bucketName);
}
