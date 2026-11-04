// The personal notebook: explanations and notes the learner saved with ⭐. Kept in this browser;
// can be exported as a Markdown file. Saved notes also become review cards (see review.ts).

import { create } from 'zustand';
import { tr } from '../i18n';

export interface Note {
  id: string;
  title: string;
  text: string;
  /** Where it came from (file, lesson…). */
  source?: string;
  at: number;
}

const KEY = 'mf.notebook.v1';

function load(): Note[] {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? '[]');
    return Array.isArray(raw) ? raw.filter((n) => n && typeof n.title === 'string' && typeof n.text === 'string').slice(0, 1000) : [];
  } catch {
    return [];
  }
}

interface NotebookState {
  notes: Note[];
  add: (n: Omit<Note, 'id' | 'at'>) => Note;
  update: (id: string, p: Partial<Pick<Note, 'title' | 'text'>>) => void;
  remove: (id: string) => void;
}

function save(notes: Note[]) {
  try {
    localStorage.setItem(KEY, JSON.stringify(notes));
  } catch {
    /* ignore */
  }
}

export const useNotebook = create<NotebookState>((set, get) => ({
  notes: load(),
  add(n) {
    const note: Note = { ...n, id: Math.random().toString(36).slice(2, 10), at: Date.now() };
    const notes = [note, ...get().notes.filter((x) => !(x.title === n.title && x.text === n.text))];
    set({ notes });
    save(notes);
    return note;
  },
  update(id, p) {
    const notes = get().notes.map((n) => (n.id === id ? { ...n, ...p } : n));
    set({ notes });
    save(notes);
  },
  remove(id) {
    const notes = get().notes.filter((n) => n.id !== id);
    set({ notes });
    save(notes);
  },
}));

export function notebookMarkdown(notes: Note[]): string {
  const lines = [`# ${tr('My programming notebook', 'Мой блокнот программиста')}`, ''];
  for (const n of notes) {
    lines.push(`## ${n.title}`, '', n.text, '');
    if (n.source) lines.push(`_${tr('From', 'Откуда')}: ${n.source} · ${new Date(n.at).toLocaleDateString()}_`, '');
  }
  return lines.join('\n');
}
