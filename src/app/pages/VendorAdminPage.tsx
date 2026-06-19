import { VendorAdminPortal } from "../components/VendorAdminPortal";
import { useVendorAuth } from "../contexts/VendorAuthContext";
import { Loader2 } from "lucide-react";
import { resolveVendorSubdomainStoreSlug } from "../utils/vendorSubdomainHooks";
import { useResolvedVendorHostSlug } from "../utils/vendorHostResolution";
import { useLayoutEffect, useMemo } from "react";
import { applyDocumentFavicon, resetDocumentFavicon } from "../utils/documentFavicon";
import "../utils/adminStyles";

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

export function VendorAdminPage() {
  const { vendor, logout } = useVendorAuth();
  const { slug: customHostSlug } = useResolvedVendorHostSlug();
  const fallbackSlug = useMemo(() => {
    const fromHost = resolveVendorSubdomainStoreSlug() || customHostSlug;
    if (fromHost) return fromHost;
    const m =
      window.location.pathname.match(/^\/(?:vendor|store)\/([^/]+)\/admin/i) ??
      window.location.pathname.match(/^\/admin\/([^/]+)/i);
    return m?.[1] || "";
  }, [customHostSlug]);
  const instantTitleBase = useMemo(() => {
    const directName = vendor?.storeName || vendor?.name;
    if (directName && String(directName).trim()) return String(directName).trim();
    if (fallbackSlug) {
      return decodeURIComponent(fallbackSlug)
        .replace(/[-_]+/g, " ")
        .replace(/\s+/g, " ")
        .trim()
        .replace(/\b\w/g, (c) => c.toUpperCase());
    }
    return "Vendor";
  }, [vendor?.storeName, vendor?.name, fallbackSlug]);
  const instantFavicon = useMemo(() => {
    if (typeof vendor?.avatar === "string" && vendor.avatar.trim()) return vendor.avatar.trim();
    return readCachedVendorLogoBySlug(fallbackSlug);
  }, [vendor?.avatar, fallbackSlug]);

  useLayoutEffect(() => {
    document.title = `${instantTitleBase} | Vendor Admin`;
    if (instantFavicon) {
      applyDocumentFavicon(instantFavicon);
    } else {
      resetDocumentFavicon();
    }
  }, [instantTitleBase, instantFavicon]);

  // Safety check - this should never happen due to VendorAuthGate, but just in case
  if (!vendor) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 to-slate-100">
        <div className="text-center space-y-4">
          <Loader2 className="w-12 h-12 animate-spin text-slate-900 mx-auto" />
          <p className="text-slate-600 font-medium">Loading vendor data...</p>
        </div>
      </div>
    );
  }

  // Convert vendor auth data to format expected by VendorAdminPortal
  const vendorData = {
    id: vendor.vendorId,
    name: vendor.name,
    businessName: vendor.businessName,
    email: vendor.email,
    phone: vendor.phone || "",
    status: "active" as const,
    location: vendor.location || "",
    avatar: vendor.avatar,
    storeSlug: vendor.storeSlug,
    storeName: vendor.storeName ?? vendor.name,
    contactName: vendor.contactName?.trim() || vendor.name,
  };

  return (
    <VendorAdminPortal
      vendor={vendorData}
      onLogout={() => {
        logout();
      }}
      onPreviewStore={(_vendorId, storeSlug) => {
        const targetPath =
          resolveVendorSubdomainStoreSlug() || customHostSlug
            ? "/"
            : `/vendor/${storeSlug}`;
        window.open(targetPath, "_blank", "noopener,noreferrer");
      }}
    />
  );
}