import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useParams } from "react-router";
import { projectId, publicAnonKey } from "../../../utils/supabase/info";
import { API_BASE_URL } from "../../utils/api-client";
import { resolveVendorSubdomainStoreSlug } from "../utils/vendorSubdomainHooks";
import {
  shouldResolveCustomDomainHost,
  useResolvedVendorHostSlug,
} from "../utils/vendorHostResolution";
import { displayPlatformBrandName } from "../utils/platformBranding";
import { subscribeStorefrontPolicyUpdates } from "../utils/storefrontPolicyRealtime";
import type { StorefrontPolicyKind } from "../utils/storefrontPolicyPaths";

export type StorefrontPolicyData = {
  storeName: string;
  storeEmail?: string;
  storeAddress?: string;
  content: string;
  loading: boolean;
  isVendorContext: boolean;
  storeSlug: string | null;
  backPath: string;
};

type PlatformSettings = {
  storeName?: string;
  storeEmail?: string;
  storeAddress?: string;
  termsContent?: string;
  privacyPolicyContent?: string;
};

type VendorStorefrontSettings = {
  storeName?: string;
  contactEmail?: string;
  address?: string;
  termsContent?: string;
  privacyPolicyContent?: string;
};

const DEFAULT_TERMS = `Welcome to our storefront. By browsing, creating an account, or placing an order, you agree to follow our store policies, provide accurate checkout information, and use the website only for lawful purchases.

Product availability, pricing, promotions, shipping timelines, and return rules may change from time to time. If you have questions about an order or need support, please contact the store before completing your purchase.`;

const DEFAULT_PRIVACY = `We respect your privacy and only collect the information needed to operate the storefront, process orders, provide customer support, and improve your shopping experience.

Your contact details, shipping information, and order history are handled with care. We do not sell personal information, and we only share data when required to fulfill your order, support payment or delivery services, or comply with legal obligations.`;

function defaultContent(kind: StorefrontPolicyKind): string {
  return kind === "terms" ? DEFAULT_TERMS : DEFAULT_PRIVACY;
}

function pickVendorPolicyPageContent(
  settings: VendorStorefrontSettings,
  kind: StorefrontPolicyKind
): string {
  if (kind === "terms") {
    return String(settings.termsContent || "").trim();
  }
  return String(settings.privacyPolicyContent || "").trim();
}

function pickPlatformContent(settings: PlatformSettings, kind: StorefrontPolicyKind): string {
  const saved =
    kind === "terms" ? settings.termsContent : settings.privacyPolicyContent;
  return String(saved || "").trim();
}

type PolicyCacheEntry = {
  storeName: string;
  storeEmail?: string;
  storeAddress?: string;
  content: string;
  vendorId?: string;
};

function policyCacheKey(storeSlug: string | null, kind: StorefrontPolicyKind): string {
  return `migoo-policy:${storeSlug || "platform"}:${kind}`;
}

function readPolicyCache(
  storeSlug: string | null,
  kind: StorefrontPolicyKind
): PolicyCacheEntry | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(policyCacheKey(storeSlug, kind));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as PolicyCacheEntry;
    if (!parsed || typeof parsed.content !== "string") return null;
    return parsed;
  } catch {
    return null;
  }
}

function writePolicyCache(
  storeSlug: string | null,
  kind: StorefrontPolicyKind,
  entry: PolicyCacheEntry
): void {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.setItem(policyCacheKey(storeSlug, kind), JSON.stringify(entry));
  } catch {
    /* ignore quota */
  }
}

async function fetchVendorStoreBySlug(
  slug: string,
  signal?: AbortSignal
): Promise<{ settings: VendorStorefrontSettings; vendorId?: string } | null> {
  const response = await fetch(
    `${API_BASE_URL}/vendor/store/${encodeURIComponent(slug)}`,
    {
      headers: { Authorization: `Bearer ${publicAnonKey}` },
      signal,
    }
  ).catch(() => null);
  if (!response?.ok) return null;
  const data = (await response.json().catch(() => ({}))) as {
    settings?: VendorStorefrontSettings & { vendorId?: string };
  };
  if (!data.settings) return null;
  const vendorId = String(data.settings.vendorId || "").trim() || undefined;
  return { settings: data.settings, vendorId };
}

async function fetchPlatformSettings(signal?: AbortSignal): Promise<PlatformSettings | null> {
  const response = await fetch(
    `https://${projectId}.supabase.co/functions/v1/make-server-16010b6f/settings/general`,
    {
      headers: { Authorization: `Bearer ${publicAnonKey}` },
      cache: "no-store",
      signal,
    }
  ).catch(() => null);
  if (!response?.ok) return null;
  return (await response.json().catch(() => null)) as PlatformSettings | null;
}

async function fetchPolicyCacheEntry(
  storeSlug: string | null,
  kind: StorefrontPolicyKind,
  signal?: AbortSignal
): Promise<PolicyCacheEntry | null> {
  if (storeSlug) {
    const vendorStore = await fetchVendorStoreBySlug(storeSlug, signal);
    if (signal?.aborted) return null;

    if (vendorStore?.settings) {
      const { settings, vendorId } = vendorStore;
      const vendorContent = pickVendorPolicyPageContent(settings, kind);
      let platformContent = "";

      if (!vendorContent) {
        const platform = await fetchPlatformSettings(signal);
        if (signal?.aborted) return null;
        platformContent = platform ? pickPlatformContent(platform, kind) : "";
      }

      return {
        storeName: displayPlatformBrandName(settings.storeName, storeSlug),
        storeEmail: settings.contactEmail,
        storeAddress: settings.address,
        content: vendorContent || platformContent || defaultContent(kind),
        vendorId,
      };
    }
  }

  const platform = await fetchPlatformSettings(signal);
  if (signal?.aborted) return null;

  if (!platform) return null;

  return {
    storeName: displayPlatformBrandName(platform.storeName, "SECURE"),
    storeEmail: platform.storeEmail,
    storeAddress: platform.storeAddress,
    content: pickPlatformContent(platform, kind) || defaultContent(kind),
  };
}

/** Warm session cache after storefront vendor settings load (same API response). */
export function seedStorefrontPolicyCacheFromVendorSettings(
  storeSlug: string,
  settings: VendorStorefrontSettings & { vendorId?: string }
): void {
  const slug = String(storeSlug || "").trim();
  if (!slug) return;

  const vendorId = String(settings.vendorId || "").trim() || undefined;
  const baseEntry = {
    storeName: displayPlatformBrandName(settings.storeName, slug),
    storeEmail: settings.contactEmail,
    storeAddress: settings.address,
    vendorId,
  };

  for (const kind of ["terms", "privacy"] as const) {
    if (readPolicyCache(slug, kind)) continue;
    const vendorContent = pickVendorPolicyPageContent(settings, kind);
    if (!vendorContent) continue;
    writePolicyCache(slug, kind, { ...baseEntry, content: vendorContent });
  }
}

/** Background prefetch for footer / storefront links. */
export async function prefetchStorefrontPolicyData(
  storeSlug: string | null,
  kind: StorefrontPolicyKind
): Promise<void> {
  if (readPolicyCache(storeSlug, kind)) return;
  try {
    const entry = await fetchPolicyCacheEntry(storeSlug, kind);
    if (entry) writePolicyCache(storeSlug, kind, entry);
  } catch {
    /* ignore background prefetch errors */
  }
}

function applyPolicyEntry(
  entry: PolicyCacheEntry,
  setters: {
    setStoreName: (v: string) => void;
    setStoreEmail: (v: string | undefined) => void;
    setStoreAddress: (v: string | undefined) => void;
    setContent: (v: string) => void;
    setResolvedVendorId: (v: string | null) => void;
  }
): void {
  setters.setStoreName(entry.storeName);
  setters.setStoreEmail(entry.storeEmail);
  setters.setStoreAddress(entry.storeAddress);
  setters.setContent(entry.content);
  setters.setResolvedVendorId(entry.vendorId ?? null);
}

export function useStorefrontPolicyData(kind: StorefrontPolicyKind): StorefrontPolicyData {
  const { storeName: routeStoreName } = useParams();
  const { slug: hostSlug, loading: hostSlugLoading } = useResolvedVendorHostSlug();
  const subdomainSlug = resolveVendorSubdomainStoreSlug();
  const storeSlug = useMemo(() => {
    const raw = hostSlug || subdomainSlug || routeStoreName || "";
    return String(raw).trim() || null;
  }, [hostSlug, subdomainSlug, routeStoreName]);

  const isVendorContext = storeSlug != null;
  const needsHostLookup =
    typeof window !== "undefined" &&
    !subdomainSlug &&
    !routeStoreName &&
    shouldResolveCustomDomainHost(window.location.hostname);
  const initialCache = useMemo(
    () => readPolicyCache(storeSlug, kind),
    [storeSlug, kind]
  );
  const [loading, setLoading] = useState(() => !initialCache);
  const [storeName, setStoreName] = useState(initialCache?.storeName || "");
  const [storeEmail, setStoreEmail] = useState<string | undefined>(initialCache?.storeEmail);
  const [storeAddress, setStoreAddress] = useState<string | undefined>(initialCache?.storeAddress);
  const [content, setContent] = useState(initialCache?.content || "");
  const [resolvedVendorId, setResolvedVendorId] = useState<string | null>(
    initialCache?.vendorId ?? null
  );
  const abortRef = useRef<AbortController | null>(null);

  const backPath = useMemo(() => {
    if (!storeSlug) return "/";
    if (routeStoreName) return `/vendor/${encodeURIComponent(storeSlug)}`;
    return "/";
  }, [storeSlug, routeStoreName]);

  const loadPolicyData = useCallback(
    async (opts?: { silent?: boolean }) => {
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      if (!opts?.silent) setLoading(true);

      try {
        if (needsHostLookup && hostSlugLoading) return;

        const setters = {
          setStoreName,
          setStoreEmail,
          setStoreAddress,
          setContent,
          setResolvedVendorId,
        };

        if (storeSlug) {
          const entry = await fetchPolicyCacheEntry(storeSlug, kind, controller.signal);
          if (controller.signal.aborted) return;

          if (entry) {
            applyPolicyEntry(entry, setters);
            writePolicyCache(storeSlug, kind, entry);
            return;
          }
        } else {
          setResolvedVendorId(null);
        }

        const platformEntry = await fetchPolicyCacheEntry(null, kind, controller.signal);
        if (controller.signal.aborted) return;

        if (platformEntry) {
          applyPolicyEntry(platformEntry, setters);
          writePolicyCache(null, kind, platformEntry);
        } else {
          setContent(defaultContent(kind));
        }
      } catch (error) {
        if (!controller.signal.aborted) {
          console.warn("Could not load storefront policy:", error);
          setContent((prev) => prev || defaultContent(kind));
        }
      } finally {
        if (!controller.signal.aborted) {
          setLoading(false);
        }
      }
    },
    [kind, storeSlug, hostSlugLoading, needsHostLookup]
  );

  useEffect(() => {
    void loadPolicyData({ silent: Boolean(initialCache) });
    return () => abortRef.current?.abort();
  }, [loadPolicyData, initialCache]);

  useEffect(() => {
    return subscribeStorefrontPolicyUpdates({
      vendorId: resolvedVendorId,
      includePlatform: true,
      onUpdate: () => void loadPolicyData({ silent: true }),
    });
  }, [resolvedVendorId, loadPolicyData]);

  return {
    storeName,
    storeEmail,
    storeAddress,
    content,
    loading: loading || (needsHostLookup && hostSlugLoading),
    isVendorContext,
    storeSlug,
    backPath,
  };
}
