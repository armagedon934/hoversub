// The 10 themes: every one has all colours, readable text (WCAG contrast) and its own sound voice.
import { describe, expect, it } from 'vitest';
import { THEMES } from '../src/code/ui/themes';
import { notesFor } from '../src/code/ui/uiSound';

const lum = (hex: string) => {
  const c = hex.replace('#', '');
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(c.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const contrast = (a: string, b: string) => {
  const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
};

describe('themes', () => {
  it('there are 10 different themes with names in RU and EN', () => {
    expect(THEMES.length).toBe(10);
    expect(new Set(THEMES.map((t) => t.id)).size).toBe(10);
    expect(new Set(THEMES.map((t) => t.vars['--bg'])).size).toBe(10);
    for (const t of THEMES) expect(t.name.ru && t.name.en && t.about.ru).toBeTruthy();
  });

  it('text is readable on every theme (contrast ≥ 7 for main text, ≥ 4.5 for secondary, ≥ 3 for muted and accent)', () => {
    for (const t of THEMES) {
      const v = t.vars;
      for (const k of ['--bg', '--panel', '--panel-2', '--text', '--text-2', '--muted', '--accent', '--accent-ink']) expect(v[k], `${t.id} ${k}`).toMatch(/^#[0-9a-f]{6}$/i);
      expect(contrast(v['--text'], v['--panel']), `${t.id} text`).toBeGreaterThanOrEqual(7);
      expect(contrast(v['--text-2'], v['--panel']), `${t.id} text-2`).toBeGreaterThanOrEqual(4.5);
      expect(contrast(v['--muted'], v['--panel']), `${t.id} muted`).toBeGreaterThanOrEqual(3);
      expect(contrast(v['--accent'], v['--panel']), `${t.id} accent`).toBeGreaterThanOrEqual(3);
      expect(contrast(v['--accent-ink'], v['--accent']), `${t.id} button text`).toBeGreaterThanOrEqual(4.5);
    }
  });

  it('every theme voice has its own sound for each event', () => {
    const voices = new Set(THEMES.map((t) => t.voice));
    expect(voices.size).toBe(10);
    const sig = new Set<string>();
    for (const v of voices)
      for (const k of ['click', 'success', 'error', 'xp', 'notice'] as const) {
        const n = notesFor(v, k);
        expect(n.length).toBeGreaterThan(0);
        for (const x of n) expect(x.f).toBeGreaterThan(40);
        sig.add(`${k}:${JSON.stringify(n)}`);
      }
    expect(sig.size).toBe(50);
  });
});
