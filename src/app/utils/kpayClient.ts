export type KPaySession = {
  merchantOrderId: string;
  status: "pending" | "paid" | "failed";
  providerStatus?: string;
  qrContent?: string;
  qrImageUrl?: string;
  payUrl?: string;
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

function normalizeSession(data: Record<string, any>, fallbackOrderId: string): KPaySession {
  return {
    merchantOrderId: String(data.merchantOrderId || fallbackOrderId),
    status: data.status === "paid" ? "paid" : data.status === "failed" ? "failed" : "pending",
    providerStatus: String(data.providerStatus || ""),
    qrContent: String(data.qrContent || ""),
    qrImageUrl: String(data.qrImageUrl || ""),
    payUrl: String(data.payUrl || ""),
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
    throw new Error(String(data?.error || data?.message || "Failed to generate KPay QR"));
  }
  return normalizeSession(data as Record<string, any>, merchantOrderId);
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
  return normalizeSession(data as Record<string, any>, merchantOrderId);
}
