import { supabase, isSupabaseConfigured } from '../lib/supabase';

export const storageService = {
  // Upload user avatar to 'avatars' bucket
  async uploadAvatar(file: File, userId: string): Promise<{ url: string | null; error: Error | null }> {
    try {
      if (!isSupabaseConfigured()) {
        // Return local object URL or base64
        return new Promise((resolve) => {
          const reader = new FileReader();
          reader.onloadend = () => {
            resolve({ url: reader.result as string, error: null });
          };
          reader.onerror = () => {
            resolve({ url: null, error: new Error('Failed to read image') });
          };
          reader.readAsDataURL(file);
        });
      }

      const fileExt = file.name.split('.').pop() || 'png';
      const filePath = `${userId}/${Date.now()}.${fileExt}`;

      const { error: uploadError } = await supabase.storage
        .from('avatars')
        .upload(filePath, file, { upsert: true });

      if (uploadError) {
        // Fallback to base64 if storage bucket not yet provisioned
        const base64 = await this.fileToBase64(file);
        return { url: base64, error: null };
      }

      const { data } = supabase.storage.from('avatars').getPublicUrl(filePath);
      return { url: data.publicUrl, error: null };
    } catch (err: any) {
      return { url: null, error: err };
    }
  },

  // Upload chat media (photos, documents) to 'chat-media' bucket
  async uploadChatMedia(
    file: File | Blob,
    conversationId: string,
    fileName?: string
  ): Promise<{ url: string | null; error: Error | null }> {
    try {
      const name = fileName || (file instanceof File ? file.name : `file_${Date.now()}`);

      if (!isSupabaseConfigured()) {
        const base64 = await this.fileToBase64(file);
        return { url: base64, error: null };
      }

      const fileExt = name.split('.').pop() || 'dat';
      const filePath = `${conversationId}/${Date.now()}_${Math.random().toString(36).substring(2, 6)}.${fileExt}`;

      const { error: uploadError } = await supabase.storage
        .from('chat-media')
        .upload(filePath, file);

      if (uploadError) {
        const base64 = await this.fileToBase64(file);
        return { url: base64, error: null };
      }

      const { data } = supabase.storage.from('chat-media').getPublicUrl(filePath);
      return { url: data.publicUrl, error: null };
    } catch (err: any) {
      return { url: null, error: err };
    }
  },

  // Upload voice recording to 'voice-messages' bucket
  async uploadVoiceMessage(
    blob: Blob,
    conversationId: string
  ): Promise<{ url: string | null; error: Error | null }> {
    try {
      if (!isSupabaseConfigured()) {
        const base64 = await this.fileToBase64(blob);
        return { url: base64, error: null };
      }

      const filePath = `${conversationId}/${Date.now()}_voice.webm`;
      const { error: uploadError } = await supabase.storage
        .from('voice-messages')
        .upload(filePath, blob, { contentType: 'audio/webm' });

      if (uploadError) {
        const base64 = await this.fileToBase64(blob);
        return { url: base64, error: null };
      }

      const { data } = supabase.storage.from('voice-messages').getPublicUrl(filePath);
      return { url: data.publicUrl, error: null };
    } catch (err: any) {
      return { url: null, error: err };
    }
  },

  fileToBase64(file: File | Blob): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  },
};
