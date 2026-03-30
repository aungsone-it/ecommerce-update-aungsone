import { getEffectiveVendorSubdomainBase } from "./vendorSubdomainBase";

const COOKIE_NAME = "vendorAuthSession";

/** Same shape as VendorUser — kept local to avoid circular imports. */
export type VendorAuthCookieVendor = {
  id: string;
  email: string;
  name: string;
  businessName: string;
  phone?: string;
  vendorId: string;
  storeName?: string;
  storeSlug?: string;
};

type Packed = { v: VendorAuthCookieVendor; rm: boolean };

/**
 * Apex domain (e.g. walwal.online) for Domain= cookie so www + vendor subdomains share session.
 */
export function getVendorAuthCookieDomain(): string | null {
  if (typeof window === "undefined") return null;
  const host = window.location.hostname.toLowerCase();
  if (host === "localhost" || host === "127.0.0.1" || host.endsWith(".localhost")) {
    return null;
  }

  const apex = getEffectiveVendorSubdomainBase();
  if (!apex) return null;

  if (host === apex || host.endsWith("." + apex)) {
    return apex;
  }
  return null;
}

function readRawCookie(name: string): string | null {
  if (typeof document === "undefined") return null;
  const parts = document.cookie.split("; ");
  for (const p of parts) {
    if (p.startsWith(`${name}=`)) {
      return p.slice(name.length + 1);
    }
  }
  return null;
}

export function setVendorAuthSessionCookie(vendor: VendorAuthCookieVendor, rememberMe: boolean): void {
  const domain = getVendorAuthCookieDomain();
  if (!domain) return;

  const packed: Packed = { v: vendor, rm: rememberMe };
  let value: string;
  try {
    value = encodeURIComponent(JSON.stringify(packed));
  } catch {
    return;
  }
  if (value.length > 3800) {
    console.warn("[vendorAuthCookie] Session payload too large for cookie; skipping");
    return;
  }

  const secure = typeof window !== "undefined" && window.location.protocol === "https:" ? "; Secure" : "";
  let cookie = `${COOKIE_NAME}=${value}; Path=/; Domain=${domain}; SameSite=Lax${secure}`;
  if (rememberMe) {
    cookie += `; Max-Age=${60 * 60 * 24 * 30}`;
  }
  document.cookie = cookie;
}

export function readVendorAuthSessionCookie(): { vendor: VendorAuthCookieVendor; rememberMe: boolean } | null {
  const raw = readRawCookie(COOKIE_NAME);
  if (!raw) return null;
  try {
    const packed = JSON.parse(decodeURIComponent(raw)) as Packed;
    if (!packed?.v?.vendorId || !packed.v.email) return null;
    return { vendor: packed.v, rememberMe: !!packed.rm };
  } catch {
    return null;
  }
}

export function clearVendorAuthSessionCookie(): void {
  const domain = getVendorAuthCookieDomain();
  const secure = typeof window !== "undefined" && window.location.protocol === "https:" ? "; Secure" : "";
  if (domain) {
    document.cookie = `${COOKIE_NAME}=; Path=/; Domain=${domain}; Max-Age=0; SameSite=Lax${secure}`;
  }
  document.cookie = `${COOKIE_NAME}=; Path=/; Max-Age=0; SameSite=Lax${secure}`;
}
