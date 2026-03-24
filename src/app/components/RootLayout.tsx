// Root Layout Component - Public layout wrapper
import { Outlet, useLocation } from "react-router";
import { SubdomainVendorRedirect } from "./SubdomainVendorRedirect";
import { FloatingChat } from "./FloatingChat";
import { BackToTop } from "./BackToTop";
import { useState } from "react";
import { useAuth } from "../contexts/AuthContext";
import { useCartVisibility } from "../contexts/CartVisibilityContext";
import { CartVisibilityProvider } from "../contexts/CartVisibilityContext";
import { LoadingProvider, useLoading } from "../contexts/LoadingContext";

// Public layout without authentication
export function RootLayout() {
  return (
    <LoadingProvider>
      <CartVisibilityProvider>
        <RootLayoutContent />
      </CartVisibilityProvider>
    </LoadingProvider>
  );
}

function RootLayoutContent() {
  const { user } = useAuth();
  const location = useLocation();
  const [chatUnreadCount, setChatUnreadCount] = useState(0);
  const [showFloatingChat, setShowFloatingChat] = useState(false);
  const { isCartOpen } = useCartVisibility();
  const { isLoading } = useLoading();

  // Extract vendor ID from URL if on vendor storefront - support both /store/ and /vendor/ paths
  const isVendorStorefront = (location.pathname.startsWith('/store/') || location.pathname.startsWith('/vendor/')) && !location.pathname.includes('/admin');
  const vendorId = isVendorStorefront ? location.pathname.split('/')[2] : undefined;

  // Hide chat button and back to top on vendor application page, landing page, and reset password page
  const isVendorApplicationPage = location.pathname === '/vendor/application';
  const isLandingPage = location.pathname === '/';
  const isResetPasswordPage = location.pathname === '/store/reset-password';

  return (
    <>
      <SubdomainVendorRedirect />
      <Outlet />
      {/* Global Floating Chat - Hidden when cart is open OR when app is loading OR on vendor application page OR on landing page */}
      {!isCartOpen && !isLoading && !isVendorApplicationPage && !isLandingPage && !isResetPasswordPage && (
        <FloatingChat 
          customerName={user?.fullName || user?.firstName || "Guest"}
          customerEmail={user?.email || ""}
          onUnreadCountChange={(count) => setChatUnreadCount(count)}
          forceOpen={showFloatingChat}
          onOpen={() => setShowFloatingChat(false)}
          vendorId={vendorId}
          isAuthenticated={!!user}
        />
      )}
      {/* Global Back to Top - Hidden when cart is open OR when app is loading OR on vendor application page OR on landing page */}
      {!isCartOpen && !isLoading && !isVendorApplicationPage && !isLandingPage && !isResetPasswordPage && <BackToTop />}
    </>
  );
}