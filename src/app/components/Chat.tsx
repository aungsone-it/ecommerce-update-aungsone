import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import imageCompression from "browser-image-compression";
import {
  MessageSquare,
  Search,
  Send,
  Paperclip,
  MoreVertical,
  Phone,
  Video,
  Star,
  Archive,
  Trash2,
  Image as ImageIcon,
  Smile,
  Check,
  CheckCheck,
  Clock,
  RefreshCw,
  Loader2,
  X,
  Eye,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
} from "lucide-react";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Badge } from "./ui/badge";
import { Textarea } from "./ui/textarea";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "./ui/dropdown-menu";
import { Popover, PopoverContent, PopoverTrigger } from "./ui/popover";
import { chatApi } from "../../utils/api";
import { mainStoreConversationIdFromEmail } from "../../utils/chatConversation";

const CHAT_MESSAGES_REVEALED_KEY = "admin-chat-messages-revealed-ids";

function readRevealedConversationIds(): Set<string> {
  try {
    const raw = sessionStorage.getItem(CHAT_MESSAGES_REVEALED_KEY);
    const ids: unknown = raw ? JSON.parse(raw) : [];
    return new Set(Array.isArray(ids) ? ids.filter((x) => typeof x === "string") : []);
  } catch {
    return new Set();
  }
}

function persistRevealedConversationId(conversationId: string) {
  const set = readRevealedConversationIds();
  set.add(conversationId);
  sessionStorage.setItem(CHAT_MESSAGES_REVEALED_KEY, JSON.stringify([...set]));
}
import { toast } from "sonner";
import { EmojiPicker, type EmojiClickData } from "./EmojiPickerLazy";

interface Message {
  id: string;
  conversationId: string;
  text: string;
  timestamp: string;
  sender: "admin" | "customer";
  senderName: string;
  status?: "sent" | "delivered" | "read";
  imageUrl?: string;
}

interface Conversation {
  id: string;
  customerName: string;
  customerEmail: string;
  customerProfileImage?: string; // Add profile image URL
  lastMessage: string;
  timestamp: string;
  unread: number;
  status: "online" | "offline";
  vendorSource?: string; // Where the customer came from
  vendorId?: string; // Vendor ID if from vendor store
}

export interface ChatInitialCustomer {
  email: string;
  name: string;
  avatar?: string;
}

export function Chat({
  initialCustomer = null,
  onInitialCustomerHandled,
}: {
  initialCustomer?: ChatInitialCustomer | null;
  onInitialCustomerHandled?: () => void;
} = {}) {
  const [searchQuery, setSearchQuery] = useState("");
  const [sortOrder, setSortOrder] = useState<"new-old" | "old-new">("new-old");
  const [selectedConversation, setSelectedConversation] = useState<string | null>(null);
  const [messageInput, setMessageInput] = useState("");
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMessages, setLoadingMessages] = useState(false);
  /** Bumps when admin reveals messages so we re-read sessionStorage (survives remount / first load). */
  const [messagesRevealTick, setMessagesRevealTick] = useState(0);
  const [sending, setSending] = useState(false);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const pollingIntervalRef = useRef<number | null>(null);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);

  const loadConversations = async () => {
    try {
      const response = await chatApi.getConversations();
      if (response.conversations && Array.isArray(response.conversations)) {
        setConversations(response.conversations);
        const totalUnread = response.conversations.reduce(
          (sum: number, conv: Conversation) => sum + (Number(conv.unread) || 0),
          0
        );
        window.dispatchEvent(
          new CustomEvent("admin-chat-unread-updated", { detail: { total: totalUnread } })
        );
      }
      setLoading(false);
    } catch (error) {
      console.error("Failed to load conversations:", error);
      setLoading(false);
    }
  };

  const loadMessages = useCallback(async (conversationId: string, silent = false) => {
    if (!silent) setLoadingMessages(true);
    try {
      const response = await chatApi.getMessages(conversationId);
      if (response.messages && Array.isArray(response.messages)) {
        const sortedMessages = response.messages.sort(
          (a: Message, b: Message) =>
            new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
        );
        setMessages(sortedMessages);

        if (!silent) {
          await chatApi.markAsRead(conversationId);
          setConversations((prev) => {
            const next = prev.map((conv) =>
              conv.id === conversationId ? { ...conv, unread: 0 } : conv
            );
            const totalUnread = next.reduce(
              (sum, c) => sum + (Number(c.unread) || 0),
              0
            );
            queueMicrotask(() =>
              window.dispatchEvent(
                new CustomEvent("admin-chat-unread-updated", {
                  detail: { total: totalUnread },
                })
              )
            );
            return next;
          });
        }
      }
    } catch (error) {
      console.error("Failed to load messages:", error);
      if (!silent) {
        toast.error("Failed to load messages", {
          description: "The server is taking longer than expected. Please try again.",
        });
      }
    } finally {
      if (!silent) setLoadingMessages(false);
    }
  }, []);

  // Auto-scroll to bottom when new messages arrive
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  /** True until admin clicks "Show messages" for this conversation id (stored in sessionStorage). */
  const showMessageSkeletonPreview = useMemo(() => {
    if (!selectedConversation) return false;
    const revealed = readRevealedConversationIds();
    return !revealed.has(selectedConversation);
  }, [selectedConversation, messagesRevealTick]);

  // Load conversations (skip when opening from Customers → Message; handoff effect loads)
  useEffect(() => {
    if (initialCustomer?.email?.trim()) return;
    loadConversations();
  }, [initialCustomer]);

  // Super admin: Customers → Message — open this thread and focus composer
  useEffect(() => {
    if (!initialCustomer?.email?.trim()) return;

    let cancelled = false;

    const open = async () => {
      setSearchQuery("");
      const email = initialCustomer.email.trim();
      const name = initialCustomer.name?.trim() || "Customer";
      const convId = mainStoreConversationIdFromEmail(email);

      try {
        const response = await chatApi.getConversations();
        if (cancelled) return;
        const raw = response.conversations || [];
        let list = [...raw];

        const match = list.find(
          (c) =>
            c.id === convId ||
            (c.customerEmail &&
              c.customerEmail.toLowerCase() === email.toLowerCase())
        );

        if (!match) {
          list = [
            ...list,
            {
              id: convId,
              customerName: name,
              customerEmail: email,
              customerProfileImage: initialCustomer.avatar || "",
              lastMessage: "—",
              timestamp: new Date().toISOString(),
              unread: 0,
              status: "offline" as const,
            },
          ];
        }

        setConversations(list);
        setLoading(false);
        const idToUse = match?.id ?? convId;
        setSelectedConversation(idToUse);
        await loadMessages(idToUse, false);
        if (cancelled) return;
      } catch (e) {
        console.error("Chat handoff failed:", e);
        if (!cancelled) {
          setLoading(false);
          toast.error("Could not open this chat", {
            description: "Try again from Chat or refresh the page.",
          });
          onInitialCustomerHandled?.();
        }
        return;
      }

      if (cancelled) return;
      onInitialCustomerHandled?.();

      setTimeout(() => {
        document.getElementById("admin-chat-composer-input")?.focus();
      }, 200);
    };

    void open();
    return () => {
      cancelled = true;
    };
  }, [initialCustomer, loadMessages, onInitialCustomerHandled]);

  // Poll for new messages every 3 seconds (real-time simulation)
  useEffect(() => {
    startPolling();
    return () => stopPolling();
  }, [selectedConversation]);

  const startPolling = () => {
    stopPolling(); // Clear any existing interval
    pollingIntervalRef.current = window.setInterval(() => {
      loadConversations();
      if (selectedConversation) {
        loadMessages(selectedConversation, true); // Silent refresh
      }
    }, 5000); // Poll every 5 seconds (reduced frequency to ease server load)
  };

  const stopPolling = () => {
    if (pollingIntervalRef.current) {
      clearInterval(pollingIntervalRef.current);
      pollingIntervalRef.current = null;
    }
  };

  // 🔥 CLEAR ALL CHAT HISTORY
  const clearAllHistory = async () => {
    if (!confirm("⚠️ Are you sure you want to delete ALL chat conversations and messages? This action cannot be undone!")) {
      return;
    }

    try {
      console.log("🗑️ Clearing all chat history...");
      
      const response = await fetch(
        `https://${chatApi.projectId}.supabase.co/functions/v1/make-server-16010b6f/chat/conversations/all`,
        {
          method: "DELETE",
          headers: {
            Authorization: `Bearer ${chatApi.publicAnonKey}`,
          },
        }
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Failed to clear chat history");
      }

      console.log(`✅ Chat history cleared:`, data);
      
      // Clear local state
      setConversations([]);
      setMessages([]);
      setSelectedConversation(null);
      
      toast.success("Chat History Cleared!", {
        description: `${data.conversationsDeleted} conversations and ${data.messagesDeleted} messages deleted`,
      });
    } catch (error: any) {
      console.error("❌ Error clearing chat history:", error);
      toast.error("Failed to clear chat history", {
        description: error.message || "An unexpected error occurred",
      });
    }
  };

  const handleSelectConversation = (conversationId: string) => {
    setSelectedConversation(conversationId);
    loadMessages(conversationId);
  };

  const handleSendMessage = async () => {
    if (!messageInput.trim() || !selectedConversation) return;

    const selectedConv = conversations.find((c) => c.id === selectedConversation);
    if (!selectedConv) return;

    setSending(true);
    try {
      const response = await chatApi.sendMessage({
        conversationId: selectedConversation,
        text: messageInput,
        sender: "admin",
        senderName: "Admin",
        customerEmail: selectedConv.customerEmail,
        customerName: selectedConv.customerName,
        customerProfileImage: selectedConv.customerProfileImage || undefined,
        imageUrl: selectedImage || undefined,
      });

      if (response.success && response.message) {
        // Add message to local state immediately
        setMessages(prev => [...prev, response.message]);
        setMessageInput("");
        setSelectedImage(null);
        toast.success("Message sent!");

        // Keep customer name/avatar in sidebar + header (server used to overwrite with "Admin")
        const ts = new Date().toISOString();
        const patchCustomer = (list: Conversation[]) =>
          list.map((c) =>
            c.id === selectedConversation
              ? {
                  ...c,
                  customerName: selectedConv.customerName,
                  customerEmail: selectedConv.customerEmail,
                  customerProfileImage: selectedConv.customerProfileImage || "",
                  lastMessage: messageInput.trim(),
                  timestamp: ts,
                }
              : c
          );

        setConversations((prev) => patchCustomer(prev));

        await loadConversations();
        // Re-apply customer identity after fetch (until backend is redeployed, API may still return "Admin")
        setConversations((prev) => patchCustomer(prev));
      }
    } catch (error) {
      console.error("Failed to send message:", error);
      toast.error("Failed to send message");
    } finally {
      setSending(false);
    }
  };

  const handleImageSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Check file type
    if (!file.type.startsWith('image/')) {
      toast.error("Please select a valid image file");
      return;
    }

    // Check file size (5MB limit before compression)
    if (file.size > 10 * 1024 * 1024) {
      toast.error("Image size should be less than 10MB");
      return;
    }

    setUploadingImage(true);
    try {
      // Compress the image
      const options = {
        maxSizeMB: 0.5, // Maximum size 500KB
        maxWidthOrHeight: 1920,
        useWebWorker: true,
        fileType: 'image/jpeg',
      };

      console.log(`📦 Original image size: ${(file.size / 1024 / 1024).toFixed(2)} MB`);
      const compressedFile = await imageCompression(file, options);
      console.log(`✅ Compressed image size: ${(compressedFile.size / 1024 / 1024).toFixed(2)} MB`);

      // Convert to base64
      const reader = new FileReader();
      reader.onloadend = async () => {
        const base64Data = reader.result as string;
        
        try {
          // Upload to server
          const uploadResponse = await chatApi.uploadImage(
            base64Data,
            compressedFile.name || 'image.jpg',
            selectedConversation || undefined
          );

          if (uploadResponse.success && uploadResponse.imageUrl) {
            setSelectedImage(uploadResponse.imageUrl);
            setMessageInput(`📷 Image: ${compressedFile.name}`);
            toast.success("Image uploaded and compressed successfully!");
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

    // Reset input
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const cancelImageSelection = () => {
    setSelectedImage(null);
    setMessageInput("");
  };

  const formatTime = (timestamp: string) => {
    const date = new Date(timestamp);
    const now = new Date();
    const diffInMs = now.getTime() - date.getTime();
    const diffInMinutes = Math.floor(diffInMs / 60000);
    const diffInHours = Math.floor(diffInMs / 3600000);
    const diffInDays = Math.floor(diffInMs / 86400000);

    if (diffInMinutes < 1) return "Just now";
    if (diffInMinutes < 60) return `${diffInMinutes} min ago`;
    if (diffInHours < 24) return `${diffInHours} hour${diffInHours > 1 ? "s" : ""} ago`;
    if (diffInDays < 7) return `${diffInDays} day${diffInDays > 1 ? "s" : ""} ago`;
    
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  };

  const formatMessageTime = (timestamp: string) => {
    const date = new Date(timestamp);
    return date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
  };

  const filteredConversations = conversations.filter((conv) =>
    (conv.customerName || "").toLowerCase().includes(searchQuery.toLowerCase()) ||
    (conv.customerEmail || "").toLowerCase().includes(searchQuery.toLowerCase())
  );

  // Apply sorting
  const sortedConversations = [...filteredConversations].sort((a, b) => {
    const timeA = new Date(a.timestamp).getTime();
    const timeB = new Date(b.timestamp).getTime();
    
    return sortOrder === "new-old" ? timeB - timeA : timeA - timeB;
  });

  const selectedConv = conversations.find((c) => c.id === selectedConversation);
  const totalUnread = conversations.reduce((sum, conv) => sum + conv.unread, 0);

  const handleEmojiClick = (emoji: EmojiClickData) => {
    setMessageInput((prev) => prev + emoji.emoji);
    setShowEmojiPicker(false);
  };

  return (
    <div className="h-screen flex flex-col bg-white">
      {/* Header */}
      <div className="px-6 py-4 border-b border-slate-200 flex-shrink-0">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold text-slate-900">Chat</h1>
            <p className="text-sm text-slate-500 mt-0.5">
              Connect with your customers in real-time
            </p>
          </div>
          <div className="flex items-center gap-2">
            {totalUnread > 0 && (
              <Badge className="bg-gradient-to-r from-blue-600 to-purple-600 text-white border-0">
                {totalUnread} Unread
              </Badge>
            )}
            <Button
              variant="outline"
              size="sm"
              onClick={() => loadConversations()}
              className="gap-2"
            >
              <RefreshCw className="w-4 h-4" />
              Refresh
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={clearAllHistory}
              className="gap-2 border-red-300 text-red-600 hover:bg-red-50 hover:border-red-400"
            >
              <Trash2 className="w-4 h-4" />
              Clear All
            </Button>
          </div>
        </div>
      </div>

      {/* Chat Container */}
      <div className="flex-1 flex overflow-hidden">
        {/* Conversations List */}
        <div className="w-80 border-r border-slate-200 flex flex-col bg-slate-50">
          {/* Search */}
          <div className="p-4 border-b border-slate-200 bg-white space-y-2">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <Input
                placeholder="Search conversations..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10 bg-slate-50"
              />
            </div>
            <div className="flex items-center justify-between">
              <span className="text-xs text-slate-500">
                {sortedConversations.length} conversation{sortedConversations.length !== 1 ? 's' : ''}
              </span>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="sm" className="gap-2 h-7 text-xs">
                    {sortOrder === "new-old" ? (
                      <>
                        <ArrowDown className="w-3 h-3" />
                        Newest First
                      </>
                    ) : (
                      <>
                        <ArrowUp className="w-3 h-3" />
                        Oldest First
                      </>
                    )}
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onClick={() => setSortOrder("new-old")}>
                    <ArrowDown className="w-4 h-4 mr-2" />
                    Newest First
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => setSortOrder("old-new")}>
                    <ArrowUp className="w-4 h-4 mr-2" />
                    Oldest First
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>

          {/* Conversation List */}
          <div className="flex-1 overflow-y-auto">
            {loading ? (
              <div className="space-y-1 p-2">
                {Array.from({ length: 6 }).map((_, index) => (
                  <div key={`skeleton-${index}`} className="flex items-center gap-3 p-3 animate-pulse">
                    <div className="w-12 h-12 bg-slate-200 rounded-full flex-shrink-0"></div>
                    <div className="flex-1 space-y-2">
                      <div className="flex items-center justify-between">
                        <div className="h-4 bg-slate-200 rounded w-32"></div>
                        <div className="h-3 bg-slate-200 rounded w-12"></div>
                      </div>
                      <div className="h-3 bg-slate-200 rounded w-48"></div>
                    </div>
                  </div>
                ))}
              </div>
            ) : sortedConversations.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-64 text-center px-4">
                <MessageSquare className="w-12 h-12 text-slate-300 mb-3" />
                <p className="text-sm text-slate-500">
                  {searchQuery ? "No conversations found" : "No conversations yet"}
                </p>
                <p className="text-xs text-slate-400 mt-1">
                  Customers will appear here when they message you
                </p>
              </div>
            ) : (
              sortedConversations.map((conv) => {
                // Use customer profile image if available, otherwise use Dicebear avatar
                const avatar =
                  conv.customerProfileImage ||
                  `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(conv.customerName)}&backgroundColor=3b82f6`;

                return (
                  <button
                    key={conv.id}
                    onClick={() => handleSelectConversation(conv.id)}
                    className={`w-full p-4 flex items-start gap-3 hover:bg-white transition-colors border-b border-slate-100 ${
                      selectedConversation === conv.id ? "bg-white shadow-sm" : ""
                    }`}
                  >
                    <div className="relative flex-shrink-0">
                      <img
                        key={avatar}
                        src={avatar}
                        alt={conv.customerName}
                        className="w-12 h-12 rounded-full object-cover"
                      />
                      {conv.status === "online" && (
                        <div className="absolute bottom-0 right-0 w-3 h-3 bg-green-500 rounded-full border-2 border-white"></div>
                      )}
                    </div>
                    <div className="flex-1 min-w-0 text-left">
                      <div className="flex items-center justify-between mb-1">
                        <h3 className="text-sm font-semibold text-slate-900 truncate">
                          {conv.customerName}
                        </h3>
                        <span className="text-xs text-slate-500 flex-shrink-0 ml-2">
                          {formatTime(conv.timestamp)}
                        </span>
                      </div>
                      <p className="text-xs text-slate-500 truncate mb-1">
                        {conv.customerEmail}
                      </p>
                      {conv.vendorSource && (
                        <Badge variant="outline" className="text-xs mb-1 bg-gradient-to-r from-blue-50 to-purple-50 border-blue-200 text-blue-700">
                          🏪 From: {conv.vendorSource}
                        </Badge>
                      )}
                      <p className="text-sm text-slate-600 truncate">
                        {conv.lastMessage}
                      </p>
                    </div>
                    {conv.unread > 0 && (
                      <div className="flex-shrink-0">
                        <Badge className="bg-gradient-to-r from-blue-600 to-purple-600 text-white border-0">
                          {conv.unread}
                        </Badge>
                      </div>
                    )}
                  </button>
                );
              })
            )}
          </div>
        </div>

        {/* Chat Area */}
        {selectedConv ? (
          <div className="flex-1 flex flex-col">
            {/* Chat Header */}
            <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between bg-white">
              <div className="flex items-center gap-3">
                <div className="relative">
                  <img
                    key={
                      selectedConv.customerProfileImage ||
                      `dicebear-${selectedConv.customerName}`
                    }
                    src={
                      selectedConv.customerProfileImage ||
                      `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(selectedConv.customerName)}&backgroundColor=3b82f6`
                    }
                    alt={selectedConv.customerName}
                    className="w-10 h-10 rounded-full object-cover"
                  />
                  {selectedConv.status === "online" && (
                    <div className="absolute bottom-0 right-0 w-2.5 h-2.5 bg-green-500 rounded-full border-2 border-white"></div>
                  )}
                </div>
                <div>
                  <h3 className="text-sm font-semibold text-slate-900">
                    {selectedConv.customerName}
                  </h3>
                  <div className="flex items-center gap-2">
                    <p className="text-xs text-slate-500">
                      {selectedConv.customerEmail}
                    </p>
                    {selectedConv.vendorSource && (
                      <Badge variant="outline" className="text-xs bg-gradient-to-r from-blue-50 to-purple-50 border-blue-200 text-blue-700">
                        🏪 {selectedConv.vendorSource}
                      </Badge>
                    )}
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Button variant="ghost" size="icon" title="Call">
                  <Phone className="w-5 h-5" />
                </Button>
                <Button variant="ghost" size="icon" title="Video call">
                  <Video className="w-5 h-5" />
                </Button>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon">
                      <MoreVertical className="w-5 h-5" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem>
                      <Star className="w-4 h-4 mr-2" />
                      Star conversation
                    </DropdownMenuItem>
                    <DropdownMenuItem>
                      <Archive className="w-4 h-4 mr-2" />
                      Archive
                    </DropdownMenuItem>
                    <DropdownMenuItem className="text-red-600">
                      <Trash2 className="w-4 h-4 mr-2" />
                      Delete
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto p-6 space-y-4 bg-slate-50 min-h-0">
              {showMessageSkeletonPreview ? (
                <div className="flex flex-col min-h-full">
                  {loadingMessages && (
                    <div className="flex items-center justify-end gap-2 text-xs text-slate-500 mb-2">
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      <span>Loading messages…</span>
                    </div>
                  )}
                  <div className="space-y-4 flex-1">
                    {Array.from({ length: 4 }).map((_, index) => (
                      <div
                        key={`skeleton-msg-${index}`}
                        className={`flex ${index % 2 === 0 ? "justify-start" : "justify-end"} animate-pulse`}
                      >
                        <div
                          className={`flex gap-3 max-w-[70%] ${index % 2 === 0 ? "flex-row" : "flex-row-reverse"}`}
                        >
                          <div className="w-8 h-8 bg-slate-200 rounded-full flex-shrink-0" />
                          <div className="space-y-2 flex-1">
                            <div className="h-16 bg-slate-200 rounded-lg" />
                            <div className="h-3 bg-slate-200 rounded w-20" />
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                  <div className="pt-6 mt-auto flex flex-col items-center gap-2 border-t border-slate-200/80">
                    <Button
                      type="button"
                      onClick={() => {
                        if (!selectedConversation) return;
                        try {
                          persistRevealedConversationId(selectedConversation);
                        } catch {
                          /* private mode */
                        }
                        setMessagesRevealTick((t) => t + 1);
                      }}
                      className="gap-2 bg-slate-900 hover:bg-slate-800 text-white"
                    >
                      <Eye className="w-4 h-4" />
                      Show messages
                    </Button>
                    <p className="text-xs text-slate-500 text-center max-w-sm">
                      Stays until you turn it off — not tied to loading. Persists while this tab is open.
                    </p>
                  </div>
                </div>
              ) : loadingMessages ? (
                <div className="flex flex-col items-center justify-center min-h-[200px] gap-3">
                  <Loader2 className="w-10 h-10 text-slate-400 animate-spin" />
                  <p className="text-sm text-slate-500">Loading messages…</p>
                </div>
              ) : messages.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full text-center">
                  <MessageSquare className="w-12 h-12 text-slate-300 mb-3" />
                  <p className="text-sm text-slate-500">No messages yet</p>
                  <p className="text-xs text-slate-400 mt-1">
                    Start the conversation by sending a message
                  </p>
                </div>
              ) : (
                <>
                  {messages.map((message) => (
                    <div
                      key={message.id}
                      className={`flex ${
                        message.sender === "admin" ? "justify-end" : "justify-start"
                      }`}
                    >
                      <div
                        className={`max-w-md ${
                          message.sender === "admin" ? "order-2" : "order-1"
                        }`}
                      >
                        <div
                          className={`rounded-2xl px-4 py-2.5 shadow-sm ${
                            message.sender === "admin"
                              ? "bg-gradient-to-r from-blue-600 to-purple-600 text-white"
                              : "bg-white text-slate-900 border border-slate-200"
                          }`}
                        >
                          {message.sender === "customer" && (
                            <p className="text-xs font-semibold mb-1 text-blue-600">
                              {message.senderName}
                            </p>
                          )}
                          {message.imageUrl && (
                            <img
                              src={message.imageUrl}
                              alt="Attached image"
                              className="max-w-full rounded-lg mb-2"
                              style={{ maxHeight: '300px' }}
                            />
                          )}
                          <p className="text-sm leading-relaxed">{message.text}</p>
                        </div>
                        <div
                          className={`flex items-center gap-1 mt-1 ${
                            message.sender === "admin" ? "justify-end" : "justify-start"
                          }`}
                        >
                          <span className="text-xs text-slate-500">
                            {formatMessageTime(message.timestamp)}
                          </span>
                          {message.sender === "admin" && message.status && (
                            <span className="text-xs text-slate-500">
                              {message.status === "read" && (
                                <CheckCheck className="w-3 h-3 text-blue-600" />
                              )}
                              {message.status === "delivered" && (
                                <CheckCheck className="w-3 h-3" />
                              )}
                              {message.status === "sent" && (
                                <Check className="w-3 h-3" />
                              )}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                  <div ref={messagesEndRef} />
                </>
              )}
            </div>

            {/* Message Input */}
            <div className="px-6 py-4 border-t border-slate-200 bg-white">
              {/* Hidden file input */}
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={handleImageSelect}
              />
              
              {/* Image preview */}
              {selectedImage && (
                <div className="mb-3 flex items-start gap-2 p-2 bg-slate-100 rounded-lg">
                  <img 
                    src={selectedImage} 
                    alt="Preview" 
                    className="w-20 h-20 rounded object-cover"
                  />
                  <Button
                    variant="ghost"
                    size="icon"
                    className="ml-auto"
                    onClick={cancelImageSelection}
                  >
                    <X className="w-4 h-4" />
                  </Button>
                </div>
              )}

              {/* Uploading indicator */}
              {uploadingImage && (
                <div className="mb-3 flex items-center gap-2 p-3 bg-amber-50 rounded-lg">
                  <Loader2 className="w-4 h-4 animate-spin text-amber-600" />
                  <span className="text-sm text-amber-600">Compressing and uploading image...</span>
                </div>
              )}

              <div className="flex items-end gap-3">
                <Button variant="ghost" size="icon" className="flex-shrink-0">
                  <Paperclip className="w-5 h-5" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="flex-shrink-0"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={uploadingImage}
                >
                  {uploadingImage ? (
                    <Loader2 className="w-5 h-5 animate-spin" />
                  ) : (
                    <ImageIcon className="w-5 h-5" />
                  )}
                </Button>
                <div className="flex-1">
                  <Textarea
                    id="admin-chat-composer-input"
                    placeholder="Type your message..."
                    value={messageInput}
                    onChange={(e) => setMessageInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !e.shiftKey) {
                        e.preventDefault();
                        handleSendMessage();
                      }
                    }}
                    className="min-h-[44px] max-h-32 resize-none rounded-xl"
                    disabled={sending || uploadingImage}
                  />
                </div>
                <Popover open={showEmojiPicker} onOpenChange={setShowEmojiPicker}>
                  <PopoverTrigger asChild>
                    <Button variant="ghost" size="icon" className="flex-shrink-0">
                      <Smile className="w-5 h-5" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-full p-0 border-0" side="top" align="end">
                    <EmojiPicker 
                      onEmojiClick={handleEmojiClick}
                      width={350}
                      height={450}
                    />
                  </PopoverContent>
                </Popover>
                <Button
                  onClick={handleSendMessage}
                  disabled={!messageInput.trim() || sending || uploadingImage}
                  className="bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 text-white flex-shrink-0 rounded-xl"
                >
                  {sending ? (
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  ) : (
                    <Send className="w-4 h-4 mr-2" />
                  )}
                  Send
                </Button>
              </div>
            </div>
          </div>
        ) : (
          <div className="flex-1 flex items-center justify-center bg-slate-50">
            <div className="text-center">
              <MessageSquare className="w-16 h-16 text-slate-300 mx-auto mb-4" />
              <h3 className="text-lg font-semibold text-slate-900 mb-2">
                No conversation selected
              </h3>
              <p className="text-sm text-slate-500">
                Choose a conversation from the list to start chatting
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}