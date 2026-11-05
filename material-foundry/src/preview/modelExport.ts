// Turns the procedural preview objects into glTF meshes: same geometry and metre-based UVs as the
// 3D preview, converted to glTF's texture orientation, optionally with the height map baked into
// the vertices as real geometric relief.

import * as THREE from 'three';
import type { GlbMesh } from '../export/glb';
import type { PreviewShape } from '../state/persistence';
import { applyTileSize, blockSpec, floorSpec, sceneSpecs, sphereSpec, wallSpec, SPHERE_RADIUS, type PreviewMeshSpec } from './geometry';

export interface HeightGrid {
  size: number;
  /** 16-bit height, row 0 = top of the texture image. */
  data: Uint16Array;
}

export interface ModelOptions {
  shape: PreviewShape;
  tileSize: number;
  /** When set, vertices are displaced along their normals by the height map (high-poly mesh). */
  displacement?: { height: HeightGrid; metres: number };
}

function specsFor(shape: PreviewShape, detail: boolean): PreviewMeshSpec[] {
  switch (shape) {
    case 'sphere':
      return [{ ...sphereSpec(detail), position: [0, SPHERE_RADIUS, 0] }];
    case 'wall':
      return [wallSpec(detail)];
    case 'floor':
      return [floorSpec(detail)];
    case 'block':
      return [blockSpec(detail)];
    case 'scene':
      return sceneSpecs(detail);
  }
}

/** Periodic bilinear sample of the height grid at three.js UV (v = 0 at the image bottom). */
function sampleHeight(g: HeightGrid, u: number, v: number): number {
  const N = g.size;
  const fx = (u - Math.floor(u)) * N - 0.5;
  const fy = (1 - (v - Math.floor(v))) * N - 0.5;
  const x0 = Math.floor(fx);
  const y0 = Math.floor(fy);
  const tx = fx - x0;
  const ty = fy - y0;
  const xa = ((x0 % N) + N) % N;
  const xb = (xa + 1) % N;
  const ya = ((y0 % N) + N) % N;
  const yb = (ya + 1) % N;
  const d = g.data;
  const a = d[ya * N + xa] + (d[ya * N + xb] - d[ya * N + xa]) * tx;
  const b = d[yb * N + xa] + (d[yb * N + xb] - d[yb * N + xa]) * tx;
  return (a + (b - a) * ty) / 65535;
}

export function buildModelMeshes(o: ModelOptions): GlbMesh[] {
  const specs = specsFor(o.shape, !!o.displacement);
  const names = ['floor', 'back_wall', 'side_wall', 'crate', 'low_block', 'column'];
  return specs.map((spec, k) => {
    let g = spec.geometry;
    applyTileSize(g, o.tileSize, spec.wrapU);
    if (!g.getIndex()) {
      const n = g.getAttribute('position').count;
      g.setIndex(Array.from({ length: n }, (_, i) => i));
    }
    if (o.displacement) {
      // Same mapping as the preview material: offset = h * metres + bias, bias = -0.6 * metres.
      const pos = g.getAttribute('position') as THREE.BufferAttribute;
      const nrm = g.getAttribute('normal') as THREE.BufferAttribute;
      const uv = g.getAttribute('uv') as THREE.BufferAttribute;
      const m = o.displacement.metres;
      for (let i = 0; i < pos.count; i++) {
        const off = sampleHeight(o.displacement.height, uv.getX(i), uv.getY(i)) * m - 0.6 * m;
        pos.setXYZ(i, pos.getX(i) + nrm.getX(i) * off, pos.getY(i) + nrm.getY(i) * off, pos.getZ(i) + nrm.getZ(i) * off);
      }
      g = g.clone();
      g.computeVertexNormals();
    }
    const pos = g.getAttribute('position') as THREE.BufferAttribute;
    const nrm = g.getAttribute('normal') as THREE.BufferAttribute;
    const uv = g.getAttribute('uv') as THREE.BufferAttribute;
    const uvs = new Float32Array(uv.count * 2);
    for (let i = 0; i < uv.count; i++) {
      uvs[i * 2] = uv.getX(i);
      uvs[i * 2 + 1] = 1 - uv.getY(i); // glTF: v = 0 at the top of the image
    }
    const mesh: GlbMesh = {
      name: specs.length > 1 ? names[k] ?? `part_${k}` : o.shape,
      positions: new Float32Array(pos.array as ArrayLike<number>),
      normals: new Float32Array(nrm.array as ArrayLike<number>),
      uvs,
      indices: new Uint32Array(g.getIndex()!.array as ArrayLike<number>),
    };
    if (spec.position) mesh.translation = [...spec.position];
    if (spec.rotation) {
      const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(...spec.rotation));
      mesh.rotation = [q.x, q.y, q.z, q.w];
    }
    spec.geometry.dispose();
    g.dispose();
    return mesh;
  });
}
