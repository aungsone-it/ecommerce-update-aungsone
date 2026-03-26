import { useState, useEffect } from "react";
import { Search, Package, Loader2, RefreshCw, Plus, Minus, Check, X, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from "lucide-react";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Card } from "./ui/card";
import { Badge } from "./ui/badge";
import { useLanguage } from "../contexts/LanguageContext";
import { projectId, publicAnonKey } from "../../../utils/supabase/info";
import { toast } from "sonner";
import {
  getCachedAdminAllProducts,
  moduleCache,
  patchAdminProductInventoryInCache,
  CACHE_KEYS as MODULE_CACHE_KEYS,
  ADMIN_PRODUCTS_BROADCAST_CHANNEL,
} from "../utils/module-cache";

interface InventoryItem {
  id: string;
  product: string;
  sku: string;
  image: string;
  available: number;
  committed: number;
  onHand: number;
  reorderPoint: number;
  vendorId?: string;
  isVariant?: boolean;
  parentId?: string;
  parentName?: string;
}

function productsToInventoryItems(products: any[]): InventoryItem[] {
  const inventoryData: InventoryItem[] = [];
  (products || []).forEach((product: any) => {
    const hasVariantRows =
      product.hasVariants &&
      product.variants &&
      Array.isArray(product.variants) &&
      product.variants.length > 0;

    if (hasVariantRows) {
      product.variants.forEach((variant: any) => {
        const variantInventory = variant.inventory || 0;
        const variantCommitted = Math.floor(variantInventory * 0.05);
        const variantAvailable = variantInventory - variantCommitted;
        const variantName =
          variant.name || (variant.options ? Object.values(variant.options).join(" / ") : "Variant");
        inventoryData.push({
          id: variant.id,
          product: `${product.name || product.title} — ${variantName}`,
          sku: variant.sku,
          image:
            variant.image ||
            product.image ||
            product.images?.[0] ||
            "https://images.unsplash.com/photo-1505740420928-5e560c06d30e?w=100&h=100&fit=crop",
          available: variantAvailable,
          committed: variantCommitted,
          onHand: variantInventory,
          reorderPoint: 50,
          vendorId: product.vendor,
          isVariant: true,
          parentId: product.id,
          parentName: product.name || product.title,
        });
      });
      return;
    }

    const inventoryQty = product.inventory || 0;
    const committed = Math.floor(inventoryQty * 0.05);
    const available = inventoryQty - committed;
    inventoryData.push({
      id: product.id,
      product: product.name || product.title,
      sku: product.sku,
      image:
        product.image ||
        product.images?.[0] ||
        "https://images.unsplash.com/photo-1505740420928-5e560c06d30e?w=100&h=100&fit=crop",
      available,
      committed,
      onHand: inventoryQty,
      reorderPoint: 50,
      vendorId: product.vendor,
      isVariant: false,
    });
  });
  return inventoryData;
}

export function Inventory() {
  const { t } = useLanguage();
  const [searchQuery, setSearchQuery] = useState("");

  const [inventoryItems, setInventoryItems] = useState<InventoryItem[]>([]);
  const [loading, setLoading] = useState(
    () => !moduleCache.peek(MODULE_CACHE_KEYS.ADMIN_PRODUCTS)
  );
  const [listRefreshing, setListRefreshing] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");
  
  // Pagination state
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(50);

  useEffect(() => {
    loadInventory();
  }, []);

  const loadInventory = async (forceRefresh = false, retryCount = 0) => {
    let showLoadingTimer: NodeJS.Timeout | null = null;
    showLoadingTimer = setTimeout(() => {
      setLoading(true);
    }, 300);

    if (!forceRefresh) {
      const peeked = moduleCache.peek<any[]>(MODULE_CACHE_KEYS.ADMIN_PRODUCTS);
      if (peeked != null && Array.isArray(peeked)) {
        const rows = productsToInventoryItems(peeked);
        setInventoryItems(rows);
        if (showLoadingTimer) clearTimeout(showLoadingTimer);
        setLoading(false);
        setListRefreshing(false);
        if (rows.length === 0) {
          toast.error("No products found! Please create products first in the Products section.");
        }
        return;
      }
    }

    setListRefreshing(forceRefresh);
    try {
      console.log(`🔄 Loading inventory (attempt ${retryCount + 1})...`);
      const products = await getCachedAdminAllProducts(forceRefresh);
      const inventoryData = productsToInventoryItems(products);
      console.log(`📦 Loaded ${products.length} products → ${inventoryData.length} inventory items`);
      setInventoryItems(inventoryData);
      if (inventoryData.length === 0) {
        toast.error("No products found! Please create products first in the Products section.");
      } else if (forceRefresh || retryCount === 0) {
        toast.success(`✅ Loaded ${inventoryData.length} items (${products.length} products)`);
      }
    } catch (error: any) {
      console.error("❌ Error loading inventory:", error);
      if (retryCount < 2) {
        await new Promise((r) => setTimeout(r, 1500));
        if (showLoadingTimer) clearTimeout(showLoadingTimer);
        setLoading(false);
        return loadInventory(forceRefresh, retryCount + 1);
      }
      toast.error("Failed to load inventory. Check console for details.");
      setInventoryItems([]);
    } finally {
      if (showLoadingTimer) {
        clearTimeout(showLoadingTimer);
      }
      setLoading(false);
      setListRefreshing(false);
    }
  };

  const filteredItems = inventoryItems.filter((item) => {
    const matchesSearch =
      item.product.toLowerCase().includes(searchQuery.toLowerCase()) ||
      item.sku.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesSearch;
  });

  // Pagination calculations
  const totalPages = Math.ceil(filteredItems.length / itemsPerPage);
  const startIndex = (currentPage - 1) * itemsPerPage;
  const endIndex = startIndex + itemsPerPage;
  const paginatedItems = filteredItems.slice(startIndex, endIndex);
  
  // Pagination functions
  const goToFirstPage = () => setCurrentPage(1);
  const goToLastPage = () => setCurrentPage(totalPages);
  const goToPrevPage = () => setCurrentPage(prev => Math.max(1, prev - 1));
  const goToNextPage = () => setCurrentPage(prev => Math.min(totalPages, prev + 1));

  // Reset to page 1 when search changes
  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery]);

  /** Same tab: rebuild from session cache. Other tabs: refetch (cache is not shared). */
  useEffect(() => {
    const rebuildFromCache = () => {
      const peeked = moduleCache.peek<any[]>(MODULE_CACHE_KEYS.ADMIN_PRODUCTS);
      if (peeked && Array.isArray(peeked)) {
        setInventoryItems(productsToInventoryItems(peeked));
      }
    };

    const onWindowPatched = () => rebuildFromCache();

    const refetchFromServer = () => {
      void (async () => {
        try {
          const products = await getCachedAdminAllProducts(true);
          setInventoryItems(productsToInventoryItems(products));
        } catch {
          rebuildFromCache();
        }
      })();
    };

    window.addEventListener("migoo-admin-products-cache-patched", onWindowPatched);
    let bc: BroadcastChannel | null = null;
    try {
      bc = new BroadcastChannel(ADMIN_PRODUCTS_BROADCAST_CHANNEL);
      bc.onmessage = () => refetchFromServer();
    } catch {
      /* BroadcastChannel unsupported */
    }

    return () => {
      window.removeEventListener("migoo-admin-products-cache-patched", onWindowPatched);
      bc?.close();
    };
  }, []);

  // Inline editing - click number to edit
  const startEditing = (item: InventoryItem) => {
    setEditingId(item.id);
    setEditValue(String(item.onHand));
  };

  const saveQuantity = async (item: InventoryItem) => {
    const newQuantity = parseInt(editValue);
    
    if (isNaN(newQuantity) || newQuantity < 0) {
      toast.error("Invalid quantity");
      setEditingId(null);
      return;
    }

    const adjustment = newQuantity - item.onHand;
    
    console.log(`📦 Updating ${item.product}: ${item.onHand} → ${newQuantity} (adjustment: ${adjustment})`);

    // Optimistic update - instant UI change like Shopify
    setInventoryItems(prev => prev.map(i => 
      i.id === item.id 
        ? { ...i, onHand: newQuantity, available: newQuantity - i.committed }
        : i
    ));

    patchAdminProductInventoryInCache(item.id, newQuantity, {
      isVariant: item.isVariant,
      parentId: item.parentId,
    });

    setEditingId(null);
    setEditValue("");
    toast.success(`✅ Updated ${item.product} to ${newQuantity} units`);

    // Sync with backend in background
    try {
      const response = await fetch(
        `https://${projectId}.supabase.co/functions/v1/make-server-16010b6f/inventory/adjust`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${publicAnonKey}`,
          },
          body: JSON.stringify({
            itemId: item.id,
            adjustmentQty: String(adjustment),
            newSku: item.sku,
            reason: "Quick adjustment",
          }),
        }
      );

      if (!response.ok) {
        console.warn("Backend sync failed, but UI is updated");
      } else {
        console.log("✅ Backend synced successfully");
      }
    } catch (error) {
      console.warn("Backend sync error (UI still updated):", error);
    }
  };

  const quickAdjust = async (item: InventoryItem, amount: number) => {
    const newQuantity = item.onHand + amount;
    
    if (newQuantity < 0) {
      toast.error("Cannot go below 0");
      return;
    }

    console.log(`📦 Quick adjust ${item.product}: ${item.onHand} → ${newQuantity}`);

    // Instant update
    setInventoryItems(prev => prev.map(i => 
      i.id === item.id 
        ? { ...i, onHand: newQuantity, available: newQuantity - i.committed }
        : i
    ));

    patchAdminProductInventoryInCache(item.id, newQuantity, {
      isVariant: item.isVariant,
      parentId: item.parentId,
    });

    /** Input shows `editValue` while editing — clear so it reflects new `onHand` */
    if (editingId === item.id) {
      setEditingId(null);
      setEditValue("");
    }

    toast.success(`${amount > 0 ? '+' : ''}${amount} → ${item.product}`);

    // Sync backend
    try {
      await fetch(
        `https://${projectId}.supabase.co/functions/v1/make-server-16010b6f/inventory/adjust`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${publicAnonKey}`,
          },
          body: JSON.stringify({
            itemId: item.id,
            adjustmentQty: String(amount),
            newSku: item.sku,
            reason: "Quick adjustment",
          }),
        }
      );
    } catch (error) {
      console.warn("Backend sync error:", error);
    }
  };

  const cancelEditing = () => {
    setEditingId(null);
    setEditValue("");
  };

  if (loading) {
    return (
      <div className="p-8">
        <div className="mb-6">
          <h1 className="text-2xl font-semibold text-slate-900">{t('inventory.title')}</h1>
          <p className="text-sm text-slate-600 mt-1">Loading inventory...</p>
        </div>
        
        <Card>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50">
                  <th className="text-left py-3 px-4 text-sm font-medium text-slate-600">Product</th>
                  <th className="text-left py-3 px-4 text-sm font-medium text-slate-600">SKU</th>
                  <th className="text-left py-3 px-4 text-sm font-medium text-slate-600">Category</th>
                  <th className="text-left py-3 px-4 text-sm font-medium text-slate-600">Available</th>
                  <th className="text-left py-3 px-4 text-sm font-medium text-slate-600">Status</th>
                </tr>
              </thead>
              <tbody>
                {Array.from({ length: 5 }).map((_, index) => (
                  <tr key={`skeleton-${index}`} className="border-b border-slate-100 animate-pulse">
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
                      <div className="h-4 bg-slate-200 rounded w-24"></div>
                    </td>
                    <td className="py-3 px-4">
                      <div className="h-4 bg-slate-200 rounded w-28"></div>
                    </td>
                    <td className="py-3 px-4">
                      <div className="h-4 bg-slate-200 rounded w-16"></div>
                    </td>
                    <td className="py-3 px-4">
                      <div className="h-6 bg-slate-200 rounded-full w-20"></div>
                    </td>
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
    <div className="p-8">
      {/* Header */}
      <div className="mb-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold text-slate-900">{t('inventory.title')}</h1>
            <p className="text-sm text-slate-600 mt-1">
              {inventoryItems.length} products loaded from database
            </p>
          </div>
          <Button
            onClick={() => loadInventory(true)}
            variant="outline"
            disabled={loading && !listRefreshing}
            className="border-slate-300"
          >
            {listRefreshing ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Refreshing...
              </>
            ) : (
              <>
                <RefreshCw className="w-4 h-4 mr-2" />
                Refresh
              </>
            )}
          </Button>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <Card className="p-5 border-slate-200">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-slate-600 mb-1">Total Products</p>
              <p className="text-2xl font-semibold text-slate-900">
                {inventoryItems.length}
              </p>
            </div>
            <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center">
              <Package className="w-5 h-5 text-blue-600" />
            </div>
          </div>
        </Card>

        <Card className="p-5 border-slate-200">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-slate-600 mb-1">Total Stock</p>
              <p className="text-2xl font-semibold text-slate-900">
                {inventoryItems.reduce((sum, item) => sum + item.onHand, 0)}
              </p>
            </div>
            <div className="w-10 h-10 bg-green-100 rounded-lg flex items-center justify-center">
              <Package className="w-5 h-5 text-green-600" />
            </div>
          </div>
        </Card>

        <Card className="p-5 border-slate-200">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-slate-600 mb-1">Available</p>
              <p className="text-2xl font-semibold text-slate-900">
                {inventoryItems.reduce((sum, item) => sum + item.available, 0)}
              </p>
            </div>
            <div className="w-10 h-10 bg-amber-100 rounded-lg flex items-center justify-center">
              <Package className="w-5 h-5 text-amber-600" />
            </div>
          </div>
        </Card>
      </div>

      {/* Search */}
      <Card className="mb-4">
        <div className="p-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <Input
              placeholder="Search by product name or SKU..."
              className="pl-10 border-slate-300"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
        </div>
      </Card>

      {/* Inventory Table - SIMPLIFIED SHOPIFY STYLE */}
      <Card>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50">
                <th className="text-left py-3 px-4 text-sm font-medium text-slate-600">
                  Product
                </th>
                <th className="text-left py-3 px-4 text-sm font-medium text-slate-600">
                  SKU
                </th>
                <th className="text-center py-3 px-4 text-sm font-medium text-slate-600">
                  Stock
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {paginatedItems.map((item) => {
                const isLowStock = item.available < 50;
                const isOutOfStock = item.available === 0;
                const isEditing = editingId === item.id;

                return (
                  <tr key={item.id} className="hover:bg-slate-50">
                    <td className="py-3 px-4">
                      <div className="flex items-center gap-3">
                        <img
                          src={item.image}
                          alt={item.product}
                          className="w-12 h-12 rounded object-cover border border-slate-200"
                          onError={(e) => {
                            (e.target as HTMLImageElement).src = "https://images.unsplash.com/photo-1505740420928-5e560c06d30e?w=100&h=100&fit=crop";
                          }}
                        />
                        <div>
                          <p className="text-sm font-medium text-slate-900">{item.product}</p>
                          {isOutOfStock && (
                            <Badge variant="destructive" className="text-xs mt-1">
                              Out of Stock
                            </Badge>
                          )}
                          {isLowStock && !isOutOfStock && (
                            <Badge variant="secondary" className="text-xs mt-1 bg-amber-100 text-amber-700">
                              Low Stock
                            </Badge>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="py-3 px-4">
                      <span className="text-sm text-slate-600 font-mono">{item.sku}</span>
                    </td>
                    <td className="py-3 px-4">
                      <div className="flex items-center justify-center gap-2">
                        {/* Quick Decrease by 10 */}
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-9 w-9 p-0 border-slate-300 hover:bg-slate-100"
                          onClick={() => quickAdjust(item, -10)}
                          title="Decrease by 10"
                        >
                          <Minus className="w-4 h-4 text-slate-600" />
                        </Button>
                        
                        {/* Stock Input Box */}
                        <Input
                          type="number"
                          value={isEditing ? editValue : item.onHand}
                          onChange={(e) => {
                            setEditingId(item.id);
                            setEditValue(e.target.value);
                          }}
                          onBlur={() => {
                            if (isEditing && editValue !== String(item.onHand)) {
                              saveQuantity(item);
                            } else {
                              setEditingId(null);
                            }
                          }}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              saveQuantity(item);
                            }
                            if (e.key === 'Escape') {
                              cancelEditing();
                            }
                          }}
                          className="w-20 text-center font-semibold border-slate-300"
                        />
                        
                        {/* Quick Increase by 10 */}
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-9 w-9 p-0 border-slate-300 hover:bg-slate-100"
                          onClick={() => quickAdjust(item, 10)}
                          title="Increase by 10"
                        >
                          <Plus className="w-4 h-4 text-slate-600" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Pagination Controls */}
        {filteredItems.length > 0 && (
          <div className="p-4 border-t border-slate-200 flex items-center justify-between">
            {/* Left: Items per page */}
            <div className="flex items-center gap-2">
              <span className="text-sm text-slate-600">Show</span>
              <select
                value={itemsPerPage}
                onChange={(e) => {
                  setItemsPerPage(Number(e.target.value));
                  setCurrentPage(1); // Reset to first page
                }}
                className="px-3 py-1 border border-slate-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              >
                <option value={25}>25</option>
                <option value={50}>50</option>
                <option value={100}>100</option>
                <option value={200}>200</option>
              </select>
              <span className="text-sm text-slate-600">items per page</span>
            </div>

            {/* Center: Page info */}
            <div className="text-sm text-slate-600">
              Showing {startIndex + 1}-{Math.min(endIndex, filteredItems.length)} of {filteredItems.length} items
            </div>

            {/* Right: Navigation buttons */}
            <div className="flex items-center gap-1">
              <Button
                size="sm"
                variant="outline"
                className="h-8 w-8 p-0 border-slate-300 hover:bg-slate-100"
                onClick={goToFirstPage}
                disabled={currentPage === 1}
                title="First page"
              >
                <ChevronsLeft className="w-4 h-4" />
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="h-8 w-8 p-0 border-slate-300 hover:bg-slate-100"
                onClick={goToPrevPage}
                disabled={currentPage === 1}
                title="Previous page"
              >
                <ChevronLeft className="w-4 h-4" />
              </Button>
              
              {/* Page number */}
              <div className="px-3 py-1 text-sm font-medium text-slate-700">
                {currentPage}
              </div>
              
              <Button
                size="sm"
                variant="outline"
                className="h-8 w-8 p-0 border-slate-300 hover:bg-slate-100"
                onClick={goToNextPage}
                disabled={currentPage === totalPages}
                title="Next page"
              >
                <ChevronRight className="w-4 h-4" />
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="h-8 w-8 p-0 border-slate-300 hover:bg-slate-100"
                onClick={goToLastPage}
                disabled={currentPage === totalPages}
                title="Last page"
              >
                <ChevronsRight className="w-4 h-4" />
              </Button>
            </div>
          </div>
        )}

        {/* Empty State */}
        {filteredItems.length === 0 && (
          <div className="p-12 text-center">
            <Package className="w-16 h-16 text-slate-300 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-slate-900 mb-2">
              No Products Found
            </h3>
            <p className="text-sm text-slate-500 mb-4">
              {searchQuery 
                ? "No products match your search. Try different keywords."
                : "Create some products first in the Products section!"}
            </p>
            {!searchQuery && (
              <Button onClick={() => window.location.href = '#products'}>
                Go to Products
              </Button>
            )}
          </div>
        )}
      </Card>
    </div>
  );
}