// Generate example exports (the same ZIP format the app downloads) into examples/.
// Usage: npm run examples   [-- <size>]
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { generateMaterial } from '../src/engine/generate';
import { PRESETS } from '../src/engine/presets';
import { renderSwatch } from '../src/engine/swatch';
import { buildZip, encodeMap } from '../src/export/exporter';
import { buildGlb } from '../src/export/glb';
import { buildModelMeshes } from '../src/preview/modelExport';
import { encodePng, joinParts, rgbaToRgb } from '../src/export/png';
import { settingsFromPreset } from '../src/state/store';

const size = Number(process.argv[2] ?? 512);
const ids = ['castle_ashlar', 'oak_floor', 'corroded_plate', 'molten_crust'];
const out = 'examples';
mkdirSync(out, { recursive: true });

for (const id of ids) {
  const preset = PRESETS.find((p) => p.id === id)!;
  const t0 = performance.now();
  const g = generateMaterial({ size, settings: settingsFromPreset(preset) });
  const z = buildZip({
    settings: g.settings,
    size,
    maps: g.maps,
    hasEmissive: g.hasEmissive,
    emissionStrength: g.emissionStrength,
    reliefDepth: g.reliefDepth,
    opts: { normalConvention: 'opengl', heightBitDepth: 16 },
    includeOrm: true,
  });
  writeFileSync(join(out, z.name), z.data);
  console.log(`${z.name}  ${(z.data.length / 1048576).toFixed(2)} MB  ${(performance.now() - t0).toFixed(0)} ms`);
}

// Example 3D model: Castle Ashlar on the bevelled block (glTF binary with embedded textures).
{
  const g = generateMaterial({ size, settings: settingsFromPreset(PRESETS.find((p) => p.id === 'castle_ashlar')!) });
  const opts = { normalConvention: 'opengl', heightBitDepth: 16, normalBitDepth: 8 } as const;
  const img = (m: 'basecolor' | 'normal' | 'orm') => {
    const png = encodeMap(g.maps, m, opts);
    return { parts: [png], length: png.length };
  };
  const glb = buildGlb(buildModelMeshes({ shape: 'block', tileSize: 1 }), { name: g.settings.name, baseColor: img('basecolor'), normal: img('normal'), orm: img('orm') });
  writeFileSync(join(out, `stone_wall_seed_1042_block_${size}.glb`), joinParts(glb.parts, glb.length));
  console.log(`stone_wall_seed_1042_block_${size}.glb  ${(glb.length / 1048576).toFixed(2)} MB`);
}

// Contact sheet: lit swatch of every preset (128 px each).
const T = 128;
const cols = 7;
const rows = Math.ceil(PRESETS.length / cols);
const sheet = new Uint8Array(cols * T * rows * T * 3);
PRESETS.forEach((p, k) => {
  const g = generateMaterial({ size: T, settings: settingsFromPreset(p) });
  const rgb = rgbaToRgb(renderSwatch(g.maps, { dir: [-0.45, 0.55, 0.7], intensity: 1, emissionStrength: g.emissionStrength }));
  const ox = (k % cols) * T;
  const oy = Math.floor(k / cols) * T;
  for (let y = 0; y < T; y++) sheet.set(rgb.subarray(y * T * 3, (y + 1) * T * 3), ((oy + y) * cols * T + ox) * 3);
});
writeFileSync(join(out, 'preset-contact-sheet.png'), encodePng(sheet, { width: cols * T, height: rows * T, colorType: 'rgb', bitDepth: 8, srgb: true }));
console.log('preset-contact-sheet.png');
