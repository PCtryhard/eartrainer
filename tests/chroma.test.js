import test from 'node:test';
import assert from 'node:assert/strict';
import { fft, spectrum, peakChroma, buildTemplates, classify, synthChord, rms, cosine, template } from '../js/chroma.js';
import { BANKS, chordPcs } from '../js/theory.js';
import { closeVoicing } from '../js/voicing.js';

const SR = 44100;
const N = 16384;

const seeded = (seed) => () => {
  seed = (seed * 1664525 + 1013904223) % 4294967296;
  return seed / 4294967296;
};

test('fft finds a pure tone', () => {
  const n = 1024;
  const re = Float32Array.from({ length: n }, (_, i) => Math.sin((2 * Math.PI * 64 * i) / n));
  const im = new Float32Array(n);
  fft(re, im);
  const mags = Array.from(re, (r, i) => Math.hypot(r, im[i]));
  const peak = mags.indexOf(Math.max(...mags.slice(0, n / 2)));
  assert.equal(peak, 64);
});

test('templates spread energy onto partials', () => {
  const t = template([0], 3, 0.5);
  assert.ok(t[0] > t[7] && t[7] > 0);
  assert.equal(cosine(t, t).toFixed(6), '1.000000');
});

const classifyChord = (midis, noise, rng, key = 'C', bank = BANKS.major) => {
  const sig = synthChord(midis, SR, N, { noise, rng });
  const chroma = peakChroma(spectrum(sig), SR, { floor: noise ? 2 : 0 });
  return classify(chroma, buildTemplates(bank, key), { minMargin: 0.02, minEnergy: 20 });
};

test('every bank chord in three octaves and voicings classifies correctly, clean and noisy', () => {
  const rng = seeded(9);
  for (const key of ['C', 'Eb']) {
    for (const chord of BANKS.major) {
      const pcs = chordPcs(chord, key);
      for (const base of [36, 48, 60]) {
        const close = closeVoicing(pcs, base);
        const voicings = [close, [...close.slice(1), close[0] + 12], [close[0], ...close.slice(1).map((n) => n + 12)]];
        for (const v of voicings) {
          for (const noise of [0, 0.02]) {
            const r = classifyChord(v, noise, rng, key);
            assert.ok(r && r.ok, `${chord.label} in ${key} ${v} noise ${noise}: ${JSON.stringify(r)}`);
            assert.equal(r.label, chord.label, `${chord.label} in ${key} ${v} noise ${noise} got ${r.label} (${r.score.toFixed(3)} vs ${r.second})`);
          }
        }
      }
    }
  }
});

test('silence and noise alone do not classify', () => {
  const rng = seeded(4);
  const noise = Float32Array.from({ length: N }, () => 0.02 * (rng() * 2 - 1));
  const chroma = peakChroma(spectrum(noise), SR, { floor: 2 });
  const r = classify(chroma, buildTemplates(BANKS.major), { minEnergy: 20 });
  assert.ok(!r || !r.ok);
  assert.ok(r.energy < 20);
  assert.ok(rms(noise) < 0.02);
  assert.equal(classify(new Float32Array(12), buildTemplates(BANKS.major)), null);
});
