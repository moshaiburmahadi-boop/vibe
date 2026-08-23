import React, { useState } from 'react';
import { useAuth } from '../../context/AuthContext';

export const VideoCallModal: React.FC = () => {
  const { currentUser, activeCall, endCall, toggleMute, toggleVideo, flipCamera } = useAuth();
  const [isPipSmall, setIsPipSmall] = useState(false);

  if (!activeCall || activeCall.type !== 'video') return null;

  const contact = activeCall.contact;
  const name = contact.full_name || 'Contact';
  const remoteAvatar =
    contact.avatar_url ||
    `https://api.dicebear.com/7.x/avataaars/svg?seed=${encodeURIComponent(name)}`;
  const myAvatar =
    currentUser?.avatar_url ||
    `https://api.dicebear.com/7.x/avataaars/svg?seed=${encodeURIComponent(currentUser?.full_name || 'Me')}`;

  const minutes = Math.floor(activeCall.duration / 60)
    .toString()
    .padStart(2, '0');
  const seconds = (activeCall.duration % 60).toString().padStart(2, '0');
  const timeStr = `${minutes}:${seconds}`;

  return (
    <div className="fixed inset-0 z-50 flex flex-col justify-between items-center bg-black text-white font-inter select-none overflow-hidden animate-fade-in">
      {/* Background Remote Video Feed Simulation / Avatar Canvas */}
      <div className="absolute inset-0 z-0 flex flex-col items-center justify-center bg-surface-container-lowest">
        <div className="relative flex flex-col items-center justify-center">
          <img
            src={remoteAvatar}
            alt={name}
            className="w-32 h-32 md:w-44 md:h-44 rounded-full object-cover border-4 border-white/20 shadow-2xl animate-pulse"
          />
          <span className="mt-4 text-sm font-semibold text-white/80">{name}</span>
        </div>
        <div className="absolute inset-0 bg-gradient-to-b from-black/60 via-transparent to-black/80 pointer-events-none"></div>
      </div>

      {/* Top Bar */}
      <header className="relative z-10 w-full flex justify-between items-center px-6 pt-8 max-w-4xl">
        <div className="flex items-center gap-3">
          <button
            onClick={endCall}
            className="w-10 h-10 rounded-full flex items-center justify-center bg-black/40 backdrop-blur-md hover:bg-black/60 text-white"
          >
            <span className="material-symbols-outlined">arrow_back</span>
          </button>
          <div>
            <h2 className="text-lg font-bold drop-shadow-md">{name}</h2>
            <div className="flex items-center gap-2 text-xs text-tertiary-fixed-dim">
              <span className="w-2 h-2 rounded-full bg-tertiary-fixed-dim animate-pulse"></span>
              <span className="font-mono">{timeStr}</span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-black/40 backdrop-blur-md border border-white/20 text-xs">
            <span className="material-symbols-outlined text-sm text-tertiary-fixed-dim">lock</span>
            <span className="hidden sm:inline">Encrypted</span>
          </div>
        </div>
      </header>

      {/* Floating Picture-in-Picture Local Video */}
      <div
        onClick={() => setIsPipSmall(!isPipSmall)}
        className={`absolute top-24 right-6 z-20 rounded-2xl overflow-hidden shadow-2xl border-2 border-white/30 cursor-pointer transition-all duration-200 bg-surface-container-high ${
          isPipSmall ? 'w-24 h-32' : 'w-32 h-44 md:w-40 md:h-56'
        }`}
      >
        {activeCall.isVideoOff ? (
          <div className="w-full h-full bg-surface-container-highest flex flex-col items-center justify-center text-outline">
            <span className="material-symbols-outlined text-3xl">videocam_off</span>
            <span className="text-[10px] mt-1">Camera Off</span>
          </div>
        ) : (
          <div className="w-full h-full flex flex-col items-center justify-center bg-surface-container">
            <img
              src={myAvatar}
              alt="My preview"
              className="w-16 h-16 rounded-full object-cover border border-white/20"
            />
          </div>
        )}
        <div className="absolute bottom-1 right-1 px-1.5 py-0.5 rounded bg-black/60 text-[9px] text-white">
          You
        </div>
      </div>

      {/* Bottom Floating Control Bar */}
      <footer className="relative z-10 w-full max-w-md pb-8 px-6">
        <div className="bg-black/50 backdrop-blur-2xl border border-white/20 rounded-3xl p-4 flex justify-around items-center shadow-2xl">
          {/* Flip Camera */}
          <button
            onClick={flipCamera}
            className="w-13 h-13 p-3 rounded-full bg-white/20 hover:bg-white/30 active:scale-95 transition-all text-white"
          >
            <span className="material-symbols-outlined text-2xl">flip_camera_ios</span>
          </button>

          {/* Toggle Video */}
          <button
            onClick={toggleVideo}
            className={`w-13 h-13 p-3 rounded-full transition-all ${
              activeCall.isVideoOff
                ? 'bg-error text-white'
                : 'bg-white/20 hover:bg-white/30 text-white active:scale-95'
            }`}
          >
            <span className="material-symbols-outlined text-2xl">
              {activeCall.isVideoOff ? 'videocam_off' : 'videocam'}
            </span>
          </button>

          {/* Toggle Mic */}
          <button
            onClick={toggleMute}
            className={`w-13 h-13 p-3 rounded-full transition-all ${
              activeCall.isMuted
                ? 'bg-error text-white'
                : 'bg-white/20 hover:bg-white/30 text-white active:scale-95'
            }`}
          >
            <span className="material-symbols-outlined text-2xl">
              {activeCall.isMuted ? 'mic_off' : 'mic'}
            </span>
          </button>

          {/* Red End Call Button */}
          <button
            onClick={endCall}
            className="w-13 h-13 p-3 rounded-full bg-error text-white flex items-center justify-center hover:bg-error/90 active:scale-95 transition-all shadow-lg shadow-error/40"
          >
            <span className="material-symbols-outlined text-2xl">call_end</span>
          </button>
        </div>
      </footer>
    </div>
  );
};
