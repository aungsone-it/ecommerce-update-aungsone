// App Router Component - Handles setup and auth flow
import { useState, useEffect } from 'react';
import { projectId, publicAnonKey } from '../../../utils/supabase/info';
import { Setup } from './Setup';
import { AuthGate } from './AuthGate';
import { Loader2 } from 'lucide-react';

export function AppRouter({ children }: { children: React.ReactNode }) {
  const [checkingSetup, setCheckingSetup] = useState(true);
  const [needsSetup, setNeedsSetup] = useState(false);

  const checkIfSetupNeeded = async () => {
    try {
      const response = await fetch(
        `https://${projectId}.supabase.co/functions/v1/make-server-16010b6f/auth/check-setup`,
        {
          headers: {
            'Authorization': `Bearer ${publicAnonKey}`,
          },
        }
      );

      if (response.ok) {
        const { setupComplete } = await response.json();
        setNeedsSetup(!setupComplete);
      } else {
        // If server error, assume setup not needed (fail open)
        setNeedsSetup(false);
      }
    } catch (error) {
      console.error('Error checking setup:', error);
      // If error, assume setup not needed
      setNeedsSetup(false);
    } finally {
      setCheckingSetup(false);
    }
  };

  useEffect(() => {
    checkIfSetupNeeded();
  }, []);

  if (checkingSetup) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 to-slate-100">
        <div className="text-center space-y-4">
          <Loader2 className="w-12 h-12 animate-spin text-amber-600 mx-auto" />
          <p className="text-slate-600 font-medium">Checking system setup...</p>
        </div>
      </div>
    );
  }

  if (needsSetup) {
    return <Setup />;
  }

  return <AuthGate>{children}</AuthGate>;
}