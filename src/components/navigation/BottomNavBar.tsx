import React from 'react';
import { useAuth } from '../../context/AuthContext';
import { ActiveTab } from '../../types';

export const BottomNavBar: React.FC = () => {
  const { activeTab, setActiveTab } = useAuth();

  const navItems: { id: ActiveTab; label: string; icon: string }[] = [
    { id: 'chats', label: 'Chats', icon: 'chat' },
    { id: 'contacts', label: 'Contacts', icon: 'group' },
    { id: 'calls', label: 'Calls', icon: 'call' },
    { id: 'status', label: 'Status', icon: 'motion_photos_on' },
    { id: 'settings', label: 'Settings', icon: 'settings' },
  ];

  return (
    <nav className="fixed bottom-0 left-0 w-full z-40 flex justify-around items-center px-4 py-2 glass-panel border-t border-outline-variant/40 pb-safe md:hidden select-none">
      {navItems.map((item) => {
        const isActive = activeTab === item.id;
        return (
          <button
            key={item.id}
            onClick={() => setActiveTab(item.id)}
            className={`flex flex-col items-center justify-center rounded-xl px-3 py-1 transition-all duration-150 ${
              isActive
                ? 'bg-primary-container text-on-primary-container font-semibold shadow-sm'
                : 'text-on-surface-variant hover:bg-surface-container active:scale-95'
            }`}
          >
            <span
              className={`material-symbols-outlined text-xl mb-0.5 ${isActive ? 'fill' : ''}`}
              style={{ fontVariationSettings: isActive ? "'FILL' 1" : "'FILL' 0" }}
            >
              {item.icon}
            </span>
            <span className="text-[11px] font-medium tracking-tight">{item.label}</span>
          </button>
        );
      })}
    </nav>
  );
};
