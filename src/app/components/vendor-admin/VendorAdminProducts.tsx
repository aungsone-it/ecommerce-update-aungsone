import { useState, useEffect } from "react";
import { 
  Plus, 
  Search, 
  Edit, 
  Trash2,
  Package,
  Eye,
  MoreVertical,
  RefreshCw,
} from "lucide-react";
import { Button } from "../ui/button";
import { Card } from "../ui/card";
import { Input } from "../ui/input";
import { Badge } from "../ui/badge";
import { toast } from "sonner";
import { projectId, publicAnonKey } from "../../../../utils/supabase/info";
import {
  getCachedVendorProductsAdmin,
  primeVendorProductsAdminCache,
  invalidateProductByIdCache,
  moduleCache,
  CACHE_KEYS,
} from "../../utils/module-cache";

interface Product {
  id: string;
  name: string;
  sku: string;
  price: number;
  compareAtPrice?: number;
  description: string;
  images: string[];
  category: string;
  inventory: number;
  status: string;
  vendor?: string;
  commissionRate?: number; // 🔥 Commission rate (%)
}

interface VendorAdminProductsProps {
  vendorId: string;
  onNavigateToAdd?: () => void;
  onNavigateToEdit?: (productId: string) => void;
}

export function VendorAdminProducts({ vendorId, onNavigateToAdd, onNavigateToEdit }: VendorAdminProductsProps) {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(
    () => moduleCache.peek(CACHE_KEYS.vendorProductsAdmin(vendorId)) == null
  );
  const [listRefreshing, setListRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [deletingId, setDeletingId] = useState<string | null>(null);

  useEffect(() => {
    loadProducts(false);
  }, [vendorId]);

  const loadProducts = async (forceRefresh = false) => {
    if (!forceRefresh) {
      const cached = moduleCache.peek<{ products?: Product[] }>(
        CACHE_KEYS.vendorProductsAdmin(vendorId)
      );
      if (cached != null && Array.isArray(cached.products)) {
        setProducts(cached.products);
        setLoading(false);
        return;
      }
    }

    setLoading(true);
    setListRefreshing(forceRefresh);
    console.log(`🛠️ [VendorAdminProducts] Loading products for vendor: ${vendorId}`);
    try {
      const data = await getCachedVendorProductsAdmin(vendorId, forceRefresh);
      console.log(`✅ [VendorAdminProducts] Loaded ${data.products?.length || 0} products (module cache)`);
      setProducts(data.products || []);
    } catch (error) {
      console.error("❌ [VendorAdminProducts] Error loading products:", error);
    } finally {
      setLoading(false);
      setListRefreshing(false);
    }
  };

  const handleDelete = async (productId: string, productName: string) => {
    if (!confirm(`Are you sure you want to delete "${productName}"? This action cannot be undone.`)) {
      return;
    }

    setDeletingId(productId);
    console.log(`🗑️ [VendorAdminProducts] Deleting product: ${productId}`);

    // Optimistic UI update - remove from list immediately
    const previousProducts = [...products];
    setProducts(prev => prev.filter(p => p.id !== productId));
    toast.loading("Deleting product...");

    try {
      const response = await fetch(
        `https://${projectId}.supabase.co/functions/v1/make-server-16010b6f/vendor/products/${vendorId}/${productId}`,
        {
          method: "DELETE",
          headers: {
            Authorization: `Bearer ${publicAnonKey}`,
          },
        }
      );

      toast.dismiss();

      if (response.ok) {
        const nextProducts = previousProducts.filter((p) => p.id !== productId);
        primeVendorProductsAdminCache(vendorId, nextProducts);
        invalidateProductByIdCache(productId);
        console.log(`✅ [VendorAdminProducts] Product deleted successfully`);
        toast.success(`"${productName}" deleted successfully!`);
      } else {
        const errorData = await response.json().catch(() => ({ error: response.statusText }));
        console.error(`❌ [VendorAdminProducts] Failed to delete product:`, errorData);
        // Revert optimistic update
        setProducts(previousProducts);
        toast.error("Failed to delete product");
      }
    } catch (error) {
      console.error("❌ [VendorAdminProducts] Error deleting product:", error);
      // Revert optimistic update
      setProducts(previousProducts);
      toast.dismiss();
      toast.error("Failed to delete product");
    } finally {
      setDeletingId(null);
    }
  };

  const filteredProducts = products.filter(product =>
    product.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    product.sku.toLowerCase().includes(searchQuery.toLowerCase())
  );

  // Strip HTML tags from description
  const stripHtml = (html: string) => {
    const tmp = document.createElement("DIV");
    tmp.innerHTML = html;
    return tmp.textContent || tmp.innerText || "";
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-4 border-slate-300 border-t-blue-600 rounded-full animate-spin"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">Products</h1>
          <p className="text-sm text-slate-500 mt-1">Manage your product inventory</p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="outline"
            disabled={listRefreshing || loading}
            onClick={() => loadProducts(true)}
            className="border-slate-300"
          >
            <RefreshCw className={`w-4 h-4 mr-2 ${listRefreshing ? "animate-spin" : ""}`} />
            Refresh
          </Button>
          <Button 
            className="bg-blue-600 hover:bg-blue-700 text-white"
            onClick={onNavigateToAdd}
          >
            <Plus className="w-4 h-4 mr-2" />
            Add Product
          </Button>
        </div>
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
        <Input
          placeholder="Search products by name or SKU..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="pl-10 border-slate-200"
        />
      </div>

      {/* Products List */}
      {filteredProducts.length === 0 ? (
        <Card className="p-12 text-center border-slate-200">
          <Package className="w-16 h-16 text-slate-400 mx-auto mb-4" />
          <h3 className="text-lg font-semibold text-slate-900 mb-2">
            {searchQuery ? "No products found" : "No products yet"}
          </h3>
          <p className="text-slate-600">
            {searchQuery 
              ? "Try adjusting your search" 
              : "Start by adding your first product to your store"}
          </p>
        </Card>
      ) : (
        <div className="space-y-3">
          {filteredProducts.map((product) => (
            <Card key={product.id} className="p-4 border-slate-200 hover:shadow-sm transition-shadow">
              <div className="flex items-start gap-4">
                {/* Product Image */}
                <div className="w-16 h-16 bg-slate-100 rounded-lg overflow-hidden flex-shrink-0">
                  {product.images[0] ? (
                    <img 
                      src={product.images[0]} 
                      alt={product.name}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center">
                      <Package className="w-6 h-6 text-slate-400" />
                    </div>
                  )}
                </div>

                {/* Product Info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-4 mb-1.5">
                    <div className="flex-1">
                      <h3 className="font-medium text-slate-900 text-base mb-0.5">{product.name}</h3>
                      <p className="text-sm text-slate-500">SKU: {product.sku}</p>
                    </div>
                    
                    {/* Action Buttons */}
                    <div className="flex items-center gap-1">
                      <Button 
                        variant="ghost" 
                        size="sm"
                        className="h-8 w-8 p-0"
                        onClick={() => onNavigateToEdit?.(product.id)}
                        title="Edit product"
                      >
                        <Edit className="w-4 h-4 text-slate-600" />
                      </Button>
                      <Button 
                        variant="ghost" 
                        size="sm"
                        className="h-8 w-8 p-0"
                        onClick={() => handleDelete(product.id, product.name)}
                        disabled={deletingId === product.id}
                        title="Delete product"
                      >
                        <Trash2 className="w-4 h-4 text-red-600" />
                      </Button>
                    </div>
                  </div>
                  
                  {/* Description preview */}
                  {product.description && (
                    <p className="text-sm text-slate-600 line-clamp-1 mb-3">
                      {stripHtml(product.description)}
                    </p>
                  )}

                  {/* Metrics Row */}
                  <div className="flex items-center gap-6 text-sm">
                    <div>
                      <span className="text-slate-500">Price</span>
                      <p className="font-semibold text-slate-900 mt-0.5">{product.price} MMK</p>
                    </div>
                    <div>
                      <span className="text-slate-500">Inventory</span>
                      <p className="font-semibold text-slate-900 mt-0.5">{product.inventory} units</p>
                    </div>
                    <div>
                      <span className="text-slate-500">Category</span>
                      <p className="font-medium text-slate-900 mt-0.5">{product.category || '-'}</p>
                    </div>
                    <div>
                      <span className="text-slate-500">Commission</span>
                      <p className="font-semibold text-slate-900 mt-0.5">{product.commissionRate || 0}%</p>
                    </div>
                    <div>
                      <span className="text-slate-500">Status</span>
                      <div className="mt-0.5">
                        <Badge 
                          className={
                            product.status === "active" 
                              ? "bg-green-100 text-green-800 hover:bg-green-100 border-0" 
                              : "bg-slate-100 text-slate-800 hover:bg-slate-100 border-0"
                          }
                        >
                          {product.status === "active" ? "Active" : product.status}
                        </Badge>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      {/* Summary */}
      {filteredProducts.length > 0 && (
        <div className="text-sm text-slate-500 text-center py-2">
          Showing {filteredProducts.length} of {products.length} products
        </div>
      )}
    </div>
  );
}