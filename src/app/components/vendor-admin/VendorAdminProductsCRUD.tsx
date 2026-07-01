import {
  useState,
  useEffect,
  useMemo,
  useCallback,
  useRef,
  type KeyboardEvent,
} from "react";
import { useNavigate, useLocation } from "react-router";
import { pathnameUnderAdmin } from "../../utils/vendorSubdomainHooks";
import {
  useVendorAdminRouteParams,
  useVendorHostCleanAdmin,
} from "../../utils/vendorAdminRouteParams";
import { 
  Plus, 
  Search, 
  Eye,
  Package,
  Check,
  ChevronLeft,
  ChevronRight,
  Store,
  X,
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
  invalidateVendorStorefrontCatalogCachesAfterProductLinkChange,
  moduleCache,
  CACHE_KEYS,
  getCachedAdminProductsPage,
  ADMIN_PRODUCTS_INITIAL_PAGE_SIZE,
  invalidateAdminAllProductsCache,
  ADMIN_PRODUCTS_LIST_CHANGED_EVENT,
} from "../../utils/module-cache";
import { projectId, publicAnonKey } from "../../../../utils/supabase/info";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "../ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../ui/select";
import { Tabs, TabsList, TabsTrigger } from "../ui/tabs";
import { productMatchesAdminLiveSearch } from "../../utils/adminProductSearch";
import {
  buildAssignPickerSession,
  reuseAssignPickerSession,
  type VendorAssignPickerSession,
} from "../../utils/vendorAssignPickerSession";
import { VendorAdminListingPagination } from "./VendorAdminListingPagination";
import { useLanguage } from "../../contexts/LanguageContext";

/**
 * True when the in-memory assignable list can render this page/window without hitting the API.
 */
function vendorAdminPickerCacheSuppliesPage(
  listLen: number,
  page: number,
  pageSize: number,
  serverTotal: number
): boolean {
  const start = (page - 1) * pageSize;
  const end = start + pageSize;
  if (listLen >= end) return true;
  if (serverTotal > 0 && listLen >= serverTotal) return true;
  return false;
}

/** Full catalog slice from ADMIN_PRODUCTS cache (includes items already on vendor — for checkmarks). */
function filterVendorPickerCatalogFromPeek(committedQ: string): any[] {
  const full = moduleCache.peek<any[]>(CACHE_KEYS.ADMIN_PRODUCTS);
  if (!full?.length) return [];
  return full.filter((p) => productMatchesAdminLiveSearch(p, committedQ.trim()));
}

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
  /** Public storefront URL segment (`/store/:slug`) — required to clear the right catalog cache after picker saves */
  vendorStoreSlug?: string;
  vendorName: string;
  headerSearchQuery?: string;
  onHeaderSearchQueryChange?: (q: string) => void;
}

export function VendorAdminProductsCRUD({
  vendorId,
  vendorStoreSlug,
  vendorName,
  headerSearchQuery,
  onHeaderSearchQueryChange,
}: VendorAdminProductsCRUDProps) {
  const { t } = useLanguage();
  const navigate = useNavigate();
  const location = useLocation();
  const { storeName: routeStoreName } = useVendorAdminRouteParams();
  const { clean: vendorHostCleanAdmin } = useVendorHostCleanAdmin();
  const onVendorHostCleanAdmin =
    vendorHostCleanAdmin && pathnameUnderAdmin(location.pathname);
  const adminPrefix = onVendorHostCleanAdmin ? null : "vendor";
  const cachedVendorProductsPayload = moduleCache.peek<{ products?: Product[] }>(
    CACHE_KEYS.vendorProductsAdmin(vendorId)
  );
  const hasWarmVendorProductsCache =
    cachedVendorProductsPayload != null && Array.isArray(cachedVendorProductsPayload.products);
  const [products, setProducts] = useState<Product[]>(
    () =>
      (hasWarmVendorProductsCache ? cachedVendorProductsPayload?.products : undefined) || []
  );
  const [loading, setLoading] = useState(() => !hasWarmVendorProductsCache);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "active" | "off-shelf">("all");
  const [sortBy, setSortBy] = useState("newest");
  const [selectedProducts, setSelectedProducts] = useState<string[]>([]);
  const [showRemoveConfirm, setShowRemoveConfirm] = useState(false);
  const [removingFromStore, setRemovingFromStore] = useState(false);
  
  const [showProductSelectModal, setShowProductSelectModal] = useState(false);
  const [allPlatformProducts, setAllPlatformProducts] = useState<any[]>([]);
  const [loadingAllProducts, setLoadingAllProducts] = useState(false);
  const [searchProductQuery, setSearchProductQuery] = useState("");
  const [pickerSelectedIds, setPickerSelectedIds] = useState<string[]>([]);
  /** Assigned catalog rows the user has unchecked (will unassign on save). */
  const [pickerAssignedUncheckedIds, setPickerAssignedUncheckedIds] = useState<string[]>([]);
  const [savingPicker, setSavingPicker] = useState(false);
  const [assignPickerPage, setAssignPickerPage] = useState(1);
  const [assignPickerPageSize, setAssignPickerPageSize] = useState(ADMIN_PRODUCTS_INITIAL_PAGE_SIZE);
  const [vendorListPage, setVendorListPage] = useState(1);
  const [vendorListPageSize, setVendorListPageSize] = useState(ADMIN_PRODUCTS_INITIAL_PAGE_SIZE);
  const [assignPickerUseFullCache, setAssignPickerUseFullCache] = useState(false);
  const [assignPickerServerTotal, setAssignPickerServerTotal] = useState(0);
  const [assignPickerServerHasMore, setAssignPickerServerHasMore] = useState(false);
  /** Vendor picker: filter saved catalog while typing; server load only after Enter. */
  const [pickerUiMode, setPickerUiMode] = useState<"cache" | "server">("cache");
  const [pickerCommittedSearch, setPickerCommittedSearch] = useState("");
  const pickerEnterFetchRef = useRef(false);
  const pickerServerSessionRef = useRef<VendorAssignPickerSession | null>(null);

  useEffect(() => {
    loadProducts(false);
  }, [vendorId]);

  // Realtime bridge: central product pulse invalidates vendor product pools without a broad KV subscription here.
  useEffect(() => {
    let debounce: ReturnType<typeof setTimeout> | undefined;
    const schedule = () => {
      window.clearTimeout(debounce);
      debounce = window.setTimeout(() => {
        invalidateVendorProductsAdminCache(vendorId);
        void loadProducts(true);
      }, 320);
    };
    window.addEventListener(ADMIN_PRODUCTS_LIST_CHANGED_EVENT, schedule);
    return () => {
      window.clearTimeout(debounce);
      window.removeEventListener(ADMIN_PRODUCTS_LIST_CHANGED_EVENT, schedule);
    };
  }, [vendorId]);

  useEffect(() => {
    if (headerSearchQuery === undefined) return;
    setSearchQuery(headerSearchQuery);
  }, [headerSearchQuery]);

  const handleSearchInputChange = useCallback(
    (value: string) => {
      setSearchQuery(value);
      onHeaderSearchQueryChange?.(value);
    },
    [onHeaderSearchQueryChange]
  );

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

    // Keep current rows visible when revisiting; only show skeleton on true cold starts.
    if (products.length === 0) {
      setLoading(true);
    }
    try {
      const data = await getCachedVendorProductsAdmin(vendorId, forceRefresh);
      setProducts(data.products || []);
    } catch (error) {
      console.error("Error loading products:", error);
      toast.error("Failed to load products");
    } finally {
      setLoading(false);
    }
  };

  const isProductAssignedToThisVendor = useCallback(
    (p: any) =>
      p?.selectedVendors?.includes(vendorId) || String(p?.vendorId ?? "") === String(vendorId),
    [vendorId]
  );

  const cachedAssignableForCommittedSearch = useMemo(
    () =>
      showProductSelectModal ? filterVendorPickerCatalogFromPeek(pickerCommittedSearch) : [],
    [showProductSelectModal, pickerCommittedSearch]
  );

  useEffect(() => {
    if (!showProductSelectModal) return;

    const full = moduleCache.peek<unknown[]>(CACHE_KEYS.ADMIN_PRODUCTS);
    const hasFullCatalogCache = full && Array.isArray(full) && full.length > 0;

    if (pickerUiMode === "cache" && hasFullCatalogCache) {
      setAssignPickerUseFullCache(true);
      setLoadingAllProducts(false);
      setAssignPickerServerTotal(0);
      setAssignPickerServerHasMore(false);
      setAllPlatformProducts([]);
      return;
    }

    setAssignPickerUseFullCache(false);

    const serverSearchDiverged =
      pickerUiMode === "server" &&
      searchProductQuery.trim() !== pickerCommittedSearch.trim();
    if (serverSearchDiverged) {
      setLoadingAllProducts(false);
      return;
    }

    const assignableList = filterVendorPickerCatalogFromPeek(pickerCommittedSearch);
    const L = assignableList.length;
    const forceRefresh = pickerEnterFetchRef.current;

    if (
      !forceRefresh &&
      vendorAdminPickerCacheSuppliesPage(
        L,
        assignPickerPage,
        assignPickerPageSize,
        assignPickerServerTotal
      )
    ) {
      setLoadingAllProducts(false);
      return;
    }

    const reused = reuseAssignPickerSession(
      pickerServerSessionRef.current,
      vendorId,
      pickerCommittedSearch.trim(),
      assignPickerPage,
      assignPickerPageSize
    );
    if (!forceRefresh && reused) {
      setAllPlatformProducts(reused.rows);
      setAssignPickerServerTotal(reused.total);
      setAssignPickerServerHasMore(reused.hasMore);
      setLoadingAllProducts(false);
      return;
    }

    pickerEnterFetchRef.current = false;
    let cancelled = false;

    void (async () => {
      setLoadingAllProducts(true);
      try {
        const payload = await getCachedAdminProductsPage(
          {
            page: assignPickerPage,
            pageSize: assignPickerPageSize,
            q: pickerCommittedSearch.trim(),
            tab: "all",
            status: "all",
            vendor: "all",
            collaborator: "all",
            sort: "newest",
          },
          forceRefresh
        );
        if (cancelled) return;
        const rows = (payload.products || []) as any[];
        setAllPlatformProducts(rows);
        setAssignPickerServerTotal(payload.total);
        setAssignPickerServerHasMore(!!payload.hasMore);
        pickerServerSessionRef.current = buildAssignPickerSession(
          vendorId,
          pickerCommittedSearch.trim(),
          assignPickerPage,
          assignPickerPageSize,
          payload
        );
      } catch (error) {
        if (!cancelled) {
          console.error("Assign picker: failed to load products page", error);
          toast.error("Failed to load products");
          setAllPlatformProducts([]);
          setAssignPickerServerTotal(0);
          setAssignPickerServerHasMore(false);
          pickerServerSessionRef.current = null;
        }
      } finally {
        if (!cancelled) setLoadingAllProducts(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [
    showProductSelectModal,
    pickerUiMode,
    searchProductQuery,
    assignPickerPage,
    assignPickerPageSize,
    pickerCommittedSearch,
    assignPickerServerTotal,
  ]);

  const pickerAssignableFromFullCache = useMemo(() => {
    if (!showProductSelectModal || !assignPickerUseFullCache) return [];
    const full = moduleCache.peek<any[]>(CACHE_KEYS.ADMIN_PRODUCTS);
    if (!full || !Array.isArray(full)) return [];
    const q = searchProductQuery.trim();
    return full.filter((p) => productMatchesAdminLiveSearch(p, q));
  }, [showProductSelectModal, assignPickerUseFullCache, searchProductQuery]);

  const pickerSearchDiverged = useMemo(
    () =>
      !assignPickerUseFullCache &&
      searchProductQuery.trim() !== pickerCommittedSearch.trim(),
    [assignPickerUseFullCache, searchProductQuery, pickerCommittedSearch]
  );

  const pickerServerViewServedFromCache = useMemo(() => {
    if (!showProductSelectModal || assignPickerUseFullCache || pickerSearchDiverged) return false;
    const L = cachedAssignableForCommittedSearch.length;
    return vendorAdminPickerCacheSuppliesPage(
      L,
      assignPickerPage,
      assignPickerPageSize,
      assignPickerServerTotal
    );
  }, [
    showProductSelectModal,
    assignPickerUseFullCache,
    pickerSearchDiverged,
    cachedAssignableForCommittedSearch,
    assignPickerPage,
    assignPickerPageSize,
    assignPickerServerTotal,
  ]);

  const displayPickerRows = useMemo(() => {
    if (assignPickerUseFullCache) {
      const start = (assignPickerPage - 1) * assignPickerPageSize;
      return pickerAssignableFromFullCache.slice(start, start + assignPickerPageSize);
    }
    const base = allPlatformProducts;
    const live = searchProductQuery.trim();
    if (live !== pickerCommittedSearch.trim()) {
      return base.filter((p: any) => productMatchesAdminLiveSearch(p, live));
    }
    const L = cachedAssignableForCommittedSearch.length;
    const start = (assignPickerPage - 1) * assignPickerPageSize;
    if (
      vendorAdminPickerCacheSuppliesPage(
        L,
        assignPickerPage,
        assignPickerPageSize,
        assignPickerServerTotal
      )
    ) {
      return cachedAssignableForCommittedSearch.slice(start, start + assignPickerPageSize);
    }
    return base;
  }, [
    assignPickerUseFullCache,
    pickerAssignableFromFullCache,
    assignPickerPage,
    assignPickerPageSize,
    allPlatformProducts,
    searchProductQuery,
    pickerCommittedSearch,
    cachedAssignableForCommittedSearch,
    assignPickerServerTotal,
  ]);

  const pickerEveryRowChecked = useMemo(() => {
    if (displayPickerRows.length === 0) return false;
    return displayPickerRows.every((p) =>
      isProductAssignedToThisVendor(p)
        ? !pickerAssignedUncheckedIds.includes(p.id)
        : pickerSelectedIds.includes(p.id)
    );
  }, [displayPickerRows, pickerAssignedUncheckedIds, pickerSelectedIds, isProductAssignedToThisVendor]);

  const pickerAssignedCheckedOnPageCount = useMemo(
    () =>
      displayPickerRows.filter(
        (p) => isProductAssignedToThisVendor(p) && !pickerAssignedUncheckedIds.includes(p.id)
      ).length,
    [displayPickerRows, pickerAssignedUncheckedIds, isProductAssignedToThisVendor]
  );

  const committedAssignableLen = cachedAssignableForCommittedSearch.length;
  const assignPickerTotalPages = pickerSearchDiverged
    ? 1
    : assignPickerUseFullCache
      ? Math.max(1, Math.ceil(pickerAssignableFromFullCache.length / assignPickerPageSize) || 1)
      : pickerServerViewServedFromCache
        ? Math.max(
            1,
            Math.ceil(
              (assignPickerServerTotal > 0
                ? Math.max(assignPickerServerTotal, committedAssignableLen)
                : committedAssignableLen) / assignPickerPageSize
            ) || 1
          )
        : Math.max(1, Math.ceil(assignPickerServerTotal / assignPickerPageSize) || 1);

  const assignPickerFooterProductCount = assignPickerUseFullCache
    ? pickerAssignableFromFullCache.length
    : pickerServerViewServedFromCache
      ? assignPickerServerTotal > 0
        ? Math.max(assignPickerServerTotal, committedAssignableLen)
        : committedAssignableLen
      : assignPickerServerTotal;

  const assignPickerCanGoNext = pickerSearchDiverged
    ? false
    : assignPickerUseFullCache
      ? assignPickerPage < assignPickerTotalPages
      : pickerServerViewServedFromCache
        ? assignPickerPage < assignPickerTotalPages
        : assignPickerServerHasMore;

  const assignPickerCanGoPrev = pickerSearchDiverged ? false : assignPickerPage > 1;

  const pickerShowEmpty = !loadingAllProducts && displayPickerRows.length === 0;

  const handleOpenSelectProduct = () => {
    const full = moduleCache.peek<unknown[]>(CACHE_KEYS.ADMIN_PRODUCTS);
    const hasFullCatalogCache = full && Array.isArray(full) && full.length > 0;
    pickerServerSessionRef.current = null;
    pickerEnterFetchRef.current = false;
    setPickerSelectedIds([]);
    setPickerAssignedUncheckedIds([]);
    setSearchProductQuery("");
    setPickerCommittedSearch("");
    setPickerUiMode(hasFullCatalogCache ? "cache" : "server");
    setAssignPickerPage(1);
    setAssignPickerPageSize(ADMIN_PRODUCTS_INITIAL_PAGE_SIZE);
    setLoadingAllProducts(!hasFullCatalogCache);
    setShowProductSelectModal(true);
  };

  const handlePickerSearchKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key !== "Enter") return;
    e.preventDefault();
    pickerEnterFetchRef.current = true;
    setPickerUiMode("server");
    setPickerCommittedSearch(searchProductQuery.trim());
    setAssignPickerPage(1);
  };

  const togglePickerCatalogRow = useCallback(
    (product: any) => {
      const id = String(product?.id ?? "");
      if (!id) return;
      if (isProductAssignedToThisVendor(product)) {
        setPickerAssignedUncheckedIds((prev) =>
          prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
        );
        return;
      }
      setPickerSelectedIds((prev) =>
        prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
      );
    },
    [isProductAssignedToThisVendor]
  );

  const handleSavePickerProducts = async () => {
    const toAdd = pickerSelectedIds;
    const toRemove = [...new Set(pickerAssignedUncheckedIds)];
    if (toAdd.length === 0 && toRemove.length === 0) {
      toast.error("No changes to apply");
      return;
    }

    setSavingPicker(true);
    try {
      const res = await fetch(
        `https://${projectId}.supabase.co/functions/v1/make-server-16010b6f/products/bulk-assign-vendor`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${publicAnonKey}`,
          },
          body: JSON.stringify({
            vendorId,
            productIds: toAdd,
            removeProductIds: toRemove,
          }),
        }
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(
          typeof data?.error === "string" ? data.error : `Update failed (${res.status})`
        );
      }
      let added = typeof data.added === "number" ? data.added : 0;
      let addFailed = typeof data.addFailed === "number" ? data.addFailed : 0;
      let removed = typeof data.removed === "number" ? data.removed : 0;
      let removeFailed = typeof data.removeFailed === "number" ? data.removeFailed : 0;
      if (toAdd.length > 0 && toRemove.length === 0) {
        if (added === 0 && typeof data.updated === "number") added = data.updated;
        if (addFailed === 0 && typeof data.failed === "number") addFailed = data.failed;
      }

      if (addFailed > 0 || removeFailed > 0) {
        toast.warning(
          `Updated store: +${added} added, −${removed} removed. Some operations failed (${addFailed + removeFailed}).`
        );
      } else if (toAdd.length > 0 && toRemove.length > 0) {
        toast.success(`Added ${added} and removed ${removed} product(s)`);
      } else if (toRemove.length > 0) {
        toast.success(`Removed ${removed} product(s) from your store`);
      } else {
        toast.success(`${added} product(s) added to your store`);
      }

      setShowProductSelectModal(false);
      setPickerSelectedIds([]);
      setPickerAssignedUncheckedIds([]);
      invalidateAdminAllProductsCache();
      invalidateVendorProductsAdminCache(vendorId);
      invalidateVendorStorefrontCatalogCachesAfterProductLinkChange(vendorId, [
        vendorStoreSlug,
        routeStoreName,
      ]);
      await loadProducts(true);
    } catch (error) {
      console.error("Error applying product picker changes:", error);
      toast.error(error instanceof Error ? error.message : "Failed to apply changes");
    } finally {
      setSavingPicker(false);
    }
  };

  const formatPickerPrice = (product: any) => {
    let priceValue = 0;
    const rawPrice = product?.price ?? product?.salePrice ?? product?.regularPrice;
    if (typeof rawPrice === "string") {
      priceValue = parseFloat(rawPrice.replace(/[$,]/g, "")) || 0;
    } else if (typeof rawPrice === "number") {
      priceValue = rawPrice;
    }
    return `${Math.round(priceValue).toLocaleString()} MMK`;
  };

  const getPickerProductStatusBadge = (status: string) => {
    const variants: Record<string, { color: string; label: string }> = {
      active: { color: "bg-green-100 text-green-700 border-green-200", label: "Active" },
      "off-shelf": { color: "bg-red-100 text-red-700 border-red-200", label: "Off Shelf" },
      discontinued: { color: "bg-gray-100 text-gray-700 border-gray-200", label: "Discontinued" },
    };
    const variant = variants[status] || variants.active;
    return (
      <Badge className={`${variant.color} border text-xs`}>
        {variant.label}
      </Badge>
    );
  };

  const filteredProducts = useMemo(() => {
    return products.filter((product) => {
      const matchesSearch = productMatchesAdminLiveSearch(product, searchQuery);
      const matchesStatus =
        statusFilter === "all" ||
        (statusFilter === "active" &&
          (product.status === "active" || product.status === "Active")) ||
      (statusFilter === "off-shelf" && product.status === "off-shelf");
    return matchesSearch && matchesStatus;
  });
  }, [products, searchQuery, statusFilter]);

  const sortedProducts = useMemo(() => {
    return [...filteredProducts].sort((a, b) => {
    if (sortBy === "newest") {
      return new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime();
      }
      return new Date(a.createdAt || 0).getTime() - new Date(b.createdAt || 0).getTime();
    });
  }, [filteredProducts, sortBy]);

  useEffect(() => {
    setVendorListPage(1);
  }, [searchQuery, statusFilter, sortBy]);

  useEffect(() => {
    const tp = Math.max(1, Math.ceil(sortedProducts.length / vendorListPageSize) || 1);
    setVendorListPage((p) => Math.min(p, tp));
  }, [sortedProducts.length, vendorListPageSize]);

  const pagedSortedProducts = useMemo(() => {
    const start = (vendorListPage - 1) * vendorListPageSize;
    return sortedProducts.slice(start, start + vendorListPageSize);
  }, [sortedProducts, vendorListPage, vendorListPageSize]);

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

  const pageProductIds = pagedSortedProducts.map((p) => p.id);

  const toggleSelectAll = () => {
    if (pageProductIds.length > 0 && pageProductIds.every((id) => selectedProducts.includes(id))) {
      setSelectedProducts((prev) => prev.filter((id) => !pageProductIds.includes(id)));
    } else {
      setSelectedProducts((prev) => Array.from(new Set([...prev, ...pageProductIds])));
    }
  };

  const handleBulkRemoveFromStore = async () => {
    const toRemove = [...new Set(selectedProducts)];
    if (toRemove.length === 0) return;

    setRemovingFromStore(true);
    try {
      const res = await fetch(
        `https://${projectId}.supabase.co/functions/v1/make-server-16010b6f/products/bulk-assign-vendor`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${publicAnonKey}`,
          },
          body: JSON.stringify({
            vendorId,
            productIds: [],
            removeProductIds: toRemove,
          }),
        }
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(
          typeof data?.error === "string" ? data.error : `Update failed (${res.status})`
        );
      }
      const removed = typeof data.removed === "number" ? data.removed : toRemove.length;
      const removeFailed = typeof data.removeFailed === "number" ? data.removeFailed : 0;

      if (removeFailed > 0) {
        toast.warning(
          `Removed ${removed} product(s) from your store. ${removeFailed} could not be removed.`
        );
      } else {
        toast.success(`Removed ${removed} product(s) from your store`);
      }

      setShowRemoveConfirm(false);
      setSelectedProducts([]);
      invalidateAdminAllProductsCache();
      invalidateVendorProductsAdminCache(vendorId);
      invalidateVendorStorefrontCatalogCachesAfterProductLinkChange(vendorId, [
        vendorStoreSlug,
        routeStoreName,
      ]);
      await loadProducts(true);
    } catch (error) {
      console.error("Error removing products from store:", error);
      toast.error(error instanceof Error ? error.message : "Failed to remove products from store");
    } finally {
      setRemovingFromStore(false);
    }
  };

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
          <h1 className="text-3xl font-bold text-slate-900">{t("products.title")}</h1>
          <p className="text-slate-500 mt-1">{t("products.subtitle")}</p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleOpenSelectProduct}
            className="bg-slate-100 border-slate-300 text-slate-900 hover:bg-slate-200"
          >
          <Plus className="w-4 h-4 mr-2" />
            {t("products.selectProduct")}
        </Button>
          <Badge variant="secondary">{products.length} {t("products.total")}</Badge>
        </div>
      </div>

      {/* Search + Filters Bar */}
      <div className="flex flex-col lg:flex-row items-start lg:items-center gap-4">
        {/* Search */}
        <div className="flex-1 relative min-w-[280px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <Input
            placeholder={t("products.searchPlaceholder")}
            className="pl-10"
            value={searchQuery}
            onChange={(e) => handleSearchInputChange(e.target.value)}
          />
        </div>
        
        {/* Status Filter Tabs */}
        <Tabs value={statusFilter} onValueChange={(val) => setStatusFilter(val as any)}>
          <TabsList>
            <TabsTrigger value="all" className="gap-2">
              {t("products.allStatus")}
              <Badge variant="secondary" className="bg-slate-200 text-slate-700 text-xs">
                {getStatusCount("all")}
              </Badge>
            </TabsTrigger>
            <TabsTrigger value="active" className="gap-2">
              {t("products.active")}
              <Badge variant="secondary" className="bg-green-100 text-green-700 text-xs">
                {getStatusCount("active")}
              </Badge>
            </TabsTrigger>
            <TabsTrigger value="off-shelf" className="gap-2">
              {t("products.offShelf")}
              <Badge variant="secondary" className="bg-slate-200 text-slate-700 text-xs">
                {getStatusCount("off-shelf")}
              </Badge>
            </TabsTrigger>
          </TabsList>
        </Tabs>

        {/* Sort Dropdown */}
        <Select value={sortBy} onValueChange={setSortBy}>
          <SelectTrigger className="w-full lg:w-[180px]">
            <SelectValue placeholder={t("products.newestFirst")} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="newest">{t("products.newestFirst")}</SelectItem>
            <SelectItem value="oldest">{t("products.oldestFirst")}</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {selectedProducts.length > 0 && (
        <Card className="p-4 bg-amber-50 border-amber-200">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <span className="text-sm font-medium text-amber-900">
              {selectedProducts.length} {t("products.selectedCount")}
            </span>
            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setSelectedProducts([])}
                disabled={removingFromStore}
              >
                <X className="w-4 h-4 mr-1.5" />
                {t("products.clearSelection")}
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="text-amber-800 border-amber-300 hover:bg-amber-100 hover:text-amber-900"
                onClick={() => setShowRemoveConfirm(true)}
                disabled={removingFromStore}
              >
                <Store className="w-4 h-4 mr-1.5" />
                {t("products.removeFromStore")}
              </Button>
            </div>
          </div>
        </Card>
      )}

      {/* Products Table */}
      {sortedProducts.length === 0 ? (
        <Card className="p-12 text-center border-slate-200">
          <Package className="w-16 h-16 text-slate-400 mx-auto mb-4" />
          <h3 className="text-lg font-semibold text-slate-900 mb-2">
            {searchQuery ? t("products.noProductsFound") : t("products.noProductsYet")}
          </h3>
          <p className="text-slate-600 mb-6">
            {searchQuery 
              ? t("products.tryAdjustSearch") 
              : t("products.chooseCatalogProducts")}
          </p>
          {!searchQuery && (
            <Button
              type="button"
              onClick={handleOpenSelectProduct}
              className="bg-slate-900 hover:bg-black text-white"
            >
              <Plus className="w-4 h-4 mr-2" />
              {t("products.selectProduct")}
            </Button>
          )}
        </Card>
      ) : (
        <Card>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50">
                  <th className="text-left py-3 px-4 w-12">
                    <Checkbox
                      checked={
                        pageProductIds.length > 0 &&
                        pageProductIds.every((id) => selectedProducts.includes(id))
                      }
                      onCheckedChange={toggleSelectAll}
                    />
                  </th>
                  <th className="text-left py-3 px-4 font-medium text-slate-600 text-sm">{t("products.product")}</th>
                  <th className="text-left py-3 px-4 font-medium text-slate-600 text-sm">{t("products.status")}</th>
                  <th className="text-left py-3 px-4 font-medium text-slate-600 text-sm">{t("products.inventory")}</th>
                  <th className="text-left py-3 px-4 font-medium text-slate-600 text-sm">{t("products.category")}</th>
                  <th className="text-left py-3 px-4 font-medium text-slate-600 text-sm">{t("products.price")}</th>
                  <th className="text-left py-3 px-4 font-medium text-slate-600 text-sm">{t("products.actions")}</th>
                </tr>
              </thead>
              <tbody>
                {pagedSortedProducts.map((product) => (
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
                        {product.status === "off-shelf" ? t("products.offShelf") : product.status === "active" || product.status === "Active" ? t("products.active") : product.status}
                      </Badge>
                    </td>
                    <td className="py-3 px-4">
                      <span className="text-sm text-slate-700">{product.inventory}</span>
                    </td>
                    <td className="py-3 px-4 text-sm text-slate-700">{product.category || t("products.uncategorized")}</td>
                    <td className="py-3 px-4 text-sm font-semibold text-slate-900">
                      {Math.round(product.price).toLocaleString()} MMK
                    </td>
                    <td className="py-3 px-4">
                      <Button 
                        variant="ghost" 
                        size="sm" 
                        className="h-8 w-8 p-0 text-slate-600 hover:text-slate-900 hover:bg-slate-100"
                        onClick={() => {
                          if (onVendorHostCleanAdmin) {
                            navigate(`/admin/products/${product.id}/view`);
                          } else if (adminPrefix && routeStoreName) {
                          navigate(
                              `/${adminPrefix}/${routeStoreName}/admin/products/${product.id}/view`
                            );
                        }
                        }}
                        title={t("products.viewDetails")}
                      >
                        <Eye className="w-4 h-4" />
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {sortedProducts.length > 0 && (
            <VendorAdminListingPagination
              variant="cardFooter"
              page={vendorListPage}
              pageSize={vendorListPageSize}
              totalCount={sortedProducts.length}
              onPageChange={setVendorListPage}
              onPageSizeChange={setVendorListPageSize}
              itemLabel={t("products.title").toLowerCase()}
              loading={loading}
            />
          )}
        </Card>
      )}

      <Dialog open={showRemoveConfirm} onOpenChange={setShowRemoveConfirm}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t("products.removeFromStoreTitle")}</DialogTitle>
            <DialogDescription>
              {t("products.removeFromStoreConfirm").replace(
                "{count}",
                String(selectedProducts.length)
              )}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              type="button"
              variant="outline"
              onClick={() => setShowRemoveConfirm(false)}
              disabled={removingFromStore}
            >
              {t("common.cancel")}
            </Button>
            <Button
              type="button"
              variant="default"
              onClick={handleBulkRemoveFromStore}
              disabled={removingFromStore}
              className="bg-amber-700 hover:bg-amber-800 text-white"
            >
              {removingFromStore ? t("products.removingFromStore") : t("products.removeFromStore")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={showProductSelectModal}
        onOpenChange={(open) => {
          setShowProductSelectModal(open);
          if (!open) {
            pickerServerSessionRef.current = null;
            setPickerAssignedUncheckedIds([]);
          }
        }}
      >
        <DialogContent className="!w-[80vw] !max-w-[80vw] max-h-[90vh] flex flex-col">
          <DialogHeader>
            <DialogTitle>{t("products.selectProducts")}</DialogTitle>
            <DialogDescription>
              {t("products.addFromCatalog")} {vendorName || t("products.yourStore")}.
            </DialogDescription>
          </DialogHeader>

          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <Input
              type="text"
              placeholder={t("products.searchCatalogPlaceholder")}
              value={searchProductQuery}
              onChange={(e) => {
                const v = e.target.value;
                setSearchProductQuery(v);
                setAssignPickerPage(1);
                const cached = moduleCache.peek<unknown[]>(CACHE_KEYS.ADMIN_PRODUCTS);
                if (cached && Array.isArray(cached) && cached.length > 0) {
                  setPickerUiMode("cache");
                }
              }}
              onKeyDown={handlePickerSearchKeyDown}
              className="pl-10"
            />
            <p className="text-xs text-slate-500 mt-2 pl-1">
              {t("products.catalogSearchHint")}
            </p>
          </div>

          <div className="flex-1 overflow-y-auto min-h-0 scrollbar-dark">
            {loadingAllProducts ? (
              <div className="border border-slate-200 rounded-lg overflow-hidden">
                <table className="w-full">
                  <thead className="bg-slate-50">
                    <tr className="border-b border-slate-200">
                      <th className="text-left py-3 px-4 text-sm font-medium text-slate-600 w-10" />
                      <th className="text-left py-3 px-4 text-sm font-medium text-slate-600">{t("products.product")}</th>
                      <th className="text-left py-3 px-4 text-sm font-medium text-slate-600">SKU</th>
                      <th className="text-left py-3 px-4 text-sm font-medium text-slate-600">{t("products.category")}</th>
                      <th className="text-left py-3 px-4 text-sm font-medium text-slate-600">{t("products.price")}</th>
                      <th className="text-left py-3 px-4 text-sm font-medium text-slate-600">{t("products.stock")}</th>
                      <th className="text-left py-3 px-4 text-sm font-medium text-slate-600">{t("products.status")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {Array.from({ length: 8 }).map((_, index) => (
                      <tr key={`sk-${index}`} className="border-b border-slate-100 animate-pulse">
                        <td className="py-3 px-4">
                          <div className="w-4 h-4 bg-slate-200 rounded" />
                        </td>
                        <td className="py-3 px-4">
                          <div className="flex items-center gap-3">
                            <div className="w-10 h-10 bg-slate-200 rounded" />
                            <div className="h-4 bg-slate-200 rounded w-40" />
                          </div>
                        </td>
                        <td className="py-3 px-4">
                          <div className="h-4 bg-slate-200 rounded w-24" />
                        </td>
                        <td className="py-3 px-4">
                          <div className="h-4 bg-slate-200 rounded w-20" />
                        </td>
                        <td className="py-3 px-4">
                          <div className="h-4 bg-slate-200 rounded w-24" />
                        </td>
                        <td className="py-3 px-4">
                          <div className="h-4 bg-slate-200 rounded w-12" />
                        </td>
                        <td className="py-3 px-4">
                          <div className="h-6 bg-slate-200 rounded-full w-16" />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : pickerShowEmpty ? (
              <div className="text-center py-12">
                <Package className="w-12 h-12 text-slate-300 mx-auto mb-4" />
                <h3 className="text-lg font-medium text-slate-900 mb-1">{t("products.noProductsFound")}</h3>
                <p className="text-sm text-slate-500">
                  {searchProductQuery
                    ? t("products.noProductsMatch")
                    : t("products.allAssigned")}
                </p>
              </div>
            ) : (
              <div className="border border-slate-200 rounded-lg overflow-hidden">
                <table className="w-full">
                  <thead className="sticky top-0 bg-slate-50 z-10">
                    <tr className="border-b border-slate-200">
                      <th className="text-left py-3 px-4 text-sm font-medium text-slate-600">
                        <Checkbox
                          checked={pickerEveryRowChecked}
                          onCheckedChange={(checked) => {
                            const unassignedIds = displayPickerRows
                              .filter((p) => !isProductAssignedToThisVendor(p))
                              .map((p) => p.id);
                            const assignedOnPageIds = displayPickerRows
                              .filter((p) => isProductAssignedToThisVendor(p))
                              .map((p) => p.id);
                            const assignedSet = new Set(assignedOnPageIds);
                            const unassignedSet = new Set(unassignedIds);
                            if (checked) {
                              setPickerSelectedIds((prev) =>
                                Array.from(new Set([...prev, ...unassignedIds]))
                              );
                              setPickerAssignedUncheckedIds((prev) =>
                                prev.filter((id) => !assignedSet.has(id))
                              );
                            } else {
                              setPickerSelectedIds((prev) =>
                                prev.filter((id) => !unassignedSet.has(id))
                              );
                              setPickerAssignedUncheckedIds((prev) =>
                                Array.from(new Set([...prev, ...assignedOnPageIds]))
                              );
                            }
                          }}
                        />
                      </th>
                      <th className="text-left py-3 px-4 text-sm font-medium text-slate-600">{t("products.product")}</th>
                      <th className="text-left py-3 px-4 text-sm font-medium text-slate-600">SKU</th>
                      <th className="text-left py-3 px-4 text-sm font-medium text-slate-600">{t("products.category")}</th>
                      <th className="text-left py-3 px-4 text-sm font-medium text-slate-600">{t("products.price")}</th>
                      <th className="text-left py-3 px-4 text-sm font-medium text-slate-600">{t("products.stock")}</th>
                      <th className="text-left py-3 px-4 text-sm font-medium text-slate-600">{t("products.status")}</th>
                    </tr>
                  </thead>
                  <tbody className="bg-white">
                    {displayPickerRows.map((product) => {
                      const alreadyOnVendor = isProductAssignedToThisVendor(product);
                      const rowChecked = alreadyOnVendor
                        ? !pickerAssignedUncheckedIds.includes(product.id)
                        : pickerSelectedIds.includes(product.id);
                      const linkedRow =
                        alreadyOnVendor && !pickerAssignedUncheckedIds.includes(product.id);
                      return (
                      <tr
                        key={product.id}
                        className={`border-b border-slate-100 hover:bg-slate-50 cursor-pointer ${
                          linkedRow ? "bg-slate-50/70" : ""
                        }`}
                        onClick={() => togglePickerCatalogRow(product)}
                      >
                        <td className="py-3 px-4" onClick={(e) => e.stopPropagation()}>
                          <Checkbox
                            checked={rowChecked}
                            onCheckedChange={() => togglePickerCatalogRow(product)}
                          />
                        </td>
                        <td className="py-3 px-4">
                          <div className="flex items-center gap-3">
                            <img
                              src={
                                product.images?.[0] ||
                                product.image ||
                                "https://images.unsplash.com/photo-1505740420928-5e560c06d30e?w=100&h=100&fit=crop"
                              }
                              alt={product.name}
                              className="w-10 h-10 rounded-lg object-cover border border-slate-200"
                            />
                            <span className="text-sm font-medium text-slate-900">{product.name}</span>
                          </div>
                        </td>
                        <td className="py-3 px-4 text-sm text-slate-600">{product.sku}</td>
                        <td className="py-3 px-4 text-sm text-slate-600">{product.category}</td>
                        <td className="py-3 px-4 text-sm font-medium text-slate-900">
                          {formatPickerPrice(product)}
                        </td>
                        <td className="py-3 px-4 text-sm text-slate-600">{product.stock || 0}</td>
                        <td className="py-3 px-4">{getPickerProductStatusBadge(product.status)}</td>
                      </tr>
                    );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {!loadingAllProducts && !pickerShowEmpty && (
            <div className="flex flex-col sm:flex-row items-center justify-between gap-3 px-1 py-2 border border-slate-200 rounded-lg bg-slate-50/80">
              <div className="flex items-center gap-2 text-sm text-slate-600">
                <span>Rows per page</span>
                <Select
                  value={String(assignPickerPageSize)}
                  onValueChange={(v) => {
                    setAssignPickerPageSize(Number(v));
                    setAssignPickerPage(1);
                  }}
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
                  {pickerSearchDiverged ? (
                    <>Narrowing loaded rows — press Enter to search the full catalog</>
                  ) : (
                    <>
                      Page {assignPickerPage} of {assignPickerTotalPages} · {assignPickerFooterProductCount}{" "}
                      products
                    </>
                  )}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-8"
                  disabled={!assignPickerCanGoPrev || loadingAllProducts}
                  onClick={() => setAssignPickerPage((p) => Math.max(1, p - 1))}
                >
                  <ChevronLeft className="w-4 h-4" />
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-8"
                  disabled={!assignPickerCanGoNext || loadingAllProducts}
                  onClick={() => setAssignPickerPage((p) => p + 1)}
                >
                  <ChevronRight className="w-4 h-4" />
                </Button>
              </div>
        </div>
      )}

          <DialogFooter className="flex items-center justify-between border-t border-slate-200 pt-4">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-slate-600">
              <span>{pickerSelectedIds.length} to add</span>
              {pickerAssignedUncheckedIds.length > 0 ? (
                <>
                  <span className="text-slate-400">•</span>
                  <span className="text-amber-700">
                    {pickerAssignedUncheckedIds.length} to remove from store
                  </span>
                </>
              ) : null}
              {pickerAssignedCheckedOnPageCount > 0 ? (
                <>
                  <span className="text-slate-400">•</span>
                  <span className="text-slate-500">
                    {pickerAssignedCheckedOnPageCount} on this page linked to store
                  </span>
                </>
              ) : null}
              <span className="text-slate-400">•</span>
              <span>
                {assignPickerUseFullCache
                  ? `${pickerAssignableFromFullCache.length} matching catalog`
                  : `${assignPickerServerTotal} products in catalog`}
              </span>
            </div>
            <div className="flex gap-2">
              <Button type="button" variant="outline" onClick={() => setShowProductSelectModal(false)}>
                Cancel
              </Button>
              <Button
                type="button"
                variant="default"
                onClick={handleSavePickerProducts}
                disabled={
                  savingPicker ||
                  (pickerSelectedIds.length === 0 && pickerAssignedUncheckedIds.length === 0)
                }
                className="bg-slate-900 hover:bg-black text-white"
              >
                <Check className="w-4 h-4 mr-2" />
                {savingPicker ? "Applying..." : "Apply changes"}
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}