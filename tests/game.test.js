import test from 'node:test';
import assert from 'node:assert/strict';
import { createGame } from '../js/game.js';
import { DEFAULT_SETTINGS } from '../js/store.js';
import { chordPcs, pcSet, pcsEqual } from '../js/theory.js';

const seeded = (seed) => () => {
  seed = (seed * 1664525 + 1013904223) % 4294967296;
  return seed / 4294967296;
};

const setup = (over = {}) => {
  const played = [];
  const stats = [];
  const settings = { ...DEFAULT_SETTINGS, progsCount: 3, progLength: 2, ...over };
  const io = { play: async (v, sec) => played.push([v, sec]), rng: seeded(1), onStat: (l, f) => stats.push([l, f]) };
  return { game: createGame(settings, io), played, stats, settings };
};

const right = (g) => new Set(chordPcs(g.state.chords[g.state.chordIndex], g.state.key));
const wrong = new Set([0, 1, 2]);

test('cadence first, then chord by chord with retries and scoring', async () => {
  const { game, played, stats } = setup();
  await game.start();
  assert.equal(played[0][1], 0.75);
  assert.equal(played[0][0].length, 4);
  assert.equal(played[1][0].length, 1);
  assert.equal(game.state.phase, 'answer');
  assert.equal(await game.answer(wrong, [60, 61, 62]), false);
  assert.equal(game.state.feedback, 'Try again');
  assert.match(game.state.detected, /^Detected: C/);
  assert.equal(game.state.slots[0].status, 'wrong');
  await game.replay();
  assert.equal(played.length, 3);
  assert.equal(await game.answer(right(game)), true);
  assert.equal(game.state.slots[0].status, 'eventually');
  assert.equal(game.state.chordIndex, 1);
  assert.equal(await game.answer(right(game)), true);
  assert.equal(game.state.phase, 'reveal');
  assert.equal(game.state.prompt, 'You got it in the end!');
  assert.match(game.state.feedback, /^That was a [IVivi°7-]+ in C\.$/);
  assert.equal(game.state.score, 0);
  assert.deepEqual(stats.map((x) => x[1]), [false, true]);
  await game.next();
  assert.equal(game.state.progIndex, 1);
  await game.answer(right(game));
  await game.answer(right(game));
  assert.equal(game.state.prompt, 'Perfect!');
  assert.equal(game.state.score, 1);
  await game.next();
  await game.showAnswer();
  assert.equal(game.state.slots[0].status, 'shown');
  await game.answer(right(game));
  assert.equal(game.state.score, 1);
  await game.next();
  assert.equal(game.state.phase, 'done');
  assert.match(game.state.prompt, /1\/3/);
});

test('whole progression mode plays everything and restarts the answer on a miss', async () => {
  const { game, played } = setup({ answerMode: 'whole', progLength: 3 });
  await game.start();
  assert.equal(played[1][0].length, 3);
  await game.answer(right(game));
  assert.equal(game.state.chordIndex, 1);
  await game.answer(wrong);
  assert.equal(game.state.chordIndex, 0);
  assert.equal(game.state.slots[0].status, 'pending');
  assert.equal(played.length, 2);
  await game.answer(right(game));
  await game.answer(right(game));
  await game.answer(right(game));
  assert.equal(game.state.phase, 'reveal');
  assert.equal(game.state.prompt, 'You got it in the end!');
});

test('answers are ignored while playing or revealed, and any octave counts', async () => {
  let release;
  const g = createGame({ ...DEFAULT_SETTINGS, progLength: 1, progsCount: 1 }, { play: () => new Promise((r) => (release = r)), rng: seeded(2) });
  const started = g.start();
  assert.equal(g.state.phase, 'playing');
  assert.equal(await g.answer(new Set([0, 4, 7])), null);
  release(); // the cadence
  await new Promise((r) => setTimeout(r, 0));
  release(); // the first chord
  await started;
  assert.equal(g.state.phase, 'answer');
  const target = right(g);
  const high = new Set([...target].map((p) => p + 12));
  assert.ok(pcsEqual(pcSet(high), target));
  assert.equal(await g.answer(pcSet(high)), true);
  assert.equal(g.state.phase, 'reveal');
  assert.equal(await g.answer(target), null);
});

test('random key per session picks one of the twelve', async () => {
  const { game } = setup({ randomKey: true });
  await game.start();
  assert.ok(game.state.key);
  assert.match(game.state.prompt, /Progression 1 of 3/);
});
