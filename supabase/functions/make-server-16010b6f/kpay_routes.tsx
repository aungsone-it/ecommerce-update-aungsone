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
  // KBZ stringA: sort all keys alphabetically, join as k=v with '&', no URL-encoding.
  // Per KBZ spec, exclude `sign`, `signature`, AND `sign_type` from the signing string.
  // Also: callers must pass a FLATTENED collection (no nested objects / no `biz_content`),
  // because KBZ verifies against the union of common params + biz_content fields.
  const keys = Object.keys(payload)
    .filter((key) => !["sign", "signature", "sign_type"].includes(key))
    .filter((key) => {
      const value = payload[key];
      if (value === undefined || value === null) return false;
      if (typeof value === "string" && !value.trim()) return false;
      return true;
    })
    .sort();
  return keys.map((key) => `${key}=${String(payload[key])}`).join("&");
}

async function sha256Upper(source: string): Promise<string> {
  const enc = new TextEncoder();
  const sig = await crypto.subtle.digest("SHA-256", enc.encode(source));
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

function asRecord(value: unknown): AnyRecord {
  if (!value) return {};
  if (typeof value === "object" && !Array.isArray(value)) return value as AnyRecord;
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value) as unknown;
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        return parsed as AnyRecord;
      }
    } catch {
      // ignore parse failure
    }
  }
  return {};
}

function providerData(payload: AnyRecord): AnyRecord {
  const responseWrapper = asRecord(payload.Response);
  const nested = asRecord(payload.data || payload.result || payload.response);
  const wrappedNested = asRecord(responseWrapper.data || responseWrapper.result || responseWrapper.response);
  if (Object.keys(wrappedNested).length > 0) return wrappedNested;
  if (Object.keys(nested).length > 0) return nested;
  if (Object.keys(responseWrapper).length > 0) return responseWrapper;
  return {};
}

// KBZ often returns HTTP 200 even when the gateway result is FAIL.
// We must inspect the payload's `result`/`return_code` to decide success.
function providerIndicatesSuccess(body: AnyRecord): boolean {
  const nested = providerData(body);

  const resultRaw =
    nested.result ??
    nested.return_code ??
    nested.returnCode ??
    nested.result_code ??
    nested.resultCode ??
    "";

  const result = String(resultRaw).trim().toUpperCase();
  if (!result) return false;

  // Your logs show: result="FAIL" and code="AOP04502" on failure.
  return ["SUCCESS", "OK"].includes(result);
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
    // `redirect: "manual"` so an HTTP→HTTPS 301 (or any other 30x) doesn't silently
    // strip our POST body. KBZ's relay used to do this and we'd see misleading
    // "internal system error!" responses. Surface it as an explicit error instead.
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...extraHeaders,
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
      redirect: "manual",
    });
    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get("location") || "";
      return {
        ok: false,
        status: response.status,
        body: {},
        networkError: `KPay endpoint redirected (${response.status}) to ${location || "<unknown>"}. Update KPAY_PROXY_BASE_URL to the redirect target.`,
      };
    }
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
  if (["PAID", "SUCCESS", "PAY_SUCCESS", "TRADE_SUCCESS", "COMPLETED", "PAY_SUCCESSS"].includes(value)) return "paid";
  if (["FAILED", "FAIL", "CLOSED", "EXPIRED", "TRADE_CLOSED", "CANCELLED", "PAY_FAILED", "ORDER_EXPIRED", "ORDER_CLOSED"].includes(value)) return "failed";
  return "pending";
}

function providerStatusFrom(payload: AnyRecord): string {
  const nested = providerData(payload);
  return String(
    nested.status ||
      nested.tradeStatus ||
      nested.trade_status ||
      nested.orderStatus ||
      nested.code ||
      nested.resultCode ||
      payload.status ||
      payload.tradeStatus ||
      payload.orderStatus ||
      payload.code ||
      payload.resultCode ||
      asRecord(payload.Response).status ||
      asRecord(payload.Response).code ||
      payload.code ||
      "",
  ).trim();
}

function extractQrPayload(payload: AnyRecord): { qrContent: string; qrImageUrl: string; payUrl: string } {
  const nested = providerData(payload);
  return {
    qrContent: String(
      nested.qrContent ||
        nested.qrCode ||
        nested.qr_code ||
        nested.qrString ||
        nested.codeUrl ||
        nested.code_url ||
        nested.rawQr ||
        payload.qrContent ||
        asRecord(payload.Response).qrContent ||
        "",
    ).trim(),
    qrImageUrl: String(
      nested.qrImage ||
        nested.qrImg ||
        nested.qrImageUrl ||
        nested.qr_url ||
        nested.qrcodeImg ||
        nested.qrcode_img ||
        nested.qrCodeImage ||
        payload.qrImageUrl ||
        asRecord(payload.Response).qrImageUrl ||
        "",
    ).trim(),
    payUrl: String(
      nested.payUrl ||
        nested.paymentUrl ||
        nested.deepLink ||
        nested.prepayUrl ||
        nested.cashierUrl ||
        payload.payUrl ||
        asRecord(payload.Response).payUrl ||
        "",
    ).trim(),
  };
}

function topLevelKeys(payload: AnyRecord): string[] {
  return Object.keys(payload || {}).sort();
}

function nestedKeys(payload: AnyRecord): string[] {
  const nested = providerData(payload);
  if (!nested || typeof nested !== "object") return [];
  return Object.keys(nested).sort();
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
  const appId = resolveEnv("KPAY_APPID", "KPAY_APP_ID");
  const merchCode = resolveEnv("KPAY_MERCH_CODE", "KPAY_MERCHANT_ID");
  const signKey = resolveEnv("KPAY_SIGN_KEY", "KPAY_SECRET");
  const notifyUrl = resolveEnv("KPAY_NOTIFY_URL");
  const createPath = resolveEnv("KPAY_PATH_CREATE_QR", "KPAY_CREATE_QR_PATH") || DEFAULT_CREATE_PATH;
  const queryPath = resolveEnv("KPAY_PATH_QUERY_ORDER", "KPAY_QUERY_ORDER_PATH") || DEFAULT_QUERY_PATH;
  const apiKey = resolveEnv("KPAY_API_KEY");
  const timeoutMs = Math.max(4000, Number(resolveEnv("KPAY_TIMEOUT_MS")) || 12000);
  const autoDiscover = resolveEnv("KPAY_AUTO_DISCOVER") === "1";
  const strictProtocol = resolveEnv("KPAY_STRICT_PROTOCOL") !== "0";
  // KBZ examples typically wrap payload under "Request".
  // Default to wrapped mode unless explicitly disabled.
  const wrapRequest = resolveEnv("KPAY_WRAP_REQUEST") !== "0";
  // The 150.109.123.187 relay (and similar KBZ partner proxies) gate inbound traffic
  // with an auth header that's separate from the KBZ sign key. Header name, scheme,
  // and token are configurable so the same code works against direct KBZ endpoints
  // (none of these set) and against gated proxies (all three set).
  const proxyAuthHeader = resolveEnv("KPAY_PROXY_AUTH_HEADER");
  const proxyAuthScheme = resolveEnv("KPAY_PROXY_AUTH_SCHEME");
  const proxyAuthToken = resolveEnv("KPAY_PROXY_AUTH_TOKEN");
  return {
    baseUrl, appId, merchCode, signKey, notifyUrl, createPath, queryPath,
    apiKey, timeoutMs, autoDiscover, strictProtocol, wrapRequest,
    proxyAuthHeader, proxyAuthScheme, proxyAuthToken,
  };
}

// Build the set of headers the KBZ proxy expects on every call.
// `x-api-key` covers gateways that take a key on that header.
// `KPAY_PROXY_AUTH_*` covers gateways that take a custom header (often Authorization).
function buildProviderHeaders(cfg: ReturnType<typeof kpayConfig>): Record<string, string> {
  const headers: Record<string, string> = {};
  if (cfg.apiKey) headers["x-api-key"] = cfg.apiKey;
  if (cfg.proxyAuthToken) {
    const headerName = text(cfg.proxyAuthHeader) || "Authorization";
    const scheme = text(cfg.proxyAuthScheme);
    headers[headerName] = scheme ? `${scheme} ${cfg.proxyAuthToken}` : cfg.proxyAuthToken;
  }
  return headers;
}

// A KBZ provider call has two distinct shapes:
//   - signCollection: the FLATTENED key/value map used to compute `sign` (stringA).
//   - requestBody:    what actually goes on the wire. `biz_content` here is an OBJECT,
//                     not a stringified JSON, per the KBZ reference clients.
type PayloadPair = { signCollection: AnyRecord; requestBody: AnyRecord };

async function signedProviderRequest(
  endpoint: string,
  pair: PayloadPair,
  signKey: string,
  timeoutMs: number,
  wrapRequest: boolean,
  extraHeaders: Record<string, string>,
) {
  const signSource = buildSignSource(pair.signCollection);
  const sign = await sha256Upper(`${signSource}&key=${signKey}`);
  const signed = { ...pair.requestBody, sign };
  const payload = wrapRequest ? { Request: signed } : signed;
  const response = await postJson(endpoint, payload, timeoutMs, extraHeaders);
  return { ...response, signSource, sign, signedPayload: payload };
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

// KBZ PGW `precreate` (PAY_BY_QRCODE) — see https://wap.kbzpay.com/pgw/uat/api/.
// Signing rule (stringA): union of common params + every biz_content field, sorted, no URL encoding,
// excluding `sign` and `sign_type`. `biz_content` itself is NOT in stringA.
// Wire body: `biz_content` is sent as a JSON OBJECT.
function createPayloadCandidates(params: {
  appId: string;
  merchCode: string;
  merchantOrderId: string;
  amount: string;
  currency: string;
  notifyUrl: string;
}): PayloadPair[] {
  const nonce = crypto.randomUUID().replaceAll("-", "");
  const ts = String(Math.floor(Date.now() / 1000));

  const bizContent: AnyRecord = {
    appid: params.appId,
    merch_code: params.merchCode,
    merch_order_id: params.merchantOrderId,
    total_amount: params.amount,
    trans_currency: params.currency,
    trade_type: "PAY_BY_QRCODE",
  };

  const signCollection: AnyRecord = {
    appid: params.appId,
    merch_code: params.merchCode,
    merch_order_id: params.merchantOrderId,
    method: "kbz.payment.precreate",
    nonce_str: nonce,
    timestamp: ts,
    total_amount: params.amount,
    trade_type: "PAY_BY_QRCODE",
    trans_currency: params.currency,
    version: "1.0",
  };
  if (text(params.notifyUrl)) {
    signCollection.notify_url = params.notifyUrl;
  }

  const requestBody: AnyRecord = {
    timestamp: ts,
    method: "kbz.payment.precreate",
    nonce_str: nonce,
    sign_type: "SHA256",
    version: "1.0",
    biz_content: bizContent,
  };
  if (text(params.notifyUrl)) {
    requestBody.notify_url = params.notifyUrl;
  }

  return [{ signCollection, requestBody }];
}

// KBZ PGW `queryorder` uses version "3.0" per the PGW reference.
function queryPayloadCandidates(params: {
  appId: string;
  merchCode: string;
  merchantOrderId: string;
}): PayloadPair[] {
  const nonce = crypto.randomUUID().replaceAll("-", "");
  const ts = String(Math.floor(Date.now() / 1000));

  const bizContent: AnyRecord = {
    appid: params.appId,
    merch_code: params.merchCode,
    merch_order_id: params.merchantOrderId,
  };

  const signCollection: AnyRecord = {
    appid: params.appId,
    merch_code: params.merchCode,
    merch_order_id: params.merchantOrderId,
    method: "kbz.payment.queryorder",
    nonce_str: nonce,
    timestamp: ts,
    version: "3.0",
  };

  const requestBody: AnyRecord = {
    timestamp: ts,
    method: "kbz.payment.queryorder",
    nonce_str: nonce,
    sign_type: "SHA256",
    version: "3.0",
    biz_content: bizContent,
  };

  return [{ signCollection, requestBody }];
}

async function tryProviderVariants(args: {
  endpoints: string[];
  payloads: PayloadPair[];
  signKey: string;
  timeoutMs: number;
  wrapRequest: boolean;
  extraHeaders: Record<string, string>;
}) {
  const attempts: Array<{
    endpoint: string;
    status: number;
    networkError?: string;
    details?: AnyRecord;
    signSource?: string;
    sign?: string;
    signedPayload?: AnyRecord;
  }> = [];
  for (const endpoint of args.endpoints) {
    for (const pair of args.payloads) {
      const res = await signedProviderRequest(
        endpoint,
        pair,
        args.signKey,
        args.timeoutMs,
        args.wrapRequest,
        args.extraHeaders,
      );
      if (providerIndicatesSuccess(res.body)) {
        return { success: true as const, endpoint, body: res.body, signSource: res.signSource, sign: res.sign, signedPayload: res.signedPayload };
      }
      attempts.push({
        endpoint,
        status: res.status || 0,
        networkError: res.networkError,
        details: res.body,
        signSource: res.signSource,
        sign: res.sign,
        signedPayload: res.signedPayload,
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

    const strictPrimaryOnly = cfg.strictProtocol ? true : !cfg.autoDiscover;
    const endpoints = endpointCandidates(cfg.baseUrl, cfg.createPath, "create", strictPrimaryOnly);
    const payloads = createPayloadCandidates({
      appId: cfg.appId,
      merchCode: cfg.merchCode,
      merchantOrderId,
      amount,
      currency,
      notifyUrl,
    });

    const provider = await tryProviderVariants({
      endpoints,
      payloads,
      signKey: cfg.signKey,
      timeoutMs: cfg.timeoutMs,
      wrapRequest: cfg.wrapRequest,
      extraHeaders: buildProviderHeaders(cfg),
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
          wrapRequest: cfg.wrapRequest,
          signSource: last?.signSource || "",
          sign: last?.sign || "",
          signedPayload: last?.signedPayload || {},
          attemptedEndpoints: Array.from(new Set(provider.attempts.map((a) => a.endpoint))),
        },
        502,
      );
    }

    const providerStatus = providerStatusFrom(provider.body);
    // `precreate` never carries a payment status (its `code=0` just means "QR issued").
    // Real status comes from `queryorder` or the async webhook.
    const status: PaymentStatus = "pending";
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
      wrapRequest: cfg.wrapRequest,
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
      wrapRequest: cfg.wrapRequest,
      debug: {
        wrapRequest: cfg.wrapRequest,
        signSource: provider.signSource || "",
        sign: provider.sign || "",
        signedPayload: provider.signedPayload || {},
        providerTopLevelKeys: topLevelKeys(provider.body),
        providerNestedKeys: nestedKeys(provider.body),
      },
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

    const strictPrimaryOnly = cfg.strictProtocol ? true : !cfg.autoDiscover;
    const endpoints = endpointCandidates(cfg.baseUrl, cfg.queryPath, "query", strictPrimaryOnly);
    const payloads = queryPayloadCandidates({
      appId: cfg.appId,
      merchCode: cfg.merchCode,
      merchantOrderId,
    });
    const provider = await tryProviderVariants({
      endpoints,
      payloads,
      signKey: cfg.signKey,
      timeoutMs: cfg.timeoutMs,
      wrapRequest: cfg.wrapRequest,
      extraHeaders: buildProviderHeaders(cfg),
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
            wrapRequest: cfg.wrapRequest,
            signSource: last?.signSource || "",
            sign: last?.sign || "",
            signedPayload: last?.signedPayload || {},
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
        endpointUsed: text(existing?.endpointUsed),
        queryEndpointUsed: last?.endpoint || "",
        wrapRequest: cfg.wrapRequest,
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
      endpointUsed: text(existing?.endpointUsed) || provider.endpoint,
      queryEndpointUsed: provider.endpoint,
      wrapRequest: cfg.wrapRequest,
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
      endpointUsed: text(existing?.endpointUsed) || provider.endpoint,
      queryEndpointUsed: provider.endpoint,
      wrapRequest: cfg.wrapRequest,
      paidAt: paidAt || undefined,
      updatedAt,
      debug: {
        wrapRequest: cfg.wrapRequest,
        signSource: provider.signSource || "",
        sign: provider.sign || "",
        signedPayload: provider.signedPayload || {},
        providerTopLevelKeys: topLevelKeys(provider.body),
        providerNestedKeys: nestedKeys(provider.body),
      },
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
    const expectedSign = await sha256Upper(`${source}&key=${cfg.signKey}`);
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
