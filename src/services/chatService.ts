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
    if (!isSupabaseConfigured() || !currentUserId || !targetUserId) {
      return { conversation: null, error: new Error('Supabase not configured or missing user ID') };
    }

    try {
      // Option 1: Try database RPC if deployed
      try {
        const { data: rpcRes, error: rpcErr } = await supabase.rpc('get_or_create_direct_chat', {
          p_current_user_id: currentUserId,
          p_target_user_id: targetUserId,
        });

        if (!rpcErr && rpcRes && rpcRes.conversation_id) {
          const directConvId = rpcRes.conversation_id;
          const { data: convData } = await supabase
            .from('conversations')
            .select('*')
            .eq('id', directConvId)
            .maybeSingle();

          const { data: targetProf } = await supabase
            .from('profiles')
            .select('*')
            .eq('user_id', targetUserId)
            .maybeSingle();

          const { data: msgData } = await supabase
            .from('messages')
            .select('*')
            .eq('conversation_id', directConvId)
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle();

          const fullConv: Conversation = {
            ...(convData || {
              id: directConvId,
              conversation_type: 'direct',
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
            }),
            members: [],
            other_member: targetProf as UserProfile,
            last_message: msgData ? (msgData as Message) : null,
            unread_count: 0,
          };

          return { conversation: fullConv, error: null };
        }
      } catch (e) {
        // Fallback to table queries below
      }

      // Option 2: Table queries
      // Step 1: Check if a direct conversation already exists between currentUserId and targetUserId
      const { data: myConvs } = await supabase
        .from('conversation_members')
        .select('conversation_id')
        .eq('user_id', currentUserId);

      let directConvId: string | null = null;

      if (myConvs && myConvs.length > 0) {
        const myConvIds = myConvs.map((c) => c.conversation_id);
        const { data: targetConvs } = await supabase
          .from('conversation_members')
          .select('conversation_id')
          .eq('user_id', targetUserId)
          .in('conversation_id', myConvIds);

        if (targetConvs && targetConvs.length > 0) {
          // Verify direct conversation
          const { data: directMatch } = await supabase
            .from('conversations')
            .select('id')
            .in('id', targetConvs.map((t) => t.conversation_id))
            .eq('conversation_type', 'direct')
            .limit(1)
            .maybeSingle();

          if (directMatch) {
            directConvId = directMatch.id;
          } else {
            directConvId = targetConvs[0].conversation_id;
          }
        }
      }

      // Case B: If current user removed it earlier, check target user's active direct conversations
      if (!directConvId) {
        const { data: targetMemberRows } = await supabase
          .from('conversation_members')
          .select('conversation_id')
          .eq('user_id', targetUserId);

        if (targetMemberRows && targetMemberRows.length > 0) {
          const tConvIds = targetMemberRows.map((r) => r.conversation_id);
          const { data: directConvs } = await supabase
            .from('conversations')
            .select('id')
            .in('id', tConvIds)
            .eq('conversation_type', 'direct');

          if (directConvs && directConvs.length > 0) {
            for (const dConv of directConvs) {
              const { data: msgSample } = await supabase
                .from('messages')
                .select('id')
                .eq('conversation_id', dConv.id)
                .or(`sender_id.eq.${currentUserId},sender_id.eq.${targetUserId}`)
                .limit(1);

              if (msgSample && msgSample.length > 0) {
                directConvId = dConv.id;
                break;
              }
            }
            if (!directConvId && directConvs.length === 1) {
              directConvId = directConvs[0].id;
            }
          }
        }
      }

      if (directConvId) {
        // Ensure current user is in conversation_members
        const { data: existingMyMember } = await supabase
          .from('conversation_members')
          .select('id')
          .eq('conversation_id', directConvId)
          .eq('user_id', currentUserId)
          .maybeSingle();

        if (!existingMyMember) {
          await supabase.from('conversation_members').insert({
            conversation_id: directConvId,
            user_id: currentUserId,
          });
        }

        // Ensure target user is in conversation_members
        const { data: existingTargetMember } = await supabase
          .from('conversation_members')
          .select('id')
          .eq('conversation_id', directConvId)
          .eq('user_id', targetUserId)
          .maybeSingle();

        if (!existingTargetMember) {
          await supabase.from('conversation_members').insert({
            conversation_id: directConvId,
            user_id: targetUserId,
          });
        }

        const { data: convData } = await supabase
          .from('conversations')
          .select('*')
          .eq('id', directConvId)
          .maybeSingle();

        const { data: targetProf } = await supabase
          .from('profiles')
          .select('*')
          .eq('user_id', targetUserId)
          .maybeSingle();

        // Get last message if any
        const { data: msgData } = await supabase
          .from('messages')
          .select('*')
          .eq('conversation_id', directConvId)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();

        const fullConv: Conversation = {
          ...(convData || {
            id: directConvId,
            conversation_type: 'direct',
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          }),
          members: [],
          other_member: targetProf as UserProfile,
          last_message: msgData ? (msgData as Message) : null,
          unread_count: 0,
        };
        return { conversation: fullConv, error: null };
      }

      // Step 2: Create brand new conversation in Supabase
      const { data: newConvData, error: convError } = await supabase
        .from('conversations')
        .insert({ conversation_type: 'direct' })
        .select()
        .single();

      if (convError || !newConvData) {
        return { conversation: null, error: convError };
      }

      // Step 3: Add both members to conversation
      await supabase.from('conversation_members').insert([
        { conversation_id: newConvData.id, user_id: currentUserId },
        { conversation_id: newConvData.id, user_id: targetUserId },
      ]);

      const { data: targetProfile } = await supabase
        .from('profiles')
        .select('*')
        .eq('user_id', targetUserId)
        .maybeSingle();

      const created: Conversation = {
        ...newConvData,
        members: [],
        other_member: targetProfile as UserProfile,
        last_message: null,
        unread_count: 0,
      };

      return { conversation: created, error: null };
    } catch (err: any) {
      return { conversation: null, error: err };
    }
  },

  // Remove direct chat for current user (hides from current user's chats while preserving conversation & partner's chat)
  async removeDirectChat(
    currentUserId: string,
    targetUserId: string
  ): Promise<{ error: Error | null }> {
    if (!isSupabaseConfigured() || !currentUserId || !targetUserId) {
      return { error: new Error('Missing user ID') };
    }

    try {
      // Option 1: Try database RPC if available
      try {
        const { error: rpcErr } = await supabase.rpc('remove_direct_chat', {
          p_current_user_id: currentUserId,
          p_target_user_id: targetUserId,
        });
        if (!rpcErr) {
          return { error: null };
        }
      } catch (e) {
        // Fallback to table queries below
      }

      // Option 2: Table delete on conversation_members
      const { data: myMemberships } = await supabase
        .from('conversation_members')
        .select('conversation_id')
        .eq('user_id', currentUserId);

      if (!myMemberships || myMemberships.length === 0) {
        return { error: null };
      }

      const myConvIds = myMemberships.map((m) => m.conversation_id);

      const { data: targetMemberships } = await supabase
        .from('conversation_members')
        .select('conversation_id')
        .eq('user_id', targetUserId)
        .in('conversation_id', myConvIds);

      const matchedConvIds = (targetMemberships || []).map((t) => t.conversation_id);

      if (matchedConvIds.length > 0) {
        const { error } = await supabase
          .from('conversation_members')
          .delete()
          .eq('user_id', currentUserId)
          .in('conversation_id', matchedConvIds);

        return { error: error || null };
      }

      // If no intersection in active memberships, delete current user's membership for direct conversations
      const { data: directConvs } = await supabase
        .from('conversations')
        .select('id')
        .in('id', myConvIds)
        .eq('conversation_type', 'direct');

      if (directConvs && directConvs.length > 0) {
        const { error } = await supabase
          .from('conversation_members')
          .delete()
          .eq('user_id', currentUserId)
          .in('conversation_id', directConvs.map((c) => c.id));

        return { error: error || null };
      }

      return { error: null };
    } catch (err: any) {
      return { error: err };
    }
  },

  // Delete / Remove conversation for user (removes from user's chat list while keeping global conversation & data safe)
  async deleteConversationForUser(
    conversationId: string,
    userId: string
  ): Promise<{ error: Error | null }> {
    if (!isSupabaseConfigured() || !conversationId || !userId) {
      return { error: new Error('Missing conversation ID or user ID') };
    }

    try {
      const { error } = await supabase
        .from('conversation_members')
        .delete()
        .eq('conversation_id', conversationId)
        .eq('user_id', userId);

      return { error };
    } catch (err: any) {
      return { error: err };
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
