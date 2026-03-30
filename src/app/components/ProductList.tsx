import React, { useState, useEffect, useCallback, useMemo, useRef } from "react";
import {
  Plus,
  Search,
  Edit,
  Trash2,
  Filter,
  Users,
  TrendingUp,
  CalendarDays,
  MoreVertical,
  Eye,
  RefreshCw,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { productsApi } from "../../utils/api";
import { Product } from "../../types";
import { SmartCache, CACHE_KEYS } from "../../utils/cache";
import { toast } from "sonner";
import { Button } from "./ui/button";
import { Card } from "./ui/card";
import { Input } from "./ui/input";
import { Badge } from "./ui/badge";
import { Checkbox } from "./ui/checkbox";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "./ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./ui/select";
import { 
  DropdownMenu, 
  DropdownMenuContent, 
  DropdownMenuItem, 
  DropdownMenuTrigger 
} from "./ui/dropdown-menu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "./ui/alert-dialog";
import { ProductFormPage } from "./ProductFormPage";
import { StorefrontProductDetail } from "./StorefrontProductDetail";
import { useLanguage } from "../contexts/LanguageContext";
import { formatNumber, formatMMK } from "../../utils/formatNumber"; // 🔥 Import number formatting
import {
  getCachedProductById,
  invalidateProductByIdCache,
  getCachedAdminProductsPage,
  invalidateAdminAllProductsCache,
  getCachedAdminVendorsForProductList,
  invalidateVendorStorefrontCatalogCachesAfterProductLinkChange,
  ADMIN_PRODUCTS_INITIAL_PAGE_SIZE,
  moduleCache,
  CACHE_KEYS as MODULE_CACHE_KEYS,
} from "../utils/module-cache";
import { productMatchesAdminLiveSearch } from "../utils/adminProductSearch";

interface ProductListProps {
  onProductsChanged?: () => void; // 🔥 NEW: Callback when products change
  /** Synced with super-admin TopNav search */
  headerSearchQuery?: string;
  onHeaderSearchQueryChange?: (q: string) => void;
  /** Parent increments when user presses Enter in TopNav on Products — applies server `q`. */
  headerSearchCommitTick?: number;
  /** Super-admin breadcrumb «total» on list view; null when not listing or still loading first page */
  onListingCountChange?: (count: number | null) => void;
}

/** Super-admin product form may store vendor id, name, or businessName in `selectedVendors`. */
function resolveVendorsFromSelectionEntries(
  raw: unknown,
  vendorsList: any[]
): Map<string, { storeSlug?: string }> {
  const out = new Map<string, { storeSlug?: string }>();
  const arr = Array.isArray(raw) ? raw : [];
  const byId = new Map<string, any>();
  const byLabel = new Map<string, any>();
  for (const v of vendorsList) {
    if (!v?.id) continue;
    byId.set(String(v.id), v);
    for (const lbl of [v.name, v.businessName]) {
      const k = String(lbl || "").trim().toLowerCase();
      if (k) byLabel.set(k, v);
    }
  }
  for (const entry of arr) {
    const s = String(entry ?? "").trim();
    if (!s) continue;
    const v = byId.get(s) || byLabel.get(s.toLowerCase());
    if (!v?.id) continue;
    const id = String(v.id);
    const slug = String(v.storeSlug || "").trim();
    out.set(id, { storeSlug: slug || undefined });
  }
  return out;
}

/** Bust vendor shop cache + broadcast so open storefronts refetch after assign/unassign on product edit. */
function invalidateVendorStorefrontsForProductVendorSelectionChange(
  previousSelectedVendors: unknown,
  nextSelectedVendors: unknown,
  vendorsList: any[]
): void {
  const prev = resolveVendorsFromSelectionEntries(previousSelectedVendors, vendorsList);
  const next = resolveVendorsFromSelectionEntries(nextSelectedVendors, vendorsList);
  const ids = new Set([...prev.keys(), ...next.keys()]);
  for (const id of ids) {
    const slug = next.get(id)?.storeSlug || prev.get(id)?.storeSlug;
    invalidateVendorStorefrontCatalogCachesAfterProductLinkChange(id, slug ? [slug] : []);
  }
}

export function ProductList({
  onProductsChanged,
  headerSearchQuery,
  onHeaderSearchQueryChange,
  headerSearchCommitTick,
  onListingCountChange,
}: ProductListProps) {
  const { t } = useLanguage();
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [listRefreshing, setListRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  /** Sent to `getCachedAdminProductsPage` as `q` — only updated on Enter (inline or TopNav). */
  const [committedSearchQuery, setCommittedSearchQuery] = useState("");
  const lastHeaderCommitTick = useRef(0);
  const [adminPage, setAdminPage] = useState(1);
  const [adminPageSize, setAdminPageSize] = useState(ADMIN_PRODUCTS_INITIAL_PAGE_SIZE);
  const [adminTotal, setAdminTotal] = useState(0);
  const [adminHasMore, setAdminHasMore] = useState(false);
  const [statusCounts, setStatusCounts] = useState({ all: 0, active: 0, offShelf: 0 });
  const [vendorFilterOptions, setVendorFilterOptions] = useState<string[]>([]);
  const [selectedProducts, setSelectedProducts] = useState<string[]>([]);
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [activeTab, setActiveTab] = useState<string>("all");
  const [vendorFilter, setVendorFilter] = useState<string>("all");
  const [collaboratorFilter, setCollaboratorFilter] = useState<string>("all");
  const [sortBy, setSortBy] = useState<string>("newest");
  const [vendorsMap, setVendorsMap] = useState<Record<string, string>>({}); // 🔥 Map vendor ID to name

  // View states - replace modal with page views
  const [currentView, setCurrentView] = useState<"list" | "add" | "edit" | "view" | "storefront">("list");
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);

  // Delete confirmation state
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [productToDelete, setProductToDelete] = useState<string | null>(null);

  // Form states
  const [formData, setFormData] = useState<Partial<Product>>({
    name: "",
    description: "",
    price: "",
    sku: "",
    inventory: 0,
    category: "",
    status: "active", // Changed from "off-shelf" to "active" so products appear on storefront by default
    vendor: "",
    collaborator: "",
    image: "https://images.unsplash.com/photo-1505740420928-5e560c06d30e?w=100&h=100&fit=crop"
  });

  useEffect(() => {
    if (headerSearchQuery === undefined) return;
    setSearchQuery(headerSearchQuery);
  }, [headerSearchQuery]);

  useEffect(() => {
    if (headerSearchCommitTick === undefined) return;
    if (headerSearchCommitTick <= lastHeaderCommitTick.current) return;
    lastHeaderCommitTick.current = headerSearchCommitTick;
    const q =
      headerSearchQuery !== undefined
        ? String(headerSearchQuery).trim()
        : searchQuery.trim();
    setCommittedSearchQuery(q);
  }, [headerSearchCommitTick, headerSearchQuery, searchQuery]);

  useEffect(() => {
    setAdminPage(1);
  }, [
    committedSearchQuery,
    statusFilter,
    activeTab,
    vendorFilter,
    collaboratorFilter,
    sortBy,
    adminPageSize,
  ]);

  const loadProductPage = useCallback(
    async (forceRefresh: boolean) => {
      setLoading(true);
      setListRefreshing(forceRefresh);
      try {
        const payload = await getCachedAdminProductsPage(
          {
            page: adminPage,
            pageSize: adminPageSize,
            q: committedSearchQuery,
            status: statusFilter,
            tab: activeTab,
            vendor: vendorFilter,
            collaborator: collaboratorFilter,
            sort: sortBy,
          },
          forceRefresh
        );
        setProducts((payload.products || []) as Product[]);
        setAdminTotal(payload.total);
        setAdminHasMore(!!payload.hasMore);
        if (payload.counts) {
          setStatusCounts({
            all: payload.counts.all,
            active: payload.counts.active,
            offShelf: payload.counts.offShelf,
          });
        }
        SmartCache.set(CACHE_KEYS.PRODUCTS, (payload.products || []) as Product[]);
      } catch (error: any) {
        console.error("❌ Failed to load products:", error);
        setProducts([]);
        toast.info("No products yet. Go to Dashboard to create sample products!", {
          duration: 5000,
        });
      } finally {
        setLoading(false);
        setListRefreshing(false);
      }
    },
    [
      adminPage,
      adminPageSize,
      committedSearchQuery,
      statusFilter,
      activeTab,
      vendorFilter,
      collaboratorFilter,
      sortBy,
    ]
  );

  useEffect(() => {
    void loadProductPage(false);
  }, [loadProductPage]);

  useEffect(() => {
    if (!onListingCountChange) return;
    if (currentView !== "list") {
      onListingCountChange(null);
      return;
    }
    const hideUntilKnown = loading && products.length === 0;
    onListingCountChange(hideUntilKnown ? null : adminTotal);
  }, [currentView, adminTotal, loading, products.length, onListingCountChange]);

  useEffect(() => {
    loadVendors();
    const handleVendorUpdate = () => {
      void loadVendors(true);
    };
    window.addEventListener("vendorDataUpdated", handleVendorUpdate as EventListener);
    return () => {
      window.removeEventListener("vendorDataUpdated", handleVendorUpdate as EventListener);
    };
  }, []);

  useEffect(() => {
    const h = () => void loadProductPage(true);
    window.addEventListener("migoo-admin-products-cache-patched", h);
    return () => window.removeEventListener("migoo-admin-products-cache-patched", h);
  }, [loadProductPage]);

  const handleSearchInputChange = useCallback(
    (value: string) => {
      setSearchQuery(value);
      onHeaderSearchQueryChange?.(value);
    },
    [onHeaderSearchQueryChange]
  );

  const commitSearchFromInput = useCallback(() => {
    setCommittedSearchQuery(searchQuery.trim());
  }, [searchQuery]);

  const onSearchKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === "Enter") {
        e.preventDefault();
        commitSearchFromInput();
      }
    },
    [commitSearchFromInput]
  );

  const loadVendors = async (forceRefresh = false) => {
    if (!forceRefresh) {
      const peeked = moduleCache.peek<unknown[]>(MODULE_CACHE_KEYS.ADMIN_VENDORS);
      if (peeked != null && Array.isArray(peeked)) {
        const map: Record<string, string> = {};
        peeked.forEach((vendor: any) => {
          if (vendor.id && vendor.name) map[vendor.id] = vendor.name;
        });
        setVendorsMap(map);
        return;
      }
    }
    try {
      const vendorsList = await getCachedAdminVendorsForProductList(forceRefresh);
      if (Array.isArray(vendorsList)) {
        const map: Record<string, string> = {};
        vendorsList.forEach((vendor: any) => {
          if (vendor.id && vendor.name) map[vendor.id] = vendor.name;
        });
        setVendorsMap(map);
        const names = [
          ...new Set(
            vendorsList
              .map((vendor: any) => String(vendor.name || vendor.id || "").trim())
              .filter(Boolean)
          ),
        ].sort();
        setVendorFilterOptions(names);
        console.log(`✅ Loaded ${vendorsList.length} vendors for name mapping`);
      }
    } catch (error) {
      console.error("❌ Failed to load vendors:", error);
    }
  };

  const handleSaveProduct = async (data: any) => {
    setCurrentView("list");
    setLoading(true);
    try {
      const response = await productsApi.create(data);
      if (!response.success && !response.product) {
        throw new Error(response.error || "Failed to create product - no product returned");
      }
      let vendorsList =
        (moduleCache.peek<unknown[]>(MODULE_CACHE_KEYS.ADMIN_VENDORS) as any[]) || [];
      if (!Array.isArray(vendorsList) || vendorsList.length === 0) {
        vendorsList = (await getCachedAdminVendorsForProductList(false)) as any[];
      }
      invalidateVendorStorefrontsForProductVendorSelectionChange([], data?.selectedVendors, vendorsList);
      invalidateAdminAllProductsCache();
      SmartCache.delete(CACHE_KEYS.STOREFRONT_PRODUCTS);
      setAdminPage(1);
      const payload = await getCachedAdminProductsPage(
        {
          page: 1,
          pageSize: adminPageSize,
          q: committedSearchQuery,
          status: statusFilter,
          tab: activeTab,
          vendor: vendorFilter,
          collaborator: collaboratorFilter,
          sort: sortBy,
        },
        true
      );
      setProducts((payload.products || []) as Product[]);
      setAdminTotal(payload.total);
      setAdminHasMore(!!payload.hasMore);
      if (payload.counts) {
        setStatusCounts({
          all: payload.counts.all,
          active: payload.counts.active,
          offShelf: payload.counts.offShelf,
        });
      }
      SmartCache.set(CACHE_KEYS.PRODUCTS, (payload.products || []) as Product[]);
      toast.success("✅ Product added!", { duration: 2000 });
      onProductsChanged?.();
    } catch (error) {
      console.error("❌ Failed to create product:", error);
      await loadProductPage(true);
      if (error instanceof Error && error.message.includes("SKU already exists")) {
        toast.error(`❌ SKU Validation Error: ${error.message}`, { duration: 5000 });
      } else {
        const errorMsg = error instanceof Error ? error.message : "Failed to save product to server";
        toast.error(`❌ Error: ${errorMsg}. Check console for details.`, { duration: 5000 });
      }
    } finally {
      setLoading(false);
    }
  };

  const handleUpdateProduct = async (id: string, data: any) => {
    const prevVendors = selectedProduct?.selectedVendors;
    try {
      await productsApi.update(id, data);
      let vendorsList =
        (moduleCache.peek<unknown[]>(MODULE_CACHE_KEYS.ADMIN_VENDORS) as any[]) || [];
      if (!Array.isArray(vendorsList) || vendorsList.length === 0) {
        vendorsList = (await getCachedAdminVendorsForProductList(false)) as any[];
      }
      invalidateVendorStorefrontsForProductVendorSelectionChange(
        prevVendors,
        data?.selectedVendors,
        vendorsList
      );
      invalidateProductByIdCache(id);
      toast.success("Product updated successfully!");
      SmartCache.delete(CACHE_KEYS.STOREFRONT_PRODUCTS);
      invalidateAdminAllProductsCache();
      await loadProductPage(true);
      onProductsChanged?.();
      setCurrentView("list");
    } catch (error) {
      console.error("Failed to update product:", error);
      
      // Check if it's a SKU validation error
      if (error instanceof Error && error.message.includes("SKU already exists")) {
        toast.error(`❌ SKU Validation Error: ${error.message}`, { duration: 5000 });
      } else {
        toast.error("Failed to update product");
      }
    }
  };

  const handleDeleteProduct = async (id: string) => {
    const previous = products;
    const updatedProducts = products.filter((p) => p.id !== id);
    setProducts(updatedProducts);
    SmartCache.set(CACHE_KEYS.PRODUCTS, updatedProducts);
    SmartCache.delete(CACHE_KEYS.STOREFRONT_PRODUCTS);
    toast.success("Product deleted!", { duration: 2000 });
    try {
      await productsApi.delete(id);
      invalidateProductByIdCache(id);
      invalidateAdminAllProductsCache();
      await loadProductPage(true);
      onProductsChanged?.();
    } catch (error) {
      console.error("Failed to delete product:", error);
      const errorMessage = error instanceof Error ? error.message : "Failed to delete product";
      if (errorMessage.includes("Product not found") || errorMessage.includes("404")) {
        invalidateAdminAllProductsCache();
        await loadProductPage(true);
        onProductsChanged?.();
      } else {
        toast.error(`Failed to delete: ${errorMessage}`);
        setProducts(previous);
        SmartCache.set(CACHE_KEYS.PRODUCTS, previous);
      }
    }
  };

  // Handle bulk delete
  const handleBulkDelete = () => {
    if (selectedProducts.length === 0) return;
    setDeleteDialogOpen(true);
    setProductToDelete("BULK_DELETE"); // Special marker for bulk delete
  };

  // Execute bulk or single delete
  const executeDelete = async () => {
    try {
      if (productToDelete === "BULK_DELETE") {
        let successCount = 0;
        let errorCount = 0;
        let alreadyDeletedCount = 0;
        const removedIds = new Set<string>();

        for (const productId of selectedProducts) {
          try {
            await productsApi.delete(productId);
            invalidateProductByIdCache(productId);
            successCount++;
            removedIds.add(productId);
          } catch (error) {
            const errorMessage = error instanceof Error ? error.message : "";
            if (errorMessage.includes("Product not found") || errorMessage.includes("404")) {
              alreadyDeletedCount++;
              removedIds.add(productId);
            } else {
              console.error(`Failed to delete product ${productId}:`, error);
              errorCount++;
            }
          }
        }

        if (removedIds.size > 0) {
          SmartCache.delete(CACHE_KEYS.STOREFRONT_PRODUCTS);
          invalidateAdminAllProductsCache();
          await loadProductPage(true);
        }

        if (successCount > 0) {
          toast.success(`${successCount} product(s) deleted successfully!`);
        }
        if (alreadyDeletedCount > 0) {
          toast.info(`${alreadyDeletedCount} product(s) were already deleted`);
        }
        if (errorCount > 0) {
          toast.error(`${errorCount} product(s) could not be deleted`);
          await loadProductPage(true);
        }
        setSelectedProducts([]);
      } else if (productToDelete) {
        let removedOk = false;
        try {
          await productsApi.delete(productToDelete);
          invalidateProductByIdCache(productToDelete);
          removedOk = true;
          toast.success("Product deleted successfully!");
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : "";
          if (errorMessage.includes("Product not found") || errorMessage.includes("404")) {
            toast.info("Product already deleted");
            removedOk = true;
          } else {
            throw error;
          }
        }
        if (removedOk) {
          SmartCache.delete(CACHE_KEYS.STOREFRONT_PRODUCTS);
          invalidateAdminAllProductsCache();
          await loadProductPage(true);
        }
      }
      if (onProductsChanged) onProductsChanged();
      setDeleteDialogOpen(false);
      setProductToDelete(null);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Failed to delete product(s)";

      if (errorMessage.includes("Product not found") || errorMessage.includes("404")) {
        toast.info("Product already deleted");
        await loadProductPage(true);
      } else {
        console.error("Failed to delete product(s):", error);
        toast.error(errorMessage);
      }
      setDeleteDialogOpen(false);
      setProductToDelete(null);
    }
  };

  // Load full product details when editing (to get all images) — module cache: revisit = no refetch
  const handleEditProduct = async (productId: string) => {
    try {
      const response = await getCachedProductById(productId);
      if (response.product) {
        setSelectedProduct(response.product);
        setCurrentView("edit");
      }
    } catch (error) {
      console.error("Failed to load product details:", error);
      toast.error("Failed to load product details");
    }
  };

  // Load full product details when viewing
  const handleViewProduct = async (productId: string) => {
    try {
      const response = await getCachedProductById(productId);
      if (response.product) {
        setSelectedProduct(response.product);
        setCurrentView("storefront");
      }
    } catch (error) {
      console.error("Failed to load product details:", error);
      toast.error("Failed to load product details");
    }
  };

  /** Instant filter on the current server page + narrowing while debounced `q` is in flight. */
  const displayProducts = useMemo(
    () =>
      products.filter((product) => productMatchesAdminLiveSearch(product, searchQuery)),
    [products, searchQuery]
  );

  const toggleSelectAll = () => {
    if (selectedProducts.length === displayProducts.length) {
      setSelectedProducts([]);
    } else {
      setSelectedProducts(displayProducts.map(p => p.id));
    }
  };

  const toggleSelectProduct = (id: string) => {
    setSelectedProducts(prev =>
      prev.includes(id) ? prev.filter(p => p !== id) : [...prev, id]
    );
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  };

  const getStatusCount = (status: string) => {
    if (status === "all") return statusCounts.all;
    if (status === "active") return statusCounts.active;
    if (status === "off-shelf") return statusCounts.offShelf;
    return 0;
  };

  const adminTotalPages = Math.max(1, Math.ceil(adminTotal / adminPageSize) || 1);

  return (
    <>
      {/* Show Add Product Page */}
      {currentView === "add" && (
        <ProductFormPage
          mode="add"
          onSave={handleSaveProduct}
          onCancel={() => setCurrentView("list")}
        />
      )}

      {/* Show Edit Product Page */}
      {currentView === "edit" && selectedProduct && (
        <ProductFormPage
          mode="edit"
          initialData={selectedProduct}
          onSave={handleUpdateProduct}
          onCancel={() => setCurrentView("list")}
        />
      )}

      {/* Show View Product Page */}
      {currentView === "view" && selectedProduct && (
        <ProductFormPage
          mode="view"
          initialData={selectedProduct}
          onCancel={() => setCurrentView("list")}
        />
      )}

      {/* Show Storefront Product Detail Page */}
      {currentView === "storefront" && selectedProduct && (
        <StorefrontProductDetail
          product={selectedProduct}
          onBack={() => setCurrentView("list")}
        />
      )}

      {/* Show Product List */}
      {currentView === "list" && (
        <div className="p-8 space-y-6">
          {/* Header */}
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <div>
              <h1 className="text-3xl font-bold text-slate-900">{t('products.title')}</h1>
              <p className="text-slate-500 mt-1">{t('products.subtitle')}</p>
            </div>
            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="outline"
                disabled={listRefreshing || loading}
                onClick={() => void loadProductPage(true)}
                className="border-slate-300"
              >
                <RefreshCw className={`w-4 h-4 mr-2 ${listRefreshing ? "animate-spin" : ""}`} />
                Refresh
              </Button>
              <Button className="bg-slate-900 hover:bg-slate-800" onClick={() => setCurrentView("add")}>
                {t('products.addProduct')}
              </Button>
            </div>
          </div>

          {/* Loading State */}
          {loading && (
            <Card>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-slate-200 bg-slate-50">
                      <th className="text-left py-3 px-4 w-12 align-middle">
                        <div className="w-4 h-4 bg-slate-200 rounded"></div>
                      </th>
                      <th className="text-left py-3 px-4 font-medium text-slate-600 text-sm align-middle">Product</th>
                      <th className="text-left py-3 px-4 font-medium text-slate-600 text-sm align-middle">Status</th>
                      <th className="text-left py-3 px-4 font-medium text-slate-600 text-sm align-middle">Inventory</th>
                      <th className="text-left py-3 px-4 font-medium text-slate-600 text-sm align-middle">Category</th>
                      <th className="text-left py-3 px-4 font-medium text-slate-600 text-sm align-middle">Vendor</th>
                      <th className="text-left py-3 px-4 font-medium text-slate-600 text-sm align-middle">Price</th>
                      <th className="text-left py-3 px-4 font-medium text-slate-600 text-sm align-middle">Commission</th>
                      <th className="text-left py-3 px-4 font-medium text-slate-600 text-sm align-middle">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {Array.from({ length: 8 }).map((_, index) => (
                      <tr key={`skeleton-row-${index}`} className="border-b border-slate-100 animate-pulse">
                        <td className="py-3 px-4">
                          <div className="w-4 h-4 bg-slate-200 rounded"></div>
                        </td>
                        <td className="py-3 px-4">
                          <div className="flex items-center gap-3">
                            <div className="w-12 h-12 bg-slate-200 rounded-lg"></div>
                            <div className="space-y-2">
                              <div className="h-4 bg-slate-200 rounded w-32"></div>
                              <div className="h-3 bg-slate-200 rounded w-20"></div>
                            </div>
                          </div>
                        </td>
                        <td className="py-3 px-4">
                          <div className="h-6 bg-slate-200 rounded w-16"></div>
                        </td>
                        <td className="py-3 px-4">
                          <div className="h-4 bg-slate-200 rounded w-8"></div>
                        </td>
                        <td className="py-3 px-4">
                          <div className="h-4 bg-slate-200 rounded w-24"></div>
                        </td>
                        <td className="py-3 px-4">
                          <div className="h-4 bg-slate-200 rounded w-20"></div>
                        </td>
                        <td className="py-3 px-4">
                          <div className="h-4 bg-slate-200 rounded w-16"></div>
                        </td>
                        <td className="py-3 px-4">
                          <div className="h-4 bg-slate-200 rounded w-12"></div>
                        </td>
                        <td className="py-3 px-4">
                          <div className="flex items-center gap-2">
                            <div className="h-8 w-8 bg-slate-200 rounded"></div>
                            <div className="h-8 w-8 bg-slate-200 rounded"></div>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          )}

          {/* Products Content */}
          {!loading && (
            <>
              {/* Main Tabs - Category Filter */}
              <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
                <TabsList className="grid w-full grid-cols-3 lg:w-[450px]">
                  <TabsTrigger value="all" className="flex items-center gap-2">
                    <Filter className="w-4 h-4" />
                    {t('products.allProducts')}
                  </TabsTrigger>
                  <TabsTrigger value="vendor" className="flex items-center gap-2">
                    <Users className="w-4 h-4" />
                    {t('products.vendor')}
                  </TabsTrigger>
                  <TabsTrigger value="sales" className="flex items-center gap-2">
                    <TrendingUp className="w-4 h-4" />
                    {t('products.salesVolume')}
                  </TabsTrigger>
                </TabsList>

                {/* All Products Tab */}
                <TabsContent value="all" className="space-y-6 mt-6">
                  {/* Filters Bar - All in one row */}
                  <Card className="p-4">
                    <div className="flex flex-col lg:flex-row items-start lg:items-center gap-4">
                      {/* Search */}
                      <div className="flex-1 relative min-w-[280px]">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                        <Input
                          placeholder="Search by name or SKU — press Enter to search"
                          className="pl-10"
                          value={searchQuery}
                          onChange={(e) => handleSearchInputChange(e.target.value)}
                          onKeyDown={onSearchKeyDown}
                        />
                      </div>
                      
                      {/* Status Tabs */}
                      <Tabs value={statusFilter} onValueChange={setStatusFilter}>
                        <TabsList>
                          <TabsTrigger value="all" className="gap-2">
                            {t('products.allStatus')}
                            <Badge variant="secondary" className="bg-slate-200 text-slate-700 text-xs">
                              {getStatusCount("all")}
                            </Badge>
                          </TabsTrigger>
                          <TabsTrigger value="active" className="gap-2">
                            {t('products.active')}
                            <Badge variant="secondary" className="bg-green-100 text-green-700 text-xs">
                              {getStatusCount("active")}
                            </Badge>
                          </TabsTrigger>
                          <TabsTrigger value="off-shelf" className="gap-2">
                            {t('products.offShelf')}
                            <Badge variant="secondary" className="bg-slate-200 text-slate-700 text-xs">
                              {getStatusCount("off-shelf")}
                            </Badge>
                          </TabsTrigger>
                        </TabsList>
                      </Tabs>

                      {/* Sort Dropdown */}
                      <Select value={sortBy} onValueChange={setSortBy}>
                        <SelectTrigger className="w-full lg:w-[200px]">
                          <CalendarDays className="w-4 h-4 mr-2" />
                          <SelectValue placeholder={t('products.sortByDate')} />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="newest">{t('products.newestFirst')}</SelectItem>
                          <SelectItem value="oldest">{t('products.oldestFirst')}</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </Card>
                </TabsContent>

                {/* Vendor Tab */}
                <TabsContent value="vendor" className="space-y-6 mt-6">
                  {/* Filters Bar - All in one row */}
                  <Card className="p-4">
                    <div className="flex flex-col lg:flex-row items-start lg:items-center gap-4">
                      {/* Search */}
                      <div className="flex-1 relative min-w-[280px]">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                        <Input
                          placeholder="Search by name or SKU — press Enter to search"
                          className="pl-10"
                          value={searchQuery}
                          onChange={(e) => handleSearchInputChange(e.target.value)}
                          onKeyDown={onSearchKeyDown}
                        />
                      </div>
                      
                      {/* Status Tabs */}
                      <Tabs value={statusFilter} onValueChange={setStatusFilter}>
                        <TabsList>
                          <TabsTrigger value="all" className="gap-2">
                            {t('products.allStatus')}
                            <Badge variant="secondary" className="bg-slate-200 text-slate-700 text-xs">
                              {getStatusCount("all")}
                            </Badge>
                          </TabsTrigger>
                          <TabsTrigger value="active" className="gap-2">
                            {t('products.active')}
                            <Badge variant="secondary" className="bg-green-100 text-green-700 text-xs">
                              {getStatusCount("active")}
                            </Badge>
                          </TabsTrigger>
                          <TabsTrigger value="off-shelf" className="gap-2">
                            {t('products.offShelf')}
                            <Badge variant="secondary" className="bg-slate-200 text-slate-700 text-xs">
                              {getStatusCount("off-shelf")}
                            </Badge>
                          </TabsTrigger>
                        </TabsList>
                      </Tabs>

                      {/* Vendor Filter */}
                      <Select value={vendorFilter} onValueChange={setVendorFilter}>
                        <SelectTrigger className="w-full lg:w-[220px]">
                          <SelectValue placeholder={t('vendors.filterByVendor')} />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all">{t('vendors.allVendors')}</SelectItem>
                          {vendorFilterOptions.map((vendor) => (
                            <SelectItem key={vendor} value={vendor}>
                              {vendor}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>

                      {/* Sort Dropdown */}
                      <Select value={sortBy} onValueChange={setSortBy}>
                        <SelectTrigger className="w-full lg:w-[200px]">
                          <CalendarDays className="w-4 h-4 mr-2" />
                          <SelectValue placeholder={t('products.sortByDate')} />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="newest">{t('products.newestFirst')}</SelectItem>
                          <SelectItem value="oldest">{t('products.oldestFirst')}</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </Card>
                </TabsContent>

                {/* Sales Volume Tab */}
                <TabsContent value="sales" className="space-y-6 mt-6">
                  {/* Filters Bar - All in one row */}
                  <Card className="p-4">
                    <div className="flex flex-col lg:flex-row items-start lg:items-center gap-4">
                      {/* Search */}
                      <div className="flex-1 relative min-w-[280px]">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                        <Input
                          placeholder="Search by name or SKU — press Enter to search"
                          className="pl-10"
                          value={searchQuery}
                          onChange={(e) => handleSearchInputChange(e.target.value)}
                          onKeyDown={onSearchKeyDown}
                        />
                      </div>
                      
                      {/* Status Tabs */}
                      <Tabs value={statusFilter} onValueChange={setStatusFilter}>
                        <TabsList>
                          <TabsTrigger value="all" className="gap-2">
                            {t('products.allStatus')}
                            <Badge variant="secondary" className="bg-slate-200 text-slate-700 text-xs">
                              {getStatusCount("all")}
                            </Badge>
                          </TabsTrigger>
                          <TabsTrigger value="active" className="gap-2">
                            {t('products.active')}
                            <Badge variant="secondary" className="bg-green-100 text-green-700 text-xs">
                              {getStatusCount("active")}
                            </Badge>
                          </TabsTrigger>
                          <TabsTrigger value="off-shelf" className="gap-2">
                            {t('products.offShelf')}
                            <Badge variant="secondary" className="bg-slate-200 text-slate-700 text-xs">
                              {getStatusCount("off-shelf")}
                            </Badge>
                          </TabsTrigger>
                        </TabsList>
                      </Tabs>
                    </div>
                  </Card>
                </TabsContent>
              </Tabs>

              {/* Bulk Actions Bar */}
              {selectedProducts.length > 0 && (
                <Card className="p-4 bg-purple-50 border-purple-200">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium text-purple-900">
                      {selectedProducts.length} product(s) selected
                    </span>
                    <div className="flex items-center gap-2">
                      <Button variant="outline" size="sm">
                        Update SKU
                      </Button>
                      <Button variant="outline" size="sm">
                        Adjust Inventory
                      </Button>
                      <Button variant="outline" size="sm" className="text-red-600 hover:text-red-700" onClick={handleBulkDelete}>
                        Delete
                      </Button>
                    </div>
                  </div>
                </Card>
              )}

              {/* Products Table */}
              <Card>
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b border-slate-200 bg-slate-50">
                        <th className="text-left py-3 px-4 w-12 align-middle">
                          <Checkbox
                            checked={selectedProducts.length === displayProducts.length && displayProducts.length > 0}
                            onCheckedChange={toggleSelectAll}
                          />
                        </th>
                        <th className="text-left py-3 px-4 font-medium text-slate-600 text-sm align-middle">Product</th>
                        <th className="text-left py-3 px-4 font-medium text-slate-600 text-sm align-middle">Status</th>
                        <th className="text-left py-3 px-4 font-medium text-slate-600 text-sm align-middle">Inventory</th>
                        <th className="text-left py-3 px-4 font-medium text-slate-600 text-sm align-middle">Category</th>
                        <th className="text-left py-3 px-4 font-medium text-slate-600 text-sm align-middle">Vendor</th>
                        <th className="text-left py-3 px-4 font-medium text-slate-600 text-sm align-middle">Price</th>
                        <th className="text-left py-3 px-4 font-medium text-slate-600 text-sm align-middle">Commission</th>
                        {activeTab === "sales" && (
                          <th className="text-left py-3 px-4 font-medium text-slate-600 text-sm align-middle">Sales</th>
                        )}
                        <th className="text-left py-3 px-4 font-medium text-slate-600 text-sm align-middle">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {displayProducts.map((product) => (
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
                                  // Prefer images array (first image is cover), then thumbnail (from cache), then fallback
                                  product.images && product.images.length > 0 
                                    ? product.images[0]
                                    : (product as any).thumbnail || product.image || "https://images.unsplash.com/photo-1505740420928-5e560c06d30e?w=100&h=100&fit=crop"
                                } 
                                alt={product.name}
                                className="w-12 h-12 rounded-lg object-cover border border-slate-200"
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
                                product.status === "active" 
                                  ? "bg-green-100 text-green-700 border-green-200 hover:bg-green-100"
                                  : "bg-slate-100 text-slate-700 border-slate-200 hover:bg-slate-100"
                              }
                            >
                              {product.status === "off-shelf" ? "Off Shelf" : product.status.charAt(0).toUpperCase() + product.status.slice(1)}
                            </Badge>
                          </td>
                          <td className="py-3 px-4">
                            <div className="flex items-center gap-2">
                              <span className={
                                product.inventory === 0 
                                  ? "text-sm text-red-600 font-semibold" 
                                  : product.inventory < 10 
                                    ? "text-sm text-amber-600 font-medium" 
                                    : "text-sm text-slate-700"
                              }>
                                {product.inventory}
                              </span>
                              {product.inventory === 0 && (
                                <Badge variant="outline" className="bg-red-50 text-red-600 border-red-200 text-xs">
                                  OUT OF STOCK
                                </Badge>
                              )}
                              {product.inventory > 0 && product.inventory < 10 && (
                                <Badge variant="outline" className="bg-amber-50 text-amber-600 border-amber-200 text-xs">
                                  LOW STOCK
                                </Badge>
                              )}
                            </div>
                          </td>
                          <td className="py-3 px-4 text-sm text-slate-700">{product.category}</td>
                          <td className="py-3 px-4 text-sm text-slate-700">
                            {Array.isArray(product.selectedVendors) && product.selectedVendors.length > 0 ? (
                              <div className="flex flex-wrap gap-1">
                                {product.selectedVendors.slice(0, 2).map((vendorId, index) => (
                                  <Badge key={index} variant="secondary" className="bg-blue-50 text-blue-700 border-blue-200 text-xs">
                                    {vendorsMap[vendorId] || vendorId}
                                  </Badge>
                                ))}
                                {product.selectedVendors.length > 2 && (
                                  <Badge variant="secondary" className="bg-slate-100 text-slate-600 border-slate-200 text-xs">
                                    +{product.selectedVendors.length - 2}
                                  </Badge>
                                )}
                              </div>
                            ) : product.vendor ? (
                              <span>{product.vendor}</span>
                            ) : (
                              <span className="text-slate-400">-</span>
                            )}
                          </td>
                          <td className="py-3 px-4 text-sm font-semibold text-slate-900">
                            {formatMMK(
                              String(product.price ?? "0").replace("$", "").replace(/,/g, "")
                            )}
                          </td>
                          <td className="py-3 px-4">
                            <span className="text-sm font-semibold text-purple-600">
                              {product.commissionRate || 0}%
                            </span>
                          </td>
                          {activeTab === "sales" && (
                            <td className="py-3 px-4 text-slate-700">{product.salesVolume}</td>
                          )}
                          <td className="py-3 px-4">
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                                  <MoreVertical className="w-4 h-4 text-slate-600" />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end">
                                <DropdownMenuItem onClick={() => handleViewProduct(product.id)}>
                                  <Eye className="w-4 h-4 mr-2" />
                                  View Details
                                </DropdownMenuItem>
                                <DropdownMenuItem onClick={() => { 
                                  handleEditProduct(product.id); 
                                }}>
                                  <Edit className="w-4 h-4 mr-2" />
                                  Edit
                                </DropdownMenuItem>
                                <DropdownMenuItem className="text-red-600" onClick={() => { setDeleteDialogOpen(true); setProductToDelete(product.id); }}>
                                  <Trash2 className="w-4 h-4 mr-2" />
                                  Delete
                                </DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="flex flex-col sm:flex-row items-center justify-between gap-3 px-4 py-3 border-t border-slate-200 bg-slate-50/80">
                  <div className="flex items-center gap-2 text-sm text-slate-600">
                    <span>Rows per page</span>
                    <Select
                      value={String(adminPageSize)}
                      onValueChange={(v) => setAdminPageSize(Number(v))}
                    >
                      <SelectTrigger className="w-[88px] h-8">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="10">10</SelectItem>
                        <SelectItem value="15">15</SelectItem>
                        <SelectItem value="20">20</SelectItem>
                        <SelectItem value="50">50</SelectItem>
                      </SelectContent>
                    </Select>
                    <span className="text-slate-500">
                      Page {adminPage} of {adminTotalPages} · {adminTotal} products
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-8"
                      disabled={adminPage <= 1 || loading}
                      onClick={() => setAdminPage((p) => Math.max(1, p - 1))}
                    >
                      <ChevronLeft className="w-4 h-4" />
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-8"
                      disabled={!adminHasMore || loading}
                      onClick={() => setAdminPage((p) => p + 1)}
                    >
                      <ChevronRight className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              </Card>
            </>
          )}
        </div>
      )}

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {productToDelete === "BULK_DELETE" 
                ? `Delete ${selectedProducts.length} product(s)?` 
                : "Are you sure you want to delete this product?"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {productToDelete === "BULK_DELETE"
                ? `This action cannot be undone. This will permanently delete ${selectedProducts.length} product(s) from your inventory.`
                : "This action cannot be undone. This will permanently delete the product from your inventory."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => { setDeleteDialogOpen(false); setProductToDelete(null); }}>
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-600 hover:bg-red-700"
              onClick={executeDelete}
            >
              {productToDelete === "BULK_DELETE" ? `Delete ${selectedProducts.length} Product(s)` : "Delete Product"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}