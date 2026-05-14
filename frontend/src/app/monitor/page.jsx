'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import { useFaceMesh } from '../../hooks/useFaceMesh';
import { useAudioMonitor } from '../../hooks/useAudioMonitor';
import { useTabDetection } from '../../hooks/useTabDetection';
import { useSession } from '../../hooks/useSession';
import { calculateScores } from '../../lib/emotions';

export default function MonitorPage() {
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const [phase, setPhase] = useState('idle');
  const [elapsed, setElapsed] = useState(0);
  const startTimeRef = useRef(null);

  const [detection, setDetection] = useState({
    faceCount: 0, emotions: {}, gaze: {}, headPose: {}, ear: {}
  });

  const [stats, setStats] = useState({
    tabSwitchCount: 0, faceAbsentCount: 0, multiFaceCount: 0,
    lookAwayCount: 0, audioAnomalyCount: 0, nodCount: 0,
    attentionScore: 100, integrityScore: 100, engagementScore: 100,
    overallScore: 100,
  });

  const [events, setEvents] = useState([]);
  const [warnings, setWarnings] = useState([]);
  const statsRef = useRef(stats);
  statsRef.current = stats;

  const { sessionId, startSession, logEvent, logEmotionSnapshot, endSession } = useSession();

  const lastWarningRef = useRef({});
  const idCounterRef = useRef(0);
  const addWarning = useCallback((event) => {
    const now = Date.now();
    const last = lastWarningRef.current[event.type] || 0;
    if (now - last < 5000) return;
    lastWarningRef.current[event.type] = now;

    const timestamp = new Date().toLocaleTimeString();
    const evt = { ...event, timestamp, id: `${now}-${++idCounterRef.current}` };

    setEvents(prev => [...prev.slice(-99), evt]);
    if (event.severity === 'warning' || event.severity === 'danger') {
      setWarnings(prev => [...prev, evt]);
      setTimeout(() => setWarnings(prev => prev.filter(w => w.id !== evt.id)), 4000);
    }

    setStats(prev => {
      const next = { ...prev };
      if (event.type === 'tab_switch') next.tabSwitchCount += 1;
      if (event.type === 'face_absent') next.faceAbsentCount += 1;
      if (event.type === 'multi_face') next.multiFaceCount += 1;
      if (event.type === 'gaze_away') next.lookAwayCount += 1;
      if (event.type === 'audio_spike') next.audioAnomalyCount += 1;

      const scores = calculateScores(next);
      return { ...next, ...scores,
        attentionScore: scores.attention,
        integrityScore: scores.integrity,
        engagementScore: scores.engagement,
        overallScore: scores.overall,
      };
    });

    if (sessionId && event.severity !== 'info') {
      logEvent(sessionId, event);
    }
  }, [sessionId, logEvent]);

  const { initialize, stop: stopFaceMesh } = useFaceMesh({
    onDetection: setDetection,
    onWarning: addWarning,
    active: phase === 'monitoring',
  });

  const { start: startAudio, stop: stopAudio } = useAudioMonitor({
    onAnomaly: addWarning,
    active: phase === 'monitoring',
  });

  useTabDetection({ onSwitch: addWarning, active: phase === 'monitoring' });

  useEffect(() => {
    if (phase !== 'monitoring') return;
    startTimeRef.current = Date.now();
    const t = setInterval(() => {
      setElapsed(Math.floor((Date.now() - startTimeRef.current) / 1000));
    }, 1000);
    return () => clearInterval(t);
  }, [phase]);

  // Emotion snapshot every 10 seconds
  const detectionRef = useRef(detection);
  detectionRef.current = detection;
  const sessionIdRef = useRef(sessionId);
  sessionIdRef.current = sessionId;

  useEffect(() => {
    if (phase !== 'monitoring') return;
    const t = setInterval(() => {
      if (sessionIdRef.current) {
        logEmotionSnapshot(sessionIdRef.current, detectionRef.current);
      }
    }, 10000);
    return () => clearInterval(t);
  }, [phase, logEmotionSnapshot]);

  const handleStart = useCallback(async () => {
    setPhase('loading');
    const sid = await startSession({ job_role: 'Technical Interview' });
    await initialize(videoRef.current, canvasRef.current);
    await startAudio();
    setPhase('monitoring');
    addWarning({ type: 'system', severity: 'info', message: 'Session started' });
  }, [initialize, startAudio, startSession, addWarning]);

  const handleStop = useCallback(async () => {
    stopFaceMesh();
    stopAudio();
    if (sessionId) {
      await endSession(sessionId, {
        duration_seconds: elapsed,
        attention_score: stats.attentionScore,
        integrity_score: stats.integrityScore,
        engagement_score: stats.engagementScore,
        confidence_score: 100,
        overall_score: stats.overallScore,
        tab_switch_count: stats.tabSwitchCount,
        face_absent_count: stats.faceAbsentCount,
        multi_face_count: stats.multiFaceCount,
        look_away_count: stats.lookAwayCount,
        audio_anomaly_count: stats.audioAnomalyCount,
      });
    }
    setPhase('report');
  }, [stopFaceMesh, stopAudio, sessionId, endSession, elapsed, stats]);

  const formatTime = s =>
    `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;

  const scoreColor = s => s >= 80 ? '#3B82F6' : s >= 60 ? '#F59E0B' : '#EF4444';
  const mono = { fontFamily: "'Fira Code', monospace" };
  const sans = { fontFamily: "'Fira Sans', sans-serif" };

  const emo = detection.emotions || {};
  const emotionEntries = Object.entries(emo)
    .filter(([k]) => !['dominant', 'dominantScore'].includes(k))
    .sort((a, b) => b[1] - a[1]);

  const emoColors = {
    happy: '#3B82F6', focused: '#60A5FA', engaged: '#818CF8',
    confused: '#F59E0B', nervous: '#F97316', disengaged: '#94A3B8', suspicious: '#EF4444'
  };

  // Report data (only relevant when phase === 'report')
  const verdict = stats.overallScore >= 80 ? 'RECOMMENDED'
    : stats.overallScore >= 65 ? 'REVIEW' : 'FLAGGED';
  const verdictColor = stats.overallScore >= 80 ? '#3B82F6'
    : stats.overallScore >= 65 ? '#F59E0B' : '#EF4444';
  const flagged = events.filter(e => e.severity === 'danger');

  const downloadReport = useCallback(() => {
    const date = new Date().toLocaleString();
    const lines = [
      '════════════════════════════════════════════════════════',
      '         AI INTERVIEW MONITOR — SESSION REPORT         ',
      '════════════════════════════════════════════════════════',
      '',
      `Date/Time        : ${date}`,
      `Session ID       : ${sessionId || 'N/A'}`,
      `Job Role         : Technical Interview`,
      `Duration         : ${formatTime(elapsed)}`,
      '',
      '── VERDICT ──────────────────────────────────────────────',
      `  ${verdict}`,
      '',
      '── SCORES ───────────────────────────────────────────────',
      `  Overall Score  : ${stats.overallScore} / 100`,
      `  Attention      : ${stats.attentionScore} / 100`,
      `  Integrity      : ${stats.integrityScore} / 100`,
      `  Engagement     : ${stats.engagementScore} / 100`,
      '',
      '── INCIDENT COUNTS ──────────────────────────────────────',
      `  Tab Switches   : ${stats.tabSwitchCount}`,
      `  Face Absent    : ${stats.faceAbsentCount}`,
      `  Multiple Faces : ${stats.multiFaceCount}`,
      `  Gaze Away      : ${stats.lookAwayCount}`,
      `  Audio Anomalies: ${stats.audioAnomalyCount}`,
      '',
      `── FLAGGED EVENTS (${flagged.length}) ──────────────────────────────`,
      ...(flagged.length === 0
        ? ['  No critical events — clean session']
        : flagged.map(e => `  [${e.timestamp}]  ${e.message}`)),
      '',
      '── FULL EVENT LOG ───────────────────────────────────────',
      ...events.map(e => `  [${e.timestamp}] [${e.severity.toUpperCase()}]  ${e.message}`),
      '',
      '════════════════════════════════════════════════════════',
      '  Generated by AI Interview Monitor',
      '════════════════════════════════════════════════════════',
    ];

    const blob = new Blob([lines.join('\n')], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `interview-report-${new Date().toISOString().slice(0, 10)}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  }, [sessionId, elapsed, verdict, stats, flagged, events]);

  return (
    <div style={{ height: '100vh', background: '#080C14', color: '#F1F5F9',
      display: 'flex', flexDirection: 'column', ...mono, position: 'relative' }}>

      {/* Video + canvas — always mounted so MediaPipe keeps its stream */}
      <video ref={videoRef} playsInline muted autoPlay
        style={{
          position: 'fixed', top: 0, left: 0, width: 1, height: 1,
          opacity: 0, pointerEvents: 'none',
        }}
      />
      <canvas ref={canvasRef} width={640} height={480}
        style={{ display: 'none' }}
      />

      {/* ── IDLE ─────────────────────────────────────────────────────────── */}
      {phase === 'idle' && (
        <div style={{ flex: 1, display: 'flex', alignItems: 'center',
          justifyContent: 'center' }}>
          <div style={{ textAlign: 'center', maxWidth: 520, padding: '2rem' }}>
            <div style={{ fontSize: 10, letterSpacing: 4, color: '#3B82F6', marginBottom: 20 }}>
              BEHAVIORAL INTELLIGENCE SYSTEM
            </div>
            <h1 style={{ fontSize: 32, fontWeight: 300, lineHeight: 1.3, marginBottom: 12,
              ...sans, color: '#F8FAFC' }}>
              AI Interview Monitor
            </h1>
            <p style={{ fontSize: 13, color: '#64748B', lineHeight: 1.8, marginBottom: 36, ...sans }}>
              478-point facial mesh · Iris gaze tracking · Malpractice detection · Emotion scoring
            </p>
            <button onClick={handleStart} style={{
              background: '#3B82F6', color: '#080C14', border: 'none', padding: '14px 40px',
              fontSize: 11, ...mono, fontWeight: 700, letterSpacing: 2, cursor: 'pointer',
              textTransform: 'uppercase', borderRadius: 2,
            }}>
              START SESSION
            </button>
            <div style={{ marginTop: 40, display: 'flex', gap: 32, justifyContent: 'center',
              fontSize: 10, color: '#475569' }}>
              {['Face mesh · 478pts', 'Iris tracking', 'Tab detection', 'Audio monitor'].map(f => (
                <span key={f}>{f}</span>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ── LOADING ──────────────────────────────────────────────────────── */}
      {phase === 'loading' && (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center', gap: 16 }}>
          <div style={{ width: 32, height: 32, border: '2px solid #1A1A24',
            borderTop: '2px solid #00E5A0', borderRadius: '50%',
            animation: 'spin 0.8s linear infinite' }} />
          <div style={{ fontSize: 11, color: '#64748B', letterSpacing: 2 }}>
            LOADING MEDIAPIPE FACEMESH...
          </div>
          <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        </div>
      )}

      {/* ── MONITORING ───────────────────────────────────────────────────── */}
      {phase === 'monitoring' && (
        <>
          {/* Top bar */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            padding: '10px 20px', borderBottom: '1px solid #1A1A24', flexShrink: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ width: 7, height: 7, borderRadius: '50%', background: '#F97316',
                display: 'inline-block', animation: 'pulse 2s infinite' }} />
              <style>{`@keyframes pulse{0%,100%{opacity:1}50%{opacity:.3}}`}</style>
              <span style={{ fontSize: 10, letterSpacing: 2, color: '#F97316' }}>LIVE · FACEMESH 478</span>
            </div>
            <span style={{ fontSize: 13, color: '#3B82F6', fontVariantNumeric: 'tabular-nums' }}>
              {formatTime(elapsed)}
            </span>
            <button onClick={handleStop} style={{
              background: '#EF4444', color: '#fff', border: 'none', padding: '5px 14px',
              fontSize: 9, ...mono, cursor: 'pointer', borderRadius: 2, letterSpacing: 1,
              fontWeight: 700
            }}>
              END SESSION
            </button>
          </div>

          {/* Main content */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 300px', flex: 1, minHeight: 0 }}>

            {/* Video panel */}
            <div style={{ position: 'relative', background: '#050810', overflow: 'hidden',
              display: 'grid', gridTemplateColumns: '1fr 1fr' }}>
              {/* Status pills */}
              <div style={{ position: 'absolute', top: 10, left: 10, display: 'flex',
                flexDirection: 'column', gap: 5, zIndex: 10 }}>
                {[
                  { label: detection.faceCount > 0 ? `FACE ${detection.faceCount > 1 ? '⚠ MULTI' : 'OK'}` : 'NO FACE',
                    color: detection.faceCount === 1 ? '#3B82F6' : '#EF4444' },
                  { label: `GAZE: ${detection.gaze?.horizontal?.toUpperCase() || 'INIT'}`,
                    color: detection.gaze?.lookingAtCamera ? '#3B82F6' : '#F59E0B' },
                  { label: `HEAD: ${detection.headPose?.facingCamera ? 'CENTERED' : 'TURNED'}`,
                    color: detection.headPose?.facingCamera ? '#3B82F6' : '#F59E0B' },
                  { label: `TAB: ${stats.tabSwitchCount} SWITCH${stats.tabSwitchCount !== 1 ? 'ES' : ''}`,
                    color: stats.tabSwitchCount > 0 ? '#EF4444' : '#3B82F6' },
                ].map(p => (
                  <div key={p.label} style={{
                    background: 'rgba(0,0,0,0.7)', border: `1px solid ${p.color}30`,
                    padding: '3px 8px', borderRadius: 2, fontSize: 9,
                    color: p.color, letterSpacing: 1,
                  }}>{p.label}</div>
                ))}
              </div>

                  <VideoMirror videoRef={videoRef} canvasRef={canvasRef} />

              {/* Warning banners */}
              <div style={{ position: 'absolute', bottom: 10, left: 10, right: 10,
                display: 'flex', flexDirection: 'column', gap: 5, zIndex: 10 }}>
                {warnings.map(w => (
                  <div key={w.id} style={{
                    background: w.severity === 'danger' ? 'rgba(255,76,76,0.92)' : 'rgba(255,176,32,0.92)',
                    color: '#fff', padding: '7px 12px', borderRadius: 2, fontSize: 11, fontWeight: 700,
                  }}>
                    {w.severity === 'danger' ? '⚠ ' : '◆ '}{w.message}
                  </div>
                ))}
              </div>
            </div>

            {/* Right panel */}
            <div style={{ background: '#080E1A', borderLeft: '1px solid #1A1A24',
              overflowY: 'auto', padding: 14, display: 'flex', flexDirection: 'column', gap: 12 }}>

              <div style={{ textAlign: 'center', padding: '12px 0' }}>
                <div style={{ fontSize: 44, fontWeight: 200, color: scoreColor(stats.overallScore), lineHeight: 1 }}>
                  {stats.overallScore}
                </div>
                <div style={{ fontSize: 9, color: '#475569', marginTop: 3, letterSpacing: 1 }}>OVERALL</div>
              </div>

              {[
                { label: 'Attention', val: stats.attentionScore },
                { label: 'Integrity', val: stats.integrityScore },
                { label: 'Engagement', val: stats.engagementScore },
              ].map(s => (
                <div key={s.label} style={{ background: '#0D1526', border: '1px solid #1E1E2A',
                  borderRadius: 4, padding: 10 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 5 }}>
                    <span style={{ fontSize: 10 }}>{s.label}</span>
                    <span style={{ fontSize: 10, color: scoreColor(s.val) }}>{Math.round(s.val)}</span>
                  </div>
                  <div style={{ height: 3, background: '#162032', borderRadius: 2 }}>
                    <div style={{ height: '100%', width: `${s.val}%`,
                      background: scoreColor(s.val), borderRadius: 2, transition: 'width 0.5s' }} />
                  </div>
                </div>
              ))}

              <div style={{ background: '#0D1526', border: '1px solid #1E1E2A',
                borderRadius: 4, padding: 10 }}>
                <div style={{ fontSize: 9, color: '#475569', letterSpacing: 1, marginBottom: 8 }}>
                  EMOTION ANALYSIS
                </div>
                {emotionEntries.slice(0, 6).map(([emotion, value]) => (
                  <div key={emotion} style={{ display: 'flex', alignItems: 'center',
                    gap: 6, marginBottom: 4 }}>
                    <span style={{ fontSize: 9, color: '#94A3B8', minWidth: 60 }}>{emotion}</span>
                    <div style={{ flex: 1, height: 4, background: '#162032', borderRadius: 2 }}>
                      <div style={{
                        height: '100%', width: `${Math.round(value * 100)}%`,
                        background: emoColors[emotion] || '#94A3B8',
                        borderRadius: 2, transition: 'width 0.3s',
                      }} />
                    </div>
                    <span style={{ fontSize: 9, color: '#64748B', minWidth: 22, textAlign: 'right' }}>
                      {Math.round(value * 100)}
                    </span>
                  </div>
                ))}
                {emo.dominant && (
                  <div style={{ fontSize: 9, color: emoColors[emo.dominant] || '#94A3B8',
                    marginTop: 6, letterSpacing: 1 }}>
                    DOMINANT: {emo.dominant?.toUpperCase()}
                  </div>
                )}
              </div>

              <div style={{ background: '#0D1526', border: '1px solid #1E1E2A',
                borderRadius: 4, padding: 10 }}>
                <div style={{ fontSize: 9, color: '#475569', letterSpacing: 1, marginBottom: 8 }}>
                  LIVE METRICS
                </div>
                {[
                  ['Faces', detection.faceCount, detection.faceCount > 1 ? '#EF4444' : '#3B82F6'],
                  ['Gaze', detection.gaze?.horizontal || '–', detection.gaze?.lookingAtCamera ? '#3B82F6' : '#F59E0B'],
                  ['Blinks', detection.ear?.blinking ? 'YES' : 'NO', detection.ear?.blinking ? '#F59E0B' : '#3B82F6'],
                  ['Tab sw.', stats.tabSwitchCount, stats.tabSwitchCount > 0 ? '#EF4444' : '#3B82F6'],
                  ['Audio', stats.audioAnomalyCount, stats.audioAnomalyCount > 0 ? '#EF4444' : '#3B82F6'],
                ].map(([label, val, color]) => (
                  <div key={label} style={{ display: 'flex', justifyContent: 'space-between',
                    marginBottom: 4, fontSize: 10 }}>
                    <span style={{ color: '#64748B' }}>{label}</span>
                    <span style={{ color }}>{val}</span>
                  </div>
                ))}
              </div>

              <div style={{ background: '#0D1526', border: '1px solid #1E1E2A',
                borderRadius: 4, padding: 10, flex: 1, minHeight: 80, overflowY: 'auto' }}>
                <div style={{ fontSize: 9, color: '#475569', letterSpacing: 1, marginBottom: 6 }}>
                  EVENT LOG
                </div>
                {events.slice(-12).reverse().map((e, i) => (
                  <div key={i} style={{ display: 'flex', gap: 6, padding: '3px 0',
                    borderBottom: '1px solid #1A1A24', fontSize: 9 }}>
                    <span style={{
                      color: e.severity === 'danger' ? '#EF4444' : e.severity === 'warning' ? '#F59E0B' : '#3B82F6',
                      fontSize: 6
                    }}>&#9679;</span>
                    <span style={{ color: '#475569', minWidth: 55 }}>{e.timestamp}</span>
                    <span style={{ color: '#94A3B8' }}>{e.message}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </>
      )}

      {/* ── REPORT ───────────────────────────────────────────────────────── */}
      {phase === 'report' && (
        <div style={{ flex: 1, overflowY: 'auto', padding: '2rem' }}>
          <div style={{ maxWidth: 760, margin: '0 auto' }}>
            <div style={{ fontSize: 10, letterSpacing: 4, color: '#3B82F6', marginBottom: 6 }}>
              SESSION REPORT
            </div>
            <h2 style={{ fontSize: 26, fontWeight: 300, ...sans, marginBottom: 28 }}>
              Interview monitoring summary
            </h2>

            <div style={{ background: '#0D1526', border: '1px solid #1E1E2A',
              borderRadius: 4, padding: 28, textAlign: 'center', marginBottom: 20 }}>
              <div style={{ fontSize: 56, fontWeight: 200, color: scoreColor(stats.overallScore), lineHeight: 1 }}>
                {stats.overallScore}
              </div>
              <div style={{ fontSize: 11, color: '#64748B', marginTop: 6 }}>
                OVERALL SCORE · {formatTime(elapsed)} session
              </div>
              <div style={{ marginTop: 12, fontSize: 13, fontWeight: 700,
                color: verdictColor, letterSpacing: 2 }}>
                {verdict}
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr',
              gap: 12, marginBottom: 20 }}>
              {[
                { label: 'Attention', score: stats.attentionScore, sub: `${stats.lookAwayCount} gaze breaks` },
                { label: 'Integrity', score: stats.integrityScore, sub: `${stats.tabSwitchCount} tab sw / ${stats.multiFaceCount} multiface` },
                { label: 'Engagement', score: stats.engagementScore, sub: `${stats.faceAbsentCount} absent frames` },
              ].map(item => (
                <div key={item.label} style={{ background: '#0D1526', border: '1px solid #1E1E2A',
                  borderRadius: 4, padding: 16 }}>
                  <div style={{ fontSize: 28, fontWeight: 200, color: scoreColor(item.score) }}>
                    {item.score}
                  </div>
                  <div style={{ fontSize: 11, color: '#F1F5F9', marginTop: 2 }}>{item.label}</div>
                  <div style={{ fontSize: 9, color: '#64748B', marginTop: 4 }}>{item.sub}</div>
                </div>
              ))}
            </div>

            <div style={{ background: '#0D1526', border: '1px solid #1E1E2A',
              borderRadius: 4, padding: 20, marginBottom: 16 }}>
              <div style={{ fontSize: 10, color: '#64748B', letterSpacing: 1, marginBottom: 12 }}>
                FLAGGED EVENTS ({flagged.length})
              </div>
              {flagged.length === 0
                ? <div style={{ fontSize: 11, color: '#475569' }}>No critical events — clean session</div>
                : flagged.map((e, i) => (
                  <div key={i} style={{ display: 'flex', gap: 10, padding: '6px 0',
                    borderBottom: '1px solid #1A1A24', fontSize: 10 }}>
                    <span style={{ color: '#EF4444', fontSize: 7 }}>&#9679;</span>
                    <span style={{ color: '#64748B', minWidth: 65 }}>{e.timestamp}</span>
                    <span style={{ color: '#F1F5F9' }}>{e.message}</span>
                  </div>
                ))
              }
            </div>

            <div style={{ display: 'flex', gap: 10, marginTop: 8 }}>
              <button onClick={downloadReport} style={{
                background: '#3B82F6', color: '#080C14', border: 'none',
                padding: '8px 20px', fontSize: 10, ...mono, cursor: 'pointer',
                borderRadius: 2, letterSpacing: 1, fontWeight: 700,
              }}>
                DOWNLOAD REPORT
              </button>
              <button onClick={() => {
                setPhase('idle');
                setStats({ tabSwitchCount: 0, faceAbsentCount: 0, multiFaceCount: 0,
                  lookAwayCount: 0, audioAnomalyCount: 0, nodCount: 0,
                  attentionScore: 100, integrityScore: 100, engagementScore: 100, overallScore: 100 });
                setEvents([]); setElapsed(0);
              }} style={{ background: 'transparent', color: '#64748B', border: '1px solid #2A2A34',
                padding: '8px 20px', fontSize: 10, ...mono, cursor: 'pointer', borderRadius: 2,
                letterSpacing: 1 }}>
                NEW SESSION
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// Shows raw feed (left) and mesh-composite feed (right).
// The video/canvas elements live on document.body between phases to preserve
// the MediaPipe stream, and are moved into the panels while monitoring.
function VideoMirror({ videoRef, canvasRef }) {
  const rawRef = useRef(null);
  const meshRef = useRef(null);

  useEffect(() => {
    const raw = rawRef.current;
    const mesh = meshRef.current;
    const v = videoRef.current;
    const c = canvasRef.current;
    if (!raw || !mesh || !v || !c) return;

    raw.appendChild(v);
    mesh.appendChild(c);

    v.style.cssText = 'width:100%;height:100%;object-fit:cover;transform:scaleX(-1);display:block;opacity:1;position:static;pointer-events:auto;';
    c.style.cssText = 'width:100%;height:100%;object-fit:cover;display:block;transform:scaleX(-1);';

    return () => {
      document.body.appendChild(v);
      document.body.appendChild(c);
      v.style.cssText = 'position:fixed;top:0;left:0;width:1px;height:1px;opacity:0;pointer-events:none;';
      c.style.cssText = 'display:none;';
    };
  }, [videoRef, canvasRef]);

  const panelStyle = {
    position: 'relative', overflow: 'hidden',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    background: '#050810',
  };
  const labelStyle = {
    position: 'absolute', top: 6, left: 8, fontSize: 8,
    letterSpacing: 2, color: 'rgba(255,255,255,0.35)',
    fontFamily: 'monospace', pointerEvents: 'none',
  };

  return (
    <>
      <div ref={rawRef} style={panelStyle}>
        <span style={labelStyle}>RAW</span>
      </div>
      <div ref={meshRef} style={{ ...panelStyle, borderLeft: '1px solid #1A1A24' }}>
        <span style={labelStyle}>MESH</span>
      </div>
    </>
  );
}
