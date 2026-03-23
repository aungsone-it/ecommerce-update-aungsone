import { useState, useEffect, useRef, useCallback } from "react";
import { useSearchParams, useParams, useNavigate } from "react-router";
import { toast } from "sonner";
import { projectId, publicAnonKey } from "../../../utils/supabase/info";
import type { User } from "../types/user";
import type { Order } from "../types";
import { useAuth } from "../contexts/AuthContext";
import { Dashboard } from "../components/Dashboard";
import { ProductList } from "../components/ProductList";
import { Categories } from "../components/Categories";
import { Inventory } from "../components/Inventory";
import { Orders } from "../components/Orders";
import { CustomersEnhanced } from "../components/CustomersEnhanced";
import { Chat } from "../components/Chat";
import { Marketing } from "../components/Marketing";
import { LiveStreamMulti } from "../components/LiveStreamMulti";
import { BlogPost } from "../components/BlogPost";
import { Vendor } from "../components/Vendor";
import { VendorProfile } from "../components/VendorProfile";
import { VendorApplications } from "../components/VendorApplications";
import { VendorPromotions } from "../components/VendorPromotions";
import { Collaborator } from "../components/Collaborator";
import { CollaboratorProfile } from "../components/CollaboratorProfile";
import { CollaboratorApplications } from "../components/CollaboratorApplications";
import { Finances } from "../components/Finances";
import { Logistics } from "../components/Logistics";
import { Settings } from "../components/Settings";
import { SideNav } from "../components/SideNav";
import { TopNav } from "../components/TopNav";
import { UserProfile } from "../components/UserProfile";
import { OrderDetails } from "../components/OrderDetails";
import { ServerDiagnostics } from "../components/ServerDiagnostics";
import { useBadgeCounts } from "../hooks/useBadgeCounts";

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
} as const;

type AdminPage = typeof ADMIN_PAGES[keyof typeof ADMIN_PAGES];

export function AdminPage() {
  const [searchParams] = useSearchParams();
  const params = useParams();
  const navigate = useNavigate();
  const { refreshUser } = useAuth();
  const [currentPage, setCurrentPage] = useState<AdminPage>(ADMIN_PAGES.HOME);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [serverStatus, setServerStatus] = useState<'checking' | 'online' | 'offline'>('checking');
  const [viewingUserProfile, setViewingUserProfile] = useState<User | null>(null);
  const [viewingOrder, setViewingOrder] = useState<Order | null>(null);
  const [serverChecked, setServerChecked] = useState(false);
  const [appKey] = useState(() => Date.now());
  const [productRefreshKey, setProductRefreshKey] = useState(0);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  /** When set, Chat opens this customer's thread (from Customers → Message). */
  const [chatHandoff, setChatHandoff] = useState<{
    email: string;
    name: string;
    avatar?: string;
  } | null>(null);
  
  const { badgeCounts, loadBadgeCounts, incrementOrdersBadge } = useBadgeCounts();

  const handleChatHandoffDone = useCallback(() => setChatHandoff(null), []);

  // Current user state - can be updated when profile is saved
  const [currentUser, setCurrentUser] = useState<User>({
    id: "current-user",
    name: "Aung Sone",
    email: "aungsone@store.com",
    role: "product-manager",
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
  };

  // 🔗 URL → currentPage: Initialize from URL
  useEffect(() => {
    const section = params.section;
    if (section && sectionToPage[section]) {
      setCurrentPage(sectionToPage[section]);
    } else if (!section) {
      setCurrentPage(ADMIN_PAGES.HOME);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.section]);
  
  // 🔗 currentPage → URL: Update URL when page changes
  const isInitialMount = useRef(true);
  useEffect(() => {
    // Skip on initial mount
    if (isInitialMount.current) {
      isInitialMount.current = false;
      return;
    }
    
    const section = pageToSection[currentPage];
    const targetPath = section ? `/admin/${section}` : "/admin";
    
    // Only navigate if URL doesn't match
    if (window.location.pathname !== targetPath) {
      navigate(targetPath, { replace: false });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentPage]);

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

  // Check server health on mount
  useEffect(() => {
    let retryCount = 0;
    const maxRetries = 6;
    
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
            }, 5000);
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
          }, 5000);
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

  // Update document title based on current page
  useEffect(() => {
    const baseTitle = "SECURE E-commerce";
    if (viewingUserProfile) {
      document.title = `${viewingUserProfile.name} - ${baseTitle}`;
    } else if (viewingOrder) {
      document.title = `Order #${viewingOrder.id} - ${baseTitle}`;
    } else {
      const pageName = currentPage === 'Home' ? 'Dashboard' : currentPage;
      document.title = `${pageName} - ${baseTitle}`;
    }

    // Cleanup on unmount
    return () => {
      document.title = baseTitle;
    };
  }, [currentPage, viewingUserProfile, viewingOrder]);

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
  };

  const handleOrderUpdate = () => {
    loadBadgeCounts();
  };

  const handleProductsChanged = () => {
    console.log("🔄 Products changed - triggering refresh...");
    setProductRefreshKey(prev => prev + 1);
  };

  const handleViewVendorStorefront = (vendorId: string, storeSlug: string) => {
    // Always use vendor ID for navigation (e.g., /vendor/vendcr-177082261392)
    navigate(`/vendor/${vendorId}`);
  };

  const renderContent = () => {
    switch (currentPage) {
      case ADMIN_PAGES.HOME:
        return <Dashboard />;
      case ADMIN_PAGES.PRODUCT:
        return <ProductList key={productRefreshKey} onProductsChanged={handleProductsChanged} />;
      case ADMIN_PAGES.CATEGORIES:
        return <Categories />;
      case ADMIN_PAGES.INVENTORY:
        return <Inventory />;
      case ADMIN_PAGES.ORDERS:
        return <Orders onViewOrder={setViewingOrder} onOrderUpdate={handleOrderUpdate} />;
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
          onPreviewVendorStore={(vendorId, storeSlug) => {
            // Always use vendor ID for navigation
            navigate(`/vendor/${vendorId}`);
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
            // Always use vendor ID for navigation
            navigate(`/vendor/${vendorId}`);
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
        return <VendorApplications />;
      case ADMIN_PAGES.VENDOR_PROMOTIONS:
        return <VendorPromotions />;
      case ADMIN_PAGES.VENDOR_STORE_VIEW:
        return (
          <div className="p-8 max-w-lg">
            <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100 mb-2">
              Vendor storefront preview
            </h2>
            <p className="text-sm text-slate-600 dark:text-slate-400 mb-4">
              Open a specific vendor&apos;s shop from the marketplace URL{" "}
              <code className="text-xs bg-slate-100 dark:bg-slate-800 px-1 rounded">/store/&lt;vendor&gt;</code>
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
          onBack={() => setViewingUserProfile(null)}
          onSave={handleSaveUserProfile}
        />
      )}

      {viewingOrder && (
        <OrderDetails
          order={viewingOrder}
          onBack={() => setViewingOrder(null)}
        />
      )}

      {!viewingUserProfile && !viewingOrder && (
        <div key={appKey} className="flex h-screen bg-slate-50 dark:bg-slate-900 overflow-hidden">
          {sidebarOpen && (
            <div 
              className="fixed inset-0 bg-black/50 z-40 lg:hidden"
              onClick={() => setSidebarOpen(false)}
            />
          )}
          
          <SideNav 
            currentPage={currentPage} 
            onNavigate={(page) => {
              setCurrentPage(page);
              setSidebarOpen(false);
            }}
            currentUser={currentUser}
            onViewProfile={() => setViewingUserProfile(currentUser)}
            badgeCounts={badgeCounts}
            sidebarOpen={sidebarOpen}
            setSidebarOpen={setSidebarOpen}
          />
          
          <div className="flex-1 flex flex-col overflow-hidden lg:ml-64">
            <TopNav 
              currentUser={currentUser}
              vendorApplicationsCount={badgeCounts.vendor}
              pendingOrdersCount={badgeCounts.orders}
              chatUnreadCount={badgeCounts.chat}
              onToggleSidebar={() => setSidebarOpen(!sidebarOpen)}
              onOpenVendorApplication={() => {
                navigate("/vendor/application");
              }}
              onViewProfile={() => setViewingUserProfile(currentUser)}
              onEditProfile={() => setViewingUserProfile(currentUser)}
            />
            
            <main className="flex-1 overflow-auto pt-16 scrollbar-custom">
              {renderContent()}
            </main>
          </div>
          
          {serverStatus === 'offline' && <ServerDiagnostics />}
        </div>
      )}
    </>
  );
}