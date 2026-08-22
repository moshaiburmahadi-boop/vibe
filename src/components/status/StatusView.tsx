import React, { useState } from 'react';
import { useAuth } from '../../context/AuthContext';

export const StatusView: React.FC = () => {
  const { currentUser } = useAuth();
  const [myStatusText, setMyStatusText] = useState('');
  const [showStatusModal, setShowStatusModal] = useState(false);

  const statuses = [
    {
      id: '1',
      name: 'Sarah Jenkins',
      avatar: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=150',
      time: '32 minutes ago',
      media: 'https://images.unsplash.com/photo-1486406146926-c627a92ad1ab?w=800',
      caption: 'Design sprint week in Seattle! 🚀',
    },
    {
      id: '2',
      name: 'Marcus Chen',
      avatar: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=150',
      time: '2 hours ago',
      media: 'https://images.unsplash.com/photo-1497215728101-856f4ea42174?w=800',
      caption: 'New workspace setup completed.',
    },
  ];

  const [activeStory, setActiveStory] = useState<(typeof statuses)[0] | null>(null);

  return (
    <div className="flex-1 flex flex-col h-full bg-background overflow-hidden relative pb-20 md:pb-0">
      {/* TopAppBar */}
      <header className="bg-surface/80 backdrop-blur-md border-b border-outline-variant flex justify-between items-center w-full px-4 md:px-8 h-16 shrink-0">
        <h1 className="text-2xl md:text-3xl font-bold text-primary tracking-tight">Status</h1>
      </header>

      <main className="flex-1 overflow-y-auto w-full flex flex-col pt-4 px-4 md:px-8 max-w-4xl mx-auto">
        {/* My Status Card */}
        <div className="flex items-center justify-between p-4 bg-surface rounded-2xl border border-outline-variant/60 shadow-sm mb-6">
          <div className="flex items-center gap-3.5">
            <div className="relative w-13 h-13 rounded-full">
              <img
                src={
                  currentUser?.avatar_url ||
                  `https://api.dicebear.com/7.x/avataaars/svg?seed=${encodeURIComponent(
                    currentUser?.full_name || 'Me'
                  )}`
                }
                alt="My Status"
                className="w-12 h-12 rounded-full object-cover border-2 border-primary"
              />
              <button
                onClick={() => setShowStatusModal(true)}
                className="absolute bottom-0 right-0 w-4 h-4 rounded-full bg-primary text-white flex items-center justify-center border-2 border-surface"
              >
                <span className="material-symbols-outlined text-[10px]">add</span>
              </button>
            </div>
            <div>
              <h3 className="font-semibold text-sm text-on-surface">My Status</h3>
              <p className="text-xs text-on-surface-variant">Tap to add status update</p>
            </div>
          </div>

          <button
            onClick={() => setShowStatusModal(true)}
            className="w-10 h-10 rounded-full flex items-center justify-center bg-surface-container text-primary hover:bg-primary hover:text-white transition-colors"
          >
            <span className="material-symbols-outlined">photo_camera</span>
          </button>
        </div>

        {/* Recent Updates */}
        <h2 className="font-semibold text-base text-on-surface mb-3">Recent updates</h2>
        <div className="flex flex-col gap-3 pb-12">
          {statuses.map((item) => (
            <div
              key={item.id}
              onClick={() => setActiveStory(item)}
              className="flex items-center gap-3.5 p-3 bg-surface rounded-2xl border border-outline-variant/60 hover:bg-surface-container-low transition-colors cursor-pointer shadow-sm"
            >
              <div className="w-13 h-13 p-0.5 rounded-full border-2 border-primary flex items-center justify-center">
                <img
                  src={item.avatar}
                  alt={item.name}
                  className="w-11 h-11 rounded-full object-cover"
                />
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="font-semibold text-sm text-on-surface truncate">{item.name}</h3>
                <p className="text-xs text-on-surface-variant">{item.time}</p>
              </div>
            </div>
          ))}
        </div>
      </main>

      {/* Story Viewer Modal */}
      {activeStory && (
        <div className="fixed inset-0 z-50 bg-black flex flex-col justify-between items-center p-4">
          {/* Top story header */}
          <div className="w-full max-w-lg flex justify-between items-center z-10 pt-4">
            <div className="flex items-center gap-3">
              <img
                src={activeStory.avatar}
                alt={activeStory.name}
                className="w-10 h-10 rounded-full object-cover border border-white/40"
              />
              <div>
                <h4 className="text-white font-bold text-sm">{activeStory.name}</h4>
                <p className="text-white/70 text-xs">{activeStory.time}</p>
              </div>
            </div>
            <button
              onClick={() => setActiveStory(null)}
              className="w-8 h-8 rounded-full bg-white/20 text-white flex items-center justify-center hover:bg-white/30"
            >
              <span className="material-symbols-outlined">close</span>
            </button>
          </div>

          {/* Story media */}
          <div className="max-w-lg w-full flex-1 flex flex-col items-center justify-center my-4 overflow-hidden rounded-2xl relative">
            <img
              src={activeStory.media}
              alt="Story"
              className="w-full h-full object-contain max-h-[70vh] rounded-2xl"
            />
            {activeStory.caption && (
              <div className="absolute bottom-6 left-0 right-0 bg-black/60 backdrop-blur-md p-3 mx-4 rounded-xl text-center text-white text-sm">
                {activeStory.caption}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Add Status modal */}
      {showStatusModal && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-surface rounded-3xl max-w-md w-full p-6 shadow-2xl border border-outline-variant">
            <div className="flex justify-between items-center mb-4">
              <h3 className="font-bold text-lg text-on-surface">Update Status</h3>
              <button
                onClick={() => setShowStatusModal(false)}
                className="w-8 h-8 rounded-full flex items-center justify-center text-outline hover:bg-surface-container"
              >
                <span className="material-symbols-outlined">close</span>
              </button>
            </div>
            <textarea
              value={myStatusText}
              onChange={(e) => setMyStatusText(e.target.value)}
              placeholder="What's on your mind? (24h status)"
              className="w-full h-24 p-3 border border-outline-variant rounded-2xl bg-surface-container-low text-sm outline-none focus:ring-2 focus:ring-primary mb-4 resize-none"
            />
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setShowStatusModal(false)}
                className="px-4 py-2 rounded-full border border-outline-variant text-xs font-semibold"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  alert('Status updated!');
                  setShowStatusModal(false);
                  setMyStatusText('');
                }}
                className="px-5 py-2 rounded-full bg-primary text-on-primary text-xs font-semibold hover:bg-primary-container"
              >
                Post Status
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
