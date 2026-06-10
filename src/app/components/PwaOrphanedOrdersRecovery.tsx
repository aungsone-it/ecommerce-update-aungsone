import { useCallback, useEffect, useMemo, useState } from "react";
import { Loader2, RefreshCw, ShieldAlert } from "lucide-react";
import { toast } from "sonner";
import { Button } from "./ui/button";
import { Badge } from "./ui/badge";
import {
  fetchOrphanedPwaDrafts,
  finalizePwaCheckoutOrderApi,
  type OrphanedPwaDraftRow,
} from "../utils/kpayClient";
import { notifyAdminOrdersUpdated } from "../utils/adminOrdersRealtime";
import { projectId, publicAnonKey } from "../../../utils/supabase/info";

type PwaOrphanedOrdersRecoveryProps = {
  /** Limit list to one vendor (vendor admin). */
  vendorId?: string;
  /** When user searches an order id, surface a matching draft if the list is empty. */
  searchQuery?: string;
  /** Called after an order was recovered so parent lists can refresh. */
  onRecovered?: () => void;
  compact?: boolean;
};

export function PwaOrphanedOrdersRecovery({
  vendorId,
  searchQuery = "",
  onRecovered,
  compact = false,
}: PwaOrphanedOrdersRecoveryProps) {
  const [drafts, setDrafts] = useState<OrphanedPwaDraftRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [recoveringId, setRecoveringId] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(!compact);

  const searchOrderId = useMemo(() => {
    const q = searchQuery.trim();
    return /^ORD-/i.test(q) ? q.toUpperCase() : "";
  }, [searchQuery]);

  const loadDrafts = useCallback(async () => {
    setLoading(true);
    try {
      const rows = await fetchOrphanedPwaDrafts({
        vendorId,
        minAgeMinutes: 3,
        limit: 25,
        merchantOrderId: searchOrderId || undefined,
      });
      setDrafts(rows);
    } catch (error) {
      console.warn("[PwaOrphanedOrdersRecovery] load failed", error);
      setDrafts([]);
    } finally {
      setLoading(false);
    }
  }, [vendorId, searchOrderId]);

  useEffect(() => {
    void loadDrafts();
  }, [loadDrafts]);

  const handleRecover = async (merchantOrderId: string) => {
    setRecoveringId(merchantOrderId);
    try {
      const result = await finalizePwaCheckoutOrderApi({
        projectId,
        publicAnonKey,
        merchantOrderId,
      });
      if (!result.ok) {
        toast.error(
          result.message ||
            result.error ||
            "Could not create order from KBZPay draft",
        );
        return;
      }
      toast.success(`Order ${merchantOrderId} registered successfully`);
      notifyAdminOrdersUpdated("pwa-draft-recovered");
      onRecovered?.();
      await loadDrafts();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Recovery failed");
    } finally {
      setRecoveringId(null);
    }
  };

  if (!loading && drafts.length === 0) {
    return null;
  }

  const title = vendorId ? "KBZPay drafts (your store)" : "KBZPay drafts missing orders";

  return (
    <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50/80 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-2 min-w-0">
          <ShieldAlert className="mt-0.5 h-5 w-5 shrink-0 text-amber-700" />
          <div>
            <p className="font-semibold text-amber-950">{title}</p>
            <p className="text-sm text-amber-900/80 mt-0.5">
              These checkouts were paid in KBZPay but never became real orders. Recover them to
              show in admin and vendor panels.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="border-amber-300 bg-white"
            onClick={() => void loadDrafts()}
            disabled={loading}
          >
            {loading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="h-4 w-4" />
            )}
            <span className="ml-2">Refresh</span>
          </Button>
          {compact ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setExpanded((v) => !v)}
            >
              {expanded ? "Hide" : "Show"}
            </Button>
          ) : null}
        </div>
      </div>

      {expanded ? (
        <div className="mt-3 overflow-x-auto">
          {loading && drafts.length === 0 ? (
            <div className="flex items-center gap-2 text-sm text-amber-900 py-2">
              <Loader2 className="h-4 w-4 animate-spin" />
              Checking for orphaned KBZPay drafts…
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-amber-900/70 border-b border-amber-200">
                  <th className="py-2 pr-3 font-medium">Order ID</th>
                  <th className="py-2 pr-3 font-medium">Vendor</th>
                  <th className="py-2 pr-3 font-medium">Total</th>
                  <th className="py-2 pr-3 font-medium">Payment</th>
                  <th className="py-2 pr-3 font-medium">Saved</th>
                  <th className="py-2 font-medium text-right">Action</th>
                </tr>
              </thead>
              <tbody>
                {drafts.map((draft) => (
                  <tr key={draft.merchantOrderId} className="border-b border-amber-100/80">
                    <td className="py-2 pr-3 font-mono text-xs">{draft.merchantOrderId}</td>
                    <td className="py-2 pr-3">{draft.vendor || draft.vendorId || "—"}</td>
                    <td className="py-2 pr-3 tabular-nums">
                      {draft.total != null ? `${Math.round(draft.total).toLocaleString()} MMK` : "—"}
                    </td>
                    <td className="py-2 pr-3">
                      <Badge
                        variant="outline"
                        className={
                          draft.txnStatus === "paid"
                            ? "border-emerald-300 text-emerald-800 bg-emerald-50"
                            : "border-amber-300 text-amber-900 bg-white"
                        }
                      >
                        {draft.txnStatus || "unknown"}
                      </Badge>
                    </td>
                    <td className="py-2 pr-3 text-xs text-amber-900/70">
                      {draft.savedAt ? new Date(draft.savedAt).toLocaleString() : "—"}
                    </td>
                    <td className="py-2 text-right">
                      <Button
                        type="button"
                        size="sm"
                        className="bg-amber-800 hover:bg-amber-900 text-white"
                        disabled={!draft.canRecover || recoveringId === draft.merchantOrderId}
                        onClick={() => void handleRecover(draft.merchantOrderId)}
                      >
                        {recoveringId === draft.merchantOrderId ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          "Recover order"
                        )}
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      ) : null}
    </div>
  );
}
