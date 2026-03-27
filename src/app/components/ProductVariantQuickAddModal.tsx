import { useEffect, useMemo, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "./ui/dialog";
import { Button } from "./ui/button";
import { Minus, Plus, X } from "lucide-react";
import {
  getEffectiveVariantOptions,
  initVariantSelections,
  matchVariantForProduct,
  productHasVariantPicker,
  type VariantProduct,
} from "./ProductVariantChips";

/** Matches ProductCardProduct (defined in ProductCard to avoid circular imports). */
type QuickAddProduct = VariantProduct & {
  image: string;
  images?: string[];
  name: string;
  price: string;
  salesVolume?: number;
  sku?: string;
};

type Props = {
  product: QuickAddProduct;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  formatPriceMMK: (price: string | number) => string;
  onConfirm: (args: {
    sku: string;
    price: number;
    image?: string;
    quantity: number;
    buyNow: boolean;
  }) => void;
};

function parsePriceNum(raw: string | number | undefined, fallback: string): number {
  if (typeof raw === "number" && Number.isFinite(raw)) return raw;
  if (typeof raw === "string") {
    const n = parseFloat(raw.replace(/[^0-9.-]/g, ""));
    if (Number.isFinite(n)) return n;
  }
  const fb = parseFloat(String(fallback).replace(/[^0-9.-]/g, ""));
  return Number.isFinite(fb) ? fb : 0;
}

export function ProductVariantQuickAddModal({
  product,
  open,
  onOpenChange,
  formatPriceMMK,
  onConfirm,
}: Props) {
  const [selections, setSelections] = useState<Record<string, string>>({});
  const [qty, setQty] = useState(1);

  useEffect(() => {
    if (!open) return;
    setSelections(initVariantSelections(product));
    setQty(1);
  }, [open, product.id, product.variantOptions?.length, product.variants?.length]);

  const show = productHasVariantPicker(product);
  const opts = useMemo(() => getEffectiveVariantOptions(product as VariantProduct), [product]);

  const resolved = useMemo(
    () => (show ? matchVariantForProduct(product as VariantProduct, selections) : null),
    [product, selections, show]
  );

  const baseImage =
    product.images && product.images.length > 0 ? product.images[0] : product.image;
  const variantImage = (resolved as { image?: string } | null)?.image;
  const displayImage = variantImage || baseImage;

  const displayPriceStr = resolved?.price ?? product.price;
  const priceNum = parsePriceNum(displayPriceStr, product.price);

  const maxQty = (() => {
    const inv = (resolved as { inventory?: number | string } | null)?.inventory;
    if (inv == null || inv === "") return 99;
    const n = typeof inv === "number" ? inv : parseFloat(String(inv).replace(/[^0-9.-]/g, ""));
    return Number.isFinite(n) && n >= 0 ? Math.min(99, Math.floor(n)) : 99;
  })();

  const handleAdd = (buyNow: boolean) => {
    if (!resolved) return;
    onConfirm({
      sku: resolved.sku,
      price: priceNum,
      image: displayImage,
      quantity: Math.min(qty, maxQty),
      buyNow,
    });
    onOpenChange(false);
  };

  if (!show) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md p-0 gap-0 overflow-hidden border-0 shadow-xl [&>button:last-child]:hidden">
        <button
          type="button"
          aria-label="Close"
          className="absolute top-3 right-3 z-20 flex h-9 w-9 items-center justify-center rounded-md text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-300 focus-visible:ring-offset-2"
          onClick={() => onOpenChange(false)}
        >
          <X className="h-5 w-5" strokeWidth={1.25} aria-hidden />
        </button>

        <DialogHeader className="px-5 pt-5 pb-2 pr-11 text-left">
          <DialogTitle className="text-base font-semibold text-slate-900 line-clamp-2 leading-snug">
            {product.name}
          </DialogTitle>
        </DialogHeader>

        <div className="px-5 pb-5 space-y-4 max-h-[min(70vh,520px)] overflow-y-auto">
          {opts.map((option) => (
            <div key={option.name} className="space-y-2">
              <p className="text-sm font-medium text-slate-800">{option.name}</p>
              <div className="flex flex-wrap gap-2">
                {option.values.map((value) => {
                  const active = selections[option.name] === value;
                  return (
                    <button
                      key={value}
                      type="button"
                      onClick={() => setSelections((s) => ({ ...s, [option.name]: value }))}
                      className={`min-h-9 rounded-md border-2 px-3 text-sm font-medium transition ${
                        active
                          ? "border-slate-900 bg-slate-50 text-slate-900"
                          : "border-slate-200 bg-white text-slate-700 hover:border-slate-300"
                      }`}
                    >
                      {value}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}

          <div>
            <p className="text-sm font-medium text-slate-800 mb-1">Price</p>
            <p className="text-lg font-bold text-slate-900">{formatPriceMMK(displayPriceStr)}</p>
            <p className="text-xs text-slate-500 mt-1 italic">Shipping calculated at checkout.</p>
          </div>

          <div>
            <p className="text-sm font-medium text-slate-800 mb-2">Quantity</p>
            <div className="inline-flex items-center gap-3 rounded-lg border border-slate-200 px-2 py-1.5">
              <button
                type="button"
                className="flex h-8 w-8 items-center justify-center rounded-md text-slate-600 hover:bg-slate-100 disabled:opacity-40"
                disabled={qty <= 1}
                onClick={() => setQty((q) => Math.max(1, q - 1))}
              >
                <Minus className="h-4 w-4" />
              </button>
              <span className="min-w-[2ch] text-center text-sm font-semibold tabular-nums">{qty}</span>
              <button
                type="button"
                className="flex h-8 w-8 items-center justify-center rounded-md text-slate-600 hover:bg-slate-100 disabled:opacity-40"
                disabled={qty >= maxQty}
                onClick={() => setQty((q) => Math.min(maxQty, q + 1))}
              >
                <Plus className="h-4 w-4" />
              </button>
            </div>
          </div>

          <div className="flex flex-col gap-2 pt-1">
            <Button
              type="button"
              variant="outline"
              className="w-full h-11 border-2 border-slate-900 text-slate-900 font-semibold hover:bg-slate-50"
              disabled={!resolved || maxQty === 0}
              onClick={() => handleAdd(false)}
            >
              Add to cart
            </Button>
            <Button
              type="button"
              className="w-full h-11 bg-[#1a1d29] hover:bg-slate-900 text-white font-semibold shadow-lg transition-colors"
              disabled={!resolved || maxQty === 0}
              onClick={() => handleAdd(true)}
            >
              Buy it now
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
