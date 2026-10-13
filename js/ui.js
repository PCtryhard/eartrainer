// dom wiring: settings, inputs, the game loop and the keyboard strip
import { BANKS, KEYS, chordPcs, pcSet, noteName } from './theory.js';
import { createGame } from './game.js';
import { createPlayer } from './player.js';
import { createMidiInput } from './midi-in.js';
import { createMicInput } from './mic-in.js';
import { buildTemplates } from './chroma.js';
import { createKeyboard } from './keyboard.js';
import { loadSettings, saveSettings, loadStats, recordStat, resetStats, weakest } from './store.js';

const $ = (id) => document.getElementById(id);
const show = (el, v) => (el.hidden = !v);
let settings = loadSettings();
const player = createPlayer(new URL('../samples/', import.meta.url));
const keyboard = createKeyboard($('keyboard'), { onChange: (sel) => show($('submit'), inputKind === 'screen' && sel.length > 0 && game?.state.phase === 'answer') });
let game = null, input = null, inputKind = null, loaded = false;

const settingsOf = () => ({ ...settings, weights: null });

// settings form
const form = $('settingsForm');
form.key.replaceChildren(...KEYS.map((k) => new Option(k, k)));
const chordChecks = $('chordChecks');
for (const c of BANKS.major) {
  const l = document.createElement('label');
  const cb = Object.assign(document.createElement('input'), { type: 'checkbox', value: c.label });
  l.append(cb, ` ${c.label}${c.name ? ` (${c.name})` : ''}`);
  chordChecks.appendChild(l);
}
const fillForm = () => {
  for (const el of form.elements) {
    if (!el.name) continue;
    if (el.type === 'checkbox') el.checked = !!settings[el.name];
    else el.value = settings[el.name];
  }
  chordChecks.querySelectorAll('input').forEach((cb) => (cb.checked = settings.chords.includes(cb.value)));
  $('input').value = settings.input;
};
const readForm = () => {
  const s = { ...settings };
  for (const el of form.elements) {
    if (!el.name) continue;
    s[el.name] = el.type === 'checkbox' ? el.checked : el.type === 'number' ? Number(el.value) : el.value;
  }
  s.chords = [...chordChecks.querySelectorAll('input:checked')].map((cb) => cb.value);
  if (!s.chords.length) s.chords = ['I', 'IV', 'V'];
  if (s.high - s.low < s.maxSpan) s.high = Math.min(108, s.low + Math.max(s.maxSpan, 12));
  settings = s;
  saveSettings(settings);
  input?.setWindow?.(settings.chordWindow);
  renderNumerals();
};
form.addEventListener('input', readForm);
chordChecks.addEventListener('input', readForm);
$('settingsToggle').onclick = () => show($('settings'), $('settings').hidden);
$('statsToggle').onclick = () => { renderStats(); show($('stats'), $('stats').hidden); };
$('resetStats').onclick = () => { resetStats(); renderStats(); };

const renderStats = () => {
  const rows = weakest(loadStats());
  $('statsTable').tBodies[0].replaceChildren(...rows.map((r) => {
    const tr = document.createElement('tr');
    tr.innerHTML = `<td>${r.label}</td><td>${Math.round(r.rate * 100)}%</td><td>${r.tries}</td>`;
    return tr;
  }));
  if (!rows.length) $('statsTable').tBodies[0].innerHTML = '<tr><td colspan="3">Nothing yet</td></tr>';
};

// numeral buttons for the enabled chords, number keys as shortcuts
const numeralBank = () => game?.bank ?? BANKS.major.filter((c) => settings.chords.includes(c.label));
const renderNumerals = () => {
  const el = $('numerals');
  el.replaceChildren(...numeralBank().map((c, i) => {
    const b = document.createElement('button');
    b.innerHTML = `${c.label}<small>${i + 1}</small>`;
    b.onclick = () => answerNumeral(i);
    return b;
  }));
  show(el, inputKind === 'screen');
};
const answerNumeral = (i) => {
  const c = numeralBank()[i];
  if (c && game) submit(new Set(chordPcs(c, game.state.key)), [], `Answered: ${c.label}`);
};

// inputs
const muted = () => !game || game.state.phase !== 'answer' || player.isPlaying();
const submit = (pcs, raw, note) => game?.answer(pcs, raw, note);

const inputs = {
  midi: () => createMidiInput({
    windowMs: settings.chordWindow,
    muted,
    onChord: (pcs, raw) => submit(pcs, raw),
    onNote: (n, on) => (on ? keyboard.light([n]) : keyboard.unlight([n])),
    onDevices: (names) => ($('inputStatus').textContent = names.length ? `MIDI: ${names.join(', ')}` : 'MIDI: no device connected'),
  }),
  mic: () => createMicInput({
    muted: () => muted() || !player.quietFor(300),
    templates: () => buildTemplates(numeralBank(), game?.state.key ?? settings.key),
    onChord: (chord) => submit(new Set(chordPcs(chord, game.state.key)), [], `Detected: ${chord.label}`),
    onMiss: () => { $('feedback').textContent = "Didn't catch that, play it again"; $('feedback').className = 'feedback'; },
    onLevel: (v) => ($('micLevel').style.width = `${Math.min(100, v * 800)}%`),
    onStatus: (t) => ($('micStatus').textContent = t),
    onDebug: ({ chroma, result }) => {
      const max = Math.max(...chroma, 1e-6);
      $('chroma').replaceChildren(...[...chroma].map((v, i) => {
        const d = document.createElement('div');
        d.style.height = `${(v / max) * 100}%`;
        d.dataset.pc = noteName(i, game?.state.key ?? settings.key);
        return d;
      }));
      $('micResult').textContent = result ? `${result.label} (${result.score.toFixed(2)}, margin ${result.margin.toFixed(3)} over ${result.second})${result.ok ? '' : ', not confident'}` : 'No result';
    },
  }),
  screen: () => ({ start: async () => ($('inputStatus').textContent = 'On-screen: click keys then Submit, or press a numeral'), stop: () => {} }),
};

const selectInput = async (kind) => {
  input?.stop();
  inputKind = kind;
  settings.input = kind;
  saveSettings(settings);
  input = inputs[kind]();
  keyboard.setClickable(kind === 'screen');
  show($('submit'), false);
  show($('clearKeys'), kind === 'screen');
  show($('calibrate'), kind === 'mic');
  show($('micDebug'), kind === 'mic');
  renderNumerals();
  try {
    await input.start();
    if (kind === 'mic') $('inputStatus').textContent = 'Mic on (beta)';
  } catch (e) {
    $('inputStatus').textContent = `${kind === 'midi' ? 'MIDI' : 'Mic'} unavailable: ${e.message}`;
  }
};
$('input').onchange = (e) => selectInput(e.target.value);
$('calibrate').onclick = () => input?.calibrate?.();
$('submit').onclick = () => { const sel = keyboard.selected(); if (sel.length) { submit(pcSet(sel), sel); keyboard.reset(); } };
$('clearKeys').onclick = () => keyboard.reset();

// game
const render = (s) => {
  $('prompt').textContent = s.prompt;
  const fb = $('feedback');
  fb.textContent = s.feedback;
  fb.className = `feedback ${s.feedback === 'Try again' ? 'bad' : s.feedback === 'Right' || s.prompt === 'Perfect!' ? 'ok' : ''}`;
  $('detected').textContent = s.detected;
  const finished = s.phase === 'done' ? s.progsCount : s.phase === 'reveal' ? s.progIndex + 1 : s.progIndex;
  $('score').textContent = `Score ${s.score}/${finished}`;
  $('counter').textContent = s.phase === 'idle' ? '' : `Progression ${Math.min(s.progIndex + 1, s.progsCount)} of ${s.progsCount}, key of ${s.key}`;
  $('slots').replaceChildren(...s.slots.map((slot, i) => {
    const d = document.createElement('div');
    d.className = `slot ${slot.status}${i === s.chordIndex && s.phase === 'answer' ? ' current' : ''}`;
    d.textContent = s.phase === 'reveal' ? s.chords[i].label : slot.label || (slot.status === 'wrong' ? '?' : '');
    if (s.phase === 'reveal') d.onclick = () => reveal(s, i);
    return d;
  }));
  show($('start'), s.phase === 'idle' || s.phase === 'done');
  $('start').textContent = s.phase === 'done' ? 'New session' : 'Start';
  show($('play'), s.phase === 'answer');
  show($('show'), s.phase === 'answer');
  show($('next'), s.phase === 'reveal');
  if (s.phase === 'reveal') reveal(s, s.chords.length - 1);
  if (s.phase === 'playing') keyboard.clear('reveal');
  if (s.phase === 'done') summary(s);
};
const reveal = (s, i) => { keyboard.clear('reveal'); keyboard.light(s.voicings[i], 'reveal'); };
const summary = (s) => {
  const rows = Object.entries(s.session).map(([l, e]) => `<tr><td>${l}</td><td>${Math.round((100 * e.firstTry) / e.tries)}%</td><td>${e.tries}</td></tr>`).join('');
  $('summary').innerHTML = `<h2>Session summary</h2><p>Score ${s.score}/${s.progsCount}</p><table><thead><tr><th>Chord</th><th>First try</th><th>Heard</th></tr></thead><tbody>${rows}</tbody></table>`;
  show($('summary'), true);
};

const start = async () => {
  $('start').disabled = true;
  show($('summary'), false);
  await player.unlock();
  if (!loaded) {
    $('prompt').textContent = 'Loading piano...';
    loaded = true;
    const ok = await player.load();
    if (!ok) { $('notice').textContent = 'Piano samples did not load, using a simple synth tone.'; show($('notice'), true); }
  }
  if (!input) await selectInput(settings.input);
  game = createGame(settingsOf(), { play: (v, sec) => player.playProgression(v, sec), onChange: render, onStat: recordStat });
  renderNumerals();
  $('start').disabled = false;
  await game.start();
};
$('start').onclick = start;
$('play').onclick = () => game?.replay();
$('show').onclick = () => game?.showAnswer();
$('next').onclick = () => game?.next();

document.addEventListener('keydown', (e) => {
  if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT') return;
  if (e.key === ' ' || e.key === 'r' || e.key === 'R') { e.preventDefault(); game?.replay(); }
  else if (e.key === 'Enter') { e.preventDefault(); game?.state.phase === 'reveal' ? game.next() : (!game || game.state.phase === 'done') && start(); }
  else if (/^[1-9]$/.test(e.key) && inputKind === 'screen') answerNumeral(Number(e.key) - 1);
});

// safari and other browsers without web midi
if (!navigator.requestMIDIAccess) {
  $('notice').textContent = 'This browser has no Web MIDI. Use the microphone or the on-screen keyboard.';
  show($('notice'), true);
  if (settings.input === 'midi') settings.input = 'screen';
}
if (!window.isSecureContext) {
  $('notice').textContent = 'MIDI and microphone need HTTPS or localhost.';
  show($('notice'), true);
}
fillForm();
renderNumerals();
renderStats();
// debug hook for the console and browser tests
window.trainer = { player, keyboard, get game() { return game; }, get settings() { return settings; } };
