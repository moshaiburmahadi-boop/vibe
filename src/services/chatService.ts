import { supabase, isSupabaseConfigured } from '../lib/supabase';
import { Conversation, Message, MessageType, UserProfile } from '../types';

const LOCAL_CONVS_KEY = 'vibe_local_conversations';
const LOCAL_MSGS_KEY = 'vibe_local_messages';
const LOCAL_READS_KEY = 'vibe_local_reads';
const LOCAL_PROFILES_KEY = 'vibe_local_profiles';

export const chatService = {
  // Get all conversations for a user
  async getConversations(userId: string): Promise<Conversation[]> {
    try {
      if (!isSupabaseConfigured()) {
        const convs: Conversation[] = JSON.parse(localStorage.getItem(LOCAL_CONVS_KEY) || '[]');
        const msgs: Message[] = JSON.parse(localStorage.getItem(LOCAL_MSGS_KEY) || '[]');
        const reads: { messageId: string; userId: string }[] = JSON.parse(localStorage.getItem(LOCAL_READS_KEY) || '[]');
        const profiles: UserProfile[] = JSON.parse(localStorage.getItem(LOCAL_PROFILES_KEY) || '[]');

        // Filter convs where user is member
        const userConvs = convs.filter((c) => c.members.some((m) => m.user_id === userId));

        return userConvs.map((conv) => {
          // Other member
          const otherMember = conv.members.find((m) => m.user_id !== userId);
          const otherProfile = otherMember?.profile || profiles.find((p) => p.user_id === otherMember?.user_id);

          // Last message
          const convMsgs = msgs.filter((m) => m.conversation_id === conv.id);
          convMsgs.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
          const lastMessage = convMsgs[0] || null;

          // Unread count
          const unreadCount = convMsgs.filter(
            (m) => m.sender_id !== userId && !reads.some((r) => r.messageId === m.id && r.userId === userId)
          ).length;

          return {
            ...conv,
            other_member: otherProfile,
            last_message: lastMessage,
            unread_count: unreadCount,
          };
        }).sort((a, b) => {
          const timeA = a.last_message ? new Date(a.last_message.created_at).getTime() : new Date(a.created_at).getTime();
          const timeB = b.last_message ? new Date(b.last_message.created_at).getTime() : new Date(b.created_at).getTime();
          return timeB - timeA;
        });
      }

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

          // Get unread count
          const { count } = await supabase
            .from('messages')
            .select('id', { count: 'exact', head: true })
            .eq('conversation_id', conv.id)
            .neq('sender_id', userId)
            .is('is_deleted', false);

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
    try {
      if (!isSupabaseConfigured()) {
        const convs: Conversation[] = JSON.parse(localStorage.getItem(LOCAL_CONVS_KEY) || '[]');
        const profiles: UserProfile[] = JSON.parse(localStorage.getItem(LOCAL_PROFILES_KEY) || '[]');

        // Check if direct conversation exists
        let existing = convs.find(
          (c) =>
            c.conversation_type === 'direct' &&
            c.members.some((m) => m.user_id === currentUserId) &&
            c.members.some((m) => m.user_id === targetUserId)
        );

        if (existing) {
          const otherProfile = profiles.find((p) => p.user_id === targetUserId);
          return { conversation: { ...existing, other_member: otherProfile }, error: null };
        }

        const newId = `conv_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
        const myProfile = profiles.find((p) => p.user_id === currentUserId);
        const targetProfile = profiles.find((p) => p.user_id === targetUserId);

        const newConv: Conversation = {
          id: newId,
          conversation_type: 'direct',
          created_at: new Date().toISOString(),
          members: [
            { id: `mem_1_${Date.now()}`, conversation_id: newId, user_id: currentUserId, joined_at: new Date().toISOString(), profile: myProfile },
            { id: `mem_2_${Date.now()}`, conversation_id: newId, user_id: targetUserId, joined_at: new Date().toISOString(), profile: targetProfile },
          ],
          other_member: targetProfile,
          unread_count: 0,
        };

        convs.push(newConv);
        localStorage.setItem(LOCAL_CONVS_KEY, JSON.stringify(convs));
        return { conversation: newConv, error: null };
      }

      // Supabase lookup
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

      // Create new conversation
      const { data: newConvData, error: convError } = await supabase
        .from('conversations')
        .insert({ conversation_type: 'direct' })
        .select()
        .single();

      if (convError || !newConvData) {
        return { conversation: null, error: convError };
      }

      // Add members
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
    try {
      if (!isSupabaseConfigured()) {
        const msgs: Message[] = JSON.parse(localStorage.getItem(LOCAL_MSGS_KEY) || '[]');
        const convMsgs = msgs.filter((m) => m.conversation_id === conversationId);
        convMsgs.sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
        return convMsgs;
      }

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
        sender: profileMap.get(m.sender_id),
      }));
    } catch (err) {
      return [];
    }
  },

  // Send message
  async sendMessage(params: {
    conversationId: string;
    senderId: string;
    messageType: MessageType;
    content: string | null;
    fileUrl?: string | null;
    fileName?: string | null;
    fileSize?: string | null;
    durationSeconds?: number | null;
    replyToMessageId?: string | null;
  }): Promise<{ message: Message | null; error: Error | null }> {
    const {
      conversationId,
      senderId,
      messageType,
      content,
      fileUrl,
      fileName,
      fileSize,
      durationSeconds,
      replyToMessageId,
    } = params;

    try {
      if (!isSupabaseConfigured()) {
        const msgs: Message[] = JSON.parse(localStorage.getItem(LOCAL_MSGS_KEY) || '[]');
        const profiles: UserProfile[] = JSON.parse(localStorage.getItem(LOCAL_PROFILES_KEY) || '[]');

        const newMsg: Message = {
          id: `msg_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
          conversation_id: conversationId,
          sender_id: senderId,
          message_type: messageType,
          content,
          file_url: fileUrl || null,
          file_name: fileName || null,
          file_size: fileSize || null,
          duration_seconds: durationSeconds || null,
          reply_to_message_id: replyToMessageId || null,
          is_deleted: false,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          sender: profiles.find((p) => p.user_id === senderId),
          status: 'sent',
        };

        msgs.push(newMsg);
        localStorage.setItem(LOCAL_MSGS_KEY, JSON.stringify(msgs));
        return { message: newMsg, error: null };
      }

      const { data, error } = await supabase
        .from('messages')
        .insert({
          conversation_id: conversationId,
          sender_id: senderId,
          message_type: messageType,
          content,
          file_url: fileUrl || null,
          file_name: fileName || null,
          file_size: fileSize || null,
          duration_seconds: durationSeconds || null,
          reply_to_message_id: replyToMessageId || null,
          is_deleted: false,
        })
        .select()
        .single();

      if (error || !data) return { message: null, error };

      return { message: data as Message, error: null };
    } catch (err: any) {
      return { message: null, error: err };
    }
  },

  // Mark all messages in a conversation as read by a user
  async markConversationAsRead(conversationId: string, userId: string): Promise<void> {
    try {
      if (!isSupabaseConfigured()) {
        const msgs: Message[] = JSON.parse(localStorage.getItem(LOCAL_MSGS_KEY) || '[]');
        const reads: { messageId: string; userId: string }[] = JSON.parse(localStorage.getItem(LOCAL_READS_KEY) || '[]');

        const unreadMsgs = msgs.filter((m) => m.conversation_id === conversationId && m.sender_id !== userId);
        for (const msg of unreadMsgs) {
          if (!reads.some((r) => r.messageId === msg.id && r.userId === userId)) {
            reads.push({ messageId: msg.id, userId });
          }
        }
        localStorage.setItem(LOCAL_READS_KEY, JSON.stringify(reads));
        return;
      }

      // Fetch unread messages
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

      await supabase.from('message_reads').upsert(readsToInsert, { onConflict: 'message_id,user_id' });
    } catch (err) {
      // ignore
    }
  },

  // Soft delete a message
  async deleteMessage(messageId: string, userId: string): Promise<{ error: Error | null }> {
    try {
      if (!isSupabaseConfigured()) {
        const msgs: Message[] = JSON.parse(localStorage.getItem(LOCAL_MSGS_KEY) || '[]');
        const idx = msgs.findIndex((m) => m.id === messageId);
        if (idx !== -1 && msgs[idx].sender_id === userId) {
          msgs[idx].is_deleted = true;
          msgs[idx].content = 'This message was deleted';
          localStorage.setItem(LOCAL_MSGS_KEY, JSON.stringify(msgs));
        }
        return { error: null };
      }

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
