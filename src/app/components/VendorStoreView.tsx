// Minimalist Vendor Storefront - MVP Design
import {
  moduleCache,
  CACHE_KEYS,
  fetchVendorProducts,
  fetchVendorCategories,
  filterVendorCreatedCategories,
  fetchVendorWishlistVendorPage,
  wishlistSigFromProductIds,
  invalidateVendorSavedWishlistCaches,
  invalidateCustomerOrdersCache,
  invalidateAdminCustomersCache,
  fetchCustomerOrdersList,
  VENDOR_CATALOG_MUTATION_EVENT,
  PLATFORM_PRODUCTS_DELETED_EVENT,
  ADMIN_PRODUCTS_LIST_CHANGED_EVENT,
  type VendorWishlistVendorPageResult,
} from "../utils/module-cache";
import {
  readPersistedJson,
  writePersistedJson,
  PERSISTED_CATALOG_TTL_MS,
  lsVendorCatalogPage1Key,
  lsVendorCategoriesKey,
  lsVendorSavedWishlistPageKey,
  lsWishlistProductIdsKey,
} from "../utils/persistedLocalCache";
import {
  readCachedVendorBrandingBySlug,
  readCachedVendorProductName,
  resolveVendorStoreDisplayName,
} from "../utils/vendorStorefrontBrandingCache";
import {
  readSessionCatalogList,
  removeSessionCatalogList,
  ssVendorCatalogListKey,
  writeSessionCatalogList,
} from "../utils/persistedSessionCache";
import { normalizeVendorStorefrontProducts } from "../utils/vendorStorefrontProductStats";
import {
  getCustomerOrderStatusColor,
  getCustomerOrderStatusLabel,
} from "../utils/normalizeOrderBadgeStatus";
import {
  canPurchase,
  getEffectiveInventory,
  isOutOfStockDisplay,
  showLowStockBadge,
} from "../utils/productInventory";
import { notifyStorefrontCustomerRegistered, subscribeCustomerRealtime } from "../utils/customersRealtime";
import {
  applyCustomerProfileMerge,
  buildCustomerSessionFromAuthResponse,
  formatUserPhoneDisplay,
  getCustomerDisplayEmail,
  getCustomerProfileSubtitle,
  normalizeCustomerSessionUser,
  persistMigooUserSession,
  resolveCustomerAuthEmail,
  resolveCustomerPhone,
} from "../utils/customerAuthIdentity";
import {
  applyMetaPixelIdFromPayload,
  initMetaPixel,
  trackMetaAddToCart,
  trackMetaPageView,
  trackMetaViewContent,
} from "../utils/metaPixel";
import { ProductCard, type ProductCardProduct } from "./ProductCard";
import { BackToTop } from "./BackToTop";
import { CacheFriendlyImg } from "./CacheFriendlyImg";
import { VendorStorefrontSubnav, type VendorSubnavTab } from "./VendorStorefrontSubnav";
import {
  useState,
  useEffect,
  useLayoutEffect,
  useRef,
  useCallback,
  useMemo,
  startTransition,
  type ChangeEvent,
  type KeyboardEvent,
} from "react";
import { useNavigate, useLocation, matchPath } from "react-router";
import { 
  ShoppingCart, 
  Heart, 
  Search,
  Star,
  Settings,
  Pencil,
  Eye,
  Menu,
  X,
  ChevronLeft,
  Plus,
  Minus,
  Store,
  Package,
  RefreshCw,
  User,
  UserCircle,
  ChevronRight,
  MapPin,
  LogOut,
  Truck,
  Shield,
  TrendingUp,
  Clock,
  ShoppingBag,
  Check,
  Trash2,
  Upload,
  Phone,
  EyeOff,
} from "lucide-react";
import { Button } from "./ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "./ui/dropdown-menu";
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card";
import { Label } from "./ui/label";
import { Separator } from "./ui/separator";
import { Badge } from "./ui/badge";
import { Input } from "./ui/input";
import { Checkbox } from "./ui/checkbox";
import { Popover, PopoverContent, PopoverTrigger } from "./ui/popover";
import { projectId, publicAnonKey } from "../../../utils/supabase/info";
import { useCart } from "./CartContext";
import { CartDrawer } from "./CartDrawer";
import { Checkout } from "./Checkout";
import { OrderDetailView } from "./OrderDetailView";
import { ServerStatusBanner } from "./ServerStatusBanner";
import {
  ProductCardSkeleton,
  VendorStorefrontFullSkeleton,
  VendorStorefrontProductRouteSkeleton,
  VendorOrdersListSkeleton,
  VendorAddressesSkeleton,
} from "./SkeletonLoaders";
import { AuthModal } from "./AuthModal";
import {
  ShippingAddressFormFields,
  isShippingAddressFormValid,
} from "./ShippingAddressFormFields";
import { resolveMyanmarRegionForTownship } from "../utils/myanmarRegions";
import { VendorStorefrontFooter } from "./VendorStorefrontFooter";
import { VendorInstallFab } from "./VendorInstallFab";
import { NotificationCenter } from "./NotificationCenter";
import { useChatNotification } from "../contexts/ChatNotificationContext";
import { authApi, wishlistApi } from "../../utils/api";
import { ApiError } from "../../utils/api-client";
import {
  AMBIENT_AUTH_PROFILE_REFRESH_MIN_MS,
  MIGOO_OPEN_CUSTOMER_AUTH_FOR_CHAT_EVENT,
  MIGOO_USER_SESSION_CHANGED_EVENT,
  VENDOR_ACCOUNT_VISIBILITY_RESYNC_MIN_MS,
  notifyMigooUserSessionChanged,
} from "../../constants";
import { toast } from "sonner";
import { getEffectiveVariantOptions } from "./ProductVariantChips";
import { useLoading } from "../contexts/LoadingContext";
import { useLanguage } from "../contexts/LanguageContext";
import { applyVendorStoreLogoFavicon } from "../utils/documentFavicon";
import { buildVendorStorefrontDocumentTitle } from "../utils/vendorStorefrontDocumentTitle";
import {
  buildVendorStoreHomePath,
  buildVendorStoreCheckoutPath,
  normalizeCheckoutStoragePath,
  resolveVendorStoreLinkSlug,
  resolveVendorPathSlug,
  pathVendorStoreSlugFromPathname,
  isDefaultTechnicalVendorStoreSlug,
} from "../utils/vendorStorePaths";
import { supabase } from "../contexts/AuthContext";
import {
  VENDOR_STORE_UNCATEGORIZED_FILTER,
  VENDOR_STORE_UNCATEGORIZED_SLUG,
  isVendorUncategorizedSlug,
  isVendorUncategorizedFilter,
  vendorCatalogFilterFromRouteSlug,
  vendorCategoryPathSegment,
} from "../utils/vendorStoreCategory";

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
  trackQuantity?: boolean;
  continueSellingOutOfStock?: boolean;
  rating: number;
  reviewCount: number;
  hasVariants?: boolean;
  variants?: any[];
  variantOptions?: any[];
  /** Same shape as marketplace `Product.options` — used when `variantOptions` is absent */
  options?: { name: string; values: string[] }[];
}

interface VendorStoreViewProps {
  vendorId: string;
  storeSlug?: string;
  /** Vendor subdomain or custom domain: paths are `/`, `/product/…`, `/saved` (no `/store/:slug`). */
  hostRootStorePaths?: boolean;
  onBack?: () => void;
  initialProductSlug?: string;
  /** From URL `/store/:slug/profile/...` — drives account view mode */
  profileSegment?: string | null;
  /** `/store/:slug/profile/orders/:orderId` — show this order in storefront context */
  profileOrderId?: string | null;
  /** `/store/:slug/saved` — saved products (wishlist) for this storefront */
  savedPage?: boolean;
  /** Optional category route segment (e.g. `/clothing` or `/store/:slug/clothing`). */
  categorySlug?: string | null;
}

type VendorAccountViewMode =
  | "storefront"
  | "view-profile"
  | "edit-profile"
  | "order-history"
  | "shipping-addresses"
  | "security-settings";

function profileSegmentToMode(seg: string | null): VendorAccountViewMode | null {
  if (seg === null) return null;
  if (seg === "view") return "view-profile";
  switch (seg) {
    case "edit":
      return "edit-profile";
    case "orders":
      return "order-history";
    case "addresses":
      return "shipping-addresses";
    case "security":
      return "security-settings";
    default:
      return "view-profile";
  }
}

function isVendorProfileProtectedRoute(
  vendorViewMode: VendorAccountViewMode,
  profileOrderId: string | null | undefined
): boolean {
  if (profileOrderId) return true;
  return vendorViewMode !== "storefront";
}

function hasVendorCustomerSession(user: unknown): boolean {
  if (resolveUserIdFromRecord(user)) return true;
  if (typeof window === "undefined") return false;
  try {
    const raw = localStorage.getItem("migoo-user");
    if (!raw) return false;
    return !!resolveUserIdFromRecord(JSON.parse(raw));
  } catch {
    return false;
  }
}

/** Same shape as main Storefront shipping addresses (KV + `/customers/:id/addresses`). */
interface MarketplaceAddress {
  id: string;
  label: string;
  recipientName: string;
  phone: string;
  addressLine1: string;
  addressLine2?: string;
  city: string;
  state?: string;
  zipCode?: string;
  country: string;
  isDefault?: boolean;
  userId?: string;
}

function resolveUserIdFromRecord(u: unknown): string | null {
  if (!u || typeof u !== "object") return null;
  const o = u as Record<string, unknown>;
  const raw = o.id ?? o.userId;
  if (typeof raw === "string" && raw.trim().length > 0) return raw.trim();
  if (typeof raw === "number" && Number.isFinite(raw)) return String(raw);
  return null;
}

function vendorUserProfileRefreshKey(userId: string): string {
  return `migoo-user-profile-refresh:${userId}`;
}

function wasVendorUserProfileRefreshedRecently(userId: string, maxAgeMs: number): boolean {
  if (typeof window === "undefined") return false;
  try {
    const raw = localStorage.getItem(vendorUserProfileRefreshKey(userId));
    const ts = Number(raw);
    return Number.isFinite(ts) && Date.now() - ts < maxAgeMs;
  } catch {
    return false;
  }
}

function markVendorUserProfileRefreshed(userId: string): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(vendorUserProfileRefreshKey(userId), String(Date.now()));
  } catch {
    /* ignore storage failures */
  }
}

function normalizeWishlistFromKvValue(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.filter((x): x is string => typeof x === "string");
  }
  if (value && typeof value === "object" && Array.isArray((value as { productIds?: unknown[] }).productIds)) {
    return (value as { productIds: unknown[] }).productIds.filter((x): x is string => typeof x === "string");
  }
  return [];
}

function dedupeOrdersByCanonical(rows: any[]): any[] {
  const map = new Map<string, any>();
  const score = (o: any) =>
    Math.max(
      new Date(o?.updatedAt || 0).getTime() || 0,
      new Date(o?.createdAt || o?.date || 0).getTime() || 0
    );
  for (const row of Array.isArray(rows) ? rows : []) {
    const key = String(row?.id || row?.orderNumber || "").trim();
    if (!key) continue;
    const prev = map.get(key);
    if (!prev || score(row) >= score(prev)) map.set(key, row);
  }
  return [...map.values()].sort(
    (a, b) =>
      (new Date(b?.createdAt || b?.date || 0).getTime() || 0) -
      (new Date(a?.createdAt || a?.date || 0).getTime() || 0)
  );
}

/**
 * Storefront URLs often use `vendor-{actualVendorId}` while KV rows use `vendorId` / `selectedVendors`
 * with the inner id (e.g. `vendor_…`). Expanding keys synchronously avoids an empty /saved page on
 * slow networks while `resolvedVendorId` is still loading (common on mobile).
 */
function expandVendorWishlistMatchKeys(storefrontParam: string, canonicalVendorId: string | null): Set<string> {
  const s = new Set<string>();
  const add = (v: string) => {
    const t = v.trim();
    if (!t) return;
    s.add(t);
    if (/^vendor-/i.test(t)) {
      const inner = t.replace(/^vendor-/i, "");
      if (inner) s.add(inner);
    }
  };
  add(String(storefrontParam || ""));
  add(String(canonicalVendorId || ""));
  return s;
}

/** True when product.vendorId / selectedVendors match storefront slug or KV id (ignores human-readable `vendor` name). */
function productVendorIdsMatchStorefront(
  p: any,
  storefrontParam: string,
  canonicalVendorId: string | null
): boolean {
  const keys = expandVendorWishlistMatchKeys(storefrontParam, canonicalVendorId);
  const pid = String(p?.vendorId ?? "").trim();
  if (pid && keys.has(pid)) return true;
  if (Array.isArray(p?.selectedVendors)) {
    for (const x of p.selectedVendors) {
      if (keys.has(String(x))) return true;
    }
  }
  return false;
}

function mergeSavedWishlistPageWithCatalog(
  rows: Product[],
  wishlistIds: string[],
  catalog: Product[]
): Product[] {
  if (rows.length === 0) return rows;
  const catById = new Map(catalog.map((p) => [p.id, p]));
  return rows.map((p) => {
    if (!wishlistIds.includes(p.id)) return p;
    const c = catById.get(p.id);
    return c ?? p;
  });
}

function cleanAsciiUrlSegment(value: unknown): string {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "")
    .trim();
}

function legacyNameUrlSegment(product: { name?: string }): string {
  return String(product.name || "")
    .trim()
    .toLowerCase()
    .replace(/[^\w\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "")
    .trim();
}

/**
 * Path segment for `/store/:store/product/:slug`.
 * Keep product URLs ASCII and stable. Burmese names still render in the UI, but
 * new links prefer SKU/id so browsers do not produce encoded Burmese paths.
 */
function buildVendorProductUrlSegment(product: { name?: string; sku?: string; id: string }): string {
  const sku = cleanAsciiUrlSegment(product.sku);
  if (sku.length > 0) return sku;
  const id = cleanAsciiUrlSegment(product.id);
  if (id.length > 0) return id;
  const fromName = legacyNameUrlSegment(product);
  if (fromName.length > 0) return fromName;
  return product.id;
}

function safeDecodePathSegment(slug: string): string {
  try {
    return decodeURIComponent(slug);
  } catch {
    return slug;
  }
}

function slugifyCategoryName(name: string): string {
  return String(name || "")
    .trim()
    .toLowerCase()
    .replace(/[^\w\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function isVendorCategoryTabActive(
  tab: "all" | "uncategorized" | { name: string },
  routeSlug: string
): boolean {
  const norm = routeSlug.trim().toLowerCase();
  if (tab === "all") return !norm;
  if (tab === "uncategorized") return isVendorUncategorizedSlug(norm);
  return slugifyCategoryName(tab.name) === norm;
}

const VENDOR_DEFAULT_STORE_PHONE = "+95 9 XXX XXX XXX";

function telHrefFromDisplay(phone: string): string {
  const digits = String(phone || "").replace(/[^\d+]/g, "");
  return digits.length > 0 ? `tel:${digits}` : "#";
}

function viberHrefFromDisplay(phone: string): string {
  const digits = String(phone || "").replace(/\D/g, "");
  if (!digits) return "#";
  const international =
    digits.startsWith("959")
      ? `+${digits}`
      : digits.startsWith("09")
        ? `+95${digits.slice(1)}`
        : digits.startsWith("95")
          ? `+${digits}`
          : `+${digits}`;
  return `viber://chat?number=${encodeURIComponent(international)}`;
}

function isPlaceholderVendorPhone(phone: string): boolean {
  const t = String(phone || "").trim();
  if (!t) return true;
  if (t === VENDOR_DEFAULT_STORE_PHONE) return true;
  if (/XXX/i.test(t)) return true;
  return false;
}

function defaultVariantSelections(product: Product): Record<string, string> {
  const out: Record<string, string> = {};
  getEffectiveVariantOptions(product as any).forEach((opt: { name: string; values?: string[] }) => {
    if (opt.values && opt.values.length > 0) out[opt.name] = opt.values[0];
  });
  return out;
}

function variantSelectionsFromSlug(product: Product, decodedSlug: string): Record<string, string> | null {
  const variantOptions = getEffectiveVariantOptions(product as any);
  const variants = product.variants || [];
  if (!product.hasVariants || !variants.length || !variantOptions.length) return null;

  const variant = variants.find(
    (v: any) =>
      v?.sku === decodedSlug ||
      (typeof v?.sku === "string" && v.sku.toLowerCase() === decodedSlug.toLowerCase())
  );
  if (!variant) return null;

  const names = variantOptions.map((o: any) => o.name);
  const vals = [variant.option1, variant.option2, variant.option3].filter(Boolean);
  const out: Record<string, string> = {};
  names.forEach((name, i) => {
    if (vals[i]) out[name] = String(vals[i]);
  });
  return Object.keys(out).length ? out : null;
}

function findMatchingVariant(
  product: Product,
  selections: Record<string, string>
): any | null {
  const opts = getEffectiveVariantOptions(product as any);
  if (!product.hasVariants || !product.variants?.length || !opts.length) return null;
  const optionNames = opts.map((o: any) => o.name);
  const sel = Object.keys(selections).length
    ? selections
    : defaultVariantSelections(product);
  return (
    product.variants.find((v: any) => {
      const values = [v.option1, v.option2, v.option3].filter(Boolean);
      return optionNames.every((name: string, idx: number) => sel[name] === values[idx]);
    }) ?? null
  );
}

function productToCardProduct(product: Product): ProductCardProduct {
  const variantOptions =
    product.variantOptions?.length > 0
      ? product.variantOptions
      : product.options?.map((o) => ({ name: o.name, values: o.values }));
  return {
    id: product.id,
    image: product.images && product.images.length > 0 ? product.images[0] : "",
    images: product.images,
    name: product.name,
    price: product.price.toString(),
    salesVolume: product.reviewCount || 0,
    sku: product.sku,
    hasVariants: product.hasVariants,
    inventory: product.inventory,
    trackQuantity: product.trackQuantity,
    continueSellingOutOfStock: product.continueSellingOutOfStock,
    variantOptions,
    variants: product.variants,
  };
}

type VendorAddToCartOverrides = {
  variantSku?: string;
  variantPrice?: number;
  variantImage?: string;
  quantity?: number;
  buyNow?: boolean;
};

/** Bust browser cache when storage path or record updates (signed URLs can look identical across uploads). */
function withVendorProfileImageCacheBust(user: unknown, baseUrl: string): string {
  if (!baseUrl) return "";
  const u = user as { updatedAt?: string; profileImage?: string; customerId?: string } | null;
  const rev = u?.updatedAt || u?.profileImage || u?.customerId;
  if (rev == null || rev === "") return baseUrl;
  const token = encodeURIComponent(String(rev).slice(0, 128));
  return baseUrl.includes("?") ? `${baseUrl}&_pv=${token}` : `${baseUrl}?_pv=${token}`;
}

/**
 * Merge server profile into local migoo-user. If the API omits profileImageUrl (common for
 * customer records that only send `avatar`), drop the old signed URL from localStorage so
 * getUserProfileImageUrl does not prefer a stale URL over the fresh avatar.
 */
function applyServerProfileMerge(localUser: any, serverUser: any): any {
  return applyCustomerProfileMerge(localUser, serverUser);
}

function resolveVendorProductFromSlug(products: Product[], decoded: string): Product | undefined {
  const dec = decoded.trim();
  const norm = cleanAsciiUrlSegment(dec);
  const direct =
    products.find((p) => buildVendorProductUrlSegment(p) === norm) ||
    products.find((p) => legacyNameUrlSegment(p) === norm) ||
    products.find((p) => String(p.sku || "").trim().toLowerCase() === dec.toLowerCase()) ||
    products.find((p) => String(p.id || "").trim().toLowerCase() === dec.toLowerCase());
  if (direct) return direct;
  return products.find(
    (p) =>
      p.hasVariants &&
      Array.isArray(p.variants) &&
      p.variants.some((v: any) => String(v?.sku || "").trim().toLowerCase() === dec.toLowerCase())
  );
}

/** Browse mode: small pages + load more. Search mode: max edge page size so live filter + server q cover the catalog. */
/** Smaller first page = faster mobile LCP (fewer images above the fold). */
const VENDOR_BROWSE_PAGE_SIZE = 12;
/** Saved products grid — same page size as browse; server + moduleCache + localStorage per page. */
const VENDOR_SAVED_PAGE_SIZE = 24;
const VENDOR_SEARCH_PAGE_SIZE = 100;
/** Keystrokes only update client filter until this many chars, then debounced server `q`. */
const VENDOR_SEARCH_MIN_SERVER_CHARS = 3;
/** Ms after last keystroke before server catalog fetch (with `q`); category changes refetch immediately. */
const VENDOR_SEARCH_DEBOUNCE_MS = 450;
/** Live typeahead on product detail — only searches already-loaded catalog rows. */
const VENDOR_SEARCH_PREVIEW_LIMIT = 8;

function productMatchesVendorClientSearch(
  product: { name?: string; sku?: string },
  query: string
): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return (
    String(product.name || "")
      .toLowerCase()
      .includes(q) ||
    String(product.sku || "")
      .toLowerCase()
      .includes(q)
  );
}

type VendorCatalogSlice = {
  products: Product[];
  total: number;
  page: number;
  hasMore: boolean;
};

function vendorCatalogSliceSessionKey(vendorId: string, category: string): string {
  return `${String(vendorId).trim()}|${String(category || "all").trim().toLowerCase() || "all"}`;
}

function saveVendorCatalogSliceSession(sliceKey: string, slice: VendorCatalogSlice) {
  const ssKey = ssVendorCatalogListKey(sliceKey);
  if (slice.page > 1 || slice.products.length > VENDOR_BROWSE_PAGE_SIZE) {
    writeSessionCatalogList(ssKey, slice);
  } else {
    removeSessionCatalogList(ssKey);
  }
}

function readVendorCatalogSliceSession(sliceKey: string): VendorCatalogSlice | null {
  const fromSession = readSessionCatalogList(ssVendorCatalogListKey(sliceKey));
  if (!fromSession?.products.length) return null;
  return {
    products: fromSession.products as Product[],
    total: fromSession.total,
    page: fromSession.page,
    hasMore: fromSession.hasMore,
  };
}

function mergeVendorHomeStateWithSessionSlice(
  base: ReturnType<typeof vendorHomeStateFromCatalogPayload>,
  fromSession: VendorCatalogSlice
): ReturnType<typeof vendorHomeStateFromCatalogPayload> {
  return {
    ...base,
    products: normalizeVendorStorefrontProducts(fromSession.products),
    vendorCatalogTotal: fromSession.total,
    vendorCatalogPage: fromSession.page,
    vendorCatalogHasMore: fromSession.hasMore,
  };
}

function applyLoadedMoreSessionToHomeState(
  vendorId: string,
  catKey: string,
  vendorCategories: any[],
  basePayload?: Record<string, unknown> | null
): ReturnType<typeof vendorHomeStateFromCatalogPayload> | null {
  const sliceKey = vendorCatalogSliceSessionKey(vendorId, catKey);
  const fromSession = readVendorCatalogSliceSession(sliceKey);
  if (
    !fromSession ||
    (fromSession.page <= 1 && fromSession.products.length <= VENDOR_BROWSE_PAGE_SIZE)
  ) {
    return null;
  }
  const base =
    basePayload && typeof basePayload === "object"
      ? vendorHomeStateFromCatalogPayload(basePayload, vendorId, vendorCategories)
      : {
          products: [],
          vendorCategories,
          serverStatus: "healthy" as const,
          vendorCatalogTotal: 0,
          vendorCatalogPage: 1,
          vendorCatalogHasMore: false,
          storeName: vendorStoreNameFromCatalog(vendorId, basePayload),
          storeLogo: vendorStoreLogoFromCatalog(basePayload),
          storePhone: VENDOR_DEFAULT_STORE_PHONE,
          canonicalVendorId: vendorId,
        };
  return mergeVendorHomeStateWithSessionSlice(base, fromSession);
}

function isVendorCheckoutOrSummaryPath(pathname: string, storeBase: string): boolean {
  if (
    pathname === "/checkout" ||
    pathname === "/summary" ||
    pathname === `${storeBase}/checkout` ||
    pathname === `${storeBase}/summary`
  ) {
    return true;
  }
  return (
    matchPath({ path: "/vendor/:storeName/checkout", end: true }, pathname) != null ||
    matchPath({ path: "/vendor/:storeName/summary", end: true }, pathname) != null ||
    matchPath({ path: "/vendor-:storeName/checkout", end: true }, pathname) != null ||
    matchPath({ path: "/vendor-:storeName/summary", end: true }, pathname) != null
  );
}

function vendorHomeStateFromCatalogPayload(
  fromLs: Record<string, unknown>,
  vendorId: string,
  vendorCategories: any[],
): {
  products: Product[];
  vendorCategories: any[];
  serverStatus: "healthy";
  vendorCatalogTotal: number;
  vendorCatalogPage: number;
  vendorCatalogHasMore: boolean;
  storeName: string;
  storeLogo: string;
  storePhone: string;
  canonicalVendorId: string | null;
} {
  const products = normalizeVendorStorefrontProducts(
    Array.isArray(fromLs.products) ? (fromLs.products as Product[]) : []
  );
  const pageSize = VENDOR_BROWSE_PAGE_SIZE;
  const cacheKey = CACHE_KEYS.vendorProductsPage(vendorId, 1, "", "all", pageSize);
  moduleCache.prime(cacheKey, fromLs);
  const rid =
    typeof fromLs.resolvedVendorId === "string" && fromLs.resolvedVendorId.trim()
      ? fromLs.resolvedVendorId.trim()
      : null;
  const sp =
    typeof fromLs.storePhone === "string" && fromLs.storePhone.trim()
      ? fromLs.storePhone.trim()
      : VENDOR_DEFAULT_STORE_PHONE;
  return {
    products,
    vendorCategories,
    serverStatus: "healthy",
    vendorCatalogTotal: typeof fromLs.total === "number" ? fromLs.total : 0,
    vendorCatalogPage: typeof fromLs.page === "number" ? fromLs.page : 1,
    vendorCatalogHasMore: !!fromLs.hasMore,
    storeName: vendorStoreNameFromCatalog(vendorId, fromLs),
    storeLogo: vendorStoreLogoFromCatalog(fromLs),
    storePhone: sp,
    canonicalVendorId: rid ?? vendorId,
  };
}

function hasCatalogRowsOrTotals(payload: Record<string, unknown>): boolean {
  const products = Array.isArray(payload.products) ? payload.products : [];
  const total = typeof payload.total === "number" ? payload.total : 0;
  return products.length > 0 || total > 0;
}

function vendorStoreNameFromCatalog(
  vendorId: string,
  fromLs?: Record<string, unknown> | null,
): string {
  return resolveVendorStoreDisplayName(
    vendorId,
    fromLs && typeof fromLs.storeName === "string" ? fromLs.storeName : null,
  );
}

function vendorStoreLogoFromCatalog(fromLs?: Record<string, unknown> | null): string {
  return fromLs && typeof fromLs.logo === "string" && fromLs.logo.trim()
    ? fromLs.logo.trim()
    : "";
}

/**
 * so production (slow edge) does not flash a full-page skeleton while waiting for sequential fetches.
 * Primes moduleCache so background refresh does not duplicate network.
 */
function getVendorHomepageInitialState(
  vendorId: string,
  savedPage: boolean,
  initialProductSlug: string | undefined,
  initialCatalogCategory = "all"
): {
  products: Product[];
  vendorCategories: any[];
  serverStatus: "checking" | "healthy";
  vendorCatalogTotal: number;
  vendorCatalogPage: number;
  vendorCatalogHasMore: boolean;
  storeName: string;
  storeLogo: string;
  storePhone: string;
  canonicalVendorId: string | null;
} {
  if (savedPage) {
    // Keep header branding stable on first paint of `/saved` by reusing cached page-1 catalog metadata.
    // Without this, production latency can briefly show fallback "Vendor Store" + empty logo.
    try {
      const lsKey = lsVendorCatalogPage1Key(vendorId, "", "all", VENDOR_BROWSE_PAGE_SIZE);
      const fromLs = readPersistedJson<any>(lsKey, PERSISTED_CATALOG_TTL_MS);
      if (fromLs && typeof fromLs === "object") {
        const cachedStoreName = vendorStoreNameFromCatalog(vendorId, fromLs);
        const cachedStoreLogo = vendorStoreLogoFromCatalog(fromLs);
        const cachedStorePhone =
          typeof fromLs.storePhone === "string" && fromLs.storePhone.trim()
            ? fromLs.storePhone.trim()
            : VENDOR_DEFAULT_STORE_PHONE;
        const rid =
          typeof fromLs.resolvedVendorId === "string" && fromLs.resolvedVendorId.trim()
            ? fromLs.resolvedVendorId.trim()
            : null;
        return {
          products: [],
          vendorCategories: [],
          serverStatus: "healthy",
          vendorCatalogTotal: 0,
          vendorCatalogPage: 1,
          vendorCatalogHasMore: false,
          storeName: cachedStoreName,
          storeLogo: cachedStoreLogo,
          storePhone: cachedStorePhone,
          canonicalVendorId: rid ?? vendorId,
        };
      }
    } catch {
      /* ignore cache read errors and fall back */
    }

    const savedBranding = readCachedVendorBrandingBySlug(vendorId);
    return {
      products: [],
      vendorCategories: [],
      serverStatus: "healthy",
      vendorCatalogTotal: 0,
      vendorCatalogPage: 1,
      vendorCatalogHasMore: false,
      storeName: savedBranding.storeName,
      storeLogo: savedBranding.storeLogo,
      storePhone: VENDOR_DEFAULT_STORE_PHONE,
      canonicalVendorId: null,
    };
  }

  let vendorCategories: any[] = [];
  try {
    const catLsKey = lsVendorCategoriesKey(vendorId);
    const fromCatLs = readPersistedJson<any[]>(catLsKey, PERSISTED_CATALOG_TTL_MS);
    if (fromCatLs !== null && Array.isArray(fromCatLs)) {
      const cleanedCategories = filterVendorCreatedCategories(fromCatLs, vendorId);
      if (cleanedCategories.length !== fromCatLs.length) {
        writePersistedJson(catLsKey, cleanedCategories);
      }
      moduleCache.prime(CACHE_KEYS.vendorCategories(vendorId), cleanedCategories);
      vendorCategories = cleanedCategories;
    }
  } catch {
    /* ignore */
  }

  const catKey = String(initialCatalogCategory || "all").trim() || "all";
  try {
    const lsKey = lsVendorCatalogPage1Key(vendorId, "", catKey, VENDOR_BROWSE_PAGE_SIZE);
    const fromLs = readPersistedJson<any>(lsKey, PERSISTED_CATALOG_TTL_MS);
    if (fromLs && typeof fromLs === "object") {
      if (!hasCatalogRowsOrTotals(fromLs) && !initialProductSlug) {
        return {
          products: [],
          vendorCategories,
          serverStatus: "checking",
          vendorCatalogTotal: 0,
          vendorCatalogPage: 1,
          vendorCatalogHasMore: false,
          storeName: vendorStoreNameFromCatalog(vendorId, fromLs),
          storeLogo: vendorStoreLogoFromCatalog(fromLs),
          storePhone:
            typeof fromLs.storePhone === "string" && fromLs.storePhone.trim()
              ? fromLs.storePhone.trim()
              : VENDOR_DEFAULT_STORE_PHONE,
          canonicalVendorId:
            typeof fromLs.resolvedVendorId === "string" && fromLs.resolvedVendorId.trim()
              ? fromLs.resolvedVendorId.trim()
              : vendorId,
        };
      }
      const withSession = applyLoadedMoreSessionToHomeState(
        vendorId,
        catKey,
        vendorCategories,
        fromLs
      );
      if (withSession) return withSession;
      return vendorHomeStateFromCatalogPayload(fromLs, vendorId, vendorCategories);
    }
  } catch {
    /* ignore */
  }

  try {
    const withSessionOnly = applyLoadedMoreSessionToHomeState(
      vendorId,
      catKey,
      vendorCategories,
      null
    );
    if (withSessionOnly) {
      return {
        ...withSessionOnly,
        serverStatus: initialProductSlug ? "healthy" : "checking",
      };
    }
  } catch {
    /* ignore */
  }

  try {
    const cacheKey = CACHE_KEYS.vendorProductsPage(vendorId, 1, "", catKey, VENDOR_BROWSE_PAGE_SIZE);
    const fromMem = moduleCache.peek<Record<string, unknown>>(cacheKey);
    if (fromMem && typeof fromMem === "object") {
      const products = Array.isArray(fromMem.products) ? (fromMem.products as Product[]) : [];
      const total = typeof fromMem.total === "number" ? fromMem.total : 0;
      if (products.length > 0 || total > 0) {
        const withSession = applyLoadedMoreSessionToHomeState(
          vendorId,
          catKey,
          vendorCategories,
          fromMem
        );
        if (withSession) return withSession;
        return vendorHomeStateFromCatalogPayload(fromMem, vendorId, vendorCategories);
      }
    }
  } catch {
    /* ignore */
  }

  const fallbackBranding = readCachedVendorBrandingBySlug(vendorId);
  return {
    products: [],
    vendorCategories,
    serverStatus: initialProductSlug ? "healthy" : "checking",
    vendorCatalogTotal: 0,
    vendorCatalogPage: 1,
    vendorCatalogHasMore: false,
    storeName: fallbackBranding.storeName,
    storeLogo: fallbackBranding.storeLogo,
    storePhone: VENDOR_DEFAULT_STORE_PHONE,
    canonicalVendorId: null,
  };
}

export function VendorStoreView({
  vendorId,
  storeSlug,
  hostRootStorePaths = false,
  onBack,
  initialProductSlug,
  profileSegment = null,
  profileOrderId = null,
  savedPage = false,
  categorySlug = null,
}: VendorStoreViewProps) {
  const navigate = useNavigate();
  const location = useLocation();
  const { language, setLanguage, t } = useLanguage();
  const { chatUnreadCount, openFloatingChat } = useChatNotification();

  useEffect(() => {
    if (language === "zh") {
      setLanguage("en");
    }
  }, [language, setLanguage]);

  const [canonicalStoreSlug, setCanonicalStoreSlug] = useState<string | null>(() => {
    const resolved = resolveVendorPathSlug(storeSlug || vendorId);
    return resolved || null;
  });

  const canonicalPathSlug = useMemo(
    () => resolveVendorPathSlug(storeSlug || vendorId, canonicalStoreSlug),
    [storeSlug, vendorId, canonicalStoreSlug]
  );

  const storeLinkSlug = useMemo(
    () =>
      resolveVendorStoreLinkSlug(
        location.pathname,
        storeSlug,
        vendorId,
        canonicalStoreSlug
      ),
    [location.pathname, storeSlug, vendorId, canonicalStoreSlug]
  );

  const storeBase = useMemo(() => {
    return buildVendorStoreHomePath({
      pathSlug: storeLinkSlug || canonicalPathSlug || storeSlug || vendorId,
      hostRootStorePaths,
      useVendorDashPrefix: location.pathname.startsWith("/vendor-"),
    });
  }, [
    hostRootStorePaths,
    location.pathname,
    storeLinkSlug,
    canonicalPathSlug,
    storeSlug,
    vendorId,
  ]);
  const checkoutPath = useMemo(
    () =>
      buildVendorStoreCheckoutPath({
        pathSlug: storeLinkSlug || canonicalPathSlug || storeSlug || vendorId,
        hostRootStorePaths,
        useVendorDashPrefix: location.pathname.startsWith("/vendor-"),
      }),
    [
      hostRootStorePaths,
      location.pathname,
      storeLinkSlug,
      canonicalPathSlug,
      storeSlug,
      vendorId,
    ]
  );

  const restoreCatalogForBrowseRef = useRef<(() => void) | null>(null);
  /** True while URL is a product detail route — used to restore browse catalog only when leaving PDP. */
  const wasOnVendorProductRouteRef = useRef(false);

  const navigateStoreHome = useCallback(() => {
    wasOnVendorProductRouteRef.current = false;
    restoreCatalogForBrowseRef.current?.();
    setSelectedProduct(null);
    navigate(
      buildVendorStoreHomePath({
        pathSlug: storeLinkSlug || canonicalPathSlug || storeSlug || vendorId,
        hostRootStorePaths,
        useVendorDashPrefix: location.pathname.startsWith("/vendor-"),
      }),
      { replace: true }
    );
  }, [navigate, storeLinkSlug, canonicalPathSlug, storeSlug, vendorId, hostRootStorePaths, location.pathname]);

  useEffect(() => {
    if (hostRootStorePaths || !canonicalPathSlug) return;
    const fromPath = pathVendorStoreSlugFromPathname(location.pathname);
    const urlSegment = decodeURIComponent(
      String(fromPath || storeSlug || vendorId || "").trim()
    );
    if (!urlSegment || urlSegment === canonicalPathSlug) return;
    if (isDefaultTechnicalVendorStoreSlug(urlSegment)) return;
    if (resolveVendorPathSlug(urlSegment) !== canonicalPathSlug) return;
    const encUrl = encodeURIComponent(urlSegment);
    const encCanon = encodeURIComponent(canonicalPathSlug);
    if (encUrl === encCanon) return;
    const path = location.pathname;
    const next = path
      .replace(`/vendor/${encUrl}`, `/vendor/${encCanon}`)
      .replace(`/vendor-${encUrl}`, `/vendor-${encCanon}`)
      .replace(`/vendor/${urlSegment}`, `/vendor/${encCanon}`)
      .replace(`/vendor-${urlSegment}`, `/vendor-${encCanon}`);
    if (next !== path) {
      navigate(`${next}${location.search}${location.hash}`, { replace: true });
    }
  }, [
    hostRootStorePaths,
    canonicalPathSlug,
    storeSlug,
    vendorId,
    location.pathname,
    location.search,
    location.hash,
    navigate,
  ]);

  const categoryPathForName = useCallback(
    (categoryName: string) => {
      const base = storeBase || "";
      const seg = vendorCategoryPathSegment(categoryName);
      if (!seg) return base || "/";
      return `${base}/${encodeURIComponent(seg)}`;
    },
    [storeBase]
  );

  /** URL category segment — source of truth for subnav highlight + catalog filter (avoids "all" flash). */
  const normalizedCategorySlugFromRoute = useMemo(() => {
    const raw = String(categorySlug || "").trim();
    if (!raw) return "";
    return slugifyCategoryName(safeDecodePathSegment(raw));
  }, [categorySlug]);

  const initialCatalogCategoryFromRoute = useMemo(() => {
    if (savedPage || !normalizedCategorySlugFromRoute) return "all";
    return vendorCatalogFilterFromRouteSlug(normalizedCategorySlugFromRoute, []);
  }, [savedPage, normalizedCategorySlugFromRoute]);

  /** Prefer pathname over useParams so async product load cannot reopen detail after user navigated away. */
  const productSlugFromPath = useMemo(() => {
    const fromDashBase =
      storeBase &&
      storeBase.startsWith("/vendor-") &&
      location.pathname.startsWith(`${storeBase}/product/`)
        ? location.pathname.slice(`${storeBase}/product/`.length).split("/")[0]
        : "";
    if (fromDashBase) return fromDashBase;
    const m =
      matchPath({ path: "/vendor/:storeName/product/:productSlug", end: true }, location.pathname) ??
      matchPath({ path: "/vendor-:storeName/product/:productSlug", end: true }, location.pathname) ??
      matchPath({ path: "/product/:productSlug", end: true }, location.pathname);
    return typeof m?.params?.productSlug === "string" ? m.params.productSlug : undefined;
  }, [location.pathname, storeBase]);

  const isVendorProductDetailPath = useMemo(
    () =>
      (storeBase.startsWith("/vendor-") && location.pathname.startsWith(`${storeBase}/product/`)) ||
      matchPath({ path: "/vendor/:storeName/product/:productSlug", end: true }, location.pathname) != null ||
      matchPath({ path: "/vendor-:storeName/product/:productSlug", end: true }, location.pathname) != null ||
      matchPath({ path: "/product/:productSlug", end: true }, location.pathname) != null,
    [location.pathname, storeBase]
  );

  const goToProfileMode = useCallback(
    (mode: VendorAccountViewMode) => {
      if (mode === "storefront") {
        navigateStoreHome();
        return;
      }
      const root = storeBase || "";
      const pathMap: Record<Exclude<VendorAccountViewMode, "storefront">, string> = {
        "view-profile": `${root}/profile`,
        "edit-profile": `${root}/profile/edit`,
        "order-history": `${root}/profile/orders`,
        "shipping-addresses": `${root}/profile/addresses`,
        "security-settings": `${root}/profile/security`,
      };
      navigate(pathMap[mode]);
    },
    [navigate, navigateStoreHome, storeBase]
  );

  // Single LS read for first paint — always hydrate browse catalog from "all" (category tabs filter client-side).
  const [vendorHomeSnapshot] = useState(() =>
    getVendorHomepageInitialState(vendorId, savedPage, initialProductSlug, "all")
  );
  const [serverStatus, setServerStatus] = useState<'checking' | 'healthy' | 'unhealthy'>(vendorHomeSnapshot.serverStatus);
  const [products, setProducts] = useState<Product[]>(vendorHomeSnapshot.products);
  const [vendorCategories, setVendorCategories] = useState<any[]>(
    () => filterVendorCreatedCategories(vendorHomeSnapshot.vendorCategories, vendorId)
  );
  const buildVendorCategoryProductIdMap = useCallback((categories: any[]) => {
    const map = new Map<string, Set<string>>();
    for (const category of filterVendorCreatedCategories(categories || [], vendorId)) {
      const name = String(category?.name || "").trim().toLowerCase();
      if (!name || !Array.isArray(category?.productIds)) continue;
      const ids = category.productIds
        .map((id: unknown) => String(id || "").trim())
        .filter(Boolean);
      map.set(name, new Set(ids));
    }
    return map;
  }, [vendorId]);
  const vendorCategoryProductIdsByName = useMemo(
    () => buildVendorCategoryProductIdMap(vendorCategories),
    [buildVendorCategoryProductIdMap, vendorCategories]
  );
  const vendorCategorizedProductIds = useMemo(() => {
    const assignedIds = new Set<string>();
    for (const ids of vendorCategoryProductIdsByName.values()) {
      for (const id of ids) assignedIds.add(id);
    }
    return assignedIds;
  }, [vendorCategoryProductIdsByName]);
  const vendorCategoryProductIdsByNameRef = useRef(vendorCategoryProductIdsByName);
  const vendorCategorizedProductIdsRef = useRef(vendorCategorizedProductIds);
  useEffect(() => {
    vendorCategoryProductIdsByNameRef.current = vendorCategoryProductIdsByName;
    vendorCategorizedProductIdsRef.current = vendorCategorizedProductIds;
  }, [vendorCategoryProductIdsByName, vendorCategorizedProductIds]);
  const [searchQuery, setSearchQuery] = useState("");
  /** Passed to API as `q` only after debounce + min length; `searchQuery` still drives instant client filter. */
  const [debouncedVendorServerQ, setDebouncedVendorServerQ] = useState("");
  const [selectedCategory, setSelectedCategory] = useState(initialCatalogCategoryFromRoute);
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [vendorCatalogTotal, setVendorCatalogTotal] = useState(vendorHomeSnapshot.vendorCatalogTotal);
  const [vendorCatalogPage, setVendorCatalogPage] = useState(vendorHomeSnapshot.vendorCatalogPage);
  const [vendorCatalogHasMore, setVendorCatalogHasMore] = useState(vendorHomeSnapshot.vendorCatalogHasMore);
  const [vendorCatalogLoadingMore, setVendorCatalogLoadingMore] = useState(false);
  const [vendorCatalogRefetching, setVendorCatalogRefetching] = useState(false);
  const [savedDisplayProducts, setSavedDisplayProducts] = useState<Product[]>([]);
  /** Server total of wishlist products belonging to this storefront (all pages). */
  const [savedVendorWishlistTotal, setSavedVendorWishlistTotal] = useState(0);
  const [savedWishlistPage, setSavedWishlistPage] = useState(1);
  const [savedWishlistHasMore, setSavedWishlistHasMore] = useState(false);
  const [savedWishlistLoadingMore, setSavedWishlistLoadingMore] = useState(false);
  /** KV vendor id after slug resolution — matches wishlist rows where URL segment is `vendor-vendor_…`. */
  const [canonicalVendorId, setCanonicalVendorId] = useState<string | null>(vendorHomeSnapshot.canonicalVendorId);
  /** Skip one filter/search refetch on mount (loadVendorData already loads page 1). */
  const vendorCatalogFilterMountSkipRef = useRef(true);
  /** Latest catalog for merging into saved list without re-subscribing the wishlist hydration effect to `products`. */
  const productsRef = useRef<Product[]>([]);
  productsRef.current = products;
  /** Monotonic id for catalog requests; older async responses are ignored. */
  const vendorCatalogRequestSeqRef = useRef(0);
  /** Monotonic id for filter/search-triggered refetch effect status updates. */
  const vendorCatalogRefetchRunRef = useRef(0);
  /** Last successful revalidate time per catalog key (throttle background refetch spam). */
  const vendorCatalogRevalidateAtRef = useRef<Map<string, number>>(new Map());
  const VENDOR_REVALIDATE_COOLDOWN_MS = 15000;
  /** In-memory page-1 slices per category — instant tab switches on slow deploy networks. */
  const catalogSliceByCategoryRef = useRef<
    Map<
      string,
      { products: Product[]; total: number; page: number; hasMore: boolean }
    >
  >(new Map());
  /** Debounce category/search refetch so rapid subnav clicks do not flash skeleton grids. */
  const vendorCatalogRefetchDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** Refetch when vendor, search query, or category tab changes. */
  const vendorCatalogFetchKeyRef = useRef("");
  const prevCatalogCategoryRef = useRef<string | null>(null);
  const vendorCatalogStateRef = useRef({
    page: vendorHomeSnapshot.vendorCatalogPage,
    hasMore: vendorHomeSnapshot.vendorCatalogHasMore,
    total: vendorHomeSnapshot.vendorCatalogTotal,
  });
  useEffect(() => {
    vendorCatalogStateRef.current = {
      page: vendorCatalogPage,
      hasMore: vendorCatalogHasMore,
      total: vendorCatalogTotal,
    };
  }, [vendorCatalogPage, vendorCatalogHasMore, vendorCatalogTotal]);

  const catalogSliceMemoryKey = useCallback(
    (category: string) =>
      `${vendorId}|${String(category || "all").trim().toLowerCase() || "all"}`,
    [vendorId]
  );

  const applyVendorCatalogSlice = useCallback(
    (slice: { products: Product[]; total: number; page: number; hasMore: boolean }) => {
      setProducts(normalizeVendorStorefrontProducts(slice.products));
      setVendorCatalogTotal(slice.total);
      setVendorCatalogPage(slice.page);
      setVendorCatalogHasMore(slice.hasMore);
      setVendorCatalogRefetching(false);
      setServerStatus("healthy");
    },
    []
  );

  /** Client-filter in-memory rows for the active tab (instant paint while server page-1 loads). */
  const clientFilterProductsForCatalogCategory = useCallback(
    (rows: Product[], category: string) => {
      const cat = String(category || "all").trim();
      if (!cat || cat === "all") return rows;
      if (isVendorUncategorizedFilter(cat)) {
        return rows.filter((p) => !vendorCategorizedProductIdsRef.current.has(String(p.id || "").trim()));
      }
      const want = cat.toLowerCase();
      const vendorCategoryProductIds = vendorCategoryProductIdsByNameRef.current.get(want);
      if (!vendorCategoryProductIds) return [];
      return rows.filter((p) => vendorCategoryProductIds.has(String(p.id || "").trim()));
    },
    []
  );

  const shouldApplyCachedCatalogSlice = useCallback(
    (
      slice: { products: Product[]; total: number; page: number; hasMore: boolean },
      category: string
    ) => {
      if (slice.products.length > 0) return true;
      const interim = clientFilterProductsForCatalogCategory(
        productsRef.current,
        category
      );
      return interim.length === 0;
    },
    [clientFilterProductsForCatalogCategory]
  );

  const rememberVendorCatalogSlice = useCallback(
    (
      category: string,
      slice: { products: Product[]; total: number; page: number; hasMore: boolean }
    ) => {
      const sliceKey = catalogSliceMemoryKey(category);
      catalogSliceByCategoryRef.current.set(sliceKey, slice);
      saveVendorCatalogSliceSession(sliceKey, slice);
    },
    [catalogSliceMemoryKey]
  );

  const readCatalogSliceForKey = useCallback((sliceKey: string) => {
    const mem = catalogSliceByCategoryRef.current.get(sliceKey);
    if (mem) return mem;
    const fromSession = readVendorCatalogSliceSession(sliceKey);
    if (!fromSession) return undefined;
    catalogSliceByCategoryRef.current.set(sliceKey, fromSession);
    return fromSession;
  }, []);

  const vendorCatalogSliceHasMoreLoaded = useCallback(
    (category: string) => {
      const memSlice = readCatalogSliceForKey(catalogSliceMemoryKey(category));
      if (!memSlice) return false;
      return (
        memSlice.page > 1 ||
        memSlice.products.length > VENDOR_BROWSE_PAGE_SIZE
      );
    },
    [catalogSliceMemoryKey, readCatalogSliceForKey]
  );

  const vendorEffectiveVariantOptions = useMemo(
    () => (selectedProduct ? getEffectiveVariantOptions(selectedProduct as any) : []),
    [selectedProduct]
  );

  /**
   * Subnav: vendor-owned categories only. Super-admin product categories are intentionally not imported
   * into a vendor storefront after a product is assigned to the vendor.
   */
  const subnavCategoryItems = useMemo(() => {
    const byLower = new Map<string, { id: string; name: string; status?: string }>();

    const add = (row: { id?: string; name?: string; status?: string }) => {
      const name = String(row?.name || "").trim();
      if (!name) return;
      if (name.toLowerCase() === VENDOR_STORE_UNCATEGORIZED_SLUG) return;
      const st = String(row?.status ?? "active").toLowerCase();
      if (st === "inactive" || st === "off" || st === "off-shelf") return;
      const k = name.toLowerCase();
      if (byLower.has(k)) return;
      const rid = row.id != null && String(row.id).trim() ? String(row.id).trim() : "";
      byLower.set(k, {
        id: rid || `catalog-cat:${k}`,
        name,
        status: row.status,
      });
    };

    for (const c of filterVendorCreatedCategories(vendorCategories || [], vendorId)) {
      add(c as { id?: string; name?: string; status?: string });
    }
    return [...byLower.values()].sort((a, b) =>
      a.name.localeCompare(b.name, undefined, { sensitivity: "base" })
    );
  }, [vendorId, vendorCategories]);

  /** Catalog filter for subnav + client-side grid — URL wins over stale React state. */
  const catalogCategoryForFetch = useMemo(
    () => vendorCatalogFilterFromRouteSlug(normalizedCategorySlugFromRoute, subnavCategoryItems),
    [normalizedCategorySlugFromRoute, subnavCategoryItems]
  );

  const restoreVendorBrowseCatalogSliceForRoute = useCallback(() => {
    if (savedPage) return;
    const qRaw = debouncedVendorServerQ.trim();
    if (qRaw) return;

    const cat = catalogCategoryForFetch;
    const pageSize = VENDOR_BROWSE_PAGE_SIZE;
    const memSlice = readCatalogSliceForKey(catalogSliceMemoryKey(cat));
    if (memSlice?.products?.length) {
      applyVendorCatalogSlice(memSlice);
      return;
    }

    const cacheKey = CACHE_KEYS.vendorProductsPage(vendorId, 1, "", cat, pageSize);
    const fromMem = moduleCache.peek<any>(cacheKey);
    if (fromMem && typeof fromMem === "object" && Array.isArray(fromMem.products) && fromMem.products.length > 0) {
      applyVendorCatalogSlice({
        products: fromMem.products || [],
        total: typeof fromMem.total === "number" ? fromMem.total : 0,
        page: typeof fromMem.page === "number" ? fromMem.page : 1,
        hasMore: !!fromMem.hasMore,
      });
      return;
    }

    const lsKey = lsVendorCatalogPage1Key(vendorId, "", cat, pageSize);
    const fromLs = readPersistedJson<any>(lsKey, PERSISTED_CATALOG_TTL_MS);
    if (fromLs && typeof fromLs === "object" && Array.isArray(fromLs.products) && fromLs.products.length > 0) {
      applyVendorCatalogSlice({
        products: fromLs.products || [],
        total: typeof fromLs.total === "number" ? fromLs.total : 0,
        page: typeof fromLs.page === "number" ? fromLs.page : 1,
        hasMore: !!fromLs.hasMore,
      });
    }
  }, [
    savedPage,
    debouncedVendorServerQ,
    catalogCategoryForFetch,
    catalogSliceMemoryKey,
    readCatalogSliceForKey,
    applyVendorCatalogSlice,
    vendorId,
  ]);

  restoreCatalogForBrowseRef.current = restoreVendorBrowseCatalogSliceForRoute;

  /** Server category for paginated catalog — category tabs and search both filter on the API. */
  const vendorCatalogServerCategory = useMemo(
    () => catalogCategoryForFetch,
    [catalogCategoryForFetch]
  );

  const uncategorizedTabPath = useMemo(
    () => `${storeBase}/${encodeURIComponent(VENDOR_STORE_UNCATEGORIZED_SLUG)}`,
    [storeBase]
  );

  useEffect(() => {
    if (savedPage) {
      setSelectedProduct(null);
    }
  }, [savedPage]);

  const [cartOpen, setCartOpen] = useState(false);
  const [showCheckout, setShowCheckout] = useState(false);
  const [storeName, setStoreName] = useState(() =>
    resolveVendorStoreDisplayName(vendorId, vendorHomeSnapshot.storeName),
  );
  const [storeLogo, setStoreLogo] = useState<string>(() => {
    const fromSnap = vendorHomeSnapshot.storeLogo;
    if (fromSnap.trim()) return fromSnap;
    return readCachedVendorBrandingBySlug(vendorId).storeLogo;
  });
  const [storePhone, setStorePhone] = useState<string>(vendorHomeSnapshot.storePhone);
  const [metaPixelId, setMetaPixelId] = useState<string | undefined>(undefined);
  /** Slide-out nav on small screens (account, browse, wishlist — hamburger on the right like /store). */
  const [vendorMobileNavOpen, setVendorMobileNavOpen] = useState(false);
  /** Full-screen search on mobile — matches main marketplace header search icon. */
  const [vendorMobileSearchOpen, setVendorMobileSearchOpen] = useState(false);
  /** Match /store: in-flow while scrolling down (nav scrolls away); sticky when scrolling up (even 1px). */
  const [vendorNavbarSticky, setVendorNavbarSticky] = useState(false);
  const vendorScrollRootRef = useRef<HTMLDivElement>(null);
  const vendorTabIconSeqRef = useRef(0);
  const cachedProductNameForTitleRef = useRef(
    initialProductSlug ? readCachedVendorProductName(vendorId, initialProductSlug) : null,
  );
  const lastVendorScrollTopRef = useRef(0);
  /** Last `/product/:slug` segment — used to scroll-reset only when entering/changing product, not when leaving to home. */
  const lastVendorProductSlugForScrollRef = useRef<string | undefined>(undefined);
  const [quantity, setQuantity] = useState(1);
  /** Option name → value; mirrors main marketplace variant picker */
  const [vendorVariantSelections, setVendorVariantSelections] = useState<Record<string, string>>({});
  const [vendorProductImageIndex, setVendorProductImageIndex] = useState(0);

  const applyStoreNameIfPresent = useCallback((nextValue: unknown) => {
    if (typeof nextValue !== "string") return;
    const trimmed = resolveVendorStoreDisplayName(vendorId, nextValue).trim();
    if (!trimmed) return;
    setStoreName(trimmed);
  }, [vendorId]);

  const applyMetaPixelFromCatalog = useCallback((payload: { metaPixelId?: string | null } | null | undefined) => {
    setMetaPixelId((prev) => {
      const next = applyMetaPixelIdFromPayload(prev, payload);
      return next;
    });
  }, []);

  useEffect(() => {
    if (!metaPixelId) return;
    initMetaPixel(metaPixelId);
    trackMetaPageView(location.pathname);
  }, [metaPixelId, location.pathname]);

  useEffect(() => {
    if (!metaPixelId || !selectedProduct) return;
    const price =
      typeof selectedProduct.price === "number"
        ? selectedProduct.price
        : parseFloat(String(selectedProduct.price || "").replace(/[^0-9.-]/g, "")) || undefined;
    trackMetaViewContent({
      id: String(selectedProduct.id),
      name: String(selectedProduct.name || selectedProduct.sku || "Product"),
      price: Number.isFinite(price) ? price : undefined,
    });
  }, [metaPixelId, selectedProduct?.id]);

  const isCheckoutRoute = useMemo(
    () => isVendorCheckoutOrSummaryPath(location.pathname, storeBase),
    [location.pathname, storeBase]
  );

  useEffect(() => {
    setShowCheckout(isCheckoutRoute);
  }, [isCheckoutRoute]);

  const wasCheckoutRouteRef = useRef(false);

  const { addToCart, totalItems } = useCart();

  // Product description gallery lightbox (full-screen overlay + prev/next)
  const [descLightboxOpen, setDescLightboxOpen] = useState(false);
  const [lightboxImages, setLightboxImages] = useState<string[]>([]);
  const [lightboxIndex, setLightboxIndex] = useState(0);

  useEffect(() => {
    if (!descLightboxOpen) return;
    const len = lightboxImages.length;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setDescLightboxOpen(false);
        return;
      }
      if (e.key === "ArrowLeft") {
        e.preventDefault();
        setLightboxIndex((i) => Math.max(0, i - 1));
      }
      if (e.key === "ArrowRight" && len > 0) {
        e.preventDefault();
        setLightboxIndex((i) => Math.min(len - 1, i + 1));
      }
    };
    window.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [descLightboxOpen, lightboxImages]);

  // 🔐 User Authentication State
  const [user, setUser] = useState<any>(null);
  const [profileImageLoadFailed, setProfileImageLoadFailed] = useState(false);
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [authMode, setAuthMode] = useState<'login' | 'register'>('login');

  useEffect(() => {
    const onChatNeedsAuth = () => {
      setShowAuthModal(true);
      setAuthMode("login");
    };
    window.addEventListener(MIGOO_OPEN_CUSTOMER_AUTH_FOR_CHAT_EVENT, onChatNeedsAuth);
    return () =>
      window.removeEventListener(MIGOO_OPEN_CUSTOMER_AUTH_FOR_CHAT_EVENT, onChatNeedsAuth);
  }, []);
  const [vendorViewMode, setVendorViewMode] = useState<VendorAccountViewMode>(
    () => profileSegmentToMode(profileSegment ?? null) ?? "storefront"
  );

  useEffect(() => {
    const mode = profileSegmentToMode(profileSegment ?? null);
    if (mode === null) {
      setVendorViewMode("storefront");
    } else {
      setVendorViewMode(mode);
    }
  }, [profileSegment]);

  useLayoutEffect(() => {
    document.title = buildVendorStorefrontDocumentTitle({
      vendorSlug: vendorId,
      pathname: location.pathname,
      storeBase,
      savedPage,
      vendorViewMode,
      profileOrderId,
      selectedProductName:
        selectedProduct?.name ?? cachedProductNameForTitleRef.current,
      categorySegment: normalizedCategorySlugFromRoute || null,
      storeDisplayNameFallback: storeName,
    });

    const logo = typeof storeLogo === "string" ? storeLogo.trim() : "";
    if (logo) {
      const seq = ++vendorTabIconSeqRef.current;
      void applyVendorStoreLogoFavicon(logo).then(() => {
        if (vendorTabIconSeqRef.current !== seq) return;
      });
    }
  }, [
    vendorId,
    location.pathname,
    storeBase,
    savedPage,
    vendorViewMode,
    profileOrderId,
    selectedProduct?.name,
    normalizedCategorySlugFromRoute,
    storeName,
    storeLogo,
  ]);

  useEffect(() => {
    if (savedPage) return;
    if (vendorViewMode !== "storefront") return;
    if (isVendorProductDetailPath) return;

    const next = catalogCategoryForFetch;
    if (String(selectedCategory).trim().toLowerCase() !== String(next).trim().toLowerCase()) {
      setSelectedCategory(next);
    }
  }, [savedPage, vendorViewMode, isVendorProductDetailPath, catalogCategoryForFetch]);

  useEffect(() => {
    const el = vendorScrollRootRef.current;
    if (!el) return;
    lastVendorScrollTopRef.current = el.scrollTop;
    setVendorNavbarSticky(false);

    let raf = 0;
    const onScroll = () => {
      if (raf) return;
      raf = requestAnimationFrame(() => {
        raf = 0;
        const st = el.scrollTop;
        if (st < lastVendorScrollTopRef.current) {
          setVendorNavbarSticky(true);
        } else if (st > lastVendorScrollTopRef.current) {
          setVendorNavbarSticky(false);
        }
        lastVendorScrollTopRef.current = st;
      });
    };

    el.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      el.removeEventListener("scroll", onScroll);
      if (raf) cancelAnimationFrame(raf);
    };
  }, [selectedProduct?.id, vendorViewMode, savedPage]);

  const vendorScrollRebindKey = useMemo(
    () => `${savedPage}-${vendorViewMode}-storefront`,
    [savedPage, vendorViewMode]
  );

  const [authForm, setAuthForm] = useState({
    email: '',
    password: '',
    name: '',
    phone: ''
  });
  const [isAuthLoading, setIsAuthLoading] = useState(false);
  const [profileForm, setProfileForm] = useState({
    name: "",
    email: "",
    phone: "",
    profileImage: null as string | null,
  });
  const [isProfileSaving, setIsProfileSaving] = useState(false);
  const [orderHistory, setOrderHistory] = useState<any[]>([]);
  const [ordersLoading, setOrdersLoading] = useState(false);
  const [ordersError, setOrdersError] = useState<string | null>(null);
  const [shippingAddresses, setShippingAddresses] = useState<MarketplaceAddress[]>([]);
  const [addressForm, setAddressForm] = useState({
    label: "",
    recipientName: "",
    phone: "",
    addressLine1: "",
    addressLine2: "",
    city: "",
    state: "",
    zipCode: "",
    country: "Myanmar",
    isDefault: false,
  });
  const [showAddressForm, setShowAddressForm] = useState(false);
  const [editingAddress, setEditingAddress] = useState<MarketplaceAddress | null>(null);
  const [loadingAddresses, setLoadingAddresses] = useState(false);
  const [passwordForm, setPasswordForm] = useState({
    currentPassword: "",
    newPassword: "",
    confirmPassword: "",
  });
  const [showPasswordFields, setShowPasswordFields] = useState({
    current: false,
    new: false,
    confirm: false,
  });
  const [isChangingPassword, setIsChangingPassword] = useState(false);

  const goToSavedProducts = useCallback(() => {
    if (!user) {
      toast.error(t("storefront.account.signInRequiredToast"));
      setShowAuthModal(true);
      setAuthMode("login");
      return;
    }
    navigate(`${storeBase}/saved`);
  }, [user, navigate, storeBase]);

  const vendorSubnavTabs = useMemo((): VendorSubnavTab[] => {
    return [
      { id: "all" },
      ...subnavCategoryItems.map((category) => ({
        id: "category" as const,
        categoryId: category.id,
        name: category.name,
      })),
      { id: "uncategorized" },
    ];
  }, [subnavCategoryItems]);

  const navigateVendorSubnavTab = useCallback(
    (tab: VendorSubnavTab) => {
      setSelectedProduct(null);
      setSearchQuery("");
      if (tab.id === "all") {
        setSelectedCategory("all");
        navigate(categoryPathForName("all"), { replace: true });
        return;
      }
      if (tab.id === "uncategorized") {
        setSelectedCategory(VENDOR_STORE_UNCATEGORIZED_FILTER);
        navigate(uncategorizedTabPath, { replace: true });
        return;
      }
      setSelectedCategory(tab.name);
      navigate(categoryPathForName(tab.name), { replace: true });
    },
    [navigate, categoryPathForName, uncategorizedTabPath]
  );

  const renderStorefrontLanguageMenu = useCallback(() => {
    const shortLabel = language === "my" ? "မြန်" : "EN";
    const optionClass = "flex cursor-pointer items-center justify-between gap-3 rounded-md px-3 py-2 text-sm";

    return (
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            className="h-9 w-10 shrink-0 rounded-full px-0 text-xs font-semibold text-slate-700 hover:bg-slate-100 md:h-10 md:w-auto md:px-3"
            aria-label={t("storefront.language")}
            title={t("storefront.language")}
          >
            {shortLabel}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-44 p-1">
          <DropdownMenuItem className={optionClass} onClick={() => setLanguage("en")}>
            <span>{t("language.english")}</span>
            {language === "en" ? <Check className="h-4 w-4 text-amber-600" /> : null}
          </DropdownMenuItem>
          <DropdownMenuItem className={optionClass} onClick={() => setLanguage("my")}>
            <span>{t("language.burmese")}</span>
            {language === "my" ? <Check className="h-4 w-4 text-amber-600" /> : null}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    );
  }, [language, setLanguage, t]);

  /** Desktop-only category subnav — fills the row first, then More when it overflows. */
  const renderVendorStorefrontSubnav = useCallback(() => {
    if (vendorViewMode !== "storefront" || savedPage) return null;

    return (
      <VendorStorefrontSubnav
        tabs={vendorSubnavTabs}
        routeSlug={normalizedCategorySlugFromRoute}
        storePhone={storePhone}
        telHref={telHrefFromDisplay(storePhone)}
        viberHref={viberHrefFromDisplay(storePhone)}
        showPhone={!isPlaceholderVendorPhone(storePhone)}
        onTabSelect={navigateVendorSubnavTab}
      />
    );
  }, [
    vendorViewMode,
    savedPage,
    vendorSubnavTabs,
    normalizedCategorySlugFromRoute,
    storePhone,
    navigateVendorSubnavTab,
  ]);

  /** Pass 'register' from handleRegister before setUser; cleared after track. */
  const lastAuthEventRef = useRef<"login" | "register" | null>(null);
  const audienceTrackedKeyRef = useRef<string>("");

  const trackVendorAudience = useCallback(
    async (userData: any, event: "login" | "register") => {
      if (!vendorId || !userData?.id) return;
      try {
        let avatar: string | undefined;
        for (const c of [
          userData?.profileImageUrl,
          userData?.avatarUrl,
          userData?.avatar,
          userData?.profileImage,
        ]) {
          if (typeof c === "string" && c.trim().startsWith("http")) {
            avatar = c.trim();
            break;
          }
        }
        const res = await fetch(
          `https://${projectId}.supabase.co/functions/v1/make-server-16010b6f/vendor/audience/${vendorId}/track`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${publicAnonKey}`,
            },
            body: JSON.stringify({
              email: String(userData.email || "").trim(),
              userId: userData.id,
              name: userData.name || userData.fullName,
              phone: userData.phone,
              avatar,
              event,
            }),
          }
        );
        if (res.ok) {
          const data = await res.json().catch(() => ({}));
          const vendorIds = [
            vendorId,
            canonicalVendorId,
            data?.vendorId,
            data?.storeSlug,
          ].filter((v): v is string => typeof v === "string" && !!v.trim());
          notifyStorefrontCustomerRegistered({
            userId: String(userData.id),
            vendorIds: [...new Set(vendorIds)],
            event,
          });
        }
      } catch (e) {
        console.warn("[VendorStore] audience track failed:", e);
      }
    },
    [vendorId, canonicalVendorId]
  );

  // Register this global account with this vendor when the user session is available (login/register or return visit).
  useEffect(() => {
    if (!user?.id || !vendorId) return;
    const key = `${vendorId}::${user.id}`;
    if (audienceTrackedKeyRef.current === key) return;
    audienceTrackedKeyRef.current = key;
    const ev = lastAuthEventRef.current;
    lastAuthEventRef.current = null;
    void trackVendorAudience(user, ev || "login");
  }, [user, vendorId, trackVendorAudience]);

  // Load user from localStorage on mount
  useEffect(() => {
    const storedUser = localStorage.getItem('migoo-user');
    if (storedUser) {
      try {
        const parsed = JSON.parse(storedUser) as Record<string, unknown>;
        const uid = resolveUserIdFromRecord(parsed);
        if (!uid) {
          localStorage.removeItem('migoo-user');
          return;
        }
        const normalized = normalizeCustomerSessionUser({ ...parsed, id: uid });
        if (normalized) {
          setUser(normalized);
          persistMigooUserSession(normalized);
        }
      } catch (error) {
        console.error('Error parsing stored user:', error);
        localStorage.removeItem('migoo-user');
      }
    }
  }, []);

  // Profile routes require a customer session — open sign-in when visiting while logged out.
  useEffect(() => {
    if (!isVendorProfileProtectedRoute(vendorViewMode, profileOrderId)) return;
    if (hasVendorCustomerSession(user)) return;
    toast.error(t("storefront.account.signInRequiredToast"));
    setShowAuthModal(true);
    setAuthMode("login");
  }, [vendorViewMode, profileOrderId, user]);

  useEffect(() => {
    if (!user) return;
    setProfileForm({
      name: user.name || "",
      email: getCustomerDisplayEmail(user) || user.email || "",
      phone: resolveCustomerPhone(user) || user.phone || "",
      profileImage: null,
    });
  }, [user]);

  const vendorProfileAmbientLastRef = useRef(0);
  const vendorProfileRefreshInFlightRef = useRef(false);

  const refreshVendorProfileFromServer = useCallback(async (opts?: { force?: boolean }) => {
    const force = opts?.force === true;
    const storedUser = localStorage.getItem("migoo-user");
    if (!storedUser) return;
    let parsedUser: any;
    try {
      parsedUser = JSON.parse(storedUser);
    } catch {
      return;
    }
    const uid = resolveUserIdFromRecord(parsedUser);
    if (!uid) return;

    const now = Date.now();
    if (
      !force &&
      now - vendorProfileAmbientLastRef.current < AMBIENT_AUTH_PROFILE_REFRESH_MIN_MS
    ) {
      return;
    }
    if (
      !force &&
      wasVendorUserProfileRefreshedRecently(uid, AMBIENT_AUTH_PROFILE_REFRESH_MIN_MS)
    ) {
      vendorProfileAmbientLastRef.current = now;
      return;
    }
    if (vendorProfileRefreshInFlightRef.current) {
      return;
    }
    vendorProfileRefreshInFlightRef.current = true;
    try {
      const response: any = await authApi.getProfile(uid);
      const freshProfile = response?.user || response;
      if (!freshProfile || typeof freshProfile !== "object" || Array.isArray(freshProfile)) {
        return;
      }
      if (!freshProfile.id && !getCustomerDisplayEmail(freshProfile) && !resolveCustomerPhone(freshProfile)) {
        return;
      }
      const localBase =
        normalizeCustomerSessionUser({ ...(parsedUser as Record<string, unknown>), id: uid }) ??
        ({ ...(parsedUser as object), id: uid } as Record<string, unknown>);
      const updatedUser = applyServerProfileMerge(localBase, freshProfile);
      setUser(updatedUser);
      persistMigooUserSession(updatedUser);
      vendorProfileAmbientLastRef.current = Date.now();
      markVendorUserProfileRefreshed(uid);
    } catch (error: unknown) {
      // Deleted/disabled users must be signed out from storefront account views.
      if (error instanceof ApiError && [401, 403, 404].includes(Number(error.statusCode))) {
        setUser(null);
        localStorage.removeItem("migoo-user");
        notifyMigooUserSessionChanged();
        return;
      }
      /* keep local session if profile refresh fails — do not advance throttle */
    } finally {
      vendorProfileRefreshInFlightRef.current = false;
    }
  }, []);

  const profileRefreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const scheduleVendorProfileRefresh = useCallback(() => {
    if (profileRefreshTimerRef.current) {
      clearTimeout(profileRefreshTimerRef.current);
    }
    profileRefreshTimerRef.current = setTimeout(() => {
      profileRefreshTimerRef.current = null;
      void refreshVendorProfileFromServer();
    }, 600);
  }, [refreshVendorProfileFromServer]);

  const profileHydrateAttemptedRef = useRef<string | null>(null);
  useEffect(() => {
    if (vendorViewMode !== "view-profile" && vendorViewMode !== "edit-profile") return;
    const uid = resolveUserIdFromRecord(user);
    if (!uid || resolveCustomerPhone(user)) return;
    if (profileHydrateAttemptedRef.current === uid) return;
    profileHydrateAttemptedRef.current = uid;
    void refreshVendorProfileFromServer({ force: true });
  }, [vendorViewMode, user, refreshVendorProfileFromServer]);

  useEffect(() => {
    scheduleVendorProfileRefresh();
    return () => {
      if (profileRefreshTimerRef.current) {
        clearTimeout(profileRefreshTimerRef.current);
      }
    };
  }, [scheduleVendorProfileRefresh]);

  // Keep storefront account session honest after super-admin customer deletes/blocks.
  useEffect(() => {
    const uid = resolveUserIdFromRecord(user);
    if (!uid) return;
    const validateCurrentSession = async () => {
      try {
        await authApi.getProfile(uid);
      } catch (error: unknown) {
        if (error instanceof ApiError && [401, 403, 404].includes(Number(error.statusCode))) {
          setUser(null);
          localStorage.removeItem("migoo-user");
          notifyMigooUserSessionChanged();
        }
      }
    };
    const unsubscribe = subscribeCustomerRealtime(() => {
      void validateCurrentSession();
    });
    return () => unsubscribe();
  }, [user]);

  useEffect(() => {
    const syncFromStorage = () => {
      const raw = localStorage.getItem("migoo-user");
      if (!raw) {
        setUser(null);
        return;
      }
      try {
        const parsed = JSON.parse(raw) as Record<string, unknown>;
        const uid = resolveUserIdFromRecord(parsed);
        if (!uid) {
          setUser(null);
          return;
        }
        const normalized = normalizeCustomerSessionUser({ ...(parsed as object), id: uid });
        if (normalized) setUser(normalized);
      } catch {
        setUser(null);
        return;
      }
      /* One debounced profile GET; respects AMBIENT throttle — avoids stacking calls on login/save/cross-tab */
      scheduleVendorProfileRefresh();
    };

    const onSession = () => syncFromStorage();
    window.addEventListener(MIGOO_USER_SESSION_CHANGED_EVENT, onSession);

    const onStorage = (e: StorageEvent) => {
      if (e.storageArea !== localStorage || e.key !== "migoo-user") return;
      syncFromStorage();
    };
    window.addEventListener("storage", onStorage);

    return () => {
      window.removeEventListener(MIGOO_USER_SESSION_CHANGED_EVENT, onSession);
      window.removeEventListener("storage", onStorage);
    };
  }, [scheduleVendorProfileRefresh]);

  const profileSaveCompletedRef = useRef(false);

  const prevPathForProfileExitRef = useRef<string>("");
  useEffect(() => {
    const path = location.pathname;
    const wasEdit = prevPathForProfileExitRef.current.includes("/profile/edit");
    prevPathForProfileExitRef.current = path;
    if (wasEdit && !path.includes("/profile/edit") && profileSaveCompletedRef.current) {
      profileSaveCompletedRef.current = false;
      void refreshVendorProfileFromServer({ force: true });
    }
  }, [location.pathname, refreshVendorProfileFromServer]);

  // Same as Storefront: cache key `migoo-shipping-addresses-${userId}` + GET/POST customers/:id/addresses
  useEffect(() => {
    const uid = resolveUserIdFromRecord(user);
    if (!uid) {
      setShippingAddresses([]);
      return;
    }
    const onAddresses =
      vendorViewMode === "shipping-addresses" || profileSegment === "addresses";
    if (!onAddresses) return;

    const storageKey = `migoo-shipping-addresses-${uid}`;
    try {
      const cachedAddresses = localStorage.getItem(storageKey);
      if (cachedAddresses) {
        const parsed = JSON.parse(cachedAddresses);
        if (Array.isArray(parsed) && parsed.length > 0) {
          setShippingAddresses(parsed);
        }
      }
    } catch (e) {
      console.error("Failed to load addresses from localStorage:", e);
    }

    const loadAddresses = async () => {
      setLoadingAddresses(true);
      try {
        const response = await fetch(
          `https://${projectId}.supabase.co/functions/v1/make-server-16010b6f/customers/${uid}/addresses`,
          {
            headers: {
              Authorization: `Bearer ${publicAnonKey}`,
            },
          }
        );

        if (response.ok) {
          const data = await response.json();
          const addresses = data.addresses || [];
          setShippingAddresses(addresses);
          localStorage.setItem(storageKey, JSON.stringify(addresses));
        }
      } catch (error) {
        console.error("Failed to load addresses from database:", error);
        toast.error(t("storefront.account.failedToLoadAddresses"));
      } finally {
        setLoadingAddresses(false);
      }
    };

    void loadAddresses();
  }, [vendorViewMode, profileSegment, user]);

  useEffect(() => {
    const uid = user?.id;
    if (!uid) {
      setOrderHistory([]);
      setOrdersError(null);
      setOrdersLoading(false);
      return;
    }
    const needsOrders =
      vendorViewMode === "order-history" ||
      vendorViewMode === "view-profile" ||
      profileSegment === "view" ||
      profileSegment === "orders" ||
      Boolean(profileOrderId);
    if (!needsOrders) return;

    const key = CACHE_KEYS.customerOrders(uid);
    const cached = moduleCache.peek<any[]>(key);
    if (cached && Array.isArray(cached)) {
      setOrderHistory(cached);
      setOrdersLoading(false);
    } else {
      setOrdersLoading(true);
    }

    let cancelled = false;
    setOrdersError(null);

    void moduleCache
      .get(key, () => fetchCustomerOrdersList(uid), true)
      .then((orders) => {
        if (cancelled) return;
        setOrderHistory(dedupeOrdersByCanonical(orders));
        setOrdersError(null);
      })
      .catch((error) => {
        console.error("Failed to load vendor storefront order history:", error);
        if (cancelled) return;
        const msg = error instanceof Error ? error.message : "Failed to load orders";
        setOrdersError(msg);
        if (!cached || !Array.isArray(cached)) {
          setOrderHistory([]);
        }
        if (vendorViewMode === "order-history") {
          toast.error(t("storefront.account.errorLoadingOrders"));
        }
      })
      .finally(() => {
        if (!cancelled) setOrdersLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [vendorViewMode, profileSegment, profileOrderId, user?.id]);

  // Realtime sync for profile order history: reflects admin delete/update instantly.
  useEffect(() => {
    const uid = user?.id;
    if (!uid) return;
    let debounce: ReturnType<typeof setTimeout> | undefined;
    const refreshOrders = () => {
      window.clearTimeout(debounce);
      debounce = window.setTimeout(() => {
        const key = CACHE_KEYS.customerOrders(uid);
        void moduleCache
          .get(key, () => fetchCustomerOrdersList(uid), true)
          .then((orders) => {
            setOrderHistory(dedupeOrdersByCanonical(orders));
          })
          .catch(() => {});
      }, 260);
    };
    const onCustomerOrdersUpdated = (event: Event) => {
      const detail = (event as CustomEvent<{ userId?: string }>).detail;
      if (String(detail?.userId || "").trim() !== String(uid).trim()) return;
      refreshOrders();
    };
    window.addEventListener("adminOrdersUpdated", refreshOrders);
    window.addEventListener("customerOrdersUpdated", onCustomerOrdersUpdated as EventListener);
    return () => {
      window.clearTimeout(debounce);
      window.removeEventListener("adminOrdersUpdated", refreshOrders);
      window.removeEventListener("customerOrdersUpdated", onCustomerOrdersUpdated as EventListener);
    };
  }, [user?.id]);

  // 🔐 Authentication Handlers
  const handleLogin = async () => {
    if (!authForm.email || !authForm.password) {
      toast.error(t("storefront.account.loginRequiredFields"));
      return;
    }

    setIsAuthLoading(true);
    try {
      const response = await authApi.login(authForm.email, authForm.password);
      const userData = response.user;

      lastAuthEventRef.current = "login";
      const sessionUser = buildCustomerSessionFromAuthResponse(
        userData as Record<string, unknown>,
        { loginIdentifier: authForm.email.trim() }
      );
      if (!sessionUser) throw new Error("Login failed");
      setUser(sessionUser);
      persistMigooUserSession(sessionUser);
      notifyMigooUserSessionChanged();

      toast.success(t("storefront.account.welcomeBack").replace("{name}", userData.name || userData.email || ""));
      setShowAuthModal(false);
      setAuthForm({ email: '', password: '', name: '', phone: '' });
    } catch (error) {
      console.error("Login failed:", error);
      toast.error(error instanceof Error ? error.message : t("storefront.account.loginFailed"));
    } finally {
      setIsAuthLoading(false);
    }
  };

  const handleRegister = async (profileImage?: string) => {
    if (!authForm.password || !authForm.name || !authForm.phone.trim()) {
      toast.error(t("storefront.account.registerRequiredFields"));
      return;
    }

    setIsAuthLoading(true);
    try {
      const response = await authApi.register(
        authForm.email.trim() || undefined,
        authForm.password,
        authForm.name,
        authForm.phone.trim(),
        profileImage
      );
      const userData = response.user;

      lastAuthEventRef.current = "register";
      const sessionUser = buildCustomerSessionFromAuthResponse(
        userData as Record<string, unknown>,
        { phone: authForm.phone.trim(), loginIdentifier: authForm.phone.trim() }
      );
      if (!sessionUser) throw new Error("Registration failed");
      setUser(sessionUser);
      persistMigooUserSession(sessionUser);
      notifyMigooUserSessionChanged();

      toast.success(
        t("storefront.account.welcomeToStore")
          .replace("{storeName}", storeName)
          .replace("{name}", userData.name || "")
      );
      setShowAuthModal(false);
      setAuthForm({ email: '', password: '', name: '', phone: '' });
    } catch (error) {
      console.error("Registration failed:", error);
      toast.error(error instanceof Error ? error.message : t("storefront.account.registrationFailed"));
    } finally {
      setIsAuthLoading(false);
    }
  };

  const handleLogout = () => {
    audienceTrackedKeyRef.current = "";
    setUser(null);
    localStorage.removeItem('migoo-user');
    notifyMigooUserSessionChanged();
    navigateStoreHome();
    toast.success(t("storefront.account.logout"));
  };

  const getUserProfileImageUrl = (u: any): string => {
    const rawCandidates = [u?.profileImageUrl, u?.avatarUrl, u?.avatar, u?.profileImage];
    for (const candidate of rawCandidates) {
      if (!candidate || typeof candidate !== "string") continue;
      const value = candidate.trim();
      if (!value) continue;

      if (
        value.startsWith("http://") ||
        value.startsWith("https://") ||
        value.startsWith("data:image/") ||
        value.startsWith("blob:")
      ) {
        return value;
      }

      if (value.startsWith("/storage/")) {
        return `https://${projectId}.supabase.co${value}`;
      }

      if (value.startsWith("storage/")) {
        return `https://${projectId}.supabase.co/${value}`;
      }
    }
    return "";
  };

  const userProfileImageUrl = useMemo(
    () => withVendorProfileImageCacheBust(user, getUserProfileImageUrl(user)),
    [user]
  );

  useEffect(() => {
    setProfileImageLoadFailed(false);
  }, [userProfileImageUrl]);

  const vendorEditProfilePhotoInputRef = useRef<HTMLInputElement>(null);

  const handleVendorEditProfilePhotoChange = useCallback(
    async (e: ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      e.target.value = "";
      if (!file) return;

      toast.loading(t("storefront.account.compressingImage"), { id: "compress" });

      try {
        const compressImage = (f: File, maxSizeKB: number = 400): Promise<string> => {
          return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = (event) => {
              const img = new Image();
              img.onload = () => {
                const canvas = document.createElement("canvas");
                const ctx = canvas.getContext("2d");
                if (!ctx) {
                  reject(new Error("Canvas not supported"));
                  return;
                }

                let width = img.width;
                let height = img.height;

                const maxDimension = 2048;
                if (width > maxDimension || height > maxDimension) {
                  if (width > height) {
                    height = (height * maxDimension) / width;
                    width = maxDimension;
                  } else {
                    width = (width * maxDimension) / height;
                    height = maxDimension;
                  }
                }

                canvas.width = width;
                canvas.height = height;
                ctx.drawImage(img, 0, 0, width, height);

                let quality = 0.9;
                let dataUrl = "";
                let iterations = 0;
                const maxIterations = 10;

                const compress = () => {
                  dataUrl = canvas.toDataURL("image/jpeg", quality);
                  const sizeKB = Math.round((dataUrl.length * 3) / 4 / 1024);

                  if (sizeKB > maxSizeKB && quality > 0.1 && iterations < maxIterations) {
                    quality -= 0.1;
                    iterations++;
                    compress();
                  } else {
                    resolve(dataUrl);
                  }
                };

                compress();
              };
              img.onerror = () => reject(new Error("Failed to load image"));
              img.src = event.target?.result as string;
            };
            reader.onerror = () => reject(new Error("Failed to read file"));
            reader.readAsDataURL(f);
          });
        };

        const compressedDataUrl = await compressImage(file, 400);
        setProfileForm((prev) => ({ ...prev, profileImage: compressedDataUrl }));

        toast.dismiss("compress");
      } catch (error) {
        console.error("Image compression error:", error);
      toast.error(t("storefront.account.imageProcessFailed"), { id: "compress" });
      }
    },
    []
  );

  const handleSaveProfile = async () => {
    const uid = resolveUserIdFromRecord(user);
    if (!uid) {
      toast.error(t("storefront.account.signInRequiredToast"));
      return;
    }

    setIsProfileSaving(true);
    try {
      const payload: Record<string, unknown> = {
        name: profileForm.name,
        phone: profileForm.phone,
        email: profileForm.email.trim(),
      };
      if (profileForm.profileImage) {
        payload.profileImage = profileForm.profileImage;
      }

      const response = await fetch(
        `https://${projectId}.supabase.co/functions/v1/make-server-16010b6f/auth/profile/${uid}`,
        {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${publicAnonKey}`,
          },
          body: JSON.stringify(payload),
        }
      );

      const raw = await response.text();
      let data: { success?: boolean; user?: unknown; error?: string } = {};
      try {
        data = raw ? (JSON.parse(raw) as typeof data) : {};
      } catch {
        /* ignore */
      }

      if (!response.ok) {
        const msg = data.error || raw?.slice(0, 200) || "Failed to update profile";
        throw new Error(msg);
      }

      if (data.success && data.user && typeof data.user === "object") {
        const mergedUser = buildCustomerSessionFromAuthResponse(data.user, {
          phone: profileForm.phone.trim(),
          email: profileForm.email.trim(),
        });
        if (!mergedUser) throw new Error("Failed to update profile");
        setUser(mergedUser);
        persistMigooUserSession(mergedUser);
        notifyMigooUserSessionChanged();
        invalidateAdminCustomersCache();
        toast.success(t("profile.updated"));
        profileSaveCompletedRef.current = true;
        goToProfileMode("view-profile");
      } else {
        throw new Error(data.error || "Failed to update profile");
      }
    } catch (error) {
      console.error("Error updating profile:", error);
      toast.error(error instanceof Error ? error.message : t("storefront.account.updateProfileFailed"));
    } finally {
      setIsProfileSaving(false);
    }
  };

  const handleChangePassword = async () => {
    const authEmail = resolveCustomerAuthEmail(user);
    if (!authEmail) {
      toast.error(t("storefront.account.signInRequiredToast"));
      return;
    }
    if (!passwordForm.currentPassword || !passwordForm.newPassword || !passwordForm.confirmPassword) {
      toast.error(t("storefront.account.requiredFields"));
      return;
    }
    if (passwordForm.newPassword !== passwordForm.confirmPassword) {
      toast.error(t("auth.resetPassword.passwordMismatch"));
      return;
    }
    if (passwordForm.newPassword.length < 6) {
      toast.error(t("storefront.account.passwordTooShort"));
      return;
    }

    setIsChangingPassword(true);
    try {
      await authApi.changePassword(authEmail, passwordForm.currentPassword, passwordForm.newPassword);
      toast.success(t("auth.resetPassword.successMessage"));
      setPasswordForm({
        currentPassword: "",
        newPassword: "",
        confirmPassword: "",
      });
      setShowPasswordFields({ current: false, new: false, confirm: false });
    } catch (error) {
      console.error("Failed to change password:", error);
      toast.error(error instanceof Error ? error.message : t("storefront.account.changePasswordFailed"));
    } finally {
      setIsChangingPassword(false);
    }
  };

  const handleProfileAction = (mode: VendorAccountViewMode) => {
    setSelectedProduct(null);
    setVendorMobileNavOpen(false);
    goToProfileMode(mode);
  };

  const closeVendorMobileNav = useCallback(() => setVendorMobileNavOpen(false), []);

  const handleVendorSearchInputChange = useCallback((value: string) => {
    setSearchQuery(value);
  }, []);

  const commitVendorSearch = useCallback(() => {
    const raw = searchQuery.trim();
    setDebouncedVendorServerQ(
      raw.length >= VENDOR_SEARCH_MIN_SERVER_CHARS ? raw : ""
    );
    if (!raw) return;
    if (isVendorProductDetailPath || selectedProduct) {
      setSelectedProduct(null);
      setSelectedCategory("all");
      navigateStoreHome();
    }
    setVendorMobileNavOpen(false);
    setVendorMobileSearchOpen(false);
  }, [
    isVendorProductDetailPath,
    navigateStoreHome,
    searchQuery,
    selectedProduct,
  ]);

  const handleVendorSearchKeyDown = useCallback(
    (e: KeyboardEvent<HTMLInputElement>) => {
      if (e.key !== "Enter") return;
      e.preventDefault();
      commitVendorSearch();
    },
    [commitVendorSearch]
  );

  const openVendorProductFromSearch = useCallback(
    (product: Product) => {
      setSearchQuery("");
      setDebouncedVendorServerQ("");
      setVendorMobileNavOpen(false);
      setVendorMobileSearchOpen(false);
      const segment = buildVendorProductUrlSegment(product);
      navigate(`${storeBase}/product/${encodeURIComponent(segment)}`, {
        state: { vendorProduct: product },
      });
    },
    [navigate, storeBase]
  );

  const selectAllProductsNav = useCallback(() => {
    setSearchQuery("");
    setSelectedCategory("all");
    setSelectedProduct(null);
    navigate(categoryPathForName("all"));
    closeVendorMobileNav();
  }, [navigate, categoryPathForName, closeVendorMobileNav]);

  const selectVendorCategoryNav = useCallback(
    (categoryName: string) => {
      setSelectedProduct(null);
      setSelectedCategory(categoryName);
      navigate(categoryPathForName(categoryName));
      closeVendorMobileNav();
    },
    [navigate, categoryPathForName, closeVendorMobileNav]
  );

  const renderVendorMobileNavDrawer = () => {
    if (!vendorMobileNavOpen) return null;
    const showCategoryNav = vendorViewMode === "storefront" && !savedPage;
    return (
      <>
        <div
          className="fixed inset-0 bg-black/50 md:hidden"
          style={{ zIndex: 55 }}
          onClick={(e) => {
            e.stopPropagation();
            closeVendorMobileNav();
          }}
          aria-hidden
        />
        <div
          className="fixed left-0 top-0 h-full w-80 max-w-[min(20rem,100vw)] bg-white shadow-2xl md:hidden flex flex-col overflow-hidden"
          style={{ zIndex: 60 }}
          onClick={(e) => e.stopPropagation()}
          role="dialog"
          aria-modal="true"
          aria-label={t("storefront.account.storeMenu")}
        >
          <div className="flex items-center justify-between gap-3 p-4 border-b border-slate-200">
            <div className="min-w-0 flex-1 flex items-center gap-3">
              {storeLogo ? (
                <CacheFriendlyImg
                  src={storeLogo}
                  alt=""
                  logo
                  className="w-11 h-11 rounded-xl object-cover ring-2 ring-slate-100 shrink-0"
                />
              ) : (
                <div className="w-11 h-11 bg-slate-900 rounded-xl flex items-center justify-center shrink-0">
                  <Store className="w-5 h-5 text-white" />
                </div>
              )}
              <p className="text-base font-bold text-slate-900 break-words leading-snug">
                {storeName}
              </p>
            </div>
            <Button
              variant="ghost"
              size="icon"
              onClick={closeVendorMobileNav}
              className="hover:bg-slate-100 rounded-full shrink-0"
              aria-label={t("storefront.closeMenu")}
            >
              <X className="w-5 h-5" />
            </Button>
          </div>

          <div className="flex-1 overflow-y-auto [scrollbar-width:thin] [&::-webkit-scrollbar]:w-1 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:bg-slate-300 [&::-webkit-scrollbar-thumb]:rounded-full">
          <div className="p-4 space-y-3">
            <div className="relative">
              <div className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 flex h-7 w-7 items-center justify-center rounded-full bg-white/90 shadow-sm ring-1 ring-slate-200/70">
                <Search className="w-4 h-4 text-slate-400" />
              </div>
              <Input
                placeholder={t("storefront.search.placeholder")}
                value={searchQuery}
                onChange={(e) => handleVendorSearchInputChange(e.target.value)}
                onKeyDown={handleVendorSearchKeyDown}
                className="pl-4 pr-12 h-11 rounded-full border-slate-200/90 bg-gradient-to-r from-slate-50 to-white shadow-sm transition-all focus-visible:border-violet-300 focus-visible:ring-violet-200/70"
              />
            </div>

            <Separator />

            {!user ? (
              <Button
                variant="outline"
                className="w-full justify-start hover:bg-slate-50"
                onClick={() => {
                  closeVendorMobileNav();
                  setShowAuthModal(true);
                  setAuthMode("login");
                }}
              >
                <User className="w-4 h-4 mr-2 shrink-0" />
                {t("storefront.loginRegister")}
              </Button>
            ) : (
              <div className="space-y-2 pt-1">
                <div className="flex items-center gap-3 p-3 border border-slate-200 rounded-lg">
                  {userProfileImageUrl && !profileImageLoadFailed ? (
                    <CacheFriendlyImg
                      src={userProfileImageUrl}
                      alt={user.name}
                      className="w-10 h-10 rounded-full object-cover shrink-0"
                      onError={() => setProfileImageLoadFailed(true)}
                    />
                  ) : (
                    <div className="w-10 h-10 rounded-full bg-gradient-to-br from-amber-500 to-orange-600 flex items-center justify-center shrink-0">
                      <User className="w-5 h-5 text-white" />
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-slate-900 truncate">{user.name}</p>
                    <p className="text-xs text-slate-600 truncate">{user.email}</p>
                  </div>
                </div>
                <Button
                  variant="outline"
                  className="w-full justify-start hover:bg-slate-50"
                  onClick={() => handleProfileAction("view-profile")}
                >
                  <Eye className="w-4 h-4 mr-2" />
                  {t("storefront.account.viewProfile")}
                </Button>
              </div>
            )}

            {showCategoryNav ? (
              <>
                <Separator />
                <p className="text-sm font-semibold text-slate-600">{t("storefront.categories.browse")}</p>
                <Button
                  variant="ghost"
                  className={`w-full justify-start hover:bg-slate-50 ${
                    isVendorCategoryTabActive("all", normalizedCategorySlugFromRoute)
                      ? "bg-slate-100 font-semibold text-slate-900"
                      : ""
                  }`}
                  onClick={selectAllProductsNav}
                >
                  {t("storefront.categories.all")}
                </Button>
                {subnavCategoryItems.map((category) => (
                  <Button
                    key={category.id}
                    variant="ghost"
                    className={`w-full justify-start hover:bg-slate-50 ${
                      isVendorCategoryTabActive(category, normalizedCategorySlugFromRoute)
                        ? "bg-slate-100 font-semibold text-slate-900"
                        : ""
                    }`}
                    onClick={() => selectVendorCategoryNav(category.name)}
                  >
                    {category.name}
                  </Button>
                ))}
                <Button
                  variant="ghost"
                  className={`w-full justify-start hover:bg-slate-50 ${
                    isVendorCategoryTabActive("uncategorized", normalizedCategorySlugFromRoute)
                      ? "bg-slate-100 font-semibold text-slate-900"
                      : ""
                  }`}
                  onClick={() => {
                    setSelectedProduct(null);
                    setSearchQuery("");
                    setSelectedCategory(VENDOR_STORE_UNCATEGORIZED_FILTER);
                    navigate(uncategorizedTabPath, { replace: true });
                  }}
                >
                  {t("storefront.categories.uncategorized")}
                </Button>
              </>
            ) : vendorViewMode === "storefront" ? (
              <>
                <Separator />
                <Button variant="ghost" className="w-full justify-start" onClick={selectAllProductsNav}>
                  {t("storefront.backToShop")}
                </Button>
              </>
            ) : null}
          </div>
          </div>
          <div className="mt-auto border-t border-slate-200 p-4 space-y-2 bg-white">
            {!isPlaceholderVendorPhone(storePhone) ? (
              <div className="rounded-md border border-slate-200 bg-white p-3">
                <div className="mb-2 flex items-center gap-2 text-sm font-medium text-slate-700">
                  <Phone className="w-4 h-4 shrink-0 text-amber-600" />
                  <span className="truncate">{storePhone}</span>
                </div>
                <p className="mb-2 text-xs text-slate-500">{t("storefront.contact.chooseDestination")}</p>
                <div className="grid grid-cols-2 gap-2">
                  <a
                    href={telHrefFromDisplay(storePhone)}
                    className="rounded-md bg-slate-900 px-3 py-2 text-center text-xs font-semibold text-white hover:bg-slate-800"
                    onClick={closeVendorMobileNav}
                  >
                    {t("storefront.contact.dial")}
                  </a>
                  <a
                    href={viberHrefFromDisplay(storePhone)}
                    className="rounded-md bg-violet-600 px-3 py-2 text-center text-xs font-semibold text-white hover:bg-violet-700"
                    onClick={closeVendorMobileNav}
                  >
                    {t("storefront.contact.viber")}
                  </a>
                </div>
              </div>
            ) : null}
            {user ? (
              <Button
                variant="outline"
                className="w-full justify-start text-red-600 border-red-200 hover:bg-red-50"
                onClick={() => {
                  closeVendorMobileNav();
                  handleLogout();
                }}
              >
                <LogOut className="w-4 h-4 mr-2" />
                {t("storefront.account.logout")}
              </Button>
            ) : null}
          </div>
        </div>
      </>
    );
  };

  const renderVendorMobileSearchOverlay = () => {
    if (!vendorMobileSearchOpen) return null;
    return (
      <div
        className="fixed inset-0 bg-white z-[70] md:hidden flex flex-col"
        role="dialog"
        aria-modal="true"
        aria-label={t("storefront.searchProducts")}
      >
        <div className="flex items-center gap-2 p-4 border-b border-slate-200 shrink-0">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setVendorMobileSearchOpen(false)}
            className="hover:bg-slate-100 rounded-full shrink-0"
            aria-label={t("storefront.closeSearch")}
          >
            <X className="w-5 h-5" />
          </Button>
          <div className="relative flex-1 min-w-0">
            <div className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 flex h-7 w-7 items-center justify-center rounded-full bg-white shadow-sm ring-1 ring-slate-200/80">
              <Search className="w-4 h-4 text-slate-400" />
            </div>
            <Input
              placeholder={t("storefront.search.placeholder")}
              value={searchQuery}
              onChange={(e) => handleVendorSearchInputChange(e.target.value)}
              onKeyDown={handleVendorSearchKeyDown}
              className="pl-4 pr-12 h-11 rounded-full border-slate-200 bg-gradient-to-r from-slate-50 to-white shadow-sm w-full transition-all focus-visible:border-violet-300 focus-visible:ring-violet-200/70"
              autoFocus
            />
          </div>
        </div>
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {searchQuery.trim() ? (
            <>
              {products
                .filter((p) => productMatchesVendorClientSearch(p, searchQuery))
                .slice(0, VENDOR_SEARCH_PREVIEW_LIMIT)
                .map((product) => (
                  <button
                    key={product.id}
                    type="button"
                    onClick={() => openVendorProductFromSearch(product)}
                    className="flex w-full items-center gap-3 rounded-xl border border-slate-200 p-3 text-left hover:bg-slate-50 transition-colors"
                  >
                    {product.images?.[0] ? (
                      <CacheFriendlyImg
                        src={product.images[0]}
                        alt=""
                        className="h-12 w-12 rounded-lg object-cover shrink-0"
                      />
                    ) : (
                      <div className="h-12 w-12 rounded-lg bg-slate-100 shrink-0" />
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-slate-900 line-clamp-2">{product.name}</p>
                      {product.sku ? (
                        <p className="text-xs text-slate-500 mt-0.5">{product.sku}</p>
                      ) : null}
                    </div>
                  </button>
                ))}
              <p className="text-sm text-slate-500 pt-2">
                {products.some((p) => productMatchesVendorClientSearch(p, searchQuery))
                  ? t("storefront.search.enterHint")
                  : `${t("storefront.search.noMatches")} ${t("storefront.search.enterHint")}`}
              </p>
            </>
          ) : (
            <p className="text-sm text-slate-500">
              {t("storefront.search.typeHint")}
            </p>
          )}
        </div>
      </div>
    );
  };

  const renderVendorAccountPage = () => {
    if (vendorViewMode === "storefront") return null;

    if (!user) {
      return (
        <div className="max-w-md mx-auto w-full py-8 sm:py-12">
          <Card>
            <CardContent className="py-12 text-center space-y-6">
              <UserCircle className="w-16 h-16 text-slate-300 mx-auto" />
              <div>
                <h2 className="text-xl font-bold text-slate-900">{t("storefront.account.signInRequired")}</h2>
                <p className="text-slate-600 mt-2 text-sm">
                  {t("storefront.account.signInRequiredDescription")}
                </p>
              </div>
              <div className="flex flex-col sm:flex-row gap-3 justify-center">
                <Button
                  className="bg-slate-900 hover:bg-slate-800 text-white"
                  onClick={() => {
                    setShowAuthModal(true);
                    setAuthMode("login");
                  }}
                >
                  {t("auth.login.signIn")}
                </Button>
                <Button
                  variant="outline"
                  onClick={() => {
                    setShowAuthModal(true);
                    setAuthMode("register");
                  }}
                >
                  {t("storefront.account.register")}
                </Button>
              </div>
              <Button variant="ghost" onClick={() => goToProfileMode("storefront")}>
                <ChevronLeft className="w-4 h-4 mr-2" />
                {t("storefront.account.backToStore")}
              </Button>
            </CardContent>
          </Card>
        </div>
      );
    }

    const orderCount = orderHistory.length;

    if (profileOrderId) {
      const want = String(profileOrderId).trim();
      const orderMatches = (o: any) => {
        if (!o || !want) return false;
        const id = String(o.id ?? "").trim();
        const num = String(o.orderNumber ?? "").trim();
        return id === want || num === want;
      };
      const order = orderHistory.find(orderMatches);
      const loadingList = ordersLoading && orderHistory.length === 0;

      if (loadingList) {
        return (
          <div className="max-w-4xl mx-auto">
            <VendorOrdersListSkeleton rows={6} />
          </div>
        );
      }

      const formatOrderDetailPrice = (price: string) => {
        const numPrice = parseFloat(String(price).replace(/[^0-9.-]+/g, ""));
        return `${Math.round(Number.isFinite(numPrice) ? numPrice : 0)} MMK`;
      };

      return (
        <div className="max-w-4xl mx-auto w-full">
          <OrderDetailView
            order={order}
            onBack={() => goToProfileMode("order-history")}
            formatPriceMMK={formatOrderDetailPrice}
          />
        </div>
      );
    }

    if (vendorViewMode === "view-profile") {
      return (
        <div className="max-w-4xl mx-auto">
          <Button
            variant="ghost"
            onClick={() => goToProfileMode("storefront")}
            className="mb-6 hover:bg-slate-100"
          >
            <ChevronLeft className="w-4 h-4 mr-2" />
            {t("storefront.account.backToHome")}
          </Button>

          <Card className="mb-6">
            <CardContent className="pt-6">
              <div className="flex flex-col md:flex-row items-center md:items-start gap-6">
                {userProfileImageUrl && !profileImageLoadFailed ? (
                  <CacheFriendlyImg
                    src={userProfileImageUrl}
                    alt={user.name || "Profile"}
                    className="w-[100px] h-[100px] rounded-lg object-cover flex-shrink-0"
                    onError={() => setProfileImageLoadFailed(true)}
                  />
                ) : (
                  <div className="w-[100px] h-[100px] rounded-lg bg-gradient-to-br from-amber-500 to-orange-600 flex items-center justify-center flex-shrink-0">
                    <UserCircle className="w-16 h-16 text-white" />
                  </div>
                )}
                <div className="flex-1 w-full min-w-0">
                  <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-3 text-center md:text-left">
                    <div className="min-w-0">
                      <h1 className="text-base sm:text-lg font-bold text-slate-900 mb-2">
                        {user?.name || t("storefront.account.guestUser")}
                      </h1>
                      <p className="text-slate-600">{getCustomerProfileSubtitle(user)}</p>
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="mx-auto md:mx-0 shrink-0 text-slate-600 hover:text-slate-900 hover:bg-slate-100"
                      onClick={() => goToProfileMode("edit-profile")}
                      aria-label={t("storefront.account.editProfile")}
                    >
                      <Pencil className="w-5 h-5" />
                    </Button>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          <div className="grid md:grid-cols-2 gap-6">
            <Card>
              <CardHeader>
                <CardTitle className="text-sm sm:text-base">{t("storefront.account.personalInformation")}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <Label className="text-sm text-slate-600">{t("profile.fullName")}</Label>
                  <p className="font-medium text-slate-900">{user?.name || t("storefront.account.notProvided")}</p>
                </div>
                <div>
                  <Label className="text-sm text-slate-600">{t("storefront.account.emailAddress")}</Label>
                  <p className="font-medium text-slate-900">{getCustomerDisplayEmail(user) ?? t("storefront.account.notProvided")}</p>
                </div>
                <div>
                  <Label className="text-sm text-slate-600">{t("storefront.account.phoneNumber")}</Label>
                  <p className="font-medium text-slate-900">{formatUserPhoneDisplay(user)}</p>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-sm sm:text-base">{t("storefront.account.accountStatistics")}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center justify-between p-3 bg-amber-50 rounded-lg">
                  <div className="flex items-center gap-3">
                    <Package className="w-5 h-5 text-amber-600" />
                    <span className="text-sm font-medium text-slate-700">{t("storefront.account.totalOrders")}</span>
                  </div>
                  {ordersLoading ? (
                    <div className="h-7 w-10 animate-pulse rounded bg-slate-200" aria-hidden />
                  ) : (
                    <span className="text-lg font-bold text-amber-700">{orderCount}</span>
                  )}
                </div>
                <div className="flex items-center justify-between p-3 bg-blue-50 rounded-lg">
                  <div className="flex items-center gap-3">
                    <Heart className="w-5 h-5 text-blue-600" />
                    <span className="text-sm font-medium text-slate-700">{t("storefront.account.wishlistItems")}</span>
                  </div>
                  <span className="text-lg font-bold text-blue-700">{wishlist.length}</span>
                </div>
                <div className="flex items-center justify-between p-3 bg-emerald-50 rounded-lg">
                  <div className="flex items-center gap-3">
                    <ShoppingBag className="w-5 h-5 text-emerald-600" />
                    <span className="text-sm font-medium text-slate-700">{t("storefront.account.cartItems")}</span>
                  </div>
                  <span className="text-lg font-bold text-emerald-700">{totalItems}</span>
                </div>
              </CardContent>
            </Card>
          </div>

          <Card className="mt-6">
            <CardHeader>
              <CardTitle className="text-lg">{t("storefront.account.quickActions")}</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <Button variant="outline" className="justify-start" onClick={() => goToProfileMode("order-history")}>
                  <Package className="w-4 h-4 mr-2" />
                  {t("storefront.account.viewOrders")}
                </Button>
                <Button variant="outline" className="justify-start" onClick={() => navigate(`${storeBase}/saved`)}>
                  <Heart className="w-4 h-4 mr-2" />
                  {t("storefront.account.myWishlist")}
                </Button>
                <Button variant="outline" className="justify-start" onClick={() => goToProfileMode("shipping-addresses")}>
                  <MapPin className="w-4 h-4 mr-2" />
                  {t("storefront.account.addresses")}
                </Button>
                <Button variant="outline" className="justify-start" onClick={() => goToProfileMode("security-settings")}>
                  <Shield className="w-4 h-4 mr-2" />
                  {t("storefront.account.security")}
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      );
    }

    if (vendorViewMode === "edit-profile") {
      return (
        <div className="max-w-2xl mx-auto px-4 py-8">
          <Button variant="ghost" onClick={() => goToProfileMode("view-profile")} className="mb-6 hover:bg-slate-100">
            <ChevronLeft className="w-4 h-4 mr-2" />
            {t("storefront.account.backToProfile")}
          </Button>

          <Card>
            <CardHeader>
              <CardTitle className="text-base sm:text-lg">{t("storefront.account.editProfile")}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="flex flex-col sm:flex-row sm:items-start gap-4 sm:gap-6 min-w-0">
                <div className="relative mx-auto sm:mx-0 w-[100px] h-[100px] shrink-0">
                  {profileForm.profileImage ? (
                    <CacheFriendlyImg
                      src={profileForm.profileImage}
                      alt="Profile preview"
                      className="w-full h-full rounded-lg object-cover ring-2 ring-slate-100"
                    />
                  ) : userProfileImageUrl && !profileImageLoadFailed ? (
                    <CacheFriendlyImg
                      src={userProfileImageUrl}
                      alt={user.name || "Profile"}
                      className="w-full h-full rounded-lg object-cover ring-2 ring-slate-100"
                      onError={() => setProfileImageLoadFailed(true)}
                    />
                  ) : (
                    <div className="w-full h-full rounded-lg bg-gradient-to-br from-amber-500 to-orange-600 flex items-center justify-center ring-2 ring-slate-100">
                      <UserCircle className="w-14 h-14 text-white" />
                    </div>
                  )}
                  <input
                    ref={vendorEditProfilePhotoInputRef}
                    type="file"
                    accept="image/jpeg,image/png,image/webp,image/jpg,image/gif"
                    className="hidden"
                    onChange={handleVendorEditProfilePhotoChange}
                  />
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        type="button"
                        variant="default"
                        size="icon"
                        className="absolute bottom-0.5 right-0.5 h-7 w-7 min-h-0 rounded-md border-2 border-white bg-slate-900 p-0 text-white shadow-md hover:bg-slate-800 hover:text-white focus-visible:ring-2 focus-visible:ring-slate-400 focus-visible:ring-offset-1 [&_svg]:!size-3.5"
                        aria-label={t("profile.editPhoto")}
                      >
                        <Pencil className="size-3.5" strokeWidth={2.5} />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" side="bottom" sideOffset={6} className="w-44">
                      <DropdownMenuItem
                        className="cursor-pointer"
                        onSelect={() =>
                          requestAnimationFrame(() => vendorEditProfilePhotoInputRef.current?.click())
                        }
                      >
                        <Upload className="mr-2 h-4 w-4" />
                        {t("storefront.account.changePhoto")}
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        className="cursor-pointer text-slate-700 focus:text-slate-900"
                        disabled={!profileForm.profileImage && !userProfileImageUrl}
                        onSelect={() => setProfileForm((prev) => ({ ...prev, profileImage: null }))}
                      >
                        <Trash2 className="mr-2 h-4 w-4" />
                        {t("storefront.account.removePhoto")}
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
                <div className="flex-1 min-w-0 w-full sm:w-auto text-center sm:text-left">
                  <p className="text-sm font-medium text-slate-900">{t("storefront.account.profilePicture")}</p>
                  <p className="text-xs text-slate-500 mt-1">{t("storefront.account.profilePictureHint")}</p>
                </div>
              </div>

              <Separator />

              <div className="space-y-2">
                <Label htmlFor="vendor-edit-name">{t("profile.fullName")}</Label>
                <Input
                  id="vendor-edit-name"
                  value={profileForm.name}
                  onChange={(e) => setProfileForm({ ...profileForm, name: e.target.value })}
                  placeholder={t("checkout.fullName.placeholder")}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="vendor-edit-email">{t("storefront.account.emailAddress")}</Label>
                <Input
                  id="vendor-edit-email"
                  type="email"
                  value={profileForm.email}
                  onChange={(e) => setProfileForm({ ...profileForm, email: e.target.value })}
                  placeholder="your.email@example.com"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="vendor-edit-phone">{t("storefront.account.phoneNumber")}</Label>
                <Input
                  id="vendor-edit-phone"
                  value={profileForm.phone}
                  onChange={(e) => setProfileForm({ ...profileForm, phone: e.target.value })}
                  placeholder="+95 9 XXX XXX XXX"
                />
                <p className="text-xs text-slate-500">{t("storefront.account.myanmarPhoneFormat")}</p>
              </div>

              <div className="flex gap-3 pt-4">
                <Button
                  onClick={handleSaveProfile}
                  disabled={isProfileSaving}
                  className="flex-1 bg-[#1a1d29] hover:bg-slate-900 text-white font-semibold shadow-lg transition-colors"
                >
                  <Check className="w-4 h-4 mr-2" />
                  {isProfileSaving ? t("storefront.account.saving") : t("storefront.account.saveChanges")}
                </Button>
                <Button
                  variant="outline"
                  onClick={() => goToProfileMode("view-profile")}
                  disabled={isProfileSaving}
                  className="flex-1"
                >
                  {t("storefront.account.cancel")}
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      );
    }

    if (vendorViewMode === "order-history") {
      return (
        <div className="max-w-6xl mx-auto">
          <Button variant="ghost" onClick={() => goToProfileMode("view-profile")} className="mb-6 hover:bg-slate-100">
            <ChevronLeft className="w-4 h-4 mr-2" />
            {t("storefront.account.backToProfile")}
          </Button>

          <div className="mb-8">
            <h1 className="text-xl sm:text-2xl font-bold text-slate-900 mb-2">{t("storefront.account.orderHistory")}</h1>
            <p className="text-slate-600 text-sm">{t("storefront.account.ordersDescription")}</p>
          </div>

          {ordersLoading && <VendorOrdersListSkeleton rows={5} />}

          {!ordersLoading && ordersError && (
            <Card>
              <CardContent className="py-16 text-center">
                <Package className="w-16 h-16 text-slate-300 mx-auto mb-4" />
                <h3 className="text-lg font-semibold text-slate-900 mb-2">{t("storefront.account.errorLoadingOrders")}</h3>
                <p className="text-slate-600 mb-6">{ordersError}</p>
                <Button
                  onClick={() => window.location.reload()}
                  className="bg-slate-900 hover:bg-slate-800 text-white"
                >
                  {t("storefront.account.retry")}
                </Button>
              </CardContent>
            </Card>
          )}

          {!ordersLoading && !ordersError && orderHistory.length === 0 && (
            <Card>
              <CardContent className="py-16 text-center">
                <Package className="w-16 h-16 text-slate-300 mx-auto mb-4" />
                <h3 className="text-lg font-semibold text-slate-900 mb-2">{t("storefront.account.noOrdersYet")}</h3>
                <p className="text-slate-600 mb-6">{t("storefront.account.noOrdersDescription")}</p>
                <Button onClick={() => goToProfileMode("storefront")} className="bg-black text-white hover:bg-zinc-900">
                  {t("storefront.account.startShopping")}
                </Button>
              </CardContent>
            </Card>
          )}

          {!ordersLoading && !ordersError && orderHistory.length > 0 && (
            <div className="space-y-4">
              {orderHistory.map((order: any) => (
                <Card key={order.id} className="hover:shadow-md transition-shadow">
                  <CardContent className="p-4 sm:p-6">
                    <div className="flex flex-col gap-4">
                      <div className="flex items-start justify-between gap-3">
                        <h3 className="text-base sm:text-lg font-bold text-slate-900 break-all">
                          {order.orderNumber || order.id}
                        </h3>
                        <Badge variant="default" className={`${getCustomerOrderStatusColor(order.status)} shrink-0 text-xs`}>
                          {getCustomerOrderStatusLabel(order.status)}
                        </Badge>
                      </div>
                      <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4 text-sm text-slate-600">
                        <div className="flex items-center gap-1.5">
                          <Clock className="w-4 h-4 shrink-0" />
                          <span>
                            {new Date(order.createdAt || order.date).toLocaleString("en-GB", {
                              year: "numeric",
                              month: "2-digit",
                              day: "2-digit",
                              hour: "2-digit",
                              minute: "2-digit",
                            })}
                          </span>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <Package className="w-4 h-4 shrink-0" />
                          <span>
                            {order.items?.length || 0} {order.items?.length === 1 ? t("cart.item") : t("cart.items")}
                          </span>
                        </div>
                      </div>
                      <div className="pt-3 border-t border-slate-100">
                        <div className="flex items-center justify-between">
                          <span className="text-sm text-slate-600">{t("storefront.account.totalAmount")}</span>
                          <span className="text-lg sm:text-xl font-bold text-black">
                            {Math.round(order.total || order.totalAmount || 0)} MMK
                          </span>
                        </div>
                      </div>
                      <Button
                        variant="outline"
                        className="w-full sm:w-auto"
                        onClick={() =>
                          navigate(`${storeBase}/profile/orders/${encodeURIComponent(String(order.id))}`)
                        }
                      >
                        <Eye className="w-4 h-4 mr-2" />
                        {t("storefront.account.viewDetails")}
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>
      );
    }

    if (vendorViewMode === "shipping-addresses") {
      const addressUserId = resolveUserIdFromRecord(user);
      return (
        <div className="max-w-4xl mx-auto px-4">
          <Button variant="ghost" onClick={() => goToProfileMode("view-profile")} className="mb-6 hover:bg-slate-100">
            <ChevronLeft className="w-4 h-4 mr-2" />
            {t("storefront.account.backToProfile")}
          </Button>

          <div className="mb-8 flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
            <div>
              <h1 className="text-xl sm:text-2xl font-bold text-slate-900 mb-2">{t("storefront.account.shippingAddresses")}</h1>
              <p className="text-slate-600 text-sm">{t("storefront.account.manageDeliveryAddresses")}</p>
            </div>
            <Button
              onClick={() => {
                setShowAddressForm(true);
                setEditingAddress(null);
                const isFirstAddress = shippingAddresses.length === 0;
                setAddressForm({
                  label: isFirstAddress ? "Home" : "",
                  recipientName: isFirstAddress && user?.name ? user.name : "",
                  phone: isFirstAddress && user?.phone ? user.phone : "",
                  addressLine1: "",
                  addressLine2: "",
                  city: "",
                  state: "",
                  zipCode: "",
                  country: "Myanmar",
                  isDefault: isFirstAddress,
                });
                setTimeout(() => window.scrollTo({ top: 200, behavior: "instant" }), 10);
              }}
              className="bg-slate-900 hover:bg-slate-800 text-white shrink-0"
            >
              <Plus className="w-4 h-4 mr-2" />
              {t("storefront.account.addAddress")}
            </Button>
          </div>

          {showAddressForm && (
            <Card className="mb-6 border-2 border-slate-300">
              <CardHeader>
                <CardTitle>{editingAddress ? t("storefront.account.editAddress") : t("storefront.account.addNewAddress")}</CardTitle>
              </CardHeader>
              <CardContent>
                <ShippingAddressFormFields
                  value={addressForm}
                  onChange={setAddressForm}
                  idPrefix="vendor-addr"
                  defaultCheckboxId="vendor-isDefault"
                />
                <div className="flex gap-3 mt-6">
                  <Button
                    onClick={async () => {
                      if (!isShippingAddressFormValid(addressForm)) {
                        toast.error(t("storefront.account.requiredFields"));
                        return;
                      }
                      if (!addressUserId) {
                        toast.error(t("storefront.account.signInToSaveAddresses"));
                        return;
                      }

                      const newAddress: MarketplaceAddress = {
                        id: editingAddress?.id || Date.now().toString(),
                        ...addressForm,
                        country: addressForm.country || "Myanmar",
                        userId: addressUserId,
                      };

                      let updatedAddresses = shippingAddresses;
                      if (newAddress.isDefault) {
                        updatedAddresses = shippingAddresses.map((addr) => ({
                          ...addr,
                          isDefault: false,
                        }));
                      }

                      if (editingAddress) {
                        updatedAddresses = updatedAddresses.map((addr) =>
                          addr.id === editingAddress.id ? newAddress : addr
                        );
                        setShippingAddresses(updatedAddresses);
                        toast.success(t("storefront.account.addressUpdated"));
                      } else {
                        updatedAddresses = [...updatedAddresses, newAddress];
                        setShippingAddresses(updatedAddresses);
                        toast.success(t("storefront.account.addressAdded"));
                      }

                      localStorage.setItem(`migoo-shipping-addresses-${addressUserId}`, JSON.stringify(updatedAddresses));

                      try {
                        await fetch(
                          `https://${projectId}.supabase.co/functions/v1/make-server-16010b6f/customers/${addressUserId}/addresses`,
                          {
                            method: "POST",
                            headers: {
                              "Content-Type": "application/json",
                              Authorization: `Bearer ${publicAnonKey}`,
                            },
                            body: JSON.stringify({ addresses: updatedAddresses }),
                          }
                        );
                      } catch (error) {
                        console.error("Failed to save addresses to backend:", error);
                      }

                      setShowAddressForm(false);
                      setEditingAddress(null);
                    }}
                    className="flex-1 bg-slate-900 hover:bg-slate-800 text-white"
                  >
                    <Check className="w-4 h-4 mr-2" />
                    {editingAddress ? t("storefront.account.updateAddress") : t("storefront.account.saveAddress")}
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => {
                      setShowAddressForm(false);
                      setEditingAddress(null);
                    }}
                    className="flex-1"
                  >
                    {t("storefront.account.cancel")}
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}

          {loadingAddresses && shippingAddresses.length === 0 && !showAddressForm ? (
            <VendorAddressesSkeleton />
          ) : shippingAddresses.length === 0 && !showAddressForm ? (
            <Card>
              <CardContent className="py-16 text-center">
                <MapPin className="w-16 h-16 text-slate-300 mx-auto mb-4" />
                <h3 className="text-lg font-semibold text-slate-900 mb-2">{t("storefront.account.noAddressesYet")}</h3>
                <p className="text-slate-600 mb-6">{t("storefront.account.noAddressesDescription")}</p>
                <Button
                  onClick={() => {
                    setShowAddressForm(true);
                    setEditingAddress(null);
                    setAddressForm({
                      label: "Home",
                      recipientName: user?.name || "",
                      phone: user?.phone || "",
                      addressLine1: "",
                      addressLine2: "",
                      city: "",
                      state: "",
                      zipCode: "",
                      country: "Myanmar",
                      isDefault: true,
                    });
                  }}
                  className="bg-slate-900 hover:bg-slate-800 text-white"
                >
                  <Plus className="w-4 h-4 mr-2" />
                  {t("storefront.account.addFirstAddress")}
                </Button>
              </CardContent>
            </Card>
          ) : (
            <div className="grid md:grid-cols-2 gap-4">
              {shippingAddresses.map((address) => (
                <Card key={address.id} className={address.isDefault ? "border-2 border-slate-900" : ""}>
                  <CardContent className="pt-6">
                    <div className="flex items-start justify-between mb-4">
                      <div>
                        <h3 className="font-bold text-slate-900 mb-1 flex items-center gap-2 flex-wrap">
                          {address.label}
                          {address.isDefault && (
                            <Badge className="bg-slate-900 hover:bg-slate-900 text-xs">{t("storefront.account.default")}</Badge>
                          )}
                        </h3>
                        <p className="text-sm font-medium text-slate-700">{address.recipientName}</p>
                      </div>
                    </div>
                    <div className="space-y-2 text-sm text-slate-600 mb-4">
                      <div className="flex items-start gap-2">
                        <MapPin className="w-4 h-4 mt-0.5 flex-shrink-0 text-slate-600" />
                        <div>
                          <p>{address.addressLine1}</p>
                          {address.addressLine2 && <p>{address.addressLine2}</p>}
                          <p>
                            {address.city}
                            {address.state && `, ${address.state}`}
                          </p>
                          <p>
                            {address.zipCode && `${address.zipCode}, `}
                            {address.country}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Phone className="w-4 h-4 text-amber-600" />
                        <span>{address.phone}</span>
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        className="flex-1"
                        onClick={() => {
                          setEditingAddress(address);
                          setAddressForm({
                            label: address.label || "",
                            recipientName: address.recipientName || "",
                            phone: address.phone || "",
                            addressLine1: address.addressLine1 || "",
                            addressLine2: address.addressLine2 || "",
                            city: address.city || "",
                            state:
                              address.state ||
                              resolveMyanmarRegionForTownship(address.city || "") ||
                              "",
                            zipCode: address.zipCode || "",
                            country: address.country || "Myanmar",
                            isDefault: address.isDefault ?? false,
                          });
                          setShowAddressForm(true);
                          setTimeout(() => window.scrollTo({ top: 200, behavior: "instant" }), 10);
                        }}
                      >
                        <Settings className="w-4 h-4 mr-2" />
                        {t("storefront.account.edit")}
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        className="flex-1 text-red-600 hover:text-red-700 hover:bg-red-50"
                        onClick={async () => {
                          if (!confirm(t("storefront.account.deleteAddressConfirm"))) return;
                          if (!addressUserId) {
                            toast.error(t("storefront.account.signInRequiredToast"));
                            return;
                          }
                          const updatedAddresses = shippingAddresses.filter((addr) => addr.id !== address.id);
                          setShippingAddresses(updatedAddresses);
                          toast.success(t("storefront.account.addressDeleted"));
                          localStorage.setItem(
                            `migoo-shipping-addresses-${addressUserId}`,
                            JSON.stringify(updatedAddresses)
                          );
                          try {
                            await fetch(
                              `https://${projectId}.supabase.co/functions/v1/make-server-16010b6f/customers/${addressUserId}/addresses`,
                              {
                                method: "POST",
                                headers: {
                                  "Content-Type": "application/json",
                                  Authorization: `Bearer ${publicAnonKey}`,
                                },
                                body: JSON.stringify({ addresses: updatedAddresses }),
                              }
                            );
                          } catch (error) {
                            console.error("Failed to save address deletion to backend:", error);
                          }
                        }}
                      >
                        <Trash2 className="w-4 h-4 mr-2" />
                        {t("storefront.account.delete")}
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>
      );
    }

    return (
      <div className="max-w-2xl mx-auto px-4 py-8">
        <Button variant="ghost" onClick={() => goToProfileMode("view-profile")} className="mb-6 hover:bg-slate-100">
          <ChevronLeft className="w-4 h-4 mr-2" />
          {t("storefront.account.backToProfile")}
        </Button>

        <div className="mb-8">
          <h1 className="text-xl sm:text-2xl font-bold text-slate-900 mb-2">{t("storefront.account.securitySettings")}</h1>
          <p className="text-slate-600 text-sm">{t("storefront.account.securityDescription")}</p>
        </div>

        <Card className="mb-6">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Shield className="w-5 h-5 text-slate-700" />
              {t("storefront.account.changePassword")}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                void handleChangePassword();
              }}
              className="space-y-4"
            >
              <div>
                <Label htmlFor="vendor-cur-pw">{t("storefront.account.currentPassword")}</Label>
                <div className="relative">
                  <Input
                    id="vendor-cur-pw"
                    type={showPasswordFields.current ? "text" : "password"}
                    placeholder={t("storefront.account.currentPasswordPlaceholder")}
                    value={passwordForm.currentPassword}
                    onChange={(e) => setPasswordForm({ ...passwordForm, currentPassword: e.target.value })}
                    required
                    className="pr-10"
                    autoComplete="current-password"
                  />
                  <button
                    type="button"
                    onClick={() =>
                      setShowPasswordFields((prev) => ({ ...prev, current: !prev.current }))
                    }
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition-colors"
                    aria-label={showPasswordFields.current ? t("storefront.account.hidePassword") : t("storefront.account.showPassword")}
                  >
                    {showPasswordFields.current ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>
              <div>
                <Label htmlFor="vendor-new-pw">{t("storefront.account.newPassword")}</Label>
                <div className="relative">
                  <Input
                    id="vendor-new-pw"
                    type={showPasswordFields.new ? "text" : "password"}
                    placeholder={t("storefront.account.newPasswordPlaceholder")}
                    value={passwordForm.newPassword}
                    onChange={(e) => setPasswordForm({ ...passwordForm, newPassword: e.target.value })}
                    required
                    className="pr-10"
                    autoComplete="new-password"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPasswordFields((prev) => ({ ...prev, new: !prev.new }))}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition-colors"
                    aria-label={showPasswordFields.new ? t("storefront.account.hidePassword") : t("storefront.account.showPassword")}
                  >
                    {showPasswordFields.new ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>
              <div>
                <Label htmlFor="vendor-confirm-pw">{t("storefront.account.confirmNewPassword")}</Label>
                <div className="relative">
                  <Input
                    id="vendor-confirm-pw"
                    type={showPasswordFields.confirm ? "text" : "password"}
                    placeholder={t("storefront.account.confirmNewPasswordPlaceholder")}
                    value={passwordForm.confirmPassword}
                    onChange={(e) => setPasswordForm({ ...passwordForm, confirmPassword: e.target.value })}
                    required
                    className="pr-10"
                    autoComplete="new-password"
                  />
                  <button
                    type="button"
                    onClick={() =>
                      setShowPasswordFields((prev) => ({ ...prev, confirm: !prev.confirm }))
                    }
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition-colors"
                    aria-label={showPasswordFields.confirm ? t("storefront.account.hidePassword") : t("storefront.account.showPassword")}
                  >
                    {showPasswordFields.confirm ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>
              <Button
                type="submit"
                disabled={isChangingPassword}
                className="w-full bg-slate-900 hover:bg-slate-800 text-white"
              >
                {isChangingPassword ? (
                  t("storefront.account.changingPassword")
                ) : (
                  <>
                    <Check className="w-4 h-4 mr-2" />
                    {t("storefront.account.changePassword")}
                  </>
                )}
              </Button>
            </form>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <User className="w-5 h-5 text-slate-700" />
              {t("storefront.account.accountInformation")}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label className="text-sm text-slate-600">{t("storefront.account.emailAddress")}</Label>
              <p className="font-medium text-slate-900">{getCustomerDisplayEmail(user) ?? t("storefront.account.notProvided")}</p>
              <p className="text-xs text-slate-500 mt-1">{t("storefront.account.emailLoginHint")}</p>
            </div>
            <Separator />
            <div>
              <Label className="text-sm text-slate-600">{t("storefront.account.accountCreated")}</Label>
              <p className="font-medium text-slate-900">{new Date().toLocaleDateString("en-GB")}</p>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  };

  const refetchVendorCatalogPage1 = useCallback(
    async (forceRefresh: boolean): Promise<boolean> => {
      const requestSeq = ++vendorCatalogRequestSeqRef.current;
      const isLatest = () => requestSeq === vendorCatalogRequestSeqRef.current;
      if (savedPage) return false;
      const qRaw = debouncedVendorServerQ.trim();
      const qk = qRaw.toLowerCase();
      const cat = vendorCatalogServerCategory;
      const shouldClientFilterVendorCategory = cat !== "all";
      const pageSize = shouldClientFilterVendorCategory ? VENDOR_SEARCH_PAGE_SIZE : (qRaw ? VENDOR_SEARCH_PAGE_SIZE : VENDOR_BROWSE_PAGE_SIZE);
      const cacheKey = CACHE_KEYS.vendorProductsPage(vendorId, 1, qk, cat, pageSize);
      const persistEligible = !qRaw;
      const lsKey = lsVendorCatalogPage1Key(vendorId, qk, cat, pageSize);

      if (!forceRefresh && persistEligible && !shouldClientFilterVendorCategory) {
        const sliceKey = vendorCatalogSliceSessionKey(vendorId, cat);
        const loadedMore =
          catalogSliceByCategoryRef.current.get(sliceKey) ??
          readVendorCatalogSliceSession(sliceKey);
        if (
          loadedMore &&
          (loadedMore.page > 1 ||
            loadedMore.products.length > VENDOR_BROWSE_PAGE_SIZE)
        ) {
          if (!isLatest()) return false;
          catalogSliceByCategoryRef.current.set(sliceKey, loadedMore);
          applyVendorCatalogSlice(loadedMore);
          const fromLsBranding = readPersistedJson<any>(lsKey, PERSISTED_CATALOG_TTL_MS);
          if (fromLsBranding && typeof fromLsBranding === "object") {
            applyStoreNameIfPresent(fromLsBranding.storeName);
            setStoreLogo((prev) => fromLsBranding.logo || prev);
            if (
              typeof fromLsBranding.storePhone === "string" &&
              fromLsBranding.storePhone.trim()
            ) {
              setStorePhone(fromLsBranding.storePhone.trim());
            }
            const rid =
              typeof fromLsBranding.resolvedVendorId === "string" &&
              fromLsBranding.resolvedVendorId.trim()
                ? fromLsBranding.resolvedVendorId.trim()
                : undefined;
            setCanonicalVendorId(rid ?? vendorId);
            if (
              typeof fromLsBranding.storeSlug === "string" &&
              fromLsBranding.storeSlug.trim()
            ) {
              setCanonicalStoreSlug(fromLsBranding.storeSlug.trim());
            }
            applyMetaPixelFromCatalog(fromLsBranding);
          }
          return true;
        }
      }

      if (!forceRefresh && persistEligible && !shouldClientFilterVendorCategory) {
        const fromLs = readPersistedJson<any>(lsKey, PERSISTED_CATALOG_TTL_MS);
        if (fromLs && typeof fromLs === "object") {
          // Old persisted catalog omitted `storePhone` — bypass LS once so we pick up `contactPhone` from the API.
          const lsHasStorePhoneField = Object.prototype.hasOwnProperty.call(fromLs, "storePhone");
          if (lsHasStorePhoneField) {
            if (!isLatest()) return false;
            moduleCache.prime(cacheKey, fromLs);
            const slice = {
              products: fromLs.products || [],
              total: fromLs.total,
              page: fromLs.page,
              hasMore: fromLs.hasMore,
            };
            if (!shouldApplyCachedCatalogSlice(slice, cat)) {
              return false;
            }
            applyVendorCatalogSlice(slice);
            applyStoreNameIfPresent(fromLs.storeName);
            setStoreLogo((prev) => fromLs.logo || prev);
            if (typeof fromLs.storePhone === "string" && fromLs.storePhone.trim()) {
              setStorePhone(fromLs.storePhone.trim());
            } else {
              setStorePhone(VENDOR_DEFAULT_STORE_PHONE);
            }
            const rid =
              typeof fromLs.resolvedVendorId === "string" && fromLs.resolvedVendorId.trim()
                ? fromLs.resolvedVendorId.trim()
                : undefined;
            setCanonicalVendorId(rid ?? vendorId);
            if (typeof fromLs.storeSlug === "string" && fromLs.storeSlug.trim()) {
              setCanonicalStoreSlug(fromLs.storeSlug.trim());
            }
            applyMetaPixelFromCatalog(fromLs);
            if (persistEligible) {
              rememberVendorCatalogSlice(cat, slice);
            }
            if (Array.isArray(slice.products) && slice.products.length > 0) {
              return true;
            }
            if (typeof slice.total === "number" && slice.total > 0) {
              return true;
            }
          }
        }
      }

      const productsData = await moduleCache.get(
        cacheKey,
        () =>
          fetchVendorProducts(vendorId, {
            page: 1,
            pageSize,
            q: qRaw || undefined,
            category: shouldClientFilterVendorCategory ? undefined : cat,
          }),
        forceRefresh
      );
      if (!isLatest()) return false;
      const fetchedProducts = productsData.products || [];
      const displayProducts = shouldClientFilterVendorCategory
        ? clientFilterProductsForCatalogCategory(fetchedProducts, cat)
        : fetchedProducts;
      const slice = {
        products: displayProducts,
        total: shouldClientFilterVendorCategory ? displayProducts.length : productsData.total,
        page: productsData.page,
        hasMore: shouldClientFilterVendorCategory ? false : productsData.hasMore,
      };
      if (
        !forceRefresh &&
        slice.products.length === 0 &&
        clientFilterProductsForCatalogCategory(productsRef.current, cat).length > 0
      ) {
        return false;
      }
      setProducts(slice.products);
      setVendorCatalogTotal(slice.total);
      setVendorCatalogPage(slice.page);
      setVendorCatalogHasMore(slice.hasMore);
      applyStoreNameIfPresent(productsData.storeName);
      setStoreLogo((prev) => productsData.logo || prev);
      setStorePhone(productsData.storePhone?.trim() || VENDOR_DEFAULT_STORE_PHONE);
      applyMetaPixelFromCatalog(productsData);
      setCanonicalVendorId(productsData.resolvedVendorId ?? vendorId);
      if (productsData.storeSlug) {
        setCanonicalStoreSlug(productsData.storeSlug);
      }
      if (persistEligible) {
        rememberVendorCatalogSlice(cat, slice);
      }

      if (persistEligible && productsData && typeof productsData === "object") {
        writePersistedJson(lsKey, productsData);
      }
      return true;
    },
    [
      vendorId,
      debouncedVendorServerQ,
      vendorCatalogServerCategory,
      savedPage,
      applyStoreNameIfPresent,
      applyMetaPixelFromCatalog,
      rememberVendorCatalogSlice,
      applyVendorCatalogSlice,
      shouldApplyCachedCatalogSlice,
      clientFilterProductsForCatalogCategory,
    ]
  );

  // Sibling routes (/summary vs /) remount VendorStorefrontPage — warm catalog while checkout is open.
  useEffect(() => {
    if (savedPage || !isCheckoutRoute) return;
    if (productsRef.current.length > 0) return;
    void refetchVendorCatalogPage1(false);
  }, [isCheckoutRoute, savedPage, vendorId, refetchVendorCatalogPage1]);

  // Continue Shopping → home (same instance or route remount): refill catalog when grid is empty.
  useEffect(() => {
    if (savedPage) {
      wasCheckoutRouteRef.current = isCheckoutRoute;
      return;
    }
    const leavingCheckout = wasCheckoutRouteRef.current && !isCheckoutRoute;
    const homeWithEmptyCatalog = !isCheckoutRoute && productsRef.current.length === 0;
    if (leavingCheckout || homeWithEmptyCatalog) {
      void (async () => {
        if (productsRef.current.length === 0) {
          setServerStatus("checking");
          try {
            await refetchVendorCatalogPage1(true);
            setServerStatus("healthy");
          } catch {
            if (productsRef.current.length === 0) setServerStatus("unhealthy");
            else setServerStatus("healthy");
          }
        } else {
          void refetchVendorCatalogPage1(true);
        }
      })();
    }
    wasCheckoutRouteRef.current = isCheckoutRoute;
  }, [isCheckoutRoute, savedPage, refetchVendorCatalogPage1]);

  // Super-admin product delete: drop rows immediately on every vendor shop (no slug/id key matching).
  useEffect(() => {
    if (savedPage) return;

    const applyPlatformDeleted = (productIds: string[]) => {
      const idSet = new Set(productIds.map(String));
      if (idSet.size === 0) return;
      setProducts((prev) => prev.filter((p) => !idSet.has(String(p.id))));
      void refetchVendorCatalogPage1(true);
    };

    const onPlatformDeleted = (e: Event) => {
      const ids = (e as CustomEvent<{ productIds?: string[] }>).detail?.productIds;
      if (Array.isArray(ids) && ids.length > 0) applyPlatformDeleted(ids);
    };

    window.addEventListener(PLATFORM_PRODUCTS_DELETED_EVENT, onPlatformDeleted as EventListener);

    let platformBc: BroadcastChannel | null = null;
    try {
      platformBc = new BroadcastChannel(PLATFORM_PRODUCTS_DELETED_EVENT);
      platformBc.onmessage = (ev: MessageEvent<{ productIds?: string[] }>) => {
        if (Array.isArray(ev.data?.productIds) && ev.data.productIds.length > 0) {
          applyPlatformDeleted(ev.data.productIds);
        }
      };
    } catch {
      /* ignore */
    }

    return () => {
      window.removeEventListener(PLATFORM_PRODUCTS_DELETED_EVENT, onPlatformDeleted as EventListener);
      platformBc?.close();
    };
  }, [savedPage, refetchVendorCatalogPage1]);

  // Assign/unassign from vendor admin or super admin: refetch this shop immediately (same tab, other tabs, or no LS yet).
  useEffect(() => {
    if (savedPage) return;

    const matchesMutationKeys = (msgKeys: unknown): boolean => {
      if (!Array.isArray(msgKeys)) return false;
      const storefront = String(vendorId).trim();
      for (const raw of msgKeys) {
        const k = String(raw ?? "").trim();
        if (!k) continue;
        if (k === storefront) return true;
        try {
          if (decodeURIComponent(k) === decodeURIComponent(storefront)) return true;
        } catch {
          /* ignore */
        }
      }
      return false;
    };

    const lsPrefix = `migoo-ls-vendor-p1-${encodeURIComponent(vendorId)}`;
    let debounce: ReturnType<typeof setTimeout> | undefined;
    const scheduleRefetch = () => {
      window.clearTimeout(debounce);
      debounce = window.setTimeout(() => {
        void (async () => {
          try {
            moduleCache.invalidate(CACHE_KEYS.vendorCategories(vendorId));
            const categoriesData = await fetchVendorCategories(vendorId);
            const nextCategoryMap = buildVendorCategoryProductIdMap(categoriesData);
            const nextAssignedIds = new Set<string>();
            for (const ids of nextCategoryMap.values()) {
              for (const id of ids) nextAssignedIds.add(id);
            }
            vendorCategoryProductIdsByNameRef.current = nextCategoryMap;
            vendorCategorizedProductIdsRef.current = nextAssignedIds;
            setVendorCategories(categoriesData);
            writePersistedJson(lsVendorCategoriesKey(vendorId), categoriesData);
          } catch {
            /* Category refresh is best-effort; catalog refetch still keeps product data fresh. */
          }
          void refetchVendorCatalogPage1(true);
        })();
      }, 320);
    };

    const onStorage = (e: StorageEvent) => {
      if (e.storageArea !== localStorage) return;
      const k = e.key;
      if (k == null || !k.startsWith(lsPrefix)) return;
      scheduleRefetch();
    };

    const applyDeletedProducts = (productIds: string[]) => {
      const idSet = new Set(productIds.map(String));
      if (idSet.size === 0) return;
      setProducts((prev) => prev.filter((p) => !idSet.has(String(p.id))));
      setVendorCatalogTotal((prev) => Math.max(0, prev - idSet.size));
    };

    const onWindowMutation = (e: Event) => {
      const ce = e as CustomEvent<{ keys?: string[]; productIds?: string[] }>;
      if (!matchesMutationKeys(ce.detail?.keys)) return;
      if (Array.isArray(ce.detail?.productIds) && ce.detail.productIds.length > 0) {
        applyDeletedProducts(ce.detail.productIds);
        return;
      }
      scheduleRefetch();
    };

    window.addEventListener("storage", onStorage);
    window.addEventListener(VENDOR_CATALOG_MUTATION_EVENT, onWindowMutation as EventListener);

    let bc: BroadcastChannel | null = null;
    try {
      bc = new BroadcastChannel(VENDOR_CATALOG_MUTATION_EVENT);
      bc.onmessage = (ev: MessageEvent<{ type?: string; keys?: string[]; productIds?: string[] }>) => {
        if (ev.data?.type === "products-deleted") {
          if (!matchesMutationKeys(ev.data?.keys)) return;
          applyDeletedProducts(ev.data.productIds || []);
          return;
        }
        if (!matchesMutationKeys(ev.data?.keys)) return;
        scheduleRefetch();
      };
    } catch {
      /* ignore */
    }

    return () => {
      window.removeEventListener("storage", onStorage);
      window.removeEventListener(VENDOR_CATALOG_MUTATION_EVENT, onWindowMutation as EventListener);
      window.clearTimeout(debounce);
      bc?.close();
    };
  }, [vendorId, savedPage, refetchVendorCatalogPage1, buildVendorCategoryProductIdMap]);

  // Realtime bridge: central product pulse refreshes storefront catalog without a broad KV subscription here.
  useEffect(() => {
    let debounce: ReturnType<typeof setTimeout> | undefined;
    const scheduleRefetch = () => {
      window.clearTimeout(debounce);
      debounce = window.setTimeout(() => {
        void refetchVendorCatalogPage1(true);
      }, 320);
    };
    window.addEventListener(ADMIN_PRODUCTS_LIST_CHANGED_EVENT, scheduleRefetch);
    return () => {
      window.clearTimeout(debounce);
      window.removeEventListener(ADMIN_PRODUCTS_LIST_CHANGED_EVENT, scheduleRefetch);
    };
  }, [vendorId, refetchVendorCatalogPage1]);

  const loadMoreVendorCatalog = useCallback(async () => {
    if (savedPage || !vendorCatalogHasMore || vendorCatalogLoadingMore) return;
    setVendorCatalogLoadingMore(true);
    try {
      const nextPage = vendorCatalogPage + 1;
      const qRaw = debouncedVendorServerQ.trim();
      const qk = qRaw.toLowerCase();
      const cat = vendorCatalogServerCategory;
      const pageSize = qRaw ? VENDOR_SEARCH_PAGE_SIZE : VENDOR_BROWSE_PAGE_SIZE;
      const data = await moduleCache.get(
        CACHE_KEYS.vendorProductsPage(vendorId, nextPage, qk, cat, pageSize),
        () =>
          fetchVendorProducts(vendorId, {
            page: nextPage,
            pageSize,
            q: qRaw || undefined,
            category: cat === "all" ? undefined : cat,
          }),
        false
      );
      setProducts((prev) => {
        const seen = new Set(prev.map((p) => p.id));
        const add = (data.products || []).filter((p: Product) => !seen.has(p.id));
        const merged = [...prev, ...add];
        const nextPage = data.page;
        const hasMore = data.hasMore;
        const total =
          typeof data.total === "number"
            ? data.total
            : vendorCatalogStateRef.current.total;
        rememberVendorCatalogSlice(cat, {
          products: merged,
          total,
          page: nextPage,
          hasMore,
        });
        return merged;
      });
      setVendorCatalogPage(data.page);
      setVendorCatalogHasMore(data.hasMore);
    } catch (e) {
      console.error("Load more vendor products failed:", e);
    } finally {
      setVendorCatalogLoadingMore(false);
    }
  }, [
    savedPage,
    vendorCatalogHasMore,
    vendorCatalogLoadingMore,
    vendorCatalogPage,
    vendorId,
    debouncedVendorServerQ,
    vendorCatalogServerCategory,
    rememberVendorCatalogSlice,
  ]);

  // 🚀 Categories + server-paginated product grid (module cache per page / filters).
  // Categories and page-1 catalog run in parallel — sequential awaits were doubling time-to-interactive on Vercel.
  const loadVendorData = async (forceRefresh: boolean = false) => {

    try {
      const loadCategories = async (): Promise<any[]> => {
        let categoriesData: any[] = [];
        try {
          const catLsKey = lsVendorCategoriesKey(vendorId);
          let categoriesFromLs = false;
          let shouldForceCategoryFetch = forceRefresh;
          if (!forceRefresh) {
            const fromLs = readPersistedJson<any[]>(catLsKey, PERSISTED_CATALOG_TTL_MS);
            if (fromLs !== null && Array.isArray(fromLs)) {
              const cleanedCategories = filterVendorCreatedCategories(fromLs, vendorId);
              if (cleanedCategories.length !== fromLs.length) {
                writePersistedJson(catLsKey, cleanedCategories);
              }
              moduleCache.prime(CACHE_KEYS.vendorCategories(vendorId), cleanedCategories);
              categoriesData = cleanedCategories;
              categoriesFromLs = cleanedCategories.length > 0;
              shouldForceCategoryFetch = cleanedCategories.length === 0;
            }
          }
          if (forceRefresh || !categoriesFromLs) {
            categoriesData = await moduleCache.get(
              CACHE_KEYS.vendorCategories(vendorId),
              () => fetchVendorCategories(vendorId),
              shouldForceCategoryFetch
            );
            categoriesData = filterVendorCreatedCategories(categoriesData, vendorId);
            if (!forceRefresh && Array.isArray(categoriesData)) {
              writePersistedJson(catLsKey, categoriesData);
            }
          }
        } catch (catErr) {
          console.warn("⚠️ [VENDOR STORE] Categories fetch failed (non-fatal):", catErr);
          categoriesData = [];
        }
        return categoriesData || [];
      };

      const categoriesPromise = loadCategories()
        .then((categoriesData) => {
          setVendorCategories(categoriesData);
          return categoriesData;
        })
        .catch((catErr) => {
          console.warn("⚠️ [VENDOR STORE] Categories fetch failed (non-fatal):", catErr);
          setVendorCategories([]);
          return [];
        });

      const hadCatalogSnapshot = productsRef.current.length > 0;
      if (!savedPage) {
        await refetchVendorCatalogPage1(forceRefresh);
      }

      setServerStatus("healthy");

      // Keep category fetch off the critical rendering path.
      void categoriesPromise;

      // Stale-while-revalidate: LS paints instantly; reconcile in background unless load-more state is active.
      if (!savedPage && !forceRefresh && hadCatalogSnapshot) {
        const sliceKey = vendorCatalogSliceSessionKey(
          vendorId,
          vendorCatalogServerCategory
        );
        const loadedMore = readVendorCatalogSliceSession(sliceKey);
        const hasLoadedMore =
          loadedMore &&
          (loadedMore.page > 1 ||
            loadedMore.products.length > VENDOR_BROWSE_PAGE_SIZE);
        if (!hasLoadedMore) {
          void refetchVendorCatalogPage1(true);
        }
      }
    } catch (error) {
      console.error("❌ [VENDOR STORE] Error loading vendor data:", error);
      if (productsRef.current.length > 0) setServerStatus("healthy");
      else setServerStatus("unhealthy");
    }
  };

  useEffect(() => {
    vendorCatalogFilterMountSkipRef.current = true;
    const raw = searchQuery.trim();
    setDebouncedVendorServerQ(
      raw.length >= VENDOR_SEARCH_MIN_SERVER_CHARS ? raw : ""
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps -- sync when vendor changes only
  }, [vendorId]);

  useEffect(() => {
    catalogSliceByCategoryRef.current.clear();
    vendorCatalogFetchKeyRef.current = "";
    setCanonicalVendorId(null);
    setCanonicalStoreSlug(resolveVendorPathSlug(storeSlug || vendorId) || null);
    loadVendorData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vendorId]);

  // Entering /saved while shop is still "checking" would hide the full-page skeleton (saved route) but
  // leave serverStatus stuck — avoids odd hybrid UI. Catalog is optional on saved.
  useEffect(() => {
    if (savedPage) {
      setServerStatus((prev) => (prev === 'checking' ? 'healthy' : prev));
    }
  }, [savedPage]);

  // Saved route skips full catalog — still need KV id, store name, and logo for the header (same as page-1 products response).
  useLayoutEffect(() => {
    if (!savedPage || !vendorId) return;
    const lsKey = lsVendorCatalogPage1Key(vendorId, "", "all", VENDOR_BROWSE_PAGE_SIZE);
    const fromLs = readPersistedJson<any>(lsKey, PERSISTED_CATALOG_TTL_MS);
    if (fromLs && typeof fromLs === "object") {
      setStoreName(vendorStoreNameFromCatalog(vendorId, fromLs));
      const logo = vendorStoreLogoFromCatalog(fromLs);
      if (logo) setStoreLogo(logo);
      if (typeof fromLs.storePhone === "string" && fromLs.storePhone.trim()) {
        setStorePhone(fromLs.storePhone.trim());
      }
      applyMetaPixelFromCatalog(fromLs);
    }
  }, [savedPage, vendorId, applyMetaPixelFromCatalog]);

  useEffect(() => {
    if (!savedPage) return;
    let cancelled = false;
    void (async () => {
      try {
        const data = await fetchVendorProducts(vendorId, { page: 1, pageSize: 1 });
        if (cancelled) return;
        setCanonicalVendorId(data.resolvedVendorId ?? vendorId);
        applyStoreNameIfPresent(data.storeName);
        setStoreLogo((prev) => data.logo || prev);
        setStorePhone(data.storePhone?.trim() || VENDOR_DEFAULT_STORE_PHONE);
        applyMetaPixelFromCatalog(data);
      } catch {
        if (!cancelled) setCanonicalVendorId(vendorId);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [vendorId, savedPage, applyStoreNameIfPresent, applyMetaPixelFromCatalog]);

  useEffect(() => {
    if (isVendorProductDetailPath && selectedProduct) return;
    const t = setTimeout(() => {
      const raw = searchQuery.trim();
      setDebouncedVendorServerQ(
        raw.length >= VENDOR_SEARCH_MIN_SERVER_CHARS ? raw : ""
      );
    }, VENDOR_SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [searchQuery, isVendorProductDetailPath, selectedProduct]);

  useLayoutEffect(() => {
    if (savedPage) return;
    const qRaw = debouncedVendorServerQ.trim();
    const qk = qRaw.toLowerCase();
    const pageSize = qRaw ? VENDOR_SEARCH_PAGE_SIZE : VENDOR_BROWSE_PAGE_SIZE;
    const cat = vendorCatalogServerCategory;
    const prevCat = prevCatalogCategoryRef.current;
    if (prevCat !== null && prevCat !== cat && !qRaw && productsRef.current.length > 0) {
      const st = vendorCatalogStateRef.current;
      rememberVendorCatalogSlice(prevCat, {
        products: productsRef.current,
        total: st.total,
        page: st.page,
        hasMore: st.hasMore,
      });
    }
    prevCatalogCategoryRef.current = cat;
    const cacheKey = CACHE_KEYS.vendorProductsPage(vendorId, 1, qk, cat, pageSize);

    if (!qRaw) {
      const memSlice = readCatalogSliceForKey(catalogSliceMemoryKey(cat));
      if (memSlice && Array.isArray(memSlice.products)) {
        if (shouldApplyCachedCatalogSlice(memSlice, cat)) {
          applyVendorCatalogSlice(memSlice);
        }
        return;
      }
    }

    const fromMem = moduleCache.peek<any>(cacheKey);
    if (fromMem && typeof fromMem === "object" && Array.isArray(fromMem.products)) {
      const slice = {
        products: fromMem.products || [],
        total: typeof fromMem.total === "number" ? fromMem.total : 0,
        page: typeof fromMem.page === "number" ? fromMem.page : 1,
        hasMore: !!fromMem.hasMore,
      };
      if (shouldApplyCachedCatalogSlice(slice, cat)) {
        applyVendorCatalogSlice(slice);
      }
      if (!qRaw) rememberVendorCatalogSlice(cat, slice);
      if (typeof fromMem.storeName === "string" && fromMem.storeName.trim()) {
        setStoreName(vendorStoreNameFromCatalog(vendorId, fromMem));
      }
      if (typeof fromMem.logo === "string") {
        setStoreLogo((prev) => fromMem.logo || prev);
      }
      if (typeof fromMem.storePhone === "string" && fromMem.storePhone.trim()) {
        setStorePhone(fromMem.storePhone.trim());
      }
      return;
    }
    if (qRaw) return;
    const lsKey = lsVendorCatalogPage1Key(vendorId, qk, cat, pageSize);
    const fromLs = readPersistedJson<any>(lsKey, PERSISTED_CATALOG_TTL_MS);
    if (fromLs && typeof fromLs === "object" && Array.isArray(fromLs.products)) {
      const slice = {
        products: fromLs.products || [],
        total: typeof fromLs.total === "number" ? fromLs.total : 0,
        page: typeof fromLs.page === "number" ? fromLs.page : 1,
        hasMore: !!fromLs.hasMore,
      };
      if (shouldApplyCachedCatalogSlice(slice, cat)) {
        applyVendorCatalogSlice(slice);
      }
      rememberVendorCatalogSlice(cat, slice);
      if (typeof fromLs.storeName === "string" && fromLs.storeName.trim()) {
        setStoreName(vendorStoreNameFromCatalog(vendorId, fromLs));
      }
      if (typeof fromLs.logo === "string") {
        setStoreLogo((prev) => fromLs.logo || prev);
      }
      if (typeof fromLs.storePhone === "string" && fromLs.storePhone.trim()) {
        setStorePhone(fromLs.storePhone.trim());
      }
      return;
    }

    const interim = clientFilterProductsForCatalogCategory(productsRef.current, cat);
    if (interim.length === 0 && productsRef.current.length > 0) {
      setVendorCatalogRefetching(true);
    }
  }, [
    vendorId,
    debouncedVendorServerQ,
    vendorCatalogServerCategory,
    savedPage,
    catalogSliceMemoryKey,
    applyVendorCatalogSlice,
    rememberVendorCatalogSlice,
    shouldApplyCachedCatalogSlice,
    readCatalogSliceForKey,
    clientFilterProductsForCatalogCategory,
  ]);

  /** Refetch browse/search catalog when vendor, search query, or category tab changes. */
  useEffect(() => {
    if (savedPage) return;
    if (vendorCatalogFilterMountSkipRef.current) {
      vendorCatalogFilterMountSkipRef.current = false;
      return;
    }
    const qRaw = debouncedVendorServerQ.trim();
    const fetchKey = qRaw
      ? `${vendorId}|${qRaw.toLowerCase()}|${catalogCategoryForFetch}`
      : `${vendorId}|browse|${catalogCategoryForFetch}`;
    if (fetchKey === vendorCatalogFetchKeyRef.current) return;
    vendorCatalogFetchKeyRef.current = fetchKey;
    if (vendorCatalogRefetchDebounceRef.current) {
      clearTimeout(vendorCatalogRefetchDebounceRef.current);
    }
    const refetchDebounceMs = debouncedVendorServerQ.trim() ? 180 : 0;
    vendorCatalogRefetchDebounceRef.current = setTimeout(() => {
      vendorCatalogRefetchDebounceRef.current = null;
      const runId = ++vendorCatalogRefetchRunRef.current;
      void (async () => {
        try {
          const qRaw = debouncedVendorServerQ.trim();
          const qk = qRaw.toLowerCase();
          const pageSize = qRaw ? VENDOR_SEARCH_PAGE_SIZE : VENDOR_BROWSE_PAGE_SIZE;
          const serverCat = catalogCategoryForFetch;
          if (!qRaw && vendorCatalogSliceHasMoreLoaded(serverCat)) {
            setServerStatus("healthy");
            setVendorCatalogRefetching(false);
            return;
          }
          const page1Key = CACHE_KEYS.vendorProductsPage(
            vendorId,
            1,
            qk,
            serverCat,
            pageSize
          );
          const now = Date.now();
          const lastAt = vendorCatalogRevalidateAtRef.current.get(page1Key) || 0;
          const recentEnough = now - lastAt < VENDOR_REVALIDATE_COOLDOWN_MS;
          if (moduleCache.has(page1Key) && recentEnough) {
            if (runId !== vendorCatalogRefetchRunRef.current) return;
            const fromMem = moduleCache.peek<any>(page1Key);
            if (fromMem && typeof fromMem === "object" && Array.isArray(fromMem.products)) {
              const slice = {
                products: fromMem.products || [],
                total: typeof fromMem.total === "number" ? fromMem.total : 0,
                page: typeof fromMem.page === "number" ? fromMem.page : 1,
                hasMore: !!fromMem.hasMore,
              };
              if (shouldApplyCachedCatalogSlice(slice, serverCat)) {
                applyVendorCatalogSlice(slice);
              }
              rememberVendorCatalogSlice(serverCat, slice);
            }
            setServerStatus("healthy");
            setVendorCatalogRefetching(false);
            return;
          }
          setVendorCatalogRefetching(true);
          let applied = await refetchVendorCatalogPage1(false);
          if (runId !== vendorCatalogRefetchRunRef.current) return;
          if (!applied) {
            applied = await refetchVendorCatalogPage1(true);
            if (runId !== vendorCatalogRefetchRunRef.current) return;
          }
          if (applied) {
            vendorCatalogRevalidateAtRef.current.set(page1Key, Date.now());
            setServerStatus("healthy");
          }
        } catch {
          if (runId !== vendorCatalogRefetchRunRef.current) return;
          if (productsRef.current.length === 0) {
            setServerStatus("unhealthy");
          } else {
            setServerStatus("healthy");
          }
        } finally {
          if (runId === vendorCatalogRefetchRunRef.current) {
            setVendorCatalogRefetching(false);
          }
        }
      })();
    }, refetchDebounceMs);
    return () => {
      if (vendorCatalogRefetchDebounceRef.current) {
        clearTimeout(vendorCatalogRefetchDebounceRef.current);
        vendorCatalogRefetchDebounceRef.current = null;
      }
    };
  }, [
    vendorId,
    debouncedVendorServerQ,
    catalogCategoryForFetch,
    savedPage,
    refetchVendorCatalogPage1,
    vendorCatalogSliceHasMoreLoaded,
  ]);

  // Sync product detail from URL + catalog before paint — avoids grid/skeleton flash when opening a card.
  useLayoutEffect(() => {
    const stillOnProduct =
      matchPath({ path: "/vendor/:storeName/product/:productSlug", end: true }, location.pathname) ??
      matchPath({ path: "/vendor-:storeName/product/:productSlug", end: true }, location.pathname) ??
      matchPath({ path: "/product/:productSlug", end: true }, location.pathname);
    if (!stillOnProduct) {
      if (wasOnVendorProductRouteRef.current) {
        wasOnVendorProductRouteRef.current = false;
        restoreVendorBrowseCatalogSliceForRoute();
      }
      setSelectedProduct(null);
      return;
    }
    wasOnVendorProductRouteRef.current = true;
    const slug = productSlugFromPath ?? initialProductSlug;
    if (!slug) {
      startTransition(() => setSelectedProduct(null));
      return;
    }
    const decoded = safeDecodePathSegment(slug);
    if (!decoded) {
      startTransition(() => setSelectedProduct(null));
      return;
    }
    const fromCatalog = resolveVendorProductFromSlug(products, decoded);
    if (fromCatalog) {
      setSelectedProduct(fromCatalog);
      return;
    }
    const navState = location.state as { vendorProduct?: Product } | null | undefined;
    const fromNav = navState?.vendorProduct;
    if (fromNav?.id) {
      // Prefer strict match; fall back to segment/sku/id equality (encoding & case differ on some hosts).
      if (resolveVendorProductFromSlug([fromNav], decoded)) {
        setSelectedProduct(fromNav);
        return;
      }
      const seg = buildVendorProductUrlSegment(fromNav);
      const dec = decoded.trim();
      if (
        seg === dec ||
        seg.toLowerCase() === dec.toLowerCase() ||
        (fromNav.sku && String(fromNav.sku).trim().toLowerCase() === dec.toLowerCase()) ||
        fromNav.id === dec
      ) {
        setSelectedProduct(fromNav);
        return;
      }
    }
    startTransition(() => setSelectedProduct(null));
  }, [
    productSlugFromPath,
    initialProductSlug,
    products,
    location.pathname,
    location.state,
    restoreVendorBrowseCatalogSliceForRoute,
  ]);

  // Shop grid and /product/* share this scroll root. Only snap to top when opening or switching
  // product URLs — not when leaving /product → home (avoids a white flash / jump on slow networks).
  useLayoutEffect(() => {
    if (savedPage) return;
    const st = location.state as { vendorVariantNav?: boolean } | null | undefined;
    if (st?.vendorVariantNav) return;
    const slugRaw = productSlugFromPath ?? initialProductSlug ?? "";
    const slug = String(slugRaw).trim();
    const prev = lastVendorProductSlugForScrollRef.current;
    lastVendorProductSlugForScrollRef.current = slug || undefined;
    if (!slug) return;
    if (prev === slug) return;
    const el = vendorScrollRootRef.current;
    if (el) el.scrollTop = 0;
    lastVendorScrollTopRef.current = 0;
    setVendorNavbarSticky(false);
  }, [productSlugFromPath, initialProductSlug, savedPage, location.pathname]);

  useEffect(() => {
    if (savedPage) return;
    const slug = productSlugFromPath ?? initialProductSlug;
    if (!slug) return;
    const decoded = safeDecodePathSegment(slug);
    if (!decoded) return;
    const stillOnProduct =
      matchPath({ path: "/vendor/:storeName/product/:productSlug", end: true }, location.pathname) ??
      matchPath({ path: "/vendor-:storeName/product/:productSlug", end: true }, location.pathname) ??
      matchPath({ path: "/product/:productSlug", end: true }, location.pathname);
    if (!stillOnProduct) return;
    if (resolveVendorProductFromSlug(products, decoded)) return;

    let cancelled = false;
    void (async () => {
      try {
        const data = await fetchVendorProducts(vendorId, {
          resolveSlug: decoded,
          pageSize: 1,
        });
        const p = data.products?.[0] as Product | undefined;
        if (cancelled || !p) return;
        setSelectedProduct(p);
        setProducts((prev) => (prev.some((x) => x.id === p.id) ? prev : [...prev, p]));
      } catch {
        /* ignore */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [savedPage, productSlugFromPath, initialProductSlug, products, vendorId, location.pathname]);

  const handleAddToCart = (product: Product, overrides?: VendorAddToCartOverrides): boolean => {
    try {
      let variantForStock: any = null;
      if (overrides?.variantSku && product.variants?.length) {
        variantForStock = product.variants.find(
          (v: any) => String(v?.sku) === String(overrides.variantSku)
        );
      }
      if (!variantForStock) {
        const selections = selectedProduct?.id === product.id ? vendorVariantSelections : {};
        variantForStock = findMatchingVariant(product, selections);
      }
      const qtyCheck =
        overrides?.quantity ??
        (selectedProduct?.id === product.id ? quantity : 1);
      if (!canPurchase(product, variantForStock, qtyCheck)) {
        toast.error(t("storefront.product.outOfStockTitle"));
        return false;
      }

      const parseNum = (x: unknown, fallback: number) => {
        if (x == null || x === "") return fallback;
        const n = typeof x === "number" ? x : parseFloat(String(x).replace(/[^0-9.-]/g, ""));
        return Number.isFinite(n) ? n : fallback;
      };

      let variant: any = null;
      if (overrides?.variantSku && product.variants?.length) {
        variant = product.variants.find(
          (v: any) => String(v?.sku) === String(overrides.variantSku)
        );
      }
      if (!variant) {
        const selections = selectedProduct?.id === product.id ? vendorVariantSelections : {};
        variant = findMatchingVariant(product, selections);
      }

      const qty =
        overrides?.quantity ??
        (selectedProduct?.id === product.id ? quantity : 1);

      const price =
        overrides?.variantPrice != null
          ? overrides.variantPrice
          : variant != null
            ? parseNum(variant.price, product.price)
            : product.price;
      const sku = (variant?.sku as string | undefined) || product.sku;
      const inventory =
        variant != null
          ? typeof variant.inventory === "number"
            ? variant.inventory
            : parseNum(variant.inventory, product.inventory)
          : product.inventory;
      const image =
        overrides?.variantImage ||
        (variant?.image as string | undefined) ||
        (product.images && product.images.length > 0 ? product.images[0] : "");
      const cartId = variant?.sku ? `${product.id}:${String(variant.sku)}` : product.id;

      const cr = (product as { commissionRate?: unknown }).commissionRate;
      const snapRate =
        typeof cr === "number" && Number.isFinite(cr)
          ? cr
          : typeof cr === "string" && cr.trim() !== ""
            ? parseFloat(cr.replace(/[^0-9.-]/g, ""))
            : NaN;
      const commissionPatch = Number.isFinite(snapRate)
        ? { commissionRate: snapRate }
        : {};

      if (overrides?.buyNow) {
        // Buy Now bypasses the cart — checkout reads a one-shot localStorage override only.
        try {
          const checkoutPathOnly = normalizeCheckoutStoragePath(checkoutPath);
          const miniKey = `checkout-mini-summary:${checkoutPathOnly}`;
          const buyNowKey = `checkout-buy-now:${checkoutPathOnly}`;
          const oneItemPayload = {
            items: [
              {
                id: cartId,
                sku,
                name: product.name,
                price: Number(price) || 0,
                image: image || "",
                quantity: Number(qty) || 1,
                productId: product.id,
              },
            ],
            total: (Number(price) || 0) * (Number(qty) || 1),
            savedAt: new Date().toISOString(),
          };
          localStorage.setItem(miniKey, JSON.stringify(oneItemPayload));
          localStorage.setItem(buyNowKey, JSON.stringify(oneItemPayload));
        } catch {
          /* ignore localStorage failures */
        }
        setQuantity(1);
        setCartOpen(false);
        navigate(checkoutPath);
        return true;
      }

      addToCart(
        {
          id: cartId,
          sku,
          name: product.name,
          price,
          image,
          productId: product.id,
          inventory,
          vendorId: vendorId,
          ...commissionPatch,
        },
        qty
      );
      if (metaPixelId) {
        trackMetaAddToCart({
          id: String(product.id),
          sku,
          name: String(product.name || sku),
          price: Number(price) || 0,
          quantity: qty,
        });
      }
      setQuantity(1);
      if (typeof window !== "undefined" && window.innerWidth >= 768) {
        setCartOpen(true);
      }
      return true;
    } catch (error) {
      console.error('Error adding to cart:', error);
      return false;
    }
  };

  // Format price in MMK format (matching main storefront)
  const formatPriceMMK = (price: string | number): string => {
    const numPrice = typeof price === 'string' ? parseFloat(price.replace(/[^0-9.-]+/g, '')) : price;
    return `${Math.round(numPrice)} MMK`;
  };

  // Wishlist — same API as main storefront (global product IDs)
  const [wishlist, setWishlist] = useState<string[]>([]);
  /** False until initial GET finishes (or no user) — avoids empty-state flash on /saved */
  const [wishlistServerLoaded, setWishlistServerLoaded] = useState(() => !resolveUserIdFromRecord(user));
  /** True while fetchProductsByIds is in flight for current wishlist */
  const [savedProductsFetchPending, setSavedProductsFetchPending] = useState(false);
  /** Sorted JSON snapshot from last GET/PUT — skip redundant PUTs and block PUT before hydration */
  const wishlistServerSnapshotRef = useRef<string | null>(null);
  /** Bumped when user toggles wishlist so a slow GET does not overwrite in-flight local state */
  const lastWishlistLocalChangeRef = useRef(0);
  const vendorAccountVisibilityLastRef = useRef(0);
  const wishlistUserId = resolveUserIdFromRecord(user);

  /** Tab visible: one throttled bundle (profile + wishlist) so account UI catches up without spamming the API */
  useEffect(() => {
    const onVis = () => {
      if (document.visibilityState !== "visible") return;
      const now = Date.now();
      if (now - vendorAccountVisibilityLastRef.current < VENDOR_ACCOUNT_VISIBILITY_RESYNC_MIN_MS) {
        return;
      }
      vendorAccountVisibilityLastRef.current = now;
      void refreshVendorProfileFromServer();
      const raw = localStorage.getItem("migoo-user");
      if (!raw) return;
      let parsed: unknown;
      try {
        parsed = JSON.parse(raw);
      } catch {
        return;
      }
      const uid = resolveUserIdFromRecord(parsed as Record<string, unknown>);
      if (!uid) return;
      const started = Date.now();
      void wishlistApi
        .get(uid)
        .then((res) => {
          if (lastWishlistLocalChangeRef.current > started) return;
          const ids = res.productIds || [];
          setWishlist(ids);
          wishlistServerSnapshotRef.current = JSON.stringify([...ids].sort());
        })
        .catch(() => {});
    };
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, [refreshVendorProfileFromServer]);

  // Restore wishlist ids before paint so /saved and header badge don’t wait on GET every navigation.
  useLayoutEffect(() => {
    if (!wishlistUserId) {
      setWishlist([]);
      setWishlistServerLoaded(true);
      return;
    }
    const cached = readPersistedJson<string[]>(
      lsWishlistProductIdsKey(wishlistUserId),
      PERSISTED_CATALOG_TTL_MS
    );
    if (cached != null && Array.isArray(cached) && cached.every((x) => typeof x === "string")) {
      setWishlist(cached);
      wishlistServerSnapshotRef.current = JSON.stringify([...cached].sort());
      setWishlistServerLoaded(true);
    } else {
      setWishlist([]);
      setWishlistServerLoaded(false);
    }
  }, [wishlistUserId]);

  useEffect(() => {
    if (!wishlistUserId) {
      setWishlist([]);
      wishlistServerSnapshotRef.current = null;
      return;
    }
    const fetchStartedAt = Date.now();
    let cancelled = false;
    void wishlistApi
      .get(wishlistUserId)
      .then((res) => {
        if (cancelled) return;
        const ids = res.productIds || [];
        const snap = JSON.stringify([...ids].sort());
        if (lastWishlistLocalChangeRef.current <= fetchStartedAt) {
          setWishlist(ids);
        }
        wishlistServerSnapshotRef.current = snap;
      })
      .catch(() => {
        if (cancelled) return;
        wishlistServerSnapshotRef.current = "[]";
      })
      .finally(() => {
        if (!cancelled) setWishlistServerLoaded(true);
      });
    return () => {
      cancelled = true;
    };
  }, [wishlistUserId]);

  // Cross-device realtime wishlist sync via KV row updates.
  useEffect(() => {
    if (!wishlistUserId) return;
    const primaryKey = `wishlist:${wishlistUserId}`;
    const compatKey = `customer:${wishlistUserId}:wishlist`;
    const onWishlistChange = (payload: any) => {
      const ids = normalizeWishlistFromKvValue(payload?.new?.value);
      const nextSnap = JSON.stringify([...ids].sort());
      if (nextSnap === wishlistServerSnapshotRef.current) return;
      wishlistServerSnapshotRef.current = nextSnap;
      setWishlist(ids);
    };

    const primary = supabase
      .channel(`vendor-wishlist-sync-primary-${wishlistUserId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "kv_store_16010b6f",
          filter: `key=eq.${primaryKey}`,
        },
        onWishlistChange,
      )
      .subscribe();
    const compat = supabase
      .channel(`vendor-wishlist-sync-compat-${wishlistUserId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "kv_store_16010b6f",
          filter: `key=eq.${compatKey}`,
        },
        onWishlistChange,
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(primary);
      void supabase.removeChannel(compat);
    };
  }, [wishlistUserId]);

  useEffect(() => {
    if (!wishlistUserId) return;
    if (wishlistServerSnapshotRef.current === null) return;
    const next = JSON.stringify([...wishlist].sort());
    if (next === wishlistServerSnapshotRef.current) return;
    const t = setTimeout(() => {
      wishlistApi
        .update(wishlistUserId, wishlist)
        .then(() => {
          wishlistServerSnapshotRef.current = next;
        })
        .catch(() => {});
    }, 250);
    return () => clearTimeout(t);
  }, [wishlist, wishlistUserId]);

  useEffect(() => {
    if (!wishlistUserId || !wishlistServerLoaded) return;
    writePersistedJson(lsWishlistProductIdsKey(wishlistUserId), wishlist);
  }, [wishlist, wishlistUserId, wishlistServerLoaded]);

  const wishlistVendorMatchKeys = useMemo(
    () => expandVendorWishlistMatchKeys(vendorId, canonicalVendorId),
    [vendorId, canonicalVendorId]
  );

  const productBelongsToWishlistVendorKeys = useCallback(
    (p: any) => {
      const pid = String(p.vendorId ?? "");
      const pv = String(p.vendor ?? "");
      for (const key of wishlistVendorMatchKeys) {
        if (pid === key || pv === key) return true;
        if (Array.isArray(p.selectedVendors)) {
          if (p.selectedVendors.some((x: string) => String(x) === key)) return true;
        }
      }
      return false;
    },
    [wishlistVendorMatchKeys]
  );

  const wishlistSig = useMemo(() => wishlistSigFromProductIds(wishlist), [wishlist]);

  // Products in the user's wishlist that belong to this vendor (header badge + /saved page).
  // Server-side pagination + moduleCache + localStorage (aligned with vendor catalog).
  useEffect(() => {
    if (wishlist.length === 0) {
      setSavedDisplayProducts([]);
      setSavedVendorWishlistTotal(0);
      setSavedWishlistPage(1);
      setSavedWishlistHasMore(false);
      setSavedWishlistLoadingMore(false);
      setSavedProductsFetchPending(false);
      return;
    }
    if (!wishlistUserId) {
      setSavedProductsFetchPending(false);
      return;
    }
    let cancelled = false;
    const pageSize = VENDOR_SAVED_PAGE_SIZE;
    const cacheKey = CACHE_KEYS.vendorSavedWishlistPage(
      wishlistUserId,
      vendorId,
      wishlistSig,
      1,
      pageSize
    );
    const lsKey = lsVendorSavedWishlistPageKey(wishlistUserId, vendorId, wishlistSig, 1, pageSize);

    const applySavedPage1 = (payload: VendorWishlistVendorPageResult) => {
      moduleCache.prime(cacheKey, payload);
      const merged = mergeSavedWishlistPageWithCatalog(
        payload.products as Product[],
        wishlist,
        productsRef.current
      );
      if (!cancelled) {
        setSavedDisplayProducts(merged);
        setSavedVendorWishlistTotal(payload.total);
        setSavedWishlistHasMore(!!payload.hasMore);
        setSavedWishlistPage(1);
      }
    };

    let syncHydrated = false;
    const fromLsPrime = readPersistedJson<VendorWishlistVendorPageResult>(lsKey, PERSISTED_CATALOG_TTL_MS);
    if (
      fromLsPrime &&
      typeof fromLsPrime === "object" &&
      Array.isArray(fromLsPrime.products) &&
      typeof fromLsPrime.total === "number"
    ) {
      applySavedPage1(fromLsPrime);
      syncHydrated = true;
    } else {
      const peeked = moduleCache.peek<VendorWishlistVendorPageResult>(cacheKey);
      if (
        peeked &&
        typeof peeked === "object" &&
        Array.isArray(peeked.products) &&
        typeof peeked.total === "number"
      ) {
        applySavedPage1(peeked);
        syncHydrated = true;
      }
    }

    if (!syncHydrated) {
      setSavedProductsFetchPending(true);
    }
    setSavedWishlistLoadingMore(false);
    void (async () => {
      try {
        const data = await moduleCache.get(cacheKey, () =>
          fetchVendorWishlistVendorPage({
            vendorStorefront: vendorId,
            resolvedVendorId: canonicalVendorId,
            productIds: wishlist,
            page: 1,
            pageSize,
          }),
          false
        );
        if (cancelled) return;
        const merged = mergeSavedWishlistPageWithCatalog(
          data.products as Product[],
          wishlist,
          productsRef.current
        );
        setSavedDisplayProducts(merged);
        setSavedVendorWishlistTotal(data.total);
        setSavedWishlistHasMore(data.hasMore);
        setSavedWishlistPage(1);
        writePersistedJson(lsKey, data);
      } catch {
        if (cancelled) return;
        const byId = new Map(productsRef.current.map((p) => [p.id, p]));
        const ordered = wishlist
          .map((id) => byId.get(id))
          .filter(
            (p): p is Product => Boolean(p) && productBelongsToWishlistVendorKeys(p)
          );
        setSavedDisplayProducts(ordered);
        setSavedVendorWishlistTotal(ordered.length);
        setSavedWishlistHasMore(false);
        setSavedWishlistPage(1);
      } finally {
        if (!cancelled) setSavedProductsFetchPending(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [
    wishlist,
    wishlistSig,
    wishlistUserId,
    vendorId,
    canonicalVendorId,
    productBelongsToWishlistVendorKeys,
  ]);

  const loadMoreSavedWishlist = useCallback(async () => {
    if (!savedWishlistHasMore || savedWishlistLoadingMore || wishlist.length === 0 || !wishlistUserId) {
      return;
    }
    const pageSize = VENDOR_SAVED_PAGE_SIZE;
    const nextPage = savedWishlistPage + 1;
    const cacheKey = CACHE_KEYS.vendorSavedWishlistPage(
      wishlistUserId,
      vendorId,
      wishlistSig,
      nextPage,
      pageSize
    );
    const lsKey = lsVendorSavedWishlistPageKey(
      wishlistUserId,
      vendorId,
      wishlistSig,
      nextPage,
      pageSize
    );
    setSavedWishlistLoadingMore(true);
    try {
      const fromLs = readPersistedJson<VendorWishlistVendorPageResult>(lsKey, PERSISTED_CATALOG_TTL_MS);
      if (
        fromLs &&
        typeof fromLs === "object" &&
        Array.isArray(fromLs.products) &&
        typeof fromLs.total === "number"
      ) {
        moduleCache.prime(cacheKey, fromLs);
      }
      const data = await moduleCache.get(cacheKey, () =>
        fetchVendorWishlistVendorPage({
          vendorStorefront: vendorId,
          resolvedVendorId: canonicalVendorId,
          productIds: wishlist,
          page: nextPage,
          pageSize,
        }),
        false
      );
      writePersistedJson(lsKey, data);
      const merged = mergeSavedWishlistPageWithCatalog(
        data.products as Product[],
        wishlist,
        productsRef.current
      );
      setSavedDisplayProducts((prev) => [...prev, ...merged]);
      setSavedWishlistPage(nextPage);
      setSavedWishlistHasMore(data.hasMore);
    } catch {
      /* keep existing rows */
    } finally {
      setSavedWishlistLoadingMore(false);
    }
  }, [
    savedWishlistHasMore,
    savedWishlistLoadingMore,
    wishlist,
    wishlistUserId,
    vendorId,
    wishlistSig,
    canonicalVendorId,
    savedWishlistPage,
  ]);

  const vendorCachedSearchMatches = useMemo(() => {
    const q = searchQuery.trim();
    if (!q) return [];
    return products
      .filter((product) => productMatchesVendorClientSearch(product, q))
      .slice(0, VENDOR_SEARCH_PREVIEW_LIMIT);
  }, [products, searchQuery]);

  /** Instant client filter on loaded rows (name/SKU) — pairs with debounced server fetch for q. */
  const filteredProducts = useMemo(() => {
    return products.filter((product) => {
      const matchesSearch = productMatchesVendorClientSearch(product, searchQuery);
      let matchesCategory = true;
      if (catalogCategoryForFetch !== "all") {
        if (isVendorUncategorizedFilter(catalogCategoryForFetch)) {
          matchesCategory = !vendorCategorizedProductIds.has(String(product.id || "").trim());
        } else {
          const vendorCategoryProductIds = vendorCategoryProductIdsByName.get(
            String(catalogCategoryForFetch).trim().toLowerCase()
          );
          matchesCategory = !!vendorCategoryProductIds?.has(String(product.id || "").trim());
        }
      }
      return matchesSearch && matchesCategory;
    });
  }, [
    products,
    searchQuery,
    catalogCategoryForFetch,
    vendorCategoryProductIdsByName,
    vendorCategorizedProductIds,
  ]);

  /** Skeleton while category/search catalog refetch is in flight — never flash empty states mid-load. */
  const isCategoryCatalogStale = useMemo(() => {
    if (savedPage || isVendorProductDetailPath) return false;
    const raw = searchQuery.trim();
    if (raw.length >= VENDOR_SEARCH_MIN_SERVER_CHARS) {
      if (raw.toLowerCase() !== debouncedVendorServerQ.trim().toLowerCase()) return true;
    }
    return vendorCatalogRefetching;
  }, [
    savedPage,
    isVendorProductDetailPath,
    searchQuery,
    debouncedVendorServerQ,
    vendorCatalogRefetching,
  ]);

  /** Page-1 target: server fetch + skeleton fill both use 12 slots on browse tabs. */
  const catalogPageTargetSize = VENDOR_BROWSE_PAGE_SIZE;

  /** During refetch, show client-matched rows immediately; server rows replace them when fetch completes. */
  const catalogStalePreviewProducts = useMemo(() => {
    if (!isCategoryCatalogStale) return filteredProducts;

    const filterRow = (product: Product) => {
      const matchesSearch = productMatchesVendorClientSearch(product, searchQuery);
      let matchesCategory = true;
      if (catalogCategoryForFetch !== "all") {
        if (isVendorUncategorizedFilter(catalogCategoryForFetch)) {
          matchesCategory = !vendorCategorizedProductIds.has(String(product.id || "").trim());
        } else {
          const vendorCategoryProductIds = vendorCategoryProductIdsByName.get(
            String(catalogCategoryForFetch).trim().toLowerCase()
          );
          matchesCategory = !!vendorCategoryProductIds?.has(String(product.id || "").trim());
        }
      }
      return matchesSearch && matchesCategory;
    };

    const byId = new Map<string, Product>();
    const ingest = (rows: Product[]) => {
      for (const p of rows) {
        if (!filterRow(p)) continue;
        byId.set(String(p.id), p);
      }
    };

    ingest(products);
    if (!debouncedVendorServerQ.trim()) {
      const allSlice = readCatalogSliceForKey(catalogSliceMemoryKey("all"));
      if (allSlice?.products?.length) ingest(allSlice.products);
      if (catalogCategoryForFetch !== "all") {
        const catSlice = readCatalogSliceForKey(catalogSliceMemoryKey(catalogCategoryForFetch));
        if (catSlice?.products?.length) ingest(catSlice.products);
      }
    }

    return [...byId.values()].slice(0, catalogPageTargetSize);
  }, [
    isCategoryCatalogStale,
    filteredProducts,
    products,
    searchQuery,
    catalogCategoryForFetch,
    debouncedVendorServerQ,
    catalogPageTargetSize,
    readCatalogSliceForKey,
    catalogSliceMemoryKey,
    vendorCategoryProductIdsByName,
    vendorCategorizedProductIds,
  ]);

  const catalogVisibleProducts = isCategoryCatalogStale
    ? catalogStalePreviewProducts
    : filteredProducts;

  const catalogSkeletonFillCount = useMemo(() => {
    if (!isCategoryCatalogStale) return 0;
    return Math.max(0, catalogPageTargetSize - catalogVisibleProducts.length);
  }, [isCategoryCatalogStale, catalogPageTargetSize, catalogVisibleProducts.length]);

  const showCatalogProductGrid = useMemo(
    () =>
      serverStatus === "healthy" &&
      (isCategoryCatalogStale || catalogVisibleProducts.length > 0),
    [serverStatus, isCategoryCatalogStale, catalogVisibleProducts.length]
  );

  /** Full-page skeleton on /saved: wishlist GET or first product hydration — not while refetching with cards visible */
  const showSavedPageSkeleton = useMemo(
    () =>
      savedPage &&
      ((!!wishlistUserId && !wishlistServerLoaded) ||
        (wishlist.length > 0 &&
          savedProductsFetchPending &&
          savedDisplayProducts.length === 0)),
    [
      savedPage,
      wishlistUserId,
      wishlistServerLoaded,
      wishlist.length,
      savedProductsFetchPending,
      savedDisplayProducts.length,
    ]
  );

  const showVendorStorefrontFullSkeleton = useMemo(
    () =>
      serverStatus === "checking" &&
      vendorViewMode === "storefront" &&
      !savedPage &&
      !isVendorProductDetailPath &&
      products.length === 0,
    [
      serverStatus,
      vendorViewMode,
      savedPage,
      isVendorProductDetailPath,
      products.length,
    ]
  );

  const catalogListTotalForDisplay = vendorCatalogTotal;

  const showVendorProductRouteSkeleton = useMemo(
    () =>
      vendorViewMode === "storefront" &&
      isVendorProductDetailPath &&
      !selectedProduct,
    [vendorViewMode, isVendorProductDetailPath, selectedProduct]
  );

  const showVendorPageFullSkeleton = useMemo(
    () =>
      vendorViewMode === "storefront" &&
      (showVendorStorefrontFullSkeleton ||
        showVendorProductRouteSkeleton ||
        (savedPage && showSavedPageSkeleton)),
    [
      vendorViewMode,
      showVendorStorefrontFullSkeleton,
      showVendorProductRouteSkeleton,
      savedPage,
      showSavedPageSkeleton,
    ]
  );

  const { setSuppressFloatingChat } = useLoading();

  const suppressFloatingChatForVendorShell = useMemo(
    () =>
      showVendorPageFullSkeleton ||
      (vendorViewMode === "storefront" && isVendorProductDetailPath && !selectedProduct),
    [
      showVendorPageFullSkeleton,
      vendorViewMode,
      isVendorProductDetailPath,
      selectedProduct,
    ]
  );

  useEffect(() => {
    setSuppressFloatingChat(suppressFloatingChatForVendorShell);
    return () => setSuppressFloatingChat(false);
  }, [suppressFloatingChatForVendorShell, setSuppressFloatingChat]);

  const toggleWishlist = (productId: string, productName?: string, optimisticProduct?: Product | null) => {
    if (!user) {
      toast.error(t("storefront.account.signInRequiredToast"));
      setShowAuthModal(true);
      setAuthMode("login");
      return;
    }

    lastWishlistLocalChangeRef.current = Date.now();
    const wasListed = wishlist.includes(productId);
    const label = (productName || "Product").trim() || "Product";
    // Header badge must update immediately; `vendor` is often a display name (e.g. "Go Go") not an id.
    const togglingOpenDetailProduct =
      optimisticProduct != null &&
      selectedProduct?.id === productId &&
      optimisticProduct.id === productId;
    const belongsToThisStore =
      optimisticProduct != null &&
      (productBelongsToWishlistVendorKeys(optimisticProduct) ||
        productVendorIdsMatchStorefront(optimisticProduct, vendorId, canonicalVendorId) ||
        togglingOpenDetailProduct);
    if (wishlistUserId) {
      invalidateVendorSavedWishlistCaches(wishlistUserId, vendorId);
    }
    if (wasListed) {
      const vis = savedDisplayProducts.some((p) => p.id === productId);
      if (belongsToThisStore || vis) {
        setSavedVendorWishlistTotal((t) => Math.max(0, t - 1));
      }
    } else if (belongsToThisStore) {
      setSavedVendorWishlistTotal((t) => t + 1);
    }
    const nextWishlist = wasListed
      ? wishlist.filter((id) => id !== productId)
      : [...wishlist, productId];
    setWishlist(nextWishlist);
    if (wishlistUserId) {
      writePersistedJson(lsWishlistProductIdsKey(wishlistUserId), nextWishlist);
      const body = JSON.stringify({ productIds: nextWishlist });
      const bodySize = new Blob([body]).size;
      void fetch(
        `https://${projectId}.supabase.co/functions/v1/make-server-16010b6f/wishlist/${wishlistUserId}`,
        {
          method: "PUT",
          headers: {
            Authorization: `Bearer ${publicAnonKey}`,
            "Content-Type": "application/json",
          },
          body,
          ...(bodySize <= 64 * 1024 ? { keepalive: true } : {}),
        }
      )
        .then(() => {
          wishlistServerSnapshotRef.current = JSON.stringify([...nextWishlist].sort());
        })
        .catch(() => {});
    }
    setSavedDisplayProducts((prev) => {
      if (wasListed) return prev.filter((p) => p.id !== productId);
      if (!optimisticProduct) return prev;
      if (prev.some((p) => p.id === productId)) return prev;
      return [...prev, optimisticProduct];
    });
    toast.success(
      wasListed
        ? t("storefront.product.removedFromWishlist").replace("{name}", label)
        : t("storefront.product.addedToWishlist").replace("{name}", label)
    );
  };

  const vendorDetailDisplay = useMemo(() => {
    if (!selectedProduct) return null;
    const v = findMatchingVariant(selectedProduct, vendorVariantSelections);
    const parseNum = (x: unknown, fallback: number) => {
      if (x == null || x === "") return fallback;
      const n = typeof x === "number" ? x : parseFloat(String(x).replace(/[^0-9.-]/g, ""));
      return Number.isFinite(n) ? n : fallback;
    };
    let images: string[] = [];
    if (selectedProduct.hasVariants && selectedProduct.variants?.length) {
      const imgs = selectedProduct.variants
        .map((x: any) => x?.image)
        .filter((img: any) => typeof img === "string" && img.length > 0);
      if (imgs.length > 0) images = [...new Set(imgs)] as string[];
    }
    if (images.length === 0) images = selectedProduct.images?.length ? [...selectedProduct.images] : [];
    const price = v != null ? parseNum(v.price, selectedProduct.price) : selectedProduct.price;
    let compareAtPrice: number | undefined = selectedProduct.compareAtPrice;
    if (v != null && v.compareAtPrice != null && v.compareAtPrice !== "") {
      compareAtPrice = parseNum(v.compareAtPrice, selectedProduct.compareAtPrice ?? 0);
    }
    const inventory =
      v != null
        ? typeof v.inventory === "number"
          ? v.inventory
          : parseNum(v.inventory, selectedProduct.inventory)
        : selectedProduct.inventory;
    const sku = (v?.sku as string | undefined) || selectedProduct.sku;
    return { variant: v, price, compareAtPrice, inventory, sku, images };
  }, [selectedProduct, vendorVariantSelections]);

  useEffect(() => {
    setVendorProductImageIndex(0);
  }, [selectedProduct?.id]);

  useEffect(() => {
    if (!selectedProduct?.hasVariants || vendorEffectiveVariantOptions.length === 0) {
      setVendorVariantSelections({});
      return;
    }
    const slug = productSlugFromPath ?? initialProductSlug ?? "";
    const decoded = slug ? safeDecodePathSegment(slug) : "";
    const fromSlug = decoded ? variantSelectionsFromSlug(selectedProduct, decoded) : null;
    setVendorVariantSelections(fromSlug ?? defaultVariantSelections(selectedProduct));
  }, [selectedProduct?.id, productSlugFromPath, initialProductSlug, vendorEffectiveVariantOptions.length]);

  useEffect(() => {
    if (!selectedProduct?.hasVariants || !selectedProduct.variants?.length) return;
    const v = findMatchingVariant(selectedProduct, vendorVariantSelections);
    if (!v?.image) return;
    let images: string[] = [];
    const raw = selectedProduct.variants
      .map((x: any) => x?.image)
      .filter((img: any) => typeof img === "string" && img.length > 0);
    if (raw.length > 0) images = [...new Set(raw)] as string[];
    else images = selectedProduct.images?.length ? [...selectedProduct.images] : [];
    const idx = images.indexOf(v.image as string);
    if (idx >= 0) setVendorProductImageIndex(idx);
  }, [selectedProduct, vendorVariantSelections]);

  if (showCheckout) {
    return (
      <div className="h-screen min-h-0 overflow-y-auto overflow-x-hidden bg-slate-50 scrollbar-thin">
        <Checkout
          onBack={navigateStoreHome}
          storeName={storeName}
          vendorId={vendorId}
          vendorName={storeName}
          metaPixelId={metaPixelId}
          accountUser={user}
          onOrderPlacedSuccess={(ctx) => {
            if (ctx?.userId) invalidateCustomerOrdersCache(ctx.userId);
          }}
        />
      </div>
    );
  }

  // Product Detail View (inline, not modal)
  if (
    selectedProduct &&
    vendorViewMode === "storefront" &&
    !savedPage &&
    isVendorProductDetailPath
  ) {
    const dd = vendorDetailDisplay;
    const galleryImages =
      dd && dd.images.length > 0 ? dd.images : selectedProduct.images?.length ? selectedProduct.images : [];
    const safeMainIdx =
      galleryImages.length > 0
        ? Math.min(Math.max(0, vendorProductImageIndex), galleryImages.length - 1)
        : 0;
    const displayPriceVal = dd?.price ?? selectedProduct.price;
    const displayCompareAt = dd?.compareAtPrice;
    const displaySkuVal = dd?.sku ?? selectedProduct.sku;
    const vendorStockVariant = dd?.variant ?? findMatchingVariant(selectedProduct, vendorVariantSelections);
    const vendorOutOfStock = isOutOfStockDisplay(selectedProduct, vendorStockVariant, quantity);
    const vendorCanPurchase = canPurchase(selectedProduct, vendorStockVariant, quantity);
    const vendorLowStock = showLowStockBadge(selectedProduct, vendorStockVariant);

    return (
      <>
        <div
          ref={vendorScrollRootRef}
          key="vendor-storefront-shell"
          className="h-screen min-h-0 overflow-y-auto overflow-x-hidden bg-white scrollbar-thin flex flex-col"
        >
        <ServerStatusBanner
          status={serverStatus}
          onRetry={() => loadVendorData(true)}
          showCheckingScreen={false}
        />
        
        <CartDrawer 
          isOpen={cartOpen} 
          onClose={() => setCartOpen(false)} 
          onCheckout={() => {
            setCartOpen(false);
            navigate(checkoutPath);
          }}
          user={user}
          onShowAuthModal={() => {
            setShowAuthModal(true);
            setAuthMode('login');
          }}
        />

        {/* Header - Same as main storefront */}
        <header
          className={`shrink-0 ${vendorNavbarSticky ? "sticky top-0" : "relative"} z-40 bg-white shadow-[0_2px_10px_-2px_rgba(15,23,42,0.08)] transition-all duration-300`}
        >
          <div className="border-b border-[rgba(15,23,42,0.08)]">
            <div className="max-w-7xl mx-auto w-full px-4">
            {/* Top Bar — mobile: icons absolutely at content right edge (aligns with product grid); md+: flex row */}
            <div className="relative flex h-16 items-center md:justify-between md:gap-3">
              <button
                type="button"
                onClick={() => {
                  setSearchQuery("");
                  setSelectedCategory("all");
                  navigateStoreHome();
                }}
                className="flex min-w-0 max-w-full items-center gap-2 overflow-hidden pr-[9.25rem] text-left group md:max-w-xs md:flex-initial md:pr-0"
                aria-label={`${storeName} — home`}
              >
                {storeLogo ? (
                  <CacheFriendlyImg
                    src={storeLogo}
                    alt=""
                    priority
                    logo
                    className="w-9 h-9 md:w-10 md:h-10 rounded-xl object-cover ring-2 ring-slate-100 shrink-0"
                  />
                ) : (
                  <div className="w-9 h-9 md:w-10 md:h-10 bg-slate-900 rounded-xl flex items-center justify-center shrink-0">
                    <Store className="w-5 h-5 text-white" />
                  </div>
                )}
                <span
                  className="text-slate-700 text-base md:text-lg lg:text-xl uppercase font-bold truncate min-w-0"
                  style={{ fontFamily: "Rubik, sans-serif", letterSpacing: "0.05em" }}
                >
                  {storeName}
                </span>
              </button>

              <div className="hidden min-w-0 flex-1 justify-center px-2 md:flex">
                <div className="relative w-full max-w-lg">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
                  <Input
                    placeholder={t("storefront.search.placeholder")}
                    value={searchQuery}
                    onChange={(e) => handleVendorSearchInputChange(e.target.value)}
                    onKeyDown={handleVendorSearchKeyDown}
                    className="pl-10 h-10 rounded-lg bg-slate-50 border-slate-200 focus:bg-white"
                  />
                  {searchQuery.trim() ? (
                    <div className="absolute top-full left-0 right-0 z-50 mt-1 overflow-hidden rounded-lg border border-slate-200 bg-white shadow-lg">
                      {vendorCachedSearchMatches.length > 0 ? (
                        <ul className="max-h-72 overflow-y-auto py-1">
                          {vendorCachedSearchMatches.map((product) => (
                            <li key={product.id}>
                              <button
                                type="button"
                                onClick={() => openVendorProductFromSearch(product)}
                                className="flex w-full items-center gap-3 px-3 py-2.5 text-left hover:bg-slate-50 transition-colors"
                              >
                                {product.images?.[0] ? (
                                  <CacheFriendlyImg
                                    src={product.images[0]}
                                    alt=""
                                    className="h-10 w-10 rounded-md object-cover shrink-0"
                                  />
                                ) : (
                                  <div className="h-10 w-10 rounded-md bg-slate-100 shrink-0" />
                                )}
                                <div className="min-w-0 flex-1">
                                  <p className="text-sm font-medium text-slate-900 truncate">{product.name}</p>
                                  {product.sku ? (
                                    <p className="text-xs text-slate-500">{product.sku}</p>
                                  ) : null}
                                </div>
                              </button>
                            </li>
                          ))}
                        </ul>
                      ) : (
                        <p className="px-3 py-2.5 text-sm text-slate-500">
                          {t("storefront.search.noMatches")}
                        </p>
                      )}
                      <div className="border-t border-slate-100 px-3 py-2 text-xs text-slate-500">
                        {t("storefront.search.enterHint")}
                      </div>
                    </div>
                  ) : null}
                </div>
              </div>

              <div className="absolute right-0 top-1/2 z-10 flex -translate-y-1/2 items-center gap-0 md:static md:z-auto md:translate-y-0 md:gap-1">
                {renderStorefrontLanguageMenu()}

                <Button
                  variant="ghost"
                  size="icon"
                  className="relative hidden md:flex hover:bg-slate-100 rounded-full h-10 w-10 shrink-0"
                  onClick={goToSavedProducts}
                  title={t("storefront.savedProducts")}
                >
                  <Heart className="w-5 h-5 text-slate-700" />
                  {savedVendorWishlistTotal > 0 && (
                    <Badge className="absolute -top-1 -right-1 w-5 h-5 flex items-center justify-center p-0 bg-amber-600 text-white text-xs border-2 border-white">
                      {savedVendorWishlistTotal}
                    </Badge>
                  )}
                </Button>

                <Button
                  variant="ghost"
                  size="icon"
                  className="relative hover:bg-slate-100 md:hidden h-9 w-9 shrink-0 p-0"
                  onClick={() => {
                    setVendorMobileNavOpen(false);
                    setVendorMobileSearchOpen(true);
                  }}
                  aria-label={t("storefront.search")}
                >
                  <Search className="w-[1.15rem] h-[1.15rem] text-slate-700" />
                </Button>

                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => setCartOpen(true)}
                  className="relative hover:bg-slate-100 rounded-full h-9 w-9 shrink-0 p-0 md:h-10 md:w-10"
                  aria-label={t("storefront.cart")}
                >
                  <ShoppingCart className="w-[1.15rem] h-[1.15rem] md:w-5 md:h-5 text-slate-700" />
                  {totalItems > 0 && (
                    <Badge className="absolute -top-0.5 -right-0.5 min-h-[1.125rem] min-w-[1.125rem] flex items-center justify-center p-0 text-[10px] bg-amber-600 text-white border border-white md:-top-1 md:-right-1 md:h-5 md:w-5 md:text-xs md:border-2">
                      {totalItems}
                    </Badge>
                  )}
                </Button>

                <Button
                  variant="ghost"
                  size="icon"
                  className="relative hover:bg-slate-100 md:hidden h-9 w-9 shrink-0 p-0"
                  onClick={goToSavedProducts}
                  aria-label={t("storefront.savedProducts")}
                >
                  <Heart className="w-[1.15rem] h-[1.15rem] text-slate-700" />
                  {savedVendorWishlistTotal > 0 && (
                    <Badge className="absolute -top-0.5 -right-0.5 min-h-[1.125rem] min-w-[1.125rem] flex items-center justify-center p-0 text-[10px] bg-amber-600 text-white border border-white">
                      {savedVendorWishlistTotal}
                    </Badge>
                  )}
                </Button>

                <div className="hidden md:flex shrink-0 [&_button]:h-10 [&_button]:w-10 [&_button]:p-0 [&_svg]:size-5">
                  <NotificationCenter chatUnreadCount={chatUnreadCount} onChatClick={openFloatingChat} />
                </div>

                {!user && (
                  <Button
                    variant="ghost"
                    className="hidden md:flex items-center text-slate-700 hover:bg-slate-100 font-medium h-10 px-4 whitespace-nowrap shrink-0"
                    onClick={() => {
                      setShowAuthModal(true);
                      setAuthMode("login");
                    }}
                  >
                    {t("storefront.loginRegister")}
                  </Button>
                )}

                {user && (
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button variant="ghost" size="icon" className="hidden md:flex hover:bg-slate-100 rounded-full w-10 h-10 p-0 shrink-0">
                        {userProfileImageUrl && !profileImageLoadFailed ? (
                          <CacheFriendlyImg
                            src={userProfileImageUrl}
                            alt={user.name}
                            className="size-[21px] rounded-full object-cover ring-1 ring-slate-200/80"
                            onError={() => setProfileImageLoadFailed(true)}
                          />
                        ) : (
                          <User className="w-5 h-5 text-slate-700" />
                        )}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-56 p-2" align="end">
                      <div className="space-y-1">
                        <div className="px-3 py-2 border-b border-slate-200 mb-2 flex items-center gap-3">
                          {userProfileImageUrl && !profileImageLoadFailed ? (
                            <CacheFriendlyImg
                              src={userProfileImageUrl}
                              alt={user.name}
                              className="w-8 h-8 rounded-full object-cover flex-shrink-0"
                              onError={() => setProfileImageLoadFailed(true)}
                            />
                          ) : (
                            <div className="w-8 h-8 rounded-full bg-gradient-to-br from-amber-500 to-orange-600 flex items-center justify-center flex-shrink-0">
                              <User className="w-4 h-4 text-white" />
                            </div>
                          )}
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-semibold text-slate-900 truncate">{user.name}</p>
                            <p className="text-xs text-slate-600 truncate">{user.email}</p>
                          </div>
                        </div>
                        <Button variant="ghost" className="w-full justify-start text-slate-700 hover:bg-slate-100" onClick={() => handleProfileAction("view-profile")}>
                          <Eye className="w-4 h-4 mr-3" />
                          {t("storefront.account.viewProfile")}
                        </Button>
                        <Button variant="ghost" className="w-full justify-start text-slate-700 hover:bg-slate-100" onClick={() => handleProfileAction("edit-profile")}>
                          <Pencil className="w-4 h-4 mr-3" />
                          {t("storefront.account.editProfile")}
                        </Button>
                        <Button variant="ghost" className="w-full justify-start text-slate-700 hover:bg-slate-100" onClick={() => handleProfileAction("order-history")}>
                          <Package className="w-4 h-4 mr-3" />
                          {t("storefront.account.orderHistory")}
                        </Button>
                        <Button variant="ghost" className="w-full justify-start text-slate-700 hover:bg-slate-100" onClick={() => handleProfileAction("shipping-addresses")}>
                          <MapPin className="w-4 h-4 mr-3" />
                          {t("storefront.account.shippingAddresses")}
                        </Button>
                        <Button variant="ghost" className="w-full justify-start text-slate-700 hover:bg-slate-100" onClick={() => handleProfileAction("security-settings")}>
                          <Shield className="w-4 h-4 mr-3" />
                          {t("storefront.account.securitySettings")}
                        </Button>
                        <Separator className="my-2" />
                        <Button variant="ghost" className="w-full justify-start text-red-600 hover:bg-red-50" onClick={handleLogout}>
                          <LogOut className="w-4 h-4 mr-3" />
                          {t("storefront.account.logout")}
                        </Button>
                      </div>
                    </PopoverContent>
                  </Popover>
                )}

                <Button
                  variant="ghost"
                  size="icon"
                  className="md:hidden hover:bg-slate-100 rounded-full h-9 w-9 shrink-0 p-0"
                  onClick={() => {
                    setVendorMobileSearchOpen(false);
                    setVendorMobileNavOpen(true);
                  }}
                  aria-label={t("storefront.openMenu")}
                >
                  <Menu className="w-[1.15rem] h-[1.15rem] text-slate-700" />
                </Button>
              </div>
            </div>
            </div>
          </div>
          {renderVendorStorefrontSubnav()}
        </header>

        {renderVendorMobileNavDrawer()}
        {renderVendorMobileSearchOverlay()}

        {/* Product Details Content */}
        <main className="flex-1 max-w-7xl mx-auto w-full px-4 pt-3 sm:pt-4 md:px-6 md:pt-5 lg:px-8 pb-[calc(5.5rem+env(safe-area-inset-bottom,0px))] md:pb-5">
          {/* Breadcrumb */}
          <div className="flex items-center gap-1.5 text-xs text-slate-500 mb-3">
            <button onClick={() => {
              setSearchQuery("");
              setSelectedCategory("all");
              navigateStoreHome();
            }} className="hover:text-amber-700 transition-colors whitespace-nowrap text-xs">
              Home
            </button>
            {selectedProduct.category && (
              <>
                <ChevronRight className="w-3 h-3 flex-shrink-0" />
                <button onClick={() => {
                  setSelectedProduct(null);
                  setSelectedCategory(selectedProduct.category);
                  navigate(categoryPathForName(selectedProduct.category), { replace: false });
                }} className="hover:text-amber-700 transition-colors whitespace-nowrap text-xs">
                  {selectedProduct.category}
                </button>
              </>
            )}
            <ChevronRight className="w-3 h-3 flex-shrink-0" />
            <span className="text-xs truncate max-w-[200px] sm:max-w-md">{selectedProduct.name || 'Product'}</span>
          </div>

          <div className="grid lg:grid-cols-2 gap-4 sm:gap-6 md:gap-8 lg:gap-12 mb-8 sm:mb-12 md:mb-16">
            {/* Product Images */}
            <div className="space-y-2 sm:space-y-3 md:space-y-4">
              <div className="aspect-square bg-slate-50 rounded-xl sm:rounded-2xl overflow-hidden border-2 border-slate-200 shadow-lg">
                <CacheFriendlyImg
                  key={`${selectedProduct.id}-${safeMainIdx}`}
                  src={galleryImages[safeMainIdx] || selectedProduct.images[0]}
                  alt={selectedProduct.name}
                  priority
                  className="w-full h-full object-cover"
                />
              </div>
              {galleryImages.length > 1 && (
                <div className="flex gap-2 justify-start flex-wrap">
                  {galleryImages.map((image, idx) => (
                    <button
                      key={`${image}-${idx}`}
                      type="button"
                      onClick={() => setVendorProductImageIndex(idx)}
                      className={`w-14 h-14 sm:w-24 sm:h-24 bg-slate-50 rounded-md overflow-hidden border-2 transition-all flex-shrink-0 ${
                        idx === safeMainIdx
                          ? "border-amber-600 ring-2 ring-amber-200"
                          : "border-slate-200 hover:border-amber-600"
                      }`}
                    >
                      <CacheFriendlyImg src={image} alt={`${selectedProduct.name} ${idx + 1}`} className="w-full h-full object-cover" />
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Product Info */}
            <div className="flex flex-col gap-6">
              {/* Title and Category */}
              <div>
                <div className="flex items-center gap-2 mb-2.5 flex-wrap">
                  {selectedProduct.category && (
                    <Badge className="bg-amber-100 text-amber-800 hover:bg-amber-200 border border-amber-300 text-xs font-medium px-2.5 py-0.5">{selectedProduct.category}</Badge>
                  )}
                  <Badge
                    className={
                      vendorOutOfStock
                        ? "bg-red-100 text-red-800 hover:bg-red-200 border border-red-300 text-xs font-medium px-2.5 py-0.5"
                        : "bg-emerald-100 text-emerald-800 hover:bg-emerald-200 border border-emerald-300 text-xs font-medium px-2.5 py-0.5"
                    }
                  >
                    {vendorOutOfStock ? t("storefront.product.outOfStockTitle") : t("storefront.product.inStock")}
                  </Badge>
                </div>
                <h1 className="text-sm sm:text-base font-semibold text-slate-900 mb-2 leading-tight">
                  {selectedProduct.name || t("storefront.product.product")}
                </h1>
                <div className="flex items-center gap-2 flex-wrap">
                  <div className="flex items-center gap-0.5">
                    {[...Array(5)].map((_, i) => (
                      <Star key={i} className="w-3.5 h-3.5 fill-amber-400 text-amber-400" />
                    ))}
                  </div>
                  <span className="text-xs text-slate-600 font-medium">
                    {(selectedProduct.rating ?? 4.8).toFixed(1)}/5.0
                  </span>
                  <Separator orientation="vertical" className="h-3 hidden sm:block" />
                  <span className="text-xs text-slate-600">{selectedProduct.reviewCount ?? 0} {t("storefront.product.sold")}</span>
                </div>
              </div>

              {/* Price */}
              <Card className="bg-gradient-to-br from-slate-50 to-slate-100 shadow-md border-0">
                <CardContent className="px-4 py-[17px]">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-base sm:text-lg font-bold text-slate-900">
                      {formatPriceMMK(displayPriceVal)}
                    </span>
                    {displayCompareAt != null && displayCompareAt > displayPriceVal && (
                      <>
                        <span className="text-sm text-slate-400 line-through">{formatPriceMMK(displayCompareAt)}</span>
                        <Badge className="bg-gradient-to-r from-emerald-600 to-teal-600 text-white border-0 text-xs">
                          {t("storefront.product.savePercent").replace(
                            "{percent}",
                            String(Math.round(((displayCompareAt - displayPriceVal) / displayCompareAt) * 100))
                          )}
                        </Badge>
                      </>
                    )}
                  </div>
                  {selectedProduct.hasVariants && (
                    <p className="text-[11px] text-slate-500 mt-3 font-medium">SKU: {displaySkuVal}</p>
                  )}
                  {!selectedProduct.hasVariants && (
                    <p className="text-[11px] text-slate-500 mt-3 font-medium">SKU: {selectedProduct.sku}</p>
                  )}
                </CardContent>
              </Card>

              {selectedProduct.hasVariants && vendorEffectiveVariantOptions.length > 0 && (
                  <div className="space-y-6">
                    {vendorEffectiveVariantOptions.map((option: { name: string; values: string[] }) => (
                      <div key={option.name}>
                        <div className="mb-2.5">
                          <span className="text-sm font-semibold text-slate-900">{option.name}</span>
                          {vendorVariantSelections[option.name] && (
                            <span className="ml-2 text-sm font-normal text-slate-600">
                              - {vendorVariantSelections[option.name]}
                            </span>
                          )}
                        </div>
                        <div className="flex flex-wrap gap-2">
                          {option.values.map((value: string) => (
                            <Button
                              key={value}
                              type="button"
                              onClick={() => {
                                const next = { ...vendorVariantSelections, [option.name]: value };
                                setVendorVariantSelections(next);
                                const v = findMatchingVariant(selectedProduct, next);
                                if (v?.sku && typeof v.sku === "string" && v.sku.trim()) {
                                  const segment = cleanAsciiUrlSegment(v.sku) || v.sku.trim();
                                  navigate(`${storeBase}/product/${encodeURIComponent(segment)}`, {
                                    replace: true,
                                    state: {
                                      vendorProduct: selectedProduct,
                                      vendorVariantNav: true,
                                    },
                                  });
                                }
                              }}
                              variant={vendorVariantSelections[option.name] === value ? "default" : "outline"}
                              className={`min-w-[70px] h-9 text-sm font-medium px-4 ${
                                vendorVariantSelections[option.name] === value
                                  ? "bg-amber-600 hover:bg-amber-700 text-white"
                                  : "border-slate-300 hover:border-slate-400"
                              }`}
                            >
                              {value}
                            </Button>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                )}

              {/* Action Buttons — desktop inline only */}
              <div className="md:order-2 hidden md:flex gap-2 items-center">
                <Button
                  disabled={!vendorCanPurchase}
                  className={!vendorCanPurchase
                    ? "bg-slate-300 h-10 font-semibold rounded-lg text-sm px-6 cursor-not-allowed flex items-center justify-center transition-all py-0"
                    : "bg-amber-600 hover:bg-amber-700 h-10 font-semibold transition-all rounded-lg text-sm px-6 flex items-center justify-center py-0"
                  }
                  onClick={() => {
                    if (!vendorCanPurchase) return;
                    handleAddToCart(selectedProduct);
                  }}
                >
                  <span className="block leading-none">
                    {vendorOutOfStock ? t("storefront.product.outOfStock") : t("storefront.product.addToCart")}
                  </span>
                </Button>
                <Button 
                  disabled={!vendorCanPurchase}
                  variant="outline"
                  className={!vendorCanPurchase
                    ? "h-10 border-2 border-slate-300 bg-slate-100 text-slate-400 font-semibold rounded-lg text-sm px-6 cursor-not-allowed flex items-center justify-center transition-all py-0"
                    : "h-10 border-2 border-amber-600 hover:bg-amber-50 hover:border-amber-700 text-amber-700 hover:text-amber-800 font-semibold transition-all rounded-lg text-sm px-6 flex items-center justify-center py-0"
                  }
                  onClick={() => {
                    if (!vendorCanPurchase) return;
                    handleAddToCart(selectedProduct, { buyNow: true });
                  }}
                >
                  <span className="block leading-none">
                    {t("storefront.product.buyNow")}
                  </span>
                </Button>
                <Button 
                  variant="outline"
                  className="h-10 w-10 p-0 border-2 border-slate-300 hover:bg-slate-100 hover:border-slate-400 flex items-center justify-center flex-shrink-0 transition-all rounded-lg"
                  onClick={() => toggleWishlist(selectedProduct.id, selectedProduct.name, selectedProduct)}
                >
                  <Heart className={`w-4 h-4 ${wishlist.includes(selectedProduct.id) ? "fill-amber-600 text-amber-600" : "text-slate-600"}`} />
                </Button>
              </div>

              {/* Trust Badges */}
              <div className="order-3 md:order-3 grid grid-cols-3 gap-2 sm:gap-4 pt-6 border-t border-slate-200">
                <div className="text-center">
                  <div className="w-10 h-10 sm:w-12 sm:h-12 bg-emerald-100 rounded-full flex items-center justify-center mx-auto mb-1 sm:mb-2">
                    <Truck className="w-5 h-5 sm:w-6 sm:h-6 text-emerald-700" />
                  </div>
                  <p className="text-[10px] sm:text-xs font-medium text-slate-700">{t("storefront.product.freeDelivery")}</p>
                </div>
                <div className="text-center">
                  <div className="w-10 h-10 sm:w-12 sm:h-12 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-1 sm:mb-2">
                    <Shield className="w-5 h-5 sm:w-6 sm:h-6 text-blue-700" />
                  </div>
                  <p className="text-[10px] sm:text-xs font-medium text-slate-700">{t("storefront.product.buyerProtection")}</p>
                </div>
                <div className="text-center">
                  <div className="w-10 h-10 sm:w-12 sm:h-12 bg-amber-100 rounded-full flex items-center justify-center mx-auto mb-1 sm:mb-2">
                    <RefreshCw className="w-5 h-5 sm:w-6 sm:h-6 text-amber-700" />
                  </div>
                  <p className="text-[10px] sm:text-xs font-medium text-slate-700">{t("storefront.product.returns")}</p>
                </div>
              </div>

              {/* Product Details — desktop: above buttons; mobile: below sticky purchase bar */}
              <Card className="order-2 md:order-1 border border-slate-200 shadow-sm">
                <CardContent className="p-5">
                  <h3 className="font-semibold text-slate-900 mb-5 text-sm">{t("storefront.product.details")}</h3>
                  <div className="grid grid-cols-2 gap-x-8 gap-y-5">
                    <div className="flex items-start gap-3">
                      <Package className="w-[18px] h-[18px] text-amber-600 mt-px flex-shrink-0" />
                      <div className="min-w-0">
                        <p className="text-[10px] text-slate-500 mb-1 font-normal uppercase tracking-wide">{t("storefront.product.condition")}</p>
                        <p className="font-medium text-slate-900 text-sm">{t("storefront.product.brandNew")}</p>
                      </div>
                    </div>
                    <div className="flex items-start gap-3">
                      <Store className="w-[18px] h-[18px] text-amber-600 mt-px flex-shrink-0" />
                      <div className="min-w-0">
                        <p className="text-[10px] text-slate-500 mb-1 font-normal uppercase tracking-wide">{t("storefront.product.soldBy")}</p>
                        <p className="font-medium text-slate-900 text-sm truncate">{storeName}</p>
                      </div>
                    </div>
                    <div className="flex items-start gap-3">
                      <TrendingUp className="w-[18px] h-[18px] text-amber-600 mt-px flex-shrink-0" />
                      <div className="min-w-0">
                        <p className="text-[10px] text-slate-500 mb-1 font-normal uppercase tracking-wide">{t("storefront.product.availability")}</p>
                        <div className="flex items-center gap-2">
                          <p className={`font-medium text-sm ${
                            vendorOutOfStock
                              ? "text-red-600"
                              : vendorLowStock
                                ? "text-amber-600"
                                : "text-emerald-700"
                          }`}>
                            {getEffectiveInventory(selectedProduct, vendorStockVariant)} {t("storefront.product.units")}
                          </p>
                          {vendorOutOfStock && (
                            <Badge variant="outline" className="bg-red-50 text-red-600 border-red-200 text-xs">
                              {t("storefront.product.outOfStock")}
                            </Badge>
                          )}
                          {vendorLowStock && (
                            <Badge variant="outline" className="bg-amber-50 text-amber-600 border-amber-200 text-xs">
                              {t("storefront.product.lowStock")}
                            </Badge>
                          )}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-start gap-3">
                      <Truck className="w-[18px] h-[18px] text-amber-600 mt-px flex-shrink-0" />
                      <div className="min-w-0">
                        <p className="text-[10px] text-slate-500 mb-1 font-normal uppercase tracking-wide">{t("storefront.product.delivery")}</p>
                        <p className="font-medium text-slate-900 text-sm">{t("storefront.product.complimentary")}</p>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>

          {/* Mobile sticky purchase bar — fixed bottom, not shown on desktop */}
          <div className="md:hidden fixed inset-x-0 bottom-0 z-50 border-t border-slate-200 bg-white/95 backdrop-blur-sm px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom,0px))] shadow-[0_-4px_20px_rgba(15,23,42,0.08)]">
            <div className="flex gap-2 items-center max-w-7xl mx-auto">
              <Button
                disabled={!vendorCanPurchase}
                className={!vendorCanPurchase
                  ? "flex-1 min-w-0 bg-slate-300 h-11 font-semibold rounded-lg text-sm cursor-not-allowed flex items-center justify-center transition-all py-0"
                  : "flex-1 min-w-0 bg-amber-600 hover:bg-amber-700 h-11 font-semibold transition-all rounded-lg text-sm flex items-center justify-center py-0"
                }
                onClick={() => {
                  if (!vendorCanPurchase) return;
                  handleAddToCart(selectedProduct);
                }}
              >
                <span className="block leading-none truncate">
                  {vendorOutOfStock ? t("storefront.product.outOfStock") : t("storefront.product.addToCart")}
                </span>
              </Button>
              <Button
                disabled={!vendorCanPurchase}
                variant="outline"
                className={!vendorCanPurchase
                  ? "flex-1 min-w-0 h-11 border-2 border-slate-300 bg-slate-100 text-slate-400 font-semibold rounded-lg text-sm cursor-not-allowed flex items-center justify-center transition-all py-0"
                  : "flex-1 min-w-0 h-11 border-2 border-amber-600 hover:bg-amber-50 hover:border-amber-700 text-amber-700 hover:text-amber-800 font-semibold transition-all rounded-lg text-sm flex items-center justify-center py-0"
                }
                onClick={() => {
                  if (!vendorCanPurchase) return;
                  handleAddToCart(selectedProduct, { buyNow: true });
                }}
              >
                <span className="block leading-none truncate">{t("storefront.product.buyNow")}</span>
              </Button>
              <Button
                variant="outline"
                className="h-11 w-11 shrink-0 p-0 border-2 border-slate-300 hover:bg-slate-100 hover:border-slate-400 flex items-center justify-center transition-all rounded-lg"
                onClick={() => toggleWishlist(selectedProduct.id, selectedProduct.name, selectedProduct)}
              >
                <Heart className={`w-4 h-4 ${wishlist.includes(selectedProduct.id) ? "fill-amber-600 text-amber-600" : "text-slate-600"}`} />
              </Button>
            </div>
          </div>

          {/* Full Product Description Section */}
          <div className="mb-8">
            <Card className="border border-slate-200 shadow-sm">
              <CardContent className="p-6">
                <h2 className="text-xl font-bold text-slate-900 mb-4">{t("storefront.product.description")}</h2>
                <div className="prose prose-slate max-w-none">
                  {/* Description Text */}
                  <div className="text-slate-700 leading-relaxed space-y-3 product-description-wrapper">
                    {selectedProduct.description && typeof selectedProduct.description === 'string' ? (
                      <>
                        {/* Render text without images */}
                        <div 
                          className="text-sm product-description-content"
                          dangerouslySetInnerHTML={{ 
                            __html: selectedProduct.description.replace(/<img[^>]*>/g, '') 
                          }}
                        />
                        
                        {/* Gallery Grid for Images */}
                        {(() => {
                          const imgRegex = /<img[^>]+src=["']([^"'>]+)["']/gi;
                          const matches = [...selectedProduct.description.matchAll(imgRegex)];
                          const imageSrcs = [...new Set(matches.map((m) => m[1]))];
                          
                          if (imageSrcs.length > 0) {
                            return (
                              <div className="mt-6">
                                <h3 className="text-sm font-semibold text-slate-700 mb-3">{t("storefront.product.images")}</h3>
                                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
                                  {imageSrcs.map((src, index) => (
                                    <div 
                                      key={index}
                                      className="relative aspect-square overflow-hidden rounded-lg bg-slate-100 group cursor-pointer"
                                      onClick={() => {
                                        setLightboxImages(imageSrcs);
                                        setLightboxIndex(index);
                                        setDescLightboxOpen(true);
                                      }}
                                    >
                                      <CacheFriendlyImg 
                                        src={src} 
                                        alt={`Product detail ${index + 1}`}
                                        className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-110"
                                      />
                                      <div className="absolute inset-0 bg-black opacity-0 group-hover:opacity-10 transition-opacity duration-300" />
                                    </div>
                                  ))}
                                </div>
                              </div>
                            );
                          }
                          return null;
                        })()}
                      </>
                    ) : (
                      <p className="text-sm">
                        {t("storefront.product.fallbackDescription")}
                      </p>
                    )}
                  </div>

                  {/* CSS for product description */}
                  <style>{`
                    .product-description-wrapper .product-description-content p {
                      margin-bottom: 12px;
                      line-height: 1.7;
                    }
                    .product-description-wrapper .product-description-content strong {
                      font-weight: 600;
                      color: rgb(15 23 42);
                    }
                    .product-description-wrapper .product-description-content h1,
                    .product-description-wrapper .product-description-content h2,
                    .product-description-wrapper .product-description-content h3 {
                      margin-top: 20px;
                      margin-bottom: 12px;
                      font-weight: 600;
                    }
                  `}</style>
                </div>
              </CardContent>
            </Card>
          </div>
        </main>

        {!showVendorPageFullSkeleton && (
          <VendorStorefrontFooter
            storeName={storeName}
            storeSlug={storeLinkSlug || canonicalPathSlug || storeSlug}
            hostRootStorePaths={hostRootStorePaths}
          />
        )}

        {/* Description image lightbox — matches marketplace full-screen gallery */}
        {descLightboxOpen && lightboxImages.length > 0 && (
          <div
            className="fixed inset-0 z-[200] flex items-center justify-center bg-black/85 p-3 sm:p-6"
            role="dialog"
            aria-modal="true"
            aria-label={t("storefront.product.gallery")}
            onClick={() => setDescLightboxOpen(false)}
          >
            <button
              type="button"
              className="absolute right-3 top-3 z-[210] flex h-10 w-10 items-center justify-center rounded-full bg-white/10 text-white backdrop-blur-sm transition hover:bg-white/20"
              onClick={(e) => {
                e.stopPropagation();
                setDescLightboxOpen(false);
              }}
              aria-label={t("storefront.product.closeGallery")}
            >
              <X className="h-5 w-5" />
            </button>

            <button
              type="button"
              disabled={lightboxIndex <= 0}
              className="absolute left-2 top-1/2 z-[210] flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full bg-white/10 text-white backdrop-blur-sm transition hover:bg-white/20 disabled:cursor-not-allowed disabled:opacity-30 sm:left-4 sm:h-12 sm:w-12"
              onClick={(e) => {
                e.stopPropagation();
                setLightboxIndex((i) => Math.max(0, i - 1));
              }}
              aria-label={t("storefront.product.previousImage")}
            >
              <ChevronLeft className="h-6 w-6 sm:h-7 sm:w-7" />
            </button>

            <button
              type="button"
              disabled={lightboxIndex >= lightboxImages.length - 1}
              className="absolute right-2 top-1/2 z-[210] flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full bg-white/10 text-white backdrop-blur-sm transition hover:bg-white/20 disabled:cursor-not-allowed disabled:opacity-30 sm:right-4 sm:h-12 sm:w-12"
              onClick={(e) => {
                e.stopPropagation();
                setLightboxIndex((i) => Math.min(lightboxImages.length - 1, i + 1));
              }}
              aria-label={t("storefront.product.nextImage")}
            >
              <ChevronRight className="h-6 w-6 sm:h-7 sm:w-7" />
            </button>

            <div
              className="relative flex max-h-[90vh] max-w-[min(96vw,1200px)] flex-col items-center justify-center"
              onClick={(e) => e.stopPropagation()}
            >
              <CacheFriendlyImg
                src={lightboxImages[lightboxIndex]}
                alt=""
                priority
                className="max-h-[min(85vh,900px)] w-auto max-w-full object-contain shadow-2xl"
              />
              <div className="pointer-events-none absolute bottom-3 left-1/2 -translate-x-1/2 rounded-full bg-black/55 px-3 py-1.5 text-sm font-medium tabular-nums text-white backdrop-blur-sm">
                {lightboxIndex + 1} / {lightboxImages.length}
              </div>
            </div>
          </div>
        )}

        {/* 🔐 Auth Modal - Available on Product Detail Page */}
        <AuthModal
          isOpen={showAuthModal}
          onClose={() => setShowAuthModal(false)}
          mode={authMode}
          onModeChange={setAuthMode}
          formData={authForm}
          onFormChange={(field, value) => setAuthForm({ ...authForm, [field]: value })}
          onLogin={handleLogin}
          onRegister={handleRegister}
          isLoading={isAuthLoading}
        />
        </div>
        {!cartOpen && (
          <>
            <BackToTop
              scrollContainerRef={vendorScrollRootRef}
              scrollContainerKey={vendorScrollRebindKey}
              aboveStickyPurchaseBar
            />
            {!showVendorPageFullSkeleton && (
              <VendorInstallFab
                storeName={storeName}
                storeLogo={storeLogo}
                pathSlug={storeLinkSlug || canonicalPathSlug || storeSlug || vendorId}
                hostRootStorePaths={hostRootStorePaths}
                aboveStickyPurchaseBar
              />
            )}
          </>
        )}
      </>
    );
  }

  // Main Storefront — h-screen + overflow-y-auto so scrollbar-thin applies (not the default body bar)
  return (
    <>
    <div
      ref={vendorScrollRootRef}
      key="vendor-storefront-shell"
      className={`h-screen min-h-0 overflow-y-auto overflow-x-hidden scrollbar-thin flex flex-col ${
        vendorViewMode !== "storefront" ? "bg-slate-50" : "bg-white"
      }`}
    >
      
      <CartDrawer 
        isOpen={cartOpen} 
        onClose={() => setCartOpen(false)} 
        onCheckout={() => {
          setCartOpen(false);
          navigate(checkoutPath);
        }}
        user={user}
        onShowAuthModal={() => {
          setShowAuthModal(true);
          setAuthMode('login');
        }}
      />

      {showVendorPageFullSkeleton ? (
        showVendorProductRouteSkeleton ? (
          <VendorStorefrontProductRouteSkeleton />
        ) : (
          <VendorStorefrontFullSkeleton
            count={10}
            savedLayout={savedPage && showSavedPageSkeleton && !showVendorStorefrontFullSkeleton}
          />
        )
      ) : (
        <>
      {/* Header */}
      <header
        className={`shrink-0 ${vendorNavbarSticky ? "sticky top-0" : "relative"} z-40 bg-white shadow-[0_2px_10px_-2px_rgba(15,23,42,0.08)] transition-all duration-300`}
      >
        <div className="border-b border-[rgba(15,23,42,0.08)]">
          <div className="max-w-7xl mx-auto w-full px-4">
          {/* Top Bar — mobile: icons flush to content right (matches product grid); md+: flex */}
          <div className="relative flex h-16 items-center md:justify-between md:gap-3">
            <button
              type="button"
              onClick={() => {
                setSearchQuery("");
                setSelectedCategory("all");
                navigateStoreHome();
              }}
              className="flex min-w-0 max-w-full items-center gap-2 overflow-hidden pr-[9.25rem] text-left group md:max-w-xs md:flex-initial md:pr-0"
              aria-label={`${storeName} — home`}
            >
              {storeLogo ? (
                <CacheFriendlyImg
                  src={storeLogo}
                  alt=""
                  priority
                  logo
                  className="w-9 h-9 md:w-10 md:h-10 rounded-xl object-cover ring-2 ring-slate-100 shrink-0"
                />
              ) : (
                <div className="w-9 h-9 md:w-10 md:h-10 bg-slate-900 rounded-xl flex items-center justify-center shrink-0">
                  <Store className="w-5 h-5 text-white" />
                </div>
              )}
              <span
                className="text-slate-700 text-base md:text-lg lg:text-xl uppercase font-bold truncate min-w-0"
                style={{ fontFamily: "Rubik, sans-serif", letterSpacing: "0.05em" }}
              >
                {storeName}
              </span>
            </button>

            <div className="hidden min-w-0 flex-1 justify-center px-2 md:flex">
              <div className="relative w-full max-w-lg">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
                <Input
                  placeholder={t("storefront.search.placeholder")}
                  value={searchQuery}
                  onChange={(e) => handleVendorSearchInputChange(e.target.value)}
                  onKeyDown={handleVendorSearchKeyDown}
                  className="pl-10 h-10 rounded-lg bg-slate-50 border-slate-200 focus:bg-white"
                />
              </div>
            </div>

            <div className="absolute right-0 top-1/2 z-10 flex -translate-y-1/2 items-center gap-0 md:static md:z-auto md:translate-y-0 md:gap-1">
              {renderStorefrontLanguageMenu()}

              <Button
                variant="ghost"
                size="icon"
                className="relative hidden md:flex hover:bg-slate-100 rounded-full h-10 w-10 shrink-0"
                onClick={goToSavedProducts}
                title={t("storefront.savedProducts")}
              >
                <Heart className="w-5 h-5 text-slate-700" />
                {savedVendorWishlistTotal > 0 && (
                  <Badge className="absolute -top-1 -right-1 w-5 h-5 flex items-center justify-center p-0 bg-amber-600 text-white text-xs border-2 border-white">
                    {savedVendorWishlistTotal}
                  </Badge>
                )}
              </Button>

              <Button
                variant="ghost"
                size="icon"
                className="relative hover:bg-slate-100 md:hidden h-9 w-9 shrink-0 p-0"
                onClick={() => {
                  setVendorMobileNavOpen(false);
                  setVendorMobileSearchOpen(true);
                }}
                aria-label={t("storefront.search")}
              >
                <Search className="w-[1.15rem] h-[1.15rem] text-slate-700" />
              </Button>

              <Button
                variant="ghost"
                size="icon"
                onClick={() => setCartOpen(true)}
                className="relative hover:bg-slate-100 h-9 w-9 shrink-0 p-0 md:h-10 md:w-10"
                aria-label={t("storefront.cart")}
              >
                <ShoppingCart className="w-[1.15rem] h-[1.15rem] md:h-5 md:w-5 text-slate-700" />
                {totalItems > 0 && (
                  <Badge className="absolute -top-0.5 -right-0.5 min-h-[1.125rem] min-w-[1.125rem] flex items-center justify-center p-0 text-[10px] bg-amber-600 text-white border border-white md:-top-1 md:-right-1 md:h-5 md:w-5 md:text-xs md:border-2">
                    {totalItems}
                  </Badge>
                )}
              </Button>

              <Button
                variant="ghost"
                size="icon"
                className="relative hover:bg-slate-100 md:hidden h-9 w-9 shrink-0 p-0"
                onClick={goToSavedProducts}
                aria-label={t("storefront.savedProducts")}
              >
                <Heart className="w-[1.15rem] h-[1.15rem] text-slate-700" />
                {savedVendorWishlistTotal > 0 && (
                  <Badge className="absolute -top-0.5 -right-0.5 min-h-[1.125rem] min-w-[1.125rem] flex items-center justify-center p-0 text-[10px] bg-amber-600 text-white border border-white">
                    {savedVendorWishlistTotal}
                  </Badge>
                )}
              </Button>

              <div className="hidden md:flex shrink-0 [&_button]:h-10 [&_button]:w-10 [&_button]:p-0 [&_svg]:size-5">
                <NotificationCenter chatUnreadCount={chatUnreadCount} onChatClick={openFloatingChat} />
              </div>

              {!user && (
                <Button
                  variant="ghost"
                  className="hidden h-10 shrink-0 items-center px-4 font-medium whitespace-nowrap text-slate-700 hover:bg-slate-100 md:flex"
                  onClick={() => {
                    setShowAuthModal(true);
                    setAuthMode("login");
                  }}
                >
                  {t("storefront.loginRegister")}
                </Button>
              )}

              {user && (
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="ghost" size="icon" className="hidden h-10 w-10 shrink-0 hover:bg-slate-100 md:flex p-0">
                      {userProfileImageUrl && !profileImageLoadFailed ? (
                        <CacheFriendlyImg
                          src={userProfileImageUrl}
                          alt={user.name}
                          className="size-[21px] rounded-full object-cover ring-1 ring-slate-200/80"
                          onError={() => setProfileImageLoadFailed(true)}
                        />
                      ) : (
                        <User className="w-5 h-5 text-slate-700" />
                      )}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-56 p-2" align="end">
                    <div className="space-y-1">
                      <div className="px-3 py-2 border-b border-slate-200 mb-2 flex items-center gap-3">
                        {userProfileImageUrl && !profileImageLoadFailed ? (
                          <CacheFriendlyImg
                            src={userProfileImageUrl}
                            alt={user.name}
                            className="w-8 h-8 rounded-full object-cover flex-shrink-0"
                            onError={() => setProfileImageLoadFailed(true)}
                          />
                        ) : (
                          <div className="w-8 h-8 rounded-full bg-gradient-to-br from-amber-500 to-orange-600 flex items-center justify-center flex-shrink-0">
                            <User className="w-4 h-4 text-white" />
                          </div>
                        )}
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold text-slate-900 truncate">{user.name}</p>
                          <p className="text-xs text-slate-600 truncate">{user.email}</p>
                        </div>
                      </div>
                      <Button variant="ghost" className="w-full justify-start text-slate-700 hover:bg-slate-100" onClick={() => handleProfileAction("view-profile")}>
                        <Eye className="w-4 h-4 mr-3" />
                        {t("storefront.account.viewProfile")}
                      </Button>
                      <Button variant="ghost" className="w-full justify-start text-slate-700 hover:bg-slate-100" onClick={() => handleProfileAction("edit-profile")}>
                        <Pencil className="w-4 h-4 mr-3" />
                        {t("storefront.account.editProfile")}
                      </Button>
                      <Button variant="ghost" className="w-full justify-start text-slate-700 hover:bg-slate-100" onClick={() => handleProfileAction("order-history")}>
                        <Package className="w-4 h-4 mr-3" />
                        {t("storefront.account.orderHistory")}
                      </Button>
                      <Button variant="ghost" className="w-full justify-start text-slate-700 hover:bg-slate-100" onClick={() => handleProfileAction("shipping-addresses")}>
                        <MapPin className="w-4 h-4 mr-3" />
                        {t("storefront.account.shippingAddresses")}
                      </Button>
                      <Button variant="ghost" className="w-full justify-start text-slate-700 hover:bg-slate-100" onClick={() => handleProfileAction("security-settings")}>
                        <Shield className="w-4 h-4 mr-3" />
                        {t("storefront.account.securitySettings")}
                      </Button>
                      <Separator className="my-2" />
                      <Button variant="ghost" className="w-full justify-start text-red-600 hover:bg-red-50" onClick={handleLogout}>
                        <LogOut className="w-4 h-4 mr-3" />
                        {t("storefront.account.logout")}
                      </Button>
                    </div>
                  </PopoverContent>
                </Popover>
              )}

              <Button
                variant="ghost"
                size="icon"
                className="md:hidden hover:bg-slate-100 rounded-full h-9 w-9 shrink-0 p-0"
                onClick={() => {
                  setVendorMobileSearchOpen(false);
                  setVendorMobileNavOpen(true);
                }}
                aria-label={t("storefront.openMenu")}
              >
                <Menu className="w-[1.15rem] h-[1.15rem] text-slate-700" />
              </Button>
            </div>
          </div>
          </div>
        </div>
        {renderVendorStorefrontSubnav()}
      </header>

      {renderVendorMobileNavDrawer()}
      {renderVendorMobileSearchOverlay()}

      {/* Content — flex-1 grows so footer sits at viewport bottom when catalog is short */}
      <main
        className={`flex-1 max-w-7xl mx-auto px-4 w-full ${
          vendorViewMode === "storefront" && savedPage ? "pt-0 pb-8" : "py-8"
        }`}
      >
        {vendorViewMode !== "storefront" ? (
          renderVendorAccountPage()
        ) : savedPage ? (
          <>
            {/* Match main storefront /saved banner: full-bleed gradient + serif title + slate subtitle */}
            <div className="w-screen max-w-none ml-[calc(50%-50vw)]">
              <div className="bg-gradient-to-r from-slate-800 to-slate-700 text-white py-10 sm:py-12 md:py-16">
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                  <div className="flex items-center gap-2 sm:gap-3 mb-3 sm:mb-4">
                    <Heart className="w-6 h-6 sm:w-7 sm:h-7 md:w-8 md:h-8 fill-white shrink-0" />
                    <h1 className="text-xl sm:text-2xl font-serif font-bold">{t("storefront.savedProducts")}</h1>
                  </div>
                  <p className="text-slate-300 text-sm min-h-[1.375rem]">
                    {(() => {
                      const n = savedVendorWishlistTotal;
                      return t("storefront.savedProducts.count").replace("{count}", String(n));
                    })()}
                  </p>
                </div>
              </div>
            </div>

            <div className="max-w-7xl mx-auto w-full pt-6 md:pt-12">
              {(() => {
                const savedHere = savedDisplayProducts;
                if (savedVendorWishlistTotal === 0 && !savedProductsFetchPending) {
                  return (
                    <Card className="text-center py-16 sm:py-20 border-0 shadow-md">
                      <Heart className="w-16 h-16 mx-auto text-slate-300 mb-4" />
                      <p className="text-lg text-slate-500 mb-2">{t("storefront.savedProducts.empty")}</p>
                      <p className="text-sm text-slate-400 mb-6">
                        {wishlist.length > 0
                          ? t("storefront.savedProducts.otherAreasHint")
                          : t("storefront.savedProducts.startHint")}
                      </p>
                      <Button onClick={() => navigateStoreHome()} className="bg-slate-900 text-white hover:bg-black">
                        {t("storefront.browseProducts")}
                      </Button>
                    </Card>
                  );
                }
                if (savedHere.length === 0) {
                  return null;
                }
                return (
                  <>
                    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3 md:gap-4 lg:gap-6">
                      {savedHere.map((product, index) => (
                        <ProductCard
                          key={product.id}
                          priority={index < 2}
                          product={productToCardProduct(product)}
                          onProductClick={() => {
                            const segment = buildVendorProductUrlSegment(product);
                            navigate(`${storeBase}/product/${encodeURIComponent(segment)}`, {
                              state: { vendorProduct: product },
                            });
                          }}
                          onAddToCart={(e, opts) => {
                            e?.stopPropagation();
                            const ok = handleAddToCart(product, {
                              variantSku: opts?.sku,
                              variantPrice:
                                opts?.price != null
                                  ? typeof opts.price === "number"
                                    ? opts.price
                                    : parseFloat(String(opts.price).replace(/[^0-9.-]/g, ""))
                                  : undefined,
                              variantImage: opts?.image,
                              quantity: opts?.quantity,
                              buyNow: opts?.buyNow,
                            });
                            if (ok) {
                              toast.success(
                                opts?.buyNow
                                  ? t("storefront.product.continueToCheckout").replace("{name}", product.name)
                                  : t("storefront.product.addedToCart").replace("{name}", product.name)
                              );
                            }
                          }}
                          onToggleWishlist={(e) => {
                            e.stopPropagation();
                            toggleWishlist(product.id, product.name, product);
                          }}
                          isWishlisted={wishlist.includes(product.id)}
                          formatPriceMMK={formatPriceMMK}
                        />
                      ))}
                    </div>
                    {savedVendorWishlistTotal > 0 && (
                      <p className="text-center text-sm text-slate-500 mt-6">
                        {t("storefront.product.showingSaved")
                          .replace("{shown}", String(savedHere.length))
                          .replace("{total}", String(savedVendorWishlistTotal))}
                      </p>
                    )}
                    {savedWishlistHasMore && (
                      <div className="flex justify-center mt-6">
                        <Button
                          type="button"
                          variant="outline"
                          className="min-w-[160px]"
                          disabled={savedWishlistLoadingMore}
                          onClick={() => void loadMoreSavedWishlist()}
                        >
                          {savedWishlistLoadingMore ? t("storefront.product.loading") : t("storefront.product.loadMore")}
                        </Button>
                      </div>
                    )}
                  </>
                );
              })()}
            </div>
          </>
        ) : (
          <>
            {/* Network / timeout — not an empty catalog or app bug */}
            {serverStatus === 'unhealthy' && (
              <div className="flex flex-col items-center justify-center py-16 sm:py-24 max-w-md mx-auto px-4 text-center">
                <div className="w-20 h-20 rounded-full bg-red-50 flex items-center justify-center mx-auto mb-6">
                  <div className="w-16 h-16 rounded-full bg-red-100 flex items-center justify-center">
                    <X className="w-8 h-8 text-red-600" aria-hidden />
                  </div>
                </div>
                <h2 className="text-lg font-bold text-slate-900 mb-2">{t("storefront.product.connectionTimeout")}</h2>
                <p className="text-slate-600 text-sm mb-6">
                  {t("storefront.product.connectionTimeoutDescription")}
                </p>
                <Button
                  onClick={() => {
                    setServerStatus('checking');
                    void loadVendorData(true);
                  }}
                  className="bg-gradient-to-r from-amber-600 to-orange-600 hover:from-amber-700 hover:to-orange-700 text-white px-8 py-3 rounded-lg"
                >
                  <RefreshCw className="w-4 h-4 mr-2" />
                  {t("storefront.product.retryConnection")}
                </Button>
              </div>
            )}

            {serverStatus === 'healthy' && !isCategoryCatalogStale && products.length === 0 && (
              <div className="text-center py-20">
                <Store className="w-16 h-16 text-slate-300 mx-auto mb-4" />
                <h3 className="text-lg font-semibold text-slate-900 mb-2">{t("storefront.product.noProductsFound")}</h3>
                <p className="text-slate-600">
                  {searchQuery ? t("storefront.product.tryAdjustingSearch") : t("storefront.product.noProductsYet")}
                </p>
              </div>
            )}

            {serverStatus === 'healthy' &&
              !isCategoryCatalogStale &&
              products.length > 0 &&
              filteredProducts.length === 0 && (
              <div className="text-center py-20">
                <Store className="w-16 h-16 text-slate-300 mx-auto mb-4" />
                <h3 className="text-lg font-semibold text-slate-900 mb-2">{t("storefront.product.noMatchingProducts")}</h3>
                <p className="text-slate-600">{t("storefront.product.tryAdjustingSearchOrCategory")}</p>
              </div>
            )}

            {showCatalogProductGrid && (
              <>
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3 md:gap-4 lg:gap-6 stagger-children">
                  {catalogVisibleProducts.map((product, index) => (
                    <ProductCard
                      key={product.id}
                      priority={index < 2}
                      product={productToCardProduct(product)}
                      onProductClick={async () => {
                        const segment = buildVendorProductUrlSegment(product);
                        navigate(`${storeBase}/product/${encodeURIComponent(segment)}`, {
                          state: { vendorProduct: product },
                        });
                      }}
                      onAddToCart={(e, opts) => {
                        e?.stopPropagation();
                        const ok = handleAddToCart(product, {
                          variantSku: opts?.sku,
                          variantPrice:
                            opts?.price != null
                              ? typeof opts.price === "number"
                                ? opts.price
                                : parseFloat(String(opts.price).replace(/[^0-9.-]/g, ""))
                              : undefined,
                          variantImage: opts?.image,
                          quantity: opts?.quantity,
                          buyNow: opts?.buyNow,
                        });
                        if (ok) {
                          toast.success(
                            opts?.buyNow
                              ? t("storefront.product.continueToCheckout").replace("{name}", product.name)
                              : t("storefront.product.addedToCart").replace("{name}", product.name)
                          );
                        }
                      }}
                      onToggleWishlist={(e) => {
                        e.stopPropagation();
                        toggleWishlist(product.id, product.name, product);
                      }}
                      isWishlisted={wishlist.includes(product.id)}
                      formatPriceMMK={formatPriceMMK}
                    />
                  ))}
                  {Array.from({ length: catalogSkeletonFillCount }).map((_, i) => (
                    <ProductCardSkeleton key={`catalog-skeleton-${i}`} />
                  ))}
                </div>
                {!isCategoryCatalogStale && catalogListTotalForDisplay > 0 && (
                  <p className="text-center text-sm text-slate-500 mt-6">
                    Showing {filteredProducts.length} of {catalogListTotalForDisplay} products
                  </p>
                )}
                {!isCategoryCatalogStale && vendorCatalogHasMore && !debouncedVendorServerQ.trim() && (
                  <div className="flex justify-center mt-6">
                    <Button
                      type="button"
                      variant="outline"
                      className="min-w-[160px]"
                      disabled={vendorCatalogLoadingMore}
                      onClick={() => void loadMoreVendorCatalog()}
                    >
                      {vendorCatalogLoadingMore ? t("storefront.product.loading") : t("storefront.product.loadMore")}
                    </Button>
                  </div>
                )}
              </>
            )}
          </>
        )}
      </main>
        </>
      )}

      {!showVendorPageFullSkeleton && (
        <VendorStorefrontFooter
          storeName={storeName}
          storeSlug={storeLinkSlug || canonicalPathSlug || storeSlug}
          hostRootStorePaths={hostRootStorePaths}
        />
      )}

      {/* 🔐 Auth Modal */}
      <AuthModal
        isOpen={showAuthModal}
        onClose={() => setShowAuthModal(false)}
        mode={authMode}
        onModeChange={setAuthMode}
        formData={authForm}
        onFormChange={(field, value) => setAuthForm({ ...authForm, [field]: value })}
        onLogin={handleLogin}
        onRegister={handleRegister}
        isLoading={isAuthLoading}
      />
    </div>
    {!cartOpen && (
      <>
        <BackToTop scrollContainerRef={vendorScrollRootRef} scrollContainerKey={vendorScrollRebindKey} />
        {!showVendorPageFullSkeleton && (
          <VendorInstallFab
            storeName={storeName}
            storeLogo={storeLogo}
            pathSlug={storeLinkSlug || canonicalPathSlug || storeSlug || vendorId}
            hostRootStorePaths={hostRootStorePaths}
          />
        )}
      </>
    )}
    </>
  );
}