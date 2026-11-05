// Tiny synthesized sounds for the 3D game (no audio files, nothing downloaded): a soft shot, a
// distant enemy shot, a hit "tick", a quiet hurt thump and a success chime. Volume is kept low
// on purpose (calm for sensitive ears) and can be turned off; the choice is remembered.

import { loudness } from '../ui/uiSound';
import { getCustomSound, type GameSoundSlot } from '../sound/customSounds';
import { SAMPLE_RATE } from '../sound/synth';

let ctx: AudioContext | null = null;
/** Settings → Sounds → "Game sounds" (1 = the default level). */
const gameVol = () => loudness('game') / 0.42;
let noise: AudioBuffer | null = null;
const KEY = 'mf.sfx.v1';

export function sfxOn(): boolean {
  try {
    return localStorage.getItem(KEY) !== 'off';
  } catch {
    return true;
  }
}
export function setSfx(on: boolean): void {
  try {
    localStorage.setItem(KEY, on ? 'on' : 'off');
  } catch {
    /* ignore */
  }
}

function audio(): AudioContext | null {
  if (!sfxOn()) return null;
  try {
    ctx ??= new AudioContext();
    if (ctx.state === 'suspended') void ctx.resume();
    if (!noise) {
      noise = ctx.createBuffer(1, ctx.sampleRate * 0.4, ctx.sampleRate);
      const d = noise.getChannelData(0);
      let s = 1;
      for (let i = 0; i < d.length; i++) {
        s = (s * 16807) % 2147483647;
        d[i] = (s / 2147483647) * 2 - 1;
      }
    }
    return ctx;
  } catch {
    return null;
  }
}

function burst(freq: number, dur: number, vol: number, q = 0.8): void {
  const a = audio();
  if (!a || !noise) return;
  const src = a.createBufferSource();
  src.buffer = noise;
  const f = a.createBiquadFilter();
  f.type = 'lowpass';
  f.frequency.value = freq;
  f.Q.value = q;
  const g = a.createGain();
  const t = a.currentTime;
  g.gain.setValueAtTime(Math.max(0.0001, vol * gameVol()), t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  src.connect(f).connect(g).connect(a.destination);
  src.start(t);
  src.stop(t + dur + 0.02);
}

function tone(freq: number, dur: number, vol: number, type: OscillatorType = 'sine', at = 0): void {
  const a = audio();
  if (!a) return;
  const o = a.createOscillator();
  o.type = type;
  o.frequency.value = freq;
  const g = a.createGain();
  const t = a.currentTime + at;
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(Math.max(0.0001, vol * gameVol()), t + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(a.destination);
  o.start(t);
  o.stop(t + dur + 0.02);
}

/** A sound made in the Sound Lab, if the player chose one for this slot. */
function custom(slot: GameSoundSlot, vol = 0.8): boolean {
  const s = getCustomSound(slot);
  const a = s && audio();
  if (!s || !a) return false;
  const b = a.createBuffer(1, s.length, SAMPLE_RATE);
  b.getChannelData(0).set(s);
  const src = a.createBufferSource();
  src.buffer = b;
  const g = a.createGain();
  g.gain.value = vol * gameVol();
  src.connect(g).connect(a.destination);
  src.start();
  return true;
}

export const sfx = {
  shot: () => {
    if (custom('shot')) return;
    burst(2400, 0.12, 0.16);
    tone(110, 0.09, 0.06, 'triangle');
  },
  enemyShot: (distance: number) => burst(900, 0.18, Math.max(0.015, 0.07 - distance * 0.002)),
  hit: () => void (custom('hit', 0.6) || tone(1500, 0.05, 0.05, 'square')),
  kill: () => {
    tone(880, 0.08, 0.05, 'triangle');
    tone(1320, 0.1, 0.04, 'triangle', 0.07);
  },
  hurt: () => tone(90, 0.18, 0.12, 'sine'),
  win: () => [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.25, 0.06, 'triangle', i * 0.11)),
};
