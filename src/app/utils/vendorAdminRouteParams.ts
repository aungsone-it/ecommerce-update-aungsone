import { useParams, useLocation } from "react-router";
import {
  pathnameUnderAdmin,
  parseVendorSubdomainAdminPath,
  resolveVendorSubdomainStoreSlug,
} from "./vendorSubdomainHooks";
import { useResolvedVendorHostSlug } from "./vendorHostResolution";

/**
 * Vendor subdomain (*.platform) or verified custom domain → use `/admin/*` URLs like `gogo.platform/admin/settings`.
 */
export function useVendorHostCleanAdmin(): {
  clean: boolean;
  hostSlug: string | null;
  loading: boolean;
} {
  const sub = typeof window !== "undefined" ? resolveVendorSubdomainStoreSlug() : null;
  const { slug: customSlug, loading } = useResolvedVendorHostSlug();
  if (sub) {
    return { clean: true, hostSlug: sub, loading: false };
  }
  return {
    clean: !!customSlug,
    hostSlug: customSlug,
    loading,
  };
}

/**
 * Merges React Router params with `/admin/*` parsing on vendor hosts (subdomain + custom domain).
 */
export function useVendorAdminRouteParams(): {
  storeName?: string;
  section?: string;
  productId?: string;
} {
  const params = useParams();
  const loc = useLocation();
  const sub = typeof window !== "undefined" ? resolveVendorSubdomainStoreSlug() : null;
  const { slug: customSlug } = useResolvedVendorHostSlug();
  const hostSlug = sub ?? customSlug;
  if (hostSlug && pathnameUnderAdmin(loc.pathname)) {
    const parsed = parseVendorSubdomainAdminPath(loc.pathname, hostSlug);
    if (parsed) {
      return {
        storeName: parsed.storeName,
        section: parsed.section,
        productId: parsed.productId,
      };
    }
  }
  return {
    storeName: params.storeName,
    section: params.section,
    productId: params.productId,
  };
}
