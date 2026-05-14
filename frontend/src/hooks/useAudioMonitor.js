import { useRef, useCallback, useEffect } from 'react';

export function useAudioMonitor({ onAnomaly, active }) {
  const contextRef = useRef(null);
  const analyserRef = useRef(null);
  const baselineRef = useRef(null);
  const frameRef = useRef(null);
  const activeRef = useRef(active);
  const onAnomalyRef = useRef(onAnomaly);

  useEffect(() => { activeRef.current = active; }, [active]);
  useEffect(() => { onAnomalyRef.current = onAnomaly; }, [onAnomaly]);

  const start = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const ctx = new AudioContext();
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 2048;

      const source = ctx.createMediaStreamSource(stream);
      source.connect(analyser);

      contextRef.current = ctx;
      analyserRef.current = analyser;

      const dataArray = new Uint8Array(analyser.frequencyBinCount);
      let calibrationFrames = 0;
      let calibrationSum = 0;

      const analyze = () => {
        if (!activeRef.current) { frameRef.current = requestAnimationFrame(analyze); return; }
        analyser.getByteFrequencyData(dataArray);

        const avg = dataArray.reduce((a, b) => a + b, 0) / dataArray.length;

        // Calibrate for first 3 seconds
        if (calibrationFrames < 90) {
          calibrationSum += avg;
          calibrationFrames++;
          if (calibrationFrames === 90) {
            baselineRef.current = calibrationSum / calibrationFrames;
          }
        } else if (baselineRef.current) {
          const threshold = baselineRef.current * 3;

          if (avg > threshold && avg > 15) {
            onAnomalyRef.current?.({
              type: 'audio_spike',
              severity: avg > threshold * 2 ? 'danger' : 'warning',
              message: 'Background audio spike — possible external voice',
              metadata: { level: Math.round(avg), baseline: Math.round(baselineRef.current) }
            });
          }
        }

        frameRef.current = requestAnimationFrame(analyze);
      };

      frameRef.current = requestAnimationFrame(analyze);
    } catch (err) {
      console.warn('Audio monitoring unavailable:', err.message);
    }
  }, []);

  const stop = useCallback(() => {
    if (frameRef.current) cancelAnimationFrame(frameRef.current);
    contextRef.current?.close();
  }, []);

  return { start, stop };
}