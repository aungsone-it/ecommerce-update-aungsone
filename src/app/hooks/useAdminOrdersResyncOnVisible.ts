import { useEffect, useRef } from "react";

/** Min gap between tab-focus order refetches (Realtime is primary; this is HTTP fallback). */
const ORDERS_VISIBILITY_RESYNC_MIN_MS = 45_000;

/**
 * When Realtime websocket drops (flaky network), refetch orders after the tab becomes visible.
 * Throttled so focus-switching does not spam the edge API.
 */
export function useAdminOrdersResyncOnVisible(onResync: () => void, enabled = true): void {
  const lastAtRef = useRef(0);
  const onResyncRef = useRef(onResync);
  onResyncRef.current = onResync;

  useEffect(() => {
    if (!enabled || typeof document === "undefined") return;
    const onVis = () => {
      if (document.visibilityState !== "visible") return;
      const now = Date.now();
      if (now - lastAtRef.current < ORDERS_VISIBILITY_RESYNC_MIN_MS) return;
      lastAtRef.current = now;
      onResyncRef.current();
    };
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, [enabled]);
}
