/** Map arbitrary API / UI strings to keys used by admin order badge maps (never undefined lookups). */

export type AdminOrderBadgeStatus =
  | "pending"
  | "processing"
  | "fulfilled"
  | "cancelled"
  | "ready-to-ship";

export type AdminPaymentBadgeStatus = "paid" | "unpaid" | "refunded" | "pending-refund";

export type AdminShippingBadgeStatus = "pending" | "shipped" | "delivered" | "cancelled";

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
  if (s === "cancelled" || s === "canceled" || s === "cancel") return "cancelled";
  return "pending";
}

type OrderLikeForBadges = {
  status?: unknown;
  paymentStatus?: unknown;
  paymentMethod?: unknown;
  shippingStatus?: unknown;
  kpay?: {
    status?: string;
    refund?: { status?: string };
  };
};

/** Payment badge value for admin order rows (cancelled → Refund, not Unpaid). */
export function derivePaymentStatusFromOrder(order: OrderLikeForBadges): string {
  const cancelled = normalizeAdminOrderStatusForBadge(order.status) === "cancelled";
  const raw = String(order.paymentStatus || "")
    .trim()
    .toLowerCase()
    .replace(/_/g, "-");

  if (cancelled) {
    if (raw === "refunded") return "refunded";
    const kpayRefund = String(order.kpay?.refund?.status || "").toLowerCase();
    if (kpayRefund === "success" || kpayRefund === "already-refunded" || kpayRefund === "already_refunded") {
      return "refunded";
    }
    return "pending_refund";
  }

  if (raw === "pending-refund" || raw === "pendingrefund") return "pending_refund";
  if (raw === "refunded" || raw === "refund") return "refunded";
  if (raw === "paid" || raw === "complete") return "paid";
  if (raw === "unpaid") return "unpaid";
  if (order.paymentMethod === "Cash on Delivery" || order.paymentMethod === "cod") return "unpaid";
  return "paid";
}

/** Shipping badge value for admin order rows (cancelled → Cancel, not Pending). */
export function deriveShippingStatusFromOrder(order: OrderLikeForBadges): AdminShippingBadgeStatus {
  if (normalizeAdminOrderStatusForBadge(order.status) === "cancelled") {
    return "cancelled";
  }
  const stored = normalizeShippingBadgeStatus(order.shippingStatus);
  if (order.shippingStatus != null && String(order.shippingStatus).trim() !== "") {
    return stored;
  }
  const st = String(order.status || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "-");
  if (st === "delivered" || st === "fulfilled") return "delivered";
  if (st === "shipped") return "shipped";
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
