import { AuthProvider } from "../contexts/AuthContext";
import { CartProvider } from "../components/CartContext";
import { Storefront } from "../components/Storefront";
import { useNavigate } from "react-router";

export function StorefrontPage() {
  const navigate = useNavigate();
  
  return (
    <AuthProvider>
      <CartProvider>
        <Storefront 
          onSwitchToAdmin={() => {
            navigate("/admin");
          }}
          onOrderPlaced={() => {
            // This will be handled by the admin panel
          }}
          onOpenVendorApplication={() => {
            navigate("/vendor/application");
          }}
        />
      </CartProvider>
    </AuthProvider>
  );
}