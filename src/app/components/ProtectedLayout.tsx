import { AppRouter } from "./AppRouter";
import { Outlet } from "react-router";
import { BackToTop } from "./BackToTop";
import { useCartVisibility } from "../contexts/CartVisibilityContext";
import { CartVisibilityProvider } from "../contexts/CartVisibilityContext";

// Protected layout with authentication
export function ProtectedLayout({ children }: { children?: React.ReactNode }) {
  return (
    <CartVisibilityProvider>
      <ProtectedLayoutContent>{children}</ProtectedLayoutContent>
    </CartVisibilityProvider>
  );
}

function ProtectedLayoutContent({ children }: { children?: React.ReactNode }) {
  const { isCartOpen } = useCartVisibility();

  return (
    <AppRouter>
      {/* AdminSubdomainOrSuper passes AdminPage as children; nested routes use <Outlet /> */}
      {children ?? <Outlet />}
      {!isCartOpen && <BackToTop />}
    </AppRouter>
  );
}