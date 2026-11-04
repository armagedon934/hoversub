// Spaced repetition ("Leitner boxes") so that what was learned is not forgotten: every card
// starts in box 1. "I remember" moves it to the next box (seen again after 1, 2, 4, 8, 16 days);
// "I forgot" puts it back to box 1. Cards come from finished lessons and from the notebook.

import { create } from 'zustand';

export interface Card {
  id: string;
  front: string;
  back: string;
  /** Where it came from, shown small under the card. */
  from: string;
  /** Optional code shown with the question. */
  code?: string;
  box: number;
  due: number;
}

const KEY = 'mf.review.v1';
export const DAY = 86_400_000;
export const BOX_DAYS = [0, 1, 2, 4, 8, 16];

function load(): Card[] {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? '[]');
    return Array.isArray(raw) ? raw.filter((c) => c && typeof c.front === 'string' && typeof c.back === 'string' && Number.isFinite(c.box)).slice(0, 3000) : [];
  } catch {
    return [];
  }
}

function save(cards: Card[]) {
  try {
    localStorage.setItem(KEY, JSON.stringify(cards));
  } catch {
    /* ignore */
  }
}

interface ReviewState {
  cards: Card[];
  /** Adds cards that are not there yet (same id = same card). */
  addCards: (c: Omit<Card, 'box' | 'due'>[], now?: number) => number;
  answer: (id: string, remembered: boolean, now?: number) => void;
  remove: (id: string) => void;
}

export const useReview = create<ReviewState>((set, get) => ({
  cards: load(),
  addCards(list, now = Date.now()) {
    const have = new Set(get().cards.map((c) => c.id));
    const fresh = list.filter((c) => !have.has(c.id)).map((c) => ({ ...c, box: 1, due: now + DAY }));
    if (!fresh.length) return 0;
    const cards = [...get().cards, ...fresh];
    set({ cards });
    save(cards);
    return fresh.length;
  },
  answer(id, remembered, now = Date.now()) {
    const cards = get().cards.map((c) => {
      if (c.id !== id) return c;
      const box = remembered ? Math.min(5, c.box + 1) : 1;
      return { ...c, box, due: now + BOX_DAYS[box] * DAY };
    });
    set({ cards });
    save(cards);
  },
  remove(id) {
    const cards = get().cards.filter((c) => c.id !== id);
    set({ cards });
    save(cards);
  },
}));

export function dueCards(cards: Card[], now = Date.now()): Card[] {
  return cards.filter((c) => c.due <= now).sort((a, b) => a.box - b.box || a.due - b.due);
}
