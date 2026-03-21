import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router';
import { Button } from './ui/button';
import { Checkbox } from './ui/checkbox';
import { Label } from './ui/label';
import { Input } from './ui/input';
import { X, Mail, Lock, User, Phone, Upload, AlertCircle, CheckCircle2 } from 'lucide-react';
import { compressImage } from '../../utils/imageCompression';
import { projectId, publicAnonKey } from '../../../utils/supabase/info';

interface StorefrontAuthProps {
  onBack: () => void;
  onLogin: (email: string, password: string, name?: string, phone?: string) => Promise<void>;
  onRegister: (email: string, password: string, name: string, phone?: string, profileImage?: string) => Promise<void>;
}

export function StorefrontAuth({ onBack, onLogin, onRegister }: StorefrontAuthProps) {
  const navigate = useNavigate();
  const [authMode, setAuthMode] = useState<'login' | 'register'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [profileImage, setProfileImage] = useState<string | null>(null);
  const [rememberMe, setRememberMe] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const isMountedRef = useRef(true);
  
  // 🔥 Real-time validation states
  const [emailValidation, setEmailValidation] = useState<{ checking: boolean; error: string; valid: boolean }>({
    checking: false,
    error: '',
    valid: false
  });
  const [phoneValidation, setPhoneValidation] = useState<{ checking: boolean; error: string; valid: boolean }>({
    checking: false,
    error: '',
    valid: false
  });
  
  // Debounce timers
  const emailCheckTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const phoneCheckTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Track component mount status
  useEffect(() => {
    return () => {
      isMountedRef.current = false;
      if (emailCheckTimeoutRef.current) clearTimeout(emailCheckTimeoutRef.current);
      if (phoneCheckTimeoutRef.current) clearTimeout(phoneCheckTimeoutRef.current);
    };
  }, []);

  // 🔥 Reset validation when switching modes
  useEffect(() => {
    if (authMode === 'login') {
      // Clear validation states when switching to login
      setEmailValidation({ checking: false, error: '', valid: false });
      setPhoneValidation({ checking: false, error: '', valid: false });
    }
  }, [authMode]);

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      try {
        // Compress image to max 500KB
        const compressedDataUrl = await compressImage(file, 500);
        setProfileImage(compressedDataUrl);
      } catch (error) {
        console.error('Image compression error:', error);
        setError('Failed to process image. Please try a different image.');
      }
    }
  };

  const removeImage = () => {
    setProfileImage(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (authMode === 'register' && password !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }
    
    // 🔥 SYNCHRONOUS CLIENT-SIDE VALIDATION (before async API checks)
    if (authMode === 'register') {
      // Validate email format CLIENT-SIDE first
      const emailRegex = /^[a-zA-Z0-9._-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
      if (!emailRegex.test(email.trim())) {
        setError('Please enter a valid email address with domain (e.g., name@example.com)');
        return;
      }
      
      // Validate phone format CLIENT-SIDE if provided
      if (phone && phone.trim()) {
        const normalizedPhone = phone.replace(/[\s\-]/g, '');
        const myanmarPhoneRegex = /^(\+959|09)\d{9}$/; // Exactly 11 digits for 09XXXXXXXXX or 12 for +959XXXXXXXXX
        
        if (!myanmarPhoneRegex.test(normalizedPhone)) {
          setError('Phone must be Myanmar format: +959XXXXXXXXX (12 digits) or 09XXXXXXXXX (11 digits)');
          return;
        }
      }
      
      // Wait if validation is still checking
      if (emailValidation.checking) {
        setError('Please wait while we verify your email...');
        return;
      }
      if (phoneValidation.checking) {
        setError('Please wait while we verify your phone number...');
        return;
      }
      
      // Check for validation errors
      if (emailValidation.error) {
        setError(emailValidation.error);
        return;
      }
      if (phoneValidation.error) {
        setError(phoneValidation.error);
        return;
      }
      
      // Require validation to have completed successfully
      if (email && !emailValidation.valid) {
        setError('Please use a valid and available email address');
        return;
      }
      if (phone && !phoneValidation.valid) {
        setError('Please use a valid and available phone number');
        return;
      }
    }
    
    setLoading(true);

    try {
      if (authMode === 'login') {
        await onLogin(email, password);
        // Success - navigation will happen, no need to setLoading(false)
      } else {
        if (!name) {
          setError('Please enter your full name');
          if (isMountedRef.current) setLoading(false);
          return;
        }
        await onRegister(email, password, name, phone, profileImage || undefined);
        // Success - navigation will happen, no need to setLoading(false)
      }
    } catch (err: any) {
      console.error('Auth error:', err);
      // Only update state if component is still mounted
      if (isMountedRef.current) {
        // Provide helpful error messages
        let errorMessage = err?.message || 'An error occurred. Please try again.';
        
        // Special handling for duplicate account errors
        if (errorMessage.includes('already exists')) {
          errorMessage = 'This email is already registered. Please use a different email or click "Sign In" if you already have an account.';
        }
        
        setError(errorMessage);
        setLoading(false);
      }
    }
  };

  // 🔥 Real-time email validation
  useEffect(() => {
    if (authMode !== 'register') return; // Only validate during registration
    
    if (emailCheckTimeoutRef.current) clearTimeout(emailCheckTimeoutRef.current);
    
    if (email && email.trim()) {
      setEmailValidation({ checking: true, error: '', valid: false });
      emailCheckTimeoutRef.current = setTimeout(async () => {
        try {
          const response = await fetch(
            `https://${projectId}.supabase.co/functions/v1/make-server-16010b6f/auth/validate`,
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
          
          if (isMountedRef.current) {
            if (data.errors?.email) {
              setEmailValidation({ checking: false, error: data.errors.email, valid: false });
            } else {
              setEmailValidation({ checking: false, error: '', valid: true });
            }
          }
        } catch (error) {
          console.error('Email validation error:', error);
          if (isMountedRef.current) {
            setEmailValidation({ checking: false, error: '', valid: false });
          }
        }
      }, 800); // 800ms debounce
    } else {
      setEmailValidation({ checking: false, error: '', valid: false });
    }
  }, [email, authMode]);

  // 🔥 Real-time phone validation
  useEffect(() => {
    if (authMode !== 'register') return; // Only validate during registration
    
    if (phoneCheckTimeoutRef.current) clearTimeout(phoneCheckTimeoutRef.current);
    
    if (phone && phone.trim()) {
      setPhoneValidation({ checking: true, error: '', valid: false });
      phoneCheckTimeoutRef.current = setTimeout(async () => {
        try {
          const response = await fetch(
            `https://${projectId}.supabase.co/functions/v1/make-server-16010b6f/auth/validate`,
            {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${publicAnonKey}`
              },
              body: JSON.stringify({ phone: phone.trim() })
            }
          );
          const data = await response.json();
          
          if (isMountedRef.current) {
            if (data.errors?.phone) {
              setPhoneValidation({ checking: false, error: data.errors.phone, valid: false });
            } else {
              setPhoneValidation({ checking: false, error: '', valid: true });
            }
          }
        } catch (error) {
          console.error('Phone validation error:', error);
          if (isMountedRef.current) {
            setPhoneValidation({ checking: false, error: '', valid: false });
          }
        }
      }, 800); // 800ms debounce
    } else {
      setPhoneValidation({ checking: false, error: '', valid: false });
    }
  }, [phone, authMode]);

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 z-50">
      {/* Modal Card */}
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md relative animate-in fade-in zoom-in duration-200">
        {/* Close Button */}
        <button
          onClick={onBack}
          className="absolute top-4 right-4 text-slate-400 hover:text-slate-600 transition-colors"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="p-8">
          {/* LOGIN/REGISTER SCREEN */}
          {(authMode === 'login' || authMode === 'register') && (
            <>
              {/* Title */}
              <div className="text-center mb-6">
                <h1 className="text-2xl font-bold text-slate-900 mb-2">
                  {authMode === 'login' ? 'WELCOME' : 'CREATE ACCOUNT'}
                </h1>
                <p className="text-sm text-slate-500">
                  {authMode === 'login' 
                    ? 'Sign in to access your account' 
                    : 'Sign up to get started with SECURE'}
                </p>
              </div>

              {/* Form */}
              <form onSubmit={handleSubmit} className="space-y-4">
                {/* Profile Image Upload (Register Only) */}
                {authMode === 'register' && (
                  <div className="flex justify-center mb-2">
                    <div className="relative">
                      {profileImage ? (
                        <div className="relative w-24 h-24">
                          <img
                            src={profileImage}
                            alt="Profile"
                            className="w-full h-full object-cover rounded-full border-4 border-slate-100"
                          />
                          <button
                            type="button"
                            onClick={removeImage}
                            className="absolute -top-1 -right-1 bg-red-500 hover:bg-red-600 text-white rounded-full p-1 transition-colors shadow-lg"
                          >
                            <X className="w-3 h-3" />
                          </button>
                        </div>
                      ) : (
                        <label
                          htmlFor="profileImage"
                          className="flex flex-col items-center justify-center w-24 h-24 border-2 border-dashed border-slate-300 rounded-full cursor-pointer bg-slate-50 hover:bg-slate-100 transition-colors"
                        >
                          <Upload className="w-6 h-6 text-slate-400" />
                          <span className="text-[9px] text-slate-400 mt-1">Upload</span>
                        </label>
                      )}
                      <input
                        id="profileImage"
                        type="file"
                        accept="image/*"
                        onChange={handleImageUpload}
                        className="hidden"
                      />
                    </div>
                  </div>
                )}

                {/* Full Name (Register Only) */}
                {authMode === 'register' && (
                  <div>
                    <Label htmlFor="name" className="text-sm font-medium text-slate-700 mb-1.5 block">
                      Full Name *
                    </Label>
                    <div className="relative">
                      <User className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
                      <Input
                        id="name"
                        type="text"
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        placeholder="Enter your full name"
                        required
                        className="pl-10 h-12 bg-slate-50 border-slate-200 rounded-lg text-slate-900 placeholder:text-slate-400"
                      />
                    </div>
                  </div>
                )}

                {/* Phone (Register Only) */}
                {authMode === 'register' && (
                  <div>
                    <Label htmlFor="phone" className="text-sm font-medium text-slate-700 mb-1.5 block">
                      Phone Number
                    </Label>
                    <div className="relative">
                      <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
                      <Input
                        id="phone"
                        type="tel"
                        value={phone}
                        onChange={(e) => setPhone(e.target.value)}
                        placeholder="+959XXXXXXXXX or 09XXXXXXXXX"
                        autoComplete="off"
                        inputMode="tel"
                        className={`pl-10 pr-10 h-12 bg-slate-50 border-slate-200 rounded-lg text-slate-900 placeholder:text-slate-400 ${
                          phoneValidation.error ? 'border-red-300' : phoneValidation.valid ? 'border-green-300' : ''
                        }`}
                      />
                      {/* Right-side validation indicators */}
                      {phoneValidation.checking && (
                        <div className="absolute right-3 top-1/2 -translate-y-1/2">
                          <div className="w-5 h-5 border-2 border-slate-300 border-t-slate-600 rounded-full animate-spin"></div>
                        </div>
                      )}
                      {phoneValidation.error && (
                        <AlertCircle className="absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 text-red-500" />
                      )}
                      {phoneValidation.valid && (
                        <CheckCircle2 className="absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 text-green-500" />
                      )}
                    </div>
                    {phoneValidation.error && (
                      <p className="text-xs text-red-500 mt-1">{phoneValidation.error}</p>
                    )}
                    {phoneValidation.valid && (
                      <p className="text-xs text-green-600 mt-1">✓ Phone number is available</p>
                    )}
                  </div>
                )}

                {/* Email */}
                <div>
                  <Label htmlFor="email" className="text-sm font-medium text-slate-700 mb-1.5 block">
                    Email Address *
                  </Label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
                    <Input
                      id="email"
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="your@email.com"
                      required
                      className={`pl-10 pr-10 h-12 bg-slate-50 border-slate-200 rounded-lg text-slate-900 placeholder:text-slate-400 ${
                        emailValidation.error ? 'border-red-300' : emailValidation.valid ? 'border-green-300' : ''
                      }`}
                    />
                    {/* Right-side validation indicators */}
                    {emailValidation.checking && (
                      <div className="absolute right-3 top-1/2 -translate-y-1/2">
                        <div className="w-5 h-5 border-2 border-slate-300 border-t-slate-600 rounded-full animate-spin"></div>
                      </div>
                    )}
                    {emailValidation.error && (
                      <AlertCircle className="absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 text-red-500" />
                    )}
                    {emailValidation.valid && (
                      <CheckCircle2 className="absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 text-green-500" />
                    )}
                  </div>
                  {emailValidation.error && (
                    <p className="text-xs text-red-500 mt-1">{emailValidation.error}</p>
                  )}
                  {emailValidation.valid && (
                    <p className="text-xs text-green-600 mt-1">✓ Email is available</p>
                  )}
                </div>

                {/* Password */}
                <div>
                  <Label htmlFor="password" className="text-sm font-medium text-slate-700 mb-1.5 block">
                    Password *
                  </Label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
                    <Input
                      id="password"
                      type="password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="Enter your password"
                      required
                      className="pl-10 h-12 bg-slate-50 border-slate-200 rounded-lg text-slate-900 placeholder:text-slate-400"
                    />
                  </div>
                </div>

                {/* Confirm Password (Register Only) */}
                {authMode === 'register' && (
                  <div>
                    <Label htmlFor="confirmPassword" className="text-sm font-medium text-slate-700 mb-1.5 block">
                      Confirm Password *
                    </Label>
                    <div className="relative">
                      <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
                      <Input
                        id="confirmPassword"
                        type="password"
                        value={confirmPassword}
                        onChange={(e) => setConfirmPassword(e.target.value)}
                        placeholder="Re-enter your password"
                        required
                        className="pl-10 h-12 bg-slate-50 border-slate-200 rounded-lg text-slate-900 placeholder:text-slate-400"
                      />
                    </div>
                  </div>
                )}

                {/* Remember Me & Forgot Password (Login Only) */}
                {authMode === 'login' && (
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Checkbox
                        id="remember"
                        checked={rememberMe}
                        onCheckedChange={(checked) => setRememberMe(checked as boolean)}
                      />
                      <Label 
                        htmlFor="remember" 
                        className="text-sm text-slate-700 cursor-pointer font-normal"
                      >
                        Remember me
                      </Label>
                    </div>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        console.log('🔥🔥🔥 FORGOT PASSWORD CLICKED - CLOSING MODAL AND NAVIGATING');
                        onBack(); // CLOSE THE MODAL FIRST
                        setTimeout(() => {
                          navigate('/store/reset-password');
                        }, 100); // Small delay to let modal close animation complete
                      }}
                      style={{ fontSize: '0.75rem', color: '#334155' }}
                      className="hover:text-slate-900 transition-colors cursor-pointer"
                    >
                      Forgot password?
                    </button>
                  </div>
                )}

                {/* Error Message */}
                {error && (
                  <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700">
                    {error}
                  </div>
                )}

                {/* Submit Button - Orange */}
                <Button
                  type="submit"
                  disabled={
                    loading || 
                    (authMode === 'register' && (
                      emailValidation.checking || 
                      phoneValidation.checking ||
                      !emailValidation.valid ||
                      (phone && !phoneValidation.valid)
                    ))
                  }
                  className="w-full h-12 bg-orange-600 hover:bg-orange-700 text-white font-semibold rounded-lg transition-colors shadow-md disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {loading 
                    ? (authMode === 'login' ? 'Signing in...' : 'Creating account...') 
                    : emailValidation.checking || phoneValidation.checking
                    ? 'Validating...'
                    : (authMode === 'login' ? 'Sign In' : 'Sign Up')}
                </Button>
              </form>

              {/* Switch Mode */}
              <div className="mt-6 text-center text-sm text-slate-600">
                {authMode === 'login' ? (
                  <>
                    Don't have an account?{' '}
                    <button
                      type="button"
                      onClick={() => {
                        setAuthMode('register');
                        setError('');
                      }}
                      className="text-orange-600 hover:text-orange-700 font-semibold transition-colors"
                    >
                      Sign Up
                    </button>
                  </>
                ) : (
                  <>
                    Already have an account?{' '}
                    <button
                      type="button"
                      onClick={() => {
                        setAuthMode('login');
                        setError('');
                      }}
                      className="text-orange-600 hover:text-orange-700 font-semibold transition-colors"
                    >
                      Sign In
                    </button>
                  </>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}