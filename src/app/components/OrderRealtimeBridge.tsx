import { useEffect, useRef } from "react";
import { supabase } from "../contexts/AuthContext";
import { notifyAdminOrdersUpdated } from "../utils/adminOrdersRealtime";

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

  return null;
}
