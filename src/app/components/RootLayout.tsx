// Root Layout Component - Public layout wrapper
import { Outlet, useLocation } from "react-router";
import { CanonicalSubdomainRedirect } from "./CanonicalSubdomainRedirect";
import { SubdomainVendorRedirect } from "./SubdomainVendorRedirect";
import {
  resolveVendorSubdomainStoreSlug,
  isAdminPortalRoute,
} from "../utils/vendorSubdomainHooks";
import { useResolvedVendorHostSlug } from "../utils/vendorHostResolution";
import { lazy, Suspense, useEffect } from "react";
import { BackToTop } from "./BackToTop";
import { useAuth } from "../contexts/AuthContext";
import { useCartVisibility } from "../contexts/CartVisibilityContext";
import { CartVisibilityProvider } from "../contexts/CartVisibilityContext";
import { LoadingProvider, useLoading } from "../contexts/LoadingContext";
import { ChatNotificationProvider, useChatNotification } from "../contexts/ChatNotificationContext";
import { shouldResolveCustomDomainHost } from "../utils/vendorHostResolution";
import { PlatformBrandingHead } from "./PlatformBrandingHead";
import { parseStorefrontPolicyRoute } from "../utils/storefrontPolicyPaths";
import { prefetchStorefrontPolicyData } from "../hooks/useStorefrontPolicyData";
import { StorefrontPolicyLiveBridge } from "./StorefrontPolicyLiveBridge";
import { isVendorStorefrontProductDetailPath } from "../utils/vendorStorefrontLayout";

const FloatingChat = lazy(() => import("./FloatingChat").then((m) => ({ default: m.FloatingChat })));

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
  const { setChatUnreadCount, forceOpenFloatingChat, resetForceOpenFloatingChat, floatingChatOpen } =
    useChatNotification();
  const { isCartOpen } = useCartVisibility();
  const { isLoading, suppressFloatingChat } = useLoading();

  const subdomainStoreSlug = resolveVendorSubdomainStoreSlug();
  const { slug: customHostSlug } = useResolvedVendorHostSlug();
  const customDomainHost =
    typeof window !== "undefined" && shouldResolveCustomDomainHost(window.location.hostname);
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

  // Hide chat button on vendor application, reset password, vendor login, and admin panels
  const isVendorApplicationPage = location.pathname === '/vendor/application';
  const isLandingPage =
    location.pathname === "/" &&
    subdomainStoreSlug == null &&
    customHostSlug == null &&
    !customDomainHost;
  const isResetPasswordPage =
    location.pathname === '/reset-password' ||
    /^\/vendor\/[^/]+\/reset-password$/.test(location.pathname) ||
    /^\/vendor\/[^/]+\/reset-password$/.test(location.pathname);
  const isVendorLoginPage = location.pathname === '/vendor/login';
  const isAdminPortal = isAdminPortalRoute(location.pathname);
  const isVendorProductDetailPage = isVendorStorefrontProductDetailPath(location.pathname);

  // Start Terms / Privacy fetch as soon as the route matches (before page mount).
  useEffect(() => {
    const { kind, routeStoreSlug, usesHostSlug } = parseStorefrontPolicyRoute(location.pathname);
    if (!kind) return;
    const storeSlug = usesHostSlug
      ? subdomainStoreSlug || customHostSlug || null
      : routeStoreSlug;
    if (!storeSlug && usesHostSlug) return;
    void prefetchStorefrontPolicyData(storeSlug, kind);
  }, [location.pathname, subdomainStoreSlug, customHostSlug]);

  return (
    <>
      <PlatformBrandingHead />
      <StorefrontPolicyLiveBridge />
      <CanonicalSubdomainRedirect />
      <SubdomainVendorRedirect />
      <Outlet />
      {/* Global Floating Chat — storefront only; hidden on all admin panels (incl. /store|vendor/.../admin) */}
      {!isCartOpen &&
        !isLoading &&
        !suppressFloatingChat &&
        !isVendorApplicationPage &&
        !isResetPasswordPage &&
        !isVendorLoginPage &&
        !isAdminPortal && (
        <Suspense fallback={null}>
          <FloatingChat
            customerName={user?.fullName || user?.firstName || "Guest"}
            customerEmail={user?.email || ""}
            onUnreadCountChange={setChatUnreadCount}
            forceOpen={forceOpenFloatingChat}
            onOpen={resetForceOpenFloatingChat}
            vendorId={vendorId}
            isAuthenticated={!!user}
            aboveStickyPurchaseBar={isVendorProductDetailPage}
            reserveBackToTopStack={!isLandingPage}
          />
        </Suspense>
      )}
      {/* Global Back to Top - Hidden when cart is open OR when app is loading OR on vendor application page OR on landing page */}
      {/* Vendor storefront scrolls an inner div — BackToTop is rendered inside VendorStoreView */}
      {!isCartOpen &&
        !isLoading &&
        !isVendorApplicationPage &&
        !isLandingPage &&
        !isResetPasswordPage &&
        !isVendorStorefront &&
        !floatingChatOpen && <BackToTop />}
    </>
  );
}