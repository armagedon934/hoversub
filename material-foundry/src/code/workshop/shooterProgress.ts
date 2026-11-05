// Progress of the campaign "Shooter from zero" (kept apart from the 3D screen so that the
// achievements can read it without loading three.js).

import { create } from 'zustand';
import { MISSIONS, missionById } from '../run/shooter';

const KEY = 'mf.shooter.v1';
interface ShooterProgress {
  done: string[];
  code: Record<string, string>;
  /** Mission id, or "free" for free play. */
  current: string;
  free: Record<string, string>;
  /** Mouse sensitivity multiplier. */
  sens: number;
}
function load(): ShooterProgress {
  const d: ShooterProgress = { done: [], code: {}, current: MISSIONS[0].id, free: {}, sens: 1 };
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? '{}');
    if (Array.isArray(raw.done)) d.done = raw.done.filter((x: unknown) => typeof x === 'string');
    if (raw.code && typeof raw.code === 'object') d.code = raw.code;
    if (raw.free && typeof raw.free === 'object') d.free = raw.free;
    if (typeof raw.current === 'string' && (raw.current === 'free' || missionById(raw.current))) d.current = raw.current;
    if (typeof raw.sens === 'number' && raw.sens >= 0.25 && raw.sens <= 3) d.sens = raw.sens;
  } catch {
    /* defaults */
  }
  return d;
}
export const useShooter = create<ShooterProgress & { set: (p: Partial<ShooterProgress>) => void }>((set, get) => ({
  ...load(),
  set(p) {
    set(p);
    const { done, code, current, free, sens } = get();
    try {
      localStorage.setItem(KEY, JSON.stringify({ done, code, current, free, sens }));
    } catch {
      /* ignore */
    }
  },
}));

