import React, { useState, useEffect, useCallback, useMemo, useRef } from "react";
import {
  Plus,
  Edit,
  Trash2,
  CalendarDays,
  MoreVertical,
  Eye,
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
import { Tooltip, TooltipContent, TooltipTrigger } from "./ui/tooltip";
import { AdminClearableSearchInput } from "./AdminClearableSearchInput";
import { ProductFormPage } from "./ProductFormPage";
import { StorefrontProductDetail } from "./StorefrontProductDetail";
import { useLanguage } from "../contexts/LanguageContext";
import { formatNumber, formatMMK } from "../../utils/formatNumber"; // 🔥 Import number formatting
import {
  getCachedProductById,
  invalidateProductByIdCache,
  getCachedAdminProductsPage,
  ADMIN_PRODUCTS_BROADCAST_CHANNEL,
  ADMIN_PRODUCTS_LIST_CHANGED_EVENT,
  getCachedAdminVendorsForProductList,
  invalidateVendorStorefrontCatalogCachesAfterProductLinkChange,
  insertAdminProductIntoCaches,
  removeAdminProductsFromCaches,
  removeProductsFromVendorAdminCaches,
  notifyVendorStorefrontProductsRemoved,
  broadcastPlatformProductsDeleted,
  ADMIN_PRODUCTS_INITIAL_PAGE_SIZE,
  moduleCache,
  CACHE_KEYS as MODULE_CACHE_KEYS,
  adminProductsPageCacheKey,
  primeAdminProductsPageFromFullCache,
  type AdminProductsPagePayload,
} from "../utils/module-cache";
import { productMatchesAdminLiveSearch } from "../utils/adminProductSearch";
import { normalizeProductForAdminDetailView } from "../utils/adminProductDetailNormalize";
import {
  buildVendorDisplayLookup,
  tryResolveVendorDisplayLabel,
  isVendorActiveForAssignmentDisplay,
  findVendorRowForProductSelectionEntry,
} from "../utils/vendorDisplay";
import { useAuth } from "../contexts/AuthContext";

interface ProductListProps {
  onProductsChanged?: () => void; // 🔥 NEW: Callback when products change
  /** Synced with super-admin TopNav search */
  headerSearchQuery?: string;
  onHeaderSearchQueryChange?: (q: string) => void;
  /** Persisted server search query (`q`) across ProductList remounts. */
  headerCommittedSearchQuery?: string;
  onHeaderCommittedSearchQueryChange?: (q: string) => void;
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

function normalizeAdminProductStatus(status: unknown): string {
  return String(status ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "-");
}

function productMatchesAdminStatusFilter(product: Product, filter: string): boolean {
  if (filter === "all") return true;
  const status = normalizeAdminProductStatus(product.status);
  if (filter === "active") {
    return status === "active" || status === "published";
  }
  if (filter === "off-shelf") {
    return status === "off-shelf" || status === "offshelf";
  }
  return true;
}

function countAdminProductsByStatus(rows: Product[]): { all: number; active: number; offShelf: number } {
  let active = 0;
  let offShelf = 0;
  for (const row of rows) {
    const status = normalizeAdminProductStatus(row.status);
    if (status === "active" || status === "published") active++;
    else if (status === "off-shelf" || status === "offshelf") offShelf++;
  }
  return { all: rows.length, active, offShelf };
}

/** Fix stale paginated cache totals (e.g. footer/breadcrumb «6» while only 2 rows remain). */
function reconcileAdminProductsPagePayload(
  payload: {
    products?: Product[];
    total?: number;
    hasMore?: boolean;
    counts?: { all: number; active: number; offShelf: number };
  },
  page: number
): { rows: Product[]; total: number; counts?: { all: number; active: number; offShelf: number } } {
  const rows = (payload.products || []) as Product[];
  let total = Math.max(0, Number(payload.total ?? rows.length));
  let counts = payload.counts ? { ...payload.counts } : undefined;
  const singlePage = page === 1 && !payload.hasMore;

  if (singlePage && rows.length < total) {
    total = rows.length;
    counts = countAdminProductsByStatus(rows);
  } else if (singlePage && counts && counts.all > rows.length) {
    total = rows.length;
    counts = countAdminProductsByStatus(rows);
  }

  return { rows, total, counts };
}

const LS_ADMIN_PRODUCTS_PAGE_SIZE = "migoo-admin-products-page-size-v1";

function readPersistedAdminProductsPageSize(): number {
  if (typeof sessionStorage === "undefined") return ADMIN_PRODUCTS_INITIAL_PAGE_SIZE;
  try {
    const n = Number(sessionStorage.getItem(LS_ADMIN_PRODUCTS_PAGE_SIZE));
    if ([10, 15, 20, 50].includes(n)) return n;
  } catch {
    /* ignore */
  }
  return ADMIN_PRODUCTS_INITIAL_PAGE_SIZE;
}

/** Resolve vendor catalog cache keys affected by deleting these products. */
function collectCatalogKeysForDeletedProducts(
  deletedProducts: Product[],
  vendorsList: unknown[]
): { catalogKeys: string[]; vendorIds: string[] } {
  const catalogKeys = new Set<string>();
  const vendorIds = new Set<string>();
  const list = Array.isArray(vendorsList) ? vendorsList : [];

  for (const product of deletedProducts) {
    const fromSelection = resolveVendorsFromSelectionEntries(product.selectedVendors, list);
    for (const [id, meta] of fromSelection) {
      vendorIds.add(id);
      catalogKeys.add(id);
      if (meta.storeSlug) catalogKeys.add(meta.storeSlug);
    }
    if (Array.isArray(product.selectedVendors)) {
      for (const entry of product.selectedVendors) {
        const raw = String(entry ?? "").trim();
        if (raw) {
          catalogKeys.add(raw);
          vendorIds.add(raw);
        }
      }
    }
    for (const rawVendor of [product.vendorId, product.vendor]) {
      const vid = String(rawVendor ?? "").trim();
      if (!vid) continue;
      vendorIds.add(vid);
      catalogKeys.add(vid);
      const row = findVendorRowForProductSelectionEntry(vid, list);
      const slug = String(row?.storeSlug || "").trim();
      if (slug) catalogKeys.add(slug);
    }
  }

  return {
    catalogKeys: [...catalogKeys],
    vendorIds: [...vendorIds],
  };
}

function statusCountDeltaForProduct(product: Product): { active: number; offShelf: number } {
  const status = normalizeAdminProductStatus(product.status);
  return {
    active: status === "active" || status === "published" ? 1 : 0,
    offShelf: status === "off-shelf" || status === "offshelf" ? 1 : 0,
  };
}

/** Map create API payload to a row shape the admin products table expects. */
function normalizeCreatedProductForAdminList(raw: Record<string, unknown>): Product {
  const id = String(raw.id ?? "");
  const status = normalizeAdminProductStatus(raw.status) || "active";
  return {
    ...(raw as Product),
    id,
    name: String(raw.name ?? raw.title ?? "Product"),
    sku: String(raw.sku ?? ""),
    description: String(raw.description ?? ""),
    price: raw.price != null ? String(raw.price) : "0",
    inventory: Number(raw.inventory ?? raw.stock ?? 0) || 0,
    category: String(raw.category ?? ""),
    status: status as Product["status"],
    vendor: String(raw.vendor ?? ""),
    collaborator: String(raw.collaborator ?? ""),
    image: String(
      raw.image ??
        (Array.isArray(raw.images) && raw.images[0]) ??
        "https://images.unsplash.com/photo-1505740420928-5e560c06d30e?w=100&h=100&fit=crop"
    ),
    commissionRate: Number(raw.commissionRate ?? 0) || 0,
    selectedVendors: Array.isArray(raw.selectedVendors) ? raw.selectedVendors : [],
    createdAt: String(raw.createdAt ?? new Date().toISOString()),
    updatedAt: String(raw.updatedAt ?? new Date().toISOString()),
  };
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
  headerCommittedSearchQuery,
  onHeaderCommittedSearchQueryChange,
  headerSearchCommitTick,
  onListingCountChange,
}: ProductListProps) {
  const { t } = useLanguage();
  const { user: sessionUser } = useAuth();
  const initialAdminPageSize = useMemo(readPersistedAdminProductsPageSize, []);
  const initialProductsPayload = useMemo(
    () =>
      moduleCache.peek<AdminProductsPagePayload>(
        adminProductsPageCacheKey({
          page: 1,
          pageSize: initialAdminPageSize,
          q: "",
          status: "all",
          tab: "all",
          vendor: "all",
          collaborator: "all",
          sort: "newest",
        })
      ) ??
      primeAdminProductsPageFromFullCache({
        page: 1,
        pageSize: initialAdminPageSize,
        q: "",
        status: "all",
        tab: "all",
        vendor: "all",
        collaborator: "all",
        sort: "newest",
      }),
    [initialAdminPageSize]
  );
  const initialProductsPage = useMemo(
    () => (initialProductsPayload ? reconcileAdminProductsPagePayload(initialProductsPayload as any, 1) : null),
    [initialProductsPayload]
  );
  const [products, setProducts] = useState<Product[]>(() => initialProductsPage?.rows ?? []);
  const [loading, setLoading] = useState(() => !initialProductsPage);
  const [listRefreshing, setListRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  /** Sent to `getCachedAdminProductsPage` as `q` — updated only on Enter/Search. */
  const [committedSearchQuery, setCommittedSearchQuery] = useState(
    () => headerCommittedSearchQuery ?? ""
  );
  const lastHeaderCommitTick = useRef(0);
  const skipCacheSoftReloadRef = useRef(false);
  const skipProductsRealtimeReloadRef = useRef(false);
  const initialLoadDoneRef = useRef(!!initialProductsPage);
  const [initialLoadDone, setInitialLoadDone] = useState(() => !!initialProductsPage);
  const prevAdminPageSizeRef = useRef<number | null>(null);
  const [adminPage, setAdminPage] = useState(1);
  const [adminPageSize, setAdminPageSize] = useState(initialAdminPageSize);
  const [adminTotal, setAdminTotal] = useState(() => initialProductsPage?.total ?? 0);
  const [adminHasMore, setAdminHasMore] = useState(() => !!initialProductsPayload?.hasMore);
  const [statusCounts, setStatusCounts] = useState(
    () => initialProductsPage?.counts ?? { all: 0, active: 0, offShelf: 0 }
  );
  const [selectedProducts, setSelectedProducts] = useState<string[]>([]);
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [sortBy, setSortBy] = useState<string>("newest");
  const [vendorsMap, setVendorsMap] = useState<Record<string, string>>({}); // 🔥 Map vendor ID to name
  /** Raw vendor rows from admin API — used to gate badges (active only) while labels use full `vendorsMap`. */
  const [adminVendorsRows, setAdminVendorsRows] = useState<unknown[]>([]);

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
    if (headerCommittedSearchQuery === undefined) return;
    setCommittedSearchQuery(headerCommittedSearchQuery);
  }, [headerCommittedSearchQuery]);

  useEffect(() => {
    if (headerSearchCommitTick === undefined) return;
    if (headerSearchCommitTick <= lastHeaderCommitTick.current) return;
    lastHeaderCommitTick.current = headerSearchCommitTick;
    const q =
      headerSearchQuery !== undefined
        ? String(headerSearchQuery).trim()
        : searchQuery.trim();
    setCommittedSearchQuery(q);
    onHeaderCommittedSearchQueryChange?.(q);
  }, [headerSearchCommitTick, headerSearchQuery, searchQuery, onHeaderCommittedSearchQueryChange]);

  useEffect(() => {
    setAdminPage(1);
  }, [committedSearchQuery, sortBy, adminPageSize]);

  const loadProductPage = useCallback(
    async (forceRefresh: boolean, opts?: { silent?: boolean }) => {
      const silent = opts?.silent === true;
      const pageParams = {
        page: adminPage,
        pageSize: adminPageSize,
        q: committedSearchQuery,
        status: "all",
        tab: "all",
        vendor: "all",
        collaborator: "all",
        sort: sortBy,
      };
      const hasCachedPage =
        !forceRefresh &&
        !!moduleCache.peek<AdminProductsPagePayload>(adminProductsPageCacheKey(pageParams));
      const tableOnlyRefresh = initialLoadDoneRef.current && !silent;
      if (!silent && !initialLoadDoneRef.current) {
        setLoading(true);
      }
      if (!silent) {
        setListRefreshing(forceRefresh || (tableOnlyRefresh && !hasCachedPage));
      }
      try {
        const payload = await getCachedAdminProductsPage(
          pageParams,
          forceRefresh
        );
        const reconciled = reconcileAdminProductsPagePayload(payload, adminPage);
        setProducts(reconciled.rows);
        setAdminTotal(reconciled.total);
        setAdminHasMore(!!payload.hasMore);
        if (reconciled.counts) {
          setStatusCounts({
            all: reconciled.counts.all,
            active: reconciled.counts.active,
            offShelf: reconciled.counts.offShelf,
          });
        }
        SmartCache.set(CACHE_KEYS.PRODUCTS, reconciled.rows);
      } catch (error: any) {
        console.error("❌ Failed to load products:", error);
        setProducts([]);
        toast.info("No products yet. Go to Dashboard to create sample products!", {
          duration: 5000,
        });
      } finally {
        setListRefreshing(false);
        if (!silent && !initialLoadDoneRef.current) {
          setLoading(false);
        }
        if (!initialLoadDoneRef.current) {
          initialLoadDoneRef.current = true;
          setInitialLoadDone(true);
        }
      }
    },
    [
      adminPage,
      adminPageSize,
      committedSearchQuery,
      sortBy,
    ]
  );

  const applyVendorsListToState = useCallback((vendorsList: unknown[]) => {
    if (!Array.isArray(vendorsList)) return;
    setAdminVendorsRows(vendorsList);
    setVendorsMap(buildVendorDisplayLookup(vendorsList));
  }, []);

  const loadVendors = useCallback(async (forceRefresh = false) => {
    if (!forceRefresh) {
      const peeked = moduleCache.peek<unknown[]>(MODULE_CACHE_KEYS.ADMIN_VENDORS);
      // Empty array is not a usable cache hit — otherwise we never fetch and every label falls back to "Vendor store".
      if (peeked != null && Array.isArray(peeked) && peeked.length > 0) {
        applyVendorsListToState(peeked);
        return;
      }
    }
    try {
      const vendorsList = await getCachedAdminVendorsForProductList(forceRefresh);
      if (Array.isArray(vendorsList)) {
        applyVendorsListToState(vendorsList);
        console.log(`✅ Loaded ${vendorsList.length} vendors for name mapping`);
      }
    } catch (error) {
      console.error("❌ Failed to load vendors:", error);
    }
  }, [applyVendorsListToState]);

  const applyCachedProductPage = useCallback(() => {
    let payload = moduleCache.peek<AdminProductsPagePayload>(
      adminProductsPageCacheKey({
        page: adminPage,
        pageSize: adminPageSize,
        q: committedSearchQuery,
        status: "all",
        tab: "all",
        vendor: "all",
        collaborator: "all",
        sort: sortBy,
      })
    );
    if (!payload) {
      payload = primeAdminProductsPageFromFullCache({
        page: adminPage,
        pageSize: adminPageSize,
        q: committedSearchQuery,
        status: "all",
        tab: "all",
        vendor: "all",
        collaborator: "all",
        sort: sortBy,
      });
    }
    if (!payload) return false;
    const reconciled = reconcileAdminProductsPagePayload(payload, adminPage);
    setProducts(reconciled.rows);
    setAdminTotal(reconciled.total);
    setAdminHasMore(!!payload.hasMore);
    if (reconciled.counts) {
      setStatusCounts({
        all: reconciled.counts.all,
        active: reconciled.counts.active,
        offShelf: reconciled.counts.offShelf,
      });
    }
    SmartCache.set(CACHE_KEYS.PRODUCTS, reconciled.rows);
    return true;
  }, [adminPage, adminPageSize, committedSearchQuery, sortBy]);

  const applyVisibleStockPatchFromFullCache = useCallback(() => {
    const full = moduleCache.peek<any[]>(MODULE_CACHE_KEYS.ADMIN_PRODUCTS);
    if (!Array.isArray(full) || full.length === 0 || products.length === 0) return false;
    const byId = new Map<string, any>();
    for (const row of full) {
      if (row?.id != null) byId.set(String(row.id), row);
    }

    let changed = false;
    const nextProducts = products.map((row: any) => {
      const fullRow = byId.get(String(row?.id ?? ""));
      if (!fullRow) return row;
      let nextRow = row;

      const rowInventory = Number(row?.inventory ?? 0);
      const fullInventory = Number(fullRow?.inventory ?? 0);
      if (rowInventory !== fullInventory) {
        nextRow = { ...nextRow, inventory: fullInventory };
        changed = true;
      }

      if (Array.isArray(row?.variants) && Array.isArray(fullRow?.variants)) {
        const variantsById = new Map<string, any>();
        for (const v of fullRow.variants) {
          if (v?.id != null) variantsById.set(String(v.id), v);
        }
        let variantsChanged = false;
        const nextVariants = row.variants.map((variant: any) => {
          const fullVariant = variantsById.get(String(variant?.id ?? ""));
          if (!fullVariant) return variant;
          const currentQty = Number(variant?.inventory ?? 0);
          const nextQty = Number(fullVariant?.inventory ?? 0);
          if (currentQty === nextQty) return variant;
          variantsChanged = true;
          return { ...variant, inventory: nextQty };
        });
        if (variantsChanged) {
          nextRow = { ...nextRow, variants: nextVariants };
          changed = true;
        }
      }

      return nextRow;
    });

    if (!changed) return false;
    setProducts(nextProducts);
    SmartCache.set(CACHE_KEYS.PRODUCTS, nextProducts);
    return true;
  }, [products]);

  useEffect(() => {
    const pageSizeChanged =
      prevAdminPageSizeRef.current != null && prevAdminPageSizeRef.current !== adminPageSize;
    prevAdminPageSizeRef.current = adminPageSize;
    void loadProductPage(pageSizeChanged, { silent: pageSizeChanged });
  }, [loadProductPage, adminPageSize]);

  useEffect(() => {
    if (!onListingCountChange) return;
    if (currentView !== "list") {
      onListingCountChange(null);
      return;
    }
    const hideUntilKnown = !initialLoadDone && loading && products.length === 0;
    onListingCountChange(hideUntilKnown ? null : adminTotal);
  }, [currentView, adminTotal, loading, initialLoadDone, products.length, onListingCountChange]);

  useEffect(() => {
    loadVendors();
    const handleVendorUpdate = () => {
      void loadVendors(true);
    };
    window.addEventListener("vendorDataUpdated", handleVendorUpdate as EventListener);
    return () => {
      window.removeEventListener("vendorDataUpdated", handleVendorUpdate as EventListener);
    };
  }, [loadVendors]);

  useEffect(() => {
    const applyCachePatch = () => {
      if (skipCacheSoftReloadRef.current) {
        skipCacheSoftReloadRef.current = false;
        return;
      }
      if (!applyCachedProductPage()) {
        if (!applyVisibleStockPatchFromFullCache()) {
          void loadProductPage(false, { silent: true });
        }
      }
    };
    const onListChanged = () => {
      if (skipCacheSoftReloadRef.current) {
        skipCacheSoftReloadRef.current = false;
        return;
      }
      if (applyCachedProductPage()) return;
      if (applyVisibleStockPatchFromFullCache()) return;
      void loadProductPage(true, { silent: true });
    };
    window.addEventListener("migoo-admin-products-cache-patched", applyCachePatch);
    window.addEventListener(ADMIN_PRODUCTS_LIST_CHANGED_EVENT, onListChanged);
    let bc: BroadcastChannel | null = null;
    try {
      bc = new BroadcastChannel(ADMIN_PRODUCTS_BROADCAST_CHANNEL);
      bc.onmessage = (ev: MessageEvent) => {
        if (ev.data?.type === "list-changed") {
          onListChanged();
          return;
        }
        applyCachePatch();
      };
    } catch {
      /* BroadcastChannel unsupported */
    }
    return () => {
      window.removeEventListener("migoo-admin-products-cache-patched", applyCachePatch);
      window.removeEventListener(ADMIN_PRODUCTS_LIST_CHANGED_EVENT, onListChanged);
      bc?.close();
    };
  }, [loadProductPage, applyCachedProductPage, applyVisibleStockPatchFromFullCache]);

  const applyOptimisticProductRemoval = useCallback(
    (removedIds: Set<string>, sourceProducts: Product[]) => {
      if (removedIds.size === 0) return;
      const deletedRows = sourceProducts.filter((p) => removedIds.has(p.id));

      setProducts((prev) => prev.filter((p) => !removedIds.has(p.id)));
      setAdminTotal((prev) => Math.max(0, prev - deletedRows.length));
      setSelectedProducts((prev) => prev.filter((id) => !removedIds.has(id)));

      if (deletedRows.length > 0) {
        setStatusCounts((prev) => {
          let active = prev.active;
          let offShelf = prev.offShelf;
          for (const row of deletedRows) {
            const delta = statusCountDeltaForProduct(row);
            active = Math.max(0, active - delta.active);
            offShelf = Math.max(0, offShelf - delta.offShelf);
          }
          return {
            all: Math.max(0, prev.all - deletedRows.length),
            active,
            offShelf,
          };
        });
      }

      const remaining = sourceProducts.filter((p) => !removedIds.has(p.id));
      SmartCache.set(CACHE_KEYS.PRODUCTS, remaining);
      SmartCache.delete(CACHE_KEYS.STOREFRONT_PRODUCTS);
      skipCacheSoftReloadRef.current = true;
      removeAdminProductsFromCaches([...removedIds]);
      broadcastPlatformProductsDeleted([...removedIds]);

      const { catalogKeys, vendorIds } = collectCatalogKeysForDeletedProducts(
        deletedRows,
        adminVendorsRows
      );
      if (vendorIds.length > 0) {
        removeProductsFromVendorAdminCaches(vendorIds, [...removedIds]);
      }
      if (catalogKeys.length > 0) {
        notifyVendorStorefrontProductsRemoved(catalogKeys, [...removedIds]);
      }
    },
    [adminVendorsRows]
  );

  const handleSearchInputChange = useCallback(
    (value: string) => {
      setSearchQuery(value);
      onHeaderSearchQueryChange?.(value);
    },
    [onHeaderSearchQueryChange]
  );

  const commitSearchFromInput = useCallback(() => {
    const q = searchQuery.trim();
    if (q === committedSearchQuery.trim()) {
      void loadProductPage(true);
      return;
    }
    setCommittedSearchQuery(q);
    onHeaderCommittedSearchQueryChange?.(q);
  }, [searchQuery, committedSearchQuery, loadProductPage, onHeaderCommittedSearchQueryChange]);

  const onSearchKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === "Enter") {
        e.preventDefault();
        commitSearchFromInput();
      }
    },
    [commitSearchFromInput]
  );

  const applyOptimisticProductAdd = useCallback(
    (created: Product) => {
      const delta = statusCountDeltaForProduct(created);
      const matchesServerSearch =
        !committedSearchQuery.trim() ||
        productMatchesAdminLiveSearch(created, committedSearchQuery);

      setAdminPage(1);
      setAdminTotal((prev) => {
        const nextTotal = prev + 1;
        setAdminHasMore(adminPage * adminPageSize < nextTotal);
        return nextTotal;
      });
      setStatusCounts((prev) => ({
        all: prev.all + 1,
        active: prev.active + delta.active,
        offShelf: prev.offShelf + delta.offShelf,
      }));

      if (adminPage === 1 && matchesServerSearch) {
        setProducts((prev) => {
          if (prev.some((p) => p.id === created.id)) return prev;
          const next = [created, ...prev];
          const trimmed =
            next.length > adminPageSize ? next.slice(0, adminPageSize) : next;
          SmartCache.set(CACHE_KEYS.PRODUCTS, trimmed);
          return trimmed;
        });
      }

      skipCacheSoftReloadRef.current = true;
      skipProductsRealtimeReloadRef.current = true;
      window.setTimeout(() => {
        skipProductsRealtimeReloadRef.current = false;
      }, 2500);
      insertAdminProductIntoCaches(created);
    },
    [adminPage, adminPageSize, committedSearchQuery]
  );

  const handleSaveProduct = async (data: any) => {
    setCurrentView("list");
    try {
      const response = await productsApi.create({
        ...data,
        performedByUserId: sessionUser?.id,
      });
      if (!response.success && !response.product) {
        throw new Error(response.error || "Failed to create product - no product returned");
      }
      const created = normalizeCreatedProductForAdminList(
        response.product as Record<string, unknown>
      );
      let vendorsList =
        (moduleCache.peek<unknown[]>(MODULE_CACHE_KEYS.ADMIN_VENDORS) as any[]) || [];
      if (!Array.isArray(vendorsList) || vendorsList.length === 0) {
        vendorsList = (await getCachedAdminVendorsForProductList(false)) as any[];
      }
      invalidateVendorStorefrontsForProductVendorSelectionChange([], data?.selectedVendors, vendorsList);
      invalidateProductByIdCache(created.id);
      SmartCache.delete(CACHE_KEYS.STOREFRONT_PRODUCTS);
      applyOptimisticProductAdd(created);
      toast.success("✅ Product added!", { duration: 2000 });
      onProductsChanged?.();
    } catch (error) {
      console.error("❌ Failed to create product:", error);
      if (error instanceof Error && error.message.includes("SKU already exists")) {
        toast.error(`❌ SKU Validation Error: ${error.message}`, { duration: 5000 });
      } else {
        const errorMsg = error instanceof Error ? error.message : "Failed to save product to server";
        toast.error(`❌ Error: ${errorMsg}. Check console for details.`, { duration: 5000 });
      }
    }
  };

  const handleUpdateProduct = async (id: string, data: any) => {
    const prevVendors = selectedProduct?.selectedVendors;
    try {
      await productsApi.update(id, { ...data, performedByUserId: sessionUser?.id });
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
      skipCacheSoftReloadRef.current = true;
      setProducts((prev) =>
        prev.map((p) =>
          p.id === id
            ? {
                ...p,
                ...data,
                name: data.name ?? data.title ?? p.name,
                status: (data.status ?? p.status) as Product["status"],
              }
            : p
        )
      );
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
    const removedIds = new Set([id]);
    applyOptimisticProductRemoval(removedIds, previous);
    toast.success("Product deleted!", { duration: 2000 });
    try {
      await productsApi.delete(id, sessionUser?.id);
      invalidateProductByIdCache(id);
      onProductsChanged?.();
    } catch (error) {
      console.error("Failed to delete product:", error);
      const errorMessage = error instanceof Error ? error.message : "Failed to delete product";
      if (errorMessage.includes("Product not found") || errorMessage.includes("404")) {
        onProductsChanged?.();
      } else {
        toast.error(`Failed to delete: ${errorMessage}`);
        setProducts(previous);
        SmartCache.set(CACHE_KEYS.PRODUCTS, previous);
        void loadProductPage(true, { silent: true });
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
        const idsToDelete = [...selectedProducts];
        const previous = products;
        applyOptimisticProductRemoval(new Set(idsToDelete), previous);

        let successCount = 0;
        let errorCount = 0;
        let alreadyDeletedCount = 0;
        const failedIds = new Set<string>();

        for (const productId of idsToDelete) {
          try {
            await productsApi.delete(productId, sessionUser?.id);
            invalidateProductByIdCache(productId);
            successCount++;
          } catch (error) {
            const errorMessage = error instanceof Error ? error.message : "";
            if (errorMessage.includes("Product not found") || errorMessage.includes("404")) {
              alreadyDeletedCount++;
            } else {
              console.error(`Failed to delete product ${productId}:`, error);
              errorCount++;
              failedIds.add(productId);
            }
          }
        }

        if (failedIds.size > 0) {
          const restore = previous.filter((p) => failedIds.has(p.id));
          setProducts((prev) => {
            const merged = [...prev];
            for (const row of restore) {
              if (!merged.some((p) => p.id === row.id)) merged.unshift(row);
            }
            return merged;
          });
          setAdminTotal((prev) => prev + restore.length);
          setStatusCounts((prev) => {
            let active = prev.active;
            let offShelf = prev.offShelf;
            for (const row of restore) {
              const delta = statusCountDeltaForProduct(row);
              active += delta.active;
              offShelf += delta.offShelf;
            }
            return {
              all: prev.all + restore.length,
              active,
              offShelf,
            };
          });
          SmartCache.set(CACHE_KEYS.PRODUCTS, previous.filter((p) => !failedIds.has(p.id)));
          void loadProductPage(true, { silent: true });
        }

        if (successCount > 0) {
          toast.success(`${successCount} product(s) deleted successfully!`);
        }
        if (alreadyDeletedCount > 0) {
          toast.info(`${alreadyDeletedCount} product(s) were already deleted`);
        }
        if (errorCount > 0) {
          toast.error(`${errorCount} product(s) could not be deleted`);
        }
        setSelectedProducts([]);
      } else if (productToDelete) {
        const previous = products;
        applyOptimisticProductRemoval(new Set([productToDelete]), previous);
        try {
          await productsApi.delete(productToDelete, sessionUser?.id);
          invalidateProductByIdCache(productToDelete);
          toast.success("Product deleted successfully!");
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : "";
          if (errorMessage.includes("Product not found") || errorMessage.includes("404")) {
            toast.info("Product already deleted");
          } else {
            setProducts(previous);
            SmartCache.set(CACHE_KEYS.PRODUCTS, previous);
            void loadProductPage(true, { silent: true });
            throw error;
          }
        }
      }
      if (onProductsChanged) onProductsChanged();
      setDeleteDialogOpen(false);
      setProductToDelete(null);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Failed to delete product(s)";

      if (errorMessage.includes("Product not found") || errorMessage.includes("404")) {
        toast.info("Product already deleted");
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
      const raw = (response as { product?: Record<string, unknown> })?.product ?? (response as Record<string, unknown>);
      if (raw && typeof raw === "object" && raw.id) {
        setSelectedProduct(
          normalizeProductForAdminDetailView(raw as Record<string, unknown>, vendorsMap) as Product
        );
        setCurrentView("edit");
      } else {
        toast.error("Failed to load product details");
      }
    } catch (error) {
      console.error("Failed to load product details:", error);
      toast.error("Failed to load product details");
    }
  };

  // Load full product details when viewing (GET /products/:id — same source as storefront cache)
  const handleViewProduct = async (productId: string) => {
    try {
      const response = await getCachedProductById(productId);
      const raw = (response as { product?: Record<string, unknown> })?.product ?? (response as Record<string, unknown>);
      if (raw && typeof raw === "object" && raw.id) {
        setSelectedProduct(
          normalizeProductForAdminDetailView(raw as Record<string, unknown>, vendorsMap) as Product
        );
        setCurrentView("storefront");
      } else {
        toast.error("Failed to load product details");
      }
    } catch (error) {
      console.error("Failed to load product details:", error);
      toast.error("Failed to load product details");
    }
  };

  /** Search narrows the loaded page; status tabs filter client-side only (no refetch). */
  const productsMatchingSearch = useMemo(
    () => products.filter((product) => productMatchesAdminLiveSearch(product, searchQuery)),
    [products, searchQuery]
  );

  const displayProducts = useMemo(
    () =>
      productsMatchingSearch.filter((product) =>
        productMatchesAdminStatusFilter(product, statusFilter)
      ),
    [productsMatchingSearch, statusFilter]
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
    if (!committedSearchQuery.trim()) {
      if (status === "all") return statusCounts.all;
      if (status === "active") return statusCounts.active;
      if (status === "off-shelf") return statusCounts.offShelf;
    }
    if (status === "all") return productsMatchingSearch.length;
    return productsMatchingSearch.filter((product) =>
      productMatchesAdminStatusFilter(product, status)
    ).length;
  };

  const handleAdminPageSizeChange = useCallback((value: string) => {
    const next = Number(value);
    setAdminPageSize(next);
    try {
      sessionStorage.setItem(LS_ADMIN_PRODUCTS_PAGE_SIZE, String(next));
    } catch {
      /* ignore quota/private mode */
    }
  }, []);

  const adminTotalPages = Math.max(1, Math.ceil(adminTotal / adminPageSize) || 1);
  const hasPendingServerSearch =
    searchQuery.trim() !== committedSearchQuery.trim();
  const showTableSkeleton = (!initialLoadDone && loading) || listRefreshing;

  const productTableSkeletonRows = Array.from({ length: 8 }).map((_, index) => (
    <tr key={`skeleton-row-${index}`} className="border-b border-slate-100 animate-pulse">
      <td className="py-3 px-4">
        <div className="w-4 h-4 bg-slate-200 rounded" />
      </td>
      <td className="py-3 px-4">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 bg-slate-200 rounded-lg" />
          <div className="space-y-2">
            <div className="h-4 bg-slate-200 rounded w-32" />
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
          <div className="h-8 w-8 bg-slate-200 rounded" />
          <div className="h-8 w-8 bg-slate-200 rounded" />
        </div>
      </td>
    </tr>
  ));

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
              <Button className="bg-slate-900 hover:bg-slate-800" onClick={() => setCurrentView("add")}>
                {t('products.addProduct')}
              </Button>
            </div>
          </div>

          {!initialLoadDone && loading && (
            <Card>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-slate-200 bg-slate-50">
                      <th className="text-left py-3 px-4 w-12 align-middle">
                        <div className="w-4 h-4 bg-slate-200 rounded"></div>
                      </th>
                      <th className="text-left py-3 px-4 font-medium text-slate-600 text-sm align-middle">{t("products.product")}</th>
                      <th className="text-left py-3 px-4 font-medium text-slate-600 text-sm align-middle">{t("products.status")}</th>
                      <th className="text-left py-3 px-4 font-medium text-slate-600 text-sm align-middle">{t("products.inventory")}</th>
                      <th className="text-left py-3 px-4 font-medium text-slate-600 text-sm align-middle">{t("products.category")}</th>
                      <th className="text-left py-3 px-4 font-medium text-slate-600 text-sm align-middle">{t("products.vendor")}</th>
                      <th className="text-left py-3 px-4 font-medium text-slate-600 text-sm align-middle">{t("products.price")}</th>
                      <th className="text-left py-3 px-4 font-medium text-slate-600 text-sm align-middle">{t("products.commission")}</th>
                      <th className="text-left py-3 px-4 font-medium text-slate-600 text-sm align-middle">{t("products.actions")}</th>
                    </tr>
                  </thead>
                  <tbody>{productTableSkeletonRows}</tbody>
                </table>
              </div>
            </Card>
          )}

          {initialLoadDone && (
            <>
              <Card className="p-4">
                    <div className="flex flex-col lg:flex-row items-start lg:items-center gap-4">
                      {/* Search */}
                      <div className="flex-1 min-w-[280px]">
                        <AdminClearableSearchInput
                          placeholder={t("products.searchFullCatalogPlaceholder")}
                          value={searchQuery}
                          onValueChange={handleSearchInputChange}
                          onKeyDown={onSearchKeyDown}
                          onClear={() => {
                            handleSearchInputChange("");
                            setCommittedSearchQuery("");
                            onHeaderCommittedSearchQueryChange?.("");
                          }}
                          onSubmit={commitSearchFromInput}
                          submitDisabled={listRefreshing || !searchQuery.trim()}
                          submitPending={hasPendingServerSearch}
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
                        <th className="text-left py-3 px-4 font-medium text-slate-600 text-sm align-middle">{t("products.product")}</th>
                        <th className="text-left py-3 px-4 font-medium text-slate-600 text-sm align-middle">{t("products.status")}</th>
                        <th className="text-left py-3 px-4 font-medium text-slate-600 text-sm align-middle">{t("products.inventory")}</th>
                        <th className="text-left py-3 px-4 font-medium text-slate-600 text-sm align-middle">{t("products.category")}</th>
                        <th className="text-left py-3 px-4 font-medium text-slate-600 text-sm align-middle">{t("products.vendor")}</th>
                        <th className="text-left py-3 px-4 font-medium text-slate-600 text-sm align-middle">{t("products.price")}</th>
                        <th className="text-left py-3 px-4 font-medium text-slate-600 text-sm align-middle">{t("products.commission")}</th>
                        <th className="text-left py-3 px-4 font-medium text-slate-600 text-sm align-middle">{t("products.actions")}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {showTableSkeleton ? (
                        productTableSkeletonRows
                      ) : displayProducts.length === 0 ? (
                        <tr>
                          <td colSpan={9} className="py-10 px-4 text-center text-sm text-slate-500">
                            {searchQuery.trim() ? (
                              hasPendingServerSearch ? (
                                "Hit Enter or click Search to search."
                              ) : (
                                <>No products found for &ldquo;{searchQuery.trim()}&rdquo;.</>
                              )
                            ) : (
                              "No products found."
                            )}
                          </td>
                        </tr>
                      ) : (
                      displayProducts.map((product) => (
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
                            {Array.isArray(product.selectedVendors) && product.selectedVendors.length > 0 ? (() => {
                              const activePairs: { label: string; raw: string }[] = [];
                              for (const entry of product.selectedVendors) {
                                const raw = String(entry ?? "").trim();
                                if (!raw) continue;
                                const row = findVendorRowForProductSelectionEntry(raw, adminVendorsRows);
                                if (!row || !isVendorActiveForAssignmentDisplay(row)) continue;
                                const label = tryResolveVendorDisplayLabel(raw, vendorsMap);
                                if (label != null) activePairs.push({ label, raw });
                              }
                              if (activePairs.length === 0) {
                                return <span className="text-slate-400">-</span>;
                              }
                              return (
                                <div className="flex flex-wrap gap-1">
                                  {activePairs.slice(0, 2).map((p, index) => (
                                    <Badge
                                      key={`${p.raw}-${index}`}
                                      variant="secondary"
                                      className="bg-blue-50 text-blue-700 border-blue-200 text-xs"
                                    >
                                      {p.label}
                                    </Badge>
                                  ))}
                                  {activePairs.length > 2 && (
                                    <Tooltip>
                                      <TooltipTrigger asChild>
                                        <Badge
                                          variant="secondary"
                                          className="bg-slate-100 text-slate-600 border-slate-200 text-xs cursor-default"
                                        >
                                          +{activePairs.length - 2}
                                        </Badge>
                                      </TooltipTrigger>
                                      <TooltipContent side="top" className="max-w-xs text-left font-normal">
                                        {activePairs
                                          .slice(2)
                                          .map((p) => p.label)
                                          .join(", ")}
                                      </TooltipContent>
                                    </Tooltip>
                                  )}
                                </div>
                              );
                            })() : product.vendor ? (
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
                      ))
                      )}
                    </tbody>
                  </table>
                </div>
                <div className="flex flex-col sm:flex-row items-center justify-between gap-3 px-4 py-3 border-t border-slate-200 bg-slate-50/80">
                  <div className="flex items-center gap-2 text-sm text-slate-600">
                    <span>{t("pagination.rowsPerPage")}</span>
                    <Select
                      value={String(adminPageSize)}
                      onValueChange={handleAdminPageSizeChange}
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
                      {t("pagination.page")} {adminPage} {t("pagination.of")} {adminTotalPages} · {adminTotal} {t("products.title").toLowerCase()}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-8"
                      disabled={adminPage <= 1 || listRefreshing}
                      onClick={() => setAdminPage((p) => Math.max(1, p - 1))}
                    >
                      <ChevronLeft className="w-4 h-4" />
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-8"
                      disabled={!adminHasMore || listRefreshing}
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