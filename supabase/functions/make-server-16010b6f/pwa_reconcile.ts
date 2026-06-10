/**
 * KBZ PWA safety net: find checkout drafts without storefront orders and finalize them.
 */
import type { Context } from "npm:hono@4";
import * as kv from "./kv_store.tsx";
import {
  finalizePwaCheckoutOrder,
  type PwaCheckoutDraftRecord,
} from "./pwa_finalize.ts";

export const PWA_DRAFT_KEY_PREFIX = "kpay_pwa_draft:";

export type OrphanedPwaDraftRow = {
  merchantOrderId: string;
  savedAt: string;
  prepayId?: string;
  vendor?: string;
  vendorId?: string;
  total?: number;
  txnStatus?: string;
  hasOrder: boolean;
  canRecover: boolean;
};

export type PwaReconcileResult = {
  scanned: number;
  finalized: number;
  skippedNoPayment: number;
  failed: Array<{ merchantOrderId: string; error: string; message?: string }>;
  recovered: Array<{ merchantOrderId: string; orderNumber?: string }>;
};

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function parseDraftAgeMs(savedAt: string): number {
  const ms = Date.parse(savedAt);
  return Number.isFinite(ms) ? ms : 0;
}

async function orderExistsForMerchantOrderId(merchantOrderId: string): Promise<boolean> {
  const mapped = await kv.get(`order_num:${merchantOrderId}`);
  return typeof mapped === "string" && mapped.trim().length > 0;
}

function draftMatchesVendorFilter(
  draftOrder: Record<string, unknown> | undefined,
  vendorFilter: string,
): boolean {
  const filter = vendorFilter.trim().toLowerCase();
  if (!filter) return true;
  const vendor = text(draftOrder?.vendor).toLowerCase();
  const vendorId = text(draftOrder?.vendorId).toLowerCase();
  return vendor === filter || vendorId === filter || vendor.includes(filter) || vendorId.includes(filter);
}

export async function listOrphanedPwaDrafts(options?: {
  minAgeMinutes?: number;
  limit?: number;
  vendorId?: string;
  merchantOrderId?: string;
}): Promise<OrphanedPwaDraftRow[]> {
  const minAgeMs = Math.max(0, (options?.minAgeMinutes ?? 5) * 60 * 1000);
  const limit = Math.min(Math.max(options?.limit ?? 50, 1), 200);
  const vendorFilter = text(options?.vendorId);
  const exactId = text(options?.merchantOrderId);
  const now = Date.now();

  const rows = exactId
    ? [{ key: `${PWA_DRAFT_KEY_PREFIX}${exactId}`, value: await kv.get(`${PWA_DRAFT_KEY_PREFIX}${exactId}`) }]
    : await kv.getByPrefixWithKeys(PWA_DRAFT_KEY_PREFIX);

  const result: OrphanedPwaDraftRow[] = [];

  for (const row of rows) {
    if (result.length >= limit) break;
    if (!row?.key?.startsWith(PWA_DRAFT_KEY_PREFIX)) continue;

    const merchantOrderId = row.key.slice(PWA_DRAFT_KEY_PREFIX.length);
    if (!merchantOrderId || (exactId && merchantOrderId !== exactId)) continue;

    const draft = row.value as PwaCheckoutDraftRecord | null;
    if (!draft || typeof draft !== "object") continue;

    const savedAt = text(draft.savedAt);
    const savedMs = parseDraftAgeMs(savedAt);
    if (!exactId && savedMs && now - savedMs < minAgeMs) continue;

    if (await orderExistsForMerchantOrderId(merchantOrderId)) continue;

    const draftOrder =
      draft.draftOrder && typeof draft.draftOrder === "object"
        ? (draft.draftOrder as Record<string, unknown>)
        : undefined;

    if (vendorFilter && !draftMatchesVendorFilter(draftOrder, vendorFilter)) continue;

    const txn = (await kv.get(`kpay_txn:${merchantOrderId}`)) as Record<string, unknown> | null;
    const txnStatus = text(txn?.status).toLowerCase();

    result.push({
      merchantOrderId,
      savedAt,
      prepayId: text(draft.prepayId) || undefined,
      vendor: text(draftOrder?.vendor) || undefined,
      vendorId: text(draftOrder?.vendorId) || text(draftOrder?.vendor) || undefined,
      total: Number(draftOrder?.total || 0) || undefined,
      txnStatus: txnStatus || undefined,
      hasOrder: false,
      canRecover: txnStatus === "paid" || Boolean(text(draft.prepayId)),
    });
  }

  result.sort((a, b) => parseDraftAgeMs(b.savedAt) - parseDraftAgeMs(a.savedAt));
  return result;
}

export async function reconcileOrphanedPwaDrafts(params: {
  minAgeMinutes?: number;
  limit?: number;
  vendorId?: string;
  syncStatus: (merchantOrderId: string) => Promise<unknown>;
}): Promise<PwaReconcileResult> {
  const drafts = await listOrphanedPwaDrafts({
    minAgeMinutes: params.minAgeMinutes ?? 10,
    limit: params.limit ?? 100,
    vendorId: params.vendorId,
  });

  const result: PwaReconcileResult = {
    scanned: drafts.length,
    finalized: 0,
    skippedNoPayment: 0,
    failed: [],
    recovered: [],
  };

  for (const row of drafts) {
    try {
      await params.syncStatus(row.merchantOrderId);
      let fin = await finalizePwaCheckoutOrder(row.merchantOrderId);

      for (
        let attempt = 0;
        attempt < 2 && !fin.ok && fin.error === "payment_not_confirmed";
        attempt++
      ) {
        await new Promise((resolve) => setTimeout(resolve, 1500));
        await params.syncStatus(row.merchantOrderId);
        fin = await finalizePwaCheckoutOrder(row.merchantOrderId);
      }

      if (fin.ok) {
        result.finalized += 1;
        const orderNumber = text((fin.order as Record<string, unknown> | undefined)?.orderNumber) ||
          row.merchantOrderId;
        result.recovered.push({ merchantOrderId: row.merchantOrderId, orderNumber });
        continue;
      }

      if (fin.error === "payment_not_confirmed") {
        result.skippedNoPayment += 1;
      }
      result.failed.push({
        merchantOrderId: row.merchantOrderId,
        error: fin.error || "finalize_failed",
        message: fin.message,
      });
    } catch (error) {
      result.failed.push({
        merchantOrderId: row.merchantOrderId,
        error: "exception",
        message: String((error as Error)?.message || error),
      });
    }
  }

  return result;
}

function assertReconcileSecret(c: Context): Response | undefined {
  const expected = String(
    Deno.env.get("KPAY_PWA_RECONCILE_SECRET") ||
      Deno.env.get("EDGE_ADMIN_OPERATION_SECRET") ||
      "",
  ).trim();
  if (!expected) {
    return c.json(
      {
        error: "misconfigured",
        message: "Set KPAY_PWA_RECONCILE_SECRET (or EDGE_ADMIN_OPERATION_SECRET) on the Edge function.",
      },
      503,
    );
  }
  const provided = String(
    c.req.header("x-kpay-reconcile-secret") ||
      c.req.header("x-admin-operation-secret") ||
      "",
  ).trim();
  if (provided !== expected) {
    return c.json({ error: "Forbidden" }, 403);
  }
  return undefined;
}

export async function getOrphanedPwaDraftsRoute(c: Context) {
  try {
    const url = new URL(c.req.url);
    const minAgeMinutes = Number(url.searchParams.get("minAgeMinutes") || "5");
    const limit = Number(url.searchParams.get("limit") || "50");
    const vendorId = text(url.searchParams.get("vendorId"));
    const merchantOrderId = text(url.searchParams.get("merchantOrderId"));

    const drafts = await listOrphanedPwaDrafts({
      minAgeMinutes: Number.isFinite(minAgeMinutes) ? minAgeMinutes : 5,
      limit: Number.isFinite(limit) ? limit : 50,
      vendorId: vendorId || undefined,
      merchantOrderId: merchantOrderId || undefined,
    });

    return c.json({ success: true, drafts, count: drafts.length });
  } catch (error) {
    console.error("getOrphanedPwaDraftsRoute error", error);
    return c.json({ error: "Failed to list orphaned PWA drafts" }, 500);
  }
}

export async function getPwaDraftStatusRoute(c: Context) {
  try {
    const merchantOrderId = text(c.req.param("merchantOrderId"));
    if (!merchantOrderId) {
      return c.json({ error: "merchantOrderId is required" }, 400);
    }

    const hasOrder = await orderExistsForMerchantOrderId(merchantOrderId);
    const draft = (await kv.get(`${PWA_DRAFT_KEY_PREFIX}${merchantOrderId}`)) as
      | PwaCheckoutDraftRecord
      | null;
    const txn = (await kv.get(`kpay_txn:${merchantOrderId}`)) as Record<string, unknown> | null;
    const txnStatus = text(txn?.status).toLowerCase();

    return c.json({
      success: true,
      merchantOrderId,
      hasDraft: Boolean(draft?.draftOrder),
      hasOrder,
      txnStatus: txnStatus || null,
      prepayId: text(draft?.prepayId) || text(txn?.prepayId) || null,
      savedAt: text(draft?.savedAt) || null,
      canRecover: !hasOrder && Boolean(draft?.draftOrder) &&
        (txnStatus === "paid" || Boolean(text(draft?.prepayId))),
    });
  } catch (error) {
    console.error("getPwaDraftStatusRoute error", error);
    return c.json({ error: "Failed to read PWA draft status" }, 500);
  }
}

export async function postPwaReconcileRoute(
  c: Context,
  syncStatus: (merchantOrderId: string) => Promise<unknown>,
) {
  const denied = assertReconcileSecret(c);
  if (denied) return denied;

  try {
    const body = (await c.req.json().catch(() => ({}))) as Record<string, unknown>;
    const minAgeMinutes = Number(body.minAgeMinutes ?? 10);
    const limit = Number(body.limit ?? 100);
    const vendorId = text(body.vendorId);

    const result = await reconcileOrphanedPwaDrafts({
      minAgeMinutes: Number.isFinite(minAgeMinutes) ? minAgeMinutes : 10,
      limit: Number.isFinite(limit) ? limit : 100,
      vendorId: vendorId || undefined,
      syncStatus,
    });

    console.log(
      `[kpay-pwa-reconcile] scanned=${result.scanned} finalized=${result.finalized} skippedNoPayment=${result.skippedNoPayment} failed=${result.failed.length}`,
    );

    return c.json({ success: true, ...result });
  } catch (error) {
    console.error("postPwaReconcileRoute error", error);
    return c.json({ error: "PWA reconcile failed" }, 500);
  }
}
