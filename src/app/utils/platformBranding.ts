import { projectId, publicAnonKey } from "../../../utils/supabase/info";
import { BRANDING } from "../../constants";
import { applyDocumentFavicon, resetDocumentFavicon } from "./documentFavicon";

export const DEFAULT_PLATFORM_FAVICON = "/favicon.svg";

export const PLATFORM_BRANDING_CACHE_KEY = "admin:branding:v1";
export const PLATFORM_BRANDING_FAVICON_CACHE_KEY = "admin:branding:favicon:v1";

export type PlatformBranding = {
  storeLogo?: string;
  storeName?: string;
};

export type PlatformBrandingFaviconCache = {
  dataUrl: string;
  forLogo: string;
};

export function readPlatformBrandingCache(): PlatformBranding | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(PLATFORM_BRANDING_CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as PlatformBranding;
    if (!parsed || typeof parsed !== "object") return null;
    return parsed;
  } catch {
    return null;
  }
}

export function writePlatformBrandingCache(data: PlatformBranding): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(PLATFORM_BRANDING_CACHE_KEY, JSON.stringify(data));
  } catch {
    /* ignore */
  }
}

export function readPlatformBrandingFaviconCache(): PlatformBrandingFaviconCache | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(PLATFORM_BRANDING_FAVICON_CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as PlatformBrandingFaviconCache;
    if (
      !parsed ||
      typeof parsed.dataUrl !== "string" ||
      !parsed.dataUrl.startsWith("data:image/") ||
      typeof parsed.forLogo !== "string"
    ) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export function writePlatformBrandingFaviconCache(forLogo: string, dataUrl: string): void {
  if (typeof window === "undefined") return;
  const logo = forLogo.trim();
  const png = dataUrl.trim();
  if (!logo || !png.startsWith("data:image/")) return;
  try {
    localStorage.setItem(
      PLATFORM_BRANDING_FAVICON_CACHE_KEY,
      JSON.stringify({ forLogo: logo, dataUrl: png })
    );
  } catch {
    /* ignore */
  }
}

export function clearPlatformBrandingFaviconCache(): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.removeItem(PLATFORM_BRANDING_FAVICON_CACHE_KEY);
  } catch {
    /* ignore */
  }
}

/** Human-readable brand for tab titles (settings may store lowercase e.g. `secure`). */
export function displayPlatformBrandName(
  name: string | null | undefined,
  fallback = BRANDING.APP_NAME
): string {
  const raw = normalizePlatformStoreName(name, fallback);
  if (raw.includes(" ")) {
    return raw
      .split(/\s+/)
      .filter(Boolean)
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
      .join(" ");
  }
  return raw.charAt(0).toUpperCase() + raw.slice(1);
}

/** Default platform name from settings — maps legacy "SECURE E-commerce" to SECURE. */
export function normalizePlatformStoreName(
  name: string | null | undefined,
  fallback = BRANDING.APP_NAME
): string {
  const raw = String(name || "").trim();
  if (!raw || /^secure\s+e-?commerce$/i.test(raw)) {
    return fallback;
  }
  return raw;
}

export async function fetchPlatformBranding(signal?: AbortSignal): Promise<PlatformBranding> {
  const fallback: PlatformBranding = {
    storeName: BRANDING.APP_NAME,
    storeLogo: "",
  };
  try {
    const response = await fetch(
      `https://${projectId}.supabase.co/functions/v1/make-server-16010b6f/settings/general`,
      {
        headers: { Authorization: `Bearer ${publicAnonKey}` },
        signal,
      }
    );
    if (!response.ok) return fallback;
    const data = await response.json();
    return {
      storeLogo: typeof data.storeLogo === "string" ? data.storeLogo : "",
      storeName: normalizePlatformStoreName(data.storeName),
    };
  } catch {
    return fallback;
  }
}

/** Site default tab icon — used until General settings store logo is uploaded. */
export function applyDefaultPlatformFavicon(): void {
  resetDocumentFavicon();
}

/** Sync first paint: cached PNG logo, else default favicon when no logo in settings. */
export function primePlatformBrandingFaviconFromCache(): PlatformBranding {
  const cached = readPlatformBrandingCache();
  const storeLogo = cached?.storeLogo?.trim() || "";
  const storeName = normalizePlatformStoreName(cached?.storeName);
  if (typeof document !== "undefined") {
    if (!storeLogo) {
      applyDefaultPlatformFavicon();
    } else {
      const favicon = readPlatformBrandingFaviconCache();
      if (favicon?.dataUrl && favicon.forLogo === storeLogo) {
        applyDocumentFavicon(favicon.dataUrl);
      } else {
        applyDocumentFavicon(storeLogo);
      }
    }
  }
  return { storeLogo, storeName };
}

export function isPlatformBrandedPublicPath(
  pathname: string,
  opts?: { vendorSubdomain?: boolean; customVendorHost?: boolean }
): boolean {
  if (opts?.vendorSubdomain || opts?.customVendorHost) return false;
  const p = String(pathname || "/").replace(/\/+$/, "") || "/";
  if (p === "/setup" || p.startsWith("/admin")) return true;
  if (p !== "/") return false;
  return true;
}
