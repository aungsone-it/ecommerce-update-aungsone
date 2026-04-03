// Auth Context - User authentication management
import { createContext, useContext, useState, useEffect, useRef, ReactNode } from 'react';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { projectId, publicAnonKey } from '../../../utils/supabase/info';

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
      console.log('🔍 Checking for existing session...');
      
      // Add aggressive timeout to prevent infinite loading - 5 seconds max
      const sessionPromise = supabase.auth.getSession();
      
      const timeoutPromise = new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Session check timeout')), 5000)
      );
      
      const result = await Promise.race([
        sessionPromise,
        timeoutPromise
      ]) as any;
      
      const session = result.data?.session;
      
      if (session?.user) {
        console.log('✅ Found existing session for:', session.user.email);
        console.log('🔍 User ID:', session.user.id);
        
        // 🔥 REMOVED: Don't clear sessions based on user ID format
        // Supabase generates legitimate UUIDs - we should trust them
        
        // Load profile but don't let it block the app from loading
        loadUserProfile(session.user.id).catch(err => {
          console.error('❌ Failed to load profile, continuing anyway:', err);
          setLoading(false);
        });
      } else {
        console.log('ℹ️ No existing session found');
        setLoading(false);
      }
    } catch (error) {
      console.error('❌ Session check error:', error);
      // ALWAYS set loading to false, even if there's an error
      setLoading(false);
    }
  };

  const loadUserProfile = async (userId: string, isBackgroundRefresh: boolean = false) => {
    try {
      // Get user profile from KV store with aggressive timeout - 5 seconds max
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000);
      
      const url = `https://${projectId}.supabase.co/functions/v1/make-server-16010b6f/auth/profile/${userId}`;
      console.log('📡 Fetching profile from:', url);
      
      const response = await fetch(
        url,
        {
          headers: {
            'Authorization': `Bearer ${publicAnonKey}`,
          },
          signal: controller.signal,
        }
      );
      
      clearTimeout(timeoutId);

      if (response.ok) {
        const data = await response.json();
        const profile =
          data && typeof data === "object" && data.user != null && typeof data.user === "object"
            ? data.user
            : data;
        console.log('✅ Profile loaded successfully');
        setUser(profile);
        
        // 🔥 AUTO-CLEANUP: Run database cleanup silently in the background (super admin only)
        if (
          (profile.role === 'super-admin' || profile.role === 'store-owner') &&
          !isBackgroundRefresh
        ) {
          setTimeout(() => {
            autoCleanupCorruptedData();
          }, 2000); // Wait 2 seconds after login to let server warm up
        }
      } else if (response.status === 404) {
        // Profile not found - this is expected if setup hasn't been completed
        console.warn('⚠️ User profile not found. Setup may be required.');
        console.warn('   User ID:', userId);
        
        // 🔥 FIX: Only clear user on initial load, not on background refresh
        if (!isBackgroundRefresh) {
          setUser(null);
        }
      } else {
        const errorText = await response.text();
        console.warn('⚠️ Failed to load profile:', response.status, errorText);
        
        // 🔥 FIX: Only clear user on initial load, not on background refresh
        if (isBackgroundRefresh) {
          console.warn('⚠️ Background refresh failed, keeping existing user session');
          // Don't clear user - this is just a background refresh failure
        } else {
          // 🔥 FIX: Don't sign out on profile load failure
          // The Supabase session is valid - we just couldn't load the profile from KV store
          // This can happen if the Edge Function is still warming up
          // Keep the session and try again later
          console.warn('⚠️ Keeping session active despite profile load failure');
          console.warn('⚠️ You may need to create a user profile in the database');
          setUser(null); // Clear user but don't sign out
        }
      }
    } catch (error: any) {
      if (error.name === 'AbortError') {
        console.warn('⚠️ Server is taking longer than expected to respond, continuing without profile');
      } else if (error.message === 'Failed to fetch') {
        console.warn('⚠️ Could not connect to server, continuing with cached session');
        console.warn('   The server may still be starting up. Try refreshing in a moment.');
      } else {
        console.error('❌ Load profile error:', error);
      }
      
      // 🔥 FIX: Only clear user on initial load, not on background refresh
      if (!isBackgroundRefresh) {
        setUser(null);
      }
    } finally {
      // ALWAYS set loading to false, no matter what
      setLoading(false);
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
      
      // Note: We use a single client instance. The rememberMe parameter could be used
      // to configure session persistence, but for now we always persist to localStorage
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

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
        await loadUserProfile(data.user.id);
        
        // Check if temp password
        const profile = user;
        if (profile?.tempPassword) {
          return { success: true, needsPasswordChange: true };
        }
        
        return { success: true };
      }

      return { success: false, error: 'Login failed' };
    } catch (error: any) {
      console.error('❌ Login exception:', error);
      // Provide user-friendly error messages
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