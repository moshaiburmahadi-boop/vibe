-- ==============================================================================
-- Fix RLS recursion with SECURITY DEFINER helper function
-- ==============================================================================

-- 1. Helper function to check membership safely
CREATE OR REPLACE FUNCTION public.is_member_of(_conversation_id uuid, _user_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.conversation_members
    WHERE conversation_id = _conversation_id AND user_id = _user_id
  );
$$;

GRANT EXECUTE ON FUNCTION public.is_member_of(uuid, uuid) TO authenticated, anon;

-- 2. Drop all policies on the affected tables
DO $$
DECLARE
    pol record;
BEGIN
    FOR pol IN (
      SELECT policyname, tablename 
      FROM pg_policies 
      WHERE schemaname = 'public' 
        AND tablename IN ('conversations', 'conversation_members', 'messages', 'message_reads', 'contacts')
    )
    LOOP
        EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', pol.policyname, pol.tablename);
    END LOOP;
END
$$;

-- 3. Enable RLS
ALTER TABLE public.conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.conversation_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.message_reads ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contacts ENABLE ROW LEVEL SECURITY;

-- 4. Conversations Policies
CREATE POLICY "conversations_select" ON public.conversations FOR SELECT TO authenticated, anon USING (auth.uid() IS NULL OR public.is_member_of(id, auth.uid()));
CREATE POLICY "conversations_insert" ON public.conversations FOR INSERT TO authenticated, anon WITH CHECK (true);
CREATE POLICY "conversations_update" ON public.conversations FOR UPDATE TO authenticated, anon USING (auth.uid() IS NULL OR public.is_member_of(id, auth.uid()));
CREATE POLICY "conversations_delete" ON public.conversations FOR DELETE TO authenticated, anon USING (auth.uid() IS NULL OR public.is_member_of(id, auth.uid()));

-- 5. Conversation Members Policies
CREATE POLICY "members_select" ON public.conversation_members FOR SELECT TO authenticated, anon USING (auth.uid() IS NULL OR user_id = auth.uid() OR public.is_member_of(conversation_id, auth.uid()));
CREATE POLICY "members_insert" ON public.conversation_members FOR INSERT TO authenticated, anon WITH CHECK (auth.uid() IS NULL OR user_id = auth.uid() OR public.is_member_of(conversation_id, auth.uid()) OR auth.role() = 'authenticated');
CREATE POLICY "members_update" ON public.conversation_members FOR UPDATE TO authenticated, anon USING (auth.uid() IS NULL OR user_id = auth.uid() OR public.is_member_of(conversation_id, auth.uid()));
CREATE POLICY "members_delete" ON public.conversation_members FOR DELETE TO authenticated, anon USING (auth.uid() IS NULL OR user_id = auth.uid() OR public.is_member_of(conversation_id, auth.uid()));

-- 6. Messages Policies
CREATE POLICY "messages_select" ON public.messages FOR SELECT TO authenticated, anon USING (auth.uid() IS NULL OR public.is_member_of(conversation_id, auth.uid()));
CREATE POLICY "messages_insert" ON public.messages FOR INSERT TO authenticated, anon WITH CHECK (auth.uid() IS NULL OR (sender_id = auth.uid() AND public.is_member_of(conversation_id, auth.uid())) OR auth.role() = 'authenticated');
CREATE POLICY "messages_update" ON public.messages FOR UPDATE TO authenticated, anon USING (auth.uid() IS NULL OR sender_id = auth.uid());
CREATE POLICY "messages_delete" ON public.messages FOR DELETE TO authenticated, anon USING (auth.uid() IS NULL OR sender_id = auth.uid());

-- 7. Message Reads Policies (id, message_id, user_id, read_at)
CREATE POLICY "reads_select" ON public.message_reads FOR SELECT TO authenticated, anon USING (true);
CREATE POLICY "reads_insert" ON public.message_reads FOR INSERT TO authenticated, anon WITH CHECK (auth.uid() IS NULL OR user_id = auth.uid() OR auth.role() = 'authenticated');
CREATE POLICY "reads_update" ON public.message_reads FOR UPDATE TO authenticated, anon USING (auth.uid() IS NULL OR user_id = auth.uid());
CREATE POLICY "reads_delete" ON public.message_reads FOR DELETE TO authenticated, anon USING (auth.uid() IS NULL OR user_id = auth.uid());

-- 8. Contacts Policies (id, user_id, contact_user_id, created_at)
CREATE POLICY "contacts_select" ON public.contacts FOR SELECT TO authenticated, anon USING (true);
CREATE POLICY "contacts_all" ON public.contacts FOR ALL TO authenticated, anon USING (true) WITH CHECK (true);
