import { X, Minus, Plus, Trash2, Tag, ArrowRight } from "lucide-react";
import { Button } from "./ui/button";
import { Card, CardContent } from "./ui/card";
import { Separator } from "./ui/separator";
import { useCart } from "./CartContext";
import { useState, useEffect } from "react";
import { projectId, publicAnonKey } from "../../../utils/supabase/info";
import { toast } from "sonner";

interface CartDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  onCheckout?: () => void;
  user?: any;
  onShowAuthModal?: () => void;
}

function formatMmk(amount: number): string {
  return `${Math.round(amount)} MMK`;
}

/** Matches main marketplace cart sidebar: navy header, white list, slate footer */
export function CartDrawer({ isOpen, onClose, onCheckout, user, onShowAuthModal }: CartDrawerProps) {
  const { items, removeFromCart, updateQuantity, totalItems, totalPrice, clearCart } = useCart();

  useEffect(() => {
    if (isOpen) {
      const scrollY = window.scrollY;
      document.body.style.position = "fixed";
      document.body.style.top = `-${scrollY}px`;
      document.body.style.left = "0";
      document.body.style.right = "0";
      document.body.style.width = "100%";
      document.body.style.overflow = "hidden";
      document.documentElement.style.overflow = "hidden";
      document.documentElement.style.height = "100%";

      return () => {
        document.body.style.position = "";
        document.body.style.top = "";
        document.body.style.left = "";
        document.body.style.right = "";
        document.body.style.width = "";
        document.body.style.overflow = "";
        document.documentElement.style.overflow = "";
        document.documentElement.style.height = "";
        window.scrollTo(0, scrollY);
      };
    }
  }, [isOpen]);

  const [couponCode, setCouponCode] = useState("");
  const [appliedCoupon, setAppliedCoupon] = useState<any>(() => {
    const saved = localStorage.getItem("migoo-applied-coupon");
    return saved ? JSON.parse(saved) : null;
  });
  const [couponLoading, setCouponLoading] = useState(false);
  const [couponError, setCouponError] = useState("");

  useEffect(() => {
    if (appliedCoupon) {
      localStorage.setItem("migoo-applied-coupon", JSON.stringify(appliedCoupon));
    } else {
      localStorage.removeItem("migoo-applied-coupon");
    }
  }, [appliedCoupon]);

  const discount = appliedCoupon?.campaign?.discountAmount || 0;
  const finalPrice = totalPrice - discount;

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
            code,
            cartTotal: totalPrice,
            cartItems: items.map((item) => ({
              id: item.id,
              sku: item.sku || item.id,
              price: item.price,
              quantity: item.quantity,
            })),
          }),
        }
      );

      const data = await response.json();

      if (data.valid && data.campaign) {
        setAppliedCoupon(data);
        setCouponError("");
      } else {
        setCouponError(data.error || "Invalid coupon code");
        setAppliedCoupon(null);
      }
    } catch {
      setCouponError("Failed to validate coupon");
      setAppliedCoupon(null);
    } finally {
      setCouponLoading(false);
    }
  };

  const handleRemoveCoupon = () => {
    setAppliedCoupon(null);
    setCouponCode("");
    setCouponError("");
  };

  if (!isOpen) return null;

  const itemCountLabel =
    totalItems === 1 ? "1 item in cart" : `${totalItems} items in cart`;

  return (
    <>
      <div
        className="fixed inset-0 z-[100] bg-black/10 transition-opacity"
        onClick={onClose}
        aria-hidden
      />

      <div
        className="fixed right-0 top-0 z-[101] flex h-full w-full max-w-md animate-fade-in-right flex-col bg-white shadow-2xl"
        data-drawer="true"
        role="dialog"
        aria-modal="true"
        aria-labelledby="cart-drawer-title"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Navy header — same structure as main marketplace cart sidebar */}
        <div className="flex shrink-0 items-center justify-between border-b border-slate-800/50 bg-gradient-to-r from-slate-800 to-slate-700 px-4 py-4 text-white">
          <div>
            <h2 id="cart-drawer-title" className="text-xl font-semibold">
              Shopping Cart
            </h2>
            <p className="text-sm text-slate-300">
              {totalItems} {totalItems === 1 ? "item" : "items"}
            </p>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={onClose}
            className="text-white hover:bg-white/10"
            aria-label="Close cart"
          >
            <X className="h-5 w-5" />
          </Button>
        </div>

        {/* White list area */}
        <div className="cart-drawer-content min-h-0 flex-1 overflow-y-auto bg-white p-6">
          {items.length === 0 ? (
            <div className="py-12 text-center">
              <p className="mb-2 text-slate-500">Your cart is empty</p>
              <p className="mb-4 text-sm text-slate-400">Start shopping to add items</p>
              <Button type="button" className="bg-slate-800 hover:bg-slate-900" onClick={onClose}>
                Continue Shopping
              </Button>
            </div>
          ) : (
            <>
              <div className="mb-3 flex animate-fade-in items-center justify-between">
                <span className="text-sm text-slate-600">{itemCountLabel}</span>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-auto gap-1 px-2 text-xs font-medium text-red-600 hover:bg-red-50 hover:text-red-700"
                  onClick={() => {
                    clearCart();
                    toast.success("Cart cleared");
                  }}
                >
                  <Trash2 className="h-3 w-3" />
                  Clear All
                </Button>
              </div>

              <div className="space-y-2">
                {items.map((item) => {
                  const unit = Number(item.price) || 0;
                  const lineTotal = unit * item.quantity;
                  return (
                    <Card
                      key={`${item.id}-${item.vendorId || "store"}`}
                      className="border border-slate-200 shadow-sm transition-all hover:shadow-md"
                    >
                      <CardContent className="p-2.5">
                        <div className="flex gap-2.5">
                          <div className="h-16 w-16 shrink-0 overflow-hidden rounded-lg border border-slate-200">
                            <img src={item.image} alt="" className="h-full w-full object-cover" />
                          </div>
                          <div className="min-w-0 flex-1">
                            <h3 className="mb-2 line-clamp-1 text-sm font-semibold text-slate-900">{item.sku}</h3>
                            <div className="text-sm font-semibold text-slate-900">{formatMmk(lineTotal)}</div>
                            <div className="mt-2 flex items-center gap-1.5">
                              <Button
                                type="button"
                                size="sm"
                                variant="outline"
                                className="h-6 w-6 rounded-full p-0"
                                onClick={() => updateQuantity(item.id, item.quantity - 1)}
                              >
                                <Minus className="h-2.5 w-2.5" />
                              </Button>
                              <span className="w-7 text-center text-xs font-medium">{item.quantity}</span>
                              <Button
                                type="button"
                                size="sm"
                                variant="outline"
                                className="h-6 w-6 rounded-full p-0"
                                onClick={() => updateQuantity(item.id, item.quantity + 1)}
                                disabled={item.quantity >= item.inventory}
                              >
                                <Plus className="h-2.5 w-2.5" />
                              </Button>
                              <Button
                                type="button"
                                size="sm"
                                variant="ghost"
                                className="ml-auto h-6 w-6 p-0 text-slate-500 hover:bg-red-50 hover:text-red-600"
                                onClick={() => removeFromCart(item.id)}
                                aria-label="Remove item"
                              >
                                <Trash2 className="h-3 w-3" />
                              </Button>
                            </div>
                            {item.quantity >= item.inventory && item.inventory > 0 && (
                              <p className="mt-1 text-[10px] text-slate-500">Max stock reached</p>
                            )}
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            </>
          )}
        </div>

        {items.length > 0 && (
          <div className="shrink-0 space-y-4 border-t border-slate-200 bg-slate-50 p-6">
            <div className="space-y-2">
              <label className="flex items-center gap-2 text-sm font-medium text-slate-800">
                <Tag className="h-4 w-4 text-slate-600" />
                Have a coupon code?
              </label>

              {!appliedCoupon ? (
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={couponCode}
                    onChange={(e) => {
                      setCouponCode(e.target.value.toUpperCase());
                      setCouponError("");
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") handleApplyCoupon();
                    }}
                    placeholder="ENTER COUPON CODE"
                    className="flex-1 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm uppercase tracking-wide placeholder:text-slate-400 focus:border-slate-400 focus:outline-none focus:ring-1 focus:ring-slate-300"
                    disabled={couponLoading}
                  />
                  <Button
                    type="button"
                    onClick={handleApplyCoupon}
                    disabled={couponLoading || !couponCode.trim()}
                    className="shrink-0 bg-slate-500 px-4 text-white hover:bg-slate-600"
                  >
                    {couponLoading ? "…" : "Apply"}
                  </Button>
                </div>
              ) : (
                <div className="flex items-center justify-between rounded-lg border border-green-200 bg-green-50 p-3">
                  <div className="flex min-w-0 items-center gap-2">
                    <Tag className="h-4 w-4 shrink-0 text-green-600" />
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-green-800">{appliedCoupon.campaign?.code}</p>
                      <p className="text-xs text-green-700">
                        {appliedCoupon.campaign?.discountType === "percentage"
                          ? `${appliedCoupon.campaign?.discount}% off`
                          : `${appliedCoupon.campaign?.discount} MMK off`}
                      </p>
                    </div>
                  </div>
                  <Button
                    type="button"
                    onClick={handleRemoveCoupon}
                    variant="ghost"
                    size="sm"
                    className="h-8 shrink-0 text-red-600 hover:bg-red-50"
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              )}

              {couponError && <p className="text-xs font-medium text-red-600">{couponError}</p>}
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span className="text-slate-600">Subtotal ({totalItems} items)</span>
                <span className="font-medium text-slate-900">{formatMmk(totalPrice)}</span>
              </div>

              {appliedCoupon && (
                <div className="flex items-center justify-between text-sm text-green-700">
                  <span>Discount ({appliedCoupon.campaign?.code})</span>
                  <span className="font-semibold">−{formatMmk(discount)}</span>
                </div>
              )}

              <Separator />

              <div className="flex items-center justify-between">
                <span className="font-bold text-slate-900">Total</span>
                <p className="text-right text-xl font-bold text-slate-900">
                  {formatMmk(finalPrice)}
                </p>
              </div>
            </div>

            <Button
              type="button"
              className="h-11 w-full bg-[#1a1d29] text-sm font-medium text-white hover:bg-slate-900"
              onClick={() => {
                if (!user) {
                  toast.error("Please sign in to proceed with checkout");
                  onClose();
                  onShowAuthModal?.();
                  return;
                }
                if (onCheckout) {
                  onCheckout();
                } else {
                  toast("Checkout is not available");
                }
              }}
            >
              Proceed to Checkout
              <ArrowRight className="ml-2 h-4 w-4" />
            </Button>

            <Button
              type="button"
              className="h-11 w-full bg-[#1a1d29] text-sm font-medium text-white hover:bg-slate-900"
              onClick={onClose}
            >
              Continue Shopping
            </Button>
          </div>
        )}
      </div>
    </>
  );
}
