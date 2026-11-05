import { isHexColor } from './color';
import { arcaneFamily } from './families/arcane';
import { brickFamily } from './families/brick';
import { brushedMetalFamily } from './families/brushedMetal';
import { concreteFamily } from './families/concrete';
import { lavaFamily } from './families/lava';
import { paintedPanelsFamily } from './families/paintedPanels';
import { rockFamily } from './families/rock';
import { rustFamily } from './families/rust';
import { sandFamily } from './families/sand';
import { stoneWallFamily } from './families/stoneWall';
import { tilesFamily } from './families/tiles';
import { woodFamily } from './families/wood';
import type { FamilyDefinition, FamilyId, ParamDef, ParamValue, ParamValues } from './types';

export const FAMILIES: FamilyDefinition[] = [
  stoneWallFamily,
  brickFamily,
  rockFamily,
  concreteFamily,
  woodFamily,
  brushedMetalFamily,
  rustFamily,
  paintedPanelsFamily,
  tilesFamily,
  sandFamily,
  lavaFamily,
  arcaneFamily,
];

const BY_ID = new Map<FamilyId, FamilyDefinition>(FAMILIES.map((f) => [f.id, f]));

export function isFamilyId(id: unknown): id is FamilyId {
  return typeof id === 'string' && BY_ID.has(id as FamilyId);
}

export function getFamily(id: FamilyId): FamilyDefinition {
  const f = BY_ID.get(id);
  if (!f) throw new Error(`Unknown material family "${id}"`);
  return f;
}

export function defaultParams(family: FamilyDefinition): ParamValues {
  const out: ParamValues = {};
  for (const d of family.params) out[d.key] = d.default;
  return out;
}

/** Coerce a value to a valid value for the parameter, or return undefined if impossible. */
export function coerceParam(def: ParamDef, value: unknown): ParamValue | undefined {
  switch (def.type) {
    case 'range': {
      if (typeof value !== 'number' || !Number.isFinite(value)) return undefined;
      let v = Math.min(def.max, Math.max(def.min, value));
      if (def.integer) {
        const step = def.step >= 1 ? def.step : 1;
        v = def.min + Math.round((v - def.min) / step) * step;
        v = Math.min(def.max, v);
      }
      return v;
    }
    case 'color':
      return isHexColor(value) ? (value.startsWith('#') ? value.toLowerCase() : `#${value.toLowerCase()}`) : undefined;
    case 'select':
      return typeof value === 'string' && def.options.some((o) => o.value === value) ? value : undefined;
    case 'toggle':
      return typeof value === 'boolean' ? value : undefined;
  }
}

/** Return a complete, valid parameter set: known keys coerced, missing keys defaulted, unknown dropped. */
export function resolveParams(family: FamilyDefinition, params: ParamValues | undefined): ParamValues {
  const out: ParamValues = {};
  for (const d of family.params) {
    const v = params ? coerceParam(d, params[d.key]) : undefined;
    out[d.key] = v === undefined ? d.default : v;
  }
  return out;
}

export function isParamVisible(def: ParamDef, values: ParamValues): boolean {
  return def.visibleIf ? def.visibleIf(values) : true;
}
