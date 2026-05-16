/**
 * KBZ PWA: persist checkout draft server-side and create storefront orders after payment.
 * localStorage is often empty when KBZPay returns in its in-app WebView.
 */
import * as kv from "./kv_store.tsx";

const DRAFT_KEY_PREFIX = "kpay_pwa_draft:";

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function nowIso(): string {
  return new Date().toISOString();
}

export type PwaCheckoutDraftRecord = {
  merchantOrderId: string;
  prepayId?: string;
  originPath?: string;
  /** e.g. `/summary` on vendor host or `/vendor/go-go/summary` on marketplace */
  summaryPath?: string;
  /** Storefront origin where checkout started, e.g. `https://gogo.walwal.online` */
  storefrontOrigin?: string;
  draftOrder?: Record<string, unknown>;
  savedAt: string;
};

/** Absolute URL for post-payment summary (vendor subdomain / custom domain safe). */
export function buildPwaSummaryAbsoluteUrl(
  draft: PwaCheckoutDraftRecord | null,
  fallbackSpaBase: string,
  prepayId: string,
  merchantOrderId: string,
): string {
  const qs = new URLSearchParams();
  if (prepayId) qs.set("prepay_id", prepayId);
  if (merchantOrderId) qs.set("merch_order_id", merchantOrderId);
  const q = qs.toString();

  const summaryPath = text(draft?.summaryPath) || "/summary";
  const storefrontOrigin = text(draft?.storefrontOrigin);

  if (storefrontOrigin) {
    const base = storefrontOrigin.replace(/\/$/, "");
    const path = summaryPath.startsWith("/") ? summaryPath : `/${summaryPath}`;
    return q ? `${base}${path}?${q}` : `${base}${path}`;
  }

  if (/^https?:\/\//i.test(summaryPath)) {
    const u = new URL(summaryPath);
    if (prepayId) u.searchParams.set("prepay_id", prepayId);
    if (merchantOrderId) u.searchParams.set("merch_order_id", merchantOrderId);
    return u.toString();
  }

  const spa = new URL(fallbackSpaBase);
  const path = summaryPath.startsWith("/") ? summaryPath : `/${summaryPath}`;
  return q ? `${spa.origin}${path}?${q}` : `${spa.origin}${path}`;
}

export async function savePwaCheckoutDraft(record: PwaCheckoutDraftRecord): Promise<void> {
  const id = text(record.merchantOrderId);
  if (!id) return;
  await kv.set(`${DRAFT_KEY_PREFIX}${id}`, {
    ...record,
    merchantOrderId: id,
    savedAt: record.savedAt || nowIso(),
  });
}

export async function getPwaCheckoutDraft(
  merchantOrderId: string,
): Promise<PwaCheckoutDraftRecord | null> {
  const id = text(merchantOrderId);
  if (!id) return null;
  const row = (await kv.get(`${DRAFT_KEY_PREFIX}${id}`)) as PwaCheckoutDraftRecord | null;
  if (!row || typeof row !== "object") return null;
  return row;
}

function buildOrderBodyFromDraft(
  merchantOrderId: string,
  draft: PwaCheckoutDraftRecord,
  txn: Record<string, unknown> | null,
): Record<string, unknown> | null {
  const d = draft.draftOrder;
  if (!d || typeof d !== "object") return null;
  const ship =
    d.shippingInfo && typeof d.shippingInfo === "object"
      ? (d.shippingInfo as Record<string, unknown>)
      : {};

  return {
    orderNumber: merchantOrderId,
    userId: d.userId ?? null,
    customer: d.customerName || ship.fullName || "",
    customerName: d.customerName || ship.fullName || "",
    email: d.email || "",
    phone: d.phone || ship.phone || "",
    status: "pending",
    paymentStatus: "paid",
    paymentMethod: "KBZPay (PWA)",
    total: Number(d.total || 0),
    subtotal: Number(d.subtotal || 0),
    discount: Number(d.discount || 0),
    date: nowIso(),
    vendor: d.vendor || "",
    vendorId: d.vendorId || undefined,
    couponCode: d.couponCode || null,
    couponId: d.couponId || null,
    couponDiscount: Number(d.discount || 0),
    items: Array.isArray(d.items) ? d.items : [],
    address: ship.address || "",
    city: ship.city || "",
    zipCode: ship.zipCode || "",
    country: ship.country || "",
    shippingAddress: [
      ship.address || "",
      ship.city || "",
      ship.zipCode || "",
      ship.country || "",
    ]
      .filter(Boolean)
      .join(", "),
    notes: d.notes || "",
    kpay: {
      method: "pwa",
      merchantOrderId,
      prepayId: text(txn?.prepayId) || text(draft.prepayId) || "",
      status: "paid",
      providerStatus: text(txn?.providerStatus) || "paid",
      payUrl: text(txn?.payUrl) || "",
    },
  };
}

async function postStorefrontOrder(body: Record<string, unknown>): Promise<{
  ok: boolean;
  status: number;
  order?: Record<string, unknown>;
  error?: string;
  message?: string;
}> {
  const base = text(Deno.env.get("SUPABASE_URL"));
  const key =
    text(Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")) ||
    text(Deno.env.get("SUPABASE_ANON_KEY"));
  if (!base || !key) {
    return { ok: false, status: 500, error: "supabase_env_missing" };
  }
  const url = `${base.replace(/\/$/, "")}/functions/v1/make-server-16010b6f/orders`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${key}`,
    },
    body: JSON.stringify(body),
  });
  const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) {
    return {
      ok: false,
      status: res.status,
      error: text(data.error) || "create_failed",
      message: text(data.message) || text(data.error),
    };
  }
  const order = data.order;
  return {
    ok: true,
    status: res.status,
    order: order && typeof order === "object" ? (order as Record<string, unknown>) : undefined,
  };
}

/** Create storefront order when KBZ txn is paid and draft exists. Idempotent. */
export async function finalizePwaCheckoutOrder(merchantOrderId: string): Promise<{
  ok: boolean;
  created?: boolean;
  duplicate?: boolean;
  order?: Record<string, unknown>;
  error?: string;
  message?: string;
}> {
  const id = text(merchantOrderId);
  if (!id) return { ok: false, error: "merchant_order_id_required" };

  const mapped = await kv.get(`order_num:${id}`);
  if (typeof mapped === "string" && mapped.trim()) {
    const existing = (await kv.get(`order:${mapped.trim()}`)) as Record<string, unknown> | null;
    if (existing) {
      return { ok: true, created: false, duplicate: true, order: existing };
    }
  }

  const draft = await getPwaCheckoutDraft(id);
  if (!draft?.draftOrder) {
    return { ok: false, error: "no_checkout_draft" };
  }

  const txn = (await kv.get(`kpay_txn:${id}`)) as Record<string, unknown> | null;
  const txnStatus = text(txn?.status).toLowerCase();
  if (txnStatus !== "paid") {
    return { ok: false, error: "payment_not_confirmed", message: txnStatus || "pending" };
  }

  const body = buildOrderBodyFromDraft(id, draft, txn);
  if (!body) return { ok: false, error: "invalid_draft" };

  const result = await postStorefrontOrder(body);
  if (!result.ok) {
    return {
      ok: false,
      error: result.error,
      message: result.message,
    };
  }

  return {
    ok: true,
    created: true,
    duplicate: result.status === 200,
    order: result.order,
  };
}
