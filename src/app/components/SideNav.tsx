// Side Navigation Component - Main navigation menu
import { useState, useEffect } from "react";
import { Home, Package, ShoppingCart, UserCheck, Megaphone, Video, MessageSquare, Users, DollarSign, Truck, FileText, Settings, ChevronDown } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "./ui/dropdown-menu";
import { useLanguage } from "../contexts/LanguageContext";
import { projectId, publicAnonKey } from "../../../utils/supabase/info";

// Use placeholder images for production deployment
const spidermanAvatar = "https://api.dicebear.com/7.x/avataaars/svg?seed=Felix";

interface SubNavItem {
  label: string;
}

interface NavItem {
  icon: React.ElementType;
  label: string;
  badge?: number;
  subItems?: SubNavItem[];
}

interface SideNavProps {
  currentPage: string;
  onNavigate: (page: string) => void;
  currentUser: any;
  onViewProfile: () => void;
  badgeCounts?: {
    orders?: number;
    vendor?: number;
    collaborator?: number;
    chat?: number;
  };
  sidebarOpen?: boolean;
  setSidebarOpen?: (open: boolean) => void;
}

export function SideNav({ currentPage, onNavigate, currentUser, onViewProfile, badgeCounts, sidebarOpen, setSidebarOpen }: SideNavProps) {
  const [expandedItems, setExpandedItems] = useState<string[]>([]);
  const { t } = useLanguage();
  const [storeLogo, setStoreLogo] = useState<string>("");
  const [storeName, setStoreName] = useState<string>("SECURE");
  
  // 🔥 Fetch store logo and name on mount
  useEffect(() => {
    const fetchSettings = async () => {
      try {
        // Add timeout and better error handling
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 5000); // 5 second timeout
        
        const response = await fetch(
          `https://${projectId}.supabase.co/functions/v1/make-server-16010b6f/settings/general`,
          {
            headers: {
              'Authorization': `Bearer ${publicAnonKey}`,
            },
            signal: controller.signal,
          }
        );
        
        clearTimeout(timeoutId);
        
        if (response.ok) {
          const data = await response.json();
          if (data.storeLogo) {
            setStoreLogo(data.storeLogo);
          }
          if (data.storeName) {
            setStoreName(data.storeName);
          }
        } else {
          console.warn('⚠️ Settings API returned non-OK status:', response.status);
        }
      } catch (error: any) {
        // Only log if it's not a timeout/abort error - server might still be warming up
        if (error.name !== 'AbortError') {
          console.warn('⚠️ Settings fetch failed (server warming up):', error.message);
        }
        // Silently fail - use default values
      }
    };
    
    fetchSettings();
    
    // 🔥 Listen for logo updates from Settings component
    const handleLogoUpdate = (event: CustomEvent) => {
      console.log('🔄 Logo/Name updated via event:', event.detail);
      if (event.detail.logoUrl) {
        setStoreLogo(event.detail.logoUrl);
      }
      if (event.detail.storeName) {
        setStoreName(event.detail.storeName);
      }
    };
    
    window.addEventListener('logoUpdated', handleLogoUpdate as EventListener);
    
    return () => {
      window.removeEventListener('logoUpdated', handleLogoUpdate as EventListener);
    };
  }, []);
  
  // 🔒 Enhanced body scroll lock when sidebar is open on mobile
  useEffect(() => {
    // Only lock scroll on mobile (below lg breakpoint)
    if (window.innerWidth < 1024) {
      if (sidebarOpen) {
        // Save current scroll position
        const scrollY = window.scrollY;
        
        // Lock body scroll with multiple techniques for maximum compatibility
        document.body.style.position = 'fixed';
        document.body.style.top = `-${scrollY}px`;
        document.body.style.width = '100%';
        document.body.style.overflow = 'hidden';
        
        // Also lock html element
        document.documentElement.style.overflow = 'hidden';
        
        return () => {
          // Restore scroll position and unlock
          document.body.style.position = '';
          document.body.style.top = '';
          document.body.style.width = '';
          document.body.style.overflow = '';
          document.documentElement.style.overflow = '';
          window.scrollTo(0, scrollY);
        };
      }
    }
    
    // Cleanup
    return () => {
      document.body.style.position = '';
      document.body.style.top = '';
      document.body.style.width = '';
      document.body.style.overflow = '';
      document.documentElement.style.overflow = '';
    };
  }, [sidebarOpen]);

  // Helper function to get translation key for navigation items
  const getNavKey = (label: string): string => {
    const keyMap: Record<string, string> = {
      'Home': 'nav.home',
      'Product': 'nav.product',
      'Orders': 'nav.orders',
      'Vendor': 'nav.vendor',
      'Collaborator': 'nav.collaborator',
      'Discount': 'nav.discount',
      'Promo Setting': 'nav.promoSetting',
      'Marketing': 'nav.marketing',
      'Live stream': 'nav.liveStream',
      'Chat': 'nav.chat',
      'Customers': 'nav.customers',
      'Finances': 'nav.finances',
      'Logistics': 'nav.logistics',
      'Blog post': 'nav.blogPost',
      'Settings': 'nav.settings',
      'Categories': 'nav.categories',
      'Inventory': 'nav.inventory',
      'Blog category': 'nav.blogCategory',
    };
    return keyMap[label] || label;
  };

  // Dynamic nav items with badges from props
  const navItems: NavItem[] = [
    { icon: Home, label: "Home" },
    { 
      icon: Package, 
      label: "Product",
      subItems: [
        { label: "Product" },
        { label: "Categories" },
        { label: "Inventory" },
      ]
    },
    { icon: ShoppingCart, label: "Orders", badge: badgeCounts?.orders || 0 },
    { icon: UserCheck, label: "Vendor", badge: badgeCounts?.vendor || 0 },
    // TEMPORARILY HIDDEN - Collaborator Navigation
    // { icon: UserCheck, label: "Collaborator", badge: badgeCounts?.collaborator || 0 },
    { icon: Megaphone, label: "Promo Setting" },
    // TEMPORARILY HIDDEN - Live stream Navigation
    // { icon: Video, label: "Live stream" },
    { icon: MessageSquare, label: "Chat", badge: badgeCounts?.chat || 0 },
    { icon: Users, label: "Customers" },
    { icon: DollarSign, label: "Finances" },
    // TEMPORARILY HIDDEN - Logistics Navigation
    // { icon: Truck, label: "Logistics" },
    // HIDDEN: Blog post section (can be restored later)
    // { 
    //   icon: FileText, 
    //   label: "Blog post",
    //   subItems: [
    //     { label: "Blog post" },
    //     { label: "Blog category" },
    //   ]
    // },
    { icon: Settings, label: "Settings" },
  ];

  // Auto-expand Product section if we're on a product sub-page
  useEffect(() => {
    if (["Product", "Categories", "Inventory"].includes(currentPage)) {
      setExpandedItems(prev => prev.includes("Product") ? prev : [...prev, "Product"]);
    }
    // HIDDEN: Blog post auto-expand
    // if (["Blog post", "Blog category"].includes(currentPage)) {
    //   setExpandedItems(prev => prev.includes("Blog post") ? prev : [...prev, "Blog post"]);
    // }
  }, [currentPage]);

  const toggleExpand = (label: string) => {
    setExpandedItems(prev => 
      prev.includes(label) 
        ? prev.filter(item => item !== label)
        : [...prev, label]
    );
  };

  const handleNavClick = (item: NavItem) => {
    if (item.subItems) {
      toggleExpand(item.label);
    } else {
      onNavigate(item.label);
    }
  };

  const handleSubNavClick = (subLabel: string) => {
    onNavigate(subLabel);
  };

  return (
    <aside className={`
      w-64 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 h-screen fixed left-0 top-0 flex flex-col border-r border-slate-200 dark:border-slate-700 z-50 
      transition-transform duration-300 ease-in-out shadow-2xl shadow-slate-200/60 dark:shadow-black/40
      lg:translate-x-0
      ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}
    `}>
      {/* Logo */}
      <button 
        onClick={() => window.location.href = '/store'}
        className="h-16 flex items-center px-6 border-b border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors cursor-pointer w-full"
      >
        <div className="flex items-center gap-3">
          <div className="relative">
            {storeLogo ? (
              <img
                src={storeLogo}
                alt={`${storeName} Logo`}
                className="w-10 h-10 object-cover rounded-md"
                onError={(e) => {
                  // Fallback to default logo if uploaded logo fails to load
                  e.currentTarget.style.display = 'none';
                  const fallback = e.currentTarget.nextElementSibling;
                  if (fallback) (fallback as HTMLElement).style.display = 'flex';
                }}
              />
            ) : null}
            {/* Default text-based logo fallback */}
            <div 
              className="w-10 h-10 bg-gradient-to-br from-slate-700 to-slate-900 rounded-md flex items-center justify-center text-white font-bold text-lg"
              style={{ display: storeLogo ? 'none' : 'flex' }}
            >
              M
            </div>
          </div>
          <div className="flex flex-col">
            <span className="text-xl leading-tight text-slate-900 dark:text-white uppercase font-bold" style={{ fontFamily: 'Rubik, sans-serif', letterSpacing: '0.05em' }}>{storeName}</span>
            <span className="text-xs text-slate-400 dark:text-slate-500 font-medium tracking-widest uppercase">E-Commerce</span>
          </div>
        </div>
      </button>

      {/* Navigation */}
      <nav className="flex-1 px-4 py-6 overflow-y-auto scrollbar-thin scrollbar-track-transparent scrollbar-thumb-slate-300 dark:scrollbar-thumb-slate-600 hover:scrollbar-thumb-slate-400 dark:hover:scrollbar-thumb-slate-500 scrollbar-thumb-rounded-full">
        <ul className="space-y-1.5">
          {navItems.map((item) => {
            const isActive = currentPage === item.label;
            
            return (
              <li key={item.label}>
                <button
                  onClick={() => handleNavClick(item)}
                  className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-300 group ${
                    isActive
                      ? "bg-slate-800 dark:bg-slate-600 text-white shadow-lg shadow-slate-800/30 dark:shadow-slate-600/30"
                      : "text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 hover:text-slate-900 dark:hover:text-white"
                  }`}
                >
                  <item.icon className={`w-5 h-5 transition-transform duration-300 ${!isActive && 'group-hover:scale-110'}`} />
                  <span className="flex-1 text-left text-sm font-medium">{t(getNavKey(item.label))}</span>
                  {item.badge !== undefined && item.badge > 0 && (
                    <span className="text-white text-xs px-2.5 py-1 rounded-full font-semibold shadow-md bg-slate-900">
                      {item.badge}
                    </span>
                  )}
                  {item.subItems && (
                    <ChevronDown 
                      className={`w-4 h-4 transition-transform duration-300 ${
                        expandedItems.includes(item.label) && "rotate-180"
                      }`}
                    />
                  )}
                </button>
                
                {/* Sub Navigation */}
                {item.subItems && expandedItems.includes(item.label) && (
                  <ul className="mt-2 ml-6 space-y-1 border-l-2 border-slate-200 dark:border-slate-700 pl-4">
                    {item.subItems.map((subItem) => {
                      const isSubActive = currentPage === subItem.label;
                      
                      return (
                        <li key={subItem.label}>
                          <button
                            onClick={() => handleSubNavClick(subItem.label)}
                            className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all duration-300 ${
                              isSubActive
                                ? "bg-slate-100 dark:bg-slate-700 text-slate-900 dark:text-white font-medium shadow-md"
                                : "text-slate-500 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-700/50 hover:text-slate-900 dark:hover:text-white hover:shadow-sm"
                            }`}
                          >
                            <div className={`w-1.5 h-1.5 rounded-full transition-all duration-300 ${
                              isSubActive ? 'bg-slate-900 dark:bg-slate-200 scale-125 shadow-sm' : 'bg-slate-300 dark:bg-slate-600'
                            }`} />
                            <span className="flex-1 text-left text-sm">{t(getNavKey(subItem.label))}</span>
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </li>
            );
          })}
        </ul>
      </nav>

      {/* Creator Credit */}
      <div className="p-4 border-t border-slate-200 dark:border-slate-700">
        <div className="text-center">
          <p className="text-[10px] text-slate-400 dark:text-slate-500 font-medium">
            {t('footer.createdBy')} <span className="text-slate-600 dark:text-slate-400 font-semibold">AungSone</span>
          </p>
          <p className="text-[10px] text-slate-400 dark:text-slate-500">{t('footer.role')}</p>
        </div>
      </div>
    </aside>
  );
}