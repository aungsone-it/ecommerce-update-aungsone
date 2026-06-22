import { Context } from "npm:hono@4";
import * as kv from "./kv_store.tsx";
import {
  savePwaCheckoutDraft,
  getPwaCheckoutDraft,
  finalizePwaCheckoutOrder,
  buildPwaSummaryAbsoluteUrl,
  enrichPwaDraftWithCallback,
} from "./pwa_finalize.ts";
import {
  getOrphanedPwaDraftsRoute,
  getPwaDraftStatusRoute,
  postPwaReconcileRoute as runPwaReconcileRoute,
} from "./pwa_reconcile.ts";
import { queueOrderReadModelSync } from "./read_model.ts";
import { queueMetaCapiPurchaseFromOrder } from "./meta_capi.tsx";

type AnyRecord = Record<string, unknown>;
type PaymentStatus = "pending" | "paid" | "failed";

const DEFAULT_CREATE_PATH = "/pgw/uat/order/make";
const DEFAULT_QUERY_PATH = "/payment/gateway/uat/queryorder";
const CREATE_PATH_CANDIDATES = [
  "/pgw/uat/order/make",
  "/pgw/uat/precreate",
  "/payment/gateway/uat/order/make",
  "/payment/gateway/uat/precreate",
  "/pgw-api/v1/payment/qr/create",
];
// PWA should hit precreate-style paths only (not QR-specific make/create paths).
const PWA_CREATE_PATH_CANDIDATES = [
  "/payment/gateway/uat/precreate",
  "/pgw/uat/precreate",
  "/payment/gateway/precreate",
  "/pgw/precreate",
];
const QUERY_PATH_CANDIDATES = [
  "/payment/gateway/uat/queryorder",
  "/queryorder",
  "/pgw/uat/queryorder",
  "/pgw/uat/order/query",
  "/payment/gateway/uat/order/query",
  "/payment/gateway/uat/orderquery",
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

/** Read response as text first so 4xx HTML/plain errors are not lost as `{}`. */
function bodyFromResponseText(rawText: string): AnyRecord {
  const t = String(rawText ?? "").trim();
  if (!t) return {};
  try {
    const parsed = JSON.parse(t) as unknown;
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed as AnyRecord;
    }
    return { _raw: t.slice(0, 8000) };
  } catch {
    return { _raw: t.slice(0, 8000) };
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

/** Best-effort KBZ business error fields for human-readable client toasts. */
function kbzBizErrorFromBody(body: AnyRecord): { code?: string; msg?: string; result?: string } {
  if (!body || typeof body !== "object") return {};
  const data = providerData(body);
  const rawCode = data.code ?? data.err_code ?? data.error_code;
  const rawMsg = data.msg ?? data.message ?? data.error_msg ?? data.err_msg ?? data.sub_msg;
  const rawResult = data.result ?? data.return_code ?? data.returnCode;
  const out: { code?: string; msg?: string; result?: string } = {};
  if (rawCode !== undefined && rawCode !== null && String(rawCode).trim() !== "") {
    out.code = String(rawCode).trim();
  }
  if (rawMsg !== undefined && rawMsg !== null && String(rawMsg).trim() !== "") {
    out.msg = String(rawMsg).trim();
  }
  if (rawResult !== undefined && rawResult !== null && String(rawResult).trim() !== "") {
    out.result = String(rawResult).trim();
  }
  return out;
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

/**
 * KBZ refund may return HTTP 200 with `refund_status` / biz codes while generic `result`
 * is missing or still SUCCESS without the same shape as precreate. Accept those responses
 * so admin cancel → refund does not false-negative while the gateway still credits the wallet.
 */
function providerIndicatesRefundAccepted(body: AnyRecord): boolean {
  if (providerIndicatesSuccess(body)) return true;

  const nested = providerData(body);
  const wrapped = asRecord(body.Response);
  const rs = refundStatusFrom(body);

  if (rs) {
    const fail =
      rs.includes("FAIL") ||
      rs === "REFUND_FAILED" ||
      rs === "REFUND_REJECT" ||
      rs === "REFUND_REJECTED";
    if (!fail) {
      if (
        rs === "REFUND_SUCCESS" ||
        rs === "SUCCESS" ||
        rs === "REFUND_PROCESSING" ||
        rs === "PROCESSING" ||
        rs === "REFUND_PENDING" ||
        rs === "PENDING"
      ) {
        return true;
      }
      if (rs.startsWith("REFUND_")) return true;
    }
  }

  const topResult = String(
    wrapped.result ?? nested.result ?? body.result ?? "",
  )
    .trim()
    .toUpperCase();
  if (topResult === "SUCCESS" || topResult === "OK") {
    const refundSignal =
      text(nested.refund_status) ||
      text(nested.refundStatus) ||
      text(nested.refund_request_no) ||
      text(nested.refundRequestNo) ||
      text(wrapped.refund_request_no) ||
      text(wrapped.refundRequestNo);
    if (refundSignal || rs) return true;
  }

  const code = String(nested.code ?? wrapped.code ?? body.code ?? "").trim();
  const hasRefundNo = Boolean(
    text(nested.refund_request_no) ||
      text(nested.refundRequestNo) ||
      text(wrapped.refund_request_no) ||
      text(wrapped.refundRequestNo),
  );
  if (
    (code === "0" || code === "00" || code === "0000" || code === "10000") &&
    (hasRefundNo || rs)
  ) {
    return true;
  }

  // VPS refund.php proxy (MIGOO relay) — { "ok": true, "kbz": { ... } }
  if (body.ok === true) return true;
  if (body.success === true) return true;

  return false;
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
        networkError: `KBZPay endpoint redirected (${response.status}) to ${location || "<unknown>"}. Update KPAY_PROXY_BASE_URL to the redirect target.`,
      };
    }
    const rawText = await response.text();
    return {
      ok: response.ok,
      status: response.status,
      body: bodyFromResponseText(rawText),
    };
  } catch (error: any) {
    return { ok: false, status: 0, body: {}, networkError: String(error?.message || error) };
  } finally {
    clearTimeout(timer);
  }
}

function mapProviderStatus(rawStatus: unknown): PaymentStatus {
  const value = String(rawStatus ?? "").trim().toUpperCase();
  if (!value) return "pending";
  if ([
    "PAID",
    "SUCCESS",
    "PAY_SUCCESS",
    "TRADE_SUCCESS",
    "COMPLETED",
    "PAY_SUCCESSS",
    "PAYED",
    "TRANSACTION_SUCCESS",
  ].includes(value)) return "paid";
  if ([
    "FAILED",
    "FAIL",
    "CLOSED",
    "EXPIRED",
    "TRADE_CLOSED",
    "CANCELLED",
    "PAY_FAILED",
    "ORDER_EXPIRED",
    "ORDER_CLOSED",
    "TRANSACTION_FAILED",
    "TRADE_FAIL",
  ].includes(value)) return "failed";
  return "pending";
}

function providerStatusFrom(payload: AnyRecord): string {
  const nested = providerData(payload);
  const wrapped = asRecord(payload.Response);

  const paymentCandidates = [
    nested.tradeStatus,
    nested.trade_status,
    nested.orderStatus,
    nested.order_status,
    nested.payStatus,
    nested.pay_status,
    nested.paymentStatus,
    nested.payment_status,
    nested.status,
    wrapped.tradeStatus,
    wrapped.trade_status,
    wrapped.orderStatus,
    wrapped.order_status,
    wrapped.payStatus,
    wrapped.pay_status,
    wrapped.paymentStatus,
    wrapped.payment_status,
    wrapped.status,
    payload.tradeStatus,
    payload.trade_status,
    payload.orderStatus,
    payload.order_status,
    payload.payStatus,
    payload.pay_status,
    payload.paymentStatus,
    payload.payment_status,
    payload.status,
  ];

  // Many KBZ responses include generic success code values (e.g. "0")
  // in `status`/`code`; ignore those and prefer trade/payment status fields.
  for (const candidate of paymentCandidates) {
    const v = String(candidate ?? "").trim();
    if (!v) continue;
    if (["0", "00", "000", "0000"].includes(v)) continue;
    return v;
  }

  const codeFallbacks = [
    nested.code,
    nested.resultCode,
    nested.result_code,
    nested.respCode,
    nested.resp_code,
    wrapped.code,
    wrapped.resultCode,
    wrapped.result_code,
    wrapped.respCode,
    wrapped.resp_code,
    payload.code,
    payload.resultCode,
    payload.result_code,
    payload.respCode,
    payload.resp_code,
  ];
  for (const candidate of codeFallbacks) {
    const v = String(candidate ?? "").trim();
    if (v) return v;
  }
  return "";
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
  const num = text(orderNumber);
  if (!num) return null;

  const mappedId = text(await kv.get(`order_num:${num}`));
  if (mappedId) {
    const order = (await kv.get(`order:${mappedId}`)) as AnyRecord | null;
    if (order && typeof order === "object") {
      return { key: `order:${mappedId}`, order };
    }
  }

  try {
    const rows = await kv.getByPrefixWithKeys("order:");
    const match = rows.find(({ value: o }) => {
      if (!o || typeof o !== "object") return false;
      const orderNum = String(o.orderNumber || "").trim();
      const kpayMid = String(asRecord(o.kpay).merchantOrderId || "").trim();
      return orderNum === num || kpayMid === num;
    });
    if (!match) return null;
    return { key: match.key, order: match.value as AnyRecord };
  } catch (e) {
    console.error("[kpay] findOrderByOrderNumber failed:", e);
    return null;
  }
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
  queueOrderReadModelSync(String(nextOrder.id || found.key.replace(/^order:/, "") || merchantOrderId), nextOrder);
  if (status === "paid") {
    queueMetaCapiPurchaseFromOrder(nextOrder);
  }
}

function kpayConfig() {
  const baseUrl = resolveEnv("KPAY_PROXY_BASE_URL", "KPAY_BASE_URL");
  const appId = resolveEnv("KPAY_APPID", "KPAY_APP_ID");
  const merchCode = resolveEnv("KPAY_MERCH_CODE", "KPAY_MERCHANT_ID");
  const signKey = resolveEnv("KPAY_SIGN_KEY", "KPAY_SECRET");
  const notifyUrl = resolveEnv("KPAY_NOTIFY_URL");
  const createPathFromEnv = resolveEnv("KPAY_PATH_CREATE_QR", "KPAY_CREATE_QR_PATH");
  const queryPathFromEnv = resolveEnv("KPAY_PATH_QUERY_ORDER", "KPAY_QUERY_ORDER_PATH");
  const createPath = createPathFromEnv || DEFAULT_CREATE_PATH;
  const queryPath = queryPathFromEnv || DEFAULT_QUERY_PATH;
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
  // Service-provider (ISV) / sub-merchant mode — required by KBZ for some merchants on
  // PWA and distributor APIs. See distributor PWA precreate doc (sub_merch_code, sub_appid, trans_type).
  const subMerchCode = resolveEnv("KPAY_SUB_MERCH_CODE", "KPAY_SUB_MERCHANT_CODE");
  const subAppid = resolveEnv("KPAY_SUB_APPID", "KPAY_SUB_APP_ID");
  const isvTransType = resolveEnv("KPAY_ISV_TRANS_TYPE", "KPAY_TRANS_TYPE") || "OnlinePaymentISV";
  return {
    baseUrl, appId, merchCode, signKey, notifyUrl, createPath, queryPath,
    createPathConfigured: Boolean(text(createPathFromEnv)),
    queryPathConfigured: Boolean(text(queryPathFromEnv)),
    apiKey, timeoutMs, autoDiscover, strictProtocol, wrapRequest,
    proxyAuthHeader, proxyAuthScheme, proxyAuthToken,
    subMerchCode, subAppid, isvTransType,
  };
}

// PWA can be provisioned with a different merchant app/keys than QR.
// These overrides are PWA-only and never affect QR routes.
function kpayPwaConfig(base: ReturnType<typeof kpayConfig>) {
  const appId = resolveEnv("KPAY_PWA_APPID", "KPAY_PWA_APP_ID") || base.appId;
  const merchCode = resolveEnv("KPAY_PWA_MERCH_CODE", "KPAY_PWA_MERCHANT_ID") || base.merchCode;
  const signKey = resolveEnv("KPAY_PWA_SIGN_KEY", "KPAY_PWA_SECRET") || base.signKey;
  const subMerchCode =
    resolveEnv("KPAY_PWA_SUB_MERCH_CODE", "KPAY_PWA_SUB_MERCHANT_CODE") || base.subMerchCode;
  const subAppid = resolveEnv("KPAY_PWA_SUB_APPID", "KPAY_PWA_SUB_APP_ID") || base.subAppid;
  const isvTransType =
    resolveEnv("KPAY_PWA_ISV_TRANS_TYPE", "KPAY_PWA_TRANS_TYPE") || base.isvTransType;
  const wrapRequestRaw = resolveEnv("KPAY_PWA_WRAP_REQUEST");
  const wrapRequest =
    wrapRequestRaw === ""
      ? base.wrapRequest
      : wrapRequestRaw === "0"
        ? false
        : wrapRequestRaw === "1"
          ? true
          : base.wrapRequest;
  return {
    ...base,
    appId,
    merchCode,
    signKey,
    subMerchCode,
    subAppid,
    isvTransType,
    wrapRequest,
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

/** Refund-only headers — adds VPS proxy auth without changing QR/PWA gateway headers. */
function buildRefundProviderHeaders(cfg: ReturnType<typeof kpayConfig>): Record<string, string> {
  const headers = buildProviderHeaders(cfg);
  const vpsSecret = resolveEnv("KBZ_VPS_API_SECRET");
  if (!vpsSecret) return headers;

  const headerName = text(resolveEnv("KBZ_VPS_API_SECRET_HEADER")) || "Authorization";
  const scheme = text(resolveEnv("KBZ_VPS_API_SECRET_SCHEME")) || "Bearer";
  if (headerName.toLowerCase() === "authorization") {
    headers.Authorization = scheme ? `${scheme} ${vpsSecret}` : vpsSecret;
  } else {
    headers[headerName] = vpsSecret;
  }
  return headers;
}

// A KBZ provider call has two distinct shapes:
//   - signCollection: the FLATTENED key/value map used to compute `sign` (stringA).
//   - requestBody:    what actually goes on the wire. `biz_content` here is an OBJECT,
//                     not a stringified JSON, per the KBZ reference clients.
type PayloadPair = {
  signCollection: AnyRecord;
  requestBody: AnyRecord;
  // Optional context the PWA flow needs to build the redirect URL signature.
  // These mirror the same `nonce_str` and `timestamp` already inside signCollection.
  nonce?: string;
  timestamp?: string;
};

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

// Public KBZ UAT base — used as a fallback host for `queryorder` because some UAT
// IP relays (e.g. 150.109.123.187) only expose `precreate` and return 404 for every
// documented `queryorder` path. The public hostname behind the docs at
// https://wap.kbzpay.com/pgw/uat/api/ is the canonical place where queryorder lives.
const PUBLIC_KBZ_UAT_BASE = "https://wap.kbzpay.com/pgw/uat/api/";
// Keep this list short to avoid blowing up polling latency if the public host is slow.
const PUBLIC_QUERY_PATHS = ["/pgw/uat/api/queryorder", "queryorder", "orderquery"];

function endpointCandidates(
  baseUrl: string,
  primaryPath: string,
  kind: "create" | "query",
  strictPrimaryOnly: boolean,
): string[] {
  const pathCandidates = kind === "create" ? CREATE_PATH_CANDIDATES : QUERY_PATH_CANDIDATES;
  const resolved: string[] = [];
  const seen = new Set<string>();

  // 1) Configured proxy/base URL with primary + (optionally) all candidate paths.
  if (text(baseUrl)) {
    const uniquePaths = new Set<string>();
    if (text(primaryPath)) uniquePaths.add(primaryPath);
    if (!strictPrimaryOnly) {
      for (const path of pathCandidates) uniquePaths.add(path);
    }
    for (const path of uniquePaths) {
      try {
        const url = new URL(path, baseUrl).toString();
        if (!seen.has(url)) {
          seen.add(url);
          resolved.push(url);
        }
      } catch {
        // ignore malformed path
      }
    }
  }

  // 2) For `query` only: also try the public KBZ UAT hostname for the canonical
  // queryorder paths. Many UAT relays only expose `precreate` and 404 on queryorder,
  // so the public host is the fallback that can actually return live status.
  if (kind === "query" && !resolved.some((u) => u.includes("wap.kbzpay.com"))) {
    for (const path of PUBLIC_QUERY_PATHS) {
      try {
        const url = new URL(path, PUBLIC_KBZ_UAT_BASE).toString();
        if (!seen.has(url)) {
          seen.add(url);
          resolved.push(url);
        }
      } catch {
        // ignore malformed path
      }
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

/** Comma-separated list, e.g. `PWAAPP` or `PWAAPP,APPH5`. Default: PWAAPP only. */
function resolvePwaTradeTypes(): string[] {
  const raw = text(Deno.env.get("KPAY_PWA_TRADE_TYPES"));
  if (raw) {
    const parts = raw.split(/[,\s]+/).map((s) => s.trim().toUpperCase()).filter(Boolean);
    return [...new Set(parts)];
  }
  return ["PWAAPP"];
}

function applyIsvBizFields(target: AnyRecord, cfg: ReturnType<typeof kpayConfig>) {
  const subMc = text(cfg.subMerchCode);
  const subAid = text(cfg.subAppid);
  if (!subMc || !subAid) return;
  target.sub_merch_code = subMc;
  target.sub_appid = subAid;
  target.trans_type = text(cfg.isvTransType) || "OnlinePaymentISV";
}

// KBZ PGW `precreate` for the PWA (Progressive Web App) payment scenario.
// Per https://wap.kbzpay.com/pgw/uat/api/#/en/docs/PWA/scenes-PWA-en :
//   - trade_type is normally `PWAAPP` (override / retry list via KPAY_PWA_TRADE_TYPES).
//   - optional `title` in biz_content
// Service-provider merchants must also send sub_merch_code, sub_appid, trans_type — see distributor PWA doc.
function buildPwaPayloadPair(
  params: {
    appId: string;
    merchCode: string;
    merchantOrderId: string;
    amount: string;
    currency: string;
    notifyUrl: string;
    title?: string;
    callbackInfo?: string;
    tradeType: string;
  },
  cfg: ReturnType<typeof kpayConfig>,
): PayloadPair {
  const nonce = crypto.randomUUID().replaceAll("-", "");
  const ts = String(Math.floor(Date.now() / 1000));
  const trade = text(params.tradeType) || "PWAAPP";

  const bizContent: AnyRecord = {
    appid: params.appId,
    merch_code: params.merchCode,
    merch_order_id: params.merchantOrderId,
    total_amount: params.amount,
    trans_currency: params.currency,
    trade_type: trade,
  };
  applyIsvBizFields(bizContent, cfg);
  if (text(params.title)) {
    bizContent.title = params.title;
  }
  if (text(params.callbackInfo)) {
    bizContent.callback_info = params.callbackInfo;
  }

  const signCollection: AnyRecord = {
    appid: params.appId,
    merch_code: params.merchCode,
    merch_order_id: params.merchantOrderId,
    method: "kbz.payment.precreate",
    nonce_str: nonce,
    timestamp: ts,
    total_amount: params.amount,
    trade_type: trade,
    trans_currency: params.currency,
    version: "1.0",
  };
  applyIsvBizFields(signCollection, cfg);
  if (text(params.title)) {
    signCollection.title = params.title;
  }
  if (text(params.notifyUrl)) {
    signCollection.notify_url = params.notifyUrl;
  }
  if (text(params.callbackInfo)) {
    signCollection.callback_info = params.callbackInfo;
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

  return { signCollection, requestBody, nonce, timestamp: ts };
}

/** For each trade_type (see KPAY_PWA_TRADE_TYPES): try with title, then without. */
function createPwaPayloadCandidates(
  params: {
    appId: string;
    merchCode: string;
    merchantOrderId: string;
    amount: string;
    currency: string;
    notifyUrl: string;
    title: string;
    callbackInfo?: string;
  },
  cfg: ReturnType<typeof kpayConfig>,
): PayloadPair[] {
  const tradeTypes = resolvePwaTradeTypes();
  const out: PayloadPair[] = [];
  const seen = new Set<string>();
  for (const tradeType of tradeTypes) {
    const withTitle = buildPwaPayloadPair({ ...params, title: params.title, tradeType }, cfg);
    const noTitle = buildPwaPayloadPair({ ...params, title: "", tradeType }, cfg);
    for (const pair of [withTitle, noTitle]) {
      const key = JSON.stringify(pair.signCollection);
      if (!seen.has(key)) {
        seen.add(key);
        out.push(pair);
      }
    }
  }
  return out;
}

function stripPwaIsvFields(pair: PayloadPair): PayloadPair {
  const signCollection = { ...(pair.signCollection || {}) } as AnyRecord;
  const requestBody = { ...(pair.requestBody || {}) } as AnyRecord;
  const biz = asRecord(requestBody.biz_content);
  const nextBiz = { ...biz } as AnyRecord;
  delete signCollection.sub_merch_code;
  delete signCollection.sub_appid;
  delete signCollection.trans_type;
  delete nextBiz.sub_merch_code;
  delete nextBiz.sub_appid;
  delete nextBiz.trans_type;
  return {
    ...pair,
    signCollection,
    requestBody: {
      ...requestBody,
      biz_content: nextBiz,
    },
  };
}

function hasPwaIsvFields(pair: PayloadPair): boolean {
  const sign = asRecord(pair.signCollection);
  const biz = asRecord(asRecord(pair.requestBody).biz_content);
  return Boolean(
    text(sign.sub_merch_code) ||
      text(sign.sub_appid) ||
      text(sign.trans_type) ||
      text(biz.sub_merch_code) ||
      text(biz.sub_appid) ||
      text(biz.trans_type)
  );
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

type KPayRefundResult =
  | {
      ok: true;
      alreadyRefunded: boolean;
      merchantOrderId: string;
      refundRequestNo: string;
      refundAmount: string;
      refundState: "success" | "processing";
      providerStatus: string;
      endpointUsed?: string;
      rawResponse?: AnyRecord;
    }
  | {
      ok: false;
      merchantOrderId: string;
      refundRequestNo: string;
      refundAmount: string;
      message: string;
      status?: number;
      endpoint?: string;
      details?: AnyRecord;
      networkError?: string;
      /** VPS/KBZ did not respond before our fetch budget (cancel may still proceed). */
      timedOut?: boolean;
    };

function refundEndpointCandidates(baseUrl: string): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  const add = (url: string) => {
    const u = text(url);
    if (!u || seen.has(u)) return;
    seen.add(u);
    out.push(u);
  };

  // Full refund URL (refund-only) — e.g. https://150.109.123.187/api/refund.php
  const refundUrl =
    text(resolveEnv("KBZ_VPS_REFUND_URL")) || text(resolveEnv("KPAY_REFUND_URL"));
  if (refundUrl) add(refundUrl);

  const configuredPath = text(resolveEnv("KPAY_PATH_REFUND", "KPAY_REFUND_PATH"));
  if (configuredPath) {
    if (/^https?:\/\//i.test(configuredPath)) {
      add(configuredPath);
    } else if (text(baseUrl)) {
      try {
        add(new URL(configuredPath, baseUrl).toString());
      } catch {
        // ignore malformed path
      }
    }
  }

  // Default: VPS refund.php on the same host as QR/PWA (does not change create/query paths).
  if (out.length === 0 && text(baseUrl)) {
    for (const p of ["/api/refund.php", "/payment/gateway/uat/refund"]) {
      try {
        add(new URL(p, baseUrl).toString());
      } catch {
        // ignore
      }
    }
  }

  return out;
}

/** KBZ PHP SDK VPS proxy — simple JSON to /api/refund.php (not signed KBZ gateway payloads). */
function shouldUseVpsRefundProxy(): boolean {
  if (!text(resolveEnv("KBZ_VPS_API_SECRET"))) return false;
  if (text(resolveEnv("KBZ_VPS_REFUND_URL")) || text(resolveEnv("KPAY_REFUND_URL"))) {
    return true;
  }
  const path = text(resolveEnv("KPAY_PATH_REFUND", "KPAY_REFUND_PATH"));
  if (path.includes("refund.php")) return true;
  return resolveEnv("KPAY_USE_VPS_REFUND") === "1";
}

function resolveVpsRefundUrl(baseUrl: string): string {
  const pathRefund = text(resolveEnv("KPAY_PATH_REFUND", "KPAY_REFUND_PATH"));
  if (/^https?:\/\//i.test(pathRefund)) return pathRefund;

  const direct =
    text(resolveEnv("KBZ_VPS_REFUND_URL")) ||
    text(resolveEnv("KPAY_REFUND_URL"));
  if (direct) return direct;
  const candidates = refundEndpointCandidates(baseUrl);
  return candidates.find((u) => u.includes("refund.php")) || candidates[0] || "";
}

/** What the edge function will call right now (no secret values). */
export function getKPayResolvedEndpointUrls() {
  const cfg = kpayConfig();
  const base = text(cfg.baseUrl);
  const join = (path: string) => {
    if (!base || !path) return "";
    if (/^https?:\/\//i.test(path)) return path;
    try {
      return new URL(path, base.endsWith("/") ? base : `${base}/`).toString();
    } catch {
      return "";
    }
  };
  const refundDirect =
    text(resolveEnv("KBZ_VPS_REFUND_URL")) || text(resolveEnv("KPAY_REFUND_URL"));
  const refundPath = text(resolveEnv("KPAY_PATH_REFUND", "KPAY_REFUND_PATH"));
  return {
    proxyBase: base,
    qrCreate: join(cfg.createPath),
    orderQuery: join(cfg.queryPath),
    refund: resolveVpsRefundUrl(base),
    refundConfiguredVia: refundDirect
      ? text(resolveEnv("KBZ_VPS_REFUND_URL"))
        ? "KBZ_VPS_REFUND_URL"
        : "KPAY_REFUND_URL"
      : refundPath
        ? "KPAY_PATH_REFUND"
        : "default_from_proxy_base",
    vpsRefundEnabled: shouldUseVpsRefundProxy(),
    vpsApiSecretSet: Boolean(text(resolveEnv("KBZ_VPS_API_SECRET"))),
  };
}

export async function getKPayResolvedUrlsRoute(c: Context) {
  return c.json({ success: true, urls: getKPayResolvedEndpointUrls() });
}

function isVpsRefundTransportTimeout(response: {
  networkError?: string;
  status: number;
}): boolean {
  return (
    response.networkError === "kpay-timeout" ||
    String(response.networkError || "").includes("abort") ||
    response.status === 504
  );
}

/** VPS refund.php → KBZ mTLS is slow; sync cancel path must stay under order PUT budget (~65s). */
function resolveVpsRefundTimeoutMs(opts?: { background?: boolean }): number {
  const fromEnv = Number(resolveEnv("KPAY_VPS_REFUND_TIMEOUT_MS"));
  if (opts?.background) {
    return Number.isFinite(fromEnv) && fromEnv >= 10_000
      ? Math.min(fromEnv, 120_000)
      : 90_000;
  }
  if (Number.isFinite(fromEnv) && fromEnv >= 10_000) {
    return Math.min(fromEnv, 48_000);
  }
  return 42_000;
}

function edgeWaitUntil(task: Promise<unknown>): void {
  const er = (globalThis as { EdgeRuntime?: { waitUntil?: (p: Promise<unknown>) => void } })
    .EdgeRuntime;
  if (er?.waitUntil) {
    er.waitUntil(task);
    return;
  }
  void task;
}

async function refundKPayOrderViaVpsProxy(args: {
  merchantOrderId: string;
  refundRequestNo: string;
  refundAmount: string;
  reason: string;
  existingTxn: AnyRecord | null;
  timeoutMsOverride?: number;
}): Promise<KPayRefundResult> {
  const { merchantOrderId, refundRequestNo, refundAmount, reason, existingTxn } = args;
  const cfg = kpayConfig();
  const vpsUrl = resolveVpsRefundUrl(cfg.baseUrl);
  const secret = resolveEnv("KBZ_VPS_API_SECRET");
  if (!vpsUrl || !secret) {
    return {
      ok: false,
      merchantOrderId,
      refundRequestNo,
      refundAmount,
      message: "VPS refund proxy is not configured (KBZ_VPS_REFUND_URL + KBZ_VPS_API_SECRET)",
    };
  }

  const vpsTimeoutMs = args.timeoutMsOverride ?? resolveVpsRefundTimeoutMs();
  let response = await postJson(
    vpsUrl,
    {
      merch_order_id: merchantOrderId,
      refund_request_no: refundRequestNo,
      refund_reason: text(reason).slice(0, 128) || "Order cancelled by admin",
    },
    vpsTimeoutMs,
    { Authorization: `Bearer ${secret}` },
  );

  if (
    !providerIndicatesRefundAccepted(response.body) &&
    isVpsRefundTransportTimeout(response)
  ) {
    console.log("[kpay] VPS refund timed out — one immediate retry");
    response = await postJson(
      vpsUrl,
      {
        merch_order_id: merchantOrderId,
        refund_request_no: refundRequestNo,
        refund_reason: text(reason).slice(0, 128) || "Order cancelled by admin",
      },
      Math.min(28_000, vpsTimeoutMs),
      { Authorization: `Bearer ${secret}` },
    );
  }

  if (!providerIndicatesRefundAccepted(response.body)) {
    const now = nowIso();
    await kv.set(`kpay_txn:${merchantOrderId}`, {
      ...(existingTxn || {}),
      merchantOrderId,
      refund: {
        status: "failed",
        refundRequestNo,
        amount: refundAmount,
        failedAt: now,
        endpointUsed: vpsUrl,
        networkError: response.networkError || "",
        details: response.body,
      },
      updatedAt: now,
    });
    const timedOut = isVpsRefundTransportTimeout(response);
    return {
      ok: false,
      merchantOrderId,
      refundRequestNo,
      refundAmount,
      timedOut,
      message: timedOut
        ? "Refund timed out waiting for VPS/KBZPay (gateway may still be processing)."
        : text(response.body.error) || "KBZPay refund request failed",
      status: timedOut ? 504 : response.status || 502,
      endpoint: vpsUrl,
      details: {
        ...response.body,
        vpsTimeoutMs,
        networkError: response.networkError,
      },
      networkError: response.networkError,
    };
  }

  const kbzPayload = asRecord(response.body.kbz);
  const providerStatus = providerStatusFrom(kbzPayload) || providerStatusFrom(response.body);
  const refundGatewayStatus =
    refundStatusFrom(kbzPayload) || refundStatusFrom(response.body) || "REFUND_SUCCESS";
  const refundState: "success" | "processing" =
    refundGatewayStatus === "REFUND_SUCCESS" || response.body.ok === true
      ? "success"
      : "processing";
  const now = nowIso();
  await kv.set(`kpay_txn:${merchantOrderId}`, {
    ...(existingTxn || {}),
    merchantOrderId,
    status: refundState === "success" ? "refunded" : "pending",
    providerStatus: providerStatus || text(existingTxn?.providerStatus),
    refund: {
      status: refundState,
      refundRequestNo,
      amount: refundAmount,
      refundedAt: refundState === "success" ? now : "",
      acceptedAt: now,
      providerStatus,
      refundStatus: refundGatewayStatus,
      endpointUsed: vpsUrl,
      rawResponse: response.body,
    },
    updatedAt: now,
  });

  return {
    ok: true,
    alreadyRefunded: false,
    merchantOrderId,
    refundRequestNo,
    refundAmount,
    refundState,
    providerStatus,
    endpointUsed: vpsUrl,
    rawResponse: response.body,
  };
}

/**
 * KBZ PGW Refund Order — https://wap.kbzpay.com/pgw/uat/api/#/en/docs/QRPay/api-refund-en
 * - method: kbz.payment.refund
 * - Common params: timestamp, method, nonce_str, sign_type (SHA256), sign (SHA256 stringA&key=appkey)
 * - biz_content: JSON object on the wire; stringA = sorted union of common + biz fields (no nested biz_content key)
 * - Certificate/mTLS may be required between merchant proxy and KBZ (handled on proxy, not in this function)
 */
function refundPayloadCandidates(
  params: {
    appId: string;
    merchCode: string;
    merchantOrderId: string;
    refundAmount: string;
    refundRequestNo: string;
    refundReason: string;
    subType: string;
    subIdentifierType: string;
    subIdentifier: string;
    transCurrency: string;
  },
  cfg: ReturnType<typeof kpayConfig>,
): PayloadPair[] {
  const nonce = crypto.randomUUID().replaceAll("-", "").slice(0, 32);
  const ts = String(Math.floor(Date.now() / 1000));
  const reason = String(params.refundReason || "").trim().slice(0, 128);
  const methodCandidates = ["kbz.payment.refund"];
  const pairs: PayloadPair[] = [];
  for (const method of methodCandidates) {
    const bizContent: AnyRecord = {
      appid: params.appId,
      merch_code: params.merchCode,
      merch_order_id: params.merchantOrderId,
      sub_type: params.subType,
      sub_identifier_type: params.subIdentifierType,
      sub_identifier: params.subIdentifier,
      refund_amount: params.refundAmount,
      refund_request_no: params.refundRequestNo,
      refund_reason: reason,
      trans_currency: params.transCurrency,
    };
    applyIsvBizFields(bizContent, cfg);

    const signCollection: AnyRecord = {
      appid: params.appId,
      merch_code: params.merchCode,
      merch_order_id: params.merchantOrderId,
      method,
      sub_type: params.subType,
      sub_identifier_type: params.subIdentifierType,
      sub_identifier: params.subIdentifier,
      nonce_str: nonce,
      timestamp: ts,
      refund_amount: params.refundAmount,
      refund_request_no: params.refundRequestNo,
      refund_reason: reason,
      trans_currency: params.transCurrency,
      version: "1.0",
    };
    applyIsvBizFields(signCollection, cfg);

    const requestBody: AnyRecord = {
      timestamp: ts,
      method,
      nonce_str: nonce,
      sign_type: "SHA256",
      version: "1.0",
      biz_content: bizContent,
    };
    pairs.push({ signCollection, requestBody });
  }
  return pairs;
}

function refundStatusFrom(payload: AnyRecord): string {
  const data = providerData(payload);
  const wrapped = asRecord(payload.Response);
  const status = text(
    data.refund_status ||
      data.refundStatus ||
      wrapped.refund_status ||
      wrapped.refundStatus ||
      payload.refund_status ||
      payload.refundStatus
  ).toUpperCase();
  return status;
}

async function patchOrderKvAtKey(
  storageKey: string,
  order: AnyRecord,
  result: KPayRefundResult,
): Promise<boolean> {
  if (!result.ok) return false;
  const now = nowIso();
  const refundState = result.refundState;
  const nextOrder: AnyRecord = {
    ...order,
    paymentStatus: refundState === "success" ? "refunded" : "pending_refund",
    updatedAt: now,
    kpay: {
      ...(order.kpay as AnyRecord || {}),
      merchantOrderId: result.merchantOrderId,
      status: refundState === "success" ? "refunded" : "pending_refund",
      refund: {
        status: result.alreadyRefunded
          ? "already_refunded"
          : refundState === "success"
            ? "success"
            : "processing",
        refundRequestNo: result.refundRequestNo,
        amount: result.refundAmount,
        providerStatus: result.providerStatus,
        endpointUsed: result.endpointUsed || "",
        refundedAt: refundState === "success" ? now : "",
        acceptedAt: now,
      },
    },
  };
  await kv.set(storageKey, nextOrder);
  queueOrderReadModelSync(String(nextOrder.id || storageKey.replace(/^order:/, "") || result.merchantOrderId), nextOrder);
  return true;
}

async function patchOrderKvAfterRefund(
  merchantOrderId: string,
  result: KPayRefundResult,
): Promise<boolean> {
  if (!result.ok) return false;
  const found = await findOrderByOrderNumber(merchantOrderId);
  if (!found) {
    console.error(`[kpay] patchOrderKvAfterRefund: order not found for ${merchantOrderId}`);
    return false;
  }
  return patchOrderKvAtKey(found.key, found.order, result);
}

/**
 * If kpay_txn shows refund success but the order row is still "processing", copy txn → order.
 * Also retries VPS refund once after a transport timeout (KBZ may have succeeded anyway).
 */
/** Copy kpay_txn refund success → order row (fast KV-only). Never blocks on VPS. */
export async function syncOrderRefundFromTxn(
  merchantOrderId: string,
  opts?: { allowVpsRetry?: boolean },
): Promise<boolean> {
  const found = await findOrderByOrderNumber(text(merchantOrderId));
  if (!found) return false;
  return syncOrderRefundForResolved(
    { storageKey: found.key, record: found.order },
    merchantOrderId,
    opts,
  );
}

/** Same as syncOrderRefundFromTxn but uses an already-resolved order row (no prefix scan). */
export async function syncOrderRefundForResolved(
  resolved: { storageKey: string; record: AnyRecord },
  merchantOrderId: string,
  opts?: { allowVpsRetry?: boolean },
): Promise<boolean> {
  const mid = text(merchantOrderId);
  if (!mid) return false;

  const txn = (await kv.get(`kpay_txn:${mid}`)) as AnyRecord | null;
  const txnRefund = asRecord(txn?.refund);
  const txnStatus = text(txnRefund.status).toLowerCase();

  const orderKpay = asRecord(resolved.record.kpay);
  const orderRefund = asRecord(orderKpay.refund);
  const orderRefundStatus = text(orderRefund.status).toLowerCase();
  const payStatus = text(resolved.record.paymentStatus).toLowerCase();

  if (txnStatus === "success" || txnStatus === "already_refunded") {
    if (
      orderRefundStatus === "success" ||
      orderRefundStatus === "already_refunded" ||
      payStatus === "refunded"
    ) {
      return false;
    }
    return patchOrderKvAtKey(resolved.storageKey, resolved.record, {
      ok: true,
      alreadyRefunded: txnStatus === "already_refunded",
      merchantOrderId: mid,
      refundRequestNo: text(txnRefund.refundRequestNo) || `RFND-${mid}`,
      refundAmount: text(txnRefund.amount) || String(resolved.record.total ?? ""),
      refundState: "success",
      providerStatus: text(txnRefund.providerStatus) || "REFUNDED",
      endpointUsed: text(txnRefund.endpointUsed),
    });
  }

  if (opts?.allowVpsRetry !== true) return false;

  const networkErr = text(txnRefund.networkError).toLowerCase();
  const timedOut =
    networkErr === "kpay-timeout" ||
    networkErr.includes("timeout") ||
    networkErr.includes("abort");
  if (txnStatus === "failed" && timedOut && orderRefundStatus === "processing") {
    enqueueKPayRefundAndPatchOrder({
      merchantOrderId: mid,
      amount: resolved.record.total,
      reason: "Order cancelled by admin (reconcile after timeout)",
      refundRequestNo: text(txnRefund.refundRequestNo) || `RFND-${mid}-RETRY`,
    });
  }

  return false;
}

/** Fire-and-forget refund after cancel — order PUT must not wait on VPS/KBZ. */
export function enqueueKPayRefundAndPatchOrder(params: {
  merchantOrderId: string;
  amount: unknown;
  reason?: string;
  refundRequestNo?: string;
}): void {
  const merchantOrderId = text(params.merchantOrderId);
  if (!merchantOrderId) return;

  const run = async () => {
    const refundRequestNo =
      text(params.refundRequestNo) || `RFND-${merchantOrderId}-${Date.now()}`;
    const result = await refundKPayOrder({
      merchantOrderId,
      amount: params.amount,
      reason: text(params.reason) || "Order cancelled by admin",
      refundRequestNo,
      timeoutMsOverride: resolveVpsRefundTimeoutMs({ background: true }),
    });
    if (!result.ok) {
      console.error("[kpay] Background refund failed:", result.message);
      await syncOrderRefundFromTxn(merchantOrderId).catch(() => {});
      return;
    }
    const patched = await patchOrderKvAfterRefund(merchantOrderId, result);
    if (!patched) {
      console.error(`[kpay] Background refund OK but order patch failed for ${merchantOrderId}`);
    } else {
      console.log(`[kpay] Background refund OK for ${merchantOrderId}`);
    }
  };

  edgeWaitUntil(run());
}

/** @deprecated Use enqueueKPayRefundAndPatchOrder */
export function scheduleVpsRefundRetryAndPatchOrder(params: {
  merchantOrderId: string;
  amount: unknown;
  reason?: string;
  refundRequestNo?: string;
}): void {
  enqueueKPayRefundAndPatchOrder(params);
}

export async function refundKPayOrder(params: {
  merchantOrderId: string;
  amount: unknown;
  reason?: string;
  refundRequestNo?: string;
  /** VPS/KBZ calls can exceed the order PUT budget; background jobs use a longer limit. */
  timeoutMsOverride?: number;
}): Promise<KPayRefundResult> {
  const merchantOrderId = text(params.merchantOrderId);
  if (!merchantOrderId) {
    return {
      ok: false,
      merchantOrderId: "",
      refundRequestNo: "",
      refundAmount: "",
      message: "merchantOrderId is required for refund",
    };
  }
  let refundAmount = "";
  try {
    refundAmount = normalizeAmountMMK(params.amount);
  } catch {
    return {
      ok: false,
      merchantOrderId,
      refundRequestNo: "",
      refundAmount: "",
      message: "Invalid refund amount",
    };
  }

  const refundRequestNo = text(params.refundRequestNo) || `RFND-${merchantOrderId}-${Date.now()}`;
  const cfg = kpayConfig();
  const existingTxn = (await kv.get(`kpay_txn:${merchantOrderId}`)) as AnyRecord | null;
  const previousRefund = asRecord(existingTxn?.refund);
  if (text(previousRefund.status).toLowerCase() === "success") {
    return {
      ok: true,
      alreadyRefunded: true,
      merchantOrderId,
      refundRequestNo: text(previousRefund.refundRequestNo) || refundRequestNo,
      refundAmount: text(previousRefund.amount) || refundAmount,
      refundState: "success",
      providerStatus: text(previousRefund.providerStatus) || "REFUNDED",
      endpointUsed: text(previousRefund.endpointUsed),
      rawResponse: asRecord(previousRefund.rawResponse),
    };
  }

  const refundReason = text(params.reason) || "Order cancelled by admin";

  // VPS PHP SDK proxy (/api/refund.php) — separate from QR/PWA signed gateway calls.
  if (shouldUseVpsRefundProxy()) {
    return refundKPayOrderViaVpsProxy({
      merchantOrderId,
      refundRequestNo,
      refundAmount,
      reason: refundReason,
      existingTxn,
      timeoutMsOverride: params.timeoutMsOverride,
    });
  }

  if (!cfg.baseUrl || !cfg.appId || !cfg.merchCode || !cfg.signKey) {
    return {
      ok: false,
      merchantOrderId,
      refundRequestNo,
      refundAmount,
      message: "KBZPay gateway is not configured for refund",
    };
  }

  const subType = text(resolveEnv("KPAY_REFUND_SUB_TYPE")) || "5000";
  const subIdentifierType = text(resolveEnv("KPAY_REFUND_SUB_IDENTIFIER_TYPE")) || "04";
  const subIdentifier = text(resolveEnv("KPAY_REFUND_SUB_IDENTIFIER")) || "20006";
  const transCurrency = text(resolveEnv("KPAY_REFUND_TRANS_CURRENCY")) || "MMK";

  const endpoints = refundEndpointCandidates(cfg.baseUrl);
  const refundWrapRaw = resolveEnv("KPAY_REFUND_WRAP_REQUEST");
  const wrapRefund =
    refundWrapRaw === ""
      ? cfg.wrapRequest
      : refundWrapRaw !== "0";
  const payloads = refundPayloadCandidates(
    {
      appId: cfg.appId,
      merchCode: cfg.merchCode,
      merchantOrderId,
      refundAmount,
      refundRequestNo,
      refundReason,
      subType,
      subIdentifierType,
      subIdentifier,
      transCurrency,
    },
    cfg,
  );

  const provider = await tryProviderVariants({
    endpoints,
    payloads,
    signKey: cfg.signKey,
    timeoutMs: cfg.timeoutMs,
    wrapRequest: wrapRefund,
    extraHeaders: buildRefundProviderHeaders(cfg),
    acceptBody: providerIndicatesRefundAccepted,
  });

  if (!provider.success) {
    const last = provider.attempts[provider.attempts.length - 1];
    const now = nowIso();
    await kv.set(`kpay_txn:${merchantOrderId}`, {
      ...(existingTxn || {}),
      merchantOrderId,
      refund: {
        status: "failed",
        refundRequestNo,
        amount: refundAmount,
        failedAt: now,
        endpointUsed: last?.endpoint || "",
        networkError: last?.networkError || "",
        details: asRecord(last?.details),
      },
      updatedAt: now,
    });
    return {
      ok: false,
      merchantOrderId,
      refundRequestNo,
      refundAmount,
      message: "KBZPay refund request failed",
      status: last?.status || 502,
      endpoint: last?.endpoint || "",
      details: asRecord(last?.details),
      networkError: last?.networkError,
    };
  }

  const providerStatus = providerStatusFrom(provider.body);
  const refundGatewayStatus = refundStatusFrom(provider.body);
  const refundState: "success" | "processing" =
    refundGatewayStatus === "REFUND_SUCCESS" ? "success" : "processing";
  const now = nowIso();
  await kv.set(`kpay_txn:${merchantOrderId}`, {
    ...(existingTxn || {}),
    merchantOrderId,
    status: refundState === "success" ? "refunded" : "pending",
    providerStatus: providerStatus || text(existingTxn?.providerStatus),
    refund: {
      status: refundState,
      refundRequestNo,
      amount: refundAmount,
      refundedAt: refundState === "success" ? now : "",
      acceptedAt: now,
      providerStatus,
      refundStatus: refundGatewayStatus,
      endpointUsed: provider.endpoint,
      rawResponse: provider.body,
    },
    updatedAt: now,
  });

  return {
    ok: true,
    alreadyRefunded: false,
    merchantOrderId,
    refundRequestNo,
    refundAmount,
    refundState,
    providerStatus,
    endpointUsed: provider.endpoint,
    rawResponse: provider.body,
  };
}

async function tryProviderVariants(args: {
  endpoints: string[];
  payloads: PayloadPair[];
  signKey: string;
  timeoutMs: number;
  wrapRequest: boolean;
  extraHeaders: Record<string, string>;
  /** Overrides default `providerIndicatesSuccess` (e.g. KBZ refund acceptance patterns). */
  acceptBody?: (body: AnyRecord) => boolean;
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
  const acceptBody = args.acceptBody ?? providerIndicatesSuccess;
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
      if (acceptBody(res.body)) {
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
        error: "KBZPay gateway is not configured",
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

    // In strict mode, keep create endpoint fixed only when explicitly configured.
    // Otherwise, allow fallback candidates to support provider variants.
    const strictPrimaryOnly = cfg.strictProtocol ? cfg.createPathConfigured : !cfg.autoDiscover;
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
    return c.json({ error: "Failed to create KBZPay QR", message: String(error?.message || error) }, 500);
  }
}

// PWA-flow base hosts where the customer's mobile browser is redirected.
// Per https://wap.kbzpay.com/pgw/uat/api/#/en/docs/PWA/scenes-PWA-en
//   - Production: https://wap.kbzpay.com/pgw/pwa/#/
//   - UAT:        https://static.kbzpay.com/pgw/uat/pwa/#/
const PWA_REDIRECT_BASE_PROD = "https://wap.kbzpay.com/pgw/pwa/#/";
const PWA_REDIRECT_BASE_UAT = "https://static.kbzpay.com/pgw/uat/pwa/#/";

function isUatEnvironment(cfg: ReturnType<typeof kpayConfig>): boolean {
  const explicit = text(Deno.env.get("KPAY_ENV")).toLowerCase();
  if (explicit === "prod" || explicit === "production") return false;
  if (explicit === "uat" || explicit === "test" || explicit === "sandbox") return true;
  // Heuristic fallback: configured base URL contains "uat".
  return /uat/i.test(cfg.baseUrl || "");
}

// Build the orderinfo signature for the PWA redirect URL.
// Per the docs, only these 5 fields are signed:
//   appid, merch_code, nonce_str, prepay_id, timestamp
// Fields are sorted lexicographically, joined as `k=v&k=v...`, then `&key={appkey}` is
// appended and SHA256-uppercased to produce the final `sign`.
async function buildPwaOrderInfoSignature(args: {
  appId: string;
  merchCode: string;
  prepayId: string;
  timestamp: string;
  nonce: string;
  signKey: string;
}): Promise<string> {
  const collection: AnyRecord = {
    appid: args.appId,
    merch_code: args.merchCode,
    nonce_str: args.nonce,
    prepay_id: args.prepayId,
    timestamp: args.timestamp,
  };
  const stringA = buildSignSource(collection);
  return await sha256Upper(`${stringA}&key=${args.signKey}`);
}

// POST /kpay/pwa/start
// Body: { merchantOrderId: string, amount: number, title?: string, callbackInfo?: string }
// Returns: { success, merchantOrderId, prepayId, redirectUrl, ... }
//
// The redirectUrl is an absolute KBZ URL that the customer's browser must visit on a
// mobile device. KBZ's PWA page validates the referer URL and signature, then opens
// the KBZPay app. After payment, KBZ redirects the user to our registered `return_url`
// with `prepay_id` and `merch_order_id` query params (handled by /kpay/pwa/return below).
export async function startKPayPwa(c: Context) {
  try {
    const baseCfg = kpayConfig();
    let cfg = kpayPwaConfig(baseCfg);
    if (!cfg.baseUrl || !cfg.appId || !cfg.merchCode || !cfg.signKey) {
      return c.json({
        error: "KBZPay gateway is not configured",
        missing: [
          !cfg.baseUrl ? "KPAY_PROXY_BASE_URL" : null,
          !cfg.appId ? "KPAY_PWA_APPID (or KPAY_APPID)" : null,
          !cfg.merchCode ? "KPAY_PWA_MERCH_CODE (or KPAY_MERCH_CODE)" : null,
          !cfg.signKey ? "KPAY_PWA_SIGN_KEY (or KPAY_SIGN_KEY)" : null,
        ].filter(Boolean),
      }, 500);
    }

    const body = (await c.req.json()) as AnyRecord;
    const merchantOrderId = text(body.merchantOrderId);
    if (!merchantOrderId) return c.json({ error: "merchantOrderId is required" }, 400);

    const amount = normalizeAmountMMK(body.amount);
    const currency = text(body.currency || "MMK") || "MMK";
    const notifyUrl = text(body.notifyUrl) || cfg.notifyUrl;
    const title = text(body.title) || "Order";
    const originPathEarly = text(body.originPath);
    const summaryPathEarly = text(body.summaryPath);
    const storefrontOriginEarly = text(body.storefrontOrigin);
    let callbackInfo = text(body.callbackInfo);
    if (!callbackInfo && storefrontOriginEarly) {
      const qs = new URLSearchParams();
      qs.set("so", storefrontOriginEarly.replace(/\/$/, ""));
      const sp = summaryPathEarly || "/summary";
      qs.set("sp", sp.startsWith("/") ? sp : `/${sp}`);
      callbackInfo = qs.toString();
    }

    if (!text(notifyUrl)) {
      return c.json({
        error: "kpay-notify-url-required",
        message:
          "KBZ precreate requires notify_url. Set the KPAY_NOTIFY_URL secret for the Edge function or pass notifyUrl in the request body.",
      }, 400);
    }

    const runPwaPrecreate = async (activeCfg: ReturnType<typeof kpayConfig>) => {
      const endpoints: string[] = [];
      const seenEndpoints = new Set<string>();
      const pathCandidates = new Set<string>();
      if (text(activeCfg.createPath)) pathCandidates.add(activeCfg.createPath);
      for (const p of PWA_CREATE_PATH_CANDIDATES) pathCandidates.add(p);
      for (const p of pathCandidates) {
        try {
          const url = new URL(p, activeCfg.baseUrl).toString();
          if (!seenEndpoints.has(url)) {
            seenEndpoints.add(url);
            endpoints.push(url);
          }
        } catch {
          // ignore malformed path
        }
      }
      const payloads = createPwaPayloadCandidates(
        {
          appId: activeCfg.appId,
          merchCode: activeCfg.merchCode,
          merchantOrderId,
          amount,
          currency,
          notifyUrl,
          title,
          callbackInfo: callbackInfo || undefined,
        },
        activeCfg,
      );
      const providerHeaders = buildProviderHeaders(activeCfg);
      const allAttempts: Array<{
        endpoint: string;
        status: number;
        networkError?: string;
        details?: AnyRecord;
        signSource?: string;
        sign?: string;
        signedPayload?: AnyRecord;
      }> = [];
      const triedPlanKeys = new Set<string>();
      let provider:
        | {
            success: true;
            endpoint: string;
            body: AnyRecord;
            signSource?: string;
            sign?: string;
            signedPayload?: AnyRecord;
          }
        | {
            success: false;
            attempts: Array<{
              endpoint: string;
              status: number;
              networkError?: string;
              details?: AnyRecord;
              signSource?: string;
              sign?: string;
              signedPayload?: AnyRecord;
            }>;
          } = { success: false, attempts: [] };
      let winningWrapRequest = activeCfg.wrapRequest;

      const runPlan = async (wrapRequest: boolean, planPayloads: PayloadPair[]) => {
        const key = `${wrapRequest ? "wrap1" : "wrap0"}::${JSON.stringify(
          planPayloads.map((p) => p.signCollection),
        )}`;
        if (triedPlanKeys.has(key)) return false;
        triedPlanKeys.add(key);
        const res = await tryProviderVariants({
          endpoints,
          payloads: planPayloads,
          signKey: activeCfg.signKey,
          timeoutMs: activeCfg.timeoutMs,
          wrapRequest,
          extraHeaders: providerHeaders,
        });
        if (res.success) {
          provider = res;
          winningWrapRequest = wrapRequest;
          return true;
        }
        allAttempts.push(...res.attempts);
        provider = { success: false, attempts: [...allAttempts] };
        return false;
      };

      // 1) current configured mode
      let ok = await runPlan(activeCfg.wrapRequest, payloads);
      // 2) alternate wrap mode
      if (!ok) ok = await runPlan(!activeCfg.wrapRequest, payloads);
      // 3) ISV fallback: try without sub-merch fields (PWA-only fallback; QR untouched)
      const hasIsv = payloads.some(hasPwaIsvFields);
      if (!ok && hasIsv) {
        const noIsvPayloads = payloads.map(stripPwaIsvFields);
        ok = await runPlan(activeCfg.wrapRequest, noIsvPayloads);
        if (!ok) ok = await runPlan(!activeCfg.wrapRequest, noIsvPayloads);
      }
      return { provider, winningWrapRequest, providerHeaders };
    };

    let credentialSource: "pwa" | "base" = "pwa";
    let { provider, winningWrapRequest, providerHeaders } = await runPwaPrecreate(cfg);
    const pwaCredsDifferFromBase =
      cfg.appId !== baseCfg.appId ||
      cfg.merchCode !== baseCfg.merchCode ||
      cfg.signKey !== baseCfg.signKey ||
      cfg.subMerchCode !== baseCfg.subMerchCode ||
      cfg.subAppid !== baseCfg.subAppid;
    if (!provider.success && pwaCredsDifferFromBase) {
      // PWA-only rescue: if dedicated PWA credentials were wrong/stale, retry with base KPay creds.
      const retried = await runPwaPrecreate(baseCfg);
      if (retried.provider.success) {
        provider = retried.provider;
        winningWrapRequest = retried.winningWrapRequest;
        providerHeaders = retried.providerHeaders;
        cfg = baseCfg;
        credentialSource = "base";
      }
    }
    if (!provider.success) {
      const attempts = provider.attempts || allAttempts;
      const last = attempts[attempts.length - 1];
      const kbz = kbzBizErrorFromBody(asRecord(last?.details || {}));
      // If the last body was empty, scan earlier attempts for a KBZ message.
      let mergedKbz = kbz;
      if (!mergedKbz.code && !mergedKbz.msg) {
        for (let i = attempts.length - 1; i >= 0; i--) {
          const row = kbzBizErrorFromBody(asRecord(attempts[i]?.details || {}));
          if (row.code || row.msg) {
            mergedKbz = row;
            break;
          }
        }
      }
      return c.json(
        {
          error: "kpay-pwa-start-failed",
          status: last?.status || 502,
          kbz: mergedKbz,
          details: last?.details || {},
          networkError: last?.networkError || undefined,
          endpoint: last?.endpoint || "",
          wrapRequest: cfg.wrapRequest,
          signSource: last?.signSource || "",
          sign: last?.sign || "",
          signedPayload: last?.signedPayload || {},
          attemptedEndpoints: Array.from(new Set(attempts.map((a) => a.endpoint))),
          credentialSource,
          appIdUsed: cfg.appId,
          merchCodeUsed: cfg.merchCode,
          authHeadersUsed: Object.keys(providerHeaders),
        },
        502,
      );
    }

    // Extract prepay_id from the precreate response. KBZ wraps it under "Response".
    const respWrapped = asRecord((provider.body as AnyRecord).Response);
    const respFlat = Object.keys(respWrapped).length > 0 ? respWrapped : (provider.body as AnyRecord);
    const prepayId = text(respFlat.prepay_id) || text(respFlat.prepayId) || text(respFlat.prepay);
    if (!prepayId) {
      return c.json({
        error: "kpay-pwa-no-prepay-id",
        message: "KBZ precreate succeeded but did not return prepay_id.",
        rawResponse: provider.body,
        signSource: provider.signSource || "",
        sign: provider.sign || "",
      }, 502);
    }

    // Use the *winning* request's nonce/timestamp for the PWA redirect signature
    // (must match the precreate that returned prepay_id — not necessarily payloads[0]).
    const signedRoot = asRecord(provider.signedPayload || {});
    const winReq = asRecord(signedRoot.Request || signedRoot);
    const ts = text(winReq.timestamp) || text(payloads[0]?.timestamp) ||
      text(payloads[0]?.signCollection?.timestamp as string);
    const nonce = text(winReq.nonce_str) || text(payloads[0]?.nonce) ||
      text(payloads[0]?.signCollection?.nonce_str as string);
    const bizUsed = asRecord(winReq.biz_content);
    const tradeTypeUsed = text(bizUsed.trade_type) || resolvePwaTradeTypes()[0] || "PWAAPP";

    const orderInfoSign = await buildPwaOrderInfoSignature({
      appId: cfg.appId,
      merchCode: cfg.merchCode,
      prepayId,
      timestamp: ts,
      nonce,
      signKey: cfg.signKey,
    });

    const isUat = isUatEnvironment(cfg);
    const base = isUat ? PWA_REDIRECT_BASE_UAT : PWA_REDIRECT_BASE_PROD;
    const params = new URLSearchParams({
      appid: cfg.appId,
      merch_code: cfg.merchCode,
      nonce_str: nonce,
      prepay_id: prepayId,
      timestamp: ts,
      sign: orderInfoSign,
    });
    // KBZ uses hash-routed query params; the docs example puts ?... after the # so the
    // params live in the hash fragment, not the search string.
    const redirectUrl = `${base}?${params.toString()}`;

    const providerStatus = providerStatusFrom(provider.body);
    const ts2 = nowIso();
    await kv.set(`kpay_txn:${merchantOrderId}`, {
      merchantOrderId,
      amount,
      currency,
      title,
      method: "pwa",
      tradeType: tradeTypeUsed,
      prepayId,
      status: "pending" as PaymentStatus,
      providerStatus,
      redirectUrl,
      createdAt: ts2,
      updatedAt: ts2,
      rawCreateResponse: provider.body,
      endpointUsed: provider.endpoint,
      wrapRequest: winningWrapRequest,
    });

    const originPath = originPathEarly;
    const summaryPath = summaryPathEarly;
    const storefrontOrigin = storefrontOriginEarly;
    const draftOrder =
      body.draftOrder && typeof body.draftOrder === "object"
        ? (body.draftOrder as Record<string, unknown>)
        : undefined;
    if (draftOrder) {
      await savePwaCheckoutDraft({
        merchantOrderId,
        prepayId,
        originPath: originPath || undefined,
        summaryPath: summaryPath || undefined,
        storefrontOrigin: storefrontOrigin || undefined,
        draftOrder,
        savedAt: ts2,
      });
    }

    return c.json({
      success: true,
      merchantOrderId,
      prepayId,
      redirectUrl,
      pwaBase: base,
      isUat,
      tradeTypeUsed,
      endpointUsed: provider.endpoint,
      wrapRequest: winningWrapRequest,
      debug: {
        wrapRequest: winningWrapRequest,
        tradeTypeUsed,
        signSource: provider.signSource || "",
        sign: provider.sign || "",
        signedPayload: provider.signedPayload || {},
        orderInfoSignSource: buildSignSource({
          appid: cfg.appId,
          merch_code: cfg.merchCode,
          nonce_str: nonce,
          prepay_id: prepayId,
          timestamp: ts,
        }),
        orderInfoSign,
        providerTopLevelKeys: topLevelKeys(provider.body),
        providerNestedKeys: nestedKeys(provider.body),
      },
    });
  } catch (error: any) {
    console.error("startKPayPwa error", error);
    return c.json({ error: "Failed to start KBZPay PWA", message: String(error?.message || error) }, 500);
  }
}

// GET /kpay/pwa/return?prepay_id=...&merch_order_id=...
// Customer-facing return endpoint. KBZ redirects the user's browser here AFTER the
// PWA payment is completed (success or cancelled). We optionally call queryorder to
// confirm the trade_status, then redirect the user to the SPA route that shows the
// final result UI.
export async function handleKPayPwaReturn(c: Context) {
  const url = new URL(c.req.url);
  const prepayId = text(url.searchParams.get("prepay_id"));
  const merchantOrderId = text(url.searchParams.get("merch_order_id")) || text(url.searchParams.get("merchOrderId"));
  const callbackInfo = text(url.searchParams.get("callback_info"));

  const spaReturnBase = text(Deno.env.get("KPAY_PWA_FRONTEND_RETURN_URL"));
  if (!spaReturnBase) {
    return c.json({
      error: "KPAY_PWA_FRONTEND_RETURN_URL is not configured",
      received: { prepayId, merchantOrderId, callbackInfo },
    }, 500);
  }

  const draftRaw = merchantOrderId ? await getPwaCheckoutDraft(merchantOrderId) : null;
  const draft = enrichPwaDraftWithCallback(draftRaw, callbackInfo);

  if (merchantOrderId) {
    await syncKPayTxnStatusFromProvider(merchantOrderId);
    const fin = await finalizePwaCheckoutOrder(merchantOrderId);
    if (fin.ok && fin.created) {
      console.log(`✅ PWA order finalized on return for ${merchantOrderId}`);
    } else if (
      !fin.ok &&
      fin.error !== "payment_not_confirmed" &&
      fin.error !== "no_checkout_draft"
    ) {
      console.warn(`PWA finalize on return: ${merchantOrderId}`, fin.error, fin.message);
    }
  }

  let targetUrl = buildPwaSummaryAbsoluteUrl(
    draft,
    spaReturnBase,
    prepayId,
    merchantOrderId,
  );
  if (callbackInfo) {
    const u = new URL(targetUrl);
    u.searchParams.set("callback_info", callbackInfo);
    targetUrl = u.toString();
  }

  return c.redirect(targetUrl, 302);
}

async function maybeFinalizePwaOrderAfterPaid(merchantOrderId: string): Promise<void> {
  const fin = await finalizePwaCheckoutOrder(merchantOrderId);
  if (fin.ok && fin.created) {
    console.log(`✅ PWA order finalized for ${merchantOrderId}`);
  } else if (
    !fin.ok &&
    fin.error !== "no_checkout_draft" &&
    fin.error !== "payment_not_confirmed"
  ) {
    console.warn(`PWA finalize: ${merchantOrderId}`, fin.error, fin.message);
  }
}

/** Query KBZ and merge into kpay_txn (best-effort). Used before PWA order finalize. */
export async function syncKPayTxnStatusFromProvider(
  merchantOrderId: string,
): Promise<AnyRecord | null> {
  const id = text(merchantOrderId);
  if (!id) return null;

  const cfg = kpayConfig();
  const existing = (await kv.get(`kpay_txn:${id}`)) as AnyRecord | null;
  if (!cfg.baseUrl || !cfg.appId || !cfg.merchCode || !cfg.signKey) {
    return existing;
  }

  const endpoints = endpointCandidates(cfg.baseUrl, cfg.queryPath, "query", false);
  const payloads = queryPayloadCandidates({
    appId: cfg.appId,
    merchCode: cfg.merchCode,
    merchantOrderId: id,
  });
  const provider = await tryProviderVariants({
    endpoints,
    payloads,
    signKey: cfg.signKey,
    timeoutMs: cfg.timeoutMs,
    wrapRequest: cfg.wrapRequest,
    extraHeaders: buildProviderHeaders(cfg),
  });

  if (!provider.success) return existing;

  const providerStatus = providerStatusFrom(provider.body);
  const nextStatus = mapProviderStatus(providerStatus);
  const safeStatus = canDowngrade(existing, nextStatus) ? nextStatus : "paid";
  const qr = extractQrPayload(provider.body);
  const paidAt = safeStatus === "paid" ? nowIso() : text(existing?.paidAt);
  const updatedAt = nowIso();

  const merged: AnyRecord = {
    ...(existing || {}),
    merchantOrderId: id,
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
  };

  await kv.set(`kpay_txn:${id}`, merged);

  if (safeStatus === "paid" || safeStatus === "failed") {
    await upsertOrderPaymentStatus(id, safeStatus, providerStatus, paidAt || undefined);
  }

  return merged;
}

export async function getPwaCheckoutDraftRoute(c: Context) {
  const merchantOrderId = text(c.req.param("merchantOrderId"));
  if (!merchantOrderId) return c.json({ error: "merchantOrderId is required" }, 400);
  const draft = await getPwaCheckoutDraft(merchantOrderId);
  if (!draft) return c.json({ error: "draft_not_found" }, 404);
  return c.json({ success: true, draft });
}

export async function postPwaFinalizeRoute(c: Context) {
  const merchantOrderId = text(c.req.param("merchantOrderId"));
  if (!merchantOrderId) return c.json({ error: "merchantOrderId is required" }, 400);

  await syncKPayTxnStatusFromProvider(merchantOrderId);
  let result = await finalizePwaCheckoutOrder(merchantOrderId);
  for (let attempt = 0; attempt < 3 && !result.ok && result.error === "payment_not_confirmed"; attempt++) {
    await new Promise((resolve) => setTimeout(resolve, 1500));
    await syncKPayTxnStatusFromProvider(merchantOrderId);
    result = await finalizePwaCheckoutOrder(merchantOrderId);
  }

  if (!result.ok) {
    const status = result.error === "payment_not_confirmed" ? 409 : 400;
    return c.json({ success: false, ...result }, status);
  }
  return c.json({ success: true, ...result });
}

export { getOrphanedPwaDraftsRoute, getPwaDraftStatusRoute };

export async function postPwaReconcileRoute(c: Context) {
  return runPwaReconcileRoute(c, syncKPayTxnStatusFromProvider);
}

export async function getKPayStatus(c: Context) {
  try {
    const cfg = kpayConfig();
    const merchantOrderId = text(c.req.param("merchantOrderId"));
    if (!merchantOrderId) return c.json({ error: "merchantOrderId is required" }, 400);

    const existing = (await kv.get(`kpay_txn:${merchantOrderId}`)) as AnyRecord | null;
    if (!cfg.baseUrl || !cfg.appId || !cfg.merchCode || !cfg.signKey) {
      if (!existing) return c.json({ error: "KBZPay transaction not found" }, 404);
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

    // Query endpoint paths vary a lot across KBZ relays AND env vars are easy to misconfigure
    // (e.g. KPAY_PATH_QUERY_ORDER set to "/orderquery" returns HTTP 404 on most relays).
    // For the *read-only* queryorder call, always try every known candidate so a bad env
    // var or relay quirk does not permanently block status updates.
    const strictPrimaryOnly = false;
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
      const lastDetails = (last?.details && typeof last.details === "object")
        ? (last.details as AnyRecord)
        : {};
      const lastNested = providerData(lastDetails);
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
        message: String(lastDetails.message || lastNested.message || last?.networkError || ""),
        debug: {
          wrapRequest: cfg.wrapRequest,
          stale: true,
          httpStatus: last?.status || 0,
          networkError: last?.networkError || "",
          attemptedEndpoints: Array.from(new Set(provider.attempts.map((a) => a.endpoint))),
          signSource: last?.signSource || "",
          sign: last?.sign || "",
          signedPayload: last?.signedPayload || {},
          providerTopLevelKeys: topLevelKeys(lastDetails),
          providerNestedKeys: nestedKeys(lastDetails),
          providerCode: String(lastDetails.code || lastNested.code || lastDetails.resultCode || lastNested.resultCode || ""),
          providerMessage: String(lastDetails.message || lastNested.message || lastDetails.msg || lastNested.msg || ""),
          rawResponse: lastDetails,
        },
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

    if (safeStatus === "paid") {
      await maybeFinalizePwaOrderAfterPaid(merchantOrderId);
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
        providerCode: String((provider.body as AnyRecord).code || providerData(provider.body).code || (provider.body as AnyRecord).resultCode || providerData(provider.body).resultCode || ""),
        providerMessage: String((provider.body as AnyRecord).message || providerData(provider.body).message || (provider.body as AnyRecord).msg || providerData(provider.body).msg || ""),
        rawResponse: provider.body,
      },
    });
  } catch (error: any) {
    console.error("getKPayStatus error", error);
    return c.json({ error: "Failed to fetch KBZPay status", message: String(error?.message || error) }, 500);
  }
}

export async function handleKPayWebhook(c: Context) {
  try {
    const cfg = kpayConfig();
    if (!cfg.signKey) return c.json({ error: "KPAY_SIGN_KEY is required" }, 500);

    const rawBody = (await c.req.json()) as AnyRecord;
    const wrappedBody = asRecord(rawBody.Request);
    const body = Object.keys(wrappedBody).length > 0 ? wrappedBody : rawBody;
    const bizContent = asRecord(body.biz_content);
    const merchantOrderId = text(
      body.merchantOrderId ||
        body.merch_order_id ||
        body.outTradeNo ||
        bizContent.merch_order_id ||
        bizContent.merchOrderId ||
        bizContent.outTradeNo,
    );

    // Persist EVERY incoming webhook for diagnostics, even if it fails validation,
    // so we can confirm KBZ is actually delivering callbacks for this relay.
    const debugKey = `kpay_webhook_log:${nowIso()}:${merchantOrderId || "unknown"}`;
    try {
      await kv.set(debugKey, {
        receivedAt: nowIso(),
        headers: Object.fromEntries(
          ["content-type", "x-kpay-signature", "x-signature", "user-agent"]
            .map((h) => [h, c.req.header(h) || ""]),
        ),
        rawBody,
      });
    } catch (logErr) {
      console.warn("kpay_webhook_log write failed", logErr);
    }
    console.log("KBZPay webhook received", { merchantOrderId, rawBody });

    if (!merchantOrderId) return c.json({ error: "merchantOrderId missing" }, 400);

    const providedSign = text(
      c.req.header("x-kpay-signature") ||
        c.req.header("x-signature") ||
        rawBody.sign ||
        rawBody.signature ||
        body.sign ||
        body.signature,
    ).toUpperCase();
    const source = buildSignSource(body);
    const expectedSign = await sha256Upper(`${source}&key=${cfg.signKey}`);
    if (!providedSign || providedSign !== expectedSign) {
      console.warn("KBZPay webhook signature mismatch", {
        merchantOrderId,
        providedSign,
        expectedSign,
      });
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

    if (safeStatus === "paid") {
      const fin = await finalizePwaCheckoutOrder(merchantOrderId);
      if (fin.ok && fin.created) {
        console.log(`✅ PWA order created from webhook for ${merchantOrderId}`);
      } else if (!fin.ok && fin.error !== "no_checkout_draft" && fin.error !== "payment_not_confirmed") {
        console.warn(`PWA webhook finalize: ${merchantOrderId}`, fin.error, fin.message);
      }
    }

    return c.json({ success: true });
  } catch (error: any) {
    console.error("handleKPayWebhook error", error);
    return c.json({ error: "Webhook handling failed", message: String(error?.message || error) }, 500);
  }
}
