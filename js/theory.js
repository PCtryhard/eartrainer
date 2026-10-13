// chord bank, keys and note names. everything is offsets from the tonic in semitones

export const SHARPS = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
export const FLATS = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'];

// the twelve major keys, spelled the way players read them
export const KEYS = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B'];
const FLAT_KEYS = new Set(['F', 'Bb', 'Eb', 'Ab', 'Db', 'Gb']);

// chord banks per mode so minor keys can be added later without touching logic
export const BANKS = {
  major: [
    { label: 'I', code: '1', offsets: [0, 4, 7], on: true },
    { label: 'ii', code: '2', offsets: [2, 5, 9], on: true },
    { label: 'iii', code: '3', offsets: [4, 7, 11], on: true },
    { label: 'IV', code: '4', offsets: [5, 9, 0], on: true },
    { label: 'V', code: '5', offsets: [7, 11, 2], on: true },
    { label: 'vi', code: '6', offsets: [9, 0, 4], on: true },
    { label: 'iv', code: '4m', offsets: [5, 8, 0], on: true, name: 'minor four' },
    { label: 'III', code: '3M', offsets: [4, 8, 11], on: true, name: 'major three' },
    { label: 'vii°', code: '7', offsets: [11, 2, 5], on: false },
    { label: 'V7', code: '57', offsets: [7, 11, 2, 5], on: false },
  ],
};

export const CADENCE = ['I', 'IV', 'V', 'I'];

export const tonicOf = (key) => SHARPS.indexOf(key) >= 0 ? SHARPS.indexOf(key) : FLATS.indexOf(key);
export const usesFlats = (key) => FLAT_KEYS.has(key);
export const noteName = (n, key = 'C') => (usesFlats(key) ? FLATS : SHARPS)[((n % 12) + 12) % 12];
export const noteNameOctave = (n, key = 'C') => `${noteName(n, key)}${Math.floor(n / 12) - 1}`;

export const chordByLabel = (label, bank = BANKS.major) => bank.find((c) => c.label === label);

// pitch classes of a chord in a key, root first
export const chordPcs = (chord, key = 'C') => chord.offsets.map((o) => (o + tonicOf(key)) % 12);

export const pcSet = (notes) => new Set([...notes].map((n) => ((n % 12) + 12) % 12));

export const pcsEqual = (a, b) => a.size === b.size && [...a].every((p) => b.has(p));

// which bank chord has exactly these pitch classes, or null
export const identify = (pcs, bank, key = 'C') =>
  bank.find((c) => pcsEqual(new Set(chordPcs(c, key)), pcs)) ?? null;

export const enabled = (bank, onLabels) => bank.filter((c) => onLabels.includes(c.label));

// weighted random choice, weights default to uniform
export const choose = (items, weights, rng = Math.random) => {
  const w = weights ?? items.map(() => 1);
  let r = rng() * w.reduce((a, b) => a + b, 0);
  for (let i = 0; i < items.length; i++) if ((r -= w[i]) < 0) return items[i];
  return items[items.length - 1];
};

export const randomProgression = (bank, length, weights, rng = Math.random) =>
  Array.from({ length }, () => choose(bank, weights, rng));

export const progressionLabel = (chords) => chords.map((c) => c.label).join('-');

export const sortedNames = (notes, key = 'C') =>
  [...notes].sort((a, b) => a - b).map((n) => noteNameOctave(n, key)).join(' ');

export const pcNames = (pcs, key = 'C') => [...pcs].sort((a, b) => a - b).map((p) => noteName(p, key)).join(' ');
