# Chord Ear Trainer

A browser ear trainer for harmonic progressions. The app plays a chord or a short progression with a piano sound, and you play it back on a MIDI keyboard, on an acoustic piano picked up by the microphone, or on the on-screen keyboard. Only pitch classes count: any octave, inversion or doubling is accepted.

It is a port of a small Python prototype (mingus + pygame). Everything runs in the browser: plain HTML, CSS and vanilla ES modules, no backend, no build step, no runtime dependencies.

## Run locally

Any static file server works. MIDI and microphone need a secure context, so use `localhost` or HTTPS.

```sh
python3 -m http.server 8080
# open http://localhost:8080/
```

To try it under a subpath the way it is deployed:

```sh
mkdir -p /tmp/site && ln -s "$PWD" /tmp/site/eartrainer
cd /tmp/site && python3 -m http.server 8080
# open http://localhost:8080/eartrainer/
```

Tests (pure logic only, no dependencies):

```sh
node --test
```

## Deploy

The site is relative-URL only, so it can live at any subpath, for example `https://learnedconsciousness.com/eartrainer/`.

Static folder: copy `index.html`, `css/`, `js/` and `samples/` into the subfolder your web server serves. Nothing else is needed.

Docker image (nginx serving the static files on port 80):

```sh
docker build -t eartrainer .
docker run -d --name eartrainer -p 127.0.0.1:8081:80 eartrainer
```

Behind a reverse proxy, map the subpath to the container root. The trailing slashes matter: they strip the prefix.

nginx:

```nginx
location /eartrainer/ {
    proxy_pass http://127.0.0.1:8081/;
}
```

Caddy:

```
handle_path /eartrainer/* {
    reverse_proxy 127.0.0.1:8081
}
```

Serve the proxy over HTTPS. Browsers refuse Web MIDI and `getUserMedia` on plain HTTP except on `localhost`.

## Browser support

Current Chrome and Edge on desktop support everything. Firefox supports Web MIDI (it asks for a site permission the first time). Safari has no Web MIDI: the page shows a one-line notice and offers the microphone and the on-screen keyboard instead. Tablets work with the on-screen keyboard or the microphone.

## How it works

- `js/theory.js` holds the chord bank as semitone offsets from the tonic, the twelve major keys and note spelling (flats in flat keys). Minor keys and more chords can be added as data.
- `js/voicing.js` voices progressions. The first chord is sampled by rejection anywhere on the 88 keys: 3 to 5 voices, random position and spacing up to `maxSpan`, any inversion, with a mud guard that keeps notes below C3 at least a fifth apart. Each following chord is the candidate closest to the previous one under the outer-voice distance `|low diff| + |high diff|`, chosen from the union of an inversion walk (port of the prototype's `find_closest_inversion`), every close-position inversion in range, and a per-voice search where each voice moves to the nearest pitch of an assigned chord tone. Ties go to the smallest total movement, then random. The prototype's signed metric is available as `metric: "signedOuter"`.
- `js/game.js` is the session state machine: cadence, random progression, answers, retries, scoring, reveal, summary.
- `js/player.js` plays the Salamander samples with the Web Audio API, one sample every minor third, pitch-shifted with `playbackRate`. If the samples fail to load it falls back to a triangle-wave synth.
- `js/midi-in.js` captures chords from all MIDI inputs: a chord is every note-on until `chordWindow` ms pass without a new one.
- `js/chroma.js` and `js/mic-in.js` implement microphone mode: onset on an RMS rise over the calibrated floor, a 16384-point spectrum averaged over 150 to 600 ms after the onset, a 12-bin chroma from spectral peaks between 55 Hz and 4 kHz, and cosine matching against harmonic templates of the enabled chords.
- `js/keyboard.js` draws the 88-key strip, lights MIDI notes and the revealed voicing, and doubles as click input.
- `js/store.js` keeps settings and per-chord first-try stats in `localStorage`.

## Microphone mode (beta) and its limits

The classifier does not transcribe. It picks the most similar chord among the enabled ones, so it can only ever answer with a bank chord, and it needs a margin over the runner-up or it says "Didn't catch that". Known limits:

- Chords sharing two notes (I, iii, vi, III) are the hardest. Calibrate in silence and play cleanly, without pedal, in the middle of the keyboard.
- Room noise, a loud piano close to a small microphone, or a laptop mic with built-in processing all hurt. The app asks the browser to disable echo cancellation, noise suppression and automatic gain, but some devices ignore that.
- The chord window is fixed: play the chord as a block, not rolled.
- The debug panel (collapsible, under the keyboard) shows the live chroma, the detected chord, its score and the margin.

If accuracy on real pianos turns out poor, the next step is a proper polyphonic transcription model such as Spotify's basic-pitch (TensorFlow.js). It is not included now.

## Samples

Piano: Salamander Grand Piano by Alexander Holm, CC BY 3.0, taken from the Tone.js audio repository (`https://github.com/Tonejs/audio`, folder `salamander`). Thirty samples, one every minor third from A0 to C8, are in `samples/`.

## Decisions

- Project files: besides the layout in the brief there is a `package.json` with only `"type": "module"` and a test script, so `node --test` resolves the modules on every Node version. Nothing is installed from it.
- Chord bank entry for V7 uses the code `57`, the prototype had no code for it.
- The cadence is voiced from a close root-position tonic around C4 and then smoothly, so the key is easy to hear. The progression's first chord is random on the whole keyboard as specified.
- Voice count: the first chord picks 3 to 5 voices. If a later chord has more tones than voices (V7 after a triad) a voice is added and kept for the rest of the progression; voices are never removed.
- `maxSpan` has a minimum of 12 so every chord has a voicing; the range is widened to at least the span if the settings contradict each other.
- Mud guard rule: for each pair of adjacent notes whose lower note is below C3 (48), the gap is at least 7 semitones.
- Slots: green means right on the first try; red with the numeral means right after a retry or after "Show answer". The red color stays so the progression's score is visible at a glance.
- Whole-progression mode: a wrong chord restarts the answer at the first chord, like the prototype's whole-input retry. "Show answer" reveals the current chord and moves on.
- Numeral buttons (with number-key shortcuts) are shown only for the on-screen input, so MIDI and mic sessions are not answered by clicking.
- The detected text after a wrong answer shows note names for MIDI and keyboard input, and the classified numeral for the microphone, never the right answer.
- Stats record a chord as first-try right only on its first attempt in a progression. "Show answer" counts as a failed first try.
- Mic mode thresholds: onset when RMS exceeds four times the calibrated floor and rises 60 percent over the previous frame; the per-bin floor is 2.5 times the calibrated noise spectrum; a result needs a cosine margin of 0.02 over the runner-up.
- Random key: chosen once per session and shown next to the progression counter.
- Score display counts a progression once it is revealed.
- The debug hook `window.trainer` exposes the player, keyboard and game state for the browser console and for scripted browser tests.
