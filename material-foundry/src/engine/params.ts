// Factories for parameters shared by many families, so labels and ranges stay consistent.

import type { ColorParam, ParamGroup, RangeParam, SelectParam, ToggleParam } from './types';

export function range(
  key: string,
  label: string,
  min: number,
  max: number,
  def: number,
  group: ParamGroup,
  extra: Partial<RangeParam> = {},
): RangeParam {
  return { key, label, type: 'range', min, max, step: extra.integer ? 1 : 0.01, default: def, group, ...extra };
}

export function color(key: string, label: string, def: string, extra: Partial<ColorParam> = {}): ColorParam {
  return { key, label, type: 'color', default: def, group: 'colors', ...extra };
}

export function select(
  key: string,
  label: string,
  options: [string, string][],
  def: string,
  group: ParamGroup,
  extra: Partial<SelectParam> = {},
): SelectParam {
  return { key, label, type: 'select', options: options.map(([value, l]) => ({ value, label: l })), default: def, group, ...extra };
}

export function toggle(key: string, label: string, def: boolean, group: ParamGroup, extra: Partial<ToggleParam> = {}): ToggleParam {
  return { key, label, type: 'toggle', default: def, group, ...extra };
}

/** Stylized <-> Natural: drives palette simplification, edge shape and detail frequency. */
export const styleParam = (def = 1) =>
  range('style', 'Stylized ↔ Natural', 0, 1, def, 'surface', {
    help:
      'Left: simplified palette bands, cleaner bevels, fewer fine octaves. Right: irregular edges, continuous color variation and full fine detail.',
  });

export const reliefParam = (def = 1) =>
  range('relief', 'Relief strength', 0, 2, def, 'surface', {
    help: 'Scales the physical depth used for normals, AO and displacement. Does not change the height map itself.',
  });

export const detailParam = (def = 0.5) =>
  range('detail', 'Detail intensity', 0, 1, def, 'surface', { help: 'Amount of fine grain in color and height.' });

export const roughnessParam = (def = 0.5) =>
  range('roughness', 'Roughness bias', 0, 1, def, 'surface', {
    help: 'Shifts roughness while keeping the difference between surface types (e.g. rust stays rougher than bare metal).',
  });

export const wearParam = (label = 'Wear', def = 0.3) => range('wear', label, 0, 1, def, 'wear');

export const crackParams = (density = 0, width = 0.4) => [
  range('crackDensity', 'Crack density', 0, 1, density, 'wear'),
  range('crackWidth', 'Crack width', 0, 1, width, 'wear', { visibleIf: (p) => (p.crackDensity as number) > 0 }),
];
