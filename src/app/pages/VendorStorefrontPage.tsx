import { useParams, useNavigate } from "react-router";
import { AuthProvider } from "../contexts/AuthContext";
import { CartProvider } from "../components/CartContext";
import { VendorStoreView } from "../components/VendorStoreView";
import { Store, ArrowLeft } from "lucide-react";
import { Button } from "../components/ui/button";

export function VendorStorefrontPage() {
  const { storeName, productSlug } = useParams();
  const navigate = useNavigate();

  if (!storeName) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 to-slate-100">
        <div className="text-center space-y-6 p-8">
          <div className="w-20 h-20 bg-slate-200 rounded-full flex items-center justify-center mx-auto">
            <Store className="w-10 h-10 text-slate-400" />
          </div>
          <div className="space-y-2">
            <h1 className="text-2xl font-bold text-slate-900">Vendor Store Not Found</h1>
            <p className="text-slate-600">The vendor store you're looking for doesn't exist or has been removed.</p>
          </div>
          <Button 
            onClick={() => navigate('/store')}
            className="bg-slate-900 hover:bg-slate-800"
          >
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back to Home
          </Button>
        </div>
      </div>
    );
  }

  const handleBack = () => {
    // Always navigate back to the vendor's admin dashboard
    const vendorAdminPath = `/vendor/${storeName}/admin`;
    console.log('Back button clicked - navigating to:', vendorAdminPath);
    navigate(vendorAdminPath);
  };

  return (
    <AuthProvider>
      <CartProvider>
        <VendorStoreView 
          vendorId={storeName}
          storeSlug={storeName}
          onBack={handleBack}
          initialProductSlug={productSlug}
        />
      </CartProvider>
    </AuthProvider>
  );
}