import { useState, useEffect } from 'react';
import { useLanguage } from '../contexts/LanguageContext';
import { ArrowLeft, Eye, EyeOff, Store, CheckCircle, Mail, Lock, AlertCircle } from 'lucide-react';
import { useNavigate, useSearchParams } from 'react-router';
import { projectId, publicAnonKey } from '../../../utils/supabase/info';
import { toast } from 'sonner';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';

// Vendor Setup Component - First-time setup wizard for approved vendors
export function VendorSetup() {
  const { t } = useLanguage();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [step, setStep] = useState<'verify' | 'setup' | 'complete'>('verify');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [vendorData, setVendorData] = useState<any>(null);
  const [checkingAccess, setCheckingAccess] = useState(true);
  const [alreadySetup, setAlreadySetup] = useState(false);

  // Check if email is provided in URL parameters
  useEffect(() => {
    const emailFromUrl = searchParams.get('email');
    if (emailFromUrl) {
      setEmail(emailFromUrl);
      // Auto-verify if email is provided
      setTimeout(() => {
        const form = document.getElementById('verify-form') as HTMLFormElement;
        if (form) {
          form.dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }));
        }
      }, 500);
    }
    setCheckingAccess(false);
  }, [searchParams]);

  const handleVerifyEmail = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const response = await fetch(
        `https://${projectId}.supabase.co/functions/v1/make-server-16010b6f/vendor-auth/verify-email`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${publicAnonKey}`,
          },
          body: JSON.stringify({ email }),
        }
      );

      const data = await response.json();

      if (!response.ok) {
        setError(data.error || 'Email verification failed');
        setLoading(false);
        return;
      }

      if (data.success && data.vendor) {
        // Check if vendor already has credentials
        if (data.vendor.hasCredentials) {
          setAlreadySetup(true);
          setError('');
          toast.info('Your account is already set up. Redirecting to login...');
          setTimeout(() => {
            navigate('/vendor/:vendorId/admin');
          }, 1500);
          setLoading(false);
          return;
        }

        setVendorData(data.vendor);
        setStep('setup');
        toast.success('Email verified! Please set your password.');
      } else {
        setError('Unable to verify email. Please contact support.');
      }
    } catch (error: any) {
      console.error('❌ Email verification error:', error);
      setError('Network error. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleSetupCredentials = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    // Validate passwords match
    if (password !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }

    // Validate password strength
    if (password.length < 8) {
      setError('Password must be at least 8 characters long');
      return;
    }

    setLoading(true);

    try {
      const response = await fetch(
        `https://${projectId}.supabase.co/functions/v1/make-server-16010b6f/vendor-auth/setup-credentials`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${publicAnonKey}`,
          },
          body: JSON.stringify({ 
            email,
            password 
          }),
        }
      );

      const data = await response.json();

      if (!response.ok) {
        setError(data.error || 'Failed to set up credentials');
        setLoading(false);
        return;
      }

      if (data.success) {
        setStep('complete');
        toast.success('Credentials set successfully! You can now login.');
        
        // Redirect to vendor login after 2 seconds
        setTimeout(() => {
          navigate('/vendor/:vendorId/admin');
        }, 2000);
      } else {
        setError('Failed to set up credentials. Please try again.');
      }
    } catch (error: any) {
      console.error('❌ Setup credentials error:', error);
      setError('Network error. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleBackToHome = () => {
    navigate('/');
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

      <div className="w-full max-w-[480px] relative z-10">
        {/* Logo Section */}
        <div className="flex flex-col items-center mb-6">
          <div className="text-4xl font-bold text-slate-900 dark:text-white drop-shadow-2xl mb-2">
            {vendorData?.businessName || vendorData?.name || 'SECURE'}
          </div>
          <div className="flex items-center gap-2 text-blue-600 dark:text-blue-400">
            <Store className="w-5 h-5" />
            <span className="text-sm font-medium">Vendor Setup</span>
          </div>
        </div>

        {/* Clean White Setup Card */}
        <div className="bg-white dark:bg-slate-900 rounded-3xl shadow-xl border border-slate-200 dark:border-slate-700 p-8">
          
          {/* Back Arrow */}
          <button 
            type="button"
            onClick={handleBackToHome}
            className="mb-6 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 transition-colors"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>

          {/* Step 1: Verify Email */}
          {step === 'verify' && (
            <>
              {/* Title */}
              <div className="mb-8">
                <h1 className="text-2xl font-bold text-slate-900 dark:text-white mb-1">
                  Complete Vendor Setup
                </h1>
                <p className="text-sm text-slate-500 dark:text-slate-400">
                  Your application has been approved! Set up your credentials to access your vendor portal.
                </p>
              </div>

              {/* Info Box */}
              <div className="mb-6 p-4 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg">
                <div className="flex gap-3">
                  <Store className="w-5 h-5 text-blue-600 dark:text-blue-400 flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="text-sm font-medium text-blue-900 dark:text-blue-100 mb-1">
                      Welcome to SECURE Vendor Platform
                    </p>
                    <p className="text-xs text-blue-700 dark:text-blue-300">
                      Enter the email you used in your application to get started.
                    </p>
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
              <form id="verify-form" onSubmit={handleVerifyEmail} className="space-y-5">
                {/* Email */}
                <div className="space-y-2">
                  <Label htmlFor="email" className="text-slate-700 dark:text-slate-300 font-medium text-sm">
                    Email Address
                  </Label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                    <Input
                      id="email"
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="Enter your email"
                      required
                      className="h-11 pl-10 bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700 rounded-lg focus:border-slate-400 dark:focus:border-slate-500 transition-colors text-slate-900 dark:text-white placeholder:text-slate-400"
                    />
                  </div>
                  <p className="text-xs text-slate-500">
                    Use the email address from your vendor application
                  </p>
                </div>

                {/* Verify Button */}
                <Button
                  type="submit"
                  disabled={loading}
                  className="w-full h-11 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg shadow-lg shadow-blue-600/30 transition-all duration-200 hover:shadow-xl hover:shadow-blue-600/40 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {loading ? 'Verifying...' : 'Verify Email'}
                </Button>
              </form>
            </>
          )}

          {/* Step 2: Setup Password */}
          {step === 'setup' && (
            <>
              {/* Title */}
              <div className="mb-8">
                <div className="flex items-center gap-2 mb-2">
                  <CheckCircle className="w-6 h-6 text-green-600" />
                  <h1 className="text-2xl font-bold text-slate-900 dark:text-white">
                    Set Your Password
                  </h1>
                </div>
                <p className="text-sm text-slate-500 dark:text-slate-400">
                  {vendorData?.name && `Welcome, ${vendorData.name}! `}
                  Create a secure password for your vendor account.
                </p>
              </div>

              {/* Error Message */}
              {error && (
                <div className="mb-4 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg text-sm text-red-600 dark:text-red-400">
                  {error}
                </div>
              )}

              {/* Form */}
              <form onSubmit={handleSetupCredentials} className="space-y-5">
                {/* Email Display (Read-only) */}
                <div className="space-y-2">
                  <Label className="text-slate-700 dark:text-slate-300 font-medium text-sm">
                    Email Address
                  </Label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                    <Input
                      type="email"
                      value={email}
                      disabled
                      className="h-11 pl-10 bg-slate-100 dark:bg-slate-800 border-slate-200 dark:border-slate-700 rounded-lg text-slate-600 dark:text-slate-400"
                    />
                  </div>
                </div>

                {/* Password */}
                <div className="space-y-2">
                  <Label htmlFor="password" className="text-slate-700 dark:text-slate-300 font-medium text-sm">
                    Password
                  </Label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                    <Input
                      id="password"
                      type={showPassword ? 'text' : 'password'}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="Enter your password"
                      required
                      minLength={8}
                      className="h-11 pl-10 pr-10 bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700 rounded-lg focus:border-slate-400 dark:focus:border-slate-500 transition-colors text-slate-900 dark:text-white placeholder:text-slate-400"
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

                {/* Confirm Password */}
                <div className="space-y-2">
                  <Label htmlFor="confirmPassword" className="text-slate-700 dark:text-slate-300 font-medium text-sm">
                    Confirm Password
                  </Label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                    <Input
                      id="confirmPassword"
                      type={showConfirmPassword ? 'text' : 'password'}
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      placeholder="Confirm your password"
                      required
                      minLength={8}
                      className="h-11 pl-10 pr-10 bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700 rounded-lg focus:border-slate-400 dark:focus:border-slate-500 transition-colors text-slate-900 dark:text-white placeholder:text-slate-400"
                    />
                    <button
                      type="button"
                      onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 transition-colors"
                    >
                      {showConfirmPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                  <p className="text-xs text-slate-500">
                    Password must be at least 8 characters long
                  </p>
                </div>

                {/* Setup Button */}
                <Button
                  type="submit"
                  disabled={loading}
                  className="w-full h-11 bg-green-600 hover:bg-green-700 text-white font-medium rounded-lg shadow-lg shadow-green-600/30 transition-all duration-200 hover:shadow-xl hover:shadow-green-600/40 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {loading ? 'Setting up...' : 'Complete Setup'}
                </Button>
              </form>
            </>
          )}

          {/* Step 3: Complete */}
          {step === 'complete' && (
            <div className="text-center py-8">
              <div className="w-16 h-16 bg-green-100 dark:bg-green-900/20 rounded-full flex items-center justify-center mx-auto mb-4">
                <CheckCircle className="w-10 h-10 text-green-600 dark:text-green-400" />
              </div>
              <h1 className="text-2xl font-bold text-slate-900 dark:text-white mb-2">
                Setup Complete!
              </h1>
              <p className="text-sm text-slate-600 dark:text-slate-400 mb-6">
                Your vendor account is ready. You can now login to your vendor portal.
              </p>
              <div className="space-y-3">
                <Button
                  onClick={() => navigate('/vendor/:vendorId/admin')}
                  className="w-full h-11 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg shadow-lg shadow-blue-600/30 transition-all duration-200"
                >
                  Go to Vendor Login
                </Button>
                <Button
                  variant="outline"
                  onClick={handleBackToHome}
                  className="w-full h-11"
                >
                  Back to Home
                </Button>
              </div>
            </div>
          )}

          {/* Already Setup State */}
          {alreadySetup && (
            <div className="text-center py-8">
              <div className="w-16 h-16 bg-blue-100 dark:bg-blue-900/20 rounded-full flex items-center justify-center mx-auto mb-4">
                <AlertCircle className="w-10 h-10 text-blue-600 dark:text-blue-400" />
              </div>
              <h1 className="text-2xl font-bold text-slate-900 dark:text-white mb-2">
                Already Set Up
              </h1>
              <p className="text-sm text-slate-600 dark:text-slate-400 mb-6">
                This account has already been set up with credentials. Please use the login page to access your vendor portal.
              </p>
              <div className="space-y-3">
                <Button
                  onClick={() => navigate('/vendor/:vendorId/admin')}
                  className="w-full h-11 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg shadow-lg shadow-blue-600/30 transition-all duration-200"
                >
                  Go to Login
                </Button>
                <Button
                  variant="outline"
                  onClick={handleBackToHome}
                  className="w-full h-11"
                >
                  Back to Home
                </Button>
              </div>
            </div>
          )}
        </div>

        {/* Already have account link */}
        {step !== 'complete' && !alreadySetup && (
          <div className="mt-6 text-center">
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Already set up your account?{' '}
              <button
                type="button"
                onClick={() => navigate('/vendor/:vendorId/admin')}
                className="text-blue-600 dark:text-blue-400 hover:underline font-medium"
              >
                Login here
              </button>
            </p>
          </div>
        )}
      </div>
    </div>
  );
}