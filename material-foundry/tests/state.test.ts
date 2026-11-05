import { beforeEach, describe, expect, it } from 'vitest';
import { generateMaterial } from '../src/engine/generate';
import { PRESETS } from '../src/engine/presets';
import { getFamily } from '../src/engine/registry';
import { makeVariations } from '../src/engine/variations';
import { mulberry32 } from '../src/engine/hash';
import { settingsFromPreset, useStore } from '../src/state/store';
import { loadFavorites, loadPrefs, saveFavorites, DEFAULT_PREFS } from '../src/state/persistence';

// Minimal in-memory localStorage for persistence tests.
class MemStorage {
  map = new Map<string, string>();
  getItem(k: string) {
    return this.map.has(k) ? this.map.get(k)! : null;
  }
  setItem(k: string, v: string) {
    this.map.set(k, String(v));
  }
  removeItem(k: string) {
    this.map.delete(k);
  }
  clear() {
    this.map.clear();
  }
}
const mem = new MemStorage();
(globalThis as unknown as { localStorage: MemStorage }).localStorage = mem;

describe('stale result protection', () => {
  it('only accepts generated results for the current settings version', () => {
    const st = useStore.getState();
    const m = generateMaterial({ size: 32, settings: st.settings });
    const v0 = useStore.getState().version;
    st.setParam('wear', 0.11);
    st.setParam('wear', 0.12);
    const v = useStore.getState().version;
    expect(v).toBe(v0 + 2);
    // A result from an older request arrives late: rejected.
    expect(useStore.getState().setMaterial(m, v0, false)).toBe(false);
    expect(useStore.getState().setMaterial(m, v - 1, false)).toBe(false);
    expect(useStore.getState().material).toBeNull();
    // Current version accepted; a draft never replaces a full result of the same version.
    expect(useStore.getState().setMaterial(m, v, false)).toBe(true);
    expect(useStore.getState().setMaterial(m, v, true)).toBe(false);
    expect(useStore.getState().materialDraft).toBe(false);
  });
});

describe('undo / redo', () => {
  it('coalesces rapid edits of one control and restores settings exactly', () => {
    const st = useStore.getState();
    st.loadPreset('red_brick');
    const before = useStore.getState().settings;
    st.setParam('wear', 0.5);
    st.setParam('wear', 0.6); // same control within the coalescing window -> one undo step
    st.setParam('grime', 0.9);
    useStore.getState().undo();
    expect(useStore.getState().settings.params.grime).toBe(before.params.grime);
    expect(useStore.getState().settings.params.wear).toBe(0.6);
    useStore.getState().undo();
    expect(useStore.getState().settings).toEqual(before);
    useStore.getState().redo();
    expect(useStore.getState().settings.params.wear).toBe(0.6);
  });

  it('reset to preset restores preset parameters', () => {
    const st = useStore.getState();
    st.loadPreset('oak_floor');
    st.setParam('knots', 1);
    useStore.getState().resetToPreset();
    expect(useStore.getState().settings).toEqual(settingsFromPreset(PRESETS.find((p) => p.id === 'oak_floor')!));
  });
});

describe('variations', () => {
  it('keep family and essential parameters, vary only bounded keys, and are reproducible', () => {
    for (const preset of PRESETS) {
      const base = settingsFromPreset(preset);
      const fam = getFamily(base.family);
      const vars = makeVariations(base, false, mulberry32(7));
      const again = makeVariations(base, false, mulberry32(7));
      expect(vars).toEqual(again);
      expect(vars).toHaveLength(4);
      const varied = new Set(fam.variationKeys.map((k) => k.key));
      for (const v of vars) {
        expect(v.family).toBe(base.family);
        for (const d of fam.params) {
          if (!varied.has(d.key)) expect(v.params[d.key], `${preset.id}.${d.key}`).toEqual(base.params[d.key]);
          else if (d.type === 'range') {
            const amount = fam.variationKeys.find((k) => k.key === d.key)!.amount;
            expect(Math.abs((v.params[d.key] as number) - (base.params[d.key] as number))).toBeLessThanOrEqual(amount * (d.max - d.min) + 1e-3);
            expect(v.params[d.key] as number).toBeGreaterThanOrEqual(d.min);
            expect(v.params[d.key] as number).toBeLessThanOrEqual(d.max);
          }
        }
      }
      const locked = makeVariations(base, true, mulberry32(3));
      for (const v of locked) expect(v.seed).toBe(base.seed);
    }
  });
});

describe('persistence', () => {
  beforeEach(() => mem.clear());
  it('round-trips favorites and recovers from corrupt data', () => {
    const s = settingsFromPreset(PRESETS[3]);
    saveFavorites([{ id: 'a', savedAt: 1, settings: s }]);
    const favs = loadFavorites();
    expect(favs).toHaveLength(1);
    expect(favs[0].settings).toEqual(s);
    mem.setItem('mf.favorites.v1', '{not json');
    expect(loadFavorites()).toEqual([]);
    mem.setItem('mf.favorites.v1', JSON.stringify([{ id: 'x', doc: { format: 'evil' } }, 5, null]));
    expect(loadFavorites()).toEqual([]);
  });

  it('validates stored preferences', () => {
    mem.setItem('mf.prefs.v1', JSON.stringify({ shape: 'teapot', tileSize: 1000, workingRes: 1024, turntable: 'yes' }));
    const p = loadPrefs();
    expect(p.shape).toBe(DEFAULT_PREFS.shape);
    expect(p.tileSize).toBe(8);
    expect(p.workingRes).toBe(1024);
    expect(p.turntable).toBe(DEFAULT_PREFS.turntable);
  });
});
