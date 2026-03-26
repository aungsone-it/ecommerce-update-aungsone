import { projectId, publicAnonKey } from "../../../utils/supabase/info";
import { useState, useEffect, useMemo } from "react";
import {
  ChevronLeft,
  CreditCard,
  ShoppingBag,
  Check,
  Package,
  MapPin,
  Phone,
  Banknote,
  DollarSign,
  Tag,
  X,
  XCircle,
  CheckCircle,
  Shield,
  Loader2,
} from "lucide-react";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Textarea } from "./ui/textarea";
import { Label } from "./ui/label";
import { useCart } from "./CartContext";
import { useAuth } from "../contexts/AuthContext";
import { toast } from "sonner";

/** KV-backed customer session (authApi / migoo-user) — AuthContext only has Supabase sessions */
function getMigooCustomerFromStorage(): {
  id: string;
  email?: string;
  name?: string;
  phone?: string;
} | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem("migoo-user");
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { id?: string; email?: string; name?: string; phone?: string };
    if (parsed && typeof parsed.id === "string") {
      return {
        id: parsed.id,
        email: parsed.email,
        name: parsed.name,
        phone: parsed.phone,
      };
    }
  } catch {
    return null;
  }
  return null;
}

/** Same ID resolution as VendorStoreView / addresses page (`id` or `userId`). */
function resolveUserIdFromRecord(u: unknown): string | null {
  if (!u || typeof u !== "object") return null;
  const o = u as Record<string, unknown>;
  const raw = o.id ?? o.userId;
  if (typeof raw === "string" && raw.trim().length > 0) return raw.trim();
  if (typeof raw === "number" && Number.isFinite(raw)) return String(raw);
  return null;
}

interface CheckoutProps {
  onBack: () => void;
  storeName: string;
  vendorId?: string;
  vendorName?: string;
  /** Vendor storefront session (migoo-user) — must match addresses page so default shipping loads. */
  accountUser?: { id?: string; userId?: string; email?: string; name?: string; phone?: string } | null;
}

export function Checkout({ onBack, storeName, vendorId, vendorName, accountUser = null }: CheckoutProps) {
  const { items, totalPrice, clearCart } = useCart();
  const { user: authUser } = useAuth();
  const migoo = getMigooCustomerFromStorage();

  /**
   * Customer id + profile: prefer vendor `accountUser` (same as `/profile/addresses`),
   * then Supabase session, then raw migoo-user — so `/customers/:id/addresses` matches saved addresses.
   */
  const effectiveUser = useMemo(() => {
    const fromVendor = resolveUserIdFromRecord(accountUser);
    const fromAuth = authUser?.id ? String(authUser.id) : null;
    const fromMigoo = migoo?.id ? String(migoo.id) : null;
    const id = fromVendor || fromAuth || fromMigoo;
    if (!id) return null;
    return {
      id,
      email: accountUser?.email ?? authUser?.email ?? migoo?.email ?? "",
      name: accountUser?.name ?? authUser?.name ?? migoo?.name ?? "",
      phone: accountUser?.phone ?? authUser?.phone ?? migoo?.phone ?? "",
    };
  }, [
    accountUser?.id,
    accountUser?.userId,
    accountUser?.email,
    accountUser?.name,
    accountUser?.phone,
    authUser?.id,
    authUser?.email,
    authUser?.name,
    authUser?.phone,
    migoo?.id,
    migoo?.email,
    migoo?.name,
    migoo?.phone,
  ]);

  const [step, setStep] = useState<"checkout" | "success">("checkout");
  const [loading, setLoading] = useState(false);

  // Shipping Form State - Pre-fill from saved addresses
  const [shippingInfo, setShippingInfo] = useState({
    fullName: "",
    email: "",
    phone: "",
    address: "",
    city: "",
    zipCode: "",
    country: "",
  });

  // Pre-fill from cached addresses (same key as VendorStoreView) + API — matches main marketplace behavior
  useEffect(() => {
    console.log("🔍 User data in Checkout:", effectiveUser);

    const applyAddress = (
      addr: any,
      profile: { id: string; email: string; name: string; phone: string }
    ) => {
      const line1 = typeof addr?.addressLine1 === "string" ? addr.addressLine1 : "";
      const line2 = typeof addr?.addressLine2 === "string" ? addr.addressLine2 : "";
      const combined = [line1, line2].filter(Boolean).join(", ");
      setShippingInfo({
        fullName: (typeof addr?.recipientName === "string" ? addr.recipientName : "") || profile.name || "",
        email: profile.email || "",
        phone: (typeof addr?.phone === "string" ? addr.phone : "") || profile.phone || "",
        address: combined || line1,
        city: typeof addr?.city === "string" ? addr.city : "",
        zipCode: typeof addr?.zipCode === "string" ? addr.zipCode : "",
        country: typeof addr?.country === "string" ? addr.country : "",
      });
    };

    const loadUserAddresses = async () => {
      const eu = effectiveUser;
      if (!eu?.id) {
        console.log("⚠️ No user logged in, skipping address load");
        return;
      }

      const storageKey = `migoo-shipping-addresses-${eu.id}`;
      try {
        const cached = localStorage.getItem(storageKey);
        if (cached) {
          const parsed = JSON.parse(cached) as unknown;
          if (Array.isArray(parsed) && parsed.length > 0) {
            const defaultAddress = parsed.find((a: any) => a?.isDefault) || parsed[0];
            applyAddress(defaultAddress, eu);
            console.log("✅ Checkout pre-filled from migoo address cache");
          }
        }
      } catch (e) {
        console.warn("Checkout: could not read address cache", e);
      }

      try {
        const response = await fetch(
          `https://${projectId}.supabase.co/functions/v1/make-server-16010b6f/customers/${eu.id}/addresses`,
          {
            headers: {
              Authorization: `Bearer ${publicAnonKey}`,
            },
          }
        );

        if (response.ok) {
          const data = await response.json();
          const addresses = data.addresses || [];

          if (addresses.length > 0) {
            try {
              localStorage.setItem(storageKey, JSON.stringify(addresses));
            } catch {
              /* ignore quota */
            }
            const defaultAddress = addresses.find((addr: any) => addr.isDefault) || addresses[0];
            console.log("📦 Found saved address from database:", defaultAddress);
            applyAddress(defaultAddress, eu);
            console.log("✅ Auto-filled checkout form with saved address from database");
            return;
          }
        }
      } catch (error) {
        console.error("Failed to load addresses from database:", error);
      }

      setShippingInfo((prev) => ({
        ...prev,
        fullName: prev.fullName || eu.name || "",
        email: prev.email || eu.email || "",
        phone: prev.phone || eu.phone || "",
      }));
    };

    if (effectiveUser?.id) {
      void loadUserAddresses();
    }
  }, [effectiveUser]);

  // Order Note
  const [orderNote, setOrderNote] = useState("");

  // Payment Form State
  const [paymentMethod, setPaymentMethod] = useState<"card" | "bank" | "kpay">("card");
  const [paymentInfo, setPaymentInfo] = useState({
    cardNumber: "",
    cardName: "",
    expiryDate: "",
    cvv: ""
  });

  // KPay Settings
  const [kpayPhone, setKpayPhone] = useState("+95 9 XXX XXX XXX");
  const [kpayQrCode, setKpayQrCode] = useState("");
  const [paymentScreenshot, setPaymentScreenshot] = useState<string | null>(null);

  // Load KPay settings from backend
  useEffect(() => {
    const loadKPaySettings = async () => {
      try {
        const response = await fetch(
          `https://${projectId}.supabase.co/functions/v1/make-server-16010b6f/settings/general`,
          {
            headers: {
              Authorization: `Bearer ${publicAnonKey}`,
            },
          }
        );
        if (response.ok) {
          const data = await response.json();
          setKpayPhone(data.kpayPhone || "+95 9 XXX XXX XXX");
          setKpayQrCode(data.kpayQrCode || "");
        }
      } catch (error) {
        console.error("Error loading KPay settings:", error);
      }
    };
    loadKPaySettings();
  }, []);

  // Coupon State with localStorage persistence
  const [couponCode, setCouponCode] = useState("");
  const [appliedCoupon, setAppliedCoupon] = useState<any>(() => {
    const saved = localStorage.getItem('migoo-applied-coupon');
    return saved ? JSON.parse(saved) : null;
  });
  const [couponError, setCouponError] = useState("");
  const [couponLoading, setCouponLoading] = useState(false);
  
  // Persist appliedCoupon to localStorage
  useEffect(() => {
    if (appliedCoupon) {
      localStorage.setItem('migoo-applied-coupon', JSON.stringify(appliedCoupon));
    } else {
      localStorage.removeItem('migoo-applied-coupon');
    }
  }, [appliedCoupon]);
  
  // Calculate final total with discount
  const discountAmount = appliedCoupon?.campaign?.discountAmount || 0;
  const finalTotal = Math.max(totalPrice - discountAmount, 0);

  const [orderNumber, setOrderNumber] = useState("");
  const [confirmedItems, setConfirmedItems] = useState<any[]>([]);
  const [confirmedTotal, setConfirmedTotal] = useState(0);
  const [confirmedOrderNote, setConfirmedOrderNote] = useState("");
  const [confirmedCoupon, setConfirmedCoupon] = useState<any>(null);
  const [confirmedDiscount, setConfirmedDiscount] = useState(0);

  // Apply coupon code
  const handleApplyCoupon = async () => {
    if (!couponCode.trim()) {
      setCouponError("Please enter a coupon code");
      return;
    }

    setCouponLoading(true);
    setCouponError("");

    try {
      const code = couponCode.trim().toUpperCase();
      console.log(`🎫 Validating coupon code: "${code}" (original: "${couponCode.trim()}")`);
      
      const response = await fetch(
        `https://${projectId}.supabase.co/functions/v1/make-server-16010b6f/campaigns/validate`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${publicAnonKey}`,
          },
          body: JSON.stringify({
            code: code, // 🔧 FIX: Send uppercased code to match database
            cartTotal: totalPrice,
            cartItems: items.map(item => ({
              id: item.id,
              sku: item.sku || item.id,
              price: item.price,
              quantity: item.quantity
            }))
          }),
        }
      );

      const data = await response.json();
      console.log('🎫 Coupon validation response:', data);

      if (data.valid) {
        setAppliedCoupon(data);
        setCouponError("");
        console.log("✅ Coupon applied:", data);
        console.log("✅ Campaign ID being stored:", data?.campaign?.id);
        console.log("✅ Full campaign object:", data?.campaign);
      } else {
        console.error('❌ Coupon validation failed:', data.error);
        setCouponError(data.error || "Invalid coupon code");
        setAppliedCoupon(null);
      }
    } catch (error) {
      console.error("❌ Error applying coupon:", error);
      setCouponError("Failed to apply coupon. Please try again.");
      setAppliedCoupon(null);
    } finally {
      setCouponLoading(false);
    }
  };

  // Remove applied coupon
  const handleRemoveCoupon = () => {
    setAppliedCoupon(null);
    setCouponCode("");
    setCouponError("");
  };

  const resolveOrderEmail = () =>
    (shippingInfo.email?.trim() || effectiveUser?.email?.trim() || "");

  const handlePlaceOrder = async (e?: React.FormEvent | React.MouseEvent) => {
    e?.preventDefault();

    if (!shippingInfo.fullName.trim() || !shippingInfo.phone.trim()) {
      toast.error("Please enter your full name and phone number");
      return;
    }
    if (!shippingInfo.address.trim() || !shippingInfo.city.trim() || !shippingInfo.country.trim()) {
      toast.error("Please complete your address, city, and country");
      return;
    }
    const orderEmail = resolveOrderEmail();
    if (!orderEmail) {
      toast.error("Please enter your email address");
      return;
    }

    setLoading(true);

    // 💳 TEST CARD PAYMENT PROCESSING (Stripe-style)
    if (paymentMethod === "card") {
      // Validate card fields
      if (!paymentInfo.cardNumber || !paymentInfo.cardName || !paymentInfo.expiryDate || !paymentInfo.cvv) {
        toast.error("Please fill in all card details");
        setLoading(false);
        return;
      }

      // Remove spaces from card number for validation
      const cardNumberClean = paymentInfo.cardNumber.replace(/\s/g, '');

      // Validate card number length
      if (cardNumberClean.length < 13 || cardNumberClean.length > 19) {
        toast.error("Invalid card number");
        setLoading(false);
        return;
      }

      // Validate expiry date format
      if (!/^\d{2}\/\d{2}$/.test(paymentInfo.expiryDate)) {
        toast.error("Invalid expiry date format (MM/YY)");
        setLoading(false);
        return;
      }

      // Validate CVV
      if (paymentInfo.cvv.length < 3 || paymentInfo.cvv.length > 4) {
        toast.error("Invalid CVV");
        setLoading(false);
        return;
      }

      // 🧪 SIMULATE PAYMENT PROCESSING (like Stripe test mode)
      toast.info("Processing payment...", { duration: 2000 });
      
      // Wait 2 seconds to simulate payment gateway
      await new Promise(resolve => setTimeout(resolve, 2000));

      // TEST CARD NUMBERS (Stripe-style)
      const testCards = {
        success: ['4242424242424242', '4242 4242 4242 4242'],
        declined: ['4000000000000002', '4000 0000 0000 0002'],
        insufficient: ['4000000000009995', '4000 0000 0000 9995'],
        expired: ['4000000000000069', '4000 0000 0000 0069']
      };

      // Check test card results
      if (testCards.declined.includes(cardNumberClean) || testCards.declined.includes(paymentInfo.cardNumber)) {
        setLoading(false);
        toast.error("💳 Card Declined - Your card was declined. Please try another card.", { duration: 5000 });
        return;
      }

      if (testCards.insufficient.includes(cardNumberClean) || testCards.insufficient.includes(paymentInfo.cardNumber)) {
        setLoading(false);
        toast.error("💳 Insufficient Funds - Your card has insufficient funds.", { duration: 5000 });
        return;
      }

      if (testCards.expired.includes(cardNumberClean) || testCards.expired.includes(paymentInfo.cardNumber)) {
        setLoading(false);
        toast.error("💳 Card Expired - Your card has expired. Please use a different card.", { duration: 5000 });
        return;
      }

      // Check if it's a valid test success card
      if (!testCards.success.includes(cardNumberClean) && !testCards.success.includes(paymentInfo.cardNumber)) {
        // For demo purposes, accept any other card number as successful
        // In production, you'd integrate with real payment gateway here
        console.log("⚠️ Using non-test card number - accepting for demo");
      }

      // ✅ Payment successful!
      toast.success("💳 Payment Successful!", { duration: 3000 });
    }

    // Bank / KPay: no card simulation — proceed to order

    // 🔥 SAVE items and total BEFORE clearing cart
    setConfirmedItems(items);
    setConfirmedTotal(finalTotal);
    setConfirmedOrderNote(orderNote);
    setConfirmedCoupon(appliedCoupon);
    setConfirmedDiscount(discountAmount);

    // Generate order number
    const orderNum = `ORD-${Date.now().toString(36).toUpperCase()}`;
    setOrderNumber(orderNum);

    try {
      // 🔥 Save order to backend with vendor information
      const orderData = {
        orderNumber: orderNum,
        userId: effectiveUser?.id ?? null,
        customer: shippingInfo.fullName,
        customerName: shippingInfo.fullName,
        email: orderEmail,
        phone: shippingInfo.phone,
        status: "pending",
        paymentStatus: "paid", // All prepaid orders have "paid" status
        paymentMethod: paymentMethod === "card" ? "Credit/Debit Card" : paymentMethod === "kpay" ? "KPay" : "Bank Transfer",
        total: finalTotal,
        subtotal: totalPrice,
        discount: discountAmount,
        date: new Date().toISOString(),
        vendor: vendorName || storeName, // 🔥 Add vendor name to order
        // 🎫 Include coupon information for tracking
        couponCode: appliedCoupon?.campaign?.code || null,
        couponId: appliedCoupon?.campaign?.id || null,
        couponDiscount: discountAmount,
        items: items.map((item) => ({
          productId: item.productId || item.id,
          sku: item.sku,
          name: item.name || item.sku,
          quantity: item.quantity,
          price: item.price,
          image: item.image,
          vendorId: vendorId || item.vendor || item.vendorId, // 🔥 Include vendor ID from props or item
          vendor: vendorId || item.vendor || item.vendorId,
        })),
        shippingAddress: [
          shippingInfo.address,
          shippingInfo.city,
          shippingInfo.zipCode?.trim(),
          shippingInfo.country,
        ]
          .filter(Boolean)
          .join(", "),
        notes: orderNote,
      };

      // Save to backend
      const response = await fetch(
        `https://${projectId}.supabase.co/functions/v1/make-server-16010b6f/orders`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${publicAnonKey}`,
          },
          body: JSON.stringify(orderData),
        }
      );

      const result = await response.json();

      // 🚨 CHECK FOR STOCK ERRORS
      if (!response.ok || result.error === 'Insufficient stock') {
        setLoading(false);
        
        if (result.stockIssues && result.stockIssues.length > 0) {
          // Show detailed stock error
          const stockMessages = result.stockIssues.map((issue: any) => {
            if (issue.requested && issue.available !== undefined) {
              return `• ${issue.productName}: Need ${issue.requested}, only ${issue.available} in stock`;
            }
            return `• ${issue.productName}: ${issue.issue}`;
          }).join('\n');
          
          toast.error(`Cannot place order - Insufficient stock`, {
            description: stockMessages,
            duration: 8000,
          });
        } else {
          toast.error(`Failed to place order: ${result.message || result.error || 'Unknown error'}`, {
            duration: 5000,
          });
        }
        return; // Stop order process
      }

      console.log("✅ Order saved to backend:", orderNum);
      
      // 🔥 Save shipping address to database for future use
      if (effectiveUser?.id) {
        try {
          console.log(`📍 Saving shipping address for user ${effectiveUser.id}`);
          
          // Create address object
          const newAddress = {
            id: `addr_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
            recipientName: shippingInfo.fullName,
            phone: shippingInfo.phone,
            addressLine1: shippingInfo.address,
            city: shippingInfo.city,
            zipCode: shippingInfo.zipCode,
            isDefault: false, // User can set default later in profile
            createdAt: new Date().toISOString(),
          };
          
          // Get existing addresses
          const addressResponse = await fetch(
            `https://${projectId}.supabase.co/functions/v1/make-server-16010b6f/customers/${effectiveUser.id}/addresses`,
            {
              headers: {
                'Authorization': `Bearer ${publicAnonKey}`,
              },
            }
          );
          
          let existingAddresses: any[] = [];
          if (addressResponse.ok) {
            const addressData = await addressResponse.json();
            existingAddresses = addressData.addresses || [];
          }
          
          // Check if this address already exists
          const addressExists = existingAddresses.some(addr =>
            addr.addressLine1 === newAddress.addressLine1 &&
            addr.city === newAddress.city &&
            addr.zipCode === newAddress.zipCode
          );
          
          // Only save if it's a new address
          if (!addressExists) {
            const updatedAddresses = [...existingAddresses, newAddress];
            
            await fetch(
              `https://${projectId}.supabase.co/functions/v1/make-server-16010b6f/customers/${effectiveUser.id}/addresses`,
              {
                method: 'POST',
                headers: {
                  'Authorization': `Bearer ${publicAnonKey}`,
                  'Content-Type': 'application/json',
                },
                body: JSON.stringify({ addresses: updatedAddresses }),
              }
            );
            
            console.log('✅ Shipping address saved to database');
          } else {
            console.log('ℹ️ Address already exists, skipping save');
          }
        } catch (addressError) {
          console.error('❌ Failed to save address:', addressError);
          // Don't fail the order if address saving fails
        }
      }
      
      // 🎫 Track coupon usage if a coupon was applied
      console.log('🔍 Checking appliedCoupon:', appliedCoupon);
      console.log('🔍 appliedCoupon?.campaign:', appliedCoupon?.campaign);
      console.log('🔍 appliedCoupon?.campaign?.id:', appliedCoupon?.campaign?.id);
      
      if (appliedCoupon?.campaign?.id) {
        try {
          console.log(`🎫 Incrementing coupon usage for: ${appliedCoupon.campaign.code}`);
          console.log(`🎫 Campaign ID: ${appliedCoupon.campaign.id}`);
          console.log(`🎫 Discount amount (revenue): ${discountAmount} MMK`);
          
          const incrementResponse = await fetch(
            `https://${projectId}.supabase.co/functions/v1/make-server-16010b6f/campaigns/${appliedCoupon.campaign.id}/increment`,
            {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${publicAnonKey}`,
              },
              body: JSON.stringify({
                revenue: discountAmount // Track the discount amount (how much customer saved)
              })
            }
          );
          
          console.log(`🎫 Increment response status: ${incrementResponse.status}`);
          
          if (incrementResponse.ok) {
            const incrementData = await incrementResponse.json();
            console.log(`✅ Coupon usage tracked successfully!`);
            console.log(`📊 Updated metrics:`, incrementData.campaign);
            console.log(`   - Usage: ${incrementData.campaign?.usageCount}/${appliedCoupon.campaign.usageLimit}`);
            console.log(`   - Revenue: ${incrementData.campaign?.revenue} MMK`);
            console.log(`   - Conversions: ${incrementData.campaign?.conversions}`);
          } else {
            const errorText = await incrementResponse.text();
            console.error('❌ Failed to track coupon usage:', errorText);
          }
        } catch (couponError) {
          console.error('❌ Error tracking coupon usage:', couponError);
          // Don't fail the order if coupon tracking fails
        }
      } else {
        console.log('⚠️ No coupon applied or campaign ID missing:', appliedCoupon);
      }
    } catch (error) {
      console.error("❌ Failed to save order:", error);
      setLoading(false);
      toast.error("Failed to place order. Please try again.", {
        description: String(error),
        duration: 5000,
      });
      return; // Stop order process
    }

    // Simulate payment processing
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    setLoading(false);
    setStep("success");
    
    // Clear cart after successful order
    setTimeout(() => {
      clearCart();
    }, 500);
  };

  // Success Screen
  if (step === "success") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 p-4">
        <div className="w-full max-w-2xl">
          <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-lg">
            <div className="flex items-center gap-3 border-b border-slate-200 px-6 py-5">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-emerald-500">
                <Check className="h-6 w-6 text-white" strokeWidth={2.5} />
              </div>
              <span className="text-sm font-bold uppercase tracking-wide text-emerald-700">
                Order Placed Successfully
              </span>
            </div>

            {/* Order Number Header */}
            <div className="flex items-center justify-between bg-blue-600 px-6 py-5">
              <div>
                <p className="text-xs text-blue-200 uppercase tracking-wider mb-1">Order Number</p>
                <p className="text-2xl font-bold text-white">{orderNumber}</p>
              </div>
              <ShoppingBag className="w-8 h-8 text-white opacity-80" strokeWidth={1.5} />
            </div>

            {/* ORDER ITEMS */}
            <div className="px-6 pt-5 pb-4 border-b border-slate-200">
              <h3 className="text-sm font-semibold text-slate-700 uppercase tracking-wide mb-4">Order Items</h3>
              <div className="space-y-3">
                {confirmedItems.map((item) => (
                  <div key={item.id} className="flex items-center gap-3">
                    <div className="w-12 h-12 bg-slate-100 rounded-lg overflow-hidden flex-shrink-0">
                      {item.image ? (
                        <img src={item.image} alt={item.sku} className="w-full h-full object-cover" />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center">
                          <Package className="w-5 h-5 text-slate-400" />
                        </div>
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold text-slate-900">{item.sku}</p>
                      <p className="text-xs text-slate-500">
                        Qty: {item.quantity} × {Math.round(Number(item.price) || 0)} MMK
                      </p>
                    </div>
                    <p className="text-sm font-semibold text-slate-900">{Math.round((Number(item.price) || 0) * item.quantity)} MMK</p>
                  </div>
                ))}
              </div>
            </div>

            {/* Price Summary */}
            <div className="px-6 py-4 border-b border-slate-200">
              <div className="space-y-2.5">
                <div className="flex justify-between text-sm">
                  <span className="text-slate-600">Subtotal</span>
                  <span className="font-medium text-slate-900">{(confirmedTotal + confirmedDiscount).toFixed(0)} MMK</span>
                </div>
                
                {confirmedCoupon && confirmedDiscount > 0 && (
                  <div className="flex justify-between text-sm">
                    <span className="text-emerald-600 flex items-center gap-1.5">
                      <Tag className="w-3.5 h-3.5" />
                      Discount ({confirmedCoupon.campaign?.code})
                    </span>
                    <span className="font-medium text-emerald-600">-{confirmedDiscount.toFixed(0)} MMK</span>
                  </div>
                )}
                
                <div className="flex justify-between text-sm">
                  <span className="text-slate-600">Shipping</span>
                  <span className="font-bold text-emerald-600">FREE</span>
                </div>
                
                <div className="pt-2 border-t border-slate-200 flex justify-between">
                  <span className="text-base font-semibold text-slate-900">Total</span>
                  <span className="text-xl font-bold text-blue-600">{confirmedTotal.toFixed(0)} MMK</span>
                </div>
              </div>
            </div>

            {/* Coupon Applied Section */}
            {confirmedCoupon && (
              <div className="px-6 py-4 bg-emerald-50 border-b border-slate-200">
                <p className="text-xs text-slate-500 uppercase tracking-wider mb-3">Coupon Applied</p>
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-emerald-500 rounded-lg flex items-center justify-center">
                    <Tag className="w-5 h-5 text-white" strokeWidth={2} />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-slate-900">{confirmedCoupon.campaign?.name || confirmedCoupon.campaign?.code}</p>
                    <p className="text-sm text-emerald-600">
                      {confirmedCoupon.campaign?.code} · 
                      {confirmedCoupon.campaign?.discountType === 'percentage' 
                        ? ` ${confirmedCoupon.campaign?.discount}% off` 
                        : ` ${confirmedCoupon.campaign?.discount} MMK off`}
                      {confirmedDiscount > 0 && ` · Saved ${confirmedDiscount.toFixed(0)} MMK`}
                    </p>
                  </div>
                </div>
              </div>
            )}
            
            {/* Payment Method */}
            {paymentMethod && (
              <div className="px-6 py-4 border-b border-slate-200">
                <p className="text-xs text-slate-500 uppercase tracking-wider mb-3">Payment Method</p>
                <div className="flex items-center gap-3">
                  {paymentMethod === "card" && (
                    <>
                      <div className="w-10 h-10 bg-blue-500 rounded-lg flex items-center justify-center">
                        <CreditCard className="w-5 h-5 text-white" strokeWidth={2} />
                      </div>
                      <span className="text-sm font-semibold text-slate-900">Credit / Debit Card</span>
                    </>
                  )}
                  {paymentMethod === "cash" && (
                    <>
                      <div className="w-10 h-10 bg-emerald-500 rounded-lg flex items-center justify-center">
                        <DollarSign className="w-5 h-5 text-white" strokeWidth={2} />
                      </div>
                      <span className="text-sm font-semibold text-slate-900">Cash on Delivery</span>
                    </>
                  )}
                  {paymentMethod === "bank" && (
                    <>
                      <div className="w-10 h-10 bg-purple-500 rounded-lg flex items-center justify-center">
                        <Banknote className="w-5 h-5 text-white" strokeWidth={2} />
                      </div>
                      <span className="text-sm font-semibold text-slate-900">Bank Transfer</span>
                    </>
                  )}
                  {paymentMethod === "kpay" && (
                    <>
                      <div className="w-10 h-10 bg-green-500 rounded-lg flex items-center justify-center">
                        <CreditCard className="w-5 h-5 text-white" strokeWidth={2} />
                      </div>
                      <span className="text-sm font-semibold text-slate-900">KPay</span>
                    </>
                  )}
                </div>
              </div>
            )}

            {/* Order Notes */}
            {confirmedOrderNote && (
              <div className="border-b border-slate-200 px-6 py-4">
                <p className="mb-2 text-xs font-medium uppercase tracking-wider text-slate-500">Order Note</p>
                <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3">
                  <p className="text-sm text-slate-800">{confirmedOrderNote}</p>
                </div>
              </div>
            )}

            {/* Shipping Information */}
            <div className="px-6 py-5">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 bg-blue-500 rounded-lg flex items-center justify-center">
                  <MapPin className="w-5 h-5 text-white" strokeWidth={2} />
                </div>
                <h3 className="text-base font-semibold text-slate-900">Shipping Information</h3>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-xs text-slate-500 uppercase tracking-wider mb-1">Full Name</p>
                  <p className="text-sm font-medium text-slate-900">{shippingInfo.fullName}</p>
                </div>
                <div>
                  <p className="text-xs text-slate-500 uppercase tracking-wider mb-1">Phone</p>
                  <p className="text-sm font-medium text-slate-900">{shippingInfo.phone}</p>
                </div>
                <div>
                  <p className="text-xs text-slate-500 uppercase tracking-wider mb-1">Email</p>
                  <p className="text-sm font-medium text-slate-900 truncate">{shippingInfo.email}</p>
                </div>
                <div className="col-span-2">
                  <p className="text-xs text-slate-500 uppercase tracking-wider mb-1">Delivery Address</p>
                  <p className="text-sm font-medium text-slate-900">
                    {[shippingInfo.address, shippingInfo.city, shippingInfo.zipCode, shippingInfo.country]
                      .filter(Boolean)
                      .join(", ")}
                  </p>
                </div>
              </div>
            </div>
          </div>

          <Button
            className="mt-4 h-12 w-full rounded-xl bg-blue-600 font-semibold text-white shadow-lg hover:bg-blue-700"
            onClick={onBack}
          >
            Continue Shopping
          </Button>

          <p className="mt-4 text-center text-sm text-slate-600">
            Thanks for purchasing from <span className="font-semibold text-slate-900">{storeName}</span>
          </p>
        </div>
      </div>
    );
  }

  const checkoutInputClass =
    "h-11 bg-slate-50 border-slate-200 text-slate-900 text-sm rounded-lg focus:border-slate-900 focus:ring-0 focus-visible:ring-0 focus-visible:ring-offset-0";

  const needsEmailInput = !effectiveUser?.email;

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:px-8">
        <Button variant="ghost" className="mb-6 hover:bg-white" onClick={onBack}>
          <ChevronLeft className="mr-2 h-4 w-4" />
          Continue Shopping
        </Button>

        <div className="grid grid-cols-1 gap-8 lg:grid-cols-5">
          {/* Form — main marketplace uses 3/5 width */}
          <div className="lg:col-span-3">
            <div className="space-y-6 rounded-xl border border-slate-200 bg-white p-6 shadow-md">
              {/* Contact */}
              <div>
                <h2 className="mb-3 text-lg font-semibold text-slate-900" style={{ fontFamily: "Rubik, sans-serif" }}>
                  Contact
                </h2>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="vs-name" className="mb-1.5 block text-sm font-normal text-slate-700">
                      Full Name
                    </Label>
                    <Input
                      id="vs-name"
                      placeholder="Enter your full name"
                      value={shippingInfo.fullName}
                      onChange={(e) => setShippingInfo({ ...shippingInfo, fullName: e.target.value })}
                      className={checkoutInputClass}
                    />
                  </div>
                  <div>
                    <Label htmlFor="vs-phone" className="mb-1.5 block text-sm font-normal text-slate-700">
                      Phone Number
                    </Label>
                    <Input
                      id="vs-phone"
                      type="tel"
                      placeholder="+95 9 XXX XXX XXX"
                      value={shippingInfo.phone}
                      onChange={(e) => setShippingInfo({ ...shippingInfo, phone: e.target.value })}
                      className={checkoutInputClass}
                    />
                  </div>
                </div>
                {needsEmailInput && (
                  <div className="mt-4">
                    <Label htmlFor="vs-email" className="mb-1.5 block text-sm font-normal text-slate-700">
                      Email
                    </Label>
                    <Input
                      id="vs-email"
                      type="email"
                      placeholder="you@example.com"
                      value={shippingInfo.email}
                      onChange={(e) => setShippingInfo({ ...shippingInfo, email: e.target.value })}
                      className={checkoutInputClass}
                    />
                  </div>
                )}
              </div>

              {/* Address */}
              <div>
                <h2 className="mb-3 text-lg font-semibold text-slate-900" style={{ fontFamily: "Rubik, sans-serif" }}>
                  Address
                </h2>
                <div className="space-y-4">
                  <div>
                    <Label htmlFor="vs-address" className="mb-1.5 block text-sm font-normal text-slate-700">
                      Address
                    </Label>
                    <Input
                      id="vs-address"
                      placeholder="No. 123, Main Street"
                      value={shippingInfo.address}
                      onChange={(e) => setShippingInfo({ ...shippingInfo, address: e.target.value })}
                      className={checkoutInputClass}
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label htmlFor="vs-city" className="mb-1.5 block text-sm font-normal text-slate-700">
                        City
                      </Label>
                      <Input
                        id="vs-city"
                        placeholder="Yangon"
                        value={shippingInfo.city}
                        onChange={(e) => setShippingInfo({ ...shippingInfo, city: e.target.value })}
                        className={checkoutInputClass}
                      />
                    </div>
                    <div>
                      <div className="mb-1.5 flex items-baseline justify-between">
                        <Label htmlFor="vs-zip" className="text-sm font-normal text-slate-700">
                          Postal Code
                        </Label>
                        <span className="text-xs text-slate-500">(optional)</span>
                      </div>
                      <Input
                        id="vs-zip"
                        placeholder="11011"
                        value={shippingInfo.zipCode}
                        onChange={(e) => setShippingInfo({ ...shippingInfo, zipCode: e.target.value })}
                        className={checkoutInputClass}
                      />
                    </div>
                  </div>
                  <div>
                    <Label htmlFor="vs-country" className="mb-1.5 block text-sm font-normal text-slate-700">
                      Country/Region
                    </Label>
                    <Input
                      id="vs-country"
                      placeholder="Myanmar"
                      value={shippingInfo.country}
                      onChange={(e) => setShippingInfo({ ...shippingInfo, country: e.target.value })}
                      className={checkoutInputClass}
                    />
                  </div>
                  <div>
                    <div className="mb-1.5 flex items-baseline justify-between">
                      <Label htmlFor="vs-notes" className="text-sm font-normal text-slate-700">
                        Delivery Notes
                      </Label>
                      <span className="text-xs text-slate-500">(optional)</span>
                    </div>
                    <Textarea
                      id="vs-notes"
                      placeholder="Add delivery instructions..."
                      value={orderNote}
                      onChange={(e) => setOrderNote(e.target.value)}
                      className="min-h-[80px] resize-none rounded-lg border-slate-200 bg-slate-50 text-sm focus:border-slate-900 focus:ring-0"
                      rows={3}
                    />
                  </div>
                </div>
              </div>

              {/* Payment */}
              <div>
                <h2 className="mb-3 text-lg font-semibold text-slate-900" style={{ fontFamily: "Rubik, sans-serif" }}>
                  Payment
                </h2>
                <div className="mb-4 rounded-lg border border-blue-200 bg-gradient-to-r from-blue-50 to-indigo-50 p-3">
                  <div className="flex items-start gap-2">
                    <Shield className="mt-0.5 h-4 w-4 flex-shrink-0 text-blue-600" />
                    <div>
                      <p className="mb-0.5 text-xs font-semibold text-blue-900">💳 Prepaid Payment Required</p>
                      <p className="text-xs text-blue-800">All orders require payment completion before processing.</p>
                    </div>
                  </div>
                </div>

                <div className="space-y-3">
                  <button
                    type="button"
                    onClick={() => setPaymentMethod("card")}
                    className={`w-full rounded-lg border p-4 text-left transition-all ${
                      paymentMethod === "card"
                        ? "border-slate-900 bg-slate-50"
                        : "border-slate-300 bg-white hover:border-slate-400"
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <div
                        className={`flex h-4 w-4 items-center justify-center rounded-full border-2 ${
                          paymentMethod === "card" ? "border-slate-900" : "border-slate-300"
                        }`}
                      >
                        {paymentMethod === "card" && <div className="h-2 w-2 rounded-full bg-slate-900" />}
                      </div>
                      <span className="text-sm font-medium text-slate-900">Credit / Debit Card</span>
                    </div>
                  </button>
                  <button
                    type="button"
                    onClick={() => setPaymentMethod("kpay")}
                    className={`w-full rounded-lg border p-4 text-left transition-all ${
                      paymentMethod === "kpay"
                        ? "border-slate-900 bg-slate-50"
                        : "border-slate-300 bg-white hover:border-slate-400"
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <div
                        className={`flex h-4 w-4 items-center justify-center rounded-full border-2 ${
                          paymentMethod === "kpay" ? "border-slate-900" : "border-slate-300"
                        }`}
                      >
                        {paymentMethod === "kpay" && <div className="h-2 w-2 rounded-full bg-slate-900" />}
                      </div>
                      <span className="text-sm font-medium text-slate-900">KPay</span>
                    </div>
                  </button>
                  <button
                    type="button"
                    onClick={() => setPaymentMethod("bank")}
                    className={`w-full rounded-lg border p-4 text-left transition-all ${
                      paymentMethod === "bank"
                        ? "border-slate-900 bg-slate-50"
                        : "border-slate-300 bg-white hover:border-slate-400"
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <div
                        className={`flex h-4 w-4 items-center justify-center rounded-full border-2 ${
                          paymentMethod === "bank" ? "border-slate-900" : "border-slate-300"
                        }`}
                      >
                        {paymentMethod === "bank" && <div className="h-2 w-2 rounded-full bg-slate-900" />}
                      </div>
                      <span className="text-sm font-medium text-slate-900">Bank Transfer</span>
                    </div>
                  </button>
                </div>

                {paymentMethod === "card" && (
                  <div className="mt-6 space-y-4 border-t border-slate-200 pt-6">
                    <div className="mb-4 rounded-lg border border-blue-200 bg-blue-50 p-3">
                      <p className="text-sm font-semibold text-blue-900">💳 Credit / Debit Card Payment</p>
                    </div>
                    <div className="mb-4 rounded-lg border border-amber-300 bg-gradient-to-r from-amber-50 to-yellow-50 p-4">
                      <div className="flex items-start gap-2">
                        <div className="flex-shrink-0">
                          <div className="flex h-5 w-5 items-center justify-center rounded-full bg-amber-500">
                            <span className="text-xs font-bold text-white">T</span>
                          </div>
                        </div>
                        <div className="flex-1">
                          <p className="mb-2 text-sm font-bold text-amber-900">🧪 Test Mode - Use These Cards:</p>
                          <div className="space-y-1.5 text-xs text-amber-800">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="rounded border border-amber-200 bg-white px-2 py-0.5 font-mono">4242 4242 4242 4242</span>
                              <span>→ ✅ Success</span>
                            </div>
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="rounded border border-amber-200 bg-white px-2 py-0.5 font-mono">4000 0000 0000 0002</span>
                              <span>→ ❌ Card Declined</span>
                            </div>
                            <p className="mt-2 italic text-amber-700">Use any future expiry (e.g. 12/28) and any 3-digit CVV</p>
                          </div>
                        </div>
                      </div>
                    </div>
                    <div>
                      <label className="mb-2 block text-sm font-semibold text-slate-700">Card Number *</label>
                      <Input
                        placeholder="1234 5678 9012 3456"
                        maxLength={19}
                        value={paymentInfo.cardNumber}
                        onChange={(e) => {
                          const value = e.target.value
                            .replace(/\s/g, "")
                            .replace(/(\d{4})/g, "$1 ")
                            .trim();
                          setPaymentInfo({ ...paymentInfo, cardNumber: value });
                        }}
                        className={`${checkoutInputClass} border-slate-300`}
                      />
                    </div>
                    <div>
                      <label className="mb-2 block text-sm font-semibold text-slate-700">Cardholder Name *</label>
                      <Input
                        placeholder="JOHN DOE"
                        value={paymentInfo.cardName}
                        onChange={(e) => setPaymentInfo({ ...paymentInfo, cardName: e.target.value.toUpperCase() })}
                        className={`${checkoutInputClass} border-slate-300`}
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="mb-2 block text-sm font-semibold text-slate-700">Expiry Date *</label>
                        <Input
                          placeholder="MM/YY"
                          maxLength={5}
                          value={paymentInfo.expiryDate}
                          onChange={(e) => {
                            let value = e.target.value.replace(/\D/g, "");
                            if (value.length >= 2) {
                              value = value.slice(0, 2) + "/" + value.slice(2, 4);
                            }
                            setPaymentInfo({ ...paymentInfo, expiryDate: value });
                          }}
                          className={`${checkoutInputClass} border-slate-300`}
                        />
                      </div>
                      <div>
                        <label className="mb-2 block text-sm font-semibold text-slate-700">CVV *</label>
                        <Input
                          type="password"
                          placeholder="123"
                          maxLength={4}
                          value={paymentInfo.cvv}
                          onChange={(e) =>
                            setPaymentInfo({ ...paymentInfo, cvv: e.target.value.replace(/\D/g, "") })
                          }
                          className={`${checkoutInputClass} border-slate-300`}
                        />
                      </div>
                    </div>
                    <div className="mt-4 rounded-lg border border-blue-200 bg-blue-50 p-4">
                      <p className="text-sm text-blue-900">🔒 Your payment information is encrypted and secure</p>
                    </div>
                  </div>
                )}

                {paymentMethod === "bank" && (
                  <div className="mt-6 space-y-4 border-t border-slate-200 pt-6">
                    <div className="mb-4 rounded-lg border border-purple-200 bg-purple-50 p-3">
                      <p className="text-sm font-semibold text-purple-900">🏦 Bank Transfer</p>
                    </div>
                    <div className="rounded-xl border border-slate-200 bg-slate-50 p-6">
                      <h3 className="mb-4 font-bold text-slate-900">Transfer Details</h3>
                      <div className="space-y-3 text-sm">
                        <div className="flex justify-between border-b border-slate-200 py-2">
                          <span className="text-slate-600">Bank Name:</span>
                          <span className="font-semibold text-slate-900">Myanmar Bank</span>
                        </div>
                        <div className="flex justify-between border-b border-slate-200 py-2">
                          <span className="text-slate-600">Account Name:</span>
                          <span className="font-semibold text-slate-900">{storeName}</span>
                        </div>
                        <div className="flex justify-between border-b border-slate-200 py-2">
                          <span className="text-slate-600">Account Number:</span>
                          <span className="font-mono font-semibold text-slate-900">1234-5678-9012</span>
                        </div>
                        <div className="flex justify-between py-2">
                          <span className="text-slate-600">Amount:</span>
                          <span className="text-lg font-bold text-blue-600">{finalTotal.toFixed(0)} MMK</span>
                        </div>
                      </div>
                    </div>
                    <div className="rounded-lg border border-blue-200 bg-blue-50 p-4">
                      <p className="text-sm text-blue-900">
                        📌 <strong>Important:</strong> Please complete the bank transfer and include your order number in the
                        reference. Your order will be processed after payment confirmation.
                      </p>
                    </div>
                  </div>
                )}

                {paymentMethod === "kpay" && (
                  <div className="mt-6 space-y-4 border-t border-slate-200 pt-6">
                    <div className="mb-4 rounded-lg border border-emerald-200 bg-emerald-50 p-3">
                      <p className="text-sm font-semibold text-emerald-900">💳 KPay Payment</p>
                    </div>
                    <div className="rounded-xl border border-slate-200 bg-slate-50 p-6">
                      <h3 className="mb-4 font-bold text-slate-900">Scan QR Code to Pay</h3>
                      <div className="mb-6 flex justify-center">
                        <div className="flex h-64 w-64 items-center justify-center overflow-hidden rounded-lg border-2 border-slate-200 bg-white">
                          {kpayQrCode ? (
                            <img src={kpayQrCode} alt="KPay QR Code" className="h-full w-full object-contain" />
                          ) : (
                            <div className="px-4 text-center">
                              <CreditCard className="mx-auto mb-2 h-12 w-12 text-slate-400" />
                              <p className="text-sm text-slate-500">No QR code available</p>
                            </div>
                          )}
                        </div>
                      </div>
                      <div className="space-y-3 text-sm">
                        <div className="flex justify-between border-b border-slate-200 py-2">
                          <span className="text-slate-600">KPay Phone Number:</span>
                          <span className="font-mono font-semibold text-slate-900">{kpayPhone}</span>
                        </div>
                        <div className="flex justify-between py-2">
                          <span className="text-slate-600">Amount to Pay:</span>
                          <span className="text-lg font-bold text-emerald-600">{finalTotal.toFixed(0)} MMK</span>
                        </div>
                      </div>
                    </div>
                    <div className="rounded-lg border border-blue-200 bg-blue-50 p-4">
                      <p className="text-sm text-blue-900">📱 Complete payment in KPay, then use Proceed Order below.</p>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Order Summary — 2/5 width, sticky (main marketplace layout) */}
          <div className="lg:col-span-2">
            <div className="sticky top-24 flex max-h-[calc(100vh-1.75rem)] flex-col overflow-hidden rounded-xl border border-slate-200 bg-white p-6 shadow-md">
              <div className="mb-5 flex-shrink-0">
                <h2 className="text-lg font-semibold text-slate-900" style={{ fontFamily: "Rubik, sans-serif" }}>
                  Order Summary
                </h2>
                <p className="mt-0.5 text-xs text-slate-500">{storeName}</p>
              </div>

              <div className="scrollbar-thin mb-4 flex-1 space-y-4 overflow-y-auto">
              <div className="space-y-3 pb-4">
                {items.map((item) => (
                  <div key={item.id} className="flex gap-3 border-b border-slate-200 pb-3">
                    <div className="h-16 w-16 shrink-0 overflow-hidden rounded-lg border border-slate-200 bg-white">
                      {item.image ? (
                        <img src={item.image} alt={item.sku} className="h-full w-full object-cover" />
                      ) : (
                        <div className="flex h-full w-full items-center justify-center">
                          <Package className="h-6 w-6 text-slate-400" />
                        </div>
                      )}
                    </div>
                    <div className="flex min-w-0 flex-1 items-start justify-between gap-2">
                      <div>
                        <p className="text-sm font-semibold text-slate-900">{item.sku}</p>
                        <p className="mt-1 text-sm font-medium text-slate-500">
                          Qty: {item.quantity} × {Math.round(parseFloat(String(item.price)))} MMK
                        </p>
                      </div>
                      <p className="text-sm font-semibold text-slate-900">
                        {Math.round(parseFloat(String(item.price)) * item.quantity)} MMK
                      </p>
                    </div>
                  </div>
                ))}
              </div>

              <div className="border-b border-slate-200 pb-4">
                <h4 className="mb-3 text-sm font-semibold text-slate-900">Coupon Code</h4>

                {!appliedCoupon ? (
                  <div>
                    <div className="flex items-center gap-2">
                      <Input
                        placeholder="ENTER COUPON CODE"
                        value={couponCode}
                        onChange={(e) => {
                          setCouponCode(e.target.value.toUpperCase());
                          setCouponError("");
                        }}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") handleApplyCoupon();
                        }}
                        disabled={couponLoading}
                        className={`${checkoutInputClass} flex-1 uppercase`}
                      />
                      <Button
                        type="button"
                        className="shrink-0 bg-slate-200 px-5 font-medium text-slate-800 hover:bg-slate-300"
                        onClick={handleApplyCoupon}
                        disabled={couponLoading || !couponCode.trim()}
                      >
                        {couponLoading ? (
                          <>
                            <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin mr-2"></div>
                            Applying...
                          </>
                        ) : (
                          "Apply"
                        )}
                      </Button>
                    </div>
                    {couponError && (
                      <p className="text-xs text-red-600 mt-2 flex items-center gap-1">
                        <XCircle className="w-3 h-3" />
                        {couponError}
                      </p>
                    )}
                  </div>
                ) : (
                  <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <CheckCircle className="w-5 h-5 text-emerald-600" />
                        <div>
                          <p className="text-sm font-bold text-emerald-700">{appliedCoupon.campaign?.code}</p>
                          <p className="text-xs text-emerald-600">
                            {appliedCoupon.campaign?.discountType === 'percentage' 
                              ? `${appliedCoupon.campaign?.discount}% off` 
                              : `${appliedCoupon.campaign?.discount} MMK off`}
                            {discountAmount > 0 && ` · You save ${discountAmount.toFixed(0)} MMK!`}
                          </p>
                        </div>
                      </div>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          setAppliedCoupon(null);
                          setCouponCode('');
                        }}
                        className="text-red-600 hover:text-red-700 hover:bg-red-50 h-8 px-2"
                      >
                        <X className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                )}
              </div>

              <div className="space-y-3 border-t border-slate-200 pt-4">
                <div className="flex justify-between text-sm">
                  <span className="text-slate-600">Subtotal</span>
                  <span className="font-semibold text-slate-900">{totalPrice.toFixed(0)} MMK</span>
                </div>
                
                {appliedCoupon && discountAmount > 0 && (
                  <div className="flex justify-between text-sm text-emerald-600">
                    <span className="flex items-center gap-1">Discount</span>
                    <span className="font-semibold">-{discountAmount.toFixed(0)} MMK</span>
                  </div>
                )}

                <div className="flex justify-between text-sm">
                  <span className="text-slate-600">Shipping</span>
                  <span className="font-bold text-emerald-600">FREE</span>
                </div>

                <div className="flex items-center justify-between pt-1">
                  <span className="text-sm font-semibold text-slate-900">Total</span>
                  <span className="text-base font-bold text-slate-900">{finalTotal.toFixed(0)} MMK</span>
                </div>
              </div>
              </div>

              <Button
                type="button"
                className="mt-4 flex h-11 w-full shrink-0 items-center justify-center rounded-xl border-2 border-orange-500 bg-transparent text-sm font-semibold leading-normal text-slate-900 transition-all duration-300 hover:border-green-600 hover:bg-green-600 hover:text-white"
                size="lg"
                onClick={() => void handlePlaceOrder()}
                disabled={loading}
              >
                {loading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Processing...
                  </>
                ) : paymentMethod === "card" ? (
                  `Pay ${finalTotal.toFixed(0)} MMK`
                ) : (
                  "I've Completed Payment"
                )}
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}