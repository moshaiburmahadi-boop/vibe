import { supabase, isSupabaseConfigured } from '../lib/supabase';
import { UserProfile, Contact, ContactRequest } from '../types';
import {
  normalizePhoneNumber,
  getPhoneSearchVariations,
  getPhoneDigits,
} from '../utils/phoneUtils';

export const contactService = {
  // Get all registered users from Supabase profiles (excluding current user)
  async getRegisteredUsers(currentUserId: string): Promise<UserProfile[]> {
    if (!isSupabaseConfigured() || !currentUserId) return [];

    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .neq('user_id', currentUserId);

      if (error || !data) {
        console.error('Error fetching registered users:', error);
        return [];
      }

      return data as UserProfile[];
    } catch (err) {
      console.error('Failed to get registered users:', err);
      return [];
    }
  },

  // Search user globally in Supabase profiles by phone number
  async searchUserByPhone(
    phoneNumber: string,
    currentUserId: string
  ): Promise<{
    profile: UserProfile | null;
    relationship: 'self' | 'none' | 'contact' | 'request_sent' | 'request_received';
    requestId?: string;
    error: Error | null;
  }> {
    const normalizedPhone = normalizePhoneNumber(phoneNumber);
    const searchVariations = getPhoneSearchVariations(phoneNumber);
    const searchDigits = getPhoneDigits(phoneNumber);

    if (!isSupabaseConfigured()) {
      return {
        profile: null,
        relationship: 'none',
        error: new Error('Supabase is not configured. Please configure your Supabase backend to enable global search.'),
      };
    }

    try {
      // 1. Primary lookup by exact normalized phone
      let matchedProfile: UserProfile | null = null;

      const { data: primaryData, error: primaryErr } = await supabase
        .from('profiles')
        .select('*')
        .eq('phone_number', normalizedPhone)
        .maybeSingle();

      if (primaryData) {
        matchedProfile = primaryData as UserProfile;
      } else if (searchVariations.length > 0) {
        // 2. Secondary lookup across phone format variations
        const { data: variationData } = await supabase
          .from('profiles')
          .select('*')
          .in('phone_number', searchVariations)
          .limit(1);

        if (variationData && variationData.length > 0) {
          matchedProfile = variationData[0] as UserProfile;
        }
      }

      // 3. Digits-based fallback match if no match found yet
      if (!matchedProfile && searchDigits.length >= 7) {
        const { data: fuzzyData } = await supabase
          .from('profiles')
          .select('*')
          .ilike('phone_number', `%${searchDigits}%`)
          .limit(1);

        if (fuzzyData && fuzzyData.length > 0) {
          matchedProfile = fuzzyData[0] as UserProfile;
        }
      }

      if (!matchedProfile) {
        return { profile: null, relationship: 'none', error: null };
      }

      if (matchedProfile.user_id === currentUserId) {
        return { profile: matchedProfile, relationship: 'self', error: null };
      }

      // Check if already in contacts
      const { data: contactData } = await supabase
        .from('contacts')
        .select('id')
        .or(`and(user_id.eq.${currentUserId},contact_user_id.eq.${matchedProfile.user_id}),and(user_id.eq.${matchedProfile.user_id},contact_user_id.eq.${currentUserId})`)
        .maybeSingle();

      if (contactData) {
        return { profile: matchedProfile, relationship: 'contact', error: null };
      }

      // Check for pending requests sent by me
      const { data: sentReq } = await supabase
        .from('contact_requests')
        .select('id')
        .eq('sender_id', currentUserId)
        .eq('receiver_id', matchedProfile.user_id)
        .eq('status', 'pending')
        .maybeSingle();

      if (sentReq) {
        return { profile: matchedProfile, relationship: 'request_sent', requestId: sentReq.id, error: null };
      }

      // Check for pending requests received by me
      const { data: recReq } = await supabase
        .from('contact_requests')
        .select('id')
        .eq('sender_id', matchedProfile.user_id)
        .eq('receiver_id', currentUserId)
        .eq('status', 'pending')
        .maybeSingle();

      if (recReq) {
        return { profile: matchedProfile, relationship: 'request_received', requestId: recReq.id, error: null };
      }

      return { profile: matchedProfile, relationship: 'none', error: null };
    } catch (err: any) {
      return { profile: null, relationship: 'none', error: err };
    }
  },

  // Get user's contacts with their profiles from Supabase
  async getContacts(userId: string): Promise<Contact[]> {
    if (!isSupabaseConfigured()) return [];

    try {
      const { data, error } = await supabase
        .from('contacts')
        .select(`
          id,
          user_id,
          contact_user_id,
          created_at
        `)
        .eq('user_id', userId);

      if (error || !data) return [];

      // Fetch corresponding profiles
      const contactUserIds = data.map((c) => c.contact_user_id);
      if (contactUserIds.length === 0) return [];

      const { data: profileList } = await supabase
        .from('profiles')
        .select('*')
        .in('user_id', contactUserIds);

      const profileMap = new Map((profileList || []).map((p) => [p.user_id, p]));

      return data.map((c) => ({
        ...c,
        profile: profileMap.get(c.contact_user_id),
      }));
    } catch (err) {
      return [];
    }
  },

  // Get received & sent contact requests from Supabase
  async getContactRequests(userId: string): Promise<{ received: ContactRequest[]; sent: ContactRequest[] }> {
    if (!isSupabaseConfigured()) return { received: [], sent: [] };

    try {
      const { data: receivedData } = await supabase
        .from('contact_requests')
        .select('*')
        .eq('receiver_id', userId)
        .eq('status', 'pending');

      const { data: sentData } = await supabase
        .from('contact_requests')
        .select('*')
        .eq('sender_id', userId)
        .eq('status', 'pending');

      const allUserIds = [
        ...(receivedData || []).map((r) => r.sender_id),
        ...(sentData || []).map((r) => r.receiver_id),
      ];

      let profileMap = new Map();
      if (allUserIds.length > 0) {
        const { data: profiles } = await supabase.from('profiles').select('*').in('user_id', allUserIds);
        profileMap = new Map((profiles || []).map((p) => [p.user_id, p]));
      }

      const received: ContactRequest[] = (receivedData || []).map((r) => ({
        ...r,
        sender_profile: profileMap.get(r.sender_id),
      }));

      const sent: ContactRequest[] = (sentData || []).map((r) => ({
        ...r,
        receiver_profile: profileMap.get(r.receiver_id),
      }));

      return { received, sent };
    } catch (err) {
      return { received: [], sent: [] };
    }
  },

  // Send contact request in Supabase
  async sendContactRequest(senderId: string, receiverId: string): Promise<{ error: Error | null }> {
    if (senderId === receiverId) {
      return { error: new Error('You cannot add yourself as a contact') };
    }

    if (!isSupabaseConfigured()) {
      return { error: new Error('Supabase is not configured') };
    }

    try {
      const { error } = await supabase.from('contact_requests').insert({
        sender_id: senderId,
        receiver_id: receiverId,
        status: 'pending',
      });

      return { error };
    } catch (err: any) {
      return { error: err };
    }
  },

  // Respond to request (accept / reject)
  async respondContactRequest(
    requestId: string,
    status: 'accepted' | 'rejected',
    senderId: string,
    receiverId: string
  ): Promise<{ error: Error | null }> {
    if (!isSupabaseConfigured()) {
      return { error: new Error('Supabase is not configured') };
    }

    try {
      const { error: updateErr } = await supabase
        .from('contact_requests')
        .update({ status, updated_at: new Date().toISOString() })
        .eq('id', requestId);

      if (updateErr) return { error: updateErr };

      if (status === 'accepted') {
        // Add mutual contact rows in Supabase contacts table
        await supabase.from('contacts').upsert([
          { user_id: receiverId, contact_user_id: senderId },
          { user_id: senderId, contact_user_id: receiverId },
        ], { onConflict: 'user_id,contact_user_id' });
      }

      return { error: null };
    } catch (err: any) {
      return { error: err };
    }
  },

  // Remove contact from Supabase
  async removeContact(userId: string, contactUserId: string): Promise<{ error: Error | null }> {
    if (!isSupabaseConfigured()) {
      return { error: new Error('Supabase is not configured') };
    }

    try {
      const { error } = await supabase
        .from('contacts')
        .delete()
        .or(`and(user_id.eq.${userId},contact_user_id.eq.${contactUserId}),and(user_id.eq.${contactUserId},contact_user_id.eq.${userId})`);

      return { error };
    } catch (err: any) {
      return { error: err };
    }
  },
};
