import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useParams, useNavigate, useLocation, matchPath } from "react-router";
import {
  resolveVendorSubdomainStoreSlug,
  getVendorSubdomainMarketplaceHomeUrl,
  isOnVendorSubdomainHost,
} from "../utils/vendorSubdomainHooks";
import { publicAnonKey } from "../../../utils/supabase/info";
import { API_BASE_URL } from "../../utils/api-client";
import {
  shouldPreserveVendorStorefrontFaviconOnUnload,
  useResolvedVendorHostSlug,
} from "../utils/vendorHostResolution";
import { resetDocumentFavicon, applyVendorStoreLogoFavicon } from "../utils/documentFavicon";
import { resolveVendorPathSlug, vendorPathStoreSlugsMatch } from "../utils/vendorStorePaths";
import {
  buildVendorStorefrontDocumentTitle,
  vendorProfileSegmentToDocTitleMode,
} from "../utils/vendorStorefrontDocumentTitle";
import { AuthProvider } from "../contexts/AuthContext";
import { CartProvider } from "../components/CartContext";
import { VendorStoreView } from "../components/VendorStoreView";
import { VendorStorefrontFullSkeleton } from "../components/SkeletonLoaders";
import { Store, ArrowLeft } from "lucide-react";
import { Button } from "../components/ui/button";
import { seedStorefrontPolicyCacheFromVendorSettings } from "../hooks/useStorefrontPolicyData";

function parseVendorDashPath(pathname: string): { storeName: string; tail: string[] } | null {
  const parts = pathname.split("/").filter(Boolean);
  const first = parts[0] || "";
  if (!first.startsWith("vendor-")) return null;
  const storeName = first.slice("vendor-".length).trim();
  if (!storeName) return null;
  return { storeName: decodeURIComponent(storeName), tail: parts.slice(1) };
}

function vendorProfileOrderIdFromPathname(pathname: string, storeName: string): string | null {
  const vendorDash = parseVendorDashPath(pathname);
  if (vendorDash?.storeName === storeName && vendorDash.tail[0] === "profile" && vendorDash.tail[1] === "orders") {
    const id = vendorDash.tail[2] || "";
    return id ? decodeURIComponent(id) : null;
  }
  const mRoot = matchPath({ path: "/profile/orders/:orderId", end: true }, pathname);
  if (mRoot?.params?.orderId) {
    const id = mRoot.params.orderId;
    return typeof id === "string" && id.trim() ? decodeURIComponent(id) : null;
  }
  const m =
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
  const vendorDash = parseVendorDashPath(pathname);
  if (vendorDash?.storeName === storeName && vendorDash.tail[0] === "profile") {
    const seg = vendorDash.tail[1];
    if (!seg) return "view";
    if (seg === "edit" || seg === "orders" || seg === "addresses" || seg === "security") return seg;
  }
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
    "/vendor/:storeName/profile/:profileSection",
    "/vendor-:storeName/profile/:profileSection",
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

const RESERVED_VENDOR_PATH_SEGMENTS = new Set([
  "product",
  "profile",
  "saved",
  "admin",
  "store",
  "vendor",
  "blog",
  "setup",
  "checkout",
  "order-confirmation",
  "summary",
]);

function isReservedVendorPathSegment(seg: string): boolean {
  return RESERVED_VENDOR_PATH_SEGMENTS.has(seg.trim().toLowerCase());
}

function vendorCategorySlugFromPathname(pathname: string, storeName: string): string | null {
  const vendorDash = parseVendorDashPath(pathname);
  if (vendorDash && vendorPathStoreSlugsMatch(vendorDash.storeName, storeName)) {
    const seg = vendorDash.tail[0] || "";
    const normalized = seg.trim().toLowerCase();
    if (normalized && !isReservedVendorPathSegment(normalized)) {
      return decodeURIComponent(seg);
    }
  }
  const direct =
    matchPath({ path: "/vendor/:storeName/:categorySlug", end: true }, pathname) ??
    matchPath({ path: "/vendor-:storeName/:categorySlug", end: true }, pathname);
  if (direct && vendorPathStoreSlugsMatch(String(direct.params.storeName || ""), storeName)) {
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
  if (isReservedVendorPathSegment(normalized)) return null;
  return decodeURIComponent(seg);
}

const VENDOR_SLUG_VERIFIED_PREFIX = "migoo-vendor-slug-verified:";

function readVendorSlugVerified(slug: string): boolean {
  if (!slug.trim()) return false;
  try {
    return sessionStorage.getItem(VENDOR_SLUG_VERIFIED_PREFIX + slug.trim()) === "1";
  } catch {
    return false;
  }
}

function writeVendorSlugVerified(slug: string): void {
  const s = slug.trim();
  if (!s) return;
  try {
    sessionStorage.setItem(VENDOR_SLUG_VERIFIED_PREFIX + s, "1");
  } catch {
    /* ignore */
  }
}

function readCachedVendorLogoBySlug(slug: string | undefined): string {
  if (typeof window === "undefined") return "";
  const keySlug = String(slug || "").trim().toLowerCase();
  if (!keySlug) return "";
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (!key) continue;
      const raw = localStorage.getItem(key);
      if (!raw || (raw[0] !== "{" && raw[0] !== "[")) continue;
      let parsed: any;
      try {
        parsed = JSON.parse(raw);
      } catch {
        continue;
      }
      const candidates = Array.isArray(parsed) ? parsed : [parsed];
      for (const c of candidates) {
        if (!c || typeof c !== "object") continue;
        const cSlug = String(c.storeSlug || c.slug || "").trim().toLowerCase();
        if (cSlug !== keySlug) continue;
        const logo = typeof c.logo === "string" ? c.logo : typeof c.storeLogo === "string" ? c.storeLogo : "";
        if (logo.trim()) return logo.trim();
      }
    }
  } catch {
    return "";
  }
  return "";
}

function VendorStoreNotFoundPanel({ onBackHome }: { onBackHome: () => void }) {
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
        <Button onClick={onBackHome} className="bg-slate-900 hover:bg-slate-800">
          <ArrowLeft className="w-4 h-4 mr-2" />
          Back to Home
        </Button>
      </div>
    </div>
  );
}

export function VendorStorefrontPage() {
  const params = useParams();
  const location = useLocation();
  const vendorDash = parseVendorDashPath(location.pathname);
  const subdomainSlug = resolveVendorSubdomainStoreSlug();
  const onVendorSubdomainHost = isOnVendorSubdomainHost();
  const { slug: customHostSlug, loading: customHostLoading } = useResolvedVendorHostSlug();
  const vendorHostSlug = subdomainSlug ?? customHostSlug ?? null;
  const pathBasedStoreName = params.storeName ?? vendorDash?.storeName ?? undefined;
  const storeName = pathBasedStoreName ?? vendorHostSlug ?? undefined;
  const slugToVerify = storeName ? resolveVendorPathSlug(storeName) : "";

  const [vendorExistence, setVendorExistence] = useState<"idle" | "checking" | "found" | "not_found">(() =>
    slugToVerify && readVendorSlugVerified(slugToVerify) ? "found" : slugToVerify ? "checking" : "idle"
  );
  const [canonicalStoreSlug, setCanonicalStoreSlug] = useState<string | null>(null);

  useLayoutEffect(() => {
    if (!slugToVerify) {
      setVendorExistence("idle");
      setCanonicalStoreSlug(null);
      return;
    }

    let cancelled = false;
    const alreadyVerified = readVendorSlugVerified(slugToVerify);
    if (!alreadyVerified) {
      setVendorExistence("checking");
    }
    void (async () => {
      try {
        const res = await fetch(
          `${API_BASE_URL}/vendor/store/${encodeURIComponent(slugToVerify)}`,
          { headers: { Authorization: `Bearer ${publicAnonKey}` } }
        );
        if (cancelled) return;
        const data = (await res.json().catch(() => ({}))) as {
          settings?: {
            storeSlug?: string;
            vendorId?: string;
            storeName?: string;
            contactEmail?: string;
            address?: string;
            termsContent?: string;
            privacyPolicyContent?: string;
          };
          storeUnavailable?: boolean;
        };
        const settings = data?.settings;
        const hasVendor =
          res.ok &&
          settings != null &&
          typeof settings === "object" &&
          Boolean(settings.vendorId || settings.storeSlug);
        if (!hasVendor) {
          setVendorExistence("not_found");
          setCanonicalStoreSlug(null);
          return;
        }
        const slug =
          typeof settings.storeSlug === "string" && settings.storeSlug.trim()
            ? settings.storeSlug.trim()
            : slugToVerify;
        seedStorefrontPolicyCacheFromVendorSettings(slug, settings);
        setCanonicalStoreSlug(slug);
        writeVendorSlugVerified(slugToVerify);
        setVendorExistence("found");
      } catch {
        if (!cancelled) {
          setVendorExistence("not_found");
          setCanonicalStoreSlug(null);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [slugToVerify]);

  const resolvedStoreName =
    vendorExistence === "found" && canonicalStoreSlug ? canonicalStoreSlug : storeName;
  const instantFavicon = useMemo(() => readCachedVendorLogoBySlug(resolvedStoreName), [resolvedStoreName]);
  const productSlug =
    (typeof params.productSlug === "string" && params.productSlug) ||
    (typeof (params as { sku?: string }).sku === "string" && (params as { sku?: string }).sku) ||
    (vendorDash?.tail[0] === "product" && typeof vendorDash.tail[1] === "string" ? vendorDash.tail[1] : undefined) ||
    undefined;
  const navigate = useNavigate();

  const profileOrderId = useMemo(() => {
    if (!resolvedStoreName) return null;
    return vendorProfileOrderIdFromPathname(location.pathname, resolvedStoreName);
  }, [resolvedStoreName, location.pathname]);

  const profileSegment = useMemo(() => {
    if (!resolvedStoreName) return null;
    if (profileOrderId) return "orders";
    return vendorProfileSegmentFromPathname(location.pathname, resolvedStoreName);
  }, [resolvedStoreName, location.pathname, profileOrderId]);

  const savedPage = useMemo(() => {
    if (!resolvedStoreName) return false;
    if (vendorDash?.storeName === resolvedStoreName && vendorDash.tail[0] === "saved") return true;
    if ((subdomainSlug || customHostSlug) && location.pathname === "/saved") return true;
    return (
      matchPath({ path: "/vendor/:storeName/saved", end: true }, location.pathname) != null ||
      matchPath({ path: "/vendor-:storeName/saved", end: true }, location.pathname) != null
    );
  }, [resolvedStoreName, location.pathname, subdomainSlug, customHostSlug, vendorDash]);

  const categorySlug = useMemo(() => {
    if (!resolvedStoreName) return null;
    const fromParams =
      typeof params.categorySlug === "string" && params.categorySlug.trim()
        ? decodeURIComponent(params.categorySlug.trim())
        : null;
    if (fromParams && !isReservedVendorPathSegment(fromParams)) {
      return fromParams;
    }
    return vendorCategorySlugFromPathname(location.pathname, resolvedStoreName);
  }, [resolvedStoreName, location.pathname, params.categorySlug]);

  const hostRootStorePathsNav = !!(subdomainSlug || customHostSlug);

  const storeBaseNav = useMemo(() => {
    if (hostRootStorePathsNav || !resolvedStoreName) return "";
    const enc = encodeURIComponent(resolveVendorPathSlug(resolvedStoreName));
    if (location.pathname.startsWith("/vendor-")) return `/vendor-${enc}`;
    return `/vendor/${enc}`;
  }, [hostRootStorePathsNav, resolvedStoreName, location.pathname]);

  const vendorDocTitleMode = useMemo(() => {
    if (!resolvedStoreName) return "storefront" as const;
    const seg = profileOrderId ? "orders" : profileSegment ?? null;
    return vendorProfileSegmentToDocTitleMode(seg);
  }, [resolvedStoreName, profileSegment, profileOrderId]);

  const vendorTabIconSeqRef = useRef(0);

  useLayoutEffect(() => {
    if (!resolvedStoreName) {
      document.title = "Vendor Store";
      resetDocumentFavicon();
      return;
    }
    document.title = buildVendorStorefrontDocumentTitle({
      vendorSlug: resolvedStoreName,
      pathname: location.pathname,
      storeBase: storeBaseNav,
      savedPage,
      vendorViewMode: vendorDocTitleMode,
      profileOrderId,
      categorySegment: categorySlug ?? null,
    });

    if (instantFavicon) {
      const seq = ++vendorTabIconSeqRef.current;
      void applyVendorStoreLogoFavicon(instantFavicon).then(() => {
        if (vendorTabIconSeqRef.current !== seq) return;
      });
    }
  }, [
    resolvedStoreName,
    location.pathname,
    storeBaseNav,
    savedPage,
    vendorDocTitleMode,
    profileOrderId,
    categorySlug,
    instantFavicon,
  ]);

  useEffect(() => {
    return () => {
      if (typeof window === "undefined") return;
      if (shouldPreserveVendorStorefrontFaviconOnUnload(window.location.pathname)) return;
      resetDocumentFavicon();
    };
  }, []);

  if (customHostLoading && !params.storeName && !onVendorSubdomainHost) {
    return <VendorStorefrontFullSkeleton />;
  }

  const backToMarketplaceHome = () => {
    const target = getVendorSubdomainMarketplaceHomeUrl();
    if (target.startsWith("http")) {
      window.location.assign(target);
      return;
    }
    navigate(target);
  };

  let storefrontGate: ReactNode = null;
  if (!resolvedStoreName) {
    storefrontGate = <VendorStoreNotFoundPanel onBackHome={backToMarketplaceHome} />;
  } else if (slugToVerify && vendorExistence !== "found") {
    storefrontGate =
      vendorExistence === "not_found" ? (
        <VendorStoreNotFoundPanel onBackHome={backToMarketplaceHome} />
      ) : (
        <VendorStorefrontFullSkeleton />
      );
  }
  if (storefrontGate) return storefrontGate;

  const handleBack = () => {
    const vendorAdminPath =
      subdomainSlug || customHostSlug ? "/admin" : `/vendor/${resolvedStoreName}/admin`;
    navigate(vendorAdminPath);
  };

  const pathStoreSlug = pathBasedStoreName
    ? resolveVendorPathSlug(pathBasedStoreName)
    : undefined;

  return (
    <AuthProvider>
      <CartProvider>
        <VendorStoreView
          vendorId={resolvedStoreName}
          storeSlug={pathStoreSlug ?? resolvedStoreName}
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