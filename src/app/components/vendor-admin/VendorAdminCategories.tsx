import { useState, useEffect } from "react";
import { Search, Plus, Edit, Trash2, X, FolderOpen, Info, Eye, RefreshCw } from "lucide-react";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Card } from "../ui/card";
import { Badge } from "../ui/badge";
import { Checkbox } from "../ui/checkbox";
import { Skeleton } from "../ui/skeleton";
import { VendorAdminCategoryForm } from "./VendorAdminCategoryForm";
import { cacheManager } from "../../utils/cacheManager";
import { toast } from "sonner";
import { projectId, publicAnonKey } from "../../../../utils/supabase/info";
import {
  getCachedVendorProductsAdmin,
  invalidateVendorProductsAdminCache,
  moduleCache,
  CACHE_KEYS,
} from "../../utils/module-cache";

interface Product {
  id: string;
  name: string;
  sku: string;
  price: number;
  images: string[];
  category: string;
  inventory: number;
  status: string;
}

interface CategoryInfo {
  name: string;
  productCount: number;
  products: Product[];
  activeProducts: number;
  description: string;
}

interface VendorAdminCategoriesProps {
  vendorId: string;
  vendorName: string;
}

function buildCategoryInfosFromProducts(products: Product[]): CategoryInfo[] {
  const categoryMap = new Map<string, Product[]>();
  products.forEach((product: Product) => {
    if (!product || !product.id) return;
    const categoryName = product.category?.trim() || "Uncategorized";
    if (!categoryMap.has(categoryName)) {
      categoryMap.set(categoryName, []);
    }
    categoryMap.get(categoryName)?.push(product);
  });
  const categoriesArray: CategoryInfo[] = Array.from(categoryMap.entries()).map(([name, prods]) => ({
    name,
    productCount: prods.length,
    products: prods,
    activeProducts: prods.filter(
      (p) => p?.status && (p.status === "active" || p.status === "Active")
    ).length,
    description: name,
  }));
  categoriesArray.sort((a, b) => a.name.localeCompare(b.name));
  return categoriesArray;
}

export function VendorAdminCategories({ vendorId, vendorName }: VendorAdminCategoriesProps) {
  const [categories, setCategories] = useState<CategoryInfo[]>([]);
  const [loading, setLoading] = useState(
    () => !moduleCache.peek(CACHE_KEYS.vendorProductsAdmin(vendorId))
  );
  const [listRefreshing, setListRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategories, setSelectedCategories] = useState<string[]>([]);

  // Register cache invalidation
  useEffect(() => {
    const clearCache = () => {
      console.log("🗑️ Clearing categories cache for vendor:", vendorId);
      invalidateVendorProductsAdminCache(vendorId);
      loadCategories(true);
    };

    cacheManager.registerInvalidation(`vendor:${vendorId}:categories`, clearCache);
    
    // Listen for vendor data updates
    const handleVendorUpdate = (event: CustomEvent) => {
      if (event.detail.vendorId === vendorId) {
        clearCache();
      }
    };
    
    window.addEventListener('vendorDataUpdated', handleVendorUpdate as EventListener);
    
    return () => {
      window.removeEventListener('vendorDataUpdated', handleVendorUpdate as EventListener);
    };
  }, [vendorId]);

  const loadCategories = async (forceRefresh = false) => {
    if (!forceRefresh) {
      const peeked = moduleCache.peek<{ products?: Product[] }>(
        CACHE_KEYS.vendorProductsAdmin(vendorId)
      );
      if (peeked != null && Array.isArray(peeked.products)) {
        console.log("📦 Categories from session cache (vendor products) for vendor:", vendorId);
        setCategories(buildCategoryInfosFromProducts(peeked.products));
        setLoading(false);
        setListRefreshing(false);
        return;
      }
    }

    setListRefreshing(forceRefresh);
    setLoading(true);
    try {
      console.log("🔄 Loading categories via cached vendor products for vendor:", vendorId);
      const data = await getCachedVendorProductsAdmin(vendorId, forceRefresh);
      const products = data.products || [];
      setCategories(buildCategoryInfosFromProducts(products));
      console.log(`✅ Derived ${products.length} products into categories for vendor ${vendorId}`);
    } catch (error: any) {
      console.error("Failed to load categories:", error);
      if (error.name === "AbortError") {
        toast.error("Request timed out.");
      } else {
        toast.error("Failed to load categories");
      }
    } finally {
      setLoading(false);
      setListRefreshing(false);
    }
  };

  useEffect(() => {
    loadCategories(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vendorId]);

  const filteredCategories = categories.filter(category =>
    category.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const toggleSelectAll = () => {
    if (selectedCategories.length === filteredCategories.length && filteredCategories.length > 0) {
      setSelectedCategories([]);
    } else {
      setSelectedCategories(filteredCategories.map(c => c.name));
    }
  };

  const toggleSelectCategory = (categoryName: string) => {
    setSelectedCategories(prev =>
      prev.includes(categoryName)
        ? prev.filter(name => name !== categoryName)
        : [...prev, categoryName]
    );
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="flex items-start justify-between">
          <Skeleton className="h-10 w-48" />
        </div>
        <Skeleton className="h-20 w-full" />
        <Skeleton className="h-12 w-full" />
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-slate-200 bg-white">
                  <th className="py-3 px-4"><Skeleton className="h-4 w-4" /></th>
                  <th className="py-3 px-4"><Skeleton className="h-4 w-24" /></th>
                  <th className="py-3 px-4"><Skeleton className="h-4 w-24" /></th>
                  <th className="py-3 px-4"><Skeleton className="h-4 w-32" /></th>
                  <th className="py-3 px-4"><Skeleton className="h-4 w-20" /></th>
                  <th className="py-3 px-4"><Skeleton className="h-4 w-16" /></th>
                  <th className="py-3 px-4"><Skeleton className="h-4 w-20" /></th>
                </tr>
              </thead>
              <tbody className="bg-white">
                {[...Array(5)].map((_, i) => (
                  <tr key={i} className="border-b border-slate-100">
                    <td className="py-3 px-4"><Skeleton className="h-4 w-4" /></td>
                    <td className="py-3 px-4">
                      <div className="flex items-center gap-3">
                        <Skeleton className="h-10 w-10 rounded-lg" />
                        <Skeleton className="h-4 w-32" />
                      </div>
                    </td>
                    <td className="py-3 px-4"><Skeleton className="h-6 w-20" /></td>
                    <td className="py-3 px-4"><Skeleton className="h-4 w-40" /></td>
                    <td className="py-3 px-4"><Skeleton className="h-4 w-8" /></td>
                    <td className="py-3 px-4"><Skeleton className="h-6 w-16" /></td>
                    <td className="py-3 px-4"><Skeleton className="h-8 w-8 rounded" /></td>
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
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-slate-900">Categories</h1>
        </div>
        <Button
          type="button"
          variant="outline"
          className="border-slate-300"
          disabled={listRefreshing || loading}
          onClick={() => loadCategories(true)}
        >
          <RefreshCw className={`w-4 h-4 mr-2 ${listRefreshing ? "animate-spin" : ""}`} />
          Refresh
        </Button>
      </div>

      {/* Info Banner */}
      <Card className="p-4 bg-blue-50 border-blue-200">
        <div className="flex items-start gap-3">
          <Info className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-sm text-blue-900 font-medium">
              Auto-populated from your products
            </p>
            <p className="text-sm text-blue-700 mt-1">
              Categories are automatically created based on products assigned to you by the super admin. You cannot manually create or edit categories.
            </p>
          </div>
        </div>
      </Card>

      {/* Search Bar */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
        <Input
          type="text"
          placeholder="Search categories"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="pl-10 bg-white border-slate-200"
        />
      </div>

      {/* Categories Table */}
      {filteredCategories.length === 0 ? (
        <Card className="p-12 text-center border-slate-200">
          <FolderOpen className="w-16 h-16 text-slate-300 mx-auto mb-4" />
          <h3 className="text-lg font-semibold text-slate-900 mb-2">
            {searchQuery ? "No categories found" : "No categories yet"}
          </h3>
          <p className="text-slate-600">
            {searchQuery 
              ? "Try adjusting your search"
              : "Categories will appear here automatically when the super admin assigns products to your store."}
          </p>
        </Card>
      ) : (
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-slate-200 bg-white">
                  <th className="text-left py-3 px-4 w-12">
                    <Checkbox
                      checked={selectedCategories.length === filteredCategories.length && filteredCategories.length > 0}
                      onCheckedChange={toggleSelectAll}
                    />
                  </th>
                  <th className="text-left py-3 px-4 font-medium text-slate-600 text-sm">Category</th>
                  <th className="text-left py-3 px-4 font-medium text-slate-600 text-sm">Vendor</th>
                  <th className="text-left py-3 px-4 font-medium text-slate-600 text-sm">Description</th>
                  <th className="text-left py-3 px-4 font-medium text-slate-600 text-sm">Products</th>
                  <th className="text-left py-3 px-4 font-medium text-slate-600 text-sm">Status</th>
                  <th className="text-left py-3 px-4 font-medium text-slate-600 text-sm">Actions</th>
                </tr>
              </thead>
              <tbody className="bg-white">
                {filteredCategories.map((category) => (
                  <tr key={category.name} className="border-b border-slate-100 hover:bg-slate-50">
                    <td className="py-3 px-4">
                      <Checkbox
                        checked={selectedCategories.includes(category.name)}
                        onCheckedChange={() => toggleSelectCategory(category.name)}
                      />
                    </td>
                    <td className="py-3 px-4">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-blue-50 rounded-lg flex items-center justify-center flex-shrink-0">
                          <FolderOpen className="w-5 h-5 text-blue-400" />
                        </div>
                        <span className="font-medium text-slate-900">{category.name}</span>
                      </div>
                    </td>
                    <td className="py-3 px-4">
                      <Badge variant="secondary" className="bg-orange-100 text-orange-700 border-orange-200 hover:bg-orange-100 font-medium">
                        {vendorName}
                      </Badge>
                    </td>
                    <td className="py-3 px-4">
                      <span className="text-sm text-blue-600">{category.description}</span>
                    </td>
                    <td className="py-3 px-4">
                      <span className="text-sm text-slate-700">{category.productCount}</span>
                    </td>
                    <td className="py-3 px-4">
                      <Badge variant="secondary" className="bg-green-100 text-green-700 border-green-200 hover:bg-green-100">
                        Active
                      </Badge>
                    </td>
                    <td className="py-3 px-4">
                      <div className="flex items-center gap-2">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-8 w-8 p-0 text-slate-400 hover:text-slate-600 hover:bg-slate-100"
                          title="View Category (Read-Only)"
                        >
                          <Eye className="w-4 h-4" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}