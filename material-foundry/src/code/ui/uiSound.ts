// Sounds of the interface: a click, a success, a mistake, XP and a notice. Every theme has its own
// "voice" (soft, paper, glass, wood…). All sounds are made by code (no files), quiet by default,
// and every one has its own volume slider in Settings; the choice is remembered.

import { create } from 'zustand';
import { themeById, type ThemeDef } from './themes';

export type UiSound = 'click' | 'success' | 'error' | 'xp' | 'notice' | 'game';
export const UI_SOUNDS: UiSound[] = ['click', 'success', 'error', 'xp', 'notice', 'game'];

const KEY = 'mf.sound.v1';
interface SoundPrefs {
  on: boolean;
  master: number;
  vol: Record<UiSound, number>;
}
const DEFAULTS: SoundPrefs = { on: true, master: 0.6, vol: { click: 0, success: 0.7, error: 0.5, xp: 0.5, notice: 0.4, game: 0.7 } };

function load(): SoundPrefs {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? '{}');
    const vol = { ...DEFAULTS.vol };
    for (const k of UI_SOUNDS) if (typeof raw.vol?.[k] === 'number') vol[k] = Math.max(0, Math.min(1, raw.vol[k]));
    return { on: raw.on !== false, master: typeof raw.master === 'number' ? Math.max(0, Math.min(1, raw.master)) : DEFAULTS.master, vol };
  } catch {
    return { ...DEFAULTS, vol: { ...DEFAULTS.vol } };
  }
}

export const useSound = create<SoundPrefs & { set: (p: Partial<SoundPrefs>) => void; setVol: (k: UiSound, v: number) => void }>((set, get) => ({
  ...load(),
  set(p) {
    set(p);
    save(get());
  },
  setVol(k, v) {
    set({ vol: { ...get().vol, [k]: v } });
    save(get());
  },
}));
function save(s: SoundPrefs) {
  try {
    localStorage.setItem(KEY, JSON.stringify({ on: s.on, master: s.master, vol: s.vol }));
  } catch {
    /* ignore */
  }
}

/** Overall loudness of a kind of sound (0 = silent). */
export function loudness(k: UiSound): number {
  const s = useSound.getState();
  return s.on ? s.master * s.vol[k] : 0;
}

let ctx: AudioContext | null = null;
function audio(): AudioContext | null {
  try {
    ctx ??= new AudioContext();
    if (ctx.state === 'suspended') void ctx.resume();
    return ctx;
  } catch {
    return null;
  }
}

interface Note {
  f: number;
  at: number;
  dur: number;
  type: OscillatorType;
  gain: number;
  /** Pitch at the end (glide). */
  to?: number;
}

/** The notes each theme voice plays for each sound. */
export function notesFor(voice: ThemeDef['voice'], k: Exclude<UiSound, 'game'>): Note[] {
  const n = (f: number, at: number, dur: number, type: OscillatorType, gain = 1, to?: number): Note => ({ f, at, dur, type, gain, to });
  const V: Record<ThemeDef['voice'], { type: OscillatorType; base: number; len: number }> = {
    soft: { type: 'sine', base: 520, len: 0.18 },
    paper: { type: 'triangle', base: 700, len: 0.08 },
    glass: { type: 'sine', base: 1040, len: 0.3 },
    wood: { type: 'triangle', base: 330, len: 0.12 },
    kalimba: { type: 'sine', base: 620, len: 0.25 },
    bubble: { type: 'sine', base: 420, len: 0.14 },
    bell: { type: 'sine', base: 880, len: 0.45 },
    chip: { type: 'square', base: 660, len: 0.09 },
    clear: { type: 'triangle', base: 760, len: 0.12 },
    hum: { type: 'sine', base: 260, len: 0.3 },
  };
  const v = V[voice];
  const b = v.base;
  const glide = voice === 'bubble' ? 1.6 : undefined;
  switch (k) {
    case 'click':
      return [n(b * 1.5, 0, 0.035, v.type, 0.5, glide ? b * 1.5 * glide : undefined)];
    case 'success':
      return [n(b, 0, v.len, v.type, 1, glide ? b * glide : undefined), n(b * 1.26, v.len * 0.6, v.len, v.type, 1), n(b * 1.5, v.len * 1.2, v.len * 1.6, v.type, 1)];
    case 'error':
      return [n(b * 0.6, 0, v.len * 1.2, v.type === 'square' ? 'square' : 'triangle', 0.9, b * 0.5), n(b * 0.5, v.len, v.len * 1.4, v.type === 'square' ? 'square' : 'triangle', 0.8)];
    case 'xp':
      return [n(b * 1.5, 0, v.len * 0.7, v.type, 0.8), n(b * 2, v.len * 0.4, v.len, v.type, 0.8)];
    case 'notice':
      return [n(b * 1.2, 0, v.len, v.type, 0.7, glide ? b * 1.2 * glide : undefined)];
  }
}

/** Plays one interface sound in the voice of the current theme. */
export function playUi(k: Exclude<UiSound, 'game'>, themeId?: string, force?: number): void {
  const vol = force ?? loudness(k);
  if (vol <= 0) return;
  const a = audio();
  if (!a) return;
  const voice = themeById(themeId ?? document.documentElement.dataset.theme).voice;
  const t0 = a.currentTime + 0.01;
  for (const note of notesFor(voice, k)) {
    const o = a.createOscillator();
    o.type = note.type;
    o.frequency.setValueAtTime(note.f, t0 + note.at);
    if (note.to) o.frequency.exponentialRampToValueAtTime(note.to, t0 + note.at + note.dur);
    const g = a.createGain();
    const peak = 0.12 * vol * note.gain * (note.type === 'square' ? 0.45 : 1);
    g.gain.setValueAtTime(0.0001, t0 + note.at);
    g.gain.exponentialRampToValueAtTime(peak, t0 + note.at + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + note.at + note.dur);
    o.connect(g).connect(a.destination);
    o.start(t0 + note.at);
    o.stop(t0 + note.at + note.dur + 0.02);
  }
}
