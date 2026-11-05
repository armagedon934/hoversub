// Sounds made in the Sound Lab can replace game sounds (your own gunshot, hit, engine). They are
// stored in this browser (localStorage) as 16-bit samples — nothing leaves the computer.

import { SAMPLE_RATE } from './synth';

export type GameSoundSlot = 'shot' | 'hit' | 'engine';
const KEY = 'mf.customSounds.v1';
const cache = new Map<GameSoundSlot, Float32Array | null>();

function readAll(): Record<string, string> {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? '{}') ?? {};
  } catch {
    return {};
  }
}

export function setCustomSound(slot: GameSoundSlot, samples: Float32Array | null): void {
  const all = readAll();
  if (!samples) delete all[slot];
  else {
    const n = Math.min(samples.length, SAMPLE_RATE * 3);
    const bytes = new Uint8Array(n * 2);
    const v = new DataView(bytes.buffer);
    for (let i = 0; i < n; i++) v.setInt16(i * 2, Math.max(-1, Math.min(1, samples[i])) * 32767, true);
    let s = '';
    for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
    all[slot] = btoa(s);
  }
  cache.delete(slot);
  try {
    localStorage.setItem(KEY, JSON.stringify(all));
  } catch {
    /* storage full: keep the standard sound */
  }
}

export function getCustomSound(slot: GameSoundSlot): Float32Array | null {
  if (cache.has(slot)) return cache.get(slot)!;
  const b64 = readAll()[slot];
  let out: Float32Array | null = null;
  if (b64) {
    try {
      const bin = atob(b64);
      const bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      const v = new DataView(bytes.buffer);
      out = new Float32Array(bytes.length / 2);
      for (let i = 0; i < out.length; i++) out[i] = v.getInt16(i * 2, true) / 32767;
    } catch {
      out = null;
    }
  }
  cache.set(slot, out);
  return out;
}
