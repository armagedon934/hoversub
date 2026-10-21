import { describe, expect, it } from 'vitest';
import { generateFieldBand, assembleBands, finishMaterial, generateMaterial } from '../src/engine/generate';
import { PRESETS } from '../src/engine/presets';
import { FAMILIES, defaultParams } from '../src/engine/registry';
import type { MaterialSettings } from '../src/engine/types';
import { settingsFromPreset } from '../src/state/store';
import { variance } from './helpers';

const SIZE = 96;

function familySettings(id: string): MaterialSettings {
  const p = PRESETS.find((x) => x.family === id)!;
  return settingsFromPreset(p);
}

describe('material library', () => {
  it('has at least 12 families and 24 presets, each family with at least 2 presets', () => {
    expect(FAMILIES.length).toBeGreaterThanOrEqual(12);
    expect(PRESETS.length).toBeGreaterThanOrEqual(24);
    for (const f of FAMILIES) expect(PRESETS.filter((p) => p.family === f.id).length).toBeGreaterThanOrEqual(2);
    const ids = new Set(PRESETS.map((p) => p.id));
    expect(ids.size).toBe(PRESETS.length);
  });

  it('every preset only uses parameters known to its family', () => {
    for (const p of PRESETS) {
      const known = new Set(Object.keys(defaultParams(FAMILIES.find((f) => f.id === p.family)!)));
      for (const k of Object.keys(p.params)) expect(known.has(k), `${p.id}.${k}`).toBe(true);
    }
  });

  it('every preset produces non-empty, varied maps', () => {
    for (const p of PRESETS) {
      const g = generateMaterial({ size: 64, settings: settingsFromPreset(p) });
      const m = g.maps;
      const lum = Array.from({ length: 64 * 64 }, (_, i) => m.baseColor[i * 4] + m.baseColor[i * 4 + 1] + m.baseColor[i * 4 + 2]);
      expect(variance(lum), `${p.id} base color variance`).toBeGreaterThan(4);
      expect(variance(m.height16), `${p.id} height variance`).toBeGreaterThan(1000);
      expect(variance(m.normal, 4, 0) + variance(m.normal, 4, 1), `${p.id} normal variance`).toBeGreaterThan(0.2);
      if (g.hasEmissive) {
        let em = 0;
        for (let i = 0; i < m.emissive!.length; i += 4) em += m.emissive![i] + m.emissive![i + 1] + m.emissive![i + 2];
        expect(em, `${p.id} emissive sum`).toBeGreaterThan(0);
      }
    }
  });

  it('families are visibly distinct from each other', () => {
    const maps = FAMILIES.map((f) => generateMaterial({ size: 64, settings: familySettings(f.id) }).maps);
    for (let a = 0; a < maps.length; a++) {
      for (let b = a + 1; b < maps.length; b++) {
        let diff = 0;
        for (let i = 0; i < maps[a].baseColor.length; i++) diff += Math.abs(maps[a].baseColor[i] - maps[b].baseColor[i]);
        let hdiff = 0;
        for (let i = 0; i < maps[a].height16.length; i++) hdiff += Math.abs(maps[a].height16[i] - maps[b].height16[i]);
        const meanColor = diff / maps[a].baseColor.length;
        const meanHeight = hdiff / maps[a].height16.length / 257;
        expect(meanColor + meanHeight, `${FAMILIES[a].id} vs ${FAMILIES[b].id}`).toBeGreaterThan(8);
      }
    }
  });
});

describe('determinism', () => {
  it('same settings and seed reproduce identical maps; a different seed changes them', () => {
    for (const f of FAMILIES) {
      const s = familySettings(f.id);
      const a = generateMaterial({ size: 64, settings: s }).maps;
      const b = generateMaterial({ size: 64, settings: s }).maps;
      expect(Buffer.from(a.baseColor).equals(Buffer.from(b.baseColor))).toBe(true);
      expect(Buffer.from(a.normal).equals(Buffer.from(b.normal))).toBe(true);
      expect(Buffer.from(a.height16.buffer).equals(Buffer.from(b.height16.buffer))).toBe(true);
      expect(Buffer.from(a.roughness).equals(Buffer.from(b.roughness))).toBe(true);
      const c = generateMaterial({ size: 64, settings: { ...s, seed: s.seed + 1 } }).maps;
      expect(Buffer.from(a.height16.buffer).equals(Buffer.from(c.height16.buffer)), f.id).toBe(false);
    }
  });

  it('parallel band generation is identical to single-pass generation', () => {
    for (const f of FAMILIES) {
      const s = familySettings(f.id);
      const single = generateMaterial({ size: SIZE, settings: s }).maps;
      const bands = [0, 17, 50, SIZE].slice(0, -1).map((y0, k, arr) => generateFieldBand(s, SIZE, y0, k + 1 < arr.length ? arr[k + 1] : SIZE));
      const banded = finishMaterial(assembleBands(SIZE, bands), s).maps;
      expect(Buffer.from(single.baseColor).equals(Buffer.from(banded.baseColor)), f.id).toBe(true);
      expect(Buffer.from(single.normal).equals(Buffer.from(banded.normal)), f.id).toBe(true);
      expect(Buffer.from(single.ao).equals(Buffer.from(banded.ao)), f.id).toBe(true);
    }
  });
});

describe('material semantics', () => {
  it('brushed metal is metallic everywhere; stone, brick, wood and concrete are dielectric', () => {
    const metal = generateMaterial({ size: 64, settings: familySettings('brushed_metal') }).maps.metallic;
    expect(Math.min(...metal)).toBe(255);
    for (const id of ['stone_wall', 'brick_wall', 'wood_planks', 'concrete', 'tiles', 'sand_earth', 'rough_rock']) {
      const m = generateMaterial({ size: 64, settings: familySettings(id) }).maps.metallic;
      expect(Math.max(...m), id).toBe(0);
    }
  });

  it('rust is dielectric and rougher than exposed metal', () => {
    const s = settingsFromPreset(PRESETS.find((p) => p.id === 'corroded_plate')!);
    const m = generateMaterial({ size: 128, settings: s }).maps;
    let rustRough = 0;
    let rustN = 0;
    let metalRough = 0;
    let metalN = 0;
    for (let i = 0; i < m.metallic.length; i++) {
      if (m.metallic[i] < 10) {
        rustRough += m.roughness[i];
        rustN++;
      } else if (m.metallic[i] > 245) {
        metalRough += m.roughness[i];
        metalN++;
      }
    }
    expect(rustN).toBeGreaterThan(100);
    expect(metalN).toBeGreaterThan(100);
    expect(rustRough / rustN).toBeGreaterThan(metalRough / metalN + 60);
  });

  it('roughness is not a grayscale copy of the base color', () => {
    for (const f of FAMILIES) {
      const m = generateMaterial({ size: 64, settings: familySettings(f.id) }).maps;
      let same = 0;
      for (let i = 0; i < m.roughness.length; i++) {
        const l = Math.round((m.baseColor[i * 4] + m.baseColor[i * 4 + 1] + m.baseColor[i * 4 + 2]) / 3);
        if (Math.abs(l - m.roughness[i]) <= 2) same++;
      }
      expect(same / m.roughness.length, f.id).toBeLessThan(0.5);
    }
  });

  it('emission appears only in recessed regions for lava and only where the inlay is for arcane stone', () => {
    const lava = generateMaterial({ size: 128, settings: settingsFromPreset(PRESETS.find((p) => p.id === 'molten_crust')!) }).maps;
    let hotHigh = 0;
    let hot = 0;
    for (let i = 0; i < lava.height16.length; i++) {
      const e = lava.emissive![i * 4] + lava.emissive![i * 4 + 1] + lava.emissive![i * 4 + 2];
      if (e > 60) {
        hot++;
        if (lava.height16[i] > 0.75 * 65535) hotHigh++;
      }
    }
    expect(hot).toBeGreaterThan(100);
    expect(hotHigh / hot).toBeLessThan(0.02);
    const carved = generateMaterial({ size: 64, settings: settingsFromPreset(PRESETS.find((p) => p.id === 'ancient_carvings')!) });
    expect(carved.hasEmissive).toBe(false);
    expect(carved.maps.emissive).toBeNull();
  });

  it('mortar is recessed below brick faces', () => {
    const s = familySettings('brick_wall');
    const m = generateMaterial({ size: 128, settings: s }).maps;
    // Brick row height is 1/12 of the tile; the horizontal mortar joint sits at row boundaries.
    const rowAt = (y: number) => {
      let sum = 0;
      for (let x = 0; x < 128; x++) sum += m.height16[y * 128 + x];
      return sum / 128;
    };
    const joint = rowAt(0); // v = 1 - 0.5/128 lies inside the joint at the tile edge
    const face = rowAt(5); // middle of the first brick row
    expect(face).toBeGreaterThan(joint + 0.2 * 65535);
  });
});

describe('seamless tiling of generated maps', () => {
  it('wrap-around neighbour differences of height and color look like ordinary neighbour differences', () => {
    const N = 128;
    for (const f of FAMILIES) {
      const m = generateMaterial({ size: N, settings: familySettings(f.id) }).maps;
      for (const [name, get] of [
        ['height', (x: number, y: number) => m.height16[y * N + x] / 257],
        ['basecolor', (x: number, y: number) => m.baseColor[(y * N + x) * 4] + m.baseColor[(y * N + x) * 4 + 1]],
      ] as const) {
        // Per-column-pair mean absolute difference; the wrap pair (N-1 -> 0) must look like an
        // ordinary interior pair, not an outlier.
        const colPairs: number[] = [];
        for (let x = 0; x < N; x++) {
          let s = 0;
          for (let y = 0; y < N; y++) s += Math.abs(get((x + 1) % N, y) - get(x, y));
          colPairs.push(s / N);
        }
        const rowPairs: number[] = [];
        for (let y = 0; y < N; y++) {
          let s = 0;
          for (let x = 0; x < N; x++) s += Math.abs(get(x, (y + 1) % N) - get(x, y));
          rowPairs.push(s / N);
        }
        const wrapX = colPairs[N - 1];
        const wrapY = rowPairs[N - 1];
        const maxX = Math.max(...colPairs.slice(0, N - 1));
        const maxY = Math.max(...rowPairs.slice(0, N - 1));
        expect(wrapX, `${f.id} ${name} x-wrap ${wrapX.toFixed(2)} vs max ${maxX.toFixed(2)}`).toBeLessThanOrEqual(maxX * 1.25 + 1e-9);
        expect(wrapY, `${f.id} ${name} y-wrap ${wrapY.toFixed(2)} vs max ${maxY.toFixed(2)}`).toBeLessThanOrEqual(maxY * 1.25 + 1e-9);
      }
    }
  });
});

describe('periodicity of complete material generation (roll test)', () => {
  it('sampling with a half-tile offset reproduces the image rolled by half a tile', () => {
    const N = 64;
    const half = N / 2;
    for (const p of PRESETS) {
      const s = settingsFromPreset(p);
      const a = generateFieldBand(s, N, 0, N);
      const b = generateFieldBand(s, N, 0, N, undefined, undefined, [0.5, 0.5]);
      let bad = 0;
      let maxDiff = 0;
      for (let y = 0; y < N; y++) {
        for (let x = 0; x < N; x++) {
          const ia = ((y + half) % N) * N + ((x + half) % N);
          const ib = y * N + x;
          const d = Math.max(
            Math.abs(a.height[ia] - b.height[ib]),
            Math.abs(a.albedo[ia * 3] - b.albedo[ib * 3]),
            Math.abs(a.rough[ia] - b.rough[ib]),
            Math.abs(a.metal[ia] - b.metal[ib]),
          );
          if (d > 1e-3) bad++;
          maxDiff = Math.max(maxDiff, d);
        }
      }
      // Floating point rounding may flip a texel that lies exactly on a feature boundary;
      // anything beyond a handful of texels would indicate a real seam.
      expect(bad / (N * N), `${p.id}: ${bad} texels differ (max ${maxDiff.toFixed(3)})`).toBeLessThan(0.002);
    }
  });
});
