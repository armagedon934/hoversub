// The Workshop's own files (kept in this browser) and the hand-over of a Unity script to
// Mini-Unity. Nothing here touches files on the computer: "Download" saves a copy on request.

import { create } from 'zustand';
import { getLocale } from '../i18n';
import type { EditLang } from './predict';

export interface WsFile {
  id: string;
  name: string;
  lang: EditLang;
  text: string;
  updated: number;
}

const KEY = 'mf.workshop.v1';

export const EXT: Record<EditLang, string> = { cs: 'cs', py: 'py', js: 'js', cpp: 'cpp', c: 'c' };

export function langOfName(name: string): EditLang | null {
  const ext = name.split('.').pop()?.toLowerCase() ?? '';
  return ext === 'cs' ? 'cs' : ext === 'py' ? 'py' : ext === 'js' || ext === 'mjs' ? 'js' : ext === 'c' || ext === 'h' ? 'c' : ['cpp', 'cc', 'cxx', 'hpp', 'hh'].includes(ext) ? 'cpp' : null;
}

/** Starting code for a new file. */
export function template(kind: 'unity' | 'cs' | 'py' | 'js' | 'cpp' | 'c'): { name: string; lang: EditLang; text: string } {
  const ru = getLocale() === 'ru';
  switch (kind) {
    case 'unity':
      return {
        name: 'Player.cs',
        lang: 'cs',
        text: `using UnityEngine;

public class Player : MonoBehaviour
{
    ${ru ? '// Начни печатать — серые подсказки покажут, что обычно пишут дальше (Tab — принять)' : '// Start typing — grey hints show what usually comes next (Tab accepts)'}

}
`,
      };
    case 'cs':
      return { name: 'Program.cs', lang: 'cs', text: `using System;\n\nConsole.WriteLine("${ru ? 'Привет!' : 'Hello!'}");\n` };
    case 'py':
      return { name: 'main.py', lang: 'py', text: `print("${ru ? 'Привет!' : 'Hello!'}")\n` };
    case 'js':
      return { name: 'main.js', lang: 'js', text: `console.log("${ru ? 'Привет!' : 'Hello!'}");\n` };
    case 'cpp':
      return { name: 'main.cpp', lang: 'cpp', text: `#include <iostream>\n\nint main()\n{\n    std::cout << "${ru ? 'Привет!' : 'Hello!'}" << std::endl;\n    return 0;\n}\n` };
    case 'c':
      return { name: 'main.c', lang: 'c', text: `#include <stdio.h>\n\nint main(void)\n{\n    printf("${ru ? 'Привет!' : 'Hello!'}\\n");\n    return 0;\n}\n` };
  }
}

interface Saved {
  files: WsFile[];
  currentId: string | null;
  input: string;
  ghost: boolean;
}

function load(): Saved {
  const d: Saved = { files: [], currentId: null, input: '', ghost: true };
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? '{}');
    if (Array.isArray(raw.files)) d.files = raw.files.filter((f: WsFile) => f && typeof f.text === 'string' && typeof f.name === 'string' && ['cs', 'py', 'js', 'cpp', 'c'].includes(f.lang)).slice(0, 200);
    if (typeof raw.currentId === 'string') d.currentId = raw.currentId;
    if (typeof raw.input === 'string') d.input = raw.input;
    if (typeof raw.ghost === 'boolean') d.ghost = raw.ghost;
  } catch {
    /* defaults */
  }
  return d;
}

interface WsState extends Saved {
  /** A Unity script waiting to be opened in Mini-Unity's sandbox. */
  pendingUnity: { code: string; name: string } | null;
  current: () => WsFile | null;
  newFile: (kind: Parameters<typeof template>[0], text?: string, name?: string) => WsFile;
  open: (id: string) => void;
  update: (text: string) => void;
  rename: (name: string) => void;
  remove: (id: string) => void;
  setInput: (s: string) => void;
  setGhost: (on: boolean) => void;
  sendToUnity: (code: string, name: string) => void;
  takeUnity: () => { code: string; name: string } | null;
}

let saveTimer = 0;
function save(s: Saved) {
  clearTimeout(saveTimer);
  saveTimer = window.setTimeout(() => {
    try {
      localStorage.setItem(KEY, JSON.stringify({ files: s.files, currentId: s.currentId, input: s.input, ghost: s.ghost }));
    } catch {
      /* storage full: keep working in memory */
    }
  }, 300);
}

const uid = () => Math.random().toString(36).slice(2, 10);

export const useWorkshop = create<WsState>((set, get) => ({
  ...load(),
  pendingUnity: null,
  current() {
    const s = get();
    return s.files.find((f) => f.id === s.currentId) ?? null;
  },
  newFile(kind, text, name) {
    const t = template(kind);
    let base = name ?? t.name;
    const names = new Set(get().files.map((f) => f.name));
    if (names.has(base)) {
      const [stem, ext] = [base.replace(/\.[^.]+$/, ''), base.split('.').pop()];
      let i = 2;
      while (names.has(`${stem}${i}.${ext}`)) i++;
      if (!/\.cs$/.test(base) || text === undefined) base = `${stem}${i}.${ext}`;
    }
    const f: WsFile = { id: uid(), name: base, lang: langOfName(base) ?? t.lang, text: text ?? t.text, updated: Date.now() };
    set({ files: [f, ...get().files], currentId: f.id });
    save(get());
    return f;
  },
  open(id) {
    set({ currentId: id });
    save(get());
  },
  update(text) {
    const id = get().currentId;
    set({ files: get().files.map((f) => (f.id === id ? { ...f, text, updated: Date.now() } : f)) });
    save(get());
  },
  rename(name) {
    const id = get().currentId;
    const lang = langOfName(name);
    set({ files: get().files.map((f) => (f.id === id ? { ...f, name, lang: lang ?? f.lang } : f)) });
    save(get());
  },
  remove(id) {
    const files = get().files.filter((f) => f.id !== id);
    set({ files, currentId: get().currentId === id ? (files[0]?.id ?? null) : get().currentId });
    save(get());
  },
  setInput(input) {
    set({ input });
    save(get());
  },
  setGhost(ghost) {
    set({ ghost });
    save(get());
  },
  sendToUnity(code, name) {
    set({ pendingUnity: { code, name } });
  },
  takeUnity() {
    const p = get().pendingUnity;
    set({ pendingUnity: null });
    return p;
  },
}));
