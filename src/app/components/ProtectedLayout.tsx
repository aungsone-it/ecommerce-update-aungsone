import { AppRouter } from "./AppRouter";
import { Outlet } from "react-router";
import { useAuth } from "../contexts/AuthContext";
import { BackToTop } from "./BackToTop";
import { useCartVisibility } from "../contexts/CartVisibilityContext";
import { CartVisibilityProvider } from "../contexts/CartVisibilityContext";

// Protected layout with authentication
export function ProtectedLayout() {
  return (
    <CartVisibilityProvider>
      <ProtectedLayoutContent />
    </CartVisibilityProvider>
  );
}

function ProtectedLayoutContent() {
  const { user } = useAuth();
  const { isCartOpen } = useCartVisibility();

  return (
    <AppRouter>
      <Outlet />
      {/* FloatingChat removed - only for storefront, not admin panel */}
      {/* Global Back to Top - Hidden when cart is open */}
      {!isCartOpen && <BackToTop />}
    </AppRouter>
  );
}