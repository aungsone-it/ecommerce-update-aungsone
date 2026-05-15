// Root Layout Component - Public layout wrapper
import { Outlet, useLocation } from "react-router";
import { CanonicalSubdomainRedirect } from "./CanonicalSubdomainRedirect";
import { SubdomainVendorRedirect } from "./SubdomainVendorRedirect";
import {
  resolveVendorSubdomainStoreSlug,
  isAdminPortalRoute,
} from "../utils/vendorSubdomainHooks";
import { useResolvedVendorHostSlug } from "../utils/vendorHostResolution";
import { FloatingChat } from "./FloatingChat";
import { BackToTop } from "./BackToTop";
import { useEffect } from "react";
import { useAuth } from "../contexts/AuthContext";
import { useCartVisibility } from "../contexts/CartVisibilityContext";
import { CartVisibilityProvider } from "../contexts/CartVisibilityContext";
import { LoadingProvider, useLoading } from "../contexts/LoadingContext";
import { ChatNotificationProvider, useChatNotification } from "../contexts/ChatNotificationContext";
import { shouldResolveCustomDomainHost } from "../utils/vendorHostResolution";

// Public layout without authentication
export function RootLayout() {
  return (
    <LoadingProvider>
      <CartVisibilityProvider>
        <ChatNotificationProvider>
          <RootLayoutContent />
        </ChatNotificationProvider>
      </CartVisibilityProvider>
    </LoadingProvider>
  );
}

function RootLayoutContent() {
  const { user } = useAuth();
  const location = useLocation();
  const { setChatUnreadCount, forceOpenFloatingChat, resetForceOpenFloatingChat } =
    useChatNotification();
  const { isCartOpen } = useCartVisibility();
  const { isLoading, suppressFloatingChat } = useLoading();

  const subdomainStoreSlug = resolveVendorSubdomainStoreSlug();
  const { slug: customHostSlug } = useResolvedVendorHostSlug();
  const isPathVendorStorefront =
    location.pathname.startsWith("/vendor/") &&
    !location.pathname.includes("/admin");
  const isSubdomainStorefrontHome = subdomainStoreSlug != null && location.pathname === "/";
  const isCustomDomainStorefrontHome =
    customHostSlug != null && subdomainStoreSlug == null && location.pathname === "/";
  const isVendorStorefront =
    isPathVendorStorefront || isSubdomainStorefrontHome || isCustomDomainStorefrontHome;
  const vendorId =
    subdomainStoreSlug ??
    customHostSlug ??
    (isPathVendorStorefront ? location.pathname.split("/")[2] : undefined);

  // Hide chat button and back to top on vendor application page, landing page, and reset password page
  const isVendorApplicationPage = location.pathname === '/vendor/application';
  const isLandingPage =
    location.pathname === "/" && subdomainStoreSlug == null && customHostSlug == null;
  const isResetPasswordPage =
    location.pathname === '/reset-password' ||
    /^\/vendor\/[^/]+\/reset-password$/.test(location.pathname) ||
    /^\/vendor\/[^/]+\/reset-password$/.test(location.pathname);
  const isVendorLoginPage = location.pathname === '/vendor/login';
  const isAdminPortal = isAdminPortalRoute(location.pathname);

  // Warm vendor storefront chunks on vendor-like hosts to avoid first-visit blink on
  // routes like /product/:slug, /saved and /profile when code-split chunks are cold.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const host = window.location.hostname;
    const isVendorLikeHost =
      subdomainStoreSlug != null ||
      customHostSlug != null ||
      shouldResolveCustomDomainHost(host);
    if (!isVendorLikeHost) return;
    void import("../pages/VendorStorefrontPage");
  }, [subdomainStoreSlug, customHostSlug]);

  return (
    <>
      <CanonicalSubdomainRedirect />
      <SubdomainVendorRedirect />
      <Outlet />
      {/* Global Floating Chat — storefront only; hidden on all admin panels (incl. /store|vendor/.../admin) */}
      {!isCartOpen &&
        !isLoading &&
        !suppressFloatingChat &&
        !isVendorApplicationPage &&
        !isLandingPage &&
        !isResetPasswordPage &&
        !isVendorLoginPage &&
        !isAdminPortal && (
        <FloatingChat 
          customerName={user?.fullName || user?.firstName || "Guest"}
          customerEmail={user?.email || ""}
          onUnreadCountChange={setChatUnreadCount}
          forceOpen={forceOpenFloatingChat}
          onOpen={resetForceOpenFloatingChat}
          vendorId={vendorId}
          isAuthenticated={!!user}
        />
      )}
      {/* Global Back to Top - Hidden when cart is open OR when app is loading OR on vendor application page OR on landing page */}
      {/* Vendor storefront scrolls an inner div — BackToTop is rendered inside VendorStoreView */}
      {!isCartOpen &&
        !isLoading &&
        !isVendorApplicationPage &&
        !isLandingPage &&
        !isResetPasswordPage &&
        !isVendorStorefront && <BackToTop />}
    </>
  );
}