// Procedural preview geometry. Every mesh stores its texture coordinates in metres
// ("uvMeters"); the renderer converts them to texture-tile units for the chosen tile size,
// snapping closed surfaces (sphere, column) to a whole number of tiles around so the
// procedural tiling stays continuous across the mesh's own UV seam.

import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';

export interface PreviewMeshSpec {
  geometry: THREE.BufferGeometry;
  /** Closed surface wrapping in U: the U extent (metres) that must hold a whole number of tiles. */
  wrapU?: number;
  castShadow?: boolean;
  receiveShadow?: boolean;
  position?: [number, number, number];
  rotation?: [number, number, number];
}

function setMetersUV(g: THREE.BufferGeometry, su: number, sv: number): THREE.BufferGeometry {
  const uv = g.getAttribute('uv') as THREE.BufferAttribute;
  const arr = new Float32Array(uv.count * 2);
  for (let i = 0; i < uv.count; i++) {
    arr[i * 2] = uv.getX(i) * su;
    arr[i * 2 + 1] = uv.getY(i) * sv;
  }
  g.setAttribute('uvMeters', new THREE.BufferAttribute(arr, 2));
  return g;
}

export const SPHERE_RADIUS = 1;
export const WALL_SIZE: [number, number] = [4, 3];
export const FLOOR_SIZE = 8;
export const BLOCK_SIZE = 1.2;
export const SCENE_ROOM: [number, number, number] = [6, 3, 6];

export function sphereSpec(detail: boolean): PreviewMeshSpec {
  const g = new THREE.SphereGeometry(SPHERE_RADIUS, detail ? 384 : 128, detail ? 192 : 64);
  const circ = 2 * Math.PI * SPHERE_RADIUS;
  setMetersUV(g, circ, Math.PI * SPHERE_RADIUS);
  return { geometry: g, wrapU: circ, castShadow: true };
}

export function wallSpec(detail: boolean): PreviewMeshSpec {
  const [w, h] = WALL_SIZE;
  const g = new THREE.PlaneGeometry(w, h, detail ? 400 : 1, detail ? 300 : 1);
  setMetersUV(g, w, h);
  return { geometry: g, receiveShadow: true, position: [0, h / 2, 0] };
}

export function floorSpec(detail: boolean): PreviewMeshSpec {
  const g = new THREE.PlaneGeometry(FLOOR_SIZE, FLOOR_SIZE, detail ? 400 : 1, detail ? 400 : 1);
  setMetersUV(g, FLOOR_SIZE, FLOOR_SIZE);
  return { geometry: g, receiveShadow: true, rotation: [-Math.PI / 2, 0, 0] };
}

/** Rounded (bevelled) block with per-face UVs scaled to metres. */
export function blockGeometry(w: number, h: number, d: number, detail: boolean, radius = 0.06): THREE.BufferGeometry {
  const g = new RoundedBoxGeometry(w, h, d, detail ? 48 : 6, radius);
  const uv = g.getAttribute('uv') as THREE.BufferAttribute;
  const nrm = g.getAttribute('normal') as THREE.BufferAttribute;
  const pos = g.getAttribute('position') as THREE.BufferAttribute;
  const arr = new Float32Array(uv.count * 2);
  // RoundedBoxGeometry is built from BoxGeometry; its groups follow the box face order
  // (+x, -x, +y, -y, +z, -z). Scale each face's 0..1 UVs by that face's size in metres.
  const dims: [number, number][] = [
    [d, h],
    [d, h],
    [w, d],
    [w, d],
    [w, h],
    [w, h],
  ];
  const index = g.getIndex();
  const faceOf = new Int8Array(uv.count).fill(-1);
  if (index && g.groups.length === 6) {
    g.groups.forEach((grp, k) => {
      for (let i = grp.start; i < grp.start + grp.count; i++) faceOf[index.getX(i)] = k;
    });
  }
  for (let i = 0; i < uv.count; i++) {
    let k = faceOf[i];
    if (k < 0) {
      // Fallback: classify by dominant normal axis.
      const ax = Math.abs(nrm.getX(i));
      const ay = Math.abs(nrm.getY(i));
      const az = Math.abs(nrm.getZ(i));
      k = ax >= ay && ax >= az ? (pos.getX(i) > 0 ? 0 : 1) : ay >= az ? (pos.getY(i) > 0 ? 2 : 3) : pos.getZ(i) > 0 ? 4 : 5;
    }
    arr[i * 2] = uv.getX(i) * dims[k][0];
    arr[i * 2 + 1] = uv.getY(i) * dims[k][1];
  }
  g.setAttribute('uvMeters', new THREE.BufferAttribute(arr, 2));
  return g;
}

export function blockSpec(detail: boolean): PreviewMeshSpec {
  return { geometry: blockGeometry(BLOCK_SIZE, BLOCK_SIZE, BLOCK_SIZE, detail), castShadow: true, receiveShadow: true, position: [0, BLOCK_SIZE / 2, 0] };
}

export function columnGeometry(radius: number, height: number, detail: boolean): THREE.BufferGeometry {
  const g = new THREE.CylinderGeometry(radius, radius, height, detail ? 256 : 64, detail ? 128 : 1, true);
  setMetersUV(g, 2 * Math.PI * radius, height);
  return g;
}

/** Wall-and-floor corner with a crate-like block, a short block and a column. */
export function sceneSpecs(detail: boolean): PreviewMeshSpec[] {
  const [w, h, d] = SCENE_ROOM;
  const floor = new THREE.PlaneGeometry(w, d, detail ? 300 : 1, detail ? 300 : 1);
  setMetersUV(floor, w, d);
  const back = new THREE.PlaneGeometry(w, h, detail ? 300 : 1, detail ? 150 : 1);
  setMetersUV(back, w, h);
  const side = new THREE.PlaneGeometry(d, h, detail ? 300 : 1, detail ? 150 : 1);
  setMetersUV(side, d, h);
  const colR = 0.28;
  const colH = h;
  return [
    { geometry: floor, receiveShadow: true, rotation: [-Math.PI / 2, 0, 0], position: [0, 0, 0] },
    { geometry: back, receiveShadow: true, position: [0, h / 2, -d / 2] },
    { geometry: side, receiveShadow: true, position: [-w / 2, h / 2, 0], rotation: [0, Math.PI / 2, 0] },
    { geometry: blockGeometry(1, 1, 1, detail, 0.05), castShadow: true, receiveShadow: true, position: [-0.9, 0.5, -1.1], rotation: [0, 0.35, 0] },
    { geometry: blockGeometry(0.7, 0.45, 0.7, detail, 0.04), castShadow: true, receiveShadow: true, position: [0.25, 0.225, -0.2], rotation: [0, -0.25, 0] },
    { geometry: columnGeometry(colR, colH, detail), wrapU: 2 * Math.PI * colR, castShadow: true, receiveShadow: true, position: [1.6, colH / 2, -1.9] },
  ];
}

/** Write the `uv` attribute from `uvMeters` for a given tile size. */
export function applyTileSize(g: THREE.BufferGeometry, tileSize: number, wrapU?: number): void {
  const m = g.getAttribute('uvMeters') as THREE.BufferAttribute | undefined;
  if (!m) return;
  let su = 1 / tileSize;
  const sv = 1 / tileSize;
  if (wrapU) {
    const tiles = Math.max(1, Math.round(wrapU / tileSize));
    su = tiles / wrapU;
  }
  const uv = g.getAttribute('uv') as THREE.BufferAttribute;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, m.getX(i) * su, m.getY(i) * sv);
  uv.needsUpdate = true;
}

/** A 1 m reference ruler with 10 cm alternating segments. */
export function makeRuler(): THREE.Group {
  const grp = new THREE.Group();
  const geo = new THREE.BoxGeometry(0.1, 0.02, 0.04);
  const light = new THREE.MeshBasicMaterial({ color: 0xe8e8e8 });
  const dark = new THREE.MeshBasicMaterial({ color: 0x1c1c1c });
  for (let i = 0; i < 10; i++) {
    const m = new THREE.Mesh(geo, i % 2 === 0 ? light : dark);
    m.position.set(-0.45 + i * 0.1, 0, 0);
    grp.add(m);
  }
  grp.name = 'ruler';
  return grp;
}
