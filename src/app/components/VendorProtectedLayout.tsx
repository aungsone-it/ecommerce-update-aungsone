import { Outlet } from "react-router";
import { VendorAuthGate } from "./VendorAuthGate";
import { useVendorAuth } from "../contexts/VendorAuthContext";

// Protected layout for vendor routes with vendor authentication
// Note: VendorAuthProvider is now at the App level
export function VendorProtectedLayout() {
  const { vendor } = useVendorAuth();

  return (
    <VendorAuthGate>
      <Outlet />
      {/* FloatingChat removed - only for storefront, not vendor admin panel */}
    </VendorAuthGate>
  );
}