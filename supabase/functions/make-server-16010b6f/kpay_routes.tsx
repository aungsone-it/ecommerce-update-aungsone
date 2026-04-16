import { Context } from "npm:hono@4";
import * as kv from "./kv_store.tsx";

type AnyRecord = Record<string, unknown>;

function isNonEmptyString(v: unknown): v is string {
  return typeof v === "string" && v.trim().length > 0;
}

function normalizeAmountMMK(amount: unknown): string {
  const n = typeof amount === "string" ? Number(amount) : Number(amount || 0);
  if (!Number.isFinite(n) || n <= 0) {
    throw new Error("Invalid amount");
  }
  return String(Math.round(n));
}

function buildSignSource(payload: AnyRecord): string {
  const keys = Object.keys(payload)
    .filter((k) => payload[k] !== undefined && payload[k] !== null && String(payload[k]).trim() !== "")
    .filter((k) => k !== "sign" && k !== "signature")
    .sort();
  return keys.map((k) => `${k}=${String(payload[k])}`).join("&");
}

async function hmacSha256HexUpper(secret: string, message: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(message));
  const bytes = new Uint8Array(sig);
  return Array.from(bytes).map((b) => b.toString(16).padStart(2, "0")).join("").toUpperCase();
}

async function safeJson(response: Response): Promise<AnyRecord> {
  try {
    return await response.json();
  } catch {
    return {};
  }
}

function buildCandidateEndpoints(baseUrl: string, path: string): string[] {
  const urls = new Set<string>();
  const primary = new URL(path, baseUrl).toString();
  urls.add(primary);

  // UAT docs sometimes show http, but upstream may accept only https in some networks.
  if (baseUrl.startsWith("http://")) {
    urls.add(new URL(path, baseUrl.replace("http://", "https://")).toString());
  } else if (baseUrl.startsWith("https://")) {
    urls.add(new URL(path, baseUrl.replace("https://", "http://")).toString());
  }
  return Array.from(urls);
}

async function postWithTimeout(
  endpoint: string,
  payload: AnyRecord,
  apiKey: string,
  timeoutMs = 12000,
): Promise<{ ok: boolean; status?: number; body: AnyRecord; networkError?: string }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort("kpay-timeout"), timeoutMs);
  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(isNonEmptyString(apiKey) ? { "x-api-key": apiKey } : {}),
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
    return { ok: response.ok, status: response.status, body: await safeJson(response) };
  } catch (error: any) {
    return { ok: false, body: {}, networkError: String(error?.message || error) };
  } finally {
    clearTimeout(timer);
  }
}

async function findOrderByOrderNumber(orderNumber: string): Promise<{ key: string; order: AnyRecord } | null> {
  const all = await kv.getByPrefix("order:");
  const orders = Array.isArray(all) ? all : [];
  const match = orders.find((o: any) => String(o?.orderNumber || "") === orderNumber);
  if (!match || !match.id) return null;
  return { key: `order:${match.id}`, order: match };
}

function mapKPayStatus(raw: unknown): "pending" | "paid" | "failed" {
  const s = String(raw || "").trim().toUpperCase();
  if (!s) return "pending";
  if (["SUCCESS", "PAID", "TRADE_SUCCESS", "PAY_SUCCESS"].includes(s)) return "paid";
  if (["FAILED", "FAIL", "CLOSED", "EXPIRED", "TRADE_CLOSED"].includes(s)) return "failed";
  return "pending";
}

export async function createKPayQr(c: Context) {
  try {
    const body = (await c.req.json()) as AnyRecord;
    const merchantOrderId = String(body.merchantOrderId || "").trim();
    if (!merchantOrderId) return c.json({ error: "merchantOrderId is required" }, 400);

    const amount = normalizeAmountMMK(body.amount);
    const currency = String(body.currency || "MMK").toUpperCase();

    const baseUrl = Deno.env.get("KPAY_BASE_URL") || "";
    const createPath = Deno.env.get("KPAY_CREATE_QR_PATH") || "/pgw-api/v1/payment/qr/create";
    const merchantId = Deno.env.get("KPAY_MERCHANT_ID") || "";
    const apiKey = Deno.env.get("KPAY_API_KEY") || "";
    const secret = Deno.env.get("KPAY_SECRET") || "";
    const notifyUrl = Deno.env.get("KPAY_NOTIFY_URL") || "";

    if (!isNonEmptyString(baseUrl) || !isNonEmptyString(merchantId) || !isNonEmptyString(secret)) {
      return c.json({ error: "KPay gateway is not configured" }, 500);
    }

    const payload: AnyRecord = {
      merchantId,
      merchantOrderId,
      amount,
      currency,
      title: isNonEmptyString(body.title) ? body.title : "Order Payment",
      notifyUrl: isNonEmptyString(body.notifyUrl) ? body.notifyUrl : notifyUrl,
      timestamp: Date.now(),
      nonceStr: crypto.randomUUID().replaceAll("-", ""),
    };

    const signSource = buildSignSource(payload);
    const signature = await hmacSha256HexUpper(secret, signSource);
    payload.sign = signature;

    const endpoints = buildCandidateEndpoints(baseUrl, createPath);
    let chosenEndpoint = "";
    let result: AnyRecord = {};
    let providerStatusCode = 0;
    let lastNetworkError = "";

    for (const endpoint of endpoints) {
      const res = await postWithTimeout(endpoint, payload, apiKey, 12000);
      if (res.ok) {
        chosenEndpoint = endpoint;
        result = res.body;
        providerStatusCode = res.status || 200;
        lastNetworkError = "";
        break;
      }
      if (res.networkError) {
        lastNetworkError = `${endpoint}: ${res.networkError}`;
        continue;
      }
      if (res.status) {
        chosenEndpoint = endpoint;
        result = res.body;
        providerStatusCode = res.status;
      }
    }

    if (!chosenEndpoint || providerStatusCode >= 400) {
      return c.json({
        error: "KPay create QR failed",
        details: result,
        endpointTried: chosenEndpoint || endpoints[endpoints.length - 1],
        networkError: lastNetworkError || undefined,
      }, 502);
    }

    const data = (result.data || result.result || result) as AnyRecord;
    const providerStatus = String(data.status || result.status || result.code || "");
    const internalStatus = mapKPayStatus(providerStatus);
    const qrContent = String(data.qrContent || data.qrCode || data.qr_code || data.qrString || "");
    const qrImageUrl = String(data.qrImage || data.qrImg || data.qrImageUrl || "");
    const payUrl = String(data.payUrl || data.paymentUrl || data.deeplink || "");

    await kv.set(`kpay_txn:${merchantOrderId}`, {
      merchantOrderId,
      amount,
      currency,
      status: internalStatus,
      providerStatus,
      qrContent,
      qrImageUrl,
      payUrl,
      rawCreateResponse: result,
      updatedAt: new Date().toISOString(),
      createdAt: new Date().toISOString(),
    });

    return c.json({
      success: true,
      merchantOrderId,
      status: internalStatus,
      providerStatus,
      qrContent,
      qrImageUrl,
      payUrl,
      raw: result,
      endpointUsed: chosenEndpoint,
    });
  } catch (error: any) {
    console.error("❌ createKPayQr error:", error);
    return c.json({ error: "Failed to create KPay QR", message: String(error?.message || error) }, 500);
  }
}

export async function getKPayStatus(c: Context) {
  try {
    const merchantOrderId = c.req.param("merchantOrderId");
    if (!merchantOrderId) return c.json({ error: "merchantOrderId is required" }, 400);

    const current = (await kv.get(`kpay_txn:${merchantOrderId}`)) as AnyRecord | null;
    if (!current) return c.json({ error: "KPay transaction not found" }, 404);

    return c.json({
      success: true,
      merchantOrderId,
      status: current.status || "pending",
      providerStatus: current.providerStatus || "",
      amount: current.amount,
      currency: current.currency,
      qrContent: current.qrContent || "",
      qrImageUrl: current.qrImageUrl || "",
      payUrl: current.payUrl || "",
      updatedAt: current.updatedAt,
    });
  } catch (error: any) {
    console.error("❌ getKPayStatus error:", error);
    return c.json({ error: "Failed to fetch KPay status" }, 500);
  }
}

export async function handleKPayWebhook(c: Context) {
  try {
    const body = (await c.req.json()) as AnyRecord;
    const merchantOrderId = String(body.merchantOrderId || body.outTradeNo || "").trim();
    if (!merchantOrderId) return c.json({ error: "merchantOrderId missing" }, 400);

    const secret = Deno.env.get("KPAY_SECRET") || "";
    if (!isNonEmptyString(secret)) return c.json({ error: "KPay webhook secret not configured" }, 500);

    const provided = String(
      c.req.header("x-kpay-signature") ||
        c.req.header("x-signature") ||
        body.sign ||
        body.signature ||
        "",
    ).trim().toUpperCase();
    const signSource = buildSignSource(body);
    const expected = await hmacSha256HexUpper(secret, signSource);
    if (!provided || provided !== expected) {
      return c.json({ error: "Invalid signature" }, 401);
    }

    const providerStatus = String(body.status || body.tradeStatus || body.resultCode || "");
    const status = mapKPayStatus(providerStatus);
    const paidAt = new Date().toISOString();

    const existing = (await kv.get(`kpay_txn:${merchantOrderId}`)) as AnyRecord | null;
    await kv.set(`kpay_txn:${merchantOrderId}`, {
      ...(existing || {}),
      merchantOrderId,
      status,
      providerStatus,
      paidAt: status === "paid" ? paidAt : existing?.paidAt,
      rawWebhook: body,
      updatedAt: new Date().toISOString(),
      createdAt: existing?.createdAt || new Date().toISOString(),
    });

    const found = await findOrderByOrderNumber(merchantOrderId);
    if (found) {
      const nextOrder: AnyRecord = {
        ...found.order,
        paymentStatus: status === "paid" ? "paid" : status === "failed" ? "failed" : "pending",
        status: status === "paid" ? "pending" : found.order.status,
        updatedAt: new Date().toISOString(),
        kpay: {
          ...(found.order.kpay as AnyRecord || {}),
          merchantOrderId,
          providerStatus,
          status,
          paidAt: status === "paid" ? paidAt : undefined,
        },
      };
      await kv.set(found.key, nextOrder);
    }

    return c.json({ success: true });
  } catch (error: any) {
    console.error("❌ handleKPayWebhook error:", error);
    return c.json({ error: "Webhook handling failed" }, 500);
  }
}
