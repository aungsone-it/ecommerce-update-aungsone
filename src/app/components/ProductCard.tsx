import { useState, useMemo } from "react";
import { Plus, Heart, Star } from "lucide-react";
import { Card } from "./ui/card";
import { LazyImage } from "./LazyImage";
import { motion } from "motion/react";
import {
  initVariantSelections,
  matchVariantForProduct,
  productHasVariantPicker,
  type VariantProduct,
} from "./ProductVariantChips";
import { ProductVariantQuickAddModal } from "./ProductVariantQuickAddModal";
import type { Product } from "../../types";

export type ProductCardProduct = VariantProduct & {
  image: string;
  images?: string[];
  name: string;
  price: string;
  salesVolume?: number;
  sku?: string;
};

/** API/catalog product → props for {@link ProductCard} (variant options, images, review/sales counts). */
export type ProductLikeForCard = Product & {
  reviewCount?: number;
  variantOptions?: { name: string; values: string[] }[];
};

export function mapProductToCardProduct(product: ProductLikeForCard): ProductCardProduct {
  const vo = product.variantOptions;
  const variantOptions =
    Array.isArray(vo) && vo.length > 0
      ? vo
      : Array.isArray(product.options)
        ? product.options.map((o) => ({
            name: o.name,
            values: Array.isArray(o.values) ? o.values : [],
          }))
        : undefined;
  const imgs = product.images;
  return {
    id: product.id,
    image: Array.isArray(imgs) && imgs.length > 0 ? imgs[0] : product.image ?? "",
    images: Array.isArray(imgs) ? imgs : undefined,
    name: product.name,
    price: String(product.price ?? ""),
    salesVolume: product.reviewCount ?? product.salesVolume ?? 0,
    sku: product.sku,
    hasVariants: Boolean(product.hasVariants),
    variantOptions,
    variants: product.variants as ProductCardProduct["variants"],
  };
}

/** Second argument to onAddToCart — variant line, quantity, or express checkout */
export type ProductCardAddOpts = {
  sku?: string;
  price?: string | number;
  image?: string;
  quantity?: number;
  /** Clear cart / single-item checkout where the parent supports it */
  buyNow?: boolean;
};

interface ProductCardProps {
  product: ProductCardProduct;
  onProductClick: () => void;
  onAddToCart: (e: React.MouseEvent | null, opts?: ProductCardAddOpts) => void;
  onToggleWishlist: (e: React.MouseEvent) => void;
  isWishlisted: boolean;
  formatPriceMMK: (price: string | number) => string;
  viewType?: "grid" | "list"; // Add viewType prop
}

export const ProductCard = ({
  product,
  onProductClick,
  onAddToCart,
  onToggleWishlist,
  isWishlisted,
  formatPriceMMK,
  viewType = "grid" // Default to grid
}: ProductCardProps) => {
  const [variantModalOpen, setVariantModalOpen] = useState(false);

  const defaultSelections = useMemo(
    () => initVariantSelections(product),
    [product.id, product.variantOptions?.length, product.variants?.length]
  );
  const resolvedVariant = useMemo(
    () => matchVariantForProduct(product, defaultSelections),
    [product, defaultSelections]
  );
  const showVariantPicker = productHasVariantPicker(product);
  const displayPrice = resolvedVariant?.price ?? product.price;
  const heroImage =
    product.images && product.images.length > 0 ? product.images[0] : product.image;

  const handleAdd = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (showVariantPicker) {
      setVariantModalOpen(true);
      return;
    }
    onAddToCart(e);
  };

  const handleVariantModalConfirm = (args: {
    sku: string;
    price: number;
    image?: string;
    quantity: number;
    buyNow: boolean;
  }) => {
    onAddToCart(null, {
      sku: args.sku,
      price: args.price,
      image: args.image,
      quantity: args.quantity,
      buyNow: args.buyNow,
    });
  };

  // List view layout
  if (viewType === "list") {
    return (
      <>
        {showVariantPicker && (
          <ProductVariantQuickAddModal
            product={product}
            open={variantModalOpen}
            onOpenChange={setVariantModalOpen}
            formatPriceMMK={formatPriceMMK}
            onConfirm={handleVariantModalConfirm}
          />
        )}
        <motion.div
          whileHover={{ y: -2 }}
          transition={{ duration: 0.15, ease: "easeOut" }}
        >
          <Card
            className="group overflow-hidden border-0 hover:shadow-xl transition-all duration-300 cursor-pointer bg-white shadow-md rounded-2xl animate-scale-in w-full"
            onClick={onProductClick}
          >
            <div className="flex gap-4 p-3 md:p-4">
              {/* Product Image */}
              <div className="w-24 h-24 md:w-32 md:h-32 flex-shrink-0 overflow-hidden bg-white relative rounded">
                <LazyImage
                  src={heroImage}
                  alt={product.name}
                  className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                />
              </div>

              {/* Product Info */}
              <div className="flex-1 flex flex-col justify-between py-1">
                <div>
                  {/* Product Name */}
                  <h4 className="font-semibold text-slate-900 text-sm md:text-base leading-tight mb-1.5">
                    {product.name}
                  </h4>

                  {/* Star Rating */}
                  <div className="flex items-center gap-0.5 mb-2">
                    {[...Array(5)].map((_, i) => (
                      <Star key={i} className="w-3 h-3 fill-amber-400 text-amber-400" />
                    ))}
                    <span className="text-xs text-slate-500 ml-1">
                      ({product.salesVolume || 0})
                    </span>
                  </div>
                </div>

                {/* Price and Actions */}
                <div className="flex items-center justify-between">
                  <p className="text-base md:text-lg font-bold text-slate-900">
                    {formatPriceMMK(displayPrice)}
                  </p>

                  {/* Action Buttons */}
                  <div className="flex gap-2">
                    {/* Wishlist Button */}
                    <motion.button
                      className="w-9 h-9 bg-slate-100 hover:bg-amber-600 rounded-lg flex items-center justify-center transition-all group/btn"
                      onClick={onToggleWishlist}
                      whileTap={{ scale: 0.92 }}
                      transition={{ duration: 0.1 }}
                    >
                      <Heart
                        className={`w-4.5 h-4.5 transition-colors ${isWishlisted ? "fill-amber-600 text-amber-600 group-hover/btn:fill-white group-hover/btn:text-white" : "text-slate-600 group-hover/btn:text-white"}`}
                      />
                    </motion.button>

                    {/* Add to Cart Button */}
                    <motion.button
                      className="w-9 h-9 bg-amber-600 hover:bg-amber-700 rounded-lg flex items-center justify-center transition-all"
                      onClick={handleAdd}
                      whileTap={{ scale: 0.92 }}
                      transition={{ duration: 0.1 }}
                    >
                      <Plus className="w-4.5 h-4.5 text-white" />
                    </motion.button>
                  </div>
                </div>
              </div>
            </div>
          </Card>
        </motion.div>
      </>
    );
  }

  // Grid view layout (original)
  return (
    <>
      {showVariantPicker && (
        <ProductVariantQuickAddModal
          product={product}
          open={variantModalOpen}
          onOpenChange={setVariantModalOpen}
          formatPriceMMK={formatPriceMMK}
          onConfirm={handleVariantModalConfirm}
        />
      )}
      <motion.div
        whileHover={{ y: -4 }}
        transition={{ duration: 0.15, ease: "easeOut" }}
      >
        <Card
          className="group overflow-hidden border-0 hover:shadow-xl transition-all duration-300 cursor-pointer flex flex-col gap-3 bg-white shadow-md rounded-lg animate-scale-in w-full"
          onClick={onProductClick}
        >
          {/* Product Image */}
          <div className="aspect-square overflow-hidden bg-white relative">
            <LazyImage
              src={heroImage}
              alt={product.name}
              className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
            />

            {/* Action Buttons - Hidden by default on desktop, shown on hover. Always visible on mobile */}
            <div className="absolute top-2 right-2 md:top-2.5 md:right-2.5 flex flex-col gap-1.5 z-10 md:opacity-0 md:group-hover:opacity-100 transition-opacity duration-200">
              {/* Add to Cart Button */}
              <motion.button
                className="w-7 h-7 md:w-9 md:h-9 bg-white/90 backdrop-blur-sm rounded-lg flex items-center justify-center shadow-md transition-all hover:bg-amber-600 group/btn"
                onClick={handleAdd}
                whileTap={{ scale: 0.92 }}
                transition={{ duration: 0.1 }}
              >
                <Plus className="w-3.5 h-3.5 md:w-4.5 md:h-4.5 text-slate-900 group-hover/btn:text-white transition-colors" />
              </motion.button>

              {/* Wishlist Button */}
              <motion.button
                className="w-7 h-7 md:w-9 md:h-9 bg-white/90 backdrop-blur-sm rounded-lg flex items-center justify-center shadow-md transition-all hover:bg-amber-600 group/btn"
                onClick={onToggleWishlist}
                whileTap={{ scale: 0.92 }}
                transition={{ duration: 0.1 }}
              >
                <Heart
                  className={`w-3.5 h-3.5 md:w-4.5 md:h-4.5 transition-colors ${isWishlisted ? "fill-amber-600 text-amber-600 group-hover/btn:fill-white group-hover/btn:text-white" : "text-slate-600 group-hover/btn:text-white"}`}
                />
              </motion.button>
            </div>
          </div>

          {/* Product Info */}
          <div className="px-2 pb-2">
            {/* Product Name */}
            <h4 className="font-semibold text-slate-900 text-sm leading-tight truncate mb-0.5">
              {product.name.length > 30 ? (
                <>
                  {product.name.substring(0, 30)}
                  <span className="text-slate-400">...</span>
                  <span className="text-slate-400 text-xs">readmore</span>
                </>
              ) : (
                product.name
              )}
            </h4>

            {/* Star Rating */}
            <div className="flex items-center gap-0.5 mb-1">
              {[...Array(5)].map((_, i) => (
                <Star key={i} className="w-2.5 h-2.5 fill-amber-400 text-amber-400" />
              ))}
              <span className="text-[10px] text-slate-500 ml-1">
                ({product.salesVolume || 0})
              </span>
            </div>

            {/* Price */}
            <div className="text-sm text-slate-900">
              <span className="text-base font-bold">{formatPriceMMK(displayPrice).replace(" MMK", "")}</span>
              <span className="text-[11px] ml-1 font-semibold text-slate-900">MMK</span>
            </div>
          </div>
        </Card>
      </motion.div>
    </>
  );
};
