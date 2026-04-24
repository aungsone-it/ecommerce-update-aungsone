import { Context } from "npm:hono@4";
import * as kv from "./kv_store.tsx";

type AnyRecord = Record<string, unknown>;
type KPayCallResult = {
  endpoint: string;
  request: AnyRecord;
  response: AnyRecord;
  responseData: AnyRecord;
};

function asRecord(v: unknown): AnyRecord {
  return v && typeof v === "object" ? (v as AnyRecord) : {};
}

function isNonEmptyString(v: unknown): v is string {
  return typeof v === "string" && v.trim().length > 0;
}

function getSecondsTimestamp(): string {
  return String(Math.floor(Date.now() / 1000));
}

function generateNonce(len = 32): string {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  const arr = crypto.getRandomValues(new Uint8Array(len));
  return Array.from(arr).map((b) => alphabet[b % alphabet.length]).join("");
}

function normalizeAmountMMK(amount: unknown): string {
  const n = typeof amount === "string" ? Number(amount) : Number(amount || 0);
  if (!Number.isFinite(n) || n <= 0) {
    throw new Error("Invalid amount");
  }
  return n.toFixed(2).replace(/\.00$/, "");
}

function mapKPayStatus(raw: unknown): "pending" | "paid" | "failed" | "closed" {
  const s = String(raw || "").trim().toUpperCase();
  if (!s) return "pending";
  if (["SUCCESS", "PAID", "TRADE_SUCCESS", "PAY_SUCCESS"].includes(s)) return "paid";
  if (["ORDER_CLOSED", "CLOSED"].includes(s)) return "closed";
  if (["PAY_FAILED", "FAILED", "FAIL", "ORDER_EXPIRED", "EXPIRED", "TRADE_CLOSED"].includes(s)) return "failed";
  return "pending";
}

function flattenForSign(input: AnyRecord): AnyRecord {
  const out: AnyRecord = {};
  const push = (obj: AnyRecord) => {
    for (const [k, v] of Object.entries(obj)) {
      if (k === "sign" || k === "sign_type") continue;
      if (v === undefined || v === null) continue;
      if (Array.isArray(v)) continue;
      if (typeof v === "string" && v.trim() === "") continue;
      if (typeof v === "object") continue;
      out[k] = v;
    }
  };
  push(input);
  const biz = asRecord(input.biz_content);
  push(biz);
  return out;
}

function buildSignSource(input: AnyRecord, key: string): string {
  const fields = flattenForSign(input);
  const base = Object.keys(fields)
    .sort()
    .map((k) => `${k}=${String(fields[k])}`)
    .join("&");
  return `${base}&key=${key}`;
}

async function sha256HexUpper(message: string): Promise<string> {
  const enc = new TextEncoder();
  const digest = await crypto.subtle.digest("SHA-256", enc.encode(message));
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("")
    .toUpperCase();
}

async function signPayload(payload: AnyRecord, key: string): Promise<string> {
  return await sha256HexUpper(buildSignSource(payload, key));
}

async function verifyPayloadSignature(payload: AnyRecord, key: string): Promise<boolean> {
  const provided = String(payload.sign || "").trim().toUpperCase();
  if (!provided) return false;
  const expected = await signPayload(payload, key);
  return provided === expected;
}

function mustGetEnv(name: string): string {
  const v = String(Deno.env.get(name) || "").trim();
  if (!v) throw new Error(`${name} is required`);
  return v;
}

function getGatewayConfig() {
  const env = String(Deno.env.get("KPAY_ENV") || "uat").trim().toLowerCase() === "prod" ? "prod" : "uat";
  const baseUrl = mustGetEnv("KPAY_PROXY_BASE_URL");
  const notifyUrl = String(Deno.env.get("KPAY_NOTIFY_URL") || "").trim();
  const appid = mustGetEnv("KPAY_APPID");
  const merchCode = mustGetEnv("KPAY_MERCH_CODE");
  const signKey = mustGetEnv("KPAY_SIGN_KEY");
  const versionDefault = env === "prod" ? "3.0" : "1.0";
  const paths = {
    precreate: Deno.env.get("KPAY_PATH_PRECREATE") || (env === "prod" ? "/payment/gateway/precreate" : "/payment/gateway/uat/precreate"),
    queryorder: Deno.env.get("KPAY_PATH_QUERYORDER") || (env === "prod" ? "/payment/gateway/queryorder" : "/payment/gateway/uat/queryorder"),
    closeorder: Deno.env.get("KPAY_PATH_CLOSEORDER") || (env === "prod" ? "/payment/gateway/closeorder" : "/payment/gateway/uat/closeorder"),
    refund: Deno.env.get("KPAY_PATH_REFUND") || (env === "prod" ? "/payment/gateway/refund" : "/payment/gateway/uat/refund"),
    queryrefund: Deno.env.get("KPAY_PATH_QUERYREFUND") || (env === "prod" ? "/payment/gateway/queryrefund" : "/payment/gateway/uat/queryrefund"),
  };
  return { env, baseUrl, notifyUrl, appid, merchCode, signKey, versionDefault, paths };
}

async function safeJson(response: Response): Promise<AnyRecord> {
  try {
    return await response.json();
  } catch {
    return {};
  }
}

async function callKPayGateway(
  path: string,
  method: string,
  bizContent: AnyRecord,
  version?: string,
  notifyUrl?: string,
): Promise<KPayCallResult> {
  const conf = getGatewayConfig();
  const request: AnyRecord = {
    timestamp: getSecondsTimestamp(),
    method,
    nonce_str: generateNonce(32),
    sign_type: "SHA256",
    version: version || conf.versionDefault,
    biz_content: {
      appid: conf.appid,
      merch_code: conf.merchCode,
      ...bizContent,
    },
  };
  if (isNonEmptyString(notifyUrl)) {
    request.notify_url = notifyUrl;
  }
  request.sign = await signPayload(request, conf.signKey);
  const endpoint = new URL(path, conf.baseUrl).toString();

  const response = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ Request: request }),
  });
  const responseBody = await safeJson(response);
  if (!response.ok) {
    throw new Error(`KPay HTTP ${response.status}`);
  }
  const responseData = asRecord(responseBody.Response);
  if (!Object.keys(responseData).length) {
    throw new Error("KPay response missing Response object");
  }
  if (!(await verifyPayloadSignature(responseData, conf.signKey))) {
    throw new Error("KPay response signature verification failed");
  }
  return { endpoint, request, response: responseBody, responseData };
}

async function findOrderByOrderNumber(orderNumber: string): Promise<{ key: string; order: AnyRecord } | null> {
  const all = await kv.getByPrefix("order:");
  const orders = Array.isArray(all) ? all : [];
  const match = orders.find((o: any) => String(o?.orderNumber || "") === orderNumber);
  if (!match || !match.id) return null;
  return { key: `order:${match.id}`, order: match };
}

async function updateOrderPayment(orderNumber: string, patch: AnyRecord) {
  const found = await findOrderByOrderNumber(orderNumber);
  if (!found) return;
  const prevKpay = asRecord(found.order.kpay);
  const status = String(patch.status || prevKpay.status || "").toLowerCase();
  const paymentStatus = status === "paid" ? "paid" : status === "failed" || status === "closed" ? "failed" : "pending";
  const nextOrder: AnyRecord = {
    ...found.order,
    paymentStatus,
    updatedAt: new Date().toISOString(),
    kpay: {
      ...prevKpay,
      ...patch,
    },
  };
  await kv.set(found.key, nextOrder);
}

async function syncKPayOrderStatus(merchantOrderId: string): Promise<void> {
  const gateway = await callKPayGateway(
    getGatewayConfig().paths.queryorder,
    "kbz.payment.queryorder",
    { merch_order_id: merchantOrderId },
    "3.0",
  );
  const res = gateway.responseData;
  if (String(res.result || "").toUpperCase() !== "SUCCESS" || String(res.code || "") !== "0") {
    throw new Error(`KPay queryorder failed: ${String(res.code || "")} ${String(res.msg || "")}`.trim());
  }
  const tradeStatus = String(res.trade_status || "");
  const status = mapKPayStatus(tradeStatus);
  const current = asRecord(await kv.get(`kpay_txn:${merchantOrderId}`));
  const now = new Date().toISOString();
  await kv.set(`kpay_txn:${merchantOrderId}`, {
    ...current,
    merchantOrderId,
    amount: String(res.total_amount || current.amount || ""),
    currency: String(res.trans_currency || current.currency || "MMK"),
    status,
    providerStatus: tradeStatus,
    mmOrderId: String(res.mm_order_id || current.mmOrderId || ""),
    paidAt: status === "paid" ? new Date(Number(res.pay_success_time || 0) * 1000 || Date.now()).toISOString() : current.paidAt,
    rawQueryOrderResponse: gateway.response,
    updatedAt: now,
    createdAt: current.createdAt || now,
  });
  await updateOrderPayment(merchantOrderId, {
    merchantOrderId,
    status,
    providerStatus: tradeStatus,
    mmOrderId: String(res.mm_order_id || ""),
  });
}

export async function createKPayQr(c: Context) {
  try {
    const body = (await c.req.json()) as AnyRecord;
    const merchantOrderId = String(body.merchantOrderId || "").trim();
    if (!merchantOrderId) return c.json({ error: "merchantOrderId is required" }, 400);

    const amount = normalizeAmountMMK(body.amount);
    const currency = String(body.currency || "MMK").toUpperCase();
    const title = isNonEmptyString(body.title) ? String(body.title) : `Order ${merchantOrderId}`;
    const timeoutExpress = isNonEmptyString(body.timeoutExpress) ? String(body.timeoutExpress) : "120m";
    const notifyUrl = isNonEmptyString(body.notifyUrl) ? String(body.notifyUrl) : getGatewayConfig().notifyUrl;
    if (!notifyUrl) return c.json({ error: "KPAY_NOTIFY_URL is required for precreate" }, 500);

    const gateway = await callKPayGateway(
      getGatewayConfig().paths.precreate,
      "kbz.payment.precreate",
      {
        merch_order_id: merchantOrderId,
        trade_type: "PAY_BY_QRCODE",
        title,
        total_amount: amount,
        trans_currency: currency,
        timeout_express: timeoutExpress,
      },
      "1.0",
      notifyUrl,
    );

    const res = gateway.responseData;
    const result = String(res.result || "").toUpperCase();
    const code = String(res.code || "");
    if (result !== "SUCCESS" || code !== "0") {
      return c.json({ error: "KPay precreate failed", code, message: res.msg, raw: gateway.response }, 502);
    }

    const qrContent = String(res.qrCode || "");
    const providerStatus = `${result}:${code}`;
    const now = new Date().toISOString();
    await kv.set(`kpay_txn:${merchantOrderId}`, {
      merchantOrderId,
      amount,
      currency,
      status: "pending",
      providerStatus,
      prepayId: String(res.prepay_id || ""),
      mmOrderId: "",
      qrContent,
      rawCreateRequest: { Request: gateway.request },
      rawCreateResponse: gateway.response,
      endpointUsed: gateway.endpoint,
      updatedAt: now,
      createdAt: now,
    });

    await updateOrderPayment(merchantOrderId, {
      merchantOrderId,
      status: "pending",
      providerStatus,
      prepayId: String(res.prepay_id || ""),
      qrContent,
    });

    return c.json({
      success: true,
      merchantOrderId,
      status: "pending",
      providerStatus,
      qrContent,
      prepayId: String(res.prepay_id || ""),
    });
  } catch (error: any) {
    console.error("❌ createKPayQr error:", error);
    return c.json({ error: "Failed to create KPay QR", message: String(error?.message || error) }, 500);
  }
}

export async function queryKPayOrder(c: Context) {
  try {
    const merchantOrderId = String(
      c.req.param("merchantOrderId") || c.req.query("merchantOrderId") || (await c.req.json().catch(() => ({} as AnyRecord)) as AnyRecord).merchantOrderId || "",
    ).trim();
    if (!merchantOrderId) return c.json({ error: "merchantOrderId is required" }, 400);

    await syncKPayOrderStatus(merchantOrderId);
    const latest = asRecord(await kv.get(`kpay_txn:${merchantOrderId}`));

    return c.json({
      success: true,
      merchantOrderId,
      status: String(latest.status || "pending"),
      providerStatus: String(latest.providerStatus || ""),
      mmOrderId: String(latest.mmOrderId || ""),
      totalAmount: String(latest.amount || ""),
      transCurrency: String(latest.currency || ""),
      raw: latest.rawQueryOrderResponse || {},
    });
  } catch (error: any) {
    console.error("❌ queryKPayOrder error:", error);
    return c.json({ error: "Failed to query KPay order", message: String(error?.message || error) }, 500);
  }
}

export async function closeKPayOrder(c: Context) {
  try {
    const body = (await c.req.json().catch(() => ({}))) as AnyRecord;
    const merchantOrderId = String(body.merchantOrderId || c.req.param("merchantOrderId") || "").trim();
    if (!merchantOrderId) return c.json({ error: "merchantOrderId is required" }, 400);

    const gateway = await callKPayGateway(
      getGatewayConfig().paths.closeorder,
      "kbz.payment.closeorder",
      { merch_order_id: merchantOrderId },
      "3.0",
    );
    const res = gateway.responseData;
    if (String(res.result || "").toUpperCase() !== "SUCCESS" || String(res.code || "") !== "0") {
      return c.json({ error: "KPay closeorder failed", code: res.code, message: res.msg, raw: gateway.response }, 502);
    }

    const current = asRecord(await kv.get(`kpay_txn:${merchantOrderId}`));
    const now = new Date().toISOString();
    await kv.set(`kpay_txn:${merchantOrderId}`, {
      ...current,
      merchantOrderId,
      status: "closed",
      providerStatus: "ORDER_CLOSED",
      rawCloseOrderResponse: gateway.response,
      updatedAt: now,
      createdAt: current.createdAt || now,
    });
    await updateOrderPayment(merchantOrderId, { merchantOrderId, status: "closed", providerStatus: "ORDER_CLOSED" });

    return c.json({ success: true, merchantOrderId, status: "closed", raw: gateway.response });
  } catch (error: any) {
    console.error("❌ closeKPayOrder error:", error);
    return c.json({ error: "Failed to close KPay order", message: String(error?.message || error) }, 500);
  }
}

export async function refundKPayOrder(c: Context) {
  try {
    const body = (await c.req.json()) as AnyRecord;
    const merchantOrderId = String(body.merchantOrderId || "").trim();
    const refundRequestNo = String(body.refundRequestNo || "").trim();
    if (!merchantOrderId) return c.json({ error: "merchantOrderId is required" }, 400);
    if (!refundRequestNo) return c.json({ error: "refundRequestNo is required" }, 400);

    const txn = asRecord(await kv.get(`kpay_txn:${merchantOrderId}`));
    const amount = isNonEmptyString(body.refundAmount) ? String(body.refundAmount) : String(txn.amount || "");
    const refundReason = isNonEmptyString(body.refundReason) ? String(body.refundReason) : "merchant_refund";
    if (!amount) return c.json({ error: "refundAmount is required when order amount missing" }, 400);

    const gateway = await callKPayGateway(
      getGatewayConfig().paths.refund,
      "kbz.payment.refund",
      {
        merch_order_id: merchantOrderId,
        refund_request_no: refundRequestNo,
        refund_amount: amount,
        refund_reason: refundReason,
      },
      "1.0",
    );
    const res = gateway.responseData;
    if (String(res.result || "").toUpperCase() !== "SUCCESS" || String(res.code || "") !== "0") {
      return c.json({ error: "KPay refund failed", code: res.code, message: res.msg, raw: gateway.response }, 502);
    }

    const refundStatus = String(res.refund_status || "REFUNDING");
    const currentRefunds = Array.isArray(txn.refunds) ? txn.refunds : [];
    const now = new Date().toISOString();
    await kv.set(`kpay_txn:${merchantOrderId}`, {
      ...txn,
      merchantOrderId,
      mmOrderId: String(res.trans_order_id || txn.mmOrderId || ""),
      refunds: [
        ...currentRefunds,
        {
          refundRequestNo,
          refundOrderId: String(res.refund_order_id || ""),
          refundAmount: String(res.refund_amount || amount),
          refundCurrency: String(res.refund_currency || txn.currency || "MMK"),
          refundStatus,
          refundTime: String(res.refund_time || ""),
          createdAt: now,
        },
      ],
      rawRefundResponse: gateway.response,
      updatedAt: now,
      createdAt: txn.createdAt || now,
    });

    await updateOrderPayment(merchantOrderId, {
      merchantOrderId,
      mmOrderId: String(res.trans_order_id || txn.mmOrderId || ""),
      refundStatus,
      lastRefundRequestNo: refundRequestNo,
    });

    return c.json({
      success: true,
      merchantOrderId,
      refundRequestNo,
      refundStatus,
      transOrderId: String(res.trans_order_id || ""),
      refundOrderId: String(res.refund_order_id || ""),
      raw: gateway.response,
    });
  } catch (error: any) {
    console.error("❌ refundKPayOrder error:", error);
    return c.json({ error: "Failed to refund KPay order", message: String(error?.message || error) }, 500);
  }
}

export async function queryKPayRefund(c: Context) {
  try {
    const body = (await c.req.json().catch(() => ({}))) as AnyRecord;
    const merchantOrderId = String(body.merchantOrderId || c.req.param("merchantOrderId") || "").trim();
    const refundRequestNo = String(body.refundRequestNo || c.req.query("refundRequestNo") || "").trim();
    if (!merchantOrderId) return c.json({ error: "merchantOrderId is required" }, 400);

    const gateway = await callKPayGateway(
      getGatewayConfig().paths.queryrefund,
      "kbz.payment.queryrefund",
      {
        merch_order_id: merchantOrderId,
        ...(refundRequestNo ? { refund_request_no: refundRequestNo } : {}),
      },
      "1.0",
    );
    const res = gateway.responseData;
    if (String(res.result || "").toUpperCase() !== "SUCCESS" || String(res.code || "") !== "0") {
      return c.json({ error: "KPay queryrefund failed", code: res.code, message: res.msg, raw: gateway.response }, 502);
    }

    const txn = asRecord(await kv.get(`kpay_txn:${merchantOrderId}`));
    await kv.set(`kpay_txn:${merchantOrderId}`, {
      ...txn,
      rawQueryRefundResponse: gateway.response,
      updatedAt: new Date().toISOString(),
      createdAt: txn.createdAt || new Date().toISOString(),
    });

    return c.json({
      success: true,
      merchantOrderId,
      refundFinished: String(res.refund_finished || "N"),
      refundInfo: Array.isArray(res.refund_info) ? res.refund_info : [],
      raw: gateway.response,
    });
  } catch (error: any) {
    console.error("❌ queryKPayRefund error:", error);
    return c.json({ error: "Failed to query KPay refund", message: String(error?.message || error) }, 500);
  }
}

export async function getKPayStatus(c: Context) {
  try {
    const merchantOrderId = c.req.param("merchantOrderId");
    if (!merchantOrderId) return c.json({ error: "merchantOrderId is required" }, 400);

    const current = (await kv.get(`kpay_txn:${merchantOrderId}`)) as AnyRecord | null;
    if (!current) return c.json({ error: "KPay transaction not found" }, 404);

    const shouldSync = c.req.query("sync") === "1" || String(current.status || "") === "pending";
    if (shouldSync) {
      await syncKPayOrderStatus(merchantOrderId);
    }

    const latest = (await kv.get(`kpay_txn:${merchantOrderId}`)) as AnyRecord | null;
    return c.json({
      success: true,
      merchantOrderId,
      status: latest?.status || "pending",
      providerStatus: latest?.providerStatus || "",
      amount: latest?.amount,
      currency: latest?.currency,
      qrContent: latest?.qrContent || "",
      prepayId: latest?.prepayId || "",
      mmOrderId: latest?.mmOrderId || "",
      updatedAt: latest?.updatedAt,
    });
  } catch (error: any) {
    console.error("❌ getKPayStatus error:", error);
    return c.json({ error: "Failed to fetch KPay status", message: String(error?.message || error) }, 500);
  }
}

export async function handleKPayWebhook(c: Context) {
  try {
    const body = (await c.req.json()) as AnyRecord;
    const request = asRecord(body.Request);
    if (!Object.keys(request).length) {
      return c.text("invalid", 400);
    }
    const signKey = mustGetEnv("KPAY_SIGN_KEY");
    if (!(await verifyPayloadSignature(request, signKey))) {
      return c.text("invalid-sign", 401);
    }

    const merchantOrderId = String(request.merch_order_id || "").trim();
    if (!merchantOrderId) return c.text("invalid-order", 400);

    const existing = asRecord(await kv.get(`kpay_txn:${merchantOrderId}`));
    const paidAmount = String(request.total_amount || "");
    const existingAmount = String(existing.amount || "");
    const paidCurrency = String(request.trans_currency || "MMK");
    const existingCurrency = String(existing.currency || "MMK");
    if (existingAmount && paidAmount && existingAmount !== paidAmount) return c.text("invalid-amount", 400);
    if (existingCurrency !== paidCurrency) return c.text("invalid-currency", 400);

    const tradeStatus = String(request.trade_status || "");
    const status = mapKPayStatus(tradeStatus);
    const now = new Date().toISOString();
    await kv.set(`kpay_txn:${merchantOrderId}`, {
      ...existing,
      merchantOrderId,
      amount: paidAmount || existingAmount,
      currency: paidCurrency,
      status,
      providerStatus: tradeStatus,
      mmOrderId: String(request.mm_order_id || existing.mmOrderId || ""),
      paidAt: status === "paid" ? new Date(Number(request.trans_end_time || 0) * 1000 || Date.now()).toISOString() : existing.paidAt,
      rawWebhookRequest: { Request: request },
      updatedAt: now,
      createdAt: existing.createdAt || now,
    });

    await updateOrderPayment(merchantOrderId, {
      merchantOrderId,
      status,
      providerStatus: tradeStatus,
      mmOrderId: String(request.mm_order_id || ""),
    });

    return c.text("success", 200);
  } catch (error: any) {
    console.error("❌ handleKPayWebhook error:", error);
    return c.text("error", 500);
  }
}
