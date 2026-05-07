import { projectId, publicAnonKey } from "../../../utils/supabase/info";
import { useState, useEffect, useMemo, useRef } from "react";
import {
  ChevronLeft,
  CreditCard,
  ShoppingBag,
  Check,
  Package,
  MapPin,
  Phone,
  Tag,
  X,
  XCircle,
  CheckCircle,
  Shield,
  Loader2,
} from "lucide-react";
import { useLocation, useNavigate } from "react-router";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Textarea } from "./ui/textarea";
import { Label } from "./ui/label";
import { useCart } from "./CartContext";
import { useAuth } from "../contexts/AuthContext";
import { supabase } from "../contexts/AuthContext";
import { toast } from "sonner";
import { QRCodeCanvas } from "qrcode.react";
import { notifyAdminOrdersUpdated } from "../utils/adminOrdersRealtime";
import {
  type KPaySession,
  buildMerchantOrderId,
  createKPayQrSession,
  fetchKPaySessionStatus,
  startKPayPwa,
  KPAY_PWA_PENDING_STORAGE_KEY,
} from "../utils/kpayClient";

/** KV-backed customer session (authApi / migoo-user) — AuthContext only has Supabase sessions */
function getMigooCustomerFromStorage(): {
  id: string;
  email?: string;
  name?: string;
  phone?: string;
} | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem("migoo-user");
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { id?: string; email?: string; name?: string; phone?: string };
    if (parsed && typeof parsed.id === "string") {
      return {
        id: parsed.id,
        email: parsed.email,
        name: parsed.name,
        phone: parsed.phone,
      };
    }
  } catch {
    return null;
  }
  return null;
}

/** Same ID resolution as VendorStoreView / addresses page (`id` or `userId`). */
function resolveUserIdFromRecord(u: unknown): string | null {
  if (!u || typeof u !== "object") return null;
  const o = u as Record<string, unknown>;
  const raw = o.id ?? o.userId;
  if (typeof raw === "string" && raw.trim().length > 0) return raw.trim();
  if (typeof raw === "number" && Number.isFinite(raw)) return String(raw);
  return null;
}

interface CheckoutProps {
  onBack: () => void;
  storeName: string;
  vendorId?: string;
  vendorName?: string;
  /** Vendor storefront session (migoo-user) — must match addresses page so default shipping loads. */
  accountUser?: { id?: string; userId?: string; email?: string; name?: string; phone?: string } | null;
  /** After a successful order — e.g. invalidate cached order history for instant refresh on profile. */
  onOrderPlacedSuccess?: (ctx: { userId: string }) => void;
}

type CheckoutSummarySnapshot = {
  orderNumber: string;
  items: any[];
  total: number;
  orderNote: string;
  coupon: any;
  discount: number;
  shippingInfo: {
    fullName: string;
    email: string;
    phone: string;
    address: string;
    city: string;
    zipCode: string;
    country: string;
  };
  paymentMethod: "Card" | "KPay" | "KPay-PWA" | "BankTransfer";
  savedAt: string;
};

type CheckoutMiniSummaryCache = {
  items: any[];
  total: number;
  savedAt: string;
};

type KPayPwaPendingContext = {
  merchantOrderId?: string;
  prepayId?: string;
  amount?: number;
  currency?: string;
  redirectedAt?: string;
  originPath?: string;
  draftOrder?: {
    userId?: string | null;
    customerName?: string;
    email?: string;
    phone?: string;
    subtotal?: number;
    total?: number;
    discount?: number;
    couponCode?: string | null;
    couponId?: string | null;
    notes?: string;
    vendor?: string;
    vendorId?: string;
    shippingInfo?: {
      fullName: string;
      email: string;
      phone: string;
      address: string;
      city: string;
      zipCode: string;
      country: string;
    };
    items?: Array<{
      productId?: string;
      sku?: string;
      name?: string;
      quantity?: number;
      price?: number;
      image?: string;
      vendor?: string;
      vendorId?: string;
      commissionRate?: number;
    }>;
  };
};

const CHECKOUT_LATEST_SUMMARY_KEY = "checkout-summary:latest";

function readCheckoutMiniSummaryCache(key: string): CheckoutMiniSummaryCache | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CheckoutMiniSummaryCache;
    if (!parsed || !Array.isArray(parsed.items)) return null;
    return {
      items: parsed.items,
      total: Number(parsed.total || 0),
      savedAt: typeof parsed.savedAt === "string" ? parsed.savedAt : new Date().toISOString(),
    };
  } catch {
    return null;
  }
}

function readCheckoutSummarySnapshot(key: string): CheckoutSummarySnapshot | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CheckoutSummarySnapshot;
    if (!parsed || !Array.isArray(parsed.items) || !parsed.orderNumber) return null;
    return parsed;
  } catch {
    return null;
  }
}

function summaryPaymentMethodLabel(
  method: "Card" | "KPay" | "KPay-PWA" | "BankTransfer"
): string {
  if (method === "KPay") return "KPay QR Payment";
  if (method === "KPay-PWA") return "KPay In App Payment";
  if (method === "BankTransfer") return "Bank Transfer";
  return "Credit / Debit Card";
}

function normalizeCheckoutPaymentMethod(raw: unknown): "Card" | "KPay" | "KPay-PWA" | "BankTransfer" {
  const txt = String(raw || "").trim().toLowerCase();
  if (!txt) return "Card";
  if (txt.includes("pwa") || txt.includes("mobile browser")) return "KPay-PWA";
  if (txt === "kpay" || txt.includes("kpay qr")) return "KPay";
  if (txt.includes("bank")) return "BankTransfer";
  if (txt.includes("credit") || txt.includes("debit") || txt.includes("card")) return "Card";
  return "Card";
}

export function Checkout({
  onBack,
  storeName,
  vendorId,
  vendorName,
  accountUser = null,
  onOrderPlacedSuccess,
}: CheckoutProps) {
  const navigate = useNavigate();
  const location = useLocation();
  const { items, totalPrice, clearCart } = useCart();
  const checkoutMiniCacheKey = useMemo(
    () => `checkout-mini-summary:${location.pathname}`,
    [location.pathname]
  );
  const initialMiniSummaryCache = useMemo(
    () => readCheckoutMiniSummaryCache(checkoutMiniCacheKey),
    [checkoutMiniCacheKey]
  );
  const { user: authUser } = useAuth();
  const migoo = getMigooCustomerFromStorage();

  /**
   * Customer id + profile: prefer vendor `accountUser` (same as `/profile/addresses`),
   * then Supabase session, then raw migoo-user — so `/customers/:id/addresses` matches saved addresses.
   */
  const effectiveUser = useMemo(() => {
    const fromVendor = resolveUserIdFromRecord(accountUser);
    const fromAuth = authUser?.id ? String(authUser.id) : null;
    const fromMigoo = migoo?.id ? String(migoo.id) : null;
    const id = fromVendor || fromAuth || fromMigoo;
    if (!id) return null;
    return {
      id,
      email: accountUser?.email ?? authUser?.email ?? migoo?.email ?? "",
      name: accountUser?.name ?? authUser?.name ?? migoo?.name ?? "",
      phone: accountUser?.phone ?? authUser?.phone ?? migoo?.phone ?? "",
    };
  }, [
    accountUser?.id,
    accountUser?.userId,
    accountUser?.email,
    accountUser?.name,
    accountUser?.phone,
    authUser?.id,
    authUser?.email,
    authUser?.name,
    authUser?.phone,
    migoo?.id,
    migoo?.email,
    migoo?.name,
    migoo?.phone,
  ]);

  const initialSummarySnapshot = useMemo(() => {
    if (typeof window === "undefined") return null;
    const path = window.location.pathname;
    if (!/\/summary$/.test(path)) return null;
    return (
      readCheckoutSummarySnapshot(`checkout-summary:${path}`) ||
      readCheckoutSummarySnapshot(CHECKOUT_LATEST_SUMMARY_KEY)
    );
  }, []);

  const [step, setStep] = useState<"checkout" | "success">(
    initialSummarySnapshot ? "success" : "checkout"
  );
  const [loading, setLoading] = useState(false);
  const [summaryResolving, setSummaryResolving] = useState(
    () => /\/summary$/.test(location.pathname) && !initialSummarySnapshot
  );
  const pwaFinalizeInFlightRef = useRef<Set<string>>(new Set());
  const summaryPath = useMemo(() => {
    const path = location.pathname;
    if (path.endsWith("/summary") || path === "/summary" || path === "/store/summary") {
      return path;
    }
    if (path === "/checkout") return "/summary";
    if (path === "/store/checkout") return "/store/summary";
    return path.replace(/\/checkout(?:\/success)?$/, "/summary");
  }, [location.pathname]);
  const summarySnapshotStorageKey = useMemo(
    () => `checkout-summary:${summaryPath}`,
    [summaryPath]
  );
  const summaryQueryOrderId = useMemo(() => {
    const params = new URLSearchParams(location.search);
    return (
      params.get("merch_order_id") ||
      params.get("merchOrderId") ||
      params.get("order") ||
      params.get("orderNumber") ||
      ""
    ).trim();
  }, [location.search]);
  const pwaPendingContext = useMemo(() => {
    try {
      const raw = localStorage.getItem(KPAY_PWA_PENDING_STORAGE_KEY);
      if (!raw) return null;
      return JSON.parse(raw) as KPayPwaPendingContext;
    } catch {
      return null;
    }
  }, [location.pathname, location.search]);

  // Shipping Form State - Pre-fill from saved addresses
  const [shippingInfo, setShippingInfo] = useState({
    fullName: initialSummarySnapshot?.shippingInfo?.fullName || "",
    email: initialSummarySnapshot?.shippingInfo?.email || "",
    phone: initialSummarySnapshot?.shippingInfo?.phone || "",
    address: initialSummarySnapshot?.shippingInfo?.address || "",
    city: initialSummarySnapshot?.shippingInfo?.city || "",
    zipCode: initialSummarySnapshot?.shippingInfo?.zipCode || "",
    country: initialSummarySnapshot?.shippingInfo?.country || "",
  });

  // Pre-fill from cached addresses (same key as VendorStoreView) + API — matches main marketplace behavior
  useEffect(() => {

    const applyAddress = (
      addr: any,
      profile: { id: string; email: string; name: string; phone: string }
    ) => {
      const line1 = typeof addr?.addressLine1 === "string" ? addr.addressLine1 : "";
      const line2 = typeof addr?.addressLine2 === "string" ? addr.addressLine2 : "";
      const combined = [line1, line2].filter(Boolean).join(", ");
      setShippingInfo({
        fullName: (typeof addr?.recipientName === "string" ? addr.recipientName : "") || profile.name || "",
        email: profile.email || "",
        phone: (typeof addr?.phone === "string" ? addr.phone : "") || profile.phone || "",
        address: combined || line1,
        city: typeof addr?.city === "string" ? addr.city : "",
        zipCode: typeof addr?.zipCode === "string" ? addr.zipCode : "",
        country: typeof addr?.country === "string" ? addr.country : "",
      });
    };

    const loadUserAddresses = async () => {
      const eu = effectiveUser;
      if (!eu?.id) {
        return;
      }

      const storageKey = `migoo-shipping-addresses-${eu.id}`;
      try {
        const cached = localStorage.getItem(storageKey);
        if (cached) {
          const parsed = JSON.parse(cached) as unknown;
          if (Array.isArray(parsed) && parsed.length > 0) {
            const defaultAddress = parsed.find((a: any) => a?.isDefault) || parsed[0];
            applyAddress(defaultAddress, eu);
          }
        }
      } catch (e) {
        console.warn("Checkout: could not read address cache", e);
      }

      try {
        const response = await fetch(
          `https://${projectId}.supabase.co/functions/v1/make-server-16010b6f/customers/${eu.id}/addresses`,
          {
            headers: {
              Authorization: `Bearer ${publicAnonKey}`,
            },
          }
        );

        if (response.ok) {
          const data = await response.json();
          const addresses = data.addresses || [];

          if (addresses.length > 0) {
            try {
              localStorage.setItem(storageKey, JSON.stringify(addresses));
            } catch {
              /* ignore quota */
            }
            const defaultAddress = addresses.find((addr: any) => addr.isDefault) || addresses[0];
            applyAddress(defaultAddress, eu);
            return;
          }
        }
      } catch (error) {
        console.error("Failed to load addresses from database:", error);
      }

      setShippingInfo((prev) => ({
        ...prev,
        fullName: prev.fullName || eu.name || "",
        email: prev.email || eu.email || "",
        phone: prev.phone || eu.phone || "",
      }));
    };

    if (effectiveUser?.id) {
      void loadUserAddresses();
    }
  }, [effectiveUser]);

  // Order Note
  const [orderNote, setOrderNote] = useState("");

  const [paymentMethod, setPaymentMethod] = useState<"Card" | "KPay" | "KPay-PWA" | "BankTransfer">(
    initialSummarySnapshot?.paymentMethod || "KPay-PWA"
  );
  const [kpayPwaLoading, setKpayPwaLoading] = useState(false);
  const [paymentInfo, setPaymentInfo] = useState({
    cardNumber: "",
    cardName: "",
    expiryDate: "",
    cvv: ""
  });
  const [kpaySession, setKpaySession] = useState<KPaySession | null>(null);
  const [kpayLoading, setKpayLoading] = useState(false);
  // True only after KBZ has actually confirmed the payment via webhook
  // (delivered to the public `kpay-webhook` Edge Function and pushed to us
  // through Supabase Realtime). Until then the "I've Completed Payment"
  // button stays disabled.
  const [kpayWebhookConfirmed, setKpayWebhookConfirmed] = useState(false);
  const kpayAutoGenerateTriggeredRef = useRef(false);
  const hasNativeKPayQr = Boolean(kpaySession?.qrImageUrl || kpaySession?.qrContent);
  const canSubmitKPayOrder = Boolean(kpaySession?.merchantOrderId && hasNativeKPayQr);
  const kpayQrDisplayUrl = kpaySession?.qrImageUrl
    ? kpaySession.qrImageUrl
    : "";

  // Temporary: card checkout is hidden, so migrate stale cached "Card" state.
  useEffect(() => {
    if (paymentMethod === "Card") {
      setPaymentMethod("KPay-PWA");
    }
  }, [paymentMethod]);

  // Reset webhook confirmation whenever a new QR is generated (different order id).
  useEffect(() => {
    setKpayWebhookConfirmed(false);
  }, [kpaySession?.merchantOrderId]);

  // Subscribe to Supabase Realtime for the kv row that the public webhook updates.
  //
  // Flow when KBZ pays:
  //   1. KBZ POSTs the success notification to our public `kpay-webhook` Edge Function
  //      (that function is deployed with --no-verify-jwt so KBZ can reach it without
  //      a Supabase auth header).
  //   2. The webhook handler upserts kv_store_16010b6f.value at key
  //      `kpay_txn:{merchantOrderId}` with status="paid".
  //   3. Postgres broadcasts the UPDATE through the supabase_realtime publication.
  //   4. This subscription receives the new row, parses status, and flips
  //      `kpayWebhookConfirmed` to true — which enables the submit button below.
  //
  // Realtime plus short-interval status refresh (see comment above `waitForKPayPayload`).
  useEffect(() => {
    const orderId = kpaySession?.merchantOrderId;
    if (!orderId || paymentMethod !== "KPay") return;
    const key = `kpay_txn:${orderId}`;
    let cancelled = false;
    let pollTimer: ReturnType<typeof setInterval> | undefined;

    const applyPaidFromKvValue = (value: unknown) => {
      const status = typeof value === "object" && value !== null ? (value as { status?: string }).status : undefined;
      if (status === "paid") setKpayWebhookConfirmed(true);
    };

    const refreshFromServer = async () => {
      try {
        const session = await fetchKPaySessionStatus({
          projectId,
          publicAnonKey,
          merchantOrderId: orderId,
        });
        if (cancelled) return;
        setKpaySession((prev) => (prev ? { ...prev, ...session } : session));
        if (session.status === "paid") {
          setKpayWebhookConfirmed(true);
          if (pollTimer) {
            clearInterval(pollTimer);
            pollTimer = undefined;
          }
        }
      } catch {
        // Transient errors — next tick or Realtime may still deliver.
      }
    };

    void refreshFromServer();

    pollTimer = setInterval(() => {
      void refreshFromServer();
    }, 1500);

    const channel = supabase
      .channel(`kpay-txn-${orderId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "kv_store_16010b6f",
          filter: `key=eq.${key}`,
        },
        (payload: any) => {
          applyPaidFromKvValue(payload?.new?.value);
        },
      )
      .subscribe();

    return () => {
      cancelled = true;
      if (pollTimer) clearInterval(pollTimer);
      void supabase.removeChannel(channel);
    };
  }, [kpaySession?.merchantOrderId, paymentMethod]);

  // Coupon State with localStorage persistence
  const [couponCode, setCouponCode] = useState("");
  const [appliedCoupon, setAppliedCoupon] = useState<any>(() => {
    const saved = localStorage.getItem('migoo-applied-coupon');
    return saved ? JSON.parse(saved) : null;
  });
  const [couponError, setCouponError] = useState("");
  const [couponLoading, setCouponLoading] = useState(false);
  
  // Persist appliedCoupon to localStorage
  useEffect(() => {
    if (appliedCoupon) {
      localStorage.setItem('migoo-applied-coupon', JSON.stringify(appliedCoupon));
    } else {
      localStorage.removeItem('migoo-applied-coupon');
    }
  }, [appliedCoupon]);
  
  // Calculate final total with discount
  const discountAmount = appliedCoupon?.campaign?.discountAmount || 0;
  const finalTotal = Math.max(totalPrice - discountAmount, 0);

  const [orderNumber, setOrderNumber] = useState(initialSummarySnapshot?.orderNumber || "");
  const [confirmedItems, setConfirmedItems] = useState<any[]>(initialSummarySnapshot?.items || []);
  const [confirmedTotal, setConfirmedTotal] = useState(initialSummarySnapshot?.total || 0);
  const [confirmedOrderNote, setConfirmedOrderNote] = useState(initialSummarySnapshot?.orderNote || "");
  const [confirmedCoupon, setConfirmedCoupon] = useState<any>(initialSummarySnapshot?.coupon || null);
  const [confirmedDiscount, setConfirmedDiscount] = useState(initialSummarySnapshot?.discount || 0);
  const [miniSummaryItems, setMiniSummaryItems] = useState<any[]>(
    () => (Array.isArray(initialMiniSummaryCache?.items) ? initialMiniSummaryCache!.items : [])
  );
  const [miniSummaryTotal, setMiniSummaryTotal] = useState<number>(
    () => Number(initialMiniSummaryCache?.total || 0)
  );

  useEffect(() => {
    if (Array.isArray(items) && items.length > 0) {
      setMiniSummaryItems(items);
      setMiniSummaryTotal(Number(totalPrice || 0));
      try {
        localStorage.setItem(
          checkoutMiniCacheKey,
          JSON.stringify({
            items,
            total: Number(totalPrice || 0),
            savedAt: new Date().toISOString(),
          } satisfies CheckoutMiniSummaryCache),
        );
      } catch {
        /* ignore localStorage quota/private mode issues */
      }
    }
  }, [items, totalPrice, checkoutMiniCacheKey]);

  const summaryDisplayItems = items.length > 0 ? items : miniSummaryItems;
  const summaryDisplayTotal = items.length > 0 ? totalPrice : miniSummaryTotal;

  useEffect(() => {
    const onSummaryRoute = /\/summary$/.test(location.pathname);
    if (!onSummaryRoute) return;
    setSummaryResolving(true);
    try {
      const expectedOrderId =
        summaryQueryOrderId ||
        (typeof pwaPendingContext?.merchantOrderId === "string"
          ? pwaPendingContext.merchantOrderId
          : "");
      const snapshot =
        readCheckoutSummarySnapshot(summarySnapshotStorageKey) ||
        readCheckoutSummarySnapshot(CHECKOUT_LATEST_SUMMARY_KEY);
      if (!snapshot) return;
      // When returning from a fresh PWA session, never hydrate an old cached order.
      if (expectedOrderId && String(snapshot.orderNumber || "").trim() !== expectedOrderId) {
        return;
      }
      setOrderNumber(snapshot.orderNumber);
      setConfirmedItems(snapshot.items);
      setConfirmedTotal(Number(snapshot.total) || 0);
      setConfirmedOrderNote(snapshot.orderNote || "");
      setConfirmedCoupon(snapshot.coupon || null);
      setConfirmedDiscount(Number(snapshot.discount) || 0);
      setShippingInfo(snapshot.shippingInfo || shippingInfo);
      setPaymentMethod(normalizeCheckoutPaymentMethod(snapshot.paymentMethod));
      setStep("success");
      setLoading(false);
    } catch {
      // ignore corrupted snapshot and fall back to normal checkout
    } finally {
      setSummaryResolving(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.pathname, summarySnapshotStorageKey, summaryQueryOrderId, pwaPendingContext]);

  useEffect(() => {
    const onSummaryRoute = /\/summary$/.test(location.pathname);
    if (!onSummaryRoute) return;
    if (step === "success" && confirmedItems.length > 0 && orderNumber) return;
    setSummaryResolving(true);
    let cancelled = false;
    (async () => {
      let currentOrderId = "";
      try {
        const orderId =
          summaryQueryOrderId ||
          (typeof pwaPendingContext?.merchantOrderId === "string"
            ? pwaPendingContext.merchantOrderId
            : "");
        currentOrderId = orderId;
        let response: Response | null = null;
        if (orderId) {
          const orderEndpoint = `https://${projectId}.supabase.co/functions/v1/make-server-16010b6f/orders/${encodeURIComponent(orderId)}`;
          response = await fetch(orderEndpoint, {
            headers: { Authorization: `Bearer ${publicAnonKey}` },
          });
          if (
            response.status === 404 &&
            pwaPendingContext?.merchantOrderId === orderId &&
            pwaPendingContext?.draftOrder
          ) {
            const session = await fetchKPaySessionStatus({
              projectId,
              publicAnonKey,
              merchantOrderId: orderId,
            });
            if (session.status === "paid") {
              if (pwaFinalizeInFlightRef.current.has(orderId)) {
                return;
              }
              pwaFinalizeInFlightRef.current.add(orderId);
              const d = pwaPendingContext.draftOrder;
              const finalizePayload: any = {
                orderNumber: orderId,
                userId: d.userId ?? null,
                customer: d.customerName || d.shippingInfo?.fullName || "",
                customerName: d.customerName || d.shippingInfo?.fullName || "",
                email: d.email || "",
                phone: d.phone || d.shippingInfo?.phone || "",
                status: "pending",
                paymentStatus: "paid",
                paymentMethod: "KPay (PWA)",
                total: Number(d.total || 0),
                subtotal: Number(d.subtotal || 0),
                discount: Number(d.discount || 0),
                date: new Date().toISOString(),
                vendor: d.vendor || storeName,
                vendorId: d.vendorId || undefined,
                couponCode: d.couponCode || null,
                couponId: d.couponId || null,
                couponDiscount: Number(d.discount || 0),
                items: Array.isArray(d.items) ? d.items : [],
                address: d.shippingInfo?.address || "",
                city: d.shippingInfo?.city || "",
                zipCode: d.shippingInfo?.zipCode || "",
                country: d.shippingInfo?.country || "",
                shippingAddress: [
                  d.shippingInfo?.address || "",
                  d.shippingInfo?.city || "",
                  d.shippingInfo?.zipCode || "",
                  d.shippingInfo?.country || "",
                ].filter(Boolean).join(", "),
                notes: d.notes || "",
                kpay: {
                  method: "pwa",
                  merchantOrderId: orderId,
                  prepayId: session.prepayId || pwaPendingContext.prepayId || "",
                  status: "paid",
                  providerStatus: session.providerStatus || "paid",
                  payUrl: session.payUrl || "",
                },
              };
              const createResponse = await fetch(`https://${projectId}.supabase.co/functions/v1/make-server-16010b6f/orders`, {
                method: "POST",
                headers: {
                  "Content-Type": "application/json",
                  Authorization: `Bearer ${publicAnonKey}`,
                },
                body: JSON.stringify(finalizePayload),
              });
              if (!createResponse.ok) {
                throw new Error(`PWA finalize create failed: HTTP ${createResponse.status}`);
              }
              response = await fetch(orderEndpoint, {
                headers: { Authorization: `Bearer ${publicAnonKey}` },
              });
              pwaFinalizeInFlightRef.current.delete(orderId);
            }
          }
        } else if (effectiveUser?.id) {
          // KBZ app may return to /summary without carrying merch_order_id to SPA.
          // In that case, render the latest order for this signed-in customer.
          const orderEndpoint = `https://${projectId}.supabase.co/functions/v1/make-server-16010b6f/user/${encodeURIComponent(effectiveUser.id)}/orders`;
          response = await fetch(orderEndpoint, {
            headers: { Authorization: `Bearer ${publicAnonKey}` },
          });
        } else {
          return;
        }
        if (!response) return;
        if (!response.ok) return;
        const data = (await response.json()) as { order?: any; orders?: any[] };
        const o = orderId
          ? data?.order
          : Array.isArray(data?.orders) && data.orders.length > 0
            ? data.orders[0]
            : null;
        if (!o || cancelled) return;
        const itemsFromOrder = Array.isArray(o.items)
          ? o.items.map((it: any, idx: number) => ({
              id: String(it?.id ?? idx),
              sku: String(it?.sku ?? it?.name ?? "Item"),
              quantity: Number(it?.quantity ?? 1) || 1,
              price: Number(it?.price ?? 0) || 0,
              image: typeof it?.image === "string" ? it.image : "",
            }))
          : [];
        if (!itemsFromOrder.length) return;
        const total = Number(o?.total ?? 0) || 0;
        const discount = Number(o?.discount ?? 0) || 0;
        const coupon =
          typeof o?.couponCode === "string" && o.couponCode.trim()
            ? { campaign: { code: o.couponCode } }
            : null;
        const shipping = {
          fullName: String(o?.customerName ?? o?.customer ?? shippingInfo.fullName ?? ""),
          email: String(o?.email ?? shippingInfo.email ?? ""),
          phone: String(o?.phone ?? shippingInfo.phone ?? ""),
          address: String(o?.address ?? shippingInfo.address ?? ""),
          city: String(o?.city ?? shippingInfo.city ?? ""),
          zipCode: String(o?.zipCode ?? shippingInfo.zipCode ?? ""),
          country: String(o?.country ?? shippingInfo.country ?? ""),
        };
        setOrderNumber(
          String(
            o?.orderNumber ??
              orderId ??
              o?.id ??
              ""
          )
        );
        setConfirmedItems(itemsFromOrder);
        setConfirmedTotal(total);
        setConfirmedOrderNote(String(o?.notes ?? ""));
        setConfirmedCoupon(coupon);
        setConfirmedDiscount(discount);
        setShippingInfo(shipping);
        setPaymentMethod(normalizeCheckoutPaymentMethod(o?.paymentMethod));
        setStep("success");
        setLoading(false);
        try {
          const snapshot: CheckoutSummarySnapshot = {
            orderNumber: String(
              o?.orderNumber ??
                orderId ??
                o?.id ??
                ""
            ),
            items: itemsFromOrder,
            total,
            orderNote: String(o?.notes ?? ""),
            coupon,
            discount,
            shippingInfo: shipping,
            paymentMethod: normalizeCheckoutPaymentMethod(o?.paymentMethod),
            savedAt: new Date().toISOString(),
          };
          localStorage.setItem(summarySnapshotStorageKey, JSON.stringify(snapshot));
          localStorage.setItem(CHECKOUT_LATEST_SUMMARY_KEY, JSON.stringify(snapshot));
        } catch {
          /* ignore snapshot write failure */
        }
      } catch {
        // leave checkout as-is when server read fails
      } finally {
        if (currentOrderId) {
          pwaFinalizeInFlightRef.current.delete(currentOrderId);
        }
        if (!cancelled) setSummaryResolving(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [
    location.pathname,
    summaryQueryOrderId,
    pwaPendingContext,
    effectiveUser?.id,
    step,
    confirmedItems.length,
    orderNumber,
    shippingInfo,
    summarySnapshotStorageKey,
  ]);

  if (/\/summary$/.test(location.pathname) && step !== "success" && summaryResolving) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 p-4">
        <div className="text-center space-y-3">
          <Loader2 className="mx-auto h-10 w-10 animate-spin text-slate-600" />
          <p className="text-sm text-slate-600">Loading latest order summary...</p>
        </div>
      </div>
    );
  }

  // Apply coupon code
  const handleApplyCoupon = async () => {
    if (!couponCode.trim()) {
      setCouponError("Please enter a coupon code");
      return;
    }

    setCouponLoading(true);
    setCouponError("");

    try {
      const code = couponCode.trim().toUpperCase();
      
      const response = await fetch(
        `https://${projectId}.supabase.co/functions/v1/make-server-16010b6f/campaigns/validate`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${publicAnonKey}`,
          },
          body: JSON.stringify({
            code: code, // 🔧 FIX: Send uppercased code to match database
            cartTotal: totalPrice,
            cartItems: items.map(item => ({
              id: item.id,
              sku: item.sku || item.id,
              price: item.price,
              quantity: item.quantity
            }))
          }),
        }
      );

      const data = await response.json();

      if (data.valid) {
        setAppliedCoupon(data);
        setCouponError("");
      } else {
        console.error('❌ Coupon validation failed:', data.error);
        setCouponError(data.error || "Invalid coupon code");
        setAppliedCoupon(null);
      }
    } catch (error) {
      console.error("❌ Error applying coupon:", error);
      setCouponError("Failed to apply coupon. Please try again.");
      setAppliedCoupon(null);
    } finally {
      setCouponLoading(false);
    }
  };

  // Remove applied coupon
  const handleRemoveCoupon = () => {
    setAppliedCoupon(null);
    setCouponCode("");
    setCouponError("");
  };

  const resolveOrderEmail = () =>
    (shippingInfo.email?.trim() || effectiveUser?.email?.trim() || "");

  const getMissingRequiredFields = () => {
    const missingFields: string[] = [];
    if (!shippingInfo.fullName.trim()) missingFields.push("Full Name");
    if (!shippingInfo.phone.trim()) missingFields.push("Phone Number");
    if (!resolveOrderEmail()) missingFields.push("Email");
    if (!shippingInfo.address.trim()) missingFields.push("Address");
    if (!shippingInfo.city.trim()) missingFields.push("City");
    if (!shippingInfo.zipCode.trim()) missingFields.push("Postal Code");
    if (!shippingInfo.country.trim()) missingFields.push("Country/Region");
    if (!orderNote.trim()) missingFields.push("Delivery Notes");
    return missingFields;
  };

  const handleSelectKPayQr = () => {
    const missingFields = getMissingRequiredFields();
    if (missingFields.length > 0) {
      toast.error(`Please fill all required fields first: ${missingFields.join(", ")}`);
      return;
    }
    setPaymentMethod("KPay");
  };

  const handleSelectKPayPwa = () => {
    const missingFields = getMissingRequiredFields();
    if (missingFields.length > 0) {
      toast.error(`Please fill all required fields first: ${missingFields.join(", ")}`);
      return;
    }
    setPaymentMethod("KPay-PWA");
  };

  // PWA flow: precreate with trade_type=PWAAPP and redirect the customer's mobile
  // browser to KBZ's PWA page. KBZ then opens the KBZPay app on the phone for payment
  // and finally redirects back to our /kpay/return page with prepay_id + merch_order_id.
  // The current route + cart context is persisted to localStorage so the return page
  // can finish placing the order once payment is confirmed.
  const handleStartKPayPwa = async () => {
    try {
      const missingFields = getMissingRequiredFields();
      if (missingFields.length > 0) {
        toast.error(`Please fill all required fields first: ${missingFields.join(", ")}`);
        return;
      }
      if (finalTotal <= 0) {
        toast.error("Invalid amount for KPay payment");
        return;
      }
      const orderEmail = resolveOrderEmail();
      if (!orderEmail) {
        toast.error("Please enter your email address");
        return;
      }
      setKpayPwaLoading(true);
      const merchantOrderId = buildMerchantOrderId("ORD");
      const pwaSession = await startKPayPwa({
        projectId,
        publicAnonKey,
        merchantOrderId,
        amount: finalTotal,
        currency: "MMK",
        title: `Order ${merchantOrderId}`,
      });
      // Persist enough context for the /kpay/return route to finalize the order.
      try {
        // Fresh PWA flow should not reuse a previous order-summary snapshot.
        localStorage.removeItem(`checkout-summary:${summaryPath}`);
        localStorage.removeItem(CHECKOUT_LATEST_SUMMARY_KEY);
        localStorage.setItem(
          KPAY_PWA_PENDING_STORAGE_KEY,
          JSON.stringify({
            merchantOrderId: pwaSession.merchantOrderId,
            prepayId: pwaSession.prepayId,
            amount: finalTotal,
            currency: "MMK",
            redirectedAt: new Date().toISOString(),
            originPath: typeof window !== "undefined" ? window.location.pathname + window.location.search : "",
            draftOrder: {
              userId: effectiveUser?.id ?? null,
              customerName: shippingInfo.fullName,
              email: orderEmail,
              phone: shippingInfo.phone,
              subtotal: totalPrice,
              total: finalTotal,
              discount: discountAmount,
              couponCode: appliedCoupon?.campaign?.code || null,
              couponId: appliedCoupon?.campaign?.id || null,
              notes: orderNote,
              vendor: vendorName || storeName,
              vendorId: vendorId || undefined,
              shippingInfo: { ...shippingInfo },
              items: items.map((item) => ({
                productId: item.productId || item.id,
                sku: item.sku,
                name: item.name || item.sku,
                quantity: item.quantity,
                price: item.price,
                image: item.image,
                vendor: vendorId || item.vendor || item.vendorId,
                vendorId: vendorId || item.vendor || item.vendorId,
                commissionRate:
                  typeof item.commissionRate === "number" && Number.isFinite(item.commissionRate)
                    ? item.commissionRate
                    : undefined,
              })),
            },
          }),
        );
      } catch {
        // localStorage might be blocked in private mode — non-fatal; the user can
        // still complete the payment, they'll just lose the auto-finalize affordance.
      }
      if (!pwaSession.redirectUrl) {
        toast.error("KBZ did not return a redirect URL");
        return;
      }
      // Always open KBZ hosted PWA page first. That page shows the user-facing
      // "Open KBZPay app" confirmation and avoids browser/package mismatches that
      // can jump straight to Play Store.
      const redirectUrl = pwaSession.redirectUrl;
      window.location.href = redirectUrl;
    } catch (error: any) {
      toast.error(error?.message || "Failed to start KPay PWA payment");
    } finally {
      setKpayPwaLoading(false);
    }
  };

  const handleGenerateKPayQr = async () => {
    try {
      const missingFields = getMissingRequiredFields();
      if (missingFields.length > 0) {
        toast.error(`Please fill all required fields first: ${missingFields.join(", ")}`);
        return;
      }
      if (finalTotal <= 0) {
        toast.error("Invalid amount for KPay payment");
        return;
      }
      setKpayLoading(true);
      const merchantOrderId = buildMerchantOrderId("ORD");
      const session = await createKPayQrSession({
        projectId,
        publicAnonKey,
        merchantOrderId,
        amount: finalTotal,
        currency: "MMK",
        title: `Order ${merchantOrderId}`,
      });
      setKpaySession(session);
      if (session.status === "failed") {
        toast.error(`KPay precreate failed: ${session.providerStatus || session.debug?.providerCode || "UNKNOWN"}`, {
          duration: 8000,
        });
        return;
      }
      toast.success("KPay QR generated");
      if (!session.qrImageUrl && !session.qrContent && !session.payUrl) {
        toast.info("Waiting for KPay QR from provider...");
        await waitForKPayPayload(merchantOrderId);
      }
    } catch (error: any) {
      toast.error(error?.message || "Failed to generate KPay QR");
    } finally {
      setKpayLoading(false);
    }
  };

  useEffect(() => {
    if (paymentMethod !== "KPay") {
      kpayAutoGenerateTriggeredRef.current = false;
      return;
    }
    if (kpayAutoGenerateTriggeredRef.current) return;
    if (kpayLoading || kpayWebhookConfirmed || kpaySession?.status === "paid" || kpaySession?.merchantOrderId) return;
    if (finalTotal <= 0) return;
    if (getMissingRequiredFields().length > 0) return;

    kpayAutoGenerateTriggeredRef.current = true;
    void handleGenerateKPayQr();
  }, [
    paymentMethod,
    kpayLoading,
    kpayWebhookConfirmed,
    kpaySession?.status,
    kpaySession?.merchantOrderId,
    finalTotal,
    shippingInfo,
    orderNote,
    effectiveUser?.email,
  ]);

  // After a QR is issued, payment completion is written to KV by the public `kpay-webhook`
  // (and optionally refreshed via `queryorder` in `getKPayStatus`). We still subscribe to
  // Realtime, but we also poll `fetchKPaySessionStatus` because: (a) the webhook can land
  // before the browser subscription is ready, (b) Realtime delivery can fail (RLS, pub,
  // plan limits), and (c) polling reads the same KV row the webhook updates.

  const waitForKPayPayload = async (merchantOrderId: string) => {
    const maxAttempts = 24;
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      try {
        const session = await fetchKPaySessionStatus({
          projectId,
          publicAnonKey,
          merchantOrderId,
        });
        setKpaySession((prev) => (prev ? { ...prev, ...session } : session));
        if (session.qrImageUrl || session.qrContent || session.payUrl) {
          if (attempt > 0) toast.success("KPay QR is ready");
          return;
        }
      } catch {
        // Ignore transient provider/API errors while polling.
      }
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
  };

  const handlePlaceOrder = async (e?: React.FormEvent | React.MouseEvent) => {
    e?.preventDefault();

    const missingFields = getMissingRequiredFields();
    if (missingFields.length > 0) {
      toast.error(`Please fill all required fields first: ${missingFields.join(", ")}`);
      return;
    }
    const orderEmail = resolveOrderEmail();

    setLoading(true);

    let latestKpaySession = kpaySession;

    if (paymentMethod === "Card") {
      if (!paymentInfo.cardNumber || !paymentInfo.cardName || !paymentInfo.expiryDate || !paymentInfo.cvv) {
        toast.error("Please fill in all card details");
        setLoading(false);
        return;
      }

      const cardNumberClean = paymentInfo.cardNumber.replace(/\s/g, "");
      if (cardNumberClean.length < 13 || cardNumberClean.length > 19) {
        toast.error("Invalid card number");
        setLoading(false);
        return;
      }
      if (!/^\d{2}\/\d{2}$/.test(paymentInfo.expiryDate)) {
        toast.error("Invalid expiry date format (MM/YY)");
        setLoading(false);
        return;
      }
      if (paymentInfo.cvv.length < 3 || paymentInfo.cvv.length > 4) {
        toast.error("Invalid CVV");
        setLoading(false);
        return;
      }

      toast.info("Processing payment...", { duration: 2000 });
      await new Promise((resolve) => setTimeout(resolve, 2000));
      toast.success("💳 Payment Successful!", { duration: 3000 });
    } else if (paymentMethod === "KPay") {
      if (!canSubmitKPayOrder) {
        toast.error("KPay QR payload is missing. Please regenerate QR first");
        setLoading(false);
        return;
      }
      if (!kpayWebhookConfirmed) {
        toast.error("Payment not confirmed yet. Please complete the payment in KBZPay first.");
        setLoading(false);
        return;
      }
      // Webhook from KBZ has confirmed the payment via Supabase Realtime,
      // so we can place the order with paymentStatus: "paid".
      latestKpaySession = { ...(kpaySession || {}), status: "paid" } as any;
    } else {
      toast.info("🚀 Coming Soon! This payment method will be available soon.", { duration: 3000 });
      setLoading(false);
      return;
    }

    // 🔥 SAVE items and total BEFORE clearing cart
    setConfirmedItems(items);
    setConfirmedTotal(finalTotal);
    setConfirmedOrderNote(orderNote);
    setConfirmedCoupon(appliedCoupon);
    setConfirmedDiscount(discountAmount);

    // Generate order number
    const orderNum =
      paymentMethod === "KPay" && latestKpaySession?.merchantOrderId
        ? latestKpaySession.merchantOrderId
        : `ORD-${Date.now().toString(36).toUpperCase()}`;
    setOrderNumber(orderNum);

    try {
      // 🔥 Save order to backend with vendor information
      const orderData: any = {
        orderNumber: orderNum,
        userId: effectiveUser?.id ?? null,
        customer: shippingInfo.fullName,
        customerName: shippingInfo.fullName,
        email: orderEmail,
        phone: shippingInfo.phone,
        status: paymentMethod === "KPay" ? "pending_payment" : "pending",
        paymentStatus:
          paymentMethod === "KPay"
            ? (
                latestKpaySession?.providerStatus === "manual_confirm"
                  ? "pending_verification"
                  : (latestKpaySession?.status === "paid" ? "paid" : "pending")
              )
            : "paid",
        paymentMethod:
          paymentMethod === "Card"
            ? "Credit/Debit Card"
            : paymentMethod === "KPay"
            ? "KPay"
            : paymentMethod === "KPay-PWA"
            ? "KPay (PWA)"
            : "Bank Transfer",
        total: finalTotal,
        subtotal: totalPrice,
        discount: discountAmount,
        date: new Date().toISOString(),
        vendor: vendorName || storeName, // 🔥 Add vendor name to order
        // 🎫 Include coupon information for tracking
        couponCode: appliedCoupon?.campaign?.code || null,
        couponId: appliedCoupon?.campaign?.id || null,
        couponDiscount: discountAmount,
        items: items.map((item) => ({
          productId: item.productId || item.id,
          sku: item.sku,
          name: item.name || item.sku,
          quantity: item.quantity,
          price: item.price,
          image: item.image,
          vendorId: vendorId || item.vendor || item.vendorId, // 🔥 Include vendor ID from props or item
          vendor: vendorId || item.vendor || item.vendorId,
          commissionRate:
            typeof item.commissionRate === "number" && Number.isFinite(item.commissionRate)
              ? item.commissionRate
              : undefined,
        })),
        shippingAddress: [
          shippingInfo.address,
          shippingInfo.city,
          shippingInfo.zipCode?.trim(),
          shippingInfo.country,
        ]
          .filter(Boolean)
          .join(", "),
        notes: orderNote,
      };

      if (paymentMethod === "KPay") {
        orderData.kpay = {
          merchantOrderId: latestKpaySession?.merchantOrderId || orderNum,
          status: latestKpaySession?.status || "pending",
          providerStatus: latestKpaySession?.providerStatus || "",
          qrContent: latestKpaySession?.qrContent || "",
          qrImageUrl: latestKpaySession?.qrImageUrl || "",
          payUrl: latestKpaySession?.payUrl || "",
        };
      }

      // Save to backend
      const response = await fetch(
        `https://${projectId}.supabase.co/functions/v1/make-server-16010b6f/orders`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${publicAnonKey}`,
          },
          body: JSON.stringify(orderData),
        }
      );

      const result = await response.json();

      // 🚨 CHECK FOR STOCK ERRORS
      if (!response.ok || result.error === 'Insufficient stock') {
        setLoading(false);
        
        if (result.stockIssues && result.stockIssues.length > 0) {
          // Show detailed stock error
          const stockMessages = result.stockIssues.map((issue: any) => {
            if (issue.requested && issue.available !== undefined) {
              return `• ${issue.productName}: Need ${issue.requested}, only ${issue.available} in stock`;
            }
            return `• ${issue.productName}: ${issue.issue}`;
          }).join('\n');
          
          toast.error(`Cannot place order - Insufficient stock`, {
            description: stockMessages,
            duration: 8000,
          });
        } else {
          toast.error(`Failed to place order: ${result.message || result.error || 'Unknown error'}`, {
            duration: 5000,
          });
        }
        return; // Stop order process
      }

      notifyAdminOrdersUpdated("storefront-checkout-order-created");
      
      // 🔥 Save shipping address to database for future use
      if (effectiveUser?.id) {
        try {
          
          // Create address object
          const newAddress = {
            id: `addr_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
            recipientName: shippingInfo.fullName,
            phone: shippingInfo.phone,
            addressLine1: shippingInfo.address,
            city: shippingInfo.city,
            zipCode: shippingInfo.zipCode,
            isDefault: false, // User can set default later in profile
            createdAt: new Date().toISOString(),
          };
          
          // Get existing addresses
          const addressResponse = await fetch(
            `https://${projectId}.supabase.co/functions/v1/make-server-16010b6f/customers/${effectiveUser.id}/addresses`,
            {
              headers: {
                'Authorization': `Bearer ${publicAnonKey}`,
              },
            }
          );
          
          let existingAddresses: any[] = [];
          if (addressResponse.ok) {
            const addressData = await addressResponse.json();
            existingAddresses = addressData.addresses || [];
          }
          
          // Check if this address already exists
          const addressExists = existingAddresses.some(addr =>
            addr.addressLine1 === newAddress.addressLine1 &&
            addr.city === newAddress.city &&
            addr.zipCode === newAddress.zipCode
          );
          
          // Only save if it's a new address
          if (!addressExists) {
            const updatedAddresses = [...existingAddresses, newAddress];
            
            await fetch(
              `https://${projectId}.supabase.co/functions/v1/make-server-16010b6f/customers/${effectiveUser.id}/addresses`,
              {
                method: 'POST',
                headers: {
                  'Authorization': `Bearer ${publicAnonKey}`,
                  'Content-Type': 'application/json',
                },
                body: JSON.stringify({ addresses: updatedAddresses }),
              }
            );
            
          } else {
          }
        } catch (addressError) {
          console.error('❌ Failed to save address:', addressError);
          // Don't fail the order if address saving fails
        }
      }
      
      // 🎫 Track coupon usage if a coupon was applied
      
      if (appliedCoupon?.campaign?.id) {
        try {
          
          const incrementResponse = await fetch(
            `https://${projectId}.supabase.co/functions/v1/make-server-16010b6f/campaigns/${appliedCoupon.campaign.id}/increment`,
            {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${publicAnonKey}`,
              },
              body: JSON.stringify({
                revenue: discountAmount // Track the discount amount (how much customer saved)
              })
            }
          );
          
          
          if (incrementResponse.ok) {
            const incrementData = await incrementResponse.json();
          } else {
            const errorText = await incrementResponse.text();
            console.error('❌ Failed to track coupon usage:', errorText);
          }
        } catch (couponError) {
          console.error('❌ Error tracking coupon usage:', couponError);
          // Don't fail the order if coupon tracking fails
        }
      } else {
      }
    } catch (error) {
      console.error("❌ Failed to save order:", error);
      setLoading(false);
      toast.error("Failed to place order. Please try again.", {
        description: String(error),
        duration: 5000,
      });
      return; // Stop order process
    }

    const placedUserId = resolveUserIdFromRecord(effectiveUser);
    if (placedUserId) {
      onOrderPlacedSuccess?.({ userId: placedUserId });
    }

    // Simulate payment processing
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    setLoading(false);
    try {
      const snapshot: CheckoutSummarySnapshot = {
        orderNumber: orderNum,
        items: items,
        total: finalTotal,
        orderNote,
        coupon: appliedCoupon,
        discount: discountAmount,
        shippingInfo: { ...shippingInfo },
        paymentMethod,
        savedAt: new Date().toISOString(),
      };
      localStorage.setItem(summarySnapshotStorageKey, JSON.stringify(snapshot));
      localStorage.setItem(CHECKOUT_LATEST_SUMMARY_KEY, JSON.stringify(snapshot));
    } catch {
      // non-fatal; summary route can still render in-memory state
    }
    setStep("success");
    if (location.pathname !== summaryPath) {
      navigate(summaryPath, { replace: true });
    }
    
    // Clear cart after successful order
    setTimeout(() => {
      clearCart();
    }, 500);
  };

  // Success Screen
  if (step === "success") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 p-4">
        <div className="w-full max-w-2xl">
          <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-lg">
            <div className="flex items-center gap-3 border-b border-slate-200 px-6 py-5">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-emerald-500">
                <Check className="h-6 w-6 text-white" strokeWidth={2.5} />
              </div>
              <span className="text-sm font-bold uppercase tracking-wide text-emerald-700">
                Order Placed Successfully
              </span>
            </div>

            {/* Order number — neutral panel, typography-led */}
            <div className="flex items-center justify-between border-b border-slate-200 bg-slate-50/90 px-6 py-5">
              <div>
                <p className="mb-1 text-xs font-medium uppercase tracking-widest text-slate-500">Order number</p>
                <p className="font-mono text-2xl font-semibold tracking-tight text-slate-900">{orderNumber}</p>
              </div>
              <ShoppingBag className="h-8 w-8 text-slate-300" strokeWidth={1.5} aria-hidden />
            </div>

            {/* ORDER ITEMS */}
            <div className="px-6 pt-5 pb-4 border-b border-slate-200">
              <h3 className="text-sm font-semibold text-slate-700 uppercase tracking-wide mb-4">Order Items</h3>
              <div className="space-y-3">
                {confirmedItems.map((item) => (
                  <div key={item.id} className="flex items-center gap-3">
                    <div className="w-12 h-12 bg-slate-100 rounded-lg overflow-hidden flex-shrink-0">
                      {item.image ? (
                        <img src={item.image} alt={item.sku} className="w-full h-full object-cover" />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center">
                          <Package className="w-5 h-5 text-slate-400" />
                        </div>
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold text-slate-900">{item.sku}</p>
                      <p className="text-xs text-slate-500">
                        Qty: {item.quantity} × {Math.round(Number(item.price) || 0)} MMK
                      </p>
                    </div>
                    <p className="text-sm font-semibold text-slate-900">{Math.round((Number(item.price) || 0) * item.quantity)} MMK</p>
                  </div>
                ))}
              </div>
            </div>

            {/* Price Summary */}
            <div className="px-6 py-4 border-b border-slate-200">
              <div className="space-y-2.5">
                <div className="flex justify-between text-sm">
                  <span className="text-slate-600">Subtotal</span>
                  <span className="font-medium text-slate-900">{(confirmedTotal + confirmedDiscount).toFixed(0)} MMK</span>
                </div>
                
                {confirmedCoupon && confirmedDiscount > 0 && (
                  <div className="flex justify-between text-sm">
                    <span className="text-emerald-600 flex items-center gap-1.5">
                      <Tag className="w-3.5 h-3.5" />
                      Discount ({confirmedCoupon.campaign?.code})
                    </span>
                    <span className="font-medium text-emerald-600">-{confirmedDiscount.toFixed(0)} MMK</span>
                  </div>
                )}
                
                <div className="flex justify-between text-sm">
                  <span className="text-slate-600">Shipping</span>
                  <span className="font-bold text-emerald-600">FREE</span>
                </div>
                
                <div className="flex justify-between border-t border-slate-200 pt-2">
                  <span className="text-base font-semibold text-slate-900">Total</span>
                  <span className="text-xl font-semibold tabular-nums tracking-tight text-slate-900">
                    {confirmedTotal.toFixed(0)} MMK
                  </span>
                </div>
              </div>
            </div>

            {/* Coupon Applied Section */}
            {confirmedCoupon && (
              <div className="px-6 py-4 bg-emerald-50 border-b border-slate-200">
                <p className="text-xs text-slate-500 uppercase tracking-wider mb-3">Coupon Applied</p>
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-emerald-500 rounded-lg flex items-center justify-center">
                    <Tag className="w-5 h-5 text-white" strokeWidth={2} />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-slate-900">{confirmedCoupon.campaign?.name || confirmedCoupon.campaign?.code}</p>
                    <p className="text-sm text-emerald-600">
                      {confirmedCoupon.campaign?.code} · 
                      {confirmedCoupon.campaign?.discountType === 'percentage' 
                        ? ` ${confirmedCoupon.campaign?.discount}% off` 
                        : ` ${confirmedCoupon.campaign?.discount} MMK off`}
                      {confirmedDiscount > 0 && ` · Saved ${confirmedDiscount.toFixed(0)} MMK`}
                    </p>
                  </div>
                </div>
              </div>
            )}
            
            {/* Payment Method */}
            <div className="border-b border-slate-200 px-6 py-4">
              <p className="mb-3 text-xs font-medium uppercase tracking-widest text-slate-500">Payment method</p>
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-slate-200 bg-white shadow-sm">
                  <CreditCard className="h-5 w-5 text-slate-600" strokeWidth={2} />
                </div>
                <span className="text-sm font-semibold text-slate-900">
                  {summaryPaymentMethodLabel(paymentMethod)}
                </span>
              </div>
            </div>

            {/* Order Notes */}
            {confirmedOrderNote && (
              <div className="border-b border-slate-200 px-6 py-4">
                <p className="mb-2 text-xs font-medium uppercase tracking-wider text-slate-500">Order Note</p>
                <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3">
                  <p className="text-sm text-slate-800">{confirmedOrderNote}</p>
                </div>
              </div>
            )}

            {/* Shipping Information */}
            <div className="px-6 py-5">
              <div className="mb-4 flex items-center gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-slate-200 bg-white shadow-sm">
                  <MapPin className="h-5 w-5 text-slate-600" strokeWidth={2} />
                </div>
                <h3 className="text-base font-semibold text-slate-900">Shipping information</h3>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-xs text-slate-500 uppercase tracking-wider mb-1">Full Name</p>
                  <p className="text-sm font-medium text-slate-900">{shippingInfo.fullName}</p>
                </div>
                <div>
                  <p className="text-xs text-slate-500 uppercase tracking-wider mb-1">Phone</p>
                  <p className="text-sm font-medium text-slate-900">{shippingInfo.phone}</p>
                </div>
                <div>
                  <p className="text-xs text-slate-500 uppercase tracking-wider mb-1">Email</p>
                  <p className="text-sm font-medium text-slate-900 truncate">{shippingInfo.email}</p>
                </div>
                <div className="col-span-2">
                  <p className="text-xs text-slate-500 uppercase tracking-wider mb-1">Delivery Address</p>
                  <p className="text-sm font-medium text-slate-900">
                    {[shippingInfo.address, shippingInfo.city, shippingInfo.zipCode, shippingInfo.country]
                      .filter(Boolean)
                      .join(", ")}
                  </p>
                </div>
              </div>
            </div>
          </div>

          <div className="mt-4 flex justify-center">
            <Button
              className="h-11 w-64 rounded-lg bg-[#1a1d29] text-sm font-medium text-white hover:bg-slate-900"
              onClick={() => {
                onBack();
              }}
            >
              Continue Shopping
            </Button>
          </div>

          <p className="mt-4 text-center text-sm text-slate-600">
            Thanks for purchasing from <span className="font-semibold text-slate-900">{storeName}</span>
          </p>
        </div>
      </div>
    );
  }

  const checkoutInputClass =
    "h-11 bg-slate-50 border-slate-200 text-slate-900 text-sm rounded-lg focus:border-slate-900 focus:ring-0 focus-visible:ring-0 focus-visible:ring-offset-0";

  const needsEmailInput = !effectiveUser?.email;

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:px-8">
        <Button variant="ghost" className="mb-6 hover:bg-white" onClick={onBack}>
          <ChevronLeft className="mr-2 h-4 w-4" />
          Continue Shopping
        </Button>

        <div className="grid grid-cols-1 gap-8 lg:grid-cols-5">
          {/* Form — main marketplace uses 3/5 width */}
          <div className="lg:col-span-3">
            <div className="space-y-6 rounded-xl border border-slate-200 bg-white p-6 shadow-md">
              {/* Contact */}
              <div>
                <h2 className="mb-3 text-lg font-semibold text-slate-900" style={{ fontFamily: "Rubik, sans-serif" }}>
                  Contact
                </h2>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="vs-name" className="mb-1.5 block text-sm font-normal text-slate-700">
                      Full Name
                    </Label>
                    <Input
                      id="vs-name"
                      placeholder="Enter your full name"
                      value={shippingInfo.fullName}
                      onChange={(e) => setShippingInfo({ ...shippingInfo, fullName: e.target.value })}
                      className={checkoutInputClass}
                    />
                  </div>
                  <div>
                    <Label htmlFor="vs-phone" className="mb-1.5 block text-sm font-normal text-slate-700">
                      Phone Number
                    </Label>
                    <Input
                      id="vs-phone"
                      type="tel"
                      placeholder="+95 9 XXX XXX XXX"
                      value={shippingInfo.phone}
                      onChange={(e) => setShippingInfo({ ...shippingInfo, phone: e.target.value })}
                      className={checkoutInputClass}
                    />
                  </div>
                </div>
                {needsEmailInput && (
                  <div className="mt-4">
                    <Label htmlFor="vs-email" className="mb-1.5 block text-sm font-normal text-slate-700">
                      Email
                    </Label>
                    <Input
                      id="vs-email"
                      type="email"
                      placeholder="you@example.com"
                      value={shippingInfo.email}
                      onChange={(e) => setShippingInfo({ ...shippingInfo, email: e.target.value })}
                      className={checkoutInputClass}
                    />
                  </div>
                )}
              </div>

              {/* Address */}
              <div>
                <h2 className="mb-3 text-lg font-semibold text-slate-900" style={{ fontFamily: "Rubik, sans-serif" }}>
                  Address
                </h2>
                <div className="space-y-4">
                  <div>
                    <Label htmlFor="vs-address" className="mb-1.5 block text-sm font-normal text-slate-700">
                      Address
                    </Label>
                    <Input
                      id="vs-address"
                      placeholder="No. 123, Main Street"
                      value={shippingInfo.address}
                      onChange={(e) => setShippingInfo({ ...shippingInfo, address: e.target.value })}
                      className={checkoutInputClass}
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label htmlFor="vs-city" className="mb-1.5 block text-sm font-normal text-slate-700">
                        City
                      </Label>
                      <Input
                        id="vs-city"
                        placeholder="Yangon"
                        value={shippingInfo.city}
                        onChange={(e) => setShippingInfo({ ...shippingInfo, city: e.target.value })}
                        className={checkoutInputClass}
                      />
                    </div>
                    <div>
                      <div className="mb-1.5 flex items-baseline justify-between">
                        <Label htmlFor="vs-zip" className="text-sm font-normal text-slate-700">
                          Postal Code *
                        </Label>
                      </div>
                      <Input
                        id="vs-zip"
                        placeholder="11011"
                        value={shippingInfo.zipCode}
                        onChange={(e) => setShippingInfo({ ...shippingInfo, zipCode: e.target.value })}
                        className={checkoutInputClass}
                      />
                    </div>
                  </div>
                  <div>
                    <Label htmlFor="vs-country" className="mb-1.5 block text-sm font-normal text-slate-700">
                      Country/Region
                    </Label>
                    <Input
                      id="vs-country"
                      placeholder="Myanmar"
                      value={shippingInfo.country}
                      onChange={(e) => setShippingInfo({ ...shippingInfo, country: e.target.value })}
                      className={checkoutInputClass}
                    />
                  </div>
                  <div>
                    <div className="mb-1.5 flex items-baseline justify-between">
                      <Label htmlFor="vs-notes" className="text-sm font-normal text-slate-700">
                        Delivery Notes *
                      </Label>
                    </div>
                    <Textarea
                      id="vs-notes"
                      placeholder="Add delivery instructions..."
                      value={orderNote}
                      onChange={(e) => setOrderNote(e.target.value)}
                      className="min-h-[80px] resize-none rounded-lg border-slate-200 bg-slate-50 text-sm focus:border-slate-900 focus:ring-0"
                      rows={3}
                    />
                  </div>
                </div>
              </div>

              {/* Payment */}
              <div>
                <h2 className="mb-3 text-lg font-semibold text-slate-900" style={{ fontFamily: "Rubik, sans-serif" }}>
                  Payment
                </h2>
                <div className="mb-4 rounded-lg border border-blue-200 bg-gradient-to-r from-blue-50 to-indigo-50 p-3">
                  <div className="flex items-start gap-2">
                    <Shield className="mt-0.5 h-4 w-4 flex-shrink-0 text-blue-600" />
                    <div>
                      <p className="mb-0.5 text-xs font-semibold text-blue-900">💳 Prepaid Payment Required</p>
                      <p className="text-xs text-blue-800">All orders require payment completion before processing.</p>
                    </div>
                  </div>
                </div>

                <div className="space-y-3">
                  <button
                    type="button"
                    onClick={handleSelectKPayQr}
                    className={`w-full rounded-lg border p-4 text-left transition-colors ${
                      paymentMethod === "KPay"
                        ? "border-slate-900 bg-slate-50"
                        : "border-slate-200 bg-slate-50 hover:bg-slate-100"
                    }`}
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex items-center gap-3">
                        <div
                          className={`flex h-4 w-4 items-center justify-center rounded-full border-2 bg-white ${
                            paymentMethod === "KPay" ? "border-slate-900" : "border-slate-200"
                          }`}
                        >
                          {paymentMethod === "KPay" && <div className="h-2 w-2 rounded-full bg-slate-900" />}
                        </div>
                        <span className="text-sm font-medium text-slate-700">KPay (Scan QR)</span>
                      </div>
                    </div>
                  </button>
                  {paymentMethod === "KPay" && (
                    <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
                      {kpayLoading && (
                        <p className="mb-3 text-xs text-slate-500">Generating KPay QR automatically...</p>
                      )}
                      <div className="mb-4 flex justify-center">
                        <div className="relative flex h-48 w-48 items-center justify-center overflow-hidden rounded-lg border-2 border-slate-200 bg-white">
                          {kpayQrDisplayUrl ? (
                            <img src={kpayQrDisplayUrl} alt="KPay QR Code" className="h-full w-full object-contain" />
                          ) : kpaySession?.qrContent ? (
                            <QRCodeCanvas
                              value={kpaySession.qrContent}
                              size={184}
                              level="M"
                              marginSize={2}
                              imageSettings={undefined}
                            />
                          ) : (
                            <div className="px-4 text-center text-sm text-slate-500">
                              {kpaySession?.merchantOrderId
                                ? "QR not returned by provider for this order"
                                : "Preparing KPay QR for scan and pay..."}
                            </div>
                          )}
                          {(kpayWebhookConfirmed || kpaySession?.status === "paid") && (
                            <div
                              className="absolute inset-0 z-10 flex flex-col items-center justify-center rounded-md bg-white/45 text-center ring-1 ring-emerald-500/35 backdrop-blur-[1px]"
                              role="status"
                              aria-live="polite"
                            >
                              <CheckCircle
                                className="h-14 w-14 text-emerald-600/95 drop-shadow-sm"
                                strokeWidth={2}
                                aria-hidden
                              />
                              <span className="mt-2 text-lg font-semibold tracking-wide text-emerald-900 drop-shadow-sm">
                                Paid
                              </span>
                            </div>
                          )}
                        </div>
                      </div>
                      <div className="space-y-2 text-sm">
                        {kpaySession?.merchantOrderId && (
                          <div className="flex justify-between border-b border-slate-200 py-1">
                            <span className="text-slate-600">Merchant Order ID:</span>
                            <span className="font-mono font-semibold text-slate-900">{kpaySession.merchantOrderId}</span>
                          </div>
                        )}
                        <div className="flex justify-between border-b border-slate-200 py-1">
                          <span className="text-slate-600">Amount to Pay:</span>
                          <span className="font-semibold text-emerald-700">{finalTotal.toFixed(0)} MMK</span>
                        </div>
                        {kpaySession?.qrContent && !kpaySession?.qrImageUrl && (
                          <div className="rounded border border-slate-200 bg-slate-50 p-2 text-xs text-slate-600">
                            {kpayWebhookConfirmed || kpaySession?.status === "paid" ? (
                              <span className="text-emerald-800">
                                Payment received. You can place your order using the button in the order summary.
                              </span>
                            ) : (
                              <>
                                Open KBZPay app → tap <span className="font-medium">Scan QR</span> → point at the code above. Once paid, click{" "}
                                <span className="font-medium">I've Completed Payment</span>.
                              </>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                  <button
                    type="button"
                    onClick={handleSelectKPayPwa}
                    className={`w-full rounded-lg border p-4 text-left transition-colors ${
                      paymentMethod === "KPay-PWA"
                        ? "border-slate-900 bg-slate-50"
                        : "border-slate-200 bg-slate-50 hover:bg-slate-100"
                    }`}
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex items-center gap-3">
                        <div
                          className={`flex h-4 w-4 items-center justify-center rounded-full border-2 bg-white ${
                            paymentMethod === "KPay-PWA" ? "border-slate-900" : "border-slate-200"
                          }`}
                        >
                          {paymentMethod === "KPay-PWA" && <div className="h-2 w-2 rounded-full bg-slate-900" />}
                        </div>
                        <span className="text-sm font-medium text-slate-700">KPay (Mobile Browser)</span>
                      </div>
                      <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-emerald-700">
                        Recommended
                      </span>
                    </div>
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      toast.info("🚀 Coming Soon! This payment method will be available soon.", {
                        duration: 4000,
                      })
                    }
                    className="w-full rounded-lg border border-slate-200 bg-slate-50 p-4 text-left transition-colors hover:bg-slate-100"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex items-center gap-3">
                        <div className="flex h-4 w-4 items-center justify-center rounded-full border-2 border-slate-200 bg-white" />
                        <span className="text-sm font-medium text-slate-600">Bank Transfer</span>
                      </div>
                      <span className="shrink-0 rounded-md border border-amber-200 bg-amber-50 px-2 py-1 text-xs font-semibold uppercase tracking-wide text-amber-800">
                        Coming soon
                      </span>
                    </div>
                  </button>
                </div>

              </div>
            </div>
          </div>

          {/* Order Summary — 2/5 width, sticky (main marketplace layout) */}
          <div className="lg:col-span-2">
            <div className="sticky top-24 flex flex-col overflow-visible rounded-xl border border-slate-200 bg-white p-6 shadow-md">
              <div className="mb-5 flex-shrink-0">
                <h2 className="text-lg font-semibold text-slate-900" style={{ fontFamily: "Rubik, sans-serif" }}>
                  Order Summary
                </h2>
                <p className="mt-0.5 text-xs text-slate-500">{storeName}</p>
              </div>

              <div className="mb-4 space-y-4">
              <div className="space-y-3 pb-4">
                {summaryDisplayItems.map((item) => (
                  <div key={item.id} className="flex gap-3 border-b border-slate-200 pb-3">
                    <div className="h-16 w-16 shrink-0 overflow-hidden rounded-lg border border-slate-200 bg-white">
                      {item.image ? (
                        <img src={item.image} alt={item.sku} className="h-full w-full object-cover" />
                      ) : (
                        <div className="flex h-full w-full items-center justify-center">
                          <Package className="h-6 w-6 text-slate-400" />
                        </div>
                      )}
                    </div>
                    <div className="flex min-w-0 flex-1 items-start justify-between gap-2">
                      <div>
                        <p className="text-sm font-semibold text-slate-900">{item.sku}</p>
                        <p className="mt-1 text-sm font-medium text-slate-500">
                          Qty: {item.quantity} × {Math.round(parseFloat(String(item.price)))} MMK
                        </p>
                      </div>
                      <p className="text-sm font-semibold text-slate-900">
                        {Math.round(parseFloat(String(item.price)) * item.quantity)} MMK
                      </p>
                    </div>
                  </div>
                ))}
              </div>

              <div className="border-b border-slate-200 pb-4">
                <h4 className="mb-3 text-sm font-semibold text-slate-900">Coupon Code</h4>

                {!appliedCoupon ? (
                  <div>
                    <div className="flex items-center gap-2">
                      <Input
                        placeholder="ENTER COUPON CODE"
                        value={couponCode}
                        onChange={(e) => {
                          setCouponCode(e.target.value.toUpperCase());
                          setCouponError("");
                        }}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") handleApplyCoupon();
                        }}
                        disabled={couponLoading}
                        className={`${checkoutInputClass} h-10.5 flex-1 uppercase`}
                      />
                      <Button
                        type="button"
                        className="h-10.5 shrink-0 bg-slate-200 px-5 font-medium text-slate-800 hover:bg-slate-300"
                        onClick={handleApplyCoupon}
                        disabled={couponLoading || !couponCode.trim()}
                      >
                        {couponLoading ? (
                          <>
                            <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin mr-2"></div>
                            Applying...
                          </>
                        ) : (
                          "Apply"
                        )}
                      </Button>
                    </div>
                    {couponError && (
                      <p className="text-xs text-red-600 mt-2 flex items-center gap-1">
                        <XCircle className="w-3 h-3" />
                        {couponError}
                      </p>
                    )}
                  </div>
                ) : (
                  <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <CheckCircle className="w-5 h-5 text-emerald-600" />
                        <div>
                          <p className="text-sm font-bold text-emerald-700">{appliedCoupon.campaign?.code}</p>
                          <p className="text-xs text-emerald-600">
                            {appliedCoupon.campaign?.discountType === 'percentage' 
                              ? `${appliedCoupon.campaign?.discount}% off` 
                              : `${appliedCoupon.campaign?.discount} MMK off`}
                            {discountAmount > 0 && ` · You save ${discountAmount.toFixed(0)} MMK!`}
                          </p>
                        </div>
                      </div>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          setAppliedCoupon(null);
                          setCouponCode('');
                        }}
                        className="text-red-600 hover:text-red-700 hover:bg-red-50 h-8 px-2"
                      >
                        <X className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                )}
              </div>

              <div className="space-y-3 border-t border-slate-200 pt-4">
                <div className="flex justify-between text-sm">
                  <span className="text-slate-600">Subtotal</span>
                  <span className="font-semibold text-slate-900">{summaryDisplayTotal.toFixed(0)} MMK</span>
                </div>
                
                {appliedCoupon && discountAmount > 0 && (
                  <div className="flex justify-between text-sm text-emerald-600">
                    <span className="flex items-center gap-1">Discount</span>
                    <span className="font-semibold">-{discountAmount.toFixed(0)} MMK</span>
                  </div>
                )}

                <div className="flex justify-between text-sm">
                  <span className="text-slate-600">Shipping</span>
                  <span className="font-bold text-emerald-600">FREE</span>
                </div>

                <div className="flex items-center justify-between pt-1">
                  <span className="text-sm font-semibold text-slate-900">Total</span>
                  <span className="text-base font-bold text-slate-900">{finalTotal.toFixed(0)} MMK</span>
                </div>
              </div>
              </div>

              <Button
                type="button"
                className="mt-4 flex h-11 w-full shrink-0 items-center justify-center rounded-xl border-2 border-orange-500 bg-transparent text-sm font-semibold leading-normal text-slate-900 transition-all duration-300 hover:border-green-600 hover:bg-green-600 hover:text-white disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:border-orange-500 disabled:hover:bg-transparent disabled:hover:text-slate-900"
                size="lg"
                onClick={
                  paymentMethod === "KPay-PWA"
                    ? () => void handleStartKPayPwa()
                    : () => void handlePlaceOrder()
                }
                disabled={
                  loading ||
                  kpayPwaLoading ||
                  (paymentMethod === "KPay" && (!canSubmitKPayOrder || !kpayWebhookConfirmed))
                }
              >
                {loading || kpayPwaLoading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    {kpayPwaLoading ? "Redirecting to KBZPay…" : "Processing..."}
                  </>
                ) : paymentMethod === "KPay" ? (
                  kpayWebhookConfirmed ? "Place Order (Payment Confirmed)" : "I've Completed Payment"
                ) : paymentMethod === "KPay-PWA" ? (
                  `Pay with KPay · ${finalTotal.toFixed(0)} MMK`
                ) : (
                  `Pay ${finalTotal.toFixed(0)} MMK`
                )}
              </Button>
              <style>{`
                @keyframes kpayConfettiBurst {
                  0% { transform: translate(-50%, -50%) scale(0.6) rotate(0deg); opacity: 0; }
                  10% { opacity: 1; }
                  100% { transform: translate(-50%, -150px) scale(1) rotate(240deg); opacity: 0; }
                }
              `}</style>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}