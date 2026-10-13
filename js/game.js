// session state machine and scoring. io: { play(voicings, secPerChord) -> promise, rng, onChange, onStat }
import { BANKS, CADENCE, KEYS, chordByLabel, chordPcs, enabled, pcsEqual, progressionLabel, randomProgression, pcNames } from './theory.js';
import { nextVoicing, voiceAsGiven, voiceProgression } from './voicing.js';

export const createGame = (settings, io) => {
  const rng = io.rng ?? Math.random;
  const bank = enabled(BANKS.major, settings.chords);
  const opts = { low: settings.low, high: settings.high, maxSpan: settings.maxSpan, mudGuard: settings.mudGuard, rng };
  const s = {
    phase: 'idle', key: settings.key, score: 0, progIndex: 0, chords: [], voicings: [], chordIndex: 0,
    slots: [], prompt: '', feedback: '', detected: '', attempts: 0, session: {}, bank, progsCount: settings.progsCount,
  };
  const emit = () => io.onChange?.(s);
  const whole = () => settings.answerMode === 'whole';
  const target = () => new Set(chordPcs(s.chords[s.chordIndex], s.key));

  const stat = (label, firstTry) => {
    const e = (s.session[label] ??= { tries: 0, firstTry: 0 });
    e.tries++;
    if (firstTry) e.firstTry++;
    io.onStat?.(label, firstTry);
  };

  // cadence starts from a close tonic chord so the key is easy to hear
  const cadenceVoicings = () => {
    const prog = CADENCE.map((l) => chordPcs(chordByLabel(l), s.key));
    const out = [voiceAsGiven(prog[0])];
    for (const pcs of prog.slice(1)) out.push(nextVoicing(out[out.length - 1], pcs, opts));
    return out;
  };

  const play = async (voicings, sec) => {
    s.phase = 'playing';
    emit();
    await io.play(voicings, sec);
  };

  const playCurrent = async () => {
    await play(whole() ? s.voicings : [s.voicings[s.chordIndex]], settings.tempo);
    s.phase = 'answer';
    emit();
  };

  const begin = async () => {
    s.chordIndex = 0;
    s.attempts = 0;
    s.detected = '';
    s.feedback = '';
    s.slots = [];
    if (s.progIndex % settings.cadenceCycle === 0) {
      s.prompt = `Here is a I-IV-V-I cadence in ${s.key}.`;
      await play(cadenceVoicings(), 0.75);
    }
    s.chords = randomProgression(bank, settings.progLength, settings.weights, rng);
    const prog = s.chords.map((c) => chordPcs(c, s.key));
    s.voicings = voiceProgression(prog, opts, settings.voicingMode);
    s.slots = s.chords.map(() => ({ status: 'pending', firstTry: null, label: '' }));
    s.prompt = `Progression ${s.progIndex + 1} of ${settings.progsCount}. Play it back.`;
    await playCurrent();
  };

  const finish = () => {
    const perfect = s.slots.every((x) => x.firstTry);
    if (perfect) s.score++;
    s.prompt = perfect ? 'Perfect!' : 'You got it in the end!';
    s.feedback = `That was a ${progressionLabel(s.chords)} in ${s.key}.`;
    s.phase = 'reveal';
    emit();
  };

  const advance = async () => {
    s.chordIndex++;
    s.attempts = 0;
    if (s.chordIndex >= s.chords.length) return finish();
    if (whole()) return emit();
    await playCurrent();
  };

  const start = async () => {
    s.key = settings.randomKey ? KEYS[Math.floor(rng() * KEYS.length)] : settings.key;
    s.score = 0;
    s.progIndex = 0;
    s.session = {};
    await begin();
  };

  // the student's answer as a pitch class set, octave and inversion do not matter
  const answer = async (pcs, raw = [], note = null) => {
    if (s.phase !== 'answer') return null;
    const slot = s.slots[s.chordIndex];
    const right = pcsEqual(pcs, target());
    s.attempts++;
    s.detected = note ?? (raw.length ? `Detected: ${pcNames(pcs, s.key)}` : '');
    if (slot.firstTry === null) {
      slot.firstTry = right;
      stat(s.chords[s.chordIndex].label, right);
    }
    if (right) {
      slot.status = slot.firstTry ? 'right' : 'eventually';
      slot.label = s.chords[s.chordIndex].label;
      s.feedback = 'Right';
      await advance();
      return true;
    }
    slot.status = 'wrong';
    s.feedback = 'Try again';
    if (whole()) {
      s.slots.forEach((x) => { if (x.status !== 'wrong' && x.status !== 'shown') x.status = 'pending'; });
      s.chordIndex = 0;
    }
    emit();
    return false;
  };

  const showAnswer = async () => {
    if (s.phase !== 'answer') return;
    const slot = s.slots[s.chordIndex];
    if (slot.firstTry === null) {
      slot.firstTry = false;
      stat(s.chords[s.chordIndex].label, false);
    }
    slot.status = 'shown';
    slot.label = s.chords[s.chordIndex].label;
    s.feedback = `It was ${slot.label}.`;
    await advance();
  };

  const replay = async () => {
    if (s.phase === 'answer') await playCurrent();
  };

  const next = async () => {
    if (s.phase !== 'reveal') return;
    s.progIndex++;
    if (s.progIndex >= settings.progsCount) {
      s.phase = 'done';
      s.prompt = `Session over. Score ${s.score}/${settings.progsCount}.`;
      s.feedback = '';
      return emit();
    }
    await begin();
  };

  return { state: s, start, answer, showAnswer, replay, next, bank };
};
