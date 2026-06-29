import { X, Minus, Plus, Trash2, ArrowRight } from "lucide-react";
import { Button } from "./ui/button";
import { Card, CardContent } from "./ui/card";
import { Separator } from "./ui/separator";
import { useCart } from "./CartContext";
import { useEffect } from "react";
import { toast } from "sonner";
import { useLanguage } from "../contexts/LanguageContext";

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
  const { t } = useLanguage();

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

  if (!isOpen) return null;

  const itemCountLabel =
    totalItems === 1
      ? t("cart.itemInCart").replace("{count}", String(totalItems))
      : t("cart.itemsInCart").replace("{count}", String(totalItems));

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
              {t("cart.title")}
            </h2>
            <p className="text-sm text-slate-300">
              {totalItems} {totalItems === 1 ? t("cart.item") : t("cart.items")}
            </p>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={onClose}
            className="text-white hover:bg-white/10"
            aria-label={t("cart.close")}
          >
            <X className="h-5 w-5" />
          </Button>
        </div>

        {/* White list area */}
        <div className="cart-drawer-content min-h-0 flex-1 overflow-y-auto bg-white p-6">
          {items.length === 0 ? (
            <div className="py-12 text-center">
              <p className="mb-2 text-slate-500">{t("cart.empty")}</p>
              <p className="mb-4 text-sm text-slate-400">{t("cart.startShopping")}</p>
              <Button type="button" className="bg-slate-800 hover:bg-slate-900" onClick={onClose}>
                {t("cart.continueShopping")}
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
                    toast.success(t("cart.cleared"));
                  }}
                >
                  <Trash2 className="h-3 w-3" />
                  {t("cart.clearAll")}
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
                                aria-label={t("cart.removeItem")}
                              >
                                <Trash2 className="h-3 w-3" />
                              </Button>
                            </div>
                            {item.quantity >= item.inventory && item.inventory > 0 && (
                              <p className="mt-1 text-[10px] text-slate-500">{t("cart.maxStockReached")}</p>
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
              <div className="flex items-center justify-between text-sm">
                <span className="text-slate-600">
                  {t("cart.subtotalItems").replace("{count}", String(totalItems))}
                </span>
                <span className="font-medium text-slate-900">{formatMmk(totalPrice)}</span>
              </div>

              <Separator />

              <div className="flex items-center justify-between">
                <span className="font-bold text-slate-900">{t("cart.total")}</span>
                <p className="text-right text-xl font-bold text-slate-900">
                  {formatMmk(totalPrice)}
                </p>
              </div>
            </div>

            <Button
              type="button"
              className="h-11 w-full bg-[#1a1d29] text-sm font-medium text-white hover:bg-slate-900"
              onClick={() => {
                if (onCheckout) {
                  onCheckout();
                } else {
                  toast(t("cart.checkoutUnavailable"));
                }
              }}
            >
              {t("cart.proceedToCheckout")}
              <ArrowRight className="ml-2 h-4 w-4" />
            </Button>

            <Button
              type="button"
              className="h-11 w-full bg-[#1a1d29] text-sm font-medium text-white hover:bg-slate-900"
              onClick={onClose}
            >
              {t("cart.continueShopping")}
            </Button>
          </div>
        )}
      </div>
    </>
  );
}
