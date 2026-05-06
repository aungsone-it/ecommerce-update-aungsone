import { VendorAdminPortal } from "../components/VendorAdminPortal";
import { useVendorAuth } from "../contexts/VendorAuthContext";
import { Loader2 } from "lucide-react";
import { resolveVendorSubdomainStoreSlug } from "../utils/vendorSubdomainHooks";
import { useResolvedVendorHostSlug } from "../utils/vendorHostResolution";

export function VendorAdminPage() {
  const { vendor, logout } = useVendorAuth();
  const { slug: customHostSlug } = useResolvedVendorHostSlug();

  // Safety check - this should never happen due to VendorAuthGate, but just in case
  if (!vendor) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 to-slate-100">
        <div className="text-center space-y-4">
          <Loader2 className="w-12 h-12 animate-spin text-purple-600 mx-auto" />
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
            : `/store/${storeSlug}`;
        window.open(targetPath, "_blank", "noopener,noreferrer");
      }}
    />
  );
}