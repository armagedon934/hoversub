// Draws a Mini-Unity 3D world with three.js: soft light and fog, walls and crates with a light
// grain, round targets, glowing goal circles, people made of boxes (each body part follows its
// "bone"), the weapon in your hands, tracers, sparks and a muzzle flash. Unity is left-handed
// (z forward), three.js is right-handed (z towards you): positions flip z, rotations flip x and y.

import * as THREE from 'three';
import type { Obj3, World3D } from '../run/unity3d';

const toPos = (o: { x: number; y: number; z: number }, out: THREE.Vector3) => out.set(o.x, o.y, -o.z);
const toQuat = (q: { x: number; y: number; z: number; w: number }, out: THREE.Quaternion) => out.set(-q.x, -q.y, q.z, q.w);

/** A small grey noise texture: gives walls, crates and the floor a calm, non-plastic look. */
function grainTexture(kind: 'grain' | 'planks' | 'tiles'): THREE.CanvasTexture {
  const S = 256;
  const c = document.createElement('canvas');
  c.width = c.height = S;
  const g = c.getContext('2d')!;
  g.fillStyle = '#ffffff';
  g.fillRect(0, 0, S, S);
  let seed = kind === 'grain' ? 7 : kind === 'planks' ? 11 : 13;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  // soft large blotches + fine grain: looks like plaster / sand / wood, never like noise TV
  for (let i = 0; i < 40; i++) {
    const v = 236 + Math.floor(rnd() * 16);
    g.fillStyle = `rgba(${v},${v},${v},0.5)`;
    g.beginPath();
    g.arc(rnd() * S, rnd() * S, 12 + rnd() * 40, 0, Math.PI * 2);
    g.fill();
  }
  for (let i = 0; i < 9000; i++) {
    const v = 232 + Math.floor(rnd() * 23);
    g.fillStyle = `rgb(${v},${v},${v})`;
    g.fillRect(Math.floor(rnd() * S), Math.floor(rnd() * S), 1, 1);
  }
  if (kind === 'planks') {
    for (let y = 0; y < S; y += 64) {
      g.fillStyle = 'rgba(0,0,0,0.05)';
      for (let k = 0; k < 6; k++) g.fillRect(0, y + 8 + k * 9 + rnd() * 3, S, 1);
      g.fillStyle = 'rgba(0,0,0,0.16)';
      g.fillRect(0, y, S, 2);
    }
    g.strokeStyle = 'rgba(0,0,0,0.18)';
    g.lineWidth = 4;
    g.strokeRect(2, 2, S - 4, S - 4);
  }
  if (kind === 'tiles') {
    g.fillStyle = 'rgba(0,0,0,0.05)';
    for (let k = 0; k < S; k += 128) {
      g.fillRect(k, 0, 1, S);
      g.fillRect(0, k, S, 1);
    }
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

function ringsTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d')!;
  const cols = ['#ffffff', '#e6e6e6', '#ffffff', '#e6e6e6', '#ffffff'];
  for (let i = 0; i < 5; i++) {
    g.fillStyle = cols[i];
    g.beginPath();
    g.arc(64, 64, 64 - i * 12, 0, Math.PI * 2);
    g.fill();
  }
  g.fillStyle = '#333';
  g.beginPath();
  g.arc(64, 64, 8, 0, Math.PI * 2);
  g.fill();
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export interface VisionLabel {
  /** Position on the screen, 0…1. */
  x: number;
  y: number;
  state: string;
  name: string;
  reactLeft: number;
  aimErr: number;
}

const STATE_COLOR: Record<string, number[]> = { patrol: [0.35, 0.9, 0.45], react: [1, 0.85, 0.2], attack: [1, 0.3, 0.25], search: [0.35, 0.65, 1], chase: [0.35, 0.65, 1] };

interface Entry {
  obj: Obj3;
  node: THREE.Object3D;
  mats: THREE.MeshStandardMaterial[];
  color: string;
  emissive: boolean;
}

export class Scene3D {
  readonly renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(70, 1, 0.03, 400);
  private hemi = new THREE.HemisphereLight(0xffffff, 0x8a8577, 1.1);
  private sun = new THREE.DirectionalLight(0xfff3e0, 1.6);
  private flash = new THREE.PointLight(0xffd29a, 0, 6, 2);
  private floor?: THREE.Mesh;
  private entries = new Map<number, Entry>();
  private world: World3D | null = null;
  private tex = { grain: null as THREE.CanvasTexture | null, planks: null as THREE.CanvasTexture | null, tiles: null as THREE.CanvasTexture | null, rings: null as THREE.CanvasTexture | null };
  private lines: THREE.LineSegments;
  private lineGeo = new THREE.BufferGeometry();
  private sparks: THREE.Points;
  private sparkGeo = new THREE.BufferGeometry();
  private fog = new THREE.FogExp2(0xdde1e6, 0.03);
  private power = 1;
  private baseFog = 0.03;
  private tmpV = new THREE.Vector3();
  private sky = new THREE.Color('#dde1e6');

  constructor(canvas: HTMLCanvasElement) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.0;
    this.scene.fog = this.fog;
    this.sun.position.set(18, 30, 10);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    const sc = this.sun.shadow.camera;
    sc.left = sc.bottom = -36;
    sc.right = sc.top = 36;
    sc.near = 1;
    sc.far = 90;
    this.sun.shadow.bias = -0.0004;
    this.sun.shadow.normalBias = 0.03;
    this.scene.add(this.hemi, this.sun, this.sun.target, this.flash, this.camera);
    this.lineGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(600 * 6), 3));
    this.lineGeo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(600 * 6), 3));
    this.lines = new THREE.LineSegments(this.lineGeo, new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.9, fog: false }));
    this.lines.frustumCulled = false;
    this.scene.add(this.lines);
    this.sparkGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(64 * 3), 3));
    this.sparks = new THREE.Points(this.sparkGeo, new THREE.PointsMaterial({ color: 0xffe2a8, size: 0.09, sizeAttenuation: true, transparent: true, opacity: 0.95, fog: false }));
    this.sparks.frustumCulled = false;
    this.scene.add(this.sparks);
  }

  private texture(kind: 'grain' | 'planks' | 'tiles' | 'rings'): THREE.CanvasTexture {
    const t = this.tex[kind] ?? (kind === 'rings' ? ringsTexture() : grainTexture(kind));
    this.tex[kind] = t;
    return t;
  }

  /** 0 = suit offline (thick soft fog, dim), 1 = everything on. */
  setPower(p: number): void {
    this.power = Math.max(0, Math.min(1, p));
  }

  /** Builds the meshes of a (new) world. */
  setWorld(w: World3D): void {
    this.clear();
    this.world = w;
    const L = w.level;
    this.sky.set(L.sky ?? '#dde1e6');
    this.scene.background = this.sky;
    this.fog.color.copy(this.sky);
    this.baseFog = L.fog ?? 0.02;
    const fs = L.floor?.size ?? 80;
    const ft = this.texture('tiles').clone();
    ft.needsUpdate = true;
    ft.repeat.set(fs / 4, fs / 4);
    const floorMat = new THREE.MeshStandardMaterial({ color: L.floor?.color ?? '#c9ced6', map: ft, roughness: 0.95 });
    this.floor = new THREE.Mesh(new THREE.PlaneGeometry(fs, fs), floorMat);
    this.floor.rotation.x = -Math.PI / 2;
    this.floor.receiveShadow = true;
    this.scene.add(this.floor);
    for (const o of w.objects) this.ensure(o);
  }

  private clear(): void {
    for (const e of this.entries.values()) {
      this.scene.remove(e.node);
      e.node.traverse((n) => {
        const m = n as THREE.Mesh;
        if (m.isMesh) {
          m.geometry.dispose();
          for (const mat of [m.material].flat()) {
            const mm = mat as THREE.MeshStandardMaterial;
            if (mm.map && !Object.values(this.tex).includes(mm.map as THREE.CanvasTexture)) mm.map.dispose();
            mm.dispose();
          }
        }
      });
    }
    this.entries.clear();
    if (this.floor) {
      this.scene.remove(this.floor);
      this.floor.geometry.dispose();
      const fm = this.floor.material as THREE.MeshStandardMaterial;
      fm.map?.dispose();
      fm.dispose();
      this.floor = undefined;
    }
  }

  private mat(color: string, opts: THREE.MeshStandardMaterialParameters = {}): THREE.MeshStandardMaterial {
    return new THREE.MeshStandardMaterial({ color, roughness: 0.85, metalness: 0.05, ...opts });
  }

  /** Creates the mesh of one object (once). */
  private ensure(o: Obj3): Entry | null {
    const have = this.entries.get(o.id);
    if (have) return have;
    if (o.shape === 'none' || o.shape === 'point' || o.shape === 'light' || o.shape === 'humanoid') return null;
    const sx = o.half.x * 2;
    const sy = o.half.y * 2;
    const sz = o.half.z * 2;
    const node = new THREE.Group();
    const mats: THREE.MeshStandardMaterial[] = [];
    const add = (geo: THREE.BufferGeometry, m: THREE.MeshStandardMaterial, pos?: [number, number, number], shadow = true) => {
      const mesh = new THREE.Mesh(geo, m);
      if (pos) mesh.position.set(...pos);
      mesh.castShadow = shadow;
      mesh.receiveShadow = true;
      node.add(mesh);
      return mesh;
    };
    switch (o.shape) {
      case 'box': {
        const isBone = !!o.parent;
        const isCrate = o.name === 'Crate';
        let map: THREE.Texture | undefined;
        if (!isBone) {
          map = this.texture(isCrate ? 'planks' : 'grain').clone();
          map.needsUpdate = true;
          map.repeat.set(Math.max(1, Math.round(Math.max(sx, sz) / (isCrate ? 1.2 : 2))), Math.max(1, Math.round(sy / (isCrate ? 1.2 : 2))));
        }
        const m = this.mat(o.color, { map, roughness: isBone ? 0.7 : 0.92 });
        mats.push(m);
        add(new THREE.BoxGeometry(sx, sy, sz), m);
        // the bots hold a weapon in the right hand
        if (o.name === 'RightArm' && o.parent?.parent?.parent?.bot) {
          const gm = this.mat('#2b2f36', { roughness: 0.5, metalness: 0.4 });
          add(new THREE.BoxGeometry(0.07, 0.5, 0.1), gm, [0, -sy / 2 - 0.12, -0.08]);
        }
        if (o.name === 'Head' && o.parent?.parent?.parent) {
          // a helmet in the team colour
          const team = o.parent.parent.parent.bot?.team ?? (o.parent.parent.parent.tag === 'Player' ? 'blue' : 'red');
          const hm = this.mat(team === 'blue' ? '#2f5d9e' : '#7a3326', { roughness: 0.6 });
          add(new THREE.BoxGeometry(sx * 1.12, sy * 0.42, sz * 1.12), hm, [0, sy * 0.36, 0]);
          const vm = this.mat('#1d2430', { roughness: 0.3, metalness: 0.3 });
          add(new THREE.BoxGeometry(sx * 0.8, sy * 0.16, 0.02), vm, [0, sy * 0.05, -sz / 2 - 0.01], false);
        }
        break;
      }
      case 'capsule': {
        const m = this.mat(o.color);
        mats.push(m);
        add(new THREE.CapsuleGeometry(Math.min(sx, sz) / 2, Math.max(0.01, sy - sx), 6, 12), m);
        break;
      }
      case 'sphere': {
        const m = this.mat(o.color, { emissive: new THREE.Color(o.color), emissiveIntensity: o.emissive ? 1.2 : 0.15 });
        mats.push(m);
        add(new THREE.SphereGeometry(sx / 2, 24, 16), m);
        break;
      }
      case 'target': {
        // a round target on a pole
        const face = this.mat('#ffffff', { map: this.texture('rings'), roughness: 0.8 });
        const rim = this.mat(o.color, { roughness: 0.6, metalness: o.color === '#8d99a6' || o.color === '#5f6b78' ? 0.6 : 0.1 });
        mats.push(rim);
        const disc = add(new THREE.CylinderGeometry(sx / 2, sx / 2, sz, 32), [rim, face, face] as unknown as THREE.MeshStandardMaterial);
        disc.rotation.x = Math.PI / 2;
        const pole = this.mat('#5b5f66', { metalness: 0.5, roughness: 0.5 });
        add(new THREE.CylinderGeometry(0.04, 0.04, o.pos.y, 8), pole, [0, -o.pos.y / 2, -sz]);
        break;
      }
      case 'zone': {
        const m = this.mat(o.color, { emissive: new THREE.Color(o.color), emissiveIntensity: 1.1, transparent: true, opacity: 0.85 });
        mats.push(m);
        const ring = add(new THREE.RingGeometry(sx / 2 - 0.12, sx / 2, 48), m, undefined, false);
        ring.rotation.x = -Math.PI / 2;
        ring.position.y = 0.01 - o.half.y;
        const glow = this.mat(o.color, { emissive: new THREE.Color(o.color), emissiveIntensity: 0.6, transparent: true, opacity: 0.12, depthWrite: false, side: THREE.DoubleSide });
        mats.push(glow);
        add(new THREE.CylinderGeometry(sx / 2, sx / 2, 1.6, 40, 1, true), glow, [0, 0.8, 0], false);
        break;
      }
      case 'gun': {
        // a compact rifle, a bit to the right and below the eyes
        const body = this.mat('#6b7480', { roughness: 0.55, metalness: 0.15 });
        const dark = this.mat('#3a4049', { roughness: 0.6, metalness: 0.1 });
        const grip = this.mat('#7a6048', { roughness: 0.85 });
        const k = 0.75;
        const part = (geo: THREE.BufferGeometry, m: THREE.MeshStandardMaterial, p: [number, number, number], rx = 0) => {
          const mesh = add(geo, m, [p[0] * k, p[1] * k, p[2] * k], false);
          mesh.scale.setScalar(k);
          mesh.rotation.x = rx;
          return mesh;
        };
        part(new THREE.BoxGeometry(0.07, 0.09, 0.42), body, [0, 0, -0.05]);
        part(new THREE.CylinderGeometry(0.016, 0.016, 0.3, 10), dark, [0, 0.022, -0.4], Math.PI / 2);
        part(new THREE.BoxGeometry(0.05, 0.15, 0.06), grip, [0, -0.1, 0.07], -0.25);
        part(new THREE.BoxGeometry(0.045, 0.12, 0.07), dark, [0, -0.1, -0.12]);
        part(new THREE.BoxGeometry(0.03, 0.03, 0.12), dark, [0, 0.062, -0.03]);
        part(new THREE.BoxGeometry(0.06, 0.07, 0.16), grip, [0, -0.01, 0.2]);
        break;
      }
      default:
        return null;
    }
    this.scene.add(node);
    const e: Entry = { obj: o, node, mats, color: o.color, emissive: o.emissive };
    this.entries.set(o.id, e);
    return e;
  }

  /** Copies positions/rotations/colours from the world and draws a frame. */
  /** Shows how bots see: field of view, where they look, their state (like Unity's Gizmos). */
  vision = false;

  render(w: World3D): VisionLabel[] {
    if (w !== this.world) this.setWorld(w);
    const canvas = this.renderer.domElement;
    const width = canvas.clientWidth || 1;
    const height = canvas.clientHeight || 1;
    if (canvas.width !== Math.floor(width * this.renderer.getPixelRatio()) || canvas.height !== Math.floor(height * this.renderer.getPixelRatio())) {
      this.renderer.setSize(width, height, false);
    }
    this.camera.aspect = width / height;
    // Unity's fieldOfView is vertical, like three.js
    const eye = w.eye();
    this.camera.fov = eye.fov;
    this.camera.updateProjectionMatrix();
    toPos(eye.pos, this.camera.position);
    toQuat(eye.rot, this.camera.quaternion);

    for (const o of w.objects) {
      const e = this.entries.get(o.id) ?? this.ensure(o);
      if (!e) continue;
      e.node.visible = o.alive && !o.hidden && !(w.spectate?.mode === 'eyes' && w.isPartOf(o, w.spectate.bot));
      if (!e.node.visible) continue;
      toPos(o.pos, e.node.position);
      toQuat(o.rot, e.node.quaternion);
      e.node.scale.set(o.scale.x, o.scale.y, o.scale.z);
      if (e.color !== o.color || e.emissive !== o.emissive) {
        e.color = o.color;
        e.emissive = o.emissive;
        for (const m of e.mats) {
          m.color.set(o.color);
          if (o.shape === 'sphere' || o.shape === 'zone' || o.shape === 'target') {
            m.emissive.set(o.emissive ? o.color : '#000000');
            m.emissiveIntensity = o.emissive ? 1.1 : 0;
          }
        }
      }
      // gently pulse goal circles
      if (o.shape === 'zone') e.node.children[1]?.scale.set(1, 0.8 + 0.2 * Math.sin(w.time * 3 + o.id), 1);
    }

    // sun follows the player so shadows stay sharp near you
    toPos(w.player.pos, this.tmpV);
    this.sun.target.position.copy(this.tmpV);
    this.sun.position.set(this.tmpV.x + 14, 28, this.tmpV.z + 9);

    // shots: tracers (player shots start at the gun tip), sparks at the end, muzzle flash
    const pos = this.lineGeo.getAttribute('position') as THREE.BufferAttribute;
    const col = this.lineGeo.getAttribute('color') as THREE.BufferAttribute;
    const tip = w.objects.find((o) => o.name === 'GunTip');
    let n = 0;
    let lastPlayerShot = -1;
    const segs = [...w.shots.map((s) => ({ from: !s.byBot && tip ? tip.pos : s.from, to: s.to, age: w.time - s.at, c: s.byBot ? [1, 0.45, 0.35] : [1, 0.9, 0.55] })), ...w.rays.map((r) => ({ from: r.from, to: r.to, age: 0, c: r.color === 'red' ? [1, 0.2, 0.2] : r.color === 'green' ? [0.2, 1, 0.3] : [1, 1, 1] }))];
    for (const s of w.shots) if (!s.byBot) lastPlayerShot = Math.max(lastPlayerShot, s.at);
    const labels: VisionLabel[] = [];
    if (this.vision) {
      for (const r of w.sightRays) segs.push({ from: r.from, to: r.to, age: 0, c: r.color === 'red' ? [1, 0.25, 0.2] : [1, 0.9, 0.2] });
      for (const b of w.watchable()) {
        const bot = b.bot!;
        const p = bot.profile;
        const col = STATE_COLOR[bot.state] ?? [1, 1, 1];
        const eyeP = { x: b.pos.x, y: b.pos.y + 0.72, z: b.pos.z };
        const yaw = Math.atan2(2 * (b.rot.w * b.rot.y + b.rot.x * b.rot.z), 1 - 2 * (b.rot.y * b.rot.y + b.rot.x * b.rot.x));
        const reach = Math.min(p.sight, 14);
        // the edges of the field of view and an arc between them
        const pts: { x: number; y: number; z: number }[] = [];
        for (let k = 0; k <= 12; k++) {
          const a = yaw + ((k / 12) * 2 - 1) * ((p.viewAngle * Math.PI) / 180);
          pts.push({ x: eyeP.x + Math.sin(a) * reach, y: eyeP.y, z: eyeP.z + Math.cos(a) * reach });
        }
        segs.push({ from: eyeP, to: pts[0], age: 0, c: col }, { from: eyeP, to: pts[12], age: 0, c: col });
        for (let k = 0; k < 12; k++) segs.push({ from: pts[k], to: pts[k + 1], age: 0, c: col.map((x) => x * 0.6) });
        if (bot.lookAt) segs.push({ from: eyeP, to: bot.lookAt, age: 0, c: [1, 1, 1] });
        // a label above the head (projected to the screen)
        this.tmpV.set(b.pos.x, b.pos.y + 1.35, -b.pos.z).project(this.camera);
        if (this.tmpV.z < 1) labels.push({ x: (this.tmpV.x + 1) / 2, y: (1 - this.tmpV.y) / 2, state: bot.state, name: b.name, reactLeft: bot.state === 'react' ? Math.max(0, bot.reactUntil - w.time) : 0, aimErr: bot.aimErr });
      }
    }
    for (const s of segs.slice(-600)) {
      const k = Math.max(0, 1 - s.age / 0.12);
      if (k <= 0) continue;
      // a short streak moving along the shot looks like a bullet
      const a = Math.min(1, s.age / 0.06);
      const fx = s.from.x + (s.to.x - s.from.x) * a * 0.7;
      const fy = s.from.y + (s.to.y - s.from.y) * a * 0.7;
      const fz = s.from.z + (s.to.z - s.from.z) * a * 0.7;
      pos.setXYZ(n * 2, fx, fy, -fz);
      pos.setXYZ(n * 2 + 1, s.to.x, s.to.y, -s.to.z);
      col.setXYZ(n * 2, s.c[0] * k, s.c[1] * k, s.c[2] * k);
      col.setXYZ(n * 2 + 1, s.c[0] * k, s.c[1] * k, s.c[2] * k);
      n++;
    }
    this.lineGeo.setDrawRange(0, n * 2);
    pos.needsUpdate = true;
    col.needsUpdate = true;
    const sp = this.sparkGeo.getAttribute('position') as THREE.BufferAttribute;
    let m = 0;
    for (const s of w.shots) {
      const age = w.time - s.at;
      if (age > 0.15 || m >= 60) continue;
      for (let j = 0; j < 3; j++) {
        const r = (j + 1) * 0.06 * (age / 0.15 + 0.3);
        sp.setXYZ(m++, s.to.x + Math.sin(s.at * 97 + j * 2.1) * r, s.to.y + Math.abs(Math.cos(s.at * 53 + j)) * r, -(s.to.z + Math.cos(s.at * 71 + j * 1.7) * r));
      }
    }
    this.sparkGeo.setDrawRange(0, m);
    sp.needsUpdate = true;
    const flashAge = w.time - lastPlayerShot;
    this.flash.intensity = lastPlayerShot >= 0 && flashAge < 0.05 ? 6 * this.power : 0;
    if (tip) toPos(tip.pos, this.flash.position);

    // power: offline = thick soft fog and less light
    const p = this.power;
    this.fog.density = this.baseFog + (1 - p) * 0.22;
    this.hemi.intensity = 0.55 + 0.6 * p;
    this.sun.intensity = 0.2 + 1.45 * p;
    this.renderer.render(this.scene, this.camera);
    return labels;
  }

  /** Draws the world and reads one pixel (x, y from 0 to 1) — for automated checks of the look. */
  samplePixel(w: World3D, x: number, y: number): number[] {
    this.render(w);
    const gl = this.renderer.getContext();
    const px = new Uint8Array(4);
    gl.readPixels(Math.floor(gl.drawingBufferWidth * x), Math.floor(gl.drawingBufferHeight * (1 - y)), 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
    return [px[0], px[1], px[2]];
  }

  dispose(): void {
    this.clear();
    for (const t of Object.values(this.tex)) t?.dispose();
    this.lineGeo.dispose();
    this.sparkGeo.dispose();
    (this.lines.material as THREE.Material).dispose();
    (this.sparks.material as THREE.Material).dispose();
    this.renderer.dispose();
  }
}
