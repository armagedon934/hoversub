// Progress of the Sound Lab (separate from the screen so the learning path can read it).

import { create } from 'zustand';
import { SOUND_LESSONS } from './soundLessons';
import { DEFAULT_PARAMS, PRESETS, type SynthParams } from './synth';

const KEY = 'mf.soundlab.v1';
interface LabProgress {
  done: string[];
  code: Record<string, string>;
  lesson: string;
  tab: 'synth' | 'lessons';
  params: SynthParams;
}
function load(): LabProgress {
  const d: LabProgress = { done: [], code: {}, lesson: SOUND_LESSONS[0].id, tab: 'lessons', params: { ...PRESETS[0].p } };
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? '{}');
    if (Array.isArray(raw.done)) d.done = raw.done.filter((x: unknown) => typeof x === 'string');
    if (raw.code && typeof raw.code === 'object') d.code = raw.code;
    if (typeof raw.lesson === 'string' && SOUND_LESSONS.some((l) => l.id === raw.lesson)) d.lesson = raw.lesson;
    if (raw.tab === 'synth' || raw.tab === 'lessons') d.tab = raw.tab;
    if (raw.params && typeof raw.params === 'object') d.params = { ...DEFAULT_PARAMS, ...raw.params };
  } catch {
    /* defaults */
  }
  return d;
}
export const useSoundLab = create<LabProgress & { set: (p: Partial<LabProgress>) => void }>((set, get) => ({
  ...load(),
  set(p) {
    set(p);
    const { done, code, lesson, tab, params } = get();
    try {
      localStorage.setItem(KEY, JSON.stringify({ done, code, lesson, tab, params }));
    } catch {
      /* ignore */
    }
  },
}));

