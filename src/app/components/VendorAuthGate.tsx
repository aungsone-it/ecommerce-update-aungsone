import { useVendorAuth } from '../contexts/VendorAuthContext';
import { VendorLogin } from './VendorLogin';
import { useParams } from 'react-router';
import { Loader2 } from 'lucide-react';

export function VendorAuthGate({ children }: { children: React.ReactNode }) {
  const { vendor, loading } = useVendorAuth();
  const { storeName } = useParams();

  // Show loading spinner while checking vendor authentication
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 to-slate-100">
        <div className="text-center space-y-4">
          <Loader2 className="w-12 h-12 animate-spin text-purple-600 mx-auto" />
          <p className="text-slate-600 font-medium">Verifying vendor authentication...</p>
        </div>
      </div>
    );
  }

  // No vendor logged in - show login page
  if (!vendor) {
    return <VendorLogin storeName={storeName} />;
  }

  // Vendor is authenticated - show app
  return <>{children}</>;
}