import { vendorOrderGrandTotalDisplay } from "./vendorOrderTotals";

/** Parse order timestamp for sorting / windows (ms). */
export function vendorOrderTimeMs(order: any): number {
  const t = order?.createdAt ?? order?.date;
  if (t == null || t === "") return 0;
  const ms = new Date(t).getTime();
  return Number.isFinite(ms) ? ms : 0;
}

/** Grand total for display — matches vendor orders list logic. */
export function vendorOrderDisplayTotal(order: any): number {
  const total =
    typeof order?.total === "number"
      ? order.total
      : parseFloat(String(order?.total ?? 0).replace(/[$,]/g, "")) || 0;
  const sub =
    order?.subtotal != null && order.subtotal !== ""
      ? parseFloat(String(order.subtotal).replace(/[$,]/g, ""))
      : undefined;
  const disc =
    order?.discount != null && order.discount !== ""
      ? parseFloat(String(order.discount).replace(/[$,]/g, ""))
      : undefined;
  return vendorOrderGrandTotalDisplay({ total, subtotal: sub, discount: disc });
}

export function isVendorOrderActive(order: any): boolean {
  const s = String(order?.status ?? "").toLowerCase();
  return s !== "cancelled";
}

export function daysForVendorDashboardLabel(label: string): number {
  switch (label) {
    case "Last 7 days":
      return 7;
    case "Last 30 days":
      return 30;
    case "Last 90 days":
      return 90;
    case "Last year":
      return 365;
    default:
      return 30;
  }
}

/** Orders with order time in (endMs - days, endMs]. */
export function filterOrdersInRollingWindow(
  orders: any[],
  days: number,
  endMs: number
): any[] {
  const start = endMs - days * 24 * 60 * 60 * 1000;
  return orders.filter((o) => {
    const ms = vendorOrderTimeMs(o);
    return ms >= start && ms <= endMs;
  });
}

/** Previous window of same length immediately before `currentStart`. */
export function filterOrdersInPriorWindow(
  orders: any[],
  days: number,
  currentStartMs: number
): any[] {
  const end = currentStartMs;
  const start = currentStartMs - days * 24 * 60 * 60 * 1000;
  return orders.filter((o) => {
    const ms = vendorOrderTimeMs(o);
    return ms >= start && ms <= end;
  });
}

export function pctChangePriorWindow(current: number, previous: number): number {
  if (previous <= 0) return current > 0 ? 100 : 0;
  return Math.round(((current - previous) / previous) * 1000) / 10;
}

export function sumOrderRevenue(orders: any[]): number {
  return orders.filter(isVendorOrderActive).reduce((s, o) => s + vendorOrderDisplayTotal(o), 0);
}

export function countActiveOrders(orders: any[]): number {
  return orders.filter(isVendorOrderActive).length;
}

export function uniqueCustomerEmails(orders: any[]): number {
  const set = new Set<string>();
  for (const o of orders) {
    if (!isVendorOrderActive(o)) continue;
    const e = String(o?.email ?? o?.customerEmail ?? "")
      .trim()
      .toLowerCase();
    if (e) set.add(e);
  }
  return set.size;
}

/** Line item product id for aggregation. */
function lineProductId(item: any): string {
  const id = item?.productId ?? item?.id;
  return id != null ? String(id) : "";
}

function lineProductName(item: any): string {
  return String(item?.productName ?? item?.name ?? "Product");
}

function linePrice(item: any): number {
  if (typeof item?.price === "number") return item.price;
  return parseFloat(String(item?.price ?? 0).replace(/[$,]/g, "")) || 0;
}

function lineQty(item: any): number {
  const q = item?.quantity ?? 1;
  const n = typeof q === "number" ? q : parseInt(String(q), 10);
  return Number.isFinite(n) && n > 0 ? n : 1;
}

export type TopProductRow = { id: string; name: string; sales: number; revenue: number };

export function topProductsFromOrders(orders: any[], limit: number): TopProductRow[] {
  const map = new Map<string, { name: string; sales: number; revenue: number }>();
  for (const order of orders) {
    if (!isVendorOrderActive(order) || !Array.isArray(order.items)) continue;
    for (const item of order.items) {
      const pid = lineProductId(item);
      if (!pid) continue;
      const name = lineProductName(item);
      const qty = lineQty(item);
      const rev = linePrice(item) * qty;
      const cur = map.get(pid) || { name, sales: 0, revenue: 0 };
      cur.sales += qty;
      cur.revenue += rev;
      if (name && name !== "Product") cur.name = name;
      map.set(pid, cur);
    }
  }
  return Array.from(map.entries())
    .map(([id, data]) => ({ id, ...data }))
    .sort((a, b) => b.sales - a.sales)
    .slice(0, limit);
}

export type RecentOrderRow = {
  id: string;
  customerName: string;
  items: number;
  total: number;
  status: string;
  date: string;
};

export function recentOrdersFromList(orders: any[], limit: number): RecentOrderRow[] {
  return [...orders]
    .sort((a, b) => vendorOrderTimeMs(b) - vendorOrderTimeMs(a))
    .slice(0, limit)
    .map((order: any) => ({
      id: order.id,
      customerName:
        order.customerName ||
        (typeof order.customer === "string" ? order.customer : "") ||
        order.name ||
        "Guest",
      items: Array.isArray(order.items) ? order.items.length : order.items ?? 0,
      total: vendorOrderDisplayTotal(order),
      status: order.status || "pending",
      date: order.createdAt || order.date || new Date().toISOString(),
    }));
}

export type MonthlyPoint = { month: string; revenue: number; orders: number };

/** Last `monthsBack` calendar months including current; buckets by YYYY-MM. */
export function buildMonthlySeries(orders: any[], monthsBack: number): MonthlyPoint[] {
  const active = orders.filter(isVendorOrderActive);
  const now = new Date();
  const series: { ym: number; month: string; revenue: number; orders: number }[] = [];
  for (let i = monthsBack - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const ym = d.getFullYear() * 100 + (d.getMonth() + 1);
    series.push({
      ym,
      month: d.toLocaleString("default", { month: "short", year: "numeric" }),
      revenue: 0,
      orders: 0,
    });
  }
  for (const o of active) {
    const dt = new Date(vendorOrderTimeMs(o));
    if (!Number.isFinite(dt.getTime())) continue;
    const ym = dt.getFullYear() * 100 + (dt.getMonth() + 1);
    const bucket = series.find((b) => b.ym === ym);
    if (bucket) {
      bucket.revenue += vendorOrderDisplayTotal(o);
      bucket.orders += 1;
    }
  }
  return series.map(({ month, revenue, orders: oc }) => ({ month, revenue, orders: oc }));
}

export function countProductsLikelyAddedInWindow(
  products: any[],
  startMs: number,
  endMs: number
): number {
  return products.filter((p) => {
    const t = p?.createdAt ?? p?.created_at ?? p?.updatedAt ?? p?.updated_at;
    if (!t) return false;
    const ms = new Date(t).getTime();
    return Number.isFinite(ms) && ms >= startMs && ms <= endMs;
  }).length;
}
