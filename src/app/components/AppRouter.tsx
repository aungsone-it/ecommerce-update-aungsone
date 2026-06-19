// App Router Component - Handles setup and auth flow
import { useState, useEffect } from 'react';
import { Navigate, useLocation } from 'react-router';
import { projectId, publicAnonKey } from '../../../utils/supabase/info';
import { AuthGate } from './AuthGate';
import { Loader2 } from 'lucide-react';
import { usePlatformBranding } from '../hooks/usePlatformBranding';
import { buildSuperAdminDocumentTitle } from '../utils/superAdminDocumentTitle';

export const SUPER_ADMIN_SETUP_COMPLETE_EVENT = 'superAdminSetupComplete';

function isAdminSetupPath(pathname: string): boolean {
  const p = pathname.replace(/\/+$/, '') || '/';
  return p === '/admin/setup';
}

export function AppRouter({ children }: { children: React.ReactNode }) {
  const location = useLocation();
  const platformBranding = usePlatformBranding();
  const [checkingSetup, setCheckingSetup] = useState(true);
  const [needsSetup, setNeedsSetup] = useState(false);
  const onAdminSetup = isAdminSetupPath(location.pathname);

  const checkIfSetupNeeded = async () => {
    try {
      const response = await fetch(
        `https://${projectId}.supabase.co/functions/v1/make-server-16010b6f/auth/check-setup`,
        {
          headers: {
            Authorization: `Bearer ${publicAnonKey}`,
          },
        }
      );

      if (response.ok) {
        const { setupComplete } = await response.json();
        setNeedsSetup(!setupComplete);
      } else {
        setNeedsSetup(false);
      }
    } catch (error) {
      console.error('Error checking setup:', error);
      setNeedsSetup(false);
    } finally {
      setCheckingSetup(false);
    }
  };

  useEffect(() => {
    void checkIfSetupNeeded();
  }, []);

  useEffect(() => {
    const onComplete = () => {
      setNeedsSetup(false);
      setCheckingSetup(false);
    };
    window.addEventListener(SUPER_ADMIN_SETUP_COMPLETE_EVENT, onComplete);
    return () => window.removeEventListener(SUPER_ADMIN_SETUP_COMPLETE_EVENT, onComplete);
  }, []);

  useEffect(() => {
    document.title = buildSuperAdminDocumentTitle({
      pageName: checkingSetup ? 'Loading' : needsSetup || onAdminSetup ? 'Setup' : 'Admin',
      storeName: platformBranding.storeName,
    });
  }, [checkingSetup, needsSetup, onAdminSetup, platformBranding.storeName]);

  if (checkingSetup) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 to-slate-100">
        <div className="text-center space-y-4">
          <Loader2 className="w-12 h-12 animate-spin text-slate-900 mx-auto" />
          <p className="text-slate-600 font-medium">Checking system setup...</p>
        </div>
      </div>
    );
  }

  if (needsSetup && !onAdminSetup) {
    return <Navigate to="/admin/setup" replace />;
  }

  if (!needsSetup && onAdminSetup) {
    return <Navigate to="/admin" replace />;
  }

  if (needsSetup && onAdminSetup) {
    return <>{children}</>;
  }

  return <AuthGate>{children}</AuthGate>;
}
