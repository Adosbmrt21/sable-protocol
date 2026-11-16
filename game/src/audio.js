// GOBLOK OPENFIRE — synthesized sound. No audio files: every effect is built
// from oscillators and filtered noise in WebAudio, so the game ships as pure
// code and still cracks, clicks and booms. One shared context, created lazily
// on the first user gesture (browsers refuse audio before one).

let ctx = null;
let master = null;

function ensure() {
  if (ctx) return ctx;
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return null;
  ctx = new AC();
  master = ctx.createGain();
  master.gain.value = 0.5;
  master.connect(ctx.destination);
  return ctx;
}

export function unlockAudio() {
  const c = ensure();
  if (c && c.state === 'suspended') c.resume();
}

// A short noise burst through a band filter — the body of every gunshot.
function noiseBurst({ dur = 0.12, freq = 1800, q = 0.8, gain = 0.5, type = 'lowpass', sweepTo = 0 }) {
  const c = ensure();
  if (!c) return;
  const t = c.currentTime;
  const len = Math.max(1, (dur * c.sampleRate) | 0);
  const buffer = c.createBuffer(1, len, c.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
  const src = c.createBufferSource();
  src.buffer = buffer;
  const filter = c.createBiquadFilter();
  filter.type = type;
  filter.frequency.setValueAtTime(freq, t);
  if (sweepTo > 0) filter.frequency.exponentialRampToValueAtTime(sweepTo, t + dur);
  filter.Q.value = q;
  const g = c.createGain();
  g.gain.setValueAtTime(gain, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  src.connect(filter).connect(g).connect(master);
  src.start(t);
}

// A plain tone with an envelope — beeps, dings and stingers.
function tone({ freq = 440, dur = 0.1, gain = 0.2, type = 'sine', slideTo = 0, delay = 0 }) {
  const c = ensure();
  if (!c) return;
  const t = c.currentTime + delay;
  const osc = c.createOscillator();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t);
  if (slideTo > 0) osc.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
  const g = c.createGain();
  g.gain.setValueAtTime(gain, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  osc.connect(g).connect(master);
  osc.start(t);
  osc.stop(t + dur + 0.02);
}

// Distance falloff for world sounds: pos is a THREE.Vector3-like {x,z} and
// ear is the listener position. Returns 0..1 gain and a pan value -1..1.
function spatial(pos, ear, maxDist = 42) {
  const dx = pos.x - ear.x;
  const dz = pos.z - ear.z;
  const d = Math.hypot(dx, dz);
  if (d >= maxDist) return 0;
  return Math.max(0.05, 1 - d / maxDist);
}

export const sfx = {
  shot(kind, pos, ear) {
    const g = pos && ear ? spatial(pos, ear) : 1;
    if (g <= 0) return;
    if (kind === 'verdict') {
      noiseBurst({ dur: 0.34, freq: 3200, gain: 0.85 * g, sweepTo: 220 });
      tone({ freq: 130, dur: 0.22, gain: 0.5 * g, type: 'triangle', slideTo: 55 });
    } else if (kind === 'marauder') {
      noiseBurst({ dur: 0.07, freq: 2400, gain: 0.4 * g, sweepTo: 700 });
    } else if (kind === 'kestrel') {
      noiseBurst({ dur: 0.09, freq: 2100, gain: 0.45 * g, sweepTo: 500 });
    } else {
      noiseBurst({ dur: 0.13, freq: 2600, gain: 0.6 * g, sweepTo: 380 });
    }
  },
  dryFire() { tone({ freq: 1900, dur: 0.03, gain: 0.12, type: 'square' }); },
  reloadStart() { noiseBurst({ dur: 0.05, freq: 1200, gain: 0.2, type: 'bandpass' }); },
  reloadEnd() {
    noiseBurst({ dur: 0.05, freq: 1600, gain: 0.25, type: 'bandpass' });
    tone({ freq: 700, dur: 0.05, gain: 0.12, type: 'square', delay: 0.05 });
  },
  hit(head) {
    tone({ freq: head ? 1560 : 1050, dur: 0.06, gain: 0.22, type: 'square' });
    if (head) tone({ freq: 2100, dur: 0.09, gain: 0.16, type: 'square', delay: 0.04 });
  },
  hurt() { tone({ freq: 180, dur: 0.12, gain: 0.25, type: 'sawtooth', slideTo: 90 }); },
  kill() { tone({ freq: 520, dur: 0.1, gain: 0.2, type: 'triangle' }); tone({ freq: 780, dur: 0.14, gain: 0.2, type: 'triangle', delay: 0.07 }); },
  step(run) { noiseBurst({ dur: 0.045, freq: run ? 500 : 380, gain: run ? 0.1 : 0.06, type: 'lowpass' }); },
  jump() { noiseBurst({ dur: 0.06, freq: 700, gain: 0.08, type: 'bandpass' }); },
  land() { noiseBurst({ dur: 0.07, freq: 420, gain: 0.12, type: 'lowpass' }); },
  plantBeep(n) { tone({ freq: 880 + n * 60, dur: 0.07, gain: 0.2, type: 'square' }); },
  planted() { tone({ freq: 660, dur: 0.12, gain: 0.25, type: 'square' }); tone({ freq: 990, dur: 0.2, gain: 0.25, type: 'square', delay: 0.12 }); },
  bombTick() { tone({ freq: 1180, dur: 0.03, gain: 0.1, type: 'square' }); },
  explosion() {
    noiseBurst({ dur: 1.1, freq: 900, gain: 1.0, sweepTo: 60 });
    tone({ freq: 70, dur: 0.9, gain: 0.7, type: 'sine', slideTo: 32 });
  },
  flashPop() { noiseBurst({ dur: 0.16, freq: 4000, gain: 0.5, type: 'highpass' }); },
  shardPop() {
    noiseBurst({ dur: 0.4, freq: 1500, gain: 0.7, sweepTo: 150 });
    tone({ freq: 95, dur: 0.3, gain: 0.5, type: 'triangle', slideTo: 45 });
  },
  buy() { tone({ freq: 1320, dur: 0.06, gain: 0.15, type: 'square' }); },
  denied() { tone({ freq: 220, dur: 0.12, gain: 0.18, type: 'square' }); },
  roundWin() { [523, 659, 784].forEach((f, i) => tone({ freq: f, dur: 0.16, gain: 0.2, type: 'triangle', delay: i * 0.09 })); },
  roundLose() { [392, 330, 262].forEach((f, i) => tone({ freq: f, dur: 0.18, gain: 0.2, type: 'triangle', delay: i * 0.1 })); },
  throwWhoosh() { noiseBurst({ dur: 0.14, freq: 900, gain: 0.1, type: 'bandpass', sweepTo: 2000 }); },
};
