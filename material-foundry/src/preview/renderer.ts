// Imperative three.js preview. Owns its renderer, scene, textures and geometries and disposes
// of them explicitly when they are replaced, so switching materials and preview objects does not
// accumulate WebGL resources.

import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import type { GeneratedMaterial } from '../engine/generate';
import type { LightingPreset, PreviewShape } from '../state/persistence';
import {
  applyTileSize,
  blockSpec,
  floorSpec,
  makeRuler,
  sceneSpecs,
  sphereSpec,
  wallSpec,
  BLOCK_SIZE,
  FLOOR_SIZE,
  SCENE_ROOM,
  SPHERE_RADIUS,
  WALL_SIZE,
  type PreviewMeshSpec,
} from './geometry';

export function isWebGLAvailable(): boolean {
  try {
    const c = document.createElement('canvas');
    return !!c.getContext('webgl2');
  } catch {
    return false;
  }
}

interface LightingDef {
  envIntensity: number;
  sunColor: number;
  sunScale: number;
  hemiSky: number;
  hemiGround: number;
  hemiIntensity: number;
  env: 'room' | 'sky' | 'overcast' | 'dusk';
  exposure: number;
}

const LIGHTING: Record<LightingPreset, LightingDef> = {
  studio: { envIntensity: 0.5, sunColor: 0xffffff, sunScale: 1.5, hemiSky: 0xffffff, hemiGround: 0x444444, hemiIntensity: 0.0, env: 'room', exposure: 1.0 },
  sun: { envIntensity: 0.4, sunColor: 0xfff1dc, sunScale: 2.6, hemiSky: 0xbcd4ff, hemiGround: 0x6b5a48, hemiIntensity: 0.35, env: 'sky', exposure: 1.0 },
  overcast: { envIntensity: 0.8, sunColor: 0xe9eef5, sunScale: 0.45, hemiSky: 0xdfe6ee, hemiGround: 0x55585c, hemiIntensity: 0.4, env: 'overcast', exposure: 1.05 },
  dusk: { envIntensity: 0.35, sunColor: 0xff9a52, sunScale: 2.2, hemiSky: 0x5f6fa8, hemiGround: 0x2a2220, hemiIntensity: 0.35, env: 'dusk', exposure: 1.0 },
};

function gradientEnvScene(top: number, horizon: number, bottom: number, sunDir?: THREE.Vector3, sunColor?: number): THREE.Scene {
  const scene = new THREE.Scene();
  const geo = new THREE.SphereGeometry(10, 48, 24);
  const mat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    uniforms: {
      top: { value: new THREE.Color(top) },
      horizon: { value: new THREE.Color(horizon) },
      bottom: { value: new THREE.Color(bottom) },
      sunDir: { value: sunDir ?? new THREE.Vector3(0, 1, 0) },
      sunColor: { value: new THREE.Color(sunColor ?? 0x000000) },
    },
    vertexShader: 'varying vec3 vDir; void main(){ vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
    fragmentShader:
      'uniform vec3 top; uniform vec3 horizon; uniform vec3 bottom; uniform vec3 sunDir; uniform vec3 sunColor; varying vec3 vDir;' +
      'void main(){ float y = vDir.y; vec3 c = y > 0.0 ? mix(horizon, top, pow(y, 0.6)) : mix(horizon, bottom, pow(-y, 0.4));' +
      ' float s = max(dot(normalize(vDir), normalize(sunDir)), 0.0); c += sunColor * (pow(s, 64.0) * 6.0 + pow(s, 6.0) * 0.4);' +
      ' gl_FragColor = vec4(c, 1.0); }',
  });
  scene.add(new THREE.Mesh(geo, mat));
  return scene;
}

export interface RendererStats {
  geometries: number;
  textures: number;
  programs: number;
  calls: number;
  triangles: number;
}

export class PreviewRenderer {
  readonly canvas: HTMLCanvasElement;
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera: THREE.PerspectiveCamera;
  private controls: OrbitControls;
  private pmrem: THREE.PMREMGenerator;
  private envTex: THREE.Texture | null = null;
  private envKey = '';
  private sun = new THREE.DirectionalLight(0xffffff, 2);
  private hemi = new THREE.HemisphereLight(0xffffff, 0x444444, 0);
  private objectGroup = new THREE.Group();
  private ruler: THREE.Group;
  private material: THREE.MeshStandardMaterial;
  private meshes: { mesh: THREE.Mesh; spec: PreviewMeshSpec }[] = [];
  private textures: THREE.Texture[] = [];
  private shape: PreviewShape = 'wall';
  private detail = false;
  private tileSize = 2;
  private displacementScale = 1;
  private displacementOn = false;
  private reliefDepth = 0.02;
  private lighting: LightingPreset = 'studio';
  private az = 35;
  private el = 40;
  private intensity = 1;
  private needsRender = true;
  private raf = 0;
  private disposed = false;
  private resizeObs: ResizeObserver;
  private container: HTMLElement;
  private lastTime = performance.now();
  onRender?: () => void;

  constructor(container: HTMLElement) {
    this.container = container;
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.NeutralToneMapping;
    this.renderer.toneMappingExposure = 1;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.canvas = this.renderer.domElement;
    this.canvas.className = 'preview-canvas';
    container.appendChild(this.canvas);

    this.scene.background = new THREE.Color(0x1b1d21);
    this.camera = new THREE.PerspectiveCamera(38, 1, 0.05, 100);
    this.controls = new OrbitControls(this.camera, this.canvas);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.09;
    this.controls.autoRotateSpeed = 1.2;
    this.controls.addEventListener('change', () => this.invalidate());

    this.pmrem = new THREE.PMREMGenerator(this.renderer);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    this.sun.shadow.bias = -0.0004;
    this.sun.shadow.normalBias = 0.02;
    const sc = this.sun.shadow.camera;
    sc.left = -6;
    sc.right = 6;
    sc.top = 6;
    sc.bottom = -6;
    sc.near = 0.5;
    sc.far = 40;
    this.scene.add(this.sun, this.sun.target, this.hemi, this.objectGroup);

    this.material = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 1, metalness: 1 });
    this.ruler = makeRuler();
    this.scene.add(this.ruler);

    this.resizeObs = new ResizeObserver(() => this.resize());
    this.resizeObs.observe(container);
    this.resize();
    this.applyLighting();
    this.buildShape();
    this.resetCamera();
    const loop = () => {
      if (this.disposed) return;
      this.raf = requestAnimationFrame(loop);
      const now = performance.now();
      const dt = Math.min(0.1, (now - this.lastTime) / 1000);
      this.lastTime = now;
      const moving = this.controls.update(dt);
      if (moving || this.controls.autoRotate || this.needsRender) {
        this.needsRender = false;
        this.renderer.render(this.scene, this.camera);
        this.onRender?.();
      }
    };
    loop();
  }

  invalidate(): void {
    this.needsRender = true;
  }

  private resize(): void {
    const w = Math.max(1, this.container.clientWidth);
    const h = Math.max(1, this.container.clientHeight);
    this.renderer.setSize(w, h, false);
    this.canvas.style.width = `${w}px`;
    this.canvas.style.height = `${h}px`;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.invalidate();
  }

  // ------------------------------------------------------------------ material

  private makeTex(data: Uint8Array | Uint8ClampedArray, size: number, color: boolean): THREE.DataTexture {
    // Generated data has row 0 at the top of the image; GL expects row 0 at v = 0 (bottom).
    const flipped = new Uint8Array(data.length);
    const stride = size * 4;
    for (let y = 0; y < size; y++) flipped.set(data.subarray((size - 1 - y) * stride, (size - y) * stride), y * stride);
    const t = new THREE.DataTexture(flipped, size, size, THREE.RGBAFormat, THREE.UnsignedByteType);
    t.wrapS = THREE.RepeatWrapping;
    t.wrapT = THREE.RepeatWrapping;
    t.magFilter = THREE.LinearFilter;
    t.minFilter = THREE.LinearMipmapLinearFilter;
    t.generateMipmaps = true;
    t.anisotropy = Math.min(8, this.renderer.capabilities.getMaxAnisotropy());
    t.colorSpace = color ? THREE.SRGBColorSpace : THREE.NoColorSpace;
    t.needsUpdate = true;
    this.textures.push(t);
    return t;
  }

  setMaterial(m: GeneratedMaterial): void {
    const old = this.textures;
    this.textures = [];
    const size = m.size;
    const maps = m.maps;
    const n = size * size;
    const orm = new Uint8Array(n * 4);
    const height = new Uint8Array(n * 4);
    for (let i = 0; i < n; i++) {
      orm[i * 4] = maps.ao[i];
      orm[i * 4 + 1] = maps.roughness[i];
      orm[i * 4 + 2] = maps.metallic[i];
      orm[i * 4 + 3] = 255;
      const h = maps.height16[i] >> 8;
      height[i * 4] = h;
      height[i * 4 + 1] = h;
      height[i * 4 + 2] = h;
      height[i * 4 + 3] = 255;
    }
    const mat = this.material;
    mat.map = this.makeTex(maps.baseColor, size, true);
    mat.normalMap = this.makeTex(maps.normal, size, false); // OpenGL convention, as three.js expects
    const ormTex = this.makeTex(orm, size, false);
    mat.aoMap = ormTex; // red channel
    mat.roughnessMap = ormTex; // green channel
    mat.metalnessMap = ormTex; // blue channel
    mat.roughness = 1;
    mat.metalness = 1;
    mat.aoMapIntensity = 1;
    mat.displacementMap = this.makeTex(height, size, false);
    if (m.maps.emissive && m.hasEmissive) {
      mat.emissiveMap = this.makeTex(m.maps.emissive, size, true);
      mat.emissive.set(0xffffff);
      mat.emissiveIntensity = m.emissionStrength;
    } else {
      mat.emissiveMap = null;
      mat.emissive.set(0x000000);
      mat.emissiveIntensity = 0;
    }
    this.reliefDepth = m.reliefDepth;
    this.updateDisplacement();
    mat.needsUpdate = true;
    for (const t of old) t.dispose();
    this.invalidate();
  }

  // ------------------------------------------------------------------ shapes

  setShape(shape: PreviewShape): void {
    if (shape === this.shape) return;
    this.shape = shape;
    this.buildShape();
    this.resetCamera();
  }

  private buildShape(): void {
    for (const { mesh } of this.meshes) {
      this.objectGroup.remove(mesh);
      mesh.geometry.dispose();
    }
    this.meshes = [];
    this.objectGroup.rotation.set(0, 0, 0);
    const d = this.detail;
    let specs: PreviewMeshSpec[];
    switch (this.shape) {
      case 'sphere':
        specs = [{ ...sphereSpec(d), position: [0, SPHERE_RADIUS, 0] }];
        break;
      case 'wall':
        specs = [wallSpec(d)];
        break;
      case 'floor':
        specs = [floorSpec(d)];
        break;
      case 'block':
        specs = [blockSpec(d)];
        break;
      case 'scene':
        specs = sceneSpecs(d);
        break;
    }
    for (const spec of specs) {
      applyTileSize(spec.geometry, this.tileSize, spec.wrapU);
      const mesh = new THREE.Mesh(spec.geometry, this.material);
      mesh.castShadow = !!spec.castShadow;
      mesh.receiveShadow = !!spec.receiveShadow;
      if (spec.position) mesh.position.set(...spec.position);
      if (spec.rotation) mesh.rotation.set(...spec.rotation);
      this.objectGroup.add(mesh);
      this.meshes.push({ mesh, spec });
    }
    this.placeRuler();
    this.applyLighting();
    this.invalidate();
  }

  private placeRuler(): void {
    const r = this.ruler;
    r.rotation.set(0, 0, 0);
    switch (this.shape) {
      case 'sphere':
        r.position.set(0, 0.01, SPHERE_RADIUS + 0.35);
        break;
      case 'wall':
        r.position.set(-WALL_SIZE[0] / 2 + 0.6, 0.12, 0.05);
        break;
      case 'floor':
        r.position.set(0, 0.02, 1.2);
        break;
      case 'block':
        r.position.set(0, 0.01, BLOCK_SIZE / 2 + 0.35);
        break;
      case 'scene':
        r.position.set(0.6, 0.02, 1.0);
        break;
    }
  }

  setTileSize(tile: number): void {
    if (tile === this.tileSize) return;
    this.tileSize = tile;
    for (const { spec } of this.meshes) applyTileSize(spec.geometry, tile, spec.wrapU);
    this.updateDisplacement();
    this.invalidate();
  }

  setDisplacement(on: boolean, scale: number): void {
    const needDetail = on;
    this.displacementOn = on;
    this.displacementScale = scale;
    if (needDetail !== this.detail) {
      this.detail = needDetail;
      this.buildShape();
    }
    this.updateDisplacement();
  }

  private updateDisplacement(): void {
    const mat = this.material;
    if (this.displacementOn) {
      // Height spans reliefDepth tile-widths; convert to metres for the current tile size.
      const metres = this.reliefDepth * this.tileSize * this.displacementScale;
      mat.displacementScale = metres;
      mat.displacementBias = -metres * 0.6;
    } else {
      mat.displacementScale = 0;
      mat.displacementBias = 0;
    }
    this.invalidate();
  }

  // ------------------------------------------------------------------ camera & lighting

  resetCamera(): void {
    const c = this.camera;
    const t = this.controls.target;
    switch (this.shape) {
      case 'sphere':
        c.position.set(0, SPHERE_RADIUS * 1.25, SPHERE_RADIUS * 4.1);
        t.set(0, SPHERE_RADIUS, 0);
        break;
      case 'wall':
        c.position.set(0, WALL_SIZE[1] / 2, 4.9);
        t.set(0, WALL_SIZE[1] / 2, 0);
        break;
      case 'floor':
        c.position.set(0, 1.6, 4.6);
        t.set(0, 0, -0.6);
        break;
      case 'block':
        c.position.set(2.0, 1.75, 2.6);
        t.set(0, BLOCK_SIZE * 0.45, 0);
        break;
      case 'scene':
        c.position.set(2.6, 1.9, 3.9);
        t.set(-0.4, 0.9, -1.2);
        break;
    }
    this.controls.minDistance = 0.4;
    this.controls.maxDistance = 20;
    this.controls.maxPolarAngle = this.shape === 'floor' || this.shape === 'scene' ? Math.PI * 0.49 : Math.PI;
    c.updateProjectionMatrix();
    this.controls.update();
    this.invalidate();
  }

  setTurntable(on: boolean): void {
    this.controls.autoRotate = on;
    this.invalidate();
  }

  setLighting(preset: LightingPreset, azimuth: number, elevation: number, intensity: number): void {
    this.lighting = preset;
    this.az = azimuth;
    this.el = elevation;
    this.intensity = intensity;
    this.applyLighting();
  }

  private applyLighting(): void {
    const def = LIGHTING[this.lighting];
    const az = THREE.MathUtils.degToRad(this.az);
    const el = THREE.MathUtils.degToRad(this.el);
    const dir = new THREE.Vector3(Math.sin(az) * Math.cos(el), Math.sin(el), Math.cos(az) * Math.cos(el));
    const center = new THREE.Vector3(0, this.shape === 'floor' ? 0 : 1, this.shape === 'scene' ? -1 : 0);
    this.sun.position.copy(center).addScaledVector(dir, 12);
    this.sun.target.position.copy(center);
    this.sun.color.set(def.sunColor);
    this.sun.intensity = def.sunScale * this.intensity;
    this.sun.castShadow = this.shape !== 'wall';
    this.hemi.color.set(def.hemiSky);
    this.hemi.groundColor.set(def.hemiGround);
    this.hemi.intensity = def.hemiIntensity * this.intensity;
    this.renderer.toneMappingExposure = def.exposure;
    const key = `${def.env}:${def.env === 'room' ? '' : `${this.az.toFixed(0)},${this.el.toFixed(0)}`}`;
    if (key !== this.envKey) {
      this.envKey = key;
      let envScene: THREE.Scene;
      if (def.env === 'room') envScene = new RoomEnvironment();
      else if (def.env === 'sky') envScene = gradientEnvScene(0x5b8fd6, 0xc9dcf0, 0x5a5048, dir, 0xfff1d0);
      else if (def.env === 'overcast') envScene = gradientEnvScene(0xc8ccd2, 0xb9bdc3, 0x5c5d5f);
      else envScene = gradientEnvScene(0x26305c, 0xd88a5a, 0x241c1a, dir, 0xff9050);
      const rt = this.pmrem.fromScene(envScene, 0.02);
      const old = this.envTex;
      this.envTex = rt.texture;
      this.scene.environment = rt.texture;
      old?.dispose();
      envScene.traverse((o) => {
        const mesh = o as THREE.Mesh;
        if (mesh.isMesh) {
          mesh.geometry.dispose();
          const mm = mesh.material as THREE.Material | THREE.Material[];
          (Array.isArray(mm) ? mm : [mm]).forEach((x) => x.dispose());
        }
      });
    }
    this.scene.environmentIntensity = def.envIntensity * this.intensity;
    this.invalidate();
  }

  // ------------------------------------------------------------------ output

  /** Render the current view and return it as a PNG blob. */
  snapshot(): Promise<Blob> {
    this.renderer.render(this.scene, this.camera);
    return new Promise((resolve, reject) => {
      this.canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Could not capture the preview image.'))), 'image/png');
    });
  }

  stats(): RendererStats {
    const info = this.renderer.info;
    return {
      geometries: info.memory.geometries,
      textures: info.memory.textures,
      programs: info.programs?.length ?? 0,
      calls: info.render.calls,
      triangles: info.render.triangles,
    };
  }

  dimensions(): string {
    switch (this.shape) {
      case 'sphere':
        return `Sphere Ø ${(SPHERE_RADIUS * 2).toFixed(1)} m`;
      case 'wall':
        return `Wall ${WALL_SIZE[0]} m × ${WALL_SIZE[1]} m`;
      case 'floor':
        return `Floor ${FLOOR_SIZE} m × ${FLOOR_SIZE} m`;
      case 'block':
        return `Block ${BLOCK_SIZE} m cube`;
      case 'scene':
        return `Room ${SCENE_ROOM[0]} × ${SCENE_ROOM[2]} m, ${SCENE_ROOM[1]} m high · crate 1 m`;
    }
  }

  dispose(): void {
    this.disposed = true;
    cancelAnimationFrame(this.raf);
    this.resizeObs.disconnect();
    this.controls.dispose();
    for (const { mesh } of this.meshes) mesh.geometry.dispose();
    for (const t of this.textures) t.dispose();
    this.material.dispose();
    this.ruler.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (mesh.isMesh) {
        mesh.geometry.dispose();
        (mesh.material as THREE.Material).dispose();
      }
    });
    this.envTex?.dispose();
    this.pmrem.dispose();
    this.renderer.dispose();
    this.canvas.remove();
  }
}
