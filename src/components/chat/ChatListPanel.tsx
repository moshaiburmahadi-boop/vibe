import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../../context/AuthContext';
import { chatService } from '../../services/chatService';
import { Conversation } from '../../types';
import { isSupabaseConfigured, supabase } from '../../lib/supabase';

interface ChatListPanelProps {
  onStartNewChat?: () => void;
}

export const ChatListPanel: React.FC<ChatListPanelProps> = ({ onStartNewChat }) => {
  const { currentUser, activeConversation, setActiveConversation, setActiveTab } = useAuth();
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [isLoading, setIsLoading] = useState(true);

  const fetchConversations = useCallback(async () => {
    if (!currentUser) return;
    try {
      const list = await chatService.getConversations(currentUser.user_id);
      setConversations(list);
    } catch (err) {
      console.error('Failed to load conversations:', err);
    } finally {
      setIsLoading(false);
    }
  }, [currentUser]);

  useEffect(() => {
    fetchConversations();

    // Subscribe to messages table for updates to conversation list
    if (isSupabaseConfigured() && currentUser) {
      const channel = supabase
        .channel('public:messages_list_updates')
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'messages' },
          () => {
            fetchConversations();
          }
        )
        .subscribe();

      return () => {
        supabase.removeChannel(channel);
      };
    }
  }, [fetchConversations, currentUser]);

  const filteredConversations = conversations.filter((conv) => {
    const name = conv.other_member?.full_name || conv.name || '';
    const lastMsg = conv.last_message?.content || '';
    return (
      name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      lastMsg.toLowerCase().includes(searchQuery.toLowerCase())
    );
  });

  const formatTimestamp = (dateStr?: string): string => {
    if (!dateStr) return '';
    const date = new Date(dateStr);
    const now = new Date();
    const isToday =
      date.getDate() === now.getDate() &&
      date.getMonth() === now.getMonth() &&
      date.getFullYear() === now.getFullYear();

    if (isToday) {
      return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    }

    const yesterday = new Date();
    yesterday.setDate(now.getDate() - 1);
    const isYesterday =
      date.getDate() === yesterday.getDate() &&
      date.getMonth() === yesterday.getMonth() &&
      date.getFullYear() === yesterday.getFullYear();

    if (isYesterday) return 'Yesterday';

    return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
  };

  return (
    <div className="w-full md:w-[320px] lg:w-[360px] flex-shrink-0 border-r border-outline-variant bg-surface flex flex-col h-full z-10 relative">
      {/* Header & Search */}
      <div className="p-4 flex flex-col gap-3 sticky top-0 bg-surface/95 backdrop-blur-md z-10 border-b border-outline-variant/30 md:border-b-0">
        <div className="flex justify-between items-center">
          <h2 className="text-2xl md:text-3xl font-bold text-on-surface tracking-tight">Messages</h2>
          <button
            onClick={() => (onStartNewChat ? onStartNewChat() : setActiveTab('contacts'))}
            title="Start new conversation"
            className="w-10 h-10 rounded-full border border-outline-variant flex items-center justify-center text-on-surface-variant hover:bg-surface-container hover:text-primary transition-all active:scale-95 shadow-sm"
          >
            <span className="material-symbols-outlined text-xl">edit_square</span>
          </button>
        </div>

        {/* Search input */}
        <div className="relative w-full">
          <span className="material-symbols-outlined absolute left-3.5 top-1/2 -translate-y-1/2 text-on-surface-variant text-xl pointer-events-none">
            search
          </span>
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search conversations"
            className="w-full h-11 bg-surface-container-low rounded-full pl-11 pr-4 font-body-md text-sm text-on-surface placeholder:text-outline border-none focus:ring-2 focus:ring-primary/40 transition-shadow outline-none"
          />
        </div>
      </div>

      {/* Conversation List */}
      <div className="flex-1 overflow-y-auto px-2 pb-6 flex flex-col gap-1">
        {isLoading ? (
          <div className="flex flex-col items-center justify-center py-12 gap-3 text-on-surface-variant">
            <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin"></div>
            <span className="text-xs">Loading conversations...</span>
          </div>
        ) : filteredConversations.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 px-4 text-center text-on-surface-variant">
            <div className="w-14 h-14 rounded-full bg-surface-container-high flex items-center justify-center mb-3 text-primary">
              <span className="material-symbols-outlined text-2xl">chat_bubble_outline</span>
            </div>
            <p className="font-semibold text-sm text-on-surface mb-1">
              {searchQuery ? 'No chats match your search' : 'No conversations yet'}
            </p>
            <p className="text-xs text-on-surface-variant max-w-[220px] mb-4">
              {searchQuery
                ? 'Try a different contact name or message keyword.'
                : 'Connect with colleagues and friends by adding contacts.'}
            </p>
            <button
              onClick={() => (onStartNewChat ? onStartNewChat() : setActiveTab('contacts'))}
              className="px-4 py-2 rounded-full bg-primary text-on-primary text-xs font-semibold hover:bg-primary-container transition-transform active:scale-95 shadow-sm"
            >
              Start New Chat
            </button>
          </div>
        ) : (
          filteredConversations.map((conv) => {
            const isSelected = activeConversation?.id === conv.id;
            const other = conv.other_member;
            const displayName = other?.full_name || conv.name || 'Conversation';
            const avatar =
              other?.avatar_url ||
              conv.avatar_url ||
              `https://api.dicebear.com/7.x/avataaars/svg?seed=${encodeURIComponent(displayName)}`;
            const isOnline = other?.is_online;
            const lastMsg = conv.last_message;
            const hasUnread = conv.unread_count > 0;

            return (
              <div
                key={conv.id}
                onClick={() => {
                  setActiveConversation(conv);
                }}
                className={`flex items-center gap-3 p-3 rounded-2xl cursor-pointer transition-all duration-150 group select-none ${
                  isSelected
                    ? 'bg-primary-container/10 border-l-4 border-primary'
                    : 'hover:bg-surface-container/60 border-l-4 border-transparent'
                }`}
              >
                {/* Avatar */}
                <div className="relative w-12 h-12 shrink-0">
                  <img
                    src={avatar}
                    alt={displayName}
                    className="w-full h-full object-cover rounded-full shadow-sm border border-outline-variant/50"
                  />
                  {isOnline && (
                    <div className="absolute bottom-0 right-0 w-3.5 h-3.5 rounded-full border-2 border-surface bg-tertiary-fixed-dim"></div>
                  )}
                </div>

                {/* Info */}
                <div className="flex-1 min-w-0 flex flex-col justify-center">
                  <div className="flex justify-between items-baseline mb-0.5">
                    <span
                      className={`text-sm font-semibold truncate pr-2 ${
                        isSelected ? 'text-primary' : 'text-on-surface'
                      }`}
                    >
                      {displayName}
                    </span>
                    <span
                      className={`text-[11px] shrink-0 font-medium ${
                        hasUnread ? 'text-primary font-bold' : 'text-on-surface-variant'
                      }`}
                    >
                      {formatTimestamp(lastMsg?.created_at || conv.created_at)}
                    </span>
                  </div>

                  <div className="flex items-center justify-between gap-1">
                    <p
                      className={`text-xs truncate ${
                        hasUnread
                          ? 'text-on-surface font-semibold'
                          : 'text-on-surface-variant'
                      }`}
                    >
                      {lastMsg ? (
                        lastMsg.is_deleted ? (
                          <span className="italic opacity-70">This message was deleted</span>
                        ) : lastMsg.message_type === 'voice' ? (
                          <span className="flex items-center gap-1">
                            <span className="material-symbols-outlined text-[14px]">mic</span> Voice message
                          </span>
                        ) : lastMsg.message_type === 'image' ? (
                          <span className="flex items-center gap-1">
                            <span className="material-symbols-outlined text-[14px]">image</span> Photo
                          </span>
                        ) : lastMsg.message_type === 'file' ? (
                          <span className="flex items-center gap-1">
                            <span className="material-symbols-outlined text-[14px]">description</span> Attachment
                          </span>
                        ) : (
                          lastMsg.content
                        )
                      ) : (
                        <span className="italic opacity-60">Tap to start chatting</span>
                      )}
                    </p>

                    {/* Unread badge */}
                    {hasUnread && (
                      <div className="bg-primary text-on-primary rounded-full min-w-[20px] h-5 px-1.5 flex items-center justify-center text-[10px] font-bold shrink-0 shadow-sm">
                        {conv.unread_count}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};
