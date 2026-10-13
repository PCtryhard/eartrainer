// localstorage for settings and per chord stats, storage injectable for tests

export const DEFAULT_SETTINGS = {
  key: 'C',
  randomKey: false,
  chords: ['I', 'ii', 'iii', 'IV', 'V', 'vi', 'iv', 'III'],
  progLength: 4,
  progsCount: 6,
  cadenceCycle: 5,
  answerMode: 'chord', // chord | whole
  tempo: 1, // seconds per chord
  voicingMode: 'smooth', // smooth | asGiven
  low: 21,
  high: 108,
  maxSpan: 24,
  mudGuard: true,
  chordWindow: 300,
  input: 'midi', // midi | mic | screen
};

const SETTINGS = 'eartrainer.settings';
const STATS = 'eartrainer.stats';

const read = (storage, k) => {
  try {
    return JSON.parse(storage.getItem(k)) ?? null;
  } catch {
    return null;
  }
};

export const loadSettings = (storage = localStorage) => ({ ...DEFAULT_SETTINGS, ...(read(storage, SETTINGS) ?? {}) });
export const saveSettings = (s, storage = localStorage) => storage.setItem(SETTINGS, JSON.stringify(s));

// stats: label -> { tries, firstTry }
export const loadStats = (storage = localStorage) => read(storage, STATS) ?? {};

export const recordStat = (label, firstTry, storage = localStorage) => {
  const stats = loadStats(storage);
  const s = stats[label] ?? { tries: 0, firstTry: 0 };
  stats[label] = { tries: s.tries + 1, firstTry: s.firstTry + (firstTry ? 1 : 0) };
  storage.setItem(STATS, JSON.stringify(stats));
  return stats;
};

export const resetStats = (storage = localStorage) => storage.removeItem(STATS);

// weakest first: lowest first try rate, then most tries
export const weakest = (stats) =>
  Object.entries(stats)
    .map(([label, s]) => ({ label, tries: s.tries, rate: s.tries ? s.firstTry / s.tries : 0 }))
    .sort((a, b) => a.rate - b.rate || b.tries - a.tries);
