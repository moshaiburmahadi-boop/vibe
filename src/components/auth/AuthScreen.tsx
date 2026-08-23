import React, { useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { storageService } from '../../services/storageService';

export const AuthScreen: React.FC = () => {
  const { signIn, signUp } = useAuth();
  const [isSignUp, setIsSignUp] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Form fields
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [avatarPreview, setAvatarPreview] = useState<string>('');
  const [showPassword, setShowPassword] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [rememberMe, setRememberMe] = useState(true);

  const handleAvatarChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      setAvatarFile(file);
      setAvatarPreview(URL.createObjectURL(file));
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage('');

    if (!phone.trim()) {
      setErrorMessage('Please enter your phone number.');
      return;
    }

    if (!password) {
      setErrorMessage('Please enter your password.');
      return;
    }

    if (isSignUp) {
      if (!fullName.trim()) {
        setErrorMessage('Please enter your full name.');
        return;
      }
      if (password.length < 6) {
        setErrorMessage('Password must be at least 6 characters.');
        return;
      }
      if (password !== confirmPassword) {
        setErrorMessage('Passwords do not match.');
        return;
      }
    }

    setIsSubmitting(true);
    try {
      if (isSignUp) {
        let avatarUrl = '';
        if (avatarFile) {
          try {
            const uploadRes = await storageService.uploadAvatar(avatarFile, `temp_${Date.now()}`);
            if (uploadRes.url) {
              avatarUrl = uploadRes.url;
            }
          } catch (uploadErr) {
            console.warn('Avatar upload notice:', uploadErr);
          }
        }

        const res = await signUp({
          fullName: fullName.trim(),
          phoneNumber: phone.trim(),
          password,
          avatarUrl,
        });

        if (res.error) {
          setErrorMessage(res.error.message || 'Failed to create account.');
        }
      } else {
        const res = await signIn(phone.trim(), password);
        if (res.error) {
          setErrorMessage(res.error.message || 'Phone number or password is incorrect.');
        }
      }
    } catch (err: any) {
      setErrorMessage(err?.message || 'An unexpected error occurred. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="bg-surface text-on-surface min-h-screen w-full flex flex-col items-center justify-center p-4 md:p-8 font-inter overflow-y-auto">
      <main className="w-full max-w-md my-auto">
        {/* Logo & Subtitle */}
        <div className="text-center mb-6">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-primary text-on-primary mb-4 shadow-lg shadow-primary/20">
            <span className="material-symbols-outlined text-4xl fill" style={{ fontVariationSettings: "'FILL' 1" }}>
              forum
            </span>
          </div>
          <h1 className="text-3xl md:text-5xl font-bold text-primary tracking-tight mb-2">Vibe</h1>
          <p className="text-base text-on-surface-variant">Global Cross-Device Chat &amp; Presence</p>
        </div>

        {/* Card */}
        <div className="bg-surface-container-lowest rounded-2xl shadow-xl border border-outline-variant/40 p-6 md:p-8 backdrop-blur-sm">
          {/* Tabs: Sign In / Create Account */}
          <div className="flex border-b border-outline-variant/40 mb-6">
            <button
              type="button"
              onClick={() => {
                setIsSignUp(false);
                setErrorMessage('');
              }}
              className={`flex-1 pb-3 text-center font-semibold text-sm transition-colors border-b-2 ${
                !isSignUp
                  ? 'border-primary text-primary font-bold'
                  : 'border-transparent text-on-surface-variant hover:text-on-surface'
              }`}
            >
              Sign In
            </button>
            <button
              type="button"
              onClick={() => {
                setIsSignUp(true);
                setErrorMessage('');
              }}
              className={`flex-1 pb-3 text-center font-semibold text-sm transition-colors border-b-2 ${
                isSignUp
                  ? 'border-primary text-primary font-bold'
                  : 'border-transparent text-on-surface-variant hover:text-on-surface'
              }`}
            >
              Create Account
            </button>
          </div>

          {errorMessage && (
            <div className="mb-5 p-3 rounded-xl bg-error-container text-on-error-container text-sm flex items-center gap-2">
              <span className="material-symbols-outlined text-lg shrink-0">error</span>
              <span>{errorMessage}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Sign Up: Full Name */}
            {isSignUp && (
              <>
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-on-surface-variant mb-1.5">
                    Full Name
                  </label>
                  <div className="relative">
                    <span className="absolute inset-y-0 left-0 pl-3.5 flex items-center text-outline pointer-events-none">
                      <span className="material-symbols-outlined text-xl">person</span>
                    </span>
                    <input
                      type="text"
                      value={fullName}
                      onChange={(e) => setFullName(e.target.value)}
                      placeholder="e.g. Mahadi Hasan"
                      required
                      className="block w-full pl-11 pr-4 py-3 border border-outline-variant rounded-full text-base bg-surface text-on-surface focus:ring-2 focus:ring-primary focus:border-primary transition-all outline-none"
                    />
                  </div>
                </div>

                {/* Avatar Upload */}
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-on-surface-variant mb-1.5">
                    Profile Photo (Optional)
                  </label>
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 rounded-full bg-surface-container-high border border-outline-variant overflow-hidden shrink-0 flex items-center justify-center">
                      {avatarPreview ? (
                        <img src={avatarPreview} alt="Preview" className="w-full h-full object-cover" />
                      ) : (
                        <span className="material-symbols-outlined text-outline">photo_camera</span>
                      )}
                    </div>
                    <label className="cursor-pointer px-4 py-2 rounded-full border border-outline-variant text-xs font-semibold text-primary hover:bg-surface-container transition-colors">
                      Choose Photo
                      <input type="file" accept="image/*" onChange={handleAvatarChange} className="hidden" />
                    </label>
                  </div>
                </div>
              </>
            )}

            {/* Phone Number */}
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-on-surface-variant mb-1.5">
                Phone Number
              </label>
              <div className="relative">
                <span className="absolute inset-y-0 left-0 pl-3.5 flex items-center text-outline pointer-events-none">
                  <span className="material-symbols-outlined text-xl">phone_iphone</span>
                </span>
                <input
                  type="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="017XXXXXXXX or +88017XXXXXXXX"
                  required
                  className="block w-full pl-11 pr-4 py-3 border border-outline-variant rounded-full text-base bg-surface text-on-surface focus:ring-2 focus:ring-primary focus:border-primary transition-all outline-none"
                />
              </div>
              <p className="mt-1 text-[11px] text-on-surface-variant/80 pl-2">
                All formats (e.g. 017... or +88017...) normalize automatically.
              </p>
            </div>

            {/* Password */}
            <div>
              <div className="flex justify-between items-center mb-1.5">
                <label className="block text-xs font-semibold uppercase tracking-wider text-on-surface-variant">
                  Password
                </label>
              </div>
              <div className="relative">
                <span className="absolute inset-y-0 left-0 pl-3.5 flex items-center text-outline pointer-events-none">
                  <span className="material-symbols-outlined text-xl">lock</span>
                </span>
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  required
                  className="block w-full pl-11 pr-11 py-3 border border-outline-variant rounded-full text-base bg-surface text-on-surface focus:ring-2 focus:ring-primary focus:border-primary transition-all outline-none"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute inset-y-0 right-0 pr-3.5 flex items-center text-outline hover:text-on-surface-variant focus:outline-none"
                >
                  <span className="material-symbols-outlined text-xl">
                    {showPassword ? 'visibility_off' : 'visibility'}
                  </span>
                </button>
              </div>
            </div>

            {/* Confirm Password on Sign Up */}
            {isSignUp && (
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-on-surface-variant mb-1.5">
                  Confirm Password
                </label>
                <div className="relative">
                  <span className="absolute inset-y-0 left-0 pl-3.5 flex items-center text-outline pointer-events-none">
                    <span className="material-symbols-outlined text-xl">lock_clock</span>
                  </span>
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="••••••••"
                    required
                    className="block w-full pl-11 pr-4 py-3 border border-outline-variant rounded-full text-base bg-surface text-on-surface focus:ring-2 focus:ring-primary focus:border-primary transition-all outline-none"
                  />
                </div>
              </div>
            )}

            {/* Remember Me */}
            <div className="flex items-center pt-1">
              <input
                id="remember-me"
                type="checkbox"
                checked={rememberMe}
                onChange={(e) => setRememberMe(e.target.checked)}
                className="h-4 w-4 text-primary focus:ring-primary border-outline rounded cursor-pointer accent-primary"
              />
              <label htmlFor="remember-me" className="ml-2 block text-xs text-on-surface-variant cursor-pointer select-none">
                Remember this device (Persistent Session)
              </label>
            </div>

            {/* Submit button */}
            <div className="pt-2">
              <button
                type="submit"
                disabled={isSubmitting}
                className="w-full flex justify-center items-center py-3.5 px-4 border border-transparent rounded-full shadow-md font-semibold text-base text-on-primary bg-primary hover:bg-primary-container focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary transition-all active:scale-[0.98] duration-150 disabled:opacity-50"
              >
                {isSubmitting ? (
                  <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                ) : isSignUp ? (
                  'Create Account'
                ) : (
                  'Sign In'
                )}
              </button>
            </div>
          </form>

          <div className="mt-6 pt-4 border-t border-outline-variant/30 text-center">
            <p className="text-xs text-on-surface-variant">
              {isSignUp ? 'Already have an account?' : "Don't have an account?"}{' '}
              <button
                type="button"
                onClick={() => {
                  setIsSignUp(!isSignUp);
                  setErrorMessage('');
                }}
                className="font-semibold text-primary hover:text-primary-container transition-colors ml-1"
              >
                {isSignUp ? 'Sign In' : 'Create Account'}
              </button>
            </p>
          </div>
        </div>
      </main>
    </div>
  );
};
