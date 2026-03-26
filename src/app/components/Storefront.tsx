// Storefront Component - Cache bust: 20260317001
import { useState, useEffect, useMemo, useCallback, memo, useRef } from "react";
import { useNavigate, useLocation, useParams } from "react-router";
import { 
  ShoppingCart, Search, User, Heart, Menu, X, ChevronRight, Star, 
  Truck, Shield, RefreshCw, ArrowRight, Plus, Minus, Trash2, 
  Facebook, Twitter, Instagram, Mail, Phone, MapPin, CreditCard,
  Loader2, Package, Check, Home, Store, ChevronLeft, ChevronDown,
  Grid, List, SlidersHorizontal, Tag, TrendingUp, Clock, Zap, Filter,
  Smartphone, Laptop, Watch, Headphones, Camera, Monitor, Tablet,
  ShoppingBag, Gift, Percent, Bell, Crown, Sparkles, Dumbbell, Gamepad2, Grid3x3,
  LogOut, UserCircle, Folder, Copy, FileText, Shirt, Box, Utensils, Briefcase,
  Backpack, Sofa, Eye, EyeOff, MessageSquare, Settings, Keyboard, Mic, Pen
} from "lucide-react";
import { motion } from "motion/react";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Badge } from "./ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card";
import { Label } from "./ui/label";
import { Textarea } from "./ui/textarea";
import { Separator } from "./ui/separator";
import { Checkbox } from "./ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "./ui/popover";
import { SearchInput } from "./SearchInput";
import { CouponInput } from "./CouponInput";
import { productsApi, authApi, wishlistApi, ordersApi, customersApi, categoriesApi, blogApi, apiClient } from "../../utils/api";
import { toast } from "sonner";
import { useDebounce } from "../hooks/useDebounce";
import { useScrollAnimation } from "../hooks/useScrollAnimation";
import { useFaviconLoader } from "../hooks/useFaviconLoader";
import { projectId, publicAnonKey } from '../../../utils/supabase/info';
import { ProductGridSkeleton, ProductListSkeleton, BannerSkeleton } from "./SkeletonLoader";
import { LazyImage } from "./LazyImage";
import { CacheFriendlyImg } from "./CacheFriendlyImg";
import { apiCache, SmartCache } from "../utils/cache";
import { NotificationCenter } from "./NotificationCenter";
import { useCartVisibility } from "../contexts/CartVisibilityContext";
import { useLoading } from "../contexts/LoadingContext";
import { BannerSlider } from "./BannerSlider";
import { checkServerHealth } from "../../utils/server-health";
import { ServerStatusBanner } from "./ServerStatusBanner";
import { ProductCard } from "./ProductCard";
import {
  ProductVariantChips,
  initVariantSelections,
  matchVariantForProduct,
  productHasVariantPicker,
  getEffectiveVariantOptions,
} from "./ProductVariantChips";
import { BlogPostDetail } from "./BlogPostDetail";
import { AuthModal } from "./AuthModal";
import { OrderDetailView } from "./OrderDetailView";
import { CacheDebugPanel } from "./CacheDebugPanel";
import {
  fetchCatalogPage,
  fetchProductsByIds,
  moduleCache,
  CACHE_KEYS,
  fetchBannersApi,
  fetchFeaturedCampaignsApi,
  fetchAppearanceSettingsApi,
  getCachedProductById,
} from "../utils/module-cache";
import { loadCatalogBootstrapCached, loadCategoriesCached, loadSiteSettingsCached } from "./StorefrontCached";

// 🚀 MODULE-LEVEL CACHE - These persist across all navigations and component remounts
// This is critical for reducing Supabase API calls from 20k → ~100-500
let cachedProducts: Product[] = [];
let cachedCategories: any[] = [];
let cachedSiteSettings: any = null;

/** Throttle catalog background refresh to limit edge/DB traffic (hobby / low-volume projects). */
const CATALOG_BG_REFRESH_MIN_MS = 45 * 60 * 1000;
const CATALOG_BG_KEY = 'migoo-catalog-bg-refresh-at';

function shouldSkipCatalogBackgroundRefresh(): boolean {
  try {
    const last = Number(sessionStorage.getItem(CATALOG_BG_KEY)) || 0;
    return Date.now() - last < CATALOG_BG_REFRESH_MIN_MS;
  } catch {
    return false;
  }
}

function markCatalogBackgroundRefreshed() {
  try {
    sessionStorage.setItem(CATALOG_BG_KEY, String(Date.now()));
  } catch {
    // ignore
  }
}

/** Default page size for storefront catalog API (matches bootstrap). */
const CATALOG_PAGE_SIZE = 24;

function productFromBySkuApi(raw: any): Product {
  const img =
    Array.isArray(raw?.images) && raw.images[0]
      ? raw.images[0]
      : raw?.image || "";
  return {
    id: String(raw.id),
    image: typeof img === "string" ? img : "",
    images: Array.isArray(raw?.images) ? raw.images : undefined,
    name: String(raw.name || raw.title || ""),
    price: String(raw.price ?? ""),
    sku: String(raw.sku || ""),
    vendor: String(raw.vendor || ""),
    collaborator: String(raw.collaborator || ""),
    category: String(raw.category || ""),
    inventory: Number(raw.inventory ?? raw.stock ?? 0),
    salesVolume: Number(raw.salesVolume ?? 0),
    createDate: String(raw.createDate || raw.createdAt || ""),
    description: raw.description,
    hasVariants: raw.hasVariants,
    variantOptions: raw.variantOptions,
    variants: raw.variants,
    compareAtPrice: raw.compareAtPrice,
  };
}

/**
 * ContentAnimationWrapper - REMOVED ALL ANIMATIONS FOR INSTANT TRANSITIONS
 * Now just a passthrough wrapper (no animations)
 */
function ContentAnimationWrapper({ 
  children, 
  contentKey 
}: { 
  children: React.ReactNode; 
  contentKey: string;
}) {
  // Just render children directly with no wrapper - instant transitions
  return <>{children}</>;
}

interface Product {
  id: string;
  image: string;
  images?: string[];
  name: string;
  status: "active" | "off-shelf";
  inventory: number;
  category: string;
  price: string;
  sku: string;
  vendor: string;
  collaborator: string;
  salesVolume: number;
  createDate: string;
  description?: string;
  hasVariants?: boolean;
  variantOptions?: { name: string; values: string[] }[];
  variants?: {
    id: string;
    option1: string;
    option2?: string;
    option3?: string;
    price: string;
    compareAtPrice?: string;
    sku: string;
    barcode?: string;
    inventory: number;
    weight?: string;
  }[];
  oldVariants?: ProductVariant[]; // OLD structure for backward compatibility
}

// OLD interface - keeping for backward compatibility with old demo data
interface ProductVariant {
  id: string;
  name: string;
  type: "color" | "size" | "style";
  value: string;
  image?: string;
  priceModifier?: number; // Additional price on top of base price
  available: boolean;
}

interface User {
  id: string;
  email: string;
  name: string;
  phone?: string;
  profileImage?: string; // Storage path to profile image
  profileImageUrl?: string; // Signed URL to profile image
}

/** KV/session objects may use `id` or `userId`; never call `/user/undefined/orders`. */
function resolveUserIdFromRecord(u: unknown): string | null {
  if (!u || typeof u !== "object") return null;
  const o = u as Record<string, unknown>;
  const raw = o.id ?? o.userId;
  if (typeof raw === "string" && raw.trim().length > 0) return raw.trim();
  if (typeof raw === "number" && Number.isFinite(raw)) return String(raw);
  return null;
}

function readMigooUserFromStorage(): User | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem("migoo-user");
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const id = resolveUserIdFromRecord(parsed);
    if (!id) return null;
    return {
      ...(parsed as unknown as User),
      id,
      email: String(parsed.email ?? ""),
      name: String((parsed.name as string) ?? parsed.email ?? ""),
    };
  } catch {
    return null;
  }
}

function resolveOrderApiUserId(user: User | null): string | null {
  const fromState = resolveUserIdFromRecord(user);
  if (fromState) return fromState;
  return resolveUserIdFromRecord(readMigooUserFromStorage());
}

interface CartItem extends Product {
  quantity: number;
}

interface StorefrontProps {
  onSwitchToAdmin: () => void;
  onOrderPlaced?: () => void; // Callback to update badge counts
  onOpenVendorApplication?: () => void; // 🔥 NEW: Open vendor application form
}

interface ProductsResponse {
  products: Product[];
  total: number;
}

interface CategoriesResponse {
  categories: any[];
  total: number;
}

type ViewMode = "home" | "all-products" | "categories" | "product-detail" | "checkout" | "order-confirmation" | "saved-products" | "blog" | "blog-detail" | "view-profile" | "edit-profile" | "order-history" | "order-detail" | "shipping-addresses" | "security-settings";
type ViewType = "grid" | "list";

const categoryIcons: Record<string, any> = {
  // Your actual categories
  "Electronic": Smartphone,
  "Cosmetic": Sparkles,
  "Kitchen": Utensils,
  "Clothing": Shirt,
  "Home": Sofa,
  "bag and wallet": Backpack,
  "Watch": Watch,
  
  // Legacy/fallback categories
  Electronics: Smartphone,
  Fashion: ShoppingBag,
  "Home & Garden": Home,
  "Sporting Goods": Dumbbell,
  Toys: Gamepad2,
  Categories: Grid3x3,
  Accessories: Watch,
  Audio: Headphones,
  Computers: Laptop,
  Cameras: Camera,
  Monitors: Monitor,
  Tablets: Tablet,
  Default: Package,
};

// Predefined category groups for "Explore by Category" section
const categoryGroups = [
  "Electronics",
  "Fashion", 
  "Home & Garden",
  "Sporting Goods",
  "Toys",
  "Categories"
];

// Popular search terms for suggestions
const popularSearches = [
  "iPhone", "Samsung", "Laptop", "Headphones", "Smart Watch", 
  "Camera", "Gaming", "Fashion", "Beauty", "Home Decor"
];

// Countdown Timer Component
function CountdownTimer({ endDate }: { endDate: string }) {
  const [timeLeft, setTimeLeft] = useState(() => {
    const end = new Date(endDate).getTime();
    const now = Date.now();
    const distance = end - now;
    
    if (distance < 0) return { days: 0, hours: 0, minutes: 0, seconds: 0, expired: true };
    
    return {
      days: Math.floor(distance / (1000 * 60 * 60 * 24)),
      hours: Math.floor((distance % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60)),
      minutes: Math.floor((distance % (1000 * 60 * 60)) / (1000 * 60)),
      seconds: Math.floor((distance % (1000 * 60)) / 1000),
      expired: false
    };
  });

  useEffect(() => {
    const timer = setInterval(() => {
      const end = new Date(endDate).getTime();
      const now = Date.now();
      const distance = end - now;
      
      if (distance < 0) {
        setTimeLeft({ days: 0, hours: 0, minutes: 0, seconds: 0, expired: true });
        clearInterval(timer);
        return;
      }
      
      setTimeLeft({
        days: Math.floor(distance / (1000 * 60 * 60 * 24)),
        hours: Math.floor((distance % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60)),
        minutes: Math.floor((distance % (1000 * 60 * 60)) / (1000 * 60)),
        seconds: Math.floor((distance % (1000 * 60)) / 1000),
        expired: false
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [endDate]);

  if (timeLeft.expired) {
    return (
      <div className="flex items-center justify-center gap-1.5 text-xs text-red-600">
        <Clock className="w-3.5 h-3.5" />
        <span className="font-medium">Expired</span>
      </div>
    );
  }

  return (
    <div className="flex items-center justify-center gap-1.5">
      <Clock className="w-3.5 h-3.5 text-orange-600" />
      <div className="flex items-center gap-0.5 text-xs">
        <span className="font-semibold text-slate-900">{timeLeft.days}</span>
        <span className="text-slate-500">d</span>
        <span className="text-slate-300 mx-0.5">:</span>
        <span className="font-semibold text-slate-900">{String(timeLeft.hours).padStart(2, '0')}</span>
        <span className="text-slate-500">h</span>
        <span className="text-slate-300 mx-0.5">:</span>
        <span className="font-semibold text-slate-900">{String(timeLeft.minutes).padStart(2, '0')}</span>
        <span className="text-slate-500">m</span>
        <span className="text-slate-300 mx-0.5">:</span>
        <span className="font-semibold text-slate-900">{String(timeLeft.seconds).padStart(2, '0')}</span>
        <span className="text-slate-500">s</span>
      </div>
    </div>
  );
}

type MarketplaceListLayout = "search" | "catalog";

function MarketplaceListProductRow({
  product,
  formatPriceMMK,
  onProductClick,
  onAddToCart,
  onToggleWishlist,
  isWishlisted,
  layout,
}: {
  product: Product;
  formatPriceMMK: (price: string) => string;
  onProductClick: () => void;
  onAddToCart: (e: React.MouseEvent, v?: { sku: string; price: string; image?: string }) => void;
  onToggleWishlist: (e: React.MouseEvent) => void;
  isWishlisted: boolean;
  layout: MarketplaceListLayout;
}) {
  const [variantSelections, setVariantSelections] = useState<Record<string, string>>({});
  useEffect(() => {
    setVariantSelections(initVariantSelections(product));
  }, [product.id, product.variantOptions?.length, product.variants?.length]);

  const resolvedVariant = useMemo(
    () => matchVariantForProduct(product, variantSelections),
    [product, variantSelections]
  );
  const showVariants = productHasVariantPicker(product);
  const displayPrice = resolvedVariant?.price ?? product.price;
  const displayStock =
    resolvedVariant != null
      ? resolvedVariant.inventory
      : product.inventory ?? (product as { stock?: number }).stock ?? 0;
  const imgSrc = product.images && product.images.length > 0 ? product.images[0] : product.image;

  const isSearch = layout === "search";
  const rowGap = isSearch ? "gap-3 sm:gap-4 lg:gap-8" : "gap-3 sm:gap-4 md:gap-6";
  const rowPad = isSearch ? "p-3 sm:p-4 lg:p-8" : "p-3 sm:p-4 md:p-6";
  const imgWrap = isSearch
    ? "w-24 h-24 sm:w-32 sm:h-32 lg:w-48 lg:h-48 rounded-lg lg:rounded-2xl"
    : "w-24 h-24 sm:w-32 sm:h-32 md:w-40 md:h-40 rounded-lg md:rounded-xl";
  const titleCls = isSearch
    ? "font-semibold text-slate-900 line-clamp-2 mb-1 sm:mb-2 lg:mb-3 text-sm"
    : "font-semibold text-slate-900 line-clamp-2 mb-0.5 text-sm sm:text-base md:text-lg";
  const priceCls = isSearch
    ? "text-sm font-bold text-gray-700 mb-1 sm:mb-2 lg:mb-4"
    : "text-base sm:text-lg md:text-xl font-bold text-gray-700 mb-1 sm:mb-2";
  const soldLabel = isSearch
    ? `(${product.salesVolume || 0} sold)`
    : `(${product.salesVolume} sold)`;

  const handleAdd = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (showVariants && resolvedVariant) {
      onAddToCart(e, {
        sku: resolvedVariant.sku,
        price: resolvedVariant.price,
        image: imgSrc,
      });
    } else {
      onAddToCart(e);
    }
  };

  return (
    <Card className="group overflow-hidden hover:shadow-lg transition-all cursor-pointer border border-slate-200 animate-slide-up">
      <div className={`flex ${rowGap} ${rowPad}`} onClick={onProductClick}>
        <div className={`${imgWrap} overflow-hidden border border-slate-200 flex-shrink-0`}>
          <LazyImage src={imgSrc} alt={product.name} className="w-full h-full object-cover" />
        </div>
        <div className="flex-1 min-w-0 flex flex-col justify-between">
          <div>
            <h4 className={titleCls}>{product.name}</h4>
            <div
              className={
                isSearch
                  ? "flex items-center gap-1 sm:gap-2 lg:gap-3 mb-2 sm:mb-3 lg:mb-4"
                  : "flex items-center gap-1 sm:gap-2 mb-2 sm:mb-3"
              }
            >
              <div className="flex items-center gap-0.5 sm:gap-1">
                {[...Array(5)].map((_, i) => (
                  <Star
                    key={i}
                    className={
                      isSearch
                        ? "w-3 h-3 sm:w-3.5 sm:h-3.5 lg:w-2.5 lg:h-2.5 fill-amber-400 text-amber-400"
                        : "w-3 h-3 sm:w-3.5 sm:h-3.5 fill-amber-400 text-amber-400"
                    }
                  />
                ))}
              </div>
              <span
                className={
                  isSearch
                    ? "text-[10px] text-slate-600 font-medium"
                    : "text-xs sm:text-sm text-slate-600 font-medium"
                }
              >
                {soldLabel}
              </span>
            </div>
            {showVariants && (
              <div className="mb-2">
                <ProductVariantChips
                  product={product}
                  selections={variantSelections}
                  onChange={setVariantSelections}
                  size="list"
                />
              </div>
            )}
            <p className={priceCls}>{formatPriceMMK(displayPrice)}</p>
            <div
              className={
                isSearch
                  ? "hidden sm:flex items-center gap-4 lg:gap-6 mt-2 lg:mt-6 text-xs sm:text-sm lg:text-base text-slate-600"
                  : "hidden sm:flex items-center gap-4 mt-2 md:mt-4 text-xs sm:text-sm text-slate-600"
              }
            >
              <span className={`flex items-center ${isSearch ? "gap-1 lg:gap-2" : "gap-1"}`}>
                <Store
                  className={
                    isSearch ? "w-3.5 h-3.5 sm:w-4 sm:h-4 lg:w-5 lg:h-5" : "w-3.5 h-3.5 sm:w-4 sm:h-4"
                  }
                />
                <span
                  className={`truncate ${isSearch ? "max-w-[120px] lg:max-w-[200px]" : "max-w-[120px]"}`}
                >
                  {product.vendor || "Store"}
                </span>
              </span>
              <span className="text-emerald-700 font-medium">Stock: {displayStock}</span>
            </div>
            <div className="flex sm:hidden items-center gap-1.5 text-xs text-slate-600 mt-1">
              <Store className="w-3.5 h-3.5" />
              <span>Stock: {displayStock}</span>
            </div>
          </div>
        </div>
        <div className="flex flex-col gap-1.5 flex-shrink-0">
          <button
            type="button"
            className="w-7 h-7 sm:w-9 sm:h-9 bg-white/90 backdrop-blur-sm rounded-lg flex items-center justify-center shadow-md transition-all hover:bg-amber-600 group/btn"
            onClick={handleAdd}
          >
            <Plus className="w-3.5 h-3.5 sm:w-4.5 sm:h-4.5 text-orange-600 group-hover/btn:text-white transition-colors" />
          </button>
          <button
            type="button"
            className="w-7 h-7 sm:w-9 sm:h-9 bg-white/90 backdrop-blur-sm rounded-lg flex items-center justify-center shadow-md transition-all hover:bg-amber-600 group/btn"
            onClick={(e) => {
              e.stopPropagation();
              onToggleWishlist(e);
            }}
          >
            <Heart
              className={`w-3.5 h-3.5 sm:w-4 sm:h-4 transition-colors ${
                isWishlisted
                  ? "fill-amber-600 text-amber-600 group-hover/btn:fill-white group-hover/btn:text-white"
                  : "text-slate-600 group-hover/btn:text-white"
              }`}
            />
          </button>
        </div>
      </div>
    </Card>
  );
}

export function Storefront({ onSwitchToAdmin, onOrderPlaced, onOpenVendorApplication }: StorefrontProps) {
  const navigate = useNavigate();
  const location = useLocation();
  const params = useParams();
  const { setIsCartOpen } = useCartVisibility();
  const { setIsLoading, setIsScrollLocked } = useLoading();
  const { startLoading: startFaviconLoading, stopLoading: stopFaviconLoading } = useFaviconLoader();
  
  // Cleanup favicon loader on unmount
  useEffect(() => {
    return () => {
      stopFaviconLoading();
    };
  }, [stopFaviconLoading]);
  
  // 🔒 Ref to prevent retry effect from causing race conditions
  const productRetryAttemptedRef = useRef(false);
  const productRetrySkuRef = useRef("");
  const isSelectingProductRef = useRef(false);
  const isNavigatingAwayRef = useRef(false); // 🆕 NEW: Prevent race conditions during navigation
  /** Avoid duplicate variant hydration when product/URL already applied. */
  const productDetailHydratedRef = useRef<string>("");
  
  // �� MODULE-CACHE: Load from module-level cache (survives unmount/remount)
  const [products, setProducts] = useState<Product[]>(() => {
    if (cachedProducts.length > 0) {
      console.log(`⚡ INSTANT LOAD: Restored ${cachedProducts.length} products from module cache`);
    }
    return cachedProducts;
  });
  // 🚀 MODULE-CACHE: Load categories from module-level cache
  const [allCategories, setAllCategories] = useState<any[]>(() => {
    if (cachedCategories.length > 0) {
      console.log(`⚡ INSTANT LOAD: Restored ${cachedCategories.length} categories from module cache`);
    }
    return cachedCategories;
  });
  // 🚀 OPTIMIZED: Skip loading screen if we have cached data in memory
  // ⚡ REMOVED loading state - only serverStatus controls loading screen now
  
  // 🚀 OPTIMIZED: Remember server health in sessionStorage to prevent loading on subsequent navigations
  const [serverStatus, setServerStatus] = useState<'checking' | 'healthy' | 'unhealthy'>(() => {
    const savedStatus = sessionStorage.getItem('migoo-server-status');
    // If we have cached data, server is already healthy
    if (cachedProducts.length > 0 && cachedCategories.length > 0) {
      return 'healthy';
    }
    return savedStatus === 'healthy' ? 'healthy' : 'checking';
  });
  
  // 🚀 CACHE-AWARE: Only show loading if we DON'T have cached data
  // If cache exists, skip loading state entirely for instant display
  const hasCachedData = cachedProducts.length > 0 && cachedCategories.length > 0;
  /** After first successful catalog fetch, allow UI even if products AND categories are both empty (otherwise spinner never ends). */
  const [initialCatalogFetchDone, setInitialCatalogFetchDone] = useState(hasCachedData);
  const isDataReady =
    hasCachedData ||
    (serverStatus === "unhealthy" && initialCatalogFetchDone) ||
    (serverStatus === "healthy" &&
      ((products.length > 0 && allCategories.length > 0) || initialCatalogFetchDone));
  
  // Sync loading state with global loading context
  useEffect(() => {
    // ⚡ NEVER show loading if we have cached data
    if (hasCachedData) {
      setIsLoading(false);
      return;
    }
    
    // Only show loading on first load when cache is empty
    const isCurrentlyLoading = serverStatus === 'checking' || !isDataReady;
    setIsLoading(isCurrentlyLoading);
  }, [serverStatus, isDataReady, setIsLoading, hasCachedData]);

  // Toggle cache debug panel with Ctrl+Shift+D
  useEffect(() => {
    const handleKeyPress = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.shiftKey && e.key === 'D') {
        e.preventDefault();
        setShowCacheDebug(prev => !prev);
      }
    };
    window.addEventListener('keydown', handleKeyPress);
    return () => window.removeEventListener('keydown', handleKeyPress);
  }, []);

  // 🎯 Navbar scroll behavior: sticky on scroll up, natural scroll on scroll down
  const [isNavbarSticky, setIsNavbarSticky] = useState(false);
  const lastScrollYRef = useRef(0);

  useEffect(() => {
    const handleScroll = () => {
      const currentScrollY = window.scrollY;
      
      if (currentScrollY < lastScrollYRef.current) {
        // Scrolling up (even 1px) - make navbar sticky
        setIsNavbarSticky(true);
      } else if (currentScrollY > lastScrollYRef.current) {
        // Scrolling down - make navbar normal (not sticky)
        setIsNavbarSticky(false);
      }
      
      lastScrollYRef.current = currentScrollY;
    };

    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);
  
  // 🚀 MODULE-CACHE: Site Settings with fallback to defaults
  // 🔒 STABLE STORE NAME: Capture initial store name ONCE to prevent text flickering during loading
  // Use useState to freeze the value on first render - it will NOT update even if cachedSiteSettings changes
  const [stableStoreName] = useState(() => {
    const name = cachedSiteSettings?.storeName || "SECURE";
    // Ensure "SECURE" is always uppercase in the store name
    return name.replace(/\bsecure\b/gi, 'SECURE');
  });
  const [siteSettings, setSiteSettings] = useState(() => {
    if (cachedSiteSettings) {
      return cachedSiteSettings;
    }
    return {
      storeName: stableStoreName,
      storeEmail: "info@migoo.com",
      storePhone: "+95 9 XXX XXX XXX",
      storeAddress: "123 Main St, Yangon, Myanmar",
      currency: "MMK",
      timezone: "Asia/Yangon",
    };
  });
  
  // Blog posts state
  const [blogPosts, setBlogPosts] = useState<any[]>([]);
  const [blogLoading, setBlogLoading] = useState(false);
  const [selectedBlogPost, setSelectedBlogPost] = useState<any | null>(null);
  
  // Featured campaigns state (for promotional section on home page)
  const [featuredCampaigns, setFeaturedCampaigns] = useState<any[]>([]);
  const [campaignsLoading, setCampaignsLoading] = useState(false);

  // Cache debug panel state
  const [showCacheDebug, setShowCacheDebug] = useState(false);
  
  // Appearance settings state (for promo section on home page)
  const [appearanceSettings, setAppearanceSettings] = useState<{
    image: string | null;
    title: string;
    description: string;
  }>({
    image: null,
    title: "Special Offers &\nPromotions",
    description: "Don't miss out on our latest deals and exclusive discounts. Save on your favorite products with our limited-time promotional campaigns.",
  });
  
  const [activeSearchQuery, setActiveSearchQuery] = useState(""); // What is actually searched (triggered on Enter)
  const [selectedCategory, setSelectedCategory] = useState("all");
  const [cart, setCart] = useState<CartItem[]>([]);
  const [wishlist, setWishlist] = useState<string[]>([]);
  /** Server-backed catalog (paginated); home sections loaded via bootstrap. */
  const [catalogTotal, setCatalogTotal] = useState(0);
  const [catalogPage, setCatalogPage] = useState(1);
  const [catalogHasMore, setCatalogHasMore] = useState(false);
  const [catalogLoadingMore, setCatalogLoadingMore] = useState(false);
  const [homeDealProducts, setHomeDealProducts] = useState<Product[]>([]);
  const [homeNewArrivals, setHomeNewArrivals] = useState<Product[]>([]);
  const lastCatalogKeyRef = useRef("");
  const [showCart, setShowCart] = useState(false);
  const [scrolled, setScrolled] = useState(false); // Track scroll position for animated sticky nav
  
  // Track previous state before search to restore when clearing search
  const [preSearchState, setPreSearchState] = useState<{
    viewMode: ViewMode;
    selectedCategory: string;
  } | null>(null);
  
  // Coupon state variables with localStorage persistence
  const [appliedCoupon, setAppliedCoupon] = useState<any>(() => {
    const saved = localStorage.getItem('migoo-applied-coupon');
    return saved ? JSON.parse(saved) : null;
  });
  const [couponLoading, setCouponLoading] = useState(false);
  const [couponError, setCouponError] = useState('');
  const [couponCode, setCouponCode] = useState(''); // 🔧 FIX: Add missing couponCode state
  
  // Lightbox state for description images
  const [lightboxImage, setLightboxImage] = useState<string | null>(null);
  const [lightboxImages, setLightboxImages] = useState<string[]>([]);
  const [lightboxIndex, setLightboxIndex] = useState(0);
  
  // Persist appliedCoupon to localStorage
  useEffect(() => {
    if (appliedCoupon) {
      localStorage.setItem('migoo-applied-coupon', JSON.stringify(appliedCoupon));
    } else {
      localStorage.removeItem('migoo-applied-coupon');
    }
  }, [appliedCoupon]);
  
  const [showMobileMenu, setShowMobileMenu] = useState(false);
  const [showMobileSearch, setShowMobileSearch] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [selectedImageIndex, setSelectedImageIndex] = useState(0);
  const [selectedVariants, setSelectedVariants] = useState<Record<string, string>>({}); // type -> variantId
  const [selectedOrder, setSelectedOrder] = useState<any | null>(null); // 🔥 State for viewing order details
  const [viewMode, setViewMode] = useState<ViewMode>("home");
  const [viewType, setViewType] = useState<ViewType>("grid");
  const [homeViewType, setHomeViewType] = useState<"grid" | "list">("grid"); // View type for home page "View Our Sales" section
  const [orderNumber, setOrderNumber] = useState("");
  
  // 🔥 PAGE TRANSITION LOADING STATE
  const [isPageTransitioning, setIsPageTransitioning] = useState(false);
  
  // 🔥 PRODUCT DETAIL SKELETON LOADING STATE
  const [isLoadingProductDetail, setIsLoadingProductDetail] = useState(false);
  
  // Debug homeViewType changes
  useEffect(() => {
    console.log("homeViewType state changed to:", homeViewType);
  }, [homeViewType]);
  const [sortBy, setSortBy] = useState("featured");
  const [priceRange, setPriceRange] = useState<[number, number]>([0, 10000]);
  const [showFilters, setShowFilters] = useState(false);
  const [userAppliedFilters, setUserAppliedFilters] = useState(false); // Track if user explicitly applied filters
  const [showSearchSuggestions, setShowSearchSuggestions] = useState(false); // 🔍 NEW: Search suggestions
  const searchRef = useRef<HTMLDivElement>(null); // 🔍 Ref for click-outside detection
  const [hideSavedBanner, setHideSavedBanner] = useState(false); // Track if user clicked Saved category to hide banner
  
  // 🔗 URL SYNCHRONIZATION
  // Track if we're initializing from URL to prevent loops
  const isInitializingFromURL = useRef(false);
  const isInitialMount = useRef(true);
  
  // 🔗 URL → viewMode: Initialize viewMode from URL on mount and when URL changes
  useEffect(() => {
    // Skip URL sync if we're in the middle of navigation
    if (isNavigatingAwayRef.current) {
      console.log('⏭️ Skipping URL sync - navigation in progress');
      return;
    }
    
    const path = location.pathname;
    const searchParams = new URLSearchParams(location.search);
    const categoryParam = searchParams.get('category');
    
    console.log('🌐 URL changed to:', path, 'Category:', categoryParam);

    // Drop product detail state whenever the URL is not a /product/... route (browser back, etc.).
    // Prevents stale selectedProduct + async fetchProductDetails from reopening detail after navigate away.
    if (!path.startsWith("/product/")) {
      setSelectedProduct(null);
      setSelectedVariants({});
      setSelectedImageIndex(0);
    }
    
    // Mark that we're initializing from URL
    isInitializingFromURL.current = true;
    
    // Handle category parameter
    if (categoryParam) {
      console.log('📂 Setting category from URL:', categoryParam);
      setSelectedCategory(categoryParam);
      setViewMode("all-products");
    }
    
    if (path === "/store") {
      // Only reset to home if no category parameter
      if (!categoryParam) {
        setViewMode("home");
      }
    } else if (path === "/products") {
      setViewMode("all-products");
    } else if (path.startsWith("/product/")) {
      const sku = decodeURIComponent(path.replace("/product/", "").split("/")[0]);
      const lowerSku = sku.toLowerCase();
      const product =
        products.find((p) => String(p.sku).toLowerCase() === lowerSku) ||
        products.find(
          (p) =>
            Array.isArray(p.variants) &&
            p.variants.some((v: { sku?: string }) => String(v?.sku || "").toLowerCase() === lowerSku)
        );
      if (product) {
        setSelectedProduct(product);
        setViewMode("product-detail");
      } else {
        setViewMode("product-detail");
      }
    } else if (path === "/checkout") {
      setViewMode("checkout");
    } else if (path === "/order-confirmation") {
      setViewMode("order-confirmation");
    } else if (path === "/profile") {
      setViewMode("view-profile");
    } else if (path === "/profile/edit") {
      setViewMode("edit-profile");
    } else if (path === "/profile/orders") {
      setViewMode("order-history");
    } else if (path.startsWith("/profile/orders/")) {
      // Order detail page
      const orderId = path.replace("/profile/orders/", "");
      console.log('📄 Order detail route detected:', orderId);
      console.log('🔄 Current path:', path);
      setViewMode("order-detail");
      // The order will be loaded from userOrders when the view renders
    } else if (path === "/profile/addresses") {
      setViewMode("shipping-addresses");
    } else if (path === "/profile/security") {
      setViewMode("security-settings");
    } else if (path === "/saved") {
      setViewMode("saved-products");
    } else if (path === "/blog") {
      setViewMode("blog");
    } else if (path.startsWith("/blog/")) {
      // Blog detail - we'll load the post later
      const blogId = path.replace("/blog/", "");
      setViewMode("blog-detail");
      // Note: selectedBlogPost will be set by the blog loading logic
    }
    
    // Reset flag after a tick
    setTimeout(() => {
      isInitializingFromURL.current = false;
    }, 0);
    
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.pathname, location.search]); // Run when URL or search params change
  
  // 🔗 viewMode → URL: Update URL when viewMode changes (but not during initialization)
  useEffect(() => {
    // Skip on initial mount
    if (isInitialMount.current) {
      isInitialMount.current = false;
      return;
    }
    
    // Skip if we're initializing from URL to prevent loops
    if (isInitializingFromURL.current) {
      return;
    }
    
    // Skip if we're in the middle of navigation to prevent race conditions
    if (isNavigatingAwayRef.current) {
      console.log('⏭️ Skipping viewMode → URL sync - navigation in progress');
      return;
    }
    
    // Map viewMode to target path
    let targetPath = "/";
    switch (viewMode) {
      case "home":
        targetPath = "/store";
        break;
      case "all-products":
        targetPath = "/products";
        break;
      case "product-detail":
        if (selectedProduct) {
          targetPath = `/product/${selectedProduct.sku}`;
        } else {
          targetPath = "/store";
        }
        break;
      case "checkout":
        targetPath = "/checkout";
        break;
      case "order-confirmation":
        targetPath = "/order-confirmation";
        break;
      case "view-profile":
        targetPath = "/profile";
        break;
      case "edit-profile":
        targetPath = "/profile/edit";
        break;
      case "order-history":
        targetPath = "/profile/orders";
        break;
      case "order-detail":
        if (selectedOrder) {
          targetPath = `/profile/orders/${selectedOrder.id}`;
        } else {
          // Extract order ID from current URL if selectedOrder is not set
          const urlOrderId = location.pathname.replace("/profile/orders/", "");
          if (urlOrderId && urlOrderId !== location.pathname) {
            targetPath = `/profile/orders/${urlOrderId}`;
          } else {
            targetPath = "/profile/orders";
          }
        }
        break;
      case "shipping-addresses":
        targetPath = "/profile/addresses";
        break;
      case "security-settings":
        targetPath = "/profile/security";
        break;
      case "saved-products":
        targetPath = "/saved";
        break;
      case "blog":
        targetPath = "/blog";
        break;
      case "blog-detail":
        if (selectedBlogPost) {
          targetPath = `/blog/${selectedBlogPost.id}`;
        } else {
          targetPath = "/blog";
        }
        break;
    }
    
    // Only navigate if URL doesn't match and we're not already there
    if (location.pathname !== targetPath) {
      navigate(targetPath, { replace: false });
    }
    
    // 🔒 Reset retry flag when navigating away from product-detail
    if (viewMode !== "product-detail") {
      productRetryAttemptedRef.current = false;
      isSelectingProductRef.current = false;
    }
    
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewMode]); // Only depend on viewMode changes, not selectedProduct/selectedBlogPost to avoid loops
  
  // 🔥 PROFESSIONAL PAGE TRANSITION SYSTEM - DISABLED FOR INSTANT TRANSITIONS
  // No longer needed - instant page changes with no transition delay
  /*
  useEffect(() => {
    // Quick content refresh on page change - very subtle, just enough to show something changed
    setIsPageTransitioning(true);
    const timer = setTimeout(() => {
      setIsPageTransitioning(false);
    }, 100); // Fast 100ms - just enough for smooth content swap
    return () => clearTimeout(timer);
  }, [viewMode, selectedBlogPost, selectedOrder]); // Removed selectedProduct to prevent double transitions
  */
  
  // Deep link + product-detail hydration: defined after fetchProductDetails / initializeVariantSelections (see below).
  
  // 🔒 Simple body scroll lock when mobile menu is open
  useEffect(() => {
    if (showMobileMenu) {
      // Simple overflow hidden - no position fixed to avoid touch event issues
      document.body.style.overflow = 'hidden';
      document.documentElement.style.overflow = 'hidden';
      
      return () => {
        document.body.style.overflow = '';
        document.documentElement.style.overflow = '';
      };
    }
  }, [showMobileMenu]);
  
  // User authentication — hydrate from migoo-user immediately so /profile/orders can fetch on first paint
  const [user, setUser] = useState<User | null>(() => readMigooUserFromStorage());
  const [profileImageLoadFailed, setProfileImageLoadFailed] = useState(false);
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [authMode, setAuthMode] = useState<'login' | 'register'>('login');
  const [authForm, setAuthForm] = useState({
    email: '',
    password: '',
    name: '',
    phone: ''
  });
  const [isAuthLoading, setIsAuthLoading] = useState(false);
  
  const [shippingAddresses, setShippingAddresses] = useState<any[]>([]);
  const [loadingAddresses, setLoadingAddresses] = useState(false);
  const [editingAddress, setEditingAddress] = useState<any | null>(null);
  const [showAddressForm, setShowAddressForm] = useState(false);
  const [addressForm, setAddressForm] = useState({
    label: '',
    recipientName: '',
    phone: '',
    addressLine1: '',
    addressLine2: '',
    city: '',
    state: '',
    zipCode: '',
    country: 'Myanmar',
    isDefault: false
  });
  
  const [securityForm, setSecurityForm] = useState({
    currentPassword: '',
    newPassword: '',
    confirmPassword: ''
  });
  const [savingSecurity, setSavingSecurity] = useState(false);
  const [showPasswords, setShowPasswords] = useState({
    current: false,
    new: false,
    confirm: false
  });
  
  // Checkout form
  const [customerInfo, setCustomerInfo] = useState({
    name: "",
    phone: "",
    address: "",
    city: "",
    zipCode: "",
    country: "Myanmar",
    notes: ""
  });
  
  const [isProcessingOrder, setIsProcessingOrder] = useState(false);
  const [buyNowItem, setBuyNowItem] = useState<CartItem | null>(null); // 🔥 Direct Buy Now item
  const [completedOrder, setCompletedOrder] = useState<any>(null); // 🔥 Store completed order details
  const [paymentMethod, setPaymentMethod] = useState<"Card" | "KPay" | "BankTransfer" | null>(null);
  const [paymentInfo, setPaymentInfo] = useState({
    cardNumber: '',
    cardName: '',
    expiryDate: '',
    cvv: ''
  });

  // Profile page states
  const [orderCount, setOrderCount] = useState(0);
  const [loadingStats, setLoadingStats] = useState(true);
  const [profileForm, setProfileForm] = useState({
    name: "",
    email: "",
    phone: "",
    profileImage: null as string | null,
  });
  const [saving, setSaving] = useState(false);
  
  // Order history page states
  const [userOrders, setUserOrders] = useState<any[]>([]);
  const [ordersLoading, setOrdersLoading] = useState(true);
  const [ordersError, setOrdersError] = useState<string | null>(null);

  // 🚀 Helper function to update server status and persist to sessionStorage
  const updateServerStatus = useCallback((status: 'checking' | 'healthy' | 'unhealthy') => {
    setServerStatus(status);
    if (status === 'healthy') {
      sessionStorage.setItem('migoo-server-status', 'healthy');
    }
  }, []);

  // Sync showCart state with CartVisibility context
  useEffect(() => {
    setIsCartOpen(showCart);
  }, [showCart, setIsCartOpen]);

  // 🔒 Block background scroll when cart is open
  useEffect(() => {
    if (showCart) {
      // 🎯 SIMPLEST APPROACH - Just prevent scrolling, don't move anything
      const scrollbarWidth = window.innerWidth - document.documentElement.clientWidth;
      
      document.body.style.overflow = 'hidden';
      document.body.style.paddingRight = `${scrollbarWidth}px`; // Prevent layout shift when scrollbar disappears
      
      return () => {
        // Restore - no shake because we never moved anything!
        document.body.style.overflow = '';
        document.body.style.paddingRight = '';
      };
    }
  }, [showCart]);

  // 🔍 Click-outside handler to close search suggestions
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (searchRef.current && !searchRef.current.contains(event.target as Node)) {
        setShowSearchSuggestions(false);
      }
    };

    if (showSearchSuggestions) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [showSearchSuggestions]);

  // Scroll handler for animated sticky nav
  useEffect(() => {
    const handleScroll = () => {
      setScrolled(window.scrollY > 20);
    };

    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  // Lightbox keyboard navigation and body scroll lock
  useEffect(() => {
    if (lightboxImage) {
      // Lock body scroll
      document.body.style.overflow = 'hidden';

      // Keyboard navigation
      const handleKeyDown = (e: KeyboardEvent) => {
        if (e.key === 'Escape') {
          setLightboxImage(null);
        } else if (e.key === 'ArrowLeft' && lightboxIndex > 0) {
          const newIndex = lightboxIndex - 1;
          setLightboxIndex(newIndex);
          setLightboxImage(lightboxImages[newIndex]);
        } else if (e.key === 'ArrowRight' && lightboxIndex < lightboxImages.length - 1) {
          const newIndex = lightboxIndex + 1;
          setLightboxIndex(newIndex);
          setLightboxImage(lightboxImages[newIndex]);
        }
      };

      document.addEventListener('keydown', handleKeyDown);

      return () => {
        document.body.style.overflow = '';
        document.removeEventListener('keydown', handleKeyDown);
      };
    }
  }, [lightboxImage, lightboxIndex, lightboxImages]);

  // Dynamic document title and favicon based on product view
  useEffect(() => {
    // Get/create favicon element
    let favicon = document.querySelector("link[rel*='icon']") as HTMLLinkElement;
    if (!favicon) {
      favicon = document.createElement('link');
      favicon.rel = 'icon';
      document.head.appendChild(favicon);
    }

    // Use uploaded logo from admin panel as default favicon
    const storeLogo = siteSettings?.storeLogo || '/favicon.ico';

    // Update title based on viewMode
    let pageTitle = stableStoreName;
    
    if (viewMode === 'product-detail' && selectedProduct) {
      // Product detail page - show ONLY product name (no site suffix)
      pageTitle = selectedProduct.name;
      // Update favicon to product image
      if (selectedProduct.image) {
        favicon.href = selectedProduct.image;
      }
    } else if (viewMode === 'cart') {
      pageTitle = `Cart - ${stableStoreName}`;
      favicon.href = storeLogo;
    } else if (viewMode === 'checkout') {
      pageTitle = `Checkout - ${stableStoreName}`;
      favicon.href = storeLogo;
    } else if (viewMode === 'order-tracking') {
      pageTitle = `Track Order - ${stableStoreName}`;
      favicon.href = storeLogo;
    } else if (viewMode === 'order-success') {
      pageTitle = `Order Success - ${stableStoreName}`;
      favicon.href = storeLogo;
    } else if (viewMode === 'customer-orders') {
      pageTitle = `My Orders - ${stableStoreName}`;
      favicon.href = storeLogo;
    } else if (viewMode === 'customer-wishlist') {
      pageTitle = `Wishlist - ${stableStoreName}`;
      favicon.href = storeLogo;
    } else {
      // Default home view
      pageTitle = stableStoreName;
      favicon.href = storeLogo;
    }

    document.title = pageTitle;

    // Cleanup: restore store logo on unmount
    return () => {
      document.title = stableStoreName;
      favicon.href = storeLogo;
    };
  }, [viewMode, selectedProduct, stableStoreName, siteSettings?.storeLogo]);

  useEffect(() => {
    if (!user) {
      const savedGuestCart = localStorage.getItem("migoo-guest-cart");
      if (savedGuestCart) {
        try {
          setCart(JSON.parse(savedGuestCart));
        } catch (error) {
          console.error("Failed to parse saved guest cart:", error);
        }
      }
    }
    // Note: Logged-in users' cart is loaded from database in handleLogin
    // Wishlist is only loaded from database when user logs in (guests cannot save wishlist)
  }, [user]);

  // 🔥 DATABASE-FIRST: Save cart to database for logged-in users, localStorage for guests ONLY
  useEffect(() => {
    if (user?.id) {
      // Logged-in user → Save to DATABASE ONLY (debounced to avoid spam)
      const syncCartToDB = async () => {
        try {
          await fetch(
            `https://${projectId}.supabase.co/functions/v1/make-server-16010b6f/customers/${user.id}/cart`,
            {
              method: 'POST',
              headers: {
                'Authorization': `Bearer ${publicAnonKey}`,
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({ cart }),
            }
          );
          console.log(`🛒 Cart synced to database for user ${user.id}`);
        } catch (error) {
          console.error('Failed to sync cart to database:', error);
        }
      };
      
      // Debounce database writes — longer window = fewer edge writes while browsing
      const timeoutId = setTimeout(syncCartToDB, 2500);
      return () => clearTimeout(timeoutId);
    } else {
      // Guest user → Save to localStorage ONLY (temporary, merged on login)
      try {
        localStorage.setItem("migoo-guest-cart", JSON.stringify(cart));
      } catch (error) {
        console.warn('Failed to save guest cart to localStorage:', error);
      }
    }
  }, [cart, user]);

  useEffect(() => {
    // SIMPLIFIED: Load data once, then skip loading screen on subsequent navigations
    // 🔒 FIX RACE CONDITION: Track cleanup for pending timeouts
    let isMounted = true;
    let retry1TimeoutId: NodeJS.Timeout | null = null;
    let retry2TimeoutId: NodeJS.Timeout | null = null;
    let retry3TimeoutId: NodeJS.Timeout | null = null;
    
    const initializeApp = async () => {
      // 🔥 Clean up old cache on app startup to prevent quota issues
      try {
        SmartCache.clearOldCache();
      } catch (error) {
        console.warn('Failed to clear old cache:', error);
      }
      
      // Check if app has already been initialized in this session AND we have cached data
      const appInitialized = sessionStorage.getItem('migoo-initialized');
      
      if (appInitialized === 'true' && serverStatus === 'healthy' && cachedProducts.length > 0) {
        console.log('⚡ App already initialized with cached data, skipping loading screen...');
        console.log(`📦 Using cached data: ${cachedProducts.length} products, ${cachedCategories.length} categories`);
        setInitialCatalogFetchDone(true);
        if (shouldSkipCatalogBackgroundRefresh()) {
          console.log('⏭️ Skipping catalog background refresh (throttled)');
          return;
        }
        Promise.all([loadProducts(true), loadCategories(), loadSiteSettings()])
          .then(() => markCatalogBackgroundRefreshed())
          .catch((err) => {
            console.error('Background refresh failed:', err);
          });
        return;
      }
      
      console.log('🔍 Starting SECURE (first load)...');
      console.log(`📡 Server URL: https://${projectId}.supabase.co/functions/v1/make-server-16010b6f`);
      console.log('��� Note: First load may take 30-60 seconds (Edge Function cold start)');
      
      // Check server health first
      if (!isMounted) return;
      setServerStatus('checking');
      const healthCheck = await checkServerHealth(10000); // Give it 10 seconds
      
      if (!isMounted) return;
      if (healthCheck.isHealthy) {
        console.log('✅ Server is healthy, loading data...');
        // Wait for both products and categories to load before marking as healthy
        await Promise.all([loadProducts(), loadCategories(), loadSiteSettings(), loadBanners(), loadFeaturedCampaigns(), loadAppearanceSettings()]);
        if (!isMounted) return;
        setInitialCatalogFetchDone(true);
        updateServerStatus('healthy');
        sessionStorage.setItem('migoo-initialized', 'true');
        markCatalogBackgroundRefreshed();
        console.log('✅ All data loaded, app ready!');
      } else {
        setServerStatus('unhealthy');
        console.log('❌ Server is not responding, will auto-retry...');
        // Auto-retry #1 after 5 seconds
        retry1TimeoutId = setTimeout(async () => {
          if (!isMounted) return;
          console.log('🔄 Auto-retry #1: Checking server connection...');
          setServerStatus('checking');
          const retryCheck = await checkServerHealth(15000);
          if (!isMounted) return;
          if (retryCheck.isHealthy) {
            await Promise.all([loadProducts(), loadCategories(), loadSiteSettings(), loadBanners(), loadFeaturedCampaigns(), loadAppearanceSettings()]);
            if (!isMounted) return;
            setInitialCatalogFetchDone(true);
            updateServerStatus('healthy');
            sessionStorage.setItem('migoo-initialized', 'true');
            markCatalogBackgroundRefreshed();
            toast.success('✅ Connected to server successfully!');
          } else {
            setServerStatus('unhealthy');
            // Auto-retry #2 after another 10 seconds
            retry2TimeoutId = setTimeout(async () => {
              if (!isMounted) return;
              console.log('🔄 Auto-retry #2: Checking server connection...');
              setServerStatus('checking');
              const retry2Check = await checkServerHealth(20000);
              if (!isMounted) return;
              if (retry2Check.isHealthy) {
                await Promise.all([loadProducts(), loadCategories(), loadSiteSettings(), loadBanners(), loadFeaturedCampaigns(), loadAppearanceSettings()]);
                if (!isMounted) return;
                setInitialCatalogFetchDone(true);
                updateServerStatus('healthy');
                sessionStorage.setItem('migoo-initialized', 'true');
                markCatalogBackgroundRefreshed();
                toast.success('✅ Connected to server successfully!');
              } else {
                setServerStatus('unhealthy');
                // Auto-retry #3 after another 15 seconds
                retry3TimeoutId = setTimeout(async () => {
                  if (!isMounted) return;
                  console.log('🔄 Auto-retry #3: Final attempt to connect...');
                  setServerStatus('checking');
                  const retry3Check = await checkServerHealth(30000);
                  if (!isMounted) return;
                  if (retry3Check.isHealthy) {
                    await Promise.all([loadProducts(), loadCategories(), loadSiteSettings(), loadBanners(), loadFeaturedCampaigns(), loadAppearanceSettings()]);
                    if (!isMounted) return;
                    setInitialCatalogFetchDone(true);
                    updateServerStatus('healthy');
                    sessionStorage.setItem('migoo-initialized', 'true');
                    markCatalogBackgroundRefreshed();
                    toast.success('✅ Connected to server successfully!');
                  } else {
                    setInitialCatalogFetchDone(true);
                    setServerStatus('unhealthy');
                    toast.error('❌ Unable to connect to server after multiple attempts. Please refresh the page.');
                  }
                }, 15000); // 15 second delay before retry #3
              }
            }, 10000); // 10 second delay before retry #2
          }
        }, 5000); // 5 second delay before retry #1
      }
    };
    
    initializeApp();
    
    // 🔒 FIX RACE CONDITION: Cleanup on unmount - cancel all pending retries and prevent setState on unmounted component
    return () => {
      isMounted = false;
      if (retry1TimeoutId) clearTimeout(retry1TimeoutId);
      if (retry2TimeoutId) clearTimeout(retry2TimeoutId);
      if (retry3TimeoutId) clearTimeout(retry3TimeoutId);
    };
  }, []);

  // Helper function to get category icon
  const getCategoryIcon = (categoryName: string) => {
    const name = categoryName.toLowerCase();
    if (name.includes('electronic')) return Smartphone;
    if (name.includes('cosmetic')) return Sparkles;
    if (name.includes('kitchen')) return Utensils;
    if (name.includes('clothing') || name.includes('shirt')) return Shirt;
    if (name.includes('home')) return Sofa;
    if (name.includes('bag') || name.includes('wallet')) return Backpack;
    if (name.includes('watch')) return Watch;
    if (name.includes('jewelry')) return Crown;
    if (name.includes('sport')) return Dumbbell;
    if (name.includes('toy') || name.includes('game')) return Gamepad2;
    if (name.includes('book')) return FileText;
    if (name.includes('office')) return Briefcase;
    return Box; // default icon
  };

  const loadCategories = useCallback(async () => {
    try {
      const activeCategories = await loadCategoriesCached();
      cachedCategories = activeCategories;
      setAllCategories(activeCategories);
    } catch (error) {
      console.error("Failed to load categories:", error);
      setAllCategories([]);
    }
  }, []);

  const loadBanners = useCallback(async () => {
    try {
      console.log('🎨 Loading banners...');
      const bannersData = await moduleCache.get(
        CACHE_KEYS.STOREFRONT_BANNERS,
        fetchBannersApi,
        false
      );
      if (Array.isArray(bannersData) && bannersData.length > 0) {
        setBanners(bannersData);
        console.log(`✅ Loaded ${bannersData.length} banners`);
      }
    } catch (error) {
      console.warn("⚠️ Could not load banners from server, using defaults");
    }
  }, []);

  // Load featured campaigns for promotional section
  const loadFeaturedCampaigns = useCallback(async () => {
    try {
      setCampaignsLoading(true);
      console.log('🎯 Loading featured campaigns...');
      const data = await moduleCache.get(
        CACHE_KEYS.STOREFRONT_FEATURED_CAMPAIGNS,
        fetchFeaturedCampaignsApi,
        false
      );
      if (Array.isArray(data.campaigns) && data.campaigns.length > 0) {
        setFeaturedCampaigns(data.campaigns);
        console.log(`✅ Loaded ${data.campaigns.length} featured campaigns`);
      } else {
        console.log('ℹ️ No featured campaigns available');
        setFeaturedCampaigns([]);
      }
    } catch (error) {
      console.error("❌ Failed to load featured campaigns:", error);
      setFeaturedCampaigns([]);
    } finally {
      setCampaignsLoading(false);
    }
  }, []);

  // Load appearance settings for promotional section
  const loadAppearanceSettings = useCallback(async () => {
    try {
      const data = await moduleCache.get(
        CACHE_KEYS.STOREFRONT_APPEARANCE,
        fetchAppearanceSettingsApi,
        false
      );
      if (data.image || data.title || data.description) {
        setAppearanceSettings({
          image: data.image || null,
          title: data.title || "Special Offers &\nPromotions",
          description: data.description || "Don't miss out on our latest deals and exclusive discounts. Save on your favorite products with our limited-time promotional campaigns.",
        });
      }
    } catch {
      // Silently use default settings on error
    }
  }, []);

  const catalogSortKey = useCallback(() => {
    return `${selectedCategory}|${activeSearchQuery}|${sortBy}|${userAppliedFilters}|${priceRange[0]}-${priceRange[1]}`;
  }, [selectedCategory, activeSearchQuery, sortBy, userAppliedFilters, priceRange]);

  const loadProducts = useCallback(async (isBackgroundRefresh = false) => {
    try {
      const data = await loadCatalogBootstrapCached(isBackgroundRefresh);
      const activeProducts = data.products;
      cachedProducts = activeProducts;
      if (!isBackgroundRefresh) {
        setProducts(activeProducts);
        setCatalogTotal(data.total);
        setCatalogPage(1);
        setCatalogHasMore(!!data.hasMore);
        setHomeDealProducts(data.dealProducts as Product[]);
        setHomeNewArrivals(data.newArrivals as Product[]);
        lastCatalogKeyRef.current = catalogSortKey();
      }
    } catch (error) {
      console.error("Failed to load products (backend not ready):", error);
      if (!isBackgroundRefresh) {
        setProducts([]);
        setCatalogTotal(0);
        setCatalogHasMore(false);
        setHomeDealProducts([]);
        setHomeNewArrivals([]);
      }
    }
  }, [catalogSortKey]);

  const fetchCatalogRefetch = useCallback(async () => {
    try {
      const data = await fetchCatalogPage({
        page: 1,
        pageSize: CATALOG_PAGE_SIZE,
        q: activeSearchQuery,
        category: selectedCategory,
        sort: sortBy,
        minPrice: userAppliedFilters ? priceRange[0] : undefined,
        maxPrice: userAppliedFilters ? priceRange[1] : undefined,
      });
      const list = (data.products || []).filter((p: any) => {
        const status = String(p.status || "").toLowerCase();
        return !status || status === "active";
      });
      cachedProducts = list;
      setProducts(list);
      setCatalogTotal(data.total ?? 0);
      setCatalogPage(1);
      setCatalogHasMore(!!data.hasMore);
      lastCatalogKeyRef.current = catalogSortKey();
    } catch (e) {
      console.error("Catalog refetch failed:", e);
    }
  }, [
    activeSearchQuery,
    selectedCategory,
    sortBy,
    userAppliedFilters,
    priceRange,
    catalogSortKey,
  ]);

  const loadMoreCatalog = useCallback(async () => {
    if (!catalogHasMore || catalogLoadingMore) return;
    setCatalogLoadingMore(true);
    try {
      const nextPage = catalogPage + 1;
      const data = await fetchCatalogPage({
        page: nextPage,
        pageSize: CATALOG_PAGE_SIZE,
        q: activeSearchQuery,
        category: selectedCategory,
        sort: sortBy,
        minPrice: userAppliedFilters ? priceRange[0] : undefined,
        maxPrice: userAppliedFilters ? priceRange[1] : undefined,
      });
      const list = (data.products || []).filter((p: any) => {
        const status = String(p.status || "").toLowerCase();
        return !status || status === "active";
      });
      setProducts((prev) => {
        const merged = [...prev, ...list];
        cachedProducts = merged;
        return merged;
      });
      setCatalogPage(nextPage);
      setCatalogHasMore(!!data.hasMore);
    } catch (e) {
      console.error("Load more catalog failed:", e);
    } finally {
      setCatalogLoadingMore(false);
    }
  }, [
    catalogHasMore,
    catalogLoadingMore,
    catalogPage,
    activeSearchQuery,
    selectedCategory,
    sortBy,
    userAppliedFilters,
    priceRange,
  ]);

  const catalogFilterMountedRef = useRef(false);

  // Refetch catalog when filters/sort/search change (server-side pagination).
  useEffect(() => {
    if (!initialCatalogFetchDone || serverStatus !== "healthy") return;
    const key = catalogSortKey();
    if (!catalogFilterMountedRef.current) {
      catalogFilterMountedRef.current = true;
      lastCatalogKeyRef.current = key;
      return;
    }
    if (lastCatalogKeyRef.current === key) return;
    lastCatalogKeyRef.current = key;
    fetchCatalogRefetch();
  }, [catalogSortKey, initialCatalogFetchDone, serverStatus, fetchCatalogRefetch]);

  // Merge wishlist product rows (may be off the current catalog page).
  useEffect(() => {
    if (viewMode !== "saved-products" || wishlist.length === 0) return;
    let cancelled = false;
    (async () => {
      try {
        const rows = await fetchProductsByIds(wishlist);
        if (cancelled) return;
        setProducts((prev) => {
          const map = new Map(prev.map((p) => [p.id, p]));
          for (const p of rows) {
            map.set(p.id, p as Product);
          }
          const next = Array.from(map.values());
          cachedProducts = next;
          return next;
        });
      } catch (e) {
        console.error("Wishlist hydrate failed:", e);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [viewMode, wishlist]);

  // Load site settings from database
  const loadSiteSettings = useCallback(async () => {
    try {
      const settings = await loadSiteSettingsCached();
      if (settings) {
        cachedSiteSettings = settings;
        setSiteSettings(settings);
      }
    } catch (error) {
      console.warn('Could not load site settings, using defaults');
    }
  }, []);

  // Update page title when store name loads (only once, not on every change)
  useEffect(() => {
    if (siteSettings.storeName && siteSettings.storeName !== "SECURE E-commerce") {
      document.title = siteSettings.storeName;
    }
  }, [siteSettings.storeName]);

  // Load blog posts
  const loadBlogPosts = useCallback(async () => {
    try {
      setBlogLoading(true);
      const response = await blogApi.getAll();
      if (response.success && response.data) {
        // Only show published posts on storefront
        const publishedPosts = response.data.filter((post: any) => post.status === "published");
        setBlogPosts(publishedPosts);
        console.log(`✅ Loaded ${publishedPosts.length} published blog posts for storefront`);
      }
    } catch (error) {
      console.error("❌ Failed to load blog posts:", error);
      setBlogPosts([]);
    } finally {
      setBlogLoading(false);
    }
  }, []);

  // Fetch full product details by ID (shared module cache with Super Admin product-by-id)
  const fetchProductDetails = useCallback(async (productId: string) => {
    try {
      const data = await getCachedProductById(productId);
      return data?.product ?? null;
    } catch {
      return null;
    }
  }, []);

  const initializeVariantSelections = useCallback((product: Product) => {
    const opts = getEffectiveVariantOptions(product);
    if (product.hasVariants && opts.length > 0) {
      const initialSelections: Record<string, string> = {};
      opts.forEach((option: any) => {
        if (option.values && option.values.length > 0) {
          initialSelections[option.name] = option.values[0];
        }
      });
      setSelectedVariants(initialSelections);
    } else {
      setSelectedVariants({});
    }
  }, []);

  /** When URL is /product/{variantSku}, select matching option values (e.g. Color = Coffee). */
  const seedVariantSelectionFromUrlSku = useCallback((product: Product, urlSku: string) => {
    const opts = getEffectiveVariantOptions(product);
    if (!product.hasVariants || !product.variants?.length || !opts.length) return;
    const lower = urlSku.trim().toLowerCase();
    const v = (product.variants as { sku?: string; option1?: string; option2?: string; option3?: string }[]).find(
      (x) => String(x.sku || "").toLowerCase() === lower
    );
    if (!v) return;
    const next: Record<string, string> = {};
    opts.forEach((opt: { name: string }, idx: number) => {
      const rawVal = [v.option1, v.option2, v.option3][idx];
      if (rawVal != null && rawVal !== "") next[opt.name] = String(rawVal);
    });
    if (Object.keys(next).length > 0) setSelectedVariants(next);
  }, []);

  useEffect(() => {
    productDetailHydratedRef.current = "";
  }, [location.pathname, selectedProduct?.id, selectedProduct?.variantOptions?.length, selectedProduct?.variants?.length]);

  // Deep link / paginated catalog: resolve product by parent or variant SKU via list or by-sku API.
  useEffect(() => {
    if (isSelectingProductRef.current) return;
    if (isNavigatingAwayRef.current) return;
    if (!location.pathname.startsWith("/product/")) return;
    if (viewMode !== "product-detail" || selectedProduct) return;

    const sku = decodeURIComponent(
      location.pathname.replace("/product/", "").split("/")[0]
    );
    if (!sku) return;
    const lowerSku = sku.toLowerCase();

    if (productRetrySkuRef.current !== sku) {
      productRetrySkuRef.current = sku;
      productRetryAttemptedRef.current = false;
    }

    const fromList =
      products.find((p) => String(p.sku).toLowerCase() === lowerSku) ||
      products.find(
        (p) =>
          Array.isArray(p.variants) &&
          p.variants.some((v: { sku?: string }) => String(v?.sku || "").toLowerCase() === lowerSku)
      );
    if (fromList) {
      setSelectedProduct(fromList);
      return;
    }

    if (productRetryAttemptedRef.current) return;
    productRetryAttemptedRef.current = true;

    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(
          `https://${projectId}.supabase.co/functions/v1/make-server-16010b6f/products/by-sku/${encodeURIComponent(sku)}`,
          { headers: { Authorization: `Bearer ${publicAnonKey}` } }
        );
        if (cancelled) return;
        if (!res.ok) {
          navigate("/store", { replace: true });
          return;
        }
        const data = await res.json();
        if (data.product) {
          setSelectedProduct(productFromBySkuApi(data.product));
        } else {
          navigate("/store", { replace: true });
        }
      } catch {
        if (!cancelled) navigate("/store", { replace: true });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [location.pathname, products, selectedProduct, viewMode, navigate]);

  // Load full variant metadata when the catalog row or URL sync left variantOptions/variants empty.
  useEffect(() => {
    if (isSelectingProductRef.current) return;
    if (isNavigatingAwayRef.current) return;
    if (!location.pathname.startsWith("/product/")) return;
    if (!selectedProduct) return;

    const sku = decodeURIComponent(
      location.pathname.replace("/product/", "").split("/")[0]
    );
    if (!sku) return;

    const key = `${selectedProduct.id}:${sku}:${selectedProduct.variantOptions?.length ?? 0}:${selectedProduct.variants?.length ?? 0}`;
    if (productDetailHydratedRef.current === key) return;

    const needsFull =
      Boolean(selectedProduct.hasVariants) &&
      (!selectedProduct.variantOptions?.length || !selectedProduct.variants?.length);

    if (!needsFull) {
      initializeVariantSelections(selectedProduct);
      seedVariantSelectionFromUrlSku(selectedProduct, sku);
      productDetailHydratedRef.current = key;
      return;
    }

    let cancelled = false;
    (async () => {
      const full = await fetchProductDetails(selectedProduct.id);
      if (cancelled) return;
      if (!full) return;
      if (isNavigatingAwayRef.current) return;
      if (!location.pathname.startsWith("/product/")) return;
      const seg = decodeURIComponent(
        location.pathname.replace("/product/", "").split("/")[0]
      );
      if (seg !== sku) return;
      setSelectedProduct(full);
      initializeVariantSelections(full);
      seedVariantSelectionFromUrlSku(full, sku);
      productDetailHydratedRef.current = `${full.id}:${sku}:${full.variantOptions?.length ?? 0}:${full.variants?.length ?? 0}`;
    })();
    return () => {
      cancelled = true;
    };
  }, [
    selectedProduct,
    location.pathname,
    fetchProductDetails,
    initializeVariantSelections,
    seedVariantSelectionFromUrlSku,
  ]);

  // Handle product selection - fetch full details
  const handleProductSelect = useCallback(async (product: Product) => {
    // Guard: Don't allow product selection if we're navigating away
    if (isNavigatingAwayRef.current) {
      console.log('⏭️ Skipping product selection - navigation in progress');
      return;
    }
    
    console.log(`📦 Product selected:`, product.id);
    
    // 🚀 INSTANT TRANSITION: Show skeleton immediately and scroll to top
    setIsLoadingProductDetail(true);
    setIsScrollLocked(true); // 🔒 Lock scroll during product detail loading (does NOT trigger data fetching)
    window.scrollTo({ top: 0, behavior: 'auto' }); // Instant scroll covered by skeleton
    
    // Set basic product data immediately for instant view transition
    setSelectedProduct(product);
    setSelectedImageIndex(0);
    setViewMode("product-detail");
    initializeVariantSelections(product);
    navigate(`/product/${product.sku}`, { replace: false });
    
    // Start favicon loading animation
    startFaviconLoading();
    
    // Set flags to prevent retry effect from interfering and clear navigation flag
    isSelectingProductRef.current = true;
    productRetryAttemptedRef.current = true; // Mark as handled
    isNavigatingAwayRef.current = false; // Clear any stale navigation flag
    
    try {
      // Fetch full product details in background (silently skip if already complete)
      const fullProduct = await fetchProductDetails(product.id);

      // User may have navigated away (back / link) while the request was in flight — do not restore detail.
      if (isNavigatingAwayRef.current) return;
      if (!location.pathname.startsWith("/product/")) return;
      const skuSegment = location.pathname.slice("/product/".length).split("/")[0];
      if (skuSegment) {
        const decoded = decodeURIComponent(skuSegment);
        if (decoded !== product.sku && skuSegment !== product.sku) return;
      }
      
      if (fullProduct) {
        console.log(`✅ Full product fetched, updating with complete data...`);
        // Update with full product data
        setSelectedProduct(fullProduct);
        initializeVariantSelections(fullProduct);
      }
    } catch (error) {
      // Silently catch - product already has basic data from list
    } finally {
      // Hide skeleton and stop favicon loading animation
      setIsLoadingProductDetail(false);
      setIsScrollLocked(false); // 🔓 Unlock scroll
      stopFaviconLoading();
      isSelectingProductRef.current = false;
    }
  }, [fetchProductDetails, navigate, startFaviconLoading, stopFaviconLoading, location.pathname, initializeVariantSelections]);

  // 🆕 RACE CONDITION FIX: Safe navigation away from product detail
  // This prevents state mismatch when navigating between pages
  const navigateAwayFromProduct = useCallback((targetPath: string, targetViewMode: ViewMode, category?: string) => {
    console.log(`🚀 Safe navigation to: ${targetPath}, viewMode: ${targetViewMode}`);
    
    // Set flag to prevent other effects from interfering
    isNavigatingAwayRef.current = true;
    isSelectingProductRef.current = false;
    productRetryAttemptedRef.current = false;
    
    // Batch all state updates together in the correct order
    window.requestAnimationFrame(() => {
      // Clear product state first
      setSelectedProduct(null);
      setSelectedVariants({});
      setSelectedImageIndex(0);
      
      // Set category if provided
      if (category) {
        setSelectedCategory(category);
      }
      
      // Update view mode
      setViewMode(targetViewMode);
      
      // Navigate last
      navigate(targetPath, { replace: false });
      
      // Reset flag after next render
      setTimeout(() => {
        isNavigatingAwayRef.current = false;
      }, 100);
    });
  }, [navigate]);

  // Load wishlist from database when user logs in
  const loadUserWishlist = async (userId: string) => {
    try {
      const response = await wishlistApi.get(userId);
      setWishlist(response.productIds || []);
      // Clear localStorage wishlist since we're using DB now
      localStorage.removeItem("migoo-wishlist");
    } catch (error) {
      console.error("Failed to load user wishlist:", error);
    }
  };

  // 🔥 DATABASE-FIRST: Load cart from database when user logs in or page loads
  const loadUserCart = async (userId: string) => {
    try {
      console.log(`🛒 Loading cart from database for user: ${userId}`);
      const response = await fetch(
        `https://${projectId}.supabase.co/functions/v1/make-server-16010b6f/customers/${userId}/cart`,
        {
          headers: {
            'Authorization': `Bearer ${publicAnonKey}`,
          },
        }
      );
      
      if (response.ok) {
        const data = await response.json();
        const dbCart = data.cart || [];
        
        // Get guest cart from localStorage (if any)
        const guestCartStr = localStorage.getItem('migoo-guest-cart');
        const guestCart = guestCartStr ? JSON.parse(guestCartStr) : [];
        
        // Merge: Prefer DB cart, but add any new items from guest cart
        const mergedCart = [...dbCart];
        guestCart.forEach((guestItem: any) => {
          const existsInDB = dbCart.some((dbItem: any) => 
            dbItem.id === guestItem.id
          );
          if (!existsInDB) {
            mergedCart.push(guestItem);
          }
        });
        
        console.log(`✅ Cart loaded: ${dbCart.length} items from DB, ${guestCart.length} guest items, ${mergedCart.length} total`);
        setCart(mergedCart);
        
        // Clear guest cart after merging
        if (guestCart.length > 0) {
          localStorage.removeItem('migoo-guest-cart');
        }
      }
    } catch (error) {
      console.error("Failed to load user cart:", error);
    }
  };

  // Auto-load user from localStorage on page load (sync with cart / profile refresh)
  useEffect(() => {
    const storedUser = localStorage.getItem("migoo-user");
    if (storedUser) {
      try {
        const parsedUser = JSON.parse(storedUser) as Record<string, unknown>;
        const uid = resolveUserIdFromRecord(parsedUser);
        if (!uid) {
          console.warn("[Storefront] migoo-user missing id/userId; clearing invalid session");
          localStorage.removeItem("migoo-user");
          setUser(null);
          return;
        }
        const normalized = { ...(parsedUser as unknown as User), id: uid };
        setUser(normalized);
        // 🔥 Load user's cart and wishlist from database
        loadUserCart(uid);
        loadUserWishlist(uid);
        
        // Refresh profile data from server to get fresh signed URL
        authApi.getProfile(uid)
          .then((response: any) => {
            const freshProfile = response?.user || response;
            if (freshProfile && typeof freshProfile === "object" && !Array.isArray(freshProfile)) {
              // Never drop id/email from session — bad merges were breaking order history & profile APIs
              const updatedUser = {
                ...normalized,
                ...freshProfile,
                id: uid,
                email: (freshProfile as { email?: string }).email ?? String(normalized.email ?? ""),
              };
              setUser(updatedUser);
              localStorage.setItem("migoo-user", JSON.stringify(updatedUser));
            }
          })
          .catch(error => {
            // 🔇 Silently ignore - customers don't have vendor profiles, which is expected
            // Continue with stored user if refresh fails
          });
      } catch (error) {
        console.error("Failed to parse stored user:", error);
        localStorage.removeItem("migoo-user");
        setUser(null);
      }
    }
  }, []);

  // Update profile form when user changes
  useEffect(() => {
    if (user) {
      setProfileForm({
        name: user.name || "",
        email: user.email || "",
        phone: user.phone || "",
        profileImage: null, // Don't show existing image in upload preview
      });
    }
  }, [user]);

  // Fetch user stats for profile page
  useEffect(() => {
    const fetchUserStats = async () => {
      const uid = resolveOrderApiUserId(user);
      if (!uid) {
        setLoadingStats(false);
        return;
      }

      try {
        const response = await fetch(
          `https://${projectId}.supabase.co/functions/v1/make-server-16010b6f/user/${uid}/orders`,
          {
            headers: {
              'Authorization': `Bearer ${publicAnonKey}`,
            },
          }
        );

        if (response.ok) {
          const data = await response.json();
          setOrderCount(data.total || 0);
        }
      } catch (error) {
        console.error('Error fetching user stats:', error);
      } finally {
        setLoadingStats(false);
      }
    };

    if (viewMode === "view-profile") {
      setLoadingStats(true);
      fetchUserStats();
    }
  }, [user, viewMode]);

  // Fetch user orders for order history page
  useEffect(() => {
    const fetchUserOrders = async () => {
      const uid = resolveOrderApiUserId(user);
      if (!uid) {
        setOrdersLoading(false);
        return;
      }

      setOrdersLoading(true);
      setOrdersError(null);

      try {
        const response = await fetch(
          `https://${projectId}.supabase.co/functions/v1/make-server-16010b6f/user/${uid}/orders`,
          {
            headers: {
              'Authorization': `Bearer ${publicAnonKey}`,
            },
          }
        );

        if (response.ok) {
          const data = await response.json();
          setUserOrders(data.orders || []);
        } else {
          throw new Error('Failed to fetch orders');
        }
      } catch (error) {
        console.error('Error fetching user orders:', error);
        setOrdersError(error instanceof Error ? error.message : 'Failed to load orders');
      } finally {
        setOrdersLoading(false);
      }
    };

    const onOrdersUrl =
      location.pathname === "/profile/orders" ||
      location.pathname.startsWith("/profile/orders/");
    if (
      viewMode === "order-history" ||
      viewMode === "order-detail" ||
      onOrdersUrl
    ) {
      fetchUserOrders();
    }
  }, [user, viewMode, location.pathname]);

  // Redirect to auth page if user tries to access protected pages without login
  useEffect(() => {
    const protectedPages: ViewMode[] = ["view-profile", "edit-profile", "order-history", "order-detail", "shipping-addresses", "security-settings"];
    const hasSession = !!resolveOrderApiUserId(user);
    if (protectedPages.includes(viewMode) && !hasSession) {
      console.log('🔒 Protected page access denied, opening auth modal');
      toast.error("Please log in to access this page");
      setViewMode("home");
      setShowAuthModal(true);
      setAuthMode('login');
    }
  }, [viewMode, user]);

  // Load selected order when on order detail page
  useEffect(() => {
    if (viewMode === "order-detail" && userOrders.length > 0 && !selectedOrder) {
      const orderId = location.pathname.replace("/profile/orders/", "");
      const order = userOrders.find(o => o.id === orderId);
      if (order) {
        setSelectedOrder(order);
      }
    }
  }, [viewMode, userOrders, selectedOrder, location.pathname]);

  // Load blog posts when blog view is active
  useEffect(() => {
    if (viewMode === "blog" && blogPosts.length === 0) {
      loadBlogPosts();
    }
  }, [viewMode, blogPosts.length, loadBlogPosts]);

  // 🔥 DATABASE-FIRST: Load addresses from database when shipping-addresses view is active
  useEffect(() => {
    if (viewMode === "shipping-addresses" && user?.id) {
      // 🚀 LOAD FROM LOCALSTORAGE FIRST (FOR INSTANT UI)
      const storageKey = `migoo-shipping-addresses-${user.id}`;
      try {
        const cachedAddresses = localStorage.getItem(storageKey);
        if (cachedAddresses) {
          const parsed = JSON.parse(cachedAddresses);
          if (Array.isArray(parsed) && parsed.length > 0) {
            setShippingAddresses(parsed);
            console.log(`⚡ Loaded ${parsed.length} addresses from localStorage (cache)`);
          }
        }
      } catch (e) {
        console.error('Failed to load addresses from localStorage:', e);
      }

      const loadAddresses = async () => {
        setLoadingAddresses(true);
        try {
          const response = await fetch(
            `https://${projectId}.supabase.co/functions/v1/make-server-16010b6f/customers/${user.id}/addresses`,
            {
              headers: {
                'Authorization': `Bearer ${publicAnonKey}`,
              },
            }
          );
          
          if (response.ok) {
            const data = await response.json();
            const addresses = data.addresses || [];
            setShippingAddresses(addresses);
            
            // 🔥 Sync to localStorage for next refresh
            localStorage.setItem(storageKey, JSON.stringify(addresses));
            console.log(`✅ Loaded ${addresses.length} addresses from database`);
          }
        } catch (error) {
          console.error('Failed to load addresses from database:', error);
          // Don't show toast if we have cached data
          if (shippingAddresses.length === 0) {
            toast.error('Failed to load addresses');
          }
        } finally {
          setLoadingAddresses(false);
        }
      };
      
      loadAddresses();
    }
  }, [viewMode, user?.id]);

  // Handle search - save current state before searching
  const handleSearch = (query: string) => {
    if (query) {
      // Save current state only if we're not already searching
      if (!activeSearchQuery) {
        setPreSearchState({
          viewMode,
          selectedCategory
        });
      }
      setActiveSearchQuery(query);
      setShowSearchSuggestions(false);
      setViewMode("all-products");
    } else {
      // Clear search - restore previous state
      handleClearSearch();
    }
  };

  // Clear search and restore previous view state
  const handleClearSearch = () => {
    setActiveSearchQuery("");
    
    // Restore previous state if it exists
    if (preSearchState) {
      setViewMode(preSearchState.viewMode);
      setSelectedCategory(preSearchState.selectedCategory);
      setPreSearchState(null);
      // Navigate based on the restored view mode
      if (preSearchState.viewMode === "home") {
        navigate("/store");
      } else if (preSearchState.viewMode === "all-products") {
        navigate("/products");
      }
    } else {
      // Fallback: just go to home if no previous state
      navigate("/store");
      setViewMode("home");
    }
  };

  // Sync wishlist to database when user is logged in (guests cannot add to wishlist anymore)
  useEffect(() => {
    if (user) {
      const syncWishlist = async () => {
        try {
          console.log(`💝 [Storefront] Syncing wishlist for user ${user.id}:`, wishlist);
          await wishlistApi.update(user.id, wishlist);
          console.log("✅ Wishlist synced to database");
        } catch (error) {
          console.error("Failed to sync wishlist to database:", error);
        }
      };
      // Debounce the sync to avoid too many API calls
      const timeoutId = setTimeout(syncWishlist, 500);
      return () => clearTimeout(timeoutId);
    }
    // Note: Guests can no longer add to wishlist, so no localStorage sync needed
  }, [wishlist, user]);

  // �� Reset image index when product changes (prevents race condition)
  useEffect(() => {
    if (selectedProduct) {
      setSelectedImageIndex(0);
    }
  }, [selectedProduct?.id]);

  // ⚡ Auto-switch to variant image when variant is selected (FIXES INFINITE LOOP)
  useEffect(() => {
    if (!selectedProduct || !selectedProduct.hasVariants || !selectedProduct.variants) return;
    
    // Build productImages array using ONLY variant images
    let productImages = [selectedProduct.image];
    if (Array.isArray(selectedProduct.variants) && selectedProduct.variants.length > 0) {
      const variantImages = selectedProduct.variants
        .map((v: any) => v?.image)
        .filter((img: any) => img && typeof img === 'string');
      if (variantImages.length > 0) {
        const uniqueVariantImages = [...new Set(variantImages)];
        productImages = uniqueVariantImages;
      }
    }
    
    // Find the matching variant
    const currentVariant = selectedProduct.variants.find((v: any) => {
      if (!selectedProduct.variantOptions) return false;
      const optionNames = selectedProduct.variantOptions.map((opt: any) => opt.name);
      const variantValues = [v.option1, v.option2, v.option3].filter(Boolean);
      return optionNames.every((optionName: string, idx: number) => {
        return selectedVariants[optionName] === variantValues[idx];
      });
    });
    
    // Switch to variant image if found
    if (currentVariant?.image) {
      const variantImageIndex = productImages.indexOf(currentVariant.image);
      if (variantImageIndex >= 0) {
        setSelectedImageIndex(variantImageIndex);
      }
    }
  }, [selectedProduct, selectedVariants]);

  // ✅ Scroll is now handled synchronously in handleProductSelect for instant positioning

  // Handle user login
  const handleLogin = async () => {
    if (!authForm.email || !authForm.password) {
      toast.error("Please enter email and password");
      return;
    }

    setIsAuthLoading(true);
    try {
      const response = await authApi.login(authForm.email, authForm.password);
      const userData = response.user;
      
      // Save guest wishlist before loading user data
      const guestWishlist = [...wishlist];
      
      // 🔥 Save guest cart before loading user data
      const guestCart = [...cart];
      
      // Load user wishlist from database
      const userWishlistResponse = await wishlistApi.get(userData.id);
      const userWishlist = userWishlistResponse.productIds || [];
      
      // ���� Load user cart from database
      let userCart: any[] = [];
      try {
        const cartResponse = await fetch(
          `https://${projectId}.supabase.co/functions/v1/make-server-16010b6f/customers/${userData.id}/cart`,
          {
            headers: {
              'Authorization': `Bearer ${publicAnonKey}`,
            },
          }
        );
        if (cartResponse.ok) {
          const cartData = await cartResponse.json();
          userCart = cartData.cart || [];
        }
      } catch (error) {
        console.error('Failed to load user cart:', error);
      }
      
      // Merge wishlists (remove duplicates)
      const mergedWishlist = Array.from(new Set([...userWishlist, ...guestWishlist]));
      
      // 🔥 Merge carts (prefer user cart, add any unique guest items)
      const mergedCart = [...userCart];
      guestCart.forEach(guestItem => {
        const existsInUserCart = userCart.some(userItem => 
          userItem.id === guestItem.id && 
          JSON.stringify(userItem.selectedOptions) === JSON.stringify(guestItem.selectedOptions)
        );
        if (!existsInUserCart) {
          mergedCart.push(guestItem);
        }
      });
      
      // Update state
      setUser(userData);
      setWishlist(mergedWishlist);
      setCart(mergedCart);
      localStorage.setItem("migoo-user", JSON.stringify(userData));
      localStorage.removeItem("migoo-wishlist"); // Clear guest wishlist from localStorage
      localStorage.removeItem("migoo-guest-cart"); // 🔥 Clear guest cart from localStorage (merged to DB)
      
      // Sync merged wishlist to database if there were any guest items
      if (guestWishlist.length > 0 && mergedWishlist.length > userWishlist.length) {
        await wishlistApi.update(userData.id, mergedWishlist);
        toast.success(`Welcome back, ${userData.name || userData.email}! Your saved items have been merged.`);
      } else {
        toast.success(`Welcome back, ${userData.name || userData.email}!`);
      }
      
      // 🔥 Sync merged cart to database (always sync after login to ensure consistency)
      try {
        await fetch(
          `https://${projectId}.supabase.co/functions/v1/make-server-16010b6f/customers/${userData.id}/cart`,
          {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${publicAnonKey}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ cart: mergedCart }),
          }
        );
        console.log('✅ Cart synced to database after login');
      } catch (error) {
        console.error('Failed to sync cart to database:', error);
      }
      
      setShowAuthModal(false);
      setAuthForm({ email: '', password: '', name: '', phone: '' });
    } catch (error) {
      console.error("Login failed:", error);
      toast.error(error instanceof Error ? error.message : "Login failed");
    } finally {
      setIsAuthLoading(false);
    }
  };

  // Handle user registration
  const handleRegister = async (profileImage?: string) => {
    if (!authForm.email || !authForm.password || !authForm.name) {
      toast.error("Please fill in all required fields");
      return;
    }

    setIsAuthLoading(true);
    try {
      const response = await authApi.register(
        authForm.email,
        authForm.password,
        authForm.name,
        authForm.phone,
        profileImage
      );
      const userData = response.user;
      
      // Save guest wishlist
      const guestWishlist = [...wishlist];
      
      // Update state
      setUser(userData);
      localStorage.setItem("migoo-user", JSON.stringify(userData));
      localStorage.removeItem("migoo-wishlist"); // Clear guest wishlist from localStorage
      
      // Transfer guest wishlist to new user account
      if (guestWishlist.length > 0) {
        setWishlist(guestWishlist);
        await wishlistApi.update(userData.id, guestWishlist);
        toast.success(`Account created! Your ${guestWishlist.length} saved items have been transferred.`);
      } else {
        toast.success("Account created successfully!");
      }
      
      setShowAuthModal(false);
      setAuthForm({ email: '', password: '', name: '', phone: '' });
    } catch (error) {
      console.error("Registration failed:", error);
      toast.error(error instanceof Error ? error.message : "Registration failed");
    } finally {
      setIsAuthLoading(false);
    }
  };

  // Handle user logout
  const handleLogout = () => {
    // 🔥 DATABASE-FIRST: Don't save wishlist to localStorage on logout
    // Wishlist is already in database and will be loaded on next login
    
    // 🔥 Clear cart on logout (database-first: no localStorage persistence)
    setCart([]); // Guests will have empty cart after logout
    setWishlist([]); // Clear wishlist too
    
    setUser(null);
    localStorage.removeItem("migoo-user");
    localStorage.removeItem("migoo-guest-cart"); // Clear any guest cart remnants
    // 🔥 REMOVED: No notification on logout
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

  const userProfileImageUrl = getUserProfileImageUrl(user);

  useEffect(() => {
    setProfileImageLoadFailed(false);
  }, [userProfileImageUrl]);

  // Handle save profile
  const handleSaveProfile = async () => {
    if (!user) {
      toast.error("Please log in to update your profile");
      return;
    }

    console.log('🔍 Current user object:', user);
    console.log('🔍 User ID:', user.id);
    console.log('🔍 User email:', user.email);

    setSaving(true);
    try {
      const payload: any = {
        name: profileForm.name,
        phone: profileForm.phone,
      };

      // Include profile image if a new one was uploaded
      if (profileForm.profileImage) {
        payload.profileImage = profileForm.profileImage;
        // Log the size of the image being sent
        const imageSizeKB = Math.round((profileForm.profileImage.length * 3) / 4 / 1024);
        console.log(`📤 Uploading profile image: ${imageSizeKB}KB`);
      }

      console.log('📤 Sending profile update payload:', { ...payload, profileImage: payload.profileImage ? `[${Math.round((payload.profileImage.length * 3) / 4 / 1024)}KB image]` : undefined });

      const response = await fetch(
        `https://${projectId}.supabase.co/functions/v1/make-server-16010b6f/auth/profile/${user.id}`,
        {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${publicAnonKey}`,
          },
          body: JSON.stringify(payload),
        }
      );

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        console.error('❌ Profile update error response:', errorData);
        console.error('❌ Response status:', response.status);
        throw new Error(errorData.error || 'Failed to update profile');
      }

      const data = await response.json();
      
      if (data.success && data.user) {
        setUser(data.user);
        localStorage.setItem("migoo-user", JSON.stringify(data.user));
        toast.success("Profile updated successfully!");
        setViewMode("view-profile");
      } else {
        throw new Error(data.error || 'Failed to update profile');
      }
    } catch (error) {
      console.error('Error updating profile:', error);
      toast.error("Failed to update profile. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  // ⚡ Optimize cart operations with useCallback
  const addToCart = useCallback((
    product: Product,
    quantity: number = 1,
    variantSku?: string,
    variantImage?: string,
    variantPrice?: string
  ) => {
    setCart(prev => {
      // 🔥 Use variant SKU if provided, otherwise use product SKU
      const effectiveSku = variantSku || product.sku;

      let productWithVariant: Product = { ...product };
      if (variantSku) {
        productWithVariant = { ...productWithVariant, sku: variantSku };
      }
      if (variantPrice !== undefined && variantPrice !== "") {
        productWithVariant = { ...productWithVariant, price: String(variantPrice) };
      }

      // 🎨 If variant image is provided, update both image and images array
      if (variantImage && variantSku) {
        productWithVariant = {
          ...productWithVariant,
          image: variantImage, // Update main image (used by cart)
          images: [variantImage, ...(product.images || [])].filter((img, idx, arr) => arr.indexOf(img) === idx) // Remove duplicates
        };
      }
      
      const existing = prev.find(item => item.sku === effectiveSku);
      if (existing) {
        return prev.map(item =>
          item.sku === effectiveSku
            ? { ...item, quantity: item.quantity + quantity }
            : item
        );
      }
      return [...prev, { ...productWithVariant, quantity }];
    });
    
    // 📱 Only auto-open cart on desktop (md breakpoint and above = 768px)
    // On mobile, user can manually open cart from badge - clean UX without popups
    if (window.innerWidth >= 768) {
      setShowCart(true);
    }
  }, []);

  const removeFromCart = useCallback((productSku: string) => {
    setCart(prev => prev.filter(item => item.sku !== productSku));
    toast.success("Removed from cart");
  }, []);

  const updateQuantity = useCallback((productSku: string, quantity: number) => {
    if (quantity <= 0) {
      removeFromCart(productSku);
      return;
    }
    setCart(prev =>
      prev.map(item =>
        item.sku === productSku ? { ...item, quantity } : item
      )
    );
  }, [removeFromCart]);

  const toggleWishlist = useCallback((productId: string) => {
    // 🔒 Require authentication to add to wishlist
    if (!user) {
      toast.error("Please sign in to add items to your wishlist");
      setShowAuthModal(true);
      setAuthMode('login');
      return;
    }
    
    setWishlist(prev => {
      if (prev.includes(productId)) {
        // Remove from wishlist - badge will update automatically
        toast.success("Removed from wishlist");
        return prev.filter(id => id !== productId);
      } else {
        // Add to wishlist - badge will update automatically
        toast.success("Added to wishlist");
        return [...prev, productId];
      }
    });
  }, [user]);

  const selectVariant = (variantId: string, type: string, imageIndex?: number) => {
    setSelectedVariants(prev => ({
      ...prev,
      [type]: variantId
    }));
    
    // Update main image if variant has an image
    if (imageIndex !== undefined) {
      setSelectedImageIndex(imageIndex);
    }
  };

  // ⚡ Memoize cart total calculation
  const getCartTotal = useCallback(() => {
    // �� If Buy Now mode, calculate only that item
    if (buyNowItem) {
      const priceStr = String(buyNowItem.price || '0');
      const price = parseFloat(priceStr.replace(/[^0-9.]/g, '')) || 0;
      return price * buyNowItem.quantity;
    }
    
    return cart.reduce((total, item) => {
      const priceStr = String(item.price || '0');
      const price = parseFloat(priceStr.replace(/[^0-9.]/g, '')) || 0;
      return total + (price * item.quantity);
    }, 0);
  }, [cart, buyNowItem]);

  // ⚡ Memoize cart items count
  const cartItemsCount = useMemo(() => {
    // 🔥 If Buy Now mode, return only that item count
    if (buyNowItem) {
      return buyNowItem.quantity;
    }
    
    return cart.reduce((total, item) => total + item.quantity, 0);
  }, [cart, buyNowItem]);

  const getCartItemsCount = useCallback(() => cartItemsCount, [cartItemsCount]);

  // ⚡ PRIMARY CURRENCY: Myanmar Kyat (MMK)
  // No conversion - prices are already in MMK
  const formatPriceMMK = useCallback((price: string | number) => {
    const priceStr = String(price || '0');
    const numPrice = parseFloat(priceStr.replace(/[^0-9.]/g, '')) || 0;
    return `${Math.round(numPrice)} MMK`; // Round to remove decimals
  }, []);

  // Get price in MMK (no conversion needed)
  const getPriceInMMK = useCallback((price: string | number) => {
    const priceStr = String(price || '0');
    return parseFloat(priceStr.replace(/[^0-9.]/g, '')) || 0;
  }, []);

  // Generate fake compare price (20-50% higher than actual price)
  // Uses product SKU as seed for consistent pricing
  const generateFakeComparePrice = useCallback((actualPrice: string | number, productSku?: string) => {
    const price = getPriceInMMK(actualPrice);
    // Use SKU to generate consistent fake discount (20-50%)
    let seed = 0.35; // default 35% markup
    if (productSku) {
      // Simple hash from SKU for consistent percentage
      const hash = productSku.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
      seed = 0.2 + (hash % 31) / 100; // 20-50%
    }
    const percentage = 1 + seed;
    return Math.round(price * percentage);
  }, [getPriceInMMK]);

  // Apply coupon - Wrapped in useCallback to prevent re-creation! 🎯
  const handleApplyCoupon = useCallback(async (couponCode: string) => {
    const code = couponCode.trim().toUpperCase();
    
    if (!code) {
      setCouponError('Please enter a coupon code');
      return;
    }
    
    setCouponLoading(true);
    setCouponError('');
    
    try {
      const cartTotal = getCartTotal();
      
      // 🎫 Validate coupon via backend (all coupons now use database)
      const cartItemsForValidation = (buyNowItem ? [buyNowItem] : cart).map(item => {
        const priceStr = String(item.price || '0');
        return {
          id: item.sku,
          sku: item.sku,
          price: parseFloat(priceStr.replace(/[^0-9.]/g, '')) || 0,
          quantity: item.quantity
        };
      });
      
      console.log(`🎫 Validating coupon code: "${code}" (original: "${couponCode.trim()}")`);

      const response = await fetch(
        `https://${projectId}.supabase.co/functions/v1/make-server-16010b6f/campaigns/validate`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${publicAnonKey}`
          },
          body: JSON.stringify({
            code: code, // 🔧 FIX: Send uppercased code to match database
            cartTotal: cartTotal,
            cartItems: cartItemsForValidation
          })
        }
      );
      
      console.log('🎫 Response status:', response.status, response.statusText);
      
      if (!response.ok) {
        const errorText = await response.text();
        console.error('❌ Response not OK:', errorText);
        throw new Error(`Server error: ${response.status} - ${errorText}`);
      }
      
      let data;
      try {
        data = await response.json();
      } catch (parseError) {
        console.error('❌ Failed to parse JSON response:', parseError);
        throw new Error('Invalid response from server');
      }
      
      console.log('🎫 Coupon validation response:', data); // DEBUG
      
      if (data.valid && data.campaign) {
        setAppliedCoupon(data.campaign);
        setCouponError('');
        toast.success(`Coupon applied! You saved $${data.campaign.discountAmount.toFixed(2)}`);
      } else {
        setCouponError(data.error || 'Invalid coupon code');
        setAppliedCoupon(null);
        toast.error(data.error || 'Invalid coupon code');
      }
    } catch (error) {
      console.error('❌ Error applying coupon:', error);
      const errorMessage = error instanceof Error ? error.message : 'Failed to validate coupon';
      setCouponError(errorMessage);
      setAppliedCoupon(null);
      toast.error(errorMessage);
    } finally {
      setCouponLoading(false);
    }
  }, [cart, buyNowItem, getCartTotal]);
  
  // Remove coupon - Wrapped in useCallback! 🎯
  const handleRemoveCoupon = useCallback(() => {
    setAppliedCoupon(null);
    setCouponCode('');
    setCouponError('');
    toast.success('Coupon removed');
  }, []);

  const handleCheckout = useCallback(() => {
    if (cart.length === 0 && !buyNowItem) {
      toast.error("Your cart is empty");
      return;
    }
    
    // 🔒 Require authentication to checkout
    if (!user) {
      toast.error("Please sign in to place an order");
      setShowAuthModal(true);
      setAuthMode('login');
      setShowCart(false);
      return;
    }
    
    // 🧹 Clear buyNowItem when going to regular cart checkout (not express checkout)
    if (cart.length > 0) {
      setBuyNowItem(null);
    }
    
    // 🔥 AUTO-FILL: Load user data and saved addresses from DATABASE when going to checkout
    const loadCheckoutAddress = async () => {
      let defaultAddress = null;
      
      if (user?.id) {
        try {
          // Load addresses from DATABASE (not localStorage)
          const response = await fetch(
            `https://${projectId}.supabase.co/functions/v1/make-server-16010b6f/customers/${user.id}/addresses`,
            {
              headers: {
                'Authorization': `Bearer ${publicAnonKey}`,
              },
            }
          );
          
          if (response.ok) {
            const data = await response.json();
            const addresses = data.addresses || [];
            defaultAddress = addresses.find((addr: any) => addr.isDefault) || addresses[0];
            console.log("📦 Auto-filling checkout with saved address from database:", defaultAddress);
          }
        } catch (error) {
          console.error("Failed to load addresses from database:", error);
        }
      }
      
      // Pre-fill checkout form with user data and saved address
      if (user || defaultAddress) {
        setCustomerInfo({
          name: defaultAddress?.recipientName || user?.name || "",
          phone: defaultAddress?.phone || user?.phone || "",
          address: defaultAddress?.addressLine1 || "",
          city: defaultAddress?.city || "",
          zipCode: defaultAddress?.zipCode || "",
          country: "Myanmar",
          notes: ""
        });
        console.log("✅ Checkout form auto-filled");
      }
    };
    
    loadCheckoutAddress();
    
    setViewMode("checkout");
    setShowCart(false);
  }, [cart, buyNowItem, user]);

  // 🔥 NEW: Direct Buy Now - Bypass cart entirely!
  const handleBuyNow = (product: Product, variantSku?: string, variantImage?: string) => {
    // 🔒 Require authentication to buy now
    if (!user) {
      toast.error("Please sign in to place an order");
      setShowAuthModal(true);
      setAuthMode('login');
      setSelectedProduct(null); // Close product modal
      return;
    }
    
    let productWithVariant = variantSku ? { ...product, sku: variantSku } : product;
    if (variantImage && variantSku) {
      productWithVariant = {
        ...productWithVariant,
        image: variantImage, // Update main image (used by order summary)
        images: [variantImage, ...(product.images || [])].filter((img, idx, arr) => arr.indexOf(img) === idx) // Remove duplicates
      };
    }
    
    const buyItem: CartItem = {
      ...productWithVariant,
      quantity: 1
    };
    setBuyNowItem(buyItem);
    setSelectedProduct(null); // Close product modal
    setViewMode("checkout");
  };

  const handlePlaceOrder = async () => {
    // Validate form
    if (!customerInfo.name || !customerInfo.phone || !customerInfo.address || !customerInfo.city) {
      toast.error("Please fill in all required fields");
      return;
    }

    // Validate payment method
    if (!paymentMethod) {
      toast.error("Please select a payment method");
      return;
    }

    // 🚫 Block KPay and Bank Transfer - Show Coming Soon notification
    if (paymentMethod === "KPay" || paymentMethod === "BankTransfer") {
      toast.info("🚀 Coming Soon! This payment method will be available soon.", { 
        duration: 4000,
        style: {
          background: '#3b82f6',
          color: '#fff',
        }
      });
      return;
    }

    // 💳 TEST CARD PAYMENT PROCESSING (Stripe-style)
    if (paymentMethod === "Card") {
      // Validate card fields
      if (!paymentInfo.cardNumber || !paymentInfo.cardName || !paymentInfo.expiryDate || !paymentInfo.cvv) {
        toast.error("Please fill in all card details");
        return;
      }

      // Remove spaces from card number for validation
      const cardNumberClean = paymentInfo.cardNumber.replace(/\s/g, '');

      // Validate card number length
      if (cardNumberClean.length < 13 || cardNumberClean.length > 19) {
        toast.error("Invalid card number");
        return;
      }

      // Validate expiry date format
      if (!/^\d{2}\/\d{2}$/.test(paymentInfo.expiryDate)) {
        toast.error("Invalid expiry date format (MM/YY)");
        return;
      }

      // Validate CVV
      if (paymentInfo.cvv.length < 3 || paymentInfo.cvv.length > 4) {
        toast.error("Invalid CVV");
        return;
      }

      setIsProcessingOrder(true);

      // 🧪 SIMULATE PAYMENT PROCESSING (like Stripe test mode)
      toast.info("Processing payment...", { duration: 2000 });
      
      // Wait 2 seconds to simulate payment gateway
      await new Promise(resolve => setTimeout(resolve, 2000));

      // TEST CARD NUMBERS (Stripe-style)
      const testCards = {
        success: ['4242424242424242', '4242 4242 4242 4242'],
        declined: ['4000000000000002', '4000 0000 0000 0002'],
        insufficient: ['4000000000009995', '4000 0000 0000 9995'],
        expired: ['4000000000000069', '4000 0000 0000 0069']
      };

      // Check test card results
      if (testCards.declined.includes(cardNumberClean) || testCards.declined.includes(paymentInfo.cardNumber)) {
        setIsProcessingOrder(false);
        toast.error("💳 Card Declined - Your card was declined. Please try another card.", { duration: 5000 });
        return;
      }

      if (testCards.insufficient.includes(cardNumberClean) || testCards.insufficient.includes(paymentInfo.cardNumber)) {
        setIsProcessingOrder(false);
        toast.error("💳 Insufficient Funds - Your card has insufficient funds.", { duration: 5000 });
        return;
      }

      if (testCards.expired.includes(cardNumberClean) || testCards.expired.includes(paymentInfo.cardNumber)) {
        setIsProcessingOrder(false);
        toast.error("💳 Card Expired - Your card has expired. Please use a different card.", { duration: 5000 });
        return;
      }

      // Check if it's a valid test success card
      if (!testCards.success.includes(cardNumberClean) && !testCards.success.includes(paymentInfo.cardNumber)) {
        // For demo purposes, accept any other card number as successful
        // In production, you'd integrate with real payment gateway here
        console.log("⚠️ Using non-test card number - accepting for demo");
      }

      // ✅ Payment successful!
      toast.success("💳 Payment Successful!", { duration: 3000 });
    } else {
      setIsProcessingOrder(true);
    }

    try {
      const orderNum = `MG${Date.now().toString().slice(-8)}`;
      const orderTotal = getCartTotal();
      
      // 🔥 Use Buy Now item if exists, otherwise use cart
      const itemsToOrder = buyNowItem ? [buyNowItem] : cart;
      
      // Prepare order data
      const orderData = {
        orderNumber: orderNum,
        userId: user?.id || null, // 🔥 Top-level userId for filtering user orders
        customer: {
          ...customerInfo,
          fullName: customerInfo.name,
          userId: user?.id || null
        },
        customerName: customerInfo.name, // 🔥 Top-level customer name for ERP
        email: user?.email || '', // 🔥 Top-level email for ERP
        phone: customerInfo.phone, // 🔥 Top-level phone for ERP
        items: itemsToOrder.map(item => ({
          productId: item.id,
          name: item.name,
          sku: item.sku,
          price: item.price,
          quantity: item.quantity,
          image: item.image,
          vendorId: item.vendorId || 'migoo' // 🔥 Include vendor ID (defaults to 'migoo' for platform products)
        })),
        subtotal: orderTotal.toFixed(2),
        discount: appliedCoupon ? appliedCoupon.discountAmount.toFixed(2) : '0.00',
        couponCode: appliedCoupon?.code || null,
        couponDiscount: appliedCoupon?.discount || null,
        couponType: appliedCoupon?.discountType || null,
        total: (orderTotal - (appliedCoupon?.discountAmount || 0)).toFixed(2),
        totalFormatted: `$${(orderTotal - (appliedCoupon?.discountAmount || 0)).toFixed(2)}`,
        status: 'pending',
        vendor: 'SECURE Store',
        paymentMethod: paymentMethod === "Card" ? "Credit/Debit Card" : paymentMethod === "KPay" ? "KPay" : "Bank Transfer",
        shippingAddress: `${customerInfo.address}, ${customerInfo.city}, ${customerInfo.zipCode}, ${customerInfo.country}`,
        notes: customerInfo.notes || ''
      };
      
      // Save order to database
      await ordersApi.create(orderData);
      
      // 🎫 Track coupon usage if a coupon was applied
      if (appliedCoupon?.id) {
        try {
          console.log(`🎫 Incrementing coupon usage for: ${appliedCoupon.code}`);
          console.log(`🎫 Campaign ID: ${appliedCoupon.id}`);
          console.log(`🎫 Discount amount (revenue): ${appliedCoupon.discountAmount} MMK`);
          
          const incrementResponse = await fetch(
            `https://${projectId}.supabase.co/functions/v1/make-server-16010b6f/campaigns/${appliedCoupon.id}/increment`,
            {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${publicAnonKey}`,
              },
              body: JSON.stringify({
                revenue: appliedCoupon.discountAmount // Track the discount amount (how much customer saved)
              })
            }
          );
          
          console.log(`🎫 Increment response status: ${incrementResponse.status}`);
          
          if (incrementResponse.ok) {
            const incrementData = await incrementResponse.json();
            console.log(`✅ Coupon usage tracked successfully!`);
            console.log(`📊 Updated metrics:`, incrementData);
          } else {
            const errorText = await incrementResponse.text();
            console.error(`❌ Failed to track coupon usage:`, errorText);
          }
        } catch (incrementError) {
          console.error(`❌ Error tracking coupon usage:`, incrementError);
        }
      } else {
        console.log('ℹ️ No coupon applied for this order');
      }
      
      // 🔥 INSTANT BADGE UPDATE - Notify admin panel immediately!
      onOrderPlaced?.();
      
      // Create or update customer record
      if (user) {
        try {
          await customersApi.create({
            userId: user.id,
            email: user.email || '',
            phone: customerInfo.phone,
            name: customerInfo.name,
            fullName: customerInfo.name,
            location: `${customerInfo.city}, ${customerInfo.country}`, // Combined location for display
            address: customerInfo.address,
            city: customerInfo.city,
            zipCode: customerInfo.zipCode,
            country: customerInfo.country,
            totalOrders: 1,
            totalSpent: orderTotal.toFixed(2)
          });
        } catch (error: any) {
          // ✅ Silently ignore "customer already exists" error - it's not a problem
          if (error?.message?.includes('already exists')) {
            console.log(`ℹ️ Customer already exists for ${user.email} - no action needed`);
          } else {
            console.error("Failed to create customer record:", error);
          }
        }
      }
      
      setOrderNumber(orderNum);
      
      // 🔥 Store complete order details BEFORE clearing cart
      setCompletedOrder({
        orderNumber: orderNum,
        customer: {
          name: customerInfo.name,
          phone: customerInfo.phone,
          address: customerInfo.address,
          city: customerInfo.city,
          zipCode: customerInfo.zipCode,
          country: customerInfo.country,
          notes: customerInfo.notes
        },
        items: itemsToOrder.map(item => ({
          ...item,
          price: formatPriceMMK(item.price) // Convert "$100" to "100 MMK"
        })),
        subtotal: orderTotal,
        discount: appliedCoupon?.discountAmount || 0,
        couponCode: appliedCoupon?.code || null,
        total: orderTotal - (appliedCoupon?.discountAmount || 0),
        totalFormatted: formatPriceMMK(`$${(orderTotal - (appliedCoupon?.discountAmount || 0)).toFixed(2)}`) // Convert to MMK format
      });
      
      setViewMode("order-confirmation");
      
      // 🔥 Clear cart only if it was a cart order (not Buy Now)
      if (buyNowItem) {
        setBuyNowItem(null); // Clear Buy Now item
      } else {
        setCart([]);
        // 🔥 DATABASE-FIRST: Clear cart from database too (for logged-in users)
        if (user?.id) {
          try {
            await fetch(
              `https://${projectId}.supabase.co/functions/v1/make-server-16010b6f/customers/${user.id}/cart`,
              {
                method: 'POST',
                headers: {
                  'Authorization': `Bearer ${publicAnonKey}`,
                  'Content-Type': 'application/json',
                },
                body: JSON.stringify({ cart: [] }),
              }
            );
            console.log('🛒 Cart cleared from database after order');
          } catch (error) {
            console.error('Failed to clear cart from database:', error);
          }
        }
        // Guest cart will be auto-cleared from localStorage by the cart useEffect
      }
      
      // Clear applied coupon after order is placed
      setAppliedCoupon(null);
      setCouponCode('');
      
      toast.success("Order placed successfully!");
      
      // Show dynamic order confirmation toast notification
      const finalTotal = orderTotal - (appliedCoupon?.discountAmount || 0);
      toast(
        <div className="flex items-start gap-3">
          <div className="flex-shrink-0 w-10 h-10 rounded-full bg-green-500 flex items-center justify-center">
            <Package className="w-5 h-5 text-white" />
          </div>
          <div className="flex-1">
            <p className="text-sm font-semibold text-slate-900">Order Confirmed! 🎉</p>
            <p className="text-xs text-slate-600 mt-0.5">
              Order {orderNum} • ${finalTotal.toFixed(2)}
            </p>
          </div>
        </div>,
        {
          duration: 6000,
          className: "bg-green-50 border-green-200"
        }
      );
      
      // Reset customer info for next order
      setCustomerInfo({
        firstName: user?.name?.split(' ')[0] || "",
        lastName: user?.name?.split(' ').slice(1).join(' ') || "",
        email: user?.email || "",
        phone: user?.phone || "",
        address: "",
        city: "",
        state: "",
        zipCode: "",
        country: "Myanmar",
        notes: ""
      });
    } catch (error) {
      console.error("Failed to place order:", error);
      toast.error(error instanceof Error ? error.message : "Failed to place order");
    } finally {
      setIsProcessingOrder(false);
    }
  };

  const categories = useMemo(() => {
    const fromDb = allCategories.map((c: any) => c.name).filter(Boolean);
    if (fromDb.length > 0) return fromDb as string[];
    return Array.from(new Set(products.map((p) => p.category).filter(Boolean))) as string[];
  }, [allCategories, products]);

  // Search/category/sort are applied on the server (paginated catalog).
  const filteredProducts = products;
  const sortedProducts = products;

  const dealProducts = useMemo(() => {
    if (homeDealProducts.length > 0) return homeDealProducts;
    const topSelling = products.filter((p) => p.salesVolume > 100).slice(0, 10);
    return topSelling.length > 0 ? topSelling : products.slice(0, 10);
  }, [homeDealProducts, products]);

  const newArrivals = useMemo(() => {
    if (homeNewArrivals.length > 0) return homeNewArrivals;
    return [...products]
      .sort(
        (a, b) =>
          new Date(b.createDate).getTime() - new Date(a.createDate).getTime()
      )
      .slice(0, 6);
  }, [homeNewArrivals, products]);

  // ⚡ Memoize related products function
  const getRelatedProducts = useCallback((currentProduct: Product) => {
    return products
      .filter(p => p.id !== currentProduct.id && p.category === currentProduct.category)
      .slice(0, 4);
  }, [products]);

  // Banners state - loaded from backend
  const [banners, setBanners] = useState([
    {
      id: 1,
      title: "Exclusive Collection",
      subtitle: "Discover premium products crafted for elegance",
      bg: "from-teal-600 to-cyan-600",
      badgeText: "Premium Selection",
      cta: "Explore Collection",
      textColor: 'light' as const,
      backgroundImage: ""
    },
    {
      id: 2,
      title: "New Arrivals",
      subtitle: "Be the first to discover our latest selections",
      bg: "from-cyan-900 to-teal-900",
      badgeText: "Premium Selection",
      cta: "Shop Now",
      textColor: 'light' as const,
      backgroundImage: ""
    },
    {
      id: 3,
      title: "Premium Experience",
      subtitle: "Complimentary delivery on all orders",
      bg: "from-indigo-900 to-slate-900",
      badgeText: "Premium Selection",
      cta: "Learn More",
      textColor: 'light' as const,
      backgroundImage: ""
    }
  ]);

  // Header Component
  const Header = () => (
    <header className={`${isNavbarSticky ? 'sticky top-0' : 'relative'} z-50 bg-white shadow-md transition-all duration-300`}>
      {/* Main Header */}
      <div className="border-b border-slate-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between gap-2 sm:gap-4 md:gap-8 h-16 sm:h-[4.5rem]">
            {/* Logo */}
            <button 
              onClick={() => {
                // Navigate to home URL first to prevent URL/state mismatch
                navigate("/store");
                setSelectedProduct(null);
                setViewMode("home");
                setSelectedCategory("all");
              }}
              className="flex items-center group flex-shrink-0"
            >
              <span className="text-orange-600 text-2xl sm:text-3xl lg:text-3xl uppercase font-bold" style={{ fontFamily: 'Rubik, sans-serif', letterSpacing: '0.05em' }}>{siteSettings.storeName}</span>
            </button>

            {/* Search Bar */}
            <div className="hidden md:flex flex-1 max-w-2xl relative">
              <SearchInput
                placeholder="Search for luxury products... (Press Enter)"
                onSearch={handleSearch}
                className="w-full"
                inputClassName="h-11 pl-11 pr-11 rounded-full border-0 bg-slate-100/60 hover:bg-slate-100 focus:bg-white focus:ring-2 focus:ring-amber-500/20 transition-all text-sm text-slate-700 placeholder:text-slate-400 shadow-sm backdrop-blur-sm w-full"
                variant="desktop"
                value={activeSearchQuery}
              />
            </div>

                {/* 🔍 DISABLED: All search suggestions removed - search only works on Enter
                {showSearchSuggestions && !searchQuery && (
                  <div className="absolute top-full left-0 right-0 mt-2 bg-white rounded-2xl shadow-xl border border-slate-200 p-4 z-50 backdrop-blur-sm">
                    <div className="mb-3">
                      <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">Popular Searches</p>
                      <div className="flex flex-wrap gap-2">
                        {popularSearches.map((term) => (
                          <button
                            key={term}
                            onClick={() => {
                              setActiveSearchQuery(term);
                              setShowSearchSuggestions(false);
                              setViewMode("all-products");
                            }}
                            className="px-3 py-1.5 text-sm bg-slate-100 hover:bg-amber-100 hover:text-amber-700 text-slate-700 rounded-full transition-colors"
                          >
                            {term}
                          </button>
                        ))}
                      </div>
                    </div>
                    <Separator className="my-3" />
                    <div>
                      <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">Quick Categories</p>
                      <div className="grid grid-cols-2 gap-2">
                        {categoryGroups.slice(0, 4).map((cat) => {
                          const Icon = categoryIcons[cat] || categoryIcons.Default;
                          return (
                            <button
                              key={cat}
                              onClick={() => {
                                setSelectedCategory(cat);
                                setViewMode("all-products");
                                setShowSearchSuggestions(false);
                              }}
                              className="flex items-center gap-2 px-3 py-2 text-sm hover:bg-amber-50 hover:text-amber-700 text-slate-700 rounded-lg transition-colors"
                            >
                              <Icon className="w-4 h-4" />
                              <span>{cat}</span>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                )}
                */}

                {/* 🔍 Search Suggestions - Shows matching products as you type */}
                {/* DISABLED: Search only works on Enter key press
                {showSearchSuggestions && searchQuery && debouncedSearchQuery && (
                  <div className="absolute top-full left-0 right-0 mt-2 bg-white rounded-2xl shadow-xl border border-slate-200 overflow-hidden z-50 backdrop-blur-sm max-h-96 overflow-y-auto">
                    {(() => {
                      // Create preview list based on what user is typing (not activeSearchQuery)
                      const previewProducts = products.filter(product => {
                        const productName = String(product.name || '').toLowerCase();
                        const query = String(debouncedSearchQuery || '').toLowerCase();
                        return productName.includes(query);
                      });

                      return previewProducts.length > 0 ? (
                        <div className="p-2">
                          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider px-3 py-2">
                            {previewProducts.length} {previewProducts.length === 1 ? 'Suggestion' : 'Suggestions'} - Press Enter to search
                          </p>
                          <div className="space-y-1">
                            {previewProducts.slice(0, 5).map((product) => (
                              <button
                                key={product.id}
                                onClick={() => {
                                  handleProductSelect(product);
                                  setShowSearchSuggestions(false);
                                }}
                                className="w-full flex items-center gap-3 p-2 hover:bg-amber-50 rounded-lg transition-colors text-left"
                              >
                                <img 
                                  src={product.image} 
                                  alt={product.name}
                                  className="w-12 h-12 object-cover rounded-lg"
                                />
                                <div className="flex-1 min-w-0">
                                  <p className="text-sm font-medium text-slate-900 truncate">{product.name}</p>
                                  <p className="text-xs text-slate-500">{product.category}</p>
                                </div>
                                <p className="text-sm font-semibold text-amber-600">{product.price}</p>
                              </button>
                            ))}
                          </div>
                          {previewProducts.length > 5 && (
                            <button
                              onClick={() => {
                                setActiveSearchQuery(searchQuery);
                                setViewMode("all-products");
                                setShowSearchSuggestions(false);
                              }}
                              className="w-full mt-2 py-2 text-sm text-amber-600 hover:text-amber-700 font-medium flex items-center justify-center gap-1"
                            >
                              Press Enter or click to see all {previewProducts.length} results
                              <ArrowRight className="w-4 h-4" />
                            </button>
                          )}
                        </div>
                      ) : (
                        <div className="p-8 text-center">
                          <Search className="w-12 h-12 text-slate-300 mx-auto mb-3" />
                          <p className="text-sm text-slate-600 font-medium">No products found</p>
                          <p className="text-xs text-slate-400 mt-1">Try a different search term</p>
                        </div>
                      );
                    })()}
                  </div>
                )}
                */}

            {/* Actions */}
            <div className="flex items-center gap-2 sm:gap-2.5 md:gap-3">
              <Button 
                variant="ghost" 
                size="icon"
                className="relative hidden md:flex hover:bg-slate-100 rounded-full w-10 h-10"
                onClick={() => {
                  // 🔒 Require authentication to view wishlist
                  if (!user) {
                    toast.error("Please sign in to view your wishlist");
                    setShowAuthModal(true);
                    setAuthMode('login');
                    return;
                  }
                  setViewMode("saved-products");
                  setUserAppliedFilters(false);
                  setHideSavedBanner(true);
                }}
              >
                <Heart className="w-5 h-5 text-slate-700" />
                {wishlist.length > 0 && (
                  <Badge className="absolute -top-1 -right-1 w-5 h-5 flex items-center justify-center p-0 bg-amber-600 text-white text-xs border-2 border-white">
                    {wishlist.length}
                  </Badge>
                )}
              </Button>
              
              <Button 
                variant="ghost" 
                size="icon" 
                className="md:hidden relative hover:bg-slate-100 rounded-full w-10 h-10"
                onClick={() => setShowMobileSearch(true)}
              >
                <Search className="w-5 h-5 text-slate-700" />
              </Button>

              <Button 
                variant="ghost" 
                size="icon"
                className="relative hover:bg-slate-100 rounded-full w-10 h-10"
                onClick={() => setShowCart(!showCart)}
              >
                <ShoppingCart className="w-5 h-5 text-slate-700" />
                {cart.length > 0 && (
                  <Badge className="absolute -top-1 -right-1 w-5 h-5 flex items-center justify-center p-0 bg-amber-600 text-white text-xs border-2 border-white">
                    {getCartItemsCount()}
                  </Badge>
                )}
              </Button>

              <NotificationCenter
                chatUnreadCount={0}
                onChatClick={() => {}}
              />

              {/* Profile Menu - Show text for guests, icon for logged-in users */}
              {user ? (
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="ghost" size="icon" className="hidden md:flex hover:bg-slate-100 rounded-full w-10 h-10 p-0">
                      {userProfileImageUrl && !profileImageLoadFailed ? (
                        <img 
                          src={userProfileImageUrl} 
                          alt={user.name} 
                          className="w-8 h-8 rounded-full object-cover"
                          onError={() => setProfileImageLoadFailed(true)}
                        />
                      ) : (
                        <User className="w-5 h-5 text-slate-700" />
                      )}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-56 p-2" align="end">
                    <div className="space-y-1">
                      {/* Logged In User Menu */}
                      <div className="px-3 py-2 border-b border-slate-200 mb-2 flex items-center gap-3">
                        {userProfileImageUrl && !profileImageLoadFailed ? (
                          <img 
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
                      <Button 
                        variant="ghost" 
                        className="w-full justify-start text-slate-700 hover:bg-slate-100"
                        onClick={() => {
                          setViewMode("view-profile");
                        }}
                      >
                        <Eye className="w-4 h-4 mr-3" />
                        View Profile
                      </Button>
                      <Button 
                        variant="ghost" 
                        className="w-full justify-start text-slate-700 hover:bg-slate-100"
                        onClick={() => {
                          setViewMode("edit-profile");
                        }}
                      >
                        <Settings className="w-4 h-4 mr-3" />
                        Edit Profile
                      </Button>
                      <Button 
                        variant="ghost" 
                        className="w-full justify-start text-slate-700 hover:bg-slate-100"
                        onClick={() => {
                          setViewMode("order-history");
                        }}
                      >
                        <Package className="w-4 h-4 mr-3" />
                        Order History
                      </Button>
                      <Button 
                        variant="ghost" 
                        className="w-full justify-start text-slate-700 hover:bg-slate-100"
                        onClick={() => {
                          setViewMode("shipping-addresses");
                        }}
                      >
                        <MapPin className="w-4 h-4 mr-3" />
                        Shipping Addresses
                      </Button>
                      <Button 
                        variant="ghost" 
                        className="w-full justify-start text-slate-700 hover:bg-slate-100"
                        onClick={() => {
                          setViewMode("security-settings");
                        }}
                      >
                        <Shield className="w-4 h-4 mr-3" />
                        Security Settings
                      </Button>
                      <Separator className="my-2" />
                      <Button 
                        variant="ghost" 
                        className="w-full justify-start text-red-600 hover:bg-red-50"
                        onClick={handleLogout}
                      >
                        <LogOut className="w-4 h-4 mr-3" />
                        Logout
                      </Button>
                    </div>
                  </PopoverContent>
                </Popover>
              ) : (
                <Button 
                  variant="ghost" 
                  className="hidden md:flex items-center text-slate-700 hover:bg-slate-100 font-medium h-10 px-4"
                  onClick={() => {
                    setShowAuthModal(true);
                    setAuthMode('login');
                  }}
                >
                  Login / Register
                </Button>
              )}

              <Button 
                variant="ghost" 
                size="icon"
                className="md:hidden hover:bg-slate-100 rounded-full w-10 h-10"
                onClick={() => setShowMobileMenu(!showMobileMenu)}
              >
                <Menu className="w-5 h-5 text-slate-700" />
              </Button>
            </div>
          </div>
        </div>
      </div>

      {/* Sub Navigation Bar */}
      <div className="hidden md:block bg-white border-b border-slate-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between py-3">
              {/* Navigation Links */}
              <div className="flex items-center gap-x-6">
              {/* All Products */}
              <button 
                type="button"
                onClick={() => {
                  console.log('🔍 All Products clicked, Current product:', selectedProduct?.name);
                  setSelectedProduct(null);
                  setSelectedCategory("all");
                  setUserAppliedFilters(false);
                  setViewMode("all-products");
                }}
                className={`text-sm font-medium transition-colors whitespace-nowrap ${
                  viewMode === "all-products" && selectedCategory === "all"
                    ? "text-amber-700 font-semibold" 
                    : "text-slate-700 hover:text-amber-700"
                }`}
              >
                All Products
              </button>

              {/* Dynamic Categories from Database */}
              {allCategories.map((category) => (
                <button
                  type="button"
                  key={category.id}
                  onClick={() => {
                    console.log('🔍 Category clicked:', category.name, 'Current product:', selectedProduct?.name);
                    setSelectedProduct(null);
                    setSelectedCategory(category.name);
                    setUserAppliedFilters(false);
                    setViewMode("all-products");
                  }}
                  className={`text-sm font-medium transition-colors whitespace-nowrap ${
                    selectedCategory === category.name
                      ? "text-amber-700 font-semibold"
                      : "text-slate-700 hover:text-amber-700"
                  }`}
                >
                  {category.name}
                </button>
              ))}

              </div>

              {/* Phone Number */}
              <a 
                href={`tel:${siteSettings.storePhone}`}
                className="flex items-center gap-2 text-slate-700 hover:text-orange-600 transition-colors cursor-pointer"
              >
                <Phone className="w-4 h-4" />
                <span className="text-sm font-medium">{siteSettings.storePhone}</span>
              </a>
          </div>
        </div>
      </div>

      {/* Mobile Menu */}
      {showMobileMenu && (
        <>
          {/* Backdrop */}
          <div 
            className="fixed inset-0 bg-black/50 md:hidden"
            style={{ zIndex: 40 }}
            onClick={(e) => {
              e.stopPropagation();
              setShowMobileMenu(false);
            }}
          />
          
          {/* Side Navigation */}
          <div 
            className="fixed left-0 top-0 h-full w-80 bg-white shadow-2xl md:hidden overflow-y-auto animate-slide-down"
            style={{ zIndex: 50 }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center justify-between p-4 border-b border-slate-200">
              <span className="text-orange-600 text-2xl uppercase font-bold" style={{ fontFamily: 'Rubik, sans-serif', letterSpacing: '0.05em' }}>{siteSettings.storeName}</span>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setShowMobileMenu(false)}
                className="hover:bg-slate-100 rounded-full"
              >
                <X className="w-5 h-5" />
              </Button>
            </div>
            
            {/* Menu Content */}
            <div className="p-4 space-y-4">
              {/* Sign In / User Profile Button */}
              {user ? (
                <div className="space-y-3">
                  <div className="flex items-center gap-3 p-3 border border-slate-200 rounded-lg">
                    {userProfileImageUrl && !profileImageLoadFailed ? (
                      <img 
                        src={userProfileImageUrl} 
                        alt={user.name} 
                        className="w-10 h-10 rounded-full object-cover flex-shrink-0"
                        onError={() => setProfileImageLoadFailed(true)}
                      />
                    ) : (
                      <div className="w-10 h-10 rounded-full bg-gradient-to-br from-amber-500 to-orange-600 flex items-center justify-center flex-shrink-0">
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
                    onClick={() => {
                      setShowMobileMenu(false);
                      setViewMode("view-profile");
                    }}
                  >
                    <UserCircle className="w-4 h-4 mr-2" />
                    View Profile
                  </Button>
                  
                  <Button 
                    variant="outline" 
                    className="w-full justify-start hover:bg-slate-50 text-red-600 border-red-200 hover:bg-red-50"
                    onClick={() => {
                      handleLogout();
                      setShowMobileMenu(false);
                    }}
                  >
                    <LogOut className="w-4 h-4 mr-2" />
                    Sign Out
                  </Button>
                </div>
              ) : (
                <Button 
                  variant="outline" 
                  className="w-full justify-start hover:bg-slate-50"
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    setShowMobileMenu(false);
                    setShowAuthModal(true);
                    setAuthMode('login');
                  }}
                  style={{ position: 'relative', zIndex: 100 }}
                >
                  <User className="w-4 h-4 mr-2" />
                  Sign In
                </Button>
              )}
              <Button variant="outline" className="w-full justify-start hover:bg-slate-50" onClick={() => {
                // 🔒 Require authentication to view wishlist
                if (!user) {
                  toast.error("Please sign in to view your wishlist");
                  setShowAuthModal(true);
                  setAuthMode('login');
                  setShowMobileMenu(false);
                  return;
                }
                setShowMobileMenu(false);
                setSelectedProduct(null);
                setViewMode("saved-products");
                setUserAppliedFilters(false);
                setHideSavedBanner(true);
              }}>
                <Heart className="w-4 h-4 mr-2" />
                Wishlist ({wishlist.length})
              </Button>
              
              <Separator />
              
              {/* Navigation Items */}
              <div className="space-y-3">
                <p className="text-sm font-semibold text-slate-600">Browse</p>
                
                {/* All Products */}
                <Button
                  variant="ghost"
                  className={`w-full justify-start hover:bg-slate-50 ${
                    viewMode === "all-products" && selectedCategory === "all"
                      ? "bg-amber-50 text-amber-700 font-semibold"
                      : ""
                  }`}
                  onClick={() => {
                    setSelectedProduct(null);
                    setSelectedCategory("all");
                    setUserAppliedFilters(false);
                    setViewMode("all-products");
                    setShowMobileMenu(false);
                  }}
                >
                  All Products
                </Button>

                {/* Categories Grid - 4 per row */}
                <div>
                  <p className="text-sm font-semibold text-slate-700 mb-3">Explore by Category</p>
                  <div className="grid grid-cols-4 gap-3 mb-3">
                    {allCategories.map((category) => {
                      const IconComponent = getCategoryIcon(category.name);
                      return (
                        <button
                          type="button"
                          key={category.id}
                          onClick={() => {
                            setSelectedProduct(null);
                            setSelectedCategory(category.name);
                            setUserAppliedFilters(false);
                            setViewMode("all-products");
                            setShowMobileMenu(false);
                          }}
                          className={`flex flex-col items-center gap-1.5 p-2 rounded-xl transition-all ${
                            selectedCategory === category.name
                              ? "bg-amber-50"
                              : "hover:bg-slate-50"
                          }`}
                        >
                          <div className={`w-12 h-12 rounded-xl flex items-center justify-center shadow-sm transition-all ${
                            selectedCategory === category.name
                              ? "bg-slate-900"
                              : "bg-white"
                          }`}>
                            <IconComponent className={`w-5 h-5 ${
                              selectedCategory === category.name
                                ? "text-white"
                                : "text-slate-700"
                            }`} />
                          </div>
                          <span className={`text-[9px] text-center font-medium leading-tight ${
                            selectedCategory === category.name
                              ? "text-slate-900"
                              : "text-slate-600"
                          }`}>
                            {category.name}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Saved */}
                <Button
                  variant="ghost"
                  className="w-full justify-start hover:bg-slate-50"
                  onClick={() => {
                    setShowMobileMenu(false);
                    toast.info(`You have ${wishlist.length} items saved`);
                  }}
                >
                  Saved
                </Button>
              </div>

              <Separator />
            </div>
          </div>
        </>
      )}

      {/* Mobile Search Overlay */}
      {showMobileSearch && (
        <div className="fixed inset-0 bg-white z-50 md:hidden animate-fade-in">
          <div className="flex flex-col h-full">
            {/* Search Header */}
            <div className="flex items-center gap-3 p-4 border-b border-slate-200">
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setShowMobileSearch(false)}
                className="hover:bg-slate-100 rounded-full flex-shrink-0"
              >
                <X className="w-5 h-5" />
              </Button>
              <div className="flex-1">
                <SearchInput
                  placeholder="Search... (Press Enter)"
                  onSearch={(query) => {
                    handleSearch(query);
                    setUserAppliedFilters(false);
                    setShowMobileSearch(false);
                  }}
                  value={activeSearchQuery}
                  autoFocus
                  variant="mobile"
                  inputClassName="w-full px-4 py-2.5 pr-10 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500 text-sm"
                />
              </div>
            </div>

            {/* Search Content/Suggestions */}
            <div className="flex-1 overflow-y-auto p-4">
              {activeSearchQuery ? (
                <div className="space-y-2">
                  <p className="text-sm font-semibold text-slate-600 mb-3">Search Results</p>
                  <p className="text-sm text-slate-500">
                    Press Enter to search for "{activeSearchQuery}"
                  </p>
                </div>
              ) : (
                <div className="space-y-4">
                  <div>
                    <p className="text-sm font-semibold text-slate-600 mb-3">Popular Searches</p>
                    <div className="space-y-2">
                      {['Electronics', 'Fashion', 'Home & Garden', 'Sports'].map((term) => (
                        <button
                          key={term}
                          onClick={() => {
                            setActiveSearchQuery(term);
                            setViewMode("all-products");
                            setUserAppliedFilters(false);
                            setShowMobileSearch(false);
                          }}
                          className="flex items-center gap-2 text-sm text-slate-700 hover:text-amber-700 transition-colors w-full text-left"
                        >
                          <Search className="w-4 h-4 text-slate-400" />
                          {term}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </header>
  );

  // Shopping Cart Sidebar - Memoized to prevent re-creation on every render! 🚀
  const CartSidebar = useMemo(() => (
    showCart && (
      <>
        {/* Semi-transparent backdrop for better UX */}
        <div 
          className="fixed inset-0 bg-black/10 z-40" 
          onClick={() => setShowCart(false)}
        />
        
        {/* Cart Sidebar */}
        <div 
          className="fixed right-0 top-0 h-full w-full max-w-md bg-white shadow-2xl z-50 animate-fade-in-right"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex flex-col h-full">
            <div className="flex items-center justify-between p-4 border-b bg-gradient-to-r from-slate-800 to-slate-700 text-white">
              <div>
                <h2 className="text-xl font-semibold">Shopping Cart</h2>
                <p className="text-sm text-slate-300">{getCartItemsCount()} items</p>
              </div>
              <Button type="button" variant="ghost" size="icon" onClick={() => setShowCart(false)} className="text-white hover:bg-white/10">
                <X className="w-5 h-5" />
              </Button>
            </div>

            <div className="flex-1 overflow-y-auto p-6 space-y-2">
              {cart.length === 0 ? (
                <div className="text-center py-12">
                  <ShoppingCart className="w-16 h-16 mx-auto text-slate-300 mb-4" />
                  <p className="text-slate-500 mb-2">Your cart is empty</p>
                  <p className="text-sm text-slate-400 mb-4">Start shopping to add items</p>
                  <Button 
                    type="button"
                    className="bg-gradient-to-r from-amber-600 to-amber-700 hover:from-amber-700 hover:to-amber-800"
                    onClick={() => {
                      navigate("/store");
                      setShowCart(false);
                      setViewMode("home");
                    }}
                  >
                    Continue Shopping
                  </Button>
                </div>
              ) : (
                <>
                  {/* Clear All Button */}
                  {cart.length > 0 && (
                    <div className="flex justify-between items-center mb-2 animate-fade-in">
                      <span className="text-sm text-slate-600">{cart.length} {cart.length === 1 ? 'item' : 'items'} in cart</span>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="text-red-600 hover:text-red-700 hover:bg-red-50 text-xs"
                        onClick={() => {
                          setCart([]);
                          toast.success("Cart cleared");
                        }}
                      >
                        <Trash2 className="w-3 h-3 mr-1" />
                        Clear All
                      </Button>
                    </div>
                  )}
                  {cart.map(item => (
                  <Card key={item.sku} className="group hover:shadow-md transition-all border border-slate-200">
                    <CardContent className="p-2.5">
                      <div className="flex gap-2.5">
                        <div className="w-16 h-16 rounded-lg overflow-hidden border border-slate-200 flex-shrink-0">
                          <img
                            src={item.image}
                            alt={item.sku}
                            className="w-full h-full object-cover"
                          />
                        </div>
                        <div className="flex-1 min-w-0">
                          <h3 className="font-semibold text-slate-900 line-clamp-1 text-sm mb-2">{item.sku}</h3>
                          <div className="text-sm font-semibold text-slate-900">
                            <span className="text-base">{formatPriceMMK(item.price).replace(' MMK', '')}</span>
                            <span className="text-xs ml-1">MMK</span>
                          </div>
                          <div className="flex items-center gap-1.5 mt-2">
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              className="h-6 w-6 p-0 rounded-full"
                              onClick={() => updateQuantity(item.sku, item.quantity - 1)}
                            >
                              <Minus className="w-2.5 h-2.5" />
                            </Button>
                            <span className="text-xs font-medium w-7 text-center">{item.quantity}</span>
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              className="h-6 w-6 p-0 rounded-full"
                              onClick={() => updateQuantity(item.sku, item.quantity + 1)}
                            >
                              <Plus className="w-2.5 h-2.5" />
                            </Button>
                            <Button
                              type="button"
                              size="sm"
                              variant="ghost"
                              className="ml-auto text-slate-500 hover:text-red-600 hover:bg-red-50 h-6 w-6 p-0"
                              onClick={() => removeFromCart(item.sku)}
                            >
                              <Trash2 className="w-3 h-3" />
                            </Button>
                          </div>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                  ))}
                </>
              )}
            </div>

            {cart.length > 0 && (
              <div className="border-t p-6 space-y-4 bg-slate-50">
                {/* Coupon Code Section */}
                <div className="space-y-2">
                  <label className="text-sm font-medium text-slate-700 flex items-center gap-2">
                    <Tag className="w-4 h-4" />
                    Have a coupon code?
                  </label>
                  
                  {!appliedCoupon ? (
                    <CouponInput
                      onApply={handleApplyCoupon}
                      loading={couponLoading}
                      error={couponError}
                      onErrorClear={() => setCouponError('')}
                      variant="cart"
                    />
                  ) : (
                    <div className="flex items-center justify-between bg-green-50 border border-green-200 rounded-lg p-3">
                      <div className="flex items-center gap-2">
                        <Tag className="w-4 h-4 text-green-600" />
                        <div>
                          <p className="text-sm font-semibold text-green-700">{appliedCoupon.code}</p>
                          <p className="text-xs text-green-600">
                            {appliedCoupon.discountType === 'percentage' 
                              ? `${appliedCoupon.discount}% off` 
                              : `$${appliedCoupon.discount} off`}
                          </p>
                        </div>
                      </div>
                      <Button
                        type="button"
                        onClick={handleRemoveCoupon}
                        variant="ghost"
                        size="sm"
                        className="text-red-600 hover:text-red-700 hover:bg-red-50 h-8 px-2"
                      >
                        <X className="w-4 h-4" />
                      </Button>
                    </div>
                  )}
                  
                  {couponError && (
                    <p className="text-xs text-red-600 mt-1">{couponError}</p>
                  )}
                </div>
                
                {/* Price Summary */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-slate-600">Subtotal ({getCartItemsCount()} items)</span>
                    <span className="font-medium">{formatPriceMMK(`$${getCartTotal().toFixed(2)}`)}</span>
                  </div>
                  
                  {appliedCoupon && (
                    <>
                      <div className="flex items-center justify-between text-sm text-green-600">
                        <span>Discount ({appliedCoupon.code})</span>
                        <span className="font-semibold">-{formatPriceMMK(`$${appliedCoupon.discountAmount.toFixed(2)}`)}</span>
                      </div>
                    </>
                  )}
                  
                  <Separator />
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-slate-900">Total</span>
                    <div className="text-right">
                      <p className="text-xl font-bold bg-gradient-to-r from-amber-700 to-amber-600 bg-clip-text text-transparent">
                        {formatPriceMMK(`$${(getCartTotal() - (appliedCoupon?.discountAmount || 0)).toFixed(2)}`)}
                      </p>
                    </div>
                  </div>
                </div>
                <Button type="button" className="w-full bg-[#1a1d29] hover:bg-slate-900 h-11 text-sm font-medium text-white" onClick={handleCheckout}>
                  Proceed to Checkout
                  <ArrowRight className="w-4 h-4 ml-2" />
                </Button>
                <Button type="button" className="w-full bg-[#1a1d29] hover:bg-slate-900 h-11 text-sm font-medium text-white" onClick={() => setShowCart(false)}>
                  Continue Shopping
                </Button>
              </div>
            )}
          </div>
        </div>
      </>
    )
  ), [showCart, cart, appliedCoupon, couponLoading, couponError, getCartItemsCount, getCartTotal, formatPriceMMK, updateQuantity, removeFromCart, handleApplyCoupon, handleRemoveCoupon, handleCheckout]);

  // Footer Component
  const Footer = () => (
    <footer className="bg-gradient-to-b from-slate-800 to-slate-900 text-white mt-8">
      {/* Main Footer Content */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-6 md:gap-6 mb-4 md:mb-6">
          {/* Brand Section */}
          <div className="lg:col-span-2 mb-4 md:mb-0">
            <div className="mb-3">
              <h3 className="text-2xl uppercase font-bold" style={{ fontFamily: 'Rubik, sans-serif', letterSpacing: '0.05em' }}>{siteSettings.storeName}</h3>
            </div>
            <p className="text-slate-300 text-sm mb-4 leading-relaxed max-w-sm">
              Myanmar's premier online marketplace for luxury and quality products. 
              Experience elegance in every purchase with our curated selection of premium goods.
            </p>
            <div className="space-y-2 mb-4">
              <div className="flex items-center gap-3 text-slate-300 text-sm">
                <div className="w-8 h-8 bg-slate-700/50 rounded-lg flex items-center justify-center">
                  <Truck className="w-4 h-4 text-amber-400" />
                </div>
                <span>Fast & Free Delivery</span>
              </div>
              <div className="flex items-center gap-3 text-slate-300 text-sm">
                <div className="w-8 h-8 bg-slate-700/50 rounded-lg flex items-center justify-center">
                  <Shield className="w-4 h-4 text-amber-400" />
                </div>
                <span>Secure Payment Protection</span>
              </div>
              <div className="flex items-center gap-3 text-slate-300 text-sm">
                <div className="w-8 h-8 bg-slate-700/50 rounded-lg flex items-center justify-center">
                  <RefreshCw className="w-4 h-4 text-amber-400" />
                </div>
                <span>Easy Returns & Exchanges</span>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <button className="w-10 h-10 bg-slate-700 hover:bg-amber-600 rounded-lg flex items-center justify-center transition-all duration-300 hover:scale-110">
                <Facebook className="w-5 h-5" />
              </button>
              <button className="w-10 h-10 bg-slate-700 hover:bg-amber-600 rounded-lg flex items-center justify-center transition-all duration-300 hover:scale-110">
                <Twitter className="w-5 h-5" />
              </button>
              <button className="w-10 h-10 bg-slate-700 hover:bg-amber-600 rounded-lg flex items-center justify-center transition-all duration-300 hover:scale-110">
                <Instagram className="w-5 h-5" />
              </button>
              <button className="w-10 h-10 bg-slate-700 hover:bg-amber-600 rounded-lg flex items-center justify-center transition-all duration-300 hover:scale-110">
                <Mail className="w-5 h-5" />
              </button>
            </div>
          </div>

          {/* Shop Categories */}
          <div className="mb-4 md:mb-0">
            <h4 className="font-semibold mb-3 text-white text-base">Shop</h4>
            <ul className="space-y-2 text-sm">
              {allCategories.slice(0, 5).map(category => (
                <li key={category.id}>
                  <button 
                    onClick={() => {
                      navigate("/store");
                      setSelectedCategory(category.name);
                      setViewMode("all-products");
                      window.scrollTo(0, 0);
                    }}
                    className="text-slate-300 hover:text-amber-400 transition-colors flex items-center gap-2"
                  >
                    <ChevronRight className="w-3 h-3" />
                    {category.name}
                  </button>
                </li>
              ))}
              <li>
                <button 
                  onClick={() => {
                    navigate("/store");
                    setSelectedCategory("all");
                    setViewMode("all-products");
                    window.scrollTo(0, 0);
                  }}
                  className="text-amber-400 hover:text-amber-300 transition-colors flex items-center gap-2 font-medium"
                >
                  <ChevronRight className="w-3 h-3" />
                  Categories
                </button>
              </li>
            </ul>
          </div>

          {/* Customer Service */}
          <div className="mb-4 md:mb-0">
            <h4 className="font-semibold mb-3 text-white text-base">Customer Service</h4>
            <ul className="space-y-2 text-sm text-slate-300">
              <li 
                onClick={() => {
                  if (!user) {
                    // Open auth modal to log in
                    toast.error("Please log in to chat with our support team");
                    setShowAuthModal(true);
                    setAuthMode('login');
                  } else {
                    // Trigger floating chat to open
                    const chatButton = document.querySelector('[aria-label="Open chat"]') as HTMLButtonElement;
                    if (chatButton) {
                      chatButton.click();
                    } else {
                      // Fallback if chat button not found (edge case during page load)
                      toast.info("Chat is loading, please try again in a moment");
                    }
                  }
                }}
                className="hover:text-amber-400 cursor-pointer transition-all hover:translate-x-1 duration-200 flex items-center gap-2"
              >
                <ChevronRight className="w-3 h-3" />
                Help Center
              </li>
              <li 
                onClick={() => {
                  if (!user) {
                    // Open auth modal to log in
                    toast.error("Please log in to view your order history");
                    setShowAuthModal(true);
                    setAuthMode('login');
                  } else {
                    setViewMode("order-history");
                    window.scrollTo(0, 0);
                  }
                }}
                className="hover:text-amber-400 cursor-pointer transition-all hover:translate-x-1 duration-200 flex items-center gap-2"
              >
                <ChevronRight className="w-3 h-3" />
                Track Your Order
              </li>
              <li 
                onClick={() => {
                  if (!user) {
                    // Open auth modal to log in
                    toast.error("Please log in to view shipping & delivery information");
                    setShowAuthModal(true);
                    setAuthMode('login');
                  } else {
                    setViewMode("order-history");
                    window.scrollTo(0, 0);
                  }
                }}
                className="hover:text-amber-400 cursor-pointer transition-all hover:translate-x-1 duration-200 flex items-center gap-2"
              >
                <ChevronRight className="w-3 h-3" />
                Shipping & Delivery
              </li>
              <li className="hover:text-amber-400 cursor-pointer transition-all hover:translate-x-1 duration-200 flex items-center gap-2">
                <ChevronRight className="w-3 h-3" />
                Returns & Refunds
              </li>
              <li className="hover:text-amber-400 cursor-pointer transition-all hover:translate-x-1 duration-200 flex items-center gap-2">
                <ChevronRight className="w-3 h-3" />
                Payment Methods
              </li>
              <li 
                onClick={() => {
                  if (!user) {
                    // Open auth modal to log in
                    toast.error("Please log in to chat with our support team");
                    setShowAuthModal(true);
                    setAuthMode('login');
                  } else {
                    // Trigger floating chat to open
                    const chatButton = document.querySelector('[aria-label="Open chat"]') as HTMLButtonElement;
                    if (chatButton) {
                      chatButton.click();
                    } else {
                      // Fallback if chat button not found (edge case during page load)
                      toast.info("Chat is loading, please try again in a moment");
                    }
                  }
                }}
                className="hover:text-amber-400 cursor-pointer transition-all hover:translate-x-1 duration-200 flex items-center gap-2"
              >
                <ChevronRight className="w-3 h-3" />
                FAQs
              </li>
            </ul>
          </div>

          {/* Contact & Company */}
          <div className="mb-4 md:mb-0">
            <h4 className="font-semibold mb-3 text-white text-base">Get in Touch</h4>
            <ul className="space-y-2 text-sm text-slate-300 mb-4">
              <li className="flex items-start gap-3 hover:text-amber-400 transition-colors">
                <MapPin className="w-4 h-4 mt-0.5 flex-shrink-0 text-amber-400" />
                <span className="leading-relaxed">{siteSettings.storeAddress}</span>
              </li>
              <li className="flex items-center gap-3 hover:text-amber-400 transition-colors cursor-pointer">
                <Mail className="w-4 h-4 flex-shrink-0 text-amber-400" />
                <a href={`mailto:${siteSettings.storeEmail}`} className="hover:underline">
                  {siteSettings.storeEmail}
                </a>
              </li>
              <li className="flex items-center gap-3 hover:text-amber-400 transition-colors cursor-pointer">
                <Phone className="w-4 h-4 flex-shrink-0 text-amber-400" />
                <a href={`tel:${siteSettings.storePhone}`} className="hover:underline">
                  {siteSettings.storePhone}
                </a>
              </li>
            </ul>
            
            <div className="pt-4 border-t border-slate-700">
              <h5 className="font-medium mb-2 text-white text-sm">Company</h5>
              <ul className="space-y-2 text-sm text-slate-300">
                <li 
                  onClick={() => {
                    navigate("/");
                    window.scrollTo(0, 0);
                  }}
                  className="hover:text-amber-400 cursor-pointer transition-colors flex items-center gap-2"
                >
                  <ChevronRight className="w-3 h-3" />
                  About Us
                </li>
                <li 
                  onClick={() => {
                    navigate("/");
                    window.scrollTo(0, 0);
                  }}
                  className="hover:text-amber-400 cursor-pointer transition-colors flex items-center gap-2"
                >
                  <ChevronRight className="w-3 h-3" />
                  Careers
                </li>
                <li>
                  <button 
                    onClick={() => {
                      navigate("/vendor/application");
                      window.scrollTo(0, 0);
                    }}
                    className="hover:text-amber-400 transition-colors flex items-center gap-2"
                  >
                    <ChevronRight className="w-3 h-3" />
                    Become a Vendor
                  </button>
                </li>
              </ul>
            </div>
          </div>
        </div>

        {/* Newsletter Section */}
        <div className="bg-gradient-to-r from-slate-700/50 to-slate-800/50 rounded-2xl p-4 sm:p-6 mb-4 sm:mb-6 border border-slate-700">
          <div className="flex flex-col md:flex-row items-center justify-between gap-6">
            <div className="text-center md:text-left">
              <h4 className="font-semibold text-white text-base mb-2 flex items-center justify-center md:justify-start gap-2">
                <Bell className="w-5 h-5 text-amber-400" />
                Subscribe to our Newsletter
              </h4>
              <p className="text-slate-300 text-sm">Get the latest updates on new products and exclusive offers!</p>
            </div>
            <div className="flex gap-2 w-full md:w-auto">
              <Input 
                placeholder="Enter your email" 
                className="bg-slate-800 border-slate-600 text-white placeholder:text-slate-400 flex-1 md:min-w-[280px]"
              />
              <Button className="bg-gradient-to-r from-amber-600 to-amber-700 hover:from-amber-700 hover:to-amber-800 px-4 md:px-6 whitespace-nowrap">
                Subscribe
              </Button>
            </div>
          </div>
        </div>

        <Separator className="bg-slate-700 mb-4 sm:mb-6" />
        
        {/* Bottom Bar */}
        <div className="flex flex-col md:flex-row items-center justify-between gap-3 md:gap-4 text-sm text-slate-400">
          <p className="flex items-center gap-2">
            �� 2026 {siteSettings.storeName}. All rights reserved. Created by Aung Sone - Software Architect
          </p>
          <div className="flex items-center gap-6 flex-wrap justify-center">
            <button className="hover:text-amber-400 transition-colors">Privacy Policy</button>
            <span className="text-slate-600">•</span>
            <button className="hover:text-amber-400 transition-colors">Terms of Service</button>
            <span className="text-slate-600">•</span>
            <button className="hover:text-amber-400 transition-colors">Cookie Policy</button>
            <span className="text-slate-600">•</span>
            <button className="hover:text-amber-400 transition-colors">Sitemap</button>
          </div>
        </div>
      </div>
    </footer>
  );

  // View Profile Page
  if (viewMode === "view-profile") {
    return (
      <div className="min-h-screen bg-slate-50">
        <Header />
        {CartSidebar}
        
        {/* Main content with smooth fade-in animation - header stays stable */}
        <ContentAnimationWrapper contentKey="view-profile">
        <div className="max-w-4xl mx-auto px-4 py-8">
          {/* Back Button */}
          <Button 
            variant="ghost" 
            onClick={() => {
              navigate("/store");
              setViewMode("home");
            }}
            className="mb-6 hover:bg-slate-100"
          >
            <ChevronLeft className="w-4 h-4 mr-2" />
            Back to Home
          </Button>

          {/* Profile Header */}
          <Card className="mb-6">
            <CardContent className="pt-6">
              <div className="flex flex-col md:flex-row items-center md:items-start gap-6">
                {userProfileImageUrl && !profileImageLoadFailed ? (
                  <img 
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
                <div className="flex-1 text-center md:text-left">
                  <h1 className="text-base sm:text-lg font-bold text-slate-900 mb-2">
                    {user?.name || "Guest User"}
                  </h1>
                  <p className="text-slate-600 mb-4">{user?.email || "No email provided"}</p>
                  <Button 
                    onClick={() => setViewMode("edit-profile")}
                    className="bg-amber-600 hover:bg-amber-700"
                  >
                    <Settings className="w-4 h-4 mr-2" />
                    Edit Profile
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Profile Information */}
          <div className="grid md:grid-cols-2 gap-6">
            <Card>
              <CardHeader>
                <CardTitle className="text-sm sm:text-base">Personal Information</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <Label className="text-sm text-slate-600">Full Name</Label>
                  <p className="font-medium text-slate-900">{user?.name || "Not provided"}</p>
                </div>
                <div>
                  <Label className="text-sm text-slate-600">Email Address</Label>
                  <p className="font-medium text-slate-900">{user?.email || "Not provided"}</p>
                </div>
                <div>
                  <Label className="text-sm text-slate-600">Phone Number</Label>
                  <p className="font-medium text-slate-900">{user?.phone || "+95 9 XXX XXX XXX"}</p>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-sm sm:text-base">Account Statistics</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center justify-between p-3 bg-amber-50 rounded-lg">
                  <div className="flex items-center gap-3">
                    <Package className="w-5 h-5 text-amber-600" />
                    <span className="text-sm font-medium text-slate-700">Total Orders</span>
                  </div>
                  {loadingStats ? (
                    <div className="w-6 h-6 border-2 border-amber-600 border-t-transparent rounded-full animate-spin"></div>
                  ) : (
                    <span className="text-lg font-bold text-amber-700">{orderCount}</span>
                  )}
                </div>
                <div className="flex items-center justify-between p-3 bg-blue-50 rounded-lg">
                  <div className="flex items-center gap-3">
                    <Heart className="w-5 h-5 text-blue-600" />
                    <span className="text-sm font-medium text-slate-700">Wishlist Items</span>
                  </div>
                  <span className="text-lg font-bold text-blue-700">{wishlist.length}</span>
                </div>
                <div className="flex items-center justify-between p-3 bg-emerald-50 rounded-lg">
                  <div className="flex items-center gap-3">
                    <ShoppingBag className="w-5 h-5 text-emerald-600" />
                    <span className="text-sm font-medium text-slate-700">Cart Items</span>
                  </div>
                  <span className="text-lg font-bold text-emerald-700">{cart.length}</span>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Quick Actions */}
          <Card className="mt-6">
            <CardHeader>
              <CardTitle className="text-lg">Quick Actions</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <Button 
                  variant="outline" 
                  className="justify-start"
                  onClick={() => setViewMode("order-history")}
                >
                  <Package className="w-4 h-4 mr-2" />
                  View Orders
                </Button>
                <Button 
                  variant="outline" 
                  className="justify-start"
                  onClick={() => setViewMode("saved-products")}
                >
                  <Heart className="w-4 h-4 mr-2" />
                  My Wishlist
                </Button>
                <Button 
                  variant="outline" 
                  className="justify-start"
                  onClick={() => setViewMode("shipping-addresses")}
                >
                  <MapPin className="w-4 h-4 mr-2" />
                  Addresses
                </Button>
                <Button 
                  variant="outline" 
                  className="justify-start"
                  onClick={() => setViewMode("security-settings")}
                >
                  <Shield className="w-4 h-4 mr-2" />
                  Security
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
        </ContentAnimationWrapper>
      </div>
    );
  }

  // Edit Profile Page
  if (viewMode === "edit-profile") {
    return (
      <div className="min-h-screen bg-slate-50">
        <Header />
        {CartSidebar}
        
        {/* Main content with smooth fade-in animation - header stays stable */}
        <ContentAnimationWrapper contentKey="edit-profile">
        <div className="max-w-2xl mx-auto px-4 py-8">
          {/* Back Button */}
          <Button 
            variant="ghost" 
            onClick={() => setViewMode("view-profile")}
            className="mb-6 hover:bg-slate-100"
          >
            <ChevronLeft className="w-4 h-4 mr-2" />
            Back to Profile
          </Button>

          <Card>
            <CardHeader>
              <CardTitle className="text-base sm:text-lg">Edit Profile</CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Profile Picture */}
              <div className="flex items-center gap-6">
                {profileForm.profileImage ? (
                  <img 
                    src={profileForm.profileImage} 
                    alt="Profile preview" 
                    className="w-[100px] h-[100px] rounded-lg object-cover flex-shrink-0"
                  />
                ) : userProfileImageUrl && !profileImageLoadFailed ? (
                  <img 
                    src={userProfileImageUrl} 
                    alt={user.name || "Profile"} 
                    className="w-[100px] h-[100px] rounded-lg object-cover flex-shrink-0"
                    onError={() => setProfileImageLoadFailed(true)}
                  />
                ) : (
                  <div className="w-[100px] h-[100px] rounded-lg bg-gradient-to-br from-amber-500 to-orange-600 flex items-center justify-center flex-shrink-0">
                    <UserCircle className="w-14 h-14 text-white" />
                  </div>
                )}
                <div className="flex-1">
                  <p className="text-sm font-medium text-slate-900 mb-1">Profile Picture</p>
                  <p className="text-xs text-slate-500 mb-2">Upload a photo (JPG/PNG/WEBP, auto-compressed)</p>
                  <div className="flex gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        const input = document.createElement('input');
                        input.type = 'file';
                        input.accept = 'image/jpeg,image/png,image/webp,image/jpg,image/gif';
                        input.onchange = async (e: any) => {
                          const file = e.target?.files?.[0];
                          if (!file) return;

                          // Show compression progress
                          toast.loading("Compressing image...", { id: "compress" });

                          try {
                            // Function to compress image to under 400KB (to fit within 512KB storage limit)
                            const compressImage = (file: File, maxSizeKB: number = 400): Promise<string> => {
                              return new Promise((resolve, reject) => {
                                const reader = new FileReader();
                                reader.onload = (event) => {
                                  const img = new Image();
                                  img.onload = () => {
                                    const canvas = document.createElement('canvas');
                                    const ctx = canvas.getContext('2d');
                                    if (!ctx) {
                                      reject(new Error('Canvas not supported'));
                                      return;
                                    }

                                    // Start with original dimensions
                                    let width = img.width;
                                    let height = img.height;

                                    // If image is very large, scale it down first
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

                                    // Compress with decreasing quality until under maxSizeKB
                                    let quality = 0.9;
                                    let dataUrl = '';
                                    let iterations = 0;
                                    const maxIterations = 10;

                                    const compress = () => {
                                      dataUrl = canvas.toDataURL('image/jpeg', quality);
                                      const sizeKB = Math.round((dataUrl.length * 3) / 4 / 1024);
                                      
                                      console.log(`🖼️ Compression attempt ${iterations + 1}: ${sizeKB}KB at quality ${quality.toFixed(2)}`);

                                      if (sizeKB > maxSizeKB && quality > 0.1 && iterations < maxIterations) {
                                        quality -= 0.1;
                                        iterations++;
                                        compress();
                                      } else {
                                        const finalSizeKB = Math.round((dataUrl.length * 3) / 4 / 1024);
                                        console.log(`✅ Final compressed size: ${finalSizeKB}KB`);
                                        resolve(dataUrl);
                                      }
                                    };

                                    compress();
                                  };
                                  img.onerror = () => reject(new Error('Failed to load image'));
                                  img.src = event.target?.result as string;
                                };
                                reader.onerror = () => reject(new Error('Failed to read file'));
                                reader.readAsDataURL(file);
                              });
                            };

                            // Compress the image to 400KB (ensures it fits in 512KB storage bucket)
                            const compressedDataUrl = await compressImage(file, 400);
                            setProfileForm({ ...profileForm, profileImage: compressedDataUrl });
                            
                            // Dismiss loading toast silently
                            toast.dismiss("compress");
                          } catch (error) {
                            console.error("Image compression error:", error);
                            toast.error("Failed to process image. Please try another file.", { id: "compress" });
                          }
                        };
                        input.click();
                      }}
                      className="bg-amber-50 border-amber-200 text-amber-700 hover:bg-amber-100"
                    >
                      Upload Photo
                    </Button>
                    {(profileForm.profileImage || userProfileImageUrl) && (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => setProfileForm({ ...profileForm, profileImage: null })}
                      >
                        Remove
                      </Button>
                    )}
                  </div>
                </div>
              </div>

              <Separator />

              {/* Name */}
              <div className="space-y-2">
                <Label htmlFor="name">Full Name</Label>
                <Input
                  id="name"
                  value={profileForm.name}
                  onChange={(e) => setProfileForm({ ...profileForm, name: e.target.value })}
                  placeholder="Enter your full name"
                />
              </div>

              {/* Email */}
              <div className="space-y-2">
                <Label htmlFor="email">Email Address</Label>
                <Input
                  id="email"
                  type="email"
                  value={profileForm.email}
                  onChange={(e) => setProfileForm({ ...profileForm, email: e.target.value })}
                  placeholder="your.email@example.com"
                />
              </div>

              {/* Phone */}
              <div className="space-y-2">
                <Label htmlFor="phone">Phone Number</Label>
                <Input
                  id="phone"
                  value={profileForm.phone}
                  onChange={(e) => setProfileForm({ ...profileForm, phone: e.target.value })}
                  placeholder="+95 9 XXX XXX XXX"
                />
                <p className="text-xs text-slate-500">Myanmar phone format</p>
              </div>

              {/* Action Buttons */}
              <div className="flex gap-3 pt-4">
                <Button 
                  onClick={handleSaveProfile}
                  disabled={saving}
                  className="flex-1 bg-amber-600 hover:bg-amber-700"
                >
                  <Check className="w-4 h-4 mr-2" />
                  {saving ? "Saving..." : "Save Changes"}
                </Button>
                <Button 
                  variant="outline"
                  onClick={() => setViewMode("view-profile")}
                  disabled={saving}
                  className="flex-1"
                >
                  Cancel
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
        </ContentAnimationWrapper>
      </div>
    );
  }

  // Order History Page
  if (viewMode === "order-history") {
    return (
      <div className="min-h-screen bg-slate-50">
        <Header />
        {CartSidebar}
        
        {/* Main content with smooth fade-in animation - header stays stable */}
        <ContentAnimationWrapper contentKey="order-history">
        <div className="max-w-6xl mx-auto px-4 py-8">
          {/* Back Button */}
          <Button 
            variant="ghost" 
            onClick={() => setViewMode("view-profile")}
            className="mb-6 hover:bg-slate-100"
          >
            <ChevronLeft className="w-4 h-4 mr-2" />
            Back to Profile
          </Button>

          <div className="mb-8">
            <h1 className="text-xl sm:text-2xl font-bold text-slate-900 mb-2">Order History</h1>
            <p className="text-slate-600 text-sm">View and track all your orders</p>
          </div>

          {/* Loading State */}
          {ordersLoading && (
            <Card>
              <CardContent className="py-16 text-center">
                <div className="animate-spin w-12 h-12 border-4 border-amber-600 border-t-transparent rounded-full mx-auto mb-4"></div>
                <p className="text-slate-600">Loading your orders...</p>
              </CardContent>
            </Card>
          )}

          {/* Error State */}
          {!ordersLoading && ordersError && (
            <Card>
              <CardContent className="py-16 text-center">
                <Package className="w-16 h-16 text-slate-300 mx-auto mb-4" />
                <h3 className="text-lg font-semibold text-slate-900 mb-2">Error Loading Orders</h3>
                <p className="text-slate-600 mb-6">{ordersError}</p>
                <Button 
                  onClick={() => window.location.reload()}
                  className="bg-amber-600 hover:bg-amber-700"
                >
                  Retry
                </Button>
              </CardContent>
            </Card>
          )}

          {/* Empty State */}
          {!ordersLoading && !ordersError && userOrders.length === 0 && (
            <Card>
              <CardContent className="py-16 text-center">
                <Package className="w-16 h-16 text-slate-300 mx-auto mb-4" />
                <h3 className="text-lg font-semibold text-slate-900 mb-2">No Orders Yet</h3>
                <p className="text-slate-600 mb-2">You haven&apos;t placed any orders for this account yet.</p>
                {resolveOrderApiUserId(user) && (
                  <p className="text-xs text-slate-500 mb-6 max-w-md mx-auto leading-relaxed">
                    Loading orders for{" "}
                    <span className="font-medium text-slate-700">{user?.email || "your session"}</span>
                    . If you see orders on the live site but not here, you&apos;re usually signed in as a{" "}
                    <span className="font-medium">different user</span> on localhost — log out and sign in with the same email as production, or compare{" "}
                    <span className="font-mono text-[11px]">migoo-user</span> in DevTools → Application → Local Storage.
                  </p>
                )}
                <Button 
                  onClick={() => {
                    navigate("/products");
                    setViewMode("all-products");
                  }}
                  className="bg-amber-600 hover:bg-amber-700"
                >
                  Start Shopping
                </Button>
              </CardContent>
            </Card>
          )}

          {/* Orders List */}
          {!ordersLoading && !ordersError && userOrders.length > 0 && (
            <div className="space-y-4">
              {userOrders.map((order) => {
                const getStatusColor = (status: string) => {
                  switch (status?.toLowerCase()) {
                    case 'delivered': return 'bg-emerald-600';
                    case 'processing': return 'bg-blue-600';
                    case 'shipped': return 'bg-amber-600';
                    case 'ready-to-ship': return 'bg-blue-600';
                    case 'cancelled': return 'bg-red-600';
                    default: return 'bg-slate-600';
                  }
                };

                const getStatusLabel = (status: string) => {
                  if (status?.toLowerCase() === 'ready-to-ship') {
                    return 'Shipping';
                  }
                  return status || 'Pending';
                };

                return (
                  <Card key={order.id} className="hover:shadow-md transition-shadow">
                    <CardContent className="p-4 sm:p-6">
                      {/* Mobile-First Vertical Layout */}
                      <div className="flex flex-col gap-4">
                        {/* Header: Order Number + Status Badge */}
                        <div className="flex items-start justify-between gap-3">
                          <h3 className="text-base sm:text-lg font-bold text-slate-900 break-all">
                            {order.orderNumber}
                          </h3>
                          <Badge 
                            variant="default"
                            className={`${getStatusColor(order.status)} shrink-0 text-xs`}
                          >
                            {getStatusLabel(order.status)}
                          </Badge>
                        </div>
                        
                        {/* Order Meta Info: Date + Item Count */}
                        <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4 text-sm text-slate-600">
                          <div className="flex items-center gap-1.5">
                            <Clock className="w-4 h-4 shrink-0" />
                            <span>{new Date(order.createdAt || order.date).toLocaleDateString('en-GB')}</span>
                          </div>
                          <div className="flex items-center gap-1.5">
                            <Package className="w-4 h-4 shrink-0" />
                            <span>{order.items?.length || 0} {order.items?.length === 1 ? 'item' : 'items'}</span>
                          </div>
                        </div>
                        
                        {/* Total Amount - Full Width on Mobile */}
                        <div className="pt-3 border-t border-slate-100">
                          <div className="flex items-center justify-between">
                            <span className="text-sm text-slate-600">Total Amount</span>
                            <span className="text-lg sm:text-xl font-bold text-black">
                              {Math.round(order.total || 0)} MMK
                            </span>
                          </div>
                        </div>
                        
                        {/* View Details Button - Full Width on Mobile */}
                        <Button 
                          variant="outline"
                          className="w-full sm:w-auto"
                          onClick={() => {
                            console.log('🔍 View Details clicked for order:', order.id);
                            console.log('📦 Order data:', order);
                            setSelectedOrder(order);
                            // Don't set viewMode here - let the URL handler do it
                            console.log('🧭 Navigating to:', `/profile/orders/${order.id}`);
                            navigate(`/profile/orders/${order.id}`);
                          }}
                        >
                          <Eye className="w-4 h-4 mr-2" />
                          View Details
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </div>
        </ContentAnimationWrapper>
      </div>
    );
  }

  // Shipping Addresses Page
  if (viewMode === "shipping-addresses") {
    return (
      <div className="min-h-screen bg-slate-50">
        <Header />
        {CartSidebar}
        
        {/* Main content with smooth fade-in animation - header stays stable */}
        <ContentAnimationWrapper contentKey="shipping-addresses">
        <div className="max-w-4xl mx-auto px-4 py-8">
          {/* Back Button */}
          <Button 
            variant="ghost" 
            onClick={() => setViewMode("view-profile")}
            className="mb-6 hover:bg-slate-100"
          >
            <ChevronLeft className="w-4 h-4 mr-2" />
            Back to Profile
          </Button>

          <div className="mb-8 flex items-center justify-between">
            <div>
              <h1 className="text-xl sm:text-2xl font-bold text-slate-900 mb-2">Shipping Addresses</h1>
              <p className="text-slate-600 text-sm">Manage your delivery addresses</p>
            </div>
            <Button 
              onClick={() => {
                setShowAddressForm(true);
                setEditingAddress(null);
                // Auto-fill from user profile for first address
                const isFirstAddress = shippingAddresses.length === 0;
                setAddressForm({
                  label: isFirstAddress ? 'Home' : '',
                  recipientName: isFirstAddress && user?.name ? user.name : '',
                  phone: isFirstAddress && user?.phone ? user.phone : '',
                  addressLine1: '',
                  addressLine2: '',
                  city: '',
                  state: '',
                  zipCode: '',
                  country: 'Myanmar',
                  isDefault: isFirstAddress // First address is default
                });
                // Scroll to form
                setTimeout(() => window.scrollTo({ top: 200, behavior: 'instant' }), 10);
              }}
              className="bg-amber-600 hover:bg-amber-700"
            >
              <Plus className="w-4 h-4 mr-2" />
              Add Address
            </Button>
          </div>

          {/* Address Form Modal */}
          {showAddressForm && (
            <Card className="mb-6 border-2 border-amber-500">
              <CardHeader>
                <CardTitle>{editingAddress ? 'Edit Address' : 'Add New Address'}</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid md:grid-cols-2 gap-4">
                  <div>
                    <Label>Address Label *</Label>
                    <Input 
                      placeholder="e.g., Home, Office, etc."
                      value={addressForm.label}
                      onChange={(e) => setAddressForm({...addressForm, label: e.target.value})}
                    />
                  </div>
                  <div>
                    <Label>Recipient Name *</Label>
                    <Input 
                      placeholder="Full name"
                      value={addressForm.recipientName}
                      onChange={(e) => setAddressForm({...addressForm, recipientName: e.target.value})}
                    />
                  </div>
                  <div>
                    <Label>Phone Number *</Label>
                    <Input 
                      placeholder="+95 9 XXX XXX XXX"
                      value={addressForm.phone}
                      onChange={(e) => setAddressForm({...addressForm, phone: e.target.value})}
                    />
                  </div>
                  <div>
                    <Label>City *</Label>
                    <Input 
                      placeholder="City"
                      value={addressForm.city}
                      onChange={(e) => setAddressForm({...addressForm, city: e.target.value})}
                    />
                  </div>
                  <div className="md:col-span-2">
                    <Label>Address Line 1 *</Label>
                    <Input 
                      placeholder="Street address, P.O. box"
                      value={addressForm.addressLine1}
                      onChange={(e) => setAddressForm({...addressForm, addressLine1: e.target.value})}
                    />
                  </div>
                  <div className="md:col-span-2">
                    <div className="flex items-baseline justify-between mb-1.5">
                      <Label>Address Line 2</Label>
                      <span className="text-xs text-slate-500">(optional)</span>
                    </div>
                    <Input 
                      placeholder="Apartment, suite, unit, building, floor, etc."
                      value={addressForm.addressLine2}
                      onChange={(e) => setAddressForm({...addressForm, addressLine2: e.target.value})}
                    />
                  </div>
                  <div>
                    <Label>State/Region</Label>
                    <Input 
                      placeholder="State or Region"
                      value={addressForm.state}
                      onChange={(e) => setAddressForm({...addressForm, state: e.target.value})}
                    />
                  </div>
                  <div>
                    <Label>Zip/Postal Code</Label>
                    <Input 
                      placeholder="Postal code"
                      value={addressForm.zipCode}
                      onChange={(e) => setAddressForm({...addressForm, zipCode: e.target.value})}
                    />
                  </div>
                  <div className="md:col-span-2">
                    <Label>Country *</Label>
                    <Input 
                      value={addressForm.country}
                      onChange={(e) => setAddressForm({...addressForm, country: e.target.value})}
                      disabled
                    />
                  </div>
                  <div className="md:col-span-2 flex items-center gap-2">
                    <Checkbox
                      id="isDefault"
                      checked={addressForm.isDefault}
                      onCheckedChange={(checked) => setAddressForm({...addressForm, isDefault: checked as boolean})}
                    />
                    <Label htmlFor="isDefault" className="cursor-pointer">Set as default address</Label>
                  </div>
                </div>
                <div className="flex gap-3 mt-6">
                  <Button 
                    onClick={async () => {
                      // Validate required fields
                      if (!addressForm.label || !addressForm.recipientName || !addressForm.phone || !addressForm.addressLine1 || !addressForm.city) {
                        toast.error('Please fill in all required fields');
                        return;
                      }
                      
                      const newAddress = {
                        id: editingAddress?.id || Date.now().toString(),
                        ...addressForm,
                        userId: user?.id
                      };
                      
                      // If this address is set as default, unmark all other addresses
                      let updatedAddresses = shippingAddresses;
                      if (newAddress.isDefault) {
                        updatedAddresses = shippingAddresses.map(addr => ({
                          ...addr,
                          isDefault: false
                        }));
                      }
                      
                      // Update local state
                      if (editingAddress) {
                        updatedAddresses = updatedAddresses.map(addr => 
                          addr.id === editingAddress.id ? newAddress : addr
                        );
                        setShippingAddresses(updatedAddresses);
                        toast.success('Address updated successfully!');
                      } else {
                        updatedAddresses = [...updatedAddresses, newAddress];
                        setShippingAddresses(updatedAddresses);
                        toast.success('Address added successfully!');
                      }
                      
                      // 🚀 SYNC TO LOCALSTORAGE IMMEDIATELY (FOR PERSISTENCE ON REFRESH)
                      if (user?.id) {
                        localStorage.setItem(`migoo-shipping-addresses-${user.id}`, JSON.stringify(updatedAddresses));
                        console.log('⚡ Addresses synced to localStorage');
                      }
                      
                      // ��� SAVE TO BACKEND if user is logged in
                      if (user?.id) {
                        try {
                          // 🔥 OPTIMIZED: Use user.id directly in the backend route
                          // The backend handles the userId lookup for us!
                          await fetch(
                            `https://${projectId}.supabase.co/functions/v1/make-server-16010b6f/customers/${user.id}/addresses`,
                            {
                              method: 'POST',
                              headers: {
                                'Content-Type': 'application/json',
                                Authorization: `Bearer ${publicAnonKey}`,
                              },
                              body: JSON.stringify({ addresses: updatedAddresses }),
                            }
                          );
                          console.log('✅ Addresses saved to backend');
                        } catch (error) {
                          console.error('Failed to save addresses to backend:', error);
                        }
                      }
                      
                      setShowAddressForm(false);
                      setEditingAddress(null);
                    }}
                    className="flex-1 bg-amber-600 hover:bg-amber-700"
                  >
                    <Check className="w-4 h-4 mr-2" />
                    {editingAddress ? 'Update Address' : 'Save Address'}
                  </Button>
                  <Button 
                    variant="outline"
                    onClick={() => {
                      setShowAddressForm(false);
                      setEditingAddress(null);
                    }}
                    className="flex-1"
                  >
                    Cancel
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Addresses List */}
          {shippingAddresses.length === 0 && !showAddressForm ? (
            <Card>
              <CardContent className="py-16 text-center">
                <MapPin className="w-16 h-16 text-slate-300 mx-auto mb-4" />
                <h3 className="text-lg font-semibold text-slate-900 mb-2">No Addresses Yet</h3>
                <p className="text-slate-600 mb-6">Add a shipping address to make checkout faster</p>
                <Button 
                  onClick={() => {
                    setShowAddressForm(true);
                    setEditingAddress(null);
                    // Auto-fill from user profile for first address
                    setAddressForm({
                      label: 'Home',
                      recipientName: user?.name || '',
                      phone: user?.phone || '',
                      addressLine1: '',
                      addressLine2: '',
                      city: '',
                      state: '',
                      zipCode: '',
                      country: 'Myanmar',
                      isDefault: true // First address is default
                    });
                  }}
                  className="bg-amber-600 hover:bg-amber-700"
                >
                  <Plus className="w-4 h-4 mr-2" />
                  Add Your First Address
                </Button>
              </CardContent>
            </Card>
          ) : (
            <div className="grid md:grid-cols-2 gap-4">
              {shippingAddresses.map((address) => (
                <Card key={address.id} className={address.isDefault ? 'border-2 border-amber-500' : ''}>
                  <CardContent className="pt-6">
                    <div className="flex items-start justify-between mb-4">
                      <div>
                        <h3 className="font-bold text-slate-900 mb-1 flex items-center gap-2">
                          {address.label}
                          {address.isDefault && (
                            <Badge className="bg-amber-600 hover:bg-amber-600 text-xs">Default</Badge>
                          )}
                        </h3>
                        <p className="text-sm font-medium text-slate-700">{address.recipientName}</p>
                      </div>
                    </div>
                    <div className="space-y-2 text-sm text-slate-600 mb-4">
                      <div className="flex items-start gap-2">
                        <MapPin className="w-4 h-4 mt-0.5 flex-shrink-0 text-amber-600" />
                        <div>
                          <p>{address.addressLine1}</p>
                          {address.addressLine2 && <p>{address.addressLine2}</p>}
                          <p>{address.city}{address.state && `, ${address.state}`}</p>
                          <p>{address.zipCode && `${address.zipCode}, `}{address.country}</p>
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
                          setAddressForm(address);
                          setShowAddressForm(true);
                          // Scroll to form
                          setTimeout(() => window.scrollTo({ top: 200, behavior: 'instant' }), 10);
                        }}
                      >
                        <Settings className="w-4 h-4 mr-2" />
                        Edit
                      </Button>
                      <Button 
                        variant="outline"
                        size="sm"
                        className="flex-1 text-red-600 hover:text-red-700 hover:bg-red-50"
                        onClick={async () => {
                          if (confirm('Are you sure you want to delete this address?')) {
                            const updatedAddresses = shippingAddresses.filter(addr => addr.id !== address.id);
                            setShippingAddresses(updatedAddresses);
                            toast.success('Address deleted successfully!');
                            
                            // 🚀 SYNC TO LOCALSTORAGE IMMEDIATELY (FOR PERSISTENCE ON REFRESH)
                            if (user?.id) {
                              localStorage.setItem(`migoo-shipping-addresses-${user.id}`, JSON.stringify(updatedAddresses));
                              console.log('⚡ Addresses synced to localStorage');
                            }
                            
                            // 🔥 SAVE TO BACKEND if user is logged in
                            if (user?.id) {
                              try {
                                // 🔥 OPTIMIZED: Use user.id directly in the backend route
                                // The backend handles the userId lookup for us!
                                await fetch(
                                  `https://${projectId}.supabase.co/functions/v1/make-server-16010b6f/customers/${user.id}/addresses`,
                                  {
                                    method: 'POST',
                                    headers: {
                                      'Content-Type': 'application/json',
                                      Authorization: `Bearer ${publicAnonKey}`,
                                    },
                                    body: JSON.stringify({ addresses: updatedAddresses }),
                                  }
                                );
                                console.log('✅ Address deletion saved to backend');
                              } catch (error) {
                                console.error('Failed to save address deletion to backend:', error);
                              }
                            }
                          }
                        }}
                      >
                        <Trash2 className="w-4 h-4 mr-2" />
                        Delete
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>
        </ContentAnimationWrapper>
      </div>
    );
  }

  // Security Settings Page
  if (viewMode === "security-settings") {
    return (
      <div className="min-h-screen bg-slate-50">
        <Header />
        {CartSidebar}
        
        {/* Main content with smooth fade-in animation - header stays stable */}
        <ContentAnimationWrapper contentKey="security-settings">
        <div className="max-w-2xl mx-auto px-4 py-8">
          {/* Back Button */}
          <Button 
            variant="ghost" 
            onClick={() => setViewMode("view-profile")}
            className="mb-6 hover:bg-slate-100"
          >
            <ChevronLeft className="w-4 h-4 mr-2" />
            Back to Profile
          </Button>

          <div className="mb-8">
            <h1 className="text-xl sm:text-2xl font-bold text-slate-900 mb-2">Security Settings</h1>
            <p className="text-slate-600 text-sm">Manage your account security and password</p>
          </div>

          {/* Change Password Section */}
          <Card className="mb-6">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Shield className="w-5 h-5 text-amber-600" />
                Change Password
              </CardTitle>
            </CardHeader>
            <CardContent>
              <form onSubmit={async (e) => {
                e.preventDefault();
                
                // Validate form
                if (!securityForm.currentPassword || !securityForm.newPassword || !securityForm.confirmPassword) {
                  toast.error('Please fill in all fields');
                  return;
                }
                
                if (securityForm.newPassword !== securityForm.confirmPassword) {
                  toast.error('New passwords do not match');
                  return;
                }
                
                if (securityForm.newPassword.length < 6) {
                  toast.error('Password must be at least 6 characters long');
                  return;
                }
                
                setSavingSecurity(true);
                try {
                  if (!user?.email) {
                    toast.error('User email not found. Please log in again.');
                    setSavingSecurity(false);
                    return;
                  }
                  
                  console.log('🔐 [NEW CODE v2] Changing password via backend API for:', user.email);
                  
                  const response = await authApi.changePassword(
                    user.email,
                    securityForm.currentPassword,
                    securityForm.newPassword
                  );
                  
                  console.log('🔐 [NEW CODE v2] Backend response:', response);
                  
                  if (!response.success) {
                    console.error('❌ [NEW CODE v2] Password change failed:', response.error);
                    toast.error(response.error || 'Failed to change password');
                    return;
                  }
                  
                  console.log('✅ [NEW CODE v2] Password changed successfully');
                  toast.success('Password changed successfully! Please use your new password next time you log in.');
                  setSecurityForm({
                    currentPassword: '',
                    newPassword: '',
                    confirmPassword: ''
                  });
                  setShowPasswords({
                    current: false,
                    new: false,
                    confirm: false
                  });
                } catch (error: any) {
                  console.error('❌ Password change error:', error);
                  toast.error(error.message || 'Failed to change password. Please try again.');
                } finally {
                  setSavingSecurity(false);
                }
              }} className="space-y-4">
                <div>
                  <Label>Current Password *</Label>
                  <div className="relative">
                    <Input 
                      type={showPasswords.current ? "text" : "password"}
                      placeholder="Enter current password"
                      value={securityForm.currentPassword}
                      onChange={(e) => setSecurityForm({...securityForm, currentPassword: e.target.value})}
                      required
                      className="pr-10"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPasswords({...showPasswords, current: !showPasswords.current})}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition-colors"
                    >
                      {showPasswords.current ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>
                <div>
                  <Label>New Password *</Label>
                  <div className="relative">
                    <Input 
                      type={showPasswords.new ? "text" : "password"}
                      placeholder="Enter new password (min. 6 characters)"
                      value={securityForm.newPassword}
                      onChange={(e) => setSecurityForm({...securityForm, newPassword: e.target.value})}
                      required
                      className="pr-10"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPasswords({...showPasswords, new: !showPasswords.new})}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition-colors"
                    >
                      {showPasswords.new ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>
                <div>
                  <Label>Confirm New Password *</Label>
                  <div className="relative">
                    <Input 
                      type={showPasswords.confirm ? "text" : "password"}
                      placeholder="Re-enter new password"
                      value={securityForm.confirmPassword}
                      onChange={(e) => setSecurityForm({...securityForm, confirmPassword: e.target.value})}
                      required
                      className="pr-10"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPasswords({...showPasswords, confirm: !showPasswords.confirm})}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition-colors"
                    >
                      {showPasswords.confirm ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>
                <Button 
                  type="submit"
                  disabled={savingSecurity}
                  className="w-full bg-amber-600 hover:bg-amber-700"
                >
                  {savingSecurity ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Changing Password...
                    </>
                  ) : (
                    <>
                      <Check className="w-4 h-4 mr-2" />
                      Change Password
                    </>
                  )}
                </Button>
              </form>
            </CardContent>
          </Card>

          {/* Account Information */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <User className="w-5 h-5 text-amber-600" />
                Account Information
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label className="text-sm text-slate-600">Email Address</Label>
                <p className="font-medium text-slate-900">{user?.email || "Not provided"}</p>
                <p className="text-xs text-slate-500 mt-1">Your email is used for login and notifications</p>
              </div>
              <Separator />
              <div>
                <Label className="text-sm text-slate-600">Account Created</Label>
                <p className="font-medium text-slate-900">{new Date().toLocaleDateString('en-GB')}</p>
              </div>
              <Separator />
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
                <div className="flex items-start gap-3">
                  <Shield className="w-5 h-5 text-amber-600 mt-0.5" />
                  <div>
                    <h4 className="font-semibold text-slate-900 mb-1">Security Tips</h4>
                    <ul className="text-sm text-slate-600 space-y-1">
                      <li>• Use a strong, unique password</li>
                      <li>• Change your password regularly</li>
                      <li>• Never share your password with anyone</li>
                      <li>• Log out from shared devices</li>
                    </ul>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
        </ContentAnimationWrapper>
      </div>
    );
  }

  // Order Confirmation View
  if (viewMode === "order-confirmation") {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-slate-50 flex items-center justify-center">
        <div className="max-w-2xl mx-auto px-4 py-8">
          <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-8">
              {/* Success Icon */}
              <div className="w-20 h-20 bg-green-500 rounded-full flex items-center justify-center mx-auto mb-6">
                <Check className="w-10 h-10 text-white" strokeWidth={3} />
              </div>
              
              {/* Title */}
              <h1 className="text-base sm:text-lg font-bold text-slate-900 mb-2 text-center">Order Confirmed!</h1>
              <p className="text-sm text-cyan-600 mb-8 text-center">
                Thank you for choosing SECURE. Your order has been successfully placed.
              </p>
              
              {/* Order Number */}
              <div className="bg-orange-50 rounded-lg p-4 mb-8">
                <p className="text-xs text-slate-600 mb-1 text-center">Order Number</p>
                <p className="text-xl font-bold text-orange-600 text-center">{orderNumber}</p>
              </div>
              
              {/* Customer Information */}
              {completedOrder && (
                <>
                  <div className="space-y-3 mb-8">
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-cyan-600">Customer Name</span>
                      <span className="text-sm font-semibold text-slate-900">{completedOrder.customer.name}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-cyan-600">Phone</span>
                      <span className="text-sm font-semibold text-slate-900">{completedOrder.customer.phone}</span>
                    </div>
                    <div className="flex items-start justify-between">
                      <span className="text-sm text-cyan-600">Delivery Address</span>
                      <span className="text-sm font-semibold text-right text-slate-900 leading-relaxed max-w-[70%]">
                        {completedOrder.customer.address}, {completedOrder.customer.city} {completedOrder.customer.zipCode}, {completedOrder.customer.country}
                      </span>
                    </div>
                    {completedOrder.customer.notes && (
                      <div className="flex items-start justify-between">
                        <span className="text-sm text-cyan-600">Order Note</span>
                        <span className="text-sm font-semibold text-right text-slate-900 leading-relaxed max-w-[70%]">
                          {completedOrder.customer.notes}
                        </span>
                      </div>
                    )}
                  </div>

                  {/* Ordered Items */}
                  <div className="mb-8">
                    <div className="flex items-center gap-2 mb-4">
                      <div className="w-5 h-5 bg-orange-100 rounded flex items-center justify-center">
                        <Package className="w-3 h-3 text-orange-600" />
                      </div>
                      <h3 className="text-sm font-bold text-slate-900">Ordered Items</h3>
                    </div>
                    
                    <div className="space-y-3">
                      {completedOrder.items.map((item: CartItem, index: number) => (
                        <div key={index} className="bg-orange-50 rounded-lg p-4 flex gap-4 items-center">
                          <div className="w-16 h-16 rounded-lg overflow-hidden flex-shrink-0 bg-white border border-orange-200">
                            <img
                              src={item.image}
                              alt={item.sku}
                              className="w-full h-full object-cover"
                            />
                          </div>
                          <div className="flex-1 min-w-0">
                            <h4 className="font-semibold text-slate-900 text-sm leading-tight mb-1">{item.sku}</h4>
                            <p className="text-xs text-slate-500">Qty: {item.quantity}</p>
                          </div>
                          <div className="text-right">
                            <p className="text-sm font-bold text-slate-900">{item.price}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Total */}
                  <div className="bg-slate-50 rounded-lg p-4 mb-8">
                    <div className="space-y-3">
                      <div className="flex items-center justify-between text-sm text-slate-600">
                        <span>Subtotal</span>
                        <span>{formatPriceMMK(`$${completedOrder.subtotal.toFixed(2)}`)}</span>
                      </div>
                      {completedOrder.discount > 0 && (
                        <div className="flex items-center justify-between text-sm text-green-600">
                          <span>Discount ({completedOrder.couponCode})</span>
                          <span>-{formatPriceMMK(`$${completedOrder.discount.toFixed(2)}`)}</span>
                        </div>
                      )}
                      <div className="flex items-center justify-between pt-3 border-t border-slate-200">
                        <span className="text-base font-semibold text-slate-900">Total</span>
                        <p className="text-xl font-bold text-orange-600">{formatPriceMMK(completedOrder.totalFormatted)}</p>
                      </div>
                    </div>
                  </div>
                </>
              )}
              
              {/* Buttons */}
              <div className="flex justify-center">
                <Button 
                  onClick={() => {
                    navigate("/store");
                    setBuyNowItem(null);
                    setCompletedOrder(null);
                    setViewMode("home");
                    setSelectedCategory("all");
                  }}
                  className="w-64 bg-[#1a1d29] hover:bg-slate-900 h-11 text-sm font-medium text-white"
                >
                  Continue Shopping
                </Button>
              </div>
            </div>
          </div>
        </div>
    );
  }

  // Order Detail View
  if (viewMode === "order-detail") {
    console.log('🎯 Rendering Order Detail View');
    console.log('📍 Current URL:', location.pathname);
    console.log('🆔 Order ID from URL:', location.pathname.replace("/profile/orders/", ""));
    console.log('📚 Available orders:', userOrders);
    
    // Find the order from URL parameter
    const orderId = location.pathname.replace("/profile/orders/", "");
    const order = userOrders.find(o => o.id === orderId);
    
    console.log('🔍 Found order:', order);
    console.log('📋 Selected order:', selectedOrder);
    
    // Update selectedOrder if it's not set yet
    if (order && !selectedOrder) {
      setSelectedOrder(order);
    }

    return (
      <ContentAnimationWrapper contentKey={`order-detail-${selectedOrder?.id || order?.id || 'loading'}`}>
        <OrderDetailView
          order={selectedOrder || order}
          onBack={() => {
            setSelectedOrder(null);
            setViewMode("order-history");
            navigate("/profile/orders");
          }}
          formatPriceMMK={formatPriceMMK}
        />
      </ContentAnimationWrapper>
    );
  }

  // Checkout View
  if (viewMode === "checkout") {
    return (
      <div className="min-h-screen bg-slate-50">
        <ServerStatusBanner 
          status={serverStatus}
          storeName={stableStoreName}
          onRetry={async () => {
            setServerStatus('checking');
            const healthCheck = await checkServerHealth(5000);
            if (healthCheck.isHealthy) {
              updateServerStatus('healthy');
              loadProducts();
              loadCategories();
              toast.success('Connected to server successfully!');
            } else {
              setServerStatus('unhealthy');
              toast.error('Still cannot connect to server. Please wait and try again.');
            }
          }}
        />
        <Header />
        {CartSidebar}
        
        {/* Main content with smooth fade-in animation - header stays stable */}
        <ContentAnimationWrapper contentKey="checkout">
          <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
            <Button 
              variant="ghost" 
              className="mb-6 hover:bg-white"
              onClick={() => {
                navigate("/store");
                setBuyNowItem(null); // 🔥 Clear Buy Now item when going back
                setViewMode("home");
              }}
            >
              <ChevronLeft className="w-4 h-4 mr-2" />
              Continue Shopping
            </Button>
            
            <div className="grid lg:grid-cols-5 gap-8">
            {/* Checkout Form */}
            <div className="lg:col-span-3">
              <div className="border border-slate-200 rounded-xl bg-white p-6 shadow-md space-y-6">
                {/* Contact Information */}
                <div>
                  <h2 className="text-lg font-semibold text-slate-900 mb-3" style={{ fontFamily: 'Rubik, sans-serif' }}>Contact</h2>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label htmlFor="name" className="text-sm font-normal text-slate-700 mb-1.5 block">Full Name</Label>
                      <Input
                        key="checkout-name"
                        id="name"
                        value={customerInfo.name}
                        onChange={(e) => setCustomerInfo(prev => ({ ...prev, name: e.target.value }))}
                        placeholder="Enter your full name"
                        className="h-11 text-sm border-slate-300 focus:border-slate-900 focus:ring-0"
                      />
                    </div>
                    <div>
                      <Label htmlFor="phone" className="text-sm font-normal text-slate-700 mb-1.5 block">Phone Number</Label>
                      <Input
                        key="checkout-phone"
                        id="phone"
                        type="number"
                        value={customerInfo.phone}
                        onChange={(e) => setCustomerInfo(prev => ({ ...prev, phone: e.target.value }))}
                        placeholder="+95 9 XXX XXX XXX"
                        className="h-11 text-sm border-slate-300 focus:border-slate-900 focus:ring-0"
                      />
                    </div>
                  </div>
                </div>

                {/* Address */}
                <div>
                  <h2 className="text-lg font-semibold text-slate-900 mb-3" style={{ fontFamily: 'Rubik, sans-serif' }}>Address</h2>
                  <div className="space-y-4">
                    <div>
                      <Label htmlFor="address" className="text-sm font-normal text-slate-700 mb-1.5 block">Address</Label>
                      <Input
                        key="checkout-address"
                        id="address"
                        value={customerInfo.address}
                        onChange={(e) => setCustomerInfo(prev => ({ ...prev, address: e.target.value }))}
                        placeholder="No. 123, Main Street"
                        className="h-11 text-sm border-slate-300 focus:border-slate-900 focus:ring-0"
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <Label htmlFor="city" className="text-sm font-normal text-slate-700 mb-1.5 block">City</Label>
                        <Input
                          key="checkout-city"
                          id="city"
                          value={customerInfo.city}
                          onChange={(e) => setCustomerInfo(prev => ({ ...prev, city: e.target.value }))}
                          placeholder="Yangon"
                          className="h-11 text-sm border-slate-300 focus:border-slate-900 focus:ring-0"
                        />
                      </div>
                      <div>
                        <div className="flex items-baseline justify-between mb-1.5">
                          <Label htmlFor="zipCode" className="text-sm font-normal text-slate-700">Postal Code</Label>
                          <span className="text-xs text-slate-500">(optional)</span>
                        </div>
                        <Input
                          key="checkout-zipCode"
                          id="zipCode"
                          value={customerInfo.zipCode}
                          onChange={(e) => setCustomerInfo(prev => ({ ...prev, zipCode: e.target.value }))}
                          placeholder="11011"
                          className="h-11 text-sm border-slate-300 focus:border-slate-900 focus:ring-0"
                        />
                      </div>
                    </div>
                    <div>
                      <Label htmlFor="country" className="text-sm font-normal text-slate-700 mb-1.5 block">Country/Region</Label>
                      <Input
                        key="checkout-country"
                        id="country"
                        value={customerInfo.country}
                        onChange={(e) => setCustomerInfo(prev => ({ ...prev, country: e.target.value }))}
                        placeholder="Myanmar"
                        className="h-11 text-sm border-slate-300 focus:border-slate-900 focus:ring-0"
                      />
                    </div>
                    <div>
                      <div className="flex items-baseline justify-between mb-1.5">
                        <Label htmlFor="notes" className="text-sm font-normal text-slate-700">Delivery Notes</Label>
                        <span className="text-xs text-slate-500">(optional)</span>
                      </div>
                      <Textarea
                        key="checkout-notes"
                        id="notes"
                        value={customerInfo.notes}
                        onChange={(e) => setCustomerInfo(prev => ({ ...prev, notes: e.target.value }))}
                        placeholder="Add delivery instructions..."
                        className="min-h-[80px] text-sm border-slate-300 focus:border-slate-900 focus:ring-0 resize-none"
                        rows={3}
                      />
                    </div>
                  </div>
                </div>

                {/* Payment Method */}
                <div>
                  <h2 className="text-lg font-semibold text-slate-900 mb-3" style={{ fontFamily: 'Rubik, sans-serif' }}>Payment</h2>
                  
                  {/* Prepaid Notice Banner */}
                  <div className="bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-200 rounded-lg p-3 mb-4">
                    <div className="flex items-start gap-2">
                      <Shield className="w-4 h-4 text-blue-600 flex-shrink-0 mt-0.5" />
                      <div>
                        <p className="text-xs font-semibold text-blue-900 mb-0.5">💳 Prepaid Payment Required</p>
                        <p className="text-xs text-blue-800">All orders require payment completion before processing.</p>
                      </div>
                    </div>
                  </div>
                  
                  <div className="space-y-3">
                  {/* Credit/Debit Card */}
                  <button
                    type="button"
                    onClick={() => setPaymentMethod("Card")}
                    className={`w-full text-left border rounded-lg p-4 transition-all ${
                      paymentMethod === "Card"
                        ? "border-slate-900 bg-slate-50"
                        : "border-slate-300 bg-white hover:border-slate-400"
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center ${
                          paymentMethod === "Card" ? "border-slate-900" : "border-slate-300"
                        }`}>
                          {paymentMethod === "Card" && (
                            <div className="w-2 h-2 rounded-full bg-slate-900"></div>
                          )}
                        </div>
                        <span className="text-sm font-medium text-slate-900">Credit / Debit Card</span>
                      </div>
                    </div>
                  </button>

                  {/* KPay */}
                  <button
                    type="button"
                    onClick={() => setPaymentMethod("KPay")}
                    className={`w-full text-left border rounded-lg p-4 transition-all ${
                      paymentMethod === "KPay"
                        ? "border-slate-900 bg-slate-50"
                        : "border-slate-300 bg-white hover:border-slate-400"
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center ${
                          paymentMethod === "KPay" ? "border-slate-900" : "border-slate-300"
                        }`}>
                          {paymentMethod === "KPay" && (
                            <div className="w-2 h-2 rounded-full bg-slate-900"></div>
                          )}
                        </div>
                        <span className="text-sm font-medium text-slate-900">KPay</span>
                      </div>
                    </div>
                  </button>

                  {/* Bank Transfer */}
                  <button
                    type="button"
                    onClick={() => setPaymentMethod("BankTransfer")}
                    className={`w-full text-left border rounded-lg p-4 transition-all ${
                      paymentMethod === "BankTransfer"
                        ? "border-slate-900 bg-slate-50"
                        : "border-slate-300 bg-white hover:border-slate-400"
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center ${
                          paymentMethod === "BankTransfer" ? "border-slate-900" : "border-slate-300"
                        }`}>
                          {paymentMethod === "BankTransfer" && (
                            <div className="w-2 h-2 rounded-full bg-slate-900"></div>
                          )}
                        </div>
                        <span className="text-sm font-medium text-slate-900">Bank Transfer</span>
                      </div>
                    </div>
                  </button>
                </div>

                {/* Payment Detail Forms - Show when payment method selected */}
                {paymentMethod === "Card" && (
                  <div className="mt-6 space-y-4 border-t border-slate-200 pt-6">
                    <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 mb-4">
                      <p className="text-sm text-blue-900 font-semibold">💳 Credit / Debit Card Payment</p>
                    </div>

                    {/* Test Mode Banner */}
                    <div className="bg-gradient-to-r from-amber-50 to-yellow-50 border border-amber-300 rounded-lg p-4 mb-4">
                      <div className="flex items-start gap-2">
                        <div className="flex-shrink-0">
                          <div className="w-5 h-5 rounded-full bg-amber-500 flex items-center justify-center">
                            <span className="text-white text-xs font-bold">T</span>
                          </div>
                        </div>
                        <div className="flex-1">
                          <p className="text-sm font-bold text-amber-900 mb-2">🧪 Test Mode - Use These Cards:</p>
                          <div className="space-y-1.5 text-xs text-amber-800">
                            <div className="flex items-center gap-2">
                              <span className="font-mono bg-white px-2 py-0.5 rounded border border-amber-200">4242 4242 4242 4242</span>
                              <span>→ ✅ Success</span>
                            </div>
                            <div className="flex items-center gap-2">
                              <span className="font-mono bg-white px-2 py-0.5 rounded border border-amber-200">4000 0000 0000 0002</span>
                              <span>→ ❌ Card Declined</span>
                            </div>
                            <div className="flex items-center gap-2">
                              <span className="font-mono bg-white px-2 py-0.5 rounded border border-amber-200">4000 0000 0000 9995</span>
                              <span>→ ❌ Insufficient Funds</span>
                            </div>
                            <div className="flex items-center gap-2">
                              <span className="font-mono bg-white px-2 py-0.5 rounded border border-amber-200">4000 0000 0000 0069</span>
                              <span>→ ❌ Card Expired</span>
                            </div>
                            <p className="text-xs text-amber-700 mt-2 italic">Use any future date for expiry (e.g., 12/28) and any 3-digit CVV</p>
                          </div>
                        </div>
                      </div>
                    </div>

                    <div>
                      <label className="block text-sm font-semibold text-slate-700 mb-2">Card Number *</label>
                      <Input
                        required
                        placeholder="1234 5678 9012 3456"
                        maxLength={19}
                        value={paymentInfo.cardNumber}
                        onChange={(e) => {
                          const value = e.target.value.replace(/\s/g, '').replace(/(\d{4})/g, '$1 ').trim();
                          setPaymentInfo({...paymentInfo, cardNumber: value});
                        }}
                        className="border-slate-300 focus:border-slate-900"
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-semibold text-slate-700 mb-2">Cardholder Name *</label>
                      <Input
                        required
                        placeholder="JOHN DOE"
                        value={paymentInfo.cardName}
                        onChange={(e) => setPaymentInfo({...paymentInfo, cardName: e.target.value.toUpperCase()})}
                        className="border-slate-300 focus:border-slate-900"
                      />
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-semibold text-slate-700 mb-2">Expiry Date *</label>
                        <Input
                          required
                          placeholder="MM/YY"
                          maxLength={5}
                          value={paymentInfo.expiryDate}
                          onChange={(e) => {
                            let value = e.target.value.replace(/\D/g, '');
                            if (value.length >= 2) {
                              value = value.slice(0, 2) + '/' + value.slice(2, 4);
                            }
                            setPaymentInfo({...paymentInfo, expiryDate: value});
                          }}
                          className="border-slate-300 focus:border-slate-900"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-semibold text-slate-700 mb-2">CVV *</label>
                        <Input
                          required
                          type="password"
                          placeholder="123"
                          maxLength={4}
                          value={paymentInfo.cvv}
                          onChange={(e) => setPaymentInfo({...paymentInfo, cvv: e.target.value.replace(/\D/g, '')})}
                          className="border-slate-300 focus:border-slate-900"
                        />
                      </div>
                    </div>

                    <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mt-4">
                      <p className="text-sm text-blue-900">
                        🔒 Your payment information is encrypted and secure
                      </p>
                    </div>
                  </div>
                )}

                {paymentMethod === "BankTransfer" && (
                  <div className="mt-6 space-y-4 border-t border-slate-200 pt-6">
                    <div className="bg-purple-50 border border-purple-200 rounded-lg p-3 mb-4">
                      <p className="text-sm text-purple-900 font-semibold">🏦 Bank Transfer</p>
                    </div>

                    <div className="bg-slate-50 border border-slate-200 rounded-xl p-6">
                      <h3 className="font-bold text-slate-900 mb-4">Transfer Details</h3>
                      <div className="space-y-3 text-sm">
                        <div className="flex justify-between py-2 border-b border-slate-200">
                          <span className="text-slate-600">Bank Name:</span>
                          <span className="font-semibold text-slate-900">Myanmar Bank</span>
                        </div>
                        <div className="flex justify-between py-2 border-b border-slate-200">
                          <span className="text-slate-600">Account Name:</span>
                          <span className="font-semibold text-slate-900">SECURE Store</span>
                        </div>
                        <div className="flex justify-between py-2 border-b border-slate-200">
                          <span className="text-slate-600">Account Number:</span>
                          <span className="font-semibold text-slate-900 font-mono">1234-5678-9012</span>
                        </div>
                        <div className="flex justify-between py-2">
                          <span className="text-slate-600">Amount:</span>
                          <span className="font-bold text-purple-600 text-lg">{formatPriceMMK(`$${(getCartTotal() - (appliedCoupon?.discountAmount || 0)).toFixed(2)}`)}</span>
                        </div>
                      </div>
                    </div>

                    <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                      <p className="text-sm text-blue-900">
                        📌 <strong>Important:</strong> Please complete the bank transfer and include your order number in the reference. Your order will be processed after payment confirmation.
                      </p>
                    </div>
                  </div>
                )}

                {paymentMethod === "KPay" && (
                  <div className="mt-6 space-y-4 border-t border-slate-200 pt-6">
                    <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-3 mb-4">
                      <p className="text-sm text-emerald-900 font-semibold">💳 KPay Payment</p>
                    </div>

                    <div className="bg-slate-50 border border-slate-200 rounded-xl p-6">
                      <h3 className="font-bold text-slate-900 mb-4">Scan QR Code to Pay</h3>
                      
                      {/* QR Code Placeholder */}
                      <div className="flex justify-center mb-6">
                        <div className="w-48 h-48 bg-white rounded-lg overflow-hidden flex items-center justify-center border-2 border-slate-200">
                          <div className="text-center px-4">
                            <CreditCard className="w-12 h-12 text-slate-400 mx-auto mb-2" />
                            <p className="text-sm text-slate-500">KPay QR Code</p>
                          </div>
                        </div>
                      </div>

                      {/* Payment Details */}
                      <div className="space-y-3 text-sm">
                        <div className="flex justify-between py-2 border-b border-slate-200">
                          <span className="text-slate-600">KPay Phone Number:</span>
                          <span className="font-semibold text-slate-900 font-mono">+95 9 123 456 789</span>
                        </div>
                        <div className="flex justify-between py-2">
                          <span className="text-slate-600">Amount to Pay:</span>
                          <span className="font-bold text-emerald-600 text-lg">{formatPriceMMK(`$${(getCartTotal() - (appliedCoupon?.discountAmount || 0)).toFixed(2)}`)}</span>
                        </div>
                      </div>
                    </div>

                    {/* Instructions */}
                    <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                      <p className="text-sm text-blue-900">
                        📱 <strong>How to pay:</strong>
                      </p>
                      <ul className="text-sm text-blue-900 mt-2 space-y-1 list-disc list-inside">
                        <li>Scan the QR code with your KPay app</li>
                        <li>Or manually transfer to: <strong>+95 9 123 456 789</strong></li>
                        <li>Enter the exact amount shown above</li>
                        <li>Complete the payment in your KPay app</li>
                      </ul>
                    </div>
                  </div>
                )}

                </div>
              </div>
            </div>

            {/* Order Summary */}
            <div className="lg:col-span-2">
              <div className="sticky top-24 border border-slate-200 rounded-xl bg-white p-6 max-h-[calc(100vh-1.75rem)] overflow-hidden flex flex-col shadow-md">
                {/* Header */}
                <div className="flex-shrink-0 mb-5">
                  <h2 className="text-lg font-semibold text-slate-900" style={{ fontFamily: 'Rubik, sans-serif' }}>
                    Order Summary
                    {buyNowItem && (
                      <Badge className="bg-amber-500 text-white text-xs ml-2">⚡ Express</Badge>
                    )}
                  </h2>
                </div>
                
                {/* Content */}
                <div className="space-y-4 overflow-y-auto flex-1 scrollbar-thin">
                  {/* Express Checkout Notice */}
                  {buyNowItem && (
                    <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 flex items-start gap-2">
                      <Zap className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" />
                      <div className="text-xs text-amber-800">
                        <p className="font-semibold">Express Checkout</p>
                        <p className="text-amber-700">Your cart items are safe. This order won't affect your cart.</p>
                      </div>
                    </div>
                  )}
                  
                  {/* Order Items */}
                  <div className="space-y-3 pb-4 border-b border-slate-200">
                    {(buyNowItem ? [buyNowItem] : cart).map(item => (
                      <div key={item.sku} className="flex gap-3">
                        <div className="w-16 h-16 rounded-md overflow-hidden border border-slate-200 flex-shrink-0 bg-white">
                          <img
                            src={item.image}
                            alt={item.sku}
                            className="w-full h-full object-cover"
                          />
                        </div>
                        <div className="flex-1 min-w-0 flex items-start justify-between gap-2">
                          <div>
                            <p className="font-semibold text-slate-900 text-sm">{item.sku}</p>
                            <p className="text-sm text-slate-500 font-medium mt-1">Qty: {item.quantity}</p>
                          </div>
                          <p className="text-sm font-semibold text-slate-900">{formatPriceMMK(item.price)}</p>
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* Coupon Code Section */}
                  <div className="space-y-2 pb-4">
                    {!appliedCoupon ? (
                      <div>
                        <CouponInput
                          onApply={handleApplyCoupon}
                          loading={couponLoading}
                          error={couponError}
                          onErrorClear={() => setCouponError('')}
                          variant="checkout"
                        />
                        {couponError && (
                          <p className="text-xs text-red-600 mt-2">{couponError}</p>
                        )}
                      </div>
                    ) : (
                      <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-3">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <Tag className="w-4 h-4 text-emerald-600" />
                            <div>
                              <p className="text-sm font-bold text-emerald-700">{appliedCoupon.code}</p>
                              <p className="text-xs text-emerald-600">
                                {appliedCoupon.discountType === 'percentage' 
                                  ? `${appliedCoupon.discount}% off` 
                                  : `${formatPriceMMK(`$${appliedCoupon.discount}`)} off`}
                                {' · '}You save {formatPriceMMK(`$${appliedCoupon.discountAmount.toFixed(2)}`)}!
                              </p>
                            </div>
                          </div>
                          <Button
                            type="button"
                            onClick={handleRemoveCoupon}
                            variant="ghost"
                            size="sm"
                            className="text-red-600 hover:text-red-700 hover:bg-red-50 h-8 px-2"
                          >
                            <X className="w-4 h-4" />
                          </Button>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Summary Totals */}
                  <div className="space-y-3 pt-4">
                    {/* Show discount if applied */}
                    {appliedCoupon && appliedCoupon.discountAmount && appliedCoupon.discountAmount > 0 && (
                      <div className="flex items-center justify-between text-sm text-emerald-600">
                        <span className="flex items-center gap-1">
                          Discount
                        </span>
                        <span className="font-semibold">-{formatPriceMMK(`$${appliedCoupon.discountAmount.toFixed(2)}`)}</span>
                      </div>
                    )}
                    
                    <div className="flex items-center justify-between">
                      <span className="font-semibold text-sm text-slate-900">Total</span>
                      <span className="font-bold text-base text-slate-900">{formatPriceMMK(`$${(getCartTotal() - (appliedCoupon?.discountAmount || 0)).toFixed(2)}`)}</span>
                    </div>
                  </div>

                  <Button 
                    className="w-full bg-transparent hover:bg-green-600 text-slate-900 hover:text-white border-2 border-orange-500 hover:border-green-600 font-semibold text-sm rounded-xl transition-all duration-300 h-11 flex items-center justify-center leading-normal" 
                    size="lg"
                    onClick={handlePlaceOrder}
                    disabled={isProcessingOrder}
                  >
                    {isProcessingOrder ? (
                      <>
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        Processing...
                      </>
                    ) : (
                      <>
                        {paymentMethod === "Card" 
                          ? `Pay ${formatPriceMMK(`$${(getCartTotal() - (appliedCoupon?.discountAmount || 0)).toFixed(2)}`)}` 
                          : paymentMethod === "BankTransfer" || paymentMethod === "KPay"
                          ? "I've Completed Payment"
                          : "PROCEED ORDER"}
                      </>
                    )}
                  </Button>

                </div>
              </div>
            </div>
          </div>
          </div>
        </ContentAnimationWrapper>
      </div>
    );
  }

  // Product Detail View
  if (selectedProduct) {
    // Build productImages array: ONLY variant images (first variant becomes cover)
    let productImages = [selectedProduct.image];
    
    // ⚡ Add variant images if they exist (SAFE - handles any structure)
    try {
      if (selectedProduct.hasVariants && Array.isArray(selectedProduct.variants) && selectedProduct.variants.length > 0) {
        // Get all variant images (including duplicates, we'll handle them)
        const variantImages = selectedProduct.variants
          .map((v: any) => v?.image)
          .filter((img: any) => img && typeof img === 'string');
        
        if (variantImages.length > 0) {
          // Use ONLY unique variant images - first variant image becomes the main cover
          const uniqueVariantImages = [...new Set(variantImages)];
          productImages = uniqueVariantImages;
          console.log('✅ Variant thumbnails loaded:', uniqueVariantImages.length, 'unique images from', variantImages.length, 'variants');
        }
      } else if (selectedProduct.images && Array.isArray(selectedProduct.images) && selectedProduct.images.length > 0) {
        // Fallback to images array if no variants
        productImages = selectedProduct.images;
      }
    } catch (error) {
      console.error('⚠️ Error loading variant images:', error);
      // Fallback to just the main image
      productImages = [selectedProduct.image];
    }
    
    const relatedProducts = getRelatedProducts(selectedProduct);
    const effectiveVariantOptions = getEffectiveVariantOptions(selectedProduct);
    
    // 🔍 DEBUG: Log product data to see variant structure
    console.log('🔍 Selected Product Data:', {
      hasVariants: selectedProduct.hasVariants,
      variantOptions: selectedProduct.variantOptions,
      effectiveVariantOptions,
      variants: selectedProduct.variants,
      productImages: productImages,
      fullProduct: selectedProduct
    });
    
    // Calculate current variant price based on selected options
    let displayPrice = selectedProduct.price;
    let displayComparePrice = selectedProduct.compareAtPrice;
    let displayInventory = selectedProduct.inventory;
    let displaySku = selectedProduct.sku;
    
    if (selectedProduct.hasVariants && selectedProduct.variants && effectiveVariantOptions.length > 0) {
      // Find the matching variant based on selected options
      const currentVariant = selectedProduct.variants.find((v: any) => {
        const optionNames = effectiveVariantOptions.map((opt: any) => opt.name);
        const variantValues = [v.option1, v.option2, v.option3].filter(Boolean);
        
        return optionNames.every((optionName: string, idx: number) => {
          return selectedVariants[optionName] === variantValues[idx];
        });
      });
      
      if (currentVariant) {
        displayPrice = currentVariant.price;
        displayComparePrice = currentVariant.compareAtPrice || selectedProduct.compareAtPrice;
        displayInventory = currentVariant.inventory;
        displaySku = currentVariant.sku;
        // ⚡ Image switching is now handled by useEffect above (no setState during render)
      }
    }
    
    const mmkPrice = formatPriceMMK(displayPrice);
    
    return (
      <div className="min-h-screen bg-white">
        <Header />
        {CartSidebar}

        {/* 🔥 SKELETON LOADING OVERLAY - Covers loading and scroll-to-top */}
        {isLoadingProductDetail && (
          <div className="fixed top-16 md:top-[8.5rem] left-0 right-0 bottom-0 bg-white z-[60] overflow-y-auto">
            <div className="max-w-7xl w-full mx-auto px-3 sm:px-4 md:px-6 lg:px-8 py-3 sm:py-4 md:py-5">
              {/* Breadcrumb skeleton */}
              <div className="flex items-center gap-1.5 mb-3">
                <div className="h-3 w-12 bg-slate-200 rounded animate-pulse" />
                <div className="h-2.5 w-2.5 bg-slate-200 rounded animate-pulse" />
                <div className="h-3 w-20 bg-slate-200 rounded animate-pulse" />
                <div className="h-2.5 w-2.5 bg-slate-200 rounded animate-pulse" />
                <div className="h-3 w-32 bg-slate-200 rounded animate-pulse" />
              </div>

              <div className="grid lg:grid-cols-2 gap-4 sm:gap-6 md:gap-8 lg:gap-12 mb-8">
                {/* Image skeleton */}
                <div className="space-y-2 sm:space-y-3 md:space-y-4">
                  <div className="aspect-square bg-slate-200 rounded-xl sm:rounded-2xl animate-pulse" />
                  <div className="flex gap-2">
                    {[1, 2, 3, 4].map((i) => (
                      <div key={i} className="w-14 h-14 sm:w-24 sm:h-24 bg-slate-200 rounded-md animate-pulse" />
                    ))}
                  </div>
                </div>

                {/* Product info skeleton */}
                <div className="space-y-6">
                  <div className="space-y-3">
                    <div className="flex gap-2">
                      <div className="h-5 w-20 bg-slate-200 rounded animate-pulse" />
                      <div className="h-5 w-16 bg-slate-200 rounded animate-pulse" />
                    </div>
                    <div className="h-6 w-3/4 bg-slate-200 rounded animate-pulse" />
                    <div className="h-8 w-32 bg-slate-200 rounded animate-pulse" />
                  </div>

                  <div className="space-y-2">
                    <div className="h-4 w-full bg-slate-200 rounded animate-pulse" />
                    <div className="h-4 w-full bg-slate-200 rounded animate-pulse" />
                    <div className="h-4 w-2/3 bg-slate-200 rounded animate-pulse" />
                  </div>

                  <div className="space-y-3">
                    <div className="h-5 w-24 bg-slate-200 rounded animate-pulse" />
                    <div className="flex gap-2">
                      {[1, 2, 3].map((i) => (
                        <div key={i} className="h-10 w-20 bg-slate-200 rounded animate-pulse" />
                      ))}
                    </div>
                  </div>

                  <div className="flex gap-3">
                    <div className="h-12 flex-1 bg-slate-200 rounded-lg animate-pulse" />
                    <div className="h-12 w-12 bg-slate-200 rounded-lg animate-pulse" />
                  </div>

                  <div className="space-y-2">
                    {[1, 2, 3, 4, 5].map((i) => (
                      <div key={i} className="flex justify-between">
                        <div className="h-4 w-24 bg-slate-200 rounded animate-pulse" />
                        <div className="h-4 w-32 bg-slate-200 rounded animate-pulse" />
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Main content with smooth fade-in animation - header stays stable */}
        <ContentAnimationWrapper contentKey={`product-${selectedProduct.id || selectedProduct.sku}`}>

        <div className="max-w-7xl mx-auto px-3 sm:px-4 md:px-6 lg:px-8 py-3 sm:py-4 md:py-5">
          {/* Breadcrumb */}
          <div className="flex items-center gap-1.5 text-xs text-slate-500 mb-3">
            <button onClick={() => {
              navigateAwayFromProduct("/store", "home");
            }} className="hover:text-amber-700 transition-colors whitespace-nowrap text-xs">
              Home
            </button>
            {selectedProduct.category && (
              <>
                <ChevronRight className="w-3 h-3 flex-shrink-0" />
                <button onClick={() => {
                  navigateAwayFromProduct("/store", "home", selectedProduct.category);
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
                  key={`${selectedProduct.id}-${selectedImageIndex}`}
                  src={productImages[selectedImageIndex]}
                  alt={selectedProduct.name}
                  priority
                  className="w-full h-full object-cover"
                />
              </div>
              {productImages.length > 1 && (
                <div className="flex gap-2 justify-start">
                  {productImages.map((img, index) => (
                    <button
                      key={index}
                      onClick={() => setSelectedImageIndex(index)}
                      className={`w-14 h-14 sm:w-24 sm:h-24 bg-slate-50 rounded-md overflow-hidden border-2 transition-all flex-shrink-0 ${
                        index === selectedImageIndex ? "border-amber-600 ring-2 ring-amber-200" : "border-slate-200 hover:border-slate-400"
                      }`}
                    >
                      <CacheFriendlyImg
                        src={img}
                        alt={`${selectedProduct.name} ${index + 1}`}
                        className="w-full h-full object-cover"
                      />
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Product Info */}
            <div className="space-y-6">
              {/* Title and Category */}
              <div>
                <div className="flex items-center gap-2 mb-2.5 flex-wrap">
                  {selectedProduct.category && (
                    <Badge className="bg-amber-100 text-amber-800 hover:bg-amber-200 border border-amber-300 text-xs font-medium px-2.5 py-0.5">{selectedProduct.category}</Badge>
                  )}
                  <Badge className="bg-emerald-100 text-emerald-800 hover:bg-emerald-200 border border-emerald-300 text-xs font-medium px-2.5 py-0.5">In Stock</Badge>
                </div>
                <h1 className="text-sm sm:text-base font-semibold text-slate-900 mb-2 leading-tight">{selectedProduct.name || 'Product'}</h1>
                <div className="flex items-center gap-2 flex-wrap">
                  <div className="flex items-center gap-0.5">
                    {[...Array(5)].map((_, i) => (
                      <Star key={i} className="w-3.5 h-3.5 fill-amber-400 text-amber-400" />
                    ))}
                  </div>
                  <span className="text-xs text-slate-600 font-medium">4.8/5.0</span>
                  <Separator orientation="vertical" className="h-3 hidden sm:block" />
                  <span className="text-xs text-slate-600">{selectedProduct.salesVolume || 0} sold</span>
                </div>
              </div>

              {/* Price */}
              <Card className="bg-gradient-to-br from-slate-50 to-slate-100 shadow-md border-0">
                <CardContent className="px-4 py-[17px]">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-base sm:text-lg font-bold bg-gradient-to-r from-amber-700 to-amber-600 bg-clip-text text-transparent">{mmkPrice}</span>
                    <>
                      <span className="text-sm text-slate-400 line-through">{formatPriceMMK(
                          (displayComparePrice && getPriceInMMK(displayComparePrice) > getPriceInMMK(displayPrice))
                            ? displayComparePrice
                            : generateFakeComparePrice(displayPrice, displaySku)
                        )}
                      </span>
                      <Badge className="bg-gradient-to-r from-emerald-600 to-teal-600 text-white border-0 text-xs">
                        Save {Math.round(((getPriceInMMK((displayComparePrice && getPriceInMMK(displayComparePrice) > getPriceInMMK(displayPrice)) ? displayComparePrice : generateFakeComparePrice(displayPrice, displaySku)) - getPriceInMMK(displayPrice)) / getPriceInMMK((displayComparePrice && getPriceInMMK(displayComparePrice) > getPriceInMMK(displayPrice)) ? displayComparePrice : generateFakeComparePrice(displayPrice, displaySku))) * 100)}%
                      </Badge>
                    </>
                  </div>
                  {selectedProduct.hasVariants && (
                    <p className="text-[11px] text-slate-500 mt-3 font-medium">SKU: {displaySku}</p>
                  )}
                </CardContent>
              </Card>

              {/* Variant Selector - NEW STRUCTURE (uses effectiveVariantOptions so slim bootstrap rows still show chips) */}
              {selectedProduct.hasVariants && effectiveVariantOptions.length > 0 && (
                <div className="space-y-6">
                  {effectiveVariantOptions.map((option: any) => (
                    <div key={option.name}>
                      <div className="mb-2.5">
                        <span className="text-sm font-semibold text-slate-900">{option.name}</span>
                        {selectedVariants[option.name] && (
                          <span className="ml-2 text-sm font-normal text-slate-600">
                            - {selectedVariants[option.name]}
                          </span>
                        )}
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {option.values.map((value: string) => (
                          <Button
                            key={value}
                            onClick={() => setSelectedVariants(prev => ({ ...prev, [option.name]: value }))}
                            variant={selectedVariants[option.name] === value ? "default" : "outline"}
                            className={`min-w-[70px] h-9 text-sm font-medium px-4 ${
                              selectedVariants[option.name] === value
                                ? 'bg-amber-600 hover:bg-amber-700 text-white' 
                                : 'border-slate-300 hover:border-slate-400'
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
              
              {/* Variant Selector - OLD STRUCTURE (for backward compatibility) */}
              {!selectedProduct.hasVariants && selectedProduct.oldVariants && selectedProduct.oldVariants.length > 0 && (
                <div className="space-y-6">
                  {/* Group variants by type */}
                  {Object.entries(
                    selectedProduct.oldVariants.reduce((acc, variant) => {
                      if (!acc[variant.type]) acc[variant.type] = [];
                      acc[variant.type].push(variant);
                      return acc;
                    }, {} as Record<string, ProductVariant[]>)
                  ).map(([type, variants]) => (
                    <div key={type}>
                      <Label className="text-sm font-semibold text-slate-900 mb-3 block capitalize">
                        {type === 'color' ? 'Color' : type === 'size' ? 'Size' : 'Options'}
                        {selectedVariants[type] && (
                          <span className="ml-2 font-normal text-slate-600">
                            - {variants.find(v => v.id === selectedVariants[type])?.name}
                          </span>
                        )}
                      </Label>
                      <div className="flex flex-wrap gap-2">
                        {variants.map((variant, idx) => {
                          const isSelected = selectedVariants[type] === variant.id;
                          const imageIndex = selectedProduct.images?.findIndex(img => img === variant.image) ?? -1;
                          
                          if (type === 'color') {
                            return (
                              <button
                                key={variant.id}
                                onClick={() => selectVariant(variant.id, type, imageIndex >= 0 ? imageIndex : undefined)}
                                disabled={!variant.available}
                                className={`relative w-12 h-12 rounded-lg border-2 transition-all disabled:opacity-40 disabled:cursor-not-allowed ${
                                  isSelected 
                                    ? 'border-amber-600 ring-2 ring-amber-200 scale-110' 
                                    : 'border-slate-300 hover:border-slate-400'
                                }`}
                                style={{ backgroundColor: variant.value }}
                                title={variant.name}
                              >
                                {isSelected && (
                                  <Check className="w-5 h-5 text-white absolute inset-0 m-auto drop-shadow-lg" />
                                )}
                              </button>
                            );
                          } else {
                            return (
                              <Button
                                key={variant.id}
                                onClick={() => selectVariant(variant.id, type, imageIndex >= 0 ? imageIndex : undefined)}
                                disabled={!variant.available}
                                variant={isSelected ? "default" : "outline"}
                                className={`min-w-[80px] ${
                                  isSelected 
                                    ? 'bg-amber-600 hover:bg-amber-700 text-white' 
                                    : 'border-slate-300 hover:border-slate-400'
                                }`}
                              >
                                {variant.name}
                              </Button>
                            );
                          }
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Product Details */}
              <Card className="border border-slate-200 shadow-sm">
                <CardContent className="p-5">
                  <h3 className="font-semibold text-slate-900 mb-5 text-sm">Product Details</h3>
                  <div className="grid grid-cols-2 gap-x-8 gap-y-5">
                    <div className="flex items-start gap-3">
                      <Package className="w-[18px] h-[18px] text-amber-600 mt-px flex-shrink-0" />
                      <div className="min-w-0">
                        <p className="text-[10px] text-slate-500 mb-1 font-normal uppercase tracking-wide">Condition</p>
                        <p className="font-medium text-slate-900 text-sm">Brand New</p>
                      </div>
                    </div>
                    <div className="flex items-start gap-3">
                      <Store className="w-[18px] h-[18px] text-amber-600 mt-px flex-shrink-0" />
                      <div className="min-w-0">
                        <p className="text-[10px] text-slate-500 mb-1 font-normal uppercase tracking-wide">Sold by</p>
                        <p className="font-medium text-slate-900 text-sm truncate">{selectedProduct.vendor || 'SECURE Marketplace'}</p>
                      </div>
                    </div>
                    <div className="flex items-start gap-3">
                      <TrendingUp className="w-[18px] h-[18px] text-amber-600 mt-px flex-shrink-0" />
                      <div className="min-w-0">
                        <p className="text-[10px] text-slate-500 mb-1 font-normal uppercase tracking-wide">Availability</p>
                        <div className="flex items-center gap-2">
                          <p className={`font-medium text-sm ${
                            displayInventory === 0 
                              ? "text-red-600" 
                              : displayInventory < 10 
                                ? "text-amber-600" 
                                : "text-emerald-700"
                          }`}>
                            {displayInventory || 0} units
                          </p>
                          {displayInventory === 0 && (
                            <Badge variant="outline" className="bg-red-50 text-red-600 border-red-200 text-xs">
                              OUT OF STOCK
                            </Badge>
                          )}
                          {displayInventory > 0 && displayInventory < 10 && (
                            <Badge variant="outline" className="bg-amber-50 text-amber-600 border-amber-200 text-xs">
                              LOW STOCK
                            </Badge>
                          )}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-start gap-3">
                      <Truck className="w-[18px] h-[18px] text-amber-600 mt-px flex-shrink-0" />
                      <div className="min-w-0">
                        <p className="text-[10px] text-slate-500 mb-1 font-normal uppercase tracking-wide">Delivery</p>
                        <p className="font-medium text-slate-900 text-sm">Complimentary</p>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Action Buttons */}
              <div className="flex gap-2 items-center">
                <Button
                  disabled={displayInventory === 0}
                  className={displayInventory === 0 
                    ? "bg-slate-300 h-10 font-semibold rounded-lg text-sm px-6 cursor-not-allowed flex items-center justify-center transition-all py-0"
                    : "bg-amber-600 hover:bg-amber-700 h-10 font-semibold transition-all rounded-lg text-sm px-6 flex items-center justify-center py-0"
                  }
                  onClick={() => {
                    if (displayInventory === 0) return;
                    // Pass the currently displayed image (variant image)
                    addToCart(selectedProduct, 1, displaySku, productImages[selectedImageIndex]);
                  }}
                >
                  <span className="block leading-none">
                    {displayInventory === 0 ? "OUT OF STOCK" : "ADD TO CART"}
                  </span>
                </Button>
                <Button 
                  disabled={displayInventory === 0}
                  variant="outline"
                  className={displayInventory === 0
                    ? "h-10 border-2 border-slate-300 bg-slate-100 text-slate-400 font-semibold rounded-lg text-sm px-6 cursor-not-allowed flex items-center justify-center transition-all py-0"
                    : "h-10 border-2 border-amber-600 hover:bg-amber-50 hover:border-amber-700 text-amber-700 hover:text-amber-800 font-semibold transition-all rounded-lg text-sm px-6 flex items-center justify-center py-0"
                  }
                  onClick={() => {
                    if (displayInventory === 0) return;
                    handleBuyNow(selectedProduct, displaySku, productImages[selectedImageIndex]);
                  }}
                >
                  <span className="block leading-none">
                    BUY NOW
                  </span>
                </Button>
                <Button 
                  variant="outline"
                  className="h-10 w-10 p-0 border-2 border-slate-300 hover:bg-slate-100 hover:border-slate-400 flex items-center justify-center flex-shrink-0 transition-all rounded-lg"
                  onClick={() => toggleWishlist(selectedProduct.id)}
                >
                  <Heart className={`w-4 h-4 ${wishlist.includes(selectedProduct.id) ? "fill-amber-600 text-amber-600" : "text-slate-600"}`} />
                </Button>
              </div>

              {/* Trust Badges */}
              <div className="grid grid-cols-3 gap-2 sm:gap-4 pt-6 border-t border-slate-200">
                <div className="text-center">
                  <div className="w-10 h-10 sm:w-12 sm:h-12 bg-emerald-100 rounded-full flex items-center justify-center mx-auto mb-1 sm:mb-2">
                    <Truck className="w-5 h-5 sm:w-6 sm:h-6 text-emerald-700" />
                  </div>
                  <p className="text-[10px] sm:text-xs font-medium text-slate-700">Free Delivery</p>
                </div>
                <div className="text-center">
                  <div className="w-10 h-10 sm:w-12 sm:h-12 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-1 sm:mb-2">
                    <Shield className="w-5 h-5 sm:w-6 sm:h-6 text-blue-700" />
                  </div>
                  <p className="text-[10px] sm:text-xs font-medium text-slate-700">Buyer Protection</p>
                </div>
                <div className="text-center">
                  <div className="w-10 h-10 sm:w-12 sm:h-12 bg-amber-100 rounded-full flex items-center justify-center mx-auto mb-1 sm:mb-2">
                    <RefreshCw className="w-5 h-5 sm:w-6 sm:h-6 text-amber-700" />
                  </div>
                  <p className="text-[10px] sm:text-xs font-medium text-slate-700">7-Day Returns</p>
                </div>
              </div>
            </div>
          </div>

          {/* Full Product Description Section */}
          <div className="mb-8">
            <Card className="border border-slate-200 shadow-sm">
              <CardContent className="p-6">
                <h2 className="text-xl font-bold text-slate-900 mb-4">Product Description</h2>
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
                          const imgRegex = /<img[^>]+src="([^">]+)"/g;
                          const matches = [...selectedProduct.description.matchAll(imgRegex)];
                          const imageSrcs = matches.map(match => match[1]);
                          
                          if (imageSrcs.length > 0) {
                            return (
                              <div className="mt-6">
                                <h3 className="text-sm font-semibold text-slate-700 mb-3">Product Images</h3>
                                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
                                  {imageSrcs.map((src, index) => (
                                    <div 
                                      key={index}
                                      className="relative aspect-square overflow-hidden rounded-lg bg-slate-100 group cursor-pointer"
                                      onClick={() => {
                                        setLightboxImages(imageSrcs);
                                        setLightboxIndex(index);
                                        setLightboxImage(src);
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
                        Experience exceptional quality with this premium product. Meticulously crafted with attention to detail, featuring superior materials and elegant design. Perfect for those who appreciate fine craftsmanship and timeless style.
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

          {/* Related Products */}
          {relatedProducts.length > 0 && (
            <div>
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-bold text-slate-900 leading-none">Similar Products</h2>
                <Button variant="ghost" className="text-amber-700 hover:text-amber-800 hover:bg-amber-50 flex items-center h-auto py-1">
                  <span className="text-xs">View All</span>
                  <ChevronRight className="w-4 h-4 ml-1" />
                </Button>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3 md:gap-4 lg:gap-6 stagger-children">
                {relatedProducts.map(product => (
                  <ProductCard
                    key={product.id}
                    product={product}
                    onProductClick={() => {
                      handleProductSelect(product);
                    }}
                    onAddToCart={(e, v) => {
                      e.stopPropagation();
                      addToCart(product, 1, v?.sku, v?.image, v?.price);
                    }}
                    onToggleWishlist={(e) => {
                      e.stopPropagation();
                      toggleWishlist(product.id);
                    }}
                    isWishlisted={wishlist.includes(product.id)}
                    formatPriceMMK={formatPriceMMK}
                  />
                ))}
              </div>
            </div>
          )}
        </div>

        <Footer />
        {/* Back to Top - Now handled globally in RootLayout */}
        {/* Floating Chat - Now handled globally in RootLayout */}
        
        {/* Lightbox Modal for Description Images */}
        {lightboxImage && (
          <div 
            className="fixed inset-0 z-[100] bg-black/90 flex items-center justify-center p-4"
            onClick={() => setLightboxImage(null)}
          >
            <div className="relative max-w-7xl max-h-[90vh] w-full h-full flex items-center justify-center">
              {/* Close Button */}
              <Button
                variant="ghost"
                size="icon"
                className="absolute top-4 right-4 z-10 bg-white/10 hover:bg-white/20 text-white rounded-full w-10 h-10"
                onClick={(e) => {
                  e.stopPropagation();
                  setLightboxImage(null);
                }}
              >
                <X className="w-6 h-6" />
              </Button>

              {/* Previous Button */}
              {lightboxImages.length > 1 && lightboxIndex > 0 && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="absolute left-4 top-1/2 -translate-y-1/2 z-10 bg-white/10 hover:bg-white/20 text-white rounded-full w-12 h-12"
                  onClick={(e) => {
                    e.stopPropagation();
                    const newIndex = lightboxIndex - 1;
                    setLightboxIndex(newIndex);
                    setLightboxImage(lightboxImages[newIndex]);
                  }}
                >
                  <ChevronLeft className="w-6 h-6" />
                </Button>
              )}

              {/* Next Button */}
              {lightboxImages.length > 1 && lightboxIndex < lightboxImages.length - 1 && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="absolute right-4 top-1/2 -translate-y-1/2 z-10 bg-white/10 hover:bg-white/20 text-white rounded-full w-12 h-12"
                  onClick={(e) => {
                    e.stopPropagation();
                    const newIndex = lightboxIndex + 1;
                    setLightboxIndex(newIndex);
                    setLightboxImage(lightboxImages[newIndex]);
                  }}
                >
                  <ChevronRight className="w-6 h-6" />
                </Button>
              )}

              {/* Image */}
              <img
                src={lightboxImage}
                alt="Product detail"
                className="max-w-full max-h-full object-contain"
                onClick={(e) => e.stopPropagation()}
              />

              {/* Image Counter */}
              {lightboxImages.length > 1 && (
                <div className="absolute bottom-4 left-1/2 -translate-x-1/2 bg-black/50 text-white px-4 py-2 rounded-full text-sm font-medium">
                  {lightboxIndex + 1} / {lightboxImages.length}
                </div>
              )}
            </div>
          </div>
        )}
      </ContentAnimationWrapper>
      
      {/* Auth Modal */}
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
    );
  }

  // All Products View
  if (viewMode === "all-products") {
    return (
      <div className="min-h-screen bg-slate-50">
        <ServerStatusBanner 
          status={serverStatus}
          storeName={stableStoreName}
          onRetry={async () => {
            setServerStatus('checking');
            const healthCheck = await checkServerHealth(5000);
            if (healthCheck.isHealthy) {
              updateServerStatus('healthy');
              loadProducts();
              loadCategories();
              toast.success('Connected to server successfully!');
            } else {
              setServerStatus('unhealthy');
              toast.error('Still cannot connect to server. Please wait and try again.');
            }
          }}
        />
        <Header />
        {CartSidebar}

        {/* Page Header */}
        <div className="bg-gradient-to-r from-slate-800 to-slate-700 text-white py-10 sm:py-12 md:py-16">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="flex items-center gap-2 sm:gap-3 mb-3 sm:mb-4">
              {(() => {
                if (selectedCategory === "all") {
                  return <Package className="w-6 h-6 sm:w-7 sm:h-7 md:w-8 md:h-8" />;
                }
                const IconComponent = getCategoryIcon(selectedCategory);
                return <IconComponent className="w-6 h-6 sm:w-7 sm:h-7 md:w-8 md:h-8" />;
              })()}
              <h1 className="text-xl sm:text-2xl font-serif font-bold">
                {selectedCategory === "all" ? "All Products" : selectedCategory}
              </h1>
            </div>
            <p className="text-slate-300 text-sm">
              Browse our {selectedCategory === "all" ? "complete " : ""}collection of {catalogTotal || sortedProducts.length} {selectedCategory === "all" ? "" : selectedCategory.toLowerCase()} products
            </p>
          </div>
        </div>

        {/* Main content with smooth fade-in animation */}
        <ContentAnimationWrapper contentKey={`all-products-${selectedCategory}-${sortBy}-${viewType}`}>
        {/* Products Grid with Filters */}
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 md:py-12">
          {/* Toolbar */}
          <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-5 md:mb-8">
            <div className="flex items-center gap-4">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowFilters(!showFilters)}
                className="gap-2 text-xs md:text-sm"
              >
                <Filter className="w-4 h-4" />
                {showFilters ? "Hide Filters" : "Show Filters"}
              </Button>
              <p className="text-[11px] sm:text-xs md:text-sm text-slate-600">
                Showing {sortedProducts.length} of {catalogTotal || sortedProducts.length} products
              </p>
            </div>

            <div className="flex items-center gap-4">
              <Select value={sortBy} onValueChange={setSortBy}>
                <SelectTrigger className="w-32 sm:w-40 md:w-48 text-[11px] sm:text-xs md:text-sm">
                  <SelectValue placeholder="Sort by" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="featured">Featured</SelectItem>
                  <SelectItem value="newest">Newest</SelectItem>
                  <SelectItem value="price-low">Price: Low to High</SelectItem>
                  <SelectItem value="price-high">Price: High to Low</SelectItem>
                  <SelectItem value="popular">Most Popular</SelectItem>
                </SelectContent>
              </Select>

              <div className="flex gap-2">
                <Button
                  variant={viewType === "grid" ? "default" : "outline"}
                  size="sm"
                  onClick={() => setViewType("grid")}
                  className="px-3"
                >
                  <Grid3x3 className="w-4 h-4" />
                </Button>
                <Button
                  variant={viewType === "list" ? "default" : "outline"}
                  size="sm"
                  onClick={() => setViewType("list")}
                  className="px-3"
                >
                  <List className="w-4 h-4" />
                </Button>
              </div>
            </div>
          </div>

          <div className="flex gap-8">
            {/* Sidebar Filters */}
            {showFilters && (
              <Card className="w-72 h-fit sticky top-24 hidden md:block shadow-md border-0">
                <CardHeader className="bg-gradient-to-r from-slate-800 to-slate-700 text-white rounded-t-lg">
                  <CardTitle className="text-lg font-serif">Filters</CardTitle>
                </CardHeader>
                <CardContent className="space-y-6 pt-6">
                  {/* Search */}
                  <div>
                    <h4 className="font-medium mb-3 text-sm text-slate-900">Search</h4>
                    <SearchInput
                      placeholder="Search... (Enter)"
                      onSearch={handleSearch}
                      className="w-full"
                      inputClassName="w-full pl-10 pr-9 py-2 border-0 bg-slate-100/60 hover:bg-slate-100 focus:bg-white rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-amber-500/20 transition-all"
                      variant="menu"
                      value={activeSearchQuery}
                    />
                  </div>

                  <Separator />

                  {/* Categories */}
                  <div>
                    <h4 className="font-medium mb-3 text-sm text-slate-900">Categories</h4>
                    <div className="space-y-2">
                      <button
                        onClick={() => {
                          setSelectedCategory("all");
                          setUserAppliedFilters(false);
                        }}
                        className={`w-full text-left px-4 py-2.5 rounded-lg text-sm transition-all ${
                          selectedCategory === "all" && !userAppliedFilters
                            ? "bg-gradient-to-r from-amber-600 to-amber-700 text-white font-medium shadow-sm"
                            : "hover:bg-slate-50 text-slate-700"
                        }`}
                      >
                        All Categories
                      </button>
                      {categories.map(cat => (
                        <button
                          key={cat}
                          onClick={() => {
                            setSelectedCategory(cat);
                            setUserAppliedFilters(false);
                          }}
                          className={`w-full text-left px-4 py-2.5 rounded-lg text-sm transition-all ${
                            selectedCategory === cat ? "bg-gradient-to-r from-amber-600 to-amber-700 text-white font-medium shadow-sm" : "hover:bg-slate-50 text-slate-700"
                          }`}
                        >
                          {cat}
                        </button>
                      ))}
                    </div>
                  </div>

                  <Separator />

                  {/* Price Range */}
                  <div>
                    <h4 className="font-medium mb-3 text-sm text-slate-900">Price Range</h4>
                    <div className="space-y-2">
                      <button
                        onClick={() => {
                          setPriceRange([0, 10000]);
                          setUserAppliedFilters(false);
                        }}
                        className={`w-full text-left px-4 py-2.5 rounded-lg text-sm transition-all ${
                          !userAppliedFilters
                            ? "bg-gradient-to-r from-amber-600 to-amber-700 text-white font-medium shadow-sm"
                            : "hover:bg-slate-50 text-slate-700"
                        }`}
                      >
                        All Prices
                      </button>
                      {[
                        { label: "Under $50", value: [0, 50] },
                        { label: "$50 - $100", value: [50, 100] },
                        { label: "$100 - $500", value: [100, 500] },
                        { label: "$500 - $1,000", value: [500, 1000] },
                        { label: "$1,000 - $5,000", value: [1000, 5000] },
                        { label: "Over $5,000", value: [5000, 100000] }
                      ].map((range, i) => (
                        <button
                          key={i}
                          onClick={() => {
                            setPriceRange(range.value as [number, number]);
                            setUserAppliedFilters(true);
                          }}
                          className={`w-full text-left px-4 py-2.5 rounded-lg text-sm transition-all ${
                            userAppliedFilters && 
                            priceRange[0] === range.value[0] && 
                            priceRange[1] === range.value[1]
                              ? "bg-gradient-to-r from-amber-600 to-amber-700 text-white font-medium shadow-sm"
                              : "hover:bg-slate-50 text-slate-700"
                          }`}
                        >
                          {range.label}
                        </button>
                      ))}
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Products Grid/List */}
            <div className="flex-1">
              {serverStatus === 'checking' ? (
                <div className="flex items-center justify-center py-20">
                  <Loader2 className="w-8 h-8 text-amber-600 animate-spin" />
                </div>
              ) : sortedProducts.length === 0 ? (
                <div className="text-center py-20">
                  <Package className="w-16 h-16 text-slate-300 mx-auto mb-4" />
                  <h3 className="text-xl font-semibold text-slate-700 mb-2">No products found</h3>
                  <p className="text-slate-500">Try adjusting your filters</p>
                </div>
              ) : (
                <>
                {viewType === "grid" ? (
                <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 md:gap-4 lg:gap-6 stagger-children">
                  {sortedProducts.map((product) => (
                    <ProductCard
                      key={product.id}
                      product={{
                        ...product,
                        image: product.images && product.images.length > 0 ? product.images[0] : product.image
                      }}
                      onProductClick={() => {
                        handleProductSelect(product);
                      }}
                      onAddToCart={(e, v) => {
                        e.stopPropagation();
                        addToCart(product, 1, v?.sku, v?.image, v?.price);
                      }}
                      onToggleWishlist={(e) => {
                        e.stopPropagation();
                        toggleWishlist(product.id);
                      }}
                      isWishlisted={wishlist.includes(product.id)}
                      formatPriceMMK={formatPriceMMK}
                    />
                  ))}
                </div>
                ) : (
                <div className="space-y-3 sm:space-y-4 lg:space-y-6">
                  {sortedProducts.map((product) => (
                    <MarketplaceListProductRow
                      key={product.id}
                      product={product}
                      layout="search"
                      formatPriceMMK={formatPriceMMK}
                      onProductClick={() => handleProductSelect(product)}
                      onAddToCart={(e, v) => {
                        e.stopPropagation();
                        addToCart(product, 1, v?.sku, v?.image, v?.price);
                      }}
                      onToggleWishlist={(e) => {
                        e.stopPropagation();
                        toggleWishlist(product.id);
                      }}
                      isWishlisted={wishlist.includes(product.id)}
                    />
                  ))}
                </div>
                )}
                {catalogHasMore && (
                  <div className="flex justify-center mt-8 md:mt-10">
                    <Button
                      type="button"
                      variant="outline"
                      className="min-w-[140px]"
                      onClick={() => loadMoreCatalog()}
                      disabled={catalogLoadingMore}
                    >
                      {catalogLoadingMore ? (
                        <>
                          <Loader2 className="w-4 h-4 mr-2 animate-spin inline" />
                          Loading…
                        </>
                      ) : (
                        "Load more"
                      )}
                    </Button>
                  </div>
                )}
                </>
              )}
            </div>
          </div>
        </div>
        </ContentAnimationWrapper>

        {/* Footer */}
        <Footer />
      </div>
    );
  }

  // Blog Detail View
  if (viewMode === "blog-detail" && selectedBlogPost) {
    console.log('Rendering blog detail view for:', selectedBlogPost);
    // Prepare blog post with default values for missing properties
    const blogPostForDetail = {
      ...selectedBlogPost,
      views: selectedBlogPost.views || 0,
      comments: selectedBlogPost.comments || 0,
      likes: selectedBlogPost.likes || 0,
      authorAvatar: selectedBlogPost.authorAvatar || `https://api.dicebear.com/7.x/avataaars/svg?seed=${selectedBlogPost.author || 'author'}`,
      coverImage: selectedBlogPost.coverImage || 'https://images.unsplash.com/photo-1499750310107-5fef28a66643?w=800',
    };
    console.log('Blog post prepared for detail:', blogPostForDetail);

    return (
      <div className="min-h-screen bg-slate-50">
        <ServerStatusBanner 
          status={serverStatus}
          storeName={siteSettings.storeName}
          onRetry={async () => {
            setServerStatus('checking');
            const healthCheck = await checkServerHealth(5000);
            if (healthCheck.isHealthy) {
              updateServerStatus('healthy');
              toast.success('Connected to server successfully!');
            } else {
              setServerStatus('unhealthy');
              toast.error('Still cannot connect to server. Please wait and try again.');
            }
          }}
        />
        {/* Main content with smooth fade-in animation */}
        <ContentAnimationWrapper contentKey={`blog-detail-${selectedBlogPost.id || selectedBlogPost.slug}`}>
        <BlogPostDetail 
          post={blogPostForDetail}
          onBack={() => {
            setSelectedBlogPost(null);
            setViewMode("blog");
          }}
        />
        </ContentAnimationWrapper>
      </div>
    );
  }

  // Blog View
  if (viewMode === "blog") {
    return (
      <div className="min-h-screen bg-slate-50">
        <ServerStatusBanner 
          status={serverStatus}
          storeName={stableStoreName}
          onRetry={async () => {
            setServerStatus('checking');
            const healthCheck = await checkServerHealth(5000);
            if (healthCheck.isHealthy) {
              updateServerStatus('healthy');
              loadBlogPosts();
              toast.success('Connected to server successfully!');
            } else {
              setServerStatus('unhealthy');
              toast.error('Still cannot connect to server. Please wait and try again.');
            }
          }}
        />
        <Header />
        {CartSidebar}

        {/* Main content with smooth fade-in animation - header stays stable */}
        <ContentAnimationWrapper contentKey="blog-list">
        {/* Page Header */}
        <div className="bg-gradient-to-r from-slate-800 to-slate-700 text-white py-16">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="flex items-center gap-3 mb-4">
              <FileText className="w-8 h-8" />
              <h1 className="text-xl sm:text-2xl font-serif font-bold">Blog Post</h1>
            </div>
            <p className="text-slate-300 text-sm">
              Browse our complete collection of {blogPosts.length} blog posts
            </p>
          </div>
        </div>

        {/* Blog Posts Grid */}
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
          {/* Toolbar */}
          <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-5 md:mb-8">
            <div className="flex items-center gap-4">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowFilters(!showFilters)}
                className="gap-2 text-xs md:text-sm"
              >
                <Filter className="w-4 h-4" />
                {showFilters ? "Hide Filters" : "Show Filters"}
              </Button>
              <p className="text-xs md:text-sm text-slate-600">
                Showing {blogPosts.length} blog posts
              </p>
            </div>

            <div className="flex items-center gap-4">
              <div className="flex gap-2">
                <Button
                  variant={viewType === "grid" ? "default" : "outline"}
                  size="sm"
                  onClick={() => setViewType("grid")}
                  className="px-3"
                >
                  <Grid3x3 className="w-4 h-4" />
                </Button>
                <Button
                  variant={viewType === "list" ? "default" : "outline"}
                  size="sm"
                  onClick={() => setViewType("list")}
                  className="px-3"
                >
                  <List className="w-4 h-4" />
                </Button>
              </div>
            </div>
          </div>

          {/* Blog Posts Content */}
          {blogLoading ? (
            <div className="flex items-center justify-center py-20">
              <Loader2 className="w-8 h-8 text-slate-400 animate-spin" />
            </div>
          ) : blogPosts.length === 0 ? (
            <div className="text-center py-20">
              <FileText className="w-16 h-16 text-slate-300 mx-auto mb-4" />
              <h3 className="text-xl font-semibold text-slate-600 mb-2">No blog posts yet</h3>
              <p className="text-slate-500">Check back soon for new content!</p>
            </div>
          ) : viewType === "grid" ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3 stagger-children">
              {blogPosts.map((post) => (
                <Card
                  key={post.id}
                  className="overflow-hidden hover:shadow-xl transition-all duration-300 cursor-pointer group animate-scale-in"
                  onClick={() => {
                    console.log('Grid blog post clicked:', post);
                    setSelectedBlogPost(post);
                    setViewMode("blog-detail");
                  }}
                >
                  <div className="relative h-48 overflow-hidden">
                    <img
                      src={post.coverImage || 'https://images.unsplash.com/photo-1499750310107-5fef28a66643?w=800'}
                      alt={post.title}
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                    />
                    {post.hasVideo && (
                      <Badge className="absolute top-3 right-3 bg-red-500 text-white border-0">
                        Video
                      </Badge>
                    )}
                  </div>

                  <div className="p-6">
                    <div className="flex items-center gap-2 mb-3">
                      <Badge variant="secondary" className="text-xs">
                        {post.category || 'Uncategorized'}
                      </Badge>
                      <span className="text-xs text-slate-500 flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        {new Date(post.publishDate).toLocaleDateString()}
                      </span>
                    </div>

                    <h3 className="text-lg font-bold text-slate-900 mb-2 line-clamp-2 group-hover:text-amber-700 transition-colors">
                      {post.title}
                    </h3>

                    <p className="text-slate-600 text-sm mb-4 line-clamp-3">
                      {post.excerpt}
                    </p>

                    <div className="flex items-center justify-between pt-4 border-t border-slate-100">
                      <div className="flex items-center gap-2">
                        <img
                          src={post.authorAvatar || 'https://api.dicebear.com/7.x/avataaars/svg?seed=author'}
                          alt={post.author}
                          className="w-6 h-6 rounded-full"
                        />
                        <span className="text-xs font-medium text-slate-600">{post.author}</span>
                      </div>

                      <div className="flex items-center gap-3 text-xs text-slate-500">
                        <span className="flex items-center gap-1">
                          <Eye className="w-3 h-3" />
                          {post.views || 0}
                        </span>
                        <span className="flex items-center gap-1">
                          <MessageSquare className="w-3 h-3" />
                          {post.comments || 0}
                        </span>
                      </div>
                    </div>
                  </div>
                </Card>
              ))}
            </div>
          ) : (
            <div className="space-y-6 stagger-children">
              {blogPosts.map((post) => (
                <Card
                  key={post.id}
                  className="overflow-hidden hover:shadow-xl transition-all duration-300 cursor-pointer group animate-slide-up"
                  onClick={() => {
                    console.log('List blog post clicked:', post);
                    setSelectedBlogPost(post);
                    setViewMode("blog-detail");
                  }}
                >
                  <div className="flex flex-col md:flex-row">
                    <div className="relative w-full md:w-64 h-48 flex-shrink-0 overflow-hidden">
                      <img
                        src={post.coverImage || 'https://images.unsplash.com/photo-1499750310107-5fef28a66643?w=800'}
                        alt={post.title}
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                      />
                      {post.hasVideo && (
                        <Badge className="absolute top-3 right-3 bg-red-500 text-white border-0">
                          Video
                        </Badge>
                      )}
                    </div>

                    <div className="flex-1 p-6">
                      <div className="flex items-center gap-2 mb-3">
                        <Badge variant="secondary" className="text-xs">
                          {post.category || 'Uncategorized'}
                        </Badge>
                        <span className="text-xs text-slate-500 flex items-center gap-1">
                          <Clock className="w-3 h-3" />
                          {new Date(post.publishDate).toLocaleDateString()}
                        </span>
                      </div>

                      <h3 className="text-base sm:text-lg font-bold text-slate-900 mb-2 group-hover:text-amber-700 transition-colors">
                        {post.title}
                      </h3>

                      <p className="text-slate-600 mb-4 line-clamp-2">
                        {post.excerpt}
                      </p>

                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <img
                            src={post.authorAvatar || 'https://api.dicebear.com/7.x/avataaars/svg?seed=author'}
                            alt={post.author}
                            className="w-8 h-8 rounded-full"
                          />
                          <div>
                            <p className="text-sm font-medium text-slate-700">{post.author}</p>
                          </div>
                        </div>

                        <div className="flex items-center gap-4 text-sm text-slate-500">
                          <span className="flex items-center gap-1">
                            <Eye className="w-4 h-4" />
                            {post.views || 0}
                          </span>
                          <span className="flex items-center gap-1">
                            <MessageSquare className="w-4 h-4" />
                            {post.comments || 0}
                          </span>
                          <Button size="sm" className="bg-amber-600 hover:bg-amber-700">
                            Read More
                            <ArrowRight className="w-4 h-4 ml-2" />
                          </Button>
                        </div>
                      </div>
                    </div>
                  </div>
                </Card>
              ))}
            </div>
          )}
        </div>
        </ContentAnimationWrapper>

        {/* Footer */}
        <Footer />
      </div>
    );
  }

  // Categories View
  if (viewMode === "categories") {
    return (
      <div className="min-h-screen bg-slate-50">
        <ServerStatusBanner 
          status={serverStatus}
          storeName={stableStoreName}
          onRetry={async () => {
            setServerStatus('checking');
            const healthCheck = await checkServerHealth(5000);
            if (healthCheck.isHealthy) {
              updateServerStatus('healthy');
              loadProducts();
              loadCategories();
              toast.success('Connected to server successfully!');
            } else {
              setServerStatus('unhealthy');
              toast.error('Still cannot connect to server. Please wait and try again.');
            }
          }}
        />
        <Header />
        {CartSidebar}

        {/* Main content with smooth fade-in animation - header stays stable */}
        <ContentAnimationWrapper contentKey="categories-view">
        {/* Page Header */}
        <div className="bg-gradient-to-r from-amber-600 to-orange-600 text-white py-16">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="flex items-center gap-3 mb-4">
              <Grid3x3 className="w-8 h-8" />
              <h1 className="text-xl sm:text-2xl font-serif font-bold">Categories</h1>
            </div>
            <p className="text-white/90 text-sm">
              Browse products by category - {allCategories.length} categories available
            </p>
          </div>
        </div>

        {/* Categories Grid */}
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
          {/* 🚀 FIXED: Removed skeleton loaders when serverStatus === 'checking' because ServerStatusBanner already shows full-screen loading */}
          {allCategories.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
              {allCategories.map((category) => {
                // Count products in this category
                const categoryProductCount = products.filter(p => p.category === category.name).length;
                
                return (
                  <Card 
                    key={category.id}
                    className="overflow-hidden hover:shadow-xl transition-all duration-300 cursor-pointer group border-0 shadow-md"
                    onClick={() => {
                      navigate("/store");
                      setSelectedCategory(category.name);
                      setUserAppliedFilters(false);
                      setViewMode("home");
                    }}
                  >
                    {/* Category Image */}
                    <div className="relative h-48 overflow-hidden bg-gradient-to-br from-amber-50 to-orange-50">
                      {category.coverPhoto || category.image ? (
                        <LazyImage
                          src={category.coverPhoto || category.image}
                          alt={category.name}
                          className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500"
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center">
                          <Folder className="w-16 h-16 text-amber-300" />
                        </div>
                      )}
                      {/* Overlay */}
                      <div className="absolute inset-0 bg-gradient-to-t from-black/50 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
                    </div>

                    {/* Category Info */}
                    <CardContent className="p-6">
                      <h3 className="text-xl font-serif font-bold text-slate-900 mb-2 group-hover:text-amber-700 transition-colors">
                        {category.name}
                      </h3>
                      <p className="text-sm text-slate-600 mb-4 line-clamp-2">
                        {category.description || "Explore our collection"}
                      </p>
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2 text-sm text-slate-500">
                          <Package className="w-4 h-4" />
                          <span>{categoryProductCount} {categoryProductCount === 1 ? 'product' : 'products'}</span>
                        </div>
                        <Button 
                          variant="ghost" 
                          size="sm"
                          className="text-amber-700 hover:text-amber-800 hover:bg-amber-50 group-hover:translate-x-1 transition-transform"
                        >
                          Browse
                          <ArrowRight className="w-4 h-4 ml-1" />
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          ) : (
            <div className="text-center py-20">
              <Folder className="w-16 h-16 text-slate-300 mx-auto mb-4" />
              <h3 className="text-xl font-semibold text-slate-900 mb-2">No categories found</h3>
              <p className="text-slate-600">Categories will appear here once they are added.</p>
            </div>
          )}
        </div>
        </ContentAnimationWrapper>

        {/* Footer */}
        <Footer />

        {/* Floating Chat - Now handled globally in RootLayout */}
      </div>
    );
  }

  // ✅ SHOW LOADING SCREEN UNTIL DATA IS FULLY LOADED
  // Show full-screen loading during initial data fetch
  if (serverStatus === 'checking' || !isDataReady) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-white">
        <div className="text-center">
          <Loader2 className="w-12 h-12 text-orange-500 animate-spin mx-auto mb-4" />
          <p className="text-slate-600">Please wait a while</p>
        </div>
      </div>
    );
  }

  // 🔒 Show error screen if connection failed AND no cached data
  if (serverStatus === 'unhealthy' && cachedProducts.length === 0) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-white px-4">
        <div className="text-center space-y-6 max-w-md">
          <div className="w-20 h-20 rounded-full bg-red-50 flex items-center justify-center mx-auto">
            <div className="w-16 h-16 rounded-full bg-red-100 flex items-center justify-center">
              <X className="w-8 h-8 text-red-600" />
            </div>
          </div>
          <div>
            <h2 className="text-base sm:text-lg font-bold text-slate-900 mb-2">Connection Timeout</h2>
            <p className="text-slate-600 text-sm">
              Unable to connect to the server. Please check your internet connection and try again.
            </p>
          </div>
          <Button
            onClick={async () => {
              setServerStatus('checking');
              const healthCheck = await checkServerHealth(5000);
              if (healthCheck.isHealthy) {
                updateServerStatus('healthy');
                loadProducts();
                loadCategories();
                toast.success('Connected to server successfully!');
              } else {
                setServerStatus('unhealthy');
                toast.error('Still cannot connect to server. Please wait and try again.');
              }
            }}
            className="bg-gradient-to-r from-amber-600 to-orange-600 hover:from-amber-700 hover:to-orange-700 text-white px-8 py-3 rounded-lg"
          >
            <RefreshCw className="w-4 h-4 mr-2" />
            Retry Connection
          </Button>
        </div>
      </div>
    );
  }

  // Home View
  return (
    <div className="min-h-screen bg-slate-50">
      <ServerStatusBanner 
        status={serverStatus}
        storeName={stableStoreName}
        onRetry={async () => {
          setServerStatus('checking');
          const healthCheck = await checkServerHealth(5000);
          if (healthCheck.isHealthy) {
            updateServerStatus('healthy');
            loadProducts();
            loadCategories();
            toast.success('Connected to server successfully!');
          } else {
            setServerStatus('unhealthy');
            toast.error('Still cannot connect to server. Please wait and try again.');
          }
        }}
      />
      
      <Header />
      {CartSidebar}
      
      {/* Hero Banner - Only show on home/products views */}
      {viewMode !== "saved-products" && (
        <BannerSlider 
          banners={banners} 
          autoPlayInterval={5000}
          onBannerClick={() => {
            setSelectedCategory("all");
            setUserAppliedFilters(false);
            setViewMode("all-products");
          }}
        />
      )}

      {/* Animated content wrapper - only content fades, not header/banner */}
      <ContentAnimationWrapper contentKey={`home-${viewMode}-${selectedCategory}`}>
      
      {/* Category Cards - Grid on Mobile, Horizontal Scroll on Desktop */}
      {viewMode !== "saved-products" && (
        <div className="bg-slate-50 pt-8 sm:pt-8 md:pt-10 pb-4 sm:pb-4 md:pb-4">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
              <h2 className="text-base md:text-xl font-bold text-slate-900 mb-6">Explore by Categories</h2>
              {/* Grid on mobile, horizontal scroll on desktop */}
              <div className="relative">
                <div className="grid grid-cols-3 gap-3 md:flex md:gap-4 md:overflow-x-auto pb-4 scrollbar-hide">
                  {allCategories.map(category => {
                    const Icon = categoryIcons[category.name] || categoryIcons.Default;
                    
                    return (
                      <div key={category.id} className="flex flex-col items-center md:flex-shrink-0">
                        <button
                          onClick={() => {
                            setSelectedCategory(category.name);
                            setUserAppliedFilters(false);
                            setViewMode("all-products");
                          }}
                          className="bg-white rounded-lg shadow-sm hover:shadow-md transition-all w-full md:w-[140px] lg:w-[160px] overflow-hidden group mb-[9px] sm:mb-[11px]"
                        >
                          {/* Category Image */}
                          <div className="w-full aspect-square md:h-[140px] lg:h-[160px] bg-slate-100 flex items-center justify-center overflow-hidden">
                            {category.coverPhoto ? (
                              <img
                                src={category.coverPhoto}
                                alt={category.name}
                                className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                              />
                            ) : (
                              <Icon className="w-12 h-12 sm:w-16 sm:h-16 text-slate-400" />
                            )}
                          </div>
                        </button>
                        
                        {/* Category Info - Below Card */}
                        <div className="text-center w-full md:w-[140px] lg:w-[160px]">
                          <h3 className="text-xs sm:text-sm font-semibold text-slate-900 truncate">
                            {category.name}
                          </h3>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>
        )
      }

      {/* Saved Products View */}
      {viewMode === "saved-products" && (
        <div className="bg-slate-50">
          {/* Page Header Banner */}
          <div className="bg-gradient-to-r from-slate-800 to-slate-700 text-white py-10 sm:py-12 md:py-16">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
              <div className="flex items-center gap-2 sm:gap-3 mb-3 sm:mb-4">
                <Heart className="w-6 h-6 sm:w-7 sm:h-7 md:w-8 md:h-8 fill-white" />
                <h1 className="text-xl sm:text-2xl font-serif font-bold">
                  Saved Products
                </h1>
              </div>
              <p className="text-slate-300 text-sm">
                {wishlist.length} {wishlist.length === 1 ? 'item' : 'items'} saved for later
              </p>
            </div>
          </div>

          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 md:py-12">
            {wishlist.length === 0 ? (
            <Card className="text-center py-16 sm:py-20 border-0 shadow-md">
              <Heart className="w-16 h-16 mx-auto text-slate-300 mb-4" />
              <p className="text-lg text-slate-500 mb-2">No saved products yet</p>
              <p className="text-sm text-slate-400 mb-6">Start adding products to your wishlist!</p>
              {!user && (
                <p className="text-xs text-amber-700 mb-4 bg-amber-50 py-2 px-4 rounded-lg inline-block">
                  💡 Create an account to sync your wishlist across devices
                </p>
              )}
              <div className="flex gap-3 justify-center">
                <Button 
                  onClick={() => {
                    navigate("/store");
                    setViewMode("home");
                  }}
                  className="bg-gradient-to-r from-amber-600 to-amber-700 hover:from-amber-700 hover:to-amber-800"
                >
                  Browse Products
                </Button>
                {!user && (
                  <Button 
                    variant="outline"
                    onClick={() => {
                      setShowAuthModal(true);
                      setAuthMode('register');
                    }}
                    className="border-2 border-amber-600 text-amber-700 hover:bg-amber-50"
                  >
                    Create Account
                  </Button>
                )}
              </div>
            </Card>
          ) : (
            <>
              {/* Guest User Prompt - Show if not logged in and has items in wishlist and banner not dismissed */}
              {!user && wishlist.length > 0 && !hideSavedBanner && (
                <Card className="mb-4 sm:mb-6 bg-gradient-to-r from-amber-50 to-orange-50 border-amber-200">
                  <CardContent className="py-3 sm:py-4">
                    <div className="flex items-center justify-between gap-4">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-amber-600 rounded-full flex items-center justify-center flex-shrink-0">
                          <UserCircle className="w-5 h-5 text-white" />
                        </div>
                        <div>
                          <p className="text-sm font-semibold text-slate-900">Create an account to save your wishlist</p>
                          <p className="text-xs text-slate-600">Your {wishlist.length} saved items will be synced across all devices</p>
                        </div>
                      </div>
                      <Button 
                        size="sm"
                        onClick={() => {
                          setShowAuthModal(true);
                          setAuthMode('register');
                        }}
                        className="bg-gradient-to-r from-amber-600 to-amber-700 hover:from-amber-700 hover:to-amber-800 whitespace-nowrap"
                      >
                        Sign Up Free
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              )}
              
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3 md:gap-4 lg:gap-6">
              {products.filter(p => wishlist.includes(p.id)).map(product => (
                <ProductCard
                  key={product.id}
                  product={product}
                  onProductClick={() => {
                    handleProductSelect(product);
                  }}
                  onAddToCart={(e, v) => {
                    e.stopPropagation();
                    addToCart(product, 1, v?.sku, v?.image, v?.price);
                  }}
                  onToggleWishlist={(e) => {
                    e.stopPropagation();
                    toggleWishlist(product.id);
                  }}
                  isWishlisted={wishlist.includes(product.id)}
                  formatPriceMMK={formatPriceMMK}
                />
              ))}
            </div>
            </>
          )}
          </div>
        </div>
      )}

      {/* View Our Sales Section - Unified elegant off-white background */}
      {viewMode === "home" && dealProducts.length > 0 && (
        <div 
          className="bg-slate-50/60 pt-2 sm:pt-2 md:pt-2 pb-6 sm:pb-8 md:pb-10 lg:pb-12" 
          key={`home-sales-${homeViewType}`}
        >
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            {/* Section Header */}
            <div className="flex items-center justify-between gap-2 mb-6 sm:mb-8">
              <h2 className="text-base md:text-xl font-bold text-slate-900 whitespace-nowrap">
                View Our Sales
              </h2>
              <div className="flex items-center gap-2">
                {/* Grid/List View Switcher */}
                <div className="flex items-center gap-0.5 bg-slate-100 rounded-lg p-0.5">
                  <button
                    type="button"
                    onClick={() => {
                      console.log("[HOME TOGGLE] Switching to grid view, current:", homeViewType);
                      setHomeViewType("grid");
                    }}
                    className={`p-1.5 sm:p-2 rounded transition-colors ${
                      homeViewType === "grid"
                        ? "bg-white text-slate-700 shadow-sm"
                        : "text-slate-500 hover:text-slate-700"
                    }`}
                    title="Grid View"
                  >
                    <Grid className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      console.log("[HOME TOGGLE] Switching to list view, current:", homeViewType);
                      setHomeViewType("list");
                    }}
                    className={`p-1.5 sm:p-2 rounded transition-colors ${
                      homeViewType === "list"
                        ? "bg-white text-slate-700 shadow-sm"
                        : "text-slate-500 hover:text-slate-700"
                    }`}
                    title="List View"
                  >
                    <List className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                  </button>
                </div>
                
                <button
                  type="button"
                  onClick={() => {
                    setSelectedProduct(null);
                    setSelectedCategory("all");
                    setUserAppliedFilters(false);
                    setViewMode("all-products");
                  }}
                  className="text-xs sm:text-sm font-medium text-blue-600 hover:text-blue-700 flex items-center gap-0.5 transition-colors whitespace-nowrap"
                >
                  More Products
                  <ChevronRight className="w-3 h-3 sm:w-3.5 sm:h-3.5" />
                </button>
              </div>
            </div>

            {/* Products Grid/List */}
            {homeViewType === "grid" ? (
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3 md:gap-4 lg:gap-6 stagger-children">
                {dealProducts.map(product => (
                  <ProductCard
                    key={product.id}
                    product={product}
                    onProductClick={() => {
                      handleProductSelect(product);
                    }}
                    onAddToCart={(e, v) => {
                      e.stopPropagation();
                      addToCart(product, 1, v?.sku, v?.image, v?.price);
                    }}
                    onToggleWishlist={(e) => {
                      e.stopPropagation();
                      toggleWishlist(product.id);
                    }}
                    isWishlisted={wishlist.includes(product.id)}
                    formatPriceMMK={formatPriceMMK}
                  />
                ))}
              </div>
            ) : (
              <div className="space-y-3 md:space-y-4 stagger-children">
                {dealProducts.map((product) => (
                  <MarketplaceListProductRow
                    key={product.id}
                    product={product}
                    layout="catalog"
                    formatPriceMMK={formatPriceMMK}
                    onProductClick={() => handleProductSelect(product)}
                    onAddToCart={(e, v) => {
                      e.stopPropagation();
                      addToCart(product, 1, v?.sku, v?.image, v?.price);
                    }}
                    onToggleWishlist={(e) => {
                      e.stopPropagation();
                      toggleWishlist(product.id);
                    }}
                    isWishlisted={wishlist.includes(product.id)}
                  />
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Promotional Campaigns Section - Dynamic from Admin Discount Section */}
      {viewMode === "home" && featuredCampaigns.length > 0 && (
        <div className="bg-slate-50/60 py-10 sm:py-10 md:py-10">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            {/* Main Content Grid */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 lg:gap-12 items-start mb-10">
              {/* Left - Promotional Banner Image */}
              <div className="flex justify-center lg:justify-start">
                <img
                  src={appearanceSettings.image || "figma:asset/49990328fca8f08779d62bef3d47905edb622314.png"}
                  alt="Promotional Campaigns"
                  className="w-full h-auto object-contain rounded-lg"
                />
              </div>

              {/* Right - Content */}
              <div className="space-y-6">
                <div>
                  <h2 className="text-2xl sm:text-3xl lg:text-4xl font-bold text-slate-900 mb-4 leading-tight">
                    {appearanceSettings.title.split('\n').map((line, i) => (
                      <span key={i}>
                        {line}
                        {i < appearanceSettings.title.split('\n').length - 1 && <br />}
                      </span>
                    ))}
                  </h2>
                  <p className="text-slate-600 text-xs sm:text-sm leading-relaxed">
                    {appearanceSettings.description}
                  </p>
                </div>
              </div>
            </div>

            {/* Bottom Campaign Cards - Display Latest 3 Campaigns */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {featuredCampaigns.map((campaign) => {
                // Format discount display
                const discountDisplay = campaign.discountType === 'percentage' 
                  ? `${campaign.discount}% OFF` 
                  : `${campaign.discount} MMK OFF`;
                
                // Format dates
                const endDate = new Date(campaign.endDate);
                const daysLeft = Math.ceil((endDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
                
                return (
                  <div key={campaign.id}>
                    {/* Promo Card */}
                    <div 
                      className="rounded-2xl overflow-hidden shadow-sm hover:shadow-md transition-shadow bg-white border border-slate-200 relative"
                    >
                      {/* Copy Icon - Top Right Corner */}
                      <button
                        onClick={() => {
                          setCouponCode(campaign.code);
                          navigator.clipboard.writeText(campaign.code);
                          toast.success(`Copied code: ${campaign.code}`);
                        }}
                        className="absolute top-4 right-4 p-2 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors z-10"
                        title="Copy code"
                      >
                        <Copy className="w-4 h-4 text-slate-700" />
                      </button>

                      <div className="p-6 space-y-4">
                        {/* Campaign Name */}
                        <h3 className="text-sm sm:text-base font-bold text-slate-900 tracking-wide uppercase">
                          {campaign.name}
                        </h3>
                        
                        {/* Discount Display */}
                        <div className="bg-slate-50 rounded-lg p-4 border-2 border-dashed border-slate-300">
                          <div className="text-center">
                            <p className="text-xl sm:text-2xl font-bold text-orange-600">
                              {discountDisplay}
                            </p>
                            <p className="text-xs text-slate-600 mt-2">
                              Code: <span className="font-mono font-bold text-slate-900 text-xs sm:text-sm">{campaign.code}</span>
                            </p>
                          </div>
                        </div>
                        
                        {/* Countdown */}
                        <div className="text-center">
                          <CountdownTimer endDate={campaign.endDate} />
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* Watches Section */}
      {viewMode === "home" && (() => {
        const watchProducts = products.filter(p => p.category === "Watch" && p.status === "active");
        const watchCategory = allCategories.find(c => c.name === "Watch");
        return watchProducts.length > 0 ? (
          <div className="bg-slate-50/60 pt-6 sm:pt-6 md:pt-6 pb-6 sm:pb-8 md:pb-10 lg:pb-12">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
              {/* Mobile Header - Shows ABOVE banner on mobile only */}
              <div className="flex lg:hidden items-center justify-between gap-4 mb-4">
                <h2 className="text-base md:text-xl font-bold text-slate-900">
                  Watches
                </h2>
                <button
                  type="button"
                  onClick={() => {
                    setSelectedCategory("Watch");
                    setViewMode("all-products");
                  }}
                  className="text-xs sm:text-sm font-semibold text-blue-600 hover:text-blue-700 flex items-center gap-1 transition-colors whitespace-nowrap"
                >
                  View All
                  <ChevronRight className="w-4 h-4 sm:w-5 sm:h-5" />
                </button>
              </div>

              {/* Banner + Products Layout with Integrated Header */}
              <div className="flex flex-col lg:flex-row gap-5 sm:gap-6">
                {/* Category Banner - Left Side */}
                <div 
                  className="w-full lg:w-[300px] xl:w-[340px] h-[240px] sm:h-[300px] lg:h-[350px] rounded-2xl overflow-hidden cursor-pointer group flex-shrink-0 shadow-sm"
                  onClick={() => {
                    setSelectedCategory("Watch");
                    setViewMode("all-products");
                  }}
                >
                  {watchCategory?.coverPhoto ? (
                    <img
                      src={watchCategory.coverPhoto}
                      alt="Watches Collection"
                      className="w-full h-full object-cover scale-90 sm:scale-100 group-hover:scale-105 transition-transform duration-300"
                    />
                  ) : (
                    <div className="w-full h-full bg-gradient-to-br from-slate-100 to-slate-200 flex items-center justify-center">
                      <Watch className="w-20 h-20 sm:w-24 sm:h-24 text-slate-400 group-hover:scale-110 transition-transform duration-300" />
                    </div>
                  )}
                </div>

                {/* Products Section - Right Side with Header */}
                <div className="flex-1 min-w-0">
                  {/* Section Header - Desktop only (hidden on mobile) */}
                  <div className="hidden lg:flex items-center justify-between gap-4 mb-4 sm:mb-5">
                    <h2 className="text-base md:text-xl font-bold text-slate-900">
                      Watches
                    </h2>
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedCategory("Watch");
                        setViewMode("all-products");
                      }}
                      className="text-xs sm:text-sm font-semibold text-blue-600 hover:text-blue-700 flex items-center gap-1 transition-colors whitespace-nowrap"
                    >
                      View All
                      <ChevronRight className="w-4 h-4 sm:w-5 sm:h-5" />
                    </button>
                  </div>

                  {/* Products Grid */}
                  <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 sm:gap-5">
                    {watchProducts.slice(0, 4).map(product => (
                      <ProductCard
                        key={product.id}
                        product={product}
                        onProductClick={() => {
                          handleProductSelect(product);
                        }}
                        onAddToCart={(e, v) => {
                          e.stopPropagation();
                          addToCart(product, 1, v?.sku, v?.image, v?.price);
                        }}
                        onToggleWishlist={(e) => {
                          e.stopPropagation();
                          toggleWishlist(product.id);
                        }}
                        isWishlisted={wishlist.includes(product.id)}
                        formatPriceMMK={formatPriceMMK}
                      />
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        ) : null;
      })()}

      {/* Clothing Section */}
      {viewMode === "home" && (() => {
        // Only show platform categories (exclude vendor categories by checking vendorId)
        const clothingCategory = allCategories.find(c => c.name?.toLowerCase() === "clothing" && !c.vendorId);
        // Show all products in platform Clothing category (match All Products filter behavior)
        const clothingProducts = products.filter(p => 
          p.category?.toLowerCase() === "clothing" && p.status === "active"
        );
        /** Home only has the first catalog page; empty slice ≠ empty store. */
        const catalogIncomplete =
          catalogHasMore || (catalogTotal > 0 && products.length < catalogTotal);
        return (
          <div className="bg-slate-50/60 pt-3 sm:pt-6 md:pt-8 pb-6 sm:pb-8 md:pb-10 lg:pb-12">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
              {/* Mobile Header - Shows ABOVE banner on mobile only */}
              <div className="flex lg:hidden items-center justify-between gap-4 mb-4">
                <h2 className="text-base md:text-xl font-bold text-slate-900">
                  Clothing
                </h2>
                <button
                  type="button"
                  onClick={() => {
                    setSelectedCategory(clothingCategory?.name || "Clothing");
                    setViewMode("all-products");
                  }}
                  className="text-xs sm:text-sm font-semibold text-blue-600 hover:text-blue-700 flex items-center gap-1 transition-colors whitespace-nowrap"
                >
                  View All
                  <ChevronRight className="w-4 h-4 sm:w-5 sm:h-5" />
                </button>
              </div>

              {/* Banner + Products Layout with Integrated Header */}
              <div className="flex flex-col lg:flex-row gap-5 sm:gap-6">
                {/* Category Banner - Left Side */}
                <div 
                  className="w-full lg:w-[300px] xl:w-[340px] h-[240px] sm:h-[300px] lg:h-[350px] rounded-2xl overflow-hidden cursor-pointer group flex-shrink-0 shadow-sm"
                  onClick={() => {
                    setSelectedCategory(clothingCategory?.name || "Clothing");
                    setViewMode("all-products");
                  }}
                >
                  {clothingCategory?.coverPhoto ? (
                    <img
                      src={clothingCategory.coverPhoto}
                      alt="Clothing Collection"
                      className="w-full h-full object-cover scale-90 sm:scale-100 group-hover:scale-105 transition-transform duration-300"
                    />
                  ) : (
                    <div className="w-full h-full bg-slate-200 flex items-center justify-center">
                      <span className="text-slate-400 text-sm">Clothing</span>
                    </div>
                  )}
                </div>

                {/* Products Section - Right Side with Header */}
                <div className="flex-1 min-w-0">
                  {/* Section Header - Desktop only (hidden on mobile) */}
                  <div className="hidden lg:flex items-center justify-between gap-4 mb-4 sm:mb-5">
                    <h2 className="text-base md:text-xl font-bold text-slate-900">
                      Clothing
                    </h2>
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedCategory(clothingCategory?.name || "Clothing");
                        setViewMode("all-products");
                      }}
                      className="text-xs sm:text-sm font-semibold text-blue-600 hover:text-blue-700 flex items-center gap-1 transition-colors whitespace-nowrap"
                    >
                      View All
                      <ChevronRight className="w-4 h-4 sm:w-5 sm:h-5" />
                    </button>
                  </div>

                  {/* Products Grid */}
                  <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 sm:gap-5">
                    {clothingProducts.length > 0 ? (
                      clothingProducts.slice(0, 4).map(product => (
                        <ProductCard
                          key={product.id}
                          product={product}
                          onProductClick={() => {
                            handleProductSelect(product);
                          }}
                          onAddToCart={(e, v) => {
                            e.stopPropagation();
                            addToCart(product, 1, v?.sku, v?.image, v?.price);
                          }}
                          onToggleWishlist={(e) => {
                            e.stopPropagation();
                            toggleWishlist(product.id);
                          }}
                          isWishlisted={wishlist.includes(product.id)}
                          formatPriceMMK={formatPriceMMK}
                        />
                      ))
                    ) : catalogIncomplete ? (
                      <div className="col-span-2 md:col-span-3 lg:col-span-4 flex flex-col items-center justify-center gap-3 py-8 text-center text-slate-600">
                        <p className="text-sm max-w-md">
                          Highlights show a sample of the catalog. Open the category to see every item.
                        </p>
                        <Button
                          type="button"
                          variant="outline"
                          className="border-amber-600 text-amber-800 hover:bg-amber-50"
                          onClick={() => {
                            setSelectedCategory(clothingCategory?.name || "Clothing");
                            setViewMode("all-products");
                          }}
                        >
                          View all in Clothing
                          <ChevronRight className="w-4 h-4 ml-1" />
                        </Button>
                      </div>
                    ) : (
                      <div className="col-span-2 md:col-span-3 lg:col-span-4 text-center py-8 text-slate-500">
                        No products available yet
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Cosmetics Section */}
      {viewMode === "home" && (() => {
        const cosmeticCategory = allCategories.find(c => c.name?.toLowerCase() === "cosmetic" && !c.vendorId);
        const cosmeticProducts = products.filter(p => 
          p.category?.toLowerCase() === "cosmetic" && p.status === "active"
        );
        return cosmeticProducts.length > 0 ? (
          <div className="bg-slate-50/60 pt-3 sm:pt-6 md:pt-8 pb-6 sm:pb-8 md:pb-10 lg:pb-12">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
              {/* Mobile Header - Shows ABOVE banner on mobile only */}
              <div className="flex lg:hidden items-center justify-between gap-4 mb-4">
                <h2 className="text-base md:text-xl font-bold text-slate-900">
                  Cosmetics
                </h2>
                <button
                  type="button"
                  onClick={() => {
                    setSelectedCategory(cosmeticCategory?.name || "Cosmetic");
                    setViewMode("all-products");
                  }}
                  className="text-xs sm:text-sm font-semibold text-blue-600 hover:text-blue-700 flex items-center gap-1 transition-colors whitespace-nowrap"
                >
                  View All
                  <ChevronRight className="w-4 h-4 sm:w-5 sm:h-5" />
                </button>
              </div>

              {/* Banner + Products Layout with Integrated Header */}
              <div className="flex flex-col lg:flex-row gap-5 sm:gap-6">
                {/* Category Banner - Left Side */}
                <div 
                  className="w-full lg:w-[300px] xl:w-[340px] h-[240px] sm:h-[300px] lg:h-[350px] rounded-2xl overflow-hidden cursor-pointer group flex-shrink-0 shadow-sm"
                  onClick={() => {
                    setSelectedCategory(cosmeticCategory?.name || "Cosmetic");
                    setViewMode("all-products");
                  }}
                >
                  {cosmeticCategory?.coverPhoto ? (
                    <img
                      src={cosmeticCategory.coverPhoto}
                      alt="Cosmetics Collection"
                      className="w-full h-full object-cover scale-90 sm:scale-100 group-hover:scale-105 transition-transform duration-300"
                    />
                  ) : (
                    <div className="w-full h-full bg-gradient-to-br from-pink-100 to-purple-200 flex items-center justify-center">
                      <Sparkles className="w-20 h-20 sm:w-24 sm:h-24 text-pink-600 group-hover:scale-110 transition-transform duration-300" />
                    </div>
                  )}
                </div>

                {/* Products Section - Right Side with Header */}
                <div className="flex-1 min-w-0">
                  {/* Section Header - Desktop only (hidden on mobile) */}
                  <div className="hidden lg:flex items-center justify-between gap-4 mb-4 sm:mb-5">
                    <h2 className="text-base md:text-xl font-bold text-slate-900">
                      Cosmetics
                    </h2>
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedCategory(cosmeticCategory?.name || "Cosmetic");
                        setViewMode("all-products");
                      }}
                      className="text-xs sm:text-sm font-semibold text-blue-600 hover:text-blue-700 flex items-center gap-1 transition-colors whitespace-nowrap"
                    >
                      View All
                      <ChevronRight className="w-4 h-4 sm:w-5 sm:h-5" />
                    </button>
                  </div>

                  {/* Products Grid */}
                  <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 sm:gap-5">
                    {cosmeticProducts.slice(0, 4).map(product => (
                      <ProductCard
                        key={product.id}
                        product={product}
                        onProductClick={() => {
                          handleProductSelect(product);
                        }}
                        onAddToCart={(e, v) => {
                          e.stopPropagation();
                          addToCart(product, 1, v?.sku, v?.image, v?.price);
                        }}
                        onToggleWishlist={(e) => {
                          e.stopPropagation();
                          toggleWishlist(product.id);
                        }}
                        isWishlisted={wishlist.includes(product.id)}
                        formatPriceMMK={formatPriceMMK}
                      />
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        ) : null;
      })()}

      {/* Kitchen Section */}
      {viewMode === "home" && (() => {
        const kitchenCategory = allCategories.find(c => c.name?.toLowerCase() === "kitchen" && !c.vendorId);
        const kitchenProducts = products.filter(p => 
          p.category?.toLowerCase() === "kitchen" && p.status === "active"
        );
        return kitchenProducts.length > 0 ? (
          <div className="bg-white pt-3 sm:pt-6 md:pt-8 pb-6 sm:pb-8 md:pb-10 lg:pb-12">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
              {/* Mobile Header - Shows ABOVE banner on mobile only */}
              <div className="flex lg:hidden items-center justify-between gap-4 mb-4">
                <h2 className="text-base md:text-xl font-bold text-slate-900">
                  Kitchen
                </h2>
                <button
                  type="button"
                  onClick={() => {
                    setSelectedCategory(kitchenCategory?.name || "Kitchen");
                    setViewMode("all-products");
                  }}
                  className="text-xs sm:text-sm font-semibold text-blue-600 hover:text-blue-700 flex items-center gap-1 transition-colors whitespace-nowrap"
                >
                  View All
                  <ChevronRight className="w-4 h-4 sm:w-5 sm:h-5" />
                </button>
              </div>

              {/* Banner + Products Layout with Integrated Header */}
              <div className="flex flex-col lg:flex-row gap-5 sm:gap-6">
                {/* Category Banner - Left Side */}
                <div 
                  className="w-full lg:w-[300px] xl:w-[340px] h-[240px] sm:h-[300px] lg:h-[350px] rounded-2xl overflow-hidden cursor-pointer group flex-shrink-0 shadow-sm"
                  onClick={() => {
                    setSelectedCategory(kitchenCategory?.name || "Kitchen");
                    setViewMode("all-products");
                  }}
                >
                  {kitchenCategory?.coverPhoto ? (
                    <img
                      src={kitchenCategory.coverPhoto}
                      alt="Kitchen Collection"
                      className="w-full h-full object-cover scale-90 sm:scale-100 group-hover:scale-105 transition-transform duration-300"
                    />
                  ) : (
                    <div className="w-full h-full bg-gradient-to-br from-orange-100 to-red-200 flex items-center justify-center">
                      <Utensils className="w-20 h-20 sm:w-24 sm:h-24 text-orange-600 group-hover:scale-110 transition-transform duration-300" />
                    </div>
                  )}
                </div>

                {/* Products Section - Right Side with Header */}
                <div className="flex-1 min-w-0">
                  {/* Section Header - Desktop only (hidden on mobile) */}
                  <div className="hidden lg:flex items-center justify-between gap-4 mb-4 sm:mb-5">
                    <h2 className="text-base md:text-xl font-bold text-slate-900">
                      Kitchen
                    </h2>
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedCategory(kitchenCategory?.name || "Kitchen");
                        setViewMode("all-products");
                      }}
                      className="text-xs sm:text-sm font-semibold text-blue-600 hover:text-blue-700 flex items-center gap-1 transition-colors whitespace-nowrap"
                    >
                      View All
                      <ChevronRight className="w-4 h-4 sm:w-5 sm:h-5" />
                    </button>
                  </div>

                  {/* Products Grid */}
                  <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 sm:gap-5">
                    {kitchenProducts.slice(0, 4).map(product => (
                      <ProductCard
                        key={product.id}
                        product={product}
                        onProductClick={() => {
                          handleProductSelect(product);
                        }}
                        onAddToCart={(e, v) => {
                          e.stopPropagation();
                          addToCart(product, 1, v?.sku, v?.image, v?.price);
                        }}
                        onToggleWishlist={(e) => {
                          e.stopPropagation();
                          toggleWishlist(product.id);
                        }}
                        isWishlisted={wishlist.includes(product.id)}
                        formatPriceMMK={formatPriceMMK}
                      />
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        ) : null;
      })()}

      {/* Main Products - ONLY show on all-products view */}
      {viewMode === "all-products" && (
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 sm:py-6 md:py-4">
        
        {/* Filters and Sort Bar - Only show on all-products page */}
        {viewMode === "all-products" && (
        <div className="bg-white rounded-2xl shadow-sm p-3 sm:p-4 md:p-6 mb-5 sm:mb-6 md:mb-8 flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowFilters(!showFilters)}
              className="rounded-full border-2 hover:bg-slate-50"
            >
              <SlidersHorizontal className="w-4 h-4 mr-2" />
              Filters
            </Button>
            <Separator orientation="vertical" className="h-6" />
            <div className="flex items-center gap-2">
              <Button
                variant={viewType === "grid" ? "default" : "outline"}
                size="sm"
                onClick={() => setViewType("grid")}
                className={`rounded-full ${viewType === "grid" ? "bg-gradient-to-r from-amber-600 to-amber-700" : ""}`}
              >
                <Grid className="w-4 h-4" />
              </Button>
              <Button
                variant={viewType === "list" ? "default" : "outline"}
                size="sm"
                onClick={() => setViewType("list")}
                className={`rounded-full ${viewType === "list" ? "bg-gradient-to-r from-amber-600 to-amber-700" : ""}`}
              >
                <List className="w-4 h-4" />
              </Button>
            </div>
          </div>
          
          <div className="flex items-center gap-4">
            <span className="text-sm font-medium text-slate-600">{catalogTotal || sortedProducts.length} products</span>
            <Select value={sortBy} onValueChange={setSortBy}>
              <SelectTrigger className="w-48 rounded-full border-2">
                <SelectValue placeholder="Sort by" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="featured">Featured</SelectItem>
                <SelectItem value="popular">Most Popular</SelectItem>
                <SelectItem value="newest">Newest First</SelectItem>
                <SelectItem value="price-low">Price: Low to High</SelectItem>
                <SelectItem value="price-high">Price: High to Low</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        )}

        {/* Products Grid */}
        <div className="flex gap-8">
          {/* Sidebar Filters - Only show on all-products page */}
          {viewMode === "all-products" && showFilters && (
            <Card className="w-72 h-fit sticky top-24 hidden md:block shadow-md border-0">
              <CardHeader className="bg-gradient-to-r from-slate-800 to-slate-700 text-white rounded-t-lg">
                <CardTitle className="text-lg font-serif">Refine Selection</CardTitle>
              </CardHeader>
              <CardContent className="space-y-6 pt-6">
                <div>
                  <h4 className="font-medium mb-3 text-sm text-slate-900">Categories</h4>
                  <div className="space-y-2">
                    {categories.map(cat => (
                      <button
                        key={cat}
                        onClick={() => {
                          setSelectedProduct(null);
                          setSelectedCategory(cat);
                        }}
                        className={`w-full text-left px-4 py-2.5 rounded-lg text-sm transition-all ${
                          selectedCategory === cat ? "bg-gradient-to-r from-amber-600 to-amber-700 text-white font-medium shadow-sm" : "hover:bg-slate-50 text-slate-700"
                        }`}
                      >
                        {cat}
                      </button>
                    ))}
                  </div>
                </div>
                <Separator />
                <div>
                  <h4 className="font-medium mb-3 text-sm text-slate-900">Price Range</h4>
                  <div className="space-y-2">
                    {[
                      { label: "Under $50", value: [0, 50] },
                      { label: "$50 - $100", value: [50, 100] },
                      { label: "$100 - $500", value: [100, 500] },
                      { label: "Over $500", value: [500, 10000] }
                    ].map((range, i) => (
                      <button 
                        key={i} 
                        onClick={() => {
                          setPriceRange(range.value as [number, number]);
                          setUserAppliedFilters(true);
                        }}
                        className="w-full text-left px-4 py-2.5 rounded-lg text-sm hover:bg-slate-50 transition-colors text-slate-700"
                      >
                        {range.label}
                      </button>
                    ))}
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Products */}
          <div className="flex-1">
            {/* 🚀 FIXED: Removed skeleton loaders when serverStatus === 'checking' because ServerStatusBanner already shows full-screen loading */}
            {sortedProducts.length === 0 ? (
              <Card className="text-center py-20 border-0 shadow-md">
                <Package className="w-16 h-16 mx-auto text-slate-300 mb-4" />
                <p className="text-lg text-slate-500 mb-2">No products found</p>
                <p className="text-sm text-slate-400 mb-6">Try adjusting your search or filters</p>
                <Button onClick={() => {
                  setActiveSearchQuery("");
                  setSelectedCategory("all");
                }} className="bg-gradient-to-r from-amber-600 to-amber-700 hover:from-amber-700 hover:to-amber-800">
                  Clear All Filters
                </Button>
              </Card>
            ) : (
              <>
              <div className={viewType === "grid" 
                ? "grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3 md:gap-4 lg:gap-6 stagger-children" 
                : "space-y-4"
              }>
                {sortedProducts.map(product => (
                  viewType === "grid" ? (
                    <ProductCard
                      key={product.id}
                      product={product}
                      onProductClick={() => {
                        handleProductSelect(product);
                      }}
                      onAddToCart={(e, v) => {
                        e.stopPropagation();
                        addToCart(product, 1, v?.sku, v?.image, v?.price);
                      }}
                      onToggleWishlist={(e) => {
                        e.stopPropagation();
                        toggleWishlist(product.id);
                      }}
                      isWishlisted={wishlist.includes(product.id)}
                      formatPriceMMK={formatPriceMMK}
                    />
                  ) : (
                    <MarketplaceListProductRow
                      key={product.id}
                      product={product}
                      layout="catalog"
                      formatPriceMMK={formatPriceMMK}
                      onProductClick={() => handleProductSelect(product)}
                      onAddToCart={(e, v) => {
                        e.stopPropagation();
                        addToCart(product, 1, v?.sku, v?.image, v?.price);
                      }}
                      onToggleWishlist={(e) => {
                        e.stopPropagation();
                        toggleWishlist(product.id);
                      }}
                      isWishlisted={wishlist.includes(product.id)}
                    />
                  )
                ))}
              </div>
              {catalogHasMore && (
                <div className="flex justify-center mt-8 md:mt-10">
                  <Button
                    type="button"
                    variant="outline"
                    className="min-w-[140px]"
                    onClick={() => loadMoreCatalog()}
                    disabled={catalogLoadingMore}
                  >
                    {catalogLoadingMore ? (
                      <>
                        <Loader2 className="w-4 h-4 mr-2 animate-spin inline" />
                        Loading…
                      </>
                    ) : (
                      "Load more"
                    )}
                  </Button>
                </div>
              )}
              </>
            )}
          </div>
        </div>
      </div>
      )}

      </ContentAnimationWrapper>

      <Footer />
      {/* Back to Top - Now handled globally in RootLayout */}
      {/* Floating Chat - Now handled globally in RootLayout */}
      
      {/* Auth Modal */}
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
      
      {/* Lightbox Modal for Description Images */}
      {lightboxImage && (
        <div 
          className="fixed inset-0 z-[100] bg-black/90 flex items-center justify-center p-4"
          onClick={() => setLightboxImage(null)}
        >
          <div className="relative max-w-7xl max-h-[90vh] w-full h-full flex items-center justify-center">
            {/* Close Button */}
            <Button
              variant="ghost"
              size="icon"
              className="absolute top-4 right-4 z-10 bg-white/10 hover:bg-white/20 text-white rounded-full w-10 h-10"
              onClick={(e) => {
                e.stopPropagation();
                setLightboxImage(null);
              }}
            >
              <X className="w-6 h-6" />
            </Button>

            {/* Previous Button */}
            {lightboxImages.length > 1 && lightboxIndex > 0 && (
              <Button
                variant="ghost"
                size="icon"
                className="absolute left-4 top-1/2 -translate-y-1/2 z-10 bg-white/10 hover:bg-white/20 text-white rounded-full w-12 h-12"
                onClick={(e) => {
                  e.stopPropagation();
                  const newIndex = lightboxIndex - 1;
                  setLightboxIndex(newIndex);
                  setLightboxImage(lightboxImages[newIndex]);
                }}
              >
                <ChevronLeft className="w-6 h-6" />
              </Button>
            )}

            {/* Next Button */}
            {lightboxImages.length > 1 && lightboxIndex < lightboxImages.length - 1 && (
              <Button
                variant="ghost"
                size="icon"
                className="absolute right-4 top-1/2 -translate-y-1/2 z-10 bg-white/10 hover:bg-white/20 text-white rounded-full w-12 h-12"
                onClick={(e) => {
                  e.stopPropagation();
                  const newIndex = lightboxIndex + 1;
                  setLightboxIndex(newIndex);
                  setLightboxImage(lightboxImages[newIndex]);
                }}
              >
                <ChevronRight className="w-6 h-6" />
              </Button>
            )}

            {/* Image */}
            <img
              src={lightboxImage}
              alt="Product detail"
              className="max-w-full max-h-full object-contain"
              onClick={(e) => e.stopPropagation()}
            />

            {/* Image Counter */}
            {lightboxImages.length > 1 && (
              <div className="absolute bottom-4 left-1/2 -translate-x-1/2 bg-black/50 text-white px-4 py-2 rounded-full text-sm font-medium">
                {lightboxIndex + 1} / {lightboxImages.length}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Cache Debug Panel - Toggle with Ctrl+Shift+D */}
      {showCacheDebug && <CacheDebugPanel onClose={() => setShowCacheDebug(false)} />}
      
    </div>
  );
}
