import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_SETTINGS, loadSettings, saveSettings, loadStats, recordStat, resetStats, weakest } from '../js/store.js';

const memory = () => {
  const m = new Map();
  return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) };
};

test('settings merge with defaults and persist', () => {
  const st = memory();
  assert.deepEqual(loadSettings(st), DEFAULT_SETTINGS);
  saveSettings({ ...DEFAULT_SETTINGS, key: 'G', tempo: 0.5 }, st);
  assert.equal(loadSettings(st).key, 'G');
  assert.equal(loadSettings(st).tempo, 0.5);
  assert.equal(loadSettings(st).progLength, 4);
  st.setItem('eartrainer.settings', '{broken');
  assert.deepEqual(loadSettings(st), DEFAULT_SETTINGS);
});

test('stats count first tries per chord and sort weakest first', () => {
  const st = memory();
  recordStat('I', true, st);
  recordStat('I', false, st);
  recordStat('vi', false, st);
  recordStat('V', true, st);
  const w = weakest(loadStats(st));
  assert.deepEqual(w.map((x) => x.label), ['vi', 'I', 'V']);
  assert.equal(w[1].rate, 0.5);
  resetStats(st);
  assert.deepEqual(loadStats(st), {});
});
