import { useEffect, useRef } from "react";
import { supabase } from "../contexts/AuthContext";
import { notifyAdminOrdersUpdated } from "../utils/adminOrdersRealtime";
import {
  dispatchAdminProductsCachePatched,
  notifyAdminVendorApplicationsUpdated,
} from "../utils/module-cache";
import { notifyCustomerRealtimeLocal, type CustomerRealtimePayload } from "../utils/customersRealtime";

const PULSE_TABLE = "app_order_pulse";
const VENDOR_APP_PULSE_TABLE = "app_vendor_application_pulse";
const KV_DOMAIN_PULSE_TABLE = "app_kv_domain_pulse";
const DEBOUNCE_MS = 400;
const VENDOR_APP_PULSE_DEBOUNCE_MS = 80;

/**
 * One Realtime subscription for the whole SPA (everything under `ProvidersWrapper`):
 * marketplace storefront, vendor storefront, vendor admin, super-admin — any route
 * that uses this app shell. Order KV changes bump `app_order_pulse` in Postgres;
 * we debounce and fan out via `notifyAdminOrdersUpdated`.
 */
export function OrderRealtimeBridge() {
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const vendorAppPulseDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const domainPulseDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const bump = () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => {
        debounceRef.current = null;
        notifyAdminOrdersUpdated("realtime-order-pulse");
      }, DEBOUNCE_MS);
    };

    const channel = supabase
      .channel("sec-order-pulse-v1")
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: PULSE_TABLE,
          filter: "id=eq.1",
        },
        () => bump()
      )
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: PULSE_TABLE,
          filter: "id=eq.1",
        },
        () => bump()
      )
      .subscribe((status) => {
        if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
          console.warn(`[OrderRealtime] pulse channel ${status} — rely on tab-focus refetch + storage events`);
        }
      });

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      void supabase.removeChannel(channel);
    };
  }, []);

  // Dedicated pulse for vendor applications — faster than full kv_store subscription.
  useEffect(() => {
    const bump = () => {
      if (vendorAppPulseDebounceRef.current) clearTimeout(vendorAppPulseDebounceRef.current);
      vendorAppPulseDebounceRef.current = setTimeout(() => {
        vendorAppPulseDebounceRef.current = null;
        if (typeof window !== "undefined") {
          window.dispatchEvent(new CustomEvent("vendorDataUpdated"));
        }
        notifyAdminVendorApplicationsUpdated("realtime-vendor-app-pulse");
      }, VENDOR_APP_PULSE_DEBOUNCE_MS);
    };

    const channel = supabase
      .channel("sec-vendor-app-pulse-v1")
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: VENDOR_APP_PULSE_TABLE,
          filter: "id=eq.1",
        },
        () => bump()
      )
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: VENDOR_APP_PULSE_TABLE,
          filter: "id=eq.1",
        },
        () => bump()
      )
      .subscribe((status) => {
        if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
          console.warn(
            `[OrderRealtime] vendor-app pulse channel ${status} — rely on kv bridge + badge poll`
          );
        }
      });

    return () => {
      if (vendorAppPulseDebounceRef.current) clearTimeout(vendorAppPulseDebounceRef.current);
      void supabase.removeChannel(channel);
    };
  }, []);

  // Domain pulse bridge for broad KV-backed sections.
  // The preferred path listens to a tiny non-PII pulse table. If the migration is
  // not deployed yet, temporarily fall back to the legacy broad KV channel.
  useEffect(() => {
    const domains = new Set<string>();
    let customerPayload: CustomerRealtimePayload | undefined;
    let legacyChannel: ReturnType<typeof supabase.channel> | null = null;
    let legacyStarted = false;

    const flush = () => {
      const list = [...domains];
      domains.clear();
      if (list.length === 0) return;
      if (list.includes("products")) {
        // Order-driven stock changes should patch visible rows without forcing list refetch/reset.
        dispatchAdminProductsCachePatched();
      }
      if (typeof window !== "undefined") {
        if (list.includes("categories")) {
          window.dispatchEvent(new CustomEvent("categoryDataUpdated"));
        }
        if (list.includes("customers")) {
          notifyCustomerRealtimeLocal(customerPayload ?? { event: "audience" });
          customerPayload = undefined;
        }
        if (list.includes("vendors")) {
          window.dispatchEvent(new CustomEvent("vendorDataUpdated"));
        }
        if (list.includes("marketing")) {
          window.dispatchEvent(new CustomEvent("marketingDataUpdated"));
        }
      }
    };

    const schedule = (domain: string, detail?: CustomerRealtimePayload) => {
      domains.add(domain);
      if (domain === "customers" && detail) {
        customerPayload = detail;
      }
      if (domainPulseDebounceRef.current) clearTimeout(domainPulseDebounceRef.current);
      domainPulseDebounceRef.current = setTimeout(() => {
        domainPulseDebounceRef.current = null;
        flush();
      }, DEBOUNCE_MS);
    };

    const scheduleFromKvKey = (key: string) => {
      if (!key) return;
      if (key.startsWith("order:")) return schedule("orders");
      if (key.startsWith("product:")) return schedule("products");
      if (key.startsWith("category:")) return schedule("categories");
      if (key.startsWith("vendor:audience:")) {
        const audienceVendorId = key.slice("vendor:audience:".length).trim();
        return schedule("customers", {
          event: "audience",
          vendorIds: audienceVendorId ? [audienceVendorId] : undefined,
        });
      }
      if (
        key.startsWith("customer:") ||
        key.startsWith("user:") ||
        key.startsWith("auth:user:") ||
        key.startsWith("userId:")
      ) {
        return schedule("customers", { event: "audience" });
      }
      if (key.startsWith("vendor_application:")) {
        schedule("vendors");
        return notifyAdminVendorApplicationsUpdated("realtime-kv-fallback");
      }
      if (
        key.startsWith("vendor:") ||
        key.startsWith("vendor_settings:") ||
        key.startsWith("vendor_storefront_") ||
        key.startsWith("vendor_slug_")
      ) {
        return schedule("vendors");
      }
      if (key.startsWith("campaign:") || key.startsWith("coupon:")) {
        return schedule("marketing");
      }
    };

    const startLegacyKvFallback = () => {
      if (legacyStarted) return;
      legacyStarted = true;
      legacyChannel = supabase
        .channel("sec-kv-global-realtime-fallback-v1")
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table: "kv_store_16010b6f" },
          (payload: any) => {
            const key = String(payload?.new?.key || payload?.old?.key || "");
            scheduleFromKvKey(key);
          }
        )
        .subscribe((status) => {
          if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
            console.warn(`[OrderRealtime] fallback KV channel ${status} — rely on tab-focus refetch + storage events`);
          }
        });
    };

    const channel = supabase
      .channel("sec-kv-domain-pulse-v1")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: KV_DOMAIN_PULSE_TABLE },
        (payload: any) => {
          const domain = String(payload?.new?.domain || payload?.old?.domain || "");
          if (!domain) return;
          const detail =
            domain === "customers" && payload?.new?.detail && typeof payload.new.detail === "object"
              ? (payload.new.detail as CustomerRealtimePayload)
              : undefined;
          schedule(domain, detail);
        }
      )
      .subscribe((status) => {
        if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
          console.warn(`[OrderRealtime] domain pulse channel ${status} — falling back to KV bridge`);
          startLegacyKvFallback();
        }
      });

    return () => {
      if (domainPulseDebounceRef.current) clearTimeout(domainPulseDebounceRef.current);
      void supabase.removeChannel(channel);
      if (legacyChannel) void supabase.removeChannel(legacyChannel);
    };
  }, []);

  return null;
}
