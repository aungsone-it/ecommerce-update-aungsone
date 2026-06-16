import { moduleCache, CACHE_KEYS } from "./module-cache";
import { removePersistedKey, LS_STOREFRONT_SETTINGS } from "./persistedLocalCache";
import { invalidateStorefrontPolicyCache } from "../hooks/useStorefrontPolicyData";
import type { StorefrontPolicyKind } from "./storefrontPolicyPaths";

export const STOREFRONT_POLICY_UPDATED_EVENT = "storefrontPolicyUpdated";
export const STOREFRONT_POLICY_BROADCAST_CHANNEL = "migoo-storefront-policy-v1";

const PLATFORM_KV_KEY = "site_settings_general";
const DEBOUNCE_MS = 120;
const LIVE_PATCH_DEBOUNCE_MS = 0;

export type StorefrontPolicyUpdateScope = "platform" | "vendor";

export type StorefrontPolicySnapshot = {
  storeName?: string;
  storeEmail?: string;
  storeAddress?: string;
  termsContent?: string;
  privacyPolicyContent?: string;
  vendorId?: string;
  storeSlug?: string;
};

export type StorefrontPolicyLivePatch = {
  scope: StorefrontPolicyUpdateScope;
  kind: StorefrontPolicyKind;
  storeSlug: string | null;
  vendorId?: string;
  storeName: string;
  storeEmail?: string;
  storeAddress?: string;
  content: string;
};

export type StorefrontPolicyUpdateDetail = {
  scope: StorefrontPolicyUpdateScope;
  vendorId?: string;
  storeSlug?: string;
  snapshot?: StorefrontPolicySnapshot;
};

export function invalidatePlatformStorefrontPolicyCaches(): void {
  moduleCache.invalidate(CACHE_KEYS.STOREFRONT_SETTINGS);
  removePersistedKey(LS_STOREFRONT_SETTINGS);
  invalidateStorefrontPolicyCache(null);
}

export function parseStorefrontPolicyKvSnapshot(
  key: string,
  value: unknown
): StorefrontPolicySnapshot | null {
  if (!value || typeof value !== "object") return null;
  const row = value as Record<string, unknown>;

  if (key === PLATFORM_KV_KEY) {
    return {
      storeName: String(row.storeName || "").trim() || undefined,
      storeEmail: String(row.storeEmail || "").trim() || undefined,
      storeAddress: String(row.storeAddress || "").trim() || undefined,
      termsContent: String(row.termsContent || ""),
      privacyPolicyContent: String(row.privacyPolicyContent || ""),
    };
  }

  if (key.startsWith("vendor_storefront_")) {
    return {
      storeName: String(row.storeName || "").trim() || undefined,
      storeEmail: String(row.contactEmail || "").trim() || undefined,
      storeAddress: String(row.address || "").trim() || undefined,
      termsContent: String(row.termsContent || ""),
      privacyPolicyContent: String(row.privacyPolicyContent || ""),
      vendorId: key.slice("vendor_storefront_".length),
      storeSlug: String(row.storeSlug || "").trim() || undefined,
    };
  }

  return null;
}

function contentFromSnapshot(
  snapshot: StorefrontPolicySnapshot,
  kind: StorefrontPolicyKind
): string {
  return kind === "terms"
    ? String(snapshot.termsContent || "").trim()
    : String(snapshot.privacyPolicyContent || "").trim();
}

export function buildStorefrontPolicyLivePatches(
  detail: StorefrontPolicyUpdateDetail
): StorefrontPolicyLivePatch[] {
  const snapshot = detail.snapshot;
  if (!snapshot) return [];

  const storeSlug =
    detail.scope === "platform" ? null : String(detail.storeSlug || snapshot.storeSlug || "").trim() || null;
  const storeName = String(snapshot.storeName || storeSlug || "SECURE").trim() || "SECURE";

  return (["terms", "privacy"] as const).map((kind) => ({
    scope: detail.scope,
    kind,
    storeSlug,
    vendorId: detail.vendorId || snapshot.vendorId,
    storeName,
    storeEmail: snapshot.storeEmail,
    storeAddress: snapshot.storeAddress,
    content: contentFromSnapshot(snapshot, kind),
  }));
}

export function buildStorefrontPolicyLivePatchesFromKv(
  key: string,
  value: unknown
): StorefrontPolicyLivePatch[] {
  const snapshot = parseStorefrontPolicyKvSnapshot(key, value);
  if (!snapshot) return [];

  const scope: StorefrontPolicyUpdateScope = key === PLATFORM_KV_KEY ? "platform" : "vendor";
  return buildStorefrontPolicyLivePatches({
    scope,
    vendorId: snapshot.vendorId,
    storeSlug: snapshot.storeSlug,
    snapshot,
  });
}

export function notifyStorefrontPolicyUpdated(detail: StorefrontPolicyUpdateDetail): void {
  if (detail.scope === "platform") {
    invalidatePlatformStorefrontPolicyCaches();
  } else if (detail.storeSlug) {
    invalidateStorefrontPolicyCache(detail.storeSlug);
  }

  if (typeof window === "undefined") return;

  window.dispatchEvent(
    new CustomEvent<StorefrontPolicyUpdateDetail>(STOREFRONT_POLICY_UPDATED_EVENT, {
      detail,
    })
  );

  try {
    const bc = new BroadcastChannel(STOREFRONT_POLICY_BROADCAST_CHANNEL);
    bc.postMessage(detail);
    bc.close();
  } catch {
    /* BroadcastChannel unsupported */
  }
}

function normalizeSlug(value: string | null | undefined): string {
  return String(value || "")
    .trim()
    .toLowerCase();
}

function shouldHandlePolicyUpdate(
  detail: StorefrontPolicyUpdateDetail,
  watch: {
    vendorId?: string | null;
    storeSlug?: string | null;
    includePlatform: boolean;
  }
): boolean {
  if (detail.scope === "platform" && watch.includePlatform) return true;
  if (detail.scope !== "vendor") return false;

  const watchSlug = normalizeSlug(watch.storeSlug);
  const detailSlug = normalizeSlug(detail.storeSlug || detail.snapshot?.storeSlug);
  if (watchSlug && detailSlug && watchSlug === detailSlug) return true;

  const updatedVendorId = String(detail.vendorId || detail.snapshot?.vendorId || "").trim();
  const watchVendorId = String(watch.vendorId || "").trim();
  if (watchVendorId && updatedVendorId && watchVendorId === updatedVendorId) return true;

  return false;
}

function patchMatchesWatch(
  patch: StorefrontPolicyLivePatch,
  watch: {
    vendorId?: string | null;
    storeSlug?: string | null;
    kind?: StorefrontPolicyKind;
    includePlatform: boolean;
  }
): boolean {
  if (watch.kind && patch.kind !== watch.kind) return false;

  if (patch.scope === "platform") return watch.includePlatform;

  const watchSlug = normalizeSlug(watch.storeSlug);
  const patchSlug = normalizeSlug(patch.storeSlug);
  if (watchSlug && patchSlug && watchSlug === patchSlug) return true;

  const watchVendorId = String(watch.vendorId || "").trim();
  const patchVendorId = String(patch.vendorId || "").trim();
  if (watchVendorId && patchVendorId && watchVendorId === patchVendorId) return true;

  return false;
}

export type SubscribeStorefrontPolicyOptions = {
  vendorId?: string | null;
  storeSlug?: string | null;
  kind?: StorefrontPolicyKind;
  /** Refetch when platform general settings change (vendor pages use as fallback). */
  includePlatform?: boolean;
  /** Apply KV / broadcast payload instantly without waiting for HTTP. */
  onLivePatch?: (patch: StorefrontPolicyLivePatch) => void;
  onUpdate: () => void;
};

/** Live KV + cross-tab updates for Terms / Privacy public pages and settings forms. */
export function subscribeStorefrontPolicyUpdates(
  options: SubscribeStorefrontPolicyOptions
): () => void {
  const includePlatform = options.includePlatform !== false;
  let debounce: ReturnType<typeof setTimeout> | null = null;
  let livePatchTimer: ReturnType<typeof setTimeout> | null = null;

  const scheduleRefresh = () => {
    if (debounce) clearTimeout(debounce);
    debounce = setTimeout(() => {
      debounce = null;
      options.onUpdate();
    }, DEBOUNCE_MS);
  };

  const emitLivePatches = (patches: StorefrontPolicyLivePatch[]) => {
    if (!options.onLivePatch || patches.length === 0) return;
    const matched = patches.filter((patch) =>
      patchMatchesWatch(patch, {
        vendorId: options.vendorId,
        storeSlug: options.storeSlug,
        kind: options.kind,
        includePlatform,
      })
    );
    if (matched.length === 0) return;

    const run = () => {
      livePatchTimer = null;
      for (const patch of matched) {
        options.onLivePatch?.(patch);
      }
    };

    if (LIVE_PATCH_DEBOUNCE_MS <= 0) {
      run();
      return;
    }

    if (livePatchTimer) clearTimeout(livePatchTimer);
    livePatchTimer = setTimeout(run, LIVE_PATCH_DEBOUNCE_MS);
  };

  const handleDetail = (detail: StorefrontPolicyUpdateDetail | undefined) => {
    if (!detail) return;
    if (
      shouldHandlePolicyUpdate(detail, {
        vendorId: options.vendorId,
        storeSlug: options.storeSlug,
        includePlatform,
      })
    ) {
      emitLivePatches(buildStorefrontPolicyLivePatches(detail));
      scheduleRefresh();
    }
  };

  const onCustom = (event: Event) => {
    handleDetail((event as CustomEvent<StorefrontPolicyUpdateDetail>).detail);
  };

  const onVendorSettings = (event: Event) => {
    const detail = (event as CustomEvent<{ vendorId?: string; storeSlug?: string }>).detail;
    if (!detail?.vendorId && !detail?.storeSlug) return;
    if (
      (detail.vendorId &&
        options.vendorId &&
        String(detail.vendorId) === String(options.vendorId)) ||
      (detail.storeSlug &&
        options.storeSlug &&
        normalizeSlug(detail.storeSlug) === normalizeSlug(options.storeSlug))
    ) {
      scheduleRefresh();
    }
  };

  window.addEventListener(STOREFRONT_POLICY_UPDATED_EVENT, onCustom);
  window.addEventListener("vendorSettingsUpdated", onVendorSettings);
  window.addEventListener("vendorDataUpdated", scheduleRefresh);
  if (includePlatform) {
    window.addEventListener("marketingDataUpdated", scheduleRefresh);
  }

  let bc: BroadcastChannel | null = null;
  try {
    bc = new BroadcastChannel(STOREFRONT_POLICY_BROADCAST_CHANNEL);
    bc.onmessage = (msg) => {
      handleDetail(msg.data as StorefrontPolicyUpdateDetail);
    };
  } catch {
    /* ignore */
  }

  return () => {
    if (debounce) clearTimeout(debounce);
    if (livePatchTimer) clearTimeout(livePatchTimer);
    window.removeEventListener(STOREFRONT_POLICY_UPDATED_EVENT, onCustom);
    window.removeEventListener("vendorSettingsUpdated", onVendorSettings);
    window.removeEventListener("vendorDataUpdated", scheduleRefresh);
    if (includePlatform) {
      window.removeEventListener("marketingDataUpdated", scheduleRefresh);
    }
    if (bc) bc.close();
  };
}
