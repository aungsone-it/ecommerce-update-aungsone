import { useState, useEffect, useMemo } from "react";
import { Plus, Heart, Star } from "lucide-react";
import { Card } from "./ui/card";
import { LazyImage } from "./LazyImage";
import { motion } from "motion/react";
import {
  ProductVariantChips,
  initVariantSelections,
  matchVariantForProduct,
  productHasVariantPicker,
  type VariantProduct,
} from "./ProductVariantChips";

export type ProductCardProduct = VariantProduct & {
  image: string;
  images?: string[];
  name: string;
  price: string;
  salesVolume?: number;
  sku?: string;
};

interface ProductCardProps {
  product: ProductCardProduct;
  onProductClick: () => void;
  onAddToCart: (e: React.MouseEvent, cartVariant?: { sku: string; price: string; image?: string }) => void;
  onToggleWishlist: (e: React.MouseEvent) => void;
  isWishlisted: boolean;
  formatPriceMMK: (price: string) => string;
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
  const [variantSelections, setVariantSelections] = useState<Record<string, string>>({});

  useEffect(() => {
    setVariantSelections(initVariantSelections(product));
  }, [product.id, product.variantOptions?.length, product.variants?.length]);

  const resolvedVariant = useMemo(
    () => matchVariantForProduct(product, variantSelections),
    [product, variantSelections]
  );
  const showVariantPicker = productHasVariantPicker(product);
  const displayPrice = resolvedVariant?.price ?? product.price;
  const heroImage =
    product.images && product.images.length > 0 ? product.images[0] : product.image;

  const handleAdd = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (showVariantPicker && resolvedVariant) {
      onAddToCart(e, {
        sku: resolvedVariant.sku,
        price: resolvedVariant.price,
        image: heroImage,
      });
    } else {
      onAddToCart(e);
    }
  };

  // List view layout
  if (viewType === "list") {
    return (
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

              {showVariantPicker && (
                <div className="mb-2 mt-1">
                  <ProductVariantChips
                    product={product}
                    selections={variantSelections}
                    onChange={setVariantSelections}
                    size="list"
                  />
                </div>
              )}
            </div>
            
            {/* Price and Actions */}
            <div className="flex items-center justify-between">
              <p className="text-base md:text-lg font-bold text-gray-700">
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
    );
  }
  
  // Grid view layout (original)
  return (
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
            <Plus className="w-3.5 h-3.5 md:w-4.5 md:h-4.5 text-orange-600 group-hover/btn:text-white transition-colors" />
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
              {product.name.substring(0, 30)}<span className="text-slate-400">...</span><span className="text-slate-400 text-xs">readmore</span>
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

        {showVariantPicker && (
          <div className="mb-1.5" onClick={(e) => e.stopPropagation()}>
            <ProductVariantChips
              product={product}
              selections={variantSelections}
              onChange={setVariantSelections}
              size="grid"
            />
          </div>
        )}
        
        {/* Price */}
        <div className="text-sm text-gray-700">
          <span className="text-base font-bold">{formatPriceMMK(displayPrice).replace(' MMK', '')}</span>
          <span className="text-[11px] ml-1 text-orange-600 font-semibold">MMK</span>
        </div>
      </div>
      </Card>
    </motion.div>
  );
};