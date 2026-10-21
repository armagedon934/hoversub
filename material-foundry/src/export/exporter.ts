// Export helpers: file names, per-map PNG encoding, ORM packing, README and ZIP assembly.
// Pure functions usable in workers, the main thread and Node.

import { zipSync } from 'fflate';
import { getFamily } from '../engine/registry';
import type { PackedMaps, NormalConvention } from '../engine/maps';
import type { MaterialSettings } from '../engine/types';
import { serializeSettings } from '../engine/schema';
import { encodePng, rgbaToRgb } from './png';

export type MapId = 'basecolor' | 'normal' | 'roughness' | 'metallic' | 'height' | 'ao' | 'emissive' | 'orm';

export const MAP_INFO: Record<MapId, { label: string; colorData: boolean; description: string }> = {
  basecolor: { label: 'Base Color', colorData: true, description: 'Albedo / base color, sRGB. No lighting or shadows baked in.' },
  normal: { label: 'Normal', colorData: false, description: 'Tangent-space normal map derived from the height field.' },
  roughness: { label: 'Roughness', colorData: false, description: 'Perceptual roughness, 0 = mirror-smooth, 1 = fully rough.' },
  metallic: { label: 'Metallic', colorData: false, description: 'Metalness, 0 = dielectric, 1 = bare metal.' },
  height: { label: 'Height', colorData: false, description: 'Height / displacement, 0 = deepest recess, 1 = highest point.' },
  ao: { label: 'Ambient Occlusion', colorData: false, description: 'Height-based cavity approximation (not ray traced).' },
  emissive: { label: 'Emissive', colorData: true, description: 'Emitted light color at unit strength, sRGB.' },
  orm: { label: 'ORM (packed)', colorData: false, description: 'R = Ambient Occlusion, G = Roughness, B = Metallic.' },
};

export interface ExportOptions {
  normalConvention: NormalConvention;
  heightBitDepth: 8 | 16;
}

export function fileBase(settings: MaterialSettings): string {
  return `${getFamily(settings.family).slug}_seed_${settings.seed}`;
}

export function mapFileName(settings: MaterialSettings, map: MapId, size: number, opts: ExportOptions): string {
  const base = fileBase(settings);
  switch (map) {
    case 'normal':
      return `${base}_normal_${opts.normalConvention}_${size}.png`;
    case 'height':
      return `${base}_height_${opts.heightBitDepth}bit_${size}.png`;
    default:
      return `${base}_${map}_${size}.png`;
  }
}

/** Maps applicable to a generated material (emissive only when the material emits). */
export function applicableMaps(hasEmissive: boolean, includeOrm: boolean): MapId[] {
  const list: MapId[] = ['basecolor', 'normal', 'roughness', 'metallic', 'height', 'ao'];
  if (hasEmissive) list.push('emissive');
  if (includeOrm) list.push('orm');
  return list;
}

export function packOrm(m: PackedMaps): Uint8Array {
  const n = m.size * m.size;
  const out = new Uint8Array(n * 3);
  for (let i = 0; i < n; i++) {
    out[i * 3] = m.ao[i];
    out[i * 3 + 1] = m.roughness[i];
    out[i * 3 + 2] = m.metallic[i];
  }
  return out;
}

export function normalRgb(m: PackedMaps, convention: NormalConvention): Uint8Array {
  const rgb = rgbaToRgb(m.normal);
  if (convention === 'directx') {
    for (let i = 1; i < rgb.length; i += 3) rgb[i] = 255 - rgb[i];
  }
  return rgb;
}

/** A copy-light subset of the maps holding only the arrays needed to encode `map`. */
export function mapsSubset(m: PackedMaps, map: MapId): PackedMaps {
  const empty8 = new Uint8Array(0);
  const out: PackedMaps = {
    size: m.size,
    baseColor: new Uint8ClampedArray(0),
    normal: new Uint8ClampedArray(0),
    roughness: empty8,
    metallic: empty8,
    ao: empty8,
    height16: new Uint16Array(0),
    emissive: null,
  };
  switch (map) {
    case 'basecolor':
      out.baseColor = m.baseColor;
      break;
    case 'normal':
      out.normal = m.normal;
      break;
    case 'roughness':
      out.roughness = m.roughness;
      break;
    case 'metallic':
      out.metallic = m.metallic;
      break;
    case 'ao':
      out.ao = m.ao;
      break;
    case 'height':
      out.height16 = m.height16;
      break;
    case 'emissive':
      out.emissive = m.emissive;
      break;
    case 'orm':
      out.ao = m.ao;
      out.roughness = m.roughness;
      out.metallic = m.metallic;
      break;
  }
  return out;
}

/** Encode one map as a lossless PNG. */
export function encodeMap(m: PackedMaps, map: MapId, opts: ExportOptions, level = 6): Uint8Array {
  const size = m.size;
  const base = { width: size, height: size, level };
  switch (map) {
    case 'basecolor':
      return encodePng(rgbaToRgb(m.baseColor), { ...base, colorType: 'rgb', bitDepth: 8, srgb: true });
    case 'emissive':
      if (!m.emissive) throw new Error('This material has no emissive map.');
      return encodePng(rgbaToRgb(m.emissive), { ...base, colorType: 'rgb', bitDepth: 8, srgb: true });
    case 'normal':
      return encodePng(normalRgb(m, opts.normalConvention), { ...base, colorType: 'rgb', bitDepth: 8 });
    case 'roughness':
      return encodePng(m.roughness, { ...base, colorType: 'gray', bitDepth: 8 });
    case 'metallic':
      return encodePng(m.metallic, { ...base, colorType: 'gray', bitDepth: 8 });
    case 'ao':
      return encodePng(m.ao, { ...base, colorType: 'gray', bitDepth: 8 });
    case 'height':
      if (opts.heightBitDepth === 16) return encodePng(m.height16, { ...base, colorType: 'gray', bitDepth: 16 });
      return encodePng(Uint8Array.from(m.height16, (h) => Math.round(h / 257)), { ...base, colorType: 'gray', bitDepth: 8 });
    case 'orm':
      return encodePng(packOrm(m), { ...base, colorType: 'rgb', bitDepth: 8 });
  }
}

export interface ReadmeInput {
  settings: MaterialSettings;
  size: number;
  files: { map: MapId; name: string }[];
  opts: ExportOptions;
  hasEmissive: boolean;
  emissionStrength: number;
  reliefDepth: number;
  generatedAt: string;
}

export function buildReadme(r: ReadmeInput): string {
  const fam = getFamily(r.settings.family);
  const conv =
    r.opts.normalConvention === 'opengl'
      ? 'OpenGL (Y+): green points up (+V). Used by Blender, Godot, Unity, three.js, glTF.'
      : 'DirectX (Y-): green channel inverted relative to OpenGL. Used by Unreal Engine, 3ds Max, CryEngine.';
  const fileLines = r.files.map((f) => `  ${f.name.padEnd(56)} ${MAP_INFO[f.map].label}`).join('\n');
  const paramLines = Object.entries(r.settings.params)
    .map(([k, v]) => {
      const def = fam.params.find((d) => d.key === k);
      return `  ${(def?.label ?? k).padEnd(28)} ${typeof v === 'number' ? +v.toFixed(4) : String(v)}`;
    })
    .join('\n');
  const tileMeters = 2;
  return `MATERIAL FOUNDRY EXPORT
=======================

Material      : ${r.settings.name}
Family        : ${fam.label}
Preset        : ${r.settings.presetId ?? '(custom)'}
Seed          : ${r.settings.seed}
Resolution    : ${r.size} x ${r.size} px (generated natively at this resolution, not upscaled)
Normal format : ${r.opts.normalConvention === 'opengl' ? 'OpenGL' : 'DirectX'}
Generated     : ${r.generatedAt}

All maps tile seamlessly in both directions. They were generated procedurally from the same
underlying material fields with periodic (toroidal) sampling.

FILES
-----
${fileLines}
  ${'settings.json'.padEnd(56)} Material settings (re-importable into Material Foundry)
  ${'README.txt'.padEnd(56)} This file

MAP DETAILS
-----------
Base Color  : 8-bit sRGB color. Contains no baked lighting, shadows or preview light direction.
Normal      : 8-bit tangent-space normal, ${conv}
              Derived from the height field with periodic central differences.
              Encoding: channel = (n * 0.5 + 0.5) * 255. Treat as non-color (linear) data.
Roughness   : 8-bit grayscale, non-color data. Perceptual roughness (0 smooth .. 1 rough).
Metallic    : 8-bit grayscale, non-color data. 0 = dielectric, 1 = metal.
Height      : ${r.opts.heightBitDepth}-bit grayscale PNG, non-color data. 0 = lowest, ${r.opts.heightBitDepth === 16 ? 65535 : 255} = highest.
              ${r.opts.heightBitDepth === 16 ? 'True 16-bit samples are stored (PNG bit depth 16).' : '8-bit quantized (256 levels); expect stepping with strong displacement.'}
              Relief depth used for the normal map: ${(r.reliefDepth * 100).toFixed(2)}% of the tile width
              (e.g. ${(r.reliefDepth * tileMeters * 100).toFixed(1)} cm for a ${tileMeters} m tile). Use this as a starting
              displacement scale.
AO          : 8-bit grayscale, non-color data. HEIGHT-BASED APPROXIMATION: recesses are darkened
              according to how far they sit below their surroundings at several radii. It is not a
              ray-traced or physically simulated occlusion bake.
${r.hasEmissive ? `Emissive    : 8-bit sRGB color at unit strength. Suggested emission strength: ${r.emissionStrength.toFixed(2)}.
              Emission is present only in the intended regions (cracks / inlays).
` : 'Emissive    : not applicable for this material (no emissive map exported).\n'}${r.files.some((f) => f.map === 'orm') ? `ORM         : Packed 8-bit RGB, non-color data: R = Ambient Occlusion, G = Roughness, B = Metallic.
              Matches glTF / Unreal "ORM" conventions (glTF uses G and B; AO in R).
` : ''}
SUGGESTED PBR CONNECTIONS
-------------------------
Blender (Principled BSDF):
  Base Color  -> Base Color            (Color Space: sRGB)
  Roughness   -> Roughness             (Color Space: Non-Color)
  Metallic    -> Metallic              (Color Space: Non-Color)
  Normal      -> Normal Map node (Tangent Space) -> Normal   (Non-Color, OpenGL export)
  Height      -> Displacement node -> Material Output Displacement (Non-Color)
  Emissive    -> Emission Color, Emission Strength = suggested value above
  AO          -> optional: multiply into Base Color for stylized looks, or use in game engines
Unreal Engine: use the DirectX normal export (or flip green), set Roughness/Metallic/AO/ORM
  textures to "Masks (no sRGB)", Normal to "Normalmap".
Unity (URP/HDRP Lit): OpenGL normals, mark Normal as "Normal map"; Metallic map uses R (metal)
  and A (smoothness = 1 - roughness) - build a mask map if needed.
Godot: OpenGL normals; ORM texture can be used directly with ORMMaterial3D.

PRECISION NOTES
---------------
- All maps are lossless PNG. Color maps are 8-bit per channel.
- Normal map is 8-bit per channel; very gentle slopes are quantized to 1/127 steps.
- Height is ${r.opts.heightBitDepth}-bit as stated above.
- Fine-detail noise octaves are limited by the Nyquist frequency of the export resolution, so
  higher resolutions contain additional fine detail rather than upscaled pixels.

MATERIAL SETTINGS
-----------------
${paramLines}
`;
}

export interface ZipInput {
  settings: MaterialSettings;
  size: number;
  /** Needed only for maps that are not supplied pre-encoded. */
  maps: PackedMaps | null;
  hasEmissive: boolean;
  emissionStrength: number;
  reliefDepth: number;
  opts: ExportOptions;
  includeOrm: boolean;
  /** Pre-encoded PNGs (optional; encoded here when missing). */
  encoded?: Partial<Record<MapId, Uint8Array>>;
}

export function buildZip(z: ZipInput): { name: string; data: Uint8Array; files: string[] } {
  const size = z.size;
  const maps = applicableMaps(z.hasEmissive, z.includeOrm);
  const files: Record<string, Uint8Array> = {};
  const list: { map: MapId; name: string }[] = [];
  for (const map of maps) {
    const name = mapFileName(z.settings, map, size, z.opts);
    const pre = z.encoded?.[map];
    if (pre) files[name] = pre;
    else if (z.maps) files[name] = encodeMap(z.maps, map, z.opts);
    else throw new Error(`Missing encoded data for ${map}`);
    list.push({ map, name });
  }
  const enc = new TextEncoder();
  files['settings.json'] = enc.encode(
    serializeSettings(z.settings, { resolution: size, normalConvention: z.opts.normalConvention, heightBitDepth: z.opts.heightBitDepth }),
  );
  files['README.txt'] = enc.encode(
    buildReadme({
      settings: z.settings,
      size,
      files: list,
      opts: z.opts,
      hasEmissive: z.hasEmissive,
      emissionStrength: z.emissionStrength,
      reliefDepth: z.reliefDepth,
      generatedAt: new Date().toISOString(),
    }),
  );
  // PNGs are already deflate-compressed; store them without recompression.
  const zipInput: Record<string, [Uint8Array, { level: 0 | 6 }]> = {};
  for (const [k, v] of Object.entries(files)) zipInput[k] = [v, { level: k.endsWith('.png') ? 0 : 6 }];
  const data = zipSync(zipInput);
  return { name: `${fileBase(z.settings)}_${size}.zip`, data, files: Object.keys(files) };
}
