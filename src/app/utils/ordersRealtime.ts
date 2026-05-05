import { supabase } from "../contexts/AuthContext";

const ORDERS_STATUS_CHANNEL = "sec-orders-status-v1";

export type OrderStatusRealtimePayload = {
  orderId: string;
  status: string;
  updatedAt?: string;
};

async function waitSubscribed(ch: ReturnType<typeof supabase.channel>, ms = 8000): Promise<boolean> {
  return new Promise((resolve) => {
    const t = setTimeout(() => resolve(false), ms);
    ch.subscribe((status) => {
      if (status === "SUBSCRIBED") {
        clearTimeout(t);
        resolve(true);
      }
      if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") {
        clearTimeout(t);
        resolve(false);
      }
    });
  });
}

export async function broadcastOrderStatusUpdate(payload: OrderStatusRealtimePayload): Promise<void> {
  if (typeof window === "undefined") return;
  if (!payload?.orderId || !payload?.status) return;
  const ch = supabase.channel(ORDERS_STATUS_CHANNEL, {
    config: { broadcast: { ack: false } },
  });
  const ok = await waitSubscribed(ch);
  if (!ok) {
    try {
      await supabase.removeChannel(ch);
    } catch {
      /* ignore */
    }
    return;
  }
  try {
    await ch.send({
      type: "broadcast",
      event: "order-status",
      payload,
    });
  } finally {
    try {
      await supabase.removeChannel(ch);
    } catch {
      /* ignore */
    }
  }
}

export function subscribeOrderStatusUpdates(
  onStatusUpdate: (payload: OrderStatusRealtimePayload) => void
): () => void {
  const ch = supabase
    .channel(ORDERS_STATUS_CHANNEL, { config: { broadcast: { ack: false } } })
    .on(
      "broadcast",
      { event: "order-status" },
      (ctx: { payload?: OrderStatusRealtimePayload } | Record<string, unknown>) => {
        const any = ctx as { payload?: OrderStatusRealtimePayload };
        const payload = any?.payload;
        if (!payload?.orderId || !payload?.status) return;
        onStatusUpdate(payload);
      }
    );
  ch.subscribe();
  return () => {
    try {
      void supabase.removeChannel(ch);
    } catch {
      /* ignore */
    }
  };
}
