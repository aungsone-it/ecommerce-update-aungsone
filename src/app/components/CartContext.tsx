// Cart Context - Shopping cart state management (DATABASE-FIRST)
import { createContext, useContext, useState, useEffect, ReactNode, useCallback, useRef } from 'react';
import { projectId, publicAnonKey } from '../../../utils/supabase/info';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../contexts/AuthContext';

export interface CartItem {
  id: string;
  productId: string;
  name: string;
  sku: string;
  price: number;
  image: string;
  quantity: number;
  inventory: number;
  vendorId: string;
  /** Snapshot at add-to-cart — used for vendor commission after order is fulfilled (super admin). */
  commissionRate?: number;
}

interface CartContextType {
  items: CartItem[];
  addToCart: (item: Omit<CartItem, 'quantity'>, quantity?: number) => void;
  removeFromCart: (itemId: string) => void;
  updateQuantity: (itemId: string, quantity: number) => void;
  clearCart: () => void;
  totalItems: number;
  totalPrice: number;
}

const CartContext = createContext<CartContextType | undefined>(undefined);

function normalizeCartPayload(value: unknown): CartItem[] {
  if (!Array.isArray(value)) return [];
  return value as CartItem[];
}

function cartCacheKey(userId: string): string {
  return `migoo-user-cart:${userId}`;
}

export function CartProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth(); // 🔥 Connect to AuthContext for automatic user detection
  const [items, setItems] = useState<CartItem[]>(() => {
    // 🔥 DATABASE-FIRST: Load guest cart from localStorage ONLY (logged-in users load from DB)
    // This is temporary cart that gets merged on login
    try {
      const saved = localStorage.getItem('migoo-guest-cart');
      return saved ? JSON.parse(saved) : [];
    } catch (error) {
      console.warn('Failed to parse guest cart from localStorage:', error);
      return [];
    }
  });
  
  const syncTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const loadedUserRef = useRef<string | null>(null); // Track which user's cart we loaded
  const cartSignatureRef = useRef<string>("[]");
  const suppressNextSyncRef = useRef(false);
  /** Throttle cart GET from tab focus/visibility (each call hits the Edge Function + KV). */
  const lastAmbientCartFetchRef = useRef<number>(0);

  // 🔥 Sync cart to database (for logged-in users only)
  const syncCartToDatabase = useCallback(async (userId: string, cart: CartItem[]) => {
    try {
      await fetch(
        `https://${projectId}.supabase.co/functions/v1/make-server-16010b6f/customers/${userId}/cart`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${publicAnonKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ cart }),
        }
      );
      try {
        localStorage.setItem(cartCacheKey(userId), JSON.stringify(cart));
      } catch {
        /* ignore quota/private mode */
      }
      cartSignatureRef.current = JSON.stringify(cart);
    } catch (error) {
      console.error('Failed to sync cart to database:', error);
    }
  }, []);
  
  // 🔥 Load cart from database (called on login)
  const loadCartFromDatabase = useCallback(async (userId: string) => {
    try {
      console.log(`🛒 Loading cart from database for user: ${userId}`);
      const response = await fetch(
        `https://${projectId}.supabase.co/functions/v1/make-server-16010b6f/customers/${userId}/cart`,
        {
          headers: {
            'Authorization': `Bearer ${publicAnonKey}`,
          },
        }
      );
      
      if (response.ok) {
        const data = await response.json();
        const dbCart = data.cart || [];
        
        // Get guest cart from localStorage (with error handling)
        let guestCart: CartItem[] = [];
        try {
          const guestCartStr = localStorage.getItem('migoo-guest-cart');
          guestCart = guestCartStr ? JSON.parse(guestCartStr) : [];
        } catch (parseError) {
          console.warn('Failed to parse guest cart:', parseError);
          guestCart = [];
        }
        
        // Merge: Prefer DB cart, add any unique guest items
        const mergedCart = [...dbCart];
        guestCart.forEach((guestItem: CartItem) => {
          const existsInDB = dbCart.some((dbItem: CartItem) => 
            dbItem.id === guestItem.id
          );
          if (!existsInDB) {
            mergedCart.push(guestItem);
          }
        });
        
        console.log(`✅ Cart loaded: ${dbCart.length} items from DB, ${guestCart.length} guest items, ${mergedCart.length} total`);
        suppressNextSyncRef.current = true;
        setItems(mergedCart);
        cartSignatureRef.current = JSON.stringify(mergedCart);
        try {
          localStorage.setItem(cartCacheKey(userId), JSON.stringify(mergedCart));
        } catch {
          /* ignore quota/private mode */
        }
        
        // Clear guest cart after merging
        localStorage.removeItem('migoo-guest-cart');
        
        // Sync merged cart back to database if there were guest items
        if (guestCart.length > 0 && mergedCart.length > dbCart.length) {
          await syncCartToDatabase(userId, mergedCart);
        }
      }
    } catch (error) {
      console.warn('⚠️ Could not load cart from server, continuing with local cart');
      // Continue with local cart if database load fails - this is fine
    }
  }, [syncCartToDatabase]);

  // 🔥 DATABASE-FIRST: Load cart from database when user logs in
  useEffect(() => {
    if (user?.id && loadedUserRef.current !== user.id) {
      console.log(`🔄 User logged in, loading cart from database for: ${user.id}`);
      loadedUserRef.current = user.id;
      try {
        const cached = localStorage.getItem(cartCacheKey(user.id));
        if (cached) {
          const parsed = normalizeCartPayload(JSON.parse(cached));
          suppressNextSyncRef.current = true;
          setItems(parsed);
          cartSignatureRef.current = JSON.stringify(parsed);
        }
      } catch {
        /* ignore parse/storage failures */
      }
      loadCartFromDatabase(user.id);
    } else if (!user?.id && loadedUserRef.current !== null) {
      // User logged out - clear cart and reset
      console.log(`🔄 User logged out, clearing cart`);
      loadedUserRef.current = null;
      setItems([]);
      localStorage.removeItem('migoo-guest-cart');
    }
  }, [user?.id, loadCartFromDatabase]);

  // 🔥 Realtime cart sync (cross-device, low API usage): subscribe to KV row updates.
  useEffect(() => {
    const uid = user?.id;
    if (!uid) return;
    const key = `customer:${uid}:cart`;
    const channel = supabase
      .channel(`cart-sync-${uid}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "kv_store_16010b6f",
          filter: `key=eq.${key}`,
        },
        (payload: any) => {
          const next = normalizeCartPayload(payload?.new?.value);
          const nextSig = JSON.stringify(next);
          if (nextSig === cartSignatureRef.current) return;
          cartSignatureRef.current = nextSig;
          suppressNextSyncRef.current = true;
          setItems(next);
          try {
            localStorage.setItem(cartCacheKey(uid), nextSig);
          } catch {
            /* ignore quota/private mode */
          }
        },
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [user?.id]);

  // 🔥 AUTO-REFRESH cart when tab becomes visible — throttled to avoid spamming the API
  useEffect(() => {
    const MIN_MS_BETWEEN_AMBIENT_FETCH = 120_000;

    const maybeRefresh = (reason: string) => {
      if (!user?.id) return;
      const now = Date.now();
      if (now - lastAmbientCartFetchRef.current < MIN_MS_BETWEEN_AMBIENT_FETCH) {
        return;
      }
      lastAmbientCartFetchRef.current = now;
      console.log(`🔄 ${reason}, refreshing cart from database (throttled)...`);
      loadCartFromDatabase(user.id);
    };

    const handleVisibilityChange = () => {
      if (!document.hidden) {
        maybeRefresh('Tab became visible');
      }
    };

    const handleFocus = () => {
      maybeRefresh('Window focused');
    };

    if (user?.id) {
      document.addEventListener('visibilitychange', handleVisibilityChange);
      window.addEventListener('focus', handleFocus);

      return () => {
        document.removeEventListener('visibilitychange', handleVisibilityChange);
        window.removeEventListener('focus', handleFocus);
      };
    }
  }, [user?.id, loadCartFromDatabase]);

  // 🔥 DATABASE-FIRST: Save to database for logged-in users, localStorage for guests
  useEffect(() => {
    // Clear any pending sync
    if (syncTimeoutRef.current) {
      clearTimeout(syncTimeoutRef.current);
    }
    
    if (user?.id) {
      const nextSig = JSON.stringify(items);
      if (nextSig === cartSignatureRef.current) return;
      if (suppressNextSyncRef.current) {
        suppressNextSyncRef.current = false;
        return;
      }
      // Logged-in user → Save to DATABASE ONLY (debounced to avoid spam)
      syncTimeoutRef.current = setTimeout(() => {
        syncCartToDatabase(user.id, items);
      }, 2000); // Debounce: fewer Edge Function writes under rapid quantity changes
      
      // Remove guest cart from localStorage (no longer needed)
      localStorage.removeItem('migoo-guest-cart');
    } else {
      // Guest user → Save to localStorage ONLY (temporary)
      try {
        localStorage.setItem('migoo-guest-cart', JSON.stringify(items));
      } catch (error) {
        console.warn('Failed to save guest cart to localStorage:', error);
      }
    }
    
    return () => {
      if (syncTimeoutRef.current) {
        clearTimeout(syncTimeoutRef.current);
      }
    };
  }, [items, user?.id, syncCartToDatabase]);
  
  const addToCart = (item: Omit<CartItem, 'quantity'>, quantity: number = 1) => {
    setItems(prevItems => {
      const existingItem = prevItems.find(i => i.id === item.id);
      if (existingItem) {
        return prevItems.map((i) =>
          i.id === item.id
            ? {
                ...i,
                quantity: i.quantity + quantity,
                commissionRate:
                  i.commissionRate ?? item.commissionRate,
              }
            : i
        );
      }
      return [...prevItems, { ...item, quantity }];
    });
  };

  const removeFromCart = (itemId: string) => {
    setItems(prevItems => prevItems.filter(item => item.id !== itemId));
  };

  const updateQuantity = (itemId: string, quantity: number) => {
    if (quantity <= 0) {
      removeFromCart(itemId);
      return;
    }
    
    setItems(prevItems =>
      prevItems.map(item =>
        item.id === itemId
          ? { ...item, quantity: Math.min(quantity, item.inventory) }
          : item
      )
    );
  };

  const clearCart = () => {
    setItems([]);
  };

  const totalItems = items.reduce((sum, item) => sum + item.quantity, 0);
  const totalPrice = items.reduce((sum, item) => sum + (item.price || 0) * item.quantity, 0);

  return (
    <CartContext.Provider
      value={{
        items,
        addToCart,
        removeFromCart,
        updateQuantity,
        clearCart,
        totalItems,
        totalPrice,
      }}
    >
      {children}
    </CartContext.Provider>
  );
}

export function useCart() {
  const context = useContext(CartContext);
  if (!context) {
    throw new Error('useCart must be used within a CartProvider');
  }
  return context;
}