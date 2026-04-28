import { useMemo } from "react";
import { useParams, useNavigate, useLocation, matchPath } from "react-router";
import { resolveVendorSubdomainStoreSlug } from "../utils/vendorSubdomainHooks";
import { useResolvedVendorHostSlug } from "../utils/vendorHostResolution";
import { AuthProvider } from "../contexts/AuthContext";
import { CartProvider } from "../components/CartContext";
import { VendorStoreView } from "../components/VendorStoreView";
import { VendorStorefrontFullSkeleton } from "../components/SkeletonLoaders";
import { Store, ArrowLeft } from "lucide-react";
import { Button } from "../components/ui/button";

function vendorProfileOrderIdFromPathname(pathname: string, storeName: string): string | null {
  const mRoot = matchPath({ path: "/profile/orders/:orderId", end: true }, pathname);
  if (mRoot?.params?.orderId) {
    const id = mRoot.params.orderId;
    return typeof id === "string" && id.trim() ? decodeURIComponent(id) : null;
  }
  const m =
    matchPath({ path: "/store/:storeName/profile/orders/:orderId", end: true }, pathname) ??
    matchPath({ path: "/vendor/:storeName/profile/orders/:orderId", end: true }, pathname) ??
    matchPath({ path: "/vendor-:storeName/profile/orders/:orderId", end: true }, pathname);
  if (m?.params?.storeName !== storeName) return null;
  const id = m.params.orderId;
  return typeof id === "string" && id.trim() ? decodeURIComponent(id) : null;
}

function vendorProfileSegmentFromPathname(
  pathname: string,
  storeName: string
): string | null {
  if (matchPath({ path: "/profile/orders/:orderId", end: true }, pathname)) return "orders";
  const rootPatterns = [
    ["/profile/edit", "edit"],
    ["/profile/orders", "orders"],
    ["/profile/addresses", "addresses"],
    ["/profile/security", "security"],
    ["/profile", "view"],
  ] as const;
  for (const [path, seg] of rootPatterns) {
    if (matchPath({ path, end: true }, pathname)) return seg;
  }
  const patterns = [
    "/store/:storeName/profile/:profileSection",
    "/vendor/:storeName/profile/:profileSection",
    "/vendor-:storeName/profile/:profileSection",
    "/store/:storeName/profile",
    "/vendor/:storeName/profile",
    "/vendor-:storeName/profile",
  ] as const;
  for (const path of patterns) {
    const m = matchPath({ path, end: true }, pathname);
    if (m?.params?.storeName === storeName) {
      const section = m.params.profileSection;
      return typeof section === "string" ? section : "view";
    }
  }
  return null;
}

function vendorCategorySlugFromPathname(pathname: string, storeName: string): string | null {
  const direct =
    matchPath({ path: "/store/:storeName/:categorySlug", end: true }, pathname) ??
    matchPath({ path: "/vendor/:storeName/:categorySlug", end: true }, pathname) ??
    matchPath({ path: "/vendor-:storeName/:categorySlug", end: true }, pathname);
  if (direct?.params?.storeName === storeName) {
    const seg = direct.params.categorySlug;
    return typeof seg === "string" && seg.trim() ? decodeURIComponent(seg) : null;
  }

  const root =
    matchPath({ path: "/:categorySlug", end: true }, pathname) ??
    matchPath({ path: "/:categorySlug/", end: true }, pathname);
  const seg = root?.params?.categorySlug;
  if (!seg) return null;
  const normalized = decodeURIComponent(seg).trim().toLowerCase();
  if (!normalized) return null;
  if (["product", "profile", "saved", "admin", "store", "vendor", "blog", "setup", "checkout", "order-confirmation"].includes(normalized)) {
    return null;
  }
  return decodeURIComponent(seg);
}

export function VendorStorefrontPage() {
  const params = useParams();
  const subdomainSlug = resolveVendorSubdomainStoreSlug();
  const { slug: customHostSlug, loading: customHostLoading } = useResolvedVendorHostSlug();
  const storeName = params.storeName ?? subdomainSlug ?? customHostSlug ?? undefined;
  const productSlug =
    (typeof params.productSlug === "string" && params.productSlug) ||
    (typeof (params as { sku?: string }).sku === "string" && (params as { sku?: string }).sku) ||
    undefined;
  const location = useLocation();
  const navigate = useNavigate();

  const profileOrderId = useMemo(() => {
    if (!storeName) return null;
    return vendorProfileOrderIdFromPathname(location.pathname, storeName);
  }, [storeName, location.pathname]);

  const profileSegment = useMemo(() => {
    if (!storeName) return null;
    if (profileOrderId) return "orders";
    return vendorProfileSegmentFromPathname(location.pathname, storeName);
  }, [storeName, location.pathname, profileOrderId]);

  const savedPage = useMemo(() => {
    if (!storeName) return false;
    if ((subdomainSlug || customHostSlug) && location.pathname === "/saved") return true;
    return (
      matchPath({ path: "/store/:storeName/saved", end: true }, location.pathname) != null ||
      matchPath({ path: "/vendor/:storeName/saved", end: true }, location.pathname) != null ||
      matchPath({ path: "/vendor-:storeName/saved", end: true }, location.pathname) != null
    );
  }, [storeName, location.pathname, subdomainSlug, customHostSlug]);

  const categorySlug = useMemo(() => {
    if (!storeName) return null;
    return vendorCategorySlugFromPathname(location.pathname, storeName);
  }, [storeName, location.pathname]);

  if (customHostLoading && !params.storeName && !subdomainSlug) {
    return <VendorStorefrontFullSkeleton />;
  }

  if (!storeName) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 to-slate-100">
        <div className="text-center space-y-6 p-8">
          <div className="w-20 h-20 bg-slate-200 rounded-full flex items-center justify-center mx-auto">
            <Store className="w-10 h-10 text-slate-400" />
          </div>
          <div className="space-y-2">
            <h1 className="text-2xl font-bold text-slate-900">Vendor Store Not Found</h1>
            <p className="text-slate-600">The vendor store you're looking for doesn't exist or has been removed.</p>
          </div>
          <Button 
            onClick={() => navigate('/store')}
            className="bg-slate-900 hover:bg-slate-800"
          >
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back to Home
          </Button>
        </div>
      </div>
    );
  }

  const handleBack = () => {
    const vendorAdminPath =
      subdomainSlug || customHostSlug ? "/admin" : `/store/${storeName}/admin`;
    console.log("Back button clicked - navigating to:", vendorAdminPath);
    navigate(vendorAdminPath);
  };

  return (
    <AuthProvider>
      <CartProvider>
        <VendorStoreView
          vendorId={storeName}
          storeSlug={storeName}
          hostRootStorePaths={!!(subdomainSlug || customHostSlug)}
          onBack={handleBack}
          initialProductSlug={productSlug}
          profileSegment={profileSegment}
          profileOrderId={profileOrderId}
          savedPage={savedPage}
          categorySlug={categorySlug}
        />
      </CartProvider>
    </AuthProvider>
  );
}