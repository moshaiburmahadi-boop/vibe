import React, { useState, useEffect } from 'react';

export const PwaInstallBanner: React.FC = () => {
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [showBanner, setShowBanner] = useState(false);

  useEffect(() => {
    const handler = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e);
      (window as any).deferredPrompt = e;
      setShowBanner(true);
    };

    window.addEventListener('beforeinstallprompt', handler);

    return () => {
      window.removeEventListener('beforeinstallprompt', handler);
    };
  }, []);

  const handleInstall = async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === 'accepted') {
      setShowBanner(false);
    }
    setDeferredPrompt(null);
  };

  if (!showBanner) return null;

  return (
    <div className="fixed top-3 left-1/2 -translate-x-1/2 z-50 w-[92%] max-w-md bg-surface-container-highest/95 backdrop-blur-md border border-primary/30 p-3 rounded-2xl shadow-xl flex items-center justify-between gap-3 animate-fade-in select-none">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-primary text-white flex items-center justify-center shrink-0 shadow-md">
          <span className="material-symbols-outlined text-2xl fill" style={{ fontVariationSettings: "'FILL' 1" }}>
            forum
          </span>
        </div>
        <div className="min-w-0">
          <div className="font-bold text-xs text-on-surface">Install Vibe App</div>
          <div className="text-[11px] text-on-surface-variant">Instant notifications &amp; offline mode</div>
        </div>
      </div>

      <div className="flex items-center gap-1.5 shrink-0">
        <button
          onClick={handleInstall}
          className="px-3.5 py-1.5 rounded-full bg-primary text-on-primary text-xs font-semibold hover:bg-primary-container shadow-sm transition-transform active:scale-95"
        >
          Install
        </button>
        <button
          onClick={() => setShowBanner(false)}
          className="w-7 h-7 rounded-full flex items-center justify-center text-outline hover:bg-surface-container"
        >
          <span className="material-symbols-outlined text-sm">close</span>
        </button>
      </div>
    </div>
  );
};
