// Application state: current material settings with undo/redo, preview/generation status,
// interface preferences and favorites.

import { create } from 'zustand';
import type { GeneratedMaterial } from '../engine/generate';
import { getPreset, DEFAULT_PRESET_ID } from '../engine/presets';
import { defaultParams, getFamily } from '../engine/registry';
import { MAX_SEED } from '../engine/schema';
import type { FamilyId, MaterialSettings, ParamValue, PresetDefinition } from '../engine/types';
import {
  loadCurrent,
  loadFavorites,
  loadPrefs,
  saveCurrent,
  saveFavorites,
  savePrefs,
  MAX_FAVORITES,
  type Favorite,
  type Prefs,
} from './persistence';

const HISTORY_LIMIT = 100;
const COALESCE_MS = 700;

export function settingsFromPreset(p: PresetDefinition, seed?: number): MaterialSettings {
  const fam = getFamily(p.family);
  return {
    family: p.family,
    presetId: p.id,
    name: p.name,
    seed: seed ?? p.seed,
    params: { ...defaultParams(fam), ...p.params },
  };
}

export function settingsEqual(a: MaterialSettings, b: MaterialSettings): boolean {
  if (a.family !== b.family || a.seed !== b.seed || a.presetId !== b.presetId || a.name !== b.name) return false;
  const ka = Object.keys(a.params);
  if (ka.length !== Object.keys(b.params).length) return false;
  return ka.every((k) => a.params[k] === b.params[k]);
}

export interface GenStatus {
  busy: boolean;
  stage: string;
  fraction: number;
  error: string | null;
}

export interface Toast {
  id: number;
  kind: 'info' | 'success' | 'warning' | 'error';
  text: string;
}

interface State {
  settings: MaterialSettings;
  /** Increments on every settings change; generated results carry the version they were made for. */
  version: number;
  past: MaterialSettings[];
  future: MaterialSettings[];
  lastEditKey: string | null;
  lastEditTime: number;

  material: GeneratedMaterial | null;
  materialVersion: number;
  /** True when the displayed material is a fast low-resolution draft. */
  materialDraft: boolean;
  gen: GenStatus;

  prefs: Prefs;
  favorites: Favorite[];
  toasts: Toast[];
  exportOpen: boolean;

  setParam: (key: string, value: ParamValue) => void;
  setSeed: (seed: number) => void;
  randomizeSeed: () => void;
  applySettings: (s: MaterialSettings, opts?: { keepSeed?: boolean; label?: string }) => void;
  loadPreset: (id: string) => void;
  resetToPreset: () => void;
  undo: () => void;
  redo: () => void;
  setMaterial: (m: GeneratedMaterial, version: number, draft: boolean) => boolean;
  setGen: (g: Partial<GenStatus>) => void;
  /** Re-run generation for the current settings (e.g. after an error). */
  regenerate: () => void;
  setPrefs: (p: Partial<Prefs>) => void;
  addFavorite: () => void;
  removeFavorite: (id: string) => void;
  renameCurrent: (name: string) => void;
  toast: (kind: Toast['kind'], text: string) => void;
  dismissToast: (id: number) => void;
  setExportOpen: (open: boolean) => void;
}

function initialSettings(): MaterialSettings {
  const saved = loadCurrent();
  if (saved) return saved;
  return settingsFromPreset(getPreset(DEFAULT_PRESET_ID)!);
}

let toastId = 1;

export const useStore = create<State>((set, get) => {
  /** Record history and apply new settings. `key` groups rapid edits of one control into one undo step. */
  const commit = (next: MaterialSettings, key: string | null) => {
    const st = get();
    const now = performance.now();
    const coalesce = key !== null && key === st.lastEditKey && now - st.lastEditTime < COALESCE_MS;
    const past = coalesce ? st.past : [...st.past, st.settings].slice(-HISTORY_LIMIT);
    set({ settings: next, version: st.version + 1, past, future: [], lastEditKey: key, lastEditTime: now });
    saveCurrent(next);
  };

  return {
    settings: initialSettings(),
    version: 1,
    past: [],
    future: [],
    lastEditKey: null,
    lastEditTime: 0,
    material: null,
    materialVersion: 0,
    materialDraft: false,
    gen: { busy: false, stage: '', fraction: 0, error: null },
    prefs: loadPrefs(),
    favorites: loadFavorites(),
    toasts: [],
    exportOpen: false,

    setParam(key, value) {
      const s = get().settings;
      if (s.params[key] === value) return;
      commit({ ...s, params: { ...s.params, [key]: value } }, `param:${key}`);
    },
    setSeed(seed) {
      const s = get().settings;
      const v = Math.max(0, Math.min(MAX_SEED, Math.trunc(seed)));
      if (v === s.seed || !Number.isFinite(v)) return;
      commit({ ...s, seed: v }, 'seed');
    },
    randomizeSeed() {
      const s = get().settings;
      commit({ ...s, seed: Math.floor(Math.random() * 99999) + 1 }, null);
    },
    applySettings(next, opts) {
      const cur = get().settings;
      const s = opts?.keepSeed ? { ...next, seed: cur.seed } : next;
      if (settingsEqual(s, cur)) return;
      commit({ ...s, params: { ...s.params } }, null);
    },
    loadPreset(id) {
      const p = getPreset(id);
      if (!p) return;
      const st = get();
      const keep = st.prefs.seedLocked;
      get().applySettings(settingsFromPreset(p, keep ? st.settings.seed : undefined));
    },
    resetToPreset() {
      const s = get().settings;
      const p = s.presetId ? getPreset(s.presetId) : undefined;
      if (p) {
        get().applySettings(settingsFromPreset(p, get().prefs.seedLocked ? s.seed : undefined));
      } else {
        get().applySettings({ ...s, params: defaultParams(getFamily(s.family)) });
      }
    },
    undo() {
      const st = get();
      if (!st.past.length) return;
      const prev = st.past[st.past.length - 1];
      set({ settings: prev, past: st.past.slice(0, -1), future: [st.settings, ...st.future].slice(0, HISTORY_LIMIT), version: st.version + 1, lastEditKey: null });
      saveCurrent(prev);
    },
    redo() {
      const st = get();
      if (!st.future.length) return;
      const next = st.future[0];
      set({ settings: next, future: st.future.slice(1), past: [...st.past, st.settings].slice(-HISTORY_LIMIT), version: st.version + 1, lastEditKey: null });
      saveCurrent(next);
    },
    setMaterial(m, version, draft) {
      // Only results for the current settings version are ever displayed, so a slow or stale
      // worker result can never overwrite a newer one. A draft never replaces a full result
      // of the same version.
      const st = get();
      if (version !== st.version) return false;
      if (draft && st.material && st.materialVersion === version && !st.materialDraft) return false;
      set({ material: m, materialVersion: version, materialDraft: draft });
      return true;
    },
    regenerate() {
      set({ version: get().version + 1 });
    },
    setGen(g) {
      set({ gen: { ...get().gen, ...g } });
    },
    setPrefs(p) {
      const prefs = { ...get().prefs, ...p };
      set({ prefs });
      savePrefs(prefs);
    },
    addFavorite() {
      const st = get();
      const fav: Favorite = { id: `fav_${Date.now().toString(36)}`, savedAt: Date.now(), settings: { ...st.settings, params: { ...st.settings.params } } };
      if (st.favorites.some((f) => settingsEqual(f.settings, st.settings))) {
        get().toast('info', 'This exact material is already in Favorites.');
        return;
      }
      const favorites = [fav, ...st.favorites].slice(0, MAX_FAVORITES);
      set({ favorites });
      if (saveFavorites(favorites)) get().toast('success', `Saved “${fav.settings.name}” to Favorites.`);
      else get().toast('warning', 'Favorite added for this session, but browser storage is unavailable.');
    },
    removeFavorite(id) {
      const favorites = get().favorites.filter((f) => f.id !== id);
      set({ favorites });
      saveFavorites(favorites);
    },
    renameCurrent(name) {
      const s = get().settings;
      const n = name.trim().slice(0, 80);
      if (!n || n === s.name) return;
      commit({ ...s, name: n }, 'name');
    },
    toast(kind, text) {
      const t: Toast = { id: toastId++, kind, text };
      set({ toasts: [...get().toasts, t].slice(-4) });
      const ttl = kind === 'error' || kind === 'warning' ? 8000 : 3500;
      setTimeout(() => get().dismissToast(t.id), ttl);
    },
    dismissToast(id) {
      set({ toasts: get().toasts.filter((t) => t.id !== id) });
    },
    setExportOpen(open) {
      set({ exportOpen: open });
    },
  };
});

export function familyOf(id: FamilyId) {
  return getFamily(id);
}
