import { Context } from "npm:hono@4";
import * as kv from "./kv_store.tsx";

type AnyRecord = Record<string, unknown>;
type PaymentStatus = "pending" | "paid" | "failed";

const DEFAULT_CREATE_PATH = "/pgw/uat/order/make";
const DEFAULT_QUERY_PATH = "/pgw/uat/order/query";
const CREATE_PATH_CANDIDATES = [
  "/pgw/uat/order/make",
  "/pgw/uat/precreate",
  "/payment/gateway/uat/order/make",
  "/payment/gateway/uat/precreate",
  "/pgw-api/v1/payment/qr/create",
];
const QUERY_PATH_CANDIDATES = [
  "/pgw/uat/order/query",
  "/payment/gateway/uat/order/query",
  "/pgw-api/v1/payment/order/query",
];

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeAmountMMK(amount: unknown): string {
  const parsed = typeof amount === "string" ? Number(amount) : Number(amount ?? 0);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error("Invalid amount");
  }
  return String(Math.round(parsed));
}

function nowIso(): string {
  return new Date().toISOString();
}

function resolveEnv(name: string, fallbackName?: string): string {
  const primary = text(Deno.env.get(name));
  if (primary) return primary;
  if (!fallbackName) return "";
  return text(Deno.env.get(fallbackName));
}

function buildSignSource(payload: AnyRecord): string {
  const keys = Object.keys(payload)
    .filter((key) => !["sign", "signature", "signType"].includes(key))
    .filter((key) => {
      const value = payload[key];
      if (value === undefined || value === null) return false;
      if (typeof value === "string" && !value.trim()) return false;
      return true;
    })
    .sort();
  return keys.map((key) => `${key}=${String(payload[key])}`).join("&");
}

async function hmacSha256Upper(secret: string, source: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(source));
  const bytes = new Uint8Array(sig);
  return Array.from(bytes).map((b) => b.toString(16).padStart(2, "0")).join("").toUpperCase();
}

async function safeJson(res: Response): Promise<AnyRecord> {
  try {
    return await res.json();
  } catch {
    return {};
  }
}

async function postJson(
  url: string,
  payload: AnyRecord,
  timeoutMs: number,
  extraHeaders: Record<string, string> = {},
): Promise<{ ok: boolean; status: number; body: AnyRecord; networkError?: string }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort("kpay-timeout"), timeoutMs);
  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...extraHeaders,
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
    return { ok: response.ok, status: response.status, body: await safeJson(response) };
  } catch (error: any) {
    return { ok: false, status: 0, body: {}, networkError: String(error?.message || error) };
  } finally {
    clearTimeout(timer);
  }
}

function mapProviderStatus(rawStatus: unknown): PaymentStatus {
  const value = String(rawStatus ?? "").trim().toUpperCase();
  if (!value) return "pending";
  if (["PAID", "SUCCESS", "PAY_SUCCESS", "TRADE_SUCCESS", "COMPLETED"].includes(value)) return "paid";
  if (["FAILED", "FAIL", "CLOSED", "EXPIRED", "TRADE_CLOSED", "CANCELLED"].includes(value)) return "failed";
  return "pending";
}

function providerStatusFrom(payload: AnyRecord): string {
  const nested = (payload.data || payload.result || payload.response || {}) as AnyRecord;
  return String(
    nested.status ||
      nested.tradeStatus ||
      nested.orderStatus ||
      payload.status ||
      payload.tradeStatus ||
      payload.orderStatus ||
      payload.code ||
      "",
  ).trim();
}

function extractQrPayload(payload: AnyRecord): { qrContent: string; qrImageUrl: string; payUrl: string } {
  const nested = (payload.data || payload.result || payload.response || {}) as AnyRecord;
  return {
    qrContent: String(
      nested.qrContent || nested.qrCode || nested.qr_code || nested.qrString || payload.qrContent || "",
    ).trim(),
    qrImageUrl: String(
      nested.qrImage || nested.qrImg || nested.qrImageUrl || nested.qr_url || payload.qrImageUrl || "",
    ).trim(),
    payUrl: String(nested.payUrl || nested.paymentUrl || nested.deepLink || payload.payUrl || "").trim(),
  };
}

function canDowngrade(existing: AnyRecord | null, nextStatus: PaymentStatus): boolean {
  const previous = mapProviderStatus(existing?.status);
  if (previous === "paid" && nextStatus !== "paid") return false;
  return true;
}

async function findOrderByOrderNumber(orderNumber: string): Promise<{ key: string; order: AnyRecord } | null> {
  const all = await kv.getByPrefix("order:");
  const orders = Array.isArray(all) ? all : [];
  const found = orders.find((entry: any) => String(entry?.orderNumber || "") === orderNumber);
  if (!found || !found.id) return null;
  return { key: `order:${found.id}`, order: found };
}

async function upsertOrderPaymentStatus(
  merchantOrderId: string,
  status: PaymentStatus,
  providerStatus: string,
  paidAt?: string,
) {
  const found = await findOrderByOrderNumber(merchantOrderId);
  if (!found) return;

  const paymentStatus = status === "paid" ? "paid" : status === "failed" ? "failed" : "pending";
  const nextOrder: AnyRecord = {
    ...found.order,
    paymentStatus,
    status: status === "paid" ? "pending" : found.order.status,
    updatedAt: nowIso(),
    kpay: {
      ...(found.order.kpay as AnyRecord || {}),
      merchantOrderId,
      status,
      providerStatus,
      paidAt: status === "paid" ? paidAt || nowIso() : (found.order.kpay as AnyRecord)?.paidAt,
    },
  };
  await kv.set(found.key, nextOrder);
}

function kpayConfig() {
  const baseUrl = resolveEnv("KPAY_PROXY_BASE_URL", "KPAY_BASE_URL");
  const appId = resolveEnv("KPAY_APPID");
  const merchCode = resolveEnv("KPAY_MERCH_CODE", "KPAY_MERCHANT_ID");
  const signKey = resolveEnv("KPAY_SIGN_KEY", "KPAY_SECRET");
  const notifyUrl = resolveEnv("KPAY_NOTIFY_URL");
  const createPath = resolveEnv("KPAY_PATH_CREATE_QR", "KPAY_CREATE_QR_PATH") || DEFAULT_CREATE_PATH;
  const queryPath = resolveEnv("KPAY_PATH_QUERY_ORDER", "KPAY_QUERY_ORDER_PATH") || DEFAULT_QUERY_PATH;
  const apiKey = resolveEnv("KPAY_API_KEY");
  const timeoutMs = Math.max(4000, Number(resolveEnv("KPAY_TIMEOUT_MS")) || 12000);
  const autoDiscover = resolveEnv("KPAY_AUTO_DISCOVER") === "1";
  return { baseUrl, appId, merchCode, signKey, notifyUrl, createPath, queryPath, apiKey, timeoutMs, autoDiscover };
}

async function signedProviderRequest(
  endpoint: string,
  basePayload: AnyRecord,
  signKey: string,
  timeoutMs: number,
  apiKey?: string,
) {
  const signSource = buildSignSource(basePayload);
  const sign = await hmacSha256Upper(signKey, signSource);
  const payload = { ...basePayload, sign };
  const headers: Record<string, string> = {};
  if (apiKey) headers["x-api-key"] = apiKey;
  return postJson(endpoint, payload, timeoutMs, headers);
}

function endpointCandidates(
  baseUrl: string,
  primaryPath: string,
  kind: "create" | "query",
  strictPrimaryOnly: boolean,
): string[] {
  const pathCandidates = kind === "create" ? CREATE_PATH_CANDIDATES : QUERY_PATH_CANDIDATES;
  const unique = new Set<string>();

  if (text(primaryPath)) unique.add(primaryPath);
  if (!strictPrimaryOnly) {
    for (const path of pathCandidates) unique.add(path);
  }

  const resolved: string[] = [];
  for (const path of unique) {
    try {
      resolved.push(new URL(path, baseUrl).toString());
    } catch {
      // ignore malformed path and continue
    }
  }
  return resolved;
}

function createPayloadCandidates(params: {
  appId: string;
  merchCode: string;
  merchantOrderId: string;
  amount: string;
  currency: string;
  title: string;
  notifyUrl: string;
}, strictPrimaryOnly: boolean): AnyRecord[] {
  const nonce = crypto.randomUUID().replaceAll("-", "");
  const ts = Date.now();
  const primary: AnyRecord = {
    appid: params.appId,
    merch_code: params.merchCode,
    merch_order_id: params.merchantOrderId,
    total_amount: params.amount,
    trade_type: "QR",
    currency: params.currency,
    title: params.title,
    nonce_str: nonce,
    timestamp: ts,
    notify_url: params.notifyUrl,
  };
  if (strictPrimaryOnly) return [primary];
  return [
    primary,
    {
      appId: params.appId,
      merchCode: params.merchCode,
      merchOrderId: params.merchantOrderId,
      amount: params.amount,
      tradeType: "QR",
      currency: params.currency,
      subject: params.title,
      nonceStr: nonce,
      timestamp: ts,
      notifyUrl: params.notifyUrl,
    },
    {
      merchantId: params.merchCode,
      merchantOrderId: params.merchantOrderId,
      amount: params.amount,
      currency: params.currency,
      title: params.title,
      nonceStr: nonce,
      timestamp: ts,
      notifyUrl: params.notifyUrl,
    },
  ];
}

function queryPayloadCandidates(
  params: { appId: string; merchCode: string; merchantOrderId: string },
  strictPrimaryOnly: boolean,
): AnyRecord[] {
  const nonce = crypto.randomUUID().replaceAll("-", "");
  const ts = Date.now();
  const primary: AnyRecord = {
    appid: params.appId,
    merch_code: params.merchCode,
    merch_order_id: params.merchantOrderId,
    nonce_str: nonce,
    timestamp: ts,
  };
  if (strictPrimaryOnly) return [primary];
  return [
    primary,
    {
      appId: params.appId,
      merchCode: params.merchCode,
      merchOrderId: params.merchantOrderId,
      nonceStr: nonce,
      timestamp: ts,
    },
    {
      merchantId: params.merchCode,
      merchantOrderId: params.merchantOrderId,
      nonceStr: nonce,
      timestamp: ts,
    },
  ];
}

async function tryProviderVariants(args: {
  endpoints: string[];
  payloads: AnyRecord[];
  signKey: string;
  timeoutMs: number;
  apiKey?: string;
}) {
  const attempts: Array<{ endpoint: string; status: number; networkError?: string; details?: AnyRecord }> = [];
  for (const endpoint of args.endpoints) {
    for (const payload of args.payloads) {
      const res = await signedProviderRequest(endpoint, payload, args.signKey, args.timeoutMs, args.apiKey);
      if (res.ok) {
        return { success: true as const, endpoint, body: res.body };
      }
      attempts.push({
        endpoint,
        status: res.status || 0,
        networkError: res.networkError,
        details: res.body,
      });
    }
  }
  return { success: false as const, attempts };
}

export async function createKPayQr(c: Context) {
  try {
    const cfg = kpayConfig();
    if (!cfg.baseUrl || !cfg.appId || !cfg.merchCode || !cfg.signKey) {
      return c.json({
        error: "KPay gateway is not configured",
        missing: [
          !cfg.baseUrl ? "KPAY_PROXY_BASE_URL" : null,
          !cfg.appId ? "KPAY_APPID" : null,
          !cfg.merchCode ? "KPAY_MERCH_CODE" : null,
          !cfg.signKey ? "KPAY_SIGN_KEY" : null,
        ].filter(Boolean),
      }, 500);
    }

    const body = (await c.req.json()) as AnyRecord;
    const merchantOrderId = text(body.merchantOrderId);
    if (!merchantOrderId) return c.json({ error: "merchantOrderId is required" }, 400);

    const amount = normalizeAmountMMK(body.amount);
    const currency = text(body.currency || "MMK") || "MMK";
    const notifyUrl = text(body.notifyUrl) || cfg.notifyUrl;

    const endpoints = endpointCandidates(cfg.baseUrl, cfg.createPath, "create", !cfg.autoDiscover);
    const strictPrimaryOnly = !cfg.autoDiscover;
    const payloads = createPayloadCandidates({
      appId: cfg.appId,
      merchCode: cfg.merchCode,
      merchantOrderId,
      amount,
      currency,
      title: text(body.title) || `Order ${merchantOrderId}`,
      notifyUrl,
    }, strictPrimaryOnly);

    const provider = await tryProviderVariants({
      endpoints,
      payloads,
      signKey: cfg.signKey,
      timeoutMs: cfg.timeoutMs,
      apiKey: cfg.apiKey,
    });
    if (!provider.success) {
      const last = provider.attempts[provider.attempts.length - 1];
      return c.json(
        {
          error: "kpay-create-failed",
          status: last?.status || 502,
          details: last?.details || {},
          networkError: last?.networkError || undefined,
          endpoint: last?.endpoint || "",
          attemptedEndpoints: Array.from(new Set(provider.attempts.map((a) => a.endpoint))),
        },
        502,
      );
    }

    const providerStatus = providerStatusFrom(provider.body);
    const status = mapProviderStatus(providerStatus);
    const qr = extractQrPayload(provider.body);
    const timestamp = nowIso();

    await kv.set(`kpay_txn:${merchantOrderId}`, {
      merchantOrderId,
      amount,
      currency,
      status,
      providerStatus,
      qrContent: qr.qrContent,
      qrImageUrl: qr.qrImageUrl,
      payUrl: qr.payUrl,
      createdAt: timestamp,
      updatedAt: timestamp,
      rawCreateResponse: provider.body,
      endpointUsed: provider.endpoint,
    });

    return c.json({
      success: true,
      merchantOrderId,
      status,
      providerStatus,
      qrContent: qr.qrContent,
      qrImageUrl: qr.qrImageUrl,
      payUrl: qr.payUrl,
      endpointUsed: provider.endpoint,
    });
  } catch (error: any) {
    console.error("createKPayQr error", error);
    return c.json({ error: "Failed to create KPay QR", message: String(error?.message || error) }, 500);
  }
}

export async function getKPayStatus(c: Context) {
  try {
    const cfg = kpayConfig();
    const merchantOrderId = text(c.req.param("merchantOrderId"));
    if (!merchantOrderId) return c.json({ error: "merchantOrderId is required" }, 400);

    const existing = (await kv.get(`kpay_txn:${merchantOrderId}`)) as AnyRecord | null;
    if (!cfg.baseUrl || !cfg.appId || !cfg.merchCode || !cfg.signKey) {
      if (!existing) return c.json({ error: "KPay transaction not found" }, 404);
      return c.json({
        success: true,
        merchantOrderId,
        status: existing.status || "pending",
        providerStatus: existing.providerStatus || "",
        qrContent: existing.qrContent || "",
        qrImageUrl: existing.qrImageUrl || "",
        payUrl: existing.payUrl || "",
        updatedAt: existing.updatedAt,
      });
    }

    const endpoints = endpointCandidates(cfg.baseUrl, cfg.queryPath, "query", !cfg.autoDiscover);
    const strictPrimaryOnly = !cfg.autoDiscover;
    const payloads = queryPayloadCandidates({
      appId: cfg.appId,
      merchCode: cfg.merchCode,
      merchantOrderId,
    }, strictPrimaryOnly);
    const provider = await tryProviderVariants({
      endpoints,
      payloads,
      signKey: cfg.signKey,
      timeoutMs: cfg.timeoutMs,
      apiKey: cfg.apiKey,
    });

    if (!provider.success) {
      const last = provider.attempts[provider.attempts.length - 1];
      if (!existing) {
        return c.json(
          {
            error: "kpay-query-failed",
            status: last?.status || 502,
            details: last?.details || {},
            networkError: last?.networkError || undefined,
            endpoint: last?.endpoint || "",
            attemptedEndpoints: Array.from(new Set(provider.attempts.map((a) => a.endpoint))),
          },
          502,
        );
      }
      return c.json({
        success: true,
        merchantOrderId,
        status: existing.status || "pending",
        providerStatus: existing.providerStatus || "",
        qrContent: existing.qrContent || "",
        qrImageUrl: existing.qrImageUrl || "",
        payUrl: existing.payUrl || "",
        updatedAt: existing.updatedAt,
        stale: true,
      });
    }

    const providerStatus = providerStatusFrom(provider.body);
    const nextStatus = mapProviderStatus(providerStatus);
    const safeStatus = canDowngrade(existing, nextStatus) ? nextStatus : "paid";
    const qr = extractQrPayload(provider.body);
    const paidAt = safeStatus === "paid" ? nowIso() : text(existing?.paidAt);
    const updatedAt = nowIso();

    await kv.set(`kpay_txn:${merchantOrderId}`, {
      ...(existing || {}),
      merchantOrderId,
      status: safeStatus,
      providerStatus,
      qrContent: qr.qrContent || text(existing?.qrContent),
      qrImageUrl: qr.qrImageUrl || text(existing?.qrImageUrl),
      payUrl: qr.payUrl || text(existing?.payUrl),
      rawStatusResponse: provider.body,
      endpointUsed: provider.endpoint,
      paidAt: paidAt || undefined,
      createdAt: text(existing?.createdAt) || updatedAt,
      updatedAt,
    });

    if (safeStatus === "paid" || safeStatus === "failed") {
      await upsertOrderPaymentStatus(merchantOrderId, safeStatus, providerStatus, paidAt || undefined);
    }

    return c.json({
      success: true,
      merchantOrderId,
      status: safeStatus,
      providerStatus,
      qrContent: qr.qrContent || text(existing?.qrContent),
      qrImageUrl: qr.qrImageUrl || text(existing?.qrImageUrl),
      payUrl: qr.payUrl || text(existing?.payUrl),
      paidAt: paidAt || undefined,
      updatedAt,
    });
  } catch (error: any) {
    console.error("getKPayStatus error", error);
    return c.json({ error: "Failed to fetch KPay status", message: String(error?.message || error) }, 500);
  }
}

export async function handleKPayWebhook(c: Context) {
  try {
    const cfg = kpayConfig();
    if (!cfg.signKey) return c.json({ error: "KPAY_SIGN_KEY is required" }, 500);

    const body = (await c.req.json()) as AnyRecord;
    const merchantOrderId = text(body.merchantOrderId || body.merch_order_id || body.outTradeNo);
    if (!merchantOrderId) return c.json({ error: "merchantOrderId missing" }, 400);

    const providedSign = text(
      c.req.header("x-kpay-signature") ||
        c.req.header("x-signature") ||
        body.sign ||
        body.signature,
    ).toUpperCase();
    const source = buildSignSource(body);
    const expectedSign = await hmacSha256Upper(cfg.signKey, source);
    if (!providedSign || providedSign !== expectedSign) {
      return c.json({ error: "Invalid signature" }, 401);
    }

    const providerStatus = providerStatusFrom(body);
    const nextStatus = mapProviderStatus(providerStatus);
    const existing = (await kv.get(`kpay_txn:${merchantOrderId}`)) as AnyRecord | null;
    const safeStatus = canDowngrade(existing, nextStatus) ? nextStatus : "paid";
    const paidAt = safeStatus === "paid" ? text(existing?.paidAt) || nowIso() : text(existing?.paidAt);
    const updatedAt = nowIso();

    await kv.set(`kpay_txn:${merchantOrderId}`, {
      ...(existing || {}),
      merchantOrderId,
      status: safeStatus,
      providerStatus,
      paidAt: paidAt || undefined,
      rawWebhook: body,
      createdAt: text(existing?.createdAt) || updatedAt,
      updatedAt,
    });

    await upsertOrderPaymentStatus(merchantOrderId, safeStatus, providerStatus, paidAt || undefined);
    return c.json({ success: true });
  } catch (error: any) {
    console.error("handleKPayWebhook error", error);
    return c.json({ error: "Webhook handling failed", message: String(error?.message || error) }, 500);
  }
}
