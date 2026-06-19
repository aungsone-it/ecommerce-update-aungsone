// Auth Context - User authentication management
import { createContext, useContext, useState, useEffect, useRef, ReactNode } from 'react';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { projectId, publicAnonKey } from '../../../utils/supabase/info';
import {
  freeLocalStorageForAuth,
  isStorageQuotaError,
} from '../utils/persistedLocalCache';

const supabaseUrl = `https://${projectId}.supabase.co`;

// ============================================
// REMOVED: Session cleanup code
// Supabase handles session management automatically
// Manual cleanup was causing legitimate sessions to be cleared
// ============================================

// Single shared Supabase client instance to prevent multiple GoTrueClient instances
let supabaseInstance: SupabaseClient | null = null;

// Create Supabase client - ONLY ONE INSTANCE FOR THE ENTIRE APP
const getSupabaseClient = (): SupabaseClient => {
  if (!supabaseInstance) {
    console.log('🔧 Initializing Supabase client (SINGLE INSTANCE)');
    supabaseInstance = createClient(supabaseUrl, publicAnonKey, {
      auth: {
        storage: typeof window !== 'undefined' ? window.localStorage : undefined,
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: false,
      }
    });
  }
  return supabaseInstance;
};

// Export the single client instance
export const supabase = getSupabaseClient();

export type UserRole =
  | 'super-admin'
  | 'store-owner'
  | 'administrator'
  | 'warehouse'
  | 'data-entry'
  | 'vendor-admin'
  | 'collaborator';

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  phone?: string;
  role: UserRole;
  storeId?: string; // For vendor admins and collaborators
  tempPassword?: boolean; // If they need to change password on first login
  profileImage?: string;
  profileImageUrl?: string;
  bio?: string;
  location?: string;
  addressLine1?: string;
  addressLine2?: string;
  city?: string;
  region?: string;
  postalCode?: string;
  country?: string;
  createdAt?: string;
  updatedAt?: string;
  authCreatedAt?: string;
  lastSignInAt?: string;
}

interface AuthContextType {
  user: AuthUser | null;
  loading: boolean;
  login: (email: string, password: string, rememberMe?: boolean) => Promise<{ success: boolean; error?: string; needsPasswordChange?: boolean }>;
  logout: () => Promise<void>;
  changePassword: (newPassword: string) => Promise<{ success: boolean; error?: string }>;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

/** Throttle background profile refresh to avoid a burst of API calls when alt-tabbing (each was 2+ fetches). */
const PROFILE_BG_REFRESH_MIN_MS = 5 * 60 * 1000;

/** Profile fetch: long enough for cold edge + local dev; background refresh stays shorter. */
const PROFILE_FETCH_TIMEOUT_MS = (background: boolean) => (background ? 12_000 : 25_000);
const PROFILE_INITIAL_ATTEMPTS = 3;
const STAFF_ACTOR_ID_STORAGE_KEY = "migoo-staff-actor-id";
const STAFF_AUDIT_ROLES = new Set([
  "super-admin",
  "store-owner",
  "administrator",
  "data-entry",
  "warehouse",
  "platform-admin",
  "product-manager",
  "developer",
  "vendor-admin",
  "collaborator",
]);

function persistStaffActorId(profile: unknown): void {
  if (typeof window === "undefined") return;
  const p = (profile || {}) as { id?: unknown; role?: unknown };
  const id = String(p.id || "").trim();
  const role = String(p.role || "").trim();
  if (id && STAFF_AUDIT_ROLES.has(role)) {
    try {
      localStorage.setItem(STAFF_ACTOR_ID_STORAGE_KEY, id);
      return;
    } catch {
      /* ignore storage failures */
    }
  }
  try {
    localStorage.removeItem(STAFF_ACTOR_ID_STORAGE_KEY);
  } catch {
    /* ignore storage failures */
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isTransientProfileFetchError(err: unknown, responseStatus?: number): boolean {
  if (responseStatus != null && responseStatus >= 500) return true;
  if (!err || typeof err !== "object") return false;
  const e = err as { name?: string; message?: string };
  if (e.name === "AbortError") return true;
  const m = String(e.message || "");
  return m === "Failed to fetch" || m.includes("NetworkError");
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);
  const lastBgProfileRefreshRef = useRef(0);

  // Check for existing session on mount
  useEffect(() => {
    checkSession();
  }, []);

  // 🔥 AUTO-REFRESH user data when browser tab becomes visible (throttled)
  useEffect(() => {
    const maybeRefreshProfile = () => {
      if (!user?.id) return;
      const now = Date.now();
      if (now - lastBgProfileRefreshRef.current < PROFILE_BG_REFRESH_MIN_MS) return;
      lastBgProfileRefreshRef.current = now;
      console.log('🔄 Refreshing user data (throttled background fetch)...');
      loadUserProfile(user.id, true).catch((err) => {
        console.error('Failed to refresh user data:', err);
      });
    };

    const handleVisibilityChange = () => {
      if (!document.hidden) maybeRefreshProfile();
    };

    const handleFocus = () => {
      maybeRefreshProfile();
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('focus', handleFocus);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('focus', handleFocus);
    };
  }, [user?.id]);

  const checkSession = async () => {
    try {
      console.log("🔍 Checking for existing session...");
      const { data, error } = await supabase.auth.getSession();
      if (error) {
        console.error("❌ getSession error:", error.message);
        return;
      }
      const session = data.session;
      if (session?.user) {
        console.log("✅ Found existing session for:", session.user.email);
        await loadUserProfile(session.user.id, false);
        return;
      }
      console.log("ℹ️ No existing session found");
    } catch (error) {
      console.error("❌ Session check error:", error);
    } finally {
      setLoading(false);
    }
  };

  const loadUserProfile = async (
    userId: string,
    isBackgroundRefresh: boolean = false
  ): Promise<AuthUser | null> => {
    try {
      const maxAttempts = isBackgroundRefresh ? 1 : PROFILE_INITIAL_ATTEMPTS;
      let lastNonOkStatus: number | undefined;

      for (let attempt = 0; attempt < maxAttempts; attempt++) {
        if (attempt > 0) {
          await sleep(700 * attempt);
          console.log(`📡 Profile fetch retry ${attempt + 1}/${maxAttempts}…`);
        }

        const controller = new AbortController();
        const timeoutMs = PROFILE_FETCH_TIMEOUT_MS(isBackgroundRefresh);
        const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

        const url = `https://${projectId}.supabase.co/functions/v1/make-server-16010b6f/auth/profile/${userId}`;
        console.log("📡 Fetching profile from:", url);

        try {
          const response = await fetch(url, {
            headers: {
              Authorization: `Bearer ${publicAnonKey}`,
            },
            signal: controller.signal,
          });

          clearTimeout(timeoutId);

          if (response.ok) {
            const data = await response.json();
            const profile =
              data && typeof data === "object" && data.user != null && typeof data.user === "object"
                ? data.user
                : data;
            console.log("✅ Profile loaded successfully");
            setUser(profile as AuthUser);
            persistStaffActorId(profile);

            if (
              (profile.role === "super-admin" || profile.role === "store-owner") &&
              !isBackgroundRefresh
            ) {
              setTimeout(() => {
                autoCleanupCorruptedData();
              }, 2000);
            }
            return profile as AuthUser;
          }

          if (response.status === 404) {
            console.warn("⚠️ User profile not found. Setup may be required.");
            console.warn("   User ID:", userId);
            if (!isBackgroundRefresh) {
              setUser(null);
              persistStaffActorId(null);
            }
            return null;
          }

          lastNonOkStatus = response.status;
          const errorText = await response.text();
          console.warn("⚠️ Failed to load profile:", response.status, errorText);

          const transientHttp = response.status >= 500;
          if (
            !isBackgroundRefresh &&
            transientHttp &&
            attempt < maxAttempts - 1
          ) {
            continue;
          }

          if (isBackgroundRefresh) {
            console.warn("⚠️ Background refresh failed, keeping existing user session");
          } else {
            console.warn("⚠️ Profile load failed after attempts; signing out app user state");
            setUser(null);
          }
          return null;
        } catch (error: unknown) {
          clearTimeout(timeoutId);
          const err = error as { name?: string; message?: string };
          if (err?.name === "AbortError") {
            console.warn("⚠️ Profile request timed out or was aborted");
          } else if (err?.message === "Failed to fetch") {
            console.warn("⚠️ Could not connect to server while loading profile");
          } else {
            console.error("❌ Load profile error:", error);
          }

          const transient = isTransientProfileFetchError(error, lastNonOkStatus);
          if (!isBackgroundRefresh && transient && attempt < maxAttempts - 1) {
            continue;
          }

          if (!isBackgroundRefresh) {
            setUser(null);
            persistStaffActorId(null);
          }
          return null;
        }
      }
      return null;
    } finally {
      if (!isBackgroundRefresh) {
        setLoading(false);
      }
    }
  };

  // 🔥 AUTO-CLEANUP CORRUPTED CUSTOMER DATA (runs silently in background)
  const autoCleanupCorruptedData = async () => {
    try {
      console.log('🧹 Auto-cleanup: Checking for corrupted customer data...');
      
      const response = await fetch(
        `https://${projectId}.supabase.co/functions/v1/make-server-16010b6f/customers/cleanup-corrupted`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${publicAnonKey}`,
          },
        }
      );

      if (response.ok) {
        const data = await response.json();
        if (data.cleanedCount > 0) {
          console.log(`✅ Auto-cleanup: Removed ${data.cleanedCount} corrupted customer entries`);
        } else {
          console.log('✅ Auto-cleanup: No corrupted data found');
        }
      }
    } catch (error) {
      // Silently fail - this is a background cleanup
      console.log('⚠️ Auto-cleanup skipped (server may still be warming up)');
    }
  };

  const login = async (email: string, password: string, rememberMe: boolean = true) => {
    try {
      console.log('🔐 Attempting login for:', email, '| Remember me:', rememberMe);

      const attemptSignIn = () =>
        supabase.auth.signInWithPassword({
          email,
          password,
        });

      let pruned = freeLocalStorageForAuth();
      if (pruned > 0) {
        console.log(`🧹 Freed localStorage before login (${pruned} cache entries removed)`);
      }

      let { data, error } = await attemptSignIn();

      if (error && isStorageQuotaError(error)) {
        const cleared = freeLocalStorageForAuth({ clearAll: true });
        console.warn(`🧹 Storage quota on login — cleared ${cleared} localStorage entries, retrying…`);
        ({ data, error } = await attemptSignIn());
      }

      if (error) {
        console.error('❌ Login error:', error.message);
        // Check for specific error messages and provide user-friendly versions
        if (error.message.includes('Failed to fetch') || error.message.includes('NetworkError')) {
          return { 
            success: false, 
            error: 'Cannot connect to server. Please check if the Supabase Edge Function is deployed and running.' 
          };
        }
        // Handle invalid credentials error
        if (error.message.includes('Invalid login credentials') || error.message.includes('invalid_credentials')) {
          return { 
            success: false, 
            error: 'Invalid email or password. Please check your credentials and try again. If you haven\'t set up an admin account yet, please use the Setup page.' 
          };
        }
        return { success: false, error: error.message };
      }

      if (data.user) {
        console.log('✅ Login successful for:', data.user.email);
        const profile = await loadUserProfile(data.user.id);
        if (profile?.tempPassword) {
          return { success: true, needsPasswordChange: true };
        }
        return { success: true };
      }

      return { success: false, error: 'Login failed' };
    } catch (error: any) {
      console.error('❌ Login exception:', error);
      if (isStorageQuotaError(error)) {
        freeLocalStorageForAuth({ clearAll: true });
        return {
          success: false,
          error:
            'Browser storage was full (too much cached catalog data on localhost). Cache was cleared — please click Sign In again.',
        };
      }
      if (error.message?.includes('Failed to fetch') || error.message?.includes('NetworkError')) {
        return { 
          success: false, 
          error: 'Cannot connect to authentication server. Please ensure Supabase is running properly.' 
        };
      }
      return { success: false, error: error.message || 'An unexpected error occurred during login' };
    }
  };

  const logout = async () => {
    try {
      console.log('🔓 Logging out...');
      await supabase.auth.signOut();
      setUser(null);
      persistStaffActorId(null);
      console.log('✅ Logout successful');
    } catch (error) {
      console.error('❌ Logout error:', error);
    }
  };

  const changePassword = async (newPassword: string) => {
    try {
      const { error } = await supabase.auth.updateUser({
        password: newPassword,
      });

      if (error) {
        return { success: false, error: error.message };
      }

      // Update tempPassword flag
      if (user) {
        const response = await fetch(
          `https://${projectId}.supabase.co/functions/v1/make-server-16010b6f/auth/update-temp-password`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${publicAnonKey}`,
            },
            body: JSON.stringify({ userId: user.id }),
          }
        );

        if (response.ok) {
          setUser({ ...user, tempPassword: false });
        }
      }

      return { success: true };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  };

  const refreshUser = async () => {
    if (!user || !user.id) {
      console.log('⚠️ Cannot refresh user: No user logged in');
      return;
    }
    
    try {
      console.log('🔄 Refreshing user profile...');
      await loadUserProfile(user.id);
    } catch (error) {
      // 🔇 Silently ignore - this is expected for customers who aren't vendors
      // Don't throw - just continue
    }
  };

  return (
    <AuthContext.Provider value={{ user, loading, login, logout, changePassword, refreshUser }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    // During HMR (Hot Module Replacement), React may temporarily render components
    // before providers are ready. Return a safe default instead of throwing.
    if (import.meta.hot) {
      console.warn('⚠️ useAuth called during HMR before AuthProvider is ready');
      return {
        user: null,
        loading: true,
        login: async () => ({ success: false, error: 'Loading...' }),
        logout: async () => {},
        changePassword: async () => ({ success: false, error: 'Loading...' }),
        refreshUser: async () => {},
      };
    }
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}