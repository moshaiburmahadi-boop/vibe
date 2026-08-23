import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { authService } from '../services/authService';
import { UserProfile, ActiveTab, CallSession, Conversation } from '../types';
import { isSupabaseConfigured, supabase } from '../lib/supabase';

interface AuthContextType {
  currentUser: UserProfile | null;
  isLoading: boolean;
  isOnline: boolean;
  activeTab: ActiveTab;
  setActiveTab: (tab: ActiveTab) => void;
  activeConversation: Conversation | null;
  setActiveConversation: (conv: Conversation | null) => void;
  activeCall: CallSession | null;
  startCall: (contact: UserProfile, type: 'voice' | 'video') => void;
  endCall: () => void;
  toggleMute: () => void;
  toggleVideo: () => void;
  toggleSpeaker: () => void;
  flipCamera: () => void;
  signIn: (phone: string, pass: string) => Promise<{ error: Error | null }>;
  signUp: (params: { fullName: string; phoneNumber: string; password: string; avatarUrl?: string }) => Promise<{ error: Error | null }>;
  signOut: () => Promise<void>;
  updateProfile: (updates: Partial<UserProfile>) => Promise<boolean>;
  refreshProfile: () => Promise<void>;
  showContactInfo: boolean;
  setShowContactInfo: (show: boolean) => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [currentUser, setCurrentUser] = useState<UserProfile | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isOnline, setIsOnline] = useState<boolean>(typeof navigator !== 'undefined' ? navigator.onLine : true);
  const [activeTab, setActiveTab] = useState<ActiveTab>('chats');
  const [activeConversation, setActiveConversation] = useState<Conversation | null>(null);
  const [showContactInfo, setShowContactInfo] = useState<boolean>(false);
  const [activeCall, setActiveCall] = useState<CallSession | null>(null);

  // Monitor online / offline network status
  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  // Initialize session on startup
  const initSession = useCallback(async () => {
    setIsLoading(true);
    try {
      const { profile } = await authService.getCurrentSession();
      if (profile) {
        setCurrentUser(profile);
        await authService.setPresence(profile.user_id, true);
      } else {
        setCurrentUser(null);
      }
    } catch (err) {
      console.error('Session init error:', err);
      setCurrentUser(null);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    initSession();

    // Listen to Supabase auth events (SIGNED_IN, SIGNED_OUT, TOKEN_REFRESHED, USER_UPDATED)
    if (isSupabaseConfigured()) {
      const { data: authListener } = supabase.auth.onAuthStateChange(async (event, session) => {
        if (
          (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED' || event === 'USER_UPDATED') &&
          session?.user
        ) {
          const profile = await authService.getProfile(session.user.id);
          if (profile) {
            setCurrentUser(profile);
          }
        } else if (event === 'SIGNED_OUT') {
          setCurrentUser(null);
          setActiveConversation(null);
          setActiveCall(null);
        }
      });

      return () => {
        authListener.subscription.unsubscribe();
      };
    }
  }, [initSession]);

  // Periodic active call timer
  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (activeCall && activeCall.status === 'connected') {
      interval = setInterval(() => {
        setActiveCall((prev) => (prev ? { ...prev, duration: prev.duration + 1 } : null));
      }, 1000);
    }
    return () => clearInterval(interval);
  }, [activeCall?.status]);

  const signIn = async (phone: string, pass: string): Promise<{ error: Error | null }> => {
    const res = await authService.signIn(phone, pass);
    if (res.profile && !res.error) {
      setCurrentUser(res.profile);
      await authService.setPresence(res.profile.user_id, true);
    }
    return { error: res.error };
  };

  const signUp = async (params: {
    fullName: string;
    phoneNumber: string;
    password: string;
    avatarUrl?: string;
  }): Promise<{ error: Error | null }> => {
    const res = await authService.signUp(params);
    if (res.profile && !res.error) {
      setCurrentUser(res.profile);
      await authService.setPresence(res.profile.user_id, true);
    }
    return { error: res.error };
  };

  const signOut = async () => {
    if (currentUser) {
      await authService.setPresence(currentUser.user_id, false);
    }
    await authService.signOut();
    setCurrentUser(null);
    setActiveConversation(null);
    setActiveCall(null);
  };

  const updateProfile = async (updates: Partial<UserProfile>): Promise<boolean> => {
    if (!currentUser) return false;
    const { profile, error } = await authService.updateProfile(currentUser.user_id, updates);
    if (profile && !error) {
      setCurrentUser(profile);
      return true;
    }
    return false;
  };

  const refreshProfile = async () => {
    if (!currentUser) return;
    const prof = await authService.getProfile(currentUser.user_id);
    if (prof) setCurrentUser(prof);
  };

  // Call management
  const startCall = (contact: UserProfile, type: 'voice' | 'video') => {
    setActiveCall({
      isActive: true,
      type,
      contact,
      status: 'connected',
      duration: 0,
      isMuted: false,
      isVideoOff: false,
      isSpeakerOn: false,
      isFrontCamera: true,
    });
  };

  const endCall = () => {
    if (activeCall) {
      setActiveCall((prev) => (prev ? { ...prev, status: 'ended' } : null));
      setTimeout(() => {
        setActiveCall(null);
      }, 400);
    }
  };

  const toggleMute = () => {
    setActiveCall((prev) => (prev ? { ...prev, isMuted: !prev.isMuted } : null));
  };

  const toggleVideo = () => {
    setActiveCall((prev) => (prev ? { ...prev, isVideoOff: !prev.isVideoOff } : null));
  };

  const toggleSpeaker = () => {
    setActiveCall((prev) => (prev ? { ...prev, isSpeakerOn: !prev.isSpeakerOn } : null));
  };

  const flipCamera = () => {
    setActiveCall((prev) => (prev ? { ...prev, isFrontCamera: !prev.isFrontCamera } : null));
  };

  return (
    <AuthContext.Provider
      value={{
        currentUser,
        isLoading,
        isOnline,
        activeTab,
        setActiveTab,
        activeConversation,
        setActiveConversation,
        activeCall,
        startCall,
        endCall,
        toggleMute,
        toggleVideo,
        toggleSpeaker,
        flipCamera,
        signIn,
        signUp,
        signOut,
        updateProfile,
        refreshProfile,
        showContactInfo,
        setShowContactInfo,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = (): AuthContextType => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
