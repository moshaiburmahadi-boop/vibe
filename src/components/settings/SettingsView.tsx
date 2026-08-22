import React, { useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { storageService } from '../../services/storageService';
import { isSupabaseConfigured, getSupabaseConfig, setSupabaseConfig } from '../../lib/supabase';

export const SettingsView: React.FC = () => {
  const { currentUser, updateProfile, signOut } = useAuth();

  const [fullName, setFullName] = useState(currentUser?.full_name || '');
  const [about, setAbout] = useState(currentUser?.about || 'Hey there! I am using Vibe.');
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);

  // Supabase Config form
  const [customUrl, setCustomUrl] = useState(getSupabaseConfig().url);
  const [customKey, setCustomKey] = useState(getSupabaseConfig().key);
  const [showConfig, setShowConfig] = useState(false);
  const [configSaved, setConfigSaved] = useState(false);

  const handleAvatarChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files || !e.target.files[0] || !currentUser) return;
    const file = e.target.files[0];
    const uploadRes = await storageService.uploadAvatar(file, currentUser.user_id);
    if (uploadRes.url) {
      await updateProfile({ avatar_url: uploadRes.url });
    }
  };

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentUser) return;
    setIsSaving(true);
    const success = await updateProfile({
      full_name: fullName.trim(),
      about: about.trim(),
    });
    setIsSaving(false);
    if (success) {
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 2000);
    }
  };

  const handleSaveSupabaseConfig = (e: React.FormEvent) => {
    e.preventDefault();
    setSupabaseConfig(customUrl.trim(), customKey.trim());
    setConfigSaved(true);
    setTimeout(() => {
      setConfigSaved(false);
      window.location.reload();
    }, 800);
  };

  return (
    <div className="flex-1 flex flex-col h-full bg-background overflow-hidden relative pb-20 md:pb-0">
      {/* TopAppBar */}
      <header className="bg-surface/80 backdrop-blur-md border-b border-outline-variant flex justify-between items-center w-full px-4 md:px-8 h-16 shrink-0">
        <h1 className="text-2xl md:text-3xl font-bold text-primary tracking-tight">Settings</h1>
      </header>

      <main className="flex-1 overflow-y-auto w-full flex flex-col pt-6 px-4 md:px-8 max-w-2xl mx-auto pb-16">
        {/* Profile Card */}
        <section className="bg-surface rounded-3xl p-6 border border-outline-variant shadow-sm mb-6">
          <h2 className="text-base font-bold text-on-surface mb-4">Edit Profile</h2>

          <div className="flex flex-col sm:flex-row items-center gap-6 mb-6">
            <div className="relative group">
              <img
                src={
                  currentUser?.avatar_url ||
                  `https://api.dicebear.com/7.x/avataaars/svg?seed=${encodeURIComponent(
                    currentUser?.full_name || 'User'
                  )}`
                }
                alt="Profile"
                className="w-24 h-24 rounded-full object-cover border-4 border-surface shadow-md"
              />
              <label className="absolute inset-0 bg-black/40 rounded-full flex flex-col items-center justify-center text-white opacity-0 group-hover:opacity-100 cursor-pointer transition-opacity">
                <span className="material-symbols-outlined text-2xl">photo_camera</span>
                <span className="text-[10px] font-semibold">Change</span>
                <input type="file" accept="image/*" onChange={handleAvatarChange} className="hidden" />
              </label>
            </div>

            <div className="flex-1 w-full text-center sm:text-left">
              <h3 className="font-bold text-lg text-on-surface">{currentUser?.full_name}</h3>
              <p className="text-xs text-on-surface-variant font-mono mb-2">{currentUser?.phone_number}</p>
              <label className="inline-block px-4 py-1.5 rounded-full border border-outline-variant text-xs font-semibold text-primary hover:bg-surface-container cursor-pointer transition-colors">
                Upload New Photo
                <input type="file" accept="image/*" onChange={handleAvatarChange} className="hidden" />
              </label>
            </div>
          </div>

          <form onSubmit={handleSaveProfile} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold uppercase text-on-surface-variant mb-1">
                Full Name
              </label>
              <input
                type="text"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                className="w-full px-4 py-2.5 rounded-2xl border border-outline-variant bg-surface-container-low text-sm outline-none focus:ring-2 focus:ring-primary"
                required
              />
            </div>

            <div>
              <label className="block text-xs font-semibold uppercase text-on-surface-variant mb-1">
                About / Bio
              </label>
              <input
                type="text"
                value={about}
                onChange={(e) => setAbout(e.target.value)}
                className="w-full px-4 py-2.5 rounded-2xl border border-outline-variant bg-surface-container-low text-sm outline-none focus:ring-2 focus:ring-primary"
              />
            </div>

            {saveSuccess && (
              <div className="p-2.5 rounded-xl bg-tertiary-container text-on-tertiary-container text-xs flex items-center gap-2">
                <span className="material-symbols-outlined text-sm">check_circle</span>
                Profile updated successfully!
              </div>
            )}

            <div className="flex justify-end pt-2">
              <button
                type="submit"
                disabled={isSaving}
                className="px-6 py-2.5 rounded-full bg-primary text-on-primary font-semibold text-xs hover:bg-primary-container shadow-sm transition-transform active:scale-95 disabled:opacity-50"
              >
                {isSaving ? 'Saving...' : 'Save Profile'}
              </button>
            </div>
          </form>
        </section>

        {/* Backend & Supabase Configuration */}
        <section className="bg-surface rounded-3xl p-6 border border-outline-variant shadow-sm mb-6">
          <div className="flex justify-between items-center mb-2">
            <div className="flex items-center gap-2">
              <span className="material-symbols-outlined text-primary">database</span>
              <h2 className="text-base font-bold text-on-surface">Supabase Backend</h2>
            </div>
            <button
              onClick={() => setShowConfig(!showConfig)}
              className="text-xs font-semibold text-primary hover:underline"
            >
              {showConfig ? 'Hide' : 'Configure'}
            </button>
          </div>

          <div className="flex items-center gap-2 py-2 text-xs">
            <div
              className={`w-2.5 h-2.5 rounded-full ${
                isSupabaseConfigured() ? 'bg-tertiary-fixed-dim' : 'bg-secondary'
              }`}
            ></div>
            <span className="font-medium text-on-surface">
              {isSupabaseConfigured()
                ? 'Connected to live Supabase project'
                : 'Using local persistence mode'}
            </span>
          </div>

          {showConfig && (
            <form onSubmit={handleSaveSupabaseConfig} className="space-y-3 mt-4 pt-4 border-t border-outline-variant">
              <div>
                <label className="block text-xs font-semibold text-on-surface-variant mb-1">
                  SUPABASE URL
                </label>
                <input
                  type="url"
                  value={customUrl}
                  onChange={(e) => setCustomUrl(e.target.value)}
                  placeholder="https://your-project.supabase.co"
                  className="w-full px-3 py-2 text-xs border border-outline-variant rounded-xl bg-surface-container-low font-mono"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-on-surface-variant mb-1">
                  SUPABASE ANON KEY
                </label>
                <input
                  type="password"
                  value={customKey}
                  onChange={(e) => setCustomKey(e.target.value)}
                  placeholder="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
                  className="w-full px-3 py-2 text-xs border border-outline-variant rounded-xl bg-surface-container-low font-mono"
                  required
                />
              </div>

              {configSaved && (
                <div className="p-2 rounded bg-tertiary-container text-on-tertiary-container text-xs">
                  Settings saved! Reloading client...
                </div>
              )}

              <div className="flex gap-2 pt-2">
                <button
                  type="submit"
                  className="px-4 py-2 rounded-full bg-primary text-on-primary font-semibold text-xs"
                >
                  Save &amp; Reload
                </button>
                <button
                  type="button"
                  onClick={() => {
                    alert('Full SQL migration schema is available at /supabase/schema.sql in this project.');
                  }}
                  className="px-4 py-2 rounded-full border border-outline-variant text-xs font-semibold text-on-surface-variant"
                >
                  Copy SQL Migration
                </button>
              </div>
            </form>
          )}
        </section>

        {/* PWA & App Details */}
        <section className="bg-surface rounded-3xl p-6 border border-outline-variant shadow-sm mb-6 space-y-3">
          <h2 className="text-base font-bold text-on-surface mb-2">Application</h2>

          <div className="flex justify-between items-center py-2 border-b border-outline-variant/40">
            <div>
              <div className="text-xs font-semibold text-on-surface">PWA Installation</div>
              <div className="text-[11px] text-on-surface-variant">Install Vibe directly to your device home screen</div>
            </div>
            <button
              onClick={() => {
                if ((window as any).deferredPrompt) {
                  (window as any).deferredPrompt.prompt();
                } else {
                  alert('To install Vibe, tap Share -> Add to Home Screen in Safari/Chrome.');
                }
              }}
              className="px-3.5 py-1.5 rounded-full bg-surface-container text-primary font-semibold text-xs hover:bg-primary hover:text-white transition-colors"
            >
              Install App
            </button>
          </div>

          <div className="flex justify-between items-center py-2">
            <div>
              <div className="text-xs font-semibold text-on-surface">Version</div>
              <div className="text-[11px] text-on-surface-variant">Vibe PWA v2.0.0 (Production)</div>
            </div>
          </div>
        </section>

        {/* Sign Out */}
        <button
          onClick={() => {
            if (confirm('Are you sure you want to sign out?')) {
              signOut();
            }
          }}
          className="w-full py-3.5 px-4 rounded-full border border-error text-error hover:bg-error-container/20 font-bold text-sm transition-all active:scale-98 shadow-sm flex items-center justify-center gap-2"
        >
          <span className="material-symbols-outlined text-lg">logout</span>
          Sign Out of Vibe
        </button>
      </main>
    </div>
  );
};
