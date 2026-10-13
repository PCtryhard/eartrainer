import test from 'node:test';
import assert from 'node:assert/strict';
import { BANKS, chordPcs, identify, noteName, noteNameOctave, pcSet, pcsEqual, randomProgression, progressionLabel, tonicOf, chordByLabel, enabled, KEYS } from '../js/theory.js';

const bank = BANKS.major;

test('chord offsets transpose with the key', () => {
  assert.deepEqual(chordPcs(chordByLabel('I'), 'C'), [0, 4, 7]);
  assert.deepEqual(chordPcs(chordByLabel('V'), 'F'), [0, 4, 7]);
  assert.deepEqual(chordPcs(chordByLabel('V7'), 'D'), [9, 1, 4, 7]);
  assert.equal(tonicOf('Db'), 1);
  assert.equal(tonicOf('F#'), 6);
  assert.equal(KEYS.length, 12);
});

test('identify compares pitch class sets only', () => {
  assert.equal(identify(pcSet([64, 67, 72]), bank, 'C').label, 'I');
  assert.equal(identify(pcSet([48, 52, 55, 64]), bank, 'C').label, 'I');
  assert.equal(identify(pcSet([48, 52, 55, 58]), bank, 'C'), null);
  assert.equal(identify(pcSet([65, 68, 72]), bank, 'C').label, 'iv');
  assert.equal(identify(pcSet([65, 69, 72]), bank, 'C').label, 'IV');
  assert.ok(pcsEqual(pcSet([60, 64, 67]), pcSet([67, 76, 84])));
});

test('note names follow the key', () => {
  assert.equal(noteName(70, 'Bb'), 'Bb');
  assert.equal(noteName(70, 'G'), 'A#');
  assert.equal(noteNameOctave(60, 'C'), 'C4');
  assert.equal(noteNameOctave(21, 'C'), 'A0');
});

test('random progressions come from the enabled bank', () => {
  const on = enabled(bank, ['I', 'V']);
  const prog = randomProgression(on, 50, null, Math.random);
  assert.equal(prog.length, 50);
  assert.ok(prog.every((c) => c.label === 'I' || c.label === 'V'));
  const weighted = randomProgression(on, 50, [0, 1], Math.random);
  assert.ok(weighted.every((c) => c.label === 'V'));
  assert.equal(progressionLabel(prog.slice(0, 2).map(() => chordByLabel('vi'))), 'vi-vi');
});
