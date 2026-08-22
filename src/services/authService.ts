import { supabase, isSupabaseConfigured } from '../lib/supabase';
import { UserProfile } from '../types';
import {
  normalizePhoneNumber,
  getPhoneAuthEmail,
  getPhoneDigits,
} from '../utils/phoneUtils';

const LOCAL_SESSION_KEY = 'vibe_local_session';
const LOCAL_PROFILES_KEY = 'vibe_local_profiles';

/**
 * Maps raw Supabase / network errors to friendly user-facing messages.
 */
function mapAuthError(err: any): Error {
  if (!err) return new Error('An unknown authentication error occurred.');

  const msg = (err.message || String(err)).toLowerCase();
  const status = err.status || err.code;

  if (
    msg.includes('invalid login credentials') ||
    msg.includes('invalid_credentials') ||
    msg.includes('invalid grant') ||
    msg.includes('invalid username or password')
  ) {
    return new Error('Phone number or password is incorrect.');
  }

  if (
    msg.includes('user not found') ||
    msg.includes('user_not_found') ||
    msg.includes('no user')
  ) {
    return new Error('No account was found with this phone number.');
  }

  if (
    msg.includes('already registered') ||
    msg.includes('user already exists') ||
    msg.includes('identity already exists')
  ) {
    return new Error('An account with this phone number already exists. Please sign in.');
  }

  if (
    msg.includes('email not confirmed') ||
    msg.includes('phone not confirmed') ||
    msg.includes('unconfirmed')
  ) {
    return new Error('Account confirmation pending. Please check Supabase project settings to disable email/phone confirmation.');
  }

  if (
    msg.includes('failed to fetch') ||
    msg.includes('networkerror') ||
    msg.includes('network error') ||
    msg.includes('connection refused')
  ) {
    return new Error('Unable to connect. Please check your internet connection.');
  }

  if (msg.includes('rate limit') || msg.includes('over_request_rate_limit') || status === 429) {
    return new Error('Too many attempts. Please wait a moment and try again.');
  }

  if (msg.includes('session') || msg.includes('token')) {
    return new Error('Your session could not be created. Please try again.');
  }

  return new Error(err.message || 'Authentication failed. Please check your credentials.');
}

export const authService = {
  // Sign up with Phone + Password
  async signUp(params: {
    fullName: string;
    phoneNumber: string;
    password: string;
    avatarUrl?: string;
  }): Promise<{ user: any; profile: UserProfile | null; error: Error | null }> {
    const { fullName, phoneNumber, password, avatarUrl } = params;
    const normalizedPhone = normalizePhoneNumber(phoneNumber);

    if (!normalizedPhone || normalizedPhone.length < 5) {
      return { user: null, profile: null, error: new Error('Please enter a valid phone number.') };
    }

    try {
      if (!isSupabaseConfigured()) {
        // Local mode fallback
        const existingUsers: UserProfile[] = JSON.parse(localStorage.getItem(LOCAL_PROFILES_KEY) || '[]');
        const exists = existingUsers.find(
          (p) => normalizePhoneNumber(p.phone_number) === normalizedPhone
        );
        if (exists) {
          return {
            user: null,
            profile: null,
            error: new Error('An account with this phone number already exists. Please sign in.'),
          };
        }

        const newId = `user_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
        const newProfile: UserProfile = {
          id: newId,
          user_id: newId,
          full_name: fullName.trim(),
          phone_number: normalizedPhone,
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

      // Supabase Auth Registration
      const phoneEmail = getPhoneAuthEmail(normalizedPhone);

      // Attempt signup with shadow email (which handles phone auth without SMS provider dependency)
      let authUser: any = null;
      let authSession: any = null;

      const { data: signUpData, error: signUpError } = await supabase.auth.signUp({
        email: phoneEmail,
        password,
        options: {
          data: {
            full_name: fullName.trim(),
            phone_number: normalizedPhone,
            avatar_url: avatarUrl || '',
          },
        },
      });

      if (signUpError) {
        return { user: null, profile: null, error: mapAuthError(signUpError) };
      }

      authUser = signUpData.user;
      authSession = signUpData.session;

      if (!authUser || !authUser.id) {
        return { user: null, profile: null, error: new Error('Failed to create account. Please try again.') };
      }

      // If signup did not automatically establish a session, immediately log in to create the active session
      if (!authSession) {
        const { data: signInData, error: signInErr } = await supabase.auth.signInWithPassword({
          email: phoneEmail,
          password,
        });

        if (!signInErr && signInData.session) {
          authSession = signInData.session;
          authUser = signInData.user;
        }
      }

      const userId = authUser.id;

      // Construct and upsert user profile record (profiles.user_id = auth.users.id)
      const newProfile: UserProfile = {
        id: userId,
        user_id: userId,
        full_name: fullName.trim(),
        phone_number: normalizedPhone,
        username: fullName.toLowerCase().replace(/\s+/g, '_') + '_' + Math.floor(100 + Math.random() * 900),
        avatar_url: avatarUrl || `https://api.dicebear.com/7.x/avataaars/svg?seed=${encodeURIComponent(fullName)}`,
        about: 'Hey there! I am using Vibe.',
        is_online: true,
        last_seen: new Date().toISOString(),
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      const { error: profileError } = await supabase
        .from('profiles')
        .upsert(newProfile, { onConflict: 'user_id' });

      if (profileError) {
        console.warn('Profile upsert notice:', profileError.message);
      }

      return { user: authUser, profile: newProfile, error: null };
    } catch (err: any) {
      return { user: null, profile: null, error: mapAuthError(err) };
    }
  },

  // Sign in with Phone + Password
  async signIn(
    phoneNumber: string,
    password: string
  ): Promise<{ user: any; profile: UserProfile | null; error: Error | null }> {
    const normalizedPhone = normalizePhoneNumber(phoneNumber);

    if (!normalizedPhone || normalizedPhone.length < 5) {
      return { user: null, profile: null, error: new Error('Please enter a valid phone number.') };
    }

    try {
      if (!isSupabaseConfigured()) {
        // Local mode
        const existingUsers: UserProfile[] = JSON.parse(localStorage.getItem(LOCAL_PROFILES_KEY) || '[]');
        const profile = existingUsers.find(
          (p) =>
            normalizePhoneNumber(p.phone_number) === normalizedPhone ||
            getPhoneDigits(p.phone_number) === getPhoneDigits(normalizedPhone)
        );

        if (!profile) {
          return { user: null, profile: null, error: new Error('No account was found with this phone number.') };
        }

        localStorage.setItem(LOCAL_SESSION_KEY, JSON.stringify({ userId: profile.user_id, profile }));
        return { user: { id: profile.user_id }, profile, error: null };
      }

      const phoneEmail = getPhoneAuthEmail(normalizedPhone);

      // Primary login attempt with standard phone-mapped shadow email
      let signInResult = await supabase.auth.signInWithPassword({
        email: phoneEmail,
        password,
      });

      // Fallback 1: If raw digits variation was used (e.g. without country code)
      if (signInResult.error) {
        const rawDigits = phoneNumber.replace(/\D/g, '');
        if (rawDigits && rawDigits !== getPhoneDigits(normalizedPhone)) {
          const rawEmail = `phone_${rawDigits}@vibe.chat`;
          const rawAttempt = await supabase.auth.signInWithPassword({
            email: rawEmail,
            password,
          });
          if (!rawAttempt.error && rawAttempt.data.user) {
            signInResult = rawAttempt;
          }
        }
      }

      // Fallback 2: Native Supabase phone provider (if enabled in project)
      if (signInResult.error) {
        const phoneAttempt = await supabase.auth.signInWithPassword({
          phone: normalizedPhone,
          password,
        });
        if (!phoneAttempt.error && phoneAttempt.data.user) {
          signInResult = phoneAttempt;
        }
      }

      if (signInResult.error || !signInResult.data?.user) {
        return {
          user: null,
          profile: null,
          error: mapAuthError(signInResult.error),
        };
      }

      const authUser = signInResult.data.user;
      const userId = authUser.id;

      // Retrieve user's profile using auth user ID
      let profile = await this.getProfile(userId);

      // If profile record is missing in database, safely create and persist it using auth metadata
      if (!profile) {
        const meta = authUser.user_metadata || {};
        const fallbackProfile: UserProfile = {
          id: userId,
          user_id: userId,
          full_name: meta.full_name || 'Vibe User',
          phone_number: meta.phone_number || normalizedPhone,
          username:
            (meta.full_name || 'user').toLowerCase().replace(/\s+/g, '_') +
            '_' +
            Math.floor(100 + Math.random() * 900),
          avatar_url:
            meta.avatar_url ||
            `https://api.dicebear.com/7.x/avataaars/svg?seed=${encodeURIComponent(
              meta.full_name || 'User'
            )}`,
          about: 'Hey there! I am using Vibe.',
          is_online: true,
          last_seen: new Date().toISOString(),
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        };

        const { error: insertErr } = await supabase
          .from('profiles')
          .upsert(fallbackProfile, { onConflict: 'user_id' });

        if (insertErr) {
          console.warn('Fallback profile upsert notice:', insertErr.message);
        }

        profile = fallbackProfile;
      }

      return { user: authUser, profile, error: null };
    } catch (err: any) {
      return { user: null, profile: null, error: mapAuthError(err) };
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

      const { data, error } = await supabase.auth.getSession();
      if (error || !data.session?.user) {
        return { userId: null, profile: null };
      }

      const user = data.session.user;
      const profile = await this.getProfile(user.id);

      return { userId: user.id, profile };
    } catch (e) {
      return { userId: null, profile: null };
    }
  },

  // Get single profile by auth user ID
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
        .maybeSingle();

      if (error || !data) {
        // Fallback to auth metadata if profile query returns empty
        const { data: userData } = await supabase.auth.getUser();
        if (userData?.user && userData.user.id === userId) {
          const meta = userData.user.user_metadata || {};
          const fallback: UserProfile = {
            id: userId,
            user_id: userId,
            full_name: meta.full_name || 'Vibe User',
            phone_number: meta.phone_number || '',
            avatar_url: meta.avatar_url || '',
            about: 'Hey there! I am using Vibe.',
            is_online: true,
            last_seen: new Date().toISOString(),
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          };

          // Save fallback so subsequent queries succeed
          await supabase.from('profiles').upsert(fallback, { onConflict: 'user_id' });
          return fallback;
        }
        return null;
      }

      return data as UserProfile;
    } catch (err) {
      return null;
    }
  },

  // Update profile
  async updateProfile(
    userId: string,
    updates: Partial<UserProfile>
  ): Promise<{ profile: UserProfile | null; error: Error | null }> {
    try {
      if (!isSupabaseConfigured()) {
        const existingUsers: UserProfile[] = JSON.parse(localStorage.getItem(LOCAL_PROFILES_KEY) || '[]');
        const idx = existingUsers.findIndex((p) => p.user_id === userId);
        if (idx !== -1) {
          existingUsers[idx] = {
            ...existingUsers[idx],
            ...updates,
            updated_at: new Date().toISOString(),
          };
          localStorage.setItem(LOCAL_PROFILES_KEY, JSON.stringify(existingUsers));
          localStorage.setItem(
            LOCAL_SESSION_KEY,
            JSON.stringify({ userId, profile: existingUsers[idx] })
          );
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
      // Clean up regardless
    }
  },
};
