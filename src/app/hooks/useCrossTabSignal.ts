import { useEffect } from "react";

type UseCrossTabSignalOptions = {
  eventName: string;
  storageKey?: string;
  onSignal: () => void;
  coalesceMs?: number;
  enabled?: boolean;
};

/**
 * Subscribes to same-tab custom events, cross-tab storage updates, and BroadcastChannel messages.
 * Coalesces bursts so a single mutation does not trigger repeated refetches.
 */
export function useCrossTabSignal({
  eventName,
  storageKey,
  onSignal,
  coalesceMs = 800,
  enabled = true,
}: UseCrossTabSignalOptions) {
  useEffect(() => {
    if (!enabled || typeof window === "undefined") return;

    let bc: BroadcastChannel | null = null;
    let lastAt = 0;

    const trigger = () => {
      const now = Date.now();
      if (now - lastAt < coalesceMs) return;
      lastAt = now;
      onSignal();
    };

    const onWindowEvent = () => trigger();
    const onStorage = (ev: StorageEvent) => {
      if (!storageKey || ev.key !== storageKey) return;
      trigger();
    };

    window.addEventListener(eventName, onWindowEvent);
    if (storageKey) {
      window.addEventListener("storage", onStorage);
    }

    try {
      bc = new BroadcastChannel(eventName);
      bc.onmessage = () => trigger();
    } catch {
      bc = null;
    }

    return () => {
      window.removeEventListener(eventName, onWindowEvent);
      if (storageKey) {
        window.removeEventListener("storage", onStorage);
      }
      if (bc) bc.close();
    };
  }, [eventName, storageKey, onSignal, coalesceMs, enabled]);
}
