import { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router";
import { Loader2 } from "lucide-react";
import { useVendorAuth } from "../contexts/VendorAuthContext";
import { VendorLogin } from "./VendorLogin";
import { useVendorAdminRouteParams } from "../utils/vendorAdminRouteParams";
import { useResolvedVendorHostSlug } from "../utils/vendorHostResolution";
import { projectId, publicAnonKey } from "../../../utils/supabase/info";

export function VendorAuthGate({ children }: { children: React.ReactNode }) {
  const { vendor, loading } = useVendorAuth();
  const { storeName } = useVendorAdminRouteParams();
  const location = useLocation();
  const navigate = useNavigate();
  const { slug: hostSlug, loading: hostSlugLoading } = useResolvedVendorHostSlug();
  const [checkingSetup, setCheckingSetup] = useState(false);
  const [setupRequired, setSetupRequired] = useState(false);

  useEffect(() => {
    if (loading || hostSlugLoading || vendor) return;
    const onAdminPath = location.pathname === "/admin" || location.pathname.startsWith("/admin/");
    if (!onAdminPath || !hostSlug) return;

    let cancelled = false;
    setCheckingSetup(true);
    void (async () => {
      try {
        const bySlugRes = await fetch(
          `https://${projectId}.supabase.co/functions/v1/make-server-16010b6f/vendors/by-slug/${encodeURIComponent(hostSlug)}`,
          {
            headers: {
              Authorization: `Bearer ${publicAnonKey}`,
            },
          }
        );
        if (!bySlugRes.ok) return;
        const data = (await bySlugRes.json()) as {
          needsSetup?: boolean;
          vendor?: {
            email?: string;
            needsSetup?: boolean;
            hasPassword?: boolean;
            passwordConfigured?: boolean;
          };
        };
        const email = String(data.vendor?.email || "").trim();
        const setupFlag =
          data.needsSetup ??
          data.vendor?.needsSetup ??
          (typeof data.vendor?.hasPassword === "boolean" ? !data.vendor.hasPassword : undefined) ??
          (typeof data.vendor?.passwordConfigured === "boolean"
            ? !data.vendor.passwordConfigured
            : undefined);
        const needsSetup = setupFlag === true;
        if (cancelled || !needsSetup || !email) return;

        setSetupRequired(true);
        navigate(`/vendor/setup?email=${encodeURIComponent(email)}`, { replace: true });
      } catch (error) {
        console.warn("Vendor setup pre-check failed:", error);
      } finally {
        if (!cancelled) setCheckingSetup(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [loading, hostSlugLoading, vendor, location.pathname, hostSlug, navigate]);

  // Show loading spinner while checking vendor authentication
  if (loading || hostSlugLoading || checkingSetup || setupRequired) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 to-slate-100">
        <div className="text-center space-y-4">
          <Loader2 className="w-12 h-12 animate-spin text-purple-600 mx-auto" />
          <p className="text-slate-600 font-medium">Verifying vendor authentication...</p>
        </div>
      </div>
    );
  }

  // No vendor logged in - show login page
  if (!vendor) {
    return <VendorLogin storeName={storeName ?? undefined} />;
  }

  // Vendor is authenticated - show app
  return <>{children}</>;
}