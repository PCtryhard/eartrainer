// web midi capture: a chord is every note on until the window passes with no new note
import { pcSet } from './theory.js';

export const createCapture = ({ windowMs = 300, emit, setTimer = setTimeout, clearTimer = clearTimeout }) => {
  let notes = new Set();
  let timer = null;
  let win = windowMs;
  const flush = () => {
    const raw = [...notes].sort((a, b) => a - b);
    notes = new Set();
    timer = null;
    if (raw.length) emit(pcSet(raw), raw);
  };
  const noteOn = (n) => {
    notes.add(n);
    if (timer !== null) clearTimer(timer);
    timer = setTimer(flush, win);
  };
  return { noteOn, setWindow: (ms) => { win = ms; }, pending: () => notes.size };
};

export const createMidiInput = ({ onChord, onNote, onDevices, muted = () => false, windowMs = 300 }) => {
  const capture = createCapture({ windowMs, emit: onChord });
  let access = null;

  const onMessage = (e) => {
    const [status, note, vel] = e.data;
    const cmd = status & 0xf0;
    if (cmd !== 0x90 && cmd !== 0x80) return; // sustain and other control change ignored
    const on = cmd === 0x90 && vel > 0;
    onNote?.(note, on);
    if (on && !muted()) capture.noteOn(note);
  };

  const bind = () => {
    const names = [];
    for (const input of access.inputs.values()) {
      input.onmidimessage = onMessage;
      if (input.state === 'connected') names.push(input.name);
    }
    onDevices(names);
  };

  const start = async () => {
    if (!navigator.requestMIDIAccess) throw new Error('Web MIDI is not available in this browser');
    access = await navigator.requestMIDIAccess();
    access.onstatechange = bind;
    bind();
  };

  const stop = () => {
    if (!access) return;
    for (const input of access.inputs.values()) input.onmidimessage = null;
    access.onstatechange = null;
    access = null;
  };

  return { start, stop, setWindow: capture.setWindow, supported: () => !!navigator.requestMIDIAccess };
};
