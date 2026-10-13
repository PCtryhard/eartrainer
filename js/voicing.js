// voicings are sorted arrays of distinct midi notes. first chord lands anywhere, later chords stay close
import { pcSet, pcsEqual } from './theory.js';

export const LOW = 21;
export const HIGH = 108;
export const MUD_LINE = 48; // below c3 adjacent notes keep 7 semitones apart

export const DEFAULTS = { low: LOW, high: HIGH, maxSpan: 24, mudGuard: true, metric: 'absOuter', rng: Math.random };

const span = (v) => v[v.length - 1] - v[0];
const distinct = (v) => v.every((n, i) => i === 0 || n !== v[i - 1]);

export const mudOk = (v) => v.every((n, i) => i === 0 || v[i - 1] >= MUD_LINE || n - v[i - 1] >= 7);

export const valid = (v, T, o) =>
  v.length > 0 && distinct(v) && v[0] >= o.low && v[v.length - 1] <= o.high &&
  span(v) <= o.maxSpan && (!o.mudGuard || mudOk(v)) && pcsEqual(pcSet(v), T);

// outer voice distance, absolute by default, signed as in the prototype
export const distance = (prev, next, metric = 'absOuter') => {
  const lo = next[0] - prev[0];
  const hi = next[next.length - 1] - prev[prev.length - 1];
  return metric === 'signedOuter' ? lo + hi : Math.abs(lo) + Math.abs(hi);
};

// total voice movement, extra voices count their distance to the nearest previous note
export const movement = (prev, next) =>
  next.reduce((s, n, i) => s + (i < prev.length ? Math.abs(n - prev[i]) : Math.min(...prev.map((p) => Math.abs(n - p)))), 0);

const randInt = (rng, a, b) => a + Math.floor(rng() * (b - a + 1));
const pick = (rng, arr) => arr[Math.floor(rng() * arr.length)];

// random first chord by rejection sampling: random voice count, position and spacing
export const firstVoicing = (pcs, opts = {}) => {
  const o = { ...DEFAULTS, ...opts };
  const T = new Set(pcs);
  for (let tries = 0; tries < 5000; tries++) {
    const k = randInt(o.rng, Math.max(3, T.size), Math.max(5, T.size));
    const bass = randInt(o.rng, o.low, o.high);
    if (!T.has(bass % 12)) continue;
    const top = Math.min(o.high, bass + o.maxSpan);
    const pool = [];
    for (let n = bass + 1; n <= top; n++) if (T.has(n % 12)) pool.push(n);
    if (pool.length < k - 1) continue;
    const rest = [];
    const bag = [...pool];
    while (rest.length < k - 1) rest.push(bag.splice(Math.floor(o.rng() * bag.length), 1)[0]);
    const v = [bass, ...rest].sort((a, b) => a - b);
    if (valid(v, T, o)) return v;
  }
  return closeVoicing(pcs, Math.max(o.low, Math.min(o.high - 12, 60)));
};

// close root position with the root at or above `from`
export const closeVoicing = (pcs, from = 60) => {
  const root = from + ((pcs[0] - from) % 12 + 12) % 12;
  let last = root;
  return pcs.map((p, i) => (i === 0 ? root : (last += ((p - last) % 12 + 12) % 12)));
};

// root position, close, with the root in the c4 octave
export const voiceAsGiven = (pcs) => closeVoicing(pcs, 60);

const liftLowest = (v) => [...v.slice(1), v[0] + 12];
const dropHighest = (v) => [v[v.length - 1] - 12, ...v.slice(0, -1)];

// port of the prototype's find_closest_inversion: walk inversions while the outer voices get closer
export const closestInversion = (prev, pcs, metric = 'absOuter') => {
  let v = closeVoicing(pcs, prev[0] - 6);
  const d = (x) => Math.abs(distance(prev, x, metric));
  if (d(v) === 0) return v;
  const step = distance(prev, v, 'signedOuter') > 0 ? dropHighest : liftLowest;
  while (d(step(v)) < d(v)) v = step(v);
  return v;
};

// every close position inversion in range, so the search never loses to the prototype
const closeCandidates = (pcs, o) => {
  const out = [];
  for (let from = o.low; from <= o.high; from++) {
    const v = closeVoicing(pcs, from);
    if (v[0] !== from) continue;
    for (let i = 0; i < pcs.length; i++) {
      out.push(v.map((n, j) => (j < i ? n + 12 : n)).sort((a, b) => a - b));
    }
  }
  return out;
};

// nearest pitches of class p from note n, both ways on a tritone tie
const nearest = (n, p) => {
  const d = ((p - n) % 12 + 12) % 12;
  if (d === 0) return [n];
  if (d < 6) return [n + d];
  if (d > 6) return [n - (12 - d)];
  return [n + 6, n - 6];
};

const assignments = (k, pcs) => {
  const out = [];
  const walk = (i, acc) => {
    if (i === k) return void (pcs.every((p) => acc.includes(p)) && out.push(acc));
    for (const p of pcs) walk(i + 1, [...acc, p]);
  };
  walk(0, []);
  return out;
};

// per voice search: assign each voice a target class covering all of them, move to the nearest pitch
export const perVoiceCandidates = (prev, pcs) => {
  const out = [];
  for (const a of assignments(prev.length, pcs)) {
    let partial = [[]];
    prev.forEach((n, i) => {
      partial = partial.flatMap((v) => nearest(n, a[i]).map((m) => [...v, m]));
    });
    partial.forEach((v) => out.push([...v].sort((x, y) => x - y)));
  }
  return out;
};

// grow the previous voicing by one note so a bigger chord can be covered
const grown = (prev, pcs, o) => {
  const out = [];
  for (let n = Math.max(o.low, prev[0] - 12); n <= Math.min(o.high, prev[prev.length - 1] + 12); n++) {
    if (pcs.includes(n % 12) && !prev.includes(n)) out.push([...prev, n].sort((a, b) => a - b));
  }
  return out;
};

const key = (v) => v.join(',');

// best next voicing: union of inversion walk, close inversions and per voice search, lowest distance wins
export const nextVoicing = (prev, pcs, opts = {}) => {
  const o = { ...DEFAULTS, ...opts };
  const T = new Set(pcs);
  const starts = prev.length >= T.size ? [prev] : grown(prev, pcs, o);
  const seen = new Map();
  const add = (v) => valid(v, T, o) && !seen.has(key(v)) && seen.set(key(v), v);
  add(closestInversion(prev, pcs, o.metric));
  closeCandidates(pcs, o).forEach(add);
  starts.forEach((p) => perVoiceCandidates(p, pcs).forEach(add));
  const cands = [...seen.values()];
  if (!cands.length) return firstVoicing(pcs, o);
  const score = (v) => [distance(prev, v, o.metric), movement(prev, v)];
  let best = [];
  let bestScore = [Infinity, Infinity];
  for (const v of cands) {
    const s = score(v);
    const cmp = s[0] - bestScore[0] || s[1] - bestScore[1];
    if (cmp < 0) (best = [v]), (bestScore = s);
    else if (cmp === 0) best.push(v);
  }
  return pick(o.rng, best);
};

// voice a whole progression, each item a root first pitch class array
export const voiceProgression = (prog, opts = {}, mode = 'smooth') => {
  if (mode === 'asGiven') return prog.map(voiceAsGiven);
  const out = [];
  for (const pcs of prog) out.push(out.length ? nextVoicing(out[out.length - 1], pcs, opts) : firstVoicing(pcs, opts));
  return out;
};
