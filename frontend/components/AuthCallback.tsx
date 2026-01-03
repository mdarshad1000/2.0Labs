import React, { useEffect, useState } from 'react';
import { Loader2, AlertCircle, CheckCircle, Sparkles, Database } from 'lucide-react';

interface AuthCallbackProps {
  onSuccess?: () => void;
  onError?: (error: string) => void;
}

export default function AuthCallback({ onSuccess, onError }: AuthCallbackProps) {
  const [error, setError] = useState<string | null>(null);
  const [showWelcome, setShowWelcome] = useState(false);
  const [isProcessing, setIsProcessing] = useState(true);

  useEffect(() => {
    // Process the OAuth callback
    const params = new URLSearchParams(window.location.search);
    const success = params.get('success') === 'true';
    const welcome = params.get('welcome') === 'true';
    const errorParam = params.get('error');

    if (errorParam) {
      let errorMessage = 'Authentication failed. Please try again.';
      switch (errorParam) {
        case 'callback_failed':
          errorMessage = 'Login failed. Please try again.';
          break;
        case 'different_provider':
          errorMessage = 'You previously used a different sign in method.';
          break;
        case 'authentication_error':
          errorMessage = 'Authentication error occurred. Please try again.';
          break;
        case 'missing_code':
          errorMessage = 'Authentication code missing. Please try again.';
          break;
      }
      setError(errorMessage);
      setIsProcessing(false);
      onError?.(errorMessage);
      
      // Redirect back to login after showing error
      setTimeout(() => {
        window.location.href = '/login';
      }, 3000);
      return;
    }

    if (welcome) {
      setShowWelcome(true);
      setIsProcessing(false);
      // Trigger confetti-like effect with CSS animation
      return;
    }

    if (success) {
      setIsProcessing(false);
      // Get return URL from localStorage
      const returnTo = localStorage.getItem('returnTo') || '/';
      localStorage.removeItem('returnTo');
      
      // Short delay to show success state
      setTimeout(() => {
        onSuccess?.();
        // If no callback provided, do a full page navigation
        if (!onSuccess) {
          window.location.href = returnTo;
        }
      }, 500);
      return;
    }

    // No success param - redirect to login
    setError('Authentication failed. Please try again.');
    setIsProcessing(false);
    setTimeout(() => {
      window.location.href = '/login';
    }, 2000);
  }, [onSuccess, onError]);

  const handleContinue = () => {
    const returnTo = localStorage.getItem('returnTo') || '/';
    localStorage.removeItem('returnTo');
    onSuccess?.();
    if (!onSuccess) {
      window.location.href = returnTo;
    }
  };

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#030a06] font-['Epilogue']">
        <div className="text-center max-w-md p-6">
          <div className="mx-auto mb-6 w-16 h-16 rounded-full bg-rose-500/10 flex items-center justify-center">
            <AlertCircle className="w-8 h-8 text-rose-500" />
          </div>
          <h2 className="text-xl font-light text-white mb-2">Authentication Failed</h2>
          <p className="text-slate-400 mb-6">{error}</p>
          <p className="text-sm text-slate-500">Redirecting to login page...</p>
        </div>
      </div>
    );
  }

  if (showWelcome) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-[#030a06] font-['Epilogue'] p-4">
        {/* Background gradient */}
        <div 
          className="absolute inset-0 pointer-events-none"
          style={{
            background: 'radial-gradient(ellipse 80% 50% at 50% 50%, rgba(16, 185, 129, 0.05) 0%, transparent 60%)',
          }}
        />
        
        {/* Animated particles */}
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          {[...Array(20)].map((_, i) => (
            <div
              key={i}
              className="absolute w-1 h-1 bg-emerald-500/30 rounded-full animate-float"
              style={{
                left: `${Math.random() * 100}%`,
                top: `${Math.random() * 100}%`,
                animationDelay: `${Math.random() * 3}s`,
                animationDuration: `${3 + Math.random() * 4}s`,
              }}
            />
          ))}
        </div>

        <div className="relative z-10 text-center max-w-lg">
          {/* Logo with glow */}
          <div className="flex justify-center mb-8">
            <div className="relative">
              <div className="absolute inset-0 bg-emerald-500/30 blur-2xl rounded-full scale-150" />
              <div className="relative w-16 h-16 bg-emerald-600 rounded-xl flex items-center justify-center shadow-[0_0_60px_rgba(16,185,129,0.4)]">
                <Database className="text-black w-8 h-8" />
              </div>
            </div>
          </div>

          {/* Welcome message */}
          <div className="flex items-center justify-center gap-2 mb-4">
            <Sparkles className="w-5 h-5 text-emerald-400 animate-pulse" />
            <h1 className="text-3xl font-extralight text-white">
              Welcome to <span className="font-light">2.0Labs</span>
            </h1>
            <Sparkles className="w-5 h-5 text-emerald-400 animate-pulse" />
          </div>

          <p className="text-slate-400 mb-8 text-lg font-light">
            Your account has been created successfully.
          </p>

          <div className="space-y-4 mb-8">
            <div className="flex items-center gap-3 p-4 bg-white/[0.02] border border-white/[0.05] rounded-lg">
              <CheckCircle className="w-5 h-5 text-emerald-500 shrink-0" />
              <span className="text-slate-300 text-sm text-left">Upload documents and extract structured insights</span>
            </div>
            <div className="flex items-center gap-3 p-4 bg-white/[0.02] border border-white/[0.05] rounded-lg">
              <CheckCircle className="w-5 h-5 text-emerald-500 shrink-0" />
              <span className="text-slate-300 text-sm text-left">Build analytical matrices with AI-powered extraction</span>
            </div>
            <div className="flex items-center gap-3 p-4 bg-white/[0.02] border border-white/[0.05] rounded-lg">
              <CheckCircle className="w-5 h-5 text-emerald-500 shrink-0" />
              <span className="text-slate-300 text-sm text-left">Chat with your data and get actionable insights</span>
            </div>
          </div>

          <button
            onClick={handleContinue}
            className="px-8 py-3 bg-emerald-500 text-black rounded-lg font-semibold text-sm hover:bg-emerald-400 transition-all shadow-lg shadow-emerald-500/20"
          >
            Get Started
          </button>
        </div>

        {/* CSS for float animation */}
        <style>{`
          @keyframes float {
            0%, 100% {
              transform: translateY(0) scale(1);
              opacity: 0.3;
            }
            50% {
              transform: translateY(-20px) scale(1.2);
              opacity: 0.6;
            }
          }
          .animate-float {
            animation: float 4s ease-in-out infinite;
          }
        `}</style>
      </div>
    );
  }

  // Loading/processing state
  return (
    <div className="min-h-screen flex items-center justify-center bg-[#030a06] font-['Epilogue']">
      <div className="text-center">
        <div className="flex justify-center mb-6">
          {isProcessing ? (
            <Loader2 className="w-10 h-10 animate-spin text-emerald-500" />
          ) : (
            <div className="w-12 h-12 rounded-full bg-emerald-500/10 flex items-center justify-center">
              <CheckCircle className="w-6 h-6 text-emerald-500" />
            </div>
          )}
        </div>
        <h2 className="text-xl font-light text-white mb-2">
          {isProcessing ? 'Completing sign in...' : 'Sign in successful!'}
        </h2>
        <p className="text-slate-400">
          {isProcessing 
            ? 'Please wait while we finish authenticating your account.'
            : 'Redirecting you to the app...'}
        </p>
      </div>
    </div>
  );
}

