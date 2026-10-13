// piano playback with the web audio api: one sample every minor third, pitch shifted to the nearest one
const NAMES = ['C', 'Cs', 'D', 'Ds', 'E', 'F', 'Fs', 'G', 'Gs', 'A', 'As', 'B'];
export const SAMPLE_MIDIS = Array.from({ length: 30 }, (_, i) => 21 + 3 * i);
export const sampleName = (m) => `${NAMES[m % 12]}${Math.floor(m / 12) - 1}`;
export const nearestSample = (m) => SAMPLE_MIDIS.reduce((a, b) => (Math.abs(b - m) < Math.abs(a - m) ? b : a));

export const createPlayer = (samplesUrl) => {
  let ctx = null;
  const buffers = new Map();
  let live = [];
  let playing = false;
  let stoppedAt = 0;
  let onPlaying = () => {};
  let synth = false;

  const unlock = async () => {
    ctx ??= new (window.AudioContext || window.webkitAudioContext)();
    if (ctx.state !== 'running') await ctx.resume();
    return ctx;
  };

  const load = async () => {
    await unlock();
    const jobs = SAMPLE_MIDIS.map(async (m) => {
      const res = await fetch(new URL(`${sampleName(m)}.mp3`, samplesUrl));
      if (!res.ok) throw new Error(`sample ${sampleName(m)} ${res.status}`);
      buffers.set(m, await ctx.decodeAudioData(await res.arrayBuffer()));
    });
    try {
      await Promise.all(jobs);
    } catch (e) {
      synth = true;
      console.warn('samples missing, using synth fallback', e.message);
    }
    return !synth;
  };

  const setPlaying = (v) => {
    if (playing === v) return;
    playing = v;
    if (!v) stoppedAt = performance.now();
    onPlaying(v);
  };

  const noteSource = (midi, when, dur) => {
    const gain = ctx.createGain();
    gain.connect(ctx.destination);
    const sample = nearestSample(midi);
    const sampled = !synth && buffers.has(sample);
    const node = sampled ? ctx.createBufferSource() : ctx.createOscillator();
    if (sampled) {
      node.buffer = buffers.get(sample);
      node.playbackRate.value = 2 ** ((midi - sample) / 12);
      gain.gain.setValueAtTime(0.5, when);
    } else {
      node.type = 'triangle';
      node.frequency.value = 440 * 2 ** ((midi - 69) / 12);
      gain.gain.setValueAtTime(0.25, when);
      gain.gain.exponentialRampToValueAtTime(0.05, when + dur);
    }
    gain.gain.setTargetAtTime(0, when + dur, 0.05);
    node.connect(gain);
    node.start(when);
    node.stop(when + dur + 0.4);
    live.push(node);
    return node;
  };

  // all notes of a chord start together, chords follow each other at secPerChord
  const playProgression = (voicings, secPerChord = 1) => {
    stop();
    const t0 = ctx.currentTime + 0.05;
    const dur = secPerChord * 0.9;
    voicings.forEach((v, i) => v.forEach((n) => noteSource(n, t0 + i * secPerChord, dur)));
    setPlaying(true);
    return new Promise((resolve) => {
      const id = setTimeout(() => { setPlaying(false); resolve(); }, voicings.length * secPerChord * 1000);
      live.timer = id;
    });
  };

  const stop = () => {
    clearTimeout(live.timer);
    live.forEach((n) => { try { n.stop(); } catch {} });
    live = [];
    setPlaying(false);
  };

  return {
    unlock, load, playProgression, stop,
    isPlaying: () => playing,
    quietFor: (ms) => !playing && performance.now() - stoppedAt > ms,
    isSynth: () => synth,
    onPlaying: (cb) => { onPlaying = cb; },
  };
};
