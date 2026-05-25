export type StorefrontPolicyKind = "terms" | "privacy";

const POLICY_SEGMENTS: Record<StorefrontPolicyKind, string[]> = {
  terms: ["terms", "terms-of-service"],
  privacy: ["privacy", "privacy-policy"],
};

/** Primary public path for a policy page (same on apex, subdomain, and custom domain). */
export function storefrontPolicyPath(kind: StorefrontPolicyKind): string {
  return `/${POLICY_SEGMENTS[kind][0]}`;
}

/**
 * Policy URLs for the current browsing context.
 * - Vendor subdomain / custom domain → `/terms`, `/privacy`
 * - Marketplace path with slug → `/vendor/:slug/terms`
 * - Platform apex → `/terms`, `/privacy`
 */
export function resolveStorefrontPolicyPaths(input: {
  storeSlug?: string | null;
  onVendorHost: boolean;
}): { termsPath: string; privacyPath: string } {
  if (input.onVendorHost) {
    return {
      termsPath: storefrontPolicyPath("terms"),
      privacyPath: storefrontPolicyPath("privacy"),
    };
  }
  const slug = String(input.storeSlug || "").trim();
  if (slug) {
    return {
      termsPath: marketplaceVendorPolicyPath(slug, "terms"),
      privacyPath: marketplaceVendorPolicyPath(slug, "privacy"),
    };
  }
  return {
    termsPath: storefrontPolicyPath("terms"),
    privacyPath: storefrontPolicyPath("privacy"),
  };
}

export function isStorefrontPolicyPath(pathname: string): boolean {
  const seg = pathname.replace(/^\/+|\/+$/g, "").split("/")[0]?.toLowerCase() || "";
  return (
    POLICY_SEGMENTS.terms.includes(seg) ||
    POLICY_SEGMENTS.privacy.includes(seg)
  );
}

/** Marketplace path when browsing via `/vendor/:storeName/...` on localhost or apex. */
export function marketplaceVendorPolicyPath(
  storeSlug: string,
  kind: StorefrontPolicyKind
): string {
  const slug = encodeURIComponent(storeSlug.trim());
  return `/vendor/${slug}/${POLICY_SEGMENTS[kind][0]}`;
}
