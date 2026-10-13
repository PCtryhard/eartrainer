// 88 key strip: lights notes and, when clickable, toggles them for an on screen answer
import { LOW, HIGH } from './voicing.js';

const BLACK = new Set([1, 3, 6, 8, 10]);
export const isBlack = (n) => BLACK.has(n % 12);

// white key index from a0 for each midi note, black keys sit after the white key below them
export const layout = () => {
  const keys = [];
  let whites = 0;
  for (let n = LOW; n <= HIGH; n++) {
    keys.push({ note: n, black: isBlack(n), white: whites });
    if (!isBlack(n)) whites++;
  }
  return { keys, whites };
};

export const createKeyboard = (el, { onChange } = {}) => {
  const { keys, whites } = layout();
  const w = 100 / whites;
  const byNote = new Map();
  let clickable = false;
  const selected = new Set();
  el.classList.add('keys');
  for (const k of keys) {
    const d = document.createElement('div');
    d.className = k.black ? 'key black' : 'key white';
    d.style.left = `${k.black ? (k.white - 0.3) * w : k.white * w}%`;
    d.style.width = `${k.black ? w * 0.6 : w}%`;
    d.dataset.note = k.note;
    if (k.note % 12 === 0) d.textContent = `C${k.note / 12 - 1}`;
    d.addEventListener('click', () => {
      if (!clickable) return;
      selected.has(k.note) ? selected.delete(k.note) : selected.add(k.note);
      d.classList.toggle('sel', selected.has(k.note));
      onChange?.([...selected].sort((a, b) => a - b));
    });
    byNote.set(k.note, d);
    el.appendChild(d);
  }
  const clear = (cls) => byNote.forEach((d) => d.classList.remove(cls));
  const light = (notes, cls = 'lit') => notes.forEach((n) => byNote.get(n)?.classList.add(cls));
  const unlight = (notes, cls = 'lit') => notes.forEach((n) => byNote.get(n)?.classList.remove(cls));
  const reset = () => {
    selected.clear();
    clear('sel');
    onChange?.([]);
  };
  return {
    light, unlight, clear, reset,
    selected: () => [...selected].sort((a, b) => a - b),
    setClickable: (v) => { clickable = v; el.classList.toggle('clickable', v); },
  };
};
