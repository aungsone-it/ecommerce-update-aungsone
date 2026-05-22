import { toast } from "sonner";
import { ordersApi } from "../../utils/api";
import { notifyAdminOrdersUpdated } from "./adminOrdersRealtime";
import { invalidateAdminOrdersCache } from "./module-cache";

export type KPayOrderLike = {
  paymentStatus?: string;
  paymentMethod?: unknown;
  kpay?: unknown;
};

/** One poll loop per order — avoids duplicate refund-status spam in Network tab. */
const activeRefundPolls = new Set<string>();

/** True for any vendor's KBZPay/KPay order that was paid (super-admin ERP cancel → refund). */
export function isKPayPaidOrderLike(order: KPayOrderLike | undefined | null): boolean {
  if (!order || String(order.paymentStatus || "").toLowerCase() !== "paid") return false;
  const pm = String(order.paymentMethod ?? "").toLowerCase();
  return pm.includes("kbz") || pm.includes("kpay") || Boolean(order.kpay);
}

/**
 * After cancel on a paid KPay order, poll refund status until settled.
 * Uses read-only refund-status (?sync=0) after the first check to avoid 504 timeouts.
 */
export function pollKPayRefundAfterCancel(options: {
  orderId: string;
  orderNumber?: string;
  shouldContinue?: () => boolean;
  onSuccess?: (orderData: Record<string, unknown>) => void;
}): void {
  const { orderId, orderNumber, shouldContinue = () => true, onSuccess } = options;
  if (activeRefundPolls.has(orderId)) return;
  activeRefundPolls.add(orderId);

  void (async () => {
    try {
      const delays = [3000, 5000, 8000, 12000, 20000, 30000];
      for (let i = 0; i < delays.length; i++) {
        await new Promise((r) => setTimeout(r, delays[i]));
        if (!shouldContinue()) return;
        try {
          const rs = await ordersApi.getRefundStatus(orderId, { sync: i === 0 });
          const body = rs as {
            orderNumber?: string;
            merchantOrderId?: string;
            refund?: { status?: string };
          };
          const st = String(body.refund?.status || "").toLowerCase();
          if (st === "success" || st === "already_refunded") {
            const full = await ordersApi.getById(orderId);
            const orderData =
              (full as { order?: Record<string, unknown> }).order ??
              (full as Record<string, unknown>);
            if (shouldContinue() && orderData && typeof orderData === "object") {
              invalidateAdminOrdersCache();
              notifyAdminOrdersUpdated("kpay-refund-settled");
              onSuccess?.(orderData as Record<string, unknown>);
              const label =
                orderNumber ||
                body.orderNumber ||
                body.merchantOrderId ||
                orderId;
              toast.success(`Refund completed — ${label}`);
            }
            return;
          }
          if (st === "failed") {
            toast.error("Refund failed at payment provider", {
              description: orderNumber || body.orderNumber || orderId,
              duration: 8000,
            });
            return;
          }
        } catch {
          /* keep polling */
        }
      }
    } finally {
      activeRefundPolls.delete(orderId);
    }
  })();
}
