import React from 'react';
import { AuthProvider, useAuth } from './context/AuthContext';
import { AuthScreen } from './components/auth/AuthScreen';
import { SideNavBar } from './components/navigation/SideNavBar';
import { BottomNavBar } from './components/navigation/BottomNavBar';
import { ChatListPanel } from './components/chat/ChatListPanel';
import { ActiveChatArea } from './components/chat/ActiveChatArea';
import { ContactInfoPanel } from './components/chat/ContactInfoPanel';
import { ContactsView } from './components/contacts/ContactsView';
import { CallsHistoryView } from './components/calls/CallsHistoryView';
import { StatusView } from './components/status/StatusView';
import { SettingsView } from './components/settings/SettingsView';
import { VoiceCallModal } from './components/calls/VoiceCallModal';
import { VideoCallModal } from './components/calls/VideoCallModal';
import { PwaInstallBanner } from './components/common/PwaInstallBanner';
import { OfflineBanner } from './components/common/OfflineBanner';

const MainApplication: React.FC = () => {
  const { currentUser, isLoading, activeTab, activeConversation } = useAuth();

  if (isLoading) {
    return (
      <div className="min-h-screen w-full flex flex-col items-center justify-center bg-surface font-inter">
        <div className="w-16 h-16 rounded-2xl bg-primary text-on-primary flex items-center justify-center mb-4 shadow-xl shadow-primary/20 animate-pulse">
          <span className="material-symbols-outlined text-4xl fill" style={{ fontVariationSettings: "'FILL' 1" }}>
            forum
          </span>
        </div>
        <h1 className="text-2xl font-bold text-primary mb-2 tracking-tight">Vibe</h1>
        <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  if (!currentUser) {
    return <AuthScreen />;
  }

  return (
    <div className="flex h-screen w-screen bg-background text-on-surface overflow-hidden font-inter">
      {/* Banners & Overlays */}
      <OfflineBanner />
      <PwaInstallBanner />
      <VoiceCallModal />
      <VideoCallModal />

      {/* Desktop Navigation Sidebar */}
      <div className="hidden md:block">
        <SideNavBar />
      </div>

      {/* Main Content Workspace */}
      <div className="flex-1 flex flex-col md:pl-72 h-full overflow-hidden">
        {activeTab === 'chats' && (
          <div className="flex-1 flex h-full overflow-hidden">
            {/* Conversations List (Hidden on mobile if a chat is active) */}
            <div
              className={`h-full ${
                activeConversation ? 'hidden md:flex' : 'flex w-full md:w-auto'
              }`}
            >
              <ChatListPanel />
            </div>

            {/* Active Chat Screen (Hidden on mobile if no chat selected) */}
            <div
              className={`flex-1 h-full ${
                !activeConversation ? 'hidden md:flex' : 'flex'
              }`}
            >
              <ActiveChatArea />
            </div>

            {/* Right Contact Details Panel (Desktop Only) */}
            <div className="hidden xl:flex h-full">
              <ContactInfoPanel />
            </div>
          </div>
        )}

        {activeTab === 'contacts' && <ContactsView />}
        {activeTab === 'calls' && <CallsHistoryView />}
        {activeTab === 'status' && <StatusView />}
        {activeTab === 'settings' && <SettingsView />}
      </div>

      {/* Mobile Bottom Navigation (Hidden inside an active chat on mobile) */}
      {(!activeConversation || activeTab !== 'chats') && <BottomNavBar />}
    </div>
  );
};

export default function App() {
  return (
    <AuthProvider>
      <MainApplication />
    </AuthProvider>
  );
}
