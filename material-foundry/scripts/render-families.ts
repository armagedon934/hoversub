// Developer script: render every preset (or family default) to PNG contact sheets for visual review.
// Usage: npx tsx scripts/render-families.ts <outDir> [size] [filter]
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { generateMaterial } from '../src/engine/generate';
import { encodePng, rgbaToRgb } from '../src/export/png';
import { PRESETS } from '../src/engine/presets';

const outDir = process.argv[2] ?? '.verify-tmp/render';
const size = Number(process.argv[3] ?? 256);
const filter = process.argv[4] ?? '';
mkdirSync(outDir, { recursive: true });

for (const preset of PRESETS) {
  if (filter && !preset.id.includes(filter) && !preset.family.includes(filter)) continue;
  const t0 = performance.now();
  const g = generateMaterial({
    size,
    settings: { family: preset.family, presetId: preset.id, name: preset.name, seed: preset.seed, params: preset.params },
  });
  const ms = performance.now() - t0;
  const m = g.maps;
  // Contact sheet: basecolor | normal | roughness | height | ao | metallic | emissive(if)
  const panels: Uint8Array[] = [
    rgbaToRgb(m.baseColor),
    rgbaToRgb(m.normal),
    gray(m.roughness),
    gray(Uint8Array.from(m.height16, (h) => h >> 8)),
    gray(m.ao),
    gray(m.metallic),
  ];
  if (m.emissive) panels.push(rgbaToRgb(m.emissive));
  const W = size * panels.length;
  const sheet = new Uint8Array(W * size * 3);
  panels.forEach((pnl, k) => {
    for (let y = 0; y < size; y++) {
      sheet.set(pnl.subarray(y * size * 3, (y + 1) * size * 3), (y * W + k * size) * 3);
    }
  });
  writeFileSync(join(outDir, `${preset.id}.png`), encodePng(sheet, { width: W, height: size, colorType: 'rgb', bitDepth: 8 }));
  console.log(`${preset.id.padEnd(28)} ${ms.toFixed(0).padStart(6)} ms  fields ${g.timings.fields.toFixed(0)}`);
}

function gray(a: Uint8Array): Uint8Array {
  const out = new Uint8Array(a.length * 3);
  for (let i = 0; i < a.length; i++) out[i * 3] = out[i * 3 + 1] = out[i * 3 + 2] = a[i];
  return out;
}
