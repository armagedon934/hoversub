// Progress of the 3D campaigns ("Shooter from zero", "Racing from zero"), kept apart from the 3D
// screen so that the achievements can read it without loading three.js.

import { create, type StoreApi, type UseBoundStore } from 'zustand';
import { MISSIONS } from '../run/shooter';
import { RACE_MISSIONS } from '../run/racing';
import { MODEL_MISSIONS } from '../run/models';

export interface CampaignProgress {
  done: string[];
  code: Record<string, string>;
  /** Mission id, or "free" for free play. */
  current: string;
  free: Record<string, string>;
  /** Mouse sensitivity multiplier. */
  sens: number;
}
export type CampaignStore = UseBoundStore<StoreApi<CampaignProgress & { set: (p: Partial<CampaignProgress>) => void }>>;

function makeStore(key: string, ids: string[]): CampaignStore {
  const load = (): CampaignProgress => {
    const d: CampaignProgress = { done: [], code: {}, current: ids[0], free: {}, sens: 1 };
    try {
      const raw = JSON.parse(localStorage.getItem(key) ?? '{}');
      if (Array.isArray(raw.done)) d.done = raw.done.filter((x: unknown) => typeof x === 'string');
      if (raw.code && typeof raw.code === 'object') d.code = raw.code;
      if (raw.free && typeof raw.free === 'object') d.free = raw.free;
      if (typeof raw.current === 'string' && (raw.current === 'free' || ids.includes(raw.current))) d.current = raw.current;
      if (typeof raw.sens === 'number' && raw.sens >= 0.25 && raw.sens <= 3) d.sens = raw.sens;
    } catch {
      /* defaults */
    }
    return d;
  };
  return create<CampaignProgress & { set: (p: Partial<CampaignProgress>) => void }>((set, get) => ({
    ...load(),
    set(p) {
      set(p);
      const { done, code, current, free, sens } = get();
      try {
        localStorage.setItem(key, JSON.stringify({ done, code, current, free, sens }));
      } catch {
        /* ignore */
      }
    },
  }));
}

export const useShooter = makeStore('mf.shooter.v1', MISSIONS.map((m) => m.id));
export const useRacing = makeStore('mf.racing.v1', RACE_MISSIONS.map((m) => m.id));
export const useModels = makeStore('mf.models.v1', MODEL_MISSIONS.map((m) => m.id));
