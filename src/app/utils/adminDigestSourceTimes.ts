import { PENDING_ORDER_STATUSES } from "../../constants";
import { moduleCache, CACHE_KEYS } from "./module-cache";

function parseTimeMs(v: unknown): number | null {
  if (v == null || v === "") return null;
  const t = new Date(String(v)).getTime();
  return Number.isNaN(t) ? null : t;
}

/** Best-effort “when this order mattered” from common API shapes. */
function orderActivityMs(o: Record<string, unknown>): number | null {
  const keys = [
    "createdAt",
    "updatedAt",
    "placedAt",
    "orderDate",
    "date",
    "created_at",
    "updated_at",
  ] as const;
  let best: number | null = null;
  for (const k of keys) {
    const m = parseTimeMs(o[k]);
    if (m != null && (best == null || m > best)) best = m;
  }
  return best;
}

function orderIsPendingForBadge(o: unknown): boolean {
  const st = (o as { status?: unknown })?.status;
  return (PENDING_ORDER_STATUSES as readonly string[]).includes(st as string);
}

/**
 * Latest activity time among orders that count toward the admin “pending orders” badge
 * (same status bucket as `useBadgeCounts`), from cached full orders payload.
 */
export function peekPendingOrdersDigestSourceMs(): number | null {
  const payload = moduleCache.peek<{ orders?: unknown[] }>(CACHE_KEYS.ADMIN_ORDERS);
  const orders = payload?.orders;
  if (!Array.isArray(orders) || orders.length === 0) return null;
  let max: number | null = null;
  for (const raw of orders) {
    if (!orderIsPendingForBadge(raw)) continue;
    const m = orderActivityMs(raw as Record<string, unknown>);
    if (m != null && (max == null || m > max)) max = m;
  }
  return max;
}

/**
 * Latest submitted/created time among pending vendor applications in module cache.
 */
export function peekPendingVendorApplicationsDigestSourceMs(): number | null {
  const raw = moduleCache.peek<Record<string, unknown>[]>(CACHE_KEYS.ADMIN_VENDOR_APPLICATIONS);
  if (!Array.isArray(raw) || raw.length === 0) return null;
  let max: number | null = null;
  for (const a of raw) {
    if (String(a?.status ?? "").toLowerCase() !== "pending") continue;
    for (const k of ["submittedAt", "createdAt", "updatedAt", "appliedAt"] as const) {
      const m = parseTimeMs(a[k]);
      if (m != null && (max == null || m > max)) max = m;
    }
  }
  return max;
}
