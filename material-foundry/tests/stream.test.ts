import { describe, expect, it } from 'vitest';
import { unzipSync } from 'fflate';
import { generateMaterial } from '../src/engine/generate';
import { PRESETS } from '../src/engine/presets';
import { generateStrip } from '../src/engine/strip';
import { encodeMap, type ExportOptions, type MapId } from '../src/export/exporter';
import { joinParts, crc32 } from '../src/export/png';
import { StripEncoderSet } from '../src/export/stripEncoder';
import { entryFromBytes, zipParts } from '../src/export/zipwriter';
import { settingsFromPreset } from '../src/state/store';
import { decodePng } from './helpers';

async function streamed(settings: ReturnType<typeof settingsFromPreset>, size: number, rowsPerStrip: number, maps: MapId[], opts: ExportOptions) {
  const ref = generateMaterial({ size, settings });
  const set = new StripEncoderSet({
    size,
    maps,
    opts,
    proxy: { size, height: Float32Array.from(ref.maps.height16, (h) => h / 65535), depth: ref.reliefDepth / Number(ref.settings.params.relief), strength: Number(ref.settings.params.relief) },
  });
  for (let y0 = 0; y0 < size; y0 += rowsPerStrip) {
    await set.pushStrip(generateStrip(settings, size, y0, Math.min(size, y0 + rowsPerStrip), opts.normalBitDepth === 16));
  }
  return { ref, files: await set.finish() };
}

describe('strip-based streaming export (used for 4K and 8K)', () => {
  it('produces byte-identical maps to the whole-image path (AO within quantization)', async () => {
    for (const id of ['molten_crust', 'castle_ashlar', 'corroded_plate', 'oak_floor']) {
      const s = settingsFromPreset(PRESETS.find((p) => p.id === id)!);
      for (const opts of [
        { normalConvention: 'opengl', heightBitDepth: 16, normalBitDepth: 8 },
        { normalConvention: 'directx', heightBitDepth: 8, normalBitDepth: 16 },
      ] as ExportOptions[]) {
        const maps: MapId[] = ['basecolor', 'normal', 'roughness', 'metallic', 'height', 'ao', 'orm'];
        if (id === 'molten_crust') maps.push('emissive');
        const { ref, files } = await streamed(s, 128, 24, maps, opts);
        for (const f of files) {
          const got = decodePng(joinParts(f.png.parts, f.png.length));
          const want = decodePng(encodeMap(ref.maps, f.map, opts));
          expect(got.crcOk).toBe(true);
          expect([got.width, got.height, got.bitDepth, got.colorType], `${id} ${f.map}`).toEqual([want.width, want.height, want.bitDepth, want.colorType]);
          if (f.map === 'ao' || f.map === 'orm') {
            let maxDiff = 0;
            for (let i = 0; i < got.data.length; i++) maxDiff = Math.max(maxDiff, Math.abs(got.data[i] - want.data[i]));
            expect(maxDiff, `${id} ${f.map}`).toBeLessThanOrEqual(1);
          } else {
            expect(Buffer.from(Array.from(got.data)).equals(Buffer.from(Array.from(want.data))), `${id} ${f.map} ${opts.normalBitDepth}`).toBe(true);
          }
          // Whole-file CRC reported for the ZIP entry is correct.
          expect(f.png.crc).toBe((crc32(joinParts(f.png.parts)) ^ 0xffffffff) >>> 0);
        }
      }
    }
  });

  it('16-bit normals are unit length and agree with the 8-bit normals', () => {
    const s = settingsFromPreset(PRESETS.find((p) => p.id === 'castle_ashlar')!);
    const m = generateMaterial({ size: 64, settings: s }).maps;
    for (let i = 0; i < 64 * 64; i++) {
      const v = [0, 1, 2].map((c) => m.normal16[i * 3 + c] / 32767.5 - 1);
      expect(Math.hypot(v[0], v[1], v[2])).toBeGreaterThan(0.9999);
      expect(Math.hypot(v[0], v[1], v[2])).toBeLessThan(1.0001);
      for (let c = 0; c < 3; c++) expect(Math.abs(m.normal16[i * 3 + c] / 257 - m.normal[i * 4 + c])).toBeLessThanOrEqual(1);
    }
  });

  it('rejects strips delivered out of order', async () => {
    const s = settingsFromPreset(PRESETS[0]);
    const set = new StripEncoderSet({ size: 32, maps: ['basecolor'], opts: { normalConvention: 'opengl', heightBitDepth: 16 } });
    await expect(set.pushStrip(generateStrip(s, 32, 16, 32, false))).rejects.toThrow(/out of order/);
  });
});

describe('streaming PNG compression', () => {
  it('round-trips sparse data that broke fflate streaming deflate', async () => {
    const { PngStreamEncoder } = await import('../src/export/png');
    const w = 128;
    const h = 300;
    const data = new Uint8Array(w * h);
    for (let r = 0; r < h; r++) for (let i = 0; i < w; i++) data[r * w + i] = (r * 131 + i * 17) % 97 === 0 ? 255 : 0;
    const enc = new PngStreamEncoder({ width: w, height: h, colorType: 'gray', bitDepth: 8 });
    for (let y = 0; y < h; y += 7) await enc.pushRows(data.subarray(y * w), Math.min(7, h - y));
    const r = await enc.finish();
    const d = decodePng(joinParts(r.parts, r.length));
    expect(d.crcOk).toBe(true);
    expect(Buffer.from(d.data as Uint8Array).equals(Buffer.from(data))).toBe(true);
  });
});

describe('ZIP writer from parts', () => {
  it('writes a valid stored archive readable by an independent unzipper', () => {
    const a = new Uint8Array(100_000).map((_, i) => (i * 31) & 255);
    const b = new TextEncoder().encode('hello');
    const z = zipParts([{ name: 'big.bin', parts: [a.subarray(0, 40_000), a.subarray(40_000)], length: a.length, crc: (crc32(a) ^ 0xffffffff) >>> 0 }, entryFromBytes('dir/hello.txt', b)]);
    const bytes = joinParts(z.parts, z.length);
    expect(bytes.length).toBe(z.length);
    const files = unzipSync(bytes);
    expect(Object.keys(files).sort()).toEqual(['big.bin', 'dir/hello.txt']);
    expect(Buffer.from(files['big.bin']).equals(Buffer.from(a))).toBe(true);
    expect(new TextDecoder().decode(files['dir/hello.txt'])).toBe('hello');
  });
});
