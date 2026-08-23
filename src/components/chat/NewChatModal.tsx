import React, { useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { contactService } from '../../services/contactService';
import { chatService } from '../../services/chatService';
import { UserProfile } from '../../types';

interface NewChatModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const NewChatModal: React.FC<NewChatModalProps> = ({ isOpen, onClose }) => {
  const { currentUser, setActiveConversation, setActiveTab } = useAuth();
  const [phoneNumber, setPhoneNumber] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [foundUser, setFoundUser] = useState<UserProfile | null>(null);
  const [relationship, setRelationship] = useState<string>('none');
  const [isStartingChat, setIsStartingChat] = useState(false);

  if (!isOpen) return null;

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!phoneNumber.trim() || !currentUser) return;

    setIsSearching(true);
    setErrorMsg('');
    setFoundUser(null);

    try {
      const res = await contactService.searchUserByPhone(phoneNumber.trim(), currentUser.user_id);
      if (res.profile) {
        setFoundUser(res.profile);
        setRelationship(res.relationship);
      } else {
        setErrorMsg('No user registered with this phone number. Make sure they have created an account.');
      }
    } catch (err: any) {
      setErrorMsg(err.message || 'Error searching user.');
    } finally {
      setIsSearching(false);
    }
  };

  const handleStartChat = async () => {
    if (!foundUser || !currentUser) return;
    setIsStartingChat(true);
    try {
      const { conversation, error } = await chatService.getOrCreateDirectConversation(
        currentUser.user_id,
        foundUser.user_id
      );

      if (error) {
        setErrorMsg(error.message || 'Failed to start chat.');
        return;
      }

      if (conversation) {
        setActiveConversation(conversation);
        setActiveTab('chats');
        onClose();
      }
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to start conversation.');
    } finally {
      setIsStartingChat(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in select-none">
      <div className="bg-surface rounded-3xl p-6 max-w-md w-full shadow-2xl border border-outline-variant/60">
        <div className="flex justify-between items-center mb-4">
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-2xl bg-primary/10 text-primary flex items-center justify-center">
              <span className="material-symbols-outlined text-xl">person_search</span>
            </div>
            <div>
              <h3 className="text-lg font-bold text-on-surface">Find User by Phone</h3>
              <p className="text-xs text-on-surface-variant">Private direct messaging</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full flex items-center justify-center text-on-surface-variant hover:bg-surface-container"
          >
            <span className="material-symbols-outlined text-xl">close</span>
          </button>
        </div>

        <p className="text-xs text-on-surface-variant mb-4 leading-relaxed">
          Other user accounts stay private and will never appear in your message list until you search their phone number and send a message.
        </p>

        <form onSubmit={handleSearch} className="space-y-3 mb-4">
          <div className="relative">
            <span className="absolute inset-y-0 left-0 pl-3.5 flex items-center text-on-surface-variant pointer-events-none">
              <span className="material-symbols-outlined text-lg">phone_iphone</span>
            </span>
            <input
              type="tel"
              value={phoneNumber}
              onChange={(e) => setPhoneNumber(e.target.value)}
              placeholder="e.g. 017XXXXXXXX or +88017..."
              className="w-full pl-10 pr-24 py-2.5 bg-surface-container-low border border-outline-variant rounded-full text-sm text-on-surface placeholder:text-outline focus:ring-2 focus:ring-primary focus:border-primary outline-none"
              required
            />
            <button
              type="submit"
              disabled={isSearching || !phoneNumber.trim()}
              className="absolute right-1.5 top-1.5 bottom-1.5 px-4 rounded-full bg-primary text-on-primary font-semibold text-xs hover:bg-primary-container disabled:opacity-50 transition-colors flex items-center gap-1"
            >
              {isSearching ? (
                <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
              ) : (
                'Search'
              )}
            </button>
          </div>
        </form>

        {errorMsg && (
          <div className="p-3 mb-4 rounded-2xl bg-error-container text-on-error-container text-xs flex items-center gap-2">
            <span className="material-symbols-outlined text-base shrink-0">error</span>
            <span>{errorMsg}</span>
          </div>
        )}

        {foundUser && (
          <div className="p-4 rounded-2xl bg-surface-container-low border border-outline-variant/60 flex flex-col gap-3">
            <div className="flex items-center gap-3">
              <div className="relative w-12 h-12 shrink-0">
                <img
                  src={
                    foundUser.avatar_url ||
                    `https://api.dicebear.com/7.x/avataaars/svg?seed=${encodeURIComponent(
                      foundUser.full_name
                    )}`
                  }
                  alt={foundUser.full_name}
                  className="w-full h-full rounded-full object-cover border border-outline-variant"
                />
                {foundUser.is_online && (
                  <span className="absolute bottom-0 right-0 w-3 h-3 bg-tertiary-fixed-dim rounded-full border-2 border-surface"></span>
                )}
              </div>
              <div className="flex-1 min-w-0">
                <h4 className="font-bold text-sm text-on-surface truncate">{foundUser.full_name}</h4>
                <p className="text-xs text-on-surface-variant font-mono">{foundUser.phone_number}</p>
                {foundUser.about && (
                  <p className="text-[11px] text-on-surface-variant/80 truncate mt-0.5">{foundUser.about}</p>
                )}
              </div>
            </div>

            <div className="pt-2 border-t border-outline-variant/40 flex justify-end gap-2">
              {relationship === 'self' ? (
                <span className="text-xs font-semibold text-primary px-3 py-1.5 rounded-full bg-primary/10">
                  This is your own account
                </span>
              ) : (
                <button
                  type="button"
                  disabled={isStartingChat}
                  onClick={handleStartChat}
                  className="w-full py-2.5 px-4 rounded-full bg-primary text-on-primary font-semibold text-xs hover:bg-primary-container flex items-center justify-center gap-2 shadow-sm transition-all active:scale-98 disabled:opacity-50"
                >
                  {isStartingChat ? (
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                  ) : (
                    <span className="material-symbols-outlined text-base">chat</span>
                  )}
                  <span>Start Chatting &amp; Send Message</span>
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
