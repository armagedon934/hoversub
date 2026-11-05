import { describe, expect, it } from 'vitest';
import { computeAO, computeNormals, convertNormalConvention, packMaps } from '../src/engine/maps';

function field(N: number, f: (u: number, v: number) => number): Float32Array {
  const h = new Float32Array(N * N);
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) h[y * N + x] = f((x + 0.5) / N, 1 - (y + 0.5) / N);
  return h;
}

describe('normal map derivation', () => {
  const N = 64;
  it('a flat field gives neutral normals (0, 0, 1) -> (128, 128, 255)', () => {
    const n = computeNormals(new Float32Array(N * N).fill(0.4), N, 0.03, 1);
    for (let i = 0; i < N * N; i++) {
      expect(n[i * 3]).toBeCloseTo(0, 6);
      expect(n[i * 3 + 1]).toBeCloseTo(0, 6);
      expect(n[i * 3 + 2]).toBe(1);
    }
    const packed = packMaps(N, new Float32Array(N * N * 3), n, new Float32Array(N * N), new Float32Array(N * N), new Float32Array(N * N), new Float32Array(N * N), null);
    expect([packed.normal[0], packed.normal[1], packed.normal[2]]).toEqual([128, 128, 255]);
  });

  it('a known slope produces the predicted normal direction and magnitude', () => {
    // h = 0.5 + 0.25 sin(2πu): slope along +u is maximal at u = 0 (rising to the right).
    const depth = 0.02;
    const h = field(N, (u) => 0.5 + 0.25 * Math.sin(2 * Math.PI * u));
    const n = computeNormals(h, N, depth, 1);
    const x = 0; // u = 0.5 / N, slope ≈ 0.25 * 2π
    const y = N / 2;
    const i = (y * N + x) * 3;
    // Expected: n ∝ (-dh/du * depth, 0, 1) using the periodic central difference.
    const dhdu = ((0.25 * (Math.sin(2 * Math.PI * (1.5 / N)) - Math.sin(2 * Math.PI * (-0.5 / N)))) * N) / 2;
    const nx = -dhdu * depth;
    const len = Math.hypot(nx, 1);
    expect(n[i]).toBeCloseTo(nx / len, 6);
    expect(n[i]).toBeLessThan(0); // surface rising to the right faces left
    expect(n[i + 1]).toBeCloseTo(0, 6);
    expect(Math.hypot(n[i], n[i + 1], n[i + 2])).toBeCloseTo(1, 6);
  });

  it('height rising toward the top of the image tilts normals toward -V (OpenGL green < 128)', () => {
    const h = field(N, (_u, v) => 0.5 + 0.25 * Math.sin(2 * Math.PI * v));
    const n = computeNormals(h, N, 0.05, 1);
    // v ≈ 0 corresponds to the bottom row; slope dh/dv > 0 there.
    const y = N - 1;
    const i = (y * N + 10) * 3;
    expect(n[i + 1]).toBeLessThan(-0.05);
    expect(Math.abs(n[i])).toBeLessThan(1e-9);
  });

  it('all normals are unit length; the OpenGL/DirectX switch only inverts green', () => {
    const h = field(N, (u, v) => 0.5 + 0.2 * Math.sin(2 * Math.PI * u * 3) * Math.cos(2 * Math.PI * v * 2));
    const n = computeNormals(h, N, 0.04, 1.5);
    for (let i = 0; i < N * N; i++) expect(Math.hypot(n[i * 3], n[i * 3 + 1], n[i * 3 + 2])).toBeCloseTo(1, 6);
    const p = packMaps(N, new Float32Array(N * N * 3), n, new Float32Array(N * N), new Float32Array(N * N), new Float32Array(N * N), h, null);
    const dx = convertNormalConvention(p.normal, 'directx');
    for (let i = 0; i < N * N; i++) {
      expect(dx[i * 4]).toBe(p.normal[i * 4]);
      expect(dx[i * 4 + 1]).toBe(255 - p.normal[i * 4 + 1]);
      expect(dx[i * 4 + 2]).toBe(p.normal[i * 4 + 2]);
      // Decoded 8-bit normals stay close to unit length.
      const d = [0, 1, 2].map((c) => p.normal[i * 4 + c] / 127.5 - 1);
      expect(Math.hypot(d[0], d[1], d[2])).toBeGreaterThan(0.98);
      expect(Math.hypot(d[0], d[1], d[2])).toBeLessThan(1.02);
    }
    expect(convertNormalConvention(p.normal, 'opengl')).toBe(p.normal);
  });

  it('normal derivatives wrap around the texture edges consistently', () => {
    const h = field(N, (u, v) => 0.5 + 0.2 * Math.sin(2 * Math.PI * (u + 2 * v)));
    const n = computeNormals(h, N, 0.04, 1);
    // Analytic normal for the periodic field vs computed normal on the border column/row.
    for (const [x, y] of [
      [0, 5],
      [N - 1, 9],
      [7, 0],
      [3, N - 1],
    ]) {
      const i = (y * N + x) * 3;
      const ix = (y * N + ((x + 1) % N)) * 3;
      expect(Math.abs(n[i] - n[ix])).toBeLessThan(0.15);
    }
  });
});

describe('derived maps commute with rolling the texture (no seams from derivation)', () => {
  it('normals and AO of a rolled height field equal the rolled normals and AO', () => {
    const N = 48;
    const h = field(N, (u, v) => 0.5 + 0.3 * Math.sin(2 * Math.PI * (2 * u + v)) * Math.cos(2 * Math.PI * 3 * v));
    const sx = 17;
    const sy = 29;
    const rolled = new Float32Array(N * N);
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) rolled[y * N + x] = h[((y + sy) % N) * N + ((x + sx) % N)];
    const n1 = computeNormals(h, N, 0.03, 1);
    const n2 = computeNormals(rolled, N, 0.03, 1);
    const a1 = computeAO(h, N, 0.03, 1);
    const a2 = computeAO(rolled, N, 0.03, 1);
    for (let y = 0; y < N; y++)
      for (let x = 0; x < N; x++) {
        const i = y * N + x;
        const j = ((y + sy) % N) * N + ((x + sx) % N);
        for (let c = 0; c < 3; c++) expect(n2[i * 3 + c]).toBeCloseTo(n1[j * 3 + c], 6);
        expect(a2[i]).toBeCloseTo(a1[j], 5);
      }
  });
});

describe('height-based AO approximation', () => {
  it('is 1 on a flat field and darkens recesses but not peaks', () => {
    const N = 64;
    const flat = computeAO(new Float32Array(N * N).fill(0.5), N, 0.03, 1);
    expect(Math.min(...flat)).toBeCloseTo(1, 6);
    const h = new Float32Array(N * N).fill(0.8);
    for (let y = 30; y < 34; y++) for (let x = 0; x < N; x++) h[y * N + x] = 0.1; // groove
    const ao = computeAO(h, N, 0.03, 1);
    expect(ao[32 * N + 10]).toBeLessThan(0.9);
    expect(ao[10 * N + 10]).toBeGreaterThan(0.97);
  });
});
