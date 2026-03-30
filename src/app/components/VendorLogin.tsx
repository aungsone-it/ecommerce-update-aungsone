import { useState, useEffect } from 'react';
import { useLanguage } from '../contexts/LanguageContext';
import { useVendorAuth } from '../contexts/VendorAuthContext';
import { ArrowLeft, Eye, EyeOff, Store } from 'lucide-react';
import { useNavigate } from 'react-router';
import { resolveVendorSubdomainStoreSlug } from '../utils/vendorSubdomainHooks';
import { getEffectiveVendorSubdomainBase } from '../utils/vendorSubdomainBase';
import { subdomainHostLabelForVendorProfile } from '../utils/subdomainSlugMap';
import { projectId, publicAnonKey } from '../../../utils/supabase/info';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Checkbox } from './ui/checkbox';

interface VendorLoginProps {
  storeName?: string;
}

export function VendorLogin({ storeName }: VendorLoginProps) {
  const { login, vendor } = useVendorAuth();
  const { t } = useLanguage();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [agreedToTerms, setAgreedToTerms] = useState(false);
  const [rememberMe, setRememberMe] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [vendorName, setVendorName] = useState<string>('');
  const [loadingVendor, setLoadingVendor] = useState(!!storeName);

  // After login: prefer vendor subdomain /admin (same as direct gogo.* entry) when slug maps; else /store/:slug/admin.
  // Shared cookie (apex domain) carries session across www → subdomain navigation.
  useEffect(() => {
    if (!vendor?.vendorId || !vendor.storeSlug) return;

    const onVendorHost = !!resolveVendorSubdomainStoreSlug();
    if (onVendorHost) {
      console.log('✅ [VendorLogin] On vendor host → /admin');
      navigate('/admin', { replace: true });
      return;
    }

    const base = getEffectiveVendorSubdomainBase();
    const hostLabel = subdomainHostLabelForVendorProfile({
      storeSlug: vendor.storeSlug,
      vendorId: vendor.vendorId,
      storeName: vendor.storeName,
      businessName: vendor.businessName,
      name: vendor.name,
    });
    if (base && hostLabel && typeof window !== 'undefined') {
      const proto = window.location.protocol;
      const target = `${proto}//${hostLabel}.${base}/admin`;
      console.log('✅ [VendorLogin] Redirecting to vendor subdomain admin:', target);
      window.location.replace(target);
      return;
    }

    console.log(
      '✅ [VendorLogin] No subdomain map for slug; using path admin:',
      vendor.storeSlug
    );
    navigate(`/store/${encodeURIComponent(vendor.storeSlug)}/admin`, { replace: true });
  }, [vendor, navigate]);

  // Fetch vendor data to get the actual name
  useEffect(() => {
    const fetchVendorName = async () => {
      if (!storeName) {
        setVendorName('SECURE');
        return;
      }
      
      setLoadingVendor(true);
      try {
        console.log('🔍 Fetching vendor data for:', storeName);
        const response = await fetch(
          `https://${projectId}.supabase.co/functions/v1/make-server-16010b6f/vendors/by-slug/${storeName}`,
          {
            headers: {
              'Authorization': `Bearer ${publicAnonKey}`,
            },
          }
        );

        console.log('📡 Vendor fetch response status:', response.status);
        
        if (response.ok) {
          const data = await response.json();
          console.log('✅ Vendor data received:', data);
          
          // Extract the business name from vendor data
          const name = data.vendor?.businessName || 
                      data.vendor?.name || 
                      data.vendor?.storeName ||
                      storeName;
          
          console.log('📛 Setting vendor name to:', name);
          setVendorName(name);
        } else {
          console.error('❌ Failed to fetch vendor:', response.status, response.statusText);
          const errorText = await response.text();
          console.error('Error details:', errorText);
          setVendorName(storeName);
        }
      } catch (error) {
        if (error.message === 'Failed to fetch') {
          console.error('❌ Error fetching vendor: Cannot connect to server.');
          console.error('   The Supabase edge function may not be deployed yet.');
        } else {
          console.error('❌ Error fetching vendor:', error);
        }
        setVendorName(storeName);
      } finally {
        setLoadingVendor(false);
      }
    };

    fetchVendorName();
  }, [storeName]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    
    if (!agreedToTerms) {
      setError(t('auth.login.agreeError'));
      return;
    }
    
    setLoading(true);

    const result = await login(email, password, rememberMe);

    if (!result.success) {
      // Check if vendor needs to complete setup
      if (result.needsSetup) {
        setLoading(false);
        navigate('/vendor/setup');
        return;
      }
      
      setError(result.error || t('auth.login.error'));
      setLoading(false);
    }
    // If successful, VendorAuthContext will handle the state update
  };

  /** Browser back: return to the last visited page (same as clicking the browser Back control). */
  const handleBack = () => {
    navigate(-1);
  };

  return (
    <div className="min-h-screen relative overflow-hidden bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-100 dark:from-slate-950 dark:via-slate-900 dark:to-indigo-950 flex items-center justify-center p-4">
      {/* Luxury Background Elements */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        {/* Animated gradient orbs */}
        <div className="absolute top-0 right-0 w-96 h-96 bg-gradient-to-br from-blue-400/20 to-indigo-600/20 rounded-full blur-3xl animate-pulse" style={{ animationDuration: '4s' }}></div>
        <div className="absolute bottom-0 left-0 w-96 h-96 bg-gradient-to-tr from-purple-400/20 to-pink-600/20 rounded-full blur-3xl animate-pulse" style={{ animationDuration: '6s', animationDelay: '1s' }}></div>
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-96 h-96 bg-gradient-to-r from-cyan-400/10 to-blue-600/10 rounded-full blur-3xl animate-pulse" style={{ animationDuration: '8s', animationDelay: '2s' }}></div>
        
        {/* Elegant grid pattern */}
        <div className="absolute inset-0 bg-[linear-gradient(to_right,#8882_1px,transparent_1px),linear-gradient(to_bottom,#8882_1px,transparent_1px)] bg-[size:4rem_4rem] [mask-image:radial-gradient(ellipse_80%_50%_at_50%_50%,#000_70%,transparent_110%)]"></div>
      </div>

      <div className="w-full max-w-[400px] relative z-10">
        {/* Logo Section */}
        <div className="flex flex-col items-center mb-6">
          <div className="text-4xl font-bold text-slate-900 dark:text-white drop-shadow-2xl mb-2">
            {loadingVendor ? '...' : vendorName}
          </div>
          <div className="flex items-center gap-2 text-blue-600 dark:text-blue-400">
            <Store className="w-5 h-5" />
            <span className="text-sm font-medium">Vendor Portal</span>
          </div>
        </div>

        {/* Clean White Login Card */}
        <div className="bg-white dark:bg-slate-900 rounded-3xl shadow-xl border border-slate-200 dark:border-slate-700 p-8">
          
          {/* Back Arrow */}
          <button 
            type="button"
            onClick={handleBack}
            aria-label="Go back to previous page"
            title="Back"
            className="mb-6 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 transition-colors"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>

          {/* Title */}
          <div className="mb-8">
            <h1 className="text-2xl font-bold text-slate-900 dark:text-white mb-1">
              Vendor Login
            </h1>
            <p className="text-sm text-slate-500 dark:text-slate-400">
              Sign in to manage your store
            </p>
          </div>

          {/* First-time Setup Notice */}
          <div className="mb-6 p-4 bg-blue-50 dark:bg-blue-900/20 border-2 border-blue-200 dark:border-blue-700 rounded-xl">
            <div className="flex items-start gap-3">
              <Store className="w-5 h-5 text-blue-600 dark:text-blue-400 flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-semibold text-blue-900 dark:text-blue-100 mb-1">
                  First time here?
                </p>
                <p className="text-xs text-blue-700 dark:text-blue-300 mb-2">
                  If your application was just approved, you need to complete your setup first.
                </p>
                <button
                  type="button"
                  onClick={() => navigate('/vendor/setup')}
                  className="text-xs font-semibold text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-1"
                >
                  Complete Vendor Setup →
                </button>
              </div>
            </div>
          </div>

          {/* Error Message */}
          {error && (
            <div className="mb-4 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg text-sm text-red-600 dark:text-red-400">
              {error}
            </div>
          )}

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-5">
            {/* Email */}
            <div className="space-y-2">
              <Label htmlFor="email" className="text-slate-700 dark:text-slate-300 font-medium text-sm">
                {t('auth.login.email')}
              </Label>
              <Input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder={t('auth.login.emailPlaceholder')}
                required
                className="h-11 bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700 rounded-lg focus:border-slate-400 dark:focus:border-slate-500 transition-colors text-slate-900 dark:text-white placeholder:text-slate-400"
              />
            </div>

            {/* Password */}
            <div className="space-y-2">
              <Label htmlFor="password" className="text-slate-700 dark:text-slate-300 font-medium text-sm">
                {t('auth.login.password')}
              </Label>
              <div className="relative">
                <Input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder={t('auth.login.passwordPlaceholder')}
                  required
                  className="h-11 pr-10 bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700 rounded-lg focus:border-slate-400 dark:focus:border-slate-500 transition-colors text-slate-900 dark:text-white placeholder:text-slate-400"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 transition-colors"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {/* Remember Me */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Checkbox
                  id="remember"
                  checked={rememberMe}
                  onCheckedChange={(checked) => setRememberMe(checked as boolean)}
                />
                <Label 
                  htmlFor="remember" 
                  className="text-sm text-slate-600 dark:text-slate-400 cursor-pointer"
                >
                  {t('auth.login.rememberMe')}
                </Label>
              </div>
            </div>

            {/* Terms Agreement */}
            <div className="flex items-start gap-2">
              <Checkbox
                id="terms"
                checked={agreedToTerms}
                onCheckedChange={(checked) => setAgreedToTerms(checked as boolean)}
                className="mt-0.5"
              />
              <Label 
                htmlFor="terms" 
                className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed cursor-pointer"
              >
                {t('auth.login.agree')}
              </Label>
            </div>

            {/* Sign In Button */}
            <Button
              type="submit"
              disabled={loading}
              className="w-full h-11 bg-slate-900 hover:bg-slate-800 dark:bg-white dark:hover:bg-slate-100 text-white dark:text-slate-900 font-medium rounded-lg shadow-lg transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? t('auth.login.signingIn') : t('auth.login.signIn')}
            </Button>
          </form>
        </div>
      </div>
    </div>
  );
}