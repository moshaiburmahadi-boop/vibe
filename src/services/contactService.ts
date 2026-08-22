import { supabase, isSupabaseConfigured } from '../lib/supabase';
import { UserProfile, Contact, ContactRequest } from '../types';

const LOCAL_CONTACTS_KEY = 'vibe_local_contacts';
const LOCAL_REQUESTS_KEY = 'vibe_local_contact_requests';
const LOCAL_PROFILES_KEY = 'vibe_local_profiles';

export const contactService = {
  // Search user by phone number
  async searchUserByPhone(
    phoneNumber: string,
    currentUserId: string
  ): Promise<{ profile: UserProfile | null; relationship: 'self' | 'none' | 'contact' | 'request_sent' | 'request_received'; requestId?: string; error: Error | null }> {
    const cleanPhone = phoneNumber.trim();

    try {
      if (!isSupabaseConfigured()) {
        const profiles: UserProfile[] = JSON.parse(localStorage.getItem(LOCAL_PROFILES_KEY) || '[]');
        const found = profiles.find((p) => p.phone_number.includes(cleanPhone) || cleanPhone.includes(p.phone_number));

        if (!found) {
          return { profile: null, relationship: 'none', error: null };
        }

        if (found.user_id === currentUserId) {
          return { profile: found, relationship: 'self', error: null };
        }

        // Check contacts
        const contacts: Contact[] = JSON.parse(localStorage.getItem(LOCAL_CONTACTS_KEY) || '[]');
        const isContact = contacts.some(
          (c) => (c.user_id === currentUserId && c.contact_user_id === found.user_id) ||
                 (c.user_id === found.user_id && c.contact_user_id === currentUserId)
        );
        if (isContact) return { profile: found, relationship: 'contact', error: null };

        // Check requests
        const requests: ContactRequest[] = JSON.parse(localStorage.getItem(LOCAL_REQUESTS_KEY) || '[]');
        const sent = requests.find((r) => r.sender_id === currentUserId && r.receiver_id === found.user_id && r.status === 'pending');
        if (sent) return { profile: found, relationship: 'request_sent', requestId: sent.id, error: null };

        const received = requests.find((r) => r.sender_id === found.user_id && r.receiver_id === currentUserId && r.status === 'pending');
        if (received) return { profile: found, relationship: 'request_received', requestId: received.id, error: null };

        return { profile: found, relationship: 'none', error: null };
      }

      // Supabase query
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('phone_number', cleanPhone)
        .maybeSingle();

      if (error) {
        return { profile: null, relationship: 'none', error };
      }

      if (!data) {
        return { profile: null, relationship: 'none', error: null };
      }

      const targetProfile = data as UserProfile;

      if (targetProfile.user_id === currentUserId) {
        return { profile: targetProfile, relationship: 'self', error: null };
      }

      // Check if already in contacts
      const { data: contactData } = await supabase
        .from('contacts')
        .select('id')
        .eq('user_id', currentUserId)
        .eq('contact_user_id', targetProfile.user_id)
        .maybeSingle();

      if (contactData) {
        return { profile: targetProfile, relationship: 'contact', error: null };
      }

      // Check for pending requests
      const { data: sentReq } = await supabase
        .from('contact_requests')
        .select('id')
        .eq('sender_id', currentUserId)
        .eq('receiver_id', targetProfile.user_id)
        .eq('status', 'pending')
        .maybeSingle();

      if (sentReq) {
        return { profile: targetProfile, relationship: 'request_sent', requestId: sentReq.id, error: null };
      }

      const { data: recReq } = await supabase
        .from('contact_requests')
        .select('id')
        .eq('sender_id', targetProfile.user_id)
        .eq('receiver_id', currentUserId)
        .eq('status', 'pending')
        .maybeSingle();

      if (recReq) {
        return { profile: targetProfile, relationship: 'request_received', requestId: recReq.id, error: null };
      }

      return { profile: targetProfile, relationship: 'none', error: null };
    } catch (err: any) {
      return { profile: null, relationship: 'none', error: err };
    }
  },

  // Get user's contacts with their profiles
  async getContacts(userId: string): Promise<Contact[]> {
    try {
      if (!isSupabaseConfigured()) {
        const contacts: Contact[] = JSON.parse(localStorage.getItem(LOCAL_CONTACTS_KEY) || '[]');
        const userContacts = contacts.filter((c) => c.user_id === userId);
        const profiles: UserProfile[] = JSON.parse(localStorage.getItem(LOCAL_PROFILES_KEY) || '[]');

        return userContacts.map((c) => ({
          ...c,
          profile: profiles.find((p) => p.user_id === c.contact_user_id),
        }));
      }

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

  // Get received & sent contact requests
  async getContactRequests(userId: string): Promise<{ received: ContactRequest[]; sent: ContactRequest[] }> {
    try {
      if (!isSupabaseConfigured()) {
        const requests: ContactRequest[] = JSON.parse(localStorage.getItem(LOCAL_REQUESTS_KEY) || '[]');
        const profiles: UserProfile[] = JSON.parse(localStorage.getItem(LOCAL_PROFILES_KEY) || '[]');

        const received = requests
          .filter((r) => r.receiver_id === userId && r.status === 'pending')
          .map((r) => ({
            ...r,
            sender_profile: profiles.find((p) => p.user_id === r.sender_id),
          }));

        const sent = requests
          .filter((r) => r.sender_id === userId && r.status === 'pending')
          .map((r) => ({
            ...r,
            receiver_profile: profiles.find((p) => p.user_id === r.receiver_id),
          }));

        return { received, sent };
      }

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

  // Send contact request
  async sendContactRequest(senderId: string, receiverId: string): Promise<{ error: Error | null }> {
    try {
      if (senderId === receiverId) {
        return { error: new Error('You cannot add yourself as a contact') };
      }

      if (!isSupabaseConfigured()) {
        const requests: ContactRequest[] = JSON.parse(localStorage.getItem(LOCAL_REQUESTS_KEY) || '[]');
        const newReq: ContactRequest = {
          id: `req_${Date.now()}`,
          sender_id: senderId,
          receiver_id: receiverId,
          status: 'pending',
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        };
        requests.push(newReq);
        localStorage.setItem(LOCAL_REQUESTS_KEY, JSON.stringify(requests));
        return { error: null };
      }

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
    try {
      if (!isSupabaseConfigured()) {
        const requests: ContactRequest[] = JSON.parse(localStorage.getItem(LOCAL_REQUESTS_KEY) || '[]');
        const idx = requests.findIndex((r) => r.id === requestId);
        if (idx !== -1) {
          requests[idx].status = status;
          requests[idx].updated_at = new Date().toISOString();
          localStorage.setItem(LOCAL_REQUESTS_KEY, JSON.stringify(requests));
        }

        if (status === 'accepted') {
          const contacts: Contact[] = JSON.parse(localStorage.getItem(LOCAL_CONTACTS_KEY) || '[]');
          contacts.push(
            { id: `c_${Date.now()}_1`, user_id: receiverId, contact_user_id: senderId, created_at: new Date().toISOString() },
            { id: `c_${Date.now()}_2`, user_id: senderId, contact_user_id: receiverId, created_at: new Date().toISOString() }
          );
          localStorage.setItem(LOCAL_CONTACTS_KEY, JSON.stringify(contacts));
        }

        return { error: null };
      }

      const { error: updateErr } = await supabase
        .from('contact_requests')
        .update({ status, updated_at: new Date().toISOString() })
        .eq('id', requestId);

      if (updateErr) return { error: updateErr };

      if (status === 'accepted') {
        // Add mutual contact rows
        await supabase.from('contacts').upsert([
          { user_id: receiverId, contact_user_id: senderId },
          { user_id: senderId, contact_user_id: receiverId },
        ]);
      }

      return { error: null };
    } catch (err: any) {
      return { error: err };
    }
  },

  // Remove contact
  async removeContact(userId: string, contactUserId: string): Promise<{ error: Error | null }> {
    try {
      if (!isSupabaseConfigured()) {
        let contacts: Contact[] = JSON.parse(localStorage.getItem(LOCAL_CONTACTS_KEY) || '[]');
        contacts = contacts.filter(
          (c) => !(c.user_id === userId && c.contact_user_id === contactUserId) &&
                 !(c.user_id === contactUserId && c.contact_user_id === userId)
        );
        localStorage.setItem(LOCAL_CONTACTS_KEY, JSON.stringify(contacts));
        return { error: null };
      }

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
