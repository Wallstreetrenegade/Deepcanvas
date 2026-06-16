import { useState } from 'react';
import { JitsiMeeting } from '@jitsi/react-sdk';
import './MeetingWorkspace.css';

export function MeetingWorkspace({ onExit }: { onExit: () => void }) {
  // Generate a random default room name
  const [roomName, setRoomName] = useState(`exclaw-meeting-${Math.random().toString(36).substring(2, 10)}`);
  const [inMeeting, setInMeeting] = useState(false);
  const [draftRoom, setDraftRoom] = useState('');

  const handleJoin = () => {
    if (draftRoom.trim()) {
      setRoomName(draftRoom.trim());
    }
    setInMeeting(true);
  };

  return (
    <div className="feature-meeting animate-rise">
      <div className="feature-meeting__header">
        <h2>Video Meetings</h2>
        <button className="feature-workspace__back" onClick={onExit}>Back to chat</button>
      </div>
      <div className="feature-meeting__content">
        {!inMeeting ? (
          <div className="feature-meeting__join-card">
            <h3>Join or Create a Meeting</h3>
            <p className="text-sm text-text-muted mb-4">
              Enter a room name to join an existing meeting, or leave it blank to create a new one.
            </p>
            <input
              type="text"
              placeholder="Meeting room name (optional)"
              value={draftRoom}
              onChange={(e) => setDraftRoom(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleJoin()}
              className="feature-meeting__input"
            />
            <button className="feature-meeting__join-btn" onClick={handleJoin}>
              Join Meeting
            </button>
          </div>
        ) : (
          <div className="feature-meeting__video-container">
            <button className="feature-meeting__leave-btn" onClick={() => setInMeeting(false)}>
              Leave Meeting
            </button>
            <JitsiMeeting
              domain="meet.jit.si"
              roomName={roomName}
              configOverwrite={{
                startWithAudioMuted: true,
                startWithVideoMuted: true,
                disableModeratorIndicator: true,
                enableEmailInStats: false,
                prejoinPageEnabled: false
              }}
              interfaceConfigOverwrite={{
                DISABLE_JOIN_LEAVE_NOTIFICATIONS: true
              }}
              userInfo={{
                displayName: 'Exclaw User',
                email: 'user@exclaw.local'
              }}
              getIFrameRef={(iframeRef) => {
                iframeRef.style.height = '100%';
                iframeRef.style.width = '100%';
                iframeRef.style.border = 'none';
              }}
            />
          </div>
        )}
      </div>
    </div>
  );
}
