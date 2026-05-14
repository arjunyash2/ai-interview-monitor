import { useState, useCallback } from 'react';

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000/api';

export function useSession() {
  const [sessionId, setSessionId] = useState(null);

  const startSession = useCallback(async (data = {}) => {
    try {
      const res = await fetch(`${API}/sessions/start/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      const json = await res.json();
      setSessionId(json.session_id);
      return json.session_id;
    } catch (err) {
      console.warn('Could not start session on backend:', err.message);
      // Return a local ID if backend is unavailable
      const localId = crypto.randomUUID();
      setSessionId(localId);
      return localId;
    }
  }, []);

  const logEmotionSnapshot = useCallback(async (sid, detection) => {
    if (!sid) return;
    const { emotions = {}, gaze = {}, headPose = {} } = detection;
    try {
      await fetch(`${API}/sessions/${sid}/emotions/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          session: sid,
          happy: emotions.happy || 0,
          neutral: emotions.neutral || 0,
          confused: emotions.confused || 0,
          focused: emotions.focused || 0,
          nervous: emotions.nervous || 0,
          engaged: emotions.engaged || 0,
          disengaged: emotions.disengaged || 0,
          suspicious: emotions.suspicious || 0,
          dominant: emotions.dominant || 'neutral',
          gaze_direction: gaze.horizontal || 'center',
          looking_at_camera: gaze.lookingAtCamera ?? true,
          gaze_x: gaze.x || 0.5,
          gaze_y: gaze.y || 0.5,
          head_yaw: headPose.yaw || 0.5,
          head_pitch: headPose.pitch || 0.45,
          head_roll: headPose.roll || 0,
        }),
      });
    } catch (_) {}
  }, []);

  const logEvent = useCallback(async (sid, event) => {
    if (!sid) return;
    try {
      await fetch(`${API}/sessions/${sid}/events/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          event_type: event.type,
          severity: event.severity,
          message: event.message,
          metadata: event.metadata || {},
        }),
      });
    } catch (err) {
      // Silent fail — don't break the monitoring
    }
  }, []);

  const endSession = useCallback(async (sid, scores) => {
    if (!sid) return null;
    try {
      const res = await fetch(`${API}/sessions/${sid}/end/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(scores),
      });
      return await res.json();
    } catch (err) {
      console.warn('Could not end session on backend:', err.message);
      return null;
    }
  }, []);

  return { sessionId, startSession, logEvent, logEmotionSnapshot, endSession };
}