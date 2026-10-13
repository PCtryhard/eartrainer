// microphone capture for an acoustic piano: onset on an rms rise, then chroma of the next few hundred ms
import { peakChroma, classify, rms, dbToLinear } from './chroma.js';

export const createMicInput = ({ onChord, onMiss, onLevel, onDebug, onStatus, muted = () => false, templates = () => [], fftSize = 16384 }) => {
  let ctx = null, stream = null, analyser = null, timer = null;
  const time = new Float32Array(fftSize);
  const freq = new Float32Array(fftSize / 2);
  let floorRms = 0.002, floorSpec = null, calibrating = null;
  let state = 'idle', onsetAt = 0, lastRms = 0, frames = [];
  const now = () => performance.now();

  const start = async () => {
    ctx ??= new (window.AudioContext || window.webkitAudioContext)();
    await ctx.resume();
    stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false } });
    analyser = ctx.createAnalyser();
    analyser.fftSize = fftSize;
    analyser.smoothingTimeConstant = 0;
    ctx.createMediaStreamSource(stream).connect(analyser);
    timer = setInterval(tick, 40);
    onStatus?.('Mic on. Calibrate for best results.');
  };

  const stop = () => {
    clearInterval(timer);
    stream?.getTracks().forEach((t) => t.stop());
    stream = analyser = null;
    state = 'idle';
  };

  // two seconds of silence set the noise floor
  const calibrate = () =>
    new Promise((resolve) => {
      calibrating = { rms: [], spec: new Float32Array(fftSize / 2), n: 0, until: now() + 2000, resolve };
      onStatus?.('Calibrating, keep quiet for 2 s');
    });

  const finishCalibration = () => {
    const c = calibrating;
    calibrating = null;
    floorRms = Math.max(0.001, c.rms.reduce((a, b) => a + b, 0) / Math.max(1, c.rms.length));
    floorSpec = c.n ? Float32Array.from(c.spec, (v) => (v / c.n) * 2.5) : null;
    onStatus?.('Calibrated');
    c.resolve({ floorRms });
  };

  const tick = () => {
    if (!analyser) return;
    analyser.getFloatTimeDomainData(time);
    analyser.getFloatFrequencyData(freq);
    const level = rms(time);
    const mag = dbToLinear(freq);
    onLevel?.(level);
    if (calibrating) {
      calibrating.rms.push(level);
      calibrating.spec.forEach((v, i) => (calibrating.spec[i] = v + mag[i]));
      calibrating.n++;
      if (now() >= calibrating.until) finishCalibration();
      return;
    }
    const threshold = Math.max(floorRms * 4, 0.004);
    const t = now();
    if (muted()) {
      state = 'idle';
      lastRms = level;
      return;
    }
    if (state === 'idle' && level > threshold && level > lastRms * 1.6) {
      state = 'wait';
      onsetAt = t;
      frames = [];
    } else if (state === 'wait' && t - onsetAt >= 150) {
      state = 'collect';
    }
    if (state === 'collect') {
      frames.push(mag.slice());
      if (t - onsetAt >= 600 || frames.length >= 8) analyse();
    }
    lastRms = level;
  };

  const analyse = () => {
    state = 'cool';
    const avg = new Float32Array(fftSize / 2);
    frames.forEach((f) => f.forEach((v, i) => (avg[i] += v / frames.length)));
    const chroma = peakChroma(avg, ctx.sampleRate, { floor: floorSpec ?? 0 });
    const r = classify(chroma, templates(), { minMargin: 0.02, minEnergy: 0.5 });
    onDebug?.({ chroma, result: r });
    if (r?.ok) onChord(r.chord, chroma);
    else onMiss?.();
    setTimeout(() => { if (state === 'cool') state = 'idle'; }, 250);
  };

  return { start, stop, calibrate, supported: () => !!navigator.mediaDevices?.getUserMedia };
};
