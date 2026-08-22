import React from 'react';
import { useAuth } from '../../context/AuthContext';

export const VoiceCallModal: React.FC = () => {
  const { activeCall, endCall, toggleMute, toggleSpeaker } = useAuth();

  if (!activeCall || activeCall.type !== 'voice') return null;

  const contact = activeCall.contact;
  const name = contact.full_name || 'Contact';
  const avatar =
    contact.avatar_url ||
    `https://api.dicebear.com/7.x/avataaars/svg?seed=${encodeURIComponent(name)}`;

  const minutes = Math.floor(activeCall.duration / 60)
    .toString()
    .padStart(2, '0');
  const seconds = (activeCall.duration % 60).toString().padStart(2, '0');
  const timeStr = `${minutes}:${seconds}`;

  return (
    <div className="fixed inset-0 z-50 flex flex-col justify-between items-center bg-ambient-pulse text-white p-6 font-inter select-none animate-fade-in">
      {/* Top Header: Encryption & Info */}
      <header className="w-full flex justify-between items-center max-w-md pt-8">
        <button
          onClick={endCall}
          className="w-10 h-10 rounded-full flex items-center justify-center bg-white/10 hover:bg-white/20 transition-colors backdrop-blur-md"
        >
          <span className="material-symbols-outlined text-white text-xl">keyboard_arrow_down</span>
        </button>

        <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white/10 backdrop-blur-md border border-white/15 text-xs font-medium tracking-wide">
          <span className="material-symbols-outlined text-[14px] text-tertiary-fixed-dim">lock</span>
          <span>End-to-End Encrypted</span>
        </div>

        <button className="w-10 h-10 rounded-full flex items-center justify-center bg-white/10 hover:bg-white/20 transition-colors backdrop-blur-md">
          <span className="material-symbols-outlined text-white text-xl">person_add</span>
        </button>
      </header>

      {/* Center Avatar & Pulsing Rings */}
      <main className="flex flex-col items-center justify-center my-auto">
        <div className="relative flex items-center justify-center">
          {/* Outer Ripple 1 */}
          <div className="absolute w-56 h-56 rounded-full border border-primary-container/20 animate-ping opacity-30"></div>
          {/* Ripple 2 */}
          <div className="absolute w-44 h-44 rounded-full border border-primary-container/30"></div>

          {/* Avatar Container */}
          <div className="relative w-32 h-32 md:w-36 md:h-36 rounded-full p-1 bg-gradient-to-tr from-primary to-primary-container shadow-2xl z-10">
            <img
              src={avatar}
              alt={name}
              className="w-full h-full object-cover rounded-full border-2 border-white/20"
            />
          </div>
        </div>

        {/* Contact Name & Timer */}
        <h1 className="text-2xl md:text-3xl font-bold tracking-tight mt-6 text-center">{name}</h1>
        <p className="text-3xl md:text-4xl font-light tracking-wider text-white/90 font-mono my-2">
          {timeStr}
        </p>
        <div className="flex items-center gap-2 text-xs font-medium text-tertiary-fixed-dim bg-white/10 px-3 py-1 rounded-full backdrop-blur-sm">
          <span className="w-2 h-2 rounded-full bg-tertiary-fixed-dim animate-pulse"></span>
          <span>{activeCall.status === 'connected' ? 'Connected' : 'Connecting...'}</span>
        </div>
      </main>

      {/* Bottom Floating Control Bar */}
      <footer className="w-full max-w-sm mb-6">
        <div className="bg-surface/20 backdrop-blur-2xl border border-white/20 rounded-3xl p-4 flex justify-around items-center shadow-2xl">
          {/* Mute Button */}
          <button
            onClick={toggleMute}
            className={`w-14 h-14 rounded-full flex items-center justify-center transition-all ${
              activeCall.isMuted
                ? 'bg-error text-white'
                : 'bg-white/15 text-white hover:bg-white/25 active:scale-95'
            }`}
          >
            <span className="material-symbols-outlined text-2xl">
              {activeCall.isMuted ? 'mic_off' : 'mic'}
            </span>
          </button>

          {/* Keypad Button */}
          <button className="w-14 h-14 rounded-full bg-white/15 text-white flex items-center justify-center hover:bg-white/25 active:scale-95 transition-all">
            <span className="material-symbols-outlined text-2xl">dialpad</span>
          </button>

          {/* Speaker Button */}
          <button
            onClick={toggleSpeaker}
            className={`w-14 h-14 rounded-full flex items-center justify-center transition-all ${
              activeCall.isSpeakerOn
                ? 'bg-white text-primary'
                : 'bg-white/15 text-white hover:bg-white/25 active:scale-95'
            }`}
          >
            <span className="material-symbols-outlined text-2xl">
              {activeCall.isSpeakerOn ? 'volume_up' : 'volume_down'}
            </span>
          </button>

          {/* Red End Call Button */}
          <button
            onClick={endCall}
            className="w-14 h-14 rounded-full bg-error text-white flex items-center justify-center hover:bg-error/90 active:scale-95 transition-all shadow-lg shadow-error/30"
          >
            <span className="material-symbols-outlined text-2xl">call_end</span>
          </button>
        </div>
      </footer>
    </div>
  );
};
