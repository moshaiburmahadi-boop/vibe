import { supabase, isSupabaseConfigured } from '../lib/supabase';
import { UserProfile } from '../types';
import {
  normalizePhoneNumber,
  getPhoneAuthEmail,
  getPhoneDigits,
} from '../utils/phoneUtils';

/**
 * Maps raw Supabase / network errors to friendly user-facing messages.
 */
function mapAuthError(err: any): Error {
  if (!err) return new Error('An unknown authentication error occurred.');

  const msg = (err.message || String(err)).toLowerCase();
  const code = (err.code || '').toLowerCase();
  const status = err.status;

  if (
    msg.includes('invalid login credentials') ||
    msg.includes('invalid_credentials') ||
    msg.includes('invalid grant') ||
    msg.includes('invalid username or password') ||
    code === 'invalid_credentials'
  ) {
    return new Error('Phone number or password is incorrect.');
  }

  if (
    msg.includes('user not found') ||
    msg.includes('user_not_found') ||
    msg.includes('no user') ||
    code === 'user_not_found'
  ) {
    return new Error('No account was found with this phone number. Please create an account.');
  }

  if (
    msg.includes('already registered') ||
    msg.includes('user already exists') ||
    msg.includes('identity already exists') ||
    code === 'user_already_exists'
  ) {
    return new Error('An account with this phone number already exists. Please sign in.');
  }

  if (
    msg.includes('email rate limit') ||
    msg.includes('over_email_send_rate_limit') ||
    code === 'over_email_send_rate_limit'
  ) {
    return new Error(
      'Supabase email confirmation rate limit reached. In your Supabase Dashboard > Authentication > Providers: disable "Confirm email" under Email provider or enable the Phone provider.'
    );
  }

  if (
    msg.includes('phone signups are disabled') ||
    msg.includes('phone_provider_disabled') ||
    code === 'phone_provider_disabled'
  ) {
    return new Error(
      'Phone authentication is disabled in Supabase. In Supabase Dashboard, go to Authentication > Providers and enable Phone, or disable "Confirm email" under Email.'
    );
  }

  if (
    msg.includes('email not confirmed') ||
    msg.includes('phone not confirmed') ||
    msg.includes('unconfirmed') ||
    code === 'email_not_confirmed'
  ) {
    return new Error('Account confirmation is required. In your Supabase Dashboard, please disable email/phone confirmation under Authentication > Providers.');
  }

  if (
    msg.includes('failed to fetch') ||
    msg.includes('networkerror') ||
    msg.includes('network error') ||
    msg.includes('connection refused')
  ) {
    return new Error('Unable to connect to Supabase. Please check your internet connection.');
  }

  if (msg.includes('rate limit') || msg.includes('over_request_rate_limit') || status === 429) {
    return new Error('Too many attempts. Please wait a moment and try again.');
  }

  if (msg.includes('password') && (msg.includes('short') || msg.includes('least 6') || msg.includes('weak'))) {
    return new Error('Password must be at least 6 characters.');
  }

  return new Error(err.message || 'Authentication failed. Please check your credentials.');
}

export const authService = {
  // Sign up with Phone + Password (Creates real Supabase Auth user in auth.users)
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

    if (!isSupabaseConfigured()) {
      return {
        user: null,
        profile: null,
        error: new Error('Supabase is not configured.'),
      };
    }

    try {
      let authUser: any = null;
      let authSession: any = null;
      let lastError: any = null;

      // 1. First Attempt: Native Supabase Phone Signup
      const { data: phoneSignUpData, error: phoneSignUpErr } = await supabase.auth.signUp({
        phone: normalizedPhone,
        password,
        options: {
          data: {
            full_name: fullName.trim(),
            phone_number: normalizedPhone,
            avatar_url: avatarUrl || '',
          },
        },
      });

      if (!phoneSignUpErr && phoneSignUpData?.user) {
        authUser = phoneSignUpData.user;
        authSession = phoneSignUpData.session;
      } else {
        lastError = phoneSignUpErr;

        // 2. Second Attempt: Shadow email registration (maps normalized phone to phone_<digits>@vibe.chat)
        const phoneEmail = getPhoneAuthEmail(normalizedPhone);
        const { data: emailSignUpData, error: emailSignUpErr } = await supabase.auth.signUp({
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

        if (!emailSignUpErr && emailSignUpData?.user) {
          authUser = emailSignUpData.user;
          authSession = emailSignUpData.session;
        } else {
          lastError = emailSignUpErr || phoneSignUpErr;
          console.error('Supabase Auth SignUp failed:', {
            code: lastError?.code,
            message: lastError?.message,
            status: lastError?.status,
          });

          // Check if user already exists
          const errorMsg = (lastError?.message || '').toLowerCase();
          if (
            errorMsg.includes('already registered') ||
            errorMsg.includes('user already exists') ||
            errorMsg.includes('identity already exists')
          ) {
            const signInRes = await this.signIn(normalizedPhone, password);
            if (signInRes.profile && !signInRes.error) {
              return signInRes;
            }
            return {
              user: null,
              profile: null,
              error: new Error('An account with this phone number already exists. Please sign in.'),
            };
          }

          return { user: null, profile: null, error: mapAuthError(lastError) };
        }
      }

      if (!authUser || !authUser.id) {
        return {
          user: null,
          profile: null,
          error: new Error('Failed to create user in Supabase Auth. Please verify your Supabase settings.'),
        };
      }

      // If signup did not automatically return a session, establish session immediately via signInWithPassword
      if (!authSession) {
        const phoneEmail = getPhoneAuthEmail(normalizedPhone);
        
        let loginAttempt = await supabase.auth.signInWithPassword({
          phone: normalizedPhone,
          password,
        });

        if (loginAttempt.error) {
          loginAttempt = await supabase.auth.signInWithPassword({
            email: phoneEmail,
            password,
          });
        }

        if (loginAttempt.data?.session) {
          authSession = loginAttempt.data.session;
          authUser = loginAttempt.data.user;
        }
      }

      const userId = authUser.id;

      // Construct user profile
      const newProfile: UserProfile = {
        id: userId,
        user_id: userId,
        full_name: fullName.trim(),
        phone_number: normalizedPhone,
        username:
          fullName.toLowerCase().replace(/\s+/g, '_') + '_' + Math.floor(100 + Math.random() * 900),
        avatar_url:
          avatarUrl ||
          `https://api.dicebear.com/7.x/avataaars/svg?seed=${encodeURIComponent(fullName.trim())}`,
        about: 'Hey there! I am using Vibe.',
        is_online: true,
        last_seen: new Date().toISOString(),
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      // Persist profile to Supabase public.profiles table using real authenticated user ID
      try {
        const { error: profileError } = await supabase
          .from('profiles')
          .upsert(newProfile, { onConflict: 'user_id' });

        if (profileError) {
          console.warn('Profile upsert notice:', profileError.message);
        }
      } catch (err) {
        console.warn('Profile database sync notice:', err);
      }

      // Cache profile locally for session resilience
      if (typeof window !== 'undefined') {
        try {
          localStorage.setItem('vibe_current_profile', JSON.stringify(newProfile));
        } catch (e) {
          // Ignore
        }
      }

      return { user: authUser, profile: newProfile, error: null };
    } catch (err: any) {
      console.error('Sign up unexpected error:', err);
      return { user: null, profile: null, error: mapAuthError(err) };
    }
  },

  // Sign in with Phone + Password (Authenticates against real Supabase Auth)
  async signIn(
    phoneNumber: string,
    password: string
  ): Promise<{ user: any; profile: UserProfile | null; error: Error | null }> {
    const normalizedPhone = normalizePhoneNumber(phoneNumber);

    if (!normalizedPhone || normalizedPhone.length < 5) {
      return { user: null, profile: null, error: new Error('Please enter a valid phone number.') };
    }

    if (!isSupabaseConfigured()) {
      return {
        user: null,
        profile: null,
        error: new Error('Supabase is not configured.'),
      };
    }

    try {
      // 1. Primary Attempt: Native Supabase Phone Sign In
      let signInResult = await supabase.auth.signInWithPassword({
        phone: normalizedPhone,
        password,
      });

      // 2. Second Attempt: Shadow email Sign In
      if (signInResult.error) {
        const phoneEmail = getPhoneAuthEmail(normalizedPhone);
        const emailAttempt = await supabase.auth.signInWithPassword({
          email: phoneEmail,
          password,
        });

        if (!emailAttempt.error && emailAttempt.data?.user) {
          signInResult = emailAttempt;
        }
      }

      // 3. Third Attempt: Raw digits variation
      if (signInResult.error) {
        const rawDigits = phoneNumber.replace(/\D/g, '');
        if (rawDigits && rawDigits !== getPhoneDigits(normalizedPhone)) {
          const rawEmail = `phone_${rawDigits}@vibe.chat`;
          const rawAttempt = await supabase.auth.signInWithPassword({
            email: rawEmail,
            password,
          });
          if (!rawAttempt.error && rawAttempt.data?.user) {
            signInResult = rawAttempt;
          }
        }
      }

      if (signInResult.error || !signInResult.data?.user) {
        console.warn('Supabase sign-in failed:', signInResult.error?.message);
        return {
          user: null,
          profile: null,
          error: mapAuthError(signInResult.error),
        };
      }

      const authUser = signInResult.data.user;
      const userId = authUser.id;

      // Retrieve user's profile using auth user ID from Supabase profiles table
      let profile = await this.getProfile(userId);

      // If profile record is missing in database, safely create and persist it using auth user metadata
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

      // Cache profile locally
      if (profile && typeof window !== 'undefined') {
        try {
          localStorage.setItem('vibe_current_profile', JSON.stringify(profile));
        } catch (e) {
          // Ignore
        }
      }

      return { user: authUser, profile, error: null };
    } catch (err: any) {
      console.error('Sign in unexpected error:', err);
      return { user: null, profile: null, error: mapAuthError(err) };
    }
  },

  // Get active session
  async getCurrentSession(): Promise<{ userId: string | null; profile: UserProfile | null }> {
    try {
      if (!isSupabaseConfigured()) {
        return { userId: null, profile: null };
      }

      // Check Supabase session first
      const { data, error } = await supabase.auth.getSession();
      if (!error && data.session?.user) {
        const user = data.session.user;
        const profile = await this.getProfile(user.id);
        if (profile) {
          if (typeof window !== 'undefined') {
            try {
              localStorage.setItem('vibe_current_profile', JSON.stringify(profile));
            } catch (e) {
              // Ignore
            }
          }
          return { userId: user.id, profile };
        }
      }

      // If no active session, clear any stale local profile and return null
      if (typeof window !== 'undefined') {
        localStorage.removeItem('vibe_current_profile');
      }

      return { userId: null, profile: null };
    } catch (e) {
      console.warn('Session check error:', e);
      return { userId: null, profile: null };
    }
  },

  // Get single profile by auth user ID from Supabase
  async getProfile(userId: string): Promise<UserProfile | null> {
    try {
      if (!isSupabaseConfigured()) {
        return null;
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

  // Update profile in Supabase
  async updateProfile(
    userId: string,
    updates: Partial<UserProfile>
  ): Promise<{ profile: UserProfile | null; error: Error | null }> {
    try {
      if (!isSupabaseConfigured()) {
        return { profile: null, error: new Error('Supabase not configured') };
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

  // Set online presence in Supabase
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

  // Sign out from Supabase
  async signOut(): Promise<void> {
    try {
      if (isSupabaseConfigured()) {
        await supabase.auth.signOut({ scope: 'local' });
      }
    } catch (err) {
      console.warn('Sign out notice:', err);
    } finally {
      // Clean up any lingering auth keys and cached user profile in localStorage / sessionStorage
      if (typeof window !== 'undefined') {
        try {
          localStorage.removeItem('vibe_current_profile');
          const keysToRemove: string[] = [];
          for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            if (
              key &&
              (key.startsWith('sb-') ||
                key.includes('auth-token') ||
                key.includes('supabase.auth.') ||
                key.startsWith('vibe_current_'))
            ) {
              keysToRemove.push(key);
            }
          }
          keysToRemove.forEach((k) => localStorage.removeItem(k));
          sessionStorage.clear();
        } catch (e) {
          // Ignore
        }
      }
    }
  },
};
