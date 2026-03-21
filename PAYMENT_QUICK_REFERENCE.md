# 💳 PAYMENT INTEGRATION - QUICK REFERENCE CARD

## 🎯 **WHAT YOU NEED**

| Item | Where to Get | Takes |
|------|--------------|-------|
| Stripe Account | https://stripe.com/register | 3 min |
| Publishable Key | Dashboard → Developers → API keys | 1 min |
| Secret Key | Dashboard → Developers → API keys | 1 min |

---

## 🔑 **YOUR API KEYS**

### **Test Mode** (Use These First!)
```
VITE_STRIPE_PUBLISHABLE_KEY=pk_test_YOUR_KEY_HERE
STRIPE_SECRET_KEY=sk_test_YOUR_KEY_HERE
```

### **Live Mode** (After Approval)
```
VITE_STRIPE_PUBLISHABLE_KEY=pk_live_YOUR_KEY_HERE
STRIPE_SECRET_KEY=sk_live_YOUR_KEY_HERE
```

---

## 🧪 **TEST CARDS (Copy & Paste)**

| Copy This | Result |
|-----------|--------|
| `4242 4242 4242 4242` | ✅ Success |
| `4000 0000 0000 0002` | ❌ Declined |
| `4000 0000 0000 9995` | ❌ No Funds |
| `4000 0000 0000 0069` | ❌ Expired |

**All cards:** Expiry `12/28`, CVV `123`

---

## 💻 **CODE USAGE**

### **Import:**
```tsx
import StripePayment from './components/StripePayment';
```

### **Use:**
```tsx
<StripePayment
  amount={50000}
  onSuccess={(id) => createOrder()}
  onError={(err) => toast.error(err)}
/>
```

---

## 🔗 **IMPORTANT LINKS**

| What | URL |
|------|-----|
| Stripe Dashboard | https://dashboard.stripe.com |
| Get API Keys | https://dashboard.stripe.com/apikeys |
| Test Payments | https://dashboard.stripe.com/test/payments |
| Live Payments | https://dashboard.stripe.com/payments |
| Documentation | https://stripe.com/docs |
| Support Chat | Dashboard (bottom right) |

---

## ✅ **SETUP CHECKLIST**

```
□ Create Stripe account
□ Verify email
□ Get test API keys
□ Add VITE_STRIPE_PUBLISHABLE_KEY to .env
□ Add STRIPE_SECRET_KEY to Supabase
□ Test with 4242 card
□ Payment appears in dashboard
□ Order created successfully
```

---

## 💰 **MONEY FLOW**

```
Customer Pays → Stripe (3.4% fee) → Your Bank (3-7 days)
```

**Example:**
- Customer: **50,000 MMK**
- Fee: **-1,720 MMK**
- You get: **48,280 MMK**

---

## 🚨 **TROUBLESHOOTING**

| Error | Fix |
|-------|-----|
| "Stripe has not loaded yet" | Add VITE_STRIPE_PUBLISHABLE_KEY |
| "Payment gateway not configured" | Add STRIPE_SECRET_KEY to Supabase |
| "Invalid API key" | Check you copied full key |
| Test card not working | Use 4242 4242 4242 4242 |

---

## 📚 **DOCUMENTATION FILES**

```
/QUICK_START_STRIPE.md          ⚡ Start here! (10 min)
/STRIPE_SETUP_GUIDE.md          📖 Complete guide
/PAYMENT_FLOW_EXPLAINED.md      🔄 How it works
/STRIPE_INTEGRATION_EXAMPLE.tsx 💻 Code examples
/README_PAYMENT_INTEGRATION.md  📋 Full docs
```

---

## 🎯 **GO LIVE STEPS**

```
1. Complete business verification (Stripe dashboard)
2. Add bank account
3. Wait for approval (1-3 days)
4. Replace pk_test_ → pk_live_
5. Replace sk_test_ → sk_live_
6. Test with real card ($1)
7. Launch! 🚀
```

---

## 📞 **GET HELP**

**Stripe Support:**
- Chat: Dashboard → Chat icon (bottom right)
- Email: support@stripe.com
- Docs: https://stripe.com/docs

**Your Files:**
- Read `/QUICK_START_STRIPE.md` first
- Check `/PAYMENT_FLOW_EXPLAINED.md` for details

---

## ⚡ **SUPER QUICK START**

```bash
# 1. Get keys from Stripe dashboard
# 2. Add to .env:
VITE_STRIPE_PUBLISHABLE_KEY=pk_test_xxx

# 3. Add to Supabase secrets:
STRIPE_SECRET_KEY=sk_test_xxx

# 4. Test with:
Card: 4242 4242 4242 4242
Expiry: 12/28
CVV: 123

# 5. Done! ✅
```

---

**PRINT THIS PAGE FOR QUICK REFERENCE!** 📄✨
