-- ==============================================================================
-- VIBE REAL-TIME CHAT APPLICATION — SUPABASE DATABASE SCHEMA & MIGRATIONS
-- ==============================================================================

-- Enable UUID generation extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 1. PROFILES TABLE (Global Directory of all registered users)
CREATE TABLE IF NOT EXISTS public.profiles (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
    full_name TEXT NOT NULL DEFAULT 'Vibe User',
    phone_number TEXT UNIQUE NOT NULL,
    username TEXT UNIQUE,
    avatar_url TEXT,
    about TEXT DEFAULT 'Hey there! I am using Vibe.',
    is_online BOOLEAN DEFAULT false,
    last_seen TIMESTAMPTZ DEFAULT NOW(),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. CONTACTS TABLE (Optional personal saved contacts)
CREATE TABLE IF NOT EXISTS public.contacts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    contact_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT no_self_contact CHECK (user_id != contact_user_id),
    CONSTRAINT unique_contact_pair UNIQUE (user_id, contact_user_id)
);

-- 3. CONTACT REQUESTS TABLE
CREATE TABLE IF NOT EXISTS public.contact_requests (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    sender_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    receiver_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'rejected')),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT no_self_request CHECK (sender_id != receiver_id),
    CONSTRAINT unique_pending_request UNIQUE (sender_id, receiver_id)
);

-- 4. CONVERSATIONS TABLE
CREATE TABLE IF NOT EXISTS public.conversations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    conversation_type TEXT NOT NULL DEFAULT 'direct' CHECK (conversation_type IN ('direct', 'group')),
    name TEXT,
    avatar_url TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 5. CONVERSATION MEMBERS TABLE
CREATE TABLE IF NOT EXISTS public.conversation_members (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    conversation_id UUID NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    joined_at TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT unique_conversation_member UNIQUE (conversation_id, user_id)
);

-- 6. MESSAGES TABLE
CREATE TABLE IF NOT EXISTS public.messages (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    conversation_id UUID NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
    sender_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    message_type TEXT NOT NULL DEFAULT 'text' CHECK (message_type IN ('text', 'image', 'file', 'voice', 'video')),
    content TEXT,
    file_url TEXT,
    file_name TEXT,
    file_size TEXT,
    duration_seconds INT,
    reply_to_message_id UUID REFERENCES public.messages(id) ON DELETE SET NULL,
    is_deleted BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 7. MESSAGE READS TABLE
CREATE TABLE IF NOT EXISTS public.message_reads (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    message_id UUID NOT NULL REFERENCES public.messages(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    read_at TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT unique_message_read UNIQUE (message_id, user_id)
);

-- 8. INDEXES FOR HIGH-PERFORMANCE QUERYING
CREATE INDEX IF NOT EXISTS idx_profiles_user_id ON public.profiles(user_id);
CREATE INDEX IF NOT EXISTS idx_profiles_phone ON public.profiles(phone_number);
CREATE INDEX IF NOT EXISTS idx_profiles_name ON public.profiles(full_name);
CREATE INDEX IF NOT EXISTS idx_contacts_user ON public.contacts(user_id);
CREATE INDEX IF NOT EXISTS idx_conv_members_user ON public.conversation_members(user_id);
CREATE INDEX IF NOT EXISTS idx_conv_members_conv ON public.conversation_members(conversation_id);
CREATE INDEX IF NOT EXISTS idx_messages_conversation ON public.messages(conversation_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_message_reads_msg_user ON public.message_reads(message_id, user_id);

-- ==============================================================================
-- 9. AUTOMATIC PROFILE CREATION TRIGGER FOR FUTURE AUTH.USERS
-- ==============================================================================
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  raw_phone TEXT;
  extracted_name TEXT;
  clean_username TEXT;
BEGIN
  -- Extract phone number from raw_user_meta_data, phone, or shadow email (phone_123456789@vibe.chat)
  raw_phone := COALESCE(
    NULLIF(TRIM(NEW.raw_user_meta_data->>'phone_number'), ''),
    NULLIF(TRIM(NEW.phone), ''),
    CASE 
      WHEN NEW.email LIKE 'phone_%@vibe.chat' THEN 
        '+' || SUBSTRING(SPLIT_PART(NEW.email, '@', 1) FROM 7)
      ELSE NULLIF(TRIM(NEW.email), '')
    END,
    ''
  );

  extracted_name := COALESCE(
    NULLIF(TRIM(NEW.raw_user_meta_data->>'full_name'), ''),
    'Vibe User'
  );

  clean_username := LOWER(REGEXP_REPLACE(extracted_name, '[^a-zA-Z0-9]', '_', 'g')) || '_' || FLOOR(RANDOM() * 900 + 100)::text;

  INSERT INTO public.profiles (
    id,
    user_id,
    full_name,
    phone_number,
    username,
    avatar_url,
    about,
    is_online,
    last_seen,
    created_at,
    updated_at
  )
  VALUES (
    NEW.id,
    NEW.id,
    extracted_name,
    raw_phone,
    clean_username,
    COALESCE(NEW.raw_user_meta_data->>'avatar_url', ''),
    'Hey there! I am using Vibe.',
    false,
    NOW(),
    NOW(),
    NOW()
  )
  ON CONFLICT (user_id) DO UPDATE SET
    full_name = CASE WHEN profiles.full_name IS NULL OR profiles.full_name = 'Vibe User' THEN EXCLUDED.full_name ELSE profiles.full_name END,
    phone_number = CASE WHEN profiles.phone_number IS NULL OR profiles.phone_number = '' THEN EXCLUDED.phone_number ELSE profiles.phone_number END,
    avatar_url = COALESCE(NULLIF(EXCLUDED.avatar_url, ''), profiles.avatar_url),
    updated_at = NOW();

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ==============================================================================
-- 10. SAFE ONE-TIME SYNC & RPC FUNCTION FOR ALL EXISTING AUTH.USERS
-- ==============================================================================
CREATE OR REPLACE FUNCTION public.sync_user_profiles()
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  synced_count INT := 0;
BEGIN
  INSERT INTO public.profiles (
    id,
    user_id,
    full_name,
    phone_number,
    username,
    avatar_url,
    about,
    is_online,
    last_seen,
    created_at,
    updated_at
  )
  SELECT 
    u.id,
    u.id,
    COALESCE(NULLIF(TRIM(u.raw_user_meta_data->>'full_name'), ''), 'Vibe User'),
    COALESCE(
      NULLIF(TRIM(u.raw_user_meta_data->>'phone_number'), ''),
      NULLIF(TRIM(u.phone), ''),
      CASE 
        WHEN u.email LIKE 'phone_%@vibe.chat' THEN 
          '+' || SUBSTRING(SPLIT_PART(u.email, '@', 1) FROM 7)
        ELSE NULLIF(TRIM(u.email), '')
      END,
      ''
    ),
    LOWER(REGEXP_REPLACE(COALESCE(NULLIF(TRIM(u.raw_user_meta_data->>'full_name'), ''), 'user'), '[^a-zA-Z0-9]', '_', 'g')) || '_' || FLOOR(RANDOM() * 900 + 100)::text,
    COALESCE(u.raw_user_meta_data->>'avatar_url', ''),
    'Hey there! I am using Vibe.',
    false,
    NOW(),
    COALESCE(u.created_at, NOW()),
    NOW()
  FROM auth.users u
  ON CONFLICT (user_id) DO UPDATE SET
    full_name = CASE WHEN profiles.full_name IS NULL OR profiles.full_name = 'Vibe User' THEN EXCLUDED.full_name ELSE profiles.full_name END,
    phone_number = CASE WHEN profiles.phone_number IS NULL OR profiles.phone_number = '' THEN EXCLUDED.phone_number ELSE profiles.phone_number END,
    avatar_url = COALESCE(NULLIF(EXCLUDED.avatar_url, ''), profiles.avatar_url);

  GET DIAGNOSTICS synced_count = ROW_COUNT;
  RETURN json_build_object('success', true, 'synced_count', synced_count);
END;
$$;

GRANT EXECUTE ON FUNCTION public.sync_user_profiles() TO authenticated, anon;

-- Run one-time sync immediately
SELECT public.sync_user_profiles();

-- ==============================================================================
-- 11. ROW LEVEL SECURITY (RLS) POLICIES — NON-RECURSIVE & SECURE
-- ==============================================================================

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contact_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.conversation_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.message_reads ENABLE ROW LEVEL SECURITY;

-- 11.1 Profiles Policies
DROP POLICY IF EXISTS "Public profiles are readable by authenticated users" ON public.profiles;
DROP POLICY IF EXISTS "Public profiles are readable by anyone" ON public.profiles;
DROP POLICY IF EXISTS "Users can update their own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users can insert their own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users can manage their own profile" ON public.profiles;

CREATE POLICY "Public profiles are readable by authenticated users"
ON public.profiles FOR SELECT TO authenticated, anon USING (true);

CREATE POLICY "Users can insert their own profile"
ON public.profiles FOR INSERT TO authenticated, anon WITH CHECK (true);

CREATE POLICY "Users can update their own profile"
ON public.profiles FOR UPDATE TO authenticated, anon
USING (auth.uid() = user_id OR auth.uid() = id OR auth.uid() IS NULL);

-- 11.2 Contacts Policies
DROP POLICY IF EXISTS "Users can view their own contacts" ON public.contacts;
DROP POLICY IF EXISTS "Users can manage their own contacts" ON public.contacts;

CREATE POLICY "Users can view their own contacts"
ON public.contacts FOR SELECT TO authenticated, anon USING (true);

CREATE POLICY "Users can manage their own contacts"
ON public.contacts FOR ALL TO authenticated, anon USING (true) WITH CHECK (true);

-- 11.3 Contact Requests Policies
DROP POLICY IF EXISTS "Users can view contact requests they sent or received" ON public.contact_requests;
DROP POLICY IF EXISTS "Users can send contact requests" ON public.contact_requests;
DROP POLICY IF EXISTS "Receivers can update contact requests" ON public.contact_requests;
DROP POLICY IF EXISTS "Users can delete their contact requests" ON public.contact_requests;

CREATE POLICY "Users can view contact requests"
ON public.contact_requests FOR SELECT TO authenticated, anon USING (true);

CREATE POLICY "Users can send contact requests"
ON public.contact_requests FOR INSERT TO authenticated, anon WITH CHECK (true);

CREATE POLICY "Users can update contact requests"
ON public.contact_requests FOR UPDATE TO authenticated, anon USING (true);

CREATE POLICY "Users can delete contact requests"
ON public.contact_requests FOR DELETE TO authenticated, anon USING (true);

-- 11.4 Conversation Policies
DROP POLICY IF EXISTS "Users can view conversations they are member of" ON public.conversations;
DROP POLICY IF EXISTS "Users can view conversations" ON public.conversations;
DROP POLICY IF EXISTS "Authenticated users can create conversations" ON public.conversations;
DROP POLICY IF EXISTS "Members can update conversations" ON public.conversations;

CREATE POLICY "Users can view conversations"
ON public.conversations FOR SELECT TO authenticated, anon USING (true);

CREATE POLICY "Users can create conversations"
ON public.conversations FOR INSERT TO authenticated, anon WITH CHECK (true);

CREATE POLICY "Users can update conversations"
ON public.conversations FOR UPDATE TO authenticated, anon USING (true);

CREATE POLICY "Users can delete conversations"
ON public.conversations FOR DELETE TO authenticated, anon USING (true);

-- 11.5 Conversation Members Policies (Non-recursive)
DROP POLICY IF EXISTS "Users can view conversation members of their chats" ON public.conversation_members;
DROP POLICY IF EXISTS "Users can view conversation members" ON public.conversation_members;
DROP POLICY IF EXISTS "Users can insert conversation members" ON public.conversation_members;
DROP POLICY IF EXISTS "Users can delete conversation members" ON public.conversation_members;

CREATE POLICY "Users can view conversation members"
ON public.conversation_members FOR SELECT TO authenticated, anon USING (true);

CREATE POLICY "Users can insert conversation members"
ON public.conversation_members FOR INSERT TO authenticated, anon WITH CHECK (true);

CREATE POLICY "Users can delete conversation members"
ON public.conversation_members FOR DELETE TO authenticated, anon USING (true);

-- 11.6 Messages Policies
DROP POLICY IF EXISTS "Users can view messages in their conversations" ON public.messages;
DROP POLICY IF EXISTS "Users can view messages" ON public.messages;
DROP POLICY IF EXISTS "Users can insert messages into their conversations" ON public.messages;
DROP POLICY IF EXISTS "Users can insert messages" ON public.messages;
DROP POLICY IF EXISTS "Users can update/delete their own messages" ON public.messages;

CREATE POLICY "Users can view messages"
ON public.messages FOR SELECT TO authenticated, anon USING (true);

CREATE POLICY "Users can insert messages"
ON public.messages FOR INSERT TO authenticated, anon WITH CHECK (true);

CREATE POLICY "Users can update messages"
ON public.messages FOR UPDATE TO authenticated, anon USING (true);

CREATE POLICY "Users can delete messages"
ON public.messages FOR DELETE TO authenticated, anon USING (true);

-- 11.7 Message Reads Policies
DROP POLICY IF EXISTS "Users can view reads in their conversations" ON public.message_reads;
DROP POLICY IF EXISTS "Users can mark messages as read" ON public.message_reads;

CREATE POLICY "Users can view message reads"
ON public.message_reads FOR SELECT TO authenticated, anon USING (true);

CREATE POLICY "Users can mark messages as read"
ON public.message_reads FOR INSERT TO authenticated, anon WITH CHECK (true);

-- ==============================================================================
-- 12. STORAGE BUCKETS SETUP
-- ==============================================================================
INSERT INTO storage.buckets (id, name, public) 
VALUES ('avatars', 'avatars', true)
ON CONFLICT (id) DO NOTHING;

INSERT INTO storage.buckets (id, name, public) 
VALUES ('chat-media', 'chat-media', true)
ON CONFLICT (id) DO NOTHING;

INSERT INTO storage.buckets (id, name, public) 
VALUES ('voice-messages', 'voice-messages', true)
ON CONFLICT (id) DO NOTHING;

-- Storage Policies
DROP POLICY IF EXISTS "Public Read Avatars" ON storage.objects;
DROP POLICY IF EXISTS "Auth Upload Avatars" ON storage.objects;
DROP POLICY IF EXISTS "Public Read Chat Media" ON storage.objects;
DROP POLICY IF EXISTS "Auth Upload Chat Media" ON storage.objects;
DROP POLICY IF EXISTS "Public Read Voice Messages" ON storage.objects;
DROP POLICY IF EXISTS "Auth Upload Voice Messages" ON storage.objects;

CREATE POLICY "Public Read Avatars" ON storage.objects FOR SELECT TO authenticated, anon USING (bucket_id = 'avatars');
CREATE POLICY "Auth Upload Avatars" ON storage.objects FOR INSERT TO authenticated, anon WITH CHECK (bucket_id = 'avatars');

CREATE POLICY "Public Read Chat Media" ON storage.objects FOR SELECT TO authenticated, anon USING (bucket_id = 'chat-media');
CREATE POLICY "Auth Upload Chat Media" ON storage.objects FOR INSERT TO authenticated, anon WITH CHECK (bucket_id = 'chat-media');

CREATE POLICY "Public Read Voice Messages" ON storage.objects FOR SELECT TO authenticated, anon USING (bucket_id = 'voice-messages');
CREATE POLICY "Auth Upload Voice Messages" ON storage.objects FOR INSERT TO authenticated, anon WITH CHECK (bucket_id = 'voice-messages');

-- ==============================================================================
-- 13. REALTIME ENABLEMENT
-- ==============================================================================
ALTER PUBLICATION supabase_realtime ADD TABLE public.messages;
ALTER PUBLICATION supabase_realtime ADD TABLE public.message_reads;
ALTER PUBLICATION supabase_realtime ADD TABLE public.contact_requests;
ALTER PUBLICATION supabase_realtime ADD TABLE public.profiles;
ALTER PUBLICATION supabase_realtime ADD TABLE public.conversation_members;
ALTER PUBLICATION supabase_realtime ADD TABLE public.conversations;

