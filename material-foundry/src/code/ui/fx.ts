// Effects with a meaning. Every effect answers one question the learner has right now, and the
// same effect always means the same thing, so after a few lessons it is read without words:
//
//   ✨ sparks from the thing you did ........ "this step is right" (small, quick, does not stop you)
//   〰 a soft shake of the thing ............. "not this one — try again" (no red screen, no sound of
//                                               failure: a mistake must never feel like punishment)
//   +10 XP floating up ...................... "you earned it" (always from where it was earned)
//   🔥 a streak chip ......................... "three right in a row without hints — you are in the flow"
//   🎉 confetti + a card ..................... "a lesson is done": the card holds the ONE sentence to
//                                               remember, so the strongest emotion of the lesson is
//                                               glued to the most important idea
//   🔓 a lock breaking + the district name ... "a new part of the map is open" (rare, the biggest)
//
// Settings: full (everything), calm (no flying things — only colour and text) or off (only the card
// with the sentence to remember). The OS "reduce motion" setting starts in calm.

import { create } from 'zustand';
import type { Text2 } from '../i18n';
import { playUi } from './uiSound';
import { useCode } from './store';

export interface LessonFx {
  icon: string;
  title: string;
  /** The one sentence to remember. */
  anchor?: string;
  /** How you will remember it (the funny moment of the lesson). */
  moment?: string;
  xp?: number;
  stars?: number;
  next?: { label: string; go: () => void };
}

export interface UnlockFx {
  icon: string;
  name: string;
  why?: string;
  go?: () => void;
}

type Overlay = { kind: 'lesson'; data: LessonFx; id: number } | { kind: 'unlock'; data: UnlockFx; id: number };

export interface Burst {
  id: number;
  x: number;
  y: number;
  kind: 'ok' | 'big';
}

export interface Floater {
  id: number;
  x: number;
  y: number;
  text: string;
}

interface FxState {
  overlays: Overlay[];
  bursts: Burst[];
  floaters: Floater[];
  combo: number;
  comboShown: number;
  confetti: number;
}

let nextId = 1;
export const useFx = create<FxState>(() => ({ overlays: [], bursts: [], floaters: [], combo: 0, comboShown: 0, confetti: 0 }));

export const fxLevel = (): 'full' | 'calm' | 'off' => useCode.getState().prefs.fx;

function centerOf(target?: Element | null | { x: number; y: number }): { x: number; y: number } {
  if (target && 'getBoundingClientRect' in target) {
    const r = target.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  }
  if (target && 'x' in target) return target;
  return { x: window.innerWidth / 2, y: window.innerHeight / 2 };
}

const later = (ms: number, fn: () => void) => window.setTimeout(fn, ms);

export const fx = {
  /** A right step: sparks from the element. */
  spark(target?: Element | null | { x: number; y: number }, big = false) {
    const lvl = fxLevel();
    if (target instanceof Element) {
      target.classList.remove('fx-ok');
      void (target as HTMLElement).offsetWidth;
      target.classList.add('fx-ok');
      later(900, () => target.classList.remove('fx-ok'));
    }
    if (lvl !== 'full') return;
    const p = centerOf(target);
    const b: Burst = { id: nextId++, ...p, kind: big ? 'big' : 'ok' };
    useFx.setState((s) => ({ bursts: [...s.bursts, b].slice(-8) }));
    later(900, () => useFx.setState((s) => ({ bursts: s.bursts.filter((x) => x.id !== b.id) })));
  },
  /** Not this one: a soft shake. Never punishing. */
  wrong(target?: Element | null) {
    fx.streak(false);
    if (!(target instanceof Element) || fxLevel() === 'off') return;
    const cls = fxLevel() === 'full' ? 'fx-shake' : 'fx-soft-wrong';
    target.classList.remove(cls);
    void (target as HTMLElement).offsetWidth;
    target.classList.add(cls);
    later(600, () => target.classList.remove(cls));
  },
  /** "+10 XP" floating up from where it was earned. */
  float(text: string, target?: Element | null | { x: number; y: number }) {
    if (fxLevel() === 'off') return;
    const p = target ? centerOf(target) : { x: window.innerWidth - 140, y: 90 };
    const f: Floater = { id: nextId++, ...p, text };
    useFx.setState((s) => ({ floaters: [...s.floaters, f].slice(-6) }));
    later(1400, () => useFx.setState((s) => ({ floaters: s.floaters.filter((x) => x.id !== f.id) })));
  },
  /** Counts right answers in a row (without hints). Shows the chip from 3. */
  streak(right: boolean) {
    const s = useFx.getState();
    const combo = right ? s.combo + 1 : 0;
    useFx.setState({ combo });
    if (right && combo >= 3 && fxLevel() !== 'off') {
      useFx.setState({ comboShown: combo });
      later(1800, () => useFx.getState().comboShown === combo && useFx.setState({ comboShown: 0 }));
    }
  },
  /** A lesson (level, mission) is done: confetti and the card with the sentence to remember. */
  lesson(data: LessonFx) {
    playUi('success');
    if (fxLevel() === 'full') useFx.setState((s) => ({ confetti: s.confetti + 1 }));
    useFx.setState((s) => ({ overlays: [...s.overlays, { kind: 'lesson', data, id: nextId++ }] }));
  },
  /** A new district of the map is open. */
  unlock(data: UnlockFx) {
    useFx.setState((s) => ({ overlays: [...s.overlays, { kind: 'unlock', data, id: nextId++ }] }));
  },
  close(id: number) {
    useFx.setState((s) => ({ overlays: s.overlays.filter((o) => o.id !== id) }));
  },
};

/** For text that may be either a plain string or a Text2. */
export type FxText = string | Text2;
