import React, { useState, useEffect, useMemo } from "react";
import { 
  Plus, 
  Search, 
  ChevronDown, 
  Edit, 
  Trash2, 
  FileText, 
  Filter, 
  Users, 
  Handshake, 
  TrendingUp, 
  CalendarDays, 
  MoreVertical, 
  Eye 
} from "lucide-react";
import { productsApi, apiClient } from "../../utils/api";
import { Product, ProductsResponse } from "../../types";
import { API_TIMEOUTS, PRODUCT_STATUSES } from "../../constants";
import { SmartCache, CACHE_KEYS, CACHE_TTL } from "../../utils/cache";
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

interface ProductListProps {
  onProductsChanged?: () => void; // 🔥 NEW: Callback when products change
}

export function ProductList({ onProductsChanged }: ProductListProps) {
  const { t } = useLanguage();
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
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

  // Fetch products from API
  useEffect(() => {
    loadProducts();
    loadVendors(); // 🔥 Load vendors to map IDs to names
    
    // 🔥 Listen for vendor updates to refresh vendor names
    const handleVendorUpdate = () => {
      console.log("📣 Vendor updated, reloading vendor names in product list...");
      loadVendors();
    };
    
    window.addEventListener('vendorDataUpdated', handleVendorUpdate as EventListener);
    
    return () => {
      window.removeEventListener('vendorDataUpdated', handleVendorUpdate as EventListener);
    };
  }, []);

  const loadProducts = async () => {
    // 🔄 ALWAYS FETCH FRESH DATA - No cache display
    setLoading(true);
    
    try {
      console.log('🔄 Loading products from database...');
      const response = await apiClient.get<ProductsResponse>('/products', {
        timeout: API_TIMEOUTS.LIST,
      });
      const productsData = response.products || [];
      
      // Update UI with fresh data
      setProducts(productsData);
      
      // Cache for next time
      SmartCache.set(CACHE_KEYS.PRODUCTS, productsData);
      
      console.log(`✅ Loaded ${productsData.length} products from server`);
    } catch (error: any) {
      console.error("❌ Failed to load products:", error);
      console.log("ℹ️ No products found. Click the seed button on Dashboard to create sample products.");
      setProducts([]);
      // Show helpful toast message
      toast.info("No products yet. Go to Dashboard to create sample products!", {
        duration: 5000,
      });
    } finally {
      setLoading(false);
    }
  };

  // 🔥 Load vendors to map IDs to names
  const loadVendors = async () => {
    try {
      const response = await apiClient.get('/vendors');
      if (response.vendors && Array.isArray(response.vendors)) {
        // Create a map of vendor ID to vendor name
        const map: Record<string, string> = {};
        response.vendors.forEach((vendor: any) => {
          if (vendor.id && vendor.name) {
            map[vendor.id] = vendor.name;
          }
        });
        setVendorsMap(map);
        console.log(`✅ Loaded ${response.vendors.length} vendors for name mapping`);
      }
    } catch (error) {
      console.error("❌ Failed to load vendors:", error);
      // Not critical - just means vendor names won't display
    }
  };

  const handleSaveProduct = async (data: any) => {
    // OPTIMISTIC UPDATE - Navigate back AND add product to list INSTANTLY!
    const optimisticProduct: Product = {
      id: `temp-${Date.now()}`, // Temporary ID
      name: data.title || data.name || "New Product",
      description: data.description || "",
      price: typeof data.price === 'number' ? `$${data.price.toFixed(2)}` : String(data.price || "0"), // Convert number to string
      sku: data.sku || `SKU-${Date.now()}`,
      inventory: data.inventory || 0,
      category: data.category || "Uncategorized",
      status: data.status || "active",
      vendor: data.vendor || "",
      collaborator: data.collaborator || "",
      salesVolume: 0,
      createDate: new Date().toISOString(),
      images: data.images || [],
      image: data.images?.[0] || data.image || "",
      // 🎨 VARIANT DATA - Critical for Shopify-style variant system
      hasVariants: data.hasVariants || false,
      variantOptions: data.variantOptions || [],
      variants: data.variants || []
    };
    
    // Add to UI immediately
    const updatedProducts = [optimisticProduct, ...products];
    setProducts(updatedProducts);
    
    // Cache immediately for instant reload
    SmartCache.set(CACHE_KEYS.PRODUCTS, updatedProducts);
    
    setCurrentView("list");
    
    // Show instant success feedback
    toast.success("✅ Product added!", { duration: 2000 });
    
    // Sync with server in background
    try {
      console.log("📤 Sending product to server:", {
        title: data.title,
        price: data.price,
        category: data.category,
        vendor: data.vendor,
        collaborator: data.collaborator,
        hasVariants: data.hasVariants,
        variantCount: data.variants?.length || 0
      });
      
      const response = await productsApi.create(data);
      console.log("✅ Server response:", response);
      
      // Check if creation was successful
      if (!response.success && !response.product) {
        throw new Error(response.error || "Failed to create product - no product returned");
      }
      
      // Replace optimistic product with real one from server
      if (response.product) {
        console.log("🔄 Replacing optimistic product with server product:", {
          optimisticId: optimisticProduct.id,
          realId: response.product.id,
          realProduct: response.product
        });
        
        const finalProducts = updatedProducts.map(p => 
          p.id === optimisticProduct.id ? response.product : p
        );
        setProducts(finalProducts);
        
        console.log("✅ Final products list:", finalProducts.map(p => ({ id: p.id, name: p.name })));
        
        // Update cache with real data
        SmartCache.set(CACHE_KEYS.PRODUCTS, finalProducts);
      }
      
      // Clear storefront cache so new products appear immediately
      SmartCache.delete(CACHE_KEYS.STOREFRONT_PRODUCTS);
      console.log("🗑️ Cleared storefront cache");
      
      if (onProductsChanged) onProductsChanged();
    } catch (error) {
      console.error("❌ Failed to create product - Full error:", error);
      console.error("❌ Error message:", error instanceof Error ? error.message : String(error));
      console.error("❌ Error stack:", error instanceof Error ? error.stack : "No stack");
      
      // Remove optimistic product on error
      const revertedProducts = products.filter(p => p.id !== optimisticProduct.id);
      setProducts(revertedProducts);
      
      // Revert cache
      SmartCache.set(CACHE_KEYS.PRODUCTS, revertedProducts);
      
      // Check if it's a SKU validation error
      if (error instanceof Error && error.message.includes("SKU already exists")) {
        toast.error(`❌ SKU Validation Error: ${error.message}`, { duration: 5000 });
      } else {
        const errorMsg = error instanceof Error ? error.message : "Failed to save product to server";
        toast.error(`❌ Error: ${errorMsg}. Check console for details.`, { duration: 5000 });
      }
    }
  };

  const handleUpdateProduct = async (id: string, data: any) => {
    try {
      await productsApi.update(id, data);
      toast.success("Product updated successfully!");
      
      // Clear storefront cache so updated products appear immediately
      SmartCache.delete(CACHE_KEYS.STOREFRONT_PRODUCTS);
      console.log("🗑️ Cleared storefront cache");
      
      await loadProducts();
      if (onProductsChanged) onProductsChanged(); // 🔥 NEW: Notify parent component
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
    // 🚀 OPTIMISTIC DELETE - Remove from UI INSTANTLY!
    const updatedProducts = products.filter(p => p.id !== id);
    setProducts(updatedProducts);
    
    // Update cache immediately for instant reload
    SmartCache.set(CACHE_KEYS.PRODUCTS, updatedProducts);
    
    // Clear storefront cache too
    SmartCache.delete(CACHE_KEYS.STOREFRONT_PRODUCTS);
    
    // Show instant success feedback
    toast.success("Product deleted!", { duration: 2000 });
    
    // Sync with server in background
    try {
      await productsApi.delete(id);
      console.log(`✅ Product ${id} deleted from server`);
      
      if (onProductsChanged) onProductsChanged();
    } catch (error) {
      console.error("Failed to delete product:", error);
      const errorMessage = error instanceof Error ? error.message : "Failed to delete product";
      
      // If product not found on server, that's fine (it's already gone)
      if (errorMessage.includes("Product not found") || errorMessage.includes("404")) {
        console.log("Product already deleted from server");
      } else {
        // Real error - revert the optimistic delete
        toast.error(`Failed to delete: ${errorMessage}`);
        setProducts(products); // Restore original list
        SmartCache.set(CACHE_KEYS.PRODUCTS, products);
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
        // Bulk delete with error handling for each product
        let successCount = 0;
        let errorCount = 0;
        let alreadyDeletedCount = 0;
        
        for (const productId of selectedProducts) {
          try {
            await productsApi.delete(productId);
            successCount++;
          } catch (error) {
            const errorMessage = error instanceof Error ? error.message : "";
            if (errorMessage.includes("Product not found") || errorMessage.includes("404")) {
              alreadyDeletedCount++;
            } else {
              console.error(`Failed to delete product ${productId}:`, error);
              errorCount++;
            }
          }
        }
        
        if (successCount > 0) {
          toast.success(`${successCount} product(s) deleted successfully!`);
          // Clear both storefront and admin cache
          SmartCache.delete(CACHE_KEYS.STOREFRONT_PRODUCTS);
          SmartCache.delete(CACHE_KEYS.PRODUCTS); // FIXED: Use PRODUCTS not ADMIN_PRODUCTS
          console.log("🗑️ Cleared product caches");
        }
        if (alreadyDeletedCount > 0) {
          toast.info(`${alreadyDeletedCount} product(s) were already deleted`);
        }
        if (errorCount > 0) {
          toast.error(`${errorCount} product(s) could not be deleted`);
        }
        setSelectedProducts([]);
      } else if (productToDelete) {
        // Single delete
        try {
          await productsApi.delete(productToDelete);
          toast.success("Product deleted successfully!");
          // Clear both storefront and admin cache
          SmartCache.delete(CACHE_KEYS.STOREFRONT_PRODUCTS);
          SmartCache.delete(CACHE_KEYS.PRODUCTS); // FIXED: Use PRODUCTS not ADMIN_PRODUCTS
          console.log("🗑️ Cleared product caches");
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : "";
          if (errorMessage.includes("Product not found") || errorMessage.includes("404")) {
            toast.info("Product already deleted");
          } else {
            throw error; // Re-throw if it's a real error
          }
        }
      }
      await loadProducts();
      if (onProductsChanged) onProductsChanged();
      setDeleteDialogOpen(false);
      setProductToDelete(null);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Failed to delete product(s)";
      
      // If product not found, just refresh the list (it's already gone)
      if (errorMessage.includes("Product not found") || errorMessage.includes("404")) {
        toast.info("Product already deleted");
        await loadProducts();
      } else {
        console.error("Failed to delete product(s):", error);
        toast.error(errorMessage);
      }
      setDeleteDialogOpen(false);
      setProductToDelete(null);
    }
  };

  // Load full product details when editing (to get all images)
  const handleEditProduct = async (productId: string) => {
    try {
      // Don't show full-screen loading - just load the product details silently
      const response = await productsApi.getById(productId);
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
      // Don't show full-screen loading - just load the product details silently
      const response = await productsApi.getById(productId);
      if (response.product) {
        setSelectedProduct(response.product);
        setCurrentView("storefront");
      }
    } catch (error) {
      console.error("Failed to load product details:", error);
      toast.error("Failed to load product details");
    }
  };

  // Get unique vendors and collaborators
  const vendors = Array.from(new Set(products.map(p => p.vendor).filter(Boolean)));
  const collaborators = Array.from(new Set(products.map(p => p.collaborator).filter(Boolean)));

  const filteredProducts = products.filter(product => {
    const matchesSearch = (product.name?.toLowerCase() || '').includes(searchQuery.toLowerCase()) ||
                         (product.sku?.toLowerCase() || '').includes(searchQuery.toLowerCase());
    const matchesStatus = statusFilter === "all" || product.status === statusFilter;
    
    // Tab-specific filtering
    let matchesTab = true;
    if (activeTab === "vendor") {
      matchesTab = vendorFilter === "all" || product.vendor === vendorFilter;
    } else if (activeTab === "collaborator") {
      matchesTab = collaboratorFilter === "all" || product.collaborator === collaboratorFilter;
    }
    
    return matchesSearch && matchesStatus && matchesTab;
  });

  // Sort products
  const getSortedProducts = (productList: Product[]) => {
    const sorted = [...productList];
    
    if (activeTab === "sales") {
      return sorted.sort((a, b) => b.salesVolume - a.salesVolume);
    }
    
    // Sort by create date
    if (sortBy === "newest") {
      return sorted.sort((a, b) => new Date(b.createDate).getTime() - new Date(a.createDate).getTime());
    } else if (sortBy === "oldest") {
      return sorted.sort((a, b) => new Date(a.createDate).getTime() - new Date(b.createDate).getTime());
    }
    
    return sorted;
  };

  const displayProducts = getSortedProducts(filteredProducts);

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
    if (status === "all") return products.length;
    return products.filter(p => p.status === status).length;
  };

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
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold text-slate-900">{t('products.title')}</h1>
              <p className="text-slate-500 mt-1">{t('products.subtitle')}</p>
            </div>
            <Button className="bg-slate-900 hover:bg-slate-800" onClick={() => setCurrentView("add")}>
              {t('products.addProduct')}
            </Button>
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
                          placeholder="Search products by name or SKU..."
                          className="pl-10"
                          value={searchQuery}
                          onChange={(e) => setSearchQuery(e.target.value)}
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
                          placeholder="Search products by name or SKU..."
                          className="pl-10"
                          value={searchQuery}
                          onChange={(e) => setSearchQuery(e.target.value)}
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
                          {vendors.map(vendor => (
                            <SelectItem key={vendor} value={vendor}>{vendor}</SelectItem>
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
                          placeholder="Search products by name or SKU..."
                          className="pl-10"
                          value={searchQuery}
                          onChange={(e) => setSearchQuery(e.target.value)}
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
                            {formatMMK(product.price.replace('$', '').replace(/,/g, ''))}
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