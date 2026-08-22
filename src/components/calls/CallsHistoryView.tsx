import React from 'react';
import { useAuth } from '../../context/AuthContext';

export const CallsHistoryView: React.FC = () => {
  const { startCall } = useAuth();

  const callHistory = [
    {
      id: '1',
      name: 'Sarah Jenkins',
      phone: '+1 (555) 234-5678',
      type: 'incoming',
      mode: 'voice',
      time: 'Today, 10:42 AM',
      avatar: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=150',
      duration: '4m 12s',
      status: 'completed',
    },
    {
      id: '2',
      name: 'Marcus Chen',
      phone: '+1 (555) 876-5432',
      type: 'outgoing',
      mode: 'video',
      time: 'Yesterday, 4:15 PM',
      avatar: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=150',
      duration: '12m 30s',
      status: 'completed',
    },
    {
      id: '3',
      name: 'Elena Rostova',
      phone: '+1 (555) 345-6789',
      type: 'missed',
      mode: 'voice',
      time: 'Oct 24, 11:20 AM',
      avatar: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150',
      duration: 'Missed',
      status: 'missed',
    },
  ];

  return (
    <div className="flex-1 flex flex-col h-full bg-background overflow-hidden relative pb-20 md:pb-0">
      {/* TopAppBar */}
      <header className="bg-surface/80 backdrop-blur-md border-b border-outline-variant flex justify-between items-center w-full px-4 md:px-8 h-16 shrink-0">
        <h1 className="text-2xl md:text-3xl font-bold text-primary tracking-tight">Calls</h1>
      </header>

      {/* Main calls list */}
      <main className="flex-1 overflow-y-auto w-full flex flex-col pt-4 px-4 md:px-8 max-w-4xl mx-auto">
        <div className="flex flex-col gap-2.5 pb-12">
          {callHistory.map((call) => (
            <div
              key={call.id}
              className="flex items-center justify-between p-3.5 bg-surface rounded-2xl border border-outline-variant/60 hover:bg-surface-container-low transition-colors shadow-sm"
            >
              <div className="flex items-center gap-3.5">
                <img
                  src={call.avatar}
                  alt={call.name}
                  className="w-12 h-12 rounded-full object-cover border border-outline-variant/60"
                />
                <div>
                  <h3
                    className={`font-semibold text-sm ${
                      call.type === 'missed' ? 'text-error' : 'text-on-surface'
                    }`}
                  >
                    {call.name}
                  </h3>
                  <div className="flex items-center gap-1.5 text-xs text-on-surface-variant mt-0.5">
                    <span
                      className={`material-symbols-outlined text-[15px] ${
                        call.type === 'missed'
                          ? 'text-error'
                          : call.type === 'incoming'
                          ? 'text-tertiary-fixed-dim'
                          : 'text-primary'
                      }`}
                    >
                      {call.type === 'missed'
                        ? 'call_missed'
                        : call.type === 'incoming'
                        ? 'call_received'
                        : 'call_made'}
                    </span>
                    <span>{call.time}</span>
                    <span>•</span>
                    <span>{call.duration}</span>
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={() =>
                    startCall(
                      {
                        id: `prof_${call.id}`,
                        user_id: `user_${call.id}`,
                        phone_number: call.phone,
                        full_name: call.name,
                        avatar_url: call.avatar,
                        created_at: new Date().toISOString(),
                        updated_at: new Date().toISOString(),
                      },
                      call.mode as 'voice' | 'video'
                    )
                  }
                  title="Call back"
                  className="w-10 h-10 rounded-full flex items-center justify-center bg-surface-container text-primary hover:bg-primary hover:text-white transition-colors"
                >
                  <span className="material-symbols-outlined text-xl">
                    {call.mode === 'video' ? 'videocam' : 'call'}
                  </span>
                </button>
              </div>
            </div>
          ))}
        </div>
      </main>
    </div>
  );
};
