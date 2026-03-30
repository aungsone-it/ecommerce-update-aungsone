import { useState, useEffect, useRef } from "react";
import { MessageCircle, X, Send, Minimize2, Paperclip, Smile, Image as ImageIcon, Loader2, Headset, MessageCircleMore, Lock } from "lucide-react";
import { Button } from "./ui/button";
import { Badge } from "./ui/badge";
import { Textarea } from "./ui/textarea";
import { toast } from "sonner";
import { chatApi } from "../../utils/api";
import {
  MIGOO_OPEN_CUSTOMER_AUTH_FOR_CHAT_EVENT,
  MIGOO_USER_SESSION_CHANGED_EVENT,
  POLLING_INTERVALS_MS,
} from "../../constants";
import {
  broadcastConversationMessage,
  broadcastInboxPing,
  subscribeConversationBroadcast,
} from "../utils/chatRealtime";
import imageCompression from "browser-image-compression";
import { Popover, PopoverContent, PopoverTrigger } from "./ui/popover";
import { EmojiPicker, type EmojiClickData } from "./EmojiPickerLazy";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "./ui/dialog";
import { useDocumentVisible } from "../hooks/useDocumentVisible";

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
}

export function FloatingChat({ customerName = "Guest", customerEmail = "", onUnreadCountChange, forceOpen, onOpen, vendorId, isAuthenticated = false }: FloatingChatProps) {
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
      return hasMigooCustomerSession();
    } catch {
      return false;
    }
  });
  
  const [isMinimized, setIsMinimized] = useState(() => {
    const saved = localStorage.getItem("migoo-chat-isMinimized");
    return saved ? JSON.parse(saved) : false;
  });
  
  // Animation trigger state for first load
  const [isMounted, setIsMounted] = useState(false);
  
  const [conversationId] = useState(() => {
    // Try to load existing conversation ID first
    const storageKey = vendorId ? `migoo-chat-conversationId-vendor-${vendorId}` : "migoo-chat-conversationId";
    const savedConvId = localStorage.getItem(storageKey);
    if (savedConvId) {
      return savedConvId;
    }
    
    // Generate new conversation ID with vendor context
    let newConvId;
    if (vendorId) {
      // Vendor-specific conversation
      if (customerEmail) {
        newConvId = `conv-vendor-${vendorId}-${customerEmail.replace(/[^a-zA-Z0-9]/g, '-')}`;
      } else {
        newConvId = `conv-vendor-${vendorId}-guest-${Date.now()}`;
      }
    } else {
      // Main SECURE store conversation
      if (customerEmail) {
        newConvId = `conv-${customerEmail.replace(/[^a-zA-Z0-9]/g, '-')}`;
      } else {
        newConvId = `conv-guest-${Date.now()}`;
      }
    }
    
    // Save to localStorage
    localStorage.setItem(storageKey, newConvId);
    return newConvId;
  });
  
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
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesRef = useRef(messages);
  messagesRef.current = messages;
  const pollingIntervalRef = useRef<number | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const attachmentInputRef = useRef<HTMLInputElement>(null);
  const lastMessageIdRef = useRef<string | null>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
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
      const response = await chatApi.getMessages(conversationId);
      if (response.messages && Array.isArray(response.messages)) {
        const sortedMessages = response.messages.sort(
          (a: Message, b: Message) =>
            new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
        );
        
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
      const response = await chatApi.getMessages(conversationId);
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
          if (!isOpen || isMinimized) {
            setUnreadCount(prev => prev + newMessages.length);
          }
        }
      }
    } catch (error) {
      // Silent fail - don't show error to user
    }
  };

  // Load messages only once when chat opens
  useEffect(() => {
    if (isOpen && messages.length === 1 && messages[0].id === "welcome-1") {
      loadMessages();
    }
  }, [isOpen]);

  // Poll for new admin messages when chat is open (~30s, tab visible only — avoids interval reset on every message)
  useEffect(() => {
    if (!isOpen || isMinimized || !docVisible) {
      if (pollingIntervalRef.current) {
        clearInterval(pollingIntervalRef.current);
        pollingIntervalRef.current = null;
      }
      return;
    }
    pollingIntervalRef.current = window.setInterval(() => {
      if (typeof document !== 'undefined' && document.visibilityState !== 'visible') return;
      pollForNewMessages();
    }, POLLING_INTERVALS_MS.CHAT_HTTP_FALLBACK);

    return () => {
      if (pollingIntervalRef.current) {
        clearInterval(pollingIntervalRef.current);
        pollingIntervalRef.current = null;
      }
    };
  }, [isOpen, isMinimized, conversationId, docVisible]);

  // Realtime: admin replies without tight polling
  useEffect(() => {
    if (!conversationId || !docVisible) return;
    return subscribeConversationBroadcast(conversationId, (msg) => {
      if (String(msg.sender) !== "admin") return;
      setMessages((prev) => {
        const id = String(msg.id ?? "");
        if (!id || prev.some((m) => m.id === id)) return prev;
        const next = [...prev, msg as unknown as Message];
        return next.sort(
          (a, b) =>
            new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
        );
      });
      if (!isOpen || isMinimized) {
        setUnreadCount((c) => c + 1);
      }
    });
  }, [conversationId, isOpen, isMinimized, docVisible]);

  // Reset unread count when chat is opened
  useEffect(() => {
    if (isOpen && !isMinimized) {
      setUnreadCount(0);
    }
  }, [isOpen, isMinimized]);

  // Handle forceOpen prop — still require a customer or app auth session
  useEffect(() => {
    if (!forceOpen) return;
    if (!hasMigooCustomerSession() && !isAuthenticated) {
      setShowSignInDialog(true);
      onOpen?.();
      return;
    }
    setIsOpen(true);
    setIsMinimized(false);
    onOpen?.();
  }, [forceOpen, onOpen, isAuthenticated]);

  // Close chat when session is missing (incl. same-tab logout via migoo-user)
  useEffect(() => {
    const enforce = () => {
      setIsOpen((open) => {
        if (!open) return open;
        if (hasMigooCustomerSession() || isAuthenticated) return open;
        setIsMinimized(false);
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
  }, [isOpen, isAuthenticated]);

  // Notify parent of unread count changes
  useEffect(() => {
    if (onUnreadCountChange) {
      onUnreadCountChange(unreadCount);
    }
  }, [unreadCount, onUnreadCountChange]);

  // 💾 PERSISTENCE: Save messages to localStorage whenever they change
  useEffect(() => {
    const storageKey = vendorId ? `migoo-chat-messages-vendor-${vendorId}` : "migoo-chat-messages";
    localStorage.setItem(storageKey, JSON.stringify(messages));
  }, [messages, vendorId]);

  // 💾 PERSISTENCE: Save isOpen state to localStorage whenever it changes
  useEffect(() => {
    localStorage.setItem("migoo-chat-isOpen", JSON.stringify(isOpen));
  }, [isOpen]);

  // 💾 PERSISTENCE: Save isMinimized state to localStorage whenever it changes
  useEffect(() => {
    localStorage.setItem("migoo-chat-isMinimized", JSON.stringify(isMinimized));
  }, [isMinimized]);
  
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
    if (!hasMigooCustomerSession() && !isAuthenticated) {
      toast.error("Please sign in to send messages");
      setIsOpen(false);
      setIsMinimized(false);
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
        setMessages((prev) => {
          const without = prev.filter((m) => m.id !== newMessage.id);
          const merged = [...without, response.message!];
          return merged.sort(
            (a, b) =>
              new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
          );
        });
        void broadcastConversationMessage(conversationId, response.message);
      }
      void broadcastInboxPing();
    } catch (error) {
      console.error("Failed to send message:", error);
    }
  };

  const handleImageSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!hasMigooCustomerSession() && !isAuthenticated) {
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
    if (!hasMigooCustomerSession() && !isAuthenticated) {
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

  // 🔒 Open chat only for signed-in customers (read localStorage at click — avoids stale state after same-tab login on vendor store)
  const handleOpenChat = () => {
    const hasMigoo = hasMigooCustomerSession();
    setIsCustomerAuthenticated(hasMigoo || isAuthenticated);
    if (!hasMigoo && !isAuthenticated) {
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

  // Floating chat button (when closed)
  if (!isOpen) {
    return (
      <>
        <div 
          className={`fixed bottom-16 md:bottom-[176px] right-4 md:right-6 z-50 flex justify-center transition-all duration-700 ease-out ${
            isMounted 
              ? 'translate-x-0 opacity-100' 
              : 'translate-x-20 opacity-0'
          }`}
        >
          <Button
            onClick={handleOpenChat}
            size="lg"
            aria-label="Open chat"
            className="h-11 w-11 md:h-14 md:w-14 rounded-full shadow-2xl bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 transition-all duration-300 hover:scale-110 relative border-0 flex items-center justify-center"
          >
            {/* Chat Bot Icon */}
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

  // Chat window (when open)
  return (
    <>
    <div className="fixed bottom-0 right-0 sm:bottom-6 sm:right-6 z-50 w-full sm:w-auto">
      <div 
        className={`bg-white sm:rounded-2xl shadow-2xl border border-slate-200 transition-all duration-300 ${
          isMinimized 
            ? 'w-full sm:w-80 h-16' 
            : 'w-full sm:w-96 h-[100vh] sm:h-[600px]'
        }`}
      >
        {/* Header */}
        <div className="bg-gradient-to-r from-blue-600 to-purple-600 text-white p-4 sm:rounded-t-2xl flex items-center justify-between">
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
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setIsMinimized(!isMinimized)}
              className="text-white hover:bg-white/20 h-8 w-8 p-0"
            >
              <Minimize2 className="w-4 h-4" />
            </Button>
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
        {!isMinimized && (
          <>
            {/* Messages */}
            <div className="overflow-y-auto p-4 space-y-4 bg-slate-50" style={{ height: selectedImage ? 'calc(100vh - 340px)' : 'calc(100vh - 260px)', maxHeight: selectedImage ? '300px' : '380px' }}>
              {messages.map((message) => (
                <div
                  key={message.id}
                  className={`flex ${message.sender === "customer" ? "justify-end" : "justify-start"}`}
                >
                  <div
                    className={`max-w-[75%] ${
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
                      <p className="text-sm leading-relaxed">{message.text}</p>
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
              <div ref={messagesEndRef} />
            </div>

            {/* Input Area */}
            <div className="p-3 bg-white border-t border-slate-200 rounded-b-2xl">
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
                    <span className="text-sm hidden sm:inline">Send</span>
                  </Button>
                </div>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
    {signInRequiredDialog}
    </>
  );
}