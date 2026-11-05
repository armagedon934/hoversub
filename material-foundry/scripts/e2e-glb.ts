// Browser verification of GLB model export: exports models from the real UI, validates each file
// with the Khronos glTF-Validator, then loads it with three.js' GLTFLoader in a separate viewer page
// and takes a screenshot. Usage: npx tsx scripts/e2e-glb.ts  (after npm run build)
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { chromium, type Page } from '@playwright/test';
// @ts-expect-error - gltf-validator ships without type declarations
import validator from 'gltf-validator';

const PORT = 4197;
const URL = `http://localhost:${PORT}/`;
const OUT = 'verification';
const DL = join(OUT, 'downloads');
const SHOTS = join(OUT, 'screenshots');
mkdirSync(DL, { recursive: true });
mkdirSync(SHOTS, { recursive: true });

const ONLY = process.argv[2] ?? '';
const ALL_CASES: { preset: string; shape: string; res: string; bake: boolean }[] = [
  { preset: 'corroded_plate', shape: 'Block', res: '1K', bake: false },
  { preset: 'castle_ashlar', shape: 'Wall', res: '2K', bake: true },
  { preset: 'molten_crust', shape: 'Sphere', res: '4K', bake: false },
  { preset: 'weathered_brick', shape: 'Scene', res: '1K', bake: false },
  { preset: 'glowing_runes', shape: 'Block', res: '8K', bake: false },
];
const CASES = ALL_CASES.filter((c) => !ONLY || c.res === ONLY);

const VIEWER = `<!doctype html><html><head><style>html,body{margin:0;background:#1b1d21}</style>
<script type="importmap">{"imports":{"three":"/three/build/three.module.js","three/addons/":"/three/examples/jsm/"}}</script></head>
<body><script type="module">
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
const r = new THREE.WebGLRenderer({ antialias: true });
r.setSize(900, 600); r.toneMapping = THREE.NeutralToneMapping; document.body.appendChild(r.domElement);
const scene = new THREE.Scene(); scene.background = new THREE.Color(0x1b1d21);
scene.environment = new THREE.PMREMGenerator(r).fromScene(new RoomEnvironment(), 0.02).texture; scene.environmentIntensity = 0.5;
const sun = new THREE.DirectionalLight(0xffffff, 1.5); sun.position.set(4, 6, 5); scene.add(sun);
const cam = new THREE.PerspectiveCamera(38, 1.5, 0.05, 100);
const CAP = Number(new URLSearchParams(location.search).get('cap') || 0);
new GLTFLoader().load('/model.glb', (g) => {
  scene.add(g.scene);
  const decoded = new Set();
  g.scene.traverse((o) => { if (o.isMesh) for (const k of ['map','normalMap','roughnessMap','metalnessMap','aoMap','emissiveMap']) { const t = o.material[k]; if (t) decoded.add(k + ':' + t.image.width); } });
  window.__decoded = [...decoded].sort();
  if (CAP) {
    // Software WebGL in the test container cannot hold several 8K textures; downscale for the render only.
    const done = new Map();
    g.scene.traverse((o) => { if (o.isMesh) for (const k of ['map','normalMap','roughnessMap','metalnessMap','aoMap','emissiveMap']) { const t = o.material[k]; if (t && t.image.width > CAP) {
      if (!done.has(t.image)) { const c = document.createElement('canvas'); c.width = c.height = CAP; c.getContext('2d').drawImage(t.image, 0, 0, CAP, CAP); done.set(t.image, c); }
      t.image = done.get(t.image); t.needsUpdate = true; } } });
  }
  const box = new THREE.Box3().setFromObject(g.scene); const c = box.getCenter(new THREE.Vector3()); const s = box.getSize(new THREE.Vector3()).length();
  cam.position.copy(c).add(new THREE.Vector3(0.55, 0.45, 0.8).multiplyScalar(s * 0.9)); cam.lookAt(c);
  let meshes = 0, tris = 0; const maps = new Set();
  g.scene.traverse((o) => { if (o.isMesh) { meshes++; tris += o.geometry.index.count / 3; for (const k of ['map','normalMap','roughnessMap','metalnessMap','aoMap','emissiveMap']) if (o.material[k]) maps.add(k + ':' + o.material[k].image.width); } });
  r.render(scene, cam);
  window.__done = { meshes, tris, decodedMaps: window.__decoded, renderedMaps: [...maps].sort(), renderCap: CAP || null };
}, undefined, (e) => { window.__done = { error: String(e) }; });
</script></body></html>`;

async function waitReady(page: Page) {
  await page.waitForFunction('(() => { const s = window.__mf?.store?.getState(); return s && s.material && !s.gen.busy; })()', null, { timeout: 180000 });
}

const server = spawn(process.execPath, ['node_modules/vite/bin/vite.js', 'preview', '--port', String(PORT), '--strictPort'], { stdio: 'pipe' });
for (let i = 0; i < 60; i++) {
  try {
    if ((await fetch(URL)).ok) break;
  } catch {
    /* wait */
  }
  await new Promise((r) => setTimeout(r, 500));
}
// Independent viewer: a plain HTTP server with three.js from node_modules and the exported GLB.
const VIEW_PORT = 4196;
let currentModel = new Uint8Array(0);
const viewServer = createServer((req, res) => {
  const path = new globalThis.URL(req.url ?? '/', 'http://x').pathname;
  try {
    if (path === '/') {
      res.writeHead(200, { 'content-type': 'text/html' }).end(VIEWER);
    } else if (path === '/model.glb') {
      res.writeHead(200, { 'content-type': 'model/gltf-binary', 'content-length': currentModel.length }).end(Buffer.from(currentModel.buffer, currentModel.byteOffset, currentModel.byteLength));
    } else if (path.startsWith('/three/') && !path.includes('..')) {
      res.writeHead(200, { 'content-type': 'text/javascript' }).end(readFileSync(resolve('node_modules', path.slice(1))));
    } else res.writeHead(404).end();
  } catch {
    res.writeHead(404).end();
  }
});
await new Promise<void>((r) => viewServer.listen(VIEW_PORT, r));
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const results: Record<string, unknown>[] = [];
try {
  const page = await browser.newPage({ viewport: { width: 1366, height: 768 }, acceptDownloads: true });
  page.setDefaultTimeout(900000);
  const errors: string[] = [];
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(`${URL}#materials`);
  await waitReady(page);
  await page.click('[data-testid="dismiss-intro"]').catch(() => {});
  for (const c of CASES) {
    await page.click(`[data-preset="${c.preset}"]`);
    await waitReady(page);
    await page.click('[data-testid="open-export"]');
    await page.click(`[data-testid="export-res"] button:has-text("${c.res}")`);
    await page.click(`[data-testid="model-shape"] button:has-text("${c.shape}")`);
    const bakeOn = await page.isVisible('[data-testid="model-bake"] .switch.on');
    if (bakeOn !== c.bake) await page.click('[data-testid="model-bake"]');
    if (c === CASES[1]) await page.screenshot({ path: join(SHOTS, '19-export-dialog-glb.png') });
    const t0 = Date.now();
    const [dl] = await Promise.all([page.waitForEvent('download', { timeout: 900000 }), page.click('[data-testid="export-glb"]')]);
    const secs = (Date.now() - t0) / 1000;
    const path = join(DL, dl.suggestedFilename());
    await dl.saveAs(path);
    await page.keyboard.press('Escape');
    const bytes = new Uint8Array(readFileSync(path));
    const report = await validator.validateBytes(bytes, { maxIssues: 50 });
    const issues = report.issues;
    // Render with an independent glTF loader.
    const viewer = await browser.newPage({ viewport: { width: 900, height: 600 } });
    viewer.on('crash', () => console.log('viewer page crashed'));
    currentModel = bytes;
    await viewer.goto(c.res === '8K' ? `http://localhost:${VIEW_PORT}/?cap=2048` : `http://localhost:${VIEW_PORT}/`);
    await viewer.waitForFunction('window.__done', null, { timeout: 600000 });
    const loaded = await viewer.evaluate('window.__done');
    const shotName = `20-glb-${c.preset}-${c.shape.toLowerCase()}-${c.res}${c.bake ? '-displaced' : ''}.png`;
    await viewer.screenshot({ path: join(SHOTS, shotName) });
    await viewer.close();
    const r = {
      file: dl.suggestedFilename(),
      exportSeconds: secs,
      sizeMB: +(bytes.length / 1048576).toFixed(2),
      validator: { errors: issues.numErrors, warnings: issues.numWarnings, infos: issues.numInfos, messages: issues.messages.filter((m: { severity: number }) => m.severity <= 1).slice(0, 8).map((m: { code: string; message: string }) => `${m.code}: ${m.message}`) },
      threeGLTFLoader: loaded,
      screenshot: shotName,
    };
    console.log(JSON.stringify(r));
    results.push(r);
  }
  results.push({ consoleErrors: errors });
} finally {
  await browser.close();
  server.kill();
  viewServer.close();
}
writeFileSync(join(OUT, ONLY ? `e2e-glb-${ONLY}.json` : 'e2e-glb.json'), JSON.stringify(results, null, 2));
