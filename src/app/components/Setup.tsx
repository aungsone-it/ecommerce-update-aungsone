import { projectId, publicAnonKey } from '../../../utils/supabase/info';
import { useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router';
import { useLanguage } from '../contexts/LanguageContext';
import { ArrowLeft, Eye, EyeOff, Loader2, CheckCircle } from 'lucide-react';
import { Button } from './ui/button';
import { Checkbox } from './ui/checkbox';
import { Label } from './ui/label';
import { Input } from './ui/input';

export function Setup() {
  const { t, language, setLanguage } = useLanguage();
  const navigate = useNavigate();
  const [step, setStep] = useState<'form' | 'success'>('form');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const [formData, setFormData] = useState({
    name: '',
    email: '',
    password: '',
    confirmPassword: '',
    phone: '',
  });
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [agreedToTerms, setAgreedToTerms] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!agreedToTerms) {
      setError(t('auth.login.agreeError'));
      return;
    }

    if (formData.password !== formData.confirmPassword) {
      setError(t('auth.setup.passwordMismatch'));
      return;
    }

    if (formData.password.length < 8) {
      setError(t('auth.setup.passwordTooShort'));
      return;
    }

    setLoading(true);

    try {
      const response = await fetch(
        `https://${projectId}.supabase.co/functions/v1/make-server-16010b6f/auth/setup`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${publicAnonKey}`,
          },
          body: JSON.stringify({
            name: formData.name,
            email: formData.email,
            password: formData.password,
            phone: formData.phone,
          }),
        }
      );

      const result = await response.json();

      if (!response.ok) {
        setError(result.error || t('auth.setup.error'));
        setLoading(false);
        return;
      }

      setStep('success');
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : t('auth.setup.error'));
    } finally {
      setLoading(false);
    }
  };

  const shell = (children: ReactNode, footerExtra?: ReactNode) => (
    <div className="min-h-screen relative overflow-hidden bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-100 dark:from-slate-950 dark:via-slate-900 dark:to-indigo-950 flex items-center justify-center p-4">
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div
          className="absolute top-0 right-0 w-96 h-96 bg-gradient-to-br from-blue-400/20 to-indigo-600/20 rounded-full blur-3xl animate-pulse"
          style={{ animationDuration: '4s' }}
        />
        <div
          className="absolute bottom-0 left-0 w-96 h-96 bg-gradient-to-tr from-purple-400/20 to-pink-600/20 rounded-full blur-3xl animate-pulse"
          style={{ animationDuration: '6s', animationDelay: '1s' }}
        />
        <div
          className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-96 h-96 bg-gradient-to-r from-cyan-400/10 to-blue-600/10 rounded-full blur-3xl animate-pulse"
          style={{ animationDuration: '8s', animationDelay: '2s' }}
        />
        <div className="absolute inset-0 bg-[linear-gradient(to_right,#8882_1px,transparent_1px),linear-gradient(to_bottom,#8882_1px,transparent_1px)] bg-[size:4rem_4rem] [mask-image:radial-gradient(ellipse_80%_50%_at_50%_50%,#000_70%,transparent_110%)]" />
      </div>

      <div className="w-full max-w-xl sm:max-w-2xl relative z-10">
        <div className="flex justify-center mb-6">
          <div className="text-4xl font-bold text-slate-900 dark:text-white drop-shadow-2xl">
            SECURE
          </div>
        </div>
        {children}
        {footerExtra ?? (
          <div className="mt-6 text-center">
            <button
              type="button"
              onClick={() => setLanguage(language === 'en' ? 'zh' : 'en')}
              className="inline-flex items-center gap-2 px-5 py-2.5 text-sm font-medium text-slate-700 dark:text-slate-300 hover:text-indigo-600 dark:hover:text-indigo-400 bg-white/60 dark:bg-slate-900/60 backdrop-blur-xl rounded-xl border border-slate-200/60 dark:border-slate-700/60 hover:border-indigo-300 dark:hover:border-indigo-600 transition-all duration-300 shadow-md hover:shadow-lg"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M3 5h12M9 3v2m1.048 9.5A18.022 18.022 0 016.412 9m6.088 9h7M11 21l5-10 5 10M12.751 5C11.783 10.77 8.07 15.61 3 18.129"
                />
              </svg>
              {language === 'en' ? '中文' : 'English'}
            </button>
          </div>
        )}
      </div>
    </div>
  );

  if (step === 'success') {
    return shell(
      <div className="bg-white dark:bg-slate-900 rounded-3xl shadow-xl border border-slate-200 dark:border-slate-700 p-8 text-center">
        <div className="inline-flex items-center justify-center w-16 h-16 bg-emerald-50 dark:bg-emerald-900/30 rounded-full mb-6">
          <CheckCircle className="w-9 h-9 text-emerald-600 dark:text-emerald-400" />
        </div>
        <h1 className="text-2xl font-bold text-slate-900 dark:text-white mb-3">
          {t('auth.setup.successTitle')}
        </h1>
        <p className="text-sm text-slate-500 dark:text-slate-400 mb-8">
          {t('auth.setup.successMessage')}
        </p>
        <Button
          type="button"
          onClick={() => navigate('/admin')}
          className="w-full h-12 bg-slate-900 hover:bg-slate-800 dark:bg-white dark:hover:bg-slate-100 text-white dark:text-slate-900 font-semibold rounded-full transition-colors shadow-lg"
        >
          {t('auth.setup.goToLogin')}
        </Button>
      </div>
    );
  }

  return shell(
    <div className="bg-white dark:bg-slate-900 rounded-3xl shadow-xl border border-slate-200 dark:border-slate-700 p-8">
      <button
        type="button"
        onClick={() => navigate('/admin')}
        className="mb-6 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 transition-colors"
        aria-label="Back to sign in"
      >
        <ArrowLeft className="w-5 h-5" />
      </button>

      <div className="mb-8">
        <h1 className="text-2xl font-bold text-slate-900 dark:text-white mb-1">
          {t('auth.setup.title')}
        </h1>
        <p className="text-sm text-slate-500 dark:text-slate-400">{t('auth.setup.subtitle')}</p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-5">
        <div className="space-y-2">
          <Label htmlFor="setup-name" className="text-slate-700 dark:text-slate-300 font-medium text-sm">
            {t('auth.setup.name')}
          </Label>
          <Input
            id="setup-name"
            type="text"
            value={formData.name}
            onChange={(e) => setFormData({ ...formData, name: e.target.value })}
            placeholder={t('auth.setup.namePlaceholder')}
            required
            autoComplete="name"
            className="h-11 bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700 rounded-lg focus:border-slate-400 dark:focus:border-slate-500 transition-colors text-slate-900 dark:text-white placeholder:text-slate-400"
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="setup-email" className="text-slate-700 dark:text-slate-300 font-medium text-sm">
            {t('auth.setup.email')}
          </Label>
          <Input
            id="setup-email"
            type="email"
            value={formData.email}
            onChange={(e) => setFormData({ ...formData, email: e.target.value })}
            placeholder={t('auth.setup.emailPlaceholder')}
            required
            autoComplete="email"
            className="h-11 bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700 rounded-lg focus:border-slate-400 dark:focus:border-slate-500 transition-colors text-slate-900 dark:text-white placeholder:text-slate-400"
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="setup-phone" className="text-slate-700 dark:text-slate-300 font-medium text-sm">
            {t('auth.setup.phone')}
          </Label>
          <Input
            id="setup-phone"
            type="tel"
            value={formData.phone}
            onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
            placeholder="+95 9 XXX XXX XXX"
            autoComplete="tel"
            className="h-11 bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700 rounded-lg focus:border-slate-400 dark:focus:border-slate-500 transition-colors text-slate-900 dark:text-white placeholder:text-slate-400"
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="setup-password" className="text-slate-700 dark:text-slate-300 font-medium text-sm">
            {t('auth.setup.password')}
          </Label>
          <div className="relative">
            <Input
              id="setup-password"
              type={showPassword ? 'text' : 'password'}
              value={formData.password}
              onChange={(e) => setFormData({ ...formData, password: e.target.value })}
              placeholder={t('auth.setup.passwordPlaceholder')}
              required
              autoComplete="new-password"
              className="h-11 pr-10 bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700 rounded-lg focus:border-slate-400 dark:focus:border-slate-500 transition-colors text-slate-900 dark:text-white placeholder:text-slate-400"
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 transition-colors"
              aria-label={showPassword ? 'Hide password' : 'Show password'}
            >
              {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="setup-confirm" className="text-slate-700 dark:text-slate-300 font-medium text-sm">
            {t('auth.setup.confirmPassword')}
          </Label>
          <div className="relative">
            <Input
              id="setup-confirm"
              type={showConfirmPassword ? 'text' : 'password'}
              value={formData.confirmPassword}
              onChange={(e) => setFormData({ ...formData, confirmPassword: e.target.value })}
              placeholder={t('auth.setup.confirmPasswordPlaceholder')}
              required
              autoComplete="new-password"
              className="h-11 pr-10 bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700 rounded-lg focus:border-slate-400 dark:focus:border-slate-500 transition-colors text-slate-900 dark:text-white placeholder:text-slate-400"
            />
            <button
              type="button"
              onClick={() => setShowConfirmPassword(!showConfirmPassword)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 transition-colors"
              aria-label={showConfirmPassword ? 'Hide password' : 'Show password'}
            >
              {showConfirmPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>
        </div>

        <div className="flex items-start gap-2">
          <Checkbox
            id="setup-terms"
            checked={agreedToTerms}
            onCheckedChange={(checked) => setAgreedToTerms(checked as boolean)}
            className="mt-0.5"
          />
          <Label
            htmlFor="setup-terms"
            className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed cursor-pointer"
          >
            {t('auth.login.agree')}
          </Label>
        </div>

        {error && (
          <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-3 text-sm text-red-700 dark:text-red-300">
            {error}
          </div>
        )}

        <Button
          type="submit"
          disabled={loading}
          className="w-full h-12 bg-slate-900 hover:bg-slate-800 dark:bg-white dark:hover:bg-slate-100 text-white dark:text-slate-900 font-semibold rounded-full transition-colors shadow-lg"
        >
          {loading ? (
            <span className="inline-flex items-center justify-center gap-2">
              <Loader2 className="w-5 h-5 animate-spin" />
              {t('auth.setup.creating')}
            </span>
          ) : (
            t('auth.setup.create')
          )}
        </Button>
      </form>

      <p className="mt-4 text-center text-xs text-slate-500 dark:text-slate-400">{t('auth.setup.info')}</p>

      <div className="mt-6 text-center">
        <p className="text-sm text-slate-600 dark:text-slate-400">
          {t('auth.setup.footerPrompt')}{' '}
          <button
            type="button"
            onClick={() => navigate('/admin')}
            className="text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 font-semibold transition-colors"
          >
            {t('auth.setup.footerSignIn')}
          </button>
        </p>
      </div>
    </div>
  );
}
