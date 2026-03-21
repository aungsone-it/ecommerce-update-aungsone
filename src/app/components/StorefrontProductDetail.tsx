import { ArrowLeft, ShoppingCart, Heart, Share2, Star, Truck, Shield, RefreshCw } from "lucide-react";
import { Button } from "./ui/button";
import { Badge } from "./ui/badge";
import { Separator } from "./ui/separator";
import { useState } from "react";
import { RichTextEditor } from "./RichTextEditor";

interface Product {
  id: string;
  image: string;
  name: string;
  status: "active" | "off-shelf";
  inventory: number;
  category: string;
  price: string;
  sku: string;
  vendor: string;
  collaborator: string;
  salesVolume: number;
  createDate: string;
  description?: string;
  variantOptions?: { name: string; values: string[] }[];
  variants?: { options: Record<string, string>; price: string; inventory: number; sku: string }[];
  hasVariants?: boolean;
}

interface StorefrontProductDetailProps {
  product: Product;
  onBack: () => void;
}

export function StorefrontProductDetail({ product, onBack }: StorefrontProductDetailProps) {
  const [quantity, setQuantity] = useState(1);
  
  // Extract variant data from product
  const productData = product as any;
  const variantOptions = productData.variantOptions || [];
  const variants = productData.variants || [];
  const hasVariants = productData.hasVariants && variants.length > 0;
  
  // 🔍 DEBUG: Log product data structure
  console.log('🔍 Selected Product Data:', {
    hasVariants: productData.hasVariants,
    variantOptionsCount: variantOptions.length,
    variantsCount: variants.length,
    variantOptions,
    variants,
    fullProduct: productData
  });
  
  // Initialize selected options based on first variant value
  const initialOptions: Record<string, string> = {};
  variantOptions.forEach((opt: any) => {
    if (opt.values && opt.values.length > 0) {
      initialOptions[opt.name] = opt.values[0];
    }
  });
  
  const [selectedOptions, setSelectedOptions] = useState<Record<string, string>>(initialOptions);
  
  // Find current variant based on selected options
  const currentVariant = hasVariants 
    ? variants.find((v: any) => {
        // Match variant based on option1, option2, option3 fields
        const optionNames = variantOptions.map((opt: any) => opt.name);
        
        // Build an array of the variant's option values
        const variantValues = [v.option1, v.option2, v.option3].filter(Boolean);
        
        // Check if all selected options match the variant
        return optionNames.every((optionName: string, idx: number) => {
          return selectedOptions[optionName] === variantValues[idx];
        });
      })
    : null;
  
  // Use variant data if available, otherwise use product data
  const displayPrice = currentVariant ? currentVariant.price : product.price;
  const displayInventory = currentVariant ? currentVariant.inventory : product.inventory;
  const displaySku = currentVariant ? currentVariant.sku : product.sku;
  
  // Fallback sizes for demo (if no variants)
  const [selectedSize, setSelectedSize] = useState("M");
  const sizes = ["XS", "S", "M", "L", "XL", "XXL"];
  
  return (
    <div className="min-h-screen bg-white pb-20">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-white border-b border-slate-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-3 sm:py-4">
          <div className="flex items-center justify-between">
            <button
              onClick={onBack}
              className="flex items-center gap-2 text-slate-600 hover:text-slate-900 transition-colors"
            >
              <ArrowLeft className="w-5 h-5" />
              <span className="font-medium text-sm sm:text-base">Back to Admin</span>
            </button>
            <div className="flex items-center gap-2 sm:gap-4">
              <Button variant="outline" size="sm">
                <Share2 className="w-4 h-4 sm:mr-2" />
                <span className="hidden sm:inline">Share</span>
              </Button>
              <Button variant="outline" size="sm">
                <Heart className="w-4 h-4" />
              </Button>
            </div>
          </div>
        </div>
      </div>

      {/* Product Detail */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6 sm:py-12">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 sm:gap-12">
          {/* Left - Product Images */}
          <div className="space-y-3 sm:space-y-4">
            <div className="aspect-square rounded-xl sm:rounded-2xl overflow-hidden bg-slate-100 border border-slate-200">
              <img
                src={product.image}
                alt={product.name}
                className="w-full h-full object-cover"
              />
            </div>
            <div className="grid grid-cols-4 gap-2 sm:gap-4">
              {[1, 2, 3, 4].map((i) => (
                <div
                  key={i}
                  className="aspect-square rounded-lg overflow-hidden bg-slate-100 border border-slate-200 cursor-pointer hover:border-slate-400 transition-colors"
                >
                  <img
                    src={product.image}
                    alt={`${product.name} ${i}`}
                    className="w-full h-full object-cover"
                  />
                </div>
              ))}
            </div>
          </div>

          {/* Right - Product Info */}
          <div className="space-y-4 sm:space-y-6">
            {/* Title and Price */}
            <div>
              <div className="flex items-start justify-between mb-2">
                <div className="flex-1 pr-2">
                  <h1 className="text-xl sm:text-2xl font-semibold text-slate-900 mb-2">
                    {product.name}
                  </h1>
                  <div className="flex items-center gap-2 mb-3">
                    <div className="flex items-center gap-1">
                      {[1, 2, 3, 4, 5].map((star) => (
                        <Star
                          key={star}
                          className="w-3.5 h-3.5 sm:w-4 sm:h-4 fill-yellow-400 text-yellow-400"
                        />
                      ))}
                    </div>
                    <span className="text-xs sm:text-sm text-slate-600">
                      (128 reviews)
                    </span>
                  </div>
                </div>
                <Badge
                  variant={product.status === "active" ? "default" : "secondary"}
                  className={
                    product.status === "active"
                      ? "bg-green-100 text-green-800 hover:bg-green-100 flex-shrink-0"
                      : "bg-slate-100 text-slate-800 hover:bg-slate-100 flex-shrink-0"
                  }
                >
                  {product.status === "active" ? "In Stock" : "Out of Stock"}
                </Badge>
              </div>
              <div className="flex items-baseline gap-2 sm:gap-3">
                <span className="text-xl sm:text-2xl font-bold text-slate-900">
                  {displayPrice}
                </span>
                <span className="text-xs sm:text-sm text-slate-500 line-through">
                  ${(parseFloat(displayPrice.replace('$', '')) * 1.3).toFixed(2)}
                </span>
                <Badge variant="destructive" className="bg-red-500 text-xs">
                  30% OFF
                </Badge>
              </div>
            </div>

            <Separator />

            {/* Description */}
            <div>
              <h3 className="font-semibold text-slate-900 mb-3 text-base sm:text-lg">Description</h3>
              {product.description ? (
                <div className="prose prose-slate prose-sm sm:prose-base max-w-none">
                  <RichTextEditor
                    value={product.description}
                    onChange={() => {}} // Read-only, no onChange needed
                    readOnly={true}
                  />
                </div>
              ) : (
                <p className="text-sm sm:text-base text-slate-600 leading-relaxed">
                  Experience premium quality with our {product.name}. Crafted with attention to detail 
                  and designed for those who appreciate excellence. Perfect for everyday use or special occasions.
                </p>
              )}
            </div>

            <Separator />

            {/* Variant Options - Dynamic based on product data */}
            {hasVariants && variantOptions.length > 0 ? (
              variantOptions.map((option: any) => (
                <div key={option.name}>
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="font-semibold text-slate-900 text-sm sm:text-base">{option.name}</h3>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {option.values.map((value: string) => (
                      <button
                        key={value}
                        onClick={() => setSelectedOptions(prev => ({ ...prev, [option.name]: value }))}
                        className={`py-2 sm:py-3 px-3 sm:px-4 border-2 rounded-lg font-medium transition-all text-sm sm:text-base ${
                          selectedOptions[option.name] === value
                            ? "border-slate-900 bg-slate-900 text-white"
                            : "border-slate-200 bg-white text-slate-900 hover:border-slate-400"
                        }`}
                      >
                        {value}
                      </button>
                    ))}
                  </div>
                </div>
              ))
            ) : (
              // Fallback Size Selection for products without variants
              <div>
                <div className="flex items-center justify-between mb-3">
                  <h3 className="font-semibold text-slate-900 text-sm sm:text-base">Size</h3>
                  <button className="text-xs sm:text-sm text-blue-600 hover:underline">
                    Size Guide
                  </button>
                </div>
                <div className="grid grid-cols-6 gap-2">
                  {sizes.map((size) => (
                    <button
                      key={size}
                      onClick={() => setSelectedSize(size)}
                      className={`py-2 sm:py-3 px-2 sm:px-4 border-2 rounded-lg font-medium transition-all text-sm sm:text-base ${
                        selectedSize === size
                          ? "border-slate-900 bg-slate-900 text-white"
                          : "border-slate-200 bg-white text-slate-900 hover:border-slate-400"
                      }`}
                    >
                      {size}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Quantity */}
            <div>
              <h3 className="font-semibold text-slate-900 mb-3 text-sm sm:text-base">Quantity</h3>
              <div className="flex items-center gap-3">
                <div className="flex items-center border border-slate-300 rounded-lg">
                  <button
                    onClick={() => setQuantity(Math.max(1, quantity - 1))}
                    className="px-3 sm:px-4 py-2 sm:py-3 hover:bg-slate-50 transition-colors text-lg"
                  >
                    -
                  </button>
                  <span className="px-4 sm:px-6 py-2 sm:py-3 font-medium border-x border-slate-300 min-w-[50px] sm:min-w-[60px] text-center">
                    {quantity}
                  </span>
                  <button
                    onClick={() => setQuantity(Math.min(displayInventory, quantity + 1))}
                    className="px-3 sm:px-4 py-2 sm:py-3 hover:bg-slate-50 transition-colors text-lg"
                  >
                    +
                  </button>
                </div>
                <span className="text-xs sm:text-sm text-slate-600">
                  {displayInventory} available
                </span>
              </div>
            </div>

            {/* Add to Cart */}
            <div className="flex gap-3 pt-4">
              <Button className="flex-1 h-12 sm:h-14 text-sm sm:text-base bg-slate-900 hover:bg-slate-800">
                <ShoppingCart className="w-4 h-4 sm:w-5 sm:h-5 mr-2" />
                Add to Cart
              </Button>
              <Button variant="outline" className="h-12 sm:h-14 px-4 sm:px-6">
                <Heart className="w-4 h-4 sm:w-5 sm:h-5" />
              </Button>
            </div>

            <Separator />

            {/* Features */}
            <div className="space-y-3 sm:space-y-4">
              <div className="flex items-start gap-3">
                <Truck className="w-4 h-4 sm:w-5 sm:h-5 text-slate-600 mt-0.5 flex-shrink-0" />
                <div>
                  <p className="font-medium text-slate-900 text-sm sm:text-base">Free Shipping</p>
                  <p className="text-xs sm:text-sm text-slate-600">
                    On orders over $50
                  </p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <RefreshCw className="w-4 h-4 sm:w-5 sm:h-5 text-slate-600 mt-0.5 flex-shrink-0" />
                <div>
                  <p className="font-medium text-slate-900 text-sm sm:text-base">Easy Returns</p>
                  <p className="text-xs sm:text-sm text-slate-600">
                    30-day return policy
                  </p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <Shield className="w-4 h-4 sm:w-5 sm:h-5 text-slate-600 mt-0.5 flex-shrink-0" />
                <div>
                  <p className="font-medium text-slate-900 text-sm sm:text-base">Secure Payment</p>
                  <p className="text-xs sm:text-sm text-slate-600">
                    Your payment information is safe
                  </p>
                </div>
              </div>
            </div>

            {/* Product Details */}
            <Separator />
            <div>
              <h3 className="font-semibold text-slate-900 mb-3 text-sm sm:text-base">Product Details</h3>
              <div className="space-y-2 text-xs sm:text-sm">
                <div className="flex justify-between">
                  <span className="text-slate-600">SKU:</span>
                  <span className="text-slate-900 font-medium">{displaySku}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-600">Category:</span>
                  <span className="text-slate-900 font-medium">{product.category}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-600">Vendor:</span>
                  <span className="text-slate-900 font-medium">{product.vendor}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-600">Collaborator:</span>
                  <span className="text-slate-900 font-medium">{product.collaborator}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-600">Total Sold:</span>
                  <span className="text-slate-900 font-medium">{product.salesVolume.toLocaleString()} units</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}