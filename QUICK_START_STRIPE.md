# ⚡ QUICK START - Get Stripe Working in 10 Minutes!

## 🎯 **FASTEST WAY TO START (Copy-Paste Guide)**

### **STEP 1: Get Stripe Account (3 minutes)**

1. Go to: **https://stripe.com/register**
2. Fill in:
   - Email: `your-email@example.com`
   - Password: `your-secure-password`
3. Click **"Create account"**
4. ✅ Done! You now have a Stripe account!

---

### **STEP 2: Get Your Keys (2 minutes)**

1. Login to: **https://dashboard.stripe.com**
2. Click **"Developers"** (top right corner)
3. Click **"API keys"** (left sidebar)
4. Copy these two keys:

   ```
   Publishable key: pk_test_51Hx...  (Click to copy)
   Secret key: sk_test_51Hx...       (Click "Reveal test key" then copy)
   ```

5. **Save them somewhere safe** (Notepad, TextEdit, etc.)

---

### **STEP 3: Add Keys to Your Project (2 minutes)**

#### **Option A: Quick Test (Local)**

Create a file called `.env` in your project root:

```env
VITE_STRIPE_PUBLISHABLE_KEY=pk_test_51Hxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

#### **Option B: Production (Vercel/Netlify)**

1. Go to your hosting dashboard (Vercel/Netlify)
2. Project Settings → Environment Variables
3. Add:
   - Name: `VITE_STRIPE_PUBLISHABLE_KEY`
   - Value: `pk_test_51Hxxxxxxxxxxxxxxxxxxx`

#### **Backend Key (Supabase)**

1. Go to: **https://supabase.com/dashboard**
2. Your Project → Settings → Edge Functions
3. Scroll to **"Secrets"**
4. Click **"Add new secret"**
5. Add:
   - Name: `STRIPE_SECRET_KEY`
   - Value: `sk_test_51Hxxxxxxxxxxxxxxxxxxx`
6. Click **"Add secret"**

---

### **STEP 4: Test It! (3 minutes)**

1. **Deploy/restart your app** (so it loads the new keys)

2. **Go to checkout page**

3. **Select "Credit Card" payment**

4. **Enter test card:**
   ```
   Card Number: 4242 4242 4242 4242
   Expiry: 12/28
   CVV: 123
   ```

5. **Click "Pay"**

6. **See success!** ✅
   ```
   ⏳ Processing payment...
   ✅ Payment Successful!
   ```

7. **Check Stripe Dashboard:**
   - Go to: https://dashboard.stripe.com/test/payments
   - You'll see your test payment! 🎉

---

## 🧪 **TEST CARDS - Copy & Paste**

### **Success Card:**
```
4242 4242 4242 4242
```
Result: ✅ Payment works!

### **Declined Card:**
```
4000 0000 0000 0002
```
Result: ❌ Card declined

### **Insufficient Funds:**
```
4000 0000 0000 9995
```
Result: ❌ Not enough money

### **For ALL cards, use:**
- Expiry: `12/28` (any future date)
- CVV: `123` (any 3 digits)

---

## 📋 **COMPLETE COPY-PASTE SETUP**

### **1. Environment Variables (.env file)**

```env
# Stripe API Keys (TEST MODE)
VITE_STRIPE_PUBLISHABLE_KEY=pk_test_YOUR_KEY_HERE
STRIPE_SECRET_KEY=sk_test_YOUR_KEY_HERE

# Your existing Supabase keys (don't change these)
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key
```

### **2. Import in Your Checkout**

```tsx
import StripePayment from './components/StripePayment';
```

### **3. Use in Payment Method Section**

```tsx
{paymentMethod === "Card" && (
  <div className="mt-6">
    <StripePayment
      amount={orderTotal}
      onSuccess={(paymentIntentId) => {
        console.log('Payment successful!', paymentIntentId);
        // Create order here
        handleCreateOrder();
      }}
      onError={(error) => {
        console.error('Payment failed:', error);
      }}
    />
  </div>
)}
```

---

## ✅ **VERIFICATION CHECKLIST**

Test each step:

- [ ] Can see Stripe card input form
- [ ] Can type card number: `4242 4242 4242 4242`
- [ ] Can click "Pay" button
- [ ] See "Processing payment..." message
- [ ] See "Payment Successful!" after 2 seconds
- [ ] Payment appears in Stripe dashboard
- [ ] Order created in your database

**All checked?** 🎉 **YOU'RE DONE!**

---

## 🚀 **GO LIVE LATER (When Ready)**

### **Before Going Live:**
1. Complete Stripe business verification
2. Add bank account for payouts
3. Wait for approval (1-3 days)
4. Switch keys to LIVE mode:
   - Change `pk_test_` → `pk_live_`
   - Change `sk_test_` → `sk_live_`
5. Test with small real payment ($1)
6. Start accepting real payments! 💰

---

## 🆘 **TROUBLESHOOTING**

### **"Stripe has not loaded yet"**
✅ Fix: Add `VITE_STRIPE_PUBLISHABLE_KEY` to `.env` file and restart app

### **"Payment gateway not configured"**
✅ Fix: Add `STRIPE_SECRET_KEY` to Supabase Edge Function secrets

### **"Invalid API key"**
✅ Fix: Make sure you copied the FULL key (starts with `pk_test_` or `sk_test_`)

### **"Can't find API keys"**
✅ Fix: Go to https://dashboard.stripe.com → Developers → API keys

### **Test card not working**
✅ Fix: Use `4242 4242 4242 4242` with spaces, expiry `12/28`, CVV `123`

---

## 📞 **NEED HELP?**

**Check these files in your project:**
- 📖 Full Guide: `/STRIPE_SETUP_GUIDE.md`
- 🔄 How it Works: `/PAYMENT_FLOW_EXPLAINED.md`
- 💻 Code Example: `/STRIPE_INTEGRATION_EXAMPLE.tsx`

**Official Stripe Support:**
- Chat: https://dashboard.stripe.com (bottom right corner)
- Email: support@stripe.com
- Docs: https://stripe.com/docs

---

## 🎉 **THAT'S IT!**

You now have a **professional payment system** that:
- ✅ Accepts credit/debit cards
- ✅ Handles all security
- ✅ Prevents fraud
- ✅ Transfers money to your bank
- ✅ Works worldwide

**Start with TEST mode**, test everything, then **go LIVE** when ready!

**Total time: 10 minutes** ⏱️  
**Cost: $0 until you make sales** 💰  
**Difficulty: Copy & Paste** 😎  

---

**Happy selling with Migoo! 🚀💳✨**
