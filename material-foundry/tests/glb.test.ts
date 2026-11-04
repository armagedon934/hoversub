import { describe, expect, it } from 'vitest';
import { generateMaterial } from '../src/engine/generate';
import { PRESETS } from '../src/engine/presets';
import { encodeMap, type ExportOptions } from '../src/export/exporter';
import { buildGlb, readGlbJson } from '../src/export/glb';
import { joinParts } from '../src/export/png';
import { buildModelMeshes } from '../src/preview/modelExport';
import { settingsFromPreset } from '../src/state/store';
import { decodePng } from './helpers';

const opts: ExportOptions = { normalConvention: 'opengl', heightBitDepth: 16, normalBitDepth: 8 };

function glbFor(presetId: string, shape: 'sphere' | 'wall' | 'floor' | 'block' | 'scene', bake = false) {
  const g = generateMaterial({ size: 64, settings: settingsFromPreset(PRESETS.find((p) => p.id === presetId)!) });
  const img = (m: 'basecolor' | 'normal' | 'orm' | 'emissive') => {
    const png = encodeMap(g.maps, m, opts);
    return { parts: [png], length: png.length };
  };
  const meshes = buildModelMeshes({ shape, tileSize: 2, displacement: bake ? { height: { size: 64, data: g.maps.height16 }, metres: 0.05 } : undefined });
  const glb = buildGlb(meshes, { name: g.settings.name, baseColor: img('basecolor'), normal: img('normal'), orm: img('orm'), emissive: g.hasEmissive ? img('emissive') : null, emissiveStrength: g.emissionStrength });
  return { g, meshes, bytes: joinParts(glb.parts, glb.length) };
}

describe('GLB model export', () => {
  it('writes valid glTF 2.0 binaries for every preview object', () => {
    for (const shape of ['sphere', 'wall', 'floor', 'block', 'scene'] as const) {
      const { bytes, meshes } = glbFor('castle_ashlar', shape);
      const { json, binOffset, binLength } = readGlbJson(bytes);
      expect(bytes.length % 4).toBe(0);
      expect(binOffset + binLength).toBe(bytes.length);
      const j = json as any;
      expect(j.asset.version).toBe('2.0');
      expect(j.meshes).toHaveLength(meshes.length);
      expect(j.nodes).toHaveLength(meshes.length);
      for (const v of j.bufferViews) {
        expect(v.byteOffset % 4).toBe(0);
        expect(v.byteOffset + v.byteLength).toBeLessThanOrEqual(binLength);
      }
      for (const m of j.meshes) {
        const prim = m.primitives[0];
        const pos = j.accessors[prim.attributes.POSITION];
        const nrm = j.accessors[prim.attributes.NORMAL];
        const uv = j.accessors[prim.attributes.TEXCOORD_0];
        const idx = j.accessors[prim.indices];
        expect(pos.count).toBe(nrm.count);
        expect(pos.count).toBe(uv.count);
        expect(pos.min).toHaveLength(3);
        expect(idx.componentType).toBe(5125);
        expect(idx.count % 3).toBe(0);
        // Indices stay within the vertex range.
        const view = j.bufferViews[idx.bufferView];
        const ind = new Uint32Array(bytes.slice(binOffset + view.byteOffset, binOffset + view.byteOffset + view.byteLength).buffer);
        expect(Math.max(...ind)).toBeLessThan(pos.count);
      }
      // Material uses ORM for both occlusion (R) and metallic-roughness (G, B).
      const mat = j.materials[0];
      expect(mat.pbrMetallicRoughness.metallicRoughnessTexture.index).toBe(mat.occlusionTexture.index);
      expect(j.samplers[0].wrapS).toBe(10497);
    }
  });

  it('embeds the exported PNG textures byte for byte and adds emissive strength when needed', () => {
    const { bytes, g } = glbFor('molten_crust', 'block');
    const { json, binOffset } = readGlbJson(bytes);
    const j = json as any;
    expect(j.images).toHaveLength(4);
    const base = j.bufferViews[j.images[0].bufferView];
    const png = bytes.slice(binOffset + base.byteOffset, binOffset + base.byteOffset + base.byteLength);
    expect(Buffer.from(png).equals(Buffer.from(encodeMap(g.maps, 'basecolor', opts)))).toBe(true);
    expect(decodePng(png).width).toBe(64);
    expect(j.extensionsUsed).toContain('KHR_materials_emissive_strength');
    expect(j.materials[0].extensions.KHR_materials_emissive_strength.emissiveStrength).toBe(g.emissionStrength);
  });

  it('converts UVs to glTF orientation and keeps tile size in metres', () => {
    const meshes = buildModelMeshes({ shape: 'wall', tileSize: 2 });
    const uv = meshes[0].uvs;
    // Wall is 4 m x 3 m with 2 m tiles: u spans 2 tiles, v spans 1.5 tiles (glTF v = 1 - v_three).
    let umin = Infinity;
    let umax = -Infinity;
    let vmin = Infinity;
    let vmax = -Infinity;
    for (let i = 0; i < uv.length; i += 2) {
      umin = Math.min(umin, uv[i]);
      umax = Math.max(umax, uv[i]);
      vmin = Math.min(vmin, uv[i + 1]);
      vmax = Math.max(vmax, uv[i + 1]);
    }
    expect(umax - umin).toBeCloseTo(2, 6);
    expect(vmax - vmin).toBeCloseTo(1.5, 6);
    expect(vmax).toBeCloseTo(1, 6);
  });

  it('baking displacement produces a high-poly mesh with real relief', () => {
    const flat = buildModelMeshes({ shape: 'wall', tileSize: 2 })[0];
    const { meshes } = glbFor('castle_ashlar', 'wall', true);
    const disp = meshes[0];
    expect(disp.indices.length / 3).toBeGreaterThan(100000);
    expect(flat.indices.length / 3).toBe(2);
    let zmin = Infinity;
    let zmax = -Infinity;
    for (let i = 2; i < disp.positions.length; i += 3) {
      zmin = Math.min(zmin, disp.positions[i]);
      zmax = Math.max(zmax, disp.positions[i]);
    }
    expect(zmax - zmin).toBeGreaterThan(0.01);
    expect(zmax - zmin).toBeLessThanOrEqual(0.05 + 1e-6);
  });
});
