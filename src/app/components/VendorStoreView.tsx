// Minimalist Vendor Storefront - MVP Design
import { moduleCache, CACHE_KEYS, fetchVendorProducts, fetchVendorCategories } from "../utils/module-cache";
import { ProductCard, type ProductCardProduct } from "./ProductCard";
import { CacheFriendlyImg } from "./CacheFriendlyImg";
import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { useNavigate, useLocation, matchPath } from "react-router";
import { 
  ShoppingCart, 
  Heart, 
  Search,
  Star,
  Settings,
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
  Phone,
  EyeOff,
  Loader2,
} from "lucide-react";
import { Button } from "./ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card";
import { Label } from "./ui/label";
import { Separator } from "./ui/separator";
import { Badge } from "./ui/badge";
import { Input } from "./ui/input";
import { Checkbox } from "./ui/checkbox";
import { Popover, PopoverContent, PopoverTrigger } from "./ui/popover";
import { projectId, publicAnonKey } from "../../../utils/supabase/info";
import { useFaviconLoader } from "../hooks/useFaviconLoader";
import { useCart } from "./CartContext";
import { CartDrawer } from "./CartDrawer";
import { Checkout } from "./Checkout";
import { ServerStatusBanner } from "./ServerStatusBanner";
import { ProductGridSkeleton, ProductDetailSkeleton } from "./SkeletonLoaders";
import { AuthModal } from "./AuthModal";
import { authApi, wishlistApi } from "../../utils/api";
import { toast } from "sonner";
import { getEffectiveVariantOptions } from "./ProductVariantChips";

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
  onBack?: () => void;
  initialProductSlug?: string;
  /** From URL `/store/:slug/profile/...` — drives account view mode */
  profileSegment?: string | null;
  /** `/store/:slug/saved` — saved products (wishlist) for this storefront */
  savedPage?: boolean;
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

/**
 * Path segment for `/store/:store/product/:slug`.
 * NOTE: Use `\w` and `\s` (single backslash) in regex literals — `\\w` breaks slugify and yields empty URLs like `/product/`.
 */
function buildVendorProductUrlSegment(product: { name?: string; sku?: string; id: string }): string {
  const name = (product.name || "").trim();
  const fromName = name
    .toLowerCase()
    .replace(/[^\w\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .trim();
  const sku = (product.sku || "").trim();
  if (fromName.length > 0) return fromName;
  if (sku.length > 0) return sku;
  return product.id;
}

function safeDecodePathSegment(slug: string): string {
  try {
    return decodeURIComponent(slug);
  } catch {
    return slug;
  }
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
  const merged: any = {
    ...localUser,
    ...serverUser,
    id: localUser?.id ?? serverUser.id,
    email: serverUser.email ?? localUser?.email,
  };
  const srv = serverUser?.profileImageUrl;
  const hasServerProfileImageUrl = typeof srv === "string" && srv.trim().length > 0;
  if (!hasServerProfileImageUrl) {
    delete merged.profileImageUrl;
  }
  return merged;
}

function resolveVendorProductFromSlug(products: Product[], decoded: string): Product | undefined {
  const direct =
    products.find((p) => buildVendorProductUrlSegment(p) === decoded) ||
    products.find((p) => p.sku === decoded) ||
    products.find((p) => p.id === decoded);
  if (direct) return direct;
  return products.find(
    (p) =>
      p.hasVariants &&
      Array.isArray(p.variants) &&
      p.variants.some((v: any) => v?.sku === decoded)
  );
}

export function VendorStoreView({
  vendorId,
  storeSlug,
  onBack,
  initialProductSlug,
  profileSegment = null,
  savedPage = false,
}: VendorStoreViewProps) {
  const navigate = useNavigate();
  const location = useLocation();

  const storeBase = useMemo(() => {
    const slug = encodeURIComponent(storeSlug || vendorId);
    return location.pathname.startsWith("/vendor/") ? `/vendor/${slug}` : `/store/${slug}`;
  }, [location.pathname, storeSlug, vendorId]);

  /** Prefer pathname over useParams so async product load cannot reopen detail after user navigated away. */
  const productSlugFromPath = useMemo(() => {
    const m =
      matchPath({ path: "/store/:storeName/product/:productSlug", end: true }, location.pathname) ??
      matchPath({ path: "/vendor/:storeName/product/:productSlug", end: true }, location.pathname);
    return typeof m?.params?.productSlug === "string" ? m.params.productSlug : undefined;
  }, [location.pathname]);

  const goToProfileMode = useCallback(
    (mode: VendorAccountViewMode) => {
      if (mode === "storefront") {
        navigate(storeBase);
        return;
      }
      const pathMap: Record<Exclude<VendorAccountViewMode, "storefront">, string> = {
        "view-profile": `${storeBase}/profile`,
        "edit-profile": `${storeBase}/profile/edit`,
        "order-history": `${storeBase}/profile/orders`,
        "shipping-addresses": `${storeBase}/profile/addresses`,
        "security-settings": `${storeBase}/profile/security`,
      };
      navigate(pathMap[mode]);
    },
    [navigate, storeBase]
  );

  const { startLoading: startFaviconLoading, stopLoading: stopFaviconLoading } = useFaviconLoader();
  
  // Cleanup favicon loader on unmount
  useEffect(() => {
    return () => {
      stopFaviconLoading();
    };
  }, [stopFaviconLoading]);
  
  // If we have an initialProductSlug, we're navigating from product grid, so skip loading overlay
  const [serverStatus, setServerStatus] = useState<'checking' | 'healthy' | 'unhealthy'>('checking');
  const [products, setProducts] = useState<Product[]>([]);
  const [vendorCategories, setVendorCategories] = useState<any[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("all");
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);

  const vendorEffectiveVariantOptions = useMemo(
    () => (selectedProduct ? getEffectiveVariantOptions(selectedProduct as any) : []),
    [selectedProduct]
  );

  useEffect(() => {
    if (savedPage) {
      setSelectedProduct(null);
    }
  }, [savedPage]);

  const [cartOpen, setCartOpen] = useState(false);
  const [showCheckout, setShowCheckout] = useState(false);
  const [storeName, setStoreName] = useState("Vendor Store");
  const [storeLogo, setStoreLogo] = useState<string>("");
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [quantity, setQuantity] = useState(1);
  /** Option name → value; mirrors main marketplace variant picker */
  const [vendorVariantSelections, setVendorVariantSelections] = useState<Record<string, string>>({});
  const [vendorProductImageIndex, setVendorProductImageIndex] = useState(0);
  const [debugInfo, setDebugInfo] = useState<any>(null);

  const { addToCart, totalItems, clearCart } = useCart();

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
      toast.error("Please sign in to view your wishlist");
      setShowAuthModal(true);
      setAuthMode("login");
      return;
    }
    navigate(`${storeBase}/saved`);
  }, [user, navigate, storeBase]);

  /** Pass 'register' from handleRegister before setUser; cleared after track. */
  const lastAuthEventRef = useRef<"login" | "register" | null>(null);
  const audienceTrackedKeyRef = useRef<string>("");

  const trackVendorAudience = useCallback(
    async (userData: any, event: "login" | "register") => {
      if (!vendorId || !userData?.email) return;
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
        await fetch(
          `https://${projectId}.supabase.co/functions/v1/make-server-16010b6f/vendor/audience/${vendorId}/track`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${publicAnonKey}`,
            },
            body: JSON.stringify({
              email: userData.email,
              userId: userData.id,
              name: userData.name || userData.fullName,
              phone: userData.phone,
              avatar,
              event,
            }),
          }
        );
      } catch (e) {
        console.warn("[VendorStore] audience track failed:", e);
      }
    },
    [vendorId]
  );

  // Register this global account with this vendor when the user session is available (login/register or return visit).
  useEffect(() => {
    if (!user?.email || !vendorId) return;
    const key = `${vendorId}::${user.email}`;
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
        setUser(JSON.parse(storedUser));
      } catch (error) {
        console.error('Error parsing stored user:', error);
        localStorage.removeItem('migoo-user');
      }
    }
  }, []);

  useEffect(() => {
    if (!user) return;
    setProfileForm({
      name: user.name || "",
      email: user.email || "",
      phone: user.phone || "",
      profileImage: null,
    });
  }, [user]);

  const refreshVendorProfileFromServer = useCallback(async () => {
    const storedUser = localStorage.getItem("migoo-user");
    if (!storedUser) return;
    let parsedUser: any;
    try {
      parsedUser = JSON.parse(storedUser);
    } catch {
      return;
    }
    if (!parsedUser?.id) return;
    try {
      const response: any = await authApi.getProfile(parsedUser.id);
      const freshProfile = response?.user || response;
      if (!freshProfile || typeof freshProfile !== "object" || Array.isArray(freshProfile)) {
        return;
      }
      if (!freshProfile.id && !freshProfile.email) {
        return;
      }
      const updatedUser = applyServerProfileMerge(parsedUser, freshProfile);
      setUser(updatedUser);
      localStorage.setItem("migoo-user", JSON.stringify(updatedUser));
    } catch {
      /* keep local session if profile refresh fails */
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
    }, 200);
  }, [refreshVendorProfileFromServer]);

  useEffect(() => {
    scheduleVendorProfileRefresh();
    return () => {
      if (profileRefreshTimerRef.current) {
        clearTimeout(profileRefreshTimerRef.current);
      }
    };
  }, [scheduleVendorProfileRefresh]);

  useEffect(() => {
    const onVis = () => {
      if (document.visibilityState === "visible") {
        scheduleVendorProfileRefresh();
      }
    };
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, [scheduleVendorProfileRefresh]);

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
        toast.error("Failed to load addresses");
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
      return;
    }
    const needsOrders =
      vendorViewMode === "order-history" ||
      vendorViewMode === "view-profile" ||
      profileSegment === "view" ||
      profileSegment === "orders";
    if (!needsOrders) return;

    const loadOrderHistory = async () => {
      setOrdersLoading(true);
      setOrdersError(null);
      try {
        const response = await fetch(
          `https://${projectId}.supabase.co/functions/v1/make-server-16010b6f/user/${uid}/orders`,
          {
            headers: {
              Authorization: `Bearer ${publicAnonKey}`,
            },
          }
        );
        if (!response.ok) {
          const t = await response.text();
          throw new Error(t || "Failed to fetch orders");
        }
        const data = await response.json();
        setOrderHistory(Array.isArray(data.orders) ? data.orders : []);
      } catch (error) {
        console.error("Failed to load vendor storefront order history:", error);
        setOrderHistory([]);
        const msg = error instanceof Error ? error.message : "Failed to load orders";
        setOrdersError(msg);
        if (vendorViewMode === "order-history") {
          toast.error("Could not load order history");
        }
      } finally {
        setOrdersLoading(false);
      }
    };
    void loadOrderHistory();
  }, [vendorViewMode, profileSegment, user?.id]);

  // 🔐 Authentication Handlers
  const handleLogin = async () => {
    if (!authForm.email || !authForm.password) {
      toast.error("Please enter email and password");
      return;
    }

    setIsAuthLoading(true);
    try {
      const response = await authApi.login(authForm.email, authForm.password);
      const userData = response.user;

      lastAuthEventRef.current = "login";
      setUser(userData);
      localStorage.setItem('migoo-user', JSON.stringify(userData));
      
      toast.success(`Welcome back, ${userData.name || userData.email}!`);
      setShowAuthModal(false);
      setAuthForm({ email: '', password: '', name: '', phone: '' });
    } catch (error) {
      console.error("Login failed:", error);
      toast.error(error instanceof Error ? error.message : "Login failed");
    } finally {
      setIsAuthLoading(false);
    }
  };

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

      lastAuthEventRef.current = "register";
      setUser(userData);
      localStorage.setItem('migoo-user', JSON.stringify(userData));
      
      toast.success(`Welcome to ${storeName}, ${userData.name}!`);
      setShowAuthModal(false);
      setAuthForm({ email: '', password: '', name: '', phone: '' });
    } catch (error) {
      console.error("Registration failed:", error);
      toast.error(error instanceof Error ? error.message : "Registration failed");
    } finally {
      setIsAuthLoading(false);
    }
  };

  const handleLogout = () => {
    audienceTrackedKeyRef.current = "";
    setUser(null);
    localStorage.removeItem('migoo-user');
    navigate(storeBase);
    toast.success("You have been logged out");
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

  const handleSaveProfile = async () => {
    const uid = resolveUserIdFromRecord(user);
    if (!uid) {
      toast.error("Please log in to update your profile");
      return;
    }

    setIsProfileSaving(true);
    try {
      const payload: Record<string, unknown> = {
        name: profileForm.name,
        phone: profileForm.phone,
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
        setUser(data.user);
        localStorage.setItem("migoo-user", JSON.stringify(data.user));
        toast.success("Profile updated successfully!");
        goToProfileMode("view-profile");
      } else {
        throw new Error(data.error || "Failed to update profile");
      }
    } catch (error) {
      console.error("Error updating profile:", error);
      toast.error(error instanceof Error ? error.message : "Failed to update profile. Please try again.");
    } finally {
      setIsProfileSaving(false);
    }
  };

  const handleChangePassword = async () => {
    if (!user?.email) {
      toast.error("User email not found. Please log in again.");
      return;
    }
    if (!passwordForm.currentPassword || !passwordForm.newPassword || !passwordForm.confirmPassword) {
      toast.error("Please fill in all fields");
      return;
    }
    if (passwordForm.newPassword !== passwordForm.confirmPassword) {
      toast.error("New passwords do not match");
      return;
    }
    if (passwordForm.newPassword.length < 6) {
      toast.error("Password must be at least 6 characters long");
      return;
    }

    setIsChangingPassword(true);
    try {
      await authApi.changePassword(user.email, passwordForm.currentPassword, passwordForm.newPassword);
      toast.success("Password changed successfully! Please use your new password next time you log in.");
      setPasswordForm({
        currentPassword: "",
        newPassword: "",
        confirmPassword: "",
      });
      setShowPasswordFields({ current: false, new: false, confirm: false });
    } catch (error) {
      console.error("Failed to change password:", error);
      toast.error(error instanceof Error ? error.message : "Failed to change password");
    } finally {
      setIsChangingPassword(false);
    }
  };

  const handleProfileAction = (mode: VendorAccountViewMode) => {
    setSelectedProduct(null);
    setMobileMenuOpen(false);
    goToProfileMode(mode);
  };

  const renderVendorAccountPage = () => {
    if (!user || vendorViewMode === "storefront") return null;

    const orderCount = orderHistory.length;
    const getOrderStatusColor = (status: string) => {
      switch (status?.toLowerCase()) {
        case "delivered":
        case "fulfilled":
          return "bg-emerald-600";
        case "processing":
          return "bg-blue-600";
        case "shipped":
          return "bg-amber-600";
        case "ready-to-ship":
          return "bg-blue-600";
        case "cancelled":
          return "bg-red-600";
        default:
          return "bg-slate-600";
      }
    };
    const getOrderStatusLabel = (status: string) => {
      if (status?.toLowerCase() === "ready-to-ship") return "Shipping";
      return status || "Pending";
    };

    if (vendorViewMode === "view-profile") {
      return (
        <div className="max-w-4xl mx-auto">
          <Button
            variant="ghost"
            onClick={() => goToProfileMode("storefront")}
            className="mb-6 hover:bg-slate-100"
          >
            <ChevronLeft className="w-4 h-4 mr-2" />
            Back to Home
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
                <div className="flex-1 text-center md:text-left">
                  <h1 className="text-base sm:text-lg font-bold text-slate-900 mb-2">
                    {user?.name || "Guest User"}
                  </h1>
                  <p className="text-slate-600 mb-4">{user?.email || "No email provided"}</p>
                  <Button onClick={() => goToProfileMode("edit-profile")} className="bg-amber-600 hover:bg-amber-700">
                    <Settings className="w-4 h-4 mr-2" />
                    Edit Profile
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>

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
                  {ordersLoading ? (
                    <div className="w-6 h-6 border-2 border-amber-600 border-t-transparent rounded-full animate-spin" />
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
                  <span className="text-lg font-bold text-emerald-700">{totalItems}</span>
                </div>
              </CardContent>
            </Card>
          </div>

          <Card className="mt-6">
            <CardHeader>
              <CardTitle className="text-lg">Quick Actions</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <Button variant="outline" className="justify-start" onClick={() => goToProfileMode("order-history")}>
                  <Package className="w-4 h-4 mr-2" />
                  View Orders
                </Button>
                <Button variant="outline" className="justify-start" onClick={() => navigate(`${storeBase}/saved`)}>
                  <Heart className="w-4 h-4 mr-2" />
                  My Wishlist
                </Button>
                <Button variant="outline" className="justify-start" onClick={() => goToProfileMode("shipping-addresses")}>
                  <MapPin className="w-4 h-4 mr-2" />
                  Addresses
                </Button>
                <Button variant="outline" className="justify-start" onClick={() => goToProfileMode("security-settings")}>
                  <Shield className="w-4 h-4 mr-2" />
                  Security
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
            Back to Profile
          </Button>

          <Card>
            <CardHeader>
              <CardTitle className="text-base sm:text-lg">Edit Profile</CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="flex flex-col sm:flex-row sm:items-start gap-4 sm:gap-6 min-w-0">
                {profileForm.profileImage ? (
                  <CacheFriendlyImg
                    src={profileForm.profileImage}
                    alt="Profile preview"
                    className="w-[100px] h-[100px] rounded-lg object-cover flex-shrink-0"
                  />
                ) : userProfileImageUrl && !profileImageLoadFailed ? (
                  <CacheFriendlyImg
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
                <div className="flex-1 min-w-0 w-full sm:w-auto">
                  <p className="text-sm font-medium text-slate-900 mb-3">Profile Picture</p>
                  <div className="flex flex-col gap-2 max-w-full">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="w-full sm:w-auto shrink-0 bg-amber-50 border-amber-200 text-amber-700 hover:bg-amber-100"
                      onClick={() => {
                        const input = document.createElement("input");
                        input.type = "file";
                        input.accept = "image/jpeg,image/png,image/webp,image/jpg,image/gif";
                        input.onchange = async (e: Event) => {
                          const target = e.target as HTMLInputElement;
                          const file = target.files?.[0];
                          if (!file) return;

                          toast.loading("Compressing image...", { id: "compress" });

                          try {
                            const compressImage = (file: File, maxSizeKB: number = 400): Promise<string> => {
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
                                reader.readAsDataURL(file);
                              });
                            };

                            const compressedDataUrl = await compressImage(file, 400);
                            setProfileForm((prev) => ({ ...prev, profileImage: compressedDataUrl }));

                            toast.dismiss("compress");
                          } catch (error) {
                            console.error("Image compression error:", error);
                            toast.error("Failed to process image. Please try another file.", { id: "compress" });
                          }
                        };
                        input.click();
                      }}
                    >
                      Upload Photo
                    </Button>
                    {(profileForm.profileImage || userProfileImageUrl) && (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="w-full sm:w-auto shrink-0"
                        onClick={() => setProfileForm((prev) => ({ ...prev, profileImage: null }))}
                      >
                        Remove
                      </Button>
                    )}
                  </div>
                </div>
              </div>

              <Separator />

              <div className="space-y-2">
                <Label htmlFor="vendor-edit-name">Full Name</Label>
                <Input
                  id="vendor-edit-name"
                  value={profileForm.name}
                  onChange={(e) => setProfileForm({ ...profileForm, name: e.target.value })}
                  placeholder="Enter your full name"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="vendor-edit-email">Email Address</Label>
                <Input
                  id="vendor-edit-email"
                  type="email"
                  value={profileForm.email}
                  onChange={(e) => setProfileForm({ ...profileForm, email: e.target.value })}
                  placeholder="your.email@example.com"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="vendor-edit-phone">Phone Number</Label>
                <Input
                  id="vendor-edit-phone"
                  value={profileForm.phone}
                  onChange={(e) => setProfileForm({ ...profileForm, phone: e.target.value })}
                  placeholder="+95 9 XXX XXX XXX"
                />
                <p className="text-xs text-slate-500">Myanmar phone format</p>
              </div>

              <div className="flex gap-3 pt-4">
                <Button
                  onClick={handleSaveProfile}
                  disabled={isProfileSaving}
                  className="flex-1 bg-amber-600 hover:bg-amber-700"
                >
                  <Check className="w-4 h-4 mr-2" />
                  {isProfileSaving ? "Saving..." : "Save Changes"}
                </Button>
                <Button
                  variant="outline"
                  onClick={() => goToProfileMode("view-profile")}
                  disabled={isProfileSaving}
                  className="flex-1"
                >
                  Cancel
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
            Back to Profile
          </Button>

          <div className="mb-8">
            <h1 className="text-xl sm:text-2xl font-bold text-slate-900 mb-2">Order History</h1>
            <p className="text-slate-600 text-sm">View and track all your orders</p>
          </div>

          {ordersLoading && (
            <Card>
              <CardContent className="py-16 text-center">
                <div className="animate-spin w-12 h-12 border-4 border-amber-600 border-t-transparent rounded-full mx-auto mb-4" />
                <p className="text-slate-600">Loading your orders...</p>
              </CardContent>
            </Card>
          )}

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

          {!ordersLoading && !ordersError && orderHistory.length === 0 && (
            <Card>
              <CardContent className="py-16 text-center">
                <Package className="w-16 h-16 text-slate-300 mx-auto mb-4" />
                <h3 className="text-lg font-semibold text-slate-900 mb-2">No Orders Yet</h3>
                <p className="text-slate-600 mb-6">You haven&apos;t placed any orders yet.</p>
                <Button onClick={() => goToProfileMode("storefront")} className="bg-amber-600 hover:bg-amber-700">
                  Start Shopping
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
                        <Badge variant="default" className={`${getOrderStatusColor(order.status)} shrink-0 text-xs`}>
                          {getOrderStatusLabel(order.status)}
                        </Badge>
                      </div>
                      <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4 text-sm text-slate-600">
                        <div className="flex items-center gap-1.5">
                          <Clock className="w-4 h-4 shrink-0" />
                          <span>{new Date(order.createdAt || order.date).toLocaleDateString("en-GB")}</span>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <Package className="w-4 h-4 shrink-0" />
                          <span>
                            {order.items?.length || 0} {order.items?.length === 1 ? "item" : "items"}
                          </span>
                        </div>
                      </div>
                      <div className="pt-3 border-t border-slate-100">
                        <div className="flex items-center justify-between">
                          <span className="text-sm text-slate-600">Total Amount</span>
                          <span className="text-lg sm:text-xl font-bold text-black">
                            {Math.round(order.total || order.totalAmount || 0)} MMK
                          </span>
                        </div>
                      </div>
                      <Button
                        variant="outline"
                        className="w-full sm:w-auto"
                        onClick={() => navigate(`/profile/orders/${order.id}`)}
                      >
                        <Eye className="w-4 h-4 mr-2" />
                        View Details
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
            Back to Profile
          </Button>

          <div className="mb-8 flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
            <div>
              <h1 className="text-xl sm:text-2xl font-bold text-slate-900 mb-2">Shipping Addresses</h1>
              <p className="text-slate-600 text-sm">Manage your delivery addresses</p>
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
              className="bg-amber-600 hover:bg-amber-700 shrink-0"
            >
              <Plus className="w-4 h-4 mr-2" />
              Add Address
            </Button>
          </div>

          {showAddressForm && (
            <Card className="mb-6 border-2 border-amber-500">
              <CardHeader>
                <CardTitle>{editingAddress ? "Edit Address" : "Add New Address"}</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid md:grid-cols-2 gap-4">
                  <div>
                    <Label>Address Label *</Label>
                    <Input
                      placeholder="e.g., Home, Office, etc."
                      value={addressForm.label}
                      onChange={(e) => setAddressForm({ ...addressForm, label: e.target.value })}
                    />
                  </div>
                  <div>
                    <Label>Recipient Name *</Label>
                    <Input
                      placeholder="Full name"
                      value={addressForm.recipientName}
                      onChange={(e) => setAddressForm({ ...addressForm, recipientName: e.target.value })}
                    />
                  </div>
                  <div>
                    <Label>Phone Number *</Label>
                    <Input
                      placeholder="+95 9 XXX XXX XXX"
                      value={addressForm.phone}
                      onChange={(e) => setAddressForm({ ...addressForm, phone: e.target.value })}
                    />
                  </div>
                  <div>
                    <Label>City *</Label>
                    <Input
                      placeholder="City"
                      value={addressForm.city}
                      onChange={(e) => setAddressForm({ ...addressForm, city: e.target.value })}
                    />
                  </div>
                  <div className="md:col-span-2">
                    <Label>Address Line 1 *</Label>
                    <Input
                      placeholder="Street address, P.O. box"
                      value={addressForm.addressLine1}
                      onChange={(e) => setAddressForm({ ...addressForm, addressLine1: e.target.value })}
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
                      onChange={(e) => setAddressForm({ ...addressForm, addressLine2: e.target.value })}
                    />
                  </div>
                  <div>
                    <Label>State/Region</Label>
                    <Input
                      placeholder="State or Region"
                      value={addressForm.state}
                      onChange={(e) => setAddressForm({ ...addressForm, state: e.target.value })}
                    />
                  </div>
                  <div>
                    <Label>Zip/Postal Code</Label>
                    <Input
                      placeholder="Postal code"
                      value={addressForm.zipCode}
                      onChange={(e) => setAddressForm({ ...addressForm, zipCode: e.target.value })}
                    />
                  </div>
                  <div className="md:col-span-2">
                    <Label>Country *</Label>
                    <Input
                      value={addressForm.country}
                      onChange={(e) => setAddressForm({ ...addressForm, country: e.target.value })}
                      disabled
                    />
                  </div>
                  <div className="md:col-span-2 flex items-center gap-2">
                    <Checkbox
                      id="vendor-isDefault"
                      checked={addressForm.isDefault}
                      onCheckedChange={(checked) => setAddressForm({ ...addressForm, isDefault: checked as boolean })}
                    />
                    <Label htmlFor="vendor-isDefault" className="cursor-pointer">
                      Set as default address
                    </Label>
                  </div>
                </div>
                <div className="flex gap-3 mt-6">
                  <Button
                    onClick={async () => {
                      if (
                        !addressForm.label ||
                        !addressForm.recipientName ||
                        !addressForm.phone ||
                        !addressForm.addressLine1 ||
                        !addressForm.city
                      ) {
                        toast.error("Please fill in all required fields");
                        return;
                      }
                      if (!addressUserId) {
                        toast.error("Please sign in to save addresses");
                        return;
                      }

                      const newAddress: MarketplaceAddress = {
                        id: editingAddress?.id || Date.now().toString(),
                        ...addressForm,
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
                        toast.success("Address updated successfully!");
                      } else {
                        updatedAddresses = [...updatedAddresses, newAddress];
                        setShippingAddresses(updatedAddresses);
                        toast.success("Address added successfully!");
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
                    className="flex-1 bg-amber-600 hover:bg-amber-700"
                  >
                    <Check className="w-4 h-4 mr-2" />
                    {editingAddress ? "Update Address" : "Save Address"}
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

          {loadingAddresses && shippingAddresses.length === 0 && !showAddressForm ? (
            <Card>
              <CardContent className="py-16 text-center text-slate-600">Loading addresses…</CardContent>
            </Card>
          ) : shippingAddresses.length === 0 && !showAddressForm ? (
            <Card>
              <CardContent className="py-16 text-center">
                <MapPin className="w-16 h-16 text-slate-300 mx-auto mb-4" />
                <h3 className="text-lg font-semibold text-slate-900 mb-2">No Addresses Yet</h3>
                <p className="text-slate-600 mb-6">Add a shipping address to make checkout faster</p>
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
                <Card key={address.id} className={address.isDefault ? "border-2 border-amber-500" : ""}>
                  <CardContent className="pt-6">
                    <div className="flex items-start justify-between mb-4">
                      <div>
                        <h3 className="font-bold text-slate-900 mb-1 flex items-center gap-2 flex-wrap">
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
                            state: address.state || "",
                            zipCode: address.zipCode || "",
                            country: address.country || "Myanmar",
                            isDefault: address.isDefault ?? false,
                          });
                          setShowAddressForm(true);
                          setTimeout(() => window.scrollTo({ top: 200, behavior: "instant" }), 10);
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
                          if (!confirm("Are you sure you want to delete this address?")) return;
                          if (!addressUserId) {
                            toast.error("Please sign in");
                            return;
                          }
                          const updatedAddresses = shippingAddresses.filter((addr) => addr.id !== address.id);
                          setShippingAddresses(updatedAddresses);
                          toast.success("Address deleted successfully!");
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
                        Delete
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
          Back to Profile
        </Button>

        <div className="mb-8">
          <h1 className="text-xl sm:text-2xl font-bold text-slate-900 mb-2">Security Settings</h1>
          <p className="text-slate-600 text-sm">Manage your account security and password</p>
        </div>

        <Card className="mb-6">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Shield className="w-5 h-5 text-amber-600" />
              Change Password
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
                <Label htmlFor="vendor-cur-pw">Current Password *</Label>
                <div className="relative">
                  <Input
                    id="vendor-cur-pw"
                    type={showPasswordFields.current ? "text" : "password"}
                    placeholder="Enter current password"
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
                    aria-label={showPasswordFields.current ? "Hide password" : "Show password"}
                  >
                    {showPasswordFields.current ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>
              <div>
                <Label htmlFor="vendor-new-pw">New Password *</Label>
                <div className="relative">
                  <Input
                    id="vendor-new-pw"
                    type={showPasswordFields.new ? "text" : "password"}
                    placeholder="Enter new password (min. 6 characters)"
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
                    aria-label={showPasswordFields.new ? "Hide password" : "Show password"}
                  >
                    {showPasswordFields.new ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>
              <div>
                <Label htmlFor="vendor-confirm-pw">Confirm New Password *</Label>
                <div className="relative">
                  <Input
                    id="vendor-confirm-pw"
                    type={showPasswordFields.confirm ? "text" : "password"}
                    placeholder="Re-enter new password"
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
                    aria-label={showPasswordFields.confirm ? "Hide password" : "Show password"}
                  >
                    {showPasswordFields.confirm ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>
              <Button
                type="submit"
                disabled={isChangingPassword}
                className="w-full bg-amber-600 hover:bg-amber-700"
              >
                {isChangingPassword ? (
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
              <p className="font-medium text-slate-900">{new Date().toLocaleDateString("en-GB")}</p>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  };

  // 🚀 LOAD DATA WITH MODULE-LEVEL CACHING — products are required; categories are best-effort (avoid blank storefront if categories fail).
  const loadVendorData = async (forceRefresh: boolean = false) => {
    console.log(`🚀 [VENDOR STORE] Loading data for vendorId: ${vendorId}`);
    
    if (!forceRefresh && products.length === 0 && !initialProductSlug) {
      setServerStatus('checking');
    }

    try {
      const productsData = await moduleCache.get(
        CACHE_KEYS.vendorProducts(vendorId),
        () => fetchVendorProducts(vendorId),
        forceRefresh
      );

      let categoriesData: any[] = [];
      try {
        categoriesData = await moduleCache.get(
          CACHE_KEYS.vendorCategories(vendorId),
          () => fetchVendorCategories(vendorId),
          forceRefresh
        );
      } catch (catErr) {
        console.warn("⚠️ [VENDOR STORE] Categories fetch failed (non-fatal):", catErr);
        categoriesData = [];
      }

      setProducts(productsData.products || []);
      setVendorCategories(categoriesData || []);
      setStoreName(productsData.storeName || "Vendor Store");
      setStoreLogo(productsData.logo || "");
      setServerStatus('healthy');

      console.log(`✅ [VENDOR STORE] Loaded ${productsData.products?.length || 0} products`);
      console.log(`✅ [VENDOR STORE] Loaded ${categoriesData?.length || 0} categories`);
    } catch (error) {
      console.error("❌ [VENDOR STORE] Error loading vendor data:", error);
      setServerStatus('unhealthy');
    }
  };

  // Load data on mount - uses cache if available
  useEffect(() => {
    loadVendorData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vendorId]);

  // Sync product detail from URL + catalog (pathname is source of truth — avoids races with slow loads)
  useEffect(() => {
    const slug = productSlugFromPath ?? initialProductSlug;
    if (!slug) {
      setSelectedProduct(null);
      return;
    }
    if (products.length === 0) return;

    const decoded = safeDecodePathSegment(slug);

    const product = resolveVendorProductFromSlug(products, decoded);

    const stillOnProduct =
      matchPath({ path: "/store/:storeName/product/:productSlug", end: true }, location.pathname) ??
      matchPath({ path: "/vendor/:storeName/product/:productSlug", end: true }, location.pathname);
    if (product && stillOnProduct) {
      setSelectedProduct(product);
    }
  }, [productSlugFromPath, initialProductSlug, products, location.pathname]);

  // Handle browser back button - detect when URL changes back to storefront home
  useEffect(() => {
    // Check if current URL is the storefront home (no /product/ in path)
    const isStorefrontHome = !location.pathname.includes('/product/');
    
    // If we're on storefront home but have a selected product, clear it
    if (isStorefrontHome && selectedProduct) {
      console.log('🔙 Browser back detected - returning to storefront home');
      setSelectedProduct(null);
      setSearchQuery("");
      setSelectedCategory("all");
    }
  }, [location.pathname, selectedProduct]);

  const handleAddToCart = (product: Product, overrides?: VendorAddToCartOverrides) => {
    try {
      if (overrides?.buyNow) {
        clearCart();
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
        },
        qty
      );
      setQuantity(1);
      if (overrides?.buyNow) {
        setCartOpen(false);
        setShowCheckout(true);
      } else if (typeof window !== "undefined" && window.innerWidth >= 768) {
        setCartOpen(true);
      }
    } catch (error) {
      console.error('Error adding to cart:', error);
    }
  };

  // Format price in MMK format (matching main storefront)
  const formatPriceMMK = (price: string | number): string => {
    const numPrice = typeof price === 'string' ? parseFloat(price.replace(/[^0-9.-]+/g, '')) : price;
    return `${Math.round(numPrice)} MMK`;
  };

  // Wishlist — same API as main storefront (global product IDs)
  const [wishlist, setWishlist] = useState<string[]>([]);
  /** Sorted JSON snapshot from last GET/PUT — skip redundant PUTs and block PUT before hydration */
  const wishlistServerSnapshotRef = useRef<string | null>(null);

  useEffect(() => {
    const uid = resolveUserIdFromRecord(user);
    if (!uid) {
      setWishlist([]);
      wishlistServerSnapshotRef.current = null;
      return;
    }
    wishlistServerSnapshotRef.current = null;
    void wishlistApi
      .get(uid)
      .then((res) => {
        const ids = res.productIds || [];
        setWishlist(ids);
        wishlistServerSnapshotRef.current = JSON.stringify([...ids].sort());
      })
      .catch(() => {
        wishlistServerSnapshotRef.current = "[]";
      });
  }, [user]);

  useEffect(() => {
    const uid = resolveUserIdFromRecord(user);
    if (!uid) return;
    if (wishlistServerSnapshotRef.current === null) return;
    const next = JSON.stringify([...wishlist].sort());
    if (next === wishlistServerSnapshotRef.current) return;
    const t = setTimeout(() => {
      wishlistApi
        .update(uid, wishlist)
        .then(() => {
          wishlistServerSnapshotRef.current = next;
        })
        .catch(() => {});
    }, 500);
    return () => clearTimeout(t);
  }, [wishlist, user]);
  
  const toggleWishlist = (productId: string) => {
    // Require authentication for wishlist
    if (!user) {
      toast.error("Please sign in to add items to your wishlist");
      setShowAuthModal(true);
      setAuthMode('login');
      return;
    }
    
    setWishlist(prev => {
      if (prev.includes(productId)) {
        return prev.filter(id => id !== productId);
      } else {
        return [...prev, productId];
      }
    });
  };

  const filteredProducts = products.filter(product => {
    const matchesSearch = product.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                         product.sku.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesCategory = selectedCategory === "all" || product.category === selectedCategory;
    return matchesSearch && matchesCategory;
  });

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

  // Checkout must render before product detail — otherwise selectedProduct keeps the detail view mounted and checkout never shows
  if (showCheckout) {
    return (
      <div className="h-screen min-h-0 overflow-y-auto overflow-x-hidden bg-slate-50 scrollbar-thin">
        <Checkout
          onBack={() => setShowCheckout(false)}
          storeName={storeName}
          vendorId={vendorId}
          vendorName={storeName}
          accountUser={user}
        />
      </div>
    );
  }

  // Product Detail View (inline, not modal)
  if (selectedProduct && vendorViewMode === "storefront" && !savedPage) {
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
    const displayInventoryVal = dd?.inventory ?? selectedProduct.inventory;

    return (
      <div className="h-screen min-h-0 overflow-y-auto overflow-x-hidden bg-white scrollbar-thin flex flex-col">
        <ServerStatusBanner 
          status={serverStatus} 
          onRetry={() => loadVendorData(true)}
        />
        
        <CartDrawer 
          isOpen={cartOpen} 
          onClose={() => setCartOpen(false)} 
          onCheckout={() => {
            setCartOpen(false);
            setShowCheckout(true);
          }}
          user={user}
          onShowAuthModal={() => {
            setShowAuthModal(true);
            setAuthMode('login');
          }}
        />

        {/* Header - Same as main storefront */}
        <header className="sticky top-0 z-40 bg-white border-b border-[rgba(15,23,42,0.08)] shadow-[0_2px_10px_-2px_rgba(15,23,42,0.08)]">
          <div className="max-w-7xl mx-auto px-4">
            {/* Top Bar */}
            <div className="flex items-center h-16 gap-2 md:gap-3">
              {/* Logo */}
              <button 
                onClick={() => {
                  setSelectedProduct(null);
                  setSearchQuery("");
                  setSelectedCategory("all");
                  navigate(storeBase, { replace: false });
                }}
                className="flex items-center gap-2 sm:gap-3 group min-w-0 shrink-0 max-w-[42%] sm:max-w-xs"
              >
                {storeLogo ? (
                  <CacheFriendlyImg 
                    src={storeLogo} 
                    alt={storeName}
                    priority
                    className="w-10 h-10 rounded-xl object-cover ring-2 ring-slate-100 shrink-0"
                  />
                ) : (
                  <div className="w-10 h-10 bg-slate-900 rounded-xl flex items-center justify-center shrink-0">
                    <Store className="w-5 h-5 text-white" />
                  </div>
                )}
                <span className="text-sm sm:text-xl font-bold text-slate-900 truncate text-left min-w-0">
                  {storeName}
                </span>
              </button>

              {/* Search - Desktop (centered in remaining row space) */}
              <div className="hidden md:flex flex-1 justify-center min-w-0 px-2">
                <div className="relative w-full max-w-lg">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
                  <Input
                    placeholder="Search products..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-10 h-10 rounded-lg bg-slate-50 border-slate-200 focus:bg-white"
                  />
                </div>
              </div>

              {/* Actions — ml-auto pins the block to the header’s right (mobile has no flex-1 search) */}
              <div className="flex items-center justify-end gap-1 sm:gap-2 shrink-0 min-w-0 ml-auto">
                <Button
                  variant="ghost"
                  size="icon"
                  className="md:hidden rounded-full shrink-0"
                  onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
                >
                  {mobileMenuOpen ? <X className="w-5 h-5" /> : <Search className="w-5 h-5" />}
                </Button>

                <Button
                  variant="ghost"
                  size="icon"
                  className="relative hover:bg-slate-100 rounded-full w-10 h-10 shrink-0"
                  onClick={goToSavedProducts}
                  title="Saved products"
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
                  onClick={() => setCartOpen(true)}
                  className="rounded-full relative shrink-0"
                >
                  <ShoppingCart className="w-5 h-5" />
                  {totalItems > 0 && (
                    <Badge className="absolute -top-1 -right-1 h-5 w-5 flex items-center justify-center p-0 text-xs bg-slate-900">
                      {totalItems}
                    </Badge>
                  )}
                </Button>

                {/* Login/Register — flush right on small screens (header uses px-4) */}
                {!user && (
                  <Button
                    variant="ghost"
                    className="flex items-center text-slate-700 hover:bg-slate-100 font-medium h-10 pl-2 pr-0 sm:px-4 whitespace-nowrap shrink-0 text-[11px] sm:text-sm leading-tight max-[380px]:text-[10px]"
                    onClick={() => {
                      setShowAuthModal(true);
                      setAuthMode('login');
                    }}
                  >
                    Login/Register
                  </Button>
                )}

                {/* User Profile Menu */}
                {user && (
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button variant="ghost" size="icon" className="flex hover:bg-slate-100 rounded-full w-10 h-10 p-0 shrink-0">
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
                          View Profile
                        </Button>
                        <Button variant="ghost" className="w-full justify-start text-slate-700 hover:bg-slate-100" onClick={() => handleProfileAction("edit-profile")}>
                          <Settings className="w-4 h-4 mr-3" />
                          Edit Profile
                        </Button>
                        <Button variant="ghost" className="w-full justify-start text-slate-700 hover:bg-slate-100" onClick={() => handleProfileAction("order-history")}>
                          <Package className="w-4 h-4 mr-3" />
                          Order History
                        </Button>
                        <Button variant="ghost" className="w-full justify-start text-slate-700 hover:bg-slate-100" onClick={() => handleProfileAction("shipping-addresses")}>
                          <MapPin className="w-4 h-4 mr-3" />
                          Shipping Addresses
                        </Button>
                        <Button variant="ghost" className="w-full justify-start text-slate-700 hover:bg-slate-100" onClick={() => handleProfileAction("security-settings")}>
                          <Shield className="w-4 h-4 mr-3" />
                          Security Settings
                        </Button>
                        <Separator className="my-2" />
                        <Button variant="ghost" className="w-full justify-start text-red-600 hover:bg-red-50" onClick={handleLogout}>
                          <LogOut className="w-4 h-4 mr-3" />
                          Logout
                        </Button>
                      </div>
                    </PopoverContent>
                  </Popover>
                )}
              </div>
            </div>

            {/* Mobile Search */}
            {mobileMenuOpen && (
              <div className="md:hidden pb-4">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
                  <Input
                    placeholder="Search products..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-10 h-10 rounded-lg bg-slate-50 border-slate-200"
                  />
                </div>
              </div>
            )}

            {/* Categories */}
            {vendorCategories.length > 0 && (
              <div className="flex items-center gap-2 py-3 overflow-x-auto scrollbar-hide">
                <button
                  onClick={() => {
                    setSelectedProduct(null);
                    setSelectedCategory("all");
                    navigate(storeBase, { replace: false });
                  }}
                  className={`px-4 py-1.5 rounded-full text-sm font-medium whitespace-nowrap transition-colors ${
                    selectedCategory === "all"
                      ? "bg-slate-900 text-white"
                      : "bg-slate-100 text-slate-700 hover:bg-slate-200"
                  }`}
                >
                  All Products
                </button>
                {vendorCategories.map((category) => (
                  <button
                    key={category.id}
                    onClick={() => {
                      setSelectedProduct(null);
                      setSelectedCategory(category.name);
                      navigate(storeBase, { replace: false });
                    }}
                    className={`px-4 py-1.5 rounded-full text-sm font-medium whitespace-nowrap transition-colors ${
                      selectedCategory === category.name
                        ? "bg-slate-900 text-white"
                        : "bg-slate-100 text-slate-700 hover:bg-slate-200"
                    }`}
                  >
                    {category.name}
                  </button>
                ))}
              </div>
            )}
          </div>
        </header>

        {/* Product Details Content */}
        <main className="flex-1 max-w-7xl mx-auto px-3 sm:px-4 md:px-6 lg:px-8 py-3 sm:py-4 md:py-5 w-full">
          {/* Breadcrumb */}
          <div className="flex items-center gap-1.5 text-xs text-slate-500 mb-3">
            <button onClick={() => {
              setSelectedProduct(null);
              navigate(storeBase, { replace: false });
            }} className="hover:text-amber-700 transition-colors whitespace-nowrap text-xs">
              Home
            </button>
            {selectedProduct.category && (
              <>
                <ChevronRight className="w-3 h-3 flex-shrink-0" />
                <button onClick={() => {
                  setSelectedProduct(null);
                  setSelectedCategory(selectedProduct.category);
                  navigate(storeBase, { replace: false });
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
            <div className="space-y-6">
              {/* Title and Category */}
              <div>
                <div className="flex items-center gap-2 mb-2.5 flex-wrap">
                  {selectedProduct.category && (
                    <Badge className="bg-amber-100 text-amber-800 hover:bg-amber-200 border border-amber-300 text-xs font-medium px-2.5 py-0.5">{selectedProduct.category}</Badge>
                  )}
                  <Badge
                    className={
                      displayInventoryVal === 0
                        ? "bg-red-100 text-red-800 hover:bg-red-200 border border-red-300 text-xs font-medium px-2.5 py-0.5"
                        : "bg-emerald-100 text-emerald-800 hover:bg-emerald-200 border border-emerald-300 text-xs font-medium px-2.5 py-0.5"
                    }
                  >
                    {displayInventoryVal === 0 ? "Out of Stock" : "In Stock"}
                  </Badge>
                </div>
                <h1 className="text-sm sm:text-base font-semibold text-slate-900 mb-2 leading-tight">
                  {selectedProduct.name || "Product"}
                </h1>
                <div className="flex items-center gap-2 flex-wrap">
                  <div className="flex items-center gap-0.5">
                    {[...Array(5)].map((_, i) => (
                      <Star key={i} className="w-3.5 h-3.5 fill-amber-400 text-amber-400" />
                    ))}
                  </div>
                  <span className="text-xs text-slate-600 font-medium">4.8/5.0</span>
                  <Separator orientation="vertical" className="h-3 hidden sm:block" />
                  <span className="text-xs text-slate-600">{selectedProduct.reviewCount || 0} sold</span>
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
                          Save {Math.round(((displayCompareAt - displayPriceVal) / displayCompareAt) * 100)}%
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
                                  navigate(`${storeBase}/product/${encodeURIComponent(v.sku.trim())}`, {
                                    replace: true,
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
                        <p className="font-medium text-slate-900 text-sm truncate">{storeName}</p>
                      </div>
                    </div>
                    <div className="flex items-start gap-3">
                      <TrendingUp className="w-[18px] h-[18px] text-amber-600 mt-px flex-shrink-0" />
                      <div className="min-w-0">
                        <p className="text-[10px] text-slate-500 mb-1 font-normal uppercase tracking-wide">Availability</p>
                        <div className="flex items-center gap-2">
                          <p className={`font-medium text-sm ${
                            displayInventoryVal === 0 
                              ? "text-red-600" 
                              : displayInventoryVal < 10 
                                ? "text-amber-600" 
                                : "text-emerald-700"
                          }`}>
                            {displayInventoryVal || 0} units
                          </p>
                          {displayInventoryVal === 0 && (
                            <Badge variant="outline" className="bg-red-50 text-red-600 border-red-200 text-xs">
                              OUT OF STOCK
                            </Badge>
                          )}
                          {displayInventoryVal > 0 && displayInventoryVal < 10 && (
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
                  disabled={displayInventoryVal === 0}
                  className={displayInventoryVal === 0 
                    ? "bg-slate-300 h-10 font-semibold rounded-lg text-sm px-6 cursor-not-allowed flex items-center justify-center transition-all py-0"
                    : "bg-amber-600 hover:bg-amber-700 h-10 font-semibold transition-all rounded-lg text-sm px-6 flex items-center justify-center py-0"
                  }
                  onClick={() => {
                    if (displayInventoryVal === 0) return;
                    handleAddToCart(selectedProduct);
                  }}
                >
                  <span className="block leading-none">
                    {displayInventoryVal === 0 ? "OUT OF STOCK" : "ADD TO CART"}
                  </span>
                </Button>
                <Button 
                  disabled={displayInventoryVal === 0}
                  variant="outline"
                  className={displayInventoryVal === 0
                    ? "h-10 border-2 border-slate-300 bg-slate-100 text-slate-400 font-semibold rounded-lg text-sm px-6 cursor-not-allowed flex items-center justify-center transition-all py-0"
                    : "h-10 border-2 border-amber-600 hover:bg-amber-50 hover:border-amber-700 text-amber-700 hover:text-amber-800 font-semibold transition-all rounded-lg text-sm px-6 flex items-center justify-center py-0"
                  }
                  onClick={() => {
                    if (displayInventoryVal === 0) return;
                    // Buy now: open checkout in-place. Do not navigate to store home — sibling
                    // routes remount VendorStorefrontPage and drop showCheckout + cart state.
                    handleAddToCart(selectedProduct, { buyNow: true });
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
                          const imgRegex = /<img[^>]+src=["']([^"'>]+)["']/gi;
                          const matches = [...selectedProduct.description.matchAll(imgRegex)];
                          const imageSrcs = [...new Set(matches.map((m) => m[1]))];
                          
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
        </main>

        {/* Footer - Same as main storefront */}
        {onBack && (
          <footer className="border-t mt-auto">
            <div className="max-w-7xl mx-auto px-4 py-8 text-center space-y-4">
              <p className="text-sm text-slate-600">
                Powered by <span className="font-bold text-slate-900">SECURE</span> ERP Platform
              </p>
              <p className="text-xs text-slate-500">
                © {new Date().getFullYear()} {storeName}. All rights reserved.
              </p>
            </div>
          </footer>
        )}

        {/* Description image lightbox — matches marketplace full-screen gallery */}
        {descLightboxOpen && lightboxImages.length > 0 && (
          <div
            className="fixed inset-0 z-[200] flex items-center justify-center bg-black/85 p-3 sm:p-6"
            role="dialog"
            aria-modal="true"
            aria-label="Product image gallery"
            onClick={() => setDescLightboxOpen(false)}
          >
            <button
              type="button"
              className="absolute right-3 top-3 z-[210] flex h-10 w-10 items-center justify-center rounded-full bg-white/10 text-white backdrop-blur-sm transition hover:bg-white/20"
              onClick={(e) => {
                e.stopPropagation();
                setDescLightboxOpen(false);
              }}
              aria-label="Close gallery"
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
              aria-label="Previous image"
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
              aria-label="Next image"
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
    );
  }

  // Main Storefront — h-screen + overflow-y-auto so scrollbar-thin applies (not the default body bar)
  return (
    <div
      className={`h-screen min-h-0 overflow-y-auto overflow-x-hidden scrollbar-thin flex flex-col ${
        vendorViewMode !== "storefront" ? "bg-slate-50" : "bg-white"
      }`}
    >
      {/* Show error banner ONLY when server is unhealthy */}
      {serverStatus === 'unhealthy' && (
        <div className="fixed top-0 left-0 right-0 z-40 bg-gradient-to-r from-amber-50 to-orange-50 border-b-2 border-amber-300 shadow-lg">
          <div className="max-w-7xl mx-auto px-4 py-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="animate-pulse">⏳</div>
                <div>
                  <p className="text-sm font-semibold text-amber-900">
                    Server Starting - Please wait...
                  </p>
                  <p className="text-xs text-amber-700 mt-0.5">
                    The storefront will load automatically within 30-60 seconds.
                  </p>
                </div>
              </div>
              <Button
                onClick={() => loadVendorData(true)}
                variant="outline"
                size="sm"
                className="border-amber-400 hover:bg-amber-100 text-amber-900 font-medium flex-shrink-0"
              >
                Retry Now
              </Button>
            </div>
          </div>
        </div>
      )}
      
      <CartDrawer 
        isOpen={cartOpen} 
        onClose={() => setCartOpen(false)} 
        onCheckout={() => {
          setCartOpen(false);
          setShowCheckout(true);
        }}
        user={user}
        onShowAuthModal={() => {
          setShowAuthModal(true);
          setAuthMode('login');
        }}
      />

      {/* Header */}
      <header className="sticky top-0 z-40 bg-white border-b border-[rgba(15,23,42,0.08)] shadow-[0_2px_10px_-2px_rgba(15,23,42,0.08)]">
        <div className="max-w-7xl mx-auto px-4">
          {/* Top Bar */}
          <div className="flex items-center h-16 gap-2 md:gap-3">
            {/* Logo */}
            <button 
              onClick={() => {
                setSearchQuery("");
                setSelectedCategory("all");
                navigate(storeBase);
              }}
              className="flex items-center gap-2 sm:gap-3 group min-w-0 shrink-0 max-w-[42%] sm:max-w-xs"
            >
              {storeLogo ? (
                <CacheFriendlyImg 
                  src={storeLogo} 
                  alt={storeName}
                  priority
                  className="w-10 h-10 rounded-xl object-cover ring-2 ring-slate-100 shrink-0"
                />
              ) : (
                <div className="w-10 h-10 bg-slate-900 rounded-xl flex items-center justify-center shrink-0">
                  <Store className="w-5 h-5 text-white" />
                </div>
              )}
              <span className="text-sm sm:text-xl font-bold text-slate-900 truncate text-left min-w-0">
                {storeName}
              </span>
            </button>

            {/* Search - Desktop (centered in remaining row space) */}
            <div className="hidden md:flex flex-1 justify-center min-w-0 px-2">
              <div className="relative w-full max-w-lg">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
                <Input
                  placeholder="Search products..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-10 h-10 rounded-lg bg-slate-50 border-slate-200 focus:bg-white"
                />
              </div>
            </div>

            {/* Actions — ml-auto pins the block to the header’s right (mobile has no flex-1 search) */}
            <div className="flex items-center justify-end gap-1 sm:gap-2 shrink-0 min-w-0 ml-auto">
              <Button
                variant="ghost"
                size="icon"
                className="md:hidden rounded-full shrink-0"
                onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              >
                {mobileMenuOpen ? <X className="w-5 h-5" /> : <Search className="w-5 h-5" />}
              </Button>

              <Button
                variant="ghost"
                size="icon"
                className="relative hover:bg-slate-100 rounded-full w-10 h-10 shrink-0"
                onClick={goToSavedProducts}
                title="Saved products"
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
                onClick={() => setCartOpen(true)}
                className="rounded-full relative shrink-0"
              >
                <ShoppingCart className="w-5 h-5" />
                {totalItems > 0 && (
                  <Badge className="absolute -top-1 -right-1 h-5 w-5 flex items-center justify-center p-0 text-xs bg-slate-900">
                    {totalItems}
                  </Badge>
                )}
              </Button>

              {/* Login/Register — flush right on small screens (header uses px-4) */}
              {!user && (
                <Button
                  variant="ghost"
                  className="flex items-center text-slate-700 hover:bg-slate-100 font-medium h-10 pl-2 pr-0 sm:px-4 whitespace-nowrap shrink-0 text-[11px] sm:text-sm leading-tight max-[380px]:text-[10px]"
                  onClick={() => {
                    setShowAuthModal(true);
                    setAuthMode('login');
                  }}
                >
                  Login/Register
                </Button>
              )}

              {/* User Profile Menu */}
              {user && (
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="ghost" size="icon" className="flex hover:bg-slate-100 rounded-full w-10 h-10 p-0 shrink-0">
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
                        View Profile
                      </Button>
                      <Button variant="ghost" className="w-full justify-start text-slate-700 hover:bg-slate-100" onClick={() => handleProfileAction("edit-profile")}>
                        <Settings className="w-4 h-4 mr-3" />
                        Edit Profile
                      </Button>
                      <Button variant="ghost" className="w-full justify-start text-slate-700 hover:bg-slate-100" onClick={() => handleProfileAction("order-history")}>
                        <Package className="w-4 h-4 mr-3" />
                        Order History
                      </Button>
                      <Button variant="ghost" className="w-full justify-start text-slate-700 hover:bg-slate-100" onClick={() => handleProfileAction("shipping-addresses")}>
                        <MapPin className="w-4 h-4 mr-3" />
                        Shipping Addresses
                      </Button>
                      <Button variant="ghost" className="w-full justify-start text-slate-700 hover:bg-slate-100" onClick={() => handleProfileAction("security-settings")}>
                        <Shield className="w-4 h-4 mr-3" />
                        Security Settings
                      </Button>
                      <Separator className="my-2" />
                      <Button variant="ghost" className="w-full justify-start text-red-600 hover:bg-red-50" onClick={handleLogout}>
                        <LogOut className="w-4 h-4 mr-3" />
                        Logout
                      </Button>
                    </div>
                  </PopoverContent>
                </Popover>
              )}
            </div>
          </div>

          {/* Mobile Search */}
          {mobileMenuOpen && (
            <div className="md:hidden pb-4">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
                <Input
                  placeholder="Search products..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-10 h-10 rounded-lg bg-slate-50 border-slate-200"
                />
              </div>
            </div>
          )}

          {/* Categories — hide on account + saved pages */}
          {vendorViewMode === "storefront" && !savedPage && vendorCategories.length > 0 && (
            <div className="flex items-center gap-2 py-3 overflow-x-auto scrollbar-hide">
              <button
                onClick={() => setSelectedCategory("all")}
                className={`px-4 py-1.5 rounded-full text-sm font-medium whitespace-nowrap transition-colors ${
                  selectedCategory === "all"
                    ? "bg-slate-900 text-white"
                    : "bg-slate-100 text-slate-700 hover:bg-slate-200"
                }`}
              >
                All Products
              </button>
              {vendorCategories.map((category) => (
                <button
                  key={category.id}
                  onClick={() => setSelectedCategory(category.name)}
                  className={`px-4 py-1.5 rounded-full text-sm font-medium whitespace-nowrap transition-colors ${
                    selectedCategory === category.name
                      ? "bg-slate-900 text-white"
                      : "bg-slate-100 text-slate-700 hover:bg-slate-200"
                  }`}
                >
                  {category.name}
                </button>
              ))}
            </div>
          )}
        </div>
      </header>

      {/* Content */}
      <main className="max-w-7xl mx-auto px-4 py-8 w-full">
        {vendorViewMode !== "storefront" ? (
          renderVendorAccountPage()
        ) : savedPage ? (
          <>
            <div className="-mx-4">
              <div
                className="text-white py-8 sm:py-10 md:py-11 px-4 sm:px-6 lg:px-8"
                style={{ backgroundColor: "#223044" }}
              >
                <div className="max-w-7xl mx-auto">
                  <div className="flex items-center gap-3 sm:gap-4">
                    <Heart className="w-7 h-7 sm:w-8 sm:h-8 shrink-0 fill-white text-white" strokeWidth={1.5} />
                    <h1 className="font-serif font-bold text-white text-2xl sm:text-3xl tracking-tight">
                      Saved Products
                    </h1>
                  </div>
                  <p className="mt-2 text-sm sm:text-[15px] text-white/95 font-sans font-normal">
                    {(() => {
                      const n = products.filter((p) => wishlist.includes(p.id)).length;
                      return `${n} ${n === 1 ? "item" : "items"} saved for later`;
                    })()}
                  </p>
                </div>
              </div>
            </div>

            <div className="max-w-7xl mx-auto w-full pt-6 md:pt-12">
              {(() => {
                const savedHere = products.filter((p) => wishlist.includes(p.id));
                if (savedHere.length === 0) {
                  return (
                    <Card className="text-center py-16 sm:py-20 border-0 shadow-md">
                      <Heart className="w-16 h-16 mx-auto text-slate-300 mb-4" />
                      <p className="text-lg text-slate-500 mb-2">No saved products from this store yet</p>
                      <p className="text-sm text-slate-400 mb-6">
                        {wishlist.length > 0
                          ? "Your wishlist has items from other areas — browse this shop and tap the heart on products you like."
                          : "Start adding products to your wishlist!"}
                      </p>
                      <Button onClick={() => navigate(storeBase)} className="bg-amber-600 hover:bg-amber-700">
                        Browse products
                      </Button>
                    </Card>
                  );
                }
                return (
                  <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3 md:gap-4 lg:gap-6">
                    {savedHere.map((product) => (
                      <ProductCard
                        key={product.id}
                        product={productToCardProduct(product)}
                        onProductClick={() => {
                          const segment = buildVendorProductUrlSegment(product);
                          navigate(`${storeBase}/product/${encodeURIComponent(segment)}`);
                        }}
                        onAddToCart={(e, opts) => {
                          e?.stopPropagation();
                          handleAddToCart(product, {
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
                          toast.success(
                            opts?.buyNow ? `Continue to checkout — ${product.name}` : `${product.name} added to cart!`
                          );
                        }}
                        onToggleWishlist={(e) => {
                          e.stopPropagation();
                          toggleWishlist(product.id);
                          const isNowWishlisted = !wishlist.includes(product.id);
                          toast.success(
                            isNowWishlisted
                              ? `${product.name} added to wishlist!`
                              : `${product.name} removed from wishlist`
                          );
                        }}
                        isWishlisted={wishlist.includes(product.id)}
                        formatPriceMMK={formatPriceMMK}
                      />
                    ))}
                  </div>
                );
              })()}
            </div>
          </>
        ) : (
          <>
            {/* Failed load: main area was empty (only header/footer) — always show retry */}
            {serverStatus === 'unhealthy' && (
              <div className="text-center py-16 sm:py-24 max-w-lg mx-auto px-4">
                <Store className="w-16 h-16 text-amber-400 mx-auto mb-4" />
                <h3 className="text-lg font-semibold text-slate-900 mb-2">Couldn&apos;t load this store</h3>
                <p className="text-slate-600 mb-6 text-sm sm:text-base">
                  The product catalog didn&apos;t load. Check your connection, wait a moment, or tap retry.
                </p>
                <Button
                  onClick={() => loadVendorData(true)}
                  className="bg-amber-600 hover:bg-amber-700"
                >
                  <RefreshCw className="w-4 h-4 mr-2" />
                  Retry
                </Button>
              </div>
            )}

            {/* Show skeleton loaders while checking server status - Shopify style */}
            {serverStatus === 'checking' && (
              <div className="animate-smooth-fade">
                <ProductGridSkeleton count={8} />
              </div>
            )}

            {serverStatus === 'healthy' && filteredProducts.length === 0 && (
              <div className="text-center py-20">
                <Store className="w-16 h-16 text-slate-300 mx-auto mb-4" />
                <h3 className="text-lg font-semibold text-slate-900 mb-2">No Products Found</h3>
                <p className="text-slate-600">
                  {searchQuery ? "Try adjusting your search" : "This store hasn't added any products yet"}
                </p>
              </div>
            )}

            {serverStatus === 'healthy' && filteredProducts.length > 0 && (
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3 md:gap-4 lg:gap-6 stagger-children">
                {filteredProducts.map((product) => (
                  <ProductCard
                    key={product.id}
                    product={productToCardProduct(product)}
                    onProductClick={async () => {
                      const segment = buildVendorProductUrlSegment(product);
                      navigate(
                        `${storeBase}/product/${encodeURIComponent(segment)}`
                      );
                    }}
                    onAddToCart={(e, opts) => {
                      e?.stopPropagation();
                      handleAddToCart(product, {
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
                      toast.success(
                        opts?.buyNow ? `Continue to checkout — ${product.name}` : `${product.name} added to cart!`
                      );
                    }}
                    onToggleWishlist={(e) => {
                      e.stopPropagation();
                      toggleWishlist(product.id);
                      const isNowWishlisted = !wishlist.includes(product.id);
                      toast.success(isNowWishlisted ? `${product.name} added to wishlist!` : `${product.name} removed from wishlist`);
                    }}
                    isWishlisted={wishlist.includes(product.id)}
                    formatPriceMMK={formatPriceMMK}
                  />
                ))}
              </div>
            )}
          </>
        )}
      </main>

      {/* Footer */}
      {onBack && (
        <footer className="border-t mt-16">
          <div className="max-w-7xl mx-auto px-4 py-8 text-center space-y-4">
            <p className="text-sm text-slate-600">
              Powered by <span className="font-bold text-slate-900">SECURE</span> ERP Platform
            </p>
            <p className="text-xs text-slate-500">
              © {new Date().getFullYear()} {storeName}. All rights reserved.
            </p>
          </div>
        </footer>
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
  );
}