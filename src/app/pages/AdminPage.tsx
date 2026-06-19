import { lazy, Suspense, useState, useEffect, useRef, useCallback, useMemo } from "react";
import "../utils/adminStyles";
import { useSearchParams, useParams, useNavigate, useLocation } from "react-router";
import { toast } from "sonner";
import { projectId, publicAnonKey } from "../../../utils/supabase/info";
import type { User } from "../types/user";
import type { Order } from "../types";
import { useAuth } from "../contexts/AuthContext";
import {
  getAllowedSuperAdminPages,
  canAccessSuperAdminPage,
  getDefaultSuperAdminLandingPage,
} from "../utils/superAdminRolePermissions";
import { SideNav } from "../components/SideNav";
import { TopNav } from "../components/TopNav";
import { UserProfile } from "../components/UserProfile";
import { OrderDetails } from "../components/OrderDetails";
import { ServerDiagnostics } from "../components/ServerDiagnostics";
import { AdminBreadcrumb } from "../components/AdminBreadcrumb";
import { useBadgeCounts } from "../hooks/useBadgeCounts";
import { usePlatformBranding } from "../hooks/usePlatformBranding";
import { buildSuperAdminDocumentTitle } from "../utils/superAdminDocumentTitle";
import { SmartCache } from "../../utils/cache";
import { moduleCache, CACHE_KEYS } from "../utils/module-cache";
import {
  peekPendingOrdersDigestSourceMs,
  peekPendingVendorApplicationsDigestSourceMs,
} from "../utils/adminDigestSourceTimes";
import {
  adminOrdersUpdatedStorageKey,
} from "../utils/adminOrdersRealtime";

const Dashboard = lazy(() => import("../components/Dashboard").then((m) => ({ default: m.Dashboard })));
const ProductList = lazy(() => import("../components/ProductList").then((m) => ({ default: m.ProductList })));
const Categories = lazy(() => import("../components/Categories").then((m) => ({ default: m.Categories })));
const Inventory = lazy(() => import("../components/Inventory").then((m) => ({ default: m.Inventory })));
const Orders = lazy(() => import("../components/Orders").then((m) => ({ default: m.Orders })));
const CustomersEnhanced = lazy(() =>
  import("../components/CustomersEnhanced").then((m) => ({ default: m.CustomersEnhanced }))
);
const Chat = lazy(() => import("../components/Chat").then((m) => ({ default: m.Chat })));
const Marketing = lazy(() => import("../components/Marketing").then((m) => ({ default: m.Marketing })));
const LiveStreamMulti = lazy(() =>
  import("../components/LiveStreamMulti").then((m) => ({ default: m.LiveStreamMulti }))
);
const BlogPost = lazy(() => import("../components/BlogPost").then((m) => ({ default: m.BlogPost })));
const Vendor = lazy(() => import("../components/Vendor").then((m) => ({ default: m.Vendor })));
const VendorProfile = lazy(() =>
  import("../components/VendorProfile").then((m) => ({ default: m.VendorProfile }))
);
const VendorApplications = lazy(() =>
  import("../components/VendorApplications").then((m) => ({ default: m.VendorApplications }))
);
const VendorPromotions = lazy(() =>
  import("../components/VendorPromotions").then((m) => ({ default: m.VendorPromotions }))
);
const Collaborator = lazy(() =>
  import("../components/Collaborator").then((m) => ({ default: m.Collaborator }))
);
const CollaboratorProfile = lazy(() =>
  import("../components/CollaboratorProfile").then((m) => ({ default: m.CollaboratorProfile }))
);
const CollaboratorApplications = lazy(() =>
  import("../components/CollaboratorApplications").then((m) => ({ default: m.CollaboratorApplications }))
);
const Finances = lazy(() => import("../components/Finances").then((m) => ({ default: m.Finances })));
const Logistics = lazy(() => import("../components/Logistics").then((m) => ({ default: m.Logistics })));
const Settings = lazy(() => import("../components/Settings").then((m) => ({ default: m.Settings })));
const AdminGlobalSearch = lazy(() =>
  import("../components/AdminGlobalSearch").then((m) => ({ default: m.AdminGlobalSearch }))
);

const ADMIN_PAGES = {
  HOME: 'Home',
  PRODUCT: 'Product',
  CATEGORIES: 'Categories',
  INVENTORY: 'Inventory',
  ORDERS: 'Orders',
  CUSTOMERS: 'Customers',
  CHAT: 'Chat',
  DISCOUNT: 'Promo Setting',
  LIVE_STREAM: 'Live stream',
  BLOG_POST: 'Blog post',
  VENDOR: 'Vendor',
  VENDOR_PROFILE: 'Vendor profile',
  VENDOR_APPLICATIONS: 'Vendor applications',
  VENDOR_PROMOTIONS: 'Vendor promotions',
  VENDOR_STORE_VIEW: 'Vendor store view',
  COLLABORATOR: 'Collaborator',
  COLLABORATOR_PROFILE: 'Collaborator profile',
  COLLABORATOR_APPLICATIONS: 'Collaborator applications',
  FINANCES: 'Finances',
  LOGISTICS: 'Logistics',
  SETTINGS: 'Settings',
  GLOBAL_SEARCH: 'Search',
} as const;

type AdminPage = typeof ADMIN_PAGES[keyof typeof ADMIN_PAGES];

function AdminSectionFallback() {
  return (
    <div className="p-4 sm:p-8">
      <div className="space-y-4">
        <div className="h-8 w-48 animate-pulse rounded bg-slate-200" />
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-28 animate-pulse rounded-2xl bg-white shadow-sm ring-1 ring-slate-200" />
          ))}
        </div>
        <div className="h-96 animate-pulse rounded-2xl bg-white shadow-sm ring-1 ring-slate-200" />
      </div>
    </div>
  );
}

export function AdminPage() {
  const [searchParams] = useSearchParams();
  const params = useParams();
  const location = useLocation();
  /**
   * Section for `/admin/...`: explicit child routes (`orders`, `products`, …) do not set
   * `params.section` or splat `*` — derive the first segment after `/admin` from the URL.
   */
  const resolvedAdminSection = useMemo(() => {
    if (params.section) return params.section;
    const splat = params["*"];
    if (typeof splat === "string" && splat.trim()) {
      return splat.split("/").filter(Boolean)[0];
    }
    const p = (location.pathname.replace(/\/+$/, "") || "/").toLowerCase();
    if (p === "/admin") return undefined;
    const m = p.match(/^\/admin\/([^/]+)/);
    return m?.[1];
  }, [params.section, params["*"], location.pathname]);
  const navigate = useNavigate();
  const { refreshUser, user: authUser } = useAuth();
  const allowedAdminPages = useMemo(
    () => getAllowedSuperAdminPages(authUser?.role),
    [authUser?.role]
  );
  const [currentPage, setCurrentPage] = useState<AdminPage>(ADMIN_PAGES.HOME);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [serverStatus, setServerStatus] = useState<'checking' | 'online' | 'offline'>('checking');
  const [viewingUserProfile, setViewingUserProfile] = useState<User | null>(null);
  const [userProfileInitialEdit, setUserProfileInitialEdit] = useState(false);
  const [viewingOrder, setViewingOrder] = useState<Order | null>(null);
  const [serverChecked, setServerChecked] = useState(false);
  const [appKey] = useState(() => Date.now());
  const [sidebarOpen, setSidebarOpen] = useState(false);
  /** TopNav product search draft — synced with ProductList input; server `q` commits on Enter only. */
  const [adminHeaderProductSearch, setAdminHeaderProductSearch] = useState("");
  /** Product list server `q` that persists across admin navigation/remounts until explicit clear. */
  const [adminHeaderProductCommittedSearch, setAdminHeaderProductCommittedSearch] = useState("");
  /** Bumped when user presses Enter in TopNav on Products — ProductList applies `q` then. */
  const [headerProductSearchCommitTick, setHeaderProductSearchCommitTick] = useState(0);
  /** Product list total for breadcrumb «n» (All Products page only) */
  const [productListingBreadcrumbCount, setProductListingBreadcrumbCount] = useState<number | null>(
    null
  );
  /** When set, Chat opens this customer's thread (from Customers → Message). */
  const [chatHandoff, setChatHandoff] = useState<{
    email: string;
    name: string;
    avatar?: string;
  } | null>(null);
  /** Prefill list search when jumping from global search */
  const [vendorSearchPrefill, setVendorSearchPrefill] = useState<{ q: string; t: number } | null>(null);
  const [ordersSearchPrefill, setOrdersSearchPrefill] = useState<{ q: string; t: number } | null>(null);
  /** Inventory tab — draft + server `q` survive switching admin sections (same idea as ProductList + TopNav search). */
  const [inventorySearchQuery, setInventorySearchQuery] = useState("");
  const [inventoryCommittedSearchQuery, setInventoryCommittedSearchQuery] = useState("");

  const handleInventorySearchQueryChange = useCallback((value: string) => {
    setInventorySearchQuery(value);
    if (value.trim() === "") {
      setInventoryCommittedSearchQuery("");
    }
  }, []);

  const activeTopNavSearch =
    currentPage === ADMIN_PAGES.INVENTORY
      ? inventorySearchQuery
      : adminHeaderProductSearch;

  const { badgeCounts, loadBadgeCounts, incrementOrdersBadge } = useBadgeCounts();

  const platformBranding = usePlatformBranding();

  const [digestTimesTick, setDigestTimesTick] = useState(0);
  useEffect(() => {
    const onOrdersUpdated = () => {
      setDigestTimesTick((n) => n + 1);
    };
    const onStorage = (e: StorageEvent) => {
      if (e.key !== adminOrdersUpdatedStorageKey()) return;
      onOrdersUpdated();
    };
    const onVendorPrimed = () => setDigestTimesTick((n) => n + 1);
    window.addEventListener("adminOrdersUpdated", onOrdersUpdated);
    window.addEventListener("storage", onStorage);
    window.addEventListener("adminVendorApplicationsPrimed", onVendorPrimed);
    return () => {
      window.removeEventListener("adminOrdersUpdated", onOrdersUpdated);
      window.removeEventListener("storage", onStorage);
      window.removeEventListener("adminVendorApplicationsPrimed", onVendorPrimed);
    };
  }, [loadBadgeCounts]);

  const pendingOrdersDigestSourceMs = useMemo(
    () => peekPendingOrdersDigestSourceMs(),
    [badgeCounts.orders, badgeCounts.vendor, badgeCounts.chat, currentPage, digestTimesTick]
  );
  const vendorApplicationsDigestSourceMs = useMemo(
    () => peekPendingVendorApplicationsDigestSourceMs(),
    [badgeCounts.orders, badgeCounts.vendor, badgeCounts.chat, currentPage, digestTimesTick]
  );

  const handleVendorApplicationsMutated = useCallback(() => {
    moduleCache.invalidate(CACHE_KEYS.ADMIN_VENDORS);
    SmartCache.delete("badge_counts");
    void loadBadgeCounts(true);
  }, [loadBadgeCounts]);

  const handleChatHandoffDone = useCallback(() => setChatHandoff(null), []);

  // Current user state - can be updated when profile is saved
  const [currentUser, setCurrentUser] = useState<User>({
    id: "current-user",
    name: "Aung Sone",
    email: "aungsone@store.com",
    role: "store-owner",
    status: "active",
    avatar: "https://api.dicebear.com/7.x/avataaars/svg?seed=AungSone",
    lastActive: "2026-02-05",
    phone: "+95 9 123 456 789",
    location: "Yangon, Myanmar",
    bio: "Passionate Product Manager focused on delivering exceptional e-commerce experiences. Building SECURE to revolutionize online shopping in Southeast Asia.",
    createdAt: "2025-01-01T00:00:00Z",
    updatedAt: "2026-02-05T00:00:00Z",
  });

  // 🔗 URL SYNCHRONIZATION: Map section param to admin page
  const sectionToPage: Record<string, AdminPage> = {
    "products": ADMIN_PAGES.PRODUCT,
    "categories": ADMIN_PAGES.CATEGORIES,
    "inventory": ADMIN_PAGES.INVENTORY,
    "orders": ADMIN_PAGES.ORDERS,
    "customers": ADMIN_PAGES.CUSTOMERS,
    "chat": ADMIN_PAGES.CHAT,
    "marketing": ADMIN_PAGES.DISCOUNT,
    "livestream": ADMIN_PAGES.LIVE_STREAM,
    "blog": ADMIN_PAGES.BLOG_POST,
    "vendors": ADMIN_PAGES.VENDOR,
    "vendor-profile": ADMIN_PAGES.VENDOR_PROFILE,
    "vendor-applications": ADMIN_PAGES.VENDOR_APPLICATIONS,
    "vendor-promotions": ADMIN_PAGES.VENDOR_PROMOTIONS,
    "vendor-store": ADMIN_PAGES.VENDOR_STORE_VIEW,
    "collaborators": ADMIN_PAGES.COLLABORATOR,
    "collaborator-profile": ADMIN_PAGES.COLLABORATOR_PROFILE,
    "collaborator-applications": ADMIN_PAGES.COLLABORATOR_APPLICATIONS,
    "finances": ADMIN_PAGES.FINANCES,
    "logistics": ADMIN_PAGES.LOGISTICS,
    "settings": ADMIN_PAGES.SETTINGS,
    "search": ADMIN_PAGES.GLOBAL_SEARCH,
  };
  
  const pageToSection: Record<AdminPage, string> = {
    [ADMIN_PAGES.HOME]: "",
    [ADMIN_PAGES.PRODUCT]: "products",
    [ADMIN_PAGES.CATEGORIES]: "categories",
    [ADMIN_PAGES.INVENTORY]: "inventory",
    [ADMIN_PAGES.ORDERS]: "orders",
    [ADMIN_PAGES.CUSTOMERS]: "customers",
    [ADMIN_PAGES.CHAT]: "chat",
    [ADMIN_PAGES.DISCOUNT]: "marketing",
    [ADMIN_PAGES.LIVE_STREAM]: "livestream",
    [ADMIN_PAGES.BLOG_POST]: "blog",
    [ADMIN_PAGES.VENDOR]: "vendors",
    [ADMIN_PAGES.VENDOR_PROFILE]: "vendor-profile",
    [ADMIN_PAGES.VENDOR_APPLICATIONS]: "vendor-applications",
    [ADMIN_PAGES.VENDOR_PROMOTIONS]: "vendor-promotions",
    [ADMIN_PAGES.VENDOR_STORE_VIEW]: "vendor-store",
    [ADMIN_PAGES.COLLABORATOR]: "collaborators",
    [ADMIN_PAGES.COLLABORATOR_PROFILE]: "collaborator-profile",
    [ADMIN_PAGES.COLLABORATOR_APPLICATIONS]: "collaborator-applications",
    [ADMIN_PAGES.FINANCES]: "finances",
    [ADMIN_PAGES.LOGISTICS]: "logistics",
    [ADMIN_PAGES.SETTINGS]: "settings",
    [ADMIN_PAGES.GLOBAL_SEARCH]: "search",
  };

  // 🔗 URL → currentPage: Initialize from URL
  useEffect(() => {
    const section = resolvedAdminSection;
    if (section === "marketing") {
      setCurrentPage(ADMIN_PAGES.HOME);
      navigate("/admin", { replace: true });
      return;
    }
    if (section && sectionToPage[section]) {
      setCurrentPage(sectionToPage[section]);
    } else if (!section) {
      setCurrentPage(ADMIN_PAGES.HOME);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resolvedAdminSection]);

  useEffect(() => {
    if (!authUser?.id) return;
    const ext = authUser as Record<string, unknown>;
    const str = (k: string) => (typeof ext[k] === "string" ? (ext[k] as string) : undefined);
    setCurrentUser((prev) => ({
      ...prev,
      id: authUser.id,
      email: authUser.email,
      name: authUser.name,
      role: authUser.role as User["role"],
      phone: authUser.phone ?? prev.phone,
      profileImageUrl: str("profileImageUrl") ?? prev.profileImageUrl,
      avatar: str("profileImageUrl") ?? str("avatar") ?? prev.avatar,
      bio: str("bio") ?? prev.bio,
      location: str("location") ?? prev.location,
      addressLine1: str("addressLine1") ?? prev.addressLine1,
      addressLine2: str("addressLine2") ?? prev.addressLine2,
      city: str("city") ?? prev.city,
      region: str("region") ?? prev.region,
      postalCode: str("postalCode") ?? prev.postalCode,
      country: str("country") ?? prev.country,
      createdAt: str("createdAt") ?? prev.createdAt,
      updatedAt: str("updatedAt") ?? prev.updatedAt,
      authCreatedAt: str("authCreatedAt") ?? prev.authCreatedAt,
      lastSignInAt: str("lastSignInAt") ?? prev.lastSignInAt,
    }));
  }, [authUser]);

  useEffect(() => {
    if (!authUser?.role) return;
    if (canAccessSuperAdminPage(authUser.role, currentPage)) return;
    const land = getDefaultSuperAdminLandingPage(authUser.role);
    setCurrentPage(land as AdminPage);
    const sec = pageToSection[land as AdminPage];
    navigate(sec ? `/admin/${sec}` : "/admin", { replace: true });
  }, [authUser?.role, currentPage, navigate]);

  const qParam = searchParams.get("q") ?? "";

  /** Deep link /admin/search?q=… keeps header input in sync */
  useEffect(() => {
    if (resolvedAdminSection !== "search") return;
    setCurrentPage(ADMIN_PAGES.GLOBAL_SEARCH);
    setAdminHeaderProductSearch(qParam);
  }, [resolvedAdminSection, qParam]);

  useEffect(() => {
    if (currentPage !== ADMIN_PAGES.PRODUCT) setProductListingBreadcrumbCount(null);
  }, [currentPage]);
  
  // 🔗 currentPage → URL: Update URL when page changes
  const isInitialMount = useRef(true);
  useEffect(() => {
    // Skip on initial mount
    if (isInitialMount.current) {
      isInitialMount.current = false;
      return;
    }

    if (currentPage === ADMIN_PAGES.GLOBAL_SEARCH) {
      const q = adminHeaderProductSearch.trim();
      const target = q ? `/admin/search?q=${encodeURIComponent(q)}` : "/admin/search";
      const current = `${window.location.pathname}${window.location.search}`;
      if (current !== target) {
        navigate(target, { replace: true });
      }
      return;
    }

    const section = pageToSection[currentPage];
    const targetPath = section ? `/admin/${section}` : "/admin";

    if (window.location.pathname !== targetPath) {
      navigate(targetPath, { replace: false });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentPage, adminHeaderProductSearch]);

  // Initialize user data in backend
  useEffect(() => {
    const initializeUserData = async () => {
      try {
        // Check if user exists in user profiles
        const response = await fetch(
          `https://${projectId}.supabase.co/functions/v1/make-server-16010b6f/users/${currentUser.id}`,
          {
            method: "GET",
            headers: {
              Authorization: `Bearer ${publicAnonKey}`,
            },
          }
        );

        // If user doesn't exist, create it
        if (response.status === 404) {
          console.log("🔧 Initializing user data in backend...");
          const createResponse = await fetch(
            `https://${projectId}.supabase.co/functions/v1/make-server-16010b6f/users/${currentUser.id}`,
            {
              method: "PUT",
              headers: {
                Authorization: `Bearer ${publicAnonKey}`,
                "Content-Type": "application/json",
              },
              body: JSON.stringify(currentUser),
            }
          );

          if (createResponse.ok) {
            console.log("✅ User data initialized successfully");
          }
        }
        
        // Also ensure user exists in auth system for Settings page
        const authCheckResponse = await fetch(
          `https://${projectId}.supabase.co/functions/v1/make-server-16010b6f/auth/init-user`,
          {
            method: "POST",
            headers: {
              Authorization: `Bearer ${publicAnonKey}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              id: currentUser.id,
              email: currentUser.email,
              name: currentUser.name,
              phone: currentUser.phone,
              role: currentUser.role,
              password: "default_password_123", // Default password for demo
            }),
          }
        );

        if (authCheckResponse.ok) {
          console.log("✅ Auth user initialized successfully");
        }
      } catch (error) {
        console.error("❌ Error initializing user data:", error);
      }
    };

    initializeUserData();
  }, []);

  // Check server health on mount (few retries + slow backoff — avoids edge traffic bursts)
  useEffect(() => {
    let retryCount = 0;
    const maxRetries = 3;
    
    const checkServerHealth = async () => {
      try {
        console.log(`🔍 Checking server health (attempt ${retryCount + 1}/${maxRetries})...`);
        
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 8000);
        
        const response = await fetch(
          `https://${projectId}.supabase.co/functions/v1/make-server-16010b6f/health`, 
          {
            method: 'GET',
            headers: { 
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${publicAnonKey}`
            },
            signal: controller.signal,
          }
        );
        
        clearTimeout(timeoutId);
        
        if (response.ok) {
          const data = await response.json();
          setServerStatus('online');
          console.log('✅ Server is online:', data);
        } else {
          console.warn(`⚠️ Server health check failed with status: ${response.status}`);
          retryCount++;
          if (retryCount < maxRetries) {
            setServerStatus('offline');
            setTimeout(() => {
              checkServerHealth();
            }, 10000);
          } else {
            setServerStatus('offline');
            console.error('❌ Server health check failed after maximum retries');
          }
        }
      } catch (error: any) {
        if (error.name === 'AbortError') {
          console.warn('⏱️ Server health check timeout');
        } else {
          console.error('❌ Server health check error:', error.message);
        }
        
        retryCount++;
        if (retryCount < maxRetries) {
          setServerStatus('offline');
          setTimeout(() => {
            checkServerHealth();
          }, 10000);
        } else {
          setServerStatus('offline');
          console.error('❌ Server unavailable after maximum retries. The Edge Function may still be deploying.');
          console.error('💡 Please wait 30-60 seconds and refresh the page.');
        }
      }
    };

    checkServerHealth();
  }, []);

  useEffect(() => {
    const checkServer = async () => {
      try {
        setServerChecked(true);
      } catch (error) {
        console.error("Server connection check failed:", error);
        toast.error("Server Connection Issue", {
          description: "The backend server may not be deployed. Check console for details.",
          duration: 10000,
        });
        setServerChecked(true);
      }
    };

    checkServer();
  }, []);

  // Update document title — match vendor admin: `{Brand} - {Page} | Super Admin`
  useEffect(() => {
    document.title = buildSuperAdminDocumentTitle({
      pageName: currentPage === "Home" ? "Home" : currentPage,
      storeName: platformBranding.storeName,
      viewingOrderId: viewingOrder?.id ?? null,
      viewingUserName: viewingUserProfile?.name ?? null,
    });
  }, [currentPage, viewingUserProfile, viewingOrder, platformBranding.storeName]);

  const handleSaveUserProfile = async (updatedUser: User) => {
    console.log("User profile updated:", updatedUser);
    
    // If the updated user is the current user, update the current user state
    if (updatedUser.id === currentUser.id) {
      console.log("✅ Updating current user state with new data");
      setCurrentUser(updatedUser);
      
      // Also refresh the AuthContext user to update Settings and other components
      console.log("🔄 Refreshing AuthContext user...");
      await refreshUser();
    }
    
    setViewingUserProfile(null);
    setUserProfileInitialEdit(false);
  };

  const handleOrderUpdate = () => {
    void loadBadgeCounts(true);
  };

  /** ProductList refreshes its own data; remounting forced a refetch every visit — leave empty */
  const handleProductsChanged = () => {};

  const openVendorStorefrontInNewTab = (vendorId: string) => {
    const href = `/vendor/${encodeURIComponent(vendorId)}`;
    window.open(href, "_blank", "noopener,noreferrer");
  };

  const renderContent = () => {
    if (authUser?.role && !canAccessSuperAdminPage(authUser.role, currentPage)) {
      return <Dashboard />;
    }
    switch (currentPage) {
      case ADMIN_PAGES.HOME:
        return <Dashboard />;
      case ADMIN_PAGES.GLOBAL_SEARCH:
        return (
          <AdminGlobalSearch
            query={adminHeaderProductSearch}
            onNarrowProductSearch={(narrow) => {
              setAdminHeaderProductSearch(narrow);
              setCurrentPage(ADMIN_PAGES.PRODUCT);
              navigate("/admin/products", { replace: false });
            }}
            onGoToProducts={() => {
              setCurrentPage(ADMIN_PAGES.PRODUCT);
              navigate("/admin/products", { replace: false });
            }}
            onViewOrder={(o) => setViewingOrder(o)}
            onGoToOrdersWithPrefill={(prefill) => {
              setOrdersSearchPrefill({ q: prefill, t: Date.now() });
              setCurrentPage(ADMIN_PAGES.ORDERS);
              navigate("/admin/orders", { replace: false });
            }}
            onGoToVendorsWithPrefill={(prefill) => {
              setVendorSearchPrefill({ q: prefill, t: Date.now() });
              setCurrentPage(ADMIN_PAGES.VENDOR);
              navigate("/admin/vendors", { replace: false });
            }}
          />
        );
      case ADMIN_PAGES.PRODUCT:
        return (
          <ProductList
            onProductsChanged={handleProductsChanged}
            headerSearchQuery={adminHeaderProductSearch}
            onHeaderSearchQueryChange={setAdminHeaderProductSearch}
            headerCommittedSearchQuery={adminHeaderProductCommittedSearch}
            onHeaderCommittedSearchQueryChange={setAdminHeaderProductCommittedSearch}
            headerSearchCommitTick={headerProductSearchCommitTick}
            onListingCountChange={setProductListingBreadcrumbCount}
          />
        );
      case ADMIN_PAGES.CATEGORIES:
        return <Categories />;
      case ADMIN_PAGES.INVENTORY:
        return (
          <Inventory
            searchQuery={inventorySearchQuery}
            onSearchQueryChange={handleInventorySearchQueryChange}
            committedSearchQuery={inventoryCommittedSearchQuery}
            onCommittedSearchQueryChange={setInventoryCommittedSearchQuery}
          />
        );
      case ADMIN_PAGES.ORDERS:
        return (
          <Orders
            onViewOrder={setViewingOrder}
            onOrderUpdate={handleOrderUpdate}
            initialListSearchQuery={ordersSearchPrefill?.q}
            listSearchApplyToken={ordersSearchPrefill?.t}
          />
        );
      case ADMIN_PAGES.CUSTOMERS:
        return (
          <CustomersEnhanced
            onOpenChatWithCustomer={(c) => {
              setChatHandoff(c);
              setCurrentPage(ADMIN_PAGES.CHAT);
            }}
          />
        );
      case ADMIN_PAGES.CHAT:
        return (
          <Chat
            initialCustomer={chatHandoff}
            onInitialCustomerHandled={handleChatHandoffDone}
          />
        );
      case ADMIN_PAGES.DISCOUNT:
        return <Marketing />;
      case ADMIN_PAGES.LIVE_STREAM:
        return <LiveStreamMulti />;
      case ADMIN_PAGES.BLOG_POST:
        return <BlogPost />;
      case ADMIN_PAGES.VENDOR:
        return <Vendor 
          pendingApplicationsCount={badgeCounts.vendor}
          initialListSearchQuery={vendorSearchPrefill?.q}
          listSearchApplyToken={vendorSearchPrefill?.t}
          onVendorApplicationsMutated={handleVendorApplicationsMutated}
          onPreviewVendorStore={(vendorId, storeSlug) => {
            void storeSlug;
            openVendorStorefrontInNewTab(vendorId);
          }}
          onLoginAsVendor={(vendor) => {
            // Check if vendor has credentials set up
            if (!vendor.password) {
              // Vendor hasn't set up credentials yet - redirect to setup
              navigate(`/vendor/setup?email=${encodeURIComponent(vendor.email)}`);
            } else {
              // Vendor has credentials - go to login using vendor ID
              navigate(`/vendor/${vendor.id}/admin`);
            }
          }}
        />;
      case ADMIN_PAGES.VENDOR_PROFILE:
        return <VendorProfile 
          onPreviewVendorStore={(vendorId, storeSlug) => {
            void storeSlug;
            openVendorStorefrontInNewTab(vendorId);
          }}
          onLoginAsVendor={(vendor) => {
            // Check if vendor has credentials set up
            if (!vendor.password) {
              // Vendor hasn't set up credentials yet - redirect to setup
              navigate(`/vendor/setup?email=${encodeURIComponent(vendor.email)}`);
            } else {
              // Vendor has credentials - go to login using vendor ID
              navigate(`/vendor/${vendor.id}/admin`);
            }
          }}
        />;
      case ADMIN_PAGES.VENDOR_APPLICATIONS:
        return (
          <VendorApplications
            onBack={() => navigate("/admin")}
            onNavigateToVendorList={() => {
              setCurrentPage(ADMIN_PAGES.VENDOR);
              navigate("/admin/vendors");
            }}
            onApplicationsMutated={handleVendorApplicationsMutated}
          />
        );
      case ADMIN_PAGES.VENDOR_PROMOTIONS:
        return <VendorPromotions />;
      case ADMIN_PAGES.VENDOR_STORE_VIEW:
        return (
          <div className="p-8 max-w-lg">
            <h2 className="text-lg font-semibold text-slate-900 mb-2">
              Vendor storefront preview
            </h2>
            <p className="text-sm text-slate-600 mb-4">
              Open a specific vendor&apos;s shop from the marketplace URL{" "}
              <code className="text-xs bg-slate-100 px-1 rounded">/vendor/&lt;slug&gt;</code>
              , or use <strong>Preview store</strong> on a vendor in the Vendors list. This admin section does not
              embed a store without choosing which vendor.
            </p>
            <button
              type="button"
              className="text-sm font-medium text-amber-700 hover:underline"
              onClick={() => navigate("/admin/vendors")}
            >
              Go to Vendors
            </button>
          </div>
        );
      case ADMIN_PAGES.COLLABORATOR:
        return <Collaborator />;
      case ADMIN_PAGES.COLLABORATOR_PROFILE:
        return <CollaboratorProfile />;
      case ADMIN_PAGES.COLLABORATOR_APPLICATIONS:
        return <CollaboratorApplications />;
      case ADMIN_PAGES.FINANCES:
        return <Finances />;
      case ADMIN_PAGES.LOGISTICS:
        return <Logistics />;
      case ADMIN_PAGES.SETTINGS:
        return <Settings />;
      default:
        return <Dashboard />;
    }
  };

  return (
    <>
      {viewingUserProfile && (
        <UserProfile
          user={viewingUserProfile}
          initialEditMode={userProfileInitialEdit}
          backLabel="Back"
          onBack={() => {
            setViewingUserProfile(null);
            setUserProfileInitialEdit(false);
          }}
          onSave={handleSaveUserProfile}
        />
      )}

      {viewingOrder && (
        <OrderDetails
          order={viewingOrder as any}
          onBack={() => setViewingOrder(null)}
          onOrderUpdated={handleOrderUpdate}
        />
      )}

      {!viewingUserProfile && !viewingOrder && (
        <div key={appKey} className="flex h-screen bg-slate-50 overflow-hidden">
          {sidebarOpen && (
            <div 
              className="fixed inset-0 bg-black/50 z-40 lg:hidden"
              onClick={() => setSidebarOpen(false)}
            />
          )}
          
          <SideNav 
            currentPage={currentPage} 
            onNavigate={(page) => {
              setVendorSearchPrefill(null);
              setOrdersSearchPrefill(null);
              setCurrentPage(page);
              setSidebarOpen(false);
            }}
            currentUser={currentUser}
            onViewProfile={() => {
              setUserProfileInitialEdit(false);
              setViewingUserProfile(currentUser);
            }}
            badgeCounts={badgeCounts}
            sidebarOpen={sidebarOpen}
            setSidebarOpen={setSidebarOpen}
            allowedPageLabels={authUser?.role ? allowedAdminPages : undefined}
          />
          
          <div className="flex-1 flex flex-col overflow-hidden lg:ml-64">
            <TopNav 
              currentUser={currentUser}
              vendorApplicationsCount={badgeCounts.vendor}
              pendingOrdersCount={badgeCounts.orders}
              chatUnreadCount={badgeCounts.chat}
              pendingOrdersDigestSourceMs={pendingOrdersDigestSourceMs}
              vendorApplicationsDigestSourceMs={vendorApplicationsDigestSourceMs}
              showAdminGlobalSearch={allowedAdminPages.has("Search")}
              onToggleSidebar={() => setSidebarOpen(!sidebarOpen)}
              onOpenVendorApplication={() => {
                navigate("/vendor/application");
              }}
              onViewProfile={() => {
                setUserProfileInitialEdit(false);
                setViewingUserProfile(currentUser);
              }}
              onEditProfile={() => {
                setUserProfileInitialEdit(true);
                setViewingUserProfile(currentUser);
              }}
              adminGlobalSearch={activeTopNavSearch}
              onAdminGlobalSearchChange={(value) => {
                if (currentPage === ADMIN_PAGES.INVENTORY) {
                  handleInventorySearchQueryChange(value);
                  return;
                }
                setAdminHeaderProductSearch(value);
              }}
              onAdminGlobalSearchSubmit={() => {
                if (currentPage === ADMIN_PAGES.PRODUCT) {
                  setHeaderProductSearchCommitTick((n) => n + 1);
                  return;
                }
                if (currentPage === ADMIN_PAGES.INVENTORY) {
                  setInventoryCommittedSearchQuery(inventorySearchQuery.trim());
                  return;
                }
                const q = adminHeaderProductSearch.trim();
                setCurrentPage(ADMIN_PAGES.GLOBAL_SEARCH);
                navigate(q ? `/admin/search?q=${encodeURIComponent(q)}` : "/admin/search", {
                  replace: false,
                });
              }}
            />
            
            <main className="flex-1 overflow-auto pt-16 scrollbar-custom">
              {currentPage !== ADMIN_PAGES.CHAT && (
                <div className="sticky top-0 z-10 bg-slate-50/95 backdrop-blur-sm px-4 sm:px-8 py-2">
                  <AdminBreadcrumb
                    currentPage={currentPage}
                    onNavigate={(page) => {
                      setCurrentPage(page as AdminPage);
                      setSidebarOpen(false);
                    }}
                    listingCount={
                      currentPage === ADMIN_PAGES.PRODUCT ? productListingBreadcrumbCount : null
                    }
                  />
                </div>
              )}
              <Suspense fallback={<AdminSectionFallback />}>
                {renderContent()}
              </Suspense>
            </main>
          </div>
          
          {serverStatus === 'offline' && <ServerDiagnostics />}
        </div>
      )}
    </>
  );
}