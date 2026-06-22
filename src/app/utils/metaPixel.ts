import { fetchVendorProducts } from "./module-cache";

const PIXEL_ID_RE = /^\d{5,20}$/;
const PURCHASE_DEDUPE_PREFIX = "meta-pixel-purchase:";
/** Match Meta Pixel Helper duplicate window. */
const META_EVENT_DEDUPE_MS = 2000;

declare global {
  interface Window {
    fbq?: FbqFn;
    _fbq?: FbqFn;
  }
}

type FbqFn = {
  (...args: unknown[]): void;
  callMethod?: (...args: unknown[]) => void;
  queue?: unknown[];
  loaded?: boolean;
  version?: string;
};

export function normalizeMetaPixelId(value: unknown): string {
  const raw = String(value ?? "")
    .replace(/[^\d]/g, "")
    .trim();
  return PIXEL_ID_RE.test(raw) ? raw : "";
}

let activePixelId: string | null = null;
let scriptRequested = false;
const recentMetaEvents = new Map<string, number>();

function shouldFireMetaEvent(eventKey: string): boolean {
  const now = Date.now();
  const last = recentMetaEvents.get(eventKey);
  if (last != null && now - last < META_EVENT_DEDUPE_MS) {
    return false;
  }
  recentMetaEvents.set(eventKey, now);
  return true;
}

function loadFbeventsScript(): void {
  if (typeof window === "undefined" || scriptRequested) return;
  scriptRequested = true;

  if (!window.fbq) {
    const n = function (this: FbqFn, ...args: unknown[]) {
      if (n.callMethod) {
        n.callMethod(...args);
      } else {
        n.queue?.push(args);
      }
    } as FbqFn;
    n.queue = [];
    n.loaded = true;
    n.version = "2.0";
    window.fbq = n;
    window._fbq = n;
    const script = document.createElement("script");
    script.async = true;
    script.src = "https://connect.facebook.net/en_US/fbevents.js";
    document.head.appendChild(script);
  }
}

/** Load pixel script and call `fbq('init', id)`. Returns false when id is invalid. */
export function initMetaPixel(pixelId: string): boolean {
  const id = normalizeMetaPixelId(pixelId);
  if (!id || typeof window === "undefined") return false;

  loadFbeventsScript();
  if (activePixelId !== id) {
    // Disable Meta's automatic PageView on init — we track PageView manually on route changes.
    window.fbq?.("init", id, {}, { autoConfig: false });
    activePixelId = id;
  }
  return true;
}

export function getActiveMetaPixelId(): string | null {
  return activePixelId;
}

export function trackMetaPageView(pathname?: string): void {
  if (!activePixelId) return;
  const path =
    String(pathname || "").trim() ||
    (typeof window !== "undefined" ? window.location.pathname : "");
  const key = `PageView:${path}`;
  if (!shouldFireMetaEvent(key)) return;
  window.fbq?.("track", "PageView");
}

export function trackMetaViewContent(product: {
  id: string;
  name: string;
  price?: number;
  currency?: string;
}): void {
  if (!activePixelId) return;
  const key = `ViewContent:${product.id}`;
  if (!shouldFireMetaEvent(key)) return;
  window.fbq?.("track", "ViewContent", {
    content_ids: [product.id],
    content_name: product.name,
    content_type: "product",
    value: product.price,
    currency: product.currency || "MMK",
  });
}

export function trackMetaAddToCart(item: {
  id: string;
  name: string;
  price: number;
  quantity: number;
  currency?: string;
}): void {
  if (!activePixelId) return;
  window.fbq?.("track", "AddToCart", {
    content_ids: [item.id],
    content_name: item.name,
    content_type: "product",
    value: item.price * item.quantity,
    currency: item.currency || "MMK",
  });
}

export function trackMetaInitiateCheckout(
  items: Array<{ id: string; quantity: number }>,
  value: number,
  currency = "MMK"
): void {
  if (!activePixelId) return;
  const path = typeof window !== "undefined" ? window.location.pathname : "";
  const key = `InitiateCheckout:${path}:${Math.round(value)}:${items
    .map((i) => `${i.id}x${i.quantity}`)
    .join(",")}`;
  if (!shouldFireMetaEvent(key)) return;
  window.fbq?.("track", "InitiateCheckout", {
    content_ids: items.map((i) => i.id),
    num_items: items.reduce((n, i) => n + i.quantity, 0),
    value,
    currency,
  });
}

export function trackMetaPurchaseOnce(order: {
  orderId: string;
  value: number;
  items: Array<{ id: string; quantity: number }>;
  currency?: string;
}): void {
  if (!activePixelId) return;
  const orderId = String(order.orderId || "").trim();
  if (!orderId) return;

  const dedupeKey = `${PURCHASE_DEDUPE_PREFIX}${orderId}`;
  try {
    if (sessionStorage.getItem(dedupeKey)) return;
    sessionStorage.setItem(dedupeKey, "1");
  } catch {
    /* private mode — still attempt one fire per page load */
  }

  window.fbq?.(
    "track",
    "Purchase",
    {
      content_ids: order.items.map((i) => i.id),
      content_type: "product",
      value: order.value,
      currency: order.currency || "MMK",
      order_id: orderId,
    },
    { eventID: orderId }
  );
}

/** Resolve pixel id from prop or vendor catalog API, then init. */
export async function ensureMetaPixelForVendor(
  vendorId: string,
  pixelIdHint?: string | null
): Promise<string> {
  const fromHint = normalizeMetaPixelId(pixelIdHint);
  if (fromHint) {
    initMetaPixel(fromHint);
    return fromHint;
  }

  const vid = String(vendorId || "").trim();
  if (!vid) return "";

  try {
    const data = await fetchVendorProducts(vid, { page: 1, pageSize: 1 });
    const id = normalizeMetaPixelId(data.metaPixelId);
    if (id) initMetaPixel(id);
    return id;
  } catch {
    return "";
  }
}

export function applyMetaPixelIdFromPayload(
  current: string | undefined,
  payload: { metaPixelId?: string | null } | null | undefined
): string | undefined {
  const next = normalizeMetaPixelId(payload?.metaPixelId);
  if (next) return next;
  return current;
}
