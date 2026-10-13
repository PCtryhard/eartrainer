import test from 'node:test';
import assert from 'node:assert/strict';
import { firstVoicing, nextVoicing, closestInversion, distance, voiceAsGiven, voiceProgression, mudOk, LOW, HIGH } from '../js/voicing.js';
import { BANKS, KEYS, chordPcs, pcSet, pcsEqual, randomProgression } from '../js/theory.js';

// small deterministic rng
const seeded = (seed) => () => {
  seed = (seed * 1664525 + 1013904223) % 4294967296;
  return seed / 4294967296;
};

const bank = BANKS.major;
const pcsOf = (label, key = 'C') => chordPcs(bank.find((c) => c.label === label), key);
const span = (v) => v[v.length - 1] - v[0];
const sorted = (v) => v.every((n, i) => i === 0 || n > v[i - 1]);

test('first chords cover the keyboard and respect every constraint', () => {
  const rng = seeded(7);
  const lows = new Set();
  for (let i = 0; i < 10000; i++) {
    const chord = bank[i % bank.length];
    const T = new Set(chordPcs(chord, KEYS[i % 12])); // every key, so every pitch class can be a bass
    const v = firstVoicing([...T], { rng });
    assert.ok(sorted(v), `sorted ${v}`);
    assert.ok(pcsEqual(pcSet(v), T), `pcs ${v}`);
    assert.ok(v[0] >= LOW && v[v.length - 1] <= HIGH);
    assert.ok(span(v) <= 24, `span ${v}`);
    assert.ok(mudOk(v), `mud ${v}`);
    assert.ok(v.length >= 3 && v.length <= 5);
    lows.add(v[0]);
  }
  for (let n = 21; n <= 84; n++) assert.ok(lows.has(n), `lowest note ${n} never used`);
});

test('first chords honor a restricted range and span', () => {
  const rng = seeded(3);
  for (let i = 0; i < 2000; i++) {
    const v = firstVoicing(pcsOf('V7'), { rng, low: 40, high: 76, maxSpan: 14, mudGuard: true });
    assert.ok(v[0] >= 40 && v[v.length - 1] <= 76 && span(v) <= 14, `${v}`);
  }
});

test('textbook voice leading from c major', () => {
  assert.deepEqual(nextVoicing([60, 64, 67], pcsOf('IV')), [60, 65, 69]);
  assert.deepEqual(nextVoicing([60, 64, 67], pcsOf('V')), [59, 62, 67]);
});

test('next voicings keep the target pitch class set and the range', () => {
  const rng = seeded(11);
  let prev = [60, 64, 67];
  for (let i = 0; i < 500; i++) {
    const chord = bank[Math.floor(rng() * bank.length)];
    const T = new Set(chordPcs(chord, 'E'));
    const v = nextVoicing(prev, [...T], { rng, low: 30, high: 90, maxSpan: 19 });
    assert.ok(pcsEqual(pcSet(v), T), `pcs ${v}`);
    assert.ok(v[0] >= 30 && v[v.length - 1] <= 90 && span(v) <= 19, `${v}`);
    assert.ok(v.length >= T.size);
    prev = v;
  }
});

test('close triads never do worse than the prototype inversion walk', () => {
  const rng = seeded(5);
  for (let i = 0; i < 2000; i++) {
    const a = bank[Math.floor(rng() * 8)], b = bank[Math.floor(rng() * 8)];
    const prev = voiceAsGiven(chordPcs(a)).map((n) => n + 12 * (Math.floor(rng() * 3) - 1));
    const T = chordPcs(b);
    const proto = closestInversion(prev, T, 'signedOuter');
    const mine = nextVoicing(prev, T, { rng, mudGuard: false });
    assert.ok(distance(prev, mine) <= distance(prev, proto), `${prev} -> ${T}: ${mine} vs ${proto}`);
  }
});

test('a 200 chord progression stays in range and within the span', () => {
  const rng = seeded(42);
  for (const [low, high, maxSpan] of [[21, 108, 24], [36, 84, 16], [21, 108, 12]]) {
    const prog = randomProgression(bank, 200, null, rng).map((c) => chordPcs(c, 'Ab'));
    const vs = voiceProgression(prog, { rng, low, high, maxSpan });
    vs.forEach((v, i) => {
      assert.ok(pcsEqual(pcSet(v), new Set(prog[i])));
      assert.ok(v[0] >= low && v[v.length - 1] <= high, `range ${v}`);
      assert.ok(span(v) <= maxSpan, `span ${v}`);
      assert.ok(mudOk(v), `mud ${v}`);
    });
  }
});

test('signed metric lets opposite motion cancel, absolute does not', () => {
  assert.equal(distance([60, 64, 67], [55, 60, 72], 'signedOuter'), 0);
  assert.equal(distance([60, 64, 67], [55, 60, 72]), 10);
});

test('voice as given is close root position around c4', () => {
  assert.deepEqual(voiceAsGiven(pcsOf('I')), [60, 64, 67]);
  assert.deepEqual(voiceAsGiven(pcsOf('vi')), [69, 72, 76]);
  assert.deepEqual(voiceProgression([pcsOf('I'), pcsOf('V')], {}, 'asGiven'), [[60, 64, 67], [67, 71, 74]]);
});
