// Progress of "The ABC of code" (kept apart from the screen so "My path" can read it).

import { create } from 'zustand';
import { ABC_LEVELS } from './abc';

const KEY = 'mf.abc.v1';

interface AbcProgress {
  done: string[];
  code: Record<string, string>;
  current: string;
  /** Goals already reached per level (they stay reached). */
  goals: Record<string, number[]>;
}

function load(): AbcProgress {
  const d: AbcProgress = { done: [], code: {}, current: ABC_LEVELS[0].id, goals: {} };
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? '{}');
    if (Array.isArray(raw.done)) d.done = raw.done.filter((x: unknown) => typeof x === 'string');
    if (raw.code && typeof raw.code === 'object') d.code = raw.code;
    if (raw.goals && typeof raw.goals === 'object') d.goals = raw.goals;
    if (typeof raw.current === 'string' && ABC_LEVELS.some((l) => l.id === raw.current)) d.current = raw.current;
  } catch {
    /* defaults */
  }
  return d;
}

export const useAbc = create<AbcProgress & { set: (p: Partial<AbcProgress>) => void }>((set, get) => ({
  ...load(),
  set(p) {
    set(p);
    const { done, code, current, goals } = get();
    try {
      localStorage.setItem(KEY, JSON.stringify({ done, code, current, goals }));
    } catch {
      /* ignore */
    }
  },
}));
