// ============================================
// CUSTOM HOOK FOR BADGE COUNTS
// ============================================

import { useState, useCallback, useEffect } from 'react';
import { chatApi, vendorApplicationsApi } from '../../utils/api';
import { getCachedAdminOrdersPayload } from '../utils/module-cache';
import { PENDING_ORDER_STATUSES, POLLING_INTERVALS_MS } from '../../constants';
import { SmartCache, CACHE_KEYS, CACHE_TTL } from '../../utils/cache';
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
   * Load badge counts from the server
   */
  const loadBadgeCounts = useCallback(async () => {
    // Check circuit breaker
    if (!badgeCircuitBreaker.canAttempt()) {
      console.warn('⛔ Badge API circuit is open - skipping request');
      return;
    }

    // Check if cache is fresh (long TTL — avoids duplicate edge calls between polls)
    if (SmartCache.isFresh('badge_counts', POLLING_INTERVALS_MS.BADGE_COUNTS_CACHE_FRESH)) {
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
        ordersPayload = await getCachedAdminOrdersPayload(false);
      } catch (ordersError) {
        console.warn('⚠️ Orders fetch failed, retrying once...', ordersError);
        await new Promise((resolve) => setTimeout(resolve, 1000));
        ordersPayload = await getCachedAdminOrdersPayload(true);
      }

      const ordersList = ordersPayload.orders ?? [];
      const pendingStatuses: readonly string[] = PENDING_ORDER_STATUSES;
      const pendingOrders =
        ordersList.length === 0
          ? null
          : ordersList.filter((order: any) => pendingStatuses.includes(order.status));

      if (ordersList.length === 0) {
        console.log(
          "ℹ️ Orders list empty — keeping previous orders badge; still refreshing vendor applications + chat"
        );
      }

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
          vendorApplicationsCount = vendorResponse.data.filter(
            (app: any) => String(app?.status ?? "").toLowerCase() === "pending"
          ).length;
        }
      } catch (vendorError) {
        // Silently ignore - vendor applications endpoint may not be initialized yet
        console.debug('Vendor applications count not available, using default value of 0');
      }

      setBadgeCounts((prev) => {
        const newBadgeCounts: BadgeCounts = {
          orders: pendingOrders === null ? prev.orders : pendingOrders.length,
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
      loadBadgeCounts();
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
    const tick = () => {
      if (typeof document !== 'undefined' && document.visibilityState !== 'visible') return;
      loadBadgeCounts();
    };
    tick();
    const interval = setInterval(() => {
      console.log('🔄 Auto-refreshing badge counts...');
      tick();
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

  return {
    badgeCounts,
    loading,
    loadBadgeCounts,
    refreshChatBadgeOnly,
    incrementOrdersBadge,
    decrementOrdersBadge,
    resetBadgeCounts,
  };
}