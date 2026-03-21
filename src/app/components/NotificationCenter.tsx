import { useState, useEffect } from "react";
import { Bell, MessageCircle, Package, ShoppingCart, Tag, X, Check } from "lucide-react";
import { Button } from "./ui/button";
import { Badge } from "./ui/badge";
import { Card } from "./ui/card";
import { ScrollArea } from "./ui/scroll-area";
import { Separator } from "./ui/separator";

export interface Notification {
  id: string;
  type: "chat" | "order" | "promotion" | "system";
  title: string;
  message: string;
  timestamp: string;
  read: boolean;
  icon?: any;
  action?: () => void;
}

interface NotificationCenterProps {
  chatUnreadCount: number;
  onChatClick: () => void;
  onMarkAsRead?: (id: string) => void;
  onClearAll?: () => void;
  externalNotifications?: Notification[]; // Allow parent to pass notifications
}

export function NotificationCenter({ 
  chatUnreadCount, 
  onChatClick,
  onMarkAsRead,
  onClearAll,
  externalNotifications = []
}: NotificationCenterProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [notifications, setNotifications] = useState<Notification[]>([]);

  // Add chat notifications based on unread count
  useEffect(() => {
    if (chatUnreadCount > 0) {
      // Check if we already have a chat notification
      const existingChatNotification = notifications.find(n => n.type === "chat" && !n.read);
      
      if (!existingChatNotification) {
        const chatNotification: Notification = {
          id: `chat-${Date.now()}`,
          type: "chat",
          title: "New Message",
          message: `You have ${chatUnreadCount} unread message${chatUnreadCount > 1 ? 's' : ''} from admin`,
          timestamp: new Date().toISOString(),
          read: false,
          icon: MessageCircle,
          action: () => {
            onChatClick();
            handleMarkAsRead(`chat-${Date.now()}`);
            setIsOpen(false);
          }
        };
        setNotifications(prev => [chatNotification, ...prev]);
      } else {
        // Update existing chat notification
        setNotifications(prev => prev.map(n => 
          n.type === "chat" && !n.read
            ? { ...n, message: `You have ${chatUnreadCount} unread message${chatUnreadCount > 1 ? 's' : ''} from admin` }
            : n
        ));
      }
    } else {
      // Remove unread chat notifications when count is 0
      setNotifications(prev => prev.filter(n => n.type !== "chat" || n.read));
    }
  }, [chatUnreadCount]);

  // Merge external notifications with local ones
  useEffect(() => {
    if (externalNotifications.length > 0) {
      setNotifications(prev => {
        // Filter out duplicate IDs
        const existingIds = new Set(prev.map(n => n.id));
        const newNotifications = externalNotifications.filter(n => !existingIds.has(n.id));
        return [...newNotifications, ...prev];
      });
    }
  }, [externalNotifications]);

  // Load notifications from localStorage on mount
  useEffect(() => {
    const savedNotifications = localStorage.getItem('migoo-notifications');
    if (savedNotifications) {
      try {
        const parsed = JSON.parse(savedNotifications);
        setNotifications(parsed);
      } catch (error) {
        console.error('Failed to parse saved notifications:', error);
      }
    }
  }, []);

  // Save notifications to localStorage
  useEffect(() => {
    localStorage.setItem('migoo-notifications', JSON.stringify(notifications));
  }, [notifications]);

  const unreadCount = notifications.filter(n => !n.read).length;

  const handleMarkAsRead = (id: string) => {
    setNotifications(prev => prev.map(n => 
      n.id === id ? { ...n, read: true } : n
    ));
    if (onMarkAsRead) {
      onMarkAsRead(id);
    }
  };

  const handleClearAll = () => {
    setNotifications([]);
    if (onClearAll) {
      onClearAll();
    }
  };

  const handleMarkAllAsRead = () => {
    setNotifications(prev => prev.map(n => ({ ...n, read: true })));
  };

  const getNotificationIcon = (type: string) => {
    switch (type) {
      case "chat":
        return MessageCircle;
      case "order":
        return Package;
      case "promotion":
        return Tag;
      default:
        return Bell;
    }
  };

  const getNotificationColor = (type: string) => {
    switch (type) {
      case "chat":
        return "bg-blue-500";
      case "order":
        return "bg-green-500";
      case "promotion":
        return "bg-amber-500";
      default:
        return "bg-slate-500";
    }
  };

  const formatTimestamp = (timestamp: string) => {
    const date = new Date(timestamp);
    const now = new Date();
    const diffInMinutes = Math.floor((now.getTime() - date.getTime()) / 60000);
    
    if (diffInMinutes < 1) return "Just now";
    if (diffInMinutes < 60) return `${diffInMinutes}m ago`;
    if (diffInMinutes < 1440) return `${Math.floor(diffInMinutes / 60)}h ago`;
    return `${Math.floor(diffInMinutes / 1440)}d ago`;
  };

  return (
    <div className="relative">
      <Button 
        variant="ghost" 
        size="icon"
        className="relative hover:bg-slate-100 rounded-full"
        onClick={() => setIsOpen(!isOpen)}
        title="Notifications"
      >
        <Bell className="w-5 h-5 text-slate-700" />
        {unreadCount > 0 && (
          <Badge className="absolute -top-1 -right-1 w-5 h-5 flex items-center justify-center p-0 bg-red-600 text-white text-xs border-2 border-white animate-pulse">
            {unreadCount > 9 ? '9+' : unreadCount}
          </Badge>
        )}
      </Button>

      {isOpen && (
        <>
          {/* Backdrop */}
          <div 
            className="fixed inset-0 z-40 bg-black/20" 
            onClick={() => setIsOpen(false)}
          />
          
          {/* Notification Panel */}
          <Card className="fixed top-16 left-2 right-2 sm:absolute sm:right-0 sm:left-auto sm:top-12 w-auto sm:w-96 z-50 shadow-2xl border-slate-200">
            <div className="p-3 sm:p-4 border-b border-slate-200">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="font-semibold text-slate-900 text-sm">Notifications</h3>
                  <p className="text-xs text-slate-500 mt-0.5">
                    {unreadCount > 0 ? `${unreadCount} unread` : 'All caught up!'}
                  </p>
                </div>
                <div className="flex items-center gap-1">
                  {unreadCount > 0 && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={handleMarkAllAsRead}
                      className="text-xs h-7 px-2 hidden sm:flex"
                    >
                      <Check className="w-3 h-3 mr-1" />
                      Mark all
                    </Button>
                  )}
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => setIsOpen(false)}
                    className="h-8 w-8"
                  >
                    <X className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            </div>

            <ScrollArea className="h-[50vh] sm:h-[60vh] max-h-[400px] sm:max-h-[500px]">
              {notifications.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-8 sm:py-12 text-center">
                  <Bell className="w-10 h-10 sm:w-12 sm:h-12 text-slate-300 mb-3" />
                  <p className="text-sm font-medium text-slate-600">No notifications</p>
                  <p className="text-xs text-slate-400 mt-1">We'll notify you when something arrives</p>
                </div>
              ) : (
                <div className="divide-y divide-slate-100">
                  {notifications.map((notification) => {
                    const Icon = notification.icon || getNotificationIcon(notification.type);
                    const colorClass = getNotificationColor(notification.type);
                    
                    return (
                      <div
                        key={notification.id}
                        className={`p-4 hover:bg-slate-50 transition-colors cursor-pointer ${
                          !notification.read ? 'bg-blue-50/50' : ''
                        }`}
                        onClick={() => {
                          if (notification.action) {
                            notification.action();
                          } else {
                            handleMarkAsRead(notification.id);
                          }
                        }}
                      >
                        <div className="flex gap-3">
                          <div className={`flex-shrink-0 w-10 h-10 rounded-full ${colorClass} flex items-center justify-center`}>
                            <Icon className="w-5 h-5 text-white" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-start justify-between gap-2">
                              <p className={`text-sm font-medium ${!notification.read ? 'text-slate-900' : 'text-slate-600'}`}>
                                {notification.title}
                              </p>
                              {!notification.read && (
                                <div className="w-2 h-2 bg-blue-600 rounded-full flex-shrink-0 mt-1.5" />
                              )}
                            </div>
                            <p className="text-xs text-slate-500 mt-1 line-clamp-2">
                              {notification.message}
                            </p>
                            <p className="text-xs text-slate-400 mt-1.5">
                              {formatTimestamp(notification.timestamp)}
                            </p>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </ScrollArea>

            {notifications.length > 0 && (
              <>
                <Separator />
                <div className="p-3">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={handleClearAll}
                    className="w-full text-xs h-8 text-slate-600 hover:text-slate-900"
                  >
                    Clear all notifications
                  </Button>
                </div>
              </>
            )}
          </Card>
        </>
      )}
    </div>
  );
}

// Helper function to add notifications (can be used from parent components)
export function addNotification(
  type: Notification['type'],
  title: string,
  message: string,
  action?: () => void
): Notification {
  return {
    id: `${type}-${Date.now()}`,
    type,
    title,
    message,
    timestamp: new Date().toISOString(),
    read: false,
    action
  };
}