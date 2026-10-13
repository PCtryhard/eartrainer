// pure dsp over float32array: fft, peak chroma, harmonic templates and matching
import { chordPcs } from './theory.js';

export const hann = (n) => Float32Array.from({ length: n }, (_, i) => 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / n));

// in place radix 2 fft
export const fft = (re, im) => {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) [re[i], re[j], im[i], im[j]] = [re[j], re[i], im[j], im[i]];
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = (-2 * Math.PI) / len;
    const wr = Math.cos(ang), wi = Math.sin(ang);
    for (let i = 0; i < n; i += len) {
      let cr = 1, ci = 0;
      for (let j = 0; j < len / 2; j++) {
        const a = i + j, b = a + len / 2;
        const tr = re[b] * cr - im[b] * ci, ti = re[b] * ci + im[b] * cr;
        re[b] = re[a] - tr; im[b] = im[a] - ti;
        re[a] += tr; im[a] += ti;
        [cr, ci] = [cr * wr - ci * wi, cr * wi + ci * wr];
      }
    }
  }
};

// magnitude spectrum of a windowed signal, length n/2
export const spectrum = (signal) => {
  const n = signal.length;
  const w = hann(n);
  const re = Float32Array.from(signal, (x, i) => x * w[i]);
  const im = new Float32Array(n);
  fft(re, im);
  return Float32Array.from({ length: n / 2 }, (_, i) => Math.hypot(re[i], im[i]));
};

export const rms = (x) => Math.sqrt(x.reduce((s, v) => s + v * v, 0) / x.length);
export const dbToLinear = (db) => Float32Array.from(db, (d) => (d <= -200 ? 0 : 10 ** (d / 20)));

const pcOf = (f) => ((Math.round(12 * Math.log2(f / 440)) + 69) % 12 + 12) % 12;

// chroma from spectral peaks between fmin and fmax, floor (scalar or per bin) subtracted first
export const peakChroma = (mag, sampleRate, { fmin = 55, fmax = 4000, floor = 0 } = {}) => {
  const n = mag.length * 2;
  const chroma = new Float32Array(12);
  const fl = (i) => (typeof floor === 'number' ? floor : floor[i] ?? 0);
  const lo = Math.max(1, Math.floor((fmin * n) / sampleRate)), hi = Math.min(mag.length - 2, Math.ceil((fmax * n) / sampleRate));
  for (let i = lo; i <= hi; i++) {
    const v = mag[i] - fl(i);
    if (v <= 0 || mag[i] < mag[i - 1] || mag[i] < mag[i + 1]) continue;
    const a = mag[i - 1], b = mag[i], c = mag[i + 1];
    const shift = a - 2 * b + c ? (0.5 * (a - c)) / (a - 2 * b + c) : 0; // parabolic peak refinement
    chroma[pcOf(((i + shift) * sampleRate) / n)] += v;
  }
  return chroma;
};

// one template per chord: every tone adds its first partials with decaying weight
export const template = (pcs, partials = 6, decay = 0.6) => {
  const t = new Float32Array(12);
  for (const p of pcs) for (let h = 1; h <= partials; h++) t[(p + Math.round(12 * Math.log2(h))) % 12] += decay ** (h - 1);
  return t;
};

export const buildTemplates = (bank, key = 'C') => bank.map((c) => ({ label: c.label, chord: c, vec: template(chordPcs(c, key)) }));

export const cosine = (a, b) => {
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) (dot += a[i] * b[i]), (na += a[i] * a[i]), (nb += b[i] * b[i]);
  return na && nb ? dot / Math.sqrt(na * nb) : 0;
};

// best template by cosine, ok only with enough energy and a margin over the runner up
export const classify = (chroma, templates, { minMargin = 0.02, minEnergy = 0 } = {}) => {
  const energy = chroma.reduce((a, b) => a + b, 0);
  const ranked = templates.map((t) => ({ label: t.label, chord: t.chord, score: cosine(chroma, t.vec) })).sort((a, b) => b.score - a.score);
  if (ranked.length < 1 || !ranked[0].score) return null;
  const margin = ranked[0].score - (ranked[1]?.score ?? 0);
  return { ...ranked[0], margin, energy, ok: margin >= minMargin && energy >= minEnergy, second: ranked[1]?.label ?? null };
};

// synthesized piano like chord for tests: decaying partials plus optional white noise
export const synthChord = (midis, sampleRate = 44100, n = 16384, { partials = 6, decay = 0.6, noise = 0, rng = Math.random } = {}) => {
  const out = new Float32Array(n);
  for (const m of midis) {
    const f0 = 440 * 2 ** ((m - 69) / 12);
    for (let h = 1; h <= partials; h++) {
      const amp = decay ** (h - 1) / midis.length;
      const w = (2 * Math.PI * f0 * h) / sampleRate;
      for (let i = 0; i < n; i++) out[i] += amp * Math.sin(w * i) * Math.exp(-i / (sampleRate * 1.5));
    }
  }
  if (noise) for (let i = 0; i < n; i++) out[i] += noise * (rng() * 2 - 1);
  return out;
};
