import { Context } from "npm:hono@4";
import * as kv from "./kv_store.tsx";

type AnyRecord = Record<string, unknown>;
type PaymentStatus = "pending" | "paid" | "failed";
type SignMode = "hmac_sha256" | "sha256";

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

async function sha256Upper(source: string): Promise<string> {
  const enc = new TextEncoder();
  const digest = await crypto.subtle.digest("SHA-256", enc.encode(source));
  const bytes = new Uint8Array(digest);
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

function providerBusinessSuccess(body: AnyRecord): boolean {
  const nested = providerData(body);
  const response = asRecord(body.Response);
  const result = String(
    nested.result ||
      response.result ||
      body.result ||
      nested.respCode ||
      nested.resp_code ||
      response.respCode ||
      body.respCode ||
      nested.resultCode ||
      response.resultCode ||
      body.resultCode ||
      nested.code ||
      response.code ||
      body.code ||
      "",
  )
    .trim()
    .toUpperCase();
  if (!result) return false;
  if (["SUCCESS", "SUCC", "S", "OK", "00", "0000", "PAY_SUCCESS", "TRADE_SUCCESS"].includes(result)) {
    return true;
  }
  if (result === "0") return true;
  return false;
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

function isLikelyCustomerPayUrl(value: string): boolean {
  const v = value.trim().toLowerCase();
  if (!v) return false;
  if (v.startsWith("kbzpay://")) return true;
  return v.startsWith("http");
}

function extractQrPayload(payload: AnyRecord): { qrContent: string; qrImageUrl: string; payUrl: string } {
  const nested = providerData(payload);
  const knownPayUrl = String(
    nested.payUrl ||
      nested.paymentUrl ||
      nested.deepLink ||
      nested.prepayUrl ||
      nested.cashierUrl ||
      nested.redirectUrl ||
      nested.redirect_url ||
      payload.payUrl ||
      payload.paymentUrl ||
      asRecord(payload.Response).payUrl ||
      asRecord(payload.Response).paymentUrl ||
      "",
  ).trim();
  const fromKnownFields = {
    qrContent: String(
      nested.qrContent ||
        nested.qrCode ||
        nested.qr_code ||
        nested.qrString ||
        nested.codeUrl ||
        nested.code_url ||
        nested.rawQr ||
        nested.code_content ||
        nested.codeContent ||
        nested.code_url_content ||
        payload.qrContent ||
        payload.qrCode ||
        payload.codeUrl ||
        asRecord(payload.Response).qrContent ||
        asRecord(payload.Response).qrCode ||
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
        nested.qrCodeUrl ||
        nested.qr_code_url ||
        payload.qrImageUrl ||
        payload.qrImage ||
        asRecord(payload.Response).qrImageUrl ||
        asRecord(payload.Response).qrImage ||
        "",
    ).trim(),
    payUrl: isLikelyCustomerPayUrl(knownPayUrl) ? knownPayUrl : "",
  };

  if (fromKnownFields.qrContent || fromKnownFields.qrImageUrl || fromKnownFields.payUrl) {
    return fromKnownFields;
  }

  const deepScan = (value: unknown): { qrContent?: string; qrImageUrl?: string; payUrl?: string } => {
    if (typeof value === "string") {
      const v = value.trim();
      if (!v) return {};
      if (v.startsWith("http")) {
        const lowered = v.toLowerCase();
        if (lowered.includes("qr") || lowered.includes("qrcode")) return { qrImageUrl: v };
        if (isLikelyCustomerPayUrl(v)) return { payUrl: v };
        return {};
      }
      if (v.startsWith("kbzpay://") && isLikelyCustomerPayUrl(v)) return { payUrl: v };
      if (v.length > 24 && /[A-Z0-9:%._/-]{12,}/i.test(v)) return { qrContent: v };
      return {};
    }
    if (Array.isArray(value)) {
      for (const item of value) {
        const got = deepScan(item);
        if (got.qrContent || got.qrImageUrl || got.payUrl) return got;
      }
      return {};
    }
    if (value && typeof value === "object") {
      for (const [, child] of Object.entries(value as AnyRecord)) {
        const got = deepScan(child);
        if (got.qrContent || got.qrImageUrl || got.payUrl) return got;
      }
    }
    return {};
  };

  const scanned = deepScan(payload);
  const payUrl = String(scanned.payUrl || "").trim();
  const qrContent = String(scanned.qrContent || "").trim();
  const qrImageUrl = String(scanned.qrImageUrl || "").trim();
  return { qrContent, qrImageUrl, payUrl };
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
  const appId = resolveEnv("KPAY_APPID");
  const merchCode = resolveEnv("KPAY_MERCH_CODE", "KPAY_MERCHANT_ID");
  const signKey = resolveEnv("KPAY_SIGN_KEY", "KPAY_SECRET");
  const notifyUrl = resolveEnv("KPAY_NOTIFY_URL");
  const createPath = resolveEnv("KPAY_PATH_CREATE_QR", "KPAY_CREATE_QR_PATH") || DEFAULT_CREATE_PATH;
  const queryPath = resolveEnv("KPAY_PATH_QUERY_ORDER", "KPAY_QUERY_ORDER_PATH") || DEFAULT_QUERY_PATH;
  const apiKey = resolveEnv("KPAY_API_KEY");
  const timeoutMs = Math.max(4000, Number(resolveEnv("KPAY_TIMEOUT_MS")) || 12000);
  const autoDiscoverRaw = text(resolveEnv("KPAY_AUTO_DISCOVER")).toLowerCase();
  const autoDiscover = autoDiscoverRaw ? !["0", "false", "off", "no"].includes(autoDiscoverRaw) : true;
  const wrapRequest = resolveEnv("KPAY_WRAP_REQUEST") === "1";
  const signMode = text(resolveEnv("KPAY_SIGN_MODE")).toLowerCase();
  return { baseUrl, appId, merchCode, signKey, notifyUrl, createPath, queryPath, apiKey, timeoutMs, autoDiscover, wrapRequest, signMode };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function signPayload(payload: AnyRecord, signKey: string, mode: SignMode): Promise<{ sign: string; source: string }> {
  const source = buildSignSource(payload);
  if (mode === "sha256") {
    // Many KBZ PGW deployments expect SHA256(canonical + secret) instead of HMAC.
    return { sign: await sha256Upper(`${source}&key=${signKey}`), source };
  }
  return { sign: await hmacSha256Upper(signKey, source), source };
}

async function signedProviderRequest(
  endpoint: string,
  basePayload: AnyRecord,
  signKey: string,
  timeoutMs: number,
  wrapRequest: boolean,
  signMode: SignMode,
  apiKey?: string,
) {
  const { sign } = await signPayload(basePayload, signKey, signMode);
  const signed = { ...basePayload, sign };
  const payload = wrapRequest ? { Request: signed } : signed;
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
  const tradeTypes = ["PAY_BY_QRCODE", "QRCODE", "APP"];
  const base: AnyRecord = {
    method: "kbz.payment.precreate",
    sign_type: "SHA256",
    appid: params.appId,
    merch_code: params.merchCode,
    merch_order_id: params.merchantOrderId,
    total_amount: params.amount,
    trade_type: tradeTypes[0],
    currency: params.currency,
    title: params.title,
    nonce_str: nonce,
    timestamp: ts,
  };
  if (params.notifyUrl) base.notify_url = params.notifyUrl;
  const primary: AnyRecord = base;
  if (strictPrimaryOnly) return [primary];
  return [
    primary,
    {
      ...base,
      trade_type: tradeTypes[1],
    },
    {
      ...base,
      trade_type: tradeTypes[2],
    },
    {
      method: "kbz.payment.precreate",
      signType: "SHA256",
      appId: params.appId,
      merchCode: params.merchCode,
      merchOrderId: params.merchantOrderId,
      amount: params.amount,
      tradeType: tradeTypes[0],
      currency: params.currency,
      subject: params.title,
      nonceStr: nonce,
      timestamp: ts,
      ...(params.notifyUrl ? { notifyUrl: params.notifyUrl } : {}),
    },
    {
      method: "kbz.payment.precreate",
      signType: "SHA256",
      appId: params.appId,
      merchCode: params.merchCode,
      merchOrderId: params.merchantOrderId,
      amount: params.amount,
      tradeType: tradeTypes[2],
      currency: params.currency,
      subject: params.title,
      nonceStr: nonce,
      timestamp: ts,
      ...(params.notifyUrl ? { notifyUrl: params.notifyUrl } : {}),
    },
    {
      method: "kbz.payment.precreate",
      signType: "SHA256",
      merchantId: params.merchCode,
      merchantOrderId: params.merchantOrderId,
      amount: params.amount,
      currency: params.currency,
      tradeType: tradeTypes[0],
      title: params.title,
      nonceStr: nonce,
      timestamp: ts,
      ...(params.notifyUrl ? { notifyUrl: params.notifyUrl } : {}),
    },
    {
      method: "kbz.payment.precreate",
      sign_type: "SHA256",
      app_id: params.appId,
      merchant_code: params.merchCode,
      merchant_order_id: params.merchantOrderId,
      total_amount: params.amount,
      trade_type: tradeTypes[0],
      currency: params.currency,
      title: params.title,
      nonce_str: nonce,
      timestamp: ts,
      ...(params.notifyUrl ? { notify_url: params.notifyUrl } : {}),
    },
    {
      method: "kbz.payment.precreate",
      sign_type: "SHA256",
      app_id: params.appId,
      merchant_code: params.merchCode,
      merchant_order_id: params.merchantOrderId,
      total_amount: params.amount,
      trade_type: tradeTypes[2],
      currency: params.currency,
      title: params.title,
      nonce_str: nonce,
      timestamp: ts,
      ...(params.notifyUrl ? { notify_url: params.notifyUrl } : {}),
    },
    {
      method: "kbz.payment.precreate",
      sign_type: "SHA256",
      appid: params.appId,
      merch_code: params.merchCode,
      merch_order_id: params.merchantOrderId,
      total_amount: params.amount,
      txn_type: tradeTypes[0],
      currency: params.currency,
      title: params.title,
      nonce_str: nonce,
      timestamp: ts,
      ...(params.notifyUrl ? { notify_url: params.notifyUrl } : {}),
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
    method: "kbz.payment.queryorder",
    sign_type: "SHA256",
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
      method: "kbz.payment.queryorder",
      signType: "SHA256",
      appId: params.appId,
      merchCode: params.merchCode,
      merchOrderId: params.merchantOrderId,
      nonceStr: nonce,
      timestamp: ts,
    },
    {
      method: "kbz.payment.queryorder",
      signType: "SHA256",
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
  wrapRequests: boolean[];
  signModes: SignMode[];
  apiKey?: string;
}) {
  const attempts: Array<{
    endpoint: string;
    status: number;
    networkError?: string;
    details?: AnyRecord;
    wrapRequest: boolean;
    signMode: SignMode;
  }> = [];
  for (const endpoint of args.endpoints) {
    for (const wrapRequest of args.wrapRequests) {
      for (const signMode of args.signModes) {
        for (const payload of args.payloads) {
          const res = await signedProviderRequest(
            endpoint,
            payload,
            args.signKey,
            args.timeoutMs,
            wrapRequest,
            signMode,
            args.apiKey,
          );
          if (res.ok && providerBusinessSuccess(res.body)) {
            return { success: true as const, endpoint, body: res.body, wrapRequest, signMode };
          }
          attempts.push({
            endpoint,
            status: res.status || 0,
            networkError: res.networkError,
            details: res.body,
            wrapRequest,
            signMode,
          });
        }
      }
    }
  }
  return { success: false as const, attempts };
}

function resolveSignModes(mode: string, autoDiscover: boolean): SignMode[] {
  if (mode === "hmac_sha256" || mode === "hmac") return ["hmac_sha256"];
  if (mode === "sha256") return ["sha256"];
  return autoDiscover ? ["sha256", "hmac_sha256"] : ["hmac_sha256"];
}

function resolveWrapModes(wrapRequest: boolean, autoDiscover: boolean): boolean[] {
  if (!autoDiscover) return [wrapRequest];
  return wrapRequest ? [true, false] : [false, true];
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
      wrapRequests: resolveWrapModes(cfg.wrapRequest, cfg.autoDiscover),
      signModes: resolveSignModes(cfg.signMode, cfg.autoDiscover),
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
          signMode: last?.signMode || "",
          wrapRequest: last?.wrapRequest || false,
          attemptedEndpoints: Array.from(new Set(provider.attempts.map((a) => a.endpoint))),
        },
        502,
      );
    }

    let providerStatus = providerStatusFrom(provider.body);
    let status = mapProviderStatus(providerStatus);
    let qr = extractQrPayload(provider.body);
    let rawStatusResponse: AnyRecord | undefined;
    let queryEndpointUsed = "";

    // Some KBZ PGW environments return pending on create and provide QR only via query.
    if (!qr.qrContent && !qr.qrImageUrl && !qr.payUrl) {
      const queryEndpoints = endpointCandidates(cfg.baseUrl, cfg.queryPath, "query", !cfg.autoDiscover);
      const queryPayloads = queryPayloadCandidates(
        {
          appId: cfg.appId,
          merchCode: cfg.merchCode,
          merchantOrderId,
        },
        !cfg.autoDiscover,
      );
      // Allow provider a short propagation window to expose QR after create.
      for (let attempt = 0; attempt < 3 && !qr.qrContent && !qr.qrImageUrl && !qr.payUrl; attempt++) {
        if (attempt > 0) await sleep(1200);
        const queried = await tryProviderVariants({
          endpoints: queryEndpoints,
          payloads: queryPayloads,
          signKey: cfg.signKey,
          timeoutMs: cfg.timeoutMs,
          wrapRequests: resolveWrapModes(cfg.wrapRequest, cfg.autoDiscover),
          signModes: resolveSignModes(cfg.signMode, cfg.autoDiscover),
          apiKey: cfg.apiKey,
        });
        if (!queried.success) continue;
        const queriedQr = extractQrPayload(queried.body);
        if (queriedQr.qrContent || queriedQr.qrImageUrl || queriedQr.payUrl) {
          qr = queriedQr;
          providerStatus = providerStatusFrom(queried.body) || providerStatus;
          status = mapProviderStatus(providerStatus);
          rawStatusResponse = queried.body;
          queryEndpointUsed = queried.endpoint;
          break;
        }
      }
    }

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
      rawStatusResponse: rawStatusResponse || undefined,
      endpointUsed: provider.endpoint,
      queryEndpointUsed: queryEndpointUsed || undefined,
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
      queryEndpointUsed: queryEndpointUsed || undefined,
      signMode: provider.signMode,
      wrapRequest: provider.wrapRequest,
      debug: {
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
      wrapRequests: resolveWrapModes(cfg.wrapRequest, cfg.autoDiscover),
      signModes: resolveSignModes(cfg.signMode, cfg.autoDiscover),
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
            signMode: last?.signMode || "",
            wrapRequest: last?.wrapRequest || false,
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
    const expectedSigns = new Set<string>();
    for (const mode of resolveSignModes(cfg.signMode, true)) {
      const signed = await signPayload(body, cfg.signKey, mode);
      expectedSigns.add(signed.sign.toUpperCase());
    }
    if (!providedSign || !expectedSigns.has(providedSign)) {
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
