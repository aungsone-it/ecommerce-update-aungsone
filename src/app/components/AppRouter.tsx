// App Router Component - Handles setup and auth flow
import { useState, useEffect } from 'react';
import { Navigate, useLocation } from 'react-router';
import { projectId, publicAnonKey } from '../../../utils/supabase/info';
import { AuthGate } from './AuthGate';
import { SuperAdminPanelSkeleton } from './AdminSkeletonLoaders';
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
    return <SuperAdminPanelSkeleton />;
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
