import { useState, useEffect } from "react";
import { Search, Plus, Edit, Trash2, X, FolderOpen, Info, Eye } from "lucide-react";
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

// 🔥 MODULE-LEVEL CACHE - Load once and persist
const categoriesCache: Record<string, { categories: CategoryInfo[]; timestamp: number }> = {};
const CACHE_DURATION = 30 * 60 * 1000; // 30 minutes cache

export function VendorAdminCategories({ vendorId, vendorName }: VendorAdminCategoriesProps) {
  const [categories, setCategories] = useState<CategoryInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategories, setSelectedCategories] = useState<string[]>([]);

  // Register cache invalidation
  useEffect(() => {
    const clearCache = () => {
      console.log("🗑️ Clearing categories cache for vendor:", vendorId);
      delete categoriesCache[vendorId];
      loadCategories();
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

  const loadCategories = async () => {
    // Check cache first
    const cached = categoriesCache[vendorId];
    const now = Date.now();
    
    if (cached && (now - cached.timestamp) < CACHE_DURATION) {
      console.log("📦 Loading categories from cache for vendor:", vendorId);
      setCategories(cached.categories);
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      console.log("🔄 Fetching categories from API for vendor:", vendorId);
      
      // Fetch products assigned to this vendor with longer timeout
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 30000); // 30 second timeout to match backend
      
      const response = await fetch(
        `https://${projectId}.supabase.co/functions/v1/make-server-16010b6f/vendor/products-admin/${vendorId}`,
        {
          headers: {
            Authorization: `Bearer ${publicAnonKey}`,
          },
          signal: controller.signal,
        }
      );
      
      clearTimeout(timeoutId);

      if (response.ok) {
        const data = await response.json();
        const products = data.products || [];
        
        console.log(`✅ Loaded ${products.length} products for vendor ${vendorId}`);
        
        // Extract unique categories from products
        const categoryMap = new Map<string, Product[]>();
        
        products.forEach((product: Product) => {
          // Safety check for valid product
          if (!product || !product.id) return;
          
          const categoryName = product.category?.trim() || "Uncategorized";
          if (!categoryMap.has(categoryName)) {
            categoryMap.set(categoryName, []);
          }
          categoryMap.get(categoryName)?.push(product);
        });

        // Convert to array and calculate stats
        const categoriesArray: CategoryInfo[] = Array.from(categoryMap.entries()).map(([name, products]) => ({
          name,
          productCount: products.length,
          products,
          activeProducts: products.filter(p => p?.status && (p.status === "active" || p.status === "Active")).length,
          description: name, // Use category name as description
        }));

        // Sort by name
        categoriesArray.sort((a, b) => a.name.localeCompare(b.name));
        
        // Store in cache
        categoriesCache[vendorId] = {
          categories: categoriesArray,
          timestamp: now,
        };
        
        console.log(`💾 Cached ${categoriesArray.length} categories for vendor ${vendorId}`);
        
        setCategories(categoriesArray);
      } else {
        console.error("Failed to load categories, status:", response.status);
        
        // If we have stale cache, use it
        if (cached) {
          console.log("⚠️ Using stale cache due to error");
          setCategories(cached.categories);
        } else {
          toast.error("Failed to load categories");
        }
      }
    } catch (error: any) {
      console.error("Failed to load categories:", error);
      
      // Handle timeout specifically
      if (error.name === 'AbortError') {
        console.error("⏱️ Request timed out");
        toast.error("Request timed out. Using cached data if available.");
      }
      
      // If we have cached data (even stale), use it
      const cached = categoriesCache[vendorId];
      if (cached) {
        console.log("⚠️ Using cached data due to error");
        setCategories(cached.categories);
      } else {
        toast.error("Failed to load categories");
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadCategories();
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
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-3xl font-bold text-slate-900">Categories</h1>
        </div>
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