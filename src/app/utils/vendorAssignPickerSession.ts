/**
 * In-memory session for vendor assign-product pickers: reuse a larger fetched page
 * when the user only lowers "rows per page" (no network).
 */
export type VendorAssignPickerSession = {
  vendorKey: string;
  committedQ: string;
  page: number;
  pageSize: number;
  rows: any[];
  total: number;
};

export function buildAssignPickerSession(
  vendorKey: string,
  committedQ: string,
  page: number,
  pageSize: number,
  payload: { products: unknown[]; total: number }
): VendorAssignPickerSession {
  return {
    vendorKey,
    committedQ,
    page,
    pageSize,
    rows: [...(payload.products || [])],
    total: Number(payload.total ?? 0),
  };
}

/**
 * Same search + same API page, smaller page size: slice already-loaded rows.
 */
export function reuseAssignPickerSession(
  sess: VendorAssignPickerSession | null,
  vendorKey: string,
  committedQ: string,
  page: number,
  pageSize: number
): { rows: any[]; total: number; hasMore: boolean } | null {
  if (!sess) return null;
  if (sess.vendorKey !== vendorKey || sess.committedQ !== committedQ) return null;
  if (sess.page !== page) return null;
  if (pageSize > sess.pageSize) return null;
  if (sess.rows.length < pageSize) return null;
  const rows = sess.rows.slice(0, pageSize);
  const total = sess.total;
  const hasMore = page * pageSize < total;
  return { rows, total, hasMore };
}
