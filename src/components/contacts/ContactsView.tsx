import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../../context/AuthContext';
import { contactService } from '../../services/contactService';
import { chatService } from '../../services/chatService';
import { Contact, ContactRequest, UserProfile } from '../../types';
import { realtimeService } from '../../services/realtimeService';

export const ContactsView: React.FC = () => {
  const { currentUser, setActiveConversation, setActiveTab, startCall } = useAuth();
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [requests, setRequests] = useState<{ received: ContactRequest[]; sent: ContactRequest[] }>({
    received: [],
    sent: [],
  });
  const [searchQuery, setSearchQuery] = useState('');
  const [isLoading, setIsLoading] = useState(true);

  // Add Contact Modal
  const [showAddModal, setShowAddModal] = useState(false);
  const [searchPhone, setSearchPhone] = useState('');
  const [isSearchingUser, setIsSearchingUser] = useState(false);
  const [searchResult, setSearchResult] = useState<{
    profile: UserProfile | null;
    relationship: 'self' | 'none' | 'contact' | 'request_sent' | 'request_received';
    requestId?: string;
  } | null>(null);
  const [searchFeedback, setSearchFeedback] = useState('');

  const loadContactsAndRequests = useCallback(async () => {
    if (!currentUser) return;
    setIsLoading(true);
    try {
      const [contactsList, requestsData] = await Promise.all([
        contactService.getContacts(currentUser.user_id),
        contactService.getContactRequests(currentUser.user_id),
      ]);
      setContacts(contactsList);
      setRequests(requestsData);
    } catch (err) {
      console.error('Failed to load contacts:', err);
    } finally {
      setIsLoading(false);
    }
  }, [currentUser]);

  useEffect(() => {
    loadContactsAndRequests();

    if (currentUser) {
      const channel = realtimeService.subscribeToContactRequests(currentUser.user_id, () => {
        loadContactsAndRequests();
      });

      return () => {
        realtimeService.unsubscribe(channel);
      };
    }
  }, [loadContactsAndRequests, currentUser]);

  // Start chat with contact
  const handleOpenChat = async (contactUser: UserProfile) => {
    if (!currentUser) return;
    const { conversation } = await chatService.getOrCreateDirectConversation(
      currentUser.user_id,
      contactUser.user_id
    );
    if (conversation) {
      setActiveConversation(conversation);
      setActiveTab('chats');
    }
  };

  // Search user by phone
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
          requestId: res.requestId,
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

  // Send request
  const handleSendRequest = async (receiverId: string) => {
    if (!currentUser) return;
    const res = await contactService.sendContactRequest(currentUser.user_id, receiverId);
    if (!res.error) {
      setSearchResult((prev) => (prev ? { ...prev, relationship: 'request_sent' } : null));
      loadContactsAndRequests();
    } else {
      alert(res.error.message);
    }
  };

  // Accept/Reject request
  const handleRespondRequest = async (
    requestId: string,
    status: 'accepted' | 'rejected',
    senderId: string
  ) => {
    if (!currentUser) return;
    await contactService.respondContactRequest(requestId, status, senderId, currentUser.user_id);
    loadContactsAndRequests();
  };

  // Online contacts
  const onlineContacts = contacts.filter((c) => c.profile?.is_online);

  // Group contacts alphabetically
  const filteredContacts = contacts.filter((c) => {
    const name = c.profile?.full_name || '';
    const phone = c.profile?.phone_number || '';
    return (
      name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      phone.toLowerCase().includes(searchQuery.toLowerCase())
    );
  });

  const groupedContacts = filteredContacts.reduce<{ [letter: string]: Contact[] }>((acc, contact) => {
    const name = contact.profile?.full_name || 'Other';
    const firstLetter = name[0].toUpperCase();
    if (!acc[firstLetter]) acc[firstLetter] = [];
    acc[firstLetter].push(contact);
    return acc;
  }, {});

  const sortedLetters = Object.keys(groupedContacts).sort();

  return (
    <div className="flex-1 flex flex-col h-full bg-background overflow-hidden relative pb-20 md:pb-0">
      {/* TopAppBar */}
      <header className="bg-surface/80 backdrop-blur-md border-b border-outline-variant flex justify-between items-center w-full px-4 md:px-8 h-16 shrink-0 z-10">
        <div className="flex items-center gap-2">
          <h1 className="text-2xl md:text-3xl font-bold text-primary tracking-tight">Contacts</h1>
          {requests.received.length > 0 && (
            <span className="bg-primary text-on-primary text-xs font-bold px-2 py-0.5 rounded-full">
              {requests.received.length} new
            </span>
          )}
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowAddModal(true)}
            className="flex items-center gap-1 px-3 py-1.5 rounded-full bg-primary text-on-primary text-xs font-semibold hover:bg-primary-container transition-transform active:scale-95 shadow-sm"
          >
            <span className="material-symbols-outlined text-sm">person_add</span>
            <span>Add Contact</span>
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

        {/* Pending Requests Section if any */}
        {requests.received.length > 0 && (
          <section className="mb-6 bg-surface-container-low p-4 rounded-2xl border border-primary/20">
            <h3 className="font-semibold text-sm text-primary mb-3 flex items-center gap-2">
              <span className="material-symbols-outlined text-lg">group_add</span>
              Contact Requests ({requests.received.length})
            </h3>
            <div className="flex flex-col gap-2.5">
              {requests.received.map((req) => (
                <div
                  key={req.id}
                  className="flex items-center justify-between p-3 bg-surface rounded-xl border border-outline-variant/60 shadow-sm"
                >
                  <div className="flex items-center gap-3">
                    <img
                      src={
                        req.sender_profile?.avatar_url ||
                        `https://api.dicebear.com/7.x/avataaars/svg?seed=${encodeURIComponent(
                          req.sender_profile?.full_name || 'User'
                        )}`
                      }
                      alt={req.sender_profile?.full_name || 'User'}
                      className="w-10 h-10 rounded-full object-cover border border-outline-variant"
                    />
                    <div>
                      <div className="font-semibold text-sm text-on-surface">
                        {req.sender_profile?.full_name || 'Unknown User'}
                      </div>
                      <div className="text-xs text-on-surface-variant font-mono">
                        {req.sender_profile?.phone_number}
                      </div>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() =>
                        handleRespondRequest(req.id, 'accepted', req.sender_id)
                      }
                      className="px-3 py-1.5 rounded-full bg-primary text-on-primary text-xs font-semibold hover:bg-primary-container shadow-sm transition-transform active:scale-95"
                    >
                      Accept
                    </button>
                    <button
                      onClick={() =>
                        handleRespondRequest(req.id, 'rejected', req.sender_id)
                      }
                      className="px-3 py-1.5 rounded-full bg-surface-container text-on-surface-variant text-xs font-semibold hover:bg-surface-container-high transition-transform active:scale-95"
                    >
                      Decline
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Online Horizontal Scroll */}
        {onlineContacts.length > 0 && (
          <section className="mb-6 flex-none">
            <h2 className="font-semibold text-base text-on-surface mb-3">Online</h2>
            <div className="flex overflow-x-auto gap-4 no-scrollbar pb-2">
              {onlineContacts.map((c) => {
                const profile = c.profile;
                if (!profile) return null;
                return (
                  <div
                    key={c.id}
                    onClick={() => handleOpenChat(profile)}
                    className="flex flex-col items-center gap-1.5 min-w-[68px] cursor-pointer active:scale-95 transition-transform"
                  >
                    <div className="relative w-14 h-14 rounded-full p-0.5 bg-surface-container-high border border-outline-variant">
                      <img
                        src={
                          profile.avatar_url ||
                          `https://api.dicebear.com/7.x/avataaars/svg?seed=${encodeURIComponent(
                            profile.full_name
                          )}`
                        }
                        alt={profile.full_name}
                        className="w-full h-full rounded-full object-cover"
                      />
                      <div className="absolute bottom-0 right-0 w-3.5 h-3.5 bg-tertiary-fixed-dim rounded-full border-2 border-surface"></div>
                    </div>
                    <span className="text-xs font-medium text-on-surface truncate w-full text-center">
                      {profile.full_name.split(' ')[0]}
                    </span>
                  </div>
                );
              })}
            </div>
          </section>
        )}

        {/* All Contacts Vertical List */}
        <section className="flex-1 flex flex-col pb-12">
          <h2 className="font-semibold text-base text-on-surface mb-3 sticky top-0 bg-background/95 backdrop-blur-sm py-1 z-10">
            All Contacts ({contacts.length})
          </h2>

          {isLoading ? (
            <div className="flex justify-center py-12">
              <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin"></div>
            </div>
          ) : sortedLetters.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center text-on-surface-variant">
              <div className="w-16 h-16 rounded-full bg-surface-container-high flex items-center justify-center mb-3 text-primary">
                <span className="material-symbols-outlined text-3xl">contacts</span>
              </div>
              <p className="font-bold text-base text-on-surface mb-1">
                {searchQuery ? 'No contacts match your query' : 'No contacts added yet'}
              </p>
              <p className="text-xs max-w-xs mb-4">
                {searchQuery
                  ? 'Check the spelling or try searching by phone number.'
                  : 'Search for members by phone number to connect and start messaging.'}
              </p>
              <button
                onClick={() => setShowAddModal(true)}
                className="px-5 py-2.5 rounded-full bg-primary text-on-primary text-xs font-semibold hover:bg-primary-container shadow-md transition-transform active:scale-95"
              >
                Add Your First Contact
              </button>
            </div>
          ) : (
            <div className="flex flex-col gap-4">
              {sortedLetters.map((letter) => (
                <div key={letter} className="flex flex-col gap-2">
                  <div className="text-xs font-bold text-outline px-1">{letter}</div>
                  {groupedContacts[letter].map((contact) => {
                    const prof = contact.profile;
                    if (!prof) return null;
                    const isOnline = prof.is_online;
                    return (
                      <div
                        key={contact.id}
                        className="flex items-center justify-between p-3.5 bg-surface rounded-2xl border border-outline-variant/60 hover:bg-surface-container-low transition-colors shadow-sm"
                      >
                        <div
                          onClick={() => handleOpenChat(prof)}
                          className="flex items-center gap-3.5 cursor-pointer min-w-0 flex-1"
                        >
                          <div className="relative w-11 h-11 rounded-full shrink-0">
                            <img
                              src={
                                prof.avatar_url ||
                                `https://api.dicebear.com/7.x/avataaars/svg?seed=${encodeURIComponent(
                                  prof.full_name
                                )}`
                              }
                              alt={prof.full_name}
                              className="w-full h-full rounded-full object-cover border border-outline-variant/60"
                            />
                            {isOnline && (
                              <div className="absolute bottom-0 right-0 w-3 h-3 bg-tertiary-fixed-dim rounded-full border-2 border-surface"></div>
                            )}
                          </div>
                          <div className="min-w-0">
                            <div className="font-semibold text-sm text-on-surface truncate">
                              {prof.full_name}
                            </div>
                            <div className="text-xs text-on-surface-variant font-mono truncate">
                              {prof.phone_number}
                            </div>
                          </div>
                        </div>

                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => handleOpenChat(prof)}
                            title="Message"
                            className="w-9 h-9 flex items-center justify-center rounded-full bg-surface-container text-primary hover:bg-primary hover:text-white transition-colors"
                          >
                            <span className="material-symbols-outlined text-lg">chat</span>
                          </button>
                          <button
                            onClick={() => startCall(prof, 'voice')}
                            title="Call"
                            className="w-9 h-9 flex items-center justify-center rounded-full bg-surface-container text-primary hover:bg-primary hover:text-white transition-colors"
                          >
                            <span className="material-symbols-outlined text-lg">call</span>
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
        <span className="material-symbols-outlined text-2xl">add</span>
      </button>

      {/* Add Contact Modal */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-surface rounded-3xl max-w-md w-full p-6 shadow-2xl border border-outline-variant">
            <div className="flex justify-between items-center mb-4">
              <h3 className="font-bold text-lg text-on-surface">Find &amp; Add Contact</h3>
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
              Search by full phone number (e.g. +15550000000) to find a user on Vibe.
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
                  ) : searchResult.relationship === 'contact' ? (
                    <button
                      onClick={() => {
                        setShowAddModal(false);
                        handleOpenChat(searchResult.profile!);
                      }}
                      className="px-4 py-2 rounded-full bg-primary text-on-primary text-xs font-semibold hover:bg-primary-container shadow-sm flex items-center gap-1"
                    >
                      <span className="material-symbols-outlined text-sm">chat</span>
                      <span>Message</span>
                    </button>
                  ) : searchResult.relationship === 'request_sent' ? (
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => {
                          setShowAddModal(false);
                          handleOpenChat(searchResult.profile!);
                        }}
                        className="px-3 py-1.5 rounded-full bg-primary text-on-primary text-xs font-semibold hover:bg-primary-container shadow-sm flex items-center gap-1"
                      >
                        <span className="material-symbols-outlined text-sm">chat</span>
                        <span>Message</span>
                      </button>
                      <span className="text-xs text-primary font-semibold bg-primary-container/20 px-3 py-1.5 rounded-full">
                        Request Sent
                      </span>
                    </div>
                  ) : searchResult.relationship === 'request_received' ? (
                    <button
                      onClick={() => {
                        if (searchResult.requestId) {
                          handleRespondRequest(
                            searchResult.requestId,
                            'accepted',
                            searchResult.profile!.user_id
                          );
                          setShowAddModal(false);
                        }
                      }}
                      className="px-4 py-2 rounded-full bg-primary text-on-primary text-xs font-semibold hover:bg-primary-container shadow-sm"
                    >
                      Accept
                    </button>
                  ) : (
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => {
                          setShowAddModal(false);
                          handleOpenChat(searchResult.profile!);
                        }}
                        className="px-3 py-1.5 rounded-full bg-surface-container text-on-surface text-xs font-semibold hover:bg-surface-container-high border border-outline-variant flex items-center gap-1 shadow-sm"
                      >
                        <span className="material-symbols-outlined text-sm">chat</span>
                        <span>Message</span>
                      </button>
                      <button
                        onClick={() => handleSendRequest(searchResult.profile!.user_id)}
                        className="px-4 py-1.5 rounded-full bg-primary text-on-primary text-xs font-semibold hover:bg-primary-container shadow-sm"
                      >
                        Add Contact
                      </button>
                    </div>
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
