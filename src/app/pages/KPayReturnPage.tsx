import { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router";
import { CheckCircle2, Loader2, XCircle } from "lucide-react";
import { Button } from "../components/ui/button";
import { projectId, publicAnonKey } from "../../../utils/supabase/info";
import {
  KPAY_PWA_PENDING_STORAGE_KEY,
  fetchKPaySessionStatus,
  type KPaySession,
} from "../utils/kpayClient";

/**
 * KBZPay PWA return landing page.
 *
 * KBZ redirects the customer's mobile browser back to this route after they finish
 * (or cancel) the payment inside the KBZPay app. KBZ appends two query params:
 *   - prepay_id
 *   - merch_order_id
 *
 * From here we:
 *   1. Read the merch_order_id from the URL.
 *   2. Recover the pending PWA session metadata that the Checkout page stored
 *      in localStorage just before redirecting the user out (so we can show the
 *      amount and link them back to the right page).
 *   3. Poll the backend `/kpay/status/:merchantOrderId` endpoint until the
 *      Supabase Realtime / KBZ webhook flips it to "paid" (or until we hit a
 *      hard timeout — KBZ's `queryorder` is sometimes 404 on the UAT relay,
 *      so we rely primarily on the webhook-driven KV record).
 *   4. Render success / pending / failed UI with a CTA back to the storefront.
 */
type ReturnState =
  | { kind: "loading" }
  | { kind: "missing_order" }
  | { kind: "ok"; session: KPaySession }
  | { kind: "error"; message: string };

const POLL_INTERVAL_MS = 2500;
const POLL_TIMEOUT_MS = 60_000;

export function KPayReturnPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const merchantOrderId = useMemo(
    () =>
      searchParams.get("merch_order_id") ||
      searchParams.get("merchOrderId") ||
      "",
    [searchParams],
  );
  const prepayIdFromUrl = useMemo(
    () => searchParams.get("prepay_id") || "",
    [searchParams],
  );

  const pendingContext = useMemo(() => {
    if (typeof window === "undefined") return null;
    try {
      const raw = localStorage.getItem(KPAY_PWA_PENDING_STORAGE_KEY);
      if (!raw) return null;
      return JSON.parse(raw) as {
        merchantOrderId?: string;
        prepayId?: string;
        amount?: number;
        currency?: string;
        redirectedAt?: string;
        originPath?: string;
      };
    } catch {
      return null;
    }
  }, []);

  const [state, setState] = useState<ReturnState>({ kind: "loading" });

  useEffect(() => {
    if (!merchantOrderId) {
      setState({ kind: "missing_order" });
      return;
    }

    let cancelled = false;
    const startedAt = Date.now();

    const pollOnce = async () => {
      try {
        const session = await fetchKPaySessionStatus({
          projectId,
          publicAnonKey,
          merchantOrderId,
        });
        if (cancelled) return;
        setState({ kind: "ok", session });

        // Once the order has reached a terminal state (paid or failed) we can stop
        // polling. While it remains pending we keep checking until the timeout.
        if (session.status === "paid" || session.status === "failed") {
          return "stop";
        }
        if (Date.now() - startedAt >= POLL_TIMEOUT_MS) {
          return "stop";
        }
      } catch (error: any) {
        if (cancelled) return;
        // Don't blow away an already-known session on a transient network error.
        setState((prev) =>
          prev.kind === "ok"
            ? prev
            : { kind: "error", message: String(error?.message || error) },
        );
      }
      return "continue";
    };

    let timer: ReturnType<typeof setTimeout> | undefined;
    const loop = async () => {
      const result = await pollOnce();
      if (cancelled) return;
      if (result !== "stop") {
        timer = setTimeout(() => void loop(), POLL_INTERVAL_MS);
      } else {
        // Once we settle into a terminal state, drop the persisted PWA context so
        // a stale local entry can't confuse a future redirect.
        try {
          localStorage.removeItem(KPAY_PWA_PENDING_STORAGE_KEY);
        } catch {
          // ignore
        }
      }
    };
    void loop();

    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [merchantOrderId]);

  const isPaid = state.kind === "ok" && state.session.status === "paid";
  const isFailed = state.kind === "ok" && state.session.status === "failed";
  const isPending = state.kind === "ok" && state.session.status === "pending";
  const summaryTarget = useMemo(() => {
    const base = "/summary";
    const params = new URLSearchParams();
    if (merchantOrderId) params.set("merch_order_id", merchantOrderId);
    if (prepayIdFromUrl) params.set("prepay_id", prepayIdFromUrl);
    const qs = params.toString();
    return qs ? `${base}?${qs}` : base;
  }, [merchantOrderId, prepayIdFromUrl]);

  useEffect(() => {
    if (!isPaid) return;
    navigate(summaryTarget, { replace: true });
  }, [isPaid, navigate, summaryTarget]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-slate-50 flex items-center justify-center p-4">
      <div className="w-full max-w-lg rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
        <div className="mb-6 flex items-center justify-center">
          {state.kind === "loading" || isPending ? (
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-slate-100">
              <Loader2 className="h-8 w-8 animate-spin text-slate-600" />
            </div>
          ) : isPaid ? (
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-emerald-100">
              <CheckCircle2 className="h-9 w-9 text-emerald-600" />
            </div>
          ) : (
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-rose-100">
              <XCircle className="h-9 w-9 text-rose-600" />
            </div>
          )}
        </div>

        <h1 className="text-center text-2xl font-bold text-slate-900">
          {state.kind === "loading"
            ? "Confirming your KBZPay payment..."
            : state.kind === "missing_order"
              ? "Missing order reference"
              : isPaid
                ? "Payment successful"
                : isFailed
                  ? "Payment failed"
                  : isPending
                    ? "Waiting for KBZ confirmation"
                    : "Could not load payment status"}
        </h1>

        <p className="mt-3 text-center text-sm text-slate-600">
          {state.kind === "loading" && "Hold on while we verify your transaction with KBZPay."}
          {state.kind === "missing_order" && (
            <>This page expects <code className="rounded bg-slate-100 px-1 py-0.5 text-[11px]">prepay_id</code> and <code className="rounded bg-slate-100 px-1 py-0.5 text-[11px]">merch_order_id</code> query params from KBZ.</>
          )}
          {isPaid && "KBZ has confirmed your payment. Your order is being processed."}
          {isFailed && "KBZ reported a failed or cancelled transaction. You can try again from the checkout page."}
          {isPending && "KBZ has not yet confirmed the payment. We'll keep checking for the next minute."}
          {state.kind === "error" && state.message}
        </p>

        <div className="mt-6 space-y-2 rounded-xl border border-slate-200 bg-slate-50 p-4 text-xs text-slate-600">
          {merchantOrderId && (
            <div className="flex items-center justify-between gap-3">
              <span className="font-medium text-slate-500">Order ID</span>
              <span className="font-mono text-slate-800">{merchantOrderId}</span>
            </div>
          )}
          {prepayIdFromUrl && (
            <div className="flex items-center justify-between gap-3">
              <span className="font-medium text-slate-500">Prepay ID</span>
              <span className="break-all font-mono text-slate-800">{prepayIdFromUrl}</span>
            </div>
          )}
          {pendingContext?.amount != null && (
            <div className="flex items-center justify-between gap-3">
              <span className="font-medium text-slate-500">Amount</span>
              <span className="font-semibold text-slate-800">
                {pendingContext.amount.toLocaleString()} {pendingContext.currency || "MMK"}
              </span>
            </div>
          )}
          {state.kind === "ok" && state.session.providerStatus && (
            <div className="flex items-center justify-between gap-3">
              <span className="font-medium text-slate-500">Provider Status</span>
              <span className="font-mono text-slate-800">{state.session.providerStatus}</span>
            </div>
          )}
        </div>

        <div className="mt-6 flex flex-col gap-2 sm:flex-row">
          <Button
            type="button"
            className="flex-1 bg-slate-900 text-white hover:bg-slate-800"
            onClick={() =>
              navigate(pendingContext?.originPath || "/")
            }
          >
            {isPaid ? "Continue shopping" : "Go to storefront"}
          </Button>
          {pendingContext?.originPath && !isPaid && (
            <Button
              type="button"
              variant="outline"
              className="flex-1"
              onClick={() => navigate(pendingContext.originPath || "/checkout")}
            >
              Back to checkout
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

export default KPayReturnPage;
