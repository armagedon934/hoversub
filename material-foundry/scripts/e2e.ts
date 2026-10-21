// End-to-end verification of the real user workflow in headless Chromium.
// Builds must exist (npm run build). Starts `vite preview`, drives the UI, saves screenshots and
// downloads into verification/, and writes verification/e2e-report.json.
//
// Usage: npx tsx scripts/e2e.ts
import { spawn, type ChildProcess } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync, rmSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { chromium, type Page, type Browser } from '@playwright/test';
import { unzipSync } from 'fflate';
import { decodePng } from '../tests/helpers';

const OUT = 'verification';
const SHOTS = join(OUT, 'screenshots');
const DL = join(OUT, 'downloads');
const PORT = 4199;
const URL = `http://localhost:${PORT}/`;
const ARGS = ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'];

type Check = { name: string; ok: boolean; detail: string };
const checks: Check[] = [];
function check(name: string, ok: boolean, detail = '') {
  checks.push({ name, ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  — ${detail}` : ''}`);
}

async function startServer(): Promise<ChildProcess> {
  const p = spawn('npx', ['vite', 'preview', '--port', String(PORT), '--strictPort'], { stdio: 'pipe' });
  for (let i = 0; i < 60; i++) {
    try {
      const r = await fetch(URL);
      if (r.ok) return p;
    } catch {
      /* not up yet */
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error('preview server did not start');
}

async function waitReady(page: Page, timeout = 180000) {
  await page.waitForFunction(
    () => {
      const s = (window as any).__mf?.store?.getState();
      return s && !s.gen.busy && s.material && s.materialVersion === s.version && !s.materialDraft;
    },
    null,
    { timeout },
  );
  await page.waitForTimeout(700);
}

async function state(page: Page, expr: string): Promise<any> {
  return page.evaluate(`(() => { const s = window.__mf.store.getState(); return ${expr}; })()`);
}

async function shot(page: Page, name: string) {
  await page.screenshot({ path: join(SHOTS, `${name}.png`) });
}

async function main() {
  rmSync(SHOTS, { recursive: true, force: true });
  rmSync(DL, { recursive: true, force: true });
  mkdirSync(SHOTS, { recursive: true });
  mkdirSync(DL, { recursive: true });
  const server = await startServer();
  let browser: Browser | null = null;
  const consoleErrors: string[] = [];
  try {
    browser = await chromium.launch({ args: ARGS });
    const context = await browser.newContext({ viewport: { width: 1366, height: 768 }, acceptDownloads: true });
    const page = await context.newPage();
    page.setDefaultTimeout(90000);
    page.on('console', (m) => {
      if (m.type() === 'error') consoleErrors.push(m.text());
    });
    page.on('pageerror', (e) => consoleErrors.push(`pageerror: ${e.message}`));

    // ------------------------------------------------------------ first run
    const t0 = Date.now();
    await page.goto(URL);
    await waitReady(page);
    check('First run opens directly into a generated material', true, `${((Date.now() - t0) / 1000).toFixed(1)} s to first full material (software WebGL, shared CPU)`);
    check('Workflow introduction is shown on first run', await page.isVisible('[data-testid="intro"]'));
    await page.waitForFunction(() => document.querySelectorAll('[data-testid="library"] canvas').length >= 42, null, { timeout: 120000 });
    const thumbCount = await page.locator('[data-testid="library"] canvas').count();
    check('Preset gallery shows real generated thumbnails', thumbCount >= 42, `${thumbCount} thumbnail canvases`);
    await shot(page, '01-default-workspace');
    await page.click('[data-testid="dismiss-intro"]');
    check('Introduction can be dismissed', !(await page.isVisible('[data-testid="intro"]')));

    // Preset gallery (scrolled to show more families).
    await page.locator('[data-testid="library"]').evaluate((el) => (el.scrollTop = 900));
    await shot(page, '02-preset-gallery');
    await page.locator('[data-testid="library"]').evaluate((el) => (el.scrollTop = 0));

    // ------------------------------------------------------------ preview modes & required views
    const views: [string, string, string][] = [
      ['03-stone-on-wall', 'castle_ashlar', 'wall'],
      ['04-wood-on-block', 'oak_floor', 'block'],
      ['05-rusted-metal-sphere', 'corroded_plate', 'sphere'],
      ['06-emissive-lava-floor', 'molten_crust', 'floor'],
      ['07-scene-brick', 'weathered_brick', 'scene'],
      ['08-arcane-glow-wall', 'glowing_runes', 'wall'],
    ];
    for (const [name, preset, shape] of views) {
      await page.locator(`[data-preset="${preset}"]`).scrollIntoViewIfNeeded();
      await page.click(`[data-preset="${preset}"]`);
      await page.click(`[data-testid="shape-${shape}"]`);
      await waitReady(page);
      const ok = (await state(page, 's.settings.presetId')) === preset && (await state(page, 's.prefs.shape')) === shape;
      check(`Preview: ${preset} on ${shape}`, ok);
      await shot(page, name);
    }

    // Lighting presets and controls.
    await page.click('[data-testid="lighting-button"]');
    await page.click('[data-testid="lighting-popover"] button:has-text("Sunlight")');
    await page.waitForTimeout(800);
    await shot(page, '09-lighting-popover-sunlight');
    check('Lighting preset switches', (await state(page, 's.prefs.lighting')) === 'sun');
    await page.click('[data-testid="lighting-popover"] button:has-text("Studio")');
    await page.click('[data-testid="lighting-button"]');
    await page.click('[data-testid="turntable"]');
    check('Turntable toggles', (await state(page, 's.prefs.turntable')) === true);
    await page.click('[data-testid="turntable"]');
    await page.click('[data-testid="reset-camera"]');

    // Displacement on the sphere.
    await page.click('[data-preset="corroded_plate"]');
    await page.click('[data-testid="shape-sphere"]');
    await page.evaluate(() => (window as any).__mf.store.getState().setPrefs({ displacement: true, displacementScale: 1.5 }));
    await waitReady(page);
    await page.waitForTimeout(1500);
    await shot(page, '10-displacement-sphere');
    await page.evaluate(() => (window as any).__mf.store.getState().setPrefs({ displacement: false }));

    // ------------------------------------------------------------ stale results under rapid slider changes
    await page.click('[data-preset="red_brick"]');
    await waitReady(page);
    const slider = page.locator('[data-testid="param-wear"]');
    for (let i = 0; i < 30; i++) await slider.fill(String(((i * 37) % 100) / 100));
    await slider.fill('0.73');
    await waitReady(page);
    const staleOk = await page.evaluate(() => {
      const s = (window as any).__mf.store.getState();
      return s.material.settings.params.wear === s.settings.params.wear && s.material.settings.params.wear === 0.73 && s.materialVersion === s.version;
    });
    check('Rapid slider changes never leave a stale result displayed', staleOk, 'displayed material params === current params after 31 rapid edits');

    // Undo / redo via buttons.
    const beforeUndo = await state(page, 's.settings.params.wear');
    await page.click('[data-testid="undo"]');
    const afterUndo = await state(page, 's.settings.params.wear');
    await page.click('[data-testid="redo"]');
    const afterRedo = await state(page, 's.settings.params.wear');
    check('Undo and redo restore material changes', afterUndo !== beforeUndo && afterRedo === beforeUndo, `${beforeUndo} -> ${afterUndo} -> ${afterRedo}`);

    // Seed, randomize, lock, reset to preset.
    await page.click('[data-testid="randomize-seed"]');
    const seedAfter = await state(page, 's.settings.seed');
    check('Randomize seed changes the seed', seedAfter !== 2024, `seed ${seedAfter}`);
    await page.click('[data-testid="seed-lock"]');
    await page.click('[data-preset="buff_flemish"]');
    check('Seed lock keeps the seed when switching presets', (await state(page, 's.settings.seed')) === seedAfter);
    await page.click('[data-testid="seed-lock"]');
    await page.click('[data-testid="reset-preset"]');
    check('Reset to preset restores the preset seed and parameters', (await state(page, 's.settings.seed')) === 451);

    // Family-specific controls are shown/hidden.
    await page.click('[data-preset="red_brick"]');
    const staggerVisible = await page.isVisible('[data-testid="param-stagger"]');
    await page.selectOption('[data-testid="param-bond"]', 'stack');
    const staggerHidden = !(await page.isVisible('[data-testid="param-stagger"]'));
    check('Controls that do not apply are hidden', staggerVisible && staggerHidden);

    // ------------------------------------------------------------ resource stability
    await page.click('[data-testid="shape-wall"]');
    await waitReady(page);
    const base = await page.evaluate(() => (window as any).__mf.stats());
    const presets = ['castle_ashlar', 'molten_crust', 'oak_floor', 'brushed_steel', 'glowing_runes', 'subway_tiles'];
    const shapes = ['sphere', 'wall', 'floor', 'block', 'scene', 'wall'];
    for (let round = 0; round < 3; round++) {
      for (let k = 0; k < presets.length; k++) {
        await page.click(`[data-preset="${presets[k]}"]`);
        await page.click(`[data-testid="shape-${shapes[k]}"]`);
        await page.waitForTimeout(150);
      }
    }
    await page.click('[data-preset="red_brick"]');
    await page.click('[data-testid="shape-wall"]');
    await waitReady(page);
    await page.waitForTimeout(500);
    const after = await page.evaluate(() => (window as any).__mf.stats());
    check(
      'Switching presets and objects does not accumulate WebGL resources',
      after.textures <= base.textures + 1 && after.geometries <= base.geometries + 1,
      `textures ${base.textures} -> ${after.textures}, geometries ${base.geometries} -> ${after.geometries} after 18 switches`,
    );

    // ------------------------------------------------------------ variations
    await page.click('[data-testid="generate-variations"]');
    await page.waitForFunction(() => document.querySelectorAll('[data-testid="variations"] canvas').length === 4, null, { timeout: 120000 });
    await shot(page, '11-variations');
    const famBefore = await state(page, 's.settings.family');
    const title = await page.getAttribute('[data-testid="variation-1"]', 'title');
    await page.click('[data-testid="variation-1"]');
    await waitReady(page);
    const vName = await state(page, 's.settings.name');
    check('Selecting a variation applies that exact configuration', (await state(page, 's.settings.family')) === famBefore && `Apply ${vName}` === title, `${title}`);

    // ------------------------------------------------------------ map inspector
    await page.click('[data-preset="castle_ashlar"]');
    await waitReady(page);
    await page.click('[data-testid="mode-maps"]');
    await page.waitForSelector('[data-testid="inspector"]');
    const mapButtons = page.locator('[data-testid="inspect-maps"] button:not([disabled])');
    const nMaps = await mapButtons.count();
    for (let i = 0; i < nMaps; i++) await mapButtons.nth(i).click();
    check('Inspector switches between all generated maps', nMaps >= 8, `${nMaps} enabled map views`);
    await page.click('[data-testid="inspect-maps"] button:has-text("Normal")');
    await page.click('[data-testid="tile-3x3"]');
    await page.waitForTimeout(400);
    await shot(page, '12-inspector-3x3-normal');
    await page.click('[data-testid="inspect-maps"] button:has-text("Base Color")');
    await page.waitForTimeout(300);
    await shot(page, '13-inspector-3x3-basecolor');
    const box = (await page.locator('[data-testid="inspector"]').boundingBox())!;
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.wheel(0, -600);
    await page.waitForTimeout(300);
    const readout = await page.textContent('[data-testid="inspector-readout"]');
    check('Inspector zoom and texel readout work', !!readout && /zoom \d+%/.test(readout) && readout.includes('RGB'), readout ?? '');
    await page.click('button:has-text("Fit")');

    // Export the currently viewed map from the inspector (at export resolution 512 for speed).
    await page.evaluate(() => (window as any).__mf.store.getState().setPrefs({ exportRes: 512 }));
    const [mapDl] = await Promise.all([page.waitForEvent('download', { timeout: 180000 }), page.click('[data-testid="export-current-map"]')]);
    const mapPath = join(DL, mapDl.suggestedFilename());
    await mapDl.saveAs(mapPath);
    const mapPng = decodePng(new Uint8Array(readFileSync(mapPath)));
    check('Inspector "Export map" downloads the viewed map', mapDl.suggestedFilename() === 'stone_wall_seed_1042_basecolor_512.png' && mapPng.width === 512, mapDl.suggestedFilename());
    await page.click('[data-testid="tile-3x3"]');
    await page.click('[data-testid="mode-3d"]');
    await waitReady(page);

    // ------------------------------------------------------------ favorites & persistence
    await page.click('[data-preset="walnut_varnished"]');
    await waitReady(page);
    await page.fill('[data-testid="material-name"]', 'My Walnut Test');
    await page.press('[data-testid="material-name"]', 'Enter');
    await page.click('[data-testid="save-favorite"]');
    await page.reload();
    await waitReady(page);
    const favs = await state(page, 's.favorites.map(f => f.settings.name)');
    const currentName = await state(page, 's.settings.name');
    check('Favorites persist across reloads', favs.includes('My Walnut Test'), JSON.stringify(favs));
    check('Current material persists across reloads', currentName === 'My Walnut Test');
    await page.click('button[role="tab"]:has-text("Favorites")');
    await page.waitForTimeout(1500);
    await shot(page, '14-favorites');
    await page.click('button[role="tab"]:has-text("Presets")');

    // ------------------------------------------------------------ export dialog & high-res ZIP
    await page.click('[data-preset="molten_crust"]');
    await waitReady(page);
    await page.click('[data-testid="open-export"]');
    await page.click('[data-testid="export-res"] button:has-text("2048")');
    await shot(page, '15-export-dialog');
    // Measure main-thread responsiveness while the 2048 export runs.
    await page.evaluate(`(() => {
      window.__gaps = [];
      let last = performance.now();
      window.__measure = true;
      const tick = () => {
        const now = performance.now();
        window.__gaps.push(now - last);
        last = now;
        if (window.__measure) requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    })()`);
    const exportStart = Date.now();
    const [zipDl] = await Promise.all([page.waitForEvent('download', { timeout: 600000 }), page.click('[data-testid="export-zip"]').then(async () => {
      await page.waitForSelector('[data-testid="export-progress"]');
      await page.waitForTimeout(1500);
      await shot(page, '16-export-progress');
    })]);
    const exportSecs = (Date.now() - exportStart) / 1000;
    const gaps: number[] = await page.evaluate('(() => { window.__measure = false; return window.__gaps; })()');
    const sorted = [...gaps].sort((a, b) => a - b);
    const p95 = sorted[Math.floor(sorted.length * 0.95)];
    const maxGap = sorted[sorted.length - 1];
    check('High-resolution (2048) ZIP export completes', true, `${exportSecs.toFixed(1)} s`);
    check('Interface keeps rendering frames during the 2048 export', p95 < 200, `frame gaps p95 ${p95.toFixed(0)} ms, max ${maxGap.toFixed(0)} ms over ${gaps.length} frames`);
    const zipPath = join(DL, zipDl.suggestedFilename());
    await zipDl.saveAs(zipPath);
    const files = unzipSync(new Uint8Array(readFileSync(zipPath)));
    const names = Object.keys(files).sort();
    const expected = [
      'README.txt',
      'lava_rock_seed_1815_ao_2048.png',
      'lava_rock_seed_1815_basecolor_2048.png',
      'lava_rock_seed_1815_emissive_2048.png',
      'lava_rock_seed_1815_height_16bit_2048.png',
      'lava_rock_seed_1815_metallic_2048.png',
      'lava_rock_seed_1815_normal_opengl_2048.png',
      'lava_rock_seed_1815_orm_2048.png',
      'lava_rock_seed_1815_roughness_2048.png',
      'settings.json',
    ].sort();
    check('ZIP contains the expected files', JSON.stringify(names) === JSON.stringify(expected), names.join(', '));
    let dimsOk = true;
    const dimInfo: string[] = [];
    for (const n of names.filter((x) => x.endsWith('.png'))) {
      const d = decodePng(files[n]);
      dimInfo.push(`${n.replace('lava_rock_seed_1815_', '')}: ${d.width}x${d.height} ${d.bitDepth}-bit ct${d.colorType} crc${d.crcOk ? 'ok' : 'BAD'}`);
      if (d.width !== 2048 || d.height !== 2048 || !d.crcOk) dimsOk = false;
    }
    check('Exported PNGs are 2048x2048 with valid encoding', dimsOk, dimInfo.join('; '));
    const orm = decodePng(files['lava_rock_seed_1815_orm_2048.png']).data;
    const ao = decodePng(files['lava_rock_seed_1815_ao_2048.png']).data;
    const ro = decodePng(files['lava_rock_seed_1815_roughness_2048.png']).data;
    const me = decodePng(files['lava_rock_seed_1815_metallic_2048.png']).data;
    let ormOk = true;
    for (let i = 0; i < 2048 * 2048; i += 997) if (orm[i * 3] !== ao[i] || orm[i * 3 + 1] !== ro[i] || orm[i * 3 + 2] !== me[i]) ormOk = false;
    check('ORM channels are R=AO, G=Roughness, B=Metallic', ormOk);
    const settingsJson = new TextDecoder().decode(files['settings.json']);
    writeFileSync(join(DL, 'exported-settings.json'), settingsJson);

    // Cancel a long export.
    await page.click('[data-testid="export-res"] button:has-text("1024")');
    await page.evaluate(() => (window as any).__mf.store.getState().setParam('heat', 0.5));
    await page.click('[data-testid="export-zip"]');
    await page.waitForSelector('[data-testid="export-progress"]');
    await page.waitForTimeout(600);
    await page.click('[data-testid="export-cancel"]');
    await page.waitForSelector('[data-testid="export-zip"]', { timeout: 10000 });
    check('Long exports can be cancelled', true);

    // Settings JSON download & preview PNG.
    const [jsonDl] = await Promise.all([page.waitForEvent('download'), page.click('[data-testid="export-json"]')]);
    await jsonDl.saveAs(join(DL, jsonDl.suggestedFilename()));
    check('Settings JSON downloads', jsonDl.suggestedFilename().endsWith('_settings.json'), jsonDl.suggestedFilename());
    const [prevDl] = await Promise.all([page.waitForEvent('download'), page.click('[data-testid="export-preview"]')]);
    const prevPath = join(DL, prevDl.suggestedFilename());
    await prevDl.saveAs(prevPath);
    const prev = decodePng(new Uint8Array(readFileSync(prevPath)));
    check('Preview PNG downloads a real image', prev.width > 300 && prev.height > 200, `${prevDl.suggestedFilename()} ${prev.width}x${prev.height}`);
    // Single map download from the dialog.
    const [nDl] = await Promise.all([page.waitForEvent('download', { timeout: 180000 }), page.click('[data-testid="export-map-normal"]')]);
    check('Individual map download from the export dialog', nDl.suggestedFilename() === 'lava_rock_seed_1815_normal_opengl_1024.png', nDl.suggestedFilename());
    await page.keyboard.press('Escape');

    // ------------------------------------------------------------ import JSON
    const doc = JSON.parse(settingsJson);
    doc.material.seed = 4321;
    doc.material.name = 'Imported Lava';
    writeFileSync(join(DL, 'import-test.json'), JSON.stringify(doc));
    await page.click('[data-preset="red_brick"]');
    await page.setInputFiles('[data-testid="import-input"]', join(DL, 'import-test.json'));
    await page.waitForTimeout(300);
    const imported = await page.evaluate(() => {
      const s = (window as any).__mf.store.getState().settings;
      return { family: s.family, seed: s.seed, name: s.name, heat: s.params.heat };
    });
    check('Importing settings JSON restores the material', imported.family === 'lava_rock' && imported.seed === 4321 && imported.name === 'Imported Lava', JSON.stringify(imported));
    writeFileSync(join(DL, 'bad.json'), '{"format":"material-foundry-settings","schemaVersion":7}');
    await page.setInputFiles('[data-testid="import-input"]', join(DL, 'bad.json'));
    await page.waitForTimeout(300);
    const toastText = await page.textContent('[data-testid="toasts"]');
    check('Invalid settings JSON shows a helpful error', !!toastText && toastText.includes('schema v7'), toastText ?? '');
    await waitReady(page);

    // Larger desktop layout.
    await page.setViewportSize({ width: 1920, height: 1080 });
    await page.click('[data-preset="castle_ashlar"]');
    await page.click('[data-testid="shape-scene"]');
    await waitReady(page);
    await shot(page, '17-desktop-1920-scene');
    await page.setViewportSize({ width: 1366, height: 768 });

    // Layout at 1366x768: key controls visible and not clipped.
    const vis = await page.evaluate(() => {
      const ids = ['open-export', 'undo', 'save-favorite', 'shape-scene', 'reset-camera', 'generate-variations', 'reset-preset', 'seed-input'];
      return ids.map((id) => {
        const el = document.querySelector(`[data-testid="${id}"]`) as HTMLElement | null;
        if (!el) return `${id}:missing`;
        const r = el.getBoundingClientRect();
        return r.width > 0 && r.right <= window.innerWidth && r.bottom <= window.innerHeight && r.left >= 0 ? `${id}:ok` : `${id}:clipped`;
      });
    });
    check('Key controls are visible and unclipped at 1366x768', vis.every((v: string) => v.endsWith(':ok')), vis.join(' '));

    // ------------------------------------------------------------ WebGL unavailable fallback
    const noGl = await browser.newContext({ viewport: { width: 1366, height: 768 } });
    const p2 = await noGl.newPage();
    await p2.addInitScript(`(() => {
      const orig = HTMLCanvasElement.prototype.getContext;
      HTMLCanvasElement.prototype.getContext = function (type, ...rest) {
        if (type === 'webgl' || type === 'webgl2' || type === 'experimental-webgl') return null;
        return orig.call(this, type, ...rest);
      };
    })()`);
    await p2.goto(URL);
    await waitReady(p2);
    await p2.waitForTimeout(1000);
    const fallback = await p2.isVisible('.webgl-fallback');
    await p2.screenshot({ path: join(SHOTS, '18-no-webgl-fallback.png') });
    check('Without WebGL a useful 2D fallback is shown', fallback);
    await noGl.close();

    check('No console errors during the whole session', consoleErrors.length === 0, consoleErrors.slice(0, 5).join(' | '));
  } finally {
    await browser?.close();
    server.kill();
  }
  const report = { date: new Date().toISOString(), passed: checks.filter((c) => c.ok).length, failed: checks.filter((c) => !c.ok).length, checks };
  writeFileSync(join(OUT, 'e2e-report.json'), JSON.stringify(report, null, 2));
  console.log(`\n${report.passed} passed, ${report.failed} failed`);
  if (report.failed) process.exitCode = 1;
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
void existsSync;
