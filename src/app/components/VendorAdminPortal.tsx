import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { useNavigate, useLocation } from "react-router";
import { pathnameUnderAdmin } from "../utils/vendorSubdomainHooks";
import {
  useVendorAdminRouteParams,
  useVendorHostCleanAdmin,
} from "../utils/vendorAdminRouteParams";
import { 
  LayoutDashboard, 
  Package, 
  ShoppingCart, 
  Settings, 
  LogOut, 
  Menu, 
  X, 
  DollarSign,
  ChevronDown,
  Bell,
  Search,
  Users,
  Check,
  Trash2,
  AlertCircle,
  User,
  Edit,
} from "lucide-react";
import { Button } from "./ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "./ui/dropdown-menu";
import { Popover, PopoverContent, PopoverTrigger } from "./ui/popover";
import { ScrollArea } from "./ui/scroll-area";
import { notificationsApi } from "../../utils/api";
import { toast } from "sonner";
import { POLLING_INTERVALS_MS, PENDING_ORDER_STATUSES } from "../../constants";
import { VendorAdminDashboard } from "./vendor-admin/VendorAdminDashboard";
import { VendorAdminProductsCRUD } from "./vendor-admin/VendorAdminProductsCRUD";
import { VendorAdminCategories } from "./vendor-admin/VendorAdminCategories";
import { VendorAdminOrderManagement } from "./vendor-admin/VendorAdminOrderManagement";
import { VendorAdminSettings } from "./vendor-admin/VendorAdminSettings";
import { VendorAdminFinances } from "./vendor-admin/VendorAdminFinances";
import { VendorAdminUsers } from "./vendor-admin/VendorAdminUsers";
import { publicAnonKey } from "../../../utils/supabase/info";
import { API_BASE_URL } from "../../utils/api-client";
import { applyVendorStoreLogoFavicon, resetDocumentFavicon } from "../utils/documentFavicon";
import { isRenderableImageSrc, pickStoreLogo } from "../utils/renderableImageSrc";
import { UserProfile } from "./UserProfile";
import { useVendorAuth, type VendorUser } from "../contexts/VendorAuthContext";
import { useLanguage } from "../contexts/LanguageContext";

interface Vendor {
  id: string;
  name: string;
  email: string;
  phone: string;
  location?: string;
  avatar?: string;
  storeSlug: string;
  /** Public display name from storefront settings (may differ from account `name`). */
  storeName?: string;
  businessType?: string;
  /** Owner / primary contact name (KV contactName), shown in nav + profile. */
  contactName?: string;
}

interface VendorAdminPortalProps {
  vendor: Vendor;
  onLogout: () => void;
  onPreviewStore?: (vendorId: string, storeSlug: string) => void;
}

/** Stored profile photo URL, or DiceBear pixel avatar (same seed logic as User Profile). */
function vendorNavAvatarSrc(vendor: Pick<Vendor, "avatar" | "email" | "name">): string {
  const raw = vendor.avatar?.trim();
  if (
    raw &&
    (raw.startsWith("http://") || raw.startsWith("https://") || raw.startsWith("data:image"))
  ) {
    return raw;
  }
  const seed = vendor.email || vendor.name || "vendor";
  return `https://api.dicebear.com/7.x/pixel-art/svg?seed=${encodeURIComponent(seed)}`;
}

type VendorPage = "dashboard" | "products" | "categories" | "orders" | "settings" | "finances" | "users";

interface SubNavItem {
  id: VendorPage;
  label: string;
}

interface NavItem {
  id: VendorPage;
  name: string;
  icon: any;
  color: string;
  bgColor: string;
  subItems?: SubNavItem[];
}

interface Notification {
  id: string;
  type: "order" | "product" | "review" | "system";
  title: string;
  message: string;
  timestamp: string;
  createdAt?: string;
  isRead: boolean;
}

interface StorefrontSnapshotCache {
  storeName?: string;
  storeSlug?: string;
  logo?: string;
}

function storefrontCacheKey(vendorId: string): string {
  return `vendor-admin:storefront:${vendorId}`;
}

function readStorefrontSnapshotCache(vendorId: string): StorefrontSnapshotCache | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(storefrontCacheKey(vendorId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as StorefrontSnapshotCache;
    if (!parsed || typeof parsed !== "object") return null;
    return parsed;
  } catch {
    return null;
  }
}

function writeStorefrontSnapshotCache(vendorId: string, value: StorefrontSnapshotCache): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(storefrontCacheKey(vendorId), JSON.stringify(value));
  } catch {
    /* ignore quota/storage failures */
  }
}

export function VendorAdminPortal({ vendor, onLogout, onPreviewStore }: VendorAdminPortalProps) {
  const { updateVendor, vendor: authVendor } = useVendorAuth();
  const { t } = useLanguage();
  const tr = (key: string, values: Record<string, string | number> = {}) =>
    Object.entries(values).reduce(
      (text, [name, value]) => text.replace(`{${name}}`, String(value)),
      t(key)
    );
  const initialStorefrontCache = useMemo(
    () => readStorefrontSnapshotCache(vendor.id),
    [vendor.id]
  );
  const routeParams = useVendorAdminRouteParams();
  const navigate = useNavigate();
  const location = useLocation();
  const {
    clean: vendorHostCleanAdmin,
    loading: vendorHostCleanAdminLoading,
  } = useVendorHostCleanAdmin();
  /** Subdomain or custom domain with `/admin/*` URLs (not `/vendor/.../admin`). */
  const onVendorHostCleanAdmin =
    vendorHostCleanAdmin && pathnameUnderAdmin(location.pathname);
  const adminPathPrefix = "vendor";
  const [currentPage, setCurrentPage] = useState<VendorPage>("dashboard");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [expandedItems, setExpandedItems] = useState<VendorPage[]>(["products"]); // Auto-expand Products
  const [unreadNotifications, setUnreadNotifications] = useState(0);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [vendorLogo, setVendorLogo] = useState<string>(() =>
    pickStoreLogo(initialStorefrontCache?.logo, vendor.avatar)
  );
  /** Canonical storefront label + slug from KV (drives sidebar + URLs after rename). */
  const [storefrontSnapshot, setStorefrontSnapshot] = useState<{
    storeName: string;
    storeSlug: string;
  } | null>(() => {
    if (
      initialStorefrontCache?.storeName &&
      typeof initialStorefrontCache.storeName === "string"
    ) {
      return {
        storeName: initialStorefrontCache.storeName,
        storeSlug:
          typeof initialStorefrontCache.storeSlug === "string"
            ? initialStorefrontCache.storeSlug
            : vendor.storeSlug || "",
      };
    }
    return null;
  });
  /** Header search — synced with Products screen (client filter; no API per keystroke). */
  const [vendorHeaderProductSearch, setVendorHeaderProductSearch] = useState("");
  const [mountedPages, setMountedPages] = useState<VendorPage[]>(["dashboard"]);
  const [vendorProfileOpen, setVendorProfileOpen] = useState(false);
  const [vendorProfileInitialEdit, setVendorProfileInitialEdit] = useState(false);
  /** Snapshot for rolling back optimistic session updates if vendor profile PUT fails. */
  const vendorSessionBeforeOptimisticRef = useRef<VendorUser | null>(null);

  const vendorProfileSeed = useMemo(
    () => ({
      id: vendor.id,
      name: vendor.name,
      contactName: vendor.contactName?.trim() || vendor.name,
      email: vendor.email,
      phone: vendor.phone || "",
      role: "vendor-admin",
      status: "active" as const,
      location: vendor.location || "",
      avatar: vendor.avatar,
    }),
    [vendor]
  );

  /** Keep query string in sync so the address bar matches the account overlay (and browser Back works better). */
  const closeVendorProfile = useCallback(() => {
    setVendorProfileOpen(false);
    const params = new URLSearchParams(location.search);
    if (params.get("account") === "profile") {
      params.delete("account");
      params.delete("edit");
      const qs = params.toString();
      navigate({ pathname: location.pathname, search: qs ? `?${qs}` : "" }, { replace: true });
    }
  }, [location.pathname, location.search, navigate]);

  useEffect(() => {
    if (!vendorProfileOpen) return;
    const params = new URLSearchParams(location.search);
    let needNav = false;
    if (params.get("account") !== "profile") {
      params.set("account", "profile");
      needNav = true;
    }
    if (vendorProfileInitialEdit) {
      if (params.get("edit") !== "1") {
        params.set("edit", "1");
        needNav = true;
      }
    } else if (params.has("edit")) {
      params.delete("edit");
      needNav = true;
    }
    if (needNav) {
      const qs = params.toString();
      navigate({ pathname: location.pathname, search: qs ? `?${qs}` : "" }, { replace: true });
    }
  }, [vendorProfileOpen, vendorProfileInitialEdit, location.pathname, location.search, navigate]);

  const loadStorefrontSnapshot = useCallback(async () => {
    try {
      const response = await fetch(
        `${API_BASE_URL}/vendor/storefront/${vendor.id}`,
        {
          headers: {
            Authorization: `Bearer ${publicAnonKey}`,
          },
        }
      );

      if (!response.ok) return;

      const data = await response.json();
      const s = data.settings;
      if (!s) return;

      setStorefrontSnapshot({
        storeName: String(s.storeName || vendor.storeName || vendor.name || "Vendor Store"),
        storeSlug: String(s.storeSlug || vendor.storeSlug || ""),
      });
      const nextLogo = pickStoreLogo(
        typeof s.logo === "string" ? s.logo : "",
        vendor.avatar
      );
      setVendorLogo(nextLogo);
      writeStorefrontSnapshotCache(vendor.id, {
        storeName: String(s.storeName || vendor.storeName || vendor.name || "Vendor Store"),
        storeSlug: String(s.storeSlug || vendor.storeSlug || ""),
        logo: nextLogo,
      });
    } catch (error) {
      console.error("Failed to load vendor storefront snapshot:", error);
    }
  }, [vendor.id, vendor.name, vendor.storeName, vendor.storeSlug, vendor.avatar]);

  useEffect(() => {
    void loadStorefrontSnapshot();
  }, [loadStorefrontSnapshot]);

  useEffect(() => {
    if (!vendorHostCleanAdmin || vendorHostCleanAdminLoading) return;
    if (pathnameUnderAdmin(location.pathname)) return;
    const m = location.pathname.match(/^\/(?:vendor|store)\/[^/]+\/admin(\/.*)?$/);
    if (!m) return;
    const tail = m[1] || "";
    const target =
      tail && tail !== "/" ? `/admin${tail.replace(/\/+$/, "")}` : "/admin";
    if (target !== location.pathname) {
      navigate(target, { replace: true });
    }
  }, [
    vendorHostCleanAdmin,
    vendorHostCleanAdminLoading,
    location.pathname,
    navigate,
  ]);

  useEffect(() => {
    if (isRenderableImageSrc(vendorLogo)) {
      void applyVendorStoreLogoFavicon(vendorLogo);
    } else {
      resetDocumentFavicon();
    }
  }, [vendorLogo]);

  useEffect(() => {
    return () => {
      resetDocumentFavicon();
    };
  }, []);

  useEffect(() => {
    const onSettingsUpdated = (e: Event) => {
      const d = (e as CustomEvent<{ vendorId?: string }>).detail;
      if (d?.vendorId === vendor.id) {
        void loadStorefrontSnapshot();
      }
    };
    window.addEventListener("vendorSettingsUpdated", onSettingsUpdated as EventListener);
    return () => window.removeEventListener("vendorSettingsUpdated", onSettingsUpdated as EventListener);
  }, [vendor.id, loadStorefrontSnapshot]);

  useEffect(() => {
    const onLogo = (e: Event) => {
      const d = (e as CustomEvent<{ vendorId?: string; logo?: string }>).detail;
      if (d?.vendorId !== vendor.id) return;
      if (typeof d.logo === "string") {
        const next = pickStoreLogo(d.logo, "");
        setVendorLogo(next);
        writeStorefrontSnapshotCache(vendor.id, {
          storeName: storefrontSnapshot?.storeName || vendor.storeName || vendor.name,
          storeSlug: storefrontSnapshot?.storeSlug || vendor.storeSlug || "",
          logo: next,
        });
      }
      void loadStorefrontSnapshot();
    };
    window.addEventListener("vendorLogoUpdated", onLogo as EventListener);
    return () => window.removeEventListener("vendorLogoUpdated", onLogo as EventListener);
  }, [
    vendor.id,
    loadStorefrontSnapshot,
    storefrontSnapshot?.storeName,
    storefrontSnapshot?.storeSlug,
    vendor.storeName,
    vendor.name,
    vendor.storeSlug,
  ]);

  // 🔗 URL SYNCHRONIZATION: Initialize from URL
  useEffect(() => {
    const section = routeParams.section;
    if (section) {
      // Promo Setting removed — old /admin/marketing links go to dashboard
      setCurrentPage((section === "marketing" ? "dashboard" : section) as VendorPage);
    } else {
      setCurrentPage("dashboard");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [routeParams.section]);

  const routeStoreSlug =
    storefrontSnapshot?.storeSlug || routeParams.storeName || vendor.storeSlug;

  // Legacy Promo Setting URL → analytics home
  useEffect(() => {
    if (routeParams.section !== "marketing") return;
    const storeName = routeStoreSlug;
    if (!storeName) return;
    const targetPath = onVendorHostCleanAdmin
      ? "/admin"
      : `/${adminPathPrefix}/${storeName}/admin`;
    navigate(targetPath, { replace: true });
  }, [
    routeParams.section,
    routeStoreSlug,
    adminPathPrefix,
    onVendorHostCleanAdmin,
    navigate,
  ]);

  // If the URL still uses an old slug after a rename, normalize to the canonical slug from storefront settings
  useEffect(() => {
    if (onVendorHostCleanAdmin) return;
    const snap = storefrontSnapshot?.storeSlug;
    const urlSlug = routeParams.storeName;
    if (!snap || !urlSlug || snap === urlSlug) return;
    if (!location.pathname.includes("/admin")) return;
    const next = location.pathname
      .replace(/^\/vendor\/[^/]+/, `/vendor/${snap}`)
      .replace(/^\/vendor\/[^/]+/, `/vendor/${snap}`);
    if (next !== location.pathname) {
      navigate(next, { replace: true });
    }
  }, [
    onVendorHostCleanAdmin,
    storefrontSnapshot?.storeSlug,
    routeParams.storeName,
    location.pathname,
    navigate,
  ]);

  // 🔗 currentPage → URL: Update URL when page changes
  const isInitialMount = useRef(true);
  useEffect(() => {
    // Skip on initial mount
    if (isInitialMount.current) {
      isInitialMount.current = false;
      return;
    }

    const storeName = routeStoreSlug;
    if (!storeName) {
      console.error("No store name available for navigation");
      return;
    }

    const targetPath = onVendorHostCleanAdmin
      ? currentPage === "dashboard"
        ? "/admin"
        : `/admin/${currentPage}`
      : currentPage === "dashboard"
        ? `/${adminPathPrefix}/${storeName}/admin`
        : `/${adminPathPrefix}/${storeName}/admin/${currentPage}`;

    if (window.location.pathname !== targetPath) {
      navigate(targetPath, { replace: false });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentPage, adminPathPrefix, routeStoreSlug, onVendorHostCleanAdmin]);

  useEffect(() => {
    setMountedPages((prev) => (prev.includes(currentPage) ? prev : [...prev, currentPage]));
  }, [currentPage]);

  // Poll vendor pending orders on a long interval (same badge behavior as super admin orders)
  useEffect(() => {
    const fetchPendingOrders = async () => {
      try {
        const response = await fetch(
          `${API_BASE_URL}/vendor/orders/${encodeURIComponent(vendor.id)}`,
          {
            headers: {
              Authorization: `Bearer ${publicAnonKey}`,
            },
          }
        );
        if (!response.ok) return;
        const data = await response.json();
        const orders = Array.isArray(data?.orders) ? data.orders : [];
        const pendingCount = orders.filter((order: any) =>
          PENDING_ORDER_STATUSES.includes(String(order?.status || "").trim().toLowerCase())
        ).length;
        setUnreadNotifications(pendingCount);
      } catch (error) {
        console.error("Error fetching vendor order badge count:", error);
      }
    };

    fetchPendingOrders();
    const interval = setInterval(fetchPendingOrders, POLLING_INTERVALS_MS.VENDOR_PORTAL_NOTIFICATIONS);

    return () => clearInterval(interval);
  }, [vendor.id]);

  useEffect(() => {
    const loadNotifications = async () => {
      try {
        const response = await notificationsApi.getAll();
        const raw = (response as { notifications?: Notification[]; data?: unknown }).notifications;
        const fromData = Array.isArray((response as { data?: unknown }).data)
          ? ((response as { data: Notification[] }).data)
          : [];
        const incoming = Array.isArray(raw) ? raw : fromData;
        setNotifications(
          incoming.map((n: any) => ({
            ...n,
            isRead: n.isRead ?? n.read ?? false,
            timestamp: n.timestamp || n.createdAt || new Date().toISOString(),
          }))
        );
      } catch {
        setNotifications([]);
      }
    };

    loadNotifications();
    const interval = setInterval(loadNotifications, POLLING_INTERVALS_MS.TOP_NAV_NOTIFICATIONS);
    return () => clearInterval(interval);
  }, []);

  const unreadApiNotifications = notifications.filter((n) => !n.isRead).length;
  const bellCount = unreadNotifications + unreadApiNotifications;

  const markNotificationAsRead = async (id: string) => {
    try {
      await notificationsApi.markAsRead(id);
      setNotifications((prev) => prev.map((n) => (n.id === id ? { ...n, isRead: true } : n)));
    } catch {
      // Optional feature; ignore failures.
    }
  };

  const markAllAsRead = async () => {
    try {
      await notificationsApi.markAllAsRead();
      setNotifications((prev) => prev.map((n) => ({ ...n, isRead: true })));
      toast.success(t("topnav.notifications.markAllReadSuccess"));
    } catch {
      // Optional feature; ignore failures.
    }
  };

  const deleteNotification = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await notificationsApi.delete(id);
      setNotifications((prev) => prev.filter((n) => n.id !== id));
      toast.success(t("topnav.notifications.deleted"));
    } catch {
      // Optional feature; ignore failures.
    }
  };

  // Update document title based on current page
  useEffect(() => {
    const titleBase =
      storefrontSnapshot?.storeName ||
      vendor.storeName ||
      vendor.name ||
      (vendor.storeSlug
        ? vendor.storeSlug
            .split("-")
            .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
            .join(" ")
        : "Vendor");
    const pageName = currentPage.charAt(0).toUpperCase() + currentPage.slice(1);
    document.title = `${titleBase} - ${pageName} | Vendor Admin`;
    return () => {
      document.title = `${titleBase} | Vendor Admin`;
    };
  }, [currentPage, vendor.storeSlug, vendor.storeName, vendor.name, storefrontSnapshot?.storeName]);

  const navigation: NavItem[] = [
    {
      id: "dashboard" as VendorPage,
      name: t("vendorAdmin.analytics"),
      icon: LayoutDashboard,
      color: "text-blue-600",
      bgColor: "bg-blue-50",
    },
    {
      id: "products" as VendorPage,
      name: t("vendorAdmin.products"),
      icon: Package,
      color: "text-green-600",
      bgColor: "bg-green-50",
      subItems: [
        { id: "products" as VendorPage, label: t("vendorAdmin.allProducts") },
        { id: "categories" as VendorPage, label: t("vendorAdmin.categories") }
      ]
    },
    {
      id: "orders" as VendorPage,
      name: t("vendorAdmin.orders"),
      icon: ShoppingCart,
      color: "text-purple-600",
      bgColor: "bg-purple-50",
    },
    {
      id: "users" as VendorPage,
      name: t("vendorAdmin.customers"),
      icon: Users,
      color: "text-teal-600",
      bgColor: "bg-teal-50",
    },
    {
      id: "finances" as VendorPage,
      name: t("vendorAdmin.finances"),
      icon: DollarSign,
      color: "text-orange-600",
      bgColor: "bg-orange-50",
    },
    {
      id: "settings" as VendorPage,
      name: t("vendorAdmin.settings"),
      icon: Settings,
      color: "text-slate-600",
      bgColor: "bg-slate-50",
    },
  ];

  const handleNavItemClick = (item: NavItem) => {
    if (item.subItems) {
      // Toggle expansion for items with sub-items
      setExpandedItems(prev => 
        prev.includes(item.id) 
          ? prev.filter(id => id !== item.id)
          : [...prev, item.id]
      );
    } else {
      // Navigate directly for items without sub-items
      setCurrentPage(item.id);
      setSidebarOpen(false);
    }
  };

  const handleSubNavClick = (subId: VendorPage) => {
    setCurrentPage(subId);
    setSidebarOpen(false);
  };

  const renderPage = (page: VendorPage) => {
    switch (page) {
      case "dashboard":
        return (
          <VendorAdminDashboard 
            vendorId={vendor.id} 
            vendorName={vendor.name}
            onNavigate={setCurrentPage}
            onPreviewStore={onPreviewStore}
          />
        );
      case "products":
        return (
          <VendorAdminProductsCRUD
            vendorId={vendor.id}
            vendorStoreSlug={vendor.storeSlug}
            vendorName={vendor.name}
            headerSearchQuery={vendorHeaderProductSearch}
            onHeaderSearchQueryChange={setVendorHeaderProductSearch}
          />
        );
      case "categories":
        return (
          <VendorAdminCategories
            vendorId={vendor.id}
            vendorName={vendor.name}
            reportLoadErrors={currentPage === "categories"}
            isActive={currentPage === "categories"}
          />
        );
      case "orders":
        return (
          <VendorAdminOrderManagement
            vendorId={vendor.id}
            vendorStoreSlug={vendor.storeSlug}
          />
        );
      case "settings":
        return (
          <VendorAdminSettings
            vendorId={vendor.id}
            vendorName={vendor.name}
            vendorLogo={vendorLogo}
            onPreviewStore={onPreviewStore}
          />
        );
      case "finances":
        return (
          <VendorAdminFinances
            vendorId={vendor.id}
            vendorName={vendor.name}
            vendorStoreSlug={vendor.storeSlug}
          />
        );
      case "users":
        return <VendorAdminUsers vendorId={vendor.id} vendorName={vendor.name} />;
      default:
        return null;
    }
  };

  if (vendorProfileOpen) {
    return (
      <UserProfile
        variant="vendor"
        user={vendorProfileSeed}
        initialEditMode={vendorProfileInitialEdit}
        backLabel={t("profile.back")}
        onBack={closeVendorProfile}
        onVendorSessionOptimistic={(patch: Partial<VendorUser>) => {
          if (authVendor) vendorSessionBeforeOptimisticRef.current = { ...authVendor };
          updateVendor(patch);
        }}
        onVendorSessionRollback={() => {
          const snap = vendorSessionBeforeOptimisticRef.current;
          vendorSessionBeforeOptimisticRef.current = null;
          if (snap) updateVendor(snap);
        }}
        onSave={(updated: Record<string, unknown>) => {
          vendorSessionBeforeOptimisticRef.current = null;
          const avatarUrl =
            typeof updated.profileImageUrl === "string" && updated.profileImageUrl.startsWith("http")
              ? updated.profileImageUrl
              : typeof updated.avatar === "string" && updated.avatar.startsWith("http")
                ? updated.avatar
                : undefined;
          updateVendor({
            name: String(updated.name ?? vendor.name),
            contactName:
              typeof updated.contactName === "string"
                ? updated.contactName
                : vendor.contactName,
            email: String(updated.email ?? vendor.email),
            phone: String(updated.phone ?? vendor.phone ?? ""),
            businessName: String(updated.businessName ?? vendor.name),
            avatar: avatarUrl,
            location: typeof updated.location === "string" ? updated.location : undefined,
          });
          setVendorProfileInitialEdit(false);
        }}
      />
    );
  }

  return (
    <div className="flex h-screen bg-slate-50 overflow-hidden">
      {/* Mobile Overlay */}
      {sidebarOpen && (
        <div 
          className="fixed inset-0 bg-black/50 z-40 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar - LIGHT DESIGN MATCHING FIRST SCREENSHOT */}
      <aside className={`
        fixed lg:static inset-y-0 left-0 z-50
        w-64 bg-white text-slate-700 h-screen flex flex-col border-r border-slate-200
        transform transition-transform duration-300 ease-in-out shadow-xl
        ${sidebarOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}
      `}>
        {/* Logo */}
        <div className="h-16 flex items-center px-6 border-b border-slate-200 relative">
          <button
            type="button"
            onClick={() => {
              setCurrentPage("dashboard");
              setSidebarOpen(false);
            }}
            className="flex items-center gap-3 hover:opacity-80 transition-opacity cursor-pointer"
          >
            {isRenderableImageSrc(vendorLogo) ? (
              <img 
                src={vendorLogo} 
                alt={storefrontSnapshot?.storeName || vendor.name}
                className="w-10 h-10 rounded-md object-cover"
                onError={() => setVendorLogo("")}
              />
            ) : (
              <div className="w-10 h-10 bg-gradient-to-br from-orange-600 to-orange-700 rounded-md flex items-center justify-center text-white">
                <Package className="w-6 h-6" />
              </div>
            )}
            <div className="flex flex-col min-w-0">
              <span className="text-lg leading-tight text-slate-900 font-bold whitespace-nowrap truncate">
                {storefrontSnapshot?.storeName || vendor.storeName || vendor.name || t("vendorAdmin.vendorStore")}
              </span>
              <span className="text-[11px] text-slate-400 font-medium tracking-widest uppercase">{vendor.businessType || t("vendorAdmin.ecommerce")}</span>
            </div>
          </button>
          {/* Mobile close button - Fixed: Now separate from logo button */}
          <button
            onClick={() => setSidebarOpen(false)}
            className="lg:hidden ml-auto text-slate-400 hover:text-slate-700 absolute right-4"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Navigation */}
        <nav className="flex-1 px-4 py-6 overflow-y-auto">
          <ul className="space-y-1.5">
            {navigation.map((item) => {
              const Icon = item.icon;
              const isActive = currentPage === item.id;
              const badge = item.id === 'orders' ? unreadNotifications : undefined;
              
              return (
                <li key={item.id}>
                  <button
                    onClick={() => handleNavItemClick(item)}
                    className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-200 group ${
                      isActive
                        ? "bg-slate-800 text-white shadow-md"
                        : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
                    }`}
                  >
                    <Icon className={`w-5 h-5`} />
                    <span className="flex-1 text-left text-sm font-medium">{item.name}</span>
                    {badge !== undefined && badge > 0 && (
                      <span className="bg-slate-900 text-white text-xs w-5 h-5 flex items-center justify-center rounded-full font-semibold">
                        {badge}
                      </span>
                    )}
                    {item.subItems && (
                      <ChevronDown 
                        className={`w-4 h-4 transition-transform duration-200 ${expandedItems.includes(item.id) ? 'rotate-180' : ''}`}
                      />
                    )}
                  </button>
                  {item.subItems && expandedItems.includes(item.id) && (
                    <ul className="mt-1 ml-4 space-y-1">
                      {item.subItems.map(subItem => (
                        <li key={subItem.id}>
                          <button
                            onClick={() => handleSubNavClick(subItem.id)}
                            className={`w-full flex items-center gap-3 px-4 py-2.5 rounded-lg transition-all text-sm ${
                              currentPage === subItem.id
                                ? "bg-slate-100 text-slate-900 font-medium"
                                : "text-slate-500 hover:bg-slate-50 hover:text-slate-700"
                            }`}
                          >
                            {subItem.label}
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </li>
              );
            })}
          </ul>
        </nav>

        {/* Footer - Created by */}
        <div className="px-6 py-4 border-t border-slate-200">
          <p className="text-xs text-slate-400 text-center">
            {t("footer.createdBy")} <span className="text-slate-600 font-medium">AungSone</span><br />
            <span className="text-slate-400">{t("footer.role")}</span>
          </p>
        </div>
      </aside>

      {/* Main Content Area */}
      <main className="flex-1 flex flex-col min-h-screen overflow-hidden">
        {/* Top Navbar - Same as Main Admin Panel */}
        <header className="h-16 bg-white border-b border-slate-200 sticky top-0 z-30">
          <div className="h-full px-4 md:px-6 flex items-center justify-between gap-2 md:gap-4">
            {/* Mobile Menu */}
            <Button 
              variant="ghost" 
              size="icon" 
              className="lg:hidden flex-shrink-0"
              onClick={() => setSidebarOpen(true)}
            >
              <Menu className="w-5 h-5" />
            </Button>

            {/* Search - Centered */}
            <div className="flex-1 flex justify-center max-w-2xl mx-auto">
              <div className="relative w-full">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <input
                  type="text"
                  placeholder={t("vendorAdmin.searchProducts")}
                  className="w-full pl-10 pr-4 py-2 text-sm bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-200 focus:border-transparent focus:bg-white transition-colors"
                  value={vendorHeaderProductSearch}
                  onChange={(e) => setVendorHeaderProductSearch(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      setCurrentPage("products");
                    }
                  }}
                  aria-label={t("vendorAdmin.searchProductsAria")}
                />
              </div>
            </div>

            {/* Right Actions - Notification & Profile */}
            <div className="flex items-center gap-1 md:gap-2 flex-shrink-0">
              {/* Notification Bell */}
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="ghost" size="icon" className="relative">
                    <Bell className="w-5 h-5" />
                    {bellCount > 0 && (
                      <span className="absolute -top-1 -right-1 w-5 h-5 flex items-center justify-center text-xs font-semibold bg-red-500 text-white border-2 border-white rounded-full">
                        {bellCount > 99 ? "99+" : bellCount}
                      </span>
                    )}
                  </Button>
                </PopoverTrigger>
                <PopoverContent align="end" className="w-[420px] p-0">
                  <div className="p-4 border-b border-slate-100 flex items-center justify-between">
                    <h3 className="font-semibold text-slate-900">{t("topnav.notifications")}</h3>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-slate-500">{tr("vendorAdmin.notificationsTotal", { count: bellCount })}</span>
                      {unreadApiNotifications > 0 && (
                        <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={markAllAsRead}>
                          {t("topnav.notifications.markAllRead")}
                        </Button>
                      )}
                    </div>
                  </div>
                  <ScrollArea className="h-[360px]">
                    <div className="p-2 space-y-2">
                      {unreadNotifications > 0 && (
                        <div className="p-3 rounded-lg bg-amber-50 border border-amber-100">
                          <div className="flex items-start gap-2">
                            <div className="w-8 h-8 rounded-full bg-amber-100 flex items-center justify-center">
                              <ShoppingCart className="w-4 h-4 text-amber-700" />
                            </div>
                            <div className="min-w-0">
                              <p className="text-sm font-semibold text-slate-900">{t("vendorAdmin.pendingOrdersAttention")}</p>
                              <p className="text-xs text-slate-600 mt-0.5">
                                {tr("vendorAdmin.pendingOrdersMessage", {
                                  count: unreadNotifications,
                                  unit: unreadNotifications === 1 ? t("topnav.notifications.orderOne") : t("topnav.notifications.orderMany"),
                                })}
                              </p>
                            </div>
                          </div>
                        </div>
                      )}
                      {notifications.length > 0 ? (
                        notifications.map((notification) => (
                          <div
                            key={notification.id}
                            className={`p-3 rounded-lg border transition-colors ${
                              notification.isRead ? "bg-white border-slate-100" : "bg-blue-50 border-blue-100"
                            }`}
                            onClick={() => !notification.isRead && markNotificationAsRead(notification.id)}
                          >
                            <div className="flex items-start justify-between gap-2">
                              <div className="flex items-start gap-2 min-w-0">
                                <div className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center shrink-0">
                                  {notification.isRead ? (
                                    <Check className="w-4 h-4 text-slate-500" />
                                  ) : (
                                    <AlertCircle className="w-4 h-4 text-blue-600" />
                                  )}
                                </div>
                                <div className="min-w-0">
                                  <p className="text-sm font-semibold text-slate-900 truncate">{notification.title}</p>
                                  <p className="text-xs text-slate-600 mt-0.5 line-clamp-2">{notification.message}</p>
                                  <p className="text-[11px] text-slate-400 mt-1">
                                    {new Date(notification.timestamp).toLocaleString()}
                                  </p>
                                </div>
                              </div>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-7 w-7 text-slate-400 hover:text-red-600"
                                onClick={(e) => deleteNotification(notification.id, e)}
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </Button>
                            </div>
                          </div>
                        ))
                      ) : unreadNotifications === 0 ? (
                        <div className="p-10 text-center text-slate-500 text-sm">{t("vendorAdmin.noNotifications")}</div>
                      ) : null}
                    </div>
                  </ScrollArea>
                </PopoverContent>
              </Popover>

              {/* User Profile Dropdown */}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button className="flex items-center gap-2 hover:bg-slate-50 rounded-lg px-2 py-1.5 transition-colors">
                    <img
                      src={vendorNavAvatarSrc(vendor)}
                      alt={vendor.name}
                      className="w-8 h-8 rounded-full object-cover bg-slate-100 ring-1 ring-slate-200"
                    />
                    <div className="hidden md:block text-left">
                      <p className="text-sm font-semibold text-slate-900 leading-tight">
                        {vendor.contactName?.trim() || vendor.name}
                      </p>
                      <p className="text-xs text-blue-600 font-medium">{t("vendorAdmin.vendorAdminRole")}</p>
                    </div>
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-56">
                  <div className="px-3 py-2 border-b border-slate-100">
                    <p className="text-sm font-semibold text-slate-900">
                      {vendor.contactName?.trim() || vendor.name}
                    </p>
                    <p className="text-xs text-slate-500">{vendor.email}</p>
                  </div>
                  <DropdownMenuItem
                    onClick={() => {
                      setVendorProfileInitialEdit(false);
                      setVendorProfileOpen(true);
                    }}
                  >
                    <User className="w-4 h-4 mr-2" />
                    {t("topnav.menu.viewProfile")}
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={() => {
                      setVendorProfileInitialEdit(true);
                      setVendorProfileOpen(true);
                      setSidebarOpen(false);
                    }}
                  >
                    <Edit className="w-4 h-4 mr-2" />
                    {t("topnav.menu.editProfile")}
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    onClick={onLogout}
                    className="text-red-600 focus:text-red-600 focus:bg-red-50"
                  >
                    <LogOut className="w-4 h-4 mr-2" />
                    {t("topnav.menu.signOut")}
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>
        </header>

        {/* Content Area */}
        <div className="flex-1 overflow-y-auto p-6">
          {mountedPages.map((page) => (
            <section
              key={page}
              className={currentPage === page ? "block" : "hidden"}
              aria-hidden={currentPage === page ? "false" : "true"}
            >
              {renderPage(page)}
            </section>
          ))}
        </div>
      </main>
    </div>
  );
}