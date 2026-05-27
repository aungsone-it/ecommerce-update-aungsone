import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useParams } from "react-router";
import { publicAnonKey } from "../../../utils/supabase/info";
import { API_BASE_URL } from "../../utils/api-client";
import { resolveVendorSubdomainStoreSlug } from "../utils/vendorSubdomainHooks";
import {
  shouldResolveCustomDomainHost,
  useResolvedVendorHostSlug,
} from "../utils/vendorHostResolution";
import { displayPlatformBrandName } from "../utils/platformBranding";
import { subscribeStorefrontPolicyUpdates } from "../utils/storefrontPolicyRealtime";
import type { StorefrontPolicyLivePatch } from "../utils/storefrontPolicyRealtime";
import type { StorefrontPolicyKind } from "../utils/storefrontPolicyPaths";
import { moduleCache, CACHE_KEYS, fetchSiteSettings } from "../utils/module-cache";
import {
  LS_STOREFRONT_POLICY_PREFIX,
  PERSISTED_POLICY_TTL_MS,
  readPersistedJson,
  removePersistedKey,
  writePersistedJson,
} from "../utils/persistedLocalCache";

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
  return `${LS_STOREFRONT_POLICY_PREFIX}${storeSlug || "platform"}:${kind}`;
}

function policySessionKey(storeSlug: string | null, kind: StorefrontPolicyKind): string {
  return `migoo-policy:${storeSlug || "platform"}:${kind}`;
}

function readPolicyCache(
  storeSlug: string | null,
  kind: StorefrontPolicyKind
): PolicyCacheEntry | null {
  if (typeof window === "undefined") return null;

  try {
    const sessionRaw = sessionStorage.getItem(policySessionKey(storeSlug, kind));
    if (sessionRaw) {
      const parsed = JSON.parse(sessionRaw) as PolicyCacheEntry;
      if (parsed && typeof parsed.content === "string") return parsed;
    }
  } catch {
    /* ignore */
  }

  return readPersistedJson<PolicyCacheEntry>(policyCacheKey(storeSlug, kind), PERSISTED_POLICY_TTL_MS);
}

function writePolicyCache(
  storeSlug: string | null,
  kind: StorefrontPolicyKind,
  entry: PolicyCacheEntry
): void {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.setItem(policySessionKey(storeSlug, kind), JSON.stringify(entry));
  } catch {
    /* ignore quota */
  }
  writePersistedJson(policyCacheKey(storeSlug, kind), entry);
}

export function invalidateStorefrontPolicyCache(
  storeSlug?: string | null,
  kind?: StorefrontPolicyKind
): void {
  if (typeof window === "undefined") return;
  const slug = storeSlug != null ? String(storeSlug).trim() : "";
  const kinds: StorefrontPolicyKind[] = kind ? [kind] : ["terms", "privacy"];
  const slugs = slug ? [slug] : ["platform"];

  for (const s of slugs) {
    for (const k of kinds) {
      try {
        sessionStorage.removeItem(policySessionKey(s || null, k));
      } catch {
        /* ignore */
      }
      removePersistedKey(policyCacheKey(s || null, k));
    }
  }
}

/** Drop in-memory vendor store cache so realtime / admin saves fetch fresh policy text. */
export function bustVendorStorePolicyCaches(storeSlug?: string | null): void {
  const slug = String(storeSlug || "").trim();
  if (slug) {
    vendorStoreMemory.delete(slug);
    vendorStoreInflight.delete(slug);
    invalidateStorefrontPolicyCache(slug);
    return;
  }
  vendorStoreMemory.clear();
  vendorStoreInflight.clear();
  invalidateStorefrontPolicyCache(null);
}

const vendorStoreMemory = new Map<
  string,
  { settings: VendorStorefrontSettings; vendorId?: string; savedAt: number }
>();
const vendorStoreInflight = new Map<
  string,
  Promise<{ settings: VendorStorefrontSettings; vendorId?: string } | null>
>();
const VENDOR_STORE_MEM_TTL_MS = 5 * 60 * 1000;

async function fetchVendorStoreBySlug(
  slug: string,
  signal?: AbortSignal,
  opts?: { forceRefresh?: boolean }
): Promise<{ settings: VendorStorefrontSettings; vendorId?: string } | null> {
  const key = String(slug || "").trim();
  if (!key) return null;

  if (opts?.forceRefresh) {
    vendorStoreMemory.delete(key);
    vendorStoreInflight.delete(key);
  }

  const cached = vendorStoreMemory.get(key);
  if (cached && Date.now() - cached.savedAt < VENDOR_STORE_MEM_TTL_MS) {
    return { settings: cached.settings, vendorId: cached.vendorId };
  }

  let inflight = vendorStoreInflight.get(key);
  if (!inflight) {
    inflight = (async () => {
      const response = await fetch(`${API_BASE_URL}/vendor/store/${encodeURIComponent(key)}`, {
        headers: { Authorization: `Bearer ${publicAnonKey}` },
        signal,
      }).catch(() => null);
      if (!response?.ok) return null;
      const data = (await response.json().catch(() => ({}))) as {
        settings?: VendorStorefrontSettings & { vendorId?: string };
      };
      if (!data.settings) return null;
      const vendorId = String(data.settings.vendorId || "").trim() || undefined;
      const result = { settings: data.settings, vendorId };
      vendorStoreMemory.set(key, { ...result, savedAt: Date.now() });
      return result;
    })().finally(() => {
      vendorStoreInflight.delete(key);
    });
    vendorStoreInflight.set(key, inflight);
  }

  return inflight;
}

async function fetchPlatformSettings(signal?: AbortSignal): Promise<PlatformSettings | null> {
  if (signal?.aborted) return null;
  try {
    return (await moduleCache.get(CACHE_KEYS.STOREFRONT_SETTINGS, fetchSiteSettings, false)) as
      | PlatformSettings
      | null;
  } catch {
    return null;
  }
}

async function fetchPolicyCacheEntry(
  storeSlug: string | null,
  kind: StorefrontPolicyKind,
  signal?: AbortSignal,
  opts?: { forceRefresh?: boolean }
): Promise<PolicyCacheEntry | null> {
  if (storeSlug) {
    const vendorStore = await fetchVendorStoreBySlug(storeSlug, signal, opts);
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
    async (opts?: { silent?: boolean; forceRefresh?: boolean }) => {
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
          const entry = await fetchPolicyCacheEntry(storeSlug, kind, controller.signal, {
            forceRefresh: opts?.forceRefresh,
          });
          if (controller.signal.aborted) return;

          if (entry) {
            applyPolicyEntry(entry, setters);
            writePolicyCache(storeSlug, kind, entry);
            return;
          }
        } else {
          setResolvedVendorId(null);
        }

        const platformEntry = await fetchPolicyCacheEntry(null, kind, controller.signal, {
          forceRefresh: opts?.forceRefresh,
        });
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
    const applyLivePatch = (patch: StorefrontPolicyLivePatch) => {
      if (patch.kind !== kind) return;
      if (storeSlug) {
        if (patch.scope === "platform") return;
        const patchSlug = String(patch.storeSlug || "").trim().toLowerCase();
        const watchSlug = String(storeSlug).trim().toLowerCase();
        if (patchSlug && patchSlug !== watchSlug) return;
      } else if (patch.scope !== "platform") {
        return;
      }

      const entry: PolicyCacheEntry = {
        storeName: displayPlatformBrandName(patch.storeName, storeSlug || "SECURE"),
        storeEmail: patch.storeEmail,
        storeAddress: patch.storeAddress,
        content: patch.content || defaultContent(kind),
        vendorId: patch.vendorId,
      };

      applyPolicyEntry(entry, {
        setStoreName,
        setStoreEmail,
        setStoreAddress,
        setContent,
        setResolvedVendorId,
      });
      writePolicyCache(storeSlug, kind, entry);
      if (patch.vendorId) setResolvedVendorId(patch.vendorId);
      setLoading(false);
    };

    return subscribeStorefrontPolicyUpdates({
      vendorId: resolvedVendorId,
      storeSlug,
      kind,
      includePlatform: true,
      onLivePatch: applyLivePatch,
      onUpdate: () => {
        bustVendorStorePolicyCaches(storeSlug);
        moduleCache.invalidate(CACHE_KEYS.STOREFRONT_SETTINGS);
        void loadPolicyData({ silent: true, forceRefresh: true });
      },
    });
  }, [resolvedVendorId, storeSlug, kind, loadPolicyData]);

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
