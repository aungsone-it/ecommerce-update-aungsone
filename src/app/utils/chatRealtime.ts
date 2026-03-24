/**
 * Supabase Realtime **Broadcast** for chat (messages live in Edge KV, not Postgres).
 * Enable Realtime in the Supabase Dashboard (Project Settings → API → Realtime, or Realtime section).
 * If Realtime is off, subscribe/send no-ops gracefully; HTTP polling remains as fallback.
 */
import { supabase } from "../contexts/AuthContext";

const INBOX_CHANNEL = "sec-chat-admin-inbox-v1";

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

/** Notify all admin Chat tabs to refresh the conversation list (after any new message). */
export async function broadcastInboxPing(): Promise<void> {
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
      payload: { t: Date.now() },
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
export async function broadcastConversationMessage(
  conversationId: string,
  message: unknown
): Promise<void> {
  if (typeof window === "undefined" || message == null) return;
  const ch = supabase.channel(conversationChannelName(conversationId), {
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

/** Admin panel: refresh inbox when any client pings (debounce in caller). */
export function subscribeAdminInbox(onInboxPing: () => void): () => void {
  const ch = supabase
    .channel(INBOX_CHANNEL, { config: { broadcast: { ack: false } } })
    .on("broadcast", { event: "inbox" }, () => {
      onInboxPing();
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
export function subscribeConversationBroadcast(
  conversationId: string,
  onMessage: (message: Record<string, unknown>) => void
): () => void {
  const ch = supabase
    .channel(conversationChannelName(conversationId), {
      config: { broadcast: { ack: false } },
    })
    .on("broadcast", { event: "message" }, (ctx: { payload?: { message?: unknown } } | Record<string, unknown>) => {
      const any = ctx as Record<string, unknown>;
      const raw = any?.payload && typeof any.payload === "object" && any.payload !== null
        ? (any.payload as { message?: unknown }).message
        : any.message;
      if (raw && typeof raw === "object" && !Array.isArray(raw)) {
        onMessage(raw as Record<string, unknown>);
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
