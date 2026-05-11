// Dedicated public KPay webhook receiver.
//
// Supabase Edge Functions verify JWT by default, which means KBZ's webhook POSTs
// (which carry no Supabase JWT) get rejected with 401 BEFORE our handler runs.
// This dedicated function is deployed with `--no-verify-jwt` so KBZ can actually
// reach us. The handler:
//   1. Logs every POST under `kpay_webhook_log:*` (diagnostics).
//   2. Verifies KBZ's SHA256 sign (same rules as PGW: sort k=v, exclude sign/sign_type,
//      flatten optional nested `biz_content` like other KBZ APIs).
//   3. Upserts `kpay_txn:{merchantOrderId}` so Realtime can flip checkout UI.
//
// KBZ callback doc: the merchant must respond with the plain text `success` (any case),
// not JSON — otherwise KBZ treats the delivery as failed and may not stop retrying.

import * as kv from "../make-server-16010b6f/kv_store.tsx";

type AnyRecord = Record<string, unknown>;
type PaymentStatus = "pending" | "paid" | "failed";

function text(value: unknown): string {
  if (value === undefined || value === null) return "";
  if (typeof value === "string") return value.trim();
  return String(value).trim();
}

function nowIso(): string {
  return new Date().toISOString();
}

function asRecord(value: unknown): AnyRecord {
  return value && typeof value === "object" ? (value as AnyRecord) : {};
}

/** KBZ sometimes sends `biz_content` as a JSON string in notify callbacks. */
function parseKbBizContent(raw: unknown): AnyRecord {
  if (raw && typeof raw === "object") return raw as AnyRecord;
  if (typeof raw === "string" && raw.trim()) {
    try {
      const parsed = JSON.parse(raw) as unknown;
      return parsed && typeof parsed === "object" ? (parsed as AnyRecord) : {};
    } catch {
      return {};
    }
  }
  return {};
}

async function sha256Upper(source: string): Promise<string> {
  const enc = new TextEncoder();
  const sig = await crypto.subtle.digest("SHA-256", enc.encode(source));
  const bytes = new Uint8Array(sig);
  return Array.from(bytes).map((b) => b.toString(16).padStart(2, "0")).join("").toUpperCase();
}

/** Flatten optional `biz_content` object into the same map used for stringA (KBZ notify can mirror precreate nesting). */
function notifyBodyForSigning(body: AnyRecord): AnyRecord {
  const biz = parseKbBizContent(body.biz_content);
  if (Object.keys(biz).length === 0) return { ...body };
  const next: AnyRecord = { ...body };
  delete next.biz_content;
  for (const [k, v] of Object.entries(biz)) {
    next[k] = v;
  }
  return next;
}

function buildSignSource(payload: AnyRecord): string {
  const keys = Object.keys(payload)
    .filter((k) => !["sign", "signature", "sign_type"].includes(k))
    .filter((k) => {
      const v = payload[k];
      if (v === undefined || v === null) return false;
      if (typeof v === "object") return false;
      if (typeof v === "string" && !v.trim()) return false;
      return true;
    })
    .sort();
  return keys.map((k) => `${k}=${String(payload[k]).trim()}`).join("&");
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
  const trade = text(payload.trade_status || payload.tradeStatus);
  if (trade) return trade;
  const candidates = [
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

function parseNotifyInput(rawText: string, contentType: string): AnyRecord {
  const ct = (contentType || "").toLowerCase();
  if (ct.includes("application/x-www-form-urlencoded") && rawText) {
    const params = new URLSearchParams(rawText);
    const o: AnyRecord = {};
    params.forEach((v, k) => {
      o[k] = v;
    });
    return unwrapRequestWrapper(o);
  }
  try {
    return rawText ? (JSON.parse(rawText) as AnyRecord) : {};
  } catch {
    return {};
  }
}

function unwrapRequestWrapper(raw: AnyRecord): AnyRecord {
  const wrapped = asRecord(raw.Request);
  if (Object.keys(wrapped).length > 0) return wrapped;
  return raw;
}

/** Plain-text ack KBZ expects for a successfully processed callback. */
function kpayAckSuccess(): Response {
  return new Response("success", {
    status: 200,
    headers: { "content-type": "text/plain; charset=utf-8" },
  });
}

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { "content-type": "application/json" },
    });
  }

  const rawText = await req.text();
  const rawBody = parseNotifyInput(rawText, req.headers.get("content-type") || "");
  const body = unwrapRequestWrapper(rawBody);
  const bizContent = parseKbBizContent(body.biz_content);
  const merchantOrderId = text(
    body.merchantOrderId ||
      body.merch_order_id ||
      body.outTradeNo ||
      bizContent.merch_order_id ||
      bizContent.merchOrderId ||
      bizContent.outTradeNo,
  );

  const debugKey = `kpay_webhook_log:${nowIso()}:${merchantOrderId || "unknown"}`;
  try {
    await kv.set(debugKey, {
      receivedAt: nowIso(),
      method: req.method,
      url: req.url,
      headers: Object.fromEntries(req.headers.entries()),
      rawText: rawText.slice(0, 20000),
      merchantOrderId,
    });
  } catch (logErr) {
    console.warn("kpay_webhook_log write failed", logErr);
  }
  console.log("KPay webhook received", { merchantOrderId });

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
      body.sign ||
      body.signature,
  ).toUpperCase();

  const forSign = notifyBodyForSigning(body);
  const source = buildSignSource(forSign);
  const expectedSign = await sha256Upper(`${source}&key=${signKey}`);
  const sigOk = Boolean(providedSign) && providedSign === expectedSign;

  /** NEVER enable in production — allows accepting PAID without signature (UAT debugging only). */
  const insecureTrust = text(Deno.env.get("KPAY_WEBHOOK_UAT_TRUST_NOTIFY")) === "1";
  const uatMode =
    /uat|sandbox|test/i.test(text(Deno.env.get("KPAY_ENV"))) ||
    /uat/i.test(text(Deno.env.get("SUPABASE_URL")));
  const tradeForTrust = text(
    forSign.trade_status || forSign.tradeStatus || body.trade_status || body.tradeStatus,
  ).toUpperCase();
  const allowInsecurePaid = insecureTrust && uatMode && tradeForTrust === "PAY_SUCCESS";

  if (!sigOk && !allowInsecurePaid) {
    console.warn("KPay webhook signature mismatch", {
      merchantOrderId,
      providedSign: providedSign || "(empty)",
      expectedSign,
      signSourceSample: source.slice(0, 220),
    });
    try {
      await kv.set(`${debugKey}:sig_debug`, {
        expectedSign,
        providedSign: providedSign || null,
        stringA: source,
      });
    } catch {
      // ignore
    }
    return new Response(JSON.stringify({ error: "Invalid signature" }), {
      status: 401,
      headers: { "content-type": "application/json" },
    });
  }

  if (!sigOk && allowInsecurePaid) {
    console.warn(
      "KPay webhook accepting PAY_SUCCESS without signature (KPAY_WEBHOOK_UAT_TRUST_NOTIFY=1 + UAT only)",
      { merchantOrderId },
    );
  }

  const providerStatus = providerStatusFrom(forSign);
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
    webhookSigOk: sigOk,
  });

  return kpayAckSuccess();
});
