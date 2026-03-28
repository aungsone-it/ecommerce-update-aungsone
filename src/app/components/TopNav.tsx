import { useState, useEffect } from "react";
import { POLLING_INTERVALS_MS } from "../../constants";
import { Bell, Search, Menu, Check, Clock, Store, Package, Star, ShoppingCart, AlertCircle, User, Edit, Trash2, LogOut, MessageSquare } from "lucide-react";
import { Button } from "./ui/button";
import { Badge } from "./ui/badge";
import { Input } from "./ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "./ui/popover";
import { ScrollArea } from "./ui/scroll-area";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "./ui/dropdown-menu";
import { notificationsApi } from "../../utils/api";
import { toast } from "sonner";
import { useAuth } from "../contexts/AuthContext";
import { useLanguage } from "../contexts/LanguageContext";

interface TopNavProps {
  currentUser: any;
  onToggleSidebar?: () => void;
  onOpenVendorApplication?: () => void; // 🔥 NEW: Open vendor application form
  vendorApplicationsCount?: number; // 🔥 NEW: Pending vendor applications count
  pendingOrdersCount?: number; // 🔥 NEW: Pending orders count
  /** Unread customer chat messages (summed per conversation). */
  chatUnreadCount?: number;
  onViewProfile?: () => void; // 🔥 NEW: View current user profile
  onEditProfile?: () => void; // 🔥 NEW: Edit current user profile
  /** Super-admin header search (synced with Products list; client-side filter). */
  adminGlobalSearch?: string;
  onAdminGlobalSearchChange?: (value: string) => void;
  /** Enter in search — e.g. jump to Products. */
  onAdminGlobalSearchSubmit?: () => void;
}

interface Notification {
  id: string;
  type: "order" | "product" | "review" | "system";
  title: string;
  message: string;
  timestamp: string;
  isRead: boolean;
}

// Icon mapping for notification types
const iconMap = {
  order: ShoppingCart,
  product: Package,
  review: Star,
  system: AlertCircle,
};

const iconColorMap = {
  order: "bg-blue-500",
  product: "bg-green-500",
  review: "bg-yellow-500",
  system: "bg-red-500",
};

export function TopNav({
  currentUser,
  onToggleSidebar,
  onOpenVendorApplication,
  vendorApplicationsCount,
  pendingOrdersCount,
  chatUnreadCount = 0,
  onViewProfile,
  onEditProfile,
  adminGlobalSearch,
  onAdminGlobalSearchChange,
  onAdminGlobalSearchSubmit,
}: TopNavProps) {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);

  // Fetch notifications from database
  useEffect(() => {
    loadNotifications();
    
    const interval = setInterval(loadNotifications, POLLING_INTERVALS_MS.TOP_NAV_NOTIFICATIONS);
    return () => clearInterval(interval);
  }, []);

  const loadNotifications = async () => {
    try {
      const response = await notificationsApi.getAll();
      setNotifications(response.notifications || []);
    } catch (error) {
      // Silently fail - notifications are optional feature
      setNotifications([]); // Set empty array so UI still works
    } finally {
      setLoading(false);
    }
  };

  const unreadCount = notifications.filter(n => !n.isRead).length;
  
  // 🔥 Add vendor applications, pending orders, and unread chat to bell badge total
  const totalNotificationCount =
    unreadCount +
    (vendorApplicationsCount || 0) +
    (pendingOrdersCount || 0) +
    (chatUnreadCount || 0);

  const bellBadgeLabel =
    totalNotificationCount > 99 ? "99+" : String(totalNotificationCount);

  const markNotificationAsRead = async (id: string) => {
    try {
      await notificationsApi.markAsRead(id);
      setNotifications((prev) =>
        prev.map((n) => (n.id === id ? { ...n, isRead: true } : n))
      );
    } catch (error) {
      // Silently fail - notifications are optional
      console.log("Failed to mark notification as read (optional feature)");
    }
  };

  const markAllAsRead = async () => {
    try {
      await notificationsApi.markAllAsRead();
      setNotifications((prev) => prev.map((n) => ({ ...n, isRead: true })));
      toast.success("All notifications marked as read");
    } catch (error) {
      // Silently fail - don't show error to user
      console.log("Failed to mark all as read (optional feature)");
    }
  };

  const deleteNotification = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await notificationsApi.delete(id);
      setNotifications((prev) => prev.filter((n) => n.id !== id));
      toast.success("Notification deleted");
    } catch (error) {
      // Silently fail - don't show error to user
      console.log("Failed to delete notification (optional feature)");
    }
  };

  const getTimeAgo = (timestamp: string) => {
    const now = new Date();
    const time = new Date(timestamp);
    const diff = Math.floor((now.getTime() - time.getTime()) / 1000);

    if (diff < 60) return "Just now";
    if (diff < 3600) return `${Math.floor(diff / 60)} min ago`;
    if (diff < 86400) return `${Math.floor(diff / 3600)} hour${Math.floor(diff / 3600) > 1 ? 's' : ''} ago`;
    return `${Math.floor(diff / 86400)} day${Math.floor(diff / 86400) > 1 ? 's' : ''} ago`;
  };

  const { logout } = useAuth();
  const { language } = useLanguage();

  return (
    <header className="h-16 bg-white border-b border-slate-200 fixed top-0 right-0 lg:left-64 left-0 z-10">
      <div className="h-full px-4 md:px-6 flex items-center justify-between gap-2 md:gap-4">
        {/* Mobile Menu */}
        <Button variant="ghost" size="icon" className="lg:hidden flex-shrink-0" onClick={onToggleSidebar}>
          <Menu className="w-5 h-5" />
        </Button>

        {/* Search - Centered */}
        <div className="flex-1 flex justify-center max-w-2xl mx-auto">
          <div className="relative w-full">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <Input
              placeholder="Search products, orders, vendors…"
              className="pl-10 bg-slate-50 border-slate-200 focus:bg-white w-full"
              value={adminGlobalSearch ?? ""}
              onChange={(e) => onAdminGlobalSearchChange?.(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  onAdminGlobalSearchSubmit?.();
                }
              }}
              aria-label="Search admin portal"
            />
          </div>
        </div>

        {/* Right Actions - Notification & Profile */}
        <div className="flex items-center gap-1 md:gap-2 flex-shrink-0">
          
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="ghost" size="icon" className="relative">
                <Bell className="w-5 h-5" />
                {totalNotificationCount > 0 && (
                  <Badge className="absolute -top-1 -right-1 min-w-[1.25rem] h-5 px-0.5 flex items-center justify-center p-0 bg-red-500 text-white text-[10px] leading-none border-2 border-white">
                    {bellBadgeLabel}
                  </Badge>
                )}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-96 p-0" align="end">
              {/* Header */}
              <div className="flex items-center justify-between p-4 border-b border-slate-200">
                <div>
                  <h3 className="font-semibold text-slate-900">Notifications</h3>
                  <p className="text-xs text-slate-500 mt-0.5">
                    {unreadCount > 0 ? `You have ${unreadCount} unread ${unreadCount === 1 ? 'notification' : 'notifications'}` : 'All caught up!'}
                  </p>
                </div>
                {unreadCount > 0 && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-xs text-purple-600 hover:text-purple-700 hover:bg-purple-50"
                    onClick={markAllAsRead}
                  >
                    <Check className="w-3.5 h-3.5 mr-1" />
                    Mark all read
                  </Button>
                )}
              </div>

              {/* Notification List */}
              {(notifications.length > 0 || (pendingOrdersCount && pendingOrdersCount > 0) || (vendorApplicationsCount && vendorApplicationsCount > 0) || (chatUnreadCount && chatUnreadCount > 0)) ? (
                <ScrollArea className="h-[420px]">
                  <div className="divide-y divide-slate-100">
                    {/* Badge-based notifications from sidebar */}
                    {pendingOrdersCount && pendingOrdersCount > 0 && (
                      <div
                        className="group relative p-4 hover:bg-slate-50 transition-colors cursor-pointer bg-blue-50/30"
                      >
                        <div className="flex items-start gap-3">
                          <div className="w-10 h-10 rounded-lg bg-blue-500 flex items-center justify-center flex-shrink-0">
                            <ShoppingCart className="w-5 h-5 text-white" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-start justify-between gap-2 mb-1">
                              <p className="text-sm font-semibold text-slate-900 leading-tight">
                                Pending Orders
                              </p>
                              <div className="w-2 h-2 rounded-full bg-purple-600 flex-shrink-0 mt-1" />
                            </div>
                            <p className="text-sm text-slate-600 leading-snug mb-2">
                              You have {pendingOrdersCount} pending {pendingOrdersCount === 1 ? 'order' : 'orders'} that need attention
                            </p>
                            <p className="text-xs text-slate-400 flex items-center gap-1">
                              <Clock className="w-3 h-3" />
                              From Orders section
                            </p>
                          </div>
                        </div>
                      </div>
                    )}
                    
                    {vendorApplicationsCount && vendorApplicationsCount > 0 && (
                      <div
                        className="group relative p-4 hover:bg-slate-50 transition-colors cursor-pointer bg-green-50/30"
                      >
                        <div className="flex items-start gap-3">
                          <div className="w-10 h-10 rounded-lg bg-green-500 flex items-center justify-center flex-shrink-0">
                            <Store className="w-5 h-5 text-white" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-start justify-between gap-2 mb-1">
                              <p className="text-sm font-semibold text-slate-900 leading-tight">
                                Vendor Applications
                              </p>
                              <div className="w-2 h-2 rounded-full bg-purple-600 flex-shrink-0 mt-1" />
                            </div>
                            <p className="text-sm text-slate-600 leading-snug mb-2">
                              You have {vendorApplicationsCount} pending vendor {vendorApplicationsCount === 1 ? 'application' : 'applications'} to review
                            </p>
                            <p className="text-xs text-slate-400 flex items-center gap-1">
                              <Clock className="w-3 h-3" />
                              From Vendor section
                            </p>
                          </div>
                        </div>
                      </div>
                    )}

                    {chatUnreadCount > 0 && (
                      <div className="group relative p-4 hover:bg-slate-50 transition-colors cursor-pointer bg-indigo-50/30">
                        <div className="flex items-start gap-3">
                          <div className="w-10 h-10 rounded-lg bg-indigo-500 flex items-center justify-center flex-shrink-0">
                            <MessageSquare className="w-5 h-5 text-white" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-start justify-between gap-2 mb-1">
                              <p className="text-sm font-semibold text-slate-900 leading-tight">
                                New chat messages
                              </p>
                              <div className="w-2 h-2 rounded-full bg-purple-600 flex-shrink-0 mt-1" />
                            </div>
                            <p className="text-sm text-slate-600 leading-snug mb-2">
                              {chatUnreadCount === 1
                                ? "You have 1 unread customer message"
                                : `You have ${chatUnreadCount} unread customer messages`}
                            </p>
                            <p className="text-xs text-slate-400 flex items-center gap-1">
                              <Clock className="w-3 h-3" />
                              From Chat
                            </p>
                          </div>
                        </div>
                      </div>
                    )}
                    
                    {notifications.length > 0 && notifications.map((notification) => {
                      const Icon = iconMap[notification.type];
                      const iconColor = iconColorMap[notification.type];
                      
                      return (
                        <div
                          key={notification.id}
                          className={`group relative p-4 hover:bg-slate-50 transition-colors cursor-pointer ${
                            !notification.isRead ? "bg-purple-50/30" : ""
                          }`}
                          onClick={() => markNotificationAsRead(notification.id)}
                        >
                          <div className="flex items-start gap-3">
                            {/* Icon */}
                            <div className={`w-10 h-10 rounded-lg ${iconColor} flex items-center justify-center flex-shrink-0`}>
                              <Icon className="w-5 h-5 text-white" />
                            </div>

                            {/* Content */}
                            <div className="flex-1 min-w-0">
                              <div className="flex items-start justify-between gap-2 mb-1">
                                <p className="text-sm font-semibold text-slate-900 leading-tight">
                                  {notification.title}
                                </p>
                                {!notification.isRead && (
                                  <div className="w-2 h-2 rounded-full bg-purple-600 flex-shrink-0 mt-1" />
                                )}
                              </div>
                              <p className="text-sm text-slate-600 leading-snug mb-2">
                                {notification.message}
                              </p>
                              <div className="flex items-center justify-between">
                                <p className="text-xs text-slate-400 flex items-center gap-1">
                                  <Clock className="w-3 h-3" />
                                  {getTimeAgo(notification.timestamp)}
                                </p>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="h-7 px-2 opacity-0 group-hover:opacity-100 transition-opacity text-red-600 hover:text-red-700 hover:bg-red-50"
                                  onClick={(e) => deleteNotification(notification.id, e)}
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </Button>
                              </div>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </ScrollArea>
              ) : (
                <div className="flex flex-col items-center justify-center py-12 px-4">
                  <div className="w-16 h-16 rounded-full bg-slate-100 flex items-center justify-center mb-4">
                    <Bell className="w-8 h-8 text-slate-400" />
                  </div>
                  <p className="text-sm font-medium text-slate-900 mb-1">No notifications</p>
                  <p className="text-xs text-slate-500 text-center">
                    You're all caught up! We'll notify you when something new happens.
                  </p>
                </div>
              )}
            </PopoverContent>
          </Popover>

          <div className="ml-2">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="sm" className="gap-2">
                  <div className="w-8 h-8 rounded-full overflow-hidden bg-red-600 flex-shrink-0">
                    <img 
                      src={currentUser.avatar}
                      alt="Profile"
                      className="w-full h-full object-cover"
                    />
                  </div>
                  <div className="hidden md:flex flex-col items-start">
                    <span className="text-sm font-medium">{currentUser.name}</span>
                    <span className="text-xs text-slate-500">{currentUser.role}</span>
                  </div>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent className="w-56">
                <DropdownMenuItem
                  onClick={onViewProfile}
                >
                  <User className="mr-2 h-4 w-4" />
                  View Profile
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={onEditProfile}
                >
                  <Edit className="mr-2 h-4 w-4" />
                  Edit Profile
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem 
                  onClick={logout}
                  className="text-red-600 focus:text-red-600 focus:bg-red-50"
                >
                  <LogOut className="mr-2 h-4 w-4" />
                  {language === "en" ? "Sign Out" : "退出登录"}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </div>
    </header>
  );
}