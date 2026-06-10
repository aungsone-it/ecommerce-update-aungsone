import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router";
import { CheckCircle2, Loader2, XCircle } from "lucide-react";
import { Button } from "../components/ui/button";
import { projectId, publicAnonKey } from "../../../utils/supabase/info";
import {
  KPAY_PWA_PENDING_STORAGE_KEY,
  buildPwaSummaryAbsoluteUrl,
  fetchKPaySessionStatus,
  fetchPwaCheckoutDraft,
  finalizePwaCheckoutOrderApi,
  parsePwaCallbackInfo,
  type KPaySession,
} from "../utils/kpayClient";
import { maybeRedirectKpayReturnToUnifiedSummary } from "../utils/kpayUnifiedSummaryRedirect";
import { notifyAdminOrdersUpdated } from "../utils/adminOrdersRealtime";

type ReturnState =
  | { kind: "loading" }
  | { kind: "missing_order" }
  | { kind: "ok"; session: KPaySession }
  | { kind: "error"; message: string };

const POLL_INTERVAL_MS = 2000;
const POLL_TIMEOUT_MS = 45_000;

function navigateToSummary(url: string, navigate: ReturnType<typeof useNavigate>) {
  if (/^https?:\/\//i.test(url)) {
    const target = new URL(url);
    const here = new URL(window.location.href);
    if (target.origin === here.origin && target.pathname === here.pathname) {
      if (target.search !== here.search) {
        window.history.replaceState(null, "", target.pathname + target.search);
      }
      return;
    }
    if (target.origin !== here.origin || target.pathname !== here.pathname) {
      window.location.replace(url);
      return;
    }
  }
  const path = url.startsWith("http") ? new URL(url).pathname + new URL(url).search : url;
  navigate(path, { replace: true });
}

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
  const callbackFromUrl = useMemo(
    () => parsePwaCallbackInfo(searchParams.get("callback_info")),
    [searchParams],
  );

  const [localPending] = useState(() => {
    if (typeof window === "undefined") return null;
    try {
      const raw = localStorage.getItem(KPAY_PWA_PENDING_STORAGE_KEY);
      if (!raw) return null;
      return JSON.parse(raw) as {
        merchantOrderId?: string;
        originPath?: string;
        summaryPath?: string;
        storefrontOrigin?: string;
        storeName?: string;
      };
    } catch {
      return null;
    }
  });

  const [serverDraft, setServerDraft] = useState<{
    storefrontOrigin?: string;
    originPath?: string;
  } | null>(null);
  const [state, setState] = useState<ReturnState>({ kind: "loading" });
  const finalizeDoneRef = useRef(false);
  const redirectDoneRef = useRef(false);

  useLayoutEffect(() => {
    if (!merchantOrderId || redirectDoneRef.current) return;
    if (maybeRedirectKpayReturnToUnifiedSummary()) {
      redirectDoneRef.current = true;
      return;
    }
    redirectDoneRef.current = true;

    const path = (window.location.pathname.split("?")[0] || "").replace(/\/+$/, "") || "/";
    if (path === "/summary") {
      return;
    }

    navigateToSummary(
      buildPwaSummaryAbsoluteUrl({
        merchantOrderId,
        prepayId: prepayIdFromUrl,
      }),
      navigate,
    );
  }, [merchantOrderId, prepayIdFromUrl, navigate]);

  useEffect(() => {
    if (!merchantOrderId) return;
    void fetchPwaCheckoutDraft({ projectId, publicAnonKey, merchantOrderId })
      .then((draft) => {
        if (draft) {
          setServerDraft({
            storefrontOrigin: draft.storefrontOrigin,
            originPath: draft.originPath,
          });
        }
      })
      .catch(() => {
        /* non-fatal */
      });
  }, [merchantOrderId]);

  const storefrontOriginResolved =
    serverDraft?.storefrontOrigin ||
    localPending?.storefrontOrigin ||
    callbackFromUrl?.storefrontOrigin ||
    "";

  const summaryTarget = useMemo(
    () =>
      buildPwaSummaryAbsoluteUrl({
        merchantOrderId,
        prepayId: prepayIdFromUrl,
      }),
    [merchantOrderId, prepayIdFromUrl],
  );

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

        if (session.status === "paid" && !finalizeDoneRef.current) {
          const fin = await finalizePwaCheckoutOrderApi({
            projectId,
            publicAnonKey,
            merchantOrderId,
          });
          if (fin.ok) {
            finalizeDoneRef.current = true;
            notifyAdminOrdersUpdated("pwa-return-order-finalized");
          }
        }

        if (session.status === "paid" || session.status === "failed") {
          return "stop";
        }
        if (Date.now() - startedAt >= POLL_TIMEOUT_MS) {
          return "stop";
        }
      } catch (error: unknown) {
        if (cancelled) return;
        setState((prev) =>
          prev.kind === "ok"
            ? prev
            : { kind: "error", message: String((error as Error)?.message || error) },
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

  const backToStore = useMemo(() => {
    const origin = storefrontOriginResolved;
    const path = (serverDraft?.originPath || localPending?.originPath || "/").split("?")[0] || "/";
    if (origin) return `${origin.replace(/\/$/, "")}${path.startsWith("/") ? path : `/${path}`}`;
    return path;
  }, [storefrontOriginResolved, serverDraft, localPending]);

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
                    ? "Finishing up..."
                    : "Could not load payment status"}
        </h1>

        <p className="mt-3 text-center text-sm text-slate-600">
          {state.kind === "loading" && "Creating your order and confirming payment with KBZPay."}
          {state.kind === "missing_order" &&
            "This page expects prepay_id and merch_order_id from KBZ."}
          {(isPaid || isPending) && "Redirecting to your order summary..."}
          {isFailed && "KBZ reported a failed or cancelled payment."}
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
        </div>

        <div className="mt-6 flex flex-col gap-2">
          {merchantOrderId && !isFailed && (
            <Button
              type="button"
              className="w-full bg-slate-900 text-white hover:bg-slate-800"
              onClick={() => navigateToSummary(summaryTarget, navigate)}
            >
              View order summary
            </Button>
          )}
          <Button
            type="button"
            variant="outline"
            className="w-full"
            onClick={() => {
              if (/^https?:\/\//i.test(backToStore)) {
                window.location.href = backToStore;
              } else {
                navigate(backToStore);
              }
            }}
          >
            Back to store
          </Button>
        </div>
      </div>
    </div>
  );
}

export default KPayReturnPage;
