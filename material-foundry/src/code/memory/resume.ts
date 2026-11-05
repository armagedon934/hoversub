// "Where did I stop?" — remembers the last thing the learner was doing, so coming back takes one
// click instead of remembering and searching.

import { create } from 'zustand';

export interface Resume {
  kind: 'lesson' | 'level' | 'file' | 'mission';
  id: string;
  title: string;
  /** Extra info, e.g. the lesson's language track. */
  extra?: string;
  at: number;
}

const KEY = 'mf.resume.v1';

function load(): Resume | null {
  try {
    const r = JSON.parse(localStorage.getItem(KEY) ?? 'null');
    return r && typeof r.kind === 'string' && typeof r.id === 'string' && typeof r.title === 'string' ? r : null;
  } catch {
    return null;
  }
}

export const useResume = create<{ last: Resume | null; mark: (r: Omit<Resume, 'at'>) => void; clear: () => void }>((set) => ({
  last: load(),
  mark(r) {
    const last = { ...r, at: Date.now() };
    set({ last });
    try {
      localStorage.setItem(KEY, JSON.stringify(last));
    } catch {
      /* ignore */
    }
  },
  clear() {
    set({ last: null });
    try {
      localStorage.removeItem(KEY);
    } catch {
      /* ignore */
    }
  },
}));
