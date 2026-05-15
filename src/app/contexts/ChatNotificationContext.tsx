import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";

export type ChatNotificationContextValue = {
  /** Unread admin messages in the floating chat (driven by `FloatingChat`). */
  chatUnreadCount: number;
  setChatUnreadCount: (count: number) => void;
  /** Opens the floating chat panel (e.g. from header bell → notification tap). */
  openFloatingChat: () => void;
  forceOpenFloatingChat: boolean;
  /** Called when the chat panel finishes opening so `forceOpen` can reset. */
  resetForceOpenFloatingChat: () => void;
};

const ChatNotificationContext = createContext<ChatNotificationContextValue | null>(null);

export function ChatNotificationProvider({ children }: { children: ReactNode }) {
  const [chatUnreadCount, setChatUnreadCount] = useState(0);
  const [forceOpenFloatingChat, setForceOpenFloatingChat] = useState(false);

  const openFloatingChat = useCallback(() => {
    setForceOpenFloatingChat(true);
  }, []);

  const resetForceOpenFloatingChat = useCallback(() => {
    setForceOpenFloatingChat(false);
  }, []);

  const value = useMemo(
    () => ({
      chatUnreadCount,
      setChatUnreadCount,
      openFloatingChat,
      forceOpenFloatingChat,
      resetForceOpenFloatingChat,
    }),
    [chatUnreadCount, forceOpenFloatingChat, openFloatingChat, resetForceOpenFloatingChat]
  );

  return (
    <ChatNotificationContext.Provider value={value}>{children}</ChatNotificationContext.Provider>
  );
}

export function useChatNotification(): ChatNotificationContextValue {
  const ctx = useContext(ChatNotificationContext);
  if (!ctx) {
    throw new Error("useChatNotification must be used within ChatNotificationProvider");
  }
  return ctx;
}
