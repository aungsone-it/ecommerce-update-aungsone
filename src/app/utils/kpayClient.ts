export type KPaySession = {
  merchantOrderId: string;
  status: "pending" | "paid" | "failed";
  providerStatus?: string;
  qrContent?: string;
  qrImageUrl?: string;
  payUrl?: string;
  debug?: {
    endpointUsed?: string;
    queryEndpointUsed?: string;
    signMode?: string;
    wrapRequest?: boolean;
    providerTopLevelKeys?: string[];
    providerNestedKeys?: string[];
    providerCode?: string;
    providerMessage?: string;
  };
};

type KPayBaseParams = {
  projectId: string;
  publicAnonKey: string;
};

type CreateKPayQrParams = KPayBaseParams & {
  amount: number;
  merchantOrderId?: string;
  currency?: string;
  title?: string;
  notifyUrl?: string;
};

function isLikelyImageUrl(value: string): boolean {
  const v = value.trim().toLowerCase();
  if (!v) return false;
  if (v.startsWith("data:image/")) return true;
  if (!v.startsWith("http")) return false;
  return (
    v.includes("api.qrserver.com") ||
    v.includes("qrcode") ||
    v.includes("qr-code") ||
    v.endsWith(".png") ||
    v.endsWith(".jpg") ||
    v.endsWith(".jpeg") ||
    v.endsWith(".gif") ||
    v.endsWith(".webp") ||
    v.endsWith(".svg")
  );
}

function isLikelyCustomerPayUrl(value: string): boolean {
  const v = value.trim().toLowerCase();
  if (!v) return false;
  if (v.startsWith("kbzpay://")) return true;
  return v.startsWith("http");
}

function deepExtractPayload(
  value: unknown,
): { qrContent?: string; qrImageUrl?: string; payUrl?: string; merchantOrderId?: string; providerStatus?: string } {
  const out: { qrContent?: string; qrImageUrl?: string; payUrl?: string; merchantOrderId?: string; providerStatus?: string } = {};
  const visit = (node: unknown) => {
    if (!node || (out.qrContent && out.qrImageUrl && out.payUrl && out.merchantOrderId)) return;
    if (Array.isArray(node)) {
      for (const item of node) visit(item);
      return;
    }
    if (typeof node !== "object") return;
    const rec = node as Record<string, unknown>;
    const lowerKeys = Object.keys(rec);

    for (const key of lowerKeys) {
      const raw = rec[key];
      const val = typeof raw === "string" ? raw.trim() : "";
      const lk = key.toLowerCase();

      if (!out.merchantOrderId && val && ["merchantorderid", "merch_order_id", "merchorderid", "outtradeno"].includes(lk)) {
        out.merchantOrderId = val;
      }
      if (!out.providerStatus && val && ["providerstatus", "tradestatus", "orderstatus", "status", "code", "resultcode"].includes(lk)) {
        out.providerStatus = val;
      }
      if (!val) continue;

      if (!out.qrImageUrl && isLikelyImageUrl(val)) {
        out.qrImageUrl = val;
      }
      if (!out.payUrl && isLikelyCustomerPayUrl(val)) {
        out.payUrl = val;
      }
      if (
        !out.qrContent &&
        [
          "qrcontent",
          "qrcode",
          "qr_code",
          "qrstring",
          "codeurl",
          "code_url",
          "rawqr",
          "code_content",
          "codecontent",
        ].includes(lk)
      ) {
        out.qrContent = val;
      }
    }

    for (const child of Object.values(rec)) {
      if (typeof child === "string") {
        const v = child.trim();
        if (!v) continue;
        if (!out.qrImageUrl && isLikelyImageUrl(v)) out.qrImageUrl = v;
        if (!out.payUrl && isLikelyCustomerPayUrl(v)) out.payUrl = v;
      } else if (typeof child === "object") {
        visit(child);
      }
    }
  };
  visit(value);
  return out;
}

function normalizeSession(data: Record<string, any>, fallbackOrderId: string): KPaySession {
  const extracted = deepExtractPayload(data);
  const qrImageCandidate = String(data.qrImageUrl || extracted.qrImageUrl || "").trim();
  const qrImageUrl = isLikelyImageUrl(qrImageCandidate) ? qrImageCandidate : "";
  const qrContent = String(data.qrContent || extracted.qrContent || "").trim();
  const payUrl = String(data.payUrl || extracted.payUrl || "").trim();
  const debugPayload = (data.debug && typeof data.debug === "object") ? data.debug as Record<string, any> : {};
  const topLevelKeys = Array.isArray(debugPayload.providerTopLevelKeys) ? debugPayload.providerTopLevelKeys : [];
  const nestedKeys = Array.isArray(debugPayload.providerNestedKeys) ? debugPayload.providerNestedKeys : [];
  return {
    merchantOrderId: String(data.merchantOrderId || extracted.merchantOrderId || fallbackOrderId),
    status: data.status === "paid" ? "paid" : data.status === "failed" ? "failed" : "pending",
    providerStatus: String(data.providerStatus || extracted.providerStatus || ""),
    qrContent,
    qrImageUrl,
    payUrl,
    debug: {
      endpointUsed: String(data.endpointUsed || ""),
      queryEndpointUsed: String(data.queryEndpointUsed || ""),
      signMode: String(data.signMode || ""),
      wrapRequest: Boolean(data.wrapRequest),
      providerTopLevelKeys: topLevelKeys,
      providerNestedKeys: nestedKeys,
      providerCode: String(data.providerStatus || ""),
      providerMessage: String(data.message || debugPayload.message || ""),
    },
  };
}

function readProviderErrorDetails(data: Record<string, any>): {
  providerCode?: string;
  providerMessage?: string;
  endpoint?: string;
  signMode?: string;
  wrapRequest?: boolean;
} {
  const details = (data.details && typeof data.details === "object")
    ? (data.details as Record<string, any>)
    : {};
  const response = (details.Response && typeof details.Response === "object")
    ? (details.Response as Record<string, any>)
    : {};
  const nested = (
    (response.data && typeof response.data === "object" && (response.data as Record<string, any>)) ||
    (details.data && typeof details.data === "object" && (details.data as Record<string, any>)) ||
    {}
  );

  const providerCode = String(
    data.providerStatus ||
      data.code ||
      data.resultCode ||
      details.code ||
      details.resultCode ||
      details.respCode ||
      response.code ||
      response.resultCode ||
      response.respCode ||
      nested.code ||
      nested.resultCode ||
      nested.respCode ||
      "",
  ).trim();

  const providerMessage = String(
    data.message ||
      data.error_description ||
      details.message ||
      details.msg ||
      details.error ||
      response.message ||
      response.msg ||
      nested.message ||
      nested.msg ||
      nested.error ||
      "",
  ).trim();

  return {
    providerCode: providerCode || undefined,
    providerMessage: providerMessage || undefined,
    endpoint: String(data.endpoint || "").trim() || undefined,
    signMode: String(data.signMode || "").trim() || undefined,
    wrapRequest: typeof data.wrapRequest === "boolean" ? data.wrapRequest : undefined,
  };
}

export function buildMerchantOrderId(prefix = "ORD"): string {
  return `${prefix}-${Date.now().toString(36).toUpperCase()}`;
}

export async function createKPayQrSession(params: CreateKPayQrParams): Promise<KPaySession> {
  const {
    projectId,
    publicAnonKey,
    amount,
    merchantOrderId = buildMerchantOrderId("KPAY"),
    currency = "MMK",
    title = `Order ${merchantOrderId}`,
    notifyUrl,
  } = params;
  const response = await fetch(
    `https://${projectId}.supabase.co/functions/v1/make-server-16010b6f/kpay/create-qr`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${publicAnonKey}`,
      },
      body: JSON.stringify({
        merchantOrderId,
        amount,
        currency,
        title,
        ...(notifyUrl ? { notifyUrl } : {}),
      }),
    },
  );
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const info = readProviderErrorDetails((data || {}) as Record<string, any>);
    const headline = String(data?.error || data?.message || "Failed to generate KPay QR");
    const parts = [
      info.providerCode ? `providerCode=${info.providerCode}` : "",
      info.providerMessage ? `providerMessage=${info.providerMessage}` : "",
      info.endpoint ? `endpoint=${info.endpoint}` : "",
      info.signMode ? `signMode=${info.signMode}` : "",
      typeof info.wrapRequest === "boolean" ? `wrapRequest=${String(info.wrapRequest)}` : "",
    ].filter(Boolean);
    const detailSuffix = parts.length > 0 ? ` (${parts.join(", ")})` : "";
    throw new Error(`${headline}${detailSuffix}`);
  }
  const normalized = normalizeSession(data as Record<string, any>, merchantOrderId);
  if (!normalized.qrContent && !normalized.qrImageUrl && !normalized.payUrl) {
    console.warn("KPay create-qr returned no QR payload", data);
  }
  return normalized;
}

export async function fetchKPaySessionStatus(
  params: KPayBaseParams & { merchantOrderId: string },
): Promise<KPaySession> {
  const { projectId, publicAnonKey, merchantOrderId } = params;
  const response = await fetch(
    `https://${projectId}.supabase.co/functions/v1/make-server-16010b6f/kpay/status/${encodeURIComponent(merchantOrderId)}`,
    {
      headers: {
        Authorization: `Bearer ${publicAnonKey}`,
      },
    },
  );
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(String(data?.error || data?.message || "Failed to get KPay status"));
  }
  const normalized = normalizeSession(data as Record<string, any>, merchantOrderId);
  if (!normalized.qrContent && !normalized.qrImageUrl && !normalized.payUrl) {
    console.warn("KPay status returned no QR payload", data);
  }
  return normalized;
}
