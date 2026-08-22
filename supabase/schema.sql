-- ==============================================================================
-- VIBE REAL-TIME CHAT APPLICATION — SUPABASE DATABASE SCHEMA & MIGRATIONS
-- ==============================================================================

-- Enable UUID generation extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 1. PROFILES TABLE
CREATE TABLE IF NOT EXISTS public.profiles (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
    full_name TEXT NOT NULL,
    phone_number TEXT UNIQUE NOT NULL,
    username TEXT UNIQUE,
    avatar_url TEXT,
    about TEXT DEFAULT 'Hey there! I am using Vibe.',
    is_online BOOLEAN DEFAULT false,
    last_seen TIMESTAMPTZ DEFAULT NOW(),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. CONTACTS TABLE
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
CREATE INDEX IF NOT EXISTS idx_profiles_phone ON public.profiles(phone_number);
CREATE INDEX IF NOT EXISTS idx_contacts_user ON public.contacts(user_id);
CREATE INDEX IF NOT EXISTS idx_conv_members_user ON public.conversation_members(user_id);
CREATE INDEX IF NOT EXISTS idx_conv_members_conv ON public.conversation_members(conversation_id);
CREATE INDEX IF NOT EXISTS idx_messages_conversation ON public.messages(conversation_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_message_reads_msg_user ON public.message_reads(message_id, user_id);

-- ==============================================================================
-- AUTOMATIC PROFILE CREATION TRIGGER ON AUTH.USERS
-- ==============================================================================
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
BEGIN
  INSERT INTO public.profiles (user_id, full_name, phone_number, avatar_url, username)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', 'Vibe User'),
    COALESCE(NEW.raw_user_meta_data->>'phone_number', NEW.phone, NEW.email),
    COALESCE(NEW.raw_user_meta_data->>'avatar_url', ''),
    LOWER(REPLACE(COALESCE(NEW.raw_user_meta_data->>'full_name', 'user'), ' ', '_')) || '_' || FLOOR(RANDOM() * 900 + 100)::text
  )
  ON CONFLICT (user_id) DO UPDATE SET
    full_name = EXCLUDED.full_name,
    phone_number = EXCLUDED.phone_number,
    avatar_url = EXCLUDED.avatar_url;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ==============================================================================
-- ROW LEVEL SECURITY (RLS) POLICIES
-- ==============================================================================

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contact_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.conversation_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.message_reads ENABLE ROW LEVEL SECURITY;

-- Profiles Policies
CREATE POLICY "Public profiles are readable by authenticated users"
ON public.profiles FOR SELECT TO authenticated USING (true);

CREATE POLICY "Users can update their own profile"
ON public.profiles FOR UPDATE TO authenticated USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own profile"
ON public.profiles FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

-- Contacts Policies
CREATE POLICY "Users can view their own contacts"
ON public.contacts FOR SELECT TO authenticated USING (auth.uid() = user_id);

CREATE POLICY "Users can manage their own contacts"
ON public.contacts FOR ALL TO authenticated USING (auth.uid() = user_id);

-- Contact Requests Policies
CREATE POLICY "Users can view contact requests they sent or received"
ON public.contact_requests FOR SELECT TO authenticated 
USING (auth.uid() = sender_id OR auth.uid() = receiver_id);

CREATE POLICY "Users can send contact requests"
ON public.contact_requests FOR INSERT TO authenticated 
WITH CHECK (auth.uid() = sender_id);

CREATE POLICY "Receivers can update contact requests"
ON public.contact_requests FOR UPDATE TO authenticated 
USING (auth.uid() = receiver_id OR auth.uid() = sender_id);

CREATE POLICY "Users can delete their contact requests"
ON public.contact_requests FOR DELETE TO authenticated 
USING (auth.uid() = sender_id OR auth.uid() = receiver_id);

-- Conversation Policies
CREATE POLICY "Users can view conversations they are member of"
ON public.conversations FOR SELECT TO authenticated 
USING (
    EXISTS (
        SELECT 1 FROM public.conversation_members 
        WHERE conversation_members.conversation_id = conversations.id 
        AND conversation_members.user_id = auth.uid()
    )
);

CREATE POLICY "Authenticated users can create conversations"
ON public.conversations FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "Members can update conversations"
ON public.conversations FOR UPDATE TO authenticated 
USING (
    EXISTS (
        SELECT 1 FROM public.conversation_members 
        WHERE conversation_members.conversation_id = conversations.id 
        AND conversation_members.user_id = auth.uid()
    )
);

-- Conversation Members Policies
CREATE POLICY "Users can view conversation members of their chats"
ON public.conversation_members FOR SELECT TO authenticated 
USING (
    EXISTS (
        SELECT 1 FROM public.conversation_members cm 
        WHERE cm.conversation_id = conversation_members.conversation_id 
        AND cm.user_id = auth.uid()
    )
);

CREATE POLICY "Users can insert conversation members"
ON public.conversation_members FOR INSERT TO authenticated WITH CHECK (true);

-- Messages Policies
CREATE POLICY "Users can view messages in their conversations"
ON public.messages FOR SELECT TO authenticated 
USING (
    EXISTS (
        SELECT 1 FROM public.conversation_members 
        WHERE conversation_members.conversation_id = messages.conversation_id 
        AND conversation_members.user_id = auth.uid()
    )
);

CREATE POLICY "Users can insert messages into their conversations"
ON public.messages FOR INSERT TO authenticated 
WITH CHECK (
    auth.uid() = sender_id AND
    EXISTS (
        SELECT 1 FROM public.conversation_members 
        WHERE conversation_members.conversation_id = messages.conversation_id 
        AND conversation_members.user_id = auth.uid()
    )
);

CREATE POLICY "Users can update/delete their own messages"
ON public.messages FOR UPDATE TO authenticated 
USING (auth.uid() = sender_id);

-- Message Reads Policies
CREATE POLICY "Users can view reads in their conversations"
ON public.message_reads FOR SELECT TO authenticated 
USING (
    EXISTS (
        SELECT 1 FROM public.messages m
        JOIN public.conversation_members cm ON cm.conversation_id = m.conversation_id
        WHERE m.id = message_reads.message_id 
        AND cm.user_id = auth.uid()
    )
);

CREATE POLICY "Users can mark messages as read"
ON public.message_reads FOR INSERT TO authenticated 
WITH CHECK (auth.uid() = user_id);

-- ==============================================================================
-- STORAGE BUCKETS SETUP
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
CREATE POLICY "Public Read Avatars" ON storage.objects FOR SELECT TO authenticated, anon USING (bucket_id = 'avatars');
CREATE POLICY "Auth Upload Avatars" ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'avatars');

CREATE POLICY "Public Read Chat Media" ON storage.objects FOR SELECT TO authenticated USING (bucket_id = 'chat-media');
CREATE POLICY "Auth Upload Chat Media" ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'chat-media');

CREATE POLICY "Public Read Voice Messages" ON storage.objects FOR SELECT TO authenticated USING (bucket_id = 'voice-messages');
CREATE POLICY "Auth Upload Voice Messages" ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'voice-messages');

-- ==============================================================================
-- REALTIME ENABLEMENT
-- ==============================================================================
ALTER PUBLICATION supabase_realtime ADD TABLE public.messages;
ALTER PUBLICATION supabase_realtime ADD TABLE public.message_reads;
ALTER PUBLICATION supabase_realtime ADD TABLE public.contact_requests;
ALTER PUBLICATION supabase_realtime ADD TABLE public.profiles;
