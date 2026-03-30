/**
 * Vendor commission earned — same rules as super-admin vendor profile:
 * accrues only on orders in ready-to-ship / fulfilled / shipped / delivered,
 * per line net of order-level discount, using line → product → vendor default %.
 */

export type VendorCatalogKeys = { ids: Set<string>; skus: Set<string> };

function parseOrderMoney(v: unknown): number {
  if (v == null || v === "") return 0;
  const n = typeof v === "number" ? v : parseFloat(String(v).replace(/[^0-9.-]/g, ""));
  return Number.isFinite(n) ? n : 0;
}

export function normalizeOrderStatusKey(status: string | undefined): string {
  return String(status || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "-");
}

/** Commission & vendor revenue accrue only after fulfillment pipeline (aligned with VendorProfile). */
export const VENDOR_COMMISSION_ACCRUE_STATUSES = new Set([
  "ready-to-ship",
  "fulfilled",
  "shipped",
  "delivered",
]);

export function buildVendorCatalogKeys(products: any[]): VendorCatalogKeys {
  const ids = new Set<string>();
  const skus = new Set<string>();
  for (const p of products) {
    if (p?.id != null && String(p.id).trim() !== "") ids.add(String(p.id).trim());
    if (p?.sku != null && String(p.sku).trim() !== "") skus.add(String(p.sku).trim());
  }
  return { ids, skus };
}

export function lineItemBelongsToVendor(
  item: any,
  vendorId: string,
  catalog?: VendorCatalogKeys
): boolean {
  if (item == null || typeof item !== "object") return false;
  const vid = String(vendorId ?? "").trim();
  if (!vid) return false;
  const idCandidates = [item.vendorId, item.vendor, item.product?.vendorId].filter(
    (x) => x != null && String(x).trim() !== ""
  );
  if (idCandidates.some((x) => String(x).trim() === vid)) return true;
  const sel = item.product?.selectedVendors ?? item.selectedVendors;
  if (Array.isArray(sel) && sel.some((x: unknown) => String(x).trim() === vid)) return true;
  if (catalog && (catalog.ids.size > 0 || catalog.skus.size > 0)) {
    const pid = item.productId != null ? String(item.productId).trim() : "";
    const sku = item.sku != null ? String(item.sku).trim() : "";
    const cartId = item.id != null ? String(item.id).trim() : "";
    const idFromCart = cartId.includes(":") ? cartId.split(":")[0]!.trim() : "";
    if (pid && catalog.ids.has(pid)) return true;
    if (idFromCart && catalog.ids.has(idFromCart)) return true;
    if (sku && catalog.skus.has(sku)) return true;
  }
  return false;
}

export function orderLineGross(item: any): number {
  if (item.subtotal != null && item.subtotal !== "") return parseOrderMoney(item.subtotal);
  if (item.total != null && item.total !== "") return parseOrderMoney(item.total);
  const qty = Math.max(1, parseOrderMoney(item.quantity) || 1);
  const unit = parseOrderMoney(item.price ?? item.product?.price);
  return unit * qty;
}

export function orderLineNetAfterDiscount(lineGross: number, order: any): number {
  const orderSub = parseOrderMoney(order.subtotal);
  const orderDisc = parseOrderMoney(order.discount);
  if (orderSub > 0 && orderDisc > 0) {
    const net = lineGross - (orderDisc * lineGross) / orderSub;
    return Math.max(0, Math.round(net * 100) / 100);
  }
  return lineGross;
}

function lineCommissionPercent(item: any, products: any[], defaultVendorPercent: number): number {
  if (
    item.commissionRate != null &&
    item.commissionRate !== "" &&
    (typeof item.commissionRate === "number" || Number.isFinite(parseFloat(String(item.commissionRate))))
  ) {
    return parseOrderMoney(item.commissionRate);
  }
  if (item.product?.commission != null) {
    return parseOrderMoney(item.product.commission);
  }
  if (item.commission != null) {
    return parseOrderMoney(item.commission);
  }
  const matched = products.find(
    (p: any) =>
      (item.sku && p.sku === item.sku) ||
      (item.name && p.name === item.name) ||
      (item.productId != null && p.id != null && String(p.id) === String(item.productId))
  );
  if (matched?.commissionRate != null) {
    return parseOrderMoney(matched.commissionRate);
  }
  if (matched?.commission != null) {
    return parseOrderMoney(matched.commission);
  }
  return parseOrderMoney(defaultVendorPercent);
}

/**
 * Total commission (MMK) the vendor has earned on accrued statuses.
 */
export function computeVendorCommissionEarned(
  orders: any[],
  products: any[],
  vendorId: string,
  defaultCommissionPercent: number
): number {
  const catalog = buildVendorCatalogKeys(products);
  let commission = 0;

  for (const order of orders) {
    if (order == null || typeof order !== "object") continue;
    const st = normalizeOrderStatusKey(String(order.status ?? ""));
    if (!VENDOR_COMMISSION_ACCRUE_STATUSES.has(st)) continue;

    const lineItems = Array.isArray(order.items) ? order.items : [];
    for (const item of lineItems) {
      if (!lineItemBelongsToVendor(item, vendorId, catalog)) continue;
      const gross = orderLineGross(item);
      const net = orderLineNetAfterDiscount(gross, order);
      const pct = lineCommissionPercent(item, products, defaultCommissionPercent);
      commission += (net * pct) / 100;
    }
  }

  return Math.round(commission * 100) / 100;
}
