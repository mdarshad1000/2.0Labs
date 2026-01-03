import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { api } from '../services/api';
import { 
  AlertCircle, 
  ArrowLeft, 
  Loader2, 
  Mail,
  Database
} from 'lucide-react';

interface LoginPageProps {
  onLoginSuccess?: () => void;
  returnTo?: string;
}

export default function LoginPage({ onLoginSuccess, returnTo = '/' }: LoginPageProps) {
  const { user, loading: authLoading, error: authError, login } = useAuth();
  const [error, setError] = useState<string | null>(null);
  
  // Email flow state
  const [email, setEmail] = useState('');
  const [showOtp, setShowOtp] = useState(false);
  const [emailError, setEmailError] = useState<string | null>(null);
  const [isEmailLoading, setIsEmailLoading] = useState(false);
  const [showNameInput, setShowNameInput] = useState(false);
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [lastUsedProvider, setLastUsedProvider] = useState<string | null>(null);
  
  // OTP input state
  const [otp, setOtp] = useState(['', '', '', '', '', '']);
  const otpRefs = useRef<(HTMLInputElement | null)[]>([]);

  useEffect(() => {
    const storedProvider = localStorage.getItem('signin-provider');
    if (storedProvider) {
      setLastUsedProvider(storedProvider);
    }
  }, []);

  // If user is already logged in, trigger success callback
  useEffect(() => {
    if (user && !authLoading) {
      onLoginSuccess?.();
    }
  }, [user, authLoading, onLoginSuccess]);

  const handleGoogleLogin = async () => {
    setError(null);
    localStorage.setItem('signin-provider', 'google');
    await login();
  };

  const handleBackToStart = () => {
    setShowNameInput(false);
    setShowOtp(false);
    setEmailError(null);
    setOtp(['', '', '', '', '', '']);
  };

  const handleEmailSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    localStorage.setItem('signin-provider', 'email');
    setIsEmailLoading(true);
    setEmailError(null);
    try {
      const data = await api.emailSignIn(email);
      if (data.success) {
        setError(null);
        if (data.newly_created) {
          setShowNameInput(true);
        } else {
          setShowOtp(true);
        }
      } else {
        setEmailError(data.message || 'Failed to send verification code.');
      }
    } catch (error) {
      if (error instanceof Error) {
        setEmailError(error.message);
      } else {
        setEmailError('An unexpected error occurred.');
      }
    } finally {
      setIsEmailLoading(false);
    }
  };

  const handleNameSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!firstName || !lastName) {
      setEmailError("Please enter your full name.");
      return;
    }
    setIsEmailLoading(true);
    setEmailError(null);
    try {
      const name = `${firstName} ${lastName}`;
      const data = await api.emailSetName(email, name);
      if (data.success) {
        setShowNameInput(false);
        setShowOtp(true);
      } else {
        setEmailError(data.message || 'Failed to set name.');
      }
    } catch (error) {
      if (error instanceof Error) {
        setEmailError(error.message);
      } else {
        setEmailError('An unexpected error occurred.');
      }
    } finally {
      setIsEmailLoading(false);
    }
  };

  const handleOtpChange = (index: number, value: string) => {
    if (!/^\d*$/.test(value)) return; // Only allow digits
    
    const newOtp = [...otp];
    newOtp[index] = value.slice(-1); // Only keep last digit
    setOtp(newOtp);
    
    // Auto-focus next input
    if (value && index < 5) {
      otpRefs.current[index + 1]?.focus();
    }
    
    // If all 6 digits entered, auto-submit
    if (newOtp.every(d => d) && newOtp.join('').length === 6) {
      handleVerifyCode(newOtp.join(''));
    }
  };

  const handleOtpKeyDown = (index: number, e: React.KeyboardEvent) => {
    if (e.key === 'Backspace' && !otp[index] && index > 0) {
      otpRefs.current[index - 1]?.focus();
    }
  };

  const handleOtpPaste = (e: React.ClipboardEvent) => {
    e.preventDefault();
    const pastedData = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6);
    if (pastedData.length === 6) {
      const newOtp = pastedData.split('');
      setOtp(newOtp);
      handleVerifyCode(pastedData);
    }
  };

  const handleVerifyCode = async (code: string) => {
    setIsEmailLoading(true);
    setEmailError(null);
    try {
      const data = await api.emailVerify(email, code);

      if (!data.success) {
        setEmailError(data.message || 'Failed to verify code.');
        setOtp(['', '', '', '', '', '']);
        otpRefs.current[0]?.focus();
        setIsEmailLoading(false);
        return;
      }

      if (data.redirectUrl) {
        window.location.href = data.redirectUrl;
        return;
      }

      onLoginSuccess?.();
    } catch (error) {
      if (error instanceof Error) {
        setEmailError(error.message);
      } else {
        setEmailError('An unexpected error occurred.');
      }
      setOtp(['', '', '', '', '', '']);
      otpRefs.current[0]?.focus();
    } finally {
      setIsEmailLoading(false);
    }
  };

  if (authLoading) {
    return (
      <div className="h-screen flex flex-col items-center justify-center bg-[#030a06]">
        <Loader2 className="h-8 w-8 animate-spin text-emerald-500" />
      </div>
    );
  }

  let headerContent = {
    title: "Sign in to 2.0Labs",
    description: "Access your analytical workspaces and documents."
  };

  if (showNameInput) {
    headerContent = {
      title: "What's your name?",
      description: "This will be displayed on your profile."
    };
  } else if (showOtp) {
    headerContent = {
      title: "Check your email",
      description: `Enter the 6-digit code we sent to ${email}. This will expire in 10 minutes.`,
    };
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#030a06] p-4 font-['Epilogue']">
      {/* Background gradient */}
      <div 
        className="absolute inset-0 pointer-events-none"
        style={{
          background: 'radial-gradient(ellipse 80% 50% at 50% 50%, rgba(16, 185, 129, 0.03) 0%, transparent 60%)',
        }}
      />
      
      <div className="w-full max-w-md relative z-10">
        {/* Logo */}
        <div className="flex flex-col items-center mb-8">
          <div className="w-12 h-12 bg-emerald-600 rounded-xl flex items-center justify-center shadow-[0_0_40px_rgba(16,185,129,0.2)] mb-4">
            <Database className="text-black w-6 h-6" />
          </div>
          <h1 className="text-2xl font-extralight tracking-tighter text-white">
            2.0Labs<span className="text-emerald-500 opacity-60 italic">_</span>
          </h1>
        </div>

        {/* Card */}
        <div className="bg-[#020804]/80 backdrop-blur-xl border border-white/[0.06] rounded-xl p-6 shadow-2xl">
          {/* Header */}
          <div className="text-center mb-6 relative">
            {(showNameInput || showOtp) && (
              <button 
                onClick={handleBackToStart}
                className="absolute left-0 top-1 p-1.5 text-slate-400 hover:text-white hover:bg-white/10 rounded-md transition-all"
              >
                <ArrowLeft className="w-4 h-4" />
              </button>
            )}
            <h2 className="text-lg font-light text-white mb-1">{headerContent.title}</h2>
            <p className="text-sm text-slate-400 font-light">{headerContent.description}</p>
          </div>

          {/* Content */}
          <div className="space-y-4">
            {/* Error alerts */}
            {(error || authError) && (
              <div className="flex items-center gap-2 px-3 py-2 bg-rose-500/10 border border-rose-500/20 rounded-lg text-rose-400 text-sm">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{error || authError}</span>
              </div>
            )}

            {!showNameInput && !showOtp && (
              <>
                {/* Google OAuth Button */}
                <button
                  onClick={handleGoogleLogin}
                  className="w-full flex items-center justify-center gap-3 px-4 py-3 bg-white text-gray-800 rounded-lg font-medium text-sm hover:bg-gray-100 transition-all relative"
                >
                  <svg className="w-5 h-5" viewBox="0 0 24 24">
                    <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                    <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                    <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                    <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
                  </svg>
                  Continue with Google
                  {lastUsedProvider === 'google' && (
                    <span className="absolute right-3 px-2 py-0.5 bg-emerald-500/10 text-emerald-400 text-[10px] uppercase tracking-wider rounded-full font-semibold">
                      Last Used
                    </span>
                  )}
                </button>

                {/* Divider */}
                <div className="relative my-6">
                  <div className="absolute inset-0 flex items-center">
                    <span className="w-full border-t border-white/10" />
                  </div>
                  <div className="relative flex justify-center text-xs uppercase">
                    <span className="bg-[#020804] px-3 text-slate-500 font-light tracking-wider">
                      Or
                    </span>
                  </div>
                </div>

                {/* Email Form */}
                <form onSubmit={handleEmailSignIn}>
                  <div className="space-y-3">
                    <div className="relative">
                      <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                      <input
                        type="email"
                        placeholder="name@example.com"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        disabled={isEmailLoading}
                        required
                        className="w-full pl-10 pr-4 py-3 bg-white/[0.03] border border-white/10 rounded-lg text-white placeholder-slate-500 text-sm focus:outline-none focus:border-emerald-500/50 focus:ring-1 focus:ring-emerald-500/20 transition-all disabled:opacity-50"
                      />
                    </div>
                    <button
                      type="submit"
                      disabled={isEmailLoading || !email}
                      className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-emerald-500 text-black rounded-lg font-semibold text-sm hover:bg-emerald-400 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {isEmailLoading ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <>
                          Continue with Email
                          {lastUsedProvider === 'email' && (
                            <span className="px-2 py-0.5 bg-black/20 text-black/70 text-[10px] uppercase tracking-wider rounded-full font-semibold ml-auto">
                              Last Used
                            </span>
                          )}
                        </>
                      )}
                    </button>
                  </div>
                </form>
              </>
            )}

            {/* OTP Input */}
            {showOtp && (
              <div className="space-y-4">
                <div className="flex justify-center gap-2">
                  {otp.map((digit, index) => (
                    <input
                      key={index}
                      ref={(el) => (otpRefs.current[index] = el)}
                      type="text"
                      inputMode="numeric"
                      maxLength={1}
                      value={digit}
                      onChange={(e) => handleOtpChange(index, e.target.value)}
                      onKeyDown={(e) => handleOtpKeyDown(index, e)}
                      onPaste={index === 0 ? handleOtpPaste : undefined}
                      disabled={isEmailLoading}
                      className="w-11 h-14 text-center text-xl font-mono bg-white/[0.03] border border-white/10 rounded-lg text-white focus:outline-none focus:border-emerald-500/50 focus:ring-1 focus:ring-emerald-500/20 transition-all disabled:opacity-50"
                    />
                  ))}
                </div>
                {isEmailLoading && (
                  <div className="flex justify-center">
                    <Loader2 className="w-5 h-5 animate-spin text-emerald-500" />
                  </div>
                )}
              </div>
            )}

            {/* Name Input */}
            {showNameInput && (
              <form onSubmit={handleNameSubmit}>
                <div className="space-y-3">
                  <input
                    type="text"
                    placeholder="First Name"
                    value={firstName}
                    onChange={(e) => setFirstName(e.target.value)}
                    disabled={isEmailLoading}
                    required
                    className="w-full px-4 py-3 bg-white/[0.03] border border-white/10 rounded-lg text-white placeholder-slate-500 text-sm focus:outline-none focus:border-emerald-500/50 focus:ring-1 focus:ring-emerald-500/20 transition-all disabled:opacity-50"
                  />
                  <input
                    type="text"
                    placeholder="Last Name"
                    value={lastName}
                    onChange={(e) => setLastName(e.target.value)}
                    disabled={isEmailLoading}
                    required
                    className="w-full px-4 py-3 bg-white/[0.03] border border-white/10 rounded-lg text-white placeholder-slate-500 text-sm focus:outline-none focus:border-emerald-500/50 focus:ring-1 focus:ring-emerald-500/20 transition-all disabled:opacity-50"
                  />
                  <button
                    type="submit"
                    disabled={isEmailLoading || !firstName || !lastName}
                    className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-emerald-500 text-black rounded-lg font-semibold text-sm hover:bg-emerald-400 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {isEmailLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : "Continue"}
                  </button>
                </div>
              </form>
            )}

            {/* Email error */}
            {emailError && (
              <div className="flex items-center gap-2 px-3 py-2 bg-rose-500/10 border border-rose-500/20 rounded-lg text-rose-400 text-sm">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{emailError}</span>
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="mt-6 text-center text-xs text-slate-500 font-light">
            By signing in, you agree to our{' '}
            <a href="/tos" className="text-emerald-500 hover:underline">Terms of Service</a>
            {' '}and{' '}
            <a href="/privacy" className="text-emerald-500 hover:underline">Privacy Policy</a>
          </div>
        </div>
      </div>
    </div>
  );
}

