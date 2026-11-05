// Interface language for UNDERSTAND CODE: Russian or English. Every visible sentence is written in
// both languages next to each other (tr(en, ru)), so nothing can be left half-translated by accident.
// The same module runs in the analysis workers; the client tells them which language to use.

export type Locale = 'ru' | 'en';

const KEY = 'mf.code.locale';

function detect(): Locale {
  try {
    const saved = typeof localStorage !== 'undefined' ? localStorage.getItem(KEY) : null;
    if (saved === 'ru' || saved === 'en') return saved;
  } catch {
    /* ignore */
  }
  const nav = typeof navigator !== 'undefined' ? (navigator.languages?.[0] ?? navigator.language ?? '') : '';
  return /^(ru|uk|be|kk)\b/i.test(nav) ? 'ru' : 'en';
}

let current: Locale = detect();
const listeners = new Set<(l: Locale) => void>();

export function getLocale(): Locale {
  return current;
}

export function setLocale(l: Locale, persist = true): void {
  if (l === current) return;
  current = l;
  if (persist) {
    try {
      localStorage.setItem(KEY, l);
    } catch {
      /* ignore */
    }
  }
  for (const fn of listeners) fn(l);
}

export function onLocaleChange(fn: (l: Locale) => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/** The sentence in the current language. */
export function tr(en: string, ru: string): string {
  return current === 'ru' ? ru : en;
}

/** A pair of texts, picked at display time. */
export interface Text2 {
  en: string;
  ru: string;
}

export function pick(t: Text2 | string | undefined): string {
  if (t === undefined) return '';
  return typeof t === 'string' ? t : current === 'ru' ? t.ru : t.en;
}

/** Russian has three plural forms: 1 файл, 2 файла, 5 файлов. */
export function ruPlural(n: number, one: string, few: string, many: string): string {
  const a = Math.abs(n) % 100;
  const b = a % 10;
  if (a > 10 && a < 20) return many;
  if (b > 1 && b < 5) return few;
  if (b === 1) return one;
  return many;
}

/** "3 files" / "3 файла". */
export function count(n: number, en: [string, string], ru: [string, string, string]): string {
  return current === 'ru' ? `${n} ${ruPlural(n, ru[0], ru[1], ru[2])}` : `${n} ${n === 1 ? en[0] : en[1]}`;
}
