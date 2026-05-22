// ============================================
// CUSTOM HOOK FOR BADGE COUNTS
// ============================================

import { useState, useCallback, useEffect } from 'react';
import { chatApi, vendorApplicationsApi } from '../../utils/api';
import {
  getCachedAdminOrdersPayload,
  moduleCache,
  CACHE_KEYS,
  ADMIN_VENDOR_APPLICATIONS_UPDATED_EVENT,
  ADMIN_VENDOR_APPLICATIONS_UPDATED_STORAGE_KEY,
} from '../utils/module-cache';
import { PENDING_ORDER_STATUSES, POLLING_INTERVALS_MS } from '../../constants';
import { SmartCache } from '../../utils/cache';
import { badgeCircuitBreaker } from '../../utils/circuit-breaker';
import type { BadgeCounts } from '../../types';

const INITIAL_BADGE_COUNTS: BadgeCounts = {
  orders: 0,
  vendor: 0,
  collaborator: 0,
  chat: 0,
};

/**
 * Hook for managing badge counts across the app
 * Features:
 * - ⚡ Zero loading time with smart caching
 * - 🔄 Auto-refresh on a long interval (see POLLING_INTERVALS_MS.BADGE_COUNTS)
 * - 📊 Dynamic pending orders count
 */
export function useBadgeCounts() {
  const [badgeCounts, setBadgeCounts] = useState<BadgeCounts>(() => {
    // 🚀 Load from cache immediately for zero loading time!
    const cached = SmartCache.get<BadgeCounts>('badge_counts');
    if (cached) {
      console.log('⚡ Loaded badge counts from cache instantly!', cached);
      return cached;
    }
    return INITIAL_BADGE_COUNTS;
  });
  const [loading, setLoading] = useState(false);

  /**
   * Refresh only chat unread total (fast path, no 30s cache gate).
   * Polls conversations and sums `unread` so badges update soon after customer messages.
   */
  const refreshChatBadgeOnly = useCallback(async () => {
    try {
      const chatResponse = await chatApi.getConversations();
      const unreadChats =
        chatResponse.conversations?.reduce(
          (sum: number, conv: { unread?: number }) => sum + (Number(conv.unread) || 0),
          0
        ) ?? 0;
      setBadgeCounts((prev) => {
        const updated = { ...prev, chat: unreadChats };
        SmartCache.set('badge_counts', updated);
        return updated;
      });
      badgeCircuitBreaker.recordSuccess();
    } catch {
      // Chat endpoint may be unavailable — keep previous count
    }
  }, []);

  /**
   * Refresh only pending vendor-application count (fast path — no orders/chat round-trip).
   */
  const refreshVendorApplicationsBadgeOnly = useCallback(async () => {
    if (!badgeCircuitBreaker.canAttempt()) return;
    try {
      const vendorResponse = await vendorApplicationsApi.getAll();
      if (!vendorResponse.success || !vendorResponse.data) return;
      const apps = vendorResponse.data as Record<string, unknown>[];
      moduleCache.prime(CACHE_KEYS.ADMIN_VENDOR_APPLICATIONS, apps);
      const vendorApplicationsCount = apps.filter(
        (app) => String(app?.status ?? "").toLowerCase() === "pending"
      ).length;
      setBadgeCounts((prev) => {
        if (prev.vendor === vendorApplicationsCount) return prev;
        const updated = { ...prev, vendor: vendorApplicationsCount };
        SmartCache.set("badge_counts", updated);
        return updated;
      });
      badgeCircuitBreaker.recordSuccess();
    } catch {
      /* keep previous count */
    }
  }, []);

  /**
   * Load badge counts from the server
   */
  const loadBadgeCounts = useCallback(async (force = false) => {
    // Check circuit breaker
    if (!badgeCircuitBreaker.canAttempt()) {
      console.warn('⛔ Badge API circuit is open - skipping request');
      return;
    }

    // Avoid duplicate fetches while SmartCache says recent — unless caller forces (mount, orders invalidated, etc.)
    if (
      !force &&
      SmartCache.isFresh('badge_counts', POLLING_INTERVALS_MS.BADGE_COUNTS_CACHE_FRESH)
    ) {
      console.log('✅ Badge counts cache is fresh, no need to fetch');
      badgeCircuitBreaker.recordSuccess();
      return;
    }

    console.log('🔄 Fetching fresh badge counts from server...');
    setLoading(true);
    try {
      // Pending orders — reuse module cache (same key as Super Admin Orders) to avoid duplicate /orders edge calls
      let ordersPayload: { orders: any[]; warning?: string };
      try {
        ordersPayload = await getCachedAdminOrdersPayload(force);
      } catch (ordersError) {
        console.warn('⚠️ Orders fetch failed, retrying once...', ordersError);
        await new Promise((resolve) => setTimeout(resolve, 1000));
        ordersPayload = await getCachedAdminOrdersPayload(true);
      }

      const ordersList = ordersPayload.orders ?? [];
      const pendingStatuses: readonly string[] = PENDING_ORDER_STATUSES;
      /** Empty list from a successful payload means zero pending — do not keep a stale sidebar/bell count. */
      const pendingOrdersCount = ordersList.filter((order: any) =>
        pendingStatuses.includes(order.status)
      ).length;

      // Get unread chat messages count with silent mode to avoid error toasts
      let unreadChats = 0;
      try {
        const chatResponse = await chatApi.getConversations();
        unreadChats = chatResponse.conversations?.reduce((sum: number, conv: any) => sum + (conv.unread || 0), 0) || 0;
      } catch (chatError) {
        // Silently ignore - chat endpoint may not be initialized yet
        console.debug('Chat counts not available, using default value of 0');
      }

      // Get vendor applications count (pending only)
      let vendorApplicationsCount = 0;
      try {
        const vendorResponse = await vendorApplicationsApi.getAll();
        if (vendorResponse.success && vendorResponse.data) {
          const apps = vendorResponse.data as Record<string, unknown>[];
          moduleCache.prime(CACHE_KEYS.ADMIN_VENDOR_APPLICATIONS, apps);
          vendorApplicationsCount = apps.filter(
            (app) => String(app?.status ?? "").toLowerCase() === "pending"
          ).length;
          if (typeof window !== "undefined") {
            window.dispatchEvent(new CustomEvent("adminVendorApplicationsPrimed"));
          }
        }
      } catch (vendorError) {
        // Silently ignore - vendor applications endpoint may not be initialized yet
        console.debug('Vendor applications count not available, using default value of 0');
      }

      setBadgeCounts((prev) => {
        const newBadgeCounts: BadgeCounts = {
          orders: pendingOrdersCount,
          vendor: vendorApplicationsCount,
          collaborator: prev.collaborator,
          chat: unreadChats,
        };
        SmartCache.set('badge_counts', newBadgeCounts);
        console.log("✅ Badge counts updated:", newBadgeCounts);
        return newBadgeCounts;
      });

      badgeCircuitBreaker.recordSuccess();
    } catch (error) {
      // Record failure with circuit breaker
      badgeCircuitBreaker.recordFailure();
      
      console.error('❌ Failed to load badge counts:', error);
      console.log('ℹ️ Using cached/zero badge counts. Badges will update after server deployment.');
      
      // Don't override cache on error - keep showing cached data
      const cached = SmartCache.get<BadgeCounts>('badge_counts');
      if (!cached) {
        setBadgeCounts(INITIAL_BADGE_COUNTS);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  /**
   * Increment orders badge count (optimistic update)
   */
  const incrementOrdersBadge = useCallback(() => {
    setBadgeCounts(prev => {
      const updated = {
        ...prev,
        orders: prev.orders + 1,
      };
      // Update cache immediately
      SmartCache.set('badge_counts', updated);
      return updated;
    });
    console.log('🔔 Order badge incremented instantly!');
    
    // Sync with server in background
    setTimeout(() => {
      void loadBadgeCounts(true);
    }, 1000); // Small delay to let the order save to database
  }, [loadBadgeCounts]);

  /**
   * Decrement orders badge count
   */
  const decrementOrdersBadge = useCallback(() => {
    setBadgeCounts(prev => {
      const updated = {
        ...prev,
        orders: Math.max(0, prev.orders - 1),
      };
      // Update cache immediately
      SmartCache.set('badge_counts', updated);
      return updated;
    });
  }, []);

  /**
   * Reset all badge counts
   */
  const resetBadgeCounts = useCallback(() => {
    setBadgeCounts(INITIAL_BADGE_COUNTS);
    SmartCache.set('badge_counts', INITIAL_BADGE_COUNTS);
  }, []);

  // 🔄 Auto-refresh while admin tab is visible only (no polling when hidden)
  useEffect(() => {
    const tick = (force: boolean) => {
      if (typeof document !== 'undefined' && document.visibilityState !== 'visible') return;
      void loadBadgeCounts(force);
    };
    tick(false);
    const interval = setInterval(() => {
      console.log('🔄 Auto-refreshing badge counts...');
      tick(false);
    }, POLLING_INTERVALS_MS.BADGE_COUNTS);

    return () => clearInterval(interval);
  }, [loadBadgeCounts]);

  /** Chat-only polling removed: loadBadgeCounts already loads chat; use `admin-chat-unread-updated` for instant UI. */

  /** Instant badge sync when Chat panel polls conversations (same tab). */
  useEffect(() => {
    const onChatUnread = (ev: Event) => {
      const detail = (ev as CustomEvent<{ total?: number }>).detail;
      if (typeof detail?.total !== 'number') return;
      setBadgeCounts((prev) => {
        const updated = { ...prev, chat: detail.total };
        SmartCache.set('badge_counts', updated);
        return updated;
      });
    };
    window.addEventListener('admin-chat-unread-updated', onChatUnread);
    return () => window.removeEventListener('admin-chat-unread-updated', onChatUnread);
  }, []);

  /**
   * Realtime bridge hookup:
   * - `adminOrdersUpdated` comes from order mutations + Supabase live pulse bridge.
   * - `vendorDataUpdated` captures vendor application/admin vendor-domain changes.
   * We debounce force-refresh to avoid request bursts when many row events arrive together.
   */
  useEffect(() => {
    let ordersTimer: ReturnType<typeof setTimeout> | null = null;
    let vendorTimer: ReturnType<typeof setTimeout> | null = null;

    const queueOrdersRefresh = () => {
      if (ordersTimer) clearTimeout(ordersTimer);
      ordersTimer = setTimeout(() => {
        void loadBadgeCounts(true);
      }, 180);
    };

    const queueVendorAppsRefresh = () => {
      if (vendorTimer) clearTimeout(vendorTimer);
      vendorTimer = setTimeout(() => {
        void refreshVendorApplicationsBadgeOnly();
      }, 60);
    };

    window.addEventListener("adminOrdersUpdated", queueOrdersRefresh as EventListener);
    window.addEventListener("vendorDataUpdated", queueVendorAppsRefresh as EventListener);

    return () => {
      if (ordersTimer) clearTimeout(ordersTimer);
      if (vendorTimer) clearTimeout(vendorTimer);
      window.removeEventListener("adminOrdersUpdated", queueOrdersRefresh as EventListener);
      window.removeEventListener("vendorDataUpdated", queueVendorAppsRefresh as EventListener);
    };
  }, [loadBadgeCounts, refreshVendorApplicationsBadgeOnly]);

  /** Vendor applications — fast refresh on Realtime pulse / cross-tab signals. */
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    const queueRefresh = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        void refreshVendorApplicationsBadgeOnly();
      }, 60);
    };

    const onCustom = queueRefresh as EventListener;
    const onStorage = (e: StorageEvent) => {
      if (e.key === ADMIN_VENDOR_APPLICATIONS_UPDATED_STORAGE_KEY && e.newValue) queueRefresh();
    };

    window.addEventListener(ADMIN_VENDOR_APPLICATIONS_UPDATED_EVENT, onCustom);
    window.addEventListener("storage", onStorage);

    let bc: BroadcastChannel | null = null;
    try {
      bc = new BroadcastChannel(ADMIN_VENDOR_APPLICATIONS_UPDATED_EVENT);
      bc.onmessage = () => queueRefresh();
    } catch {
      /* BroadcastChannel unsupported */
    }

    return () => {
      if (timer) clearTimeout(timer);
      window.removeEventListener(ADMIN_VENDOR_APPLICATIONS_UPDATED_EVENT, onCustom);
      window.removeEventListener("storage", onStorage);
      try {
        bc?.close();
      } catch {
        /* ignore */
      }
    };
  }, [refreshVendorApplicationsBadgeOnly]);

  /**
   * Safety-net poll when Realtime pulse is unavailable (cross-device / migration not applied yet).
   */
  useEffect(() => {
    const tick = () => {
      if (typeof document !== "undefined" && document.visibilityState !== "visible") return;
      void refreshVendorApplicationsBadgeOnly();
    };
    void tick();
    const id = window.setInterval(tick, POLLING_INTERVALS_MS.ADMIN_VENDOR_APPLICATIONS_BADGE_POLL);
    return () => clearInterval(id);
  }, [refreshVendorApplicationsBadgeOnly]);

  return {
    badgeCounts,
    loading,
    loadBadgeCounts,
    refreshChatBadgeOnly,
    refreshVendorApplicationsBadgeOnly,
    incrementOrdersBadge,
    decrementOrdersBadge,
    resetBadgeCounts,
  };
}