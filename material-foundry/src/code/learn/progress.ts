// Learning progress: chosen language, finished lessons with stars, experience points and a
// day streak. Stored only in this browser (localStorage).

import { create } from 'zustand';
import type { TrackId } from './lessons';

const KEY = 'mf.learn.v1';

export interface LessonResult {
  stars: number;
  /** Best result; replaying never lowers it. */
  at: number;
}

interface Saved {
  track: TrackId | null;
  done: Record<string, LessonResult>;
  xp: number;
  streak: number;
  lastDay: string;
}

const today = () => new Date().toISOString().slice(0, 10);

function load(): Saved {
  const d: Saved = { track: null, done: {}, xp: 0, streak: 0, lastDay: '' };
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? '{}');
    if (['cs', 'cpp', 'c', 'py', 'js'].includes(raw.track)) d.track = raw.track;
    if (raw.done && typeof raw.done === 'object') d.done = raw.done;
    if (Number.isFinite(raw.xp)) d.xp = Math.max(0, raw.xp);
    if (Number.isFinite(raw.streak)) d.streak = raw.streak;
    if (typeof raw.lastDay === 'string') d.lastDay = raw.lastDay;
  } catch {
    /* defaults */
  }
  return d;
}

export const key = (track: TrackId, lessonId: string) => `${track}:${lessonId}`;

export const XP_PER_LEVEL = 100;

interface LearnState extends Saved {
  lessonId: string | null;
  setTrack: (t: TrackId | null) => void;
  openLesson: (id: string | null) => void;
  addXp: (n: number) => void;
  finishLesson: (track: TrackId, lessonId: string, stars: number) => void;
  /** Course lessons are stored as "course:<course>:<lesson>". */
  finishCourseLesson: (courseId: string, lessonId: string, stars: number) => void;
  reset: () => void;
}

function save(s: Saved) {
  try {
    localStorage.setItem(KEY, JSON.stringify({ track: s.track, done: s.done, xp: s.xp, streak: s.streak, lastDay: s.lastDay }));
  } catch {
    /* ignore */
  }
}

export const useLearn = create<LearnState>((set, get) => ({
  ...load(),
  lessonId: null,
  setTrack(track) {
    set({ track, lessonId: null });
    save(get());
  },
  openLesson(lessonId) {
    set({ lessonId });
  },
  addXp(n) {
    const d = today();
    const s = get();
    let streak = s.streak;
    if (s.lastDay !== d) {
      const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
      streak = s.lastDay === yesterday ? s.streak + 1 : 1;
    }
    set({ xp: s.xp + n, streak, lastDay: d });
    save(get());
  },
  finishLesson(track, lessonId, stars) {
    const k = key(track, lessonId);
    const prev = get().done[k];
    set({ done: { ...get().done, [k]: { stars: Math.max(stars, prev?.stars ?? 0), at: Date.now() } } });
    save(get());
  },
  finishCourseLesson(courseId, lessonId, stars) {
    const k = `course:${courseId}:${lessonId}`;
    const prev = get().done[k];
    set({ done: { ...get().done, [k]: { stars: Math.max(stars, prev?.stars ?? 0), at: Date.now() } } });
    save(get());
  },
  reset() {
    set({ track: null, done: {}, xp: 0, streak: 0, lastDay: '', lessonId: null });
    save(get());
  },
}));
