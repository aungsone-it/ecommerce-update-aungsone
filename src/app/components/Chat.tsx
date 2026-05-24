import { useState, useEffect, useRef, useCallback } from "react";
import { CHAT_SCROLL_DEBOUNCE_MS, POLLING_INTERVALS_MS } from "../../constants";
import imageCompression from "browser-image-compression";
import {
  MessageSquare,
  Send,
  Paperclip,
  Star,
  Trash2,
  Image as ImageIcon,
  Smile,
  Check,
  CheckCheck,
  Clock,
  Loader2,
  X,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
} from "lucide-react";
import { AdminClearableSearchInput } from "./AdminClearableSearchInput";
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
import { conversationBucketKeyClient, canonicalChatThreadId, mainStoreConversationIdFromEmail } from "../../utils/chatConversation";
import {
  broadcastConversationMessage,
  broadcastCustomerChatMessage,
  broadcastInboxPing,
  subscribeAdminInbox,
  subscribeConversationBroadcast,
  type InboxBroadcastPayload,
} from "../utils/chatRealtime";
import { useDocumentVisible } from "../hooks/useDocumentVisible";
import { getCachedAdminVendorsForProductList } from "../utils/module-cache";
import { buildVendorDisplayLookup, resolveChatVendorLabel } from "../utils/vendorDisplay";

import { toast } from "sonner";
import { EmojiPicker, type EmojiClickData } from "./EmojiPickerLazy";
import { useLanguage } from "../contexts/LanguageContext";

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
  starred?: boolean;
  aliasConversationIds?: string[];
}

export interface ChatInitialCustomer {
  email: string;
  name: string;
  avatar?: string;
}

function isGeneratedChatAvatarUrl(url: string): boolean {
  const u = (url || "").trim().toLowerCase();
  if (!u.startsWith("http")) return true;
  return (
    u.includes("dicebear.com") ||
    u.includes("ui-avatars.com") ||
    u.includes("robohash.org") ||
    u.includes("avatar.vercel.sh")
  );
}

/** Same email can have multiple threads; show one profile photo — newest activity wins (matches server merge). */
function mergeConversationAvatarsByEmail(conversations: Conversation[]): Conversation[] {
  const emailToBest = new Map<string, { url: string; t: number }>();
  for (const conv of conversations) {
    const em = (conv.customerEmail || "").toLowerCase().trim();
    if (!em) continue;
    const img = (conv.customerProfileImage || "").trim();
    if (!img.startsWith("http") || isGeneratedChatAvatarUrl(img)) continue;
    const t = new Date(conv.timestamp || 0).getTime() || 0;
    const prev = emailToBest.get(em);
    if (!prev || t >= prev.t) {
      emailToBest.set(em, { url: img, t });
    }
  }
  return conversations.map((conv) => {
    const em = (conv.customerEmail || "").toLowerCase().trim();
    const best = em ? emailToBest.get(em) : undefined;
    if (best?.url) {
      return { ...conv, customerProfileImage: best.url };
    }
    return conv;
  });
}

function conversationRowMatchesId(conv: Conversation, id: string | null | undefined): boolean {
  if (!id) return false;
  return (
    conv.id === id ||
    (Array.isArray(conv.aliasConversationIds) && conv.aliasConversationIds.includes(id))
  );
}

/** Keep the open thread in the sidebar when GET /conversations omits a not-yet-persisted handoff row. */
function preserveSelectedConversationInList(
  next: Conversation[],
  sources: Conversation[],
  selectedId: string | null
): Conversation[] {
  if (!selectedId) return next;
  if (next.some((c) => conversationRowMatchesId(c, selectedId))) return next;
  const pinned = sources.find((c) => conversationRowMatchesId(c, selectedId));
  if (!pinned) return next;
  return mergeConversationAvatarsByEmail([pinned, ...next]);
}

function findConversationRow(
  conversations: Conversation[],
  selectedId: string | null,
  pinned: Conversation | null
): Conversation | undefined {
  if (!selectedId) return undefined;
  const fromList = conversations.find((c) => conversationRowMatchesId(c, selectedId));
  if (fromList) return fromList;
  if (pinned && conversationRowMatchesId(pinned, selectedId)) return pinned;
  return undefined;
}

type InboxMergeResult =
  | { kind: "fetch" }
  | { kind: "merged"; next: Conversation[] };

/** Merge admin sidebar from Realtime inbox broadcast (avoids GET /chat/conversations on every ping). */
function mergeInboxFromPayload(
  prev: Conversation[],
  payload: InboxBroadcastPayload,
  activeThreadId: string | null
): InboxMergeResult {
  const cid = String(payload.conversationId || "").trim();
  if (!cid || !String(payload.timestamp || "").trim()) return { kind: "fetch" };

  const email = String(payload.customerEmail || "").trim();

  let isActive = activeThreadId != null && activeThreadId === cid;
  if (!isActive && activeThreadId != null && email) {
    const payloadBucket = conversationBucketKeyClient({
      customerEmail: email,
      vendorId: payload.vendorId,
      vendorSource: payload.vendorSource,
      id: cid,
    });
    const activeRow = prev.find(
      (c) =>
        c.id === activeThreadId ||
        (Array.isArray(c.aliasConversationIds) && c.aliasConversationIds.includes(activeThreadId))
    );
    if (activeRow && conversationBucketKeyClient(activeRow) === payloadBucket) {
      isActive = true;
    }
  }
  const lastMessage = String(payload.lastMessage ?? "—").trim() || "—";
  const ts = String(payload.timestamp);
  const bumpUnread = Boolean(payload.unreadBump) && !isActive;

  const matchesRow = (c: Conversation) =>
    c.id === cid || (Array.isArray(c.aliasConversationIds) && c.aliasConversationIds.includes(cid));

  let idx = prev.findIndex(matchesRow);
  if (idx === -1 && email) {
    const payloadBucket = conversationBucketKeyClient({
      customerEmail: email,
      vendorId: payload.vendorId,
      vendorSource: payload.vendorSource,
      id: cid,
    });
    idx = prev.findIndex((c) => conversationBucketKeyClient(c) === payloadBucket);
  }

  if (idx === -1) {
    const name =
      String(payload.customerName || "").trim() ||
      (email.includes("@") ? email.split("@")[0] : "Customer");
    const row: Conversation = {
      id: cid,
      customerName: name,
      customerEmail: email || "—",
      customerProfileImage: payload.customerProfileImage,
      lastMessage,
      timestamp: ts,
      unread: bumpUnread ? 1 : 0,
      status: "offline",
      vendorId: payload.vendorId,
      vendorSource: payload.vendorSource,
    };
    return { kind: "merged", next: [row, ...prev] };
  }

  const cur = prev[idx];
  const nextUnread = bumpUnread
    ? (Number(cur.unread) || 0) + 1
    : isActive
      ? 0
      : Number(cur.unread) || 0;

  const updated: Conversation = {
    ...cur,
    id: cur.id,
    lastMessage,
    timestamp: ts,
    unread: nextUnread,
    customerProfileImage: payload.customerProfileImage || cur.customerProfileImage,
    customerName: String(payload.customerName || "").trim() || cur.customerName,
    customerEmail: String(payload.customerEmail || "").trim() || cur.customerEmail,
    vendorId: payload.vendorId || cur.vendorId,
    vendorSource: payload.vendorSource ?? cur.vendorSource,
  };

  const rest = prev.filter((_, i) => i !== idx);
  return { kind: "merged", next: [updated, ...rest] };
}

/** Inbox survives super-admin section switches (Chat unmounts off `AdminPage` when you leave). */
let chatAdminInboxCache: Conversation[] | null = null;
const chatAdminMessagesCache = new Map<string, Message[]>();
let chatAdminSelectedConversationCache: string | null = null;

/** Delay before showing the thread spinner — avoids flash on fast GET /messages. */
const CHAT_MESSAGES_SPINNER_DELAY_MS = 120;

function getCachedThreadMessages(conversationId: string): Message[] | undefined {
  if (chatAdminMessagesCache.has(conversationId)) {
    return chatAdminMessagesCache.get(conversationId);
  }
  return undefined;
}

function primeCachedThreadMessages(conversationId: string, messages: Message[]): void {
  chatAdminMessagesCache.set(conversationId, messages);
}

type ChatInboxLoadMode = "initial" | "refresh" | "silent";

export function Chat({
  initialCustomer = null,
  onInitialCustomerHandled,
}: {
  initialCustomer?: ChatInitialCustomer | null;
  onInitialCustomerHandled?: () => void;
} = {}) {
  const { t } = useLanguage();
  const [searchQuery, setSearchQuery] = useState("");
  const [sortOrder, setSortOrder] = useState<"new-old" | "old-new" | "starred">("new-old");
  const [selectedConversation, setSelectedConversation] = useState<string | null>(
    () => chatAdminSelectedConversationCache
  );
  const [messageInput, setMessageInput] = useState("");
  const [conversations, setConversations] = useState<Conversation[]>(() =>
    chatAdminInboxCache?.length
      ? mergeConversationAvatarsByEmail([...chatAdminInboxCache])
      : []
  );
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(() => !(chatAdminInboxCache && chatAdminInboxCache.length > 0));
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [sending, setSending] = useState(false);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const scrollDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pollingIntervalRef = useRef<number | null>(null);
  const loadConversationsRef = useRef<() => Promise<void>>(async () => {});
  const inboxFetchFallbackRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const docVisible = useDocumentVisible();
  const [vendorLookup, setVendorLookup] = useState<Record<string, string>>({});
  const selectedConversationRef = useRef<string | null>(selectedConversation);
  selectedConversationRef.current = selectedConversation;
  const conversationsRef = useRef<Conversation[]>(conversations);
  conversationsRef.current = conversations;
  const handoffPinnedConversationRef = useRef<Conversation | null>(null);
  const messagesLoadInFlightRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const list = await getCachedAdminVendorsForProductList(false);
        if (!cancelled && Array.isArray(list)) {
          setVendorLookup(buildVendorDisplayLookup(list));
        }
      } catch {
        if (!cancelled) setVendorLookup({});
      }
    };
    void load();
    const onVendorUpdate = () => {
      void load();
    };
    window.addEventListener("vendorDataUpdated", onVendorUpdate as EventListener);
    return () => {
      cancelled = true;
      window.removeEventListener("vendorDataUpdated", onVendorUpdate as EventListener);
    };
  }, []);

  const loadConversations = async (mode: ChatInboxLoadMode = "refresh") => {
    try {
      if (mode === "initial" || mode === "refresh") {
        setLoading(true);
      }
      const response = await chatApi.getConversations();
      if (response.conversations && Array.isArray(response.conversations)) {
        let merged = mergeConversationAvatarsByEmail(response.conversations as Conversation[]);
        const sel = selectedConversationRef.current;
        merged = preserveSelectedConversationInList(merged, conversationsRef.current, sel);
        if (handoffPinnedConversationRef.current) {
          merged = preserveSelectedConversationInList(
            merged,
            [handoffPinnedConversationRef.current],
            sel
          );
        }
        chatAdminInboxCache = merged;
        setConversations(merged);
        if (sel) {
          const row = findConversationRow(merged, sel, handoffPinnedConversationRef.current);
          if (row && row.id !== sel) {
            setSelectedConversation(row.id);
          }
          if (row && handoffPinnedConversationRef.current?.id === row.id) {
            handoffPinnedConversationRef.current = null;
          }
        }
        const totalUnread = response.conversations.reduce(
          (sum: number, conv: Conversation) => sum + (Number(conv.unread) || 0),
          0
        );
        window.dispatchEvent(
          new CustomEvent("admin-chat-unread-updated", { detail: { total: totalUnread } })
        );
      }
    } catch (error) {
      console.error("Failed to load conversations:", error);
    } finally {
      if (mode !== "silent") {
        setLoading(false);
      }
    }
  };

  loadConversationsRef.current = () => {
    void loadConversations("silent");
  };

  /**
   * @param silentUi When true, skip loading spinner (e.g. cached thread or background refetch).
   * @param markRead When `"auto"`, mark read only if `silentUi` is false (legacy poll behavior).
   *   Pass `true` when the admin opened this thread so badges clear even if `silentUi` is true.
   */
  const loadMessages = useCallback(
    async (
      conversationId: string,
      silentUi = false,
      markRead: boolean | "auto" = "auto"
    ) => {
      const shouldMarkRead = markRead === "auto" ? !silentUi : markRead;
      const cached = getCachedThreadMessages(conversationId);

      if (messagesLoadInFlightRef.current.has(conversationId) && silentUi) {
        return;
      }

      let spinnerTimer: ReturnType<typeof setTimeout> | null = null;
      if (!silentUi) {
        if (cached !== undefined) {
          setMessages(cached);
          setLoadingMessages(false);
        } else {
          spinnerTimer = setTimeout(() => setLoadingMessages(true), CHAT_MESSAGES_SPINNER_DELAY_MS);
        }
      }

      messagesLoadInFlightRef.current.add(conversationId);
      try {
        const response = await chatApi.getMessages(conversationId);
        if (response.messages && Array.isArray(response.messages)) {
          const sortedMessages = response.messages.sort(
            (a: Message, b: Message) =>
              new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
          );
          primeCachedThreadMessages(conversationId, sortedMessages);
          setMessages(sortedMessages);

          if (shouldMarkRead) {
            void chatApi.markAsRead(conversationId).then(() => {
              setConversations((prev) => {
                const next = prev.map((conv) =>
                  conv.id === conversationId ||
                  (Array.isArray(conv.aliasConversationIds) &&
                    conv.aliasConversationIds.includes(conversationId))
                    ? { ...conv, unread: 0 }
                    : conv
                );
                chatAdminInboxCache = mergeConversationAvatarsByEmail(next);
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
            }).catch((err) => {
              console.warn("Failed to mark conversation as read:", err);
            });
          }
        }
      } catch (error) {
        console.error("Failed to load messages:", error);
        if (!silentUi) {
          toast.error("Failed to load messages", {
            description: "The server is taking longer than expected. Please try again.",
          });
        }
      } finally {
        messagesLoadInFlightRef.current.delete(conversationId);
        if (spinnerTimer) clearTimeout(spinnerTimer);
        if (!silentUi) setLoadingMessages(false);
      }
    },
    []
  );

  // Supabase Realtime Broadcast: inbox sidebar (merge payloads to avoid list refetch) + thread messages
  useEffect(() => {
    const scheduleFullInboxFetch = () => {
      if (inboxFetchFallbackRef.current) clearTimeout(inboxFetchFallbackRef.current);
      inboxFetchFallbackRef.current = window.setTimeout(() => {
        inboxFetchFallbackRef.current = null;
        void loadConversationsRef.current();
      }, 1600);
    };

    return subscribeAdminInbox((payload) => {
      if (payload.clearedAll) {
        if (inboxFetchFallbackRef.current) clearTimeout(inboxFetchFallbackRef.current);
        chatAdminInboxCache = null;
        chatAdminMessagesCache.clear();
        setConversations([]);
        setMessages([]);
        setSelectedConversation(null);
        queueMicrotask(() =>
          window.dispatchEvent(new CustomEvent("admin-chat-unread-updated", { detail: { total: 0 } }))
        );
        return;
      }

      const removed = payload.removedConversationIds?.filter((x) => String(x || "").trim()) || [];
      if (removed.length > 0) {
        const remove = new Set(removed.map((x) => String(x).trim()));
        for (const id of remove) {
          chatAdminMessagesCache.delete(id);
        }
        const prev = conversationsRef.current;
        const sel = selectedConversationRef.current;
        const nextRaw = prev.filter((c) => {
          if (remove.has(c.id)) return false;
          if ((c.aliasConversationIds || []).some((a) => remove.has(String(a)))) return false;
          return true;
        });
        const merged = mergeConversationAvatarsByEmail(nextRaw);
        chatAdminInboxCache = merged;
        const stillHasSelection =
          sel == null ||
          merged.some(
            (c) => c.id === sel || (Array.isArray(c.aliasConversationIds) && c.aliasConversationIds.includes(sel))
          );
        setConversations(merged);
        if (!stillHasSelection) {
          setSelectedConversation(null);
          setMessages([]);
        }
        const totalUnread = merged.reduce((sum, c) => sum + (Number(c.unread) || 0), 0);
        queueMicrotask(() =>
          window.dispatchEvent(
            new CustomEvent("admin-chat-unread-updated", { detail: { total: totalUnread } })
          )
        );
        return;
      }

      const result = mergeInboxFromPayload(
        conversationsRef.current,
        payload,
        selectedConversationRef.current
      );
      if (result.kind === "fetch") {
        scheduleFullInboxFetch();
        return;
      }

      const next = mergeConversationAvatarsByEmail(result.next);
      chatAdminInboxCache = next;
      const totalUnread = next.reduce((sum, c) => sum + (Number(c.unread) || 0), 0);
      setConversations(next);
      queueMicrotask(() =>
        window.dispatchEvent(
          new CustomEvent("admin-chat-unread-updated", { detail: { total: totalUnread } })
        )
      );
    });
  }, []);

  useEffect(() => {
    if (!selectedConversation) return;
    const resolveCanonicalId = (sel: string | null) => {
      if (!sel) return null;
      const row = conversationsRef.current.find(
        (c) =>
          c.id === sel ||
          (Array.isArray(c.aliasConversationIds) && c.aliasConversationIds.includes(sel))
      );
      return row?.id ?? sel;
    };
    const channelId = resolveCanonicalId(selectedConversation);
    if (!channelId) return;
    return subscribeConversationBroadcast(channelId, (msg) => {
      const m = msg as unknown as Message;
      const sel = selectedConversationRef.current;
      const cacheKey = resolveCanonicalId(sel) ?? sel;
      setMessages((prev) => {
        const id = String(m.id ?? "");
        if (!id || prev.some((p) => p.id === id)) return prev;
        const next = [...prev, m];
        const sorted = next.sort(
          (a, b) =>
            new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
        );
        if (cacheKey) chatAdminMessagesCache.set(cacheKey, sorted);
        return sorted;
      });

      const preview =
        (typeof m.text === "string" && m.text.trim()) ||
        (m.imageUrl ? "Image" : "—");
      setConversations((prev) => {
        const next = prev.map((c) => {
          const match =
            sel != null &&
            (c.id === sel ||
              c.id === cacheKey ||
              (Array.isArray(c.aliasConversationIds) &&
                (c.aliasConversationIds.includes(sel) || c.aliasConversationIds.includes(String(cacheKey)))));
          if (!match) return c;
          return {
            ...c,
            lastMessage: preview,
            timestamp: m.timestamp,
          };
        });
        chatAdminInboxCache = mergeConversationAvatarsByEmail(next);
        return mergeConversationAvatarsByEmail(next);
      });
    });
  }, [selectedConversation]);

  // Auto-scroll: debounce bursts; use instant scroll for long threads (less layout thrash)
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

  // Load conversations (skip when opening from Customers → Message; handoff effect loads)
  useEffect(() => {
    if (initialCustomer?.email?.trim()) return;
    if (chatAdminInboxCache && chatAdminInboxCache.length > 0) {
      const sel = selectedConversationRef.current;
      let list = mergeConversationAvatarsByEmail([...chatAdminInboxCache]);
      list = preserveSelectedConversationInList(list, conversationsRef.current, sel);
      if (handoffPinnedConversationRef.current) {
        list = preserveSelectedConversationInList(
          list,
          [handoffPinnedConversationRef.current],
          sel
        );
      }
      chatAdminInboxCache = list;
      setConversations(list);
      setLoading(false);
      if (!handoffPinnedConversationRef.current) {
        void loadConversations("silent");
      }
    } else {
      void loadConversations("initial");
    }
  }, [initialCustomer]);

  // Load thread messages when the *selected* conversation changes — not when the inbox list
  // is patched (e.g. after broadcastInboxPing merge), or a silent refetch can overwrite the
  // optimistic admin reply with a slightly stale GET.
  const prevSelectedConversationRef = useRef<string | null>(null);
  useEffect(() => {
    if (!selectedConversation) {
      prevSelectedConversationRef.current = null;
      return;
    }
    const selectedRow = findConversationRow(
      conversations,
      selectedConversation,
      handoffPinnedConversationRef.current
    );
    if (!selectedRow) return;
    const canonicalConversationId = selectedRow.id;

    const selectionChanged = prevSelectedConversationRef.current !== selectedConversation;
    prevSelectedConversationRef.current = selectedConversation;

    const cached =
      getCachedThreadMessages(canonicalConversationId) ??
      getCachedThreadMessages(selectedConversation);
    if (cached !== undefined) {
      setMessages(cached);
      setLoadingMessages(false);
      if (selectionChanged) {
        void loadMessages(canonicalConversationId, true, true);
      }
      return;
    }
    void loadMessages(canonicalConversationId, false, "auto");
  }, [conversations, selectedConversation, loadMessages]);

  // Super admin: Customers → Message — open this thread and focus composer
  useEffect(() => {
    if (!initialCustomer?.email?.trim()) return;

    let cancelled = false;

    const open = async () => {
      setSearchQuery("");
      const email = initialCustomer.email.trim();
      const name = initialCustomer.name?.trim() || "Customer";
      const convId =
        canonicalChatThreadId(email) ?? mainStoreConversationIdFromEmail(email);

      try {
        let list: Conversation[] | null =
          chatAdminInboxCache && chatAdminInboxCache.length > 0
            ? [...chatAdminInboxCache]
            : null;

        if (!list) {
          const response = await chatApi.getConversations();
          if (cancelled) return;
          list = [...((response.conversations || []) as Conversation[])];
        }

        const raw = list;

        const match = raw.find(
          (c) =>
            c.id === convId ||
            (c.customerEmail &&
              c.customerEmail.toLowerCase() === email.toLowerCase())
        );

        let syntheticRow: Conversation | null = null;
        if (!match) {
          syntheticRow = {
            id: convId,
            customerName: name,
            customerEmail: email,
            customerProfileImage: initialCustomer.avatar || "",
            lastMessage: "—",
            timestamp: new Date().toISOString(),
            unread: 0,
            status: "offline" as const,
          };
          list = [...raw, syntheticRow];
        } else {
          list = raw;
        }

        const mergedHandoff = mergeConversationAvatarsByEmail(list as Conversation[]);
        chatAdminInboxCache = mergedHandoff;
        setConversations(mergedHandoff);
        setLoading(false);
        const idToUse = match?.id ?? convId;
        const pinnedRow =
          mergedHandoff.find((c) => conversationRowMatchesId(c, idToUse)) ??
          syntheticRow;
        if (pinnedRow) {
          handoffPinnedConversationRef.current = pinnedRow;
        }
        if (!match) {
          primeCachedThreadMessages(idToUse, []);
        }
        setSelectedConversation(idToUse);
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
  }, [initialCustomer, onInitialCustomerHandled]);

  // Rare HTTP reconcile: long-interval fallback + one debounced sync when tab becomes visible
  useEffect(() => {
    if (!docVisible) {
      stopPolling();
      return;
    }
    startPolling();
    return () => stopPolling();
  }, [selectedConversation, docVisible]);

  useEffect(() => {
    if (typeof document === "undefined") return;
    let visTimer: ReturnType<typeof setTimeout> | null = null;
    const onVis = () => {
      if (document.visibilityState !== "visible") return;
      if (visTimer) clearTimeout(visTimer);
      visTimer = window.setTimeout(() => {
        visTimer = null;
        void loadConversationsRef.current();
        const sid = selectedConversationRef.current;
        if (sid) void loadMessages(sid, true, true);
      }, 900);
    };
    document.addEventListener("visibilitychange", onVis);
    return () => {
      document.removeEventListener("visibilitychange", onVis);
      if (visTimer) clearTimeout(visTimer);
    };
  }, [loadMessages]);

  const startPolling = () => {
    stopPolling(); // Clear any existing interval
    pollingIntervalRef.current = window.setInterval(() => {
      if (typeof document !== "undefined" && document.visibilityState !== "visible") return;
      void loadConversations("silent");
      if (selectedConversation) {
        loadMessages(selectedConversation, true, "auto"); // messages only; unread handled on open / send
      }
    }, POLLING_INTERVALS_MS.CHAT_HTTP_FALLBACK); // fallback if Realtime is off
  };

  const stopPolling = () => {
    if (pollingIntervalRef.current) {
      clearInterval(pollingIntervalRef.current);
      pollingIntervalRef.current = null;
    }
  };

  // 🔥 CLEAR ALL CHAT HISTORY (per-conversation deletes — same as manual delete; no bulk admin secret required)
  const clearAllHistory = async () => {
    if (!confirm("⚠️ Are you sure you want to delete ALL chat conversations and messages? This action cannot be undone!")) {
      return;
    }

    try {
      const response = await chatApi.getConversations();
      const raw = (response.conversations || []) as Conversation[];
      const ids = new Set<string>();
      for (const c of raw) {
        const id = String(c?.id || "").trim();
        if (id) ids.add(id);
        for (const a of c.aliasConversationIds || []) {
          const aid = String(a || "").trim();
          if (aid) ids.add(aid);
        }
      }

      if (ids.size === 0) {
        chatAdminInboxCache = null;
        chatAdminMessagesCache.clear();
        setConversations([]);
        setMessages([]);
        setSelectedConversation(null);
        void broadcastInboxPing({ clearedAll: true, t: Date.now() });
        toast.success("Chat inbox is already empty");
        queueMicrotask(() =>
          window.dispatchEvent(new CustomEvent("admin-chat-unread-updated", { detail: { total: 0 } }))
        );
        return;
      }

      const idList = [...ids];
      const results = await Promise.allSettled(idList.map((id) => chatApi.deleteConversation(id)));
      const failed = results.filter((r) => r.status === "rejected").length;

      chatAdminInboxCache = null;
      chatAdminMessagesCache.clear();
      for (const id of idList) chatAdminMessagesCache.delete(id);
      setConversations([]);
      setMessages([]);
      setSelectedConversation(null);

      void broadcastInboxPing({ clearedAll: true, t: Date.now() });
      queueMicrotask(() =>
        window.dispatchEvent(new CustomEvent("admin-chat-unread-updated", { detail: { total: 0 } }))
      );

      if (failed > 0) {
        toast.warning("Chat history mostly cleared", {
          description: `${idList.length - failed} of ${idList.length} threads deleted. Refresh and try again for any that failed.`,
        });
        void loadConversations("silent");
      } else {
        toast.success("Chat History Cleared!", {
          description: `${idList.length} conversation thread(s) removed.`,
        });
      }
    } catch (error: any) {
      console.error("❌ Error clearing chat history:", error);
      toast.error("Failed to clear chat history", {
        description: error.message || "An unexpected error occurred",
      });
    }
  };

  const handleSelectConversation = (conversationId: string) => {
    chatAdminSelectedConversationCache = conversationId;
    setSelectedConversation(conversationId);
    const cached = getCachedThreadMessages(conversationId);
    if (cached !== undefined) {
      setMessages(cached);
      setLoadingMessages(false);
      void loadMessages(conversationId, true, true);
      return;
    }
    void loadMessages(conversationId, false, true);
  };

  const handleSendMessage = async () => {
    if (!messageInput.trim() || !selectedConversation) return;

    const selectedConv = findConversationRow(
      conversations,
      selectedConversation,
      handoffPinnedConversationRef.current
    );
    if (!selectedConv) return;

    const canonicalConversationId = selectedConv.id;

    setSending(true);
    try {
      const response = await chatApi.sendMessage({
        conversationId: canonicalConversationId,
        text: messageInput,
        sender: "admin",
        senderName: "Admin",
        customerEmail: selectedConv.customerEmail,
        customerName: selectedConv.customerName,
        customerProfileImage: selectedConv.customerProfileImage || undefined,
        imageUrl: selectedImage || undefined,
        vendorId: selectedConv.vendorId || undefined,
        vendorSource: selectedConv.vendorSource,
      });

      if (response.success && response.message) {
        // Add message to local state immediately
        setMessages((prev) => {
          const next = [...prev, response.message];
          chatAdminMessagesCache.set(canonicalConversationId, next);
          return next;
        });
        setMessageInput("");
        setSelectedImage(null);
        toast.success("Message sent!");

        // Keep customer name/avatar in sidebar + header (server used to overwrite with "Admin")
        const ts = new Date().toISOString();
        const matchesSelectedRow = (c: Conversation) =>
          c.id === canonicalConversationId ||
          c.id === selectedConversation ||
          (Array.isArray(c.aliasConversationIds) &&
            (c.aliasConversationIds.includes(selectedConversation) ||
              c.aliasConversationIds.includes(canonicalConversationId)));

        const patchCustomer = (list: Conversation[]) =>
          list.map((c) =>
            matchesSelectedRow(c)
              ? {
                  ...c,
                  customerName: selectedConv.customerName,
                  customerEmail: selectedConv.customerEmail,
                  customerProfileImage: selectedConv.customerProfileImage || "",
                  lastMessage: messageInput.trim(),
                  timestamp: ts,
                  unread: 0,
                }
              : c
          );

        setConversations((prev) => {
          const next = mergeConversationAvatarsByEmail(patchCustomer(prev));
          chatAdminInboxCache = next;
          const totalUnread = next.reduce((sum, c) => sum + (Number(c.unread) || 0), 0);
          queueMicrotask(() =>
            window.dispatchEvent(
              new CustomEvent("admin-chat-unread-updated", { detail: { total: totalUnread } })
            )
          );
          return next;
        });

        void chatApi.markAsRead(canonicalConversationId).catch(() => undefined);

        void broadcastConversationMessage(canonicalConversationId, response.message);
        if (selectedConv.customerEmail?.trim()) {
          void broadcastCustomerChatMessage(
            selectedConv.customerEmail.trim(),
            response.message
          );
        }
        const pingConversationId =
          String((response.message as { conversationId?: unknown }).conversationId || "").trim() ||
          canonicalConversationId;
        void broadcastInboxPing({
          t: Date.now(),
          conversationId: pingConversationId,
          lastMessage: String(response.message.text || messageInput.trim() || "—"),
          timestamp: response.message.timestamp,
          customerEmail: selectedConv.customerEmail,
          customerName: selectedConv.customerName,
          customerProfileImage: selectedConv.customerProfileImage,
          vendorId: selectedConv.vendorId,
          vendorSource: selectedConv.vendorSource,
          unreadBump: false,
        });
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
    if (sortOrder === "starred") {
      const sa = a.starred ? 1 : 0;
      const sb = b.starred ? 1 : 0;
      if (sa !== sb) return sb - sa;
      const ta = new Date(a.timestamp).getTime();
      const tb = new Date(b.timestamp).getTime();
      return tb - ta;
    }
    const timeA = new Date(a.timestamp).getTime();
    const timeB = new Date(b.timestamp).getTime();
    
    return sortOrder === "new-old" ? timeB - timeA : timeA - timeB;
  });

  const selectedConv = findConversationRow(
    conversations,
    selectedConversation,
    handoffPinnedConversationRef.current
  );
  const selectedVendorHeaderBadge = selectedConv
    ? resolveChatVendorLabel(selectedConv.vendorSource, selectedConv.vendorId, vendorLookup)
    : null;
  const totalUnread = conversations.reduce((sum, conv) => sum + conv.unread, 0);

  /** Sidebar row matches current thread (primary id or merged alias ids). */
  const conversationRowIsSelected = (conv: Conversation) =>
    conversationRowMatchesId(conv, selectedConversation);

  useEffect(() => {
    chatAdminSelectedConversationCache = selectedConversation;
  }, [selectedConversation]);

  const handleEmojiClick = (emoji: EmojiClickData) => {
    setMessageInput((prev) => prev + emoji.emoji);
    setShowEmojiPicker(false);
  };

  const applyConversationPatch = (ids: string[], patch: Partial<Conversation>) => {
    const idSet = new Set(ids.filter(Boolean));
    setConversations((prev) => {
      const next = prev.map((c) => (idSet.has(c.id) ? { ...c, ...patch } : c));
      chatAdminInboxCache = next;
      return next;
    });
  };

  const handleToggleStarConversation = async () => {
    if (!selectedConv) return;
    const aliasIds = selectedConv.aliasConversationIds?.filter(Boolean) || [];
    const allIds = Array.from(new Set([selectedConv.id, ...aliasIds]));
    const nextStarred = !selectedConv.starred;
    applyConversationPatch(allIds, { starred: nextStarred });
    try {
      await Promise.all(allIds.map((id) => chatApi.setStarred(id, nextStarred)));
      toast.success(nextStarred ? "Conversation starred" : "Conversation unstarred");
    } catch {
      applyConversationPatch(allIds, { starred: !nextStarred });
      toast.error("Failed to update star status");
    }
  };

  const handleDeleteConversation = async () => {
    if (!selectedConv) return;
    if (!confirm(t("chat.deleteConfirm"))) return;
    const aliasIds = selectedConv.aliasConversationIds?.filter(Boolean) || [];
    const allIds = Array.from(new Set([selectedConv.id, ...aliasIds]));
    const backupConversations = [...conversations];
    const backupMessages = [...messages];
    const backupSelected = selectedConversation;
    setConversations((prev) => {
      const remove = new Set(allIds);
      const next = prev.filter((c) => !remove.has(c.id));
      chatAdminInboxCache = next;
      return next;
    });
    for (const id of allIds) chatAdminMessagesCache.delete(id);
    setMessages([]);
    setSelectedConversation(null);
    try {
      await Promise.all(allIds.map((id) => chatApi.deleteConversation(id)));
      toast.success("Conversation deleted");
      void broadcastInboxPing({ removedConversationIds: [...allIds], t: Date.now() });
    } catch {
      setConversations(backupConversations);
      chatAdminInboxCache = backupConversations;
      setMessages(backupMessages);
      setSelectedConversation(backupSelected);
      toast.error("Failed to delete conversation");
    }
  };

  return (
    <div className="h-[calc(100dvh-4rem)] min-h-0 flex flex-col bg-white overflow-hidden">
      {/* Header */}
      <div className="px-6 py-4 border-b border-slate-200 flex-shrink-0">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold text-slate-900">{t("chat.title")}</h1>
            <p className="text-sm text-slate-500 mt-0.5">
              {t("chat.subtitle")}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {totalUnread > 0 && (
              <Badge className="bg-gradient-to-r from-blue-600 to-purple-600 text-white border-0">
                {totalUnread} {t("chat.unread")}
              </Badge>
            )}
          </div>
        </div>
      </div>

      {/* Chat Container */}
      <div className="flex-1 min-h-0 flex overflow-hidden">
        {/* Conversations List */}
        <div className="w-80 h-full min-h-0 border-r border-slate-200 flex flex-col bg-slate-50">
          {/* Search */}
          <div className="p-4 border-b border-slate-200 bg-white space-y-2">
            <AdminClearableSearchInput
              placeholder={t("chat.searchPlaceholder")}
              value={searchQuery}
              onValueChange={setSearchQuery}
              className="bg-slate-50"
            />
            <div className="flex items-center justify-between">
              <span className="text-xs text-slate-500">
                {sortedConversations.length} {sortedConversations.length === 1 ? t("chat.conversationOne") : t("chat.conversationMany")}
              </span>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="sm" className="gap-2 h-7 text-xs">
                    {sortOrder === "new-old" ? (
                      <>
                        <ArrowDown className="w-3 h-3" />
                        {t("chat.newestFirst")}
                      </>
                    ) : sortOrder === "old-new" ? (
                      <>
                        <ArrowUp className="w-3 h-3" />
                        {t("chat.oldestFirst")}
                      </>
                    ) : (
                      <>
                        <Star className="w-3 h-3" />
                        {t("chat.starred")}
                      </>
                    )}
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onClick={() => setSortOrder("new-old")}>
                    <ArrowDown className="w-4 h-4 mr-2" />
                    {t("chat.newestFirst")}
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => setSortOrder("old-new")}>
                    <ArrowUp className="w-4 h-4 mr-2" />
                    {t("chat.oldestFirst")}
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => setSortOrder("starred")}>
                    <Star className="w-4 h-4 mr-2" />
                    {t("chat.starred")}
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>

          {/* Conversation List */}
          <div className="flex-1 min-h-0 overflow-y-auto">
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
                  {searchQuery ? t("chat.noConversationsFound") : t("chat.noConversationsYet")}
                </p>
                <p className="text-xs text-slate-400 mt-1">
                  {t("chat.emptyHint")}
                </p>
              </div>
            ) : (
              sortedConversations.map((conv) => {
                // Use customer profile image if available, otherwise use Dicebear avatar
                const avatar =
                  conv.customerProfileImage ||
                  `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(conv.customerName)}&backgroundColor=3b82f6`;
                const vendorBadgeLabel = resolveChatVendorLabel(
                  conv.vendorSource,
                  conv.vendorId,
                  vendorLookup
                );

                return (
                  <button
                    key={conv.id}
                    onClick={() => handleSelectConversation(conv.id)}
                    className={`w-full p-4 flex items-start gap-3 hover:bg-white transition-colors border-b border-slate-100 ${
                      conversationRowIsSelected(conv)
                        ? "bg-white shadow-sm ring-1 ring-inset ring-blue-200/80"
                        : ""
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
                        <div className="flex items-center gap-1.5 min-w-0">
                          <h3 className="text-sm font-semibold text-slate-900 truncate">
                            {conv.customerName}
                          </h3>
                          {conv.starred && (
                            <Star className="w-3.5 h-3.5 text-amber-500 fill-amber-400 flex-shrink-0" />
                          )}
                        </div>
                        <span className="text-xs text-slate-500 flex-shrink-0 ml-2">
                          {formatTime(conv.timestamp)}
                        </span>
                      </div>
                      <p className="text-sm text-slate-600 truncate">
                        {conv.lastMessage}
                      </p>
                      {vendorBadgeLabel && (
                        <Badge variant="outline" className="text-xs mt-1 bg-gradient-to-r from-blue-50 to-purple-50 border-blue-200 text-blue-700">
                          🏪 {t("chat.from")} {vendorBadgeLabel}
                        </Badge>
                      )}
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
          <div className="flex-1 min-h-0 flex flex-col">
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
                    {selectedVendorHeaderBadge && (
                      <Badge variant="outline" className="text-xs bg-gradient-to-r from-blue-50 to-purple-50 border-blue-200 text-blue-700">
                        🏪 {selectedVendorHeaderBadge}
                      </Badge>
                    )}
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  variant="ghost"
                  size="icon"
                  title={selectedConv?.starred ? t("chat.unstarConversation") : t("chat.starConversation")}
                  onClick={handleToggleStarConversation}
                >
                  <Star className={`w-5 h-5 ${selectedConv?.starred ? "fill-amber-400 text-amber-500" : ""}`} />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  title={t("chat.deleteConversation")}
                  onClick={handleDeleteConversation}
                  className="text-red-600 hover:text-red-700 hover:bg-red-50"
                >
                  <Trash2 className="w-5 h-5" />
                </Button>
              </div>
            </div>

            {/* Messages: min-h-full + justify-end keeps short threads above the composer */}
            <div className="flex-1 min-h-0 min-w-0 overflow-y-auto bg-slate-50">
              {loadingMessages ? (
                <div className="min-h-full flex flex-col items-center justify-center gap-3 p-6">
                  <Loader2 className="w-10 h-10 text-slate-400 animate-spin" />
                  <p className="text-sm text-slate-500">{t("chat.loadingMessages")}</p>
                </div>
              ) : messages.length === 0 ? (
                <div className="min-h-full flex flex-col items-center justify-center text-center p-6">
                  <MessageSquare className="w-12 h-12 text-slate-300 mb-3" />
                  <p className="text-sm text-slate-500">{t("chat.noMessagesYet")}</p>
                  <p className="text-xs text-slate-400 mt-1">
                    {t("chat.startConversation")}
                  </p>
                </div>
              ) : (
                <div className="min-h-full flex flex-col justify-end gap-4 p-6">
                  {messages.map((message) => (
                    <div
                      key={message.id}
                      className={`flex min-w-0 w-full ${
                        message.sender === "admin" ? "justify-end" : "justify-start"
                      }`}
                    >
                      <div
                        className={`max-w-[min(28rem,calc(100%-0.5rem))] shrink ${
                          message.sender === "admin" ? "order-2" : "order-1"
                        }`}
                      >
                        <div
                          className={`rounded-2xl px-4 py-2.5 shadow-sm break-words ${
                            message.sender === "admin"
                              ? "bg-gradient-to-r from-blue-600 to-purple-600 text-white"
                              : "bg-white text-slate-900 border border-slate-200"
                          }`}
                        >
                          {message.imageUrl && (
                            <img
                              src={message.imageUrl}
                              alt={t("chat.attachedImage")}
                              className="max-w-full rounded-lg mb-2"
                              style={{ maxHeight: '300px' }}
                            />
                          )}
                          <p className="text-sm leading-relaxed break-words">{message.text}</p>
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
                  <div ref={messagesEndRef} className="h-px shrink-0" aria-hidden />
                </div>
              )}
            </div>

            {/* Message Input */}
            <div className="sticky bottom-0 z-10 shrink-0 px-6 py-4 border-t border-slate-200 bg-white">
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
                    alt={t("chat.preview")} 
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
                  <span className="text-sm text-amber-600">{t("chat.uploadingImage")}</span>
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
                    placeholder={t("chat.typeMessage")}
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
                  {t("chat.send")}
                </Button>
              </div>
            </div>
          </div>
        ) : (
          <div className="flex-1 flex items-center justify-center bg-slate-50">
            <div className="text-center">
              <MessageSquare className="w-16 h-16 text-slate-300 mx-auto mb-4" />
              <h3 className="text-lg font-semibold text-slate-900 mb-2">
                {t("chat.noConversationSelected")}
              </h3>
              <p className="text-sm text-slate-500">
                {t("chat.chooseConversation")}
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}