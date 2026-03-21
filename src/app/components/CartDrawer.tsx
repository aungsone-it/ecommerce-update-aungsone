import { X, Minus, Plus, ShoppingCart, Trash2, Tag } from 'lucide-react';
import { Button } from './ui/button';
import { useCart } from './CartContext';
import { useState, useEffect } from 'react';
import { projectId, publicAnonKey } from '../../../utils/supabase/info';
import { toast } from 'sonner';

interface CartDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  onCheckout?: () => void;
  user?: any;
  onShowAuthModal?: () => void;
}

export function CartDrawer({ isOpen, onClose, onCheckout, user, onShowAuthModal }: CartDrawerProps) {
  const { items, removeFromCart, updateQuantity, totalItems, totalPrice, clearCart } = useCart();
  
  // 🔒 Enhanced body scroll lock when drawer is open
  useEffect(() => {
    if (isOpen) {
      // Save current scroll position
      const scrollY = window.scrollY;
      
      // 🔒 NUCLEAR OPTION - Completely freeze background scroll
      document.body.style.position = 'fixed';
      document.body.style.top = `-${scrollY}px`;
      document.body.style.left = '0';
      document.body.style.right = '0';
      document.body.style.width = '100%';
      document.body.style.overflow = 'hidden';
      
      // Also lock html element
      document.documentElement.style.overflow = 'hidden';
      document.documentElement.style.height = '100%';
      
      return () => {
        // Restore everything
        document.body.style.position = '';
        document.body.style.top = '';
        document.body.style.left = '';
        document.body.style.right = '';
        document.body.style.width = '';
        document.body.style.overflow = '';
        document.documentElement.style.overflow = '';
        document.documentElement.style.height = '';
        
        window.scrollTo(0, scrollY);
      };
    }
  }, [isOpen]);
  
  // Coupon state with localStorage persistence
  const [couponCode, setCouponCode] = useState('');
  const [appliedCoupon, setAppliedCoupon] = useState<any>(() => {
    const saved = localStorage.getItem('migoo-applied-coupon');
    return saved ? JSON.parse(saved) : null;
  });
  const [couponLoading, setCouponLoading] = useState(false);
  const [couponError, setCouponError] = useState('');
  
  // Persist appliedCoupon to localStorage
  useEffect(() => {
    if (appliedCoupon) {
      localStorage.setItem('migoo-applied-coupon', JSON.stringify(appliedCoupon));
    } else {
      localStorage.removeItem('migoo-applied-coupon');
    }
  }, [appliedCoupon]);
  
  // Calculate final price with discount
  const discount = appliedCoupon?.campaign?.discountAmount || 0;
  const finalPrice = totalPrice - discount;
  
  // Apply coupon
  const handleApplyCoupon = async () => {
    if (!couponCode.trim()) {
      setCouponError('Please enter a coupon code');
      return;
    }
    
    setCouponLoading(true);
    setCouponError('');
    
    try {
      const code = couponCode.trim().toUpperCase();
      
      // 🎫 Validate coupon via backend (all coupons now use database)
      console.log(`🎫 Validating coupon code: \"${code}\" (original: \"${couponCode.trim()}\")`);
      const response = await fetch(
        `https://${projectId}.supabase.co/functions/v1/make-server-16010b6f/campaigns/validate`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${publicAnonKey}`
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
          })
        }
      );
      
      const data = await response.json();
      
      console.log('🎫 Coupon validation response:', data);
      
      if (data.valid && data.campaign) {
        setAppliedCoupon(data); // Store full response with campaign inside
        setCouponError('');
      } else {
        console.error('❌ Coupon validation failed:', data.error);
        setCouponError(data.error || 'Invalid coupon code');
        setAppliedCoupon(null);
      }
    } catch (error) {
      console.error('❌ Error applying coupon:', error);
      setCouponError('Failed to validate coupon');
      setAppliedCoupon(null);
    } finally {
      setCouponLoading(false);
    }
  };
  
  // Remove coupon
  const handleRemoveCoupon = () => {
    setAppliedCoupon(null);
    setCouponCode('');
    setCouponError('');
  };

  if (!isOpen) return null;

  return (
    <>
      {/* Backdrop - Lower z-index, blocks all pointer events */}
      <div 
        className="fixed inset-0 bg-black/50 z-[100] transition-opacity"
        onClick={onClose}
        style={{ pointerEvents: 'auto' }}
      />

      {/* Drawer - Higher z-index */}
      <div 
        className="fixed right-0 top-0 h-full w-full sm:w-96 bg-white shadow-2xl z-[101] flex flex-col"
        data-drawer="true"
        style={{ pointerEvents: 'auto' }}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-slate-200">
          <div className="flex items-center gap-3">
            <ShoppingCart className="w-6 h-6 text-blue-600" />
            <h2 className="text-xl font-bold text-slate-900">
              Shopping Cart ({totalItems})
            </h2>
          </div>
          <Button variant="ghost" size="icon" onClick={onClose}>
            <X className="w-5 h-5" />
          </Button>
        </div>

        {/* Cart Items */}
        <div className="flex-1 overflow-y-auto p-6 cart-drawer-content">
          {items.length === 0 ? (
            <div className="text-center py-12">
              <ShoppingCart className="w-16 h-16 text-slate-300 mx-auto mb-4" />
              <p className="text-slate-600 font-medium mb-2">Your cart is empty</p>
              <p className="text-sm text-slate-500">Add some products to get started!</p>
            </div>
          ) : (
            <div className="space-y-4">
              {items.map((item) => (
                <div key={`${item.id}-${item.vendorId || 'migoo'}`} className="flex gap-4 bg-slate-50 rounded-lg p-4">
                  {/* Product Image */}
                  <div className="w-20 h-20 bg-white rounded-lg overflow-hidden flex-shrink-0 border border-slate-200">
                    <img 
                      src={item.image} 
                      alt={item.name}
                      className="w-full h-full object-cover"
                    />
                  </div>

                  {/* Product Info */}
                  <div className="flex-1 min-w-0 pl-3">
                    <h3 className="text-sm font-medium text-slate-900 truncate">{item.sku}</h3>
                    <p className="text-sm font-bold text-slate-900">
                      {Math.round((item.price || 0) * item.quantity)} MMK
                    </p>
                  </div>

                  {/* Quantity Controls */}
                  <div className="flex items-center gap-3 mt-3">
                    <div className="flex items-center border border-slate-300 rounded-lg">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 rounded-none"
                        onClick={() => updateQuantity(item.id, item.quantity - 1)}
                      >
                        <Minus className="w-4 h-4" />
                      </Button>
                      <span className="px-3 text-sm font-semibold text-slate-900 min-w-[2rem] text-center">
                        {item.quantity}
                      </span>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 rounded-none"
                        onClick={() => updateQuantity(item.id, item.quantity + 1)}
                        disabled={item.quantity >= item.inventory}
                      >
                        <Plus className="w-4 h-4" />
                      </Button>
                    </div>

                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-red-500 hover:text-red-600 hover:bg-red-50"
                      onClick={() => removeFromCart(item.id)}
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>

                  {item.quantity >= item.inventory && (
                    <p className="text-xs text-amber-600 mt-1">Max stock reached</p>
                  )}
                </div>
              ))}

              {/* Clear Cart Button */}
              {items.length > 0 && (
                <Button
                  variant="outline"
                  size="sm"
                  className="w-full text-red-600 border-red-200 hover:bg-red-50"
                  onClick={clearCart}
                >
                  <Trash2 className="w-4 h-4 mr-2" />
                  Clear Cart
                </Button>
              )}
            </div>
          )}
        </div>

        {/* Footer with Total and Checkout */}
        {items.length > 0 && (
          <div className="border-t border-slate-200 p-6 space-y-4 bg-slate-50">
            {/* Coupon Code Section */}
            <div className="space-y-2">
              <label className="text-sm font-medium text-slate-700 flex items-center gap-2">
                <Tag className="w-4 h-4" />
                Have a coupon code?
              </label>
              
              {!appliedCoupon ? (
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={couponCode}
                    onChange={(e) => {
                      setCouponCode(e.target.value.toUpperCase());
                      setCouponError('');
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') handleApplyCoupon();
                    }}
                    placeholder="Enter coupon code"
                    className="flex-1 px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent uppercase"
                    disabled={couponLoading}
                  />
                  <Button
                    onClick={handleApplyCoupon}
                    disabled={couponLoading || !couponCode.trim()}
                    className="bg-blue-600 hover:bg-blue-700 text-white px-4"
                    size="sm"
                  >
                    {couponLoading ? 'Applying...' : 'Apply'}
                  </Button>
                </div>
              ) : (
                <div className="flex items-center justify-between bg-green-50 border border-green-200 rounded-lg p-3">
                  <div className="flex items-center gap-2">
                    <Tag className="w-4 h-4 text-green-600" />
                    <div>
                      <p className="text-sm font-semibold text-green-700">{appliedCoupon.campaign?.code}</p>
                      <p className="text-xs text-green-600">
                        {appliedCoupon.campaign?.discountType === 'percentage' 
                          ? `${appliedCoupon.campaign?.discount}% off` 
                          : `${appliedCoupon.campaign?.discount} MMK off`}
                        {discount > 0 && ` · You save ${discount.toFixed(0)} MMK!`}
                      </p>
                    </div>
                  </div>
                  <Button
                    onClick={handleRemoveCoupon}
                    variant="ghost"
                    size="sm"
                    className="text-red-600 hover:text-red-700 hover:bg-red-50 h-8 px-2"
                  >
                    <X className="w-4 h-4" />
                  </Button>
                </div>
              )}
              
              {couponError && (
                <p className="text-xs text-red-600 mt-1">{couponError}</p>
              )}
            </div>
            
            {/* Price Summary */}
            <div className="space-y-2">
              <div className="flex justify-between text-sm text-slate-600">
                <span>Subtotal</span>
                <span className="font-semibold">{totalPrice.toFixed(0)} MMK</span>
              </div>
              
              {appliedCoupon && (
                <div className="flex justify-between text-sm text-green-600">
                  <span>Discount ({appliedCoupon.campaign?.code})</span>
                  <span className="font-semibold">-{discount.toFixed(0)} MMK</span>
                </div>
              )}
              
              <div className="flex justify-between text-sm text-slate-600">
                <span>Shipping</span>
                <span className="font-semibold">FREE</span>
              </div>
              <div className="flex justify-between text-lg font-bold text-slate-900 pt-2 border-t border-slate-300">
                <span>Total</span>
                <span className="text-blue-600">{finalPrice.toFixed(0)} MMK</span>
              </div>
            </div>

            <Button
              className="w-full bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 text-white h-12 text-base font-semibold shadow-lg shadow-blue-600/30 hover:shadow-xl hover:shadow-blue-600/40 transition-all duration-300"
              onClick={() => {
                // Require authentication for checkout
                if (!user) {
                  toast.error("Please sign in to proceed with checkout");
                  onClose();
                  if (onShowAuthModal) {
                    onShowAuthModal();
                  }
                  return;
                }
                
                if (onCheckout) {
                  onCheckout();
                } else {
                  alert('Checkout functionality coming soon!');
                }
              }}
            >
              Proceed to Checkout
            </Button>

            <Button
              variant="outline"
              className="w-full"
              onClick={onClose}
            >
              Continue Shopping
            </Button>
          </div>
        )}
      </div>
    </>
  );
}