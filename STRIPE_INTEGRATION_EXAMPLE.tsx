// 📝 EXAMPLE: How to integrate StripePayment component into your checkout

import { useState } from 'react';
import StripePayment from './components/StripePayment';
import { Button } from './components/ui/button';
import { toast } from 'sonner';

export function CheckoutWithStripeExample() {
  const [paymentMethod, setPaymentMethod] = useState<string>('');
  const [isProcessingOrder, setIsProcessingOrder] = useState(false);
  const [orderTotal] = useState(50000); // Example: 50,000 MMK

  // Your existing order creation function
  const createOrderInDatabase = async (paymentIntentId?: string) => {
    // ... your existing order logic
    const orderData = {
      // ... order details
      paymentMethod: 'Credit/Debit Card',
      paymentIntentId: paymentIntentId, // Stripe payment ID
      status: 'pending',
      paymentStatus: 'paid', // Payment already completed
    };

    // Save to database
    // await ordersApi.create(orderData);
    
    console.log('Order created:', orderData);
    toast.success('Order placed successfully!');
  };

  return (
    <div className="max-w-2xl mx-auto p-6">
      <h2 className="text-2xl font-bold mb-6">Checkout</h2>

      {/* Order Summary */}
      <div className="bg-slate-50 border rounded-lg p-4 mb-6">
        <h3 className="font-semibold mb-2">Order Summary</h3>
        <div className="flex justify-between">
          <span>Total:</span>
          <span className="font-bold">{orderTotal.toFixed(0)} MMK</span>
        </div>
      </div>

      {/* Payment Method Selection */}
      <div className="mb-6">
        <h3 className="font-semibold mb-4">Payment Method</h3>
        <div className="space-y-3">
          {/* Card Payment - WITH REAL STRIPE */}
          <button
            type="button"
            onClick={() => setPaymentMethod('Card')}
            className={`w-full text-left border rounded-lg p-4 transition-all ${
              paymentMethod === 'Card'
                ? 'border-slate-900 bg-slate-50'
                : 'border-slate-300 bg-white hover:border-slate-400'
            }`}
          >
            <div className="flex items-center gap-3">
              <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center ${
                paymentMethod === 'Card' ? 'border-slate-900' : 'border-slate-300'
              }`}>
                {paymentMethod === 'Card' && (
                  <div className="w-2 h-2 rounded-full bg-slate-900"></div>
                )}
              </div>
              <span className="text-sm font-medium text-slate-900">
                💳 Credit / Debit Card (Powered by Stripe)
              </span>
            </div>
          </button>

          {/* Bank Transfer */}
          <button
            type="button"
            onClick={() => setPaymentMethod('BankTransfer')}
            className={`w-full text-left border rounded-lg p-4 transition-all ${
              paymentMethod === 'BankTransfer'
                ? 'border-slate-900 bg-slate-50'
                : 'border-slate-300 bg-white hover:border-slate-400'
            }`}
          >
            <div className="flex items-center gap-3">
              <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center ${
                paymentMethod === 'BankTransfer' ? 'border-slate-900' : 'border-slate-300'
              }`}>
                {paymentMethod === 'BankTransfer' && (
                  <div className="w-2 h-2 rounded-full bg-slate-900"></div>
                )}
              </div>
              <span className="text-sm font-medium text-slate-900">🏦 Bank Transfer</span>
            </div>
          </button>

          {/* KPay */}
          <button
            type="button"
            onClick={() => setPaymentMethod('KPay')}
            className={`w-full text-left border rounded-lg p-4 transition-all ${
              paymentMethod === 'KPay'
                ? 'border-slate-900 bg-slate-50'
                : 'border-slate-300 bg-white hover:border-slate-400'
            }`}
          >
            <div className="flex items-center gap-3">
              <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center ${
                paymentMethod === 'KPay' ? 'border-slate-900' : 'border-slate-300'
              }`}>
                {paymentMethod === 'KPay' && (
                  <div className="w-2 h-2 rounded-full bg-slate-900"></div>
                )}
              </div>
              <span className="text-sm font-medium text-slate-900">📱 KPay</span>
            </div>
          </button>
        </div>
      </div>

      {/* STRIPE CARD PAYMENT FORM */}
      {paymentMethod === 'Card' && (
        <div className="mt-6 border-t border-slate-200 pt-6">
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 mb-4">
            <p className="text-sm text-blue-900 font-semibold">
              💳 Secure Payment with Stripe
            </p>
          </div>

          {/* 🔥 THIS IS THE STRIPE COMPONENT */}
          <StripePayment
            amount={orderTotal}
            onSuccess={(paymentIntentId) => {
              // ✅ Payment successful!
              console.log('✅ Payment succeeded:', paymentIntentId);
              
              // Now create the order in database
              setIsProcessingOrder(true);
              createOrderInDatabase(paymentIntentId)
                .then(() => {
                  // Redirect to success page
                  window.location.href = '/order-success';
                })
                .catch((error) => {
                  console.error('Error creating order:', error);
                  toast.error('Failed to create order. Please contact support.');
                })
                .finally(() => {
                  setIsProcessingOrder(false);
                });
            }}
            onError={(error) => {
              // ❌ Payment failed
              console.error('❌ Payment failed:', error);
              toast.error(`Payment failed: ${error}`);
              setIsProcessingOrder(false);
            }}
            disabled={isProcessingOrder}
          />
        </div>
      )}

      {/* BANK TRANSFER FORM */}
      {paymentMethod === 'BankTransfer' && (
        <div className="mt-6 border-t border-slate-200 pt-6">
          <div className="bg-purple-50 border border-purple-200 rounded-lg p-4">
            <p className="font-semibold mb-2">Bank Transfer Details:</p>
            <p className="text-sm">Bank: KBZ Bank</p>
            <p className="text-sm">Account: 1234567890</p>
            <p className="text-sm">Name: Migoo Marketplace</p>
          </div>
          <Button
            onClick={() => {
              setIsProcessingOrder(true);
              createOrderInDatabase()
                .finally(() => setIsProcessingOrder(false));
            }}
            disabled={isProcessingOrder}
            className="w-full mt-4"
          >
            {isProcessingOrder ? 'Processing...' : 'Confirm Order'}
          </Button>
        </div>
      )}

      {/* KPAY FORM */}
      {paymentMethod === 'KPay' && (
        <div className="mt-6 border-t border-slate-200 pt-6">
          <div className="bg-green-50 border border-green-200 rounded-lg p-4">
            <p className="font-semibold mb-2">KPay Payment:</p>
            <p className="text-sm">KPay Number: +95 9 123 456 789</p>
          </div>
          <Button
            onClick={() => {
              setIsProcessingOrder(true);
              createOrderInDatabase()
                .finally(() => setIsProcessingOrder(false));
            }}
            disabled={isProcessingOrder}
            className="w-full mt-4"
          >
            {isProcessingOrder ? 'Processing...' : 'Confirm Order'}
          </Button>
        </div>
      )}
    </div>
  );
}

// ============================================
// KEY POINTS FOR INTEGRATION:
// ============================================

/*
1. STRIPE COMPONENT USAGE:
   - Import: import StripePayment from './components/StripePayment';
   - Use only when paymentMethod === 'Card'
   - Pass amount (in MMK, no decimals)
   - Handle onSuccess and onError callbacks

2. ON SUCCESS:
   - Stripe has already charged the card
   - Payment is COMPLETE
   - Save order to database with paymentIntentId
   - Redirect to success page

3. ON ERROR:
   - Payment FAILED
   - Show error message to user
   - User can try again with different card
   - No order is created

4. ENVIRONMENT VARIABLES NEEDED:
   - Frontend: VITE_STRIPE_PUBLISHABLE_KEY
   - Backend: STRIPE_SECRET_KEY

5. TESTING:
   - Use test card: 4242 4242 4242 4242
   - Any future expiry date
   - Any CVV

6. PRODUCTION:
   - Replace test keys with live keys
   - Stripe account must be verified
   - Real cards will be charged real money
*/
