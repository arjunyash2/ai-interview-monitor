import { useEffect, useRef, useState, useCallback } from 'react';
import { analyzeEmotions, getGazeDirection, getHeadPose, getEAR } from '../lib/emotions';

export function useFaceMesh({ onDetection, onWarning, active }) {
  const faceMeshRef = useRef(null);
  const cameraRef = useRef(null);
  const historyRef = useRef([]);
  const activeRef = useRef(active);
  const onDetectionRef = useRef(onDetection);
  const onWarningRef = useRef(onWarning);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => { activeRef.current = active; }, [active]);
  useEffect(() => { onDetectionRef.current = onDetection; }, [onDetection]);
  useEffect(() => { onWarningRef.current = onWarning; }, [onWarning]);

  const handleResults = useCallback((results) => {
    if (!activeRef.current) return;

    const faceCount = results.multiFaceLandmarks?.length || 0;

    if (faceCount > 0) {
      const landmarks = results.multiFaceLandmarks[0];
      const gaze = getGazeDirection(landmarks);
      const headPose = getHeadPose(landmarks);
      const ear = getEAR(landmarks);
      const emotions = analyzeEmotions(landmarks, historyRef.current);

      // Add to history
      historyRef.current = [
        ...historyRef.current.slice(-60),
        { gaze, headPose, ear, emotions, time: Date.now() }
      ];

      // Fire warnings
      if (faceCount > 1) {
        onWarningRef.current?.({
          type: 'multi_face',
          severity: 'danger',
          message: `${faceCount} faces detected — possible external help`
        });
      }
      if (headPose.turnedAway) {
        onWarningRef.current?.({
          type: 'head_turned',
          severity: 'warning',
          message: 'Candidate turned away from camera'
        });
      }
      if (headPose.lookingDown) {
        onWarningRef.current?.({
          type: 'looking_down',
          severity: 'warning',
          message: 'Candidate looking down — possible phone/notes'
        });
      }
      if (emotions.suspicious > 0.6) {
        onWarningRef.current?.({
          type: 'other',
          severity: 'danger',
          message: 'Suspicious eye movement pattern detected'
        });
      }

      onDetectionRef.current?.({
        faceCount, landmarks, gaze, headPose, ear, emotions,
        allFaces: results.multiFaceLandmarks,
      });
    } else {
      onDetectionRef.current?.({ faceCount: 0 });
      onWarningRef.current?.({
        type: 'face_absent',
        severity: 'warning',
        message: 'No face detected in frame'
      });
    }
  }, []);

  const initialize = useCallback(async (videoElement, canvasElement) => {
    try {
      // Load MediaPipe scripts
      await loadScript(
        'https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh/face_mesh.js'
      );
      await loadScript(
        'https://cdn.jsdelivr.net/npm/@mediapipe/camera_utils/camera_utils.js'
      );
      await loadScript(
        'https://cdn.jsdelivr.net/npm/@mediapipe/drawing_utils/drawing_utils.js'
      );

      const faceMesh = new window.FaceMesh({
        locateFile: (file) =>
          `https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh/${file}`
      });

      faceMesh.setOptions({
        maxNumFaces: 3,
        refineLandmarks: true,     // enables iris tracking
        minDetectionConfidence: 0.5,
        minTrackingConfidence: 0.5,
      });

      faceMesh.onResults((results) => {
        drawResults(canvasElement, videoElement, results);
        handleResults(results);
      });

      const camera = new window.Camera(videoElement, {
        onFrame: async () => {
          if (faceMesh) await faceMesh.send({ image: videoElement });
        },
        width: 640,
        height: 480,
      });

      faceMeshRef.current = faceMesh;
      cameraRef.current = camera;

      await camera.start();
      setReady(true);
    } catch (err) {
      console.error('FaceMesh init error:', err);
      setError(err.message);
    }
  }, [handleResults]);

  const stop = useCallback(() => {
    cameraRef.current?.stop();
    setReady(false);
  }, []);

  return { initialize, stop, ready, error };
}

function drawResults(canvas, video, results) {
  if (!canvas || !video) return;
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  // Draw the raw video frame — CSS scaleX(-1) on the canvas handles mirroring
  ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

  if (!results.multiFaceLandmarks) return;

  const w = canvas.width;
  const h = canvas.height;

  results.multiFaceLandmarks.forEach((landmarks, idx) => {
    // Draw face mesh tessellation
    if (window.drawConnectors && window.FACEMESH_TESSELATION) {
      window.drawConnectors(ctx, landmarks,
        window.FACEMESH_TESSELATION,
        { color: 'rgba(0, 229, 160, 0.08)', lineWidth: 0.5 }
      );
    }

    // Draw contours
    if (window.drawConnectors && window.FACEMESH_FACE_OVAL) {
      window.drawConnectors(ctx, landmarks,
        window.FACEMESH_FACE_OVAL,
        { color: 'rgba(0, 229, 160, 0.4)', lineWidth: 1 }
      );
    }

    // Draw irises
    if (landmarks.length >= 478) {
      drawIris(ctx, landmarks, 468, w, h);
      drawIris(ctx, landmarks, 473, w, h);
    }

    // Multi-face warning overlay
    if (idx > 0) {
      const box = getBoundingBox(landmarks, w, h);
      ctx.strokeStyle = '#FF4C4C';
      ctx.lineWidth = 2;
      ctx.strokeRect(box.x, box.y, box.w, box.h);
      ctx.fillStyle = 'rgba(255,76,76,0.15)';
      ctx.fillRect(box.x, box.y, box.w, box.h);
      ctx.fillStyle = '#FF4C4C';
      ctx.font = 'bold 12px monospace';
      ctx.fillText('EXTRA FACE DETECTED', box.x + 4, box.y - 6);
    }
  });
}

function drawIris(ctx, landmarks, centerIdx, w, h) {
  const center = landmarks[centerIdx];
  const edge = landmarks[centerIdx + 1];
  if (!center || !edge) return;

  const cx = center.x * w;
  const cy = center.y * h;
  const ex = edge.x * w;
  const ey = edge.y * h;
  const radius = Math.sqrt(Math.pow(cx - ex, 2) + Math.pow(cy - ey, 2));

  ctx.strokeStyle = '#00B4FF';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.arc(cx, cy, radius, 0, Math.PI * 2);
  ctx.stroke();

  ctx.fillStyle = '#00B4FF';
  ctx.beginPath();
  ctx.arc(cx, cy, 2, 0, Math.PI * 2);
  ctx.fill();
}

function getBoundingBox(landmarks, w, h) {
  const xs = landmarks.map(p => p.x * w);
  const ys = landmarks.map(p => p.y * h);
  const x = Math.min(...xs);
  const y = Math.min(...ys);
  return { x, y, w: Math.max(...xs) - x, h: Math.max(...ys) - y };
}

function loadScript(src) {
  return new Promise((resolve, reject) => {
    if (document.querySelector(`script[src="${src}"]`)) {
      resolve(); return;
    }
    const script = document.createElement('script');
    script.src = src;
    script.crossOrigin = 'anonymous';
    script.onload = resolve;
    script.onerror = reject;
    document.head.appendChild(script);
  });
}