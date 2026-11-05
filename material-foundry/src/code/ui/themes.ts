// Ten looks for the whole program. Each theme is a set of colours (CSS variables) on top of a
// dark or light base (the base decides the colours of code words). Each theme also has its own
// little sound "voice" for clicks, success, mistakes, XP and notices (see uiSound.ts).

import type { Text2 } from '../i18n';

export type ThemeId = 'graphite' | 'paper' | 'midnight' | 'forest' | 'sand' | 'ocean' | 'sakura' | 'neon' | 'contrast' | 'calm';

export interface ThemeDef {
  id: ThemeId;
  name: Text2;
  about: Text2;
  base: 'dark' | 'light';
  vars: Record<string, string>;
  /** Sound voice of this theme (uiSound.ts). */
  voice: 'soft' | 'paper' | 'glass' | 'wood' | 'kalimba' | 'bubble' | 'bell' | 'chip' | 'clear' | 'hum';
}

const T = (en: string, ru: string): Text2 => ({ en, ru });

const dark = (bg: string, panel: string, panel2: string, panel3: string, line: string, text: string, text2: string, muted: string, accent: string, accentStrong: string, accentInk: string) => ({
  '--bg': bg,
  '--panel': panel,
  '--panel-2': panel2,
  '--panel-3': panel3,
  '--line': line,
  '--line-soft': panel3,
  '--text': text,
  '--text-2': text2,
  '--muted': muted,
  '--accent': accent,
  '--accent-strong': accentStrong,
  '--accent-ink': accentInk,
  '--accent-soft': `color-mix(in srgb, ${accent} 15%, transparent)`,
});

export const THEMES: ThemeDef[] = [
  { id: 'graphite', name: T('Graphite', 'Графит'), about: T('Dark and warm, the default.', 'Тёмная и тёплая, по умолчанию.'), base: 'dark', voice: 'soft', vars: dark('#16171a', '#1e2024', '#24272c', '#2c3036', '#33373e', '#e6e7ea', '#b4b8c0', '#868b95', '#e0a24a', '#f0b45c', '#1b1408') },
  { id: 'paper', name: T('Paper', 'Бумага'), about: T('Light, like a notebook.', 'Светлая, как тетрадь.'), base: 'light', voice: 'paper', vars: dark('#f6f4ef', '#ffffff', '#f0eee8', '#e6e3db', '#d9d5cb', '#1f2124', '#3c4047', '#646a73', '#9c5f14', '#b06c1c', '#ffffff') },
  { id: 'midnight', name: T('Midnight', 'Полночь'), about: T('Deep blue night.', 'Глубокая синяя ночь.'), base: 'dark', voice: 'glass', vars: dark('#0f1424', '#151c30', '#1b243b', '#222c46', '#2c3755', '#e3e8f5', '#aeb8d3', '#7c88a8', '#7aa2ff', '#95b6ff', '#0b1430') },
  { id: 'forest', name: T('Forest', 'Лес'), about: T('Dark green, calm.', 'Тёмно-зелёная, спокойная.'), base: 'dark', voice: 'wood', vars: dark('#121a15', '#18221b', '#1e2a22', '#25332a', '#2f3f34', '#e2ebe4', '#b0c2b5', '#7f9586', '#7fc97a', '#9ad895', '#0c1a0b') },
  { id: 'sand', name: T('Desert', 'Пустыня'), about: T('Warm light sand.', 'Тёплый светлый песок.'), base: 'light', voice: 'kalimba', vars: dark('#f3ead9', '#fbf6ec', '#efe4cf', '#e5d7bd', '#d7c6a6', '#2e2619', '#4b4130', '#76694f', '#a5541e', '#b8642a', '#ffffff') },
  { id: 'ocean', name: T('Ocean', 'Океан'), about: T('Light sea-blue.', 'Светлая морская.'), base: 'light', voice: 'bubble', vars: dark('#eaf3f6', '#f8fcfd', '#deedf1', '#cfe3e9', '#bcd5dd', '#132a33', '#2c4651', '#5a7380', '#0f7f99', '#1593b0', '#ffffff') },
  { id: 'sakura', name: T('Sakura', 'Сакура'), about: T('Soft pink, gentle.', 'Нежно-розовая.'), base: 'light', voice: 'bell', vars: dark('#f8eef1', '#fffafb', '#f3e2e7', '#ead3da', '#dfc2cb', '#2c1f24', '#4a3940', '#7a6670', '#c2477a', '#d35a8b', '#ffffff') },
  { id: 'neon', name: T('Neon', 'Неон'), about: T('Night city: violet and cyan.', 'Ночной город: фиолетовый и бирюзовый.'), base: 'dark', voice: 'chip', vars: dark('#120d1d', '#1a1329', '#211934', '#2a2042', '#382b56', '#efe9ff', '#c2b6e6', '#8f82b3', '#3ce6d6', '#6af0e4', '#04201d') },
  { id: 'contrast', name: T('High contrast', 'Высокий контраст'), about: T('Black and yellow, very clear.', 'Чёрный и жёлтый, очень чётко.'), base: 'dark', voice: 'clear', vars: { ...dark('#000000', '#0a0a0a', '#141414', '#1f1f1f', '#8a8a8a', '#ffffff', '#f0f0f0', '#d0d0d0', '#ffd400', '#ffe14d', '#000000'), '--danger': '#ff6b6b', '--ok': '#5dff9b' } },
  { id: 'calm', name: T('Calm', 'Тишина'), about: T('Low contrast, nothing shouts (good for tired eyes).', 'Низкий контраст, ничего не кричит (для усталых глаз).'), base: 'dark', voice: 'hum', vars: dark('#23272a', '#2a2f32', '#30363a', '#373e42', '#42494e', '#d5dad7', '#b2b9b5', '#8c9490', '#9fbfae', '#b1cdbe', '#18211c') },
];

export const themeById = (id: string | undefined): ThemeDef => THEMES.find((t) => t.id === id) ?? THEMES[0];
export const isThemeId = (id: unknown): id is ThemeId => typeof id === 'string' && THEMES.some((t) => t.id === id);

/** Puts the theme colours on the page (the top bar and every part of the program follow them). */
export function applyTheme(id: ThemeId): void {
  const t = themeById(id);
  const root = document.documentElement;
  for (const [k, v] of Object.entries(t.vars)) root.style.setProperty(k, v);
  root.style.setProperty('color-scheme', t.base);
  root.dataset.theme = t.id;
}
