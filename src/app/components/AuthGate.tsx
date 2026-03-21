import { useAuth } from '../contexts/AuthContext';
import { Login } from './Login';
import { ChangePassword } from './ChangePassword';
import { Loader2 } from 'lucide-react';

export function AuthGate({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();

  // Show loading spinner while checking authentication
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 to-slate-100">
        <div className="text-center space-y-4">
          <Loader2 className="w-12 h-12 animate-spin text-amber-600 mx-auto" />
          <p className="text-slate-600 font-medium">Verifying authentication...</p>
        </div>
      </div>
    );
  }

  // No user logged in - show login page
  if (!user) {
    return <Login />;
  }

  // User needs to change temp password
  if (user.tempPassword) {
    return <ChangePassword />;
  }

  // User is authenticated - show app
  return <>{children}</>;
}