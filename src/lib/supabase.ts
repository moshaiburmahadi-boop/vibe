import { createClient, SupabaseClient } from '@supabase/supabase-js';

export const DEFAULT_SUPABASE_URL = 'https://tsxaudwxsuzebbvjdman.supabase.co';
export const DEFAULT_SUPABASE_ANON_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRzeGF1ZHd4c3V6ZWJidmpkbWFuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODc0MjE2NTksImV4cCI6MjEwMjk5NzY1OX0.-W0lx_ayV1ARWHK6iXOFwrY5wbqQIsCmQ3S5lE0mzCQ';

// Retrieve credentials from environment or persistent localStorage configuration, with fixed project default fallback
const getInitialConfig = () => {
  const metaEnv = (import.meta as any).env || {};
  const envUrl = metaEnv.VITE_SUPABASE_URL || '';
  const envKey = metaEnv.VITE_SUPABASE_ANON_KEY || '';

  const localUrl = typeof window !== 'undefined' ? localStorage.getItem('vibe_supabase_url') || '' : '';
  const localKey = typeof window !== 'undefined' ? localStorage.getItem('vibe_supabase_anon_key') || '' : '';

  const isInvalidUrl = (u: string) => !u || u.includes('your-project') || u.includes('mkeyppmjkrmpbxwmioyi') || u.includes('demo-project');
  const isInvalidKey = (k: string) => !k || k.includes('your-anon') || k.includes('demo-anon');

  const url = (!isInvalidUrl(localUrl) ? localUrl : '') || (!isInvalidUrl(envUrl) ? envUrl : '') || DEFAULT_SUPABASE_URL;
  const key = (!isInvalidKey(localKey) ? localKey : '') || (!isInvalidKey(envKey) ? envKey : '') || DEFAULT_SUPABASE_ANON_KEY;

  const isConfigured = Boolean(url && key && !isInvalidUrl(url) && !isInvalidKey(key));

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

  const isInvalidUrl = (u: string) => !u || u.includes('your-project') || u.includes('mkeyppmjkrmpbxwmioyi') || u.includes('demo-project');
  const isInvalidKey = (k: string) => !k || k.includes('your-anon') || k.includes('demo-anon');

  const url = (!isInvalidUrl(localUrl) ? localUrl : '') || (!isInvalidUrl(envUrl) ? envUrl : '') || DEFAULT_SUPABASE_URL;
  const key = (!isInvalidKey(localKey) ? localKey : '') || (!isInvalidKey(envKey) ? envKey : '') || DEFAULT_SUPABASE_ANON_KEY;

  const isConfigured = Boolean(url && key && !isInvalidUrl(url) && !isInvalidKey(key));

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
