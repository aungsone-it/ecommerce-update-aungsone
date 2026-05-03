// Dedicated public KPay webhook receiver.
//
// Supabase Edge Functions verify JWT by default, which means KBZ's webhook POSTs
// (which carry no Supabase JWT) get rejected with 401 BEFORE our handler runs.
// This dedicated function is deployed with `--no-verify-jwt` so KBZ can actually
// reach us. The function then:
//   1. Logs the raw incoming request to the KV store under `kpay_webhook_log:*`
//      so we can confirm KBZ is delivering callbacks even if signature validation
//      fails.
//   2. Verifies KBZ's SHA256 signature against KPAY_SIGN_KEY (same algo as the
//      precreate signing). If invalid, returns 401 (but the raw entry is still
//      logged for diagnostics).
//   3. Updates the `kpay_txn:{merchantOrderId}` record so the storefront sees the
//      payment as confirmed via webhook (no more pending status).

import * as kv from "../make-server-16010b6f/kv_store.tsx";

type AnyRecord = Record<string, unknown>;
type PaymentStatus = "pending" | "paid" | "failed";

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function nowIso(): string {
  return new Date().toISOString();
}

function asRecord(value: unknown): AnyRecord {
  return value && typeof value === "object" ? (value as AnyRecord) : {};
}

async function sha256Upper(source: string): Promise<string> {
  const enc = new TextEncoder();
  const sig = await crypto.subtle.digest("SHA-256", enc.encode(source));
  const bytes = new Uint8Array(sig);
  return Array.from(bytes).map((b) => b.toString(16).padStart(2, "0")).join("").toUpperCase();
}

function buildSignSource(payload: AnyRecord): string {
  const keys = Object.keys(payload)
    .filter((k) => !["sign", "signature", "sign_type"].includes(k))
    .filter((k) => {
      const v = payload[k];
      if (v === undefined || v === null) return false;
      if (typeof v === "string" && !v.trim()) return false;
      return true;
    })
    .sort();
  return keys.map((k) => `${k}=${String(payload[k])}`).join("&");
}

function mapProviderStatus(rawStatus: unknown): PaymentStatus {
  const status = text(rawStatus).toUpperCase();
  if (!status) return "pending";
  if (
    [
      "PAID",
      "PAYED",
      "SUCCESS",
      "SUCCESSFUL",
      "PAY_SUCCESS",
      "TRADE_SUCCESS",
      "TRANSACTION_SUCCESS",
      "OK",
    ].includes(status)
  ) {
    return "paid";
  }
  if (
    ["FAILED", "FAIL", "TRADE_FAIL", "TRANSACTION_FAILED", "CANCEL", "CANCELLED", "CLOSED"].includes(
      status,
    )
  ) {
    return "failed";
  }
  return "pending";
}

function providerStatusFrom(payload: AnyRecord): string {
  const candidates = [
    payload.tradeStatus,
    payload.trade_status,
    payload.orderStatus,
    payload.order_status,
    payload.payStatus,
    payload.pay_status,
    payload.status,
    payload.result,
    payload.result_code,
    payload.code,
  ];
  for (const c of candidates) {
    const t = text(c);
    if (t && t !== "0" && t !== "00") return t;
  }
  return text(payload.status) || text(payload.code) || "";
}

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { "content-type": "application/json" },
    });
  }

  let rawBody: AnyRecord = {};
  let rawText = "";
  try {
    rawText = await req.text();
    rawBody = rawText ? JSON.parse(rawText) : {};
  } catch {
    rawBody = {};
  }

  const wrapped = asRecord((rawBody as AnyRecord).Request);
  const body = Object.keys(wrapped).length > 0 ? wrapped : rawBody;
  const bizContent = asRecord(body.biz_content);
  const merchantOrderId = text(
    (body as AnyRecord).merchantOrderId ||
      (body as AnyRecord).merch_order_id ||
      (body as AnyRecord).outTradeNo ||
      bizContent.merch_order_id ||
      bizContent.merchOrderId ||
      bizContent.outTradeNo,
  );

  // Always log first — proves KBZ is actually delivering callbacks.
  const debugKey = `kpay_webhook_log:${nowIso()}:${merchantOrderId || "unknown"}`;
  try {
    await kv.set(debugKey, {
      receivedAt: nowIso(),
      method: req.method,
      url: req.url,
      headers: Object.fromEntries(req.headers.entries()),
      rawText,
      rawBody,
      merchantOrderId,
    });
  } catch (logErr) {
    console.warn("kpay_webhook_log write failed", logErr);
  }
  console.log("KPay webhook received", { merchantOrderId, headers: Object.fromEntries(req.headers.entries()) });

  if (!merchantOrderId) {
    return new Response(JSON.stringify({ error: "merchantOrderId missing" }), {
      status: 400,
      headers: { "content-type": "application/json" },
    });
  }

  const signKey = text(Deno.env.get("KPAY_SIGN_KEY"));
  if (!signKey) {
    return new Response(JSON.stringify({ error: "KPAY_SIGN_KEY not configured" }), {
      status: 500,
      headers: { "content-type": "application/json" },
    });
  }

  const providedSign = text(
    req.headers.get("x-kpay-signature") ||
      req.headers.get("x-signature") ||
      (rawBody as AnyRecord).sign ||
      (rawBody as AnyRecord).signature ||
      (body as AnyRecord).sign ||
      (body as AnyRecord).signature,
  ).toUpperCase();

  const source = buildSignSource(body);
  const expectedSign = await sha256Upper(`${source}&key=${signKey}`);
  const sigOk = providedSign && providedSign === expectedSign;
  if (!sigOk) {
    console.warn("KPay webhook signature mismatch", { merchantOrderId, providedSign, expectedSign });
    // Still log to KV (already done above). Return 401 so KBZ knows we rejected it.
    return new Response(JSON.stringify({ error: "Invalid signature" }), {
      status: 401,
      headers: { "content-type": "application/json" },
    });
  }

  const providerStatus = providerStatusFrom(body);
  const nextStatus = mapProviderStatus(providerStatus);
  const existing = (await kv.get(`kpay_txn:${merchantOrderId}`)) as AnyRecord | null;
  const updatedAt = nowIso();
  const paidAt = nextStatus === "paid" ? text(existing?.paidAt) || updatedAt : text(existing?.paidAt);

  await kv.set(`kpay_txn:${merchantOrderId}`, {
    ...(existing || {}),
    merchantOrderId,
    status: nextStatus,
    providerStatus,
    paidAt: paidAt || undefined,
    rawWebhook: body,
    createdAt: text(existing?.createdAt) || updatedAt,
    updatedAt,
  });

  return new Response(JSON.stringify({ success: true }), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
});
