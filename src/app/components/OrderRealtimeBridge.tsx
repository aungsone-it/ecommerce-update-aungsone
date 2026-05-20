import { useEffect, useRef } from "react";
import { supabase } from "../contexts/AuthContext";
import { notifyAdminOrdersUpdated } from "../utils/adminOrdersRealtime";
import {
  dispatchAdminProductsCachePatched,
  notifyAdminVendorApplicationsUpdated,
} from "../utils/module-cache";

const PULSE_TABLE = "app_order_pulse";
const DEBOUNCE_MS = 400;

/**
 * One Realtime subscription for the whole SPA (everything under `ProvidersWrapper`):
 * marketplace storefront, vendor storefront, vendor admin, super-admin — any route
 * that uses this app shell. Order KV changes bump `app_order_pulse` in Postgres;
 * we debounce and fan out via `notifyAdminOrdersUpdated`.
 */
export function OrderRealtimeBridge() {
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const kvDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** `vendor_application:*` KV rows were touched — fan out to applications listeners + badge. */
  const vendorApplicationKvPendingRef = useRef(false);

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
        if (status === "CHANNEL_ERROR") {
          console.warn("[OrderRealtime] channel error — using events/polling fallback only");
        }
      });

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      void supabase.removeChannel(channel);
    };
  }, []);

  // Global KV realtime bridge for all main admin/storefront sections.
  // Emits lightweight browser events; feature modules decide whether to refetch.
  useEffect(() => {
    const domains = new Set<string>();
    const flush = () => {
      if (domains.size === 0) return;
      const list = [...domains];
      const shouldNotifyVendorApplications = vendorApplicationKvPendingRef.current;
      vendorApplicationKvPendingRef.current = false;
      domains.clear();
      if (list.includes("orders")) {
        notifyAdminOrdersUpdated("realtime-order-pulse");
      }
      if (list.includes("products")) {
        dispatchAdminProductsCachePatched();
      }
      if (typeof window !== "undefined") {
        if (list.includes("categories")) {
          window.dispatchEvent(new CustomEvent("categoryDataUpdated"));
        }
        if (list.includes("customers")) {
          window.dispatchEvent(new CustomEvent("customersDataUpdated"));
        }
        if (list.includes("vendors")) {
          window.dispatchEvent(new CustomEvent("vendorDataUpdated"));
          if (shouldNotifyVendorApplications) {
            notifyAdminVendorApplicationsUpdated("realtime-kv");
          }
        }
        if (list.includes("marketing")) {
          window.dispatchEvent(new CustomEvent("marketingDataUpdated"));
        }
      }
    };

    const schedule = (domain: string) => {
      domains.add(domain);
      if (kvDebounceRef.current) clearTimeout(kvDebounceRef.current);
      kvDebounceRef.current = setTimeout(() => {
        kvDebounceRef.current = null;
        flush();
      }, DEBOUNCE_MS);
    };

    const channel = supabase
      .channel("sec-kv-global-realtime-v1")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "kv_store_16010b6f" },
        (payload: any) => {
          const key = String(payload?.new?.key || payload?.old?.key || "");
          if (!key) return;
          if (key.startsWith("vendor_application:")) {
            vendorApplicationKvPendingRef.current = true;
            return schedule("vendors");
          }
          if (key.startsWith("order:")) return schedule("orders");
          if (key.startsWith("product:")) return schedule("products");
          if (key.startsWith("category:")) return schedule("categories");
          if (
            key.startsWith("customer:") ||
            key.startsWith("user:") ||
            key.startsWith("auth:user:") ||
            key.startsWith("userId:")
          ) {
            return schedule("customers");
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
        }
      )
      .subscribe();

    return () => {
      if (kvDebounceRef.current) clearTimeout(kvDebounceRef.current);
      void supabase.removeChannel(channel);
    };
  }, []);

  return null;
}
