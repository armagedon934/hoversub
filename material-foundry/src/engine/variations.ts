import { coerceParam, getFamily } from './registry';
import type { MaterialSettings } from './types';

/**
 * Four variations of the current material: same family and essential settings, new seeds
 * (unless the seed is locked) plus small bounded changes to the family's non-essential
 * parameters. Each variation is a complete settings object, so selecting it reproduces it exactly.
 */
export function makeVariations(base: MaterialSettings, seedLocked: boolean, rnd: () => number = Math.random): MaterialSettings[] {
  const fam = getFamily(base.family);
  const out: MaterialSettings[] = [];
  const rootName = base.name.replace(/ · V\d+$/, '');
  for (let k = 0; k < 4; k++) {
    const params = { ...base.params };
    for (const { key, amount } of fam.variationKeys) {
      const def = fam.params.find((d) => d.key === key);
      if (!def || def.type !== 'range') continue;
      const cur = params[key] as number;
      const delta = (rnd() * 2 - 1) * amount * (def.max - def.min);
      const v = coerceParam(def, Math.round((cur + delta) * 1000) / 1000);
      if (v !== undefined) params[key] = v;
    }
    out.push({
      family: base.family,
      presetId: base.presetId,
      name: `${rootName} · V${k + 1}`,
      seed: seedLocked ? base.seed : 1 + Math.floor(rnd() * 99998),
      params,
    });
  }
  return out;
}
