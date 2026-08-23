import React, { useState, useEffect, useRef, useCallback } from 'react';
import { RealtimeChannel } from '@supabase/supabase-js';
import { useAuth } from '../../context/AuthContext';
import { chatService } from '../../services/chatService';
import { storageService } from '../../services/storageService';
import { realtimeService } from '../../services/realtimeService';
import { Message, MessageType } from '../../types';

export const ActiveChatArea: React.FC = () => {
  const {
    currentUser,
    activeConversation,
    setActiveConversation,
    startCall,
    showContactInfo,
    setShowContactInfo,
  } = useAuth();

  const [messages, setMessages] = useState<Message[]>([]);
  const [inputText, setInputText] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isSending, setIsSending] = useState(false);
  const [isOtherTyping, setIsOtherTyping] = useState(false);
  const [replyingTo, setReplyingTo] = useState<Message | null>(null);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [selectedImagePreview, setSelectedImagePreview] = useState<string | null>(null);

  // Audio playback state
  const [playingAudioId, setPlayingAudioId] = useState<string | null>(null);
  const [audioProgress, setAudioProgress] = useState<{ [id: string]: number }>({});
  const audioRefs = useRef<{ [id: string]: HTMLAudioElement }>({});

  // Voice recording state
  const [isRecording, setIsRecording] = useState(false);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const recordingTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Attachment upload ref
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const scrollAnchorRef = useRef<HTMLDivElement | null>(null);
  const typingTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const typingChannelRef = useRef<RealtimeChannel | null>(null);

  const otherMember = activeConversation?.other_member;
  const conversationId = activeConversation?.id;

  // Load messages
  const loadMessages = useCallback(async () => {
    if (!conversationId || !currentUser) return;
    setIsLoading(true);
    try {
      const msgs = await chatService.getMessages(conversationId);
      setMessages(msgs);
      await chatService.markConversationAsRead(conversationId, currentUser.user_id);
    } catch (err) {
      console.error('Failed to load messages:', err);
    } finally {
      setIsLoading(false);
    }
  }, [conversationId, currentUser]);

  useEffect(() => {
    loadMessages();

    if (!conversationId || !currentUser) return;

    // Realtime message subscription
    const messageChannel = realtimeService.subscribeToMessages(
      conversationId,
      (newMsg) => {
        setMessages((prev) => {
          if (prev.some((m) => m.id === newMsg.id)) return prev;
          return [...prev, newMsg];
        });

        if (newMsg.sender_id !== currentUser.user_id) {
          chatService.markConversationAsRead(conversationId, currentUser.user_id);
        }
      },
      (updatedMsg) => {
        setMessages((prev) =>
          prev.map((m) => (m.id === updatedMsg.id ? { ...m, ...updatedMsg } : m))
        );
      }
    );

    // Realtime typing subscription
    const typingChannel = realtimeService.subscribeToTyping(
      conversationId,
      (userId, typing) => {
        if (userId !== currentUser.user_id) {
          setIsOtherTyping(typing);
        }
      }
    );
    typingChannelRef.current = typingChannel;

    return () => {
      realtimeService.unsubscribe(messageChannel);
      realtimeService.unsubscribe(typingChannel);
      typingChannelRef.current = null;
    };
  }, [conversationId, currentUser, loadMessages]);

  // Scroll to bottom on messages update
  useEffect(() => {
    scrollAnchorRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isOtherTyping]);

  // Handle typing broadcast
  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInputText(e.target.value);

    if (conversationId && currentUser && typingChannelRef.current) {
      realtimeService.sendTypingStatus(typingChannelRef.current, currentUser.user_id, true);
      if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
      typingTimeoutRef.current = setTimeout(() => {
        if (typingChannelRef.current && currentUser) {
          realtimeService.sendTypingStatus(typingChannelRef.current, currentUser.user_id, false);
        }
      }, 2000);
    }
  };

  // Send message
  const handleSendMessage = async (
    type: MessageType = 'text',
    content: string | null = inputText.trim(),
    fileUrl?: string,
    fileName?: string,
    fileSize?: string,
    duration?: number
  ) => {
    if (!conversationId || !currentUser) return;
    if (type === 'text' && !content) return;

    setIsSending(true);
    setInputText('');
    const replyId = replyingTo?.id;
    setReplyingTo(null);
    setShowEmojiPicker(false);

    try {
      const res = await chatService.sendMessage({
        conversationId,
        senderId: currentUser.user_id,
        messageType: type,
        content,
        fileUrl,
        fileName,
        fileSize,
        durationSeconds: duration,
        replyToMessageId: replyId,
      });

      if (res.message) {
        setMessages((prev) => [...prev, res.message!]);
      }
    } catch (err) {
      console.error('Send message error:', err);
    } finally {
      setIsSending(false);
    }
  };

  // Voice recording handlers
  const startVoiceRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      audioChunksRef.current = [];
      const recorder = new MediaRecorder(stream);

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) {
          audioChunksRef.current.push(e.data);
        }
      };

      recorder.onstop = async () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        stream.getTracks().forEach((track) => track.stop());

        if (recordingSeconds > 0 && conversationId) {
          const uploadRes = await storageService.uploadVoiceMessage(audioBlob, conversationId);
          if (uploadRes.url) {
            handleSendMessage('voice', null, uploadRes.url, 'voice_note.webm', 'Audio', recordingSeconds);
          }
        }
        setRecordingSeconds(0);
        setIsRecording(false);
      };

      recorder.start();
      mediaRecorderRef.current = recorder;
      setIsRecording(true);
      setRecordingSeconds(0);

      recordingTimerRef.current = setInterval(() => {
        setRecordingSeconds((prev) => prev + 1);
      }, 1000);
    } catch (err) {
      alert('Microphone permission is required to record voice notes.');
    }
  };

  const stopVoiceRecording = () => {
    if (recordingTimerRef.current) clearInterval(recordingTimerRef.current);
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
    }
  };

  const cancelVoiceRecording = () => {
    if (recordingTimerRef.current) clearInterval(recordingTimerRef.current);
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      audioChunksRef.current = [];
      mediaRecorderRef.current.stop();
    }
    setIsRecording(false);
    setRecordingSeconds(0);
  };

  // File upload handler
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files || !e.target.files[0] || !conversationId) return;
    const file = e.target.files[0];
    const isImg = file.type.startsWith('image/');
    const type: MessageType = isImg ? 'image' : 'file';

    const fileSizeStr =
      file.size > 1024 * 1024
        ? `${(file.size / (1024 * 1024)).toFixed(1)} MB`
        : `${Math.round(file.size / 1024)} KB`;

    const uploadRes = await storageService.uploadChatMedia(file, conversationId, file.name);
    if (uploadRes.url) {
      handleSendMessage(type, isImg ? 'Photo attachment' : file.name, uploadRes.url, file.name, fileSizeStr);
    }
  };

  // Audio Playback
  const togglePlayAudio = (msgId: string, url: string) => {
    if (playingAudioId === msgId) {
      audioRefs.current[msgId]?.pause();
      setPlayingAudioId(null);
    } else {
      if (playingAudioId && audioRefs.current[playingAudioId]) {
        audioRefs.current[playingAudioId].pause();
      }

      if (!audioRefs.current[msgId]) {
        const audio = new Audio(url);
        audio.ontimeupdate = () => {
          if (audio.duration) {
            setAudioProgress((prev) => ({
              ...prev,
              [msgId]: (audio.currentTime / audio.duration) * 100,
            }));
          }
        };
        audio.onended = () => {
          setPlayingAudioId(null);
          setAudioProgress((prev) => ({ ...prev, [msgId]: 0 }));
        };
        audioRefs.current[msgId] = audio;
      }

      audioRefs.current[msgId].play();
      setPlayingAudioId(msgId);
    }
  };

  // Soft Delete message
  const handleDeleteMessage = async (msgId: string) => {
    if (!currentUser) return;
    if (confirm('Delete this message?')) {
      await chatService.deleteMessage(msgId, currentUser.user_id);
      setMessages((prev) =>
        prev.map((m) => (m.id === msgId ? { ...m, is_deleted: true, content: 'This message was deleted' } : m))
      );
    }
  };

  if (!activeConversation) {
    return (
      <div className="flex-1 hidden md:flex flex-col items-center justify-center bg-surface-container-lowest text-on-surface-variant p-8">
        <div className="w-20 h-20 rounded-full bg-surface-container flex items-center justify-center mb-4 text-primary">
          <span className="material-symbols-outlined text-4xl">forum</span>
        </div>
        <h3 className="text-xl font-bold text-on-surface mb-2">Welcome to Vibe</h3>
        <p className="text-sm text-center max-w-sm">
          Select a conversation from the list or start a new chat with your contacts.
        </p>
      </div>
    );
  }

  const displayName = otherMember?.full_name || activeConversation.name || 'Chat';
  const avatar =
    otherMember?.avatar_url ||
    activeConversation.avatar_url ||
    `https://api.dicebear.com/7.x/avataaars/svg?seed=${encodeURIComponent(displayName)}`;
  const isOnline = otherMember?.is_online;

  return (
    <div className="flex-1 flex flex-col h-full relative bg-surface-container-lowest overflow-hidden">
      {/* Top Glassmorphic Chat Header */}
      <header className="h-20 w-full bg-surface/90 backdrop-blur-xl border-b border-outline-variant flex justify-between items-center px-4 md:px-6 z-20 shrink-0">
        <div className="flex items-center gap-3">
          {/* Mobile Back Button */}
          <button
            onClick={() => setActiveConversation(null)}
            className="md:hidden p-2 -ml-2 rounded-full hover:bg-surface-container transition-colors text-on-surface-variant"
          >
            <span className="material-symbols-outlined">arrow_back</span>
          </button>

          <div
            onClick={() => setShowContactInfo(!showContactInfo)}
            className="relative w-11 h-11 md:w-12 md:h-12 cursor-pointer"
          >
            <img
              src={avatar}
              alt={displayName}
              className="w-full h-full object-cover rounded-full shadow-sm border border-outline-variant/50"
            />
            {isOnline && (
              <div className="absolute bottom-0 right-0 w-3.5 h-3.5 rounded-full border-2 border-surface bg-tertiary-fixed-dim"></div>
            )}
          </div>

          <div
            onClick={() => setShowContactInfo(!showContactInfo)}
            className="flex flex-col cursor-pointer"
          >
            <h2 className="font-bold text-base md:text-lg text-on-surface leading-tight">
              {displayName}
            </h2>
            <span className="text-xs text-tertiary-fixed-dim font-medium">
              {isOnline ? 'Online' : 'Last seen recently'}
            </span>
          </div>
        </div>

        {/* Action icons */}
        <div className="flex items-center gap-1 md:gap-2 text-on-surface-variant">
          <button
            onClick={() => otherMember && startCall(otherMember, 'voice')}
            title="Start voice call"
            className="w-10 h-10 rounded-full flex items-center justify-center text-primary hover:bg-surface-container-high transition-colors active:scale-95"
          >
            <span className="material-symbols-outlined text-2xl">call</span>
          </button>
          <button
            onClick={() => otherMember && startCall(otherMember, 'video')}
            title="Start video call"
            className="w-10 h-10 rounded-full flex items-center justify-center text-primary hover:bg-surface-container-high transition-colors active:scale-95"
          >
            <span className="material-symbols-outlined text-2xl">videocam</span>
          </button>
          <div className="hidden md:block w-px h-6 bg-outline-variant mx-1"></div>
          <button
            onClick={() => setShowContactInfo(!showContactInfo)}
            title="View contact info"
            className="w-10 h-10 rounded-full flex items-center justify-center hover:bg-surface-container-high transition-colors active:scale-95"
          >
            <span className="material-symbols-outlined text-2xl">more_vert</span>
          </button>
        </div>
      </header>

      {/* Typing status bar */}
      {isOtherTyping && (
        <div className="h-7 px-6 bg-surface-container-low/60 border-b border-outline-variant/30 flex items-center gap-2 text-xs text-on-surface-variant italic shrink-0">
          <span>{displayName} is typing</span>
          <div className="flex gap-1">
            <div className="w-1.5 h-1.5 bg-primary/70 rounded-full typing-dot"></div>
            <div className="w-1.5 h-1.5 bg-primary/70 rounded-full typing-dot"></div>
            <div className="w-1.5 h-1.5 bg-primary/70 rounded-full typing-dot"></div>
          </div>
        </div>
      )}

      {/* Messages Canvas */}
      <div className="flex-1 overflow-y-auto p-4 md:p-6 flex flex-col gap-4">
        {/* Date Divider */}
        <div className="flex justify-center my-2">
          <span className="bg-surface-container px-4 py-1 rounded-full text-xs font-semibold text-on-surface-variant shadow-sm border border-outline-variant/40">
            Today
          </span>
        </div>

        {isLoading ? (
          <div className="flex justify-center py-10">
            <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin"></div>
          </div>
        ) : messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-center text-on-surface-variant">
            <p className="text-sm font-medium mb-1">No messages here yet</p>
            <p className="text-xs">Send a wave or say hello to {displayName}!</p>
          </div>
        ) : (
          messages.map((msg, index) => {
            const isMe = msg.sender_id === currentUser?.user_id;
            const timeStr = new Date(msg.created_at).toLocaleTimeString([], {
              hour: '2-digit',
              minute: '2-digit',
            });

            return (
              <div
                key={msg.id}
                className={`flex flex-col ${
                  isMe ? 'items-end self-end' : 'items-start self-start'
                } max-w-[85%] md:max-w-[75%] group relative`}
              >
                {/* Reply To Preview */}
                {msg.reply_to && (
                  <div
                    className={`text-xs p-2 mb-1 rounded-lg border-l-2 ${
                      isMe
                        ? 'bg-primary-container/20 text-on-primary border-white'
                        : 'bg-surface-container text-on-surface-variant border-primary'
                    }`}
                  >
                    <span className="font-semibold block">
                      {msg.reply_to.sender?.full_name || 'Reply'}
                    </span>
                    <span className="truncate block opacity-80">{msg.reply_to.content}</span>
                  </div>
                )}

                {/* Message Bubble */}
                {msg.is_deleted ? (
                  <div className="bg-surface text-on-surface-variant italic border border-outline-variant/60 shadow-sm text-sm p-3 rounded-2xl">
                    <span className="material-symbols-outlined text-sm align-middle mr-1">block</span>
                    This message was deleted
                  </div>
                ) : msg.message_type === 'voice' ? (
                  /* Voice Note Bubble */
                  <div
                    className={`border shadow-sm p-3 rounded-2xl ${
                      isMe
                        ? 'bg-primary text-on-primary border-primary rounded-br-sm'
                        : 'bg-surface text-on-surface border-outline-variant rounded-bl-sm'
                    } w-64 md:w-72`}
                  >
                    <div className="flex items-center gap-3">
                      <button
                        onClick={() => msg.file_url && togglePlayAudio(msg.id, msg.file_url)}
                        className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 shadow-sm active:scale-95 transition-transform ${
                          isMe
                            ? 'bg-white text-primary'
                            : 'bg-primary-container text-on-primary-container'
                        }`}
                      >
                        <span className="material-symbols-outlined fill" style={{ fontVariationSettings: "'FILL' 1" }}>
                          {playingAudioId === msg.id ? 'pause' : 'play_arrow'}
                        </span>
                      </button>

                      {/* Waveform Visualization */}
                      <div className="flex-1 flex items-center gap-[2px] h-8 opacity-80">
                        {[4, 8, 14, 7, 18, 12, 6, 16, 9, 14, 5, 10, 7].map((height, i) => (
                          <div
                            key={i}
                            className={`w-1 rounded-full transition-all duration-200 ${
                              isMe ? 'bg-white' : 'bg-primary'
                            }`}
                            style={{
                              height: `${height}px`,
                              opacity: (audioProgress[msg.id] || 0) > (i / 13) * 100 ? 1 : 0.4,
                            }}
                          ></div>
                        ))}
                      </div>
                    </div>

                    <div className="flex justify-between items-center mt-2 px-1 text-xs">
                      <span className={isMe ? 'text-white/90' : 'text-primary font-medium'}>
                        {msg.duration_seconds
                          ? `0:${msg.duration_seconds.toString().padStart(2, '0')}`
                          : 'Voice message'}
                      </span>
                    </div>
                  </div>
                ) : msg.message_type === 'image' ? (
                  /* Image Attachment */
                  <div
                    className={`rounded-2xl overflow-hidden border shadow-sm ${
                      isMe ? 'border-primary rounded-br-sm' : 'border-outline-variant rounded-bl-sm'
                    } max-w-sm cursor-pointer`}
                    onClick={() => msg.file_url && setSelectedImagePreview(msg.file_url)}
                  >
                    <img
                      src={msg.file_url || ''}
                      alt="Shared media"
                      className="w-full max-h-72 object-cover hover:opacity-95 transition-opacity"
                    />
                  </div>
                ) : msg.message_type === 'file' ? (
                  /* File Document Attachment */
                  <a
                    href={msg.file_url || '#'}
                    target="_blank"
                    rel="noreferrer"
                    className={`border shadow-sm p-3 rounded-2xl flex items-center gap-3 hover:bg-surface-container-low transition-colors w-64 ${
                      isMe
                        ? 'bg-primary text-on-primary border-primary rounded-br-sm'
                        : 'bg-surface text-on-surface border-outline-variant rounded-bl-sm'
                    }`}
                  >
                    <div
                      className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
                        isMe ? 'bg-white/20 text-white' : 'bg-error-container text-on-error-container'
                      }`}
                    >
                      <span className="material-symbols-outlined">
                        {msg.file_name?.endsWith('.pdf') ? 'picture_as_pdf' : 'description'}
                      </span>
                    </div>
                    <div className="flex flex-col min-w-0 flex-1">
                      <span className="font-semibold text-xs truncate">
                        {msg.file_name || 'Document'}
                      </span>
                      <span className="text-[10px] opacity-80">{msg.file_size || 'Download'}</span>
                    </div>
                  </a>
                ) : (
                  /* Text Message Bubble */
                  <div
                    className={`p-3.5 shadow-sm text-sm leading-relaxed rounded-2xl ${
                      isMe
                        ? 'bg-primary text-on-primary rounded-br-sm'
                        : 'bg-surface text-on-surface border border-outline-variant rounded-bl-sm'
                    }`}
                  >
                    {msg.content}
                  </div>
                )}

                {/* Timestamp & checkmarks */}
                <div
                  className={`flex items-center gap-1 mt-1 text-[11px] text-on-surface-variant ${
                    isMe ? 'pr-1' : 'pl-1'
                  }`}
                >
                  <span>{timeStr}</span>
                  {isMe && (
                    <span
                      className={`material-symbols-outlined text-[15px] ${
                        msg.is_read ? 'text-primary fill' : 'text-outline'
                      }`}
                      style={{ fontVariationSettings: msg.is_read ? "'FILL' 1" : "'FILL' 0" }}
                    >
                      done_all
                    </span>
                  )}

                  {/* Context menu trigger */}
                  <div className="opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1 ml-2">
                    <button
                      onClick={() => setReplyingTo(msg)}
                      title="Reply"
                      className="p-1 hover:bg-surface-container rounded text-outline hover:text-on-surface"
                    >
                      <span className="material-symbols-outlined text-xs">reply</span>
                    </button>
                    <button
                      onClick={() => {
                        if (msg.content) {
                          navigator.clipboard.writeText(msg.content);
                        }
                      }}
                      title="Copy text"
                      className="p-1 hover:bg-surface-container rounded text-outline hover:text-on-surface"
                    >
                      <span className="material-symbols-outlined text-xs">content_copy</span>
                    </button>
                    {isMe && !msg.is_deleted && (
                      <button
                        onClick={() => handleDeleteMessage(msg.id)}
                        title="Delete"
                        className="p-1 hover:bg-error-container hover:text-error rounded text-outline"
                      >
                        <span className="material-symbols-outlined text-xs">delete</span>
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })
        )}
        <div ref={scrollAnchorRef} className="h-2" />
      </div>

      {/* Reply bar if active */}
      {replyingTo && (
        <div className="px-6 py-2 bg-surface-container-low border-t border-outline-variant flex justify-between items-center shrink-0">
          <div className="flex items-center gap-2 overflow-hidden">
            <span className="material-symbols-outlined text-primary text-sm">reply</span>
            <span className="text-xs text-on-surface font-semibold truncate">
              Replying to {replyingTo.sender?.full_name || 'Message'}:
            </span>
            <span className="text-xs text-on-surface-variant truncate">{replyingTo.content}</span>
          </div>
          <button
            onClick={() => setReplyingTo(null)}
            className="w-6 h-6 rounded-full hover:bg-surface-container flex items-center justify-center text-outline"
          >
            <span className="material-symbols-outlined text-sm">close</span>
          </button>
        </div>
      )}

      {/* Emoji Picker Popover */}
      {showEmojiPicker && (
        <div className="absolute bottom-20 left-6 z-30 bg-surface rounded-2xl shadow-xl border border-outline-variant p-3 flex gap-2 flex-wrap max-w-xs">
          {['😀', '😍', '👍', '🔥', '🎉', '❤️', '😂', '👏', '🙌', '✨', '🚀', '💯'].map(
            (emoji) => (
              <button
                key={emoji}
                onClick={() => {
                  setInputText((prev) => prev + emoji);
                  setShowEmojiPicker(false);
                }}
                className="text-xl p-1.5 hover:bg-surface-container rounded-lg transition-transform active:scale-125"
              >
                {emoji}
              </button>
            )
          )}
        </div>
      )}

      {/* Bottom Composer Area */}
      <div className="p-3 md:p-4 bg-surface border-t border-outline-variant shrink-0 relative z-20 pb-safe">
        <input
          type="file"
          ref={fileInputRef}
          onChange={handleFileUpload}
          className="hidden"
          accept="image/*,.pdf,.doc,.docx,.txt"
        />

        {isRecording ? (
          /* Live Voice Recording UI */
          <div className="flex items-center justify-between max-w-4xl mx-auto bg-surface-container-low rounded-full px-4 py-2 border border-primary">
            <div className="flex items-center gap-3">
              <span className="w-3 h-3 rounded-full bg-error animate-pulse"></span>
              <span className="text-sm font-semibold text-primary">
                Recording 0:{recordingSeconds.toString().padStart(2, '0')}
              </span>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={cancelVoiceRecording}
                className="p-2 text-outline hover:text-error transition-colors"
                title="Cancel"
              >
                <span className="material-symbols-outlined">delete</span>
              </button>
              <button
                onClick={stopVoiceRecording}
                className="w-10 h-10 rounded-full bg-primary text-on-primary flex items-center justify-center shadow-md active:scale-95"
                title="Send voice note"
              >
                <span className="material-symbols-outlined">send</span>
              </button>
            </div>
          </div>
        ) : (
          /* Standard Composer UI */
          <div className="flex items-end gap-2 max-w-4xl mx-auto">
            {/* Attachment Button */}
            <button
              onClick={() => fileInputRef.current?.click()}
              title="Attach media or document"
              className="w-11 h-11 shrink-0 rounded-full flex items-center justify-center text-on-surface-variant hover:bg-surface-container hover:text-primary transition-colors active:scale-95 mb-0.5"
            >
              <span className="material-symbols-outlined text-2xl">add_circle</span>
            </button>

            {/* Input field */}
            <div className="flex-1 relative bg-surface-container-low rounded-3xl border border-outline-variant/60 focus-within:border-primary focus-within:ring-1 focus-within:ring-primary shadow-sm transition-all flex items-end">
              <button
                type="button"
                onClick={() => setShowEmojiPicker(!showEmojiPicker)}
                className="w-11 h-11 shrink-0 rounded-full flex items-center justify-center text-on-surface-variant hover:text-primary transition-colors absolute left-0 bottom-0"
              >
                <span className="material-symbols-outlined text-xl">mood</span>
              </button>

              <textarea
                value={inputText}
                onChange={handleInputChange}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    handleSendMessage('text');
                  }
                }}
                placeholder="Type a message..."
                rows={1}
                className="w-full bg-transparent border-none font-body-md text-sm text-on-surface placeholder:text-outline focus:ring-0 resize-none py-3 pl-11 pr-11 min-h-[44px] max-h-[120px] outline-none rounded-3xl"
              />

              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="w-11 h-11 shrink-0 rounded-full flex items-center justify-center text-on-surface-variant hover:text-primary transition-colors absolute right-0 bottom-0"
              >
                <span className="material-symbols-outlined text-xl">attach_file</span>
              </button>
            </div>

            {/* Mic / Send Button */}
            {inputText.trim().length > 0 ? (
              <button
                onClick={() => handleSendMessage('text')}
                disabled={isSending}
                className="w-12 h-12 shrink-0 rounded-full bg-primary text-on-primary flex items-center justify-center shadow-md hover:bg-primary/90 transition-all active:scale-90 mb-0.5 shadow-primary/20"
              >
                <span className="material-symbols-outlined ml-0.5">send</span>
              </button>
            ) : (
              <button
                onClick={startVoiceRecording}
                title="Hold or click to record voice note"
                className="w-12 h-12 shrink-0 rounded-full bg-primary text-on-primary flex items-center justify-center shadow-md hover:bg-primary/90 transition-all active:scale-90 mb-0.5 shadow-primary/20"
              >
                <span className="material-symbols-outlined text-2xl">mic</span>
              </button>
            )}
          </div>
        )}
      </div>

      {/* Image Lightbox Preview */}
      {selectedImagePreview && (
        <div
          onClick={() => setSelectedImagePreview(null)}
          className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center p-4 backdrop-blur-md"
        >
          <img
            src={selectedImagePreview}
            alt="Preview"
            className="max-w-full max-h-[90vh] object-contain rounded-xl shadow-2xl"
          />
          <button
            onClick={() => setSelectedImagePreview(null)}
            className="absolute top-6 right-6 w-10 h-10 rounded-full bg-white/20 text-white flex items-center justify-center hover:bg-white/30"
          >
            <span className="material-symbols-outlined">close</span>
          </button>
        </div>
      )}
    </div>
  );
};
