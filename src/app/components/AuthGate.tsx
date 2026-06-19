import { useAuth } from '../contexts/AuthContext';
import { Login } from './Login';
import { ChangePassword } from './ChangePassword';
import { SuperAdminPanelSkeleton } from './AdminSkeletonLoaders';

export function AuthGate({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();

  // Show loading spinner while checking authentication
  if (loading) {
    return <SuperAdminPanelSkeleton />;
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