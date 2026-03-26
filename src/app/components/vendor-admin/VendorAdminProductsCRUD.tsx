import { useState, useEffect } from "react";
import { useNavigate, useParams, useLocation } from "react-router";
import { 
  Plus, 
  Search, 
  Eye,
  Package,
  RefreshCw,
} from "lucide-react";
import { Button } from "../ui/button";
import { Card } from "../ui/card";
import { Input } from "../ui/input";
import { Badge } from "../ui/badge";
import { Skeleton } from "../ui/skeleton";
import { Checkbox } from "../ui/checkbox";
import { toast } from "sonner";
import {
  getCachedVendorProductsAdmin,
  invalidateVendorProductsAdminCache,
  primeVendorProductsAdminCache,
  invalidateProductByIdCache,
  moduleCache,
  CACHE_KEYS,
} from "../../utils/module-cache";
import { VendorAdminAddProduct } from "./VendorAdminAddProduct";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../ui/select";
import { Tabs, TabsList, TabsTrigger } from "../ui/tabs";

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

interface VendorAdminProductsCRUDProps {
  vendorId: string;
  vendorName: string;
}

export function VendorAdminProductsCRUD({ vendorId, vendorName }: VendorAdminProductsCRUDProps) {
  const navigate = useNavigate();
  const params = useParams();
  const location = useLocation();
  const adminPrefix = location.pathname.startsWith("/store/") ? "store" : "vendor";
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(
    () =>
      moduleCache.peek(CACHE_KEYS.vendorProductsAdmin(vendorId)) == null
  );
  const [listRefreshing, setListRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "active" | "off-shelf">("all");
  const [sortBy, setSortBy] = useState("newest");
  const [selectedProducts, setSelectedProducts] = useState<string[]>([]);
  
  // View states
  const [currentView, setCurrentView] = useState<"list" | "add" | "edit">("list");
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);

  useEffect(() => {
    if (currentView === "list") {
      loadProducts(false);
    }
  }, [vendorId, currentView]);

  const loadProducts = async (forceRefresh = false) => {
    if (!forceRefresh && currentView === "list") {
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
    try {
      const data = await getCachedVendorProductsAdmin(vendorId, forceRefresh);
      setProducts(data.products || []);
    } catch (error) {
      console.error("Error loading products:", error);
      toast.error("Failed to load products");
    } finally {
      setLoading(false);
      setListRefreshing(false);
    }
  };

  const handleAddClick = () => {
    setEditingProduct(null);
    setCurrentView("add");
  };

  const handleBackToList = () => {
    setEditingProduct(null);
    setCurrentView("list");
  };

  const handleProductSaved = (responseData?: unknown) => {
    const saved =
      responseData &&
      typeof responseData === "object" &&
      responseData !== null &&
      "product" in responseData
        ? (responseData as { product?: Product }).product
        : undefined;
    const savedId = editingProduct?.id;
    if (savedId) invalidateProductByIdCache(savedId);
    if (saved) {
      const patch = saved;
      setProducts((prev) => {
        const idx = prev.findIndex((x) => x.id === patch.id);
        const next =
          idx >= 0
            ? prev.map((x, i) => (i === idx ? { ...x, ...patch } : x))
            : [patch, ...prev];
        primeVendorProductsAdminCache(vendorId, next);
        return next;
      });
    } else {
      invalidateVendorProductsAdminCache(vendorId);
    }
    setEditingProduct(null);
    setCurrentView("list");
  };

  const filteredProducts = products.filter(product => {
    const matchesSearch = product.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      product.sku.toLowerCase().includes(searchQuery.toLowerCase());
    
    const matchesStatus = statusFilter === "all" || 
      (statusFilter === "active" && (product.status === "active" || product.status === "Active")) ||
      (statusFilter === "off-shelf" && product.status === "off-shelf");
    
    return matchesSearch && matchesStatus;
  });

  // Sort products
  const sortedProducts = [...filteredProducts].sort((a, b) => {
    if (sortBy === "newest") {
      return new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime();
    } else {
      return new Date(a.createdAt || 0).getTime() - new Date(b.createdAt || 0).getTime();
    }
  });

  // Get status counts
  const getStatusCount = (status: "all" | "active" | "off-shelf") => {
    if (status === "all") return products.length;
    if (status === "active") return products.filter(p => p.status === "active" || p.status === "Active").length;
    if (status === "off-shelf") return products.filter(p => p.status === "off-shelf").length;
    return 0;
  };

  // Toggle select product
  const toggleSelectProduct = (productId: string) => {
    setSelectedProducts(prev => 
      prev.includes(productId) 
        ? prev.filter(id => id !== productId)
        : [...prev, productId]
    );
  };

  // Toggle select all
  const toggleSelectAll = () => {
    if (selectedProducts.length === sortedProducts.length && sortedProducts.length > 0) {
      setSelectedProducts([]);
    } else {
      setSelectedProducts(sortedProducts.map(p => p.id));
    }
  };

  // Show Add/Edit Product Page
  if (currentView === "add" || currentView === "edit") {
    return (
      <VendorAdminAddProduct
        vendorId={vendorId}
        vendorName={vendorName}
        editingProduct={editingProduct}
        onBack={handleBackToList}
        onProductSaved={handleProductSaved}
      />
    );
  }

  // Show Product List
  if (loading) {
    return (
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <Skeleton className="h-10 w-48 mb-2" />
            <Skeleton className="h-5 w-64" />
          </div>
          <Skeleton className="h-10 w-52" />
        </div>

        <div className="flex flex-col lg:flex-row items-start lg:items-center gap-4">
          <Skeleton className="h-10 flex-1 min-w-[280px]" />
          <Skeleton className="h-10 w-80" />
          <Skeleton className="h-10 w-[180px]" />
        </div>

        <Card>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50">
                  <th className="py-3 px-4"><Skeleton className="h-4 w-4" /></th>
                  <th className="py-3 px-4"><Skeleton className="h-4 w-20" /></th>
                  <th className="py-3 px-4"><Skeleton className="h-4 w-16" /></th>
                  <th className="py-3 px-4"><Skeleton className="h-4 w-20" /></th>
                  <th className="py-3 px-4"><Skeleton className="h-4 w-20" /></th>
                  <th className="py-3 px-4"><Skeleton className="h-4 w-16" /></th>
                  <th className="py-3 px-4"><Skeleton className="h-4 w-16" /></th>
                </tr>
              </thead>
              <tbody>
                {[...Array(5)].map((_, i) => (
                  <tr key={i} className="border-b border-slate-100">
                    <td className="py-3 px-4"><Skeleton className="h-4 w-4" /></td>
                    <td className="py-3 px-4">
                      <div className="flex items-center gap-3">
                        <Skeleton className="h-12 w-12 rounded-lg" />
                        <div className="space-y-2">
                          <Skeleton className="h-4 w-32" />
                          <Skeleton className="h-3 w-24" />
                        </div>
                      </div>
                    </td>
                    <td className="py-3 px-4"><Skeleton className="h-6 w-16" /></td>
                    <td className="py-3 px-4"><Skeleton className="h-4 w-12" /></td>
                    <td className="py-3 px-4"><Skeleton className="h-4 w-24" /></td>
                    <td className="py-3 px-4"><Skeleton className="h-4 w-20" /></td>
                    <td className="py-3 px-4"><Skeleton className="h-8 w-8" /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-slate-900">Products</h1>
          <p className="text-slate-500 mt-1">Manage your product inventory</p>
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
          <Button onClick={handleAddClick} className="bg-blue-600 hover:bg-blue-700 text-white" disabled>
            <Plus className="w-4 h-4 mr-2" />
            Add Product (Read-Only)
          </Button>
        </div>
      </div>

      {/* Search + Filters Bar */}
      <div className="flex flex-col lg:flex-row items-start lg:items-center gap-4">
        {/* Search */}
        <div className="flex-1 relative min-w-[280px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <Input
            placeholder="Search products by name or SKU..."
            className="pl-10"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
        
        {/* Status Filter Tabs */}
        <Tabs value={statusFilter} onValueChange={(val) => setStatusFilter(val as any)}>
          <TabsList>
            <TabsTrigger value="all" className="gap-2">
              All Status
              <Badge variant="secondary" className="bg-slate-200 text-slate-700 text-xs">
                {getStatusCount("all")}
              </Badge>
            </TabsTrigger>
            <TabsTrigger value="active" className="gap-2">
              Active
              <Badge variant="secondary" className="bg-green-100 text-green-700 text-xs">
                {getStatusCount("active")}
              </Badge>
            </TabsTrigger>
            <TabsTrigger value="off-shelf" className="gap-2">
              Off Shelf
              <Badge variant="secondary" className="bg-slate-200 text-slate-700 text-xs">
                {getStatusCount("off-shelf")}
              </Badge>
            </TabsTrigger>
          </TabsList>
        </Tabs>

        {/* Sort Dropdown */}
        <Select value={sortBy} onValueChange={setSortBy}>
          <SelectTrigger className="w-full lg:w-[180px]">
            <SelectValue placeholder="Newest First" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="newest">Newest First</SelectItem>
            <SelectItem value="oldest">Oldest First</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Products Table */}
      {sortedProducts.length === 0 ? (
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
        <Card>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50">
                  <th className="text-left py-3 px-4 w-12">
                    <Checkbox
                      checked={selectedProducts.length === sortedProducts.length && sortedProducts.length > 0}
                      onCheckedChange={toggleSelectAll}
                    />
                  </th>
                  <th className="text-left py-3 px-4 font-medium text-slate-600 text-sm">Product</th>
                  <th className="text-left py-3 px-4 font-medium text-slate-600 text-sm">Status</th>
                  <th className="text-left py-3 px-4 font-medium text-slate-600 text-sm">Inventory</th>
                  <th className="text-left py-3 px-4 font-medium text-slate-600 text-sm">Category</th>
                  <th className="text-left py-3 px-4 font-medium text-slate-600 text-sm">Price</th>
                  <th className="text-left py-3 px-4 font-medium text-slate-600 text-sm">Actions</th>
                </tr>
              </thead>
              <tbody>
                {sortedProducts.map((product) => (
                  <tr key={product.id} className="border-b border-slate-100 hover:bg-slate-50">
                    <td className="py-3 px-4">
                      <Checkbox
                        checked={selectedProducts.includes(product.id)}
                        onCheckedChange={() => toggleSelectProduct(product.id)}
                      />
                    </td>
                    <td className="py-3 px-4">
                      <div className="flex items-center gap-3">
                        <img 
                          src={
                            product.images && product.images.length > 0 
                              ? product.images[0]
                              : "https://images.unsplash.com/photo-1505740420928-5e560c06d30e?w=100&h=100&fit=crop"
                          } 
                          alt={product.name}
                          className="w-12 h-12 rounded-lg object-cover border border-slate-200"
                          onError={(e) => {
                            e.currentTarget.src = "https://images.unsplash.com/photo-1505740420928-5e560c06d30e?w=100&h=100&fit=crop";
                          }}
                        />
                        <div>
                          <p className="text-sm font-medium text-slate-900">{product.name}</p>
                          <p className="text-xs text-slate-500">SKU: {product.sku}</p>
                        </div>
                      </div>
                    </td>
                    <td className="py-3 px-4">
                      <Badge 
                        variant="secondary"
                        className={
                          product.status === "active" || product.status === "Active"
                            ? "bg-green-100 text-green-700 border-green-200 hover:bg-green-100"
                            : "bg-slate-100 text-slate-700 border-slate-200 hover:bg-slate-100"
                        }
                      >
                        {product.status === "off-shelf" ? "Off Shelf" : product.status === "active" || product.status === "Active" ? "Active" : product.status}
                      </Badge>
                    </td>
                    <td className="py-3 px-4">
                      <span className="text-sm text-slate-700">{product.inventory}</span>
                    </td>
                    <td className="py-3 px-4 text-sm text-slate-700">{product.category || 'Uncategorized'}</td>
                    <td className="py-3 px-4 text-sm font-semibold text-slate-900">
                      {Math.round(product.price).toLocaleString()} MMK
                    </td>
                    <td className="py-3 px-4">
                      <Button 
                        variant="ghost" 
                        size="sm" 
                        className="h-8 w-8 p-0 text-slate-600 hover:text-slate-900 hover:bg-slate-100"
                        onClick={() =>
                          navigate(
                            `/${adminPrefix}/${params.storeName}/admin/products/${product.id}/view`
                          )
                        }
                        title="View Product Details"
                      >
                        <Eye className="w-4 h-4" />
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* Summary Footer */}
      {sortedProducts.length > 0 && (
        <div className="text-sm text-slate-500 text-center py-4">
          Showing {sortedProducts.length} of {products.length} products
        </div>
      )}
    </div>
  );
}