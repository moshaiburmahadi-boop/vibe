import React, { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import { chatService } from '../../services/chatService';
import { Message } from '../../types';

export const ContactInfoPanel: React.FC = () => {
  const {
    currentUser,
    activeConversation,
    setActiveConversation,
    showContactInfo,
    setShowContactInfo,
  } = useAuth();
  const [isMuted, setIsMuted] = useState(false);
  const [conversationMedia, setConversationMedia] = useState<Message[]>([]);
  const [conversationFiles, setConversationFiles] = useState<Message[]>([]);

  useEffect(() => {
    if (activeConversation?.id) {
      chatService.getMessages(activeConversation.id, 100).then((msgs) => {
        setConversationMedia(msgs.filter((m) => m.message_type === 'image' && m.file_url));
        setConversationFiles(msgs.filter((m) => m.message_type === 'file' && m.file_url));
      });
    }
  }, [activeConversation?.id]);

  if (!showContactInfo || !activeConversation) return null;

  const otherMember = activeConversation.other_member;
  const displayName = otherMember?.full_name || activeConversation.name || 'Contact Info';
  const avatar =
    otherMember?.avatar_url ||
    activeConversation.avatar_url ||
    `https://api.dicebear.com/7.x/avataaars/svg?seed=${encodeURIComponent(displayName)}`;
  const about = otherMember?.about || 'Hey there! I am using Vibe.';
  const phone = otherMember?.phone_number || '';

  const handleDeleteChat = async () => {
    if (!currentUser || !activeConversation) return;
    if (
      window.confirm(
        `Delete chat with ${displayName}? (The contact will remain in your Contacts directory)`
      )
    ) {
      await chatService.deleteConversationForUser(activeConversation.id, currentUser.user_id);
      setActiveConversation(null);
      setShowContactInfo(false);
    }
  };

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
        </div>
      </div>

      {/* Shared Media Section */}
      <div className="p-4 border-b border-outline-variant">
        <div className="flex justify-between items-center mb-3">
          <h3 className="font-semibold text-sm text-on-surface">Shared Media ({conversationMedia.length})</h3>
        </div>
        {conversationMedia.length === 0 ? (
          <p className="text-xs text-on-surface-variant py-2">No photos shared in this chat yet.</p>
        ) : (
          <div className="grid grid-cols-2 gap-2 max-h-48 overflow-y-auto">
            {conversationMedia.map((m) => (
              <a
                key={m.id}
                href={m.file_url!}
                target="_blank"
                rel="noreferrer"
                className="aspect-square rounded-xl overflow-hidden border border-outline-variant/60 shadow-sm hover:opacity-90 transition-opacity bg-surface-container block"
              >
                <img
                  src={m.file_url!}
                  alt="Shared media"
                  className="w-full h-full object-cover"
                />
              </a>
            ))}
          </div>
        )}
      </div>

      {/* Files Section */}
      <div className="p-4 border-b border-outline-variant">
        <div className="flex justify-between items-center mb-3">
          <h3 className="font-semibold text-sm text-on-surface">Files &amp; Documents ({conversationFiles.length})</h3>
        </div>
        {conversationFiles.length === 0 ? (
          <p className="text-xs text-on-surface-variant py-2">No documents shared in this chat yet.</p>
        ) : (
          <div className="flex flex-col gap-2 max-h-48 overflow-y-auto">
            {conversationFiles.map((f) => (
              <a
                key={f.id}
                href={f.file_url!}
                target="_blank"
                rel="noreferrer"
                className="flex items-center gap-3 p-2.5 rounded-xl hover:bg-surface-container transition-colors group border border-outline-variant/40"
              >
                <div className="w-9 h-9 bg-secondary-container text-on-secondary-container rounded-lg flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform">
                  <span className="material-symbols-outlined text-lg">description</span>
                </div>
                <div className="flex flex-col min-w-0 flex-1">
                  <span className="font-semibold text-xs text-on-surface truncate">
                    {f.file_name || 'Document'}
                  </span>
                  <span className="text-[10px] text-on-surface-variant">{f.file_size || 'File'}</span>
                </div>
              </a>
            ))}
          </div>
        )}
      </div>

      {/* Danger Zone: Delete Chat */}
      <div className="p-4 mt-auto">
        <button
          onClick={handleDeleteChat}
          className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-2xl bg-error-container/20 text-error hover:bg-error-container/40 transition-colors text-xs font-semibold"
        >
          <span className="material-symbols-outlined text-lg">delete</span>
          <span>Delete Chat</span>
        </button>
      </div>
    </div>
  );
};
