import { useEffect, useMemo, useState } from "react";
import { Loader2, Package, ShoppingCart, Store, ChevronRight } from "lucide-react";
import { Button } from "./ui/button";
import { Card } from "./ui/card";
import { Badge } from "./ui/badge";
import {
  getCachedAdminAllProducts,
  getCachedAdminOrdersPayload,
  getCachedAdminVendorsForProductList,
} from "../utils/module-cache";
import { productMatchesAdminLiveSearch } from "../utils/adminProductSearch";
import { formatMMK } from "../../utils/formatNumber";

type AnyProduct = Record<string, unknown> & { id?: string; name?: string; sku?: string; price?: unknown };

function orderSearchBlob(order: Record<string, unknown>): string {
  const parts: string[] = [];
  const push = (x: unknown) => {
    if (x == null) return;
    if (typeof x === "string" || typeof x === "number" || typeof x === "boolean") {
      parts.push(String(x));
    } else {
      try {
        parts.push(JSON.stringify(x));
      } catch {
        parts.push(String(x));
      }
    }
  };
  push(order.orderNumber);
  push(order.id);
  push(order.status);
  push(order.email);
  push(order.phone);
  push(order.customer);
  push(order.customerName);
  const items = order.items;
  if (Array.isArray(items)) {
    for (const it of items) {
      if (it && typeof it === "object") {
        const o = it as Record<string, unknown>;
        push(o.name);
        push(o.sku);
        push(o.productId);
      }
    }
  }
  return parts.join(" ").toLowerCase();
}

function vendorMatchesGlobal(v: Record<string, unknown>, q: string): boolean {
  const ql = q.trim().toLowerCase();
  if (!ql) return false;
  return (
    String(v.name ?? "").toLowerCase().includes(ql) ||
    String(v.email ?? "").toLowerCase().includes(ql) ||
    String(v.location ?? "").toLowerCase().includes(ql) ||
    String(v.businessName ?? "").toLowerCase().includes(ql) ||
    String(v.id ?? "").toLowerCase().includes(ql)
  );
}

export interface AdminGlobalSearchProps {
  query: string;
  onNarrowProductSearch: (skuOrName: string) => void;
  onGoToProducts: () => void;
  onViewOrder: (order: unknown) => void;
  onGoToOrdersWithPrefill: (prefill: string) => void;
  onGoToVendorsWithPrefill: (prefill: string) => void;
}

const MAX_SECTION = 12;

export function AdminGlobalSearch({
  query,
  onNarrowProductSearch,
  onGoToProducts,
  onViewOrder,
  onGoToOrdersWithPrefill,
  onGoToVendorsWithPrefill,
}: AdminGlobalSearchProps) {
  const [loading, setLoading] = useState(true);
  const [products, setProducts] = useState<AnyProduct[]>([]);
  const [orders, setOrders] = useState<Record<string, unknown>[]>([]);
  const [vendors, setVendors] = useState<Record<string, unknown>[]>([]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const [p, ord, ven] = await Promise.all([
          getCachedAdminAllProducts(false),
          getCachedAdminOrdersPayload(false).then((x) => x.orders ?? []),
          getCachedAdminVendorsForProductList(false),
        ]);
        if (cancelled) return;
        setProducts(Array.isArray(p) ? (p as AnyProduct[]) : []);
        setOrders(Array.isArray(ord) ? ord : []);
        setVendors(Array.isArray(ven) ? ven : []);
      } catch {
        if (!cancelled) {
          setProducts([]);
          setOrders([]);
          setVendors([]);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const qTrim = query.trim();
  const qLower = qTrim.toLowerCase();

  const matchedProducts = useMemo(() => {
    if (!qTrim) return [];
    return products.filter((p) => productMatchesAdminLiveSearch(p, qTrim)).slice(0, MAX_SECTION);
  }, [products, qTrim]);

  const matchedOrders = useMemo(() => {
    if (!qTrim) return [];
    return orders.filter((o) => orderSearchBlob(o).includes(qLower)).slice(0, MAX_SECTION);
  }, [orders, qLower, qTrim]);

  const matchedVendors = useMemo(() => {
    if (!qTrim) return [];
    return vendors.filter((v) => vendorMatchesGlobal(v, qTrim)).slice(0, MAX_SECTION);
  }, [vendors, qTrim]);

  if (!qTrim) {
    return (
      <div className="p-6 max-w-4xl">
        <h1 className="text-2xl font-semibold text-slate-900">Search</h1>
        <p className="text-slate-600 mt-2">
          Type in the header search and press Enter to find products, orders, and vendors in one place.
          Product matching uses the same rules as the storefront (name, SKU, product id, category, variant
          SKUs).
        </p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="p-12 flex flex-col items-center justify-center text-slate-600 gap-3">
        <Loader2 className="w-10 h-10 animate-spin text-slate-400" />
        <p className="text-sm">Loading catalog…</p>
      </div>
    );
  }

  const totalHits = matchedProducts.length + matchedOrders.length + matchedVendors.length;

  return (
    <div className="p-6 space-y-6 max-w-5xl">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">Search results</h1>
        <p className="text-slate-600 mt-1">
          <span className="font-medium text-slate-800">&quot;{qTrim}&quot;</span>
          {totalHits === 0 ? " — no matches." : ` — ${totalHits} match${totalHits === 1 ? "" : "es"} (capped per section).`}
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="outline" size="sm" onClick={onGoToProducts}>
          All products
          <ChevronRight className="w-4 h-4 ml-1" />
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => onGoToOrdersWithPrefill(qTrim)}
        >
          Orders list
          <ChevronRight className="w-4 h-4 ml-1" />
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => onGoToVendorsWithPrefill(qTrim)}
        >
          Vendors list
          <ChevronRight className="w-4 h-4 ml-1" />
        </Button>
      </div>

      <Card className="p-4 border border-slate-200">
        <div className="flex items-center gap-2 mb-3">
          <Package className="w-5 h-5 text-purple-600" />
          <h2 className="font-semibold text-slate-900">Products</h2>
          <Badge variant="secondary">{matchedProducts.length}</Badge>
        </div>
        {matchedProducts.length === 0 ? (
          <p className="text-sm text-slate-500">No products match.</p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {matchedProducts.map((p) => {
              const label = String(p.name ?? p.title ?? p.sku ?? p.id ?? "Product");
              const sku = String(p.sku ?? "");
              const priceRaw = p.price;
              const priceNum =
                typeof priceRaw === "number"
                  ? priceRaw
                  : parseFloat(String(priceRaw ?? "").replace(/[^0-9.-]/g, "")) || 0;
              return (
                <li key={String(p.id ?? sku ?? label)} className="py-2 flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-medium text-slate-900 truncate">{label}</p>
                    <p className="text-xs text-slate-500">{sku ? `SKU: ${sku}` : `ID: ${p.id ?? "—"}`}</p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="text-sm text-slate-600">{formatMMK(priceNum)}</span>
                    <Button
                      type="button"
                      size="sm"
                      variant="secondary"
                      onClick={() => onNarrowProductSearch(sku || label)}
                    >
                      In products
                    </Button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </Card>

      <Card className="p-4 border border-slate-200">
        <div className="flex items-center gap-2 mb-3">
          <ShoppingCart className="w-5 h-5 text-blue-600" />
          <h2 className="font-semibold text-slate-900">Orders</h2>
          <Badge variant="secondary">{matchedOrders.length}</Badge>
        </div>
        {matchedOrders.length === 0 ? (
          <p className="text-sm text-slate-500">No orders match.</p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {matchedOrders.map((o, i) => {
              const id = String(o.id ?? o.orderNumber ?? i);
              const num = String(o.orderNumber ?? o.id ?? "—");
              const status = String(o.status ?? "");
              return (
                <li key={id} className="py-2 flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-medium text-slate-900">{num}</p>
                    <p className="text-xs text-slate-500">{status}</p>
                  </div>
                  <Button type="button" size="sm" onClick={() => onViewOrder(o)}>
                    Open
                  </Button>
                </li>
              );
            })}
          </ul>
        )}
      </Card>

      <Card className="p-4 border border-slate-200">
        <div className="flex items-center gap-2 mb-3">
          <Store className="w-5 h-5 text-amber-600" />
          <h2 className="font-semibold text-slate-900">Vendors</h2>
          <Badge variant="secondary">{matchedVendors.length}</Badge>
        </div>
        {matchedVendors.length === 0 ? (
          <p className="text-sm text-slate-500">No vendors match.</p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {matchedVendors.map((v) => {
              const id = String(v.id ?? "");
              const name = String(v.name ?? v.businessName ?? id);
              return (
                <li key={id || name} className="py-2 flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-medium text-slate-900 truncate">{name}</p>
                    <p className="text-xs text-slate-500 truncate">{String(v.email ?? "")}</p>
                  </div>
                  <Button
                    type="button"
                    size="sm"
                    variant="secondary"
                    onClick={() => onGoToVendorsWithPrefill(name)}
                  >
                    In vendors
                  </Button>
                </li>
              );
            })}
          </ul>
        )}
      </Card>
    </div>
  );
}
