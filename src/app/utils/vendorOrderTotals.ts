/**
 * Vendor orders API used to set `total` = sum of line items (pre-discount).
 * When `discount` > 0 but `total` ≈ `subtotal`, derive the grand total for display.
 */
export function vendorOrderGrandTotalDisplay(o: {
  total: number;
  subtotal?: number;
  discount?: number;
}): number {
  const sub = o.subtotal ?? o.total;
  const disc = o.discount ?? 0;
  if (disc <= 0) return o.total;
  if (Math.abs(o.total - sub) < 0.02) {
    return Math.max(0, Math.round((sub - disc) * 100) / 100);
  }
  return o.total;
}
