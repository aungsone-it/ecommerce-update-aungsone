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
  /** Epoch ms from latest pending-order activity in cached orders payload (not “page loaded now”). */
  pendingOrdersDigestSourceMs?: number | null;
  /** Epoch ms from latest pending application submitted/created in cached applications. */
  vendorApplicationsDigestSourceMs?: number | null;
}

interface Notification {
  id: string;
  type: "order" | "product" | "review" | "system";
  title: string;
  message: string;
  timestamp: string;
  /** Some API payloads use `createdAt` instead of `timestamp`. */
  createdAt?: string;
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

const DIGEST_TS_STORAGE_KEY = "migoo-admin-topnav-digest-ts-v1";

type DigestTimestampSnap = {
  pendingOrders?: number;
  ordersAt?: number;
  vendorApplications?: number;
  vendorAt?: number;
  chatUnread?: number;
  chatAt?: number;
};

function readDigestTimestampSnap(): DigestTimestampSnap {
  if (typeof window === "undefined") return {};
  try {
    const raw = localStorage.getItem(DIGEST_TS_STORAGE_KEY);
    if (!raw) return {};
    const p = JSON.parse(raw) as DigestTimestampSnap;
    return p && typeof p === "object" ? p : {};
  } catch {
    return {};
  }
}

function writeDigestTimestampSnap(snap: DigestTimestampSnap) {
  try {
    localStorage.setItem(DIGEST_TS_STORAGE_KEY, JSON.stringify(snap));
  } catch {
    /* ignore quota / private mode */
  }
}

/** Fixed clock label: date + time in local locale (persists meaning across reloads). */
function formatNotificationDateTime(ms: number): string {
  const d = new Date(ms);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

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
  pendingOrdersDigestSourceMs = null,
  vendorApplicationsDigestSourceMs = null,
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
      const raw = (response as { notifications?: Notification[]; data?: unknown }).notifications;
      const fromData = Array.isArray((response as { data?: unknown }).data)
        ? (response as { data: Notification[] }).data
        : [];
      const incoming = Array.isArray(raw) ? raw : fromData;
      setNotifications((prev) => {
        const prevById = new Map(prev.map((p) => [p.id, p]));
        return incoming.map((n) => {
          const old = prevById.get(n.id);
          const ts =
            n.timestamp ||
            (n as { createdAt?: string }).createdAt ||
            old?.timestamp;
          return {
            ...n,
            isRead: n.isRead ?? (n as { read?: boolean }).read ?? false,
            timestamp: ts || new Date().toISOString(),
          };
        });
      });
    } catch (error) {
      // Silently fail - notifications are optional feature
      setNotifications([]); // Set empty array so UI still works
    } finally {
      setLoading(false);
    }
  };

  const unreadCount = notifications.filter(n => !n.isRead).length;

  const pendingOrdersN = Number(pendingOrdersCount) || 0;
  const vendorAppsN = Number(vendorApplicationsCount) || 0;
  const chatUnreadN = Number(chatUnreadCount) || 0;
  /** Sidebar-style digest rows (not inbox API) — used for header copy + avoid `0 && …` leaking into DOM. */
  const digestAttentionCount = pendingOrdersN + vendorAppsN + chatUnreadN;

  // 🔥 Add vendor applications, pending orders, and unread chat to bell badge total
  const totalNotificationCount = unreadCount + digestAttentionCount;

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

  /**
   * Persist “last time this digest count changed” in localStorage so refresh does not reset
   * the displayed time to “now” while counts are unchanged.
   */
  const [ordersDigestAt, setOrdersDigestAt] = useState(() => {
    const p = readDigestTimestampSnap();
    return typeof p.ordersAt === "number" ? p.ordersAt : Date.now();
  });
  const [vendorDigestAt, setVendorDigestAt] = useState(() => {
    const p = readDigestTimestampSnap();
    return typeof p.vendorAt === "number" ? p.vendorAt : Date.now();
  });
  const [chatDigestAt, setChatDigestAt] = useState(() => {
    const p = readDigestTimestampSnap();
    return typeof p.chatAt === "number" ? p.chatAt : Date.now();
  });

  useEffect(() => {
    const po = Number(pendingOrdersCount) || 0;
    const va = Number(vendorApplicationsCount) || 0;
    const cu = Number(chatUnreadCount) || 0;

    const prev = readDigestTimestampSnap();
    const next: DigestTimestampSnap = { ...prev };
    const now = Date.now();

    let ordersAt = typeof prev.ordersAt === "number" ? prev.ordersAt : now;
    if (prev.pendingOrders !== po) {
      ordersAt = now;
      next.pendingOrders = po;
      next.ordersAt = ordersAt;
    }

    let vendorAt = typeof prev.vendorAt === "number" ? prev.vendorAt : now;
    if (prev.vendorApplications !== va) {
      vendorAt = now;
      next.vendorApplications = va;
      next.vendorAt = vendorAt;
    }

    let chatAt = typeof prev.chatAt === "number" ? prev.chatAt : now;
    if (prev.chatUnread !== cu) {
      chatAt = now;
      next.chatUnread = cu;
      next.chatAt = chatAt;
    }

    writeDigestTimestampSnap(next);
    setOrdersDigestAt(ordersAt);
    setVendorDigestAt(vendorAt);
    setChatDigestAt(chatAt);
  }, [pendingOrdersCount, vendorApplicationsCount, chatUnreadCount]);

  const digestFooter = (asOfMs: number, sourceLabel: string) => {
    const label = formatNotificationDateTime(asOfMs);
    return (
      <p className="text-xs text-slate-400 flex items-center gap-1.5 flex-wrap" title={label}>
        <Clock className="w-3 h-3 shrink-0" />
        <span>{sourceLabel}</span>
        <span className="text-slate-300" aria-hidden>
          ·
        </span>
        <span className="tabular-nums">{label}</span>
      </p>
    );
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
              placeholder="Search… (on Products, press Enter to load matches)"
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
                    {totalNotificationCount > 0
                      ? `You have ${totalNotificationCount} unread ${totalNotificationCount === 1 ? "alert" : "alerts"}`
                      : "All caught up!"}
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
              {notifications.length > 0 || digestAttentionCount > 0 ? (
                <ScrollArea className="h-[420px]">
                  <div className="divide-y divide-slate-100">
                    {/* Badge-based notifications from sidebar */}
                    {pendingOrdersN > 0 && (
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
                              You have {pendingOrdersN} pending {pendingOrdersN === 1 ? "order" : "orders"} that need attention
                            </p>
                            {digestFooter(
                              typeof pendingOrdersDigestSourceMs === "number" &&
                                !Number.isNaN(pendingOrdersDigestSourceMs)
                                ? pendingOrdersDigestSourceMs
                                : ordersDigestAt,
                              "From Orders section"
                            )}
                          </div>
                        </div>
                      </div>
                    )}
                    
                    {vendorAppsN > 0 && (
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
                              You have {vendorAppsN} pending vendor {vendorAppsN === 1 ? "application" : "applications"} to review
                            </p>
                            {digestFooter(
                              typeof vendorApplicationsDigestSourceMs === "number" &&
                                !Number.isNaN(vendorApplicationsDigestSourceMs)
                                ? vendorApplicationsDigestSourceMs
                                : vendorDigestAt,
                              "From Vendor section"
                            )}
                          </div>
                        </div>
                      </div>
                    )}

                    {chatUnreadN > 0 && (
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
                              {chatUnreadN === 1
                                ? "You have 1 unread customer message"
                                : `You have ${chatUnreadN} unread customer messages`}
                            </p>
                            {digestFooter(chatDigestAt, "From Chat")}
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
                              <div className="flex items-center justify-between gap-2">
                                <p className="text-xs text-slate-400 flex items-center gap-1.5 flex-wrap min-w-0">
                                  <Clock className="w-3 h-3 shrink-0" />
                                  <span className="tabular-nums">
                                    {formatNotificationDateTime(
                                      new Date(
                                        notification.timestamp ||
                                          notification.createdAt ||
                                          ""
                                      ).getTime()
                                    )}
                                  </span>
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