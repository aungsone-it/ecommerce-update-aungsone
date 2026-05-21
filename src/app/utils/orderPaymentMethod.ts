export type OrderPaymentMethodKey =
  | "cod"
  | "credit-card"
  | "bank-transfer"
  | "kbz-qr"
  | "kbz-pwa";

type OrderPaymentLike = {
  paymentMethod?: unknown;
  kpay?: unknown;
};

/** Normalize API / checkout paymentMethod strings to admin UI keys. */
export function deriveOrderPaymentMethodKey(order: OrderPaymentLike): OrderPaymentMethodKey {
  const raw = String(order.paymentMethod || "")
    .trim()
    .toLowerCase();
  const hasKpay = order.kpay != null && typeof order.kpay === "object";

  if (raw === "kbz-qr" || raw === "kbzqr") return "kbz-qr";
  if (raw === "kbz-pwa" || raw === "kbzpwa") return "kbz-pwa";
  if (raw === "cod") return "cod";
  if (raw === "bank-transfer" || raw === "banktransfer") return "bank-transfer";

  if (raw.includes("pwa") || raw.includes("mobile browser") || raw.includes("in app")) {
    return "kbz-pwa";
  }
  if (
    hasKpay ||
    raw.includes("kbzpay") ||
    raw.includes("kbz pay") ||
    raw === "kpay" ||
    raw.includes("kpay qr") ||
    raw.includes("kbzpay qr") ||
    raw.includes("scan qr")
  ) {
    return "kbz-qr";
  }
  if (raw.includes("cash") || raw === "cod" || raw.includes("delivery")) {
    return "cod";
  }
  if (raw.includes("bank")) {
    return "bank-transfer";
  }
  if (raw.includes("credit") || raw.includes("debit") || raw.includes("card") || raw === "credit-card") {
    return "credit-card";
  }
  return "credit-card";
}

const PAYMENT_METHOD_LABELS: Record<OrderPaymentMethodKey, string> = {
  "kbz-qr": "KBZ QR Pay",
  "kbz-pwa": "KBZPay (PWA)",
  cod: "Cash on Delivery",
  "bank-transfer": "Bank Transfer",
  "credit-card": "Credit Card",
};

export function formatOrderPaymentMethodLabel(key: OrderPaymentMethodKey): string {
  return PAYMENT_METHOD_LABELS[key];
}

export function formatOrderPaymentMethodFromOrder(order: OrderPaymentLike): string {
  return formatOrderPaymentMethodLabel(deriveOrderPaymentMethodKey(order));
}
