import { supabase } from "../contexts/AuthContext";
import { cacheManager } from "./cacheManager";
import { invalidateAdminCustomersCache } from "./module-cache";

export const CUSTOMERS_DATA_UPDATED_EVENT = "customersDataUpdated";
export const VENDOR_AUDIENCE_UPDATED_EVENT = "vendorAudienceUpdated";
const CUSTOMERS_BC_NAME = "migoo-customers-realtime";
const CUSTOMERS_BROADCAST_CHANNEL = "sec-customers-v1";

export type CustomerRealtimePayload = {
  event: "register" | "login" | "audience";
  userId?: string;
  /** Slug and/or internal vendor id — listeners match any entry. */
  vendorIds?: string[];
};

async function waitSubscribed(
  ch: ReturnType<typeof supabase.channel>,
  ms = 8000
): Promise<boolean> {
  return new Promise((resolve) => {
    const t = setTimeout(() => resolve(false), ms);
    ch.subscribe((status) => {
      if (status === "SUBSCRIBED") {
        clearTimeout(t);
        resolve(true);
      }
      if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") {
        clearTimeout(t);
        resolve(false);
      }
    });
  });
}

function payloadMatchesVendor(
  payload: CustomerRealtimePayload | undefined,
  vendorId: string | undefined
): boolean {
  if (!vendorId) return true;
  const ids = payload?.vendorIds;
  if (!ids?.length) return true;
  return ids.some((id) => String(id).trim() === String(vendorId).trim());
}

/** Same-tab + cross-tab (BroadcastChannel) fan-out. */
export function notifyCustomerRealtimeLocal(payload: CustomerRealtimePayload): void {
  if (typeof window === "undefined") return;
  try {
    window.dispatchEvent(
      new CustomEvent(CUSTOMERS_DATA_UPDATED_EVENT, { detail: payload })
    );
  } catch {
    /* ignore */
  }
  if (payload.vendorIds?.length) {
    try {
      window.dispatchEvent(
        new CustomEvent(VENDOR_AUDIENCE_UPDATED_EVENT, { detail: payload })
      );
    } catch {
      /* ignore */
    }
  }
  try {
    const bc = new BroadcastChannel(CUSTOMERS_BC_NAME);
    bc.postMessage(payload);
    bc.close();
  } catch {
    /* ignore */
  }
}

/** Cross-device Supabase Realtime broadcast (storefront → open admin tabs). */
export async function broadcastCustomerRealtime(
  payload: CustomerRealtimePayload
): Promise<void> {
  notifyCustomerRealtimeLocal(payload);
  if (typeof window === "undefined") return;
  const ch = supabase.channel(CUSTOMERS_BROADCAST_CHANNEL, {
    config: { broadcast: { ack: false } },
  });
  const ok = await waitSubscribed(ch);
  if (!ok) {
    try {
      await supabase.removeChannel(ch);
    } catch {
      /* ignore */
    }
    return;
  }
  try {
    await ch.send({
      type: "broadcast",
      event: "customer-update",
      payload,
    });
  } finally {
    try {
      await supabase.removeChannel(ch);
    } catch {
      /* ignore */
    }
  }
}

export function invalidateVendorAudienceListCache(vendorId: string): void {
  if (!vendorId || typeof window === "undefined") return;
  cacheManager.invalidatePrefix(`vendor-admin-audience:${vendorId}:`);
}

/** After storefront register / audience track — refresh super-admin + vendor admin lists. */
export function notifyStorefrontCustomerRegistered(opts: {
  userId: string;
  vendorIds?: string[];
  event?: "register" | "login" | "audience";
}): void {
  const payload: CustomerRealtimePayload = {
    event: opts.event ?? "register",
    userId: opts.userId,
    vendorIds: opts.vendorIds?.filter(Boolean),
  };
  invalidateAdminCustomersCache();
  if (opts.vendorIds?.length) {
    for (const vid of opts.vendorIds) {
      invalidateVendorAudienceListCache(vid);
    }
  }
  void broadcastCustomerRealtime(payload);
}

export function subscribeCustomerRealtime(
  onUpdate: (payload: CustomerRealtimePayload) => void,
  opts?: { vendorId?: string }
): () => void {
  if (typeof window === "undefined") {
    return () => {};
  }

  const handlePayload = (payload: CustomerRealtimePayload | undefined) => {
    if (!payloadMatchesVendor(payload, opts?.vendorId)) return;
    onUpdate(payload ?? { event: "audience" });
  };

  const onWindow = (e: Event) => {
    handlePayload((e as CustomEvent<CustomerRealtimePayload>).detail);
  };

  window.addEventListener(CUSTOMERS_DATA_UPDATED_EVENT, onWindow);
  window.addEventListener(VENDOR_AUDIENCE_UPDATED_EVENT, onWindow);

  let bc: BroadcastChannel | null = null;
  try {
    bc = new BroadcastChannel(CUSTOMERS_BC_NAME);
    bc.onmessage = (ev: MessageEvent<CustomerRealtimePayload>) => {
      handlePayload(ev.data);
    };
  } catch {
    /* ignore */
  }

  const ch = supabase
    .channel(CUSTOMERS_BROADCAST_CHANNEL, { config: { broadcast: { ack: false } } })
    .on(
      "broadcast",
      { event: "customer-update" },
      (ctx: { payload?: CustomerRealtimePayload }) => {
        handlePayload(ctx?.payload);
      }
    );
  ch.subscribe();

  return () => {
    window.removeEventListener(CUSTOMERS_DATA_UPDATED_EVENT, onWindow);
    window.removeEventListener(VENDOR_AUDIENCE_UPDATED_EVENT, onWindow);
    bc?.close();
    try {
      void supabase.removeChannel(ch);
    } catch {
      /* ignore */
    }
  };
}
