import type { Fields, GenContext } from './fields';

export type FamilyId =
  | 'stone_wall'
  | 'brick_wall'
  | 'rough_rock'
  | 'concrete'
  | 'wood_planks'
  | 'brushed_metal'
  | 'rusted_metal'
  | 'painted_panels'
  | 'tiles'
  | 'sand_earth'
  | 'lava_rock'
  | 'arcane_stone';

export type ParamValue = number | string | boolean;
export type ParamValues = Record<string, ParamValue>;

export type ParamGroup = 'colors' | 'pattern' | 'surface' | 'wear' | 'emission' | 'advanced';

interface ParamBase {
  key: string;
  label: string;
  group: ParamGroup;
  help?: string;
  /** Show the control only when this predicate holds for the current values. */
  visibleIf?: (p: ParamValues) => boolean;
}

export interface RangeParam extends ParamBase {
  type: 'range';
  min: number;
  max: number;
  step: number;
  default: number;
  /** Integer-valued parameter (counts, repeat numbers). */
  integer?: boolean;
  /** Formatting hint for the displayed value. */
  unit?: '%' | 'x' | '';
}

export interface ColorParam extends ParamBase {
  type: 'color';
  default: string;
}

export interface SelectParam extends ParamBase {
  type: 'select';
  options: { value: string; label: string }[];
  default: string;
}

export interface ToggleParam extends ParamBase {
  type: 'toggle';
  default: boolean;
}

export type ParamDef = RangeParam | ColorParam | SelectParam | ToggleParam;

export interface MaterialSettings {
  family: FamilyId;
  /** Preset this configuration started from (null for imported/custom). */
  presetId: string | null;
  /** Display name. */
  name: string;
  /** Integer seed driving every random choice. */
  seed: number;
  params: ParamValues;
}

export interface FamilyDefinition {
  id: FamilyId;
  label: string;
  /** Short file-name friendly slug, e.g. "stone_wall". */
  slug: string;
  description: string;
  params: ParamDef[];
  /** Whether this configuration produces an emissive map. */
  emits: (p: ParamValues) => boolean;
  /** Fill the material fields. */
  generate: (ctx: GenContext, p: ParamValues, out: Fields) => void;
  /**
   * Parameters that variations may jitter (continuous, non-essential) and by how much
   * (fraction of the parameter range).
   */
  variationKeys: { key: string; amount: number }[];
}

export interface PresetDefinition {
  id: string;
  name: string;
  family: FamilyId;
  seed: number;
  /** Short descriptive tags (e.g. "worn", "stylized"). */
  tags: string[];
  /** Only parameters that differ from the family defaults need to be listed. */
  params: ParamValues;
}

/** Typed accessors used inside generators. */
export function num(p: ParamValues, key: string, fallback = 0): number {
  const v = p[key];
  return typeof v === 'number' && Number.isFinite(v) ? v : fallback;
}

export function str(p: ParamValues, key: string, fallback = ''): string {
  const v = p[key];
  return typeof v === 'string' ? v : fallback;
}

export function bool(p: ParamValues, key: string, fallback = false): boolean {
  const v = p[key];
  return typeof v === 'boolean' ? v : fallback;
}
