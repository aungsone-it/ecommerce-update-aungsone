// Vendor Auth Context - Vendor authentication management
import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import { publicAnonKey } from '../../../utils/supabase/info';
import { API_BASE_URL } from '../../utils/api-client';
import { storeSlugFromBusinessName } from '../../utils/storeSlug';
import {
  setVendorAuthSessionCookie,
  readVendorAuthSessionCookie,
  clearVendorAuthSessionCookie,
  type VendorAuthCookieVendor,
} from '../utils/vendorAuthCookie';
import {
  resolveVendorAdminPortalContext,
  vendorAuthMatchesAdminPortal,
} from '../utils/vendorAdminPortalAccess';

/** Signed URL from KV profile image after upload (same endpoint as User Profile). */
async function fetchVendorProfileAvatarUrl(vendorId: string): Promise<string | undefined> {
  try {
    const res = await fetch(
      `${API_BASE_URL}/vendor-auth/profile/${encodeURIComponent(vendorId)}`,
      { headers: { Authorization: `Bearer ${publicAnonKey}` } }
    );
    if (!res.ok) return undefined;
    const data = (await res.json()) as { user?: { profileImageUrl?: string } };
    const u = data.user;
    if (!u) return undefined;
    if (typeof u.profileImageUrl === "string" && u.profileImageUrl.startsWith("http")) {
      return u.profileImageUrl;
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

  const revalidateVendorSession = useCallback(async (
    candidate: VendorUser
  ): Promise<"valid" | "invalid" | "unknown"> => {
    try {
      if (!candidate?.vendorId || !candidate?.email) return "invalid";
      const response = await fetch(
        `${API_BASE_URL}/vendor-auth/profile/${encodeURIComponent(candidate.vendorId)}`,
        { headers: { Authorization: `Bearer ${publicAnonKey}` } }
      );
      if (!response.ok) {
        return response.status === 401 || response.status === 403 || response.status === 404
          ? "invalid"
          : "unknown";
      }
      const data = (await response.json()) as { user?: { id?: string; email?: string } };
      const resolvedId = String(data.user?.id || "").trim();
      const resolvedEmail = String(data.user?.email || "").trim().toLowerCase();
      return (
        resolvedId.length > 0 &&
        resolvedId === candidate.vendorId &&
        resolvedEmail.length > 0 &&
        resolvedEmail === candidate.email.toLowerCase()
      )
        ? "valid"
        : "invalid";
    } catch {
      return "unknown";
    }
  }, []);

  // Check for existing session on mount
  useEffect(() => {
    void checkSession();
  }, [revalidateVendorSession]);

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

      setVendor(restored);
      localStorage.setItem('vendorAuth', JSON.stringify(restored));
      if (fromCookie) {
        setVendorAuthSessionCookie(restored, fromCookie.rememberMe);
      }

      const validity = await revalidateVendorSession(restored);
      if (validity === "invalid") {
        console.warn('⚠️ [VendorAuth] Stored session failed server revalidation, clearing local state');
        setVendor(null);
        localStorage.removeItem('vendorAuth');
        clearVendorAuthSessionCookie();
        return;
      }
      if (validity === "unknown") {
        console.warn('⚠️ [VendorAuth] Session revalidation unavailable; keeping cached vendor session');
      }

      const portalContext = resolveVendorAdminPortalContext();
      if (
        portalContext.requiresMatch &&
        !vendorAuthMatchesAdminPortal(restored.storeSlug, portalContext.expectedStoreSlug)
      ) {
        console.warn(
          '⚠️ [VendorAuth] Stored session vendor does not match this admin portal URL; clearing session'
        );
        setVendor(null);
        localStorage.removeItem('vendorAuth');
        clearVendorAuthSessionCookie();
        return;
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
        `${API_BASE_URL}/vendor-auth/login`,
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
            `${API_BASE_URL}/vendor/storefront/${encodeURIComponent(data.vendor.id)}`,
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
      if (cancelled) return;
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