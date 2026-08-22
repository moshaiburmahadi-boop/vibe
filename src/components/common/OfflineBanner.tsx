import React from 'react';
import { useAuth } from '../../context/AuthContext';

export const OfflineBanner: React.FC = () => {
  const { isOnline } = useAuth();

  if (isOnline) return null;

  return (
    <div className="fixed top-0 left-0 w-full z-50 bg-amber-600 text-white px-4 py-1 text-center text-xs font-semibold flex items-center justify-center gap-2 shadow-md">
      <span className="material-symbols-outlined text-sm">wifi_off</span>
      <span>You are currently offline. Messages will sync when connection returns.</span>
    </div>
  );
};
