import { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useLanguage } from '../contexts/LanguageContext';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Eye, EyeOff, Loader2 } from 'lucide-react';

export function ChangePassword() {
  const { changePassword } = useAuth();
  const { t } = useLanguage();
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (newPassword !== confirmPassword) {
      setError(t('auth.changePassword.passwordMismatch'));
      return;
    }

    if (newPassword.length < 8) {
      setError(t('auth.changePassword.passwordTooShort'));
      return;
    }

    setLoading(true);

    const result = await changePassword(newPassword);

    if (!result.success) {
      setError(result.error || t('auth.changePassword.error'));
      setLoading(false);
    }
    // If successful, AuthContext will redirect to dashboard
  };

  const inputClassName =
    'h-11 pr-10 bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700 rounded-lg focus:border-slate-400 dark:focus:border-slate-500 transition-colors text-slate-900 dark:text-white placeholder:text-slate-400';

  return (
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

      <div className="w-full max-w-[400px] relative z-10">
        <div className="flex justify-center mb-6">
          <div className="text-4xl font-bold text-slate-900 dark:text-white drop-shadow-2xl">
            SECURE
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 rounded-3xl shadow-xl border border-slate-200 dark:border-slate-700 p-8">
          <div className="mb-8">
            <h1 className="text-2xl font-bold text-slate-900 dark:text-white mb-1">
              {t('auth.changePassword.title')}
            </h1>
            <p className="text-sm text-slate-500 dark:text-slate-400">
              {t('auth.changePassword.subtitle')}
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-5">
            <div className="space-y-2">
              <Label
                htmlFor="new-password"
                className="text-slate-700 dark:text-slate-300 font-medium text-sm"
              >
                {t('auth.changePassword.newPassword')}
              </Label>
              <div className="relative">
                <Input
                  id="new-password"
                  type={showPassword ? 'text' : 'password'}
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder={t('auth.changePassword.passwordPlaceholder')}
                  required
                  className={inputClassName}
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
              <p className="text-xs text-slate-500 dark:text-slate-400">
                {t('auth.changePassword.passwordHint')}
              </p>
            </div>

            <div className="space-y-2">
              <Label
                htmlFor="confirm-password"
                className="text-slate-700 dark:text-slate-300 font-medium text-sm"
              >
                {t('auth.changePassword.confirmPassword')}
              </Label>
              <Input
                id="confirm-password"
                type={showPassword ? 'text' : 'password'}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder={t('auth.changePassword.confirmPasswordPlaceholder')}
                required
                className="h-11 bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700 rounded-lg focus:border-slate-400 dark:focus:border-slate-500 transition-colors text-slate-900 dark:text-white placeholder:text-slate-400"
              />
            </div>

            {error && (
              <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-3 text-sm text-red-700 dark:text-red-300">
                {error}
              </div>
            )}

            <Button
              type="submit"
              disabled={loading}
              className="w-full h-12 bg-slate-900 hover:bg-slate-800 dark:bg-white dark:hover:bg-slate-100 text-white dark:text-slate-900 font-semibold rounded-full transition-colors shadow-lg disabled:opacity-60"
            >
              {loading ? (
                <span className="inline-flex items-center justify-center gap-2">
                  <Loader2 className="w-5 h-5 animate-spin" />
                  {t('auth.changePassword.updating')}
                </span>
              ) : (
                t('auth.changePassword.update')
              )}
            </Button>
          </form>
        </div>
      </div>
    </div>
  );
}
