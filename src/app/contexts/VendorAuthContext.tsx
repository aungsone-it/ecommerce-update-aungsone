// Vendor Auth Context - Vendor authentication management
import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import { projectId, publicAnonKey } from '../../../utils/supabase/info';
import { storeSlugFromBusinessName } from '../../utils/storeSlug';
import {
  setVendorAuthSessionCookie,
  readVendorAuthSessionCookie,
  clearVendorAuthSessionCookie,
  type VendorAuthCookieVendor,
} from '../utils/vendorAuthCookie';

/** Signed URL from KV profile image after upload (same endpoint as User Profile). */
async function fetchVendorProfileAvatarUrl(vendorId: string): Promise<string | undefined> {
  try {
    const res = await fetch(
      `https://${projectId}.supabase.co/functions/v1/make-server-16010b6f/vendor-auth/profile/${encodeURIComponent(vendorId)}`,
      { headers: { Authorization: `Bearer ${publicAnonKey}` } }
    );
    if (!res.ok) return undefined;
    const data = (await res.json()) as { user?: { profileImageUrl?: string; avatar?: string } };
    const u = data.user;
    if (!u) return undefined;
    if (typeof u.profileImageUrl === "string" && u.profileImageUrl.startsWith("http")) {
      return u.profileImageUrl;
    }
    if (typeof u.avatar === "string" && u.avatar.startsWith("http")) {
      return u.avatar;
    }
    return undefined;
  } catch {
    return undefined;
  }
}

export interface VendorUser {
  id: string;
  email: string;
  name: string;
  businessName: string;
  phone?: string;
  vendorId: string;
  storeName?: string;
  storeSlug?: string;
  /** Profile photo URL when available (vendor KV profile image). */
  avatar?: string;
  location?: string;
  /** Primary contact / owner name (KV `contactName`); distinct from store `name`. */
  contactName?: string;
}

interface VendorAuthContextType {
  vendor: VendorUser | null;
  loading: boolean;
  login: (email: string, password: string, rememberMe?: boolean) => Promise<{ success: boolean; error?: string; needsSetup?: boolean }>;
  logout: () => void;
  isAuthenticated: boolean;
  /** Merge updates after profile save; persists to localStorage and apex cookie when present. */
  updateVendor: (updates: Partial<VendorUser>) => void;
}

const VendorAuthContext = createContext<VendorAuthContextType | undefined>(undefined);

export function VendorAuthProvider({ children }: { children: ReactNode }) {
  const [vendor, setVendor] = useState<VendorUser | null>(null);
  const [loading, setLoading] = useState(true);

  const isVendorSessionStillValid = useCallback(async (candidate: VendorUser): Promise<boolean> => {
    try {
      if (!candidate?.vendorId || !candidate?.email) return false;
      const response = await fetch(
        `https://${projectId}.supabase.co/functions/v1/make-server-16010b6f/vendor-auth/profile/${encodeURIComponent(candidate.vendorId)}`,
        { headers: { Authorization: `Bearer ${publicAnonKey}` } }
      );
      if (!response.ok) return false;
      const data = (await response.json()) as { user?: { id?: string; email?: string } };
      const resolvedId = String(data.user?.id || "").trim();
      const resolvedEmail = String(data.user?.email || "").trim().toLowerCase();
      return (
        resolvedId.length > 0 &&
        resolvedId === candidate.vendorId &&
        resolvedEmail.length > 0 &&
        resolvedEmail === candidate.email.toLowerCase()
      );
    } catch {
      return false;
    }
  }, []);

  // Check for existing session on mount
  useEffect(() => {
    void checkSession();
  }, [isVendorSessionStillValid]);

  const checkSession = async () => {
    try {
      console.log('🔍 [VendorAuth] Checking for existing vendor session...');

      let restored: VendorUser | null = null;

      const fromCookie = readVendorAuthSessionCookie();
      if (fromCookie) {
        restored = fromCookie.vendor as VendorUser;
        console.log('ℹ️ [VendorAuth] Found cookie session candidate for:', restored.email);
      } else {
        const storedVendor = localStorage.getItem('vendorAuth');
        if (storedVendor) {
          try {
            restored = JSON.parse(storedVendor) as VendorUser;
            console.log('ℹ️ [VendorAuth] Found local session candidate for:', restored.email);
          } catch {
            localStorage.removeItem('vendorAuth');
          }
        }
      }

      if (!restored) {
        console.log('ℹ️ [VendorAuth] No existing session found');
        return;
      }

      const valid = await isVendorSessionStillValid(restored);
      if (!valid) {
        console.warn('⚠️ [VendorAuth] Stored session failed server revalidation, clearing local state');
        setVendor(null);
        localStorage.removeItem('vendorAuth');
        clearVendorAuthSessionCookie();
        return;
      }

      setVendor(restored);
      localStorage.setItem('vendorAuth', JSON.stringify(restored));
      if (fromCookie) {
        setVendorAuthSessionCookie(restored, fromCookie.rememberMe);
      }
      console.log('✅ [VendorAuth] Session restored after server revalidation:', restored.email);
    } catch (error) {
      console.error('❌ [VendorAuth] Session check error:', error);
    } finally {
      setLoading(false);
    }
  };

  const login = async (email: string, password: string, rememberMe: boolean = true): Promise<{ success: boolean; error?: string; needsSetup?: boolean }> => {
    try {
      console.log('🔐 [VendorAuth] Attempting vendor login for:', email);
      
      // Call vendor login endpoint
      const response = await fetch(
        `https://${projectId}.supabase.co/functions/v1/make-server-16010b6f/vendor-auth/login`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${publicAnonKey}`,
          },
          body: JSON.stringify({ email, password }),
        }
      );

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: 'Login failed' }));
        console.error('❌ [VendorAuth] Login failed:', errorData.error);
        return { 
          success: false, 
          error: errorData.error || 'Invalid email or password',
          needsSetup: errorData.needsSetup || false
        };
      }

      const data = await response.json();
      
      if (data.success && data.vendor) {
        console.log('✅ [VendorAuth] Login successful for vendor:', data.vendor.email);

        let storeSlug =
          data.vendor.storeSlug ||
          storeSlugFromBusinessName(data.vendor.storeName || data.vendor.name || "");

        try {
          const fr = await fetch(
            `https://${projectId}.supabase.co/functions/v1/make-server-16010b6f/vendor/storefront/${encodeURIComponent(data.vendor.id)}`,
            { headers: { Authorization: `Bearer ${publicAnonKey}` } }
          );
          if (fr.ok) {
            const fd = (await fr.json()) as { settings?: { storeSlug?: string } };
            const s = fd.settings?.storeSlug?.trim();
            if (s) storeSlug = s;
          }
        } catch {
          /* keep login API slug */
        }

        const v = data.vendor as Record<string, unknown>;
        const owner =
          typeof v.contactName === "string" && v.contactName.trim()
            ? v.contactName.trim()
            : typeof v.name === "string"
              ? v.name
              : "";
        const vendorData: VendorUser = {
          id: data.vendor.id,
          email: data.vendor.email,
          name: data.vendor.name,
          businessName: data.vendor.businessName,
          phone: data.vendor.phone,
          vendorId: data.vendor.id,
          storeName: data.vendor.storeName,
          storeSlug: storeSlug,
          location: typeof data.vendor.location === "string" ? data.vendor.location : undefined,
          contactName: owner || undefined,
          avatar:
            typeof data.vendor.avatar === "string" && data.vendor.avatar.startsWith("http")
              ? data.vendor.avatar
              : undefined,
        };

        setVendor(vendorData);

        if (rememberMe) {
          localStorage.setItem('vendorAuth', JSON.stringify(vendorData));
        }

        setVendorAuthSessionCookie(vendorData, rememberMe);

        return { success: true };
      }

      return { success: false, error: 'Login failed' };
    } catch (error: any) {
      console.error('❌ [VendorAuth] Login exception:', error);
      return { success: false, error: 'Network error. Please try again.' };
    }
  };

  const logout = () => {
    console.log('🔓 [VendorAuth] Logging out vendor...');
    setVendor(null);
    localStorage.removeItem('vendorAuth');
    clearVendorAuthSessionCookie();
    console.log('✅ [VendorAuth] Logout successful');
  };

  const updateVendor = useCallback((updates: Partial<VendorUser>) => {
    setVendor((prev) => {
      if (!prev) return prev;
      const next: VendorUser = { ...prev, ...updates };
      try {
        localStorage.setItem('vendorAuth', JSON.stringify(next));
      } catch {
        /* ignore quota */
      }
      const fromCookie = readVendorAuthSessionCookie();
      if (fromCookie) {
        const mergedCookie: VendorAuthCookieVendor = {
          ...fromCookie.vendor,
          ...updates,
          id: next.id,
          vendorId: next.vendorId,
        };
        setVendorAuthSessionCookie(mergedCookie, fromCookie.rememberMe);
      }
      return next;
    });
  }, []);

  /** Fill session.avatar from stored profile photo (login payload omits signed URLs). */
  useEffect(() => {
    if (loading || !vendor?.vendorId) return;
    let cancelled = false;
    (async () => {
      const url = await fetchVendorProfileAvatarUrl(vendor.vendorId);
      if (cancelled || !url) return;
      updateVendor({ avatar: url });
    })();
    return () => {
      cancelled = true;
    };
  }, [loading, vendor?.vendorId, updateVendor]);

  const value = {
    vendor,
    loading,
    login,
    logout,
    isAuthenticated: !!vendor,
    updateVendor,
  };

  return (
    <VendorAuthContext.Provider value={value}>
      {children}
    </VendorAuthContext.Provider>
  );
}

export function useVendorAuth() {
  const context = useContext(VendorAuthContext);
  if (context === undefined) {
    throw new Error('useVendorAuth must be used within a VendorAuthProvider');
  }
  return context;
}