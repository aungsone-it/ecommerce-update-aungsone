import { projectId, publicAnonKey } from "../../../utils/supabase/info";
import { useState, useEffect } from "react";
import { ArrowLeft, CreditCard, ShoppingBag, Check, Package, Truck, MapPin, Mail, Phone, User, Banknote, Wallet, DollarSign, Tag, X, XCircle, CheckCircle, Shield, Clock } from "lucide-react";
import { Button } from "./ui/button";
import { Card } from "./ui/card";
import { Input } from "./ui/input";
import { Textarea } from "./ui/textarea";
import { useCart } from "./CartContext";
import { useAuth } from "../contexts/AuthContext";
import { toast } from "sonner";

interface CheckoutProps {
  onBack: () => void;
  storeName: string;
  vendorId?: string;
  vendorName?: string;
}

export function Checkout({ onBack, storeName, vendorId, vendorName }: CheckoutProps) {
  const { items, totalPrice, clearCart } = useCart();
  const { user } = useAuth(); // Get logged-in user
  const [step, setStep] = useState<"shipping" | "payment" | "success">("shipping");
  const [loading, setLoading] = useState(false);

  // Shipping Form State - Pre-fill from saved addresses
  const [shippingInfo, setShippingInfo] = useState({
    fullName: "",
    email: "",
    phone: "",
    address: "",
    city: "",
    zipCode: ""
  });

  // Load user data and saved addresses on mount
  useEffect(() => {
    console.log("🔍 User data in Checkout:", user); // DEBUG: Check what user contains
    
    // 🔥 Load saved shipping addresses from DATABASE (not localStorage!)
    const loadUserAddresses = async () => {
      if (!user?.id) {
        console.log("⚠️ No user logged in, skipping address load");
        return;
      }
      
      try {
        const response = await fetch(
          `https://${projectId}.supabase.co/functions/v1/make-server-16010b6f/customers/${user.id}/addresses`,
          {
            headers: {
              'Authorization': `Bearer ${publicAnonKey}`,
            },
          }
        );
        
        if (response.ok) {
          const data = await response.json();
          const addresses = data.addresses || [];
          
          if (addresses.length > 0) {
            // Find default address or use first address
            const defaultAddress = addresses.find((addr: any) => addr.isDefault) || addresses[0];
            console.log("📦 Found saved address from database:", defaultAddress);
            
            // Pre-fill form with default address
            setShippingInfo({
              fullName: defaultAddress?.recipientName || user?.name || "",
              email: user?.email || "",
              phone: defaultAddress?.phone || user?.phone || "",
              address: defaultAddress?.addressLine1 || "",
              city: defaultAddress?.city || "",
              zipCode: defaultAddress?.zipCode || ""
            });
            console.log("✅ Auto-filled checkout form with saved address from database");
            return;
          }
        }
      } catch (error) {
        console.error("Failed to load addresses from database:", error);
      }
    };
    
    // Try database first
    if (user?.id) {
      loadUserAddresses();
    } else {
      // Fallback to user data if no saved addresses
      if (user) {
        setShippingInfo({
          fullName: user?.name || "",
          email: user?.email || "",
          phone: user?.phone || "",
          address: "",
          city: "",
          zipCode: ""
        });
        console.log("✅ Auto-filled checkout form with user profile data");
      }
    }
  }, [user]);

  // Order Note
  const [orderNote, setOrderNote] = useState("");

  // Payment Form State
  const [paymentMethod, setPaymentMethod] = useState<"card" | "bank" | "kpay" | "">("");
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

  const handleShippingSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setStep("payment");
  };

  const handlePaymentSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    // 🚫 Block KPay and Bank Transfer - Show Coming Soon notification
    if (paymentMethod === "kpay" || paymentMethod === "bank") {
      toast.info("🚀 Coming Soon! This payment method will be available soon.", { 
        duration: 4000,
        style: {
          background: '#3b82f6',
          color: '#fff',
        }
      });
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
        customer: shippingInfo.fullName,
        customerName: shippingInfo.fullName,
        email: shippingInfo.email,
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
          productId: item.id,
          sku: item.sku,
          name: item.name || item.sku,
          quantity: item.quantity,
          price: item.price,
          image: item.image,
          vendorId: vendorId || item.vendor || item.vendorId, // 🔥 Include vendor ID from props or item
          vendor: vendorId || item.vendor || item.vendorId,
        })),
        shippingAddress: `${shippingInfo.address}, ${shippingInfo.city}, ${shippingInfo.zipCode}`,
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
      if (user?.id) {
        try {
          console.log(`📍 Saving shipping address for user ${user.id}`);
          
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
            `https://${projectId}.supabase.co/functions/v1/make-server-16010b6f/customers/${user.id}/addresses`,
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
              `https://${projectId}.supabase.co/functions/v1/make-server-16010b6f/customers/${user.id}/addresses`,
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
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
        <div className="max-w-2xl w-full">
          {/* Success Message */}
          <div className="bg-white rounded-t-xl px-6 py-4 flex items-center gap-3 border border-slate-200">
            <div className="w-8 h-8 bg-emerald-500 rounded-full flex items-center justify-center">
              <Check className="w-5 h-5 text-white" strokeWidth={2.5} />
            </div>
            <span className="text-sm font-semibold text-emerald-700 uppercase tracking-wide">Order Placed Successfully</span>
          </div>

          {/* Order Summary Card */}
          <Card className="rounded-t-none border-t-0 overflow-hidden shadow-lg">
            {/* Order Number Header */}
            <div className="bg-blue-600 px-6 py-5 flex items-center justify-between">
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
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-slate-900">{item.sku}</p>
                      <p className="text-xs text-slate-500">Qty: {item.quantity} × {Math.round(Number(item.price) || 0)} MMK</p>
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
                  <span className="font-medium text-emerald-600">FREE</span>
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
              <div className="px-6 py-4 bg-amber-50 border-b border-slate-200">
                <p className="text-xs text-slate-500 uppercase tracking-wider mb-2">Order Note</p>
                <p className="text-sm text-slate-700">{confirmedOrderNote}</p>
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
                <div>
                  <p className="text-xs text-slate-500 uppercase tracking-wider mb-1">Delivery Address</p>
                  <p className="text-sm font-medium text-slate-900">
                    {shippingInfo.address}, {shippingInfo.city}, {shippingInfo.zipCode}
                  </p>
                </div>
              </div>
            </div>
          </Card>

          {/* Action Button */}
          <Button 
            className="w-full bg-blue-600 hover:bg-blue-700 text-white h-12 font-semibold rounded-xl shadow-lg mt-4" 
            onClick={onBack}
          >
            Continue Shopping
          </Button>

          {/* Footer Text */}
          <p className="text-sm text-center text-slate-600 mt-4">
            Thanks for purchasing from <span className="font-semibold text-slate-900">{storeName}</span>
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Header */}
      <div className="bg-white border-b border-slate-200 sticky top-0 z-40 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between py-4">
            <div className="flex items-center gap-4">
              <Button variant="ghost" size="sm" onClick={onBack}>
                <ArrowLeft className="w-4 h-4 mr-2" />
                Back to Store
              </Button>
              <div>
                <h1 className="text-2xl font-bold text-slate-900">Checkout</h1>
                <p className="text-sm text-slate-600">{storeName}</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Progress Steps */}
      <div className="bg-white border-b border-slate-200">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className={`w-10 h-10 rounded-full flex items-center justify-center ${
                step === "shipping" ? "bg-blue-600 text-white" : "bg-emerald-600 text-white"
              }`}>
                {step === "shipping" ? "1" : <Check className="w-6 h-6" />}
              </div>
              <span className="font-semibold text-slate-900 hidden sm:inline">Shipping Info</span>
            </div>
            <div className="flex-1 h-1 bg-slate-200 mx-4">
              <div className={`h-full transition-all duration-500 ${
                step === "payment" || step === "success" ? "bg-blue-600 w-full" : "bg-blue-600 w-0"
              }`}></div>
            </div>
            <div className="flex items-center gap-2">
              <div className={`w-10 h-10 rounded-full flex items-center justify-center ${
                step === "payment" ? "bg-blue-600 text-white" : step === "success" ? "bg-emerald-600 text-white" : "bg-slate-200 text-slate-600"
              }`}>
                {step === "success" ? <Check className="w-6 h-6" /> : "2"}
              </div>
              <span className="font-semibold text-slate-900 hidden sm:inline">Payment</span>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Form Section */}
          <div className="lg:col-span-2">
            {step === "shipping" ? (
              <Card className="p-6">
                <div className="flex items-center gap-3 mb-6">
                  <div className="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center">
                    <Truck className="w-6 h-6 text-blue-600" />
                  </div>
                  <div>
                    <h2 className="text-xl font-bold text-slate-900">Shipping Information</h2>
                    <p className="text-sm text-slate-600">Where should we deliver your order?</p>
                  </div>
                </div>

                <form onSubmit={handleShippingSubmit} className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-semibold text-slate-700 mb-2">
                        <User className="w-4 h-4 inline mr-1" />
                        Full Name *
                      </label>
                      <Input
                        required
                        placeholder="John Doe"
                        value={shippingInfo.fullName}
                        onChange={(e) => setShippingInfo({...shippingInfo, fullName: e.target.value})}
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-semibold text-slate-700 mb-2">
                        <Mail className="w-4 h-4 inline mr-1" />
                        Email *
                      </label>
                      <Input
                        required
                        type="email"
                        placeholder="john@example.com"
                        value={shippingInfo.email}
                        onChange={(e) => setShippingInfo({...shippingInfo, email: e.target.value})}
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-semibold text-slate-700 mb-2">
                      <Phone className="w-4 h-4 inline mr-1" />
                      Phone Number *
                    </label>
                    <Input
                      required
                      type="number"
                      placeholder="+95 9 XXX XXX XXX"
                      value={shippingInfo.phone}
                      onChange={(e) => setShippingInfo({...shippingInfo, phone: e.target.value})}
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-semibold text-slate-700 mb-2">
                      <MapPin className="w-4 h-4 inline mr-1" />
                      Street Address *
                    </label>
                    <Input
                      required
                      placeholder="123 Main Street, Apt 4B"
                      value={shippingInfo.address}
                      onChange={(e) => setShippingInfo({...shippingInfo, address: e.target.value})}
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-semibold text-slate-700 mb-2">City *</label>
                      <Input
                        required
                        placeholder="New York"
                        value={shippingInfo.city}
                        onChange={(e) => setShippingInfo({...shippingInfo, city: e.target.value})}
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-semibold text-slate-700 mb-2">ZIP Code *</label>
                      <Input
                        required
                        placeholder="10001"
                        value={shippingInfo.zipCode}
                        onChange={(e) => setShippingInfo({...shippingInfo, zipCode: e.target.value})}
                      />
                    </div>
                  </div>

                  <div className="mt-4">
                    <label className="block text-sm font-semibold text-slate-700 mb-2">Order Note</label>
                    <Textarea
                      placeholder="Add any special instructions here"
                      value={orderNote}
                      onChange={(e) => setOrderNote(e.target.value)}
                    />
                  </div>

                  <Button 
                    type="submit"
                    className="w-full bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 text-white h-12 text-base font-semibold shadow-lg shadow-blue-600/30 mt-6"
                  >
                    Continue to Payment
                  </Button>
                </form>
              </Card>
            ) : (
              <Card className="p-6">
                {/* Prepaid Notice Banner */}
                <div className="bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-200 rounded-lg p-4 mb-6">
                  <div className="flex items-start gap-3">
                    <Shield className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
                    <div>
                      <p className="text-sm font-semibold text-blue-900 mb-1">💳 Prepaid Payment Required</p>
                      <p className="text-xs text-blue-800">All orders require payment completion before processing. Your order will be confirmed after successful payment.</p>
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-3 mb-6">
                  <div className="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center">
                    <Wallet className="w-6 h-6 text-blue-600" />
                  </div>
                  <div>
                    <h2 className="text-xl font-bold text-slate-900">Payment Method</h2>
                    <p className="text-sm text-slate-600">Complete payment to confirm your order</p>
                  </div>
                </div>

                {/* Payment Method Selection */}
                {!paymentMethod ? (
                  <div className="space-y-4">
                    <div className="grid grid-cols-1 gap-4">
                      {/* Credit/Debit Card */}
                      <button
                        type="button"
                        onClick={() => setPaymentMethod("card")}
                        className="flex items-center gap-4 p-4 border-2 border-slate-200 rounded-xl hover:border-blue-500 hover:bg-blue-50 transition-all group"
                      >
                        <div className="w-12 h-12 bg-gradient-to-br from-blue-500 to-blue-600 rounded-lg flex items-center justify-center shadow-md">
                          <CreditCard className="w-6 h-6 text-white" />
                        </div>
                        <div className="flex-1 text-left">
                          <h3 className="text-base font-bold text-slate-900 group-hover:text-blue-600">Credit / Debit Card</h3>
                          <p className="text-sm text-slate-600">Pay securely with your card</p>
                        </div>
                        <div className="text-slate-400 group-hover:text-blue-600">
                          <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                          </svg>
                        </div>
                      </button>

                      {/* Bank Transfer */}
                      <button
                        type="button"
                        onClick={() => setPaymentMethod("bank")}
                        className="flex items-center gap-4 p-4 border-2 border-slate-200 rounded-xl hover:border-purple-500 hover:bg-purple-50 transition-all group"
                      >
                        <div className="w-12 h-12 bg-gradient-to-br from-purple-500 to-purple-600 rounded-lg flex items-center justify-center shadow-md">
                          <Banknote className="w-6 h-6 text-white" />
                        </div>
                        <div className="flex-1 text-left">
                          <h3 className="text-base font-bold text-slate-900 group-hover:text-purple-600">Bank Transfer</h3>
                          <p className="text-sm text-slate-600">Direct bank account transfer</p>
                        </div>
                        <div className="text-slate-400 group-hover:text-purple-600">
                          <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                          </svg>
                        </div>
                      </button>

                      {/* KPay */}
                      <button
                        type="button"
                        onClick={() => setPaymentMethod("kpay")}
                        className="flex items-center gap-4 p-4 border-2 border-slate-200 rounded-xl hover:border-green-500 hover:bg-green-50 transition-all group"
                      >
                        <div className="w-12 h-12 bg-gradient-to-br from-green-500 to-green-600 rounded-lg flex items-center justify-center shadow-md">
                          <CreditCard className="w-6 h-6 text-white" />
                        </div>
                        <div className="flex-1 text-left">
                          <h3 className="text-base font-bold text-slate-900 group-hover:text-green-600">KPay</h3>
                          <p className="text-sm text-slate-600">Pay with KPay</p>
                        </div>
                        <div className="text-slate-400 group-hover:text-green-600">
                          <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                          </svg>
                        </div>
                      </button>
                    </div>

                    <Button 
                      type="button"
                      variant="outline"
                      className="w-full mt-4"
                      onClick={() => setStep("shipping")}
                    >
                      Back to Shipping
                    </Button>
                  </div>
                ) : paymentMethod === "card" ? (
                  /* Credit Card Form */
                  <form onSubmit={handlePaymentSubmit} className="space-y-4">
                    <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 mb-4">
                      <p className="text-sm text-blue-900 font-semibold">💳 Credit / Debit Card Payment</p>
                    </div>

                    {/* Test Mode Banner */}
                    <div className="bg-gradient-to-r from-amber-50 to-yellow-50 border border-amber-300 rounded-lg p-4 mb-4">
                      <div className="flex items-start gap-2">
                        <div className="flex-shrink-0">
                          <div className="w-5 h-5 rounded-full bg-amber-500 flex items-center justify-center">
                            <span className="text-white text-xs font-bold">T</span>
                          </div>
                        </div>
                        <div className="flex-1">
                          <p className="text-sm font-bold text-amber-900 mb-2">🧪 Test Mode - Use These Cards:</p>
                          <div className="space-y-1.5 text-xs text-amber-800">
                            <div className="flex items-center gap-2">
                              <span className="font-mono bg-white px-2 py-0.5 rounded border border-amber-200">4242 4242 4242 4242</span>
                              <span>→ ✅ Success</span>
                            </div>
                            <div className="flex items-center gap-2">
                              <span className="font-mono bg-white px-2 py-0.5 rounded border border-amber-200">4000 0000 0000 0002</span>
                              <span>→ ❌ Card Declined</span>
                            </div>
                            <div className="flex items-center gap-2">
                              <span className="font-mono bg-white px-2 py-0.5 rounded border border-amber-200">4000 0000 0000 9995</span>
                              <span>→ ❌ Insufficient Funds</span>
                            </div>
                            <div className="flex items-center gap-2">
                              <span className="font-mono bg-white px-2 py-0.5 rounded border border-amber-200">4000 0000 0000 0069</span>
                              <span>→ ❌ Card Expired</span>
                            </div>
                            <p className="text-xs text-amber-700 mt-2 italic">Use any future date for expiry (e.g., 12/28) and any 3-digit CVV</p>
                          </div>
                        </div>
                      </div>
                    </div>

                    <div>
                      <label className="block text-sm font-semibold text-slate-700 mb-2">Card Number *</label>
                      <Input
                        required
                        placeholder="1234 5678 9012 3456"
                        maxLength={19}
                        value={paymentInfo.cardNumber}
                        onChange={(e) => {
                          const value = e.target.value.replace(/\s/g, '').replace(/(\d{4})/g, '$1 ').trim();
                          setPaymentInfo({...paymentInfo, cardNumber: value});
                        }}
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-semibold text-slate-700 mb-2">Cardholder Name *</label>
                      <Input
                        required
                        placeholder="JOHN DOE"
                        value={paymentInfo.cardName}
                        onChange={(e) => setPaymentInfo({...paymentInfo, cardName: e.target.value.toUpperCase()})}
                      />
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-semibold text-slate-700 mb-2">Expiry Date *</label>
                        <Input
                          required
                          placeholder="MM/YY"
                          maxLength={5}
                          value={paymentInfo.expiryDate}
                          onChange={(e) => {
                            let value = e.target.value.replace(/\D/g, '');
                            if (value.length >= 2) {
                              value = value.slice(0, 2) + '/' + value.slice(2, 4);
                            }
                            setPaymentInfo({...paymentInfo, expiryDate: value});
                          }}
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-semibold text-slate-700 mb-2">CVV *</label>
                        <Input
                          required
                          type="password"
                          placeholder="123"
                          maxLength={4}
                          value={paymentInfo.cvv}
                          onChange={(e) => setPaymentInfo({...paymentInfo, cvv: e.target.value.replace(/\D/g, '')})}
                        />
                      </div>
                    </div>

                    <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mt-6">
                      <p className="text-sm text-blue-900">
                        🔒 Your payment information is encrypted and secure
                      </p>
                    </div>

                    <div className="flex gap-3 mt-6">
                      <Button 
                        type="button"
                        variant="outline"
                        className="flex-1"
                        onClick={() => setPaymentMethod("")}
                      >
                        Back
                      </Button>
                      <Button 
                        type="submit"
                        className="flex-1 bg-gradient-to-r from-emerald-600 to-emerald-700 hover:from-emerald-700 hover:to-emerald-800 text-white h-12 text-base font-semibold shadow-lg shadow-emerald-600/30"
                        disabled={loading}
                      >
                        {loading ? (
                          <>
                            <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin mr-2"></div>
                            Processing...
                          </>
                        ) : (
                          `Pay ${finalTotal.toFixed(0)} MMK`
                        )}
                      </Button>
                    </div>
                  </form>
                ) : paymentMethod === "bank" ? (
                  /* Bank Transfer Instructions */
                  <form onSubmit={handlePaymentSubmit} className="space-y-4">
                    <div className="bg-purple-50 border border-purple-200 rounded-lg p-3 mb-4">
                      <p className="text-sm text-purple-900 font-semibold">🏦 Bank Transfer</p>
                    </div>

                    <div className="bg-slate-50 border border-slate-200 rounded-xl p-6">
                      <h3 className="font-bold text-slate-900 mb-4">Transfer Details</h3>
                      <div className="space-y-3 text-sm">
                        <div className="flex justify-between py-2 border-b border-slate-200">
                          <span className="text-slate-600">Bank Name:</span>
                          <span className="font-semibold text-slate-900">Myanmar Bank</span>
                        </div>
                        <div className="flex justify-between py-2 border-b border-slate-200">
                          <span className="text-slate-600">Account Name:</span>
                          <span className="font-semibold text-slate-900">{storeName}</span>
                        </div>
                        <div className="flex justify-between py-2 border-b border-slate-200">
                          <span className="text-slate-600">Account Number:</span>
                          <span className="font-semibold text-slate-900 font-mono">1234-5678-9012</span>
                        </div>
                        <div className="flex justify-between py-2">
                          <span className="text-slate-600">Amount:</span>
                          <span className="font-bold text-blue-600 text-lg">{finalTotal.toFixed(0)} MMK</span>
                        </div>
                      </div>
                    </div>

                    <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                      <p className="text-sm text-blue-900">
                        📌 <strong>Important:</strong> Please complete the bank transfer and include your order number in the reference. Your order will be processed after payment confirmation.
                      </p>
                    </div>

                    <div className="flex gap-3 mt-6">
                      <Button 
                        type="button"
                        variant="outline"
                        className="flex-1"
                        onClick={() => setPaymentMethod("")}
                      >
                        Back
                      </Button>
                      <Button 
                        type="submit"
                        className="flex-1 bg-gradient-to-r from-emerald-600 to-emerald-700 hover:from-emerald-700 hover:to-emerald-800 text-white h-12 text-base font-semibold shadow-lg shadow-emerald-600/30"
                        disabled={loading}
                      >
                        {loading ? (
                          <>
                            <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin mr-2"></div>
                            Processing...
                          </>
                        ) : (
                          "I've Completed Payment"
                        )}
                      </Button>
                    </div>
                  </form>
                ) : (
                  /* KPay Payment */
                  <form onSubmit={handlePaymentSubmit} className="space-y-4">
                    <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-3 mb-4">
                      <p className="text-sm text-emerald-900 font-semibold">💳 KPay Payment</p>
                    </div>

                    {/* KPay Payment Instructions */}
                    <div className="bg-slate-50 border border-slate-200 rounded-xl p-6">
                      <h3 className="font-bold text-slate-900 mb-4">Scan QR Code to Pay</h3>
                      
                      {/* QR Code - Large Display */}
                      <div className="flex justify-center mb-6">
                        <div className="w-64 h-64 bg-white rounded-lg overflow-hidden flex items-center justify-center border-2 border-slate-200">
                          {kpayQrCode ? (
                            <img src={kpayQrCode} alt="KPay QR Code" className="w-full h-full object-contain" />
                          ) : (
                            <div className="text-center px-4">
                              <CreditCard className="w-12 h-12 text-slate-400 mx-auto mb-2" />
                              <p className="text-sm text-slate-500">No QR code available</p>
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Payment Details */}
                      <div className="space-y-3 text-sm">
                        <div className="flex justify-between py-2 border-b border-slate-200">
                          <span className="text-slate-600">KPay Phone Number:</span>
                          <span className="font-semibold text-slate-900 font-mono">{kpayPhone}</span>
                        </div>
                        <div className="flex justify-between py-2">
                          <span className="text-slate-600">Amount to Pay:</span>
                          <span className="font-bold text-emerald-600 text-lg">{finalTotal.toFixed(0)} MMK</span>
                        </div>
                      </div>
                    </div>

                    {/* Instructions */}
                    <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                      <p className="text-sm text-blue-900">
                        📱 <strong>How to pay:</strong>
                      </p>
                      <ul className="text-sm text-blue-900 mt-2 space-y-1 list-disc list-inside">
                        <li>Scan the QR code with your KPay app</li>
                        <li>Or manually transfer to: <strong>{kpayPhone}</strong></li>
                        <li>Enter amount: <strong>{finalTotal.toFixed(0)} MMK</strong></li>
                        <li>Click "Confirm Order" after payment</li>
                      </ul>
                    </div>

                    <div className="flex gap-3 mt-6">
                      <Button 
                        type="button"
                        variant="outline"
                        className="flex-1"
                        onClick={() => setPaymentMethod("")}
                      >
                        Back
                      </Button>
                      <Button 
                        type="submit"
                        className="flex-1 bg-gradient-to-r from-emerald-600 to-emerald-700 hover:from-emerald-700 hover:to-emerald-800 text-white h-12 text-base font-semibold shadow-lg shadow-emerald-600/30"
                        disabled={loading}
                      >
                        {loading ? (
                          <>
                            <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin mr-2"></div>
                            Processing...
                          </>
                        ) : (
                          "I've Completed Payment"
                        )}
                      </Button>
                    </div>
                  </form>
                )}
              </Card>
            )}
          </div>

          {/* Order Summary */}
          <div className="lg:col-span-1">
            <Card className="p-6 sticky top-24">
              <div className="flex items-center gap-3 mb-4">
                <ShoppingBag className="w-5 h-5 text-blue-600" />
                <h3 className="text-lg font-bold text-slate-900">Order Summary</h3>
              </div>

              <div className="space-y-3 mb-4">
                {items.map((item) => (
                  <div key={item.id} className="flex gap-3 pb-3 border-b border-slate-200">
                    <div className="w-16 h-16 bg-slate-100 rounded-lg overflow-hidden flex-shrink-0">
                      {item.image ? (
                        <img src={item.image} alt={item.sku} className="w-full h-full object-cover" />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center">
                          <Package className="w-6 h-6 text-slate-400" />
                        </div>
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-slate-900">{item.sku}</p>
                      <p className="text-xs text-slate-500 mt-1">Qty: {item.quantity} × {Math.round(parseFloat(item.price))} MMK</p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-bold text-slate-900">
                        {Math.round(parseFloat(item.price) * item.quantity)} MMK
                      </p>
                    </div>
                  </div>
                ))}
              </div>

              {/* Coupon Code Input - MOVED BEFORE TOTAL */}
              <div className="mb-4 pb-4 border-b-2 border-slate-300">
                <h4 className="text-sm font-bold text-slate-900 mb-3 flex items-center gap-2">
                  <Tag className="w-4 h-4 text-blue-600" />
                  Apply Coupon Code
                </h4>
                
                {!appliedCoupon ? (
                  <div>
                    <div className="flex items-center gap-2">
                      <Input
                        placeholder="Enter coupon code"
                        value={couponCode}
                        onChange={(e) => {
                          setCouponCode(e.target.value.toUpperCase());
                          setCouponError('');
                        }}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') handleApplyCoupon();
                        }}
                        disabled={couponLoading}
                        className="uppercase text-sm"
                      />
                      <Button
                        type="button"
                        className="bg-blue-600 hover:bg-blue-700 text-white px-6"
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

              <div className="space-y-2 pt-4 border-t-2 border-slate-300">
                <div className="flex justify-between text-sm">
                  <span className="text-slate-600">Subtotal</span>
                  <span className="font-semibold text-slate-900">{totalPrice.toFixed(0)} MMK</span>
                </div>
                
                {/* Show discount if coupon applied */}
                {appliedCoupon && discountAmount > 0 && (
                  <div className="flex justify-between text-sm">
                    <span className="text-emerald-600 flex items-center gap-1">
                      <Tag className="w-3 h-3" />
                      Discount ({appliedCoupon.campaign?.code})
                    </span>
                    <span className="font-semibold text-emerald-600">-{discountAmount.toFixed(0)} MMK</span>
                  </div>
                )}
                
                <div className="flex justify-between text-lg font-bold pt-2 border-t border-slate-300">
                  <span className="text-slate-900">Total</span>
                  <span className="text-xl font-bold text-blue-600">{finalTotal.toFixed(0)} MMK</span>
                </div>
              </div>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}