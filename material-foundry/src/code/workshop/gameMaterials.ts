// Materials for the 3D games, made by the program's own texture generator (offline, in the
// background workers): any of the studio presets, or the material you are making in the studio
// right now ("studio"). Each becomes three.js textures: colour, normal (relief), roughness, metal.

import * as THREE from 'three';
import { getFamily, defaultParams } from '../../engine/registry';
import { PRESETS, getPreset } from '../../engine/presets';
import type { MaterialSettings } from '../../engine/types';
import { loadCurrent } from '../../state/persistence';
import { generateThumbnail } from '../../worker/client';
import { JobToken, Priority } from '../../worker/pool';

export interface GameMaterial {
  map: THREE.DataTexture;
  normalMap: THREE.DataTexture;
  roughnessMap: THREE.DataTexture;
  metalnessMap: THREE.DataTexture;
  /** Average colour (for the picker). */
  swatch: string;
}

export const STUDIO_ID = 'studio';

/** Every material the games can use: the presets plus "the one in my studio". */
export function materialChoices(): { id: string; name: string; family: string }[] {
  const out = PRESETS.map((p) => ({ id: p.id, name: p.name, family: p.family }));
  const cur = loadCurrent();
  if (cur) out.unshift({ id: STUDIO_ID, name: `★ ${cur.name}`, family: cur.family });
  return out;
}

function settingsOf(id: string): MaterialSettings | null {
  if (id === STUDIO_ID) return loadCurrent();
  const p = getPreset(id);
  if (!p) return null;
  return { family: p.family, presetId: p.id, name: p.name, seed: p.seed, params: { ...defaultParams(getFamily(p.family)), ...p.params } };
}

const cache = new Map<string, Promise<GameMaterial | null>>();

function tex(data: Uint8Array | Uint8ClampedArray, size: number, srgb: boolean): THREE.DataTexture {
  const t = new THREE.DataTexture(new Uint8Array(data.buffer, data.byteOffset, data.byteLength), size, size, THREE.RGBAFormat);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  t.magFilter = THREE.LinearFilter;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  t.generateMipmaps = true;
  t.anisotropy = 4;
  t.needsUpdate = true;
  return t;
}

/** Generates (once) and returns the textures of a material. */
export function loadGameMaterial(id: string): Promise<GameMaterial | null> {
  const key = id === STUDIO_ID ? `${id}:${JSON.stringify(loadCurrent())}` : id;
  let p = cache.get(key);
  if (!p) {
    p = (async () => {
      const settings = settingsOf(id);
      if (!settings) return null;
      const { material } = await generateThumbnail(settings, 256, new JobToken(), Priority.Interactive);
      const m = material.maps;
      const n = m.size * m.size;
      // roughness in the green channel, metal in the blue channel (how three.js reads them)
      const rough = new Uint8Array(n * 4);
      const metal = new Uint8Array(n * 4);
      let r = 0;
      let g = 0;
      let b = 0;
      for (let i = 0; i < n; i++) {
        rough[i * 4 + 1] = m.roughness[i];
        rough[i * 4 + 3] = 255;
        metal[i * 4 + 2] = m.metallic[i];
        metal[i * 4 + 3] = 255;
        r += m.baseColor[i * 4];
        g += m.baseColor[i * 4 + 1];
        b += m.baseColor[i * 4 + 2];
      }
      const hex = (x: number) => Math.round(x / n).toString(16).padStart(2, '0');
      return {
        map: tex(m.baseColor, m.size, true),
        normalMap: tex(m.normal, m.size, false),
        roughnessMap: tex(rough, m.size, false),
        metalnessMap: tex(metal, m.size, false),
        swatch: `#${hex(r)}${hex(g)}${hex(b)}`,
      };
    })().catch(() => null);
    cache.set(key, p);
  }
  return p;
}
