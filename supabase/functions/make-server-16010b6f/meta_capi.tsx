/**
 * Meta Conversions API (server-side) — per-vendor pixel + access token from storefront settings.
 */
import * as kv from "./kv_store.tsx";

const TOKEN_RE = /^[A-Za-z0-9_|.-]{20,512}$/;
const PIXEL_ID_RE = /^\d{5,20}$/;
const DEDUPE_KEY_PREFIX = "meta_capi_purchase:";
const GRAPH_API_VERSION = "v21.0";

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

export function normalizeMetaCapiAccessToken(value: unknown): string {
  const raw = text(value);
  return TOKEN_RE.test(raw) ? raw : "";
}

export function stripMetaCapiFromPublicSettings<T extends Record<string, unknown>>(settings: T): T {
  if (!settings || typeof settings !== "object") return settings;
  const { metaCapiAccessToken: _token, metaCapiAccessTokenConfigured: _configured, ...rest } = settings;
  return rest as T;
}

export function sanitizeMetaCapiForAdminResponse<T extends Record<string, unknown>>(
  settings: T,
): T & { metaCapiAccessTokenConfigured: boolean } {
  const configured = Boolean(normalizeMetaCapiAccessToken(settings.metaCapiAccessToken));
  return {
    ...stripMetaCapiFromPublicSettings(settings),
    metaCapiAccessTokenConfigured: configured,
  };
}

async function sha256Hex(value: string): Promise<string> {
  const data = new TextEncoder().encode(value);
  const hash = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function normalizeEmail(email: unknown): string {
  return text(email).toLowerCase();
}

function normalizePhone(phone: unknown): string {
  return text(phone).replace(/\D/g, "");
}

async function buildUserData(order: Record<string, unknown>): Promise<Record<string, string[]>> {
  const userData: Record<string, string[]> = {};
  const email = normalizeEmail(order.email);
  const phone = normalizePhone(order.phone);
  if (email) {
    userData.em = [await sha256Hex(email)];
  }
  if (phone) {
    userData.ph = [await sha256Hex(phone)];
  }
  return userData;
}

function lineItemProductId(item: Record<string, unknown>): string {
  return text(item.productId) || text(item.id) || text(item.sku);
}

function buildCustomData(order: Record<string, unknown>): Record<string, unknown> {
  const items = Array.isArray(order.items) ? order.items : [];
  const contentIds = items
    .map((row) => (row && typeof row === "object" ? lineItemProductId(row as Record<string, unknown>) : ""))
    .filter(Boolean);
  const numItems = items.reduce((sum, row) => {
    if (!row || typeof row !== "object") return sum;
    const qty = Number((row as Record<string, unknown>).quantity) || 1;
    return sum + (Number.isFinite(qty) && qty > 0 ? qty : 1);
  }, 0);
  const total = Number(order.total);
  return {
    content_ids: contentIds,
    content_type: "product",
    value: Number.isFinite(total) ? total : 0,
    currency: text(order.currency) || "MMK",
    num_items: numItems || contentIds.length || 1,
    order_id: text(order.orderNumber) || text(order.id),
  };
}

export async function resolveVendorIdFromOrder(order: Record<string, unknown>): Promise<string> {
  const direct = text(order.vendorId);
  if (direct) return direct;

  const items = Array.isArray(order.items) ? order.items : [];
  for (const row of items) {
    if (!row || typeof row !== "object") continue;
    const item = row as Record<string, unknown>;
    const fromItem = text(item.vendorId) || text(item.vendor);
    if (fromItem && !fromItem.includes(" ")) return fromItem;
  }

  const vendorSlug = text(order.vendor);
  if (!vendorSlug) return "";

  const slugData = await kv.get(`vendor_slug_${vendorSlug}`).catch(() => null);
  if (slugData && typeof slugData === "object" && text((slugData as { vendorId?: unknown }).vendorId)) {
    return text((slugData as { vendorId?: unknown }).vendorId);
  }

  const vendorRow = await kv.get(`vendor:${vendorSlug}`).catch(() => null);
  if (vendorRow && typeof vendorRow === "object" && text((vendorRow as { id?: unknown }).id)) {
    return text((vendorRow as { id?: unknown }).id);
  }

  return vendorSlug;
}

async function loadVendorMetaCapiConfig(vendorId: string): Promise<{
  pixelId: string;
  accessToken: string;
} | null> {
  const vid = text(vendorId);
  if (!vid) return null;

  const settings = (await kv.get(`vendor_storefront_${vid}`).catch(() => null)) as Record<
    string,
    unknown
  > | null;
  if (!settings) return null;

  const pixelId = text(settings.metaPixelId);
  const accessToken = normalizeMetaCapiAccessToken(settings.metaCapiAccessToken);
  if (!PIXEL_ID_RE.test(pixelId) || !accessToken) return null;

  return { pixelId, accessToken };
}

async function markPurchaseSent(orderKey: string): Promise<boolean> {
  const key = `${DEDUPE_KEY_PREFIX}${orderKey}`;
  const existing = await kv.get(key).catch(() => null);
  if (existing) return false;
  await kv.set(key, { sentAt: new Date().toISOString() }).catch(() => undefined);
  return true;
}

export async function sendMetaCapiPurchaseForOrder(order: Record<string, unknown>): Promise<void> {
  const paymentStatus = text(order.paymentStatus).toLowerCase();
  const kpayStatus = text((order.kpay as Record<string, unknown> | undefined)?.status).toLowerCase();
  if (paymentStatus !== "paid" && kpayStatus !== "paid") return;

  const orderNumber = text(order.orderNumber) || text(order.id);
  if (!orderNumber) return;

  const shouldSend = await markPurchaseSent(orderNumber);
  if (!shouldSend) return;

  const vendorId = await resolveVendorIdFromOrder(order);
  if (!vendorId) {
    console.warn("[meta_capi] Purchase skipped — no vendorId on order", orderNumber);
    return;
  }

  const config = await loadVendorMetaCapiConfig(vendorId);
  if (!config) return;

  const eventTime = Math.floor(Date.now() / 1000);
  const userData = await buildUserData(order);
  const customData = buildCustomData(order);

  const payload = {
    data: [
      {
        event_name: "Purchase",
        event_time: eventTime,
        event_id: orderNumber,
        action_source: "website",
        user_data: userData,
        custom_data: customData,
      },
    ],
  };

  const url =
    `https://graph.facebook.com/${GRAPH_API_VERSION}/${config.pixelId}/events` +
    `?access_token=${encodeURIComponent(config.accessToken)}`;

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      console.warn("[meta_capi] Purchase send failed", orderNumber, res.status, body);
      await kv.del(`${DEDUPE_KEY_PREFIX}${orderNumber}`).catch(() => undefined);
      return;
    }
    console.log("[meta_capi] Purchase sent", orderNumber, "vendor", vendorId, body);
  } catch (error) {
    console.warn("[meta_capi] Purchase send error", orderNumber, error);
    await kv.del(`${DEDUPE_KEY_PREFIX}${orderNumber}`).catch(() => undefined);
  }
}

/** Fire-and-forget — never block order writes on Meta availability. */
export function queueMetaCapiPurchaseFromOrder(order: unknown): void {
  if (!order || typeof order !== "object") return;
  void sendMetaCapiPurchaseForOrder(order as Record<string, unknown>).catch((error) => {
    console.warn("[meta_capi] queue failed", error);
  });
}

export function mergeMetaCapiAccessTokenOnSave(
  mergedSettings: Record<string, unknown>,
  prevStorefront: unknown,
  clearRequested: boolean,
): void {
  const prevToken =
    prevStorefront &&
    typeof prevStorefront === "object" &&
    typeof (prevStorefront as Record<string, unknown>).metaCapiAccessToken === "string"
      ? normalizeMetaCapiAccessToken((prevStorefront as Record<string, unknown>).metaCapiAccessToken)
      : "";

  if (clearRequested) {
    delete mergedSettings.metaCapiAccessToken;
    return;
  }

  const rawIncoming =
    typeof mergedSettings.metaCapiAccessToken === "string"
      ? String(mergedSettings.metaCapiAccessToken).trim()
      : "";

  if (rawIncoming) {
    const normalized = normalizeMetaCapiAccessToken(rawIncoming);
    if (normalized) {
      mergedSettings.metaCapiAccessToken = normalized;
    } else if (prevToken) {
      mergedSettings.metaCapiAccessToken = prevToken;
    } else {
      delete mergedSettings.metaCapiAccessToken;
    }
    return;
  }

  if (prevToken) {
    mergedSettings.metaCapiAccessToken = prevToken;
  } else {
    delete mergedSettings.metaCapiAccessToken;
  }
}
