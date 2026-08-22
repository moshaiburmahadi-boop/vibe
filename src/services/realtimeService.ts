import { RealtimeChannel } from '@supabase/supabase-js';
import { supabase, isSupabaseConfigured } from '../lib/supabase';
import { Message } from '../types';

export const realtimeService = {
  // Subscribe to real-time messages in a conversation
  subscribeToMessages(
    conversationId: string,
    onNewMessage: (message: Message) => void,
    onMessageUpdated?: (message: Message) => void
  ): RealtimeChannel | null {
    if (!isSupabaseConfigured()) return null;

    const channel = supabase
      .channel(`chat_${conversationId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'messages',
          filter: `conversation_id=eq.${conversationId}`,
        },
        (payload) => {
          onNewMessage(payload.new as Message);
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'messages',
          filter: `conversation_id=eq.${conversationId}`,
        },
        (payload) => {
          if (onMessageUpdated) {
            onMessageUpdated(payload.new as Message);
          }
        }
      )
      .subscribe();

    return channel;
  },

  // Subscribe to broadcast typing indicator
  subscribeToTyping(
    conversationId: string,
    onTypingChange: (userId: string, isTyping: boolean) => void
  ): RealtimeChannel | null {
    if (!isSupabaseConfigured()) return null;

    const channel = supabase.channel(`typing_${conversationId}`, {
      config: { broadcast: { self: false } },
    });

    channel
      .on('broadcast', { event: 'typing' }, (payload) => {
        const { userId, isTyping } = payload.payload;
        onTypingChange(userId, isTyping);
      })
      .subscribe();

    return channel;
  },

  // Send typing broadcast
  sendTypingStatus(channel: RealtimeChannel | null, userId: string, isTyping: boolean) {
    if (!channel) return;
    channel.send({
      type: 'broadcast',
      event: 'typing',
      payload: { userId, isTyping },
    });
  },

  // Subscribe to contact requests
  subscribeToContactRequests(
    userId: string,
    onRequestChange: () => void
  ): RealtimeChannel | null {
    if (!isSupabaseConfigured()) return null;

    const channel = supabase
      .channel(`contact_requests_${userId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'contact_requests',
          filter: `receiver_id=eq.${userId}`,
        },
        () => {
          onRequestChange();
        }
      )
      .subscribe();

    return channel;
  },

  // Unsubscribe helper
  unsubscribe(channel: RealtimeChannel | null) {
    if (channel) {
      supabase.removeChannel(channel);
    }
  },
};
