// 💳 STRIPE PAYMENT ROUTES
// Backend endpoint for creating Stripe Payment Intents

import { Context } from "npm:hono@4";

// 🔑 STRIPE SECRET KEY (You'll add this to Supabase secrets)
// Get it from: https://dashboard.stripe.com/apikeys
// NEVER expose this key in frontend code!

/**
 * Create a Stripe Payment Intent
 * POST /make-server-16010b6f/create-payment-intent
 */
export async function createPaymentIntent(c: Context) {
  try {
    const { amount, currency = 'mmk' } = await c.req.json();

    // Validate input
    if (!amount || amount <= 0) {
      return c.json({ error: 'Invalid amount' }, 400);
    }

    // 🔥 Get Stripe secret key from environment
    const stripeSecretKey = Deno.env.get('STRIPE_SECRET_KEY');
    
    if (!stripeSecretKey) {
      console.error('❌ STRIPE_SECRET_KEY not found in environment variables');
      return c.json({ 
        error: 'Payment gateway not configured. Please contact administrator.' 
      }, 500);
    }

    // 🔥 Call Stripe API to create Payment Intent
    const response = await fetch('https://api.stripe.com/v1/payment_intents', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${stripeSecretKey}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        amount: Math.round(amount).toString(), // Amount in smallest currency unit (no decimals for MMK)
        currency: currency.toLowerCase(),
        'automatic_payment_methods[enabled]': 'true',
      }),
    });

    if (!response.ok) {
      const error = await response.json();
      console.error('❌ Stripe API error:', error);
      return c.json({ 
        error: 'Failed to create payment intent',
        details: error 
      }, 500);
    }

    const paymentIntent = await response.json();

    console.log('✅ Payment Intent created:', paymentIntent.id);

    // Return client secret to frontend
    return c.json({
      clientSecret: paymentIntent.client_secret,
      paymentIntentId: paymentIntent.id,
    });

  } catch (error: any) {
    console.error('❌ Error creating payment intent:', error);
    return c.json({ 
      error: 'Payment processing error',
      message: error.message 
    }, 500);
  }
}

/**
 * Verify payment status (optional - for extra security)
 * GET /make-server-16010b6f/verify-payment/:paymentIntentId
 */
export async function verifyPayment(c: Context) {
  try {
    const paymentIntentId = c.req.param('paymentIntentId');

    if (!paymentIntentId) {
      return c.json({ error: 'Payment Intent ID required' }, 400);
    }

    const stripeSecretKey = Deno.env.get('STRIPE_SECRET_KEY');
    
    if (!stripeSecretKey) {
      return c.json({ error: 'Payment gateway not configured' }, 500);
    }

    // Retrieve payment intent from Stripe
    const response = await fetch(
      `https://api.stripe.com/v1/payment_intents/${paymentIntentId}`,
      {
        headers: {
          'Authorization': `Bearer ${stripeSecretKey}`,
        },
      }
    );

    if (!response.ok) {
      const error = await response.json();
      console.error('❌ Stripe verification error:', error);
      return c.json({ error: 'Failed to verify payment' }, 500);
    }

    const paymentIntent = await response.json();

    return c.json({
      status: paymentIntent.status,
      amount: paymentIntent.amount,
      currency: paymentIntent.currency,
      verified: paymentIntent.status === 'succeeded',
    });

  } catch (error: any) {
    console.error('❌ Error verifying payment:', error);
    return c.json({ 
      error: 'Payment verification error',
      message: error.message 
    }, 500);
  }
}
