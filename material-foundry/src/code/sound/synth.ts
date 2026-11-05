// A small sound synthesizer for game sounds (like the classic "sfxr"): one wave, a pitch that can
// slide, vibrato, a second note (arpeggio), a volume envelope and a low-pass filter. Everything is
// computed here, offline — no files, no internet. Also: sound analysis (pitch, loudness, "how
// square", "how noisy") used by the sound lessons to check what was made, and WAV export.

export type Wave = 'sine' | 'square' | 'saw' | 'triangle' | 'noise';

export interface SynthParams {
  wave: Wave;
  /** Start pitch, Hz. */
  freq: number;
  /** Pitch change per second, Hz/s (+ up, − down). */
  slide: number;
  attack: number;
  sustain: number;
  decay: number;
  /** Vibrato: how far (fraction of the pitch) and how fast (Hz). */
  vibDepth: number;
  vibSpeed: number;
  /** Square wave: share of the "up" half (0.5 = classic). */
  duty: number;
  /** Second note: after this many seconds the pitch is multiplied by arpMul (0 = off). */
  arpAt: number;
  arpMul: number;
  /** Low-pass filter, Hz (high = bright, low = muffled). */
  lowpass: number;
  volume: number;
}

export const DEFAULT_PARAMS: SynthParams = { wave: 'square', freq: 440, slide: 0, attack: 0.005, sustain: 0.1, decay: 0.25, vibDepth: 0, vibSpeed: 6, duty: 0.5, arpAt: 0, arpMul: 1, lowpass: 12000, volume: 0.5 };

export const SAMPLE_RATE = 22050;

export function duration(p: SynthParams): number {
  return Math.min(4, p.attack + p.sustain + p.decay);
}

/**
 * Renders the sound. timeScale 2 = twice as slow but the SAME pitch (to listen carefully):
 * all times get longer and the slides/vibrato get slower, the notes stay where they are.
 */
export function render(p: SynthParams, timeScale = 1, rate = SAMPLE_RATE): Float32Array {
  const len = Math.max(1, Math.floor(duration(p) * timeScale * rate));
  const out = new Float32Array(len);
  let phase = 0;
  let seed = 12345;
  let noiseVal = 0;
  let lp = 0;
  const rc = 1 / (2 * Math.PI * Math.max(50, p.lowpass));
  const dt = 1 / rate;
  const alpha = dt / (rc + dt);
  for (let i = 0; i < len; i++) {
    const t = i / rate / timeScale; // time in the "normal speed" sound
    let f = Math.max(20, p.freq + p.slide * t);
    if (p.arpAt > 0 && t >= p.arpAt) f *= p.arpMul;
    if (p.vibDepth > 0) f *= 1 + p.vibDepth * Math.sin(2 * Math.PI * p.vibSpeed * t);
    const prev = phase;
    phase = (phase + f / rate) % 1; // the pitch stays the same at any speed
    let s: number;
    switch (p.wave) {
      case 'sine':
        s = Math.sin(2 * Math.PI * phase);
        break;
      case 'square':
        s = phase < p.duty ? 1 : -1;
        break;
      case 'saw':
        s = 2 * phase - 1;
        break;
      case 'triangle':
        s = 1 - 4 * Math.abs(phase - 0.5);
        break;
      default:
        // noise: a new random value every half period (so the "pitch" colours the noise)
        if (phase < prev || (phase >= 0.5 && prev < 0.5)) {
          seed = (seed * 16807) % 2147483647;
          noiseVal = (seed / 2147483647) * 2 - 1;
        }
        s = noiseVal;
    }
    // envelope
    let env: number;
    if (t < p.attack) env = t / Math.max(1e-4, p.attack);
    else if (t < p.attack + p.sustain) env = 1;
    else env = Math.max(0, 1 - (t - p.attack - p.sustain) / Math.max(1e-4, p.decay));
    lp += alpha * (s - lp);
    out[i] = lp * env * p.volume;
  }
  return out;
}

export interface Preset {
  id: string;
  icon: string;
  name: { en: string; ru: string };
  p: SynthParams;
}

const P = (o: Partial<SynthParams>): SynthParams => ({ ...DEFAULT_PARAMS, ...o });
export const PRESETS: Preset[] = [
  { id: 'jump', icon: '🦘', name: { en: 'Jump', ru: 'Прыжок' }, p: P({ wave: 'square', freq: 260, slide: 1400, sustain: 0.05, decay: 0.18, duty: 0.4 }) },
  { id: 'coin', icon: '🪙', name: { en: 'Coin', ru: 'Монетка' }, p: P({ wave: 'square', freq: 988, sustain: 0.05, decay: 0.3, arpAt: 0.07, arpMul: 1.335, duty: 0.5 }) },
  { id: 'laser', icon: '🔫', name: { en: 'Laser', ru: 'Лазер' }, p: P({ wave: 'saw', freq: 1500, slide: -5000, sustain: 0.02, decay: 0.2, lowpass: 7000 }) },
  { id: 'shot', icon: '💥', name: { en: 'Gunshot', ru: 'Выстрел' }, p: P({ wave: 'noise', freq: 900, slide: -1500, sustain: 0.02, decay: 0.22, lowpass: 3500, volume: 0.6 }) },
  { id: 'explosion', icon: '🧨', name: { en: 'Explosion', ru: 'Взрыв' }, p: P({ wave: 'noise', freq: 200, slide: -120, sustain: 0.1, decay: 0.9, lowpass: 1200, volume: 0.7 }) },
  { id: 'hit', icon: '🥊', name: { en: 'Hit', ru: 'Удар' }, p: P({ wave: 'noise', freq: 600, slide: -900, sustain: 0.01, decay: 0.12, lowpass: 2500 }) },
  { id: 'powerup', icon: '⭐', name: { en: 'Power-up', ru: 'Усиление' }, p: P({ wave: 'triangle', freq: 330, slide: 900, sustain: 0.2, decay: 0.3, vibDepth: 0.06, vibSpeed: 14 }) },
  { id: 'blip', icon: '🔘', name: { en: 'Menu blip', ru: 'Кнопка меню' }, p: P({ wave: 'sine', freq: 880, sustain: 0.02, decay: 0.06 }) },
  { id: 'engine', icon: '🏎', name: { en: 'Engine', ru: 'Мотор' }, p: P({ wave: 'saw', freq: 70, sustain: 0.8, decay: 0.2, vibDepth: 0.08, vibSpeed: 25, lowpass: 900 }) },
  { id: 'step', icon: '👣', name: { en: 'Footstep', ru: 'Шаг' }, p: P({ wave: 'noise', freq: 300, slide: -300, attack: 0.002, sustain: 0.005, decay: 0.07, lowpass: 900, volume: 0.45 }) },
  { id: 'alarm', icon: '🚨', name: { en: 'Alarm', ru: 'Тревога' }, p: P({ wave: 'square', freq: 700, sustain: 0.6, decay: 0.1, vibDepth: 0.25, vibSpeed: 3 }) },
  { id: 'hurt', icon: '🤕', name: { en: 'Hurt', ru: 'Больно' }, p: P({ wave: 'saw', freq: 420, slide: -800, sustain: 0.03, decay: 0.18, lowpass: 3000 }) },
];

/** A new random sound (the "surprise me" button), deterministic for a given seed. */
export function randomParams(seed: number): SynthParams {
  let s = (seed * 9301 + 49297) % 233280 || 1;
  const r = () => ((s = (s * 9301 + 49297) % 233280) / 233280);
  const waves: Wave[] = ['sine', 'square', 'saw', 'triangle', 'noise'];
  return P({
    wave: waves[Math.floor(r() * waves.length)],
    freq: Math.round(80 + r() * 1400),
    slide: Math.round((r() - 0.5) * 3000),
    attack: Math.round(r() * 30) / 1000,
    sustain: Math.round(r() * 300) / 1000,
    decay: Math.round((0.05 + r() * 0.5) * 1000) / 1000,
    vibDepth: r() < 0.3 ? Math.round(r() * 20) / 100 : 0,
    vibSpeed: Math.round(2 + r() * 20),
    duty: Math.round((0.2 + r() * 0.6) * 100) / 100,
    arpAt: r() < 0.25 ? Math.round(r() * 150) / 1000 : 0,
    arpMul: Math.round((0.7 + r() * 0.9) * 100) / 100,
    lowpass: Math.round(800 + r() * 11000),
  });
}

// --------------------------------------------------------------------------------- analysis

export interface Analysis {
  duration: number;
  /** Loudness (RMS) in 10 equal parts of the sound. */
  loudness: number[];
  /** Pitch (Hz, by zero crossings) in 10 parts; 0 where it is silent. */
  pitch: number[];
  /** 0…1: how much of the time the wave sits at its top or bottom (1 = square). */
  squareness: number;
  /** 0…1: how unlike a repeating wave it is (1 = noise). */
  noisiness: number;
  peak: number;
}

export function analyze(samples: ArrayLike<number>, rate = SAMPLE_RATE): Analysis {
  const n = samples.length;
  const parts = 10;
  const loud: number[] = [];
  const pitch: number[] = [];
  let peak = 0;
  for (let i = 0; i < n; i++) peak = Math.max(peak, Math.abs(samples[i]));
  for (let k = 0; k < parts; k++) {
    const a = Math.floor((k * n) / parts);
    const b = Math.floor(((k + 1) * n) / parts);
    let sum = 0;
    let crossings = 0;
    for (let i = a; i < b; i++) {
      sum += samples[i] * samples[i];
      if (i > a && (samples[i - 1] < 0) !== (samples[i] < 0)) crossings++;
    }
    const rms = Math.sqrt(sum / Math.max(1, b - a));
    loud.push(rms);
    pitch.push(rms > 0.01 ? (crossings / 2) / ((b - a) / rate) : 0);
  }
  // squareness: in short blocks, how many samples sit near the block's own top/bottom (works with fading)
  let near = 0;
  let counted = 0;
  for (let a = 0; a + 64 <= n; a += 64) {
    let m = 0;
    for (let i = a; i < a + 64; i++) m = Math.max(m, Math.abs(samples[i]));
    if (m < 0.01) continue;
    for (let i = a; i < a + 64; i++) {
      counted++;
      if (Math.abs(samples[i]) > m * 0.85) near++;
    }
  }
  // noisiness: a repeating wave correlates with itself again one period later; noise never does.
  // r(lag) first falls; after it has fallen, the best value it climbs back to is the "repeat score".
  const start = Math.floor(n * 0.1);
  const maxLag = Math.min(800, Math.floor(rate / 30));
  const win = Math.min(2048, n - start - maxLag);
  let best = 1;
  if (win > 256) {
    let e0 = 0;
    for (let i = 0; i < win; i++) e0 += samples[start + i] ** 2;
    let fell = false;
    best = 0;
    for (let lag = 1; lag < maxLag; lag++) {
      let c = 0;
      let e1 = 0;
      for (let i = 0; i < win; i++) {
        c += samples[start + i] * samples[start + i + lag];
        e1 += samples[start + i + lag] ** 2;
      }
      const r = c / Math.sqrt(e0 * e1 || 1);
      if (!fell) {
        if (r < 0.3) fell = true;
        continue;
      }
      if (r > best) best = r;
    }
    if (!fell) best = 1;
  }
  return { duration: n / rate, loudness: loud, pitch, squareness: counted ? near / counted : 0, noisiness: Math.max(0, Math.min(1, 1 - best)), peak };
}

/** 16-bit mono WAV file of the samples. */
export function toWav(samples: ArrayLike<number>, rate = SAMPLE_RATE): Uint8Array {
  const n = samples.length;
  const buf = new ArrayBuffer(44 + n * 2);
  const v = new DataView(buf);
  const str = (o: number, s: string) => [...s].forEach((c, i) => v.setUint8(o + i, c.charCodeAt(0)));
  str(0, 'RIFF');
  v.setUint32(4, 36 + n * 2, true);
  str(8, 'WAVE');
  str(12, 'fmt ');
  v.setUint32(16, 16, true);
  v.setUint16(20, 1, true);
  v.setUint16(22, 1, true);
  v.setUint32(24, rate, true);
  v.setUint32(28, rate * 2, true);
  v.setUint16(32, 2, true);
  v.setUint16(34, 16, true);
  str(36, 'data');
  v.setUint32(40, n * 2, true);
  for (let i = 0; i < n; i++) v.setInt16(44 + i * 2, Math.max(-1, Math.min(1, samples[i])) * 32767, true);
  return new Uint8Array(buf);
}

// ------------------------------------------------------------------------------------ playback

let ctx: AudioContext | null = null;
let current: AudioBufferSourceNode | null = null;

/** Plays samples; returns the moment playback started (AudioContext time) for the playhead. */
export function play(samples: Float32Array, volume = 1, rate = SAMPLE_RATE, onEnd?: () => void): { start: number; ctx: AudioContext } | null {
  stop();
  try {
    ctx ??= new AudioContext();
    if (ctx.state === 'suspended') void ctx.resume();
    const b = ctx.createBuffer(1, samples.length, rate);
    b.getChannelData(0).set(samples);
    const src = ctx.createBufferSource();
    src.buffer = b;
    const g = ctx.createGain();
    g.gain.value = volume;
    src.connect(g).connect(ctx.destination);
    src.onended = () => {
      if (current === src) current = null;
      onEnd?.();
    };
    src.start();
    current = src;
    return { start: ctx.currentTime, ctx };
  } catch {
    return null;
  }
}

export function stop(): void {
  try {
    current?.stop();
  } catch {
    /* already stopped */
  }
  current = null;
}
