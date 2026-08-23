import { supabase, isSupabaseConfigured } from '../lib/supabase';
import { Conversation, Message, MessageType, UserProfile } from '../types';

export const chatService = {
  // Get all conversations for a user
  async getConversations(userId: string): Promise<Conversation[]> {
    if (!isSupabaseConfigured() || !userId) return [];

    try {
      // Step 1: Find conversation IDs user belongs to
      const { data: memberRows, error: memberErr } = await supabase
        .from('conversation_members')
        .select('conversation_id')
        .eq('user_id', userId);

      if (memberErr || !memberRows || memberRows.length === 0) {
        return [];
      }

      const convIds = memberRows.map((m) => m.conversation_id);

      // Step 2: Fetch conversations
      const { data: convData } = await supabase
        .from('conversations')
        .select('*')
        .in('id', convIds);

      if (!convData) return [];

      // Step 3: Fetch all members for these conversations
      const { data: allMembers } = await supabase
        .from('conversation_members')
        .select('*')
        .in('conversation_id', convIds);

      // Fetch profiles for all distinct members
      const allUserIds = Array.from(new Set((allMembers || []).map((m) => m.user_id)));
      const { data: profileList } = await supabase
        .from('profiles')
        .select('*')
        .in('user_id', allUserIds);

      const profileMap = new Map((profileList || []).map((p) => [p.user_id, p]));

      // Step 4: Fetch last message and unread count for each conversation
      const result: Conversation[] = await Promise.all(
        convData.map(async (conv) => {
          const convMembers = (allMembers || [])
            .filter((m) => m.conversation_id === conv.id)
            .map((m) => ({
              ...m,
              profile: profileMap.get(m.user_id),
            }));

          const otherMember = convMembers.find((m) => m.user_id !== userId);

          // Get latest message
          const { data: msgData } = await supabase
            .from('messages')
            .select('*')
            .eq('conversation_id', conv.id)
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle();

          // Check reads for unread count calculation
          const { data: reads } = await supabase
            .from('message_reads')
            .select('message_id')
            .eq('user_id', userId);

          const readSet = new Set((reads || []).map((r) => r.message_id));

          // Compute accurate unread
          const { data: unreadCandidates } = await supabase
            .from('messages')
            .select('id')
            .eq('conversation_id', conv.id)
            .neq('sender_id', userId);

          const actualUnread = (unreadCandidates || []).filter((m) => !readSet.has(m.id)).length;

          return {
            ...conv,
            members: convMembers,
            other_member: otherMember?.profile,
            last_message: msgData ? (msgData as Message) : null,
            unread_count: actualUnread,
          };
        })
      );

      // Sort by recent activity
      return result.sort((a, b) => {
        const timeA = a.last_message ? new Date(a.last_message.created_at).getTime() : new Date(a.created_at).getTime();
        const timeB = b.last_message ? new Date(b.last_message.created_at).getTime() : new Date(b.created_at).getTime();
        return timeB - timeA;
      });
    } catch (err) {
      return [];
    }
  },

  // Get existing or create new direct conversation between two users
  async getOrCreateDirectConversation(
    currentUserId: string,
    targetUserId: string
  ): Promise<{ conversation: Conversation | null; error: Error | null }> {
    if (!isSupabaseConfigured()) {
      return { conversation: null, error: new Error('Supabase not configured') };
    }

    try {
      // Step 1: Check if a direct conversation already exists between currentUserId and targetUserId
      const { data: myConvs } = await supabase
        .from('conversation_members')
        .select('conversation_id')
        .eq('user_id', currentUserId);

      if (myConvs && myConvs.length > 0) {
        const convIds = myConvs.map((c) => c.conversation_id);
        const { data: targetConvs } = await supabase
          .from('conversation_members')
          .select('conversation_id')
          .eq('user_id', targetUserId)
          .in('conversation_id', convIds);

        if (targetConvs && targetConvs.length > 0) {
          const directConvId = targetConvs[0].conversation_id;
          const { data: convData } = await supabase
            .from('conversations')
            .select('*')
            .eq('id', directConvId)
            .single();

          if (convData) {
            const { data: targetProf } = await supabase
              .from('profiles')
              .select('*')
              .eq('user_id', targetUserId)
              .single();

            const fullConv: Conversation = {
              ...convData,
              members: [],
              other_member: targetProf as UserProfile,
              unread_count: 0,
            };
            return { conversation: fullConv, error: null };
          }
        }
      }

      // Step 2: Create new conversation in Supabase
      const { data: newConvData, error: convError } = await supabase
        .from('conversations')
        .insert({ conversation_type: 'direct' })
        .select()
        .single();

      if (convError || !newConvData) {
        return { conversation: null, error: convError };
      }

      // Step 3: Add members to conversation
      await supabase.from('conversation_members').insert([
        { conversation_id: newConvData.id, user_id: currentUserId },
        { conversation_id: newConvData.id, user_id: targetUserId },
      ]);

      const { data: targetProfile } = await supabase
        .from('profiles')
        .select('*')
        .eq('user_id', targetUserId)
        .single();

      const created: Conversation = {
        ...newConvData,
        members: [],
        other_member: targetProfile as UserProfile,
        unread_count: 0,
      };

      return { conversation: created, error: null };
    } catch (err: any) {
      return { conversation: null, error: err };
    }
  },

  // Get messages for conversation
  async getMessages(conversationId: string, limit = 50): Promise<Message[]> {
    if (!isSupabaseConfigured() || !conversationId) return [];

    try {
      const { data, error } = await supabase
        .from('messages')
        .select('*')
        .eq('conversation_id', conversationId)
        .order('created_at', { ascending: true })
        .limit(limit);

      if (error || !data) return [];

      // Fetch sender profiles
      const senderIds = Array.from(new Set(data.map((m) => m.sender_id)));
      let profileMap = new Map();
      if (senderIds.length > 0) {
        const { data: profiles } = await supabase.from('profiles').select('*').in('user_id', senderIds);
        profileMap = new Map((profiles || []).map((p) => [p.user_id, p]));
      }

      return data.map((m) => ({
        ...m,
        sender_profile: profileMap.get(m.sender_id),
      })) as Message[];
    } catch (err) {
      return [];
    }
  },

  // Send message
  async sendMessage(params: {
    conversationId: string;
    senderId: string;
    content?: string;
    messageType?: MessageType;
    fileUrl?: string;
    fileName?: string;
    fileSize?: string;
    durationSeconds?: number;
    replyToMessageId?: string;
  }): Promise<{ message: Message | null; error: Error | null }> {
    if (!isSupabaseConfigured()) {
      return { message: null, error: new Error('Supabase not configured') };
    }

    try {
      const newMsg = {
        conversation_id: params.conversationId,
        sender_id: params.senderId,
        message_type: params.messageType || 'text',
        content: params.content || '',
        file_url: params.fileUrl || null,
        file_name: params.fileName || null,
        file_size: params.fileSize || null,
        duration_seconds: params.durationSeconds || null,
        reply_to_message_id: params.replyToMessageId || null,
        is_deleted: false,
      };

      const { data, error } = await supabase
        .from('messages')
        .insert(newMsg)
        .select()
        .single();

      if (error) return { message: null, error };

      // Update conversation updated_at
      await supabase
        .from('conversations')
        .update({ updated_at: new Date().toISOString() })
        .eq('id', params.conversationId);

      return { message: data as Message, error: null };
    } catch (err: any) {
      return { message: null, error: err };
    }
  },

  // Mark messages in conversation as read
  async markConversationAsRead(conversationId: string, userId: string): Promise<void> {
    if (!isSupabaseConfigured() || !conversationId || !userId) return;

    try {
      // Find unread messages not sent by me
      const { data: unreadMsgs } = await supabase
        .from('messages')
        .select('id')
        .eq('conversation_id', conversationId)
        .neq('sender_id', userId);

      if (!unreadMsgs || unreadMsgs.length === 0) return;

      const readsToInsert = unreadMsgs.map((m) => ({
        message_id: m.id,
        user_id: userId,
      }));

      await supabase.from('message_reads').upsert(readsToInsert, {
        onConflict: 'message_id,user_id',
      });
    } catch (err) {
      // Non-blocking
    }
  },

  // Delete message (soft delete)
  async deleteMessage(messageId: string, userId: string): Promise<{ error: Error | null }> {
    if (!isSupabaseConfigured()) {
      return { error: new Error('Supabase not configured') };
    }

    try {
      const { error } = await supabase
        .from('messages')
        .update({ is_deleted: true, content: 'This message was deleted' })
        .eq('id', messageId)
        .eq('sender_id', userId);

      return { error };
    } catch (err: any) {
      return { error: err };
    }
  },
};
