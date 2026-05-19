/** Map arbitrary API / UI strings to keys used by admin order badge maps (never undefined lookups). */

export type AdminOrderBadgeStatus =
  | "pending"
  | "processing"
  | "fulfilled"
  | "cancelled"
  | "ready-to-ship";

export type AdminPaymentBadgeStatus = "paid" | "unpaid" | "refunded" | "pending-refund";

export type AdminShippingBadgeStatus = "pending" | "shipped" | "delivered";

export function normalizeAdminOrderStatusForBadge(raw: unknown): AdminOrderBadgeStatus {
  const s = String(raw ?? "pending")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/_/g, "-");
  if (s === "delivered" || s === "completed" || s === "complete") return "fulfilled";
  if (s === "shipped" || s === "in-transit" || s === "shipping" || s === "dispatch") return "processing";
  if (s === "ready-to-ship" || s === "readytoship" || s === "ready") {
    return "ready-to-ship";
  }
  if (s === "canceled") return "cancelled";
  if (s === "cancelled") return "cancelled";
  if (s === "processing" || s === "in-progress") return "processing";
  if (s === "fulfilled") return "fulfilled";
  if (s === "pending-payment" || s === "pending") return "pending";
  return "pending";
}

export function normalizePaymentBadgeStatus(raw: unknown): AdminPaymentBadgeStatus {
  const s = String(raw ?? "unpaid").trim().toLowerCase().replace(/_/g, "-");
  if (s === "paid" || s === "complete") return "paid";
  if (s === "refunded" || s === "refund") return "refunded";
  if (s === "pending-refund" || s === "pendingrefund") return "pending-refund";
  return "unpaid";
}

export function normalizeShippingBadgeStatus(raw: unknown): AdminShippingBadgeStatus {
  const s = String(raw ?? "pending")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/_/g, "-");
  if (s === "delivered" || s === "delivery") return "delivered";
  if (s === "shipped" || s === "shipping" || s === "in-transit") return "shipped";
  return "pending";
}

const CUSTOMER_ORDER_STATUS_LABELS: Record<AdminOrderBadgeStatus, string> = {
  pending: "Pending",
  processing: "Processing",
  fulfilled: "Delivered",
  cancelled: "Cancelled",
  "ready-to-ship": "Shipping",
};

/** Customer-facing order history badge label (never shows raw API values like pending_payment). */
export function getCustomerOrderStatusLabel(raw: unknown): string {
  const key = normalizeAdminOrderStatusForBadge(raw);
  return CUSTOMER_ORDER_STATUS_LABELS[key];
}

/** Tailwind background class for customer order status badges. */
export function getCustomerOrderStatusColor(raw: unknown): string {
  const key = normalizeAdminOrderStatusForBadge(raw);
  switch (key) {
    case "fulfilled":
      return "bg-emerald-600";
    case "processing":
      return "bg-blue-600";
    case "ready-to-ship":
      return "bg-blue-600";
    case "cancelled":
      return "bg-red-600";
    default:
      return "bg-slate-600";
  }
}
