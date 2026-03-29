import { useLayoutEffect, useMemo } from "react";
import { useParams, useNavigate, useLocation, matchPath } from "react-router";
import { projectId, publicAnonKey } from "../../../utils/supabase/info";
import { getVendorSubdomainBase } from "../utils/vendorSubdomainBase";
import { resolveVendorSubdomainStoreSlug } from "../utils/vendorSubdomainHooks";
import { AuthProvider } from "../contexts/AuthContext";
import { CartProvider } from "../components/CartContext";
import { VendorStoreView } from "../components/VendorStoreView";
import { Store, ArrowLeft } from "lucide-react";
import { Button } from "../components/ui/button";

function vendorProfileSegmentFromPathname(
  pathname: string,
  storeName: string
): string | null {
  const patterns = [
    "/store/:storeName/profile/:profileSection",
    "/vendor/:storeName/profile/:profileSection",
    "/store/:storeName/profile",
    "/vendor/:storeName/profile",
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

export function VendorStorefrontPage() {
  const params = useParams();
  const subdomainSlug = resolveVendorSubdomainStoreSlug();
  const storeName = params.storeName ?? subdomainSlug ?? undefined;
  const productSlug = params.productSlug;
  const location = useLocation();
  const navigate = useNavigate();

  const profileSegment = useMemo(() => {
    if (!storeName) return null;
    return vendorProfileSegmentFromPathname(location.pathname, storeName);
  }, [storeName, location.pathname]);

  const savedPage = useMemo(() => {
    if (!storeName) return false;
    return (
      matchPath({ path: "/store/:storeName/saved", end: true }, location.pathname) != null ||
      matchPath({ path: "/vendor/:storeName/saved", end: true }, location.pathname) != null
    );
  }, [storeName, location.pathname]);

  /** Old bookmarks like migooonlinestore.walwal.online → current slug migoo.walwal.online (from storefront settings). */
  useLayoutEffect(() => {
    const subSlug = subdomainSlug;
    if (!subSlug) return;
    const apex = getVendorSubdomainBase();
    if (!apex) return;

    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch(
          `https://${projectId}.supabase.co/functions/v1/make-server-16010b6f/vendors/by-slug/${encodeURIComponent(subSlug)}`,
          { headers: { Authorization: `Bearer ${publicAnonKey}` } }
        );
        if (cancelled || !res.ok) return;
        const data = (await res.json()) as { vendor?: { storeSlug?: string } };
        const raw = data.vendor?.storeSlug;
        if (typeof raw !== "string" || !raw.trim()) return;
        const canonical = raw.trim().toLowerCase();
        if (!canonical || canonical === subSlug.toLowerCase()) return;
        const nextHost = `${canonical}.${apex}`;
        if (window.location.hostname.toLowerCase() === nextHost) return;
        const dest = new URL(window.location.href);
        dest.hostname = nextHost;
        window.location.replace(dest.toString());
      } catch {
        /* non-fatal */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [subdomainSlug]);

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
    // Always navigate back to the vendor's admin dashboard
    const vendorAdminPath = `/store/${storeName}/admin`;
    console.log('Back button clicked - navigating to:', vendorAdminPath);
    navigate(vendorAdminPath);
  };

  return (
    <AuthProvider>
      <CartProvider>
        <VendorStoreView 
          vendorId={storeName}
          storeSlug={storeName}
          onBack={handleBack}
          initialProductSlug={productSlug}
          profileSegment={profileSegment}
          savedPage={savedPage}
        />
      </CartProvider>
    </AuthProvider>
  );
}