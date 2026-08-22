import { supabase, isSupabaseConfigured } from '../lib/supabase';
import { UserProfile } from '../types';

// Helper to format clean phone identifier for Supabase Auth
export const formatPhoneToEmail = (phone: string): string => {
  const cleanPhone = phone.replace(/[^0-9+]/g, '');
  const digitsOnly = cleanPhone.replace(/\+/g, '');
  return `phone_${digitsOnly}@vibe.chat`;
};

// Fallback local memory for seamless offline / demo mode if remote DB is provisioning
const LOCAL_SESSION_KEY = 'vibe_local_session';
const LOCAL_PROFILES_KEY = 'vibe_local_profiles';

export const authService = {
  // Sign up with Phone + Password
  async signUp(params: {
    fullName: string;
    phoneNumber: string;
    password: string;
    avatarUrl?: string;
  }): Promise<{ user: any; profile: UserProfile | null; error: Error | null }> {
    const { fullName, phoneNumber, password, avatarUrl } = params;
    const cleanPhone = phoneNumber.trim();

    try {
      if (!isSupabaseConfigured()) {
        // Local mode fallback
        const existingUsers = JSON.parse(localStorage.getItem(LOCAL_PROFILES_KEY) || '[]');
        const exists = existingUsers.find((p: UserProfile) => p.phone_number === cleanPhone);
        if (exists) {
          return { user: null, profile: null, error: new Error('Phone number is already registered') };
        }

        const newId = `user_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
        const newProfile: UserProfile = {
          id: newId,
          user_id: newId,
          full_name: fullName.trim(),
          phone_number: cleanPhone,
          username: fullName.toLowerCase().replace(/\s+/g, '_') + '_' + Math.floor(100 + Math.random() * 900),
          avatar_url: avatarUrl || `https://api.dicebear.com/7.x/avataaars/svg?seed=${encodeURIComponent(fullName)}`,
          about: 'Hey there! I am using Vibe.',
          is_online: true,
          last_seen: new Date().toISOString(),
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        };

        existingUsers.push(newProfile);
        localStorage.setItem(LOCAL_PROFILES_KEY, JSON.stringify(existingUsers));
        localStorage.setItem(LOCAL_SESSION_KEY, JSON.stringify({ userId: newId, profile: newProfile }));

        return { user: { id: newId }, profile: newProfile, error: null };
      }

      // Supabase Auth using shadow email mechanism for universal SMS-independent phone authentication
      const emailAuth = formatPhoneToEmail(cleanPhone);
      const { data: authData, error: authError } = await supabase.auth.signUp({
        email: emailAuth,
        password,
        options: {
          data: {
            full_name: fullName.trim(),
            phone_number: cleanPhone,
            avatar_url: avatarUrl || '',
          },
        },
      });

      if (authError) {
        return { user: null, profile: null, error: authError };
      }

      const userId = authData.user?.id;
      if (!userId) {
        return { user: null, profile: null, error: new Error('Failed to retrieve user ID upon registration') };
      }

      const newProfile: UserProfile = {
        id: userId,
        user_id: userId,
        full_name: fullName.trim(),
        phone_number: cleanPhone,
        username: fullName.toLowerCase().replace(/\s+/g, '_') + '_' + Math.floor(100 + Math.random() * 900),
        avatar_url: avatarUrl || `https://api.dicebear.com/7.x/avataaars/svg?seed=${encodeURIComponent(fullName)}`,
        about: 'Hey there! I am using Vibe.',
        is_online: true,
        last_seen: new Date().toISOString(),
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      // Insert or upsert into profiles table
      const { error: profileError } = await supabase
        .from('profiles')
        .upsert(newProfile, { onConflict: 'user_id' });

      if (profileError) {
        console.warn('Profiles table insert note:', profileError.message);
      }

      return { user: authData.user, profile: newProfile, error: null };
    } catch (err: any) {
      return { user: null, profile: null, error: err };
    }
  },

  // Sign in with Phone + Password
  async signIn(phoneNumber: string, password: string): Promise<{ user: any; profile: UserProfile | null; error: Error | null }> {
    const cleanPhone = phoneNumber.trim();

    try {
      if (!isSupabaseConfigured()) {
        const existingUsers = JSON.parse(localStorage.getItem(LOCAL_PROFILES_KEY) || '[]');
        const profile = existingUsers.find((p: UserProfile) => p.phone_number === cleanPhone);

        if (!profile) {
          return { user: null, profile: null, error: new Error('User with this phone number was not found.') };
        }

        localStorage.setItem(LOCAL_SESSION_KEY, JSON.stringify({ userId: profile.user_id, profile }));
        return { user: { id: profile.user_id }, profile, error: null };
      }

      const emailAuth = formatPhoneToEmail(cleanPhone);
      const { data, error } = await supabase.auth.signInWithPassword({
        email: emailAuth,
        password,
      });

      if (error) {
        return { user: null, profile: null, error };
      }

      const userId = data.user.id;
      // Fetch user profile
      const profile = await this.getProfile(userId);

      return { user: data.user, profile, error: null };
    } catch (err: any) {
      return { user: null, profile: null, error: err };
    }
  },

  // Get active session
  async getCurrentSession(): Promise<{ userId: string | null; profile: UserProfile | null }> {
    try {
      if (!isSupabaseConfigured()) {
        const raw = localStorage.getItem(LOCAL_SESSION_KEY);
        if (raw) {
          const parsed = JSON.parse(raw);
          return { userId: parsed.userId, profile: parsed.profile };
        }
        return { userId: null, profile: null };
      }

      const { data } = await supabase.auth.getSession();
      const user = data.session?.user;
      if (!user) return { userId: null, profile: null };

      const profile = await this.getProfile(user.id);
      return { userId: user.id, profile };
    } catch (e) {
      return { userId: null, profile: null };
    }
  },

  // Get single profile
  async getProfile(userId: string): Promise<UserProfile | null> {
    try {
      if (!isSupabaseConfigured()) {
        const existingUsers: UserProfile[] = JSON.parse(localStorage.getItem(LOCAL_PROFILES_KEY) || '[]');
        return existingUsers.find((p) => p.user_id === userId) || null;
      }

      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('user_id', userId)
        .single();

      if (error || !data) {
        // Try fallback to auth metadata
        const { data: userData } = await supabase.auth.getUser();
        if (userData?.user && userData.user.id === userId) {
          const meta = userData.user.user_metadata || {};
          return {
            id: userId,
            user_id: userId,
            full_name: meta.full_name || 'Vibe User',
            phone_number: meta.phone_number || '',
            avatar_url: meta.avatar_url || '',
            about: 'Hey there! I am using Vibe.',
            is_online: true,
          };
        }
        return null;
      }

      return data as UserProfile;
    } catch (err) {
      return null;
    }
  },

  // Update profile
  async updateProfile(userId: string, updates: Partial<UserProfile>): Promise<{ profile: UserProfile | null; error: Error | null }> {
    try {
      if (!isSupabaseConfigured()) {
        const existingUsers: UserProfile[] = JSON.parse(localStorage.getItem(LOCAL_PROFILES_KEY) || '[]');
        const idx = existingUsers.findIndex((p) => p.user_id === userId);
        if (idx !== -1) {
          existingUsers[idx] = { ...existingUsers[idx], ...updates, updated_at: new Date().toISOString() };
          localStorage.setItem(LOCAL_PROFILES_KEY, JSON.stringify(existingUsers));
          localStorage.setItem(LOCAL_SESSION_KEY, JSON.stringify({ userId, profile: existingUsers[idx] }));
          return { profile: existingUsers[idx], error: null };
        }
        return { profile: null, error: new Error('User not found') };
      }

      const { data, error } = await supabase
        .from('profiles')
        .update({ ...updates, updated_at: new Date().toISOString() })
        .eq('user_id', userId)
        .select()
        .single();

      if (error) return { profile: null, error };
      return { profile: data as UserProfile, error: null };
    } catch (err: any) {
      return { profile: null, error: err };
    }
  },

  // Set online presence
  async setPresence(userId: string, isOnline: boolean): Promise<void> {
    try {
      if (!isSupabaseConfigured()) return;
      await supabase
        .from('profiles')
        .update({
          is_online: isOnline,
          last_seen: new Date().toISOString(),
        })
        .eq('user_id', userId);
    } catch (err) {
      // Non-blocking
    }
  },

  // Sign out
  async signOut(): Promise<void> {
    try {
      localStorage.removeItem(LOCAL_SESSION_KEY);
      if (isSupabaseConfigured()) {
        await supabase.auth.signOut();
      }
    } catch (err) {
      // clear anyway
    }
  },
};
