import { createClient, SupabaseClient } from '@supabase/supabase-js';

// Retrieve credentials from environment or persistent localStorage configuration
const getInitialConfig = () => {
  const metaEnv = (import.meta as any).env || {};
  const envUrl = metaEnv.VITE_SUPABASE_URL || '';
  const envKey = metaEnv.VITE_SUPABASE_ANON_KEY || '';

  const localUrl = typeof window !== 'undefined' ? localStorage.getItem('vibe_supabase_url') || '' : '';
  const localKey = typeof window !== 'undefined' ? localStorage.getItem('vibe_supabase_anon_key') || '' : '';

  const url = localUrl || envUrl || 'https://demo-project.supabase.co';
  const key = localKey || envKey || 'demo-anon-key-placeholder';

  const isConfigured = Boolean(
    (localUrl && localKey) ||
    (envUrl && envKey && !envUrl.includes('your-project') && !key.includes('your-anon'))
  );

  return { url, key, isConfigured };
};

const initialConfig = getInitialConfig();

export let supabase: SupabaseClient = createClient(initialConfig.url, initialConfig.key, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
  realtime: {
    params: {
      eventsPerSecond: 20,
    },
  },
});

export const isSupabaseConfigured = (): boolean => {
  const cfg = getSupabaseConfig();
  return cfg.isConfigured;
};

export const getSupabaseConfig = () => {
  const metaEnv = (import.meta as any).env || {};
  const envUrl = metaEnv.VITE_SUPABASE_URL || '';
  const envKey = metaEnv.VITE_SUPABASE_ANON_KEY || '';
  const localUrl = typeof window !== 'undefined' ? localStorage.getItem('vibe_supabase_url') || '' : '';
  const localKey = typeof window !== 'undefined' ? localStorage.getItem('vibe_supabase_anon_key') || '' : '';

  const url = localUrl || envUrl;
  const key = localKey || envKey;
  const isConfigured = Boolean(
    url &&
    key &&
    !url.includes('demo-project') &&
    !key.includes('demo-anon') &&
    !url.includes('your-project') &&
    !key.includes('your-anon')
  );

  return { url, key, isConfigured };
};

export const setSupabaseConfig = (url: string, key: string) => {
  if (typeof window !== 'undefined') {
    localStorage.setItem('vibe_supabase_url', url.trim());
    localStorage.setItem('vibe_supabase_anon_key', key.trim());
  }

  supabase = createClient(url.trim(), key.trim(), {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
    },
    realtime: {
      params: {
        eventsPerSecond: 20,
      },
    },
  });

  return supabase;
};

export const clearSupabaseConfig = () => {
  if (typeof window !== 'undefined') {
    localStorage.removeItem('vibe_supabase_url');
    localStorage.removeItem('vibe_supabase_anon_key');
  }
};
