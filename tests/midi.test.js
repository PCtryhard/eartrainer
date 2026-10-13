import test from 'node:test';
import assert from 'node:assert/strict';
import { createCapture } from '../js/midi-in.js';

// fake timers: fire whatever is due when the clock advances
const clock = () => {
  let now = 0, id = 0;
  const timers = new Map();
  return {
    setTimer: (fn, ms) => (timers.set(++id, { at: now + ms, fn }), id),
    clearTimer: (i) => timers.delete(i),
    advance: (ms) => {
      now += ms;
      for (const [i, t] of [...timers]) if (t.at <= now) (timers.delete(i), t.fn());
    },
  };
};

test('a rolled chord within the window becomes one chord', () => {
  const c = clock();
  const out = [];
  const cap = createCapture({ windowMs: 300, emit: (pcs, raw) => out.push([pcs, raw]), setTimer: c.setTimer, clearTimer: c.clearTimer });
  cap.noteOn(64);
  c.advance(100);
  cap.noteOn(60);
  c.advance(200);
  cap.noteOn(67);
  c.advance(299);
  assert.equal(out.length, 0);
  c.advance(1);
  assert.equal(out.length, 1);
  assert.deepEqual(out[0][1], [60, 64, 67]);
  assert.deepEqual([...out[0][0]].sort((a, b) => a - b), [0, 4, 7]);
});

test('a note after the window starts a new chord, and the window can change', () => {
  const c = clock();
  const out = [];
  const cap = createCapture({ windowMs: 300, emit: (pcs, raw) => out.push(raw), setTimer: c.setTimer, clearTimer: c.clearTimer });
  cap.noteOn(60);
  c.advance(300);
  cap.setWindow(150);
  cap.noteOn(62);
  c.advance(150);
  assert.deepEqual(out, [[60], [62]]);
});
