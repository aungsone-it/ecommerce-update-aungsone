import { useState, useEffect, useRef, useCallback } from "react";
import { useNavigate, useLocation } from "react-router";
import {
  pathnameUnderAdmin,
  resolveVendorSubdomainStoreSlug,
  useVendorAdminRouteParams,
} from "../utils/vendorSubdomainHooks";
import { 
  LayoutDashboard, 
  Package, 
  ShoppingCart, 
  Settings, 
  Store, 
  LogOut, 
  Menu, 
  X, 
  Eye,
  DollarSign,
  Tag,
  ChevronDown,
  Bell,
  Search,
  Users
} from "lucide-react";
import { Button } from "./ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "./ui/dropdown-menu";
import { notificationsApi } from "../../utils/api";
import { POLLING_INTERVALS_MS } from "../../constants";
import { VendorAdminDashboard } from "./vendor-admin/VendorAdminDashboard";
import { VendorAdminProductsCRUD } from "./vendor-admin/VendorAdminProductsCRUD";
import { VendorAdminCategories } from "./vendor-admin/VendorAdminCategories";
import { VendorAdminOrderManagement } from "./vendor-admin/VendorAdminOrderManagement";
import { VendorAdminSettings } from "./vendor-admin/VendorAdminSettings";
import { VendorAdminFinances } from "./vendor-admin/VendorAdminFinances";
import { VendorAdminUsers } from "./vendor-admin/VendorAdminUsers";
import { projectId, publicAnonKey } from "../../../utils/supabase/info";

interface Vendor {
  id: string;
  name: string;
  email: string;
  phone: string;
  location: string;
  avatar?: string;
  storeSlug: string;
  /** Public display name from storefront settings (may differ from account `name`). */
  storeName?: string;
  businessType?: string;
}

interface VendorAdminPortalProps {
  vendor: Vendor;
  onLogout: () => void;
  onPreviewStore?: (vendorId: string, storeSlug: string) => void;
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

export function VendorAdminPortal({ vendor, onLogout, onPreviewStore }: VendorAdminPortalProps) {
  const routeParams = useVendorAdminRouteParams();
  const navigate = useNavigate();
  const location = useLocation();
  const vendorSubdomainSlug = resolveVendorSubdomainStoreSlug();
  const onVendorSubdomainAdmin =
    !!vendorSubdomainSlug && pathnameUnderAdmin(location.pathname);
  /** /store/<slug>/admin vs legacy /vendor/<slug>/admin (not used on vendor subdomain /admin) */
  const adminPathPrefix = location.pathname.startsWith("/store/") ? "store" : "vendor";
  const [currentPage, setCurrentPage] = useState<VendorPage>("dashboard");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [expandedItems, setExpandedItems] = useState<VendorPage[]>(["products"]); // Auto-expand Products
  const [unreadNotifications, setUnreadNotifications] = useState(0);
  const [vendorLogo, setVendorLogo] = useState<string>("");
  /** Canonical storefront label + slug from KV (drives sidebar + URLs after rename). */
  const [storefrontSnapshot, setStorefrontSnapshot] = useState<{
    storeName: string;
    storeSlug: string;
  } | null>(null);
  /** Header search — synced with Products screen (client filter; no API per keystroke). */
  const [vendorHeaderProductSearch, setVendorHeaderProductSearch] = useState("");

  const loadStorefrontSnapshot = useCallback(async () => {
    try {
      const response = await fetch(
        `https://${projectId}.supabase.co/functions/v1/make-server-16010b6f/vendor/storefront/${vendor.id}`,
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
      setVendorLogo(typeof s.logo === "string" ? s.logo : "");
    } catch (error) {
      console.error("Failed to load vendor storefront snapshot:", error);
    }
  }, [vendor.id, vendor.name, vendor.storeName, vendor.storeSlug]);

  useEffect(() => {
    void loadStorefrontSnapshot();
  }, [loadStorefrontSnapshot]);

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
        setVendorLogo(d.logo);
      }
      void loadStorefrontSnapshot();
    };
    window.addEventListener("vendorLogoUpdated", onLogo as EventListener);
    return () => window.removeEventListener("vendorLogoUpdated", onLogo as EventListener);
  }, [vendor.id, loadStorefrontSnapshot]);

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
    const targetPath = onVendorSubdomainAdmin
      ? "/admin"
      : `/${adminPathPrefix}/${storeName}/admin`;
    navigate(targetPath, { replace: true });
  }, [
    routeParams.section,
    routeStoreSlug,
    adminPathPrefix,
    onVendorSubdomainAdmin,
    navigate,
  ]);

  // If the URL still uses an old slug after a rename, normalize to the canonical slug from storefront settings
  useEffect(() => {
    if (onVendorSubdomainAdmin) return;
    const snap = storefrontSnapshot?.storeSlug;
    const urlSlug = routeParams.storeName;
    if (!snap || !urlSlug || snap === urlSlug) return;
    if (!location.pathname.includes("/admin")) return;
    const next = location.pathname
      .replace(/^\/store\/[^/]+/, `/store/${snap}`)
      .replace(/^\/vendor\/[^/]+/, `/vendor/${snap}`);
    if (next !== location.pathname) {
      navigate(next, { replace: true });
    }
  }, [
    onVendorSubdomainAdmin,
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

    const targetPath = onVendorSubdomainAdmin
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
  }, [currentPage, adminPathPrefix, routeStoreSlug, onVendorSubdomainAdmin]);

  // Poll for notifications on a long interval (see POLLING_INTERVALS_MS.VENDOR_PORTAL_NOTIFICATIONS)
  useEffect(() => {
    const fetchNotifications = async () => {
      try {
        const response = await notificationsApi.getAll();
        if (response.success) {
          setUnreadNotifications(response.unreadCount || 0);
        }
      } catch (error) {
        console.error("Error fetching notifications:", error);
      }
    };

    fetchNotifications();
    const interval = setInterval(fetchNotifications, POLLING_INTERVALS_MS.VENDOR_PORTAL_NOTIFICATIONS);

    return () => clearInterval(interval);
  }, []);

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
    document.title = `${pageName} - ${titleBase}`;
    return () => {
      document.title = titleBase;
    };
  }, [currentPage, vendor.storeSlug, vendor.storeName, vendor.name, storefrontSnapshot?.storeName]);

  const navigation: NavItem[] = [
    {
      id: "dashboard" as VendorPage,
      name: "Analytics",
      icon: LayoutDashboard,
      color: "text-blue-600",
      bgColor: "bg-blue-50",
    },
    {
      id: "products" as VendorPage,
      name: "Products",
      icon: Package,
      color: "text-green-600",
      bgColor: "bg-green-50",
      subItems: [
        { id: "products" as VendorPage, label: "All Products" },
        { id: "categories" as VendorPage, label: "Categories" }
      ]
    },
    {
      id: "orders" as VendorPage,
      name: "Orders",
      icon: ShoppingCart,
      color: "text-purple-600",
      bgColor: "bg-purple-50",
    },
    {
      id: "users" as VendorPage,
      name: "Customers",
      icon: Users,
      color: "text-teal-600",
      bgColor: "bg-teal-50",
    },
    {
      id: "finances" as VendorPage,
      name: "Finances",
      icon: DollarSign,
      color: "text-orange-600",
      bgColor: "bg-orange-50",
    },
    {
      id: "settings" as VendorPage,
      name: "Settings",
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

  const renderContent = () => {
    switch (currentPage) {
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
        return <VendorAdminCategories vendorId={vendor.id} vendorName={vendor.name} />;
      case "orders":
        return (
          <VendorAdminOrderManagement
            vendorId={vendor.id}
            vendorStoreSlug={vendor.storeSlug}
          />
        );
      case "settings":
        return <VendorAdminSettings vendorId={vendor.id} vendorName={vendor.name} onPreviewStore={onPreviewStore} />;
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
        return (
          <VendorAdminDashboard 
            vendorId={vendor.id} 
            vendorName={vendor.name}
            onNavigate={setCurrentPage}
            onPreviewStore={onPreviewStore}
          />
        );
    }
  };

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
            onClick={() => window.location.href = '/store'}
            className="flex items-center gap-3 hover:opacity-80 transition-opacity cursor-pointer"
          >
            {vendorLogo ? (
              <img 
                src={vendorLogo} 
                alt={storefrontSnapshot?.storeName || vendor.name}
                className="w-10 h-10 rounded-md object-cover"
              />
            ) : (
              <div className="w-10 h-10 bg-gradient-to-br from-orange-600 to-orange-700 rounded-md flex items-center justify-center text-white">
                <Package className="w-6 h-6" />
              </div>
            )}
            <div className="flex flex-col min-w-0">
              <span className="text-lg leading-tight text-slate-900 font-bold whitespace-nowrap truncate">
                {storefrontSnapshot?.storeName || vendor.storeName || vendor.name || "Vendor Store"}
              </span>
              <span className="text-[11px] text-slate-400 font-medium tracking-widest uppercase">{vendor.businessType || 'E-COMMERCE'}</span>
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
            Created by <span className="text-slate-600 font-medium">AungSone</span><br />
            <span className="text-slate-400">Software Architect</span>
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
                  placeholder="Search products by name, SKU, category…"
                  className="w-full pl-10 pr-4 py-2 text-sm bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-200 focus:border-transparent focus:bg-white transition-colors"
                  value={vendorHeaderProductSearch}
                  onChange={(e) => setVendorHeaderProductSearch(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      setCurrentPage("products");
                    }
                  }}
                  aria-label="Search products"
                />
              </div>
            </div>

            {/* Right Actions - Notification & Profile */}
            <div className="flex items-center gap-1 md:gap-2 flex-shrink-0">
              {/* Notification Bell */}
              <Button variant="ghost" size="icon" className="relative">
                <Bell className="w-5 h-5" />
                {unreadNotifications > 0 && (
                  <span className="absolute -top-1 -right-1 w-5 h-5 flex items-center justify-center text-xs font-semibold bg-red-500 text-white border-2 border-white rounded-full">
                    {unreadNotifications}
                  </span>
                )}
              </Button>

              {/* User Profile Dropdown */}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button className="flex items-center gap-2 hover:bg-slate-50 rounded-lg px-2 py-1.5 transition-colors">
                    {vendor.avatar ? (
                      <img 
                        src={vendor.avatar} 
                        alt={vendor.name}
                        className="w-8 h-8 rounded-full object-cover"
                      />
                    ) : (
                      <div className="w-8 h-8 bg-gradient-to-br from-blue-600 to-blue-700 rounded-full flex items-center justify-center">
                        <span className="text-white font-semibold text-sm">
                          {vendor.name.substring(0, 1).toUpperCase()}
                        </span>
                      </div>
                    )}
                    <div className="hidden md:block text-left">
                      <p className="text-sm font-semibold text-slate-900 leading-tight">{vendor.name}</p>
                      <p className="text-xs text-slate-500">product manager</p>
                    </div>
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-56">
                  <div className="px-3 py-2 border-b border-slate-100">
                    <p className="text-sm font-semibold text-slate-900">{vendor.name}</p>
                    <p className="text-xs text-slate-500">{vendor.email}</p>
                  </div>
                  <DropdownMenuItem onClick={() => setCurrentPage('settings')}>
                    <Settings className="w-4 h-4 mr-2" />
                    Store Settings
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={() =>
                      onPreviewStore &&
                      routeStoreSlug &&
                      onPreviewStore(vendor.id, routeStoreSlug)
                    }
                  >
                    <Eye className="w-4 h-4 mr-2" />
                    View Storefront
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={onLogout} className="text-red-600">
                    <LogOut className="w-4 h-4 mr-2" />
                    Sign Out
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>
        </header>

        {/* Content Area */}
        <div className="flex-1 overflow-y-auto p-6">
          {renderContent()}
        </div>
      </main>
    </div>
  );
}