// Versioned settings JSON format with strict, non-executing validation.
//
// Imported JSON is only ever read as data: values are type-checked, clamped to valid ranges and
// copied into a fresh object. Unknown keys are ignored; nothing is evaluated.

import { coerceParam, getFamily, isFamilyId } from './registry';
import type { MaterialSettings, ParamValues } from './types';
import { GENERATOR_VERSION } from './generate';

export const SETTINGS_FORMAT = 'material-foundry-settings';
export const SCHEMA_VERSION = 1;
export const MAX_SEED = 2147483647;

export interface SettingsDocument {
  format: typeof SETTINGS_FORMAT;
  schemaVersion: number;
  generatorVersion: number;
  material: MaterialSettings;
  /** Informational export context (not required for import). */
  export?: { resolution?: number; normalConvention?: 'opengl' | 'directx'; heightBitDepth?: 8 | 16 };
}

export function makeSettingsDocument(settings: MaterialSettings, exportInfo?: SettingsDocument['export']): SettingsDocument {
  const doc: SettingsDocument = {
    format: SETTINGS_FORMAT,
    schemaVersion: SCHEMA_VERSION,
    generatorVersion: GENERATOR_VERSION,
    material: {
      name: settings.name,
      family: settings.family,
      presetId: settings.presetId,
      seed: settings.seed,
      params: { ...settings.params },
    },
  };
  if (exportInfo) doc.export = exportInfo;
  return doc;
}

export function serializeSettings(settings: MaterialSettings, exportInfo?: SettingsDocument['export']): string {
  return JSON.stringify(makeSettingsDocument(settings, exportInfo), null, 2);
}

export type ParseResult =
  | { ok: true; settings: MaterialSettings; warnings: string[] }
  | { ok: false; error: string };

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/** Validate an already-parsed value (e.g. from localStorage or a file). */
export function validateSettingsDocument(doc: unknown): ParseResult {
  if (!isPlainObject(doc)) return { ok: false, error: 'The file does not contain a JSON object.' };
  if (doc.format !== SETTINGS_FORMAT) {
    return { ok: false, error: `Not a Material Foundry settings file (expected "format": "${SETTINGS_FORMAT}").` };
  }
  const ver = doc.schemaVersion;
  if (typeof ver !== 'number' || !Number.isInteger(ver) || ver < 1) {
    return { ok: false, error: 'Missing or invalid "schemaVersion".' };
  }
  if (ver > SCHEMA_VERSION) {
    return { ok: false, error: `This file uses settings schema v${ver}, but this version of Material Foundry only understands up to v${SCHEMA_VERSION}.` };
  }
  const m = doc.material;
  if (!isPlainObject(m)) return { ok: false, error: 'Missing "material" object.' };
  if (!isFamilyId(m.family)) {
    return { ok: false, error: `Unknown material family ${JSON.stringify(m.family)}.` };
  }
  const warnings: string[] = [];
  const family = getFamily(m.family);
  let seed = 1;
  if (typeof m.seed === 'number' && Number.isFinite(m.seed)) {
    seed = Math.trunc(m.seed);
    if (seed < 0 || seed > MAX_SEED) {
      warnings.push(`Seed ${m.seed} is out of range and was wrapped.`);
      seed = ((seed % MAX_SEED) + MAX_SEED) % MAX_SEED;
    } else if (seed !== m.seed) {
      warnings.push(`Seed ${m.seed} was rounded to ${seed}.`);
    }
  } else {
    return { ok: false, error: '"material.seed" must be a number.' };
  }
  const rawParams = isPlainObject(m.params) ? m.params : {};
  if (!isPlainObject(m.params)) warnings.push('No parameters found; family defaults were used.');
  const params: ParamValues = {};
  for (const def of family.params) {
    if (!(def.key in rawParams)) {
      params[def.key] = def.default;
      warnings.push(`"${def.label}" was missing and set to its default.`);
      continue;
    }
    const raw = rawParams[def.key];
    const v = coerceParam(def, raw);
    if (v === undefined) {
      params[def.key] = def.default;
      warnings.push(`"${def.label}" had an invalid value (${JSON.stringify(raw)?.slice(0, 40)}) and was reset to its default.`);
    } else {
      if (typeof v === 'number' && typeof raw === 'number' && v !== raw) {
        warnings.push(`"${def.label}" was adjusted from ${raw} to ${v} to stay within its valid range.`);
      }
      params[def.key] = v;
    }
  }
  const known = new Set(family.params.map((d) => d.key));
  const unknown = Object.keys(rawParams).filter((k) => !known.has(k));
  if (unknown.length) warnings.push(`Ignored unknown parameters: ${unknown.slice(0, 6).join(', ')}${unknown.length > 6 ? '…' : ''}.`);
  const name = typeof m.name === 'string' && m.name.trim() ? m.name.trim().slice(0, 80) : family.label;
  const presetId = typeof m.presetId === 'string' ? m.presetId.slice(0, 64) : null;
  return { ok: true, settings: { family: family.id, presetId, name, seed, params }, warnings };
}

/** Parse and validate settings JSON text. Never throws. */
export function parseSettingsJson(text: string): ParseResult {
  if (text.length > 1_000_000) return { ok: false, error: 'The file is too large to be a settings file.' };
  let doc: unknown;
  try {
    doc = JSON.parse(text);
  } catch (e) {
    return { ok: false, error: `The file is not valid JSON: ${(e as Error).message}` };
  }
  return validateSettingsDocument(doc);
}
