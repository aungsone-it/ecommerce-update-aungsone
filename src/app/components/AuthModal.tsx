import { useState, useEffect } from "react";
import { useNavigate } from "react-router";
import { X, Upload, User, Phone, Mail, Lock, Loader2, Eye, EyeOff } from "lucide-react";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card";
import { Checkbox } from "./ui/checkbox";
import { useLanguage } from "../contexts/LanguageContext";
import { compressImage } from "../../utils/imageCompression";

interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  mode: 'login' | 'register';
  onModeChange: (mode: 'login' | 'register') => void;
  formData: {
    email: string;
    password: string;
    name: string;
    phone: string;
  };
  onFormChange: (field: string, value: string) => void;
  onLogin: () => Promise<void>;
  onRegister: (profileImage?: string) => Promise<void>;
  isLoading: boolean;
}

export function AuthModal({
  isOpen,
  onClose,
  mode,
  onModeChange,
  formData,
  onFormChange,
  onLogin,
  onRegister,
  isLoading
}: AuthModalProps) {
  // 🔥 MUST call all hooks BEFORE any conditional returns (React Rules of Hooks)
  const navigate = useNavigate();
  const { t } = useLanguage();
  const [profileImage, setProfileImage] = useState<string | null>(null);
  const [keepSignedIn, setKeepSignedIn] = useState(false);
  const [agreeToTerms, setAgreeToTerms] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  // Lock scroll when modal is open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = 'unset';
    }

    // Cleanup on unmount
    return () => {
      document.body.style.overflow = 'unset';
    };
  }, [isOpen]);

  if (!isOpen) return null;

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      try {
        const compressedDataUrl = await compressImage(file, 500);
        setProfileImage(compressedDataUrl);
      } catch (error) {
        console.error('Image compression error:', error);
      }
    }
  };

  const removeImage = () => {
    setProfileImage(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (mode === 'login') {
      await onLogin();
    } else {
      await onRegister(profileImage);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <Card className="w-full max-w-md shadow-2xl border-0 relative rounded-3xl">
        <button
          onClick={onClose}
          className="absolute right-4 top-4 p-2 hover:bg-slate-100 rounded-full transition-colors z-10"
        >
          <X className="w-5 h-5 text-slate-600" />
        </button>

        <CardHeader className="pt-8 text-center">
          <CardTitle className="text-xl sm:text-2xl font-extrabold text-slate-900 mb-1">
            {mode === 'login' ? 'WELCOME' : 'CREATE ACCOUNT'}
          </CardTitle>
          <p className="text-xs sm:text-sm text-slate-500">
            {mode === 'login' 
              ? 'Sign in to access your account' 
              : 'Join SECURE for exclusive benefits'}
          </p>
        </CardHeader>

        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-5">
            {mode === 'register' && (
              <>
                {/* Profile Image Upload - Left Aligned Above Full Name */}
                <div className="flex justify-start mb-4">
                  <div className="relative">
                    {profileImage ? (
                      <div className="relative w-[100px] h-[100px]">
                        <img
                          src={profileImage}
                          alt="Profile"
                          className="w-full h-full object-cover rounded-lg border-2 border-slate-200"
                        />
                        <button
                          type="button"
                          onClick={removeImage}
                          className="absolute -top-2 -right-2 bg-red-500 hover:bg-red-600 text-white rounded-full p-1.5 transition-colors shadow-lg"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ) : (
                      <label
                        htmlFor="profileImage"
                        onDragOver={(e) => {
                          e.preventDefault();
                          e.currentTarget.classList.add('border-amber-500', 'bg-amber-50');
                        }}
                        onDragLeave={(e) => {
                          e.currentTarget.classList.remove('border-amber-500', 'bg-amber-50');
                        }}
                        onDrop={(e) => {
                          e.preventDefault();
                          e.currentTarget.classList.remove('border-amber-500', 'bg-amber-50');
                          const file = e.dataTransfer.files[0];
                          if (file && file.type.startsWith('image/')) {
                            const input = document.getElementById('profileImage') as HTMLInputElement;
                            const dataTransfer = new DataTransfer();
                            dataTransfer.items.add(file);
                            input.files = dataTransfer.files;
                            handleImageUpload({ target: input } as any);
                          }
                        }}
                        className="flex flex-col items-center justify-center w-[100px] h-[100px] border-2 border-dashed border-slate-300 rounded-lg cursor-pointer bg-slate-50 hover:bg-slate-100 transition-colors"
                      >
                        <Upload className="w-6 h-6 sm:w-7 sm:h-7 text-slate-400 mb-1 sm:mb-1.5" />
                        <span className="text-[10px] sm:text-[11px] text-slate-500 text-center leading-tight px-1.5 sm:px-2 font-medium">
                          Drag & Drop<br />or Click
                        </span>
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

                {/* Full Name Field */}
                <div className="space-y-2">
                  <Label htmlFor="name" className="text-slate-700 font-medium text-xs sm:text-sm">
                    Full Name *
                  </Label>
                  <div className="relative">
                    <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 sm:w-5 sm:h-5 text-slate-400" />
                    <Input
                      id="name"
                      type="text"
                      placeholder="Enter your full name"
                      className="pl-10 h-10 sm:h-11 text-sm"
                      value={formData.name}
                      onChange={(e) => onFormChange('name', e.target.value)}
                      required={mode === 'register'}
                    />
                  </div>
                </div>

                {/* Phone Number Field */}
                <div className="space-y-2">
                  <Label htmlFor="phone" className="text-slate-700 font-medium text-xs sm:text-sm">
                    Phone Number
                  </Label>
                  <div className="relative">
                    <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 sm:w-5 sm:h-5 text-slate-400" />
                    <Input
                      id="phone"
                      type="number"
                      placeholder="+95 9 XXX XXX XXX"
                      className="pl-10 h-10 sm:h-11 text-sm"
                      value={formData.phone}
                      onChange={(e) => onFormChange('phone', e.target.value)}
                    />
                  </div>
                </div>
              </>
            )}

            <div className="space-y-2">
              <Label htmlFor="email" className="text-slate-700 font-medium text-xs sm:text-sm">
                Email Address *
              </Label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 sm:w-5 sm:h-5 text-slate-400" />
                <Input
                  id="email"
                  type="email"
                  placeholder="your@email.com"
                  className="pl-10 h-10 sm:h-11 text-sm"
                  value={formData.email}
                  onChange={(e) => onFormChange('email', e.target.value)}
                  required
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="password" className="text-slate-700 font-medium text-xs sm:text-sm">
                Password *
              </Label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 sm:w-5 sm:h-5 text-slate-400" />
                <Input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  placeholder="Enter your password"
                  className="pl-10 h-10 sm:h-11 text-sm"
                  value={formData.password}
                  onChange={(e) => onFormChange('password', e.target.value)}
                  required
                />
                <button
                  type="button"
                  className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 sm:w-5 sm:h-5 text-slate-400 cursor-pointer"
                  onClick={() => setShowPassword(!showPassword)}
                >
                  {showPassword ? <EyeOff className="w-4 h-4 sm:w-5 sm:h-5" /> : <Eye className="w-4 h-4 sm:w-5 sm:h-5" />}
                </button>
              </div>
            </div>

            {mode === 'login' && (
              <div className="flex items-center justify-between">
                <label className="flex items-center gap-2 cursor-pointer group">
                  <Checkbox
                    checked={keepSignedIn}
                    onCheckedChange={(checked) => setKeepSignedIn(checked as boolean)}
                  />
                  <span className="text-xs text-slate-600 select-none">Remember me</span>
                </label>
                <button 
                  type="button" 
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    console.log('🔥🔥🔥 FORGOT PASSWORD CLICKED IN AUTHMODAL');
                    onClose(); // Close modal first
                    setTimeout(() => {
                      console.log('🔥🔥🔥 NAVIGATING TO RESET PASSWORD');
                      navigate('/store/reset-password');
                    }, 100);
                  }}
                  className="text-xs text-slate-600 hover:text-slate-900 transition-colors cursor-pointer"
                >
                  Forgot Password?
                </button>
              </div>
            )}

            <Button
              type="submit"
              className="w-full h-11 sm:h-12 bg-[#1a1d29] hover:bg-slate-900 text-white text-sm sm:text-base font-semibold rounded-full shadow-lg transition-colors"
              disabled={isLoading}
            >
              {isLoading ? (
                <>
                  <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                  {mode === 'login' ? 'Signing In...' : 'Creating Account...'}
                </>
              ) : (
                mode === 'login' ? 'Sign In' : 'Create Account'
              )}
            </Button>
          </form>

          <div className="mt-6 text-center">
            <p className="text-xs sm:text-sm text-slate-600">
              {mode === 'login' ? "Don't have an account?" : "Already have an account?"}
              {' '}
              <button
                type="button"
                onClick={() => onModeChange(mode === 'login' ? 'register' : 'login')}
                className="text-xs sm:text-sm text-slate-900 hover:text-amber-600 font-bold transition-colors"
              >
                {mode === 'login' ? 'Sign Up' : 'Sign In'}
              </button>
            </p>
          </div>

          {mode === 'register' && (
            <p className="text-[10px] sm:text-xs text-slate-600 text-center mt-4 leading-relaxed">
              By creating an account, you agree to our{' '}
              <button className="text-[10px] sm:text-xs text-slate-900 hover:text-amber-600 font-bold transition-colors">Terms of Service</button>
              {' '}and{' '}
              <button className="text-[10px] sm:text-xs text-slate-900 hover:text-amber-600 font-bold transition-colors">Privacy Policy</button>
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}