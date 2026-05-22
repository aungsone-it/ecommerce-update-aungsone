import { projectId, publicAnonKey } from "../../../utils/supabase/info";
import { BRANDING } from "../../constants";
import { applyDocumentFavicon } from "./documentFavicon";

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
  const raw = String(name || "").trim();
  if (!raw) return fallback;
  if (raw.includes(" ")) {
    return raw
      .split(/\s+/)
      .filter(Boolean)
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
      .join(" ");
  }
  return raw.charAt(0).toUpperCase() + raw.slice(1);
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
      storeName:
        typeof data.storeName === "string" && data.storeName.trim()
          ? data.storeName.trim()
          : BRANDING.APP_NAME,
    };
  } catch {
    return fallback;
  }
}

/** Sync first paint: raster PNG from LS when available so history/autocomplete get the real logo. */
export function primePlatformBrandingFaviconFromCache(): PlatformBranding {
  const cached = readPlatformBrandingCache();
  const storeLogo = cached?.storeLogo?.trim() || "";
  const storeName = cached?.storeName?.trim() || BRANDING.APP_NAME;
  if (typeof document !== "undefined") {
    const favicon = readPlatformBrandingFaviconCache();
    if (favicon?.dataUrl && favicon.forLogo === storeLogo) {
      applyDocumentFavicon(favicon.dataUrl);
    } else if (storeLogo) {
      applyDocumentFavicon(storeLogo);
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
