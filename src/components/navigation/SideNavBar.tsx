import React from 'react';
import { useAuth } from '../../context/AuthContext';
import { ActiveTab } from '../../types';

export const SideNavBar: React.FC = () => {
  const { activeTab, setActiveTab, currentUser } = useAuth();

  const navItems: { id: ActiveTab; label: string; icon: string }[] = [
    { id: 'chats', label: 'Chats', icon: 'chat' },
    { id: 'contacts', label: 'Contacts', icon: 'group' },
    { id: 'calls', label: 'Calls', icon: 'call' },
    { id: 'status', label: 'Status', icon: 'motion_photos_on' },
    { id: 'settings', label: 'Settings', icon: 'settings' },
  ];

  return (
    <nav className="w-72 h-screen fixed left-0 top-0 bg-surface border-r border-outline-variant flex flex-col py-6 z-20 select-none">
      {/* Brand Header */}
      <div className="px-6 mb-8 flex flex-col">
        <h1 className="text-3xl font-bold text-primary tracking-tight">Vibe</h1>
        <p className="text-xs text-on-surface-variant font-medium">Premium Messaging</p>
      </div>

      {/* Navigation Tabs */}
      <ul className="flex-1 flex flex-col gap-1">
        {navItems.map((item) => {
          const isActive = activeTab === item.id;
          return (
            <li
              key={item.id}
              onClick={() => setActiveTab(item.id)}
              className={`flex items-center gap-4 px-6 py-3 cursor-pointer duration-150 transition-all ${
                isActive
                  ? 'text-primary border-l-4 border-primary bg-primary-container/10 font-bold'
                  : 'text-on-surface-variant hover:bg-surface-container-high transition-colors border-l-4 border-transparent'
              }`}
            >
              <span
                className={`material-symbols-outlined text-2xl ${isActive ? 'fill' : ''}`}
                style={{ fontVariationSettings: isActive ? "'FILL' 1" : "'FILL' 0" }}
              >
                {item.icon}
              </span>
              <span className="text-base font-semibold">{item.label}</span>
            </li>
          );
        })}
      </ul>

      {/* Bottom User Profile Area */}
      <div
        onClick={() => setActiveTab('settings')}
        className="px-4 mt-auto pt-4 border-t border-outline-variant flex items-center gap-3 cursor-pointer hover:bg-surface-container-high transition-colors py-2 rounded-xl mx-3"
      >
        <div className="relative w-10 h-10 shrink-0">
          <img
            src={
              currentUser?.avatar_url ||
              `https://api.dicebear.com/7.x/avataaars/svg?seed=${encodeURIComponent(
                currentUser?.full_name || 'User'
              )}`
            }
            alt={currentUser?.full_name || 'My Profile'}
            className="w-full h-full object-cover rounded-full shadow-sm border border-outline-variant/60"
          />
          <div className="absolute bottom-0 right-0 w-3 h-3 rounded-full border-2 border-surface bg-tertiary-fixed-dim"></div>
        </div>
        <div className="flex flex-col overflow-hidden min-w-0">
          <span className="text-sm font-semibold text-on-surface truncate">
            {currentUser?.full_name || 'My Profile'}
          </span>
          <span className="text-xs text-on-surface-variant truncate">
            {currentUser?.phone_number || 'Online'}
          </span>
        </div>
      </div>
    </nav>
  );
};
