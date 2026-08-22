export interface UserProfile {
  id: string;
  user_id: string;
  full_name: string;
  phone_number: string;
  username?: string | null;
  avatar_url?: string | null;
  about?: string | null;
  is_online?: boolean;
  last_seen?: string | null;
  created_at?: string;
  updated_at?: string;
}

export interface Contact {
  id: string;
  user_id: string;
  contact_user_id: string;
  created_at: string;
  profile?: UserProfile;
}

export interface ContactRequest {
  id: string;
  sender_id: string;
  receiver_id: string;
  status: 'pending' | 'accepted' | 'rejected';
  created_at: string;
  updated_at: string;
  sender_profile?: UserProfile;
  receiver_profile?: UserProfile;
}

export interface ConversationMember {
  id: string;
  conversation_id: string;
  user_id: string;
  joined_at: string;
  profile?: UserProfile;
}

export type MessageType = 'text' | 'image' | 'file' | 'voice' | 'video';

export interface Message {
  id: string;
  conversation_id: string;
  sender_id: string;
  message_type: MessageType;
  content: string | null;
  file_url?: string | null;
  file_name?: string | null;
  file_size?: string | null;
  duration_seconds?: number | null;
  reply_to_message_id?: string | null;
  is_deleted?: boolean;
  created_at: string;
  updated_at?: string;
  sender?: UserProfile;
  reply_to?: Message | null;
  is_read?: boolean;
  status?: 'sending' | 'sent' | 'delivered' | 'read' | 'failed';
}

export interface MessageRead {
  id: string;
  message_id: string;
  user_id: string;
  read_at: string;
}

export interface Conversation {
  id: string;
  conversation_type: 'direct' | 'group';
  name?: string | null;
  avatar_url?: string | null;
  created_at: string;
  updated_at?: string;
  members: ConversationMember[];
  other_member?: UserProfile;
  last_message?: Message | null;
  unread_count: number;
}

export type ActiveTab = 'chats' | 'contacts' | 'calls' | 'status' | 'settings';

export interface CallSession {
  isActive: boolean;
  type: 'voice' | 'video';
  contact: UserProfile;
  status: 'ringing' | 'connected' | 'ended';
  startTime?: number;
  duration: number; // in seconds
  isMuted: boolean;
  isVideoOff: boolean;
  isSpeakerOn: boolean;
  isFrontCamera?: boolean;
}

export interface CallRecord {
  id: string;
  contact: UserProfile;
  type: 'voice' | 'video';
  direction: 'incoming' | 'outgoing' | 'missed';
  timestamp: string;
  duration?: string;
}
