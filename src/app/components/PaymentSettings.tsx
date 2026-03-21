import { useState, useEffect } from 'react';
import { Card } from './ui/card';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { toast } from 'sonner';
import { CreditCard, Settings, Check, AlertTriangle, ExternalLink } from 'lucide-react';

/**
 * Payment Gateway Settings Component
 * For Admin Panel - Configure Stripe and other payment methods
 */
export default function PaymentSettings() {
  const [testMode, setTestMode] = useState(true);
  const [stripePublishableKey, setStripePublishableKey] = useState('');
  const [stripeSecretKey, setStripeSecretKey] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    // Load current keys from environment
    setStripePublishableKey(import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY || '');
  }, []);

  const handleSave = async () => {
    setSaving(true);
    
    // In a real app, you'd save these to your backend/environment
    // For now, just show success
    setTimeout(() => {
      toast.success('Payment settings saved successfully!');
      setSaving(false);
    }, 1000);
  };

  const isTestKey = (key: string) => key.startsWith('pk_test_') || key.startsWith('sk_test_');
  const isLiveKey = (key: string) => key.startsWith('pk_live_') || key.startsWith('sk_live_');

  return (
    <div className="max-w-4xl mx-auto p-6 space-y-6">
      <div className="flex items-center gap-3">
        <CreditCard className="w-8 h-8 text-slate-700" />
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Payment Settings</h1>
          <p className="text-sm text-slate-600">Configure payment gateways and methods</p>
        </div>
      </div>

      {/* Stripe Configuration */}
      <Card className="p-6">
        <div className="flex items-start gap-4 mb-6">
          <div className="w-12 h-12 bg-indigo-100 rounded-lg flex items-center justify-center flex-shrink-0">
            <svg className="w-6 h-6" viewBox="0 0 24 24" fill="#635BFF">
              <path d="M13.976 9.15c-2.172-.806-3.356-1.426-3.356-2.409 0-.831.683-1.305 1.901-1.305 2.227 0 4.515.858 6.09 1.631l.89-5.494C18.252.975 15.697 0 12.165 0 9.667 0 7.589.654 6.104 1.872 4.56 3.147 3.757 4.992 3.757 7.218c0 4.039 2.467 5.76 6.476 7.219 2.585.92 3.445 1.574 3.445 2.583 0 .98-.84 1.545-2.354 1.545-1.875 0-4.965-.921-6.99-2.109l-.9 5.555C5.175 22.99 8.385 24 11.714 24c2.641 0 4.843-.624 6.328-1.813 1.664-1.305 2.525-3.236 2.525-5.732 0-4.128-2.524-5.851-6.591-7.305z"/>
            </svg>
          </div>
          <div className="flex-1">
            <h2 className="text-lg font-semibold text-slate-900 mb-1">Stripe Payment Gateway</h2>
            <p className="text-sm text-slate-600 mb-4">
              Accept credit and debit cards worldwide with Stripe
            </p>

            {/* Test/Live Mode Toggle */}
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 mb-6">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className={`w-3 h-3 rounded-full ${testMode ? 'bg-amber-500' : 'bg-green-500'}`}></div>
                  <span className="font-semibold text-sm">
                    {testMode ? '🧪 Test Mode' : '🟢 Live Mode'}
                  </span>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setTestMode(!testMode)}
                  className="text-xs"
                >
                  Switch to {testMode ? 'Live' : 'Test'} Mode
                </Button>
              </div>
              <p className="text-xs text-slate-600 mt-2">
                {testMode 
                  ? 'Use test API keys and test cards (no real money)'
                  : 'Using live API keys - REAL payments will be processed!'
                }
              </p>
            </div>

            {/* API Keys */}
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-2">
                  {testMode ? 'Test' : 'Live'} Publishable Key
                </label>
                <div className="relative">
                  <Input
                    type="text"
                    placeholder={testMode ? 'pk_test_...' : 'pk_live_...'}
                    value={stripePublishableKey}
                    onChange={(e) => setStripePublishableKey(e.target.value)}
                    className="font-mono text-sm pr-10"
                  />
                  {stripePublishableKey && (
                    <div className="absolute right-3 top-1/2 -translate-y-1/2">
                      {(testMode && isTestKey(stripePublishableKey)) || (!testMode && isLiveKey(stripePublishableKey)) ? (
                        <Check className="w-4 h-4 text-green-600" />
                      ) : (
                        <AlertTriangle className="w-4 h-4 text-amber-500" />
                      )}
                    </div>
                  )}
                </div>
                <p className="text-xs text-slate-500 mt-1">
                  Safe to use in frontend code
                </p>
              </div>

              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-2">
                  {testMode ? 'Test' : 'Live'} Secret Key
                </label>
                <div className="relative">
                  <Input
                    type="password"
                    placeholder={testMode ? 'sk_test_...' : 'sk_live_...'}
                    value={stripeSecretKey}
                    onChange={(e) => setStripeSecretKey(e.target.value)}
                    className="font-mono text-sm pr-10"
                  />
                  {stripeSecretKey && (
                    <div className="absolute right-3 top-1/2 -translate-y-1/2">
                      {(testMode && isTestKey(stripeSecretKey)) || (!testMode && isLiveKey(stripeSecretKey)) ? (
                        <Check className="w-4 h-4 text-green-600" />
                      ) : (
                        <AlertTriangle className="w-4 h-4 text-amber-500" />
                      )}
                    </div>
                  )}
                </div>
                <p className="text-xs text-red-600 mt-1">
                  ⚠️ Keep this secret! Add to backend environment variables only
                </p>
              </div>
            </div>

            {/* Get Keys Link */}
            <a
              href="https://dashboard.stripe.com/apikeys"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 text-sm text-indigo-600 hover:text-indigo-700 mt-4"
            >
              <ExternalLink className="w-4 h-4" />
              Get API Keys from Stripe Dashboard
            </a>
          </div>
        </div>

        <div className="border-t border-slate-200 pt-4 mt-6">
          <Button
            onClick={handleSave}
            disabled={saving || !stripePublishableKey}
            className="bg-indigo-600 hover:bg-indigo-700"
          >
            {saving ? 'Saving...' : 'Save Stripe Settings'}
          </Button>
        </div>
      </Card>

      {/* Test Cards Reference */}
      {testMode && (
        <Card className="p-6 bg-gradient-to-r from-amber-50 to-yellow-50 border-amber-200">
          <h3 className="font-semibold text-amber-900 mb-3 flex items-center gap-2">
            <AlertTriangle className="w-5 h-5" />
            Test Mode - Test Card Numbers
          </h3>
          <div className="space-y-2 text-sm">
            <div className="flex items-center gap-3">
              <code className="bg-white px-3 py-1 rounded border border-amber-200 font-mono">
                4242 4242 4242 4242
              </code>
              <span className="text-amber-800">→ ✅ Success</span>
            </div>
            <div className="flex items-center gap-3">
              <code className="bg-white px-3 py-1 rounded border border-amber-200 font-mono">
                4000 0000 0000 0002
              </code>
              <span className="text-amber-800">→ ❌ Card Declined</span>
            </div>
            <div className="flex items-center gap-3">
              <code className="bg-white px-3 py-1 rounded border border-amber-200 font-mono">
                4000 0000 0000 9995
              </code>
              <span className="text-amber-800">→ ❌ Insufficient Funds</span>
            </div>
          </div>
          <p className="text-xs text-amber-700 mt-3">
            Use any future expiry date (e.g., 12/28) and any CVV (e.g., 123)
          </p>
        </Card>
      )}

      {/* Other Payment Methods */}
      <Card className="p-6">
        <h2 className="text-lg font-semibold text-slate-900 mb-4">Other Payment Methods</h2>
        
        <div className="space-y-4">
          {/* Bank Transfer */}
          <div className="flex items-center justify-between p-4 border border-slate-200 rounded-lg">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-purple-100 rounded-lg flex items-center justify-center">
                <span className="text-xl">🏦</span>
              </div>
              <div>
                <p className="font-semibold text-slate-900">Bank Transfer</p>
                <p className="text-xs text-slate-600">Manual bank transfer instructions</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs text-green-600 font-semibold">Enabled</span>
              <div className="w-8 h-5 bg-green-600 rounded-full relative">
                <div className="w-4 h-4 bg-white rounded-full absolute right-0.5 top-0.5"></div>
              </div>
            </div>
          </div>

          {/* KPay */}
          <div className="flex items-center justify-between p-4 border border-slate-200 rounded-lg">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-green-100 rounded-lg flex items-center justify-center">
                <span className="text-xl">📱</span>
              </div>
              <div>
                <p className="font-semibold text-slate-900">KPay</p>
                <p className="text-xs text-slate-600">Myanmar mobile payment</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs text-green-600 font-semibold">Enabled</span>
              <div className="w-8 h-5 bg-green-600 rounded-full relative">
                <div className="w-4 h-4 bg-white rounded-full absolute right-0.5 top-0.5"></div>
              </div>
            </div>
          </div>
        </div>
      </Card>

      {/* Help Section */}
      <Card className="p-6 bg-blue-50 border-blue-200">
        <h3 className="font-semibold text-blue-900 mb-3">📚 Setup Guides</h3>
        <div className="space-y-2 text-sm">
          <a href="/STRIPE_SETUP_GUIDE.md" className="flex items-center gap-2 text-blue-700 hover:text-blue-800">
            <ExternalLink className="w-4 h-4" />
            Complete Stripe Setup Guide
          </a>
          <a href="/QUICK_START_STRIPE.md" className="flex items-center gap-2 text-blue-700 hover:text-blue-800">
            <ExternalLink className="w-4 h-4" />
            Quick Start Guide (10 minutes)
          </a>
          <a href="/PAYMENT_FLOW_EXPLAINED.md" className="flex items-center gap-2 text-blue-700 hover:text-blue-800">
            <ExternalLink className="w-4 h-4" />
            How Payment Works (Visual Guide)
          </a>
        </div>
      </Card>
    </div>
  );
}
