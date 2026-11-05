// Achievements and the daily goal: small, visible wins (good for motivation with ADHD).
// Everything is computed from progress that is already stored; nothing extra is tracked.

import { create } from 'zustand';
import type { Text2 } from '../i18n';

const T = (en: string, ru: string): Text2 => ({ en, ru });

/** Trainer results (bug hunt, predict-the-output, lifecycle) — kept in this browser. */
interface TrainerStats {
  bugsSolved: string[];
  predictRight: number;
  predictBestStreak: number;
  lifecycleBest: number;
  cheatOpened: boolean;
  /** XP earned per day: "YYYY-MM-DD" → xp. */
  days: Record<string, number>;
}

const KEY = 'mf.trainers.v1';
const today = () => new Date().toISOString().slice(0, 10);

function load(): TrainerStats {
  const d: TrainerStats = { bugsSolved: [], predictRight: 0, predictBestStreak: 0, lifecycleBest: 0, cheatOpened: false, days: {} };
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? '{}');
    if (Array.isArray(raw.bugsSolved)) d.bugsSolved = raw.bugsSolved.filter((x: unknown) => typeof x === 'string');
    for (const k of ['predictRight', 'predictBestStreak', 'lifecycleBest'] as const) if (Number.isFinite(raw[k])) d[k] = raw[k];
    if (typeof raw.cheatOpened === 'boolean') d.cheatOpened = raw.cheatOpened;
    if (raw.days && typeof raw.days === 'object') d.days = raw.days;
  } catch {
    /* defaults */
  }
  return d;
}

interface TrainerState extends TrainerStats {
  solveBug: (id: string) => void;
  predicted: (right: boolean, streak: number) => void;
  lifecycle: (score: number) => void;
  openCheat: () => void;
  /** Called whenever XP is earned anywhere. */
  earned: (xp: number) => void;
}

export const useTrainers = create<TrainerState>((set, get) => {
  const save = () => {
    const { bugsSolved, predictRight, predictBestStreak, lifecycleBest, cheatOpened, days } = get();
    try {
      localStorage.setItem(KEY, JSON.stringify({ bugsSolved, predictRight, predictBestStreak, lifecycleBest, cheatOpened, days }));
    } catch {
      /* ignore */
    }
  };
  return {
    ...load(),
    solveBug(id) {
      if (!get().bugsSolved.includes(id)) set({ bugsSolved: [...get().bugsSolved, id] });
      save();
    },
    predicted(right, streak) {
      set({ predictRight: get().predictRight + (right ? 1 : 0), predictBestStreak: Math.max(get().predictBestStreak, streak) });
      save();
    },
    lifecycle(score) {
      set({ lifecycleBest: Math.max(get().lifecycleBest, score) });
      save();
    },
    openCheat() {
      if (!get().cheatOpened) {
        set({ cheatOpened: true });
        save();
      }
    },
    earned(xp) {
      const d = today();
      set({ days: { ...get().days, [d]: (get().days[d] ?? 0) + xp } });
      save();
    },
  };
});

export const DAILY_GOAL_XP = 50;

export function xpToday(days: Record<string, number>): number {
  return days[today()] ?? 0;
}

export interface Facts {
  lessonsDone: number;
  courseDone: number;
  advancedDone: number;
  projectDone: number;
  projectTotal: number;
  unityLevels: number;
  unityTotal: number;
  streak: number;
  xp: number;
  reviewCards: number;
  notes: number;
  bugs: number;
  bugsTotal: number;
  predictRight: number;
  predictBestStreak: number;
  lifecycleBest: number;
  cheatOpened: boolean;
  goalDays: number;
  shooterDone: number;
  shooterTotal: number;
}

export interface Achievement {
  id: string;
  icon: string;
  title: Text2;
  how: Text2;
  done: (f: Facts) => boolean;
  /** Progress 0…1 for the bar. */
  progress: (f: Facts) => number;
}

const p = (v: number, goal: number) => Math.min(1, v / goal);

export const ACHIEVEMENTS: Achievement[] = [
  { id: 'first-lesson', icon: '🌱', title: T('First step', 'Первый шаг'), how: T('Finish any lesson.', 'Пройди любой урок.'), done: (f) => f.lessonsDone + f.courseDone >= 1, progress: (f) => p(f.lessonsDone + f.courseDone, 1) },
  { id: 'five-lessons', icon: '📚', title: T('Bookworm', 'Книжный червь'), how: T('Finish 5 lessons.', 'Пройди 5 уроков.'), done: (f) => f.lessonsDone + f.courseDone >= 5, progress: (f) => p(f.lessonsDone + f.courseDone, 5) },
  { id: 'course-half', icon: '🎮', title: T('Unity apprentice', 'Ученик Unity'), how: T('Finish 8 lessons of "C# for Unity".', 'Пройди 8 уроков курса «C# для Unity».'), done: (f) => f.courseDone >= 8, progress: (f) => p(f.courseDone, 8) },
  { id: 'csharp-2', icon: '🚀', title: T('Beyond the basics', 'Дальше основ'), how: T('Finish 5 lessons of "C# further (part 2)".', 'Пройди 5 уроков курса «C# дальше (часть 2)».'), done: (f) => f.advancedDone >= 5, progress: (f) => p(f.advancedDone, 5) },
  { id: 'own-game', icon: '🏗', title: T('My own game', 'Своя игра'), how: T('Finish all steps of "Project: your own platformer".', 'Пройди все шаги «Проекта: свой платформер».'), done: (f) => f.projectDone >= f.projectTotal, progress: (f) => p(f.projectDone, f.projectTotal) },
  { id: 'hello-unity', icon: '👋', title: T('Hello, Unity', 'Привет, Unity'), how: T('Win your first Mini-Unity level.', 'Пройди первый уровень Мини-Unity.'), done: (f) => f.unityLevels >= 1, progress: (f) => p(f.unityLevels, 1) },
  { id: 'unity-five', icon: '🕹', title: T('Script writer', 'Сценарист'), how: T('Win 5 Mini-Unity levels.', 'Пройди 5 уровней Мини-Unity.'), done: (f) => f.unityLevels >= 5, progress: (f) => p(f.unityLevels, 5) },
  { id: 'unity-all', icon: '🏆', title: T('Mini-Unity master', 'Мастер Мини-Unity'), how: T('Win every Mini-Unity level.', 'Пройди все уровни Мини-Unity.'), done: (f) => f.unityLevels >= f.unityTotal, progress: (f) => p(f.unityLevels, f.unityTotal) },
  { id: 'shooter-online', icon: '📻', title: T('Online', 'На связи'), how: T('Finish the first mission of "Shooter from zero".', 'Пройди первую миссию «Шутера с нуля».'), done: (f) => f.shooterDone >= 1, progress: (f) => p(f.shooterDone, 1) },
  { id: 'shooter-half', icon: '🎯', title: T('Half a suit', 'Полкостюма'), how: T('Finish 13 missions of "Shooter from zero".', 'Пройди 13 миссий «Шутера с нуля».'), done: (f) => f.shooterDone >= 13, progress: (f) => p(f.shooterDone, 13) },
  { id: 'shooter-all', icon: '🏅', title: T('Mission accomplished', 'Операция выполнена'), how: T('Finish all missions of "Shooter from zero" — your own shooter with bots.', 'Пройди все миссии «Шутера с нуля» — свой шутер с ботами.'), done: (f) => f.shooterDone >= f.shooterTotal, progress: (f) => p(f.shooterDone, f.shooterTotal) },
  { id: 'bug-5', icon: '🐞', title: T('Bug hunter', 'Охотник на баги'), how: T('Find 5 bugs in "Find the bug".', 'Найди 5 багов в «Найди баг».'), done: (f) => f.bugs >= 5, progress: (f) => p(f.bugs, 5) },
  { id: 'bug-all', icon: '🦸', title: T('Debugger', 'Отладчик'), how: T('Find every bug.', 'Найди все баги.'), done: (f) => f.bugs >= f.bugsTotal, progress: (f) => p(f.bugs, f.bugsTotal) },
  { id: 'predict-10', icon: '🔮', title: T('Code reader', 'Читаю код'), how: T('Predict 10 outputs correctly.', 'Правильно предскажи 10 выводов.'), done: (f) => f.predictRight >= 10, progress: (f) => p(f.predictRight, 10) },
  { id: 'predict-streak', icon: '⚡', title: T('In the flow', 'В потоке'), how: T('5 correct predictions in a row.', '5 верных предсказаний подряд.'), done: (f) => f.predictBestStreak >= 5, progress: (f) => p(f.predictBestStreak, 5) },
  { id: 'lifecycle', icon: '🔄', title: T('Knows the order', 'Знает порядок'), how: T('Put all Unity events in order without mistakes.', 'Расставь все события Unity по порядку без ошибок.'), done: (f) => f.lifecycleBest >= 8, progress: (f) => p(f.lifecycleBest, 8) },
  { id: 'review-20', icon: '🧠', title: T('Memory', 'Память'), how: T('Have 20 cards in Review.', 'Набери 20 карточек в Повторении.'), done: (f) => f.reviewCards >= 20, progress: (f) => p(f.reviewCards, 20) },
  { id: 'notes-5', icon: '⭐', title: T('Note taker', 'Конспект'), how: T('Save 5 notes in the notebook.', 'Сохрани 5 заметок в блокнот.'), done: (f) => f.notes >= 5, progress: (f) => p(f.notes, 5) },
  { id: 'streak-3', icon: '🔥', title: T('Three days in a row', 'Три дня подряд'), how: T('Learn 3 days in a row.', 'Занимайся 3 дня подряд.'), done: (f) => f.streak >= 3, progress: (f) => p(f.streak, 3) },
  { id: 'streak-7', icon: '🌟', title: T('A whole week', 'Целая неделя'), how: T('Learn 7 days in a row.', 'Занимайся 7 дней подряд.'), done: (f) => f.streak >= 7, progress: (f) => p(f.streak, 7) },
  { id: 'goal-3', icon: '🎯', title: T('Goal keeper', 'Держу цель'), how: T(`Reach the daily goal (${DAILY_GOAL_XP} XP) on 3 days.`, `Выполни цель дня (${DAILY_GOAL_XP} XP) в 3 разных дня.`), done: (f) => f.goalDays >= 3, progress: (f) => p(f.goalDays, 3) },
  { id: 'xp-500', icon: '💎', title: T('500 XP', '500 XP'), how: T('Earn 500 experience points.', 'Набери 500 очков опыта.'), done: (f) => f.xp >= 500, progress: (f) => p(f.xp, 500) },
  { id: 'cheat', icon: '📋', title: T('Cheat sheet', 'Шпаргалка'), how: T('Open the Unity cheat sheet.', 'Открой шпаргалку по Unity.'), done: (f) => f.cheatOpened, progress: (f) => (f.cheatOpened ? 1 : 0) },
];
