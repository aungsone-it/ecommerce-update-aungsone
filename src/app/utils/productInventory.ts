/** Shopify-style inventory: track quantity, optional oversell (negative stock). */

export type InventoryPolicySource = {
  inventory?: number | string;
  trackQuantity?: boolean;
  continueSellingOutOfStock?: boolean;
};

export type VariantInventoryLine = InventoryPolicySource & {
  sku?: string;
};

export function parseInventory(value: unknown, fallback = 0): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (value == null || value === "") return fallback;
  const n = parseFloat(String(value).replace(/[^0-9.-]/g, ""));
  return Number.isFinite(n) ? n : fallback;
}

export function isTrackQuantity(product: InventoryPolicySource | null | undefined): boolean {
  return product?.trackQuantity !== false;
}

export function allowsOverselling(product: InventoryPolicySource | null | undefined): boolean {
  return !!product?.continueSellingOutOfStock;
}

export function getEffectiveInventory(
  product: InventoryPolicySource,
  variant?: VariantInventoryLine | null
): number {
  if (variant != null) {
    return parseInventory(variant.inventory, parseInventory(product.inventory));
  }
  return parseInventory(product.inventory);
}

/** Block storefront purchase when tracked, not overselling, and stock below qty. */
export function canPurchase(
  product: InventoryPolicySource,
  variant?: VariantInventoryLine | null,
  quantity = 1
): boolean {
  if (!isTrackQuantity(product)) return true;
  if (allowsOverselling(product)) return true;
  return getEffectiveInventory(product, variant) >= quantity;
}

/** Show out-of-stock UI (badge, disabled buttons). */
export function isOutOfStockDisplay(
  product: InventoryPolicySource,
  variant?: VariantInventoryLine | null,
  quantity = 1
): boolean {
  return !canPurchase(product, variant, quantity);
}

export function maxPurchaseQuantity(
  product: InventoryPolicySource,
  variant?: VariantInventoryLine | null
): number {
  if (!isTrackQuantity(product) || allowsOverselling(product)) return 99;
  const available = Math.floor(getEffectiveInventory(product, variant));
  return Math.max(0, Math.min(99, available));
}

export function showLowStockBadge(
  product: InventoryPolicySource,
  variant?: VariantInventoryLine | null
): boolean {
  if (!isTrackQuantity(product) || allowsOverselling(product)) return false;
  const inv = getEffectiveInventory(product, variant);
  return inv > 0 && inv < 10;
}
