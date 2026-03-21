import { useState } from 'react';
import { useNavigate } from 'react-router';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Mail, Lock, ArrowLeft, CheckCircle2, AlertCircle } from 'lucide-react';
import { projectId, publicAnonKey } from '../../../utils/supabase/info';
import { toast } from 'sonner';

export function ResetPasswordPage() {
  const navigate = useNavigate();
  const [step, setStep] = useState<'email' | 'verify'>('email');
  const [email, setEmail] = useState('');
  const [otpCode, setOtpCode] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [debugOtp, setDebugOtp] = useState('');

  const handleSendOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const response = await fetch(
        `https://${projectId}.supabase.co/functions/v1/make-server-16010b6f/auth/send-email-otp`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${publicAnonKey}`
          },
          body: JSON.stringify({ email: email.trim() })
        }
      );

      const data = await response.json();

      if (!response.ok) {
        setError(data.error || 'Failed to send OTP');
        setLoading(false);
        toast.error(data.error || 'Failed to send OTP');
        return;
      }

      // Only show debug OTP if email delivery failed (fallback)
      if (data.debug_otp) {
        setDebugOtp(data.debug_otp);
        console.warn('Email service not configured, using debug mode');
      }

      setStep('verify');
      setLoading(false);
      
      // Show appropriate message
      if (data.debug_otp) {
        toast.success('OTP generated (email service not configured)');
      } else {
        toast.success('Password reset code sent to your email!');
      }
    } catch (err: any) {
      console.error('Send OTP error:', err);
      setError('Failed to send OTP. Please try again.');
      setLoading(false);
      toast.error('Failed to send OTP. Please try again.');
    }
  };

  const handleVerifyOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const response = await fetch(
        `https://${projectId}.supabase.co/functions/v1/make-server-16010b6f/auth/verify-otp-and-reset`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${publicAnonKey}`
          },
          body: JSON.stringify({ 
            email: email.trim(), 
            otp: otpCode.trim(), 
            newPassword 
          })
        }
      );

      const data = await response.json();

      if (!response.ok) {
        setError(data.error || 'Failed to reset password');
        setLoading(false);
        toast.error(data.error || 'Failed to reset password');
        return;
      }

      // Success!
      toast.success('Password reset successful! Redirecting to login...');
      setTimeout(() => {
        navigate('/store');
      }, 1500);
    } catch (err: any) {
      console.error('Verify OTP error:', err);
      setError('Failed to verify OTP. Please try again.');
      setLoading(false);
      toast.error('Failed to verify OTP. Please try again.');
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-8">
        {/* STEP 1: Enter Email */}
        {step === 'email' && (
          <>
            <div className="mb-6">
              <button
                onClick={() => navigate('/store')}
                className="flex items-center gap-2 text-sm text-slate-600 hover:text-slate-900 transition-colors mb-4"
              >
                <ArrowLeft className="w-4 h-4" />
                Back to Store
              </button>
              <h1 className="text-2xl font-bold text-slate-900 mb-2">
                RESET PASSWORD
              </h1>
              <p className="text-sm text-slate-500">
                Enter your email to receive a reset code
              </p>
            </div>

            <form onSubmit={handleSendOtp} className="space-y-4">
              <div>
                <Label htmlFor="reset-email" className="text-sm font-medium text-slate-700 mb-1.5 block">
                  Email Address *
                </Label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
                  <Input
                    id="reset-email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="your@email.com"
                    required
                    className="pl-10 h-12 bg-slate-50 border-slate-200 rounded-lg"
                  />
                </div>
              </div>

              {error && (
                <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700">
                  {error}
                </div>
              )}

              <Button
                type="submit"
                disabled={loading}
                className="w-full h-12 bg-[#1a1d29] hover:bg-slate-900 text-white font-semibold rounded-full shadow-lg transition-colors disabled:opacity-50"
              >
                {loading ? 'Sending...' : 'Send Reset Code'}
              </Button>
            </form>
          </>
        )}

        {/* STEP 2: Verify OTP and Set New Password */}
        {step === 'verify' && (
          <>
            <div className="mb-6">
              <button
                onClick={() => setStep('email')}
                className="flex items-center gap-2 text-sm text-slate-600 hover:text-slate-900 transition-colors mb-4"
              >
                <ArrowLeft className="w-4 h-4" />
                Change Email
              </button>
              <h1 className="text-2xl font-bold text-slate-900 mb-2">
                VERIFY CODE
              </h1>
              <p className="text-sm text-slate-500">
                Enter the 6-digit code sent to {email}
              </p>
            </div>

            {debugOtp && (
              <div className="mb-4 p-3 bg-green-50 border border-green-200 rounded-lg text-sm">
                <p className="font-semibold text-green-800">🔐 Demo Code:</p>
                <p className="text-2xl font-bold text-green-700 text-center mt-2">{debugOtp}</p>
                <p className="text-xs text-green-600 mt-2 text-center">
                  (In production, this would be sent via email)
                </p>
              </div>
            )}

            <form onSubmit={handleVerifyOtp} className="space-y-4">
              <div>
                <Label htmlFor="otp" className="text-sm font-medium text-slate-700 mb-1.5 block">
                  Verification Code *
                </Label>
                <Input
                  id="otp"
                  type="text"
                  value={otpCode}
                  onChange={(e) => setOtpCode(e.target.value)}
                  placeholder="Enter 6-digit code"
                  required
                  maxLength={6}
                  className="h-12 bg-slate-50 border-slate-200 rounded-lg text-center text-2xl tracking-widest"
                />
              </div>

              <div>
                <Label htmlFor="new-password" className="text-sm font-medium text-slate-700 mb-1.5 block">
                  New Password *
                </Label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
                  <Input
                    id="new-password"
                    type="password"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder="Enter new password"
                    required
                    className="pl-10 h-12 bg-slate-50 border-slate-200 rounded-lg"
                  />
                </div>
              </div>

              {error && (
                <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700">
                  {error}
                </div>
              )}

              <Button
                type="submit"
                disabled={loading}
                className="w-full h-12 bg-[#1a1d29] hover:bg-slate-900 text-white font-semibold rounded-full shadow-lg transition-colors disabled:opacity-50"
              >
                {loading ? 'Resetting...' : 'Reset Password'}
              </Button>

              <button
                type="button"
                onClick={() => {
                  setStep('email');
                  setOtpCode('');
                  setNewPassword('');
                  setDebugOtp('');
                  setError('');
                }}
                className="w-full text-sm text-slate-600 hover:text-slate-900 transition-colors"
              >
                Resend Code
              </button>
            </form>
          </>
        )}
      </div>
    </div>
  );
}