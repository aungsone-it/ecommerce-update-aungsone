import { supabase } from "../contexts/AuthContext";
import { moduleCache, CACHE_KEYS } from "./module-cache";
import { removePersistedKey, LS_STOREFRONT_SETTINGS } from "./persistedLocalCache";

export const STOREFRONT_POLICY_UPDATED_EVENT = "storefrontPolicyUpdated";
export const STOREFRONT_POLICY_BROADCAST_CHANNEL = "migoo-storefront-policy-v1";

const PLATFORM_KV_KEY = "site_settings_general";
const DEBOUNCE_MS = 280;

export type StorefrontPolicyUpdateScope = "platform" | "vendor";

export type StorefrontPolicyUpdateDetail = {
  scope: StorefrontPolicyUpdateScope;
  vendorId?: string;
  storeSlug?: string;
};

export function invalidatePlatformStorefrontPolicyCaches(): void {
  moduleCache.invalidate(CACHE_KEYS.STOREFRONT_SETTINGS);
  removePersistedKey(LS_STOREFRONT_SETTINGS);
}

export function notifyStorefrontPolicyUpdated(detail: StorefrontPolicyUpdateDetail): void {
  if (detail.scope === "platform") {
    invalidatePlatformStorefrontPolicyCaches();
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

function shouldHandlePolicyUpdate(
  detail: StorefrontPolicyUpdateDetail,
  watch: { vendorId?: string | null; includePlatform: boolean }
): boolean {
  if (detail.scope === "platform" && watch.includePlatform) return true;
  if (detail.scope !== "vendor") return false;
  const updatedVendorId = String(detail.vendorId || "").trim();
  const watchVendorId = String(watch.vendorId || "").trim();
  if (watchVendorId && updatedVendorId && watchVendorId === updatedVendorId) return true;
  return false;
}

export type SubscribeStorefrontPolicyOptions = {
  vendorId?: string | null;
  /** Refetch when platform general settings change (vendor pages use as fallback). */
  includePlatform?: boolean;
  onUpdate: () => void;
};

/** Live KV + cross-tab updates for Terms / Privacy public pages and settings forms. */
export function subscribeStorefrontPolicyUpdates(
  options: SubscribeStorefrontPolicyOptions
): () => void {
  const includePlatform = options.includePlatform !== false;
  let debounce: ReturnType<typeof setTimeout> | null = null;
  const schedule = () => {
    if (debounce) clearTimeout(debounce);
    debounce = setTimeout(() => {
      debounce = null;
      options.onUpdate();
    }, DEBOUNCE_MS);
  };

  const onCustom = (event: Event) => {
    const detail = (event as CustomEvent<StorefrontPolicyUpdateDetail>).detail;
    if (!detail) return;
    if (shouldHandlePolicyUpdate(detail, {
      vendorId: options.vendorId,
      includePlatform,
    })) {
      schedule();
    }
  };

  const onVendorSettings = (event: Event) => {
    const detail = (event as CustomEvent<{ vendorId?: string }>).detail;
    if (!detail?.vendorId || !options.vendorId) return;
    if (String(detail.vendorId) === String(options.vendorId)) schedule();
  };

  window.addEventListener(STOREFRONT_POLICY_UPDATED_EVENT, onCustom);
  window.addEventListener("vendorSettingsUpdated", onVendorSettings);

  let bc: BroadcastChannel | null = null;
  try {
    bc = new BroadcastChannel(STOREFRONT_POLICY_BROADCAST_CHANNEL);
    bc.onmessage = (msg) => {
      const detail = msg.data as StorefrontPolicyUpdateDetail;
      if (
        detail &&
        shouldHandlePolicyUpdate(detail, {
          vendorId: options.vendorId,
          includePlatform,
        })
      ) {
        schedule();
      }
    };
  } catch {
    /* ignore */
  }

  const storefrontKey = options.vendorId
    ? `vendor_storefront_${options.vendorId}`
    : null;

  const channel = supabase
    .channel(`storefront-policy-kv-${options.vendorId || "platform"}`)
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "kv_store_16010b6f" },
      (payload: { new?: { key?: string }; old?: { key?: string } }) => {
        const key = String(payload?.new?.key || payload?.old?.key || "");
        if (!key) return;
        if (includePlatform && key === PLATFORM_KV_KEY) {
          schedule();
          return;
        }
        if (storefrontKey && key === storefrontKey) {
          schedule();
        }
      }
    )
    .subscribe();

  return () => {
    if (debounce) clearTimeout(debounce);
    window.removeEventListener(STOREFRONT_POLICY_UPDATED_EVENT, onCustom);
    window.removeEventListener("vendorSettingsUpdated", onVendorSettings);
    if (bc) bc.close();
    void supabase.removeChannel(channel);
  };
}
