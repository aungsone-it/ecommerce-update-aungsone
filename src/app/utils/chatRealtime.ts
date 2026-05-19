/**
 * Supabase Realtime **Broadcast** for chat (messages persist in Edge/KV; broadcast carries live deltas).
 * Wired in `FloatingChat` (marketplace + vendor storefronts) and super-admin `Chat`.
 * Enable Realtime in the Supabase Dashboard. If Realtime is off, subscribe/send no-ops gracefully;
 * HTTP polling in those components remains as a slow fallback.
 */
import { supabase } from "../contexts/AuthContext";
import { normalizeChatEmailClient, sanitizeChatTokenClient } from "../../utils/chatConversation";

const INBOX_CHANNEL = "sec-chat-admin-inbox-v1";

/** Cross-vendor / cross-tab delivery: every signed-in storefront for this email listens here. */
export function customerChatChannelName(email: string): string {
  const token = sanitizeChatTokenClient(normalizeChatEmailClient(email));
  return token ? `sec-chat-customer-${token.slice(0, 80)}` : "";
}

/** Payload for admin inbox sidebar updates (avoids refetching full conversation list on every ping). */
export type InboxBroadcastPayload = {
  t?: number;
  conversationId?: string;
  lastMessage?: string;
  timestamp?: string;
  customerEmail?: string;
  customerName?: string;
  customerProfileImage?: string;
  vendorId?: string;
  vendorSource?: string;
  /** Customer → admin: increment sidebar unread (caller should skip when admin is already on that thread). */
  unreadBump?: boolean;
  /** All conversations were wiped — other admin tabs should clear local inbox. */
  clearedAll?: boolean;
  /** One or more threads were deleted — other admin tabs remove rows without refetch. */
  removedConversationIds?: string[];
};

function safeSegment(id: string): string {
  return id.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 120);
}

export function conversationChannelName(conversationId: string): string {
  return `sec-chat-c-${safeSegment(conversationId)}`;
}

async function waitSubscribed(ch: ReturnType<typeof supabase.channel>, ms = 8000): Promise<boolean> {
  return new Promise((resolve) => {
    const t = setTimeout(() => resolve(false), ms);
    ch.subscribe((status) => {
      if (status === "SUBSCRIBED") {
        clearTimeout(t);
        resolve(true);
      }
      if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") {
        clearTimeout(t);
        resolve(false);
      }
    });
  });
}

function extractBroadcastPayload<T>(ctx: unknown): T | undefined {
  if (!ctx || typeof ctx !== "object") return undefined;
  const o = ctx as Record<string, unknown>;
  if (o.payload && typeof o.payload === "object" && !Array.isArray(o.payload)) {
    return o.payload as T;
  }
  return undefined;
}

/** Notify all admin Chat tabs: optional row metadata so listeners can merge without GET /chat/conversations. */
export async function broadcastInboxPing(payload: InboxBroadcastPayload = {}): Promise<void> {
  if (typeof window === "undefined") return;
  const ch = supabase.channel(INBOX_CHANNEL, {
    config: { broadcast: { ack: false } },
  });
  const ok = await waitSubscribed(ch);
  if (!ok) {
    try {
      await supabase.removeChannel(ch);
    } catch {
      /* ignore */
    }
    return;
  }
  try {
    await ch.send({
      type: "broadcast",
      event: "inbox",
      payload: { t: Date.now(), ...payload },
    });
  } finally {
    try {
      await supabase.removeChannel(ch);
    } catch {
      /* ignore */
    }
  }
}

/** Push a single message to everyone subscribed to this conversation (customer + admin thread). */
async function sendConversationBroadcastToChannel(
  channelConversationId: string,
  message: unknown
): Promise<void> {
  if (typeof window === "undefined" || !channelConversationId.trim() || message == null) return;
  const ch = supabase.channel(conversationChannelName(channelConversationId.trim()), {
    config: { broadcast: { ack: false } },
  });
  const ok = await waitSubscribed(ch);
  if (!ok) {
    try {
      await supabase.removeChannel(ch);
    } catch {
      /* ignore */
    }
    return;
  }
  try {
    await ch.send({
      type: "broadcast",
      event: "message",
      payload: { message },
    });
  } finally {
    try {
      await supabase.removeChannel(ch);
    } catch {
      /* ignore */
    }
  }
}

/**
 * Push a single message to conversation Realtime channel(s).
 * Server persistence uses `canonicalConversationId` on the message, while clients may still be
 * subscribed under a legacy/slug-based id (e.g. vendor storefront `go-go` vs internal vendor id).
 * When those differ, broadcast to **both** so floating chat and admin stay in sync without refresh.
 */
export async function broadcastConversationMessage(
  conversationId: string,
  message: unknown
): Promise<void> {
  if (typeof window === "undefined" || message == null) return;
  const canonical =
    typeof message === "object" &&
    message !== null &&
    "conversationId" in message &&
    String((message as { conversationId?: unknown }).conversationId || "").trim() !== ""
      ? String((message as { conversationId: string }).conversationId).trim()
      : String(conversationId || "").trim();
  const fromCaller = String(conversationId || "").trim();
  const targets = new Set<string>();
  if (canonical) targets.add(canonical);
  if (fromCaller && fromCaller !== canonical) targets.add(fromCaller);

  for (const id of targets) {
    await sendConversationBroadcastToChannel(id, message);
  }
}

/** Admin panel: inbox sidebar + cross-tab sync (merge from payload when possible). */
export function subscribeAdminInbox(onInbox: (payload: InboxBroadcastPayload) => void): () => void {
  const ch = supabase
    .channel(INBOX_CHANNEL, { config: { broadcast: { ack: false } } })
    .on("broadcast", { event: "inbox" }, (ctx: unknown) => {
      const payload = extractBroadcastPayload<InboxBroadcastPayload>(ctx) ?? { t: Date.now() };
      onInbox(payload);
    });
  ch.subscribe();
  return () => {
    try {
      void supabase.removeChannel(ch);
    } catch {
      /* ignore */
    }
  };
}

/**
 * Subscribe to new messages for one conversation (customer widget or admin thread).
 * `self: false` avoids echoing your own ephemeral broadcast back into state.
 */
/** Admin → customer fan-out (vendor storefront A/B, marketplace, multiple tabs). */
export async function broadcastCustomerChatMessage(
  customerEmail: string,
  message: unknown
): Promise<void> {
  const channelName = customerChatChannelName(customerEmail);
  if (typeof window === "undefined" || !channelName || message == null) return;
  const ch = supabase.channel(channelName, {
    config: { broadcast: { ack: false } },
  });
  const ok = await waitSubscribed(ch);
  if (!ok) {
    try {
      await supabase.removeChannel(ch);
    } catch {
      /* ignore */
    }
    return;
  }
  try {
    await ch.send({
      type: "broadcast",
      event: "admin-message",
      payload: { message },
    });
  } finally {
    try {
      await supabase.removeChannel(ch);
    } catch {
      /* ignore */
    }
  }
}

/** Customer floating chat: receive admin replies on any vendor store / tab for this account. */
export function subscribeCustomerChatBroadcast(
  customerEmail: string,
  onMessage: (message: Record<string, unknown>) => void
): () => void {
  const channelName = customerChatChannelName(customerEmail);
  if (!channelName) return () => undefined;
  const ch = supabase
    .channel(channelName, { config: { broadcast: { ack: false } } })
    .on("broadcast", { event: "admin-message" }, (ctx: unknown) => {
      const raw = extractBroadcastPayload<{ message?: unknown }>(ctx)?.message;
      const fallback =
        ctx && typeof ctx === "object" && "message" in ctx
          ? (ctx as { message?: unknown }).message
          : undefined;
      const msg = raw ?? fallback;
      if (msg && typeof msg === "object" && !Array.isArray(msg)) {
        onMessage(msg as Record<string, unknown>);
      }
    });
  ch.subscribe();
  return () => {
    try {
      void supabase.removeChannel(ch);
    } catch {
      /* ignore */
    }
  };
}

export function subscribeConversationBroadcast(
  conversationId: string,
  onMessage: (message: Record<string, unknown>) => void
): () => void {
  const ch = supabase
    .channel(conversationChannelName(conversationId), {
      config: { broadcast: { ack: false } },
    })
    .on("broadcast", { event: "message" }, (ctx: unknown) => {
      const raw = extractBroadcastPayload<{ message?: unknown }>(ctx)?.message;
      const fallback =
        ctx && typeof ctx === "object" && "message" in ctx ? (ctx as { message?: unknown }).message : undefined;
      const msg = raw ?? fallback;
      if (msg && typeof msg === "object" && !Array.isArray(msg)) {
        onMessage(msg as Record<string, unknown>);
      }
    });
  ch.subscribe();
  return () => {
    try {
      void supabase.removeChannel(ch);
    } catch {
      /* ignore */
    }
  };
}
