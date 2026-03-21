import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router";
import { ArrowLeft, Package, Loader2 } from "lucide-react";
import { Button } from "../components/ui/button";
import { Badge } from "../components/ui/badge";
import { Card } from "../components/ui/card";
import { projectId, publicAnonKey } from "../../../utils/supabase/info";
import { useVendorAuth } from "../contexts/VendorAuthContext";

interface Product {
  id: string;
  name: string;
  sku: string;
  price: number;
  compareAtPrice?: number;
  costPerItem?: number;
  description: string;
  images: string[];
  category: string;
  inventory: number;
  status: string;
  vendor?: string;
  hasVariants?: boolean;
  variants?: any[];
  variantOptions?: { name: string; values: string[] }[];
  tags?: string[];
  productType?: string;
  weight?: string;
  barcode?: string;
  trackQuantity?: boolean;
  continueSellingOutOfStock?: boolean;
  createdAt?: string;
  updatedAt?: string;
}

// Helper to strip HTML tags from description
const stripHtml = (html: string) => {
  const tmp = document.createElement("div");
  tmp.innerHTML = html;
  return tmp.textContent || tmp.innerText || "";
};

export function VendorAdminProductViewPage() {
  const { storeName, productId } = useParams();
  const navigate = useNavigate();
  const { vendor } = useVendorAuth();
  const [product, setProduct] = useState<Product | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (vendor?.vendorId && productId) {
      loadProduct();
    }
  }, [vendor?.vendorId, productId]);

  const loadProduct = async () => {
    if (!vendor?.vendorId || !productId) return;
    
    setLoading(true);
    try {
      const response = await fetch(
        `https://${projectId}.supabase.co/functions/v1/make-server-16010b6f/vendor/products-admin/${vendor.vendorId}`,
        {
          headers: { Authorization: `Bearer ${publicAnonKey}` },
        }
      );
      
      const data = await response.json();
      if (data.products) {
        const foundProduct = data.products.find((p: Product) => p.id === productId);
        setProduct(foundProduct || null);
      }
    } catch (error) {
      console.error("Failed to load product:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleBack = () => {
    navigate(`/vendor/${storeName}/admin/products`);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen bg-slate-50">
        <div className="text-center space-y-4">
          <Loader2 className="w-12 h-12 animate-spin text-purple-600 mx-auto" />
          <p className="text-slate-600 font-medium">Loading product details...</p>
        </div>
      </div>
    );
  }

  if (!product) {
    return (
      <div className="flex items-center justify-center h-screen bg-slate-50">
        <div className="text-center space-y-4">
          <Package className="w-16 h-16 text-slate-300 mx-auto" />
          <h2 className="text-2xl font-bold text-slate-900">Product Not Found</h2>
          <p className="text-slate-600">The product you're looking for doesn't exist.</p>
          <Button onClick={handleBack} className="mt-4">
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back to Products
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Header */}
      <div className="bg-white border-b border-slate-200 sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Button
                variant="ghost"
                size="sm"
                onClick={handleBack}
                className="text-slate-600 hover:text-slate-900"
              >
                <ArrowLeft className="w-4 h-4 mr-2" />
                Back to Products
              </Button>
              <div className="h-6 w-px bg-slate-200" />
              <h1 className="text-2xl font-bold text-slate-900">Product Details</h1>
            </div>
            <Badge 
              variant="secondary"
              className={
                product.status === "active" || product.status === "Active"
                  ? "bg-green-100 text-green-700 border-green-200 text-sm px-3 py-1"
                  : "bg-slate-100 text-slate-700 border-slate-200 text-sm px-3 py-1"
              }
            >
              {product.status === "off-shelf" ? "Off Shelf" : product.status === "active" || product.status === "Active" ? "Active" : product.status}
            </Badge>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-7xl mx-auto px-6 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left Column - Main Info */}
          <div className="lg:col-span-2 space-y-6">
            {/* Product Images */}
            {product.images && product.images.length > 0 && (
              <Card className="p-6">
                <h3 className="text-lg font-semibold text-slate-900 mb-4">Product Images</h3>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                  {product.images.map((img, idx) => (
                    <img
                      key={idx}
                      src={img}
                      alt={`${product.name} - ${idx + 1}`}
                      className="w-full h-48 object-cover rounded-lg border border-slate-200 hover:shadow-lg transition-shadow"
                      onError={(e) => {
                        e.currentTarget.src = "https://images.unsplash.com/photo-1505740420928-5e560c06d30e?w=300&h=200&fit=crop";
                      }}
                    />
                  ))}
                </div>
              </Card>
            )}

            {/* Basic Information */}
            <Card className="p-6">
              <h3 className="text-lg font-semibold text-slate-900 mb-4">Basic Information</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <label className="text-xs font-medium text-slate-500 uppercase tracking-wide">Product Name</label>
                  <p className="text-base font-semibold text-slate-900 mt-1">{product.name}</p>
                </div>
                <div>
                  <label className="text-xs font-medium text-slate-500 uppercase tracking-wide">SKU</label>
                  <p className="text-base font-mono text-slate-900 mt-1">{product.sku}</p>
                </div>
                <div>
                  <label className="text-xs font-medium text-slate-500 uppercase tracking-wide">Category</label>
                  <p className="text-base text-slate-900 mt-1">{product.category || "Uncategorized"}</p>
                </div>
                <div>
                  <label className="text-xs font-medium text-slate-500 uppercase tracking-wide">Product Type</label>
                  <p className="text-base text-slate-900 mt-1">{product.productType || "—"}</p>
                </div>
              </div>
            </Card>

            {/* Description */}
            {product.description && (
              <Card className="p-6">
                <h3 className="text-lg font-semibold text-slate-900 mb-4">Description</h3>
                <div className="prose max-w-none">
                  <p className="text-sm text-slate-700 whitespace-pre-wrap leading-relaxed">
                    {stripHtml(product.description)}
                  </p>
                </div>
              </Card>
            )}

            {/* Variants */}
            {product.hasVariants && product.variants && product.variants.length > 0 && (
              <Card className="p-6">
                <h3 className="text-lg font-semibold text-slate-900 mb-4">Variants</h3>
                <div className="space-y-3">
                  {product.variants.map((variant: any, idx: number) => (
                    <div key={idx} className="flex items-center gap-4 p-4 bg-slate-50 rounded-lg border border-slate-200">
                      {variant.image && (
                        <img 
                          src={variant.image} 
                          alt={variant.name}
                          className="w-16 h-16 rounded object-cover border border-slate-200"
                        />
                      )}
                      <div className="flex-1">
                        <p className="font-semibold text-slate-900">{variant.name}</p>
                        <p className="text-sm text-slate-500">SKU: {variant.sku}</p>
                      </div>
                      <div className="text-right">
                        <p className="font-bold text-slate-900">{Math.round(variant.price).toLocaleString()} MMK</p>
                        <p className="text-sm text-slate-500">Stock: {variant.inventory}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </Card>
            )}

            {/* Tags */}
            {product.tags && product.tags.length > 0 && (
              <Card className="p-6">
                <h3 className="text-lg font-semibold text-slate-900 mb-4">Tags</h3>
                <div className="flex flex-wrap gap-2">
                  {product.tags.map((tag, idx) => (
                    <Badge key={idx} variant="secondary" className="bg-blue-50 text-blue-700 border-blue-200">
                      {tag}
                    </Badge>
                  ))}
                </div>
              </Card>
            )}
          </div>

          {/* Right Column - Sidebar */}
          <div className="space-y-6">
            {/* Pricing */}
            <Card className="p-6">
              <h3 className="text-lg font-semibold text-slate-900 mb-4">Pricing</h3>
              <div className="space-y-4">
                <div>
                  <label className="text-xs font-medium text-slate-500 uppercase tracking-wide">Price</label>
                  <p className="text-2xl font-bold text-slate-900 mt-1">
                    {Math.round(product.price).toLocaleString()} MMK
                  </p>
                </div>
                {product.compareAtPrice && (
                  <div>
                    <label className="text-xs font-medium text-slate-500 uppercase tracking-wide">Compare At Price</label>
                    <p className="text-lg text-slate-600 mt-1 line-through">
                      {Math.round(product.compareAtPrice).toLocaleString()} MMK
                    </p>
                  </div>
                )}
                {product.costPerItem && (
                  <div>
                    <label className="text-xs font-medium text-slate-500 uppercase tracking-wide">Cost Per Item</label>
                    <p className="text-lg text-slate-900 mt-1">
                      {Math.round(product.costPerItem).toLocaleString()} MMK
                    </p>
                  </div>
                )}
              </div>
            </Card>

            {/* Inventory */}
            <Card className="p-6">
              <h3 className="text-lg font-semibold text-slate-900 mb-4">Inventory</h3>
              <div className="space-y-4">
                <div>
                  <label className="text-xs font-medium text-slate-500 uppercase tracking-wide">Available</label>
                  <p className="text-2xl font-bold text-slate-900 mt-1">{product.inventory} units</p>
                </div>
                {product.barcode && (
                  <div>
                    <label className="text-xs font-medium text-slate-500 uppercase tracking-wide">Barcode</label>
                    <p className="text-base font-mono text-slate-900 mt-1">{product.barcode}</p>
                  </div>
                )}
                {product.weight && (
                  <div>
                    <label className="text-xs font-medium text-slate-500 uppercase tracking-wide">Weight</label>
                    <p className="text-base text-slate-900 mt-1">{product.weight}</p>
                  </div>
                )}
              </div>
            </Card>

            {/* Timestamps */}
            {(product.createdAt || product.updatedAt) && (
              <Card className="p-6">
                <h3 className="text-lg font-semibold text-slate-900 mb-4">Timestamps</h3>
                <div className="space-y-3">
                  {product.createdAt && (
                    <div>
                      <label className="text-xs font-medium text-slate-500 uppercase tracking-wide">Created</label>
                      <p className="text-sm text-slate-900 mt-1">
                        {new Date(product.createdAt).toLocaleString()}
                      </p>
                    </div>
                  )}
                  {product.updatedAt && (
                    <div>
                      <label className="text-xs font-medium text-slate-500 uppercase tracking-wide">Last Updated</label>
                      <p className="text-sm text-slate-900 mt-1">
                        {new Date(product.updatedAt).toLocaleString()}
                      </p>
                    </div>
                  )}
                </div>
              </Card>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
