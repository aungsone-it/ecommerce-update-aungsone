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

async function resolveVendorIdFromSlug(slug: string, signal?: AbortSignal): Promise<string | null> {
  const response = await fetch(
    `${API_BASE_URL}/vendors/by-slug/${encodeURIComponent(slug)}`,
    {
      headers: { Authorization: `Bearer ${publicAnonKey}` },
      cache: "no-store",
      signal,
    }
  ).catch(() => null);
  if (!response?.ok) return null;
  const data = (await response.json().catch(() => ({}))) as {
    vendor?: { id?: string };
  };
  return String(data.vendor?.id || "").trim() || null;
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

async function fetchVendorStorefrontSettings(
  vendorId: string,
  signal?: AbortSignal
): Promise<VendorStorefrontSettings | null> {
  const response = await fetch(
    `${API_BASE_URL}/vendor/storefront/${encodeURIComponent(vendorId)}`,
    {
      headers: { Authorization: `Bearer ${publicAnonKey}` },
      cache: "no-store",
      signal,
    }
  ).catch(() => null);
  if (!response?.ok) return null;
  const data = (await response.json().catch(() => ({}))) as {
    settings?: VendorStorefrontSettings;
  };
  return data.settings || null;
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
  const [loading, setLoading] = useState(true);
  const [storeName, setStoreName] = useState("SECURE");
  const [storeEmail, setStoreEmail] = useState<string | undefined>();
  const [storeAddress, setStoreAddress] = useState<string | undefined>();
  const [content, setContent] = useState(() => defaultContent(kind));
  const [resolvedVendorId, setResolvedVendorId] = useState<string | null>(null);
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

        const platform = await fetchPlatformSettings(controller.signal);
        if (controller.signal.aborted) return;

        const platformContent = platform ? pickPlatformContent(platform, kind) : "";

        if (storeSlug) {
          const vendorId = await resolveVendorIdFromSlug(storeSlug, controller.signal);
          if (controller.signal.aborted) return;
          setResolvedVendorId(vendorId);

          if (vendorId) {
            const vendorSettings = await fetchVendorStorefrontSettings(
              vendorId,
              controller.signal
            );
            if (controller.signal.aborted) return;

            if (vendorSettings) {
              const vendorContent = pickVendorPolicyPageContent(vendorSettings, kind);
              setStoreName(
                displayPlatformBrandName(vendorSettings.storeName, storeSlug)
              );
              setStoreEmail(vendorSettings.contactEmail || platform?.storeEmail);
              setStoreAddress(vendorSettings.address || platform?.storeAddress);
              setContent(vendorContent || platformContent || defaultContent(kind));
              return;
            }
          }
        } else {
          setResolvedVendorId(null);
        }

        if (platform) {
          setStoreName(displayPlatformBrandName(platform.storeName, "SECURE"));
          setStoreEmail(platform.storeEmail);
          setStoreAddress(platform.storeAddress);
          setContent(platformContent || defaultContent(kind));
        } else {
          setContent(defaultContent(kind));
        }
      } catch (error) {
        if (!controller.signal.aborted) {
          console.warn("Could not load storefront policy:", error);
          setContent(defaultContent(kind));
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
    void loadPolicyData();
    return () => abortRef.current?.abort();
  }, [loadPolicyData]);

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
