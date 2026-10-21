// Local persistence: current material, interface preferences and favorites.
// Only small JSON documents are stored (no generated images). Every read is validated and
// falls back to defaults if missing or corrupt.

import { validateSettingsDocument, makeSettingsDocument } from '../engine/schema';
import type { MaterialSettings } from '../engine/types';

const KEY_CURRENT = 'mf.current.v1';
const KEY_PREFS = 'mf.prefs.v1';
const KEY_FAVORITES = 'mf.favorites.v1';
export const MAX_FAVORITES = 48;

export type PreviewShape = 'sphere' | 'wall' | 'floor' | 'block' | 'scene';
export type LightingPreset = 'studio' | 'sun' | 'overcast' | 'dusk';
export type ViewMode = '3d' | 'maps';
export type InspectMap = 'basecolor' | 'normal' | 'roughness' | 'metallic' | 'height' | 'ao' | 'emissive' | 'orm' | 'lit';

export interface Prefs {
  shape: PreviewShape;
  lighting: LightingPreset;
  lightAzimuth: number; // degrees
  lightElevation: number; // degrees
  lightIntensity: number;
  turntable: boolean;
  displacement: boolean;
  displacementScale: number; // multiplier on the material's own relief depth
  tileSize: number; // metres covered by one texture tile in the preview
  workingRes: 256 | 512 | 1024;
  normalConvention: 'opengl' | 'directx';
  viewMode: ViewMode;
  inspectMap: InspectMap;
  inspectTiled: boolean;
  exportRes: 256 | 512 | 1024 | 2048 | 4096;
  heightBitDepth: 8 | 16;
  includeOrm: boolean;
  showIntro: boolean;
  seedLocked: boolean;
  showGrid: boolean;
}

export const DEFAULT_PREFS: Prefs = {
  shape: 'wall',
  lighting: 'studio',
  lightAzimuth: 35,
  lightElevation: 40,
  lightIntensity: 1,
  turntable: false,
  displacement: false,
  displacementScale: 1,
  tileSize: 2,
  workingRes: 512,
  normalConvention: 'opengl',
  viewMode: '3d',
  inspectMap: 'basecolor',
  inspectTiled: false,
  exportRes: 1024,
  heightBitDepth: 16,
  includeOrm: true,
  showIntro: true,
  seedLocked: false,
  showGrid: true,
};

export interface Favorite {
  id: string;
  savedAt: number;
  settings: MaterialSettings;
}

function storage(): Storage | null {
  try {
    return typeof localStorage !== 'undefined' ? localStorage : null;
  } catch {
    return null;
  }
}

function readJson(key: string): unknown {
  const s = storage();
  if (!s) return undefined;
  try {
    const raw = s.getItem(key);
    return raw ? JSON.parse(raw) : undefined;
  } catch {
    return undefined;
  }
}

function writeJson(key: string, value: unknown): boolean {
  const s = storage();
  if (!s) return false;
  try {
    s.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

export function loadCurrent(): MaterialSettings | null {
  const raw = readJson(KEY_CURRENT);
  if (raw === undefined) return null;
  const r = validateSettingsDocument(raw);
  return r.ok ? r.settings : null;
}

export function saveCurrent(settings: MaterialSettings): void {
  writeJson(KEY_CURRENT, makeSettingsDocument(settings));
}

const ENUMS: Partial<Record<keyof Prefs, readonly unknown[]>> = {
  shape: ['sphere', 'wall', 'floor', 'block', 'scene'],
  lighting: ['studio', 'sun', 'overcast', 'dusk'],
  workingRes: [256, 512, 1024],
  normalConvention: ['opengl', 'directx'],
  viewMode: ['3d', 'maps'],
  inspectMap: ['basecolor', 'normal', 'roughness', 'metallic', 'height', 'ao', 'emissive', 'orm', 'lit'],
  exportRes: [256, 512, 1024, 2048, 4096],
  heightBitDepth: [8, 16],
};

const RANGES: Partial<Record<keyof Prefs, [number, number]>> = {
  lightAzimuth: [-180, 180],
  lightElevation: [5, 90],
  lightIntensity: [0, 3],
  displacementScale: [0, 3],
  tileSize: [0.25, 8],
};

export function loadPrefs(): Prefs {
  const raw = readJson(KEY_PREFS);
  const out: Prefs = { ...DEFAULT_PREFS };
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return out;
  const r = raw as Record<string, unknown>;
  for (const key of Object.keys(DEFAULT_PREFS) as (keyof Prefs)[]) {
    const v = r[key];
    const def = DEFAULT_PREFS[key];
    if (v === undefined) continue;
    const allowed = ENUMS[key];
    if (allowed) {
      if (allowed.includes(v)) (out as unknown as Record<string, unknown>)[key] = v;
      continue;
    }
    if (typeof def === 'boolean' && typeof v === 'boolean') (out as unknown as Record<string, unknown>)[key] = v;
    if (typeof def === 'number' && typeof v === 'number' && Number.isFinite(v)) {
      const rg = RANGES[key];
      (out as unknown as Record<string, unknown>)[key] = rg ? Math.min(rg[1], Math.max(rg[0], v)) : v;
    }
  }
  return out;
}

export function savePrefs(p: Prefs): void {
  writeJson(KEY_PREFS, p);
}

export function loadFavorites(): Favorite[] {
  const raw = readJson(KEY_FAVORITES);
  if (!Array.isArray(raw)) return [];
  const out: Favorite[] = [];
  for (const item of raw.slice(0, MAX_FAVORITES)) {
    if (!item || typeof item !== 'object') continue;
    const it = item as Record<string, unknown>;
    const r = validateSettingsDocument(it.doc);
    if (!r.ok) continue;
    out.push({
      id: typeof it.id === 'string' ? it.id : `fav_${out.length}_${Date.now()}`,
      savedAt: typeof it.savedAt === 'number' ? it.savedAt : Date.now(),
      settings: r.settings,
    });
  }
  return out;
}

export function saveFavorites(favs: Favorite[]): boolean {
  return writeJson(
    KEY_FAVORITES,
    favs.slice(0, MAX_FAVORITES).map((f) => ({ id: f.id, savedAt: f.savedAt, doc: makeSettingsDocument(f.settings) })),
  );
}
