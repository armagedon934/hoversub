import { describe, expect, it } from 'vitest';
import { unzipSync } from 'fflate';
import { generateMaterial } from '../src/engine/generate';
import { PRESETS } from '../src/engine/presets';
import { parseSettingsJson, serializeSettings } from '../src/engine/schema';
import { buildZip, encodeMap, mapFileName, type ExportOptions } from '../src/export/exporter';
import { encodePng } from '../src/export/png';
import { settingsFromPreset } from '../src/state/store';
import { decodePng } from './helpers';

const lava = settingsFromPreset(PRESETS.find((p) => p.id === 'molten_crust')!);
const stone = settingsFromPreset(PRESETS.find((p) => p.id === 'castle_ashlar')!);
const opts: ExportOptions = { normalConvention: 'opengl', heightBitDepth: 16 };

describe('PNG encoder', () => {
  it('round-trips 8-bit gray, RGB, RGBA and 16-bit gray exactly', () => {
    const w = 37;
    const h = 23;
    const rnd = (n: number, max: number) => Array.from({ length: n }, (_, i) => (i * 7919 + ((i * i) % 101)) % max);
    for (const [colorType, ch, bd] of [
      ['gray', 1, 8],
      ['rgb', 3, 8],
      ['rgba', 4, 8],
      ['gray', 1, 16],
    ] as const) {
      const max = bd === 16 ? 65536 : 256;
      const samples = rnd(w * h * ch, max);
      const png = encodePng(samples, { width: w, height: h, colorType, bitDepth: bd });
      const d = decodePng(png);
      expect(d.crcOk).toBe(true);
      expect(d.width).toBe(w);
      expect(d.height).toBe(h);
      expect(d.bitDepth).toBe(bd);
      expect(d.channels).toBe(ch);
      expect(Array.from(d.data)).toEqual(samples);
    }
  });
});

describe('map export', () => {
  const g = generateMaterial({ size: 128, settings: lava });

  it('encodes every map at the requested size with the right PNG format', () => {
    const expectFmt: Record<string, [number, number]> = {
      basecolor: [2, 8],
      normal: [2, 8],
      roughness: [0, 8],
      metallic: [0, 8],
      ao: [0, 8],
      height: [0, 16],
      emissive: [2, 8],
      orm: [2, 8],
    };
    for (const [map, [ct, bd]] of Object.entries(expectFmt)) {
      const d = decodePng(encodeMap(g.maps, map as never, opts));
      expect(d.width, map).toBe(128);
      expect(d.height, map).toBe(128);
      expect(d.colorType, map).toBe(ct);
      expect(d.bitDepth, map).toBe(bd);
      expect(d.crcOk).toBe(true);
    }
    // Color maps are tagged sRGB, data maps are not.
    expect(decodePng(encodeMap(g.maps, 'basecolor', opts)).chunks).toContain('sRGB');
    expect(decodePng(encodeMap(g.maps, 'roughness', opts)).chunks).not.toContain('sRGB');
  });

  it('stores true 16-bit height samples, and 8-bit height when requested', () => {
    const d16 = decodePng(encodeMap(g.maps, 'height', opts));
    expect(Array.from(d16.data)).toEqual(Array.from(g.maps.height16));
    const distinctLow = new Set(Array.from(d16.data as Uint16Array).map((v) => v & 255));
    expect(distinctLow.size).toBeGreaterThan(16); // low byte carries real information
    const d8 = decodePng(encodeMap(g.maps, 'height', { ...opts, heightBitDepth: 8 }));
    expect(d8.bitDepth).toBe(8);
  });

  it('DirectX normals invert only the green channel of the OpenGL export', () => {
    const gl = decodePng(encodeMap(g.maps, 'normal', opts)).data;
    const dx = decodePng(encodeMap(g.maps, 'normal', { ...opts, normalConvention: 'directx' })).data;
    for (let i = 0; i < gl.length; i += 3) {
      expect(dx[i]).toBe(gl[i]);
      expect(dx[i + 1]).toBe(255 - gl[i + 1]);
      expect(dx[i + 2]).toBe(gl[i + 2]);
    }
  });

  it('packs ORM as R = AO, G = Roughness, B = Metallic', () => {
    const d = decodePng(encodeMap(g.maps, 'orm', opts)).data;
    for (let i = 0; i < 128 * 128; i++) {
      expect(d[i * 3]).toBe(g.maps.ao[i]);
      expect(d[i * 3 + 1]).toBe(g.maps.roughness[i]);
      expect(d[i * 3 + 2]).toBe(g.maps.metallic[i]);
    }
  });

  it('uses clean file names', () => {
    expect(mapFileName(stone, 'basecolor', 2048, opts)).toBe('stone_wall_seed_1042_basecolor_2048.png');
    expect(mapFileName(stone, 'normal', 2048, opts)).toBe('stone_wall_seed_1042_normal_opengl_2048.png');
    expect(mapFileName(stone, 'normal', 1024, { ...opts, normalConvention: 'directx' })).toBe('stone_wall_seed_1042_normal_directx_1024.png');
  });

  it('builds a ZIP with all applicable maps, settings.json and README', () => {
    const z = buildZip({ settings: g.settings, size: 128, maps: g.maps, hasEmissive: true, emissionStrength: g.emissionStrength, reliefDepth: g.reliefDepth, opts, includeOrm: true });
    const files = unzipSync(z.data);
    const names = Object.keys(files).sort();
    const base = 'lava_rock_seed_1815';
    expect(names).toEqual(
      [
        `${base}_ao_128.png`,
        `${base}_basecolor_128.png`,
        `${base}_emissive_128.png`,
        `${base}_height_16bit_128.png`,
        `${base}_metallic_128.png`,
        `${base}_normal_opengl_128.png`,
        `${base}_orm_128.png`,
        `${base}_roughness_128.png`,
        'README.txt',
        'settings.json',
      ].sort(),
    );
    expect(z.name).toBe(`${base}_128.zip`);
    const readme = new TextDecoder().decode(files['README.txt']);
    for (const s of ['OpenGL', 'Seed          : 1815', '128 x 128', 'HEIGHT-BASED APPROXIMATION', 'R = Ambient Occlusion, G = Roughness, B = Metallic', '16-bit']) {
      expect(readme).toContain(s);
    }
    const parsed = parseSettingsJson(new TextDecoder().decode(files['settings.json']));
    expect(parsed.ok).toBe(true);
    if (parsed.ok) expect(parsed.settings).toEqual(g.settings);
    // Non-emissive material: no emissive map in the ZIP.
    const gs = generateMaterial({ size: 64, settings: stone });
    const zs = unzipSync(buildZip({ settings: gs.settings, size: 64, maps: gs.maps, hasEmissive: false, emissionStrength: 0, reliefDepth: gs.reliefDepth, opts, includeOrm: false }).data);
    expect(Object.keys(zs).some((n) => n.includes('emissive'))).toBe(false);
    expect(Object.keys(zs).some((n) => n.includes('_orm_'))).toBe(false);
  });
});

describe('settings JSON', () => {
  it('export -> import reproduces settings and identical output', () => {
    const text = serializeSettings(stone);
    const r = parseSettingsJson(text);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.warnings).toEqual([]);
    expect(r.settings).toEqual(stone);
    const a = generateMaterial({ size: 64, settings: stone }).maps;
    const b = generateMaterial({ size: 64, settings: r.settings }).maps;
    expect(Buffer.from(a.baseColor).equals(Buffer.from(b.baseColor))).toBe(true);
    expect(Buffer.from(a.height16.buffer).equals(Buffer.from(b.height16.buffer))).toBe(true);
  });

  it('rejects invalid, foreign and incompatible files with helpful messages', () => {
    const bad = [
      ['not json', 'not valid JSON'],
      ['[1,2]', 'JSON object'],
      ['{"format":"other"}', 'Not a Material Foundry settings file'],
      ['{"format":"material-foundry-settings","schemaVersion":99,"material":{}}', 'schema v99'],
      ['{"format":"material-foundry-settings","schemaVersion":1}', 'Missing "material"'],
      ['{"format":"material-foundry-settings","schemaVersion":1,"material":{"family":"plasma","seed":1}}', 'Unknown material family'],
      ['{"format":"material-foundry-settings","schemaVersion":1,"material":{"family":"brick_wall","seed":"x"}}', 'seed'],
    ];
    for (const [text, msg] of bad) {
      const r = parseSettingsJson(text);
      expect(r.ok, text).toBe(false);
      if (!r.ok) expect(r.error).toContain(msg);
    }
  });

  it('repairs incomplete or out-of-range settings with warnings and never evaluates content', () => {
    const doc = {
      format: 'material-foundry-settings',
      schemaVersion: 1,
      material: {
        family: 'brick_wall',
        seed: 12.7,
        name: 'Test',
        params: { rows: 999, colorA: 'javascript:alert(1)', bond: 'nope', mortarWidth: 0.2, extra: { __proto__: { polluted: true } } },
      },
    };
    const r = parseSettingsJson(JSON.stringify(doc));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.settings.seed).toBe(12);
    expect(r.settings.params.rows).toBe(24);
    expect(r.settings.params.colorA).toBe('#9b4b32');
    expect(r.settings.params.bond).toBe('running');
    expect(r.settings.params.mortarWidth).toBe(0.2);
    expect('extra' in r.settings.params).toBe(false);
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
    expect(r.warnings.join(' ')).toMatch(/Brick rows/);
    expect(r.warnings.join(' ')).toMatch(/missing/);
    expect(r.warnings.join(' ')).toMatch(/unknown parameters: extra/);
  });
});
