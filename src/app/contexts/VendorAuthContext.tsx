// Vendor Auth Context - Vendor authentication management
import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { projectId, publicAnonKey } from '../../../utils/supabase/info';
import { storeSlugFromBusinessName } from '../../utils/storeSlug';

export interface VendorUser {
  id: string;
  email: string;
  name: string;
  businessName: string;
  phone?: string;
  vendorId: string;
  storeName?: string;
  storeSlug?: string;
}

interface VendorAuthContextType {
  vendor: VendorUser | null;
  loading: boolean;
  login: (email: string, password: string, rememberMe?: boolean) => Promise<{ success: boolean; error?: string; needsSetup?: boolean }>;
  logout: () => void;
  isAuthenticated: boolean;
}

const VendorAuthContext = createContext<VendorAuthContextType | undefined>(undefined);

export function VendorAuthProvider({ children }: { children: ReactNode }) {
  const [vendor, setVendor] = useState<VendorUser | null>(null);
  const [loading, setLoading] = useState(true);

  // Check for existing session on mount
  useEffect(() => {
    checkSession();
  }, []);

  const checkSession = () => {
    try {
      console.log('🔍 [VendorAuth] Checking for existing vendor session...');
      
      const storedVendor = localStorage.getItem('vendorAuth');
      if (storedVendor) {
        const vendorData = JSON.parse(storedVendor);
        console.log('✅ [VendorAuth] Found existing session for vendor:', vendorData.email);
        setVendor(vendorData);
      } else {
        console.log('ℹ️ [VendorAuth] No existing session found');
      }
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
        
        // Generate storeSlug if missing (same algorithm as server)
        const storeSlug =
          data.vendor.storeSlug ||
          storeSlugFromBusinessName(data.vendor.storeName || data.vendor.name || "");
        
        const vendorData: VendorUser = {
          id: data.vendor.id,
          email: data.vendor.email,
          name: data.vendor.name,
          businessName: data.vendor.businessName,
          phone: data.vendor.phone,
          vendorId: data.vendor.id,
          storeName: data.vendor.storeName,
          storeSlug: storeSlug,
        };
        
        setVendor(vendorData);
        
        // Store in localStorage if remember me
        if (rememberMe) {
          localStorage.setItem('vendorAuth', JSON.stringify(vendorData));
        }
        
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
    console.log('✅ [VendorAuth] Logout successful');
  };

  const value = {
    vendor,
    loading,
    login,
    logout,
    isAuthenticated: !!vendor,
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