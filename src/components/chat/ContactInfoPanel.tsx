import React, { useState } from 'react';
import { useAuth } from '../../context/AuthContext';

export const ContactInfoPanel: React.FC = () => {
  const { activeConversation, showContactInfo, setShowContactInfo } = useAuth();
  const [isMuted, setIsMuted] = useState(false);

  if (!showContactInfo || !activeConversation) return null;

  const otherMember = activeConversation.other_member;
  const displayName = otherMember?.full_name || activeConversation.name || 'Contact Info';
  const avatar =
    otherMember?.avatar_url ||
    activeConversation.avatar_url ||
    `https://api.dicebear.com/7.x/avataaars/svg?seed=${encodeURIComponent(displayName)}`;
  const about = otherMember?.about || 'Lead Product Designer';
  const phone = otherMember?.phone_number || '';

  return (
    <div className="w-[320px] flex-shrink-0 border-l border-outline-variant bg-surface flex flex-col h-full z-10 overflow-y-auto select-none">
      {/* Panel Top Header */}
      <div className="p-4 flex items-center justify-between border-b border-outline-variant/40">
        <span className="font-bold text-base text-on-surface">Contact Details</span>
        <button
          onClick={() => setShowContactInfo(false)}
          className="w-8 h-8 rounded-full flex items-center justify-center text-on-surface-variant hover:bg-surface-container transition-colors"
        >
          <span className="material-symbols-outlined text-lg">close</span>
        </button>
      </div>

      {/* Profile Overview */}
      <div className="p-6 flex flex-col items-center border-b border-outline-variant">
        <div className="relative w-24 h-24 mb-3">
          <img
            src={avatar}
            alt={displayName}
            className="w-full h-full object-cover rounded-full shadow-lg border-4 border-surface"
          />
          {otherMember?.is_online && (
            <div className="absolute bottom-1 right-1 w-4 h-4 rounded-full border-2 border-surface bg-tertiary-fixed-dim"></div>
          )}
        </div>

        <h2 className="text-xl font-bold text-on-surface text-center mb-0.5">{displayName}</h2>
        <p className="text-xs text-on-surface-variant text-center mb-1">{about}</p>
        {phone && <p className="text-xs font-mono text-outline text-center mb-4">{phone}</p>}

        {/* Action icons */}
        <div className="flex gap-4 mt-2">
          <div className="flex flex-col items-center cursor-pointer group">
            <div className="w-11 h-11 rounded-full bg-surface-container flex items-center justify-center text-primary group-hover:bg-primary-container group-hover:text-on-primary-container transition-colors mb-1">
              <span className="material-symbols-outlined text-xl">person</span>
            </div>
            <span className="text-[11px] font-semibold text-on-surface-variant">Profile</span>
          </div>

          <div
            onClick={() => setIsMuted(!isMuted)}
            className="flex flex-col items-center cursor-pointer group"
          >
            <div
              className={`w-11 h-11 rounded-full flex items-center justify-center transition-colors mb-1 ${
                isMuted
                  ? 'bg-error-container text-on-error-container'
                  : 'bg-surface-container text-primary group-hover:bg-primary-container group-hover:text-on-primary-container'
              }`}
            >
              <span className="material-symbols-outlined text-xl">
                {isMuted ? 'notifications_off' : 'notifications'}
              </span>
            </div>
            <span className="text-[11px] font-semibold text-on-surface-variant">
              {isMuted ? 'Muted' : 'Mute'}
            </span>
          </div>

          <div className="flex flex-col items-center cursor-pointer group">
            <div className="w-11 h-11 rounded-full bg-surface-container flex items-center justify-center text-primary group-hover:bg-primary-container group-hover:text-on-primary-container transition-colors mb-1">
              <span className="material-symbols-outlined text-xl">search</span>
            </div>
            <span className="text-[11px] font-semibold text-on-surface-variant">Search</span>
          </div>
        </div>
      </div>

      {/* Shared Media Section */}
      <div className="p-4 border-b border-outline-variant">
        <div className="flex justify-between items-center mb-3 cursor-pointer hover:opacity-80 transition-opacity">
          <h3 className="font-semibold text-sm text-on-surface">Shared Media</h3>
          <div className="flex items-center gap-0.5 text-primary text-xs font-semibold">
            View All <span className="material-symbols-outlined text-[16px]">chevron_right</span>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div className="aspect-square rounded-xl overflow-hidden border border-outline-variant/60 shadow-sm cursor-pointer hover:opacity-90 transition-opacity bg-surface-container">
            <img
              src="https://images.unsplash.com/photo-1486406146926-c627a92ad1ab?w=400&auto=format&fit=crop&q=80"
              alt="Office building architecture"
              className="w-full h-full object-cover"
            />
          </div>
          <div className="aspect-square rounded-xl overflow-hidden border border-outline-variant/60 shadow-sm cursor-pointer hover:opacity-90 transition-opacity bg-surface-container">
            <img
              src="https://images.unsplash.com/photo-1497215728101-856f4ea42174?w=400&auto=format&fit=crop&q=80"
              alt="Minimal desk setup"
              className="w-full h-full object-cover"
            />
          </div>
        </div>
      </div>

      {/* Files Section */}
      <div className="p-4">
        <div className="flex justify-between items-center mb-3 cursor-pointer hover:opacity-80 transition-opacity">
          <h3 className="font-semibold text-sm text-on-surface">Files &amp; Documents</h3>
          <span className="material-symbols-outlined text-on-surface-variant text-lg">expand_more</span>
        </div>
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-3 p-2.5 rounded-xl hover:bg-surface-container transition-colors cursor-pointer group border border-outline-variant/40">
            <div className="w-9 h-9 bg-error-container text-on-error-container rounded-lg flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform">
              <span className="material-symbols-outlined text-lg">picture_as_pdf</span>
            </div>
            <div className="flex flex-col min-w-0 flex-1">
              <span className="font-semibold text-xs text-on-surface truncate">
                Brand_Guidelines_v2.pdf
              </span>
              <span className="text-[10px] text-on-surface-variant">2.4 MB • Today</span>
            </div>
          </div>

          <div className="flex items-center gap-3 p-2.5 rounded-xl hover:bg-surface-container transition-colors cursor-pointer group border border-outline-variant/40">
            <div className="w-9 h-9 bg-secondary-container text-on-secondary-container rounded-lg flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform">
              <span className="material-symbols-outlined text-lg">description</span>
            </div>
            <div className="flex flex-col min-w-0 flex-1">
              <span className="font-semibold text-xs text-on-surface truncate">
                Q3_Project_Brief.docx
              </span>
              <span className="text-[10px] text-on-surface-variant">1.1 MB • Yesterday</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
