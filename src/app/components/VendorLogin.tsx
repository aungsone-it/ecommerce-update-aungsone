import { useState, useEffect } from 'react';
import { useLanguage } from '../contexts/LanguageContext';
import { useVendorAuth } from '../contexts/VendorAuthContext';
import { ArrowLeft, Eye, EyeOff, Store } from 'lucide-react';
import { useNavigate } from 'react-router';
import { resolveVendorSubdomainStoreSlug } from '../utils/vendorSubdomainHooks';
import { shouldResolveCustomDomainHost } from '../utils/vendorHostResolution';
import { useResolvedVendorHostSlug } from '../utils/vendorHostResolution';
import { getEffectiveVendorSubdomainBase } from '../utils/vendorSubdomainBase';
import { subdomainHostLabelForVendorProfile } from '../utils/subdomainSlugMap';
import { storeSlugFromBusinessName } from '../../utils/storeSlug';
import { applyVendorStoreLogoFavicon, resetDocumentFavicon } from '../utils/documentFavicon';
import { publicAnonKey } from '../../../utils/supabase/info';
import { API_BASE_URL } from '../../utils/api-client';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Checkbox } from './ui/checkbox';
import {
  resolveVendorAdminPortalContext,
  vendorAdminPortalMismatchMessage,
  vendorAuthMatchesAdminPortal,
} from '../utils/vendorAdminPortalAccess';
import { PolicyAgreementLabel } from './PolicyAgreementLabel';

interface VendorLoginProps {
  storeName?: string;
  portalMismatchError?: string;
}

function humanizeStoreLabel(raw?: string): string {
  const value = String(raw || "").trim();
  if (!value) return "Vendor Store";

  // Hide technical/internal-looking identifiers from UI.
  const lower = value.toLowerCase();
  const looksInternal =
    lower.startsWith("vendor-") ||
    lower.startsWith("vendor_") ||
    /vendor[_-][a-z0-9]{8,}/i.test(value) ||
    /^[a-f0-9]{12,}$/i.test(value);
  if (looksInternal) return "Vendor Store";

  // Convert slug-ish labels to readable title case.
  const cleaned = value.replace(/[-_]+/g, " ").replace(/\s+/g, " ").trim();
  if (!cleaned) return "Vendor Store";
  return cleaned.replace(/\b\w/g, (ch) => ch.toUpperCase());
}

function isInternalVendorLabel(raw?: string): boolean {
  const value = String(raw || "").trim();
  if (!value) return true;
  const lower = value.toLowerCase();
  return (
    lower.startsWith("vendor-") ||
    lower.startsWith("vendor_") ||
    /vendor[_-][a-z0-9]{8,}/i.test(value) ||
    /^[a-f0-9]{12,}$/i.test(value)
  );
}

function pickDisplayVendorName(...candidates: Array<string | undefined>): string {
  for (const c of candidates) {
    const v = String(c || "").trim();
    if (!v) continue;
    if (!isInternalVendorLabel(v)) return humanizeStoreLabel(v);
  }
  // If all candidates are internal/empty, use a stable friendly fallback.
  const firstNonEmpty = candidates.find((c) => String(c || "").trim());
  return humanizeStoreLabel(firstNonEmpty);
}

function fallbackHostLabelFromVendorProfile(input: {
  storeName?: string;
  businessName?: string;
  name?: string;
  email?: string;
}): string | null {
  const emailLocal =
    input.email && input.email.includes("@")
      ? input.email.split("@")[0]?.replace(/[^a-z0-9]+/gi, "") || ""
      : "";
  const candidates = [input.storeName, input.businessName, input.name, emailLocal];
  for (const candidate of candidates) {
    const slug = storeSlugFromBusinessName(String(candidate || "").trim());
    if (slug && slug !== "store") return slug;
  }
  return null;
}

export function VendorLogin({ storeName, portalMismatchError }: VendorLoginProps) {
  const { login, vendor, logout } = useVendorAuth();
  const { language, setLanguage, t } = useLanguage();
  const navigate = useNavigate();
  const { slug: resolvedHostSlug, loading: hostSlugLoading } = useResolvedVendorHostSlug();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [agreedToTerms, setAgreedToTerms] = useState(false);
  const [rememberMe, setRememberMe] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [vendorName, setVendorName] = useState<string>('');
  const [vendorLogo, setVendorLogo] = useState<string>('');
  const [loadingVendor, setLoadingVendor] = useState(
    !!storeName ||
      (typeof window !== 'undefined' &&
        shouldResolveCustomDomainHost(window.location.hostname))
  );

  // After login: only enter admin when auth store slug matches this portal URL.
  useEffect(() => {
    if (hostSlugLoading) return;
    if (!vendor?.vendorId || !vendor.storeSlug) return;

    const portalContext = resolveVendorAdminPortalContext({
      subdomainSlug: resolveVendorSubdomainStoreSlug(),
      customHostSlug: resolvedHostSlug,
      routeStoreName: storeName,
    });

    if (
      portalContext.requiresMatch &&
      !vendorAuthMatchesAdminPortal(vendor.storeSlug, portalContext.expectedStoreSlug)
    ) {
      logout();
      setError(
        vendorAdminPortalMismatchMessage(
          portalContext.expectedStoreSlug,
          vendor.storeSlug
        )
      );
      return;
    }

    const onVendorHost = !!resolveVendorSubdomainStoreSlug() || !!resolvedHostSlug;
    if (onVendorHost) {
      navigate('/admin', { replace: true });
      return;
    }

    let cancelled = false;
    (async () => {
      let merged = { ...vendor };
      let storefrontCustomDomain = "";
      let storefrontDomainStatus = "";
      try {
        const res = await fetch(
          `${API_BASE_URL}/vendor/storefront/${encodeURIComponent(vendor.vendorId)}`,
          { headers: { Authorization: `Bearer ${publicAnonKey}` } }
        );
        if (res.ok) {
          const data = (await res.json()) as {
            settings?: {
              storeSlug?: string;
              storeName?: string;
              customDomain?: string;
              domainStatus?: string;
            };
          };
          const s = data.settings;
          if (s) {
            merged = {
              ...merged,
              storeSlug: s.storeSlug?.trim() || merged.storeSlug,
              storeName: s.storeName?.trim() || merged.storeName,
            };
            storefrontCustomDomain = String(s.customDomain || "").trim().toLowerCase();
            storefrontDomainStatus = String(s.domainStatus || "").trim().toLowerCase();
          }
        }
      } catch {
        /* use auth vendor */
      }
      if (cancelled) return;

      if (
        typeof window !== 'undefined' &&
        storefrontCustomDomain &&
        storefrontDomainStatus === "verified"
      ) {
        const target = `${window.location.protocol}//${storefrontCustomDomain}/admin`;
        console.log('✅ [VendorLogin] Redirecting to verified custom-domain admin:', target);
        window.location.replace(target);
        return;
      }

      const base = getEffectiveVendorSubdomainBase();
      const hostLabel =
        subdomainHostLabelForVendorProfile({
          storeSlug: merged.storeSlug,
          vendorId: merged.vendorId,
          storeName: merged.storeName,
          businessName: merged.businessName,
          name: merged.name,
          email: merged.email,
        }) ||
        fallbackHostLabelFromVendorProfile({
          storeName: merged.storeName,
          businessName: merged.businessName,
          name: merged.name,
          email: merged.email,
        });
      if (base && hostLabel && typeof window !== 'undefined') {
        const proto = window.location.protocol;
        const target = `${proto}//${hostLabel}.${base}/admin`;
        console.log('✅ [VendorLogin] Redirecting to vendor subdomain admin:', target);
        window.location.replace(target);
        return;
      }

      console.log(
        '✅ [VendorLogin] No host target resolved; using vendor path admin:',
        merged.storeSlug
      );
      navigate(`/vendor/${encodeURIComponent(merged.storeSlug)}/admin`, { replace: true });
    })();

    return () => {
      cancelled = true;
    };
  }, [vendor, navigate, resolvedHostSlug, hostSlugLoading, logout, storeName]);

  useEffect(() => {
    if (portalMismatchError) {
      setError(portalMismatchError);
    }
  }, [portalMismatchError]);

  useEffect(() => {
    const titleBase = (vendorName || humanizeStoreLabel(storeName) || "Vendor Store").trim();
    document.title = `${titleBase} | ${t('vendorAuth.loginTitle')}`;

    if (vendorLogo.trim()) {
      void applyVendorStoreLogoFavicon(vendorLogo);
    } else {
      resetDocumentFavicon();
    }

    return () => {
      resetDocumentFavicon();
    };
  }, [vendorName, vendorLogo, storeName, t]);

  // Fetch vendor data to get the actual name
  useEffect(() => {
    const fetchVendorName = async () => {
      if (!storeName) {
        // On custom domains, resolve display name by host.
        if (
          typeof window === 'undefined' ||
          !shouldResolveCustomDomainHost(window.location.hostname)
        ) {
          setVendorName('SECURE');
          return;
        }
      }
      
      setLoadingVendor(true);
      try {
        // Prefer host-based resolution on custom domains (works for /admin on migoo.store).
        if (
          typeof window !== 'undefined' &&
          shouldResolveCustomDomainHost(window.location.hostname)
        ) {
          const host = window.location.hostname;
          const byDomainRes = await fetch(
            `${API_BASE_URL}/vendor/by-domain?domain=${encodeURIComponent(host)}`,
            {
              headers: {
                Authorization: `Bearer ${publicAnonKey}`,
              },
            }
          );
          if (byDomainRes.ok) {
            const byDomainData = (await byDomainRes.json()) as {
              vendorId?: string;
              logo?: string;
              storeName?: string;
              businessName?: string;
            };
            const resolved = pickDisplayVendorName(
              byDomainData.businessName,
              byDomainData.storeName,
              storeName
            );
            setVendorName(resolved);
            setVendorLogo(String(byDomainData.logo || "").trim());

            if (byDomainData.vendorId) {
              const storefrontRes = await fetch(
                `${API_BASE_URL}/vendor/storefront/${encodeURIComponent(byDomainData.vendorId)}`,
                { headers: { Authorization: `Bearer ${publicAnonKey}` } }
              ).catch(() => null);
              if (storefrontRes?.ok) {
                const storefrontData = (await storefrontRes.json().catch(() => ({}))) as {
                  settings?: { logo?: string; storeName?: string };
                };
                const logo = String(storefrontData.settings?.logo || "").trim();
                if (logo) setVendorLogo(logo);
                const storeLabel = String(storefrontData.settings?.storeName || "").trim();
                if (storeLabel) setVendorName(pickDisplayVendorName(storeLabel, resolved));
              }
            }
            return;
          }
        }

        if (!storeName) {
          setVendorName('SECURE');
          return;
        }

        console.log('🔍 Fetching vendor data for:', storeName);
        const response = await fetch(
          `${API_BASE_URL}/vendors/by-slug/${storeName}`,
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
          const name = pickDisplayVendorName(
            data.vendor?.businessName,
            data.vendor?.name,
            data.vendor?.storeName,
            storeName
          );
          
          console.log('📛 Setting vendor name to:', name);
          setVendorName(name);
          const logo = String(data.vendor?.logo || data.vendor?.avatar || "").trim();
          setVendorLogo(logo);
        } else {
          console.error('❌ Failed to fetch vendor:', response.status, response.statusText);
          const errorText = await response.text();
          console.error('Error details:', errorText);
          setVendorName(pickDisplayVendorName(storeName));
        }
      } catch (error) {
        if (error.message === 'Failed to fetch') {
          console.error('❌ Error fetching vendor: Cannot connect to server.');
          console.error('   The Supabase edge function may not be deployed yet.');
        } else {
          console.error('❌ Error fetching vendor:', error);
        }
        setVendorName(pickDisplayVendorName(storeName));
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
            {loadingVendor ? humanizeStoreLabel(storeName) : vendorName}
          </div>
          <div className="flex items-center gap-2 text-blue-600 dark:text-blue-400">
            <Store className="w-5 h-5" />
            <span className="text-sm font-medium">{t('vendorAuth.portal')}</span>
          </div>
        </div>

        {/* Clean White Login Card */}
        <div className="bg-white dark:bg-slate-900 rounded-3xl shadow-xl border border-slate-200 dark:border-slate-700 p-8">
          
          {/* Back Arrow */}
          <div className="mb-6">
            <button
              type="button"
              onClick={handleBack}
              aria-label={t('vendorAuth.backAria')}
              title={t('vendorAuth.back')}
              className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 transition-colors"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
          </div>

          {/* Title */}
          <div className="mb-8">
            <h1 className="text-2xl font-bold text-slate-900 dark:text-white mb-1">
              {t('vendorAuth.loginTitle')}
            </h1>
            <p className="text-sm text-slate-500 dark:text-slate-400">
              {t('vendorAuth.loginSubtitle')}
            </p>
          </div>

          {/* First-time Setup Notice */}
          <div className="mb-6 p-4 bg-blue-50 dark:bg-blue-900/20 border-2 border-blue-200 dark:border-blue-700 rounded-xl">
            <div className="flex items-start gap-3">
              <Store className="w-5 h-5 text-blue-600 dark:text-blue-400 flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-semibold text-blue-900 dark:text-blue-100 mb-1">
                  {t('vendorAuth.firstTime')}
                </p>
                <p className="text-xs text-blue-700 dark:text-blue-300 mb-2">
                  {t('vendorAuth.setupNotice')}
                </p>
                <button
                  type="button"
                  onClick={() => navigate('/vendor/setup')}
                  className="text-xs font-semibold text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-1"
                >
                  {t('vendorAuth.completeSetup')}
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
              <PolicyAgreementLabel
                htmlFor="terms"
                storeSlug={resolvedHostSlug || storeName}
                className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed cursor-pointer"
              />
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

        {/* Language Switcher */}
        <div className="mt-6 text-center">
          <button
            type="button"
            onClick={() => setLanguage(language === 'en' ? 'zh' : 'en')}
            className="inline-flex items-center gap-2 px-5 py-2.5 text-sm font-medium text-slate-700 dark:text-slate-300 hover:text-indigo-600 dark:hover:text-indigo-400 bg-white/60 dark:bg-slate-900/60 backdrop-blur-xl rounded-xl border border-slate-200/60 dark:border-slate-700/60 hover:border-indigo-300 dark:hover:border-indigo-600 transition-all duration-300 shadow-md hover:shadow-lg"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5h12M9 3v2m1.048 9.5A18.022 18.022 0 016.412 9m6.088 9h7M11 21l5-10 5 10M12.751 5C11.783 10.77 8.07 15.61 3 18.129" />
            </svg>
            {language === 'en' ? '中文' : 'English'}
          </button>
        </div>
      </div>
    </div>
  );
}