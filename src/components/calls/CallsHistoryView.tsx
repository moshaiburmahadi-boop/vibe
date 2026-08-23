import React from 'react';
import { useAuth } from '../../context/AuthContext';

export const CallsHistoryView: React.FC = () => {
  const { startCall, setActiveTab } = useAuth();

  const [callHistory, setCallHistory] = React.useState<Array<{
    id: string;
    name: string;
    phone: string;
    type: 'incoming' | 'outgoing' | 'missed';
    mode: 'voice' | 'video';
    time: string;
    avatar: string;
    duration: string;
    status: string;
  }>>([]);

  return (
    <div className="flex-1 flex flex-col h-full bg-background overflow-hidden relative pb-20 md:pb-0">
      {/* TopAppBar */}
      <header className="bg-surface/80 backdrop-blur-md border-b border-outline-variant flex justify-between items-center w-full px-4 md:px-8 h-16 shrink-0">
        <h1 className="text-2xl md:text-3xl font-bold text-primary tracking-tight">Calls</h1>
      </header>

      {/* Main calls list */}
      <main className="flex-1 overflow-y-auto w-full flex flex-col pt-4 px-4 md:px-8 max-w-4xl mx-auto">
        {callHistory.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 px-4 text-center text-on-surface-variant">
            <div className="w-16 h-16 rounded-full bg-surface-container-high flex items-center justify-center mb-3 text-primary">
              <span className="material-symbols-outlined text-3xl">call</span>
            </div>
            <p className="font-bold text-base text-on-surface mb-1">No call history yet</p>
            <p className="text-xs text-on-surface-variant max-w-xs mb-4">
              Voice and video calls made or received with your contacts will appear here.
            </p>
            <button
              onClick={() => setActiveTab('contacts')}
              className="px-5 py-2.5 rounded-full bg-primary text-on-primary text-xs font-semibold hover:bg-primary-container shadow-md transition-transform active:scale-95"
            >
              View Contacts to Call
            </button>
          </div>
        ) : (
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
        )}
      </main>
    </div>
  );
};
