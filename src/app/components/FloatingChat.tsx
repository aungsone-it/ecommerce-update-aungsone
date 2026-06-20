import { useState, useEffect, useRef, useCallback, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { MessageCircle, X, Send, Paperclip, Smile, Image as ImageIcon, Loader2, Headset, MessageCircleMore, Lock } from "lucide-react";
import { Button } from "./ui/button";
import { Badge } from "./ui/badge";
import { Textarea } from "./ui/textarea";
import { toast } from "sonner";
import { chatApi } from "../../utils/api";
import {
  CHAT_LOCAL_STORAGE_DEBOUNCE_MS,
  CHAT_SCROLL_DEBOUNCE_MS,
  MIGOO_CHAT_DISMISS_UNREAD_EVENT,
  MIGOO_OPEN_CUSTOMER_AUTH_FOR_CHAT_EVENT,
  MIGOO_USER_SESSION_CHANGED_EVENT,
  POLLING_INTERVALS_MS,
} from "../../constants";
import {
  broadcastConversationMessage,
  broadcastCustomerChatMessage,
  broadcastInboxPing,
  subscribeConversationBroadcast,
  subscribeCustomerChatBroadcast,
} from "../utils/chatRealtime";
import imageCompression from "browser-image-compression";
import { Popover, PopoverContent, PopoverTrigger } from "./ui/popover";
import { EmojiPicker, type EmojiClickData } from "./EmojiPickerLazy";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "./ui/dialog";
import { useDocumentVisible } from "../hooks/useDocumentVisible";
import { canonicalChatThreadId } from "../../utils/chatConversation";
import { useChatNotification } from "../contexts/ChatNotificationContext";

const MIGOO_USER_STORAGE_KEY = "migoo-user";

/** Customer accounts use KV/authApi session in localStorage (not Supabase AuthContext). Read fresh — state can be stale after same-tab login. */
function hasMigooCustomerSession(): boolean {
  if (typeof window === "undefined") return false;
  try {
    const raw = localStorage.getItem(MIGOO_USER_STORAGE_KEY);
    if (raw == null || String(raw).trim() === "") return false;
    const u = JSON.parse(raw) as Record<string, unknown> | null;
    if (!u || typeof u !== "object" || Array.isArray(u)) return false;
    const email = u.email;
    const id = u.id ?? u.userId;
    if (typeof email === "string" && email.trim() !== "") return true;
    if (typeof id === "string" && id.trim() !== "") return true;
    if (typeof id === "number" && Number.isFinite(id)) return true;
    return false;
  } catch {
    return false;
  }
}

/** Vendor storefront chat requires sign-in; apex SECURE chat is open to guests. */
function chatRequiresSignIn(vendorId?: string): boolean {
  return Boolean(vendorId);
}

function hasActiveChatSession(vendorId: string | undefined, isAuthenticated: boolean): boolean {
  if (!chatRequiresSignIn(vendorId)) return true;
  return hasMigooCustomerSession() || isAuthenticated;
}

interface Message {
  id: string;
  text: string;
  timestamp: string;
  sender: "customer" | "admin";
  senderName: string;
  status?: "sent" | "delivered" | "read";
  imageUrl?: string;
}

interface FloatingChatProps {
  customerName?: string;
  customerEmail?: string;
  onUnreadCountChange?: (count: number) => void;
  forceOpen?: boolean;
  onOpen?: () => void;
  vendorId?: string; // Vendor ID if chatting on a vendor storefront
  isAuthenticated?: boolean; // NEW: Check if user is logged in
  /** Lift chat bubble above vendor mobile sticky purchase bar (product detail). */
  aboveStickyPurchaseBar?: boolean;
  /** Reserve vertical space for the back-to-top button below the chat FAB. */
  reserveBackToTopStack?: boolean;
}

function sanitizeChatEmailToken(email: string): string {
  return String(email || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "-");
}

export function FloatingChat({ customerName = "Guest", customerEmail = "", onUnreadCountChange, forceOpen, onOpen, vendorId, isAuthenticated = false, aboveStickyPurchaseBar = false, reserveBackToTopStack = true }: FloatingChatProps) {
  const { setFloatingChatOpen } = useChatNotification();
  const docVisible = useDocumentVisible();
  const chatBrandLabel = vendorId ? "this store" : "SECURE";
  
  const [isCustomerAuthenticated, setIsCustomerAuthenticated] = useState(() =>
    hasMigooCustomerSession()
  );
  
  // 🔒 Sign-in dialog state
  const [showSignInDialog, setShowSignInDialog] = useState(false);
  
  // Load persisted state from localStorage
  const [isOpen, setIsOpen] = useState(() => {
    try {
      const saved = localStorage.getItem("migoo-chat-isOpen");
      if (!saved || !JSON.parse(saved)) return false;
      if (!vendorId) return true;
      return hasMigooCustomerSession();
    } catch {
      return false;
    }
  });

  // Animation trigger state for first load
  const [isMounted, setIsMounted] = useState(false);

  const conversationStorageKey = vendorId
    ? `migoo-chat-conversationId-vendor-${vendorId}`
    : "migoo-chat-conversationId";

  const [conversationId, setConversationId] = useState(() => {
    // Try to load existing conversation ID first
    const savedConvId = localStorage.getItem(conversationStorageKey);
    if (savedConvId) {
      return savedConvId;
    }
    
    // Generate new conversation ID with vendor context
    let newConvId;
    if (vendorId) {
      // Vendor-specific conversation
      if (customerEmail) {
        newConvId = `conv-vendor-${String(vendorId).trim().toLowerCase()}-${sanitizeChatEmailToken(customerEmail)}`;
      } else {
        newConvId = `conv-vendor-${vendorId}-guest-${Date.now()}`;
      }
    } else {
      // Main SECURE store conversation
      if (customerEmail) {
        newConvId = `conv-${sanitizeChatEmailToken(customerEmail)}`;
      } else {
        newConvId = `conv-guest-${Date.now()}`;
      }
    }
    
    // Save to localStorage
    localStorage.setItem(conversationStorageKey, newConvId);
    return newConvId;
  });

  const adoptConversationId = (nextId: unknown) => {
    const normalized = String(nextId || "").trim();
    if (!normalized) return;
    setConversationId((prev) => {
      if (prev === normalized) return prev;
      try {
        localStorage.setItem(conversationStorageKey, normalized);
      } catch {
        /* ignore storage failures */
      }
      return normalized;
    });
  };
  
  const [messages, setMessages] = useState<Message[]>(() => {
    // Try to load messages from localStorage first (vendor-specific)
    const storageKey = vendorId ? `migoo-chat-messages-vendor-${vendorId}` : "migoo-chat-messages";
    const savedMessages = localStorage.getItem(storageKey);
    if (savedMessages) {
      try {
        return JSON.parse(savedMessages);
      } catch (error) {
        console.error("Failed to parse saved messages:", error);
      }
    }
    
    // Default welcome message (vendor-specific or SECURE)
    const storeName = vendorId ? "this store" : "SECURE Store";
    return [{
      id: "welcome-1",
      text: `Hello! Welcome to ${storeName}. How can we help you today?`,
      timestamp: new Date().toISOString(),
      sender: "admin",
      senderName: vendorId ? "Store Support" : "Admin",
      status: "read"
    }];
  });
  
  const [messageInput, setMessageInput] = useState("");
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);

  // Align thread id with Edge canonical keys (slug vs internal id — fixes history + admin realtime).
  useEffect(() => {
    const email = (customerEmail || "").trim();
    if (!email) return;
    if (!hasActiveChatSession(vendorId, isAuthenticated)) return;
    const canonical = canonicalChatThreadId(email, vendorId ? String(vendorId).trim() : undefined);
    if (canonical) adoptConversationId(canonical);
  }, [customerEmail, vendorId, isAuthenticated, isCustomerAuthenticated]);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesRef = useRef(messages);
  messagesRef.current = messages;
  const vendorIdForLsRef = useRef(vendorId);
  vendorIdForLsRef.current = vendorId;
  const lsDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pollingIntervalRef = useRef<number | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const attachmentInputRef = useRef<HTMLInputElement>(null);
  const lastMessageIdRef = useRef<string | null>(null);
  const isOpenRef = useRef(isOpen);
  isOpenRef.current = isOpen;

  const appendAdminMessage = useCallback((msg: Record<string, unknown>) => {
    if (String(msg.sender) !== "admin") return;
    setMessages((prev) => {
      const id = String(msg.id ?? "");
      if (!id || prev.some((m) => m.id === id)) return prev;
      const withoutWelcome =
        prev.length === 1 && prev[0]?.id === "welcome-1" ? [] : prev;
      const next = [...withoutWelcome, msg as unknown as Message];
      const sorted = next.sort(
        (a, b) =>
          new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
      );
      lastMessageIdRef.current = sorted[sorted.length - 1]?.id || null;
      return sorted;
    });
    if (!isOpenRef.current) {
      setUnreadCount((c) => c + 1);
    }
  }, []);

  const scrollDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (scrollDebounceRef.current) window.clearTimeout(scrollDebounceRef.current);
    scrollDebounceRef.current = window.setTimeout(() => {
      scrollDebounceRef.current = null;
      const el = messagesEndRef.current;
      if (!el) return;
      const behavior = messages.length > 36 ? ("auto" as const) : ("smooth" as const);
      el.scrollIntoView({ behavior, block: "end" });
    }, CHAT_SCROLL_DEBOUNCE_MS);
    return () => {
      if (scrollDebounceRef.current) window.clearTimeout(scrollDebounceRef.current);
    };
  }, [messages]);

  // Trigger mount animation on first load
  useEffect(() => {
    const timer = setTimeout(() => {
      setIsMounted(true);
    }, 50);
    return () => clearTimeout(timer);
  }, []);

  // Load messages from server (only call this once on mount)
  const loadMessages = async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const response = await chatApi.getMessages(
        conversationId,
        customerEmail?.trim() || undefined
      );
      if (response.messages && Array.isArray(response.messages)) {
        const sortedMessages = response.messages.sort(
          (a: Message, b: Message) =>
            new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
        );
        if (sortedMessages.length > 0) {
          const canonicalConversationId = (sortedMessages[0] as { conversationId?: unknown }).conversationId;
          adoptConversationId(canonicalConversationId);
        }
        
        if (sortedMessages.length === 0) {
          // No messages from server - keep welcome message
          return;
        }

        // Replace all messages with server data
        setMessages(sortedMessages);
        lastMessageIdRef.current = sortedMessages[sortedMessages.length - 1]?.id || null;
      }
    } catch (error) {
      console.error("Failed to load messages:", error);
    } finally {
      if (!silent) setLoading(false);
    }
  };

  // Only poll for NEW messages from admin (check if there are messages after our last known ID)
  const pollForNewMessages = async () => {
    try {
      const response = await chatApi.getMessages(
        conversationId,
        customerEmail?.trim() || undefined
      );
      if (response.messages && Array.isArray(response.messages)) {
        const sortedMessages = response.messages.sort(
          (a: Message, b: Message) =>
            new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
        );

        // Create a Set of existing message IDs for O(1) lookup
        const existingMessageIds = new Set(messagesRef.current.map((msg) => msg.id));

        // Find new messages that we don't have yet (by ID, not timestamp)
        const newMessages = sortedMessages.filter(msg => 
          !existingMessageIds.has(msg.id) && msg.sender === "admin"
        );

        if (newMessages.length > 0) {
          setMessages(prev => [...prev, ...newMessages]);
          if (!isOpen) {
            setUnreadCount(prev => prev + newMessages.length);
          }
        }
      }
    } catch (error) {
      // Silent fail - don't show error to user
    }
  };

  // Signed-in: keep thread in sync with server (silent when minimized; full load when panel is open).
  useEffect(() => {
    if (!conversationId) return;
    if (!hasActiveChatSession(vendorId, isAuthenticated)) return;
    void loadMessages(!isOpen);
  }, [conversationId, isOpen, isCustomerAuthenticated, isAuthenticated]);

  // Realtime is primary; reconcile with server when tab becomes visible (missed deltas / offline).
  useEffect(() => {
    if (typeof document === "undefined") return;
    let visTimer: ReturnType<typeof setTimeout> | null = null;
    const onVis = () => {
      if (document.visibilityState !== "visible") return;
      if (visTimer) clearTimeout(visTimer);
      visTimer = window.setTimeout(() => {
        visTimer = null;
        void loadMessages(true);
      }, 800);
    };
    document.addEventListener("visibilitychange", onVis);
    return () => {
      document.removeEventListener("visibilitychange", onVis);
      if (visTimer) clearTimeout(visTimer);
    };
  }, [conversationId]);

  // HTTP fallback: slow poll while chat is expanded; faster poll while closed/minimized (Realtime can still miss).
  useEffect(() => {
    if (!conversationId || !docVisible) {
      if (pollingIntervalRef.current) {
        clearInterval(pollingIntervalRef.current);
        pollingIntervalRef.current = null;
      }
      return;
    }
    if (!hasActiveChatSession(vendorId, isAuthenticated)) {
      if (pollingIntervalRef.current) {
        clearInterval(pollingIntervalRef.current);
        pollingIntervalRef.current = null;
      }
      return;
    }

    const tick = () => {
      if (typeof document !== "undefined" && document.visibilityState !== "visible") return;
      void pollForNewMessages();
    };

    const intervalMs = !isOpen
        ? POLLING_INTERVALS_MS.CHAT_HTTP_FALLBACK_DOCKET
        : POLLING_INTERVALS_MS.CHAT_HTTP_FALLBACK;

    if (pollingIntervalRef.current) {
      clearInterval(pollingIntervalRef.current);
      pollingIntervalRef.current = null;
    }
    pollingIntervalRef.current = window.setInterval(tick, intervalMs);

    return () => {
      if (pollingIntervalRef.current) {
        clearInterval(pollingIntervalRef.current);
        pollingIntervalRef.current = null;
      }
    };
  }, [isOpen, conversationId, docVisible, isAuthenticated]);

  // Header “Mark all read” clears widget unread without opening the panel.
  useEffect(() => {
    const onDismiss = () => {
      setUnreadCount(0);
      if (onUnreadCountChange) onUnreadCountChange(0);
    };
    window.addEventListener(MIGOO_CHAT_DISMISS_UNREAD_EVENT, onDismiss);
    return () => window.removeEventListener(MIGOO_CHAT_DISMISS_UNREAD_EVENT, onDismiss);
  }, [onUnreadCountChange]);

  // Realtime: admin replies on this thread id + account-wide channel (all vendor tabs).
  useEffect(() => {
    if (!conversationId) return;
    const unsubs: Array<() => void> = [
      subscribeConversationBroadcast(conversationId, appendAdminMessage),
    ];

    const email = (customerEmail || "").trim();
    if (email && hasActiveChatSession(vendorId, isAuthenticated)) {
      unsubs.push(subscribeCustomerChatBroadcast(email, appendAdminMessage));

      const mainThreadId = canonicalChatThreadId(email);
      if (mainThreadId && mainThreadId !== conversationId) {
        unsubs.push(subscribeConversationBroadcast(mainThreadId, appendAdminMessage));
      }
    }

    return () => {
      for (const off of unsubs) off();
    };
  }, [conversationId, customerEmail, isAuthenticated, isCustomerAuthenticated, appendAdminMessage]);

  // Reset unread count when chat is opened
  useEffect(() => {
    if (isOpen) {
      setUnreadCount(0);
    }
  }, [isOpen]);

  // Handle forceOpen prop — vendor storefront still requires a customer session
  useEffect(() => {
    if (!forceOpen) return;
    if (!hasActiveChatSession(vendorId, isAuthenticated)) {
      setShowSignInDialog(true);
      onOpen?.();
      return;
    }
    setIsOpen(true);
    onOpen?.();
  }, [forceOpen, onOpen, isAuthenticated, vendorId]);

  // Close chat when session is missing on vendor storefront (incl. same-tab logout via migoo-user)
  useEffect(() => {
    if (!chatRequiresSignIn(vendorId)) return;
    const enforce = () => {
      setIsOpen((open) => {
        if (!open) return open;
        if (hasActiveChatSession(vendorId, isAuthenticated)) return open;
        try {
          localStorage.setItem("migoo-chat-isOpen", JSON.stringify(false));
        } catch {
          /* ignore */
        }
        setShowSignInDialog(true);
        return false;
      });
    };
    enforce();
    window.addEventListener(MIGOO_USER_SESSION_CHANGED_EVENT, enforce);
    return () => window.removeEventListener(MIGOO_USER_SESSION_CHANGED_EVENT, enforce);
  }, [isOpen, isAuthenticated, vendorId]);

  // Notify parent of unread count changes
  useEffect(() => {
    if (onUnreadCountChange) {
      onUnreadCountChange(unreadCount);
    }
  }, [unreadCount, onUnreadCountChange]);

  // 💾 PERSISTENCE: debounce localStorage writes (same data; fewer main-thread JSON.stringify blocks)
  useEffect(() => {
    const storageKey = vendorId ? `migoo-chat-messages-vendor-${vendorId}` : "migoo-chat-messages";
    if (lsDebounceRef.current) window.clearTimeout(lsDebounceRef.current);
    lsDebounceRef.current = window.setTimeout(() => {
      lsDebounceRef.current = null;
      try {
        localStorage.setItem(storageKey, JSON.stringify(messages));
      } catch {
        /* quota / private mode */
      }
    }, CHAT_LOCAL_STORAGE_DEBOUNCE_MS);
    return () => {
      if (lsDebounceRef.current) window.clearTimeout(lsDebounceRef.current);
    };
  }, [messages, vendorId]);

  useEffect(() => {
    return () => {
      if (lsDebounceRef.current) {
        window.clearTimeout(lsDebounceRef.current);
        lsDebounceRef.current = null;
      }
      const vid = vendorIdForLsRef.current;
      const key = vid ? `migoo-chat-messages-vendor-${vid}` : "migoo-chat-messages";
      try {
        localStorage.setItem(key, JSON.stringify(messagesRef.current));
      } catch {
        /* quota / private mode */
      }
    };
  }, []);

  // 💾 PERSISTENCE: Save isOpen state to localStorage whenever it changes
  useEffect(() => {
    localStorage.setItem("migoo-chat-isOpen", JSON.stringify(isOpen));
  }, [isOpen]);

  useEffect(() => {
    setFloatingChatOpen(isOpen);
    return () => setFloatingChatOpen(false);
  }, [isOpen, setFloatingChatOpen]);

  // 🔒 Sync auth: other tabs + window focus; merge with Supabase-backed AuthContext user
  useEffect(() => {
    const checkAuth = () => {
      setIsCustomerAuthenticated(hasMigooCustomerSession() || isAuthenticated);
    };

    checkAuth();
    window.addEventListener("storage", checkAuth);
    window.addEventListener("focus", checkAuth);
    window.addEventListener(MIGOO_USER_SESSION_CHANGED_EVENT, checkAuth);

    return () => {
      window.removeEventListener("storage", checkAuth);
      window.removeEventListener("focus", checkAuth);
      window.removeEventListener(MIGOO_USER_SESSION_CHANGED_EVENT, checkAuth);
    };
  }, [isAuthenticated]);

  const handleSendMessage = async () => {
    if (!messageInput.trim() && !selectedImage) return;
    if (!hasActiveChatSession(vendorId, isAuthenticated)) {
      toast.error("Please sign in to send messages");
      setIsOpen(false);
      try {
        localStorage.setItem("migoo-chat-isOpen", JSON.stringify(false));
      } catch {
        /* ignore */
      }
      setShowSignInDialog(true);
      return;
    }

    const messageText = messageInput;
    const imageUrl = selectedImage || undefined;
    
    // Get customer name, email and profile image from localStorage for authenticated users
    let actualCustomerName = customerName; // Default to prop
    let actualCustomerEmail = customerEmail; // Default to prop
    let customerProfileImage = "";
    
    try {
      const storedUser = localStorage.getItem(MIGOO_USER_STORAGE_KEY);
      if (storedUser) {
        const user = JSON.parse(storedUser);
        // Use stored user data if available
        actualCustomerName = user.fullName || user.firstName || user.name || customerName;
        actualCustomerEmail = user.email || customerEmail;
        customerProfileImage =
          user.profileImageUrl ||
          user.avatarUrl ||
          user.avatar ||
          (typeof user.profileImage === "string" && user.profileImage.startsWith("http")
            ? user.profileImage
            : "") ||
          "";
      }
    } catch (error) {
      console.error("Failed to get user data from localStorage:", error);
    }

    const newMessage: Message = {
      id: `msg-${Date.now()}`,
      text: messageText,
      timestamp: new Date().toISOString(),
      sender: "customer",
      senderName: actualCustomerName,
      status: "sent",
      imageUrl: imageUrl
    };

    // Add to UI immediately
    setMessages(prev => [...prev, newMessage]);
    setMessageInput("");
    setSelectedImage(null);

    // Send to server
    try {
      const response = (await chatApi.sendMessage({
        text: messageText,
        sender: "customer",
        senderName: actualCustomerName,
        customerEmail: actualCustomerEmail,
        conversationId: conversationId,
        imageUrl: imageUrl,
        vendorId: vendorId, // Add vendor context
        customerProfileImage: customerProfileImage // Add customer profile image
      })) as { success?: boolean; message?: Message };

      if (response?.message) {
        const canonicalId = String(
          (response.message as { conversationId?: unknown }).conversationId || ""
        ).trim();
        adoptConversationId(canonicalId || conversationId);
        setMessages((prev) => {
          const without = prev.filter((m) => m.id !== newMessage.id);
          const merged = [...without, response.message!];
          return merged.sort(
            (a, b) =>
              new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
          );
        });
        const broadcastId = canonicalId || conversationId;
        void broadcastConversationMessage(broadcastId, response.message);
        const preview =
          messageText.trim() ||
          (imageUrl ? "Image" : "—");
        void broadcastInboxPing({
          t: Date.now(),
          conversationId: broadcastId,
          lastMessage: preview,
          timestamp: response.message.timestamp,
          customerEmail: actualCustomerEmail,
          customerName: actualCustomerName,
          customerProfileImage: customerProfileImage || undefined,
          vendorId: vendorId ? String(vendorId) : undefined,
          unreadBump: true,
        });
      }
    } catch (error) {
      console.error("Failed to send message:", error);
    }
  };

  const handleImageSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!hasActiveChatSession(vendorId, isAuthenticated)) {
      toast.error("Please sign in to use chat");
      setShowSignInDialog(true);
      return;
    }

    if (!file.type.startsWith('image/')) {
      toast.error("Please select a valid image file");
      return;
    }

    if (file.size > 10 * 1024 * 1024) {
      toast.error("Image size should be less than 10MB");
      return;
    }

    setUploadingImage(true);
    try {
      const options = {
        maxSizeMB: 0.5,
        maxWidthOrHeight: 1920,
        useWebWorker: true,
        fileType: 'image/jpeg' as const,
      };

      const compressedFile = await imageCompression(file, options);

      const reader = new FileReader();
      reader.onloadend = async () => {
        const base64Data = reader.result as string;
        
        try {
          const uploadResponse = await chatApi.uploadImage(
            base64Data,
            compressedFile.name || 'image.jpg',
            conversationId
          );

          if (uploadResponse.success && uploadResponse.imageUrl) {
            setSelectedImage(uploadResponse.imageUrl);
          } else {
            throw new Error("Failed to upload image");
          }
        } catch (uploadError) {
          console.error("Upload error:", uploadError);
          toast.error("Failed to upload image");
        } finally {
          setUploadingImage(false);
        }
      };

      reader.onerror = () => {
        toast.error("Failed to read image file");
        setUploadingImage(false);
      };

      reader.readAsDataURL(compressedFile);
    } catch (error) {
      console.error("Compression error:", error);
      toast.error("Failed to compress image");
      setUploadingImage(false);
    }

    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleAttachmentSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!hasActiveChatSession(vendorId, isAuthenticated)) {
      toast.error("Please sign in to use chat");
      setShowSignInDialog(true);
      return;
    }

    if (file.type.startsWith('image/')) {
      handleImageSelect(e);
    } else {
      toast.error("Currently only image attachments are supported", {
        description: "PDF and document support coming soon!"
      });
    }

    if (attachmentInputRef.current) {
      attachmentInputRef.current.value = '';
    }
  };

  const handleEmojiClick = (emojiData: EmojiClickData) => {
    setMessageInput(prev => prev + emojiData.emoji);
    setShowEmojiPicker(false);
  };

  const cancelImageSelection = () => {
    setSelectedImage(null);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  const formatTime = (timestamp: string) => {
    const date = new Date(timestamp);
    return date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
  };

  // Open chat — apex SECURE chat allows guests; vendor storefront requires sign-in
  const handleOpenChat = () => {
    const hasMigoo = hasMigooCustomerSession();
    setIsCustomerAuthenticated(hasMigoo || isAuthenticated);
    if (!hasActiveChatSession(vendorId, isAuthenticated)) {
      setShowSignInDialog(true);
      return;
    }
    setIsOpen(true);
  };

  const signInRequiredDialog = (
    <Dialog open={showSignInDialog} onOpenChange={setShowSignInDialog}>
      <DialogContent className="sm:max-w-md p-8">
        <DialogHeader>
          <DialogTitle>Sign In Required</DialogTitle>
          <DialogDescription>
            Please sign in to chat with {chatBrandLabel} customer service
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col items-center space-y-5 text-center pt-4">
          <div className="w-20 h-20 rounded-full bg-red-50 flex items-center justify-center">
            <div className="w-16 h-16 rounded-full bg-red-100 flex items-center justify-center">
              <Lock className="w-8 h-8 text-red-600" />
            </div>
          </div>
          <div className="flex w-full max-w-xs flex-col gap-2">
            <Button
              type="button"
              onClick={() => {
                setShowSignInDialog(false);
                window.dispatchEvent(new CustomEvent(MIGOO_OPEN_CUSTOMER_AUTH_FOR_CHAT_EVENT));
              }}
              className="gap-2 bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 text-white"
            >
              Sign in / Register
            </Button>
            <Button type="button" variant="outline" onClick={() => setShowSignInDialog(false)}>
              Close
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );

  const stickyAnchorClass = aboveStickyPurchaseBar ? "floating-chat-anchor--above-sticky" : "";
  const stickyFabClass = aboveStickyPurchaseBar ? "floating-chat-fab-anchor--above-sticky" : "";
  const soloFabClass = !reserveBackToTopStack && !aboveStickyPurchaseBar ? "floating-chat-fab-anchor--solo" : "";

  const renderPortal = (node: ReactNode) => {
    if (typeof document === "undefined") return node;
    return createPortal(node, document.body);
  };

  if (!isOpen) {
    return renderPortal(
      <>
        <div
          className={`floating-chat-fab-anchor ${stickyFabClass} ${soloFabClass} transition-all duration-700 ease-out ${
            isMounted ? "translate-x-0 opacity-100" : "translate-x-20 opacity-0"
          }`}
        >
          <Button
            onClick={handleOpenChat}
            size="lg"
            aria-label="Open chat"
            className="h-11 w-11 md:h-14 md:w-14 rounded-full shadow-2xl bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 transition-all duration-300 hover:scale-110 relative border-0 flex items-center justify-center"
          >
            <MessageCircleMore className="w-5 h-5 md:w-7 md:h-7 text-white" />

            {unreadCount > 0 && (
              <Badge className="absolute -top-1 -right-1 h-5 w-5 md:h-6 md:w-6 flex items-center justify-center p-0 bg-red-500 border-2 border-white text-xs font-semibold">
                {unreadCount}
              </Badge>
            )}
          </Button>
        </div>

        {signInRequiredDialog}
      </>
    );
  }

  return renderPortal(
    <>
      <div className={`floating-chat-anchor ${stickyAnchorClass}`}>
        <div className="floating-chat-panel bg-white shadow-2xl border border-slate-200 transition-all duration-300">
        {/* Header */}
        <div className="bg-gradient-to-r from-blue-600 to-purple-600 text-white p-4 rounded-t-2xl flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-white/20 rounded-full flex items-center justify-center backdrop-blur-sm">
              <MessageCircleMore className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-semibold text-sm">SECURE Support</h3>
              <div className="flex items-center gap-1">
                <div className="w-2 h-2 bg-green-400 rounded-full animate-pulse"></div>
                <span className="text-xs text-white/90">Online</span>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {unreadCount > 0 && (
              <Badge className="h-6 min-w-[1.5rem] px-1.5 flex items-center justify-center border-2 border-white bg-red-500 text-white text-xs font-semibold shadow-sm">
                {unreadCount > 99 ? "99+" : unreadCount}
              </Badge>
            )}
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setIsOpen(false)}
              className="text-white hover:bg-white/20 h-8 w-8 p-0"
            >
              <X className="w-4 h-4" />
            </Button>
          </div>
        </div>

        {/* Chat Body */}
        <>
            {/* Messages: flex-1 fills shell; inner min-h-full + justify-end pins short threads above composer */}
            <div className="flex-1 min-h-0 min-w-0 overflow-y-auto bg-slate-50">
              <div className="min-h-full flex flex-col justify-end gap-4 p-4">
              {messages.map((message) => (
                <div
                  key={message.id}
                  className={`flex min-w-0 w-full ${message.sender === "customer" ? "justify-end" : "justify-start"}`}
                >
                  <div
                    className={`max-w-[min(85%,18rem)] shrink break-words ${
                      message.sender === "customer"
                        ? "bg-gradient-to-r from-blue-600 to-purple-600 text-white"
                        : "bg-white border border-slate-200 text-slate-900"
                    } rounded-2xl px-4 py-2.5 shadow-sm`}
                  >
                    {message.sender === "admin" && (
                      <p className="text-xs font-semibold mb-1 text-blue-600">
                        {message.senderName}
                      </p>
                    )}
                    {message.imageUrl && (
                      <img
                        src={message.imageUrl}
                        alt="Uploaded"
                        className="max-w-full h-auto rounded mb-2"
                      />
                    )}
                    {message.text && (
                      <p className="text-sm leading-relaxed break-words">{message.text}</p>
                    )}
                    <div className="flex items-center justify-end gap-1 mt-1">
                      <p
                        className={`text-xs ${
                          message.sender === "customer" ? "text-white/70" : "text-slate-500"
                        }`}
                      >
                        {formatTime(message.timestamp)}
                      </p>
                      {message.sender === "customer" && message.status && (
                        <span className="text-white/70">
                          {message.status === "sent" && "✓"}
                          {message.status === "delivered" && "✓✓"}
                          {message.status === "read" && "✓✓"}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              ))}
              <div ref={messagesEndRef} className="h-px shrink-0" aria-hidden />
              </div>
            </div>

            {/* Input Area */}
            <div className="floating-chat-input p-3 bg-white border-t border-slate-200 rounded-b-2xl shrink-0">
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={handleImageSelect}
              />
              <input
                ref={attachmentInputRef}
                type="file"
                accept="*/*"
                className="hidden"
                onChange={handleAttachmentSelect}
              />

              {selectedImage && (
                <div className="mb-2 flex items-center gap-2 p-2 bg-slate-100 rounded-lg">
                  <img 
                    src={selectedImage} 
                    alt="Preview" 
                    className="w-12 h-12 rounded object-cover"
                  />
                  <span className="text-xs text-slate-600 flex-1">Image ready to send</span>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6 shrink-0"
                    onClick={cancelImageSelection}
                  >
                    <X className="w-4 h-4" />
                  </Button>
                </div>
              )}

              <div className="space-y-2">
                <Textarea
                  value={messageInput}
                  onChange={(e) => setMessageInput(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="Type your message..."
                  className="resize-none border-slate-300 rounded-xl min-h-[40px] max-h-[80px] w-full text-sm"
                  rows={1}
                />
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-1">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-8 w-8 p-0 text-slate-500 hover:text-slate-700"
                      onClick={() => attachmentInputRef.current?.click()}
                      title="Attach file"
                    >
                      <Paperclip className="w-4 h-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-8 w-8 p-0 text-slate-500 hover:text-slate-700"
                      onClick={() => fileInputRef.current?.click()}
                      title="Upload image"
                    >
                      {uploadingImage ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <ImageIcon className="w-4 h-4" />
                      )}
                    </Button>
                    <Popover open={showEmojiPicker} onOpenChange={setShowEmojiPicker}>
                      <PopoverTrigger asChild>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-8 w-8 p-0 text-slate-500 hover:text-slate-700"
                          title="Add emoji"
                        >
                          <Smile className="w-4 h-4" />
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-full p-0 border-0" side="top" align="end">
                        <EmojiPicker 
                          onEmojiClick={handleEmojiClick}
                          width={320}
                          height={400}
                        />
                      </PopoverContent>
                    </Popover>
                  </div>
                  <Button
                    onClick={handleSendMessage}
                    disabled={!messageInput.trim() && !selectedImage}
                    className="bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 h-9 px-4 rounded-xl flex items-center gap-2 shrink-0"
                  >
                    <Send className="w-4 h-4" />
                    <span className="text-sm">Send</span>
                  </Button>
                </div>
              </div>
            </div>
          </>
        </div>
      </div>
      {signInRequiredDialog}
    </>
  );
}