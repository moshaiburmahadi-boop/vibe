import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../../context/AuthContext';
import { contactService } from '../../services/contactService';
import { chatService } from '../../services/chatService';
import { UserProfile } from '../../types';
import { isSupabaseConfigured, supabase } from '../../lib/supabase';
import { getPhoneDigits } from '../../utils/phoneUtils';

export const ContactsView: React.FC = () => {
  const { currentUser, setActiveConversation, setActiveTab, startCall } = useAuth();
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [activeChatUserIds, setActiveChatUserIds] = useState<Set<string>>(new Set());
  const [searchQuery, setSearchQuery] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [addingUserId, setAddingUserId] = useState<string | null>(null);

  // Add Contact Modal (Find User by Phone)
  const [showAddModal, setShowAddModal] = useState(false);
  const [searchPhone, setSearchPhone] = useState('');
  const [isSearchingUser, setIsSearchingUser] = useState(false);
  const [searchResult, setSearchResult] = useState<{
    profile: UserProfile | null;
    relationship: 'self' | 'none' | 'contact' | 'request_sent' | 'request_received';
  } | null>(null);
  const [searchFeedback, setSearchFeedback] = useState('');

  const loadContactsAndChats = useCallback(async () => {
    if (!currentUser) return;
    setIsLoading(true);
    try {
      const [registeredList, convsList] = await Promise.all([
        contactService.getRegisteredUsers(currentUser.user_id),
        chatService.getConversations(currentUser.user_id),
      ]);
      setUsers(registeredList);

      const chatIds = new Set<string>();
      convsList.forEach((c) => {
        if (c.other_member?.user_id) {
          chatIds.add(c.other_member.user_id);
        }
      });
      setActiveChatUserIds(chatIds);
    } catch (err) {
      console.error('Failed to load contacts directory:', err);
    } finally {
      setIsLoading(false);
    }
  }, [currentUser]);

  useEffect(() => {
    loadContactsAndChats();

    // Subscribe to profiles, conversations, and conversation_members table changes
    if (isSupabaseConfigured() && currentUser) {
      const channel = supabase
        .channel(`public:contacts_view_${currentUser.user_id}`)
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'profiles' },
          () => {
            loadContactsAndChats();
          }
        )
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'conversation_members' },
          () => {
            loadContactsAndChats();
          }
        )
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'conversations' },
          () => {
            loadContactsAndChats();
          }
        )
        .subscribe();

      return () => {
        supabase.removeChannel(channel);
      };
    }
  }, [loadContactsAndChats, currentUser]);

  // Add Contact to Chat or Open Existing Chat
  const handleAddToChat = async (targetUser: UserProfile) => {
    if (!currentUser) return;
    setAddingUserId(targetUser.user_id);
    try {
      const { conversation, error } = await chatService.getOrCreateDirectConversation(
        currentUser.user_id,
        targetUser.user_id
      );
      if (conversation && !error) {
        setActiveChatUserIds((prev) => new Set([...Array.from(prev), targetUser.user_id]));
        setActiveConversation(conversation);
        setActiveTab('chats');
      } else {
        console.error('Failed to add to chat:', error);
      }
    } catch (err) {
      console.error('Add to chat error:', err);
    } finally {
      setAddingUserId(null);
    }
  };

  // Search user by phone in modal
  const handleSearchUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!searchPhone.trim() || !currentUser) return;

    setIsSearchingUser(true);
    setSearchFeedback('');
    setSearchResult(null);

    try {
      const res = await contactService.searchUserByPhone(searchPhone.trim(), currentUser.user_id);
      if (res.profile) {
        setSearchResult({
          profile: res.profile,
          relationship: res.relationship,
        });
      } else {
        setSearchFeedback('User not found. Check the phone number.');
      }
    } catch (err) {
      setSearchFeedback('Error searching for user.');
    } finally {
      setIsSearchingUser(false);
    }
  };

  // Online contacts list
  const onlineUsers = users.filter((u) => u.is_online);

  // Filtered contacts based on search query
  const filteredUsers = users.filter((u) => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase().trim();
    const nameMatch = (u.full_name || '').toLowerCase().includes(q);
    const phoneMatch =
      (u.phone_number || '').includes(q) ||
      getPhoneDigits(u.phone_number || '').includes(getPhoneDigits(q));
    return nameMatch || phoneMatch;
  });

  // Sort alphabetically case-insensitively
  const sortedUsers = [...filteredUsers].sort((a, b) => {
    const nameA = (a.full_name || a.phone_number || '').trim();
    const nameB = (b.full_name || b.phone_number || '').trim();
    return nameA.localeCompare(nameB, undefined, { sensitivity: 'base' });
  });

  // Group contacts by first letter
  const groupedContacts = sortedUsers.reduce<{ [letter: string]: UserProfile[] }>((acc, user) => {
    const name = (user.full_name || user.phone_number || 'Other').trim();
    const firstChar = name.charAt(0).toUpperCase();
    const letter = /^[A-Z]$/.test(firstChar) ? firstChar : '#';
    if (!acc[letter]) acc[letter] = [];
    acc[letter].push(user);
    return acc;
  }, {});

  const sortedLetters = Object.keys(groupedContacts).sort((a, b) => {
    if (a === '#') return 1;
    if (b === '#') return -1;
    return a.localeCompare(b);
  });

  return (
    <div className="flex-1 flex flex-col h-full bg-background overflow-hidden relative pb-20 md:pb-0">
      {/* TopAppBar */}
      <header className="bg-surface/80 backdrop-blur-md border-b border-outline-variant flex justify-between items-center w-full px-4 md:px-8 h-16 shrink-0 z-10">
        <div className="flex items-center gap-2">
          <h1 className="text-2xl md:text-3xl font-bold text-primary tracking-tight">Contacts</h1>
          <span className="bg-surface-container-high text-on-surface-variant text-xs font-semibold px-2.5 py-0.5 rounded-full border border-outline-variant/50">
            {users.length} {users.length === 1 ? 'user' : 'users'}
          </span>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowAddModal(true)}
            className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-full bg-primary text-on-primary text-xs font-semibold hover:bg-primary-container transition-transform active:scale-95 shadow-sm"
          >
            <span className="material-symbols-outlined text-sm">person_search</span>
            <span>Find by Phone</span>
          </button>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 overflow-y-auto w-full flex flex-col pt-4 px-4 md:px-8 max-w-4xl mx-auto">
        {/* Search Bar */}
        <div className="relative w-full mb-5">
          <span className="material-symbols-outlined absolute left-3.5 top-1/2 -translate-y-1/2 text-on-surface-variant text-xl">
            search
          </span>
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search contacts by name or phone..."
            className="w-full h-11 bg-surface-container-low rounded-full pl-11 pr-4 text-sm text-on-surface placeholder:text-outline border border-outline-variant/40 focus:ring-2 focus:ring-primary/40 transition-all outline-none shadow-sm"
          />
        </div>

        {/* Online Horizontal Scroll */}
        {onlineUsers.length > 0 && !searchQuery && (
          <section className="mb-6 flex-none">
            <h2 className="font-semibold text-base text-on-surface mb-3">Online</h2>
            <div className="flex overflow-x-auto gap-4 no-scrollbar pb-2">
              {onlineUsers.map((user) => {
                const displayName = user.full_name || 'User';
                const avatar =
                  user.avatar_url ||
                  `https://api.dicebear.com/7.x/avataaars/svg?seed=${encodeURIComponent(displayName)}`;
                return (
                  <div
                    key={user.user_id}
                    onClick={() => handleAddToChat(user)}
                    className="flex flex-col items-center gap-1.5 min-w-[68px] cursor-pointer active:scale-95 transition-transform group"
                  >
                    <div className="relative w-14 h-14 rounded-full p-0.5 bg-surface-container-high border border-outline-variant group-hover:border-primary transition-colors">
                      <img
                        src={avatar}
                        alt={displayName}
                        className="w-full h-full rounded-full object-cover"
                      />
                      <div className="absolute bottom-0 right-0 w-3.5 h-3.5 bg-tertiary-fixed-dim rounded-full border-2 border-surface"></div>
                    </div>
                    <span className="text-xs font-medium text-on-surface truncate w-full text-center">
                      {displayName.split(' ')[0]}
                    </span>
                  </div>
                );
              })}
            </div>
          </section>
        )}

        {/* All Contacts Directory Vertical List */}
        <section className="flex-1 flex flex-col pb-12">
          <div className="flex justify-between items-center mb-3 sticky top-0 bg-background/95 backdrop-blur-sm py-1 z-10">
            <h2 className="font-semibold text-base text-on-surface">
              All Contacts ({sortedUsers.length})
            </h2>
            <span className="text-xs text-on-surface-variant">Global Directory</span>
          </div>

          {isLoading ? (
            <div className="flex flex-col items-center justify-center py-16 gap-3 text-on-surface-variant">
              <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin"></div>
              <span className="text-xs">Loading directory...</span>
            </div>
          ) : sortedLetters.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center text-on-surface-variant">
              <div className="w-16 h-16 rounded-full bg-surface-container-high flex items-center justify-center mb-3 text-primary">
                <span className="material-symbols-outlined text-3xl">contacts</span>
              </div>
              <p className="font-bold text-base text-on-surface mb-1">
                {searchQuery ? 'No contacts match your query' : 'No contacts found'}
              </p>
              <p className="text-xs max-w-xs mb-4 text-on-surface-variant">
                {searchQuery
                  ? 'Check the spelling or try searching by phone number.'
                  : 'Registered users on Vibe will automatically appear here in the directory.'}
              </p>
              <button
                onClick={() => setShowAddModal(true)}
                className="px-5 py-2.5 rounded-full bg-primary text-on-primary text-xs font-semibold hover:bg-primary-container shadow-md transition-transform active:scale-95 flex items-center gap-1.5 mx-auto"
              >
                <span className="material-symbols-outlined text-base">person_search</span>
                <span>Find User by Phone</span>
              </button>
            </div>
          ) : (
            <div className="flex flex-col gap-4">
              {sortedLetters.map((letter) => (
                <div key={letter} className="flex flex-col gap-2">
                  <div className="text-xs font-bold text-primary px-1">{letter}</div>
                  {groupedContacts[letter].map((user) => {
                    const displayName = user.full_name || 'User';
                    const avatar =
                      user.avatar_url ||
                      `https://api.dicebear.com/7.x/avataaars/svg?seed=${encodeURIComponent(displayName)}`;
                    const isOnline = user.is_online;
                    const isInChat = activeChatUserIds.has(user.user_id);
                    const isAdding = addingUserId === user.user_id;

                    return (
                      <div
                        key={user.user_id}
                        className="flex items-center justify-between p-3.5 bg-surface rounded-2xl border border-outline-variant/60 hover:bg-surface-container-low transition-colors shadow-sm gap-3"
                      >
                        <div
                          onClick={() => handleAddToChat(user)}
                          className="flex items-center gap-3.5 cursor-pointer min-w-0 flex-1"
                        >
                          <div className="relative w-11 h-11 rounded-full shrink-0">
                            <img
                              src={avatar}
                              alt={displayName}
                              className="w-full h-full rounded-full object-cover border border-outline-variant/60"
                            />
                            {isOnline && (
                              <div className="absolute bottom-0 right-0 w-3 h-3 bg-tertiary-fixed-dim rounded-full border-2 border-surface"></div>
                            )}
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="font-semibold text-sm text-on-surface truncate">
                              {displayName}
                            </div>
                            <div className="text-xs text-on-surface-variant font-mono truncate">
                              {user.phone_number}
                            </div>
                            {user.about && (
                              <div className="text-[11px] text-on-surface-variant/70 truncate">
                                {user.about}
                              </div>
                            )}
                          </div>
                        </div>

                        {/* Action buttons */}
                        <div className="flex items-center gap-2 shrink-0">
                          {isInChat ? (
                            <button
                              onClick={() => handleAddToChat(user)}
                              title="Open Chat"
                              className="px-3.5 py-1.5 rounded-full bg-primary-container/20 text-primary hover:bg-primary hover:text-on-primary transition-colors text-xs font-semibold flex items-center gap-1 shadow-sm"
                            >
                              <span className="material-symbols-outlined text-base">chat</span>
                              <span>Open Chat</span>
                            </button>
                          ) : (
                            <button
                              onClick={() => handleAddToChat(user)}
                              disabled={isAdding}
                              title="Add to Chat"
                              className="px-3.5 py-1.5 rounded-full bg-primary text-on-primary hover:bg-primary-container transition-transform active:scale-95 text-xs font-semibold flex items-center gap-1 shadow-sm disabled:opacity-50"
                            >
                              {isAdding ? (
                                <div className="w-3.5 h-3.5 border-2 border-on-primary border-t-transparent rounded-full animate-spin"></div>
                              ) : (
                                <span className="material-symbols-outlined text-base">add_comment</span>
                              )}
                              <span>Add to Chat</span>
                            </button>
                          )}

                          <button
                            onClick={() => startCall(user, 'voice')}
                            title="Call"
                            className="w-8 h-8 flex items-center justify-center rounded-full bg-surface-container text-primary hover:bg-primary hover:text-white transition-colors"
                          >
                            <span className="material-symbols-outlined text-base">call</span>
                          </button>
                          <button
                            onClick={() => startCall(user, 'video')}
                            title="Video Call"
                            className="w-8 h-8 flex items-center justify-center rounded-full bg-surface-container text-primary hover:bg-primary hover:text-white transition-colors"
                          >
                            <span className="material-symbols-outlined text-base">videocam</span>
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>
          )}
        </section>
      </main>

      {/* Floating Action Button (Mobile) */}
      <button
        onClick={() => setShowAddModal(true)}
        className="md:hidden fixed bottom-24 right-5 w-14 h-14 bg-primary text-white rounded-full flex items-center justify-center shadow-xl hover:bg-primary-container active:scale-95 transition-all z-40"
      >
        <span className="material-symbols-outlined text-2xl">person_search</span>
      </button>

      {/* Find User Modal */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-surface rounded-3xl max-w-md w-full p-6 shadow-2xl border border-outline-variant">
            <div className="flex justify-between items-center mb-4">
              <h3 className="font-bold text-lg text-on-surface">Find User by Phone</h3>
              <button
                onClick={() => {
                  setShowAddModal(false);
                  setSearchResult(null);
                  setSearchPhone('');
                  setSearchFeedback('');
                }}
                className="w-8 h-8 rounded-full flex items-center justify-center text-outline hover:bg-surface-container"
              >
                <span className="material-symbols-outlined">close</span>
              </button>
            </div>

            <p className="text-xs text-on-surface-variant mb-4">
              Enter full phone number to find a registered user on Vibe.
            </p>

            <form onSubmit={handleSearchUser} className="flex gap-2 mb-4">
              <input
                type="tel"
                value={searchPhone}
                onChange={(e) => setSearchPhone(e.target.value)}
                placeholder="Enter phone number"
                className="flex-1 px-4 py-2.5 rounded-full border border-outline-variant text-sm bg-surface-container-low outline-none focus:ring-2 focus:ring-primary"
                required
              />
              <button
                type="submit"
                disabled={isSearchingUser}
                className="px-5 py-2.5 rounded-full bg-primary text-on-primary font-semibold text-xs hover:bg-primary-container transition-transform active:scale-95 disabled:opacity-50"
              >
                {isSearchingUser ? 'Searching...' : 'Search'}
              </button>
            </form>

            {searchFeedback && (
              <div className="p-3 rounded-xl bg-surface-container text-xs text-on-surface-variant text-center mb-4">
                {searchFeedback}
              </div>
            )}

            {/* Search Result Card */}
            {searchResult?.profile && (
              <div className="p-4 rounded-2xl bg-surface-container-low border border-outline-variant flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  <div className="relative">
                    <img
                      src={
                        searchResult.profile.avatar_url ||
                        `https://api.dicebear.com/7.x/avataaars/svg?seed=${encodeURIComponent(
                          searchResult.profile.full_name
                        )}`
                      }
                      alt={searchResult.profile.full_name}
                      className="w-12 h-12 rounded-full object-cover border border-outline-variant"
                    />
                    {searchResult.profile.is_online && (
                      <span className="absolute bottom-0 right-0 w-3 h-3 bg-green-500 border-2 border-surface rounded-full"></span>
                    )}
                  </div>
                  <div>
                    <div className="font-bold text-sm text-on-surface">
                      {searchResult.profile.full_name}
                    </div>
                    <div className="text-xs text-on-surface-variant font-mono">
                      {searchResult.profile.phone_number}
                    </div>
                    {searchResult.profile.about && (
                      <div className="text-[11px] text-on-surface-variant/80 mt-0.5 line-clamp-1">
                        {searchResult.profile.about}
                      </div>
                    )}
                  </div>
                </div>

                <div className="w-full sm:w-auto flex items-center gap-2 justify-end">
                  {searchResult.relationship === 'self' ? (
                    <span className="text-xs font-medium text-primary px-3 py-1.5 rounded-full bg-primary/10">You</span>
                  ) : (
                    <button
                      onClick={() => {
                        setShowAddModal(false);
                        handleAddToChat(searchResult.profile!);
                      }}
                      className="px-4 py-2 rounded-full bg-primary text-on-primary text-xs font-semibold hover:bg-primary-container shadow-sm flex items-center gap-1"
                    >
                      <span className="material-symbols-outlined text-sm">chat</span>
                      <span>
                        {activeChatUserIds.has(searchResult.profile.user_id)
                          ? 'Open Chat'
                          : 'Add to Chat'}
                      </span>
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
