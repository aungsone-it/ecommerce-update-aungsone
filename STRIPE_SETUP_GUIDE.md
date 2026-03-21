# 💳 STRIPE PAYMENT INTEGRATION GUIDE FOR MIGOO

## 📋 **WHAT YOU NEED TO DO (Step-by-Step)**

### **PART 1: Get Your Stripe Account** (15 minutes)

#### Step 1: Sign up for Stripe
1. Go to **https://stripe.com**
2. Click **"Sign up"** (top right)
3. Enter your:
   - Email address
   - Business name: `Migoo Marketplace`
   - Country: `Myanmar` (or your country)
4. Create a password
5. Click **"Create account"**

#### Step 2: Verify Your Email
1. Check your email inbox
2. Click the verification link from Stripe
3. Log in to your Stripe Dashboard

#### Step 3: Get Your API Keys (IMPORTANT!)
1. In Stripe Dashboard, click **"Developers"** (top right)
2. Click **"API keys"** in the left sidebar
3. You'll see TWO keys:

   **FOR TESTING (Use these first!):**
   - **Publishable key:** `pk_test_51xxxxxxxxxxxxx`
   - **Secret key:** `sk_test_51xxxxxxxxxxxxx` (Click "Reveal test key")

   **Copy both keys** - you'll need them!

---

### **PART 2: Add Keys to Your Migoo App** (5 minutes)

#### Step 4: Add Keys to Environment Variables

**Option A: Using .env file (Local Development)**

1. Create a file called `.env` in your project root (if not exists)
2. Add these lines:

```env
# Stripe Keys (TEST MODE)
VITE_STRIPE_PUBLISHABLE_KEY=pk_test_YOUR_PUBLISHABLE_KEY_HERE
STRIPE_SECRET_KEY=sk_test_YOUR_SECRET_KEY_HERE
```

3. Replace `pk_test_YOUR_PUBLISHABLE_KEY_HERE` with your actual publishable key
4. Replace `sk_test_YOUR_SECRET_KEY_HERE` with your actual secret key

**Option B: Using Supabase Secrets (Production)**

1. Go to your Supabase project dashboard
2. Click **"Settings"** → **"Edge Functions"**
3. Scroll to **"Secrets"**
4. Add these secrets:
   - Name: `STRIPE_SECRET_KEY`, Value: `sk_test_51xxxxxxxxxxxxx`
5. For frontend key, add to Vercel/hosting environment variables:
   - Name: `VITE_STRIPE_PUBLISHABLE_KEY`, Value: `pk_test_51xxxxxxxxxxxxx`

---

### **PART 3: How to Use Stripe in Checkout** (For Developers)

#### Step 5: Replace Test Card Form with Real Stripe

In your checkout component (Storefront.tsx or Checkout.tsx), replace the test card form with:

```tsx
import StripePayment from './StripePayment';

// Inside your checkout component, replace the card form with:
{paymentMethod === "Card" && (
  <div className="mt-6 space-y-4 border-t border-slate-200 pt-6">
    <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 mb-4">
      <p className="text-sm text-blue-900 font-semibold">💳 Credit / Debit Card Payment</p>
    </div>

    <StripePayment
      amount={finalTotal} // Your order total in MMK
      onSuccess={(paymentIntentId) => {
        // Payment successful! Save order
        console.log('Payment successful:', paymentIntentId);
        handlePlaceOrder(); // Your existing order function
      }}
      onError={(error) => {
        // Payment failed
        console.error('Payment failed:', error);
        setIsProcessingOrder(false);
      }}
      disabled={isProcessingOrder}
    />
  </div>
)}
```

---

### **PART 4: Testing Your Integration** (10 minutes)

#### Step 6: Test with Stripe Test Cards

Stripe provides test card numbers (these will work even before you're approved):

**TEST CARD NUMBERS:**

| Card Number | Result |
|-------------|--------|
| `4242 4242 4242 4242` | ✅ Success |
| `4000 0000 0000 0002` | ❌ Card Declined |
| `4000 0000 0000 9995` | ❌ Insufficient Funds |
| `4000 0002 0000 0000` | ❌ Card Expired |

**For ALL test cards use:**
- Any future expiry date (e.g., `12/28`)
- Any 3-digit CVV (e.g., `123`)
- Any billing postal code (e.g., `12345`)

#### Step 7: Place a Test Order

1. Go to your store checkout
2. Select **"Credit / Debit Card"** payment
3. Enter test card: `4242 4242 4242 4242`
4. Click **"Pay"**
5. You should see "Payment Successful!" ✅
6. Order should be created in your database

#### Step 8: Check Payment in Stripe Dashboard

1. Go to **Stripe Dashboard** → **Payments**
2. You'll see your test payment listed!
3. Click on it to see details (amount, card, status)

---

### **PART 5: Go Live (When Ready)** (Business Verification)

#### Step 9: Activate Your Account (Required before REAL payments)

1. In Stripe Dashboard, click **"Activate your account"**
2. Fill in business information:
   - Business type (e.g., "E-commerce marketplace")
   - Business address
   - Bank account details (for receiving money)
   - ID verification
3. Submit for review (takes 1-3 business days)

#### Step 10: Switch to Live Keys

Once approved:

1. Go to **Developers** → **API keys**
2. Toggle from **"Test mode"** to **"Live mode"**
3. Copy your LIVE keys:
   - `pk_live_51xxxxxxxxxxxxx`
   - `sk_live_51xxxxxxxxxxxxx`
4. Replace test keys in your .env / Supabase secrets
5. REAL payments will now work! 💰

---

## 🔒 **SECURITY CHECKLIST**

- ✅ **NEVER** put secret key (`sk_live_xxx`) in frontend code
- ✅ **ONLY** use publishable key (`pk_live_xxx`) in frontend
- ✅ Secret key should ONLY be in backend/Supabase environment
- ✅ Use HTTPS in production (Vercel does this automatically)
- ✅ Validate payment on backend before fulfilling orders

---

## 💰 **PRICING & FEES**

**Stripe Pricing:**
- **International cards:** 3.4% + MMK 20 per transaction
- **Myanmar local cards:** Check Stripe Myanmar pricing
- **No monthly fees** - only pay when you make sales!

Example:
- If customer pays **10,000 MMK**
- Stripe fee: **360 MMK** (3.4% + 20)
- You receive: **9,640 MMK**

---

## 🌏 **MYANMAR ALTERNATIVE: KBZPay Integration**

If you prefer Myanmar local payment, you can integrate **KBZPay** instead:

1. **Contact KBZPay:**
   - Website: https://www.kbzpay.com
   - Email: merchant@kbzpay.com
   - Phone: +95 1 230 5882

2. **Get Merchant Account:**
   - Fill business application
   - Submit documents
   - Get API credentials

3. **Integration:**
   - KBZPay provides REST API similar to Stripe
   - Replace Stripe calls with KBZPay API
   - Use QR code or payment link flow

**Other Myanmar Options:**
- **WavePay**: https://www.wavemoney.com.mm
- **CB Pay**: https://www.cbpay.com.mm
- **AYA Pay**: https://ayapay.com

---

## 🆘 **TROUBLESHOOTING**

### Problem: "Stripe has not loaded yet"
**Solution:** Make sure you added `VITE_STRIPE_PUBLISHABLE_KEY` to environment variables

### Problem: "Failed to create payment intent"
**Solution:** Check that `STRIPE_SECRET_KEY` is added to Supabase secrets

### Problem: "Payment gateway not configured"
**Solution:** Secret key is missing. Add it to Supabase Edge Functions secrets

### Problem: Test cards not working
**Solution:** Make sure you're using TEST keys (`pk_test_` and `sk_test_`), not live keys

### Problem: Can't find API keys
**Solution:** 
1. Go to https://dashboard.stripe.com
2. Click "Developers" (top right)
3. Click "API keys" (left sidebar)
4. Keys are there!

---

## 📞 **NEED HELP?**

**Stripe Support:**
- Help Center: https://support.stripe.com
- Email: support@stripe.com
- Chat: Available in dashboard (bottom right)

**Stripe Test Cards:**
- Full list: https://stripe.com/docs/testing#cards

**Stripe Docs:**
- Getting Started: https://stripe.com/docs
- Myanmar Guide: https://stripe.com/docs/countries#myanmar

---

## ✅ **QUICK CHECKLIST**

Before going live, make sure:

- [ ] Stripe account created
- [ ] Email verified
- [ ] Test keys added to environment variables
- [ ] Test payment works with `4242 4242 4242 4242`
- [ ] Payment appears in Stripe dashboard
- [ ] Orders are created in database after successful payment
- [ ] Business information submitted for verification
- [ ] Bank account added to receive payouts
- [ ] Live keys replaced test keys when approved
- [ ] SSL/HTTPS enabled in production (Vercel does this)

---

## 🎉 **YOU'RE DONE!**

Your Migoo platform can now accept REAL credit card payments from customers worldwide!

**Test Mode:** Use test cards to test everything
**Live Mode:** Real cards will charge real money

Start in TEST mode, test thoroughly, then go LIVE when ready! 💳✨
