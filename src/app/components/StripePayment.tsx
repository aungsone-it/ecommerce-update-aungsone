import { useState } from 'react';
import { loadStripe } from '@stripe/stripe-js';
import { Elements, CardElement, useStripe, useElements } from '@stripe/react-stripe-js';
import { Button } from './ui/button';
import { toast } from 'sonner';

// 🔑 STRIPE PUBLISHABLE KEY (You'll replace this with your real key)
// Get it from: https://dashboard.stripe.com/apikeys
const STRIPE_KEY = import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY;

// Only load Stripe if key is provided (prevents crash)
const stripePromise = STRIPE_KEY ? loadStripe(STRIPE_KEY) : null;

interface StripePaymentFormProps {
  amount: number; // Amount in MMK
  onSuccess: (paymentIntentId: string) => void;
  onError: (error: string) => void;
  disabled?: boolean;
}

function StripePaymentForm({ amount, onSuccess, onError, disabled }: StripePaymentFormProps) {
  const stripe = useStripe();
  const elements = useElements();
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();

    if (!stripe || !elements) {
      toast.error('Stripe has not loaded yet');
      return;
    }

    const cardElement = elements.getElement(CardElement);
    if (!cardElement) {
      toast.error('Card element not found');
      return;
    }

    setLoading(true);
    toast.info('Processing payment...', { duration: 2000 });

    try {
      // 🔥 STEP 1: Create Payment Intent on your backend
      // Your backend will call Stripe API with your SECRET key
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

      if (!supabaseUrl || !supabaseAnonKey) {
        throw new Error('Supabase configuration missing');
      }

      const response = await fetch(
        `${supabaseUrl}/functions/v1/make-server-16010b6f/create-payment-intent`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${supabaseAnonKey}`,
          },
          body: JSON.stringify({
            amount: Math.round(amount), // Amount in smallest currency unit
            currency: 'mmk', // Myanmar Kyat
          }),
        }
      );

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || 'Failed to create payment intent');
      }

      const { clientSecret } = await response.json();

      if (!clientSecret) {
        throw new Error('No client secret returned from server');
      }

      // 🔥 STEP 2: Confirm the payment with Stripe
      const result = await stripe.confirmCardPayment(clientSecret, {
        payment_method: {
          card: cardElement,
        },
      });

      if (result.error) {
        // Payment failed
        console.error('Payment error:', result.error);
        onError(result.error.message || 'Payment failed');
        toast.error(`💳 ${result.error.message || 'Payment failed'}`);
      } else if (result.paymentIntent?.status === 'succeeded') {
        // Payment succeeded!
        console.log('✅ Payment successful:', result.paymentIntent.id);
        toast.success('💳 Payment Successful!', { duration: 3000 });
        onSuccess(result.paymentIntent.id);
      }
    } catch (error: any) {
      console.error('Payment processing error:', error);
      onError(error.message || 'Payment failed');
      toast.error('Payment processing failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {/* Stripe Card Element */}
      <div className="border border-slate-300 rounded-lg p-4 bg-white">
        <CardElement
          options={{
            style: {
              base: {
                fontSize: '16px',
                color: '#1e293b',
                fontFamily: 'system-ui, sans-serif',
                '::placeholder': {
                  color: '#94a3b8',
                },
              },
              invalid: {
                color: '#ef4444',
              },
            },
            hidePostalCode: true,
          }}
        />
      </div>

      {/* Payment Info */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
        <p className="text-sm text-blue-900">
          🔒 Secure payment powered by Stripe
        </p>
      </div>

      {/* Submit Button */}
      <Button
        type="submit"
        disabled={!stripe || loading || disabled}
        className="w-full bg-slate-900 hover:bg-slate-800 text-white"
      >
        {loading ? 'Processing...' : `Pay ${amount.toFixed(0)} MMK`}
      </Button>
    </form>
  );
}

// Main component wrapper
interface StripePaymentProps {
  amount: number;
  onSuccess: (paymentIntentId: string) => void;
  onError: (error: string) => void;
  disabled?: boolean;
}

export default function StripePayment({ amount, onSuccess, onError, disabled }: StripePaymentProps) {
  // Show warning if Stripe key is not configured
  if (!stripePromise) {
    return (
      <div className="border border-amber-300 bg-amber-50 rounded-lg p-4">
        <div className="flex items-start gap-3">
          <svg className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
          </svg>
          <div>
            <p className="font-semibold text-amber-900 text-sm">Stripe Not Configured</p>
            <p className="text-sm text-amber-800 mt-1">
              Stripe payment is not configured yet. Please add your Stripe API keys to enable credit card payments.
            </p>
            <a
              href="/QUICK_START_STRIPE.md"
              target="_blank"
              className="text-sm text-amber-700 underline mt-2 inline-block hover:text-amber-900"
            >
              View Setup Guide →
            </a>
          </div>
        </div>
      </div>
    );
  }

  return (
    <Elements stripe={stripePromise}>
      <StripePaymentForm
        amount={amount}
        onSuccess={onSuccess}
        onError={onError}
        disabled={disabled}
      />
    </Elements>
  );
}