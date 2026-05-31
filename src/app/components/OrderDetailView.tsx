import { Check, Package, ChevronLeft, CreditCard, MapPin, ShoppingBag, Tag } from "lucide-react";
import { Button } from "./ui/button";

interface CartItem {
  sku: string;
  name?: string;
  image: string;
  price: string;
  quantity: number;
}

interface OrderDetailViewProps {
  order: any;
  onBack: () => void;
  formatPriceMMK: (price: string) => string;
}

function normalizeSummaryPaymentMethodLabel(raw: unknown): string {
  const txt = String(raw || "").trim().toLowerCase();
  if (!txt) return "Credit / Debit Card";
  if (txt.includes("pwa")) return "KBZPay In App Payment";
  if (
    txt === "kpay" ||
    txt === "kbzpay" ||
    txt === "kbz pay" ||
    txt.includes("kpay qr") ||
    txt.includes("kbzpay qr") ||
    txt.includes("kbz pay qr")
  ) return "KBZPay QR Payment";
  if (txt.includes("bank")) return "Bank Transfer";
  if (txt.includes("credit") || txt.includes("debit") || txt.includes("card")) return "Credit / Debit Card";
  return String(raw);
}

export function OrderDetailView({ order, onBack, formatPriceMMK }: OrderDetailViewProps) {
  if (!order) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-slate-50 flex items-center justify-center">
        <div className="text-center p-8">
          <Package className="w-16 h-16 text-slate-300 mx-auto mb-4" />
          <p className="text-slate-600">Order not found</p>
          <Button onClick={onBack} className="mt-4 bg-amber-600 hover:bg-amber-700">
            Back to Orders
          </Button>
        </div>
      </div>
    );
  }
  const normalizedItems = Array.isArray(order.items)
    ? order.items.map((item: CartItem, idx: number) => {
        const unit = Number(String(item?.price || "").replace(/[^0-9.-]+/g, ""));
        return {
          id: String((item as any)?.id ?? idx),
          sku: item?.sku || item?.name || "Item",
          quantity: Number(item?.quantity || 1) || 1,
          price: Number.isFinite(unit) ? unit : 0,
          image: item?.image || "",
        };
      })
    : [];
  const safeTotal = Math.round(Number(order?.total || 0) || 0);
  const safeDiscount = Math.round(Number(order?.discount || 0) || 0);
  const safeSubtotal =
    order?.subtotal != null
      ? Math.round(Number(order.subtotal || 0) || 0)
      : Math.max(0, safeTotal + safeDiscount);
  const paymentLabel = normalizeSummaryPaymentMethodLabel(order?.paymentMethod);
  const noteText = String(order?.customer?.notes || order?.notes || "").trim();
  const shipping = {
    fullName: String(order?.customer?.name || order?.customer?.fullName || order?.customerName || ""),
    phone: String(order?.customer?.phone || order?.phone || ""),
    email: String(order?.email || order?.customer?.email || ""),
    address: String(order?.customer?.address || order?.address || ""),
    city: String(order?.customer?.city || order?.city || ""),
    state: String(order?.customer?.state || order?.state || order?.region || ""),
    zipCode: String(order?.customer?.zipCode || order?.zipCode || ""),
    country: String(order?.customer?.country || order?.country || ""),
  };
  const createdAt = new Date(order.createdAt || order.date || Date.now()).toLocaleString("en-GB", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 p-4">
      <div className="w-full max-w-2xl">
        <Button 
          variant="ghost" 
          onClick={onBack}
          className="mb-4 hover:bg-white"
        >
          <ChevronLeft className="w-4 h-4 mr-2" />
          Back to Orders
        </Button>

        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-lg">
          <div className="flex items-center gap-3 border-b border-slate-200 px-6 py-5">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-emerald-500">
              <Check className="h-6 w-6 text-white" strokeWidth={2.5} />
            </div>
            <span className="text-sm font-bold uppercase tracking-wide text-emerald-700">
              Order Placed Successfully
            </span>
          </div>

          <div className="flex items-center justify-between border-b border-slate-200 bg-slate-50/90 px-6 py-5">
            <div>
              <p className="mb-1 text-xs font-medium uppercase tracking-widest text-slate-500">Order number</p>
              <p className="font-mono text-2xl font-semibold tracking-tight text-slate-900">
                {order.orderNumber || order.id}
              </p>
              <p className="mt-1 text-xs text-slate-500">{createdAt}</p>
            </div>
            <ShoppingBag className="h-8 w-8 text-slate-300" strokeWidth={1.5} aria-hidden />
          </div>

          <div className="border-b border-slate-200 px-6 pb-4 pt-5">
            <h3 className="mb-4 text-sm font-semibold uppercase tracking-wide text-slate-700">Order Items</h3>
            <div className="space-y-3">
              {normalizedItems.map((item) => (
                <div key={item.id} className="flex items-center gap-3">
                  <div className="h-12 w-12 shrink-0 overflow-hidden rounded-lg bg-slate-100">
                    {item.image ? (
                      <img src={item.image} alt={item.sku} className="h-full w-full object-cover" />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center">
                        <Package className="h-5 w-5 text-slate-400" />
                      </div>
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-slate-900">{item.sku}</p>
                    <p className="text-xs text-slate-500">
                      Qty: {item.quantity} × {formatPriceMMK(String(item.price))}
                    </p>
                  </div>
                  <p className="text-sm font-semibold text-slate-900">
                    {Math.round(item.price * item.quantity)} MMK
                  </p>
                </div>
              ))}
            </div>
          </div>

          <div className="border-b border-slate-200 px-6 py-4">
            <div className="space-y-2.5">
              <div className="flex justify-between text-sm">
                <span className="text-slate-600">Subtotal</span>
                <span className="font-medium text-slate-900">{safeSubtotal.toFixed(0)} MMK</span>
              </div>
              {safeDiscount > 0 && (
                <div className="flex justify-between text-sm">
                  <span className="flex items-center gap-1.5 text-emerald-600">
                    <Tag className="h-3.5 w-3.5" />
                    Discount {order.couponCode ? `(${order.couponCode})` : ""}
                  </span>
                  <span className="font-medium text-emerald-600">-{safeDiscount.toFixed(0)} MMK</span>
                </div>
              )}
              <div className="flex justify-between text-sm">
                <span className="text-slate-600">Shipping</span>
                <span className="font-bold text-emerald-600">FREE</span>
              </div>
              <div className="flex justify-between border-t border-slate-200 pt-2">
                <span className="text-base font-semibold text-slate-900">Total</span>
                <span className="text-xl font-semibold tracking-tight text-slate-900">{safeTotal.toFixed(0)} MMK</span>
              </div>
            </div>
          </div>

          <div className="border-b border-slate-200 px-6 py-4">
            <p className="mb-3 text-xs font-medium uppercase tracking-widest text-slate-500">Payment method</p>
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-slate-200 bg-white shadow-sm">
                <CreditCard className="h-5 w-5 text-slate-600" strokeWidth={2} />
              </div>
              <span className="text-sm font-semibold text-slate-900">{paymentLabel}</span>
            </div>
          </div>

          {noteText && (
            <div className="border-b border-slate-200 px-6 py-4">
              <p className="mb-2 text-xs font-medium uppercase tracking-wider text-slate-500">Order Note</p>
              <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3">
                <p className="text-sm text-slate-800">{noteText}</p>
              </div>
            </div>
          )}

          <div className="px-6 py-5">
            <div className="mb-4 flex items-center gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-slate-200 bg-white shadow-sm">
                <MapPin className="h-5 w-5 text-slate-600" strokeWidth={2} />
              </div>
              <h3 className="text-base font-semibold text-slate-900">Shipping information</h3>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="mb-1 text-xs uppercase tracking-wider text-slate-500">Full Name</p>
                <p className="text-sm font-medium text-slate-900">{shipping.fullName}</p>
              </div>
              <div>
                <p className="mb-1 text-xs uppercase tracking-wider text-slate-500">Phone</p>
                <p className="text-sm font-medium text-slate-900">{shipping.phone}</p>
              </div>
              <div>
                <p className="mb-1 text-xs uppercase tracking-wider text-slate-500">Email</p>
                <p className="truncate text-sm font-medium text-slate-900">{shipping.email}</p>
              </div>
              <div className="col-span-2">
                <p className="mb-1 text-xs uppercase tracking-wider text-slate-500">Delivery Address</p>
                <p className="text-sm font-medium text-slate-900">
                  {[shipping.address, shipping.city, shipping.state, shipping.zipCode, shipping.country]
                    .filter(Boolean)
                    .join(", ")}
                </p>
              </div>
            </div>
          </div>
        </div>

        <div className="mt-4 flex justify-center">
          <Button 
            onClick={onBack}
            className="h-11 w-64 rounded-lg bg-[#1a1d29] text-sm font-medium text-white hover:bg-slate-900"
          >
            Back to Orders
          </Button>
        </div>
      </div>
    </div>
  );
}