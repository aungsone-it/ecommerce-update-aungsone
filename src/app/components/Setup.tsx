import { projectId, publicAnonKey } from '../../../utils/supabase/info';
import { useState, useEffect, useCallback, type ReactNode } from 'react';
import { useNavigate } from 'react-router';
import { useLanguage } from '../contexts/LanguageContext';
import { ArrowLeft, Eye, EyeOff, Loader2, CheckCircle } from 'lucide-react';
import { Button } from './ui/button';
import { Checkbox } from './ui/checkbox';
import { Label } from './ui/label';
import { Input } from './ui/input';
import { usePlatformBranding } from '../hooks/usePlatformBranding';
import { buildSuperAdminDocumentTitle } from '../utils/superAdminDocumentTitle';
import { SUPER_ADMIN_SETUP_COMPLETE_EVENT } from './AppRouter';
import { isValidEmail } from '../../utils/helpers';
import { PolicyAgreementLabel } from './PolicyAgreementLabel';

const inputClassName =
  'h-11 bg-slate-50 border-slate-200 rounded-lg focus:border-slate-400 transition-colors text-slate-900 placeholder:text-slate-400';

type SetupFormData = {
  name: string;
  email: string;
  password: string;
  confirmPassword: string;
  phone: string;
};

type SetupField = keyof SetupFormData | 'terms';
type FieldErrors = Partial<Record<SetupField, string>>;

function isValidSetupPhone(phone: string): boolean {
  const raw = phone.trim();
  if (!raw) return true;
  const digits = raw.replace(/\D/g, '');
  return digits.length >= 10 && digits.length <= 15;
}

function isStrongEnoughPassword(password: string): boolean {
  if (password.length < 8) return false;
  return /[A-Za-z]/.test(password) && /\d/.test(password);
}

function fieldInputClass(hasError: boolean): string {
  return hasError
    ? `${inputClassName} border-red-400 focus:border-red-500`
    : inputClassName;
}

function FieldError({ message }: { message?: string }) {
  if (!message) return null;
  return <p className="text-xs text-red-600">{message}</p>;
}

export function Setup() {
  const { t, language, setLanguage } = useLanguage();
  const navigate = useNavigate();
  const [step, setStep] = useState<'form' | 'success'>('form');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [touched, setTouched] = useState<Partial<Record<SetupField, boolean>>>({});

  const [formData, setFormData] = useState<SetupFormData>({
    name: '',
    email: '',
    password: '',
    confirmPassword: '',
    phone: '',
  });
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [agreedToTerms, setAgreedToTerms] = useState(false);
  const platformBranding = usePlatformBranding();

  useEffect(() => {
    document.title = buildSuperAdminDocumentTitle({
      pageName: 'Setup',
      storeName: platformBranding.storeName,
    });
  }, [platformBranding.storeName]);

  const validateField = useCallback(
    (field: SetupField, data: SetupFormData, terms: boolean): string | undefined => {
      const name = data.name.trim();
      const email = data.email.trim();
      const phone = data.phone.trim();

      switch (field) {
        case 'name':
          if (!name) return t('auth.setup.nameRequired');
          if (name.length < 2) return t('auth.setup.nameTooShort');
          return undefined;
        case 'email':
          if (!email) return t('auth.setup.emailRequired');
          if (!isValidEmail(email)) return t('auth.setup.emailInvalid');
          return undefined;
        case 'phone':
          if (!isValidSetupPhone(phone)) return t('auth.setup.phoneInvalid');
          return undefined;
        case 'password':
          if (!data.password) return t('auth.setup.passwordTooShort');
          if (data.password.length < 8) return t('auth.setup.passwordTooShort');
          if (!isStrongEnoughPassword(data.password)) return t('auth.setup.passwordWeak');
          return undefined;
        case 'confirmPassword':
          if (!data.confirmPassword) return t('auth.setup.confirmRequired');
          if (data.password !== data.confirmPassword) return t('auth.setup.passwordMismatch');
          return undefined;
        case 'terms':
          if (!terms) return t('auth.login.agreeError');
          return undefined;
        default:
          return undefined;
      }
    },
    [t]
  );

  const validateAll = useCallback(
    (data: SetupFormData, terms: boolean): FieldErrors => {
      const fields: SetupField[] = [
        'name',
        'email',
        'phone',
        'password',
        'confirmPassword',
        'terms',
      ];
      const next: FieldErrors = {};
      for (const field of fields) {
        const message = validateField(field, data, terms);
        if (message) next[field] = message;
      }
      return next;
    },
    [validateField]
  );

  const markTouched = (field: SetupField) => {
    setTouched((prev) => ({ ...prev, [field]: true }));
  };

  const updateField = <K extends keyof SetupFormData>(key: K, value: SetupFormData[K]) => {
    setFormData((prev) => {
      const next = { ...prev, [key]: value };
      if (touched[key]) {
        setFieldErrors((errs) => ({
          ...errs,
          [key]: validateField(key, next, agreedToTerms),
          ...(key === 'password' && touched.confirmPassword
            ? { confirmPassword: validateField('confirmPassword', next, agreedToTerms) }
            : {}),
        }));
      }
      return next;
    });
    if (error) setError('');
  };

  const handleBlur = (field: SetupField) => {
    markTouched(field);
    setFieldErrors((prev) => ({
      ...prev,
      [field]: validateField(field, formData, agreedToTerms),
      ...(field === 'password' && formData.confirmPassword
        ? { confirmPassword: validateField('confirmPassword', formData, agreedToTerms) }
        : {}),
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    const nextErrors = validateAll(formData, agreedToTerms);
    setFieldErrors(nextErrors);
    setTouched({
      name: true,
      email: true,
      phone: true,
      password: true,
      confirmPassword: true,
      terms: true,
    });

    if (Object.keys(nextErrors).length > 0) {
      const firstInvalid = document.querySelector<HTMLElement>('[data-invalid="true"]');
      firstInvalid?.focus();
      return;
    }

    setLoading(true);

    const payload = {
      name: formData.name.trim(),
      email: formData.email.trim().toLowerCase(),
      password: formData.password,
      phone: formData.phone.trim(),
    };

    try {
      const response = await fetch(
        `https://${projectId}.supabase.co/functions/v1/make-server-16010b6f/auth/setup`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${publicAnonKey}`,
          },
          body: JSON.stringify(payload),
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

  const shell = (children: ReactNode) => (
    <div className="min-h-screen relative overflow-hidden bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-100 flex items-center justify-center p-4">
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

      <div className="w-full max-w-xl relative z-10">
        <div className="flex justify-center mb-6">
          <div className="text-4xl font-bold text-slate-900 drop-shadow-2xl">
            SECURE
          </div>
        </div>

        {children}

        <div className="mt-6 text-center">
          <button
            type="button"
            onClick={() => setLanguage(language === 'en' ? 'zh' : 'en')}
            className="inline-flex items-center gap-2 px-5 py-2.5 text-sm font-medium text-slate-700 hover:text-indigo-600 bg-white/60 backdrop-blur-xl rounded-xl border border-slate-200/60 hover:border-indigo-300 transition-all duration-300 shadow-md hover:shadow-lg"
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
      </div>
    </div>
  );

  if (step === 'success') {
    return shell(
      <div className="bg-white rounded-3xl shadow-xl border border-slate-200 p-8 text-center">
        <div className="inline-flex items-center justify-center w-16 h-16 bg-emerald-50 rounded-full mb-6">
          <CheckCircle className="w-9 h-9 text-emerald-600" />
        </div>
        <h1 className="text-2xl font-bold text-slate-900 mb-3">
          {t('auth.setup.successTitle')}
        </h1>
        <p className="text-sm text-slate-500 mb-8">
          {t('auth.setup.successMessage')}
        </p>
        <Button
          type="button"
          onClick={() => {
            window.dispatchEvent(new CustomEvent(SUPER_ADMIN_SETUP_COMPLETE_EVENT));
            navigate('/admin');
          }}
          className="w-full h-12 bg-slate-900 hover:bg-slate-800 text-white font-semibold rounded-full transition-colors shadow-lg"
        >
          {t('auth.setup.goToLogin')}
        </Button>
      </div>
    );
  }

  return shell(
    <div className="bg-white rounded-3xl shadow-xl border border-slate-200 p-8">
      <button
        type="button"
        onClick={() => navigate('/')}
        className="mb-6 text-slate-400 hover:text-slate-600 transition-colors"
        aria-label="Back to home"
      >
        <ArrowLeft className="w-5 h-5" />
      </button>

      <div className="mb-8">
        <h1 className="text-2xl font-bold text-slate-900 mb-1">
          {t('auth.setup.title')}
        </h1>
        <p className="text-sm text-slate-500">{t('auth.setup.subtitle')}</p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4" noValidate>
        <div className="space-y-2">
          <Label htmlFor="setup-name" className="text-slate-700 font-medium text-sm">
            {t('auth.setup.name')}
          </Label>
          <Input
            id="setup-name"
            type="text"
            value={formData.name}
            onChange={(e) => updateField('name', e.target.value)}
            onBlur={() => handleBlur('name')}
            placeholder={t('auth.setup.namePlaceholder')}
            autoComplete="name"
            aria-invalid={!!fieldErrors.name}
            data-invalid={fieldErrors.name ? 'true' : undefined}
            className={fieldInputClass(!!fieldErrors.name)}
          />
          <FieldError message={fieldErrors.name} />
        </div>

        <div className="space-y-2">
          <Label htmlFor="setup-email" className="text-slate-700 font-medium text-sm">
            {t('auth.setup.email')}
          </Label>
          <Input
            id="setup-email"
            type="email"
            value={formData.email}
            onChange={(e) => updateField('email', e.target.value)}
            onBlur={() => handleBlur('email')}
            placeholder={t('auth.setup.emailPlaceholder')}
            autoComplete="email"
            aria-invalid={!!fieldErrors.email}
            data-invalid={fieldErrors.email ? 'true' : undefined}
            className={fieldInputClass(!!fieldErrors.email)}
          />
          <FieldError message={fieldErrors.email} />
        </div>

        <div className="space-y-2">
          <Label htmlFor="setup-phone" className="text-slate-700 font-medium text-sm">
            {t('auth.setup.phone')}
          </Label>
          <Input
            id="setup-phone"
            type="tel"
            value={formData.phone}
            onChange={(e) => updateField('phone', e.target.value)}
            onBlur={() => handleBlur('phone')}
            placeholder="+95 9 XXX XXX XXX"
            autoComplete="tel"
            aria-invalid={!!fieldErrors.phone}
            data-invalid={fieldErrors.phone ? 'true' : undefined}
            className={fieldInputClass(!!fieldErrors.phone)}
          />
          <FieldError message={fieldErrors.phone} />
        </div>

        <div className="space-y-2">
          <Label htmlFor="setup-password" className="text-slate-700 font-medium text-sm">
            {t('auth.setup.password')}
          </Label>
          <div className="relative">
            <Input
              id="setup-password"
              type={showPassword ? 'text' : 'password'}
              value={formData.password}
              onChange={(e) => updateField('password', e.target.value)}
              onBlur={() => handleBlur('password')}
              placeholder={t('auth.setup.passwordPlaceholder')}
              autoComplete="new-password"
              aria-invalid={!!fieldErrors.password}
              data-invalid={fieldErrors.password ? 'true' : undefined}
              className={`pr-10 ${fieldInputClass(!!fieldErrors.password)}`}
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition-colors"
              aria-label={showPassword ? 'Hide password' : 'Show password'}
            >
              {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>
          <FieldError message={fieldErrors.password} />
          {!fieldErrors.password && (
            <p className="text-xs text-slate-400">{t('auth.changePassword.passwordHint')}</p>
          )}
        </div>

        <div className="space-y-2">
          <Label htmlFor="setup-confirm" className="text-slate-700 font-medium text-sm">
            {t('auth.setup.confirmPassword')}
          </Label>
          <div className="relative">
            <Input
              id="setup-confirm"
              type={showConfirmPassword ? 'text' : 'password'}
              value={formData.confirmPassword}
              onChange={(e) => updateField('confirmPassword', e.target.value)}
              onBlur={() => handleBlur('confirmPassword')}
              placeholder={t('auth.setup.confirmPasswordPlaceholder')}
              autoComplete="new-password"
              aria-invalid={!!fieldErrors.confirmPassword}
              data-invalid={fieldErrors.confirmPassword ? 'true' : undefined}
              className={`pr-10 ${fieldInputClass(!!fieldErrors.confirmPassword)}`}
            />
            <button
              type="button"
              onClick={() => setShowConfirmPassword(!showConfirmPassword)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition-colors"
              aria-label={showConfirmPassword ? 'Hide password' : 'Show password'}
            >
              {showConfirmPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>
          <FieldError message={fieldErrors.confirmPassword} />
        </div>

        <div className="space-y-1.5">
          <div className="flex items-start gap-2">
            <Checkbox
              id="setup-terms"
              checked={agreedToTerms}
              onCheckedChange={(checked) => {
                const next = checked === true;
                setAgreedToTerms(next);
                if (touched.terms || !next) {
                  setFieldErrors((prev) => ({
                    ...prev,
                    terms: validateField('terms', formData, next),
                  }));
                }
              }}
              onBlur={() => handleBlur('terms')}
              className="mt-0.5"
              aria-invalid={!!fieldErrors.terms}
            />
            <PolicyAgreementLabel
              htmlFor="setup-terms"
              className="text-xs text-slate-500 leading-relaxed cursor-pointer"
            />
          </div>
          <FieldError message={fieldErrors.terms} />
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700">
            {error}
          </div>
        )}

        <Button
          type="submit"
          disabled={loading}
          className="w-full h-12 bg-slate-900 hover:bg-slate-800 text-white font-semibold rounded-full transition-colors shadow-lg"
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

      <p className="mt-4 text-center text-xs text-slate-500">{t('auth.setup.info')}</p>

      <div className="mt-6 text-center">
        <p className="text-sm text-slate-600">
          {t('auth.setup.footerPrompt')}{' '}
          <button
            type="button"
            onClick={() => navigate('/admin')}
            className="text-blue-600 hover:text-blue-700 font-semibold transition-colors"
          >
            {t('auth.setup.footerSignIn')}
          </button>
        </p>
      </div>
    </div>
  );
}
