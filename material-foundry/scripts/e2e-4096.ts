// Browser check of a 4096 export (memory/time). Usage: npx tsx scripts/e2e-4096.ts  (after npm run build)
import { spawn } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { chromium } from '@playwright/test';
import { unzipSync } from 'fflate';
import { decodePng } from '../tests/helpers';

const PORT = 4198;
const SIZE = Number(process.argv[2] ?? 4096);
const LABEL = SIZE === 8192 ? '8K' : '4K';
const URL = `http://localhost:${PORT}/`;
const OUT = 'verification';
mkdirSync(join(OUT, 'downloads'), { recursive: true });
const server = spawn(process.execPath, ['node_modules/vite/bin/vite.js', 'preview', '--port', String(PORT), '--strictPort'], { stdio: 'pipe' });
for (let i = 0; i < 60; i++) {
  try {
    if ((await fetch(URL)).ok) break;
  } catch {
    /* wait */
  }
  await new Promise((r) => setTimeout(r, 500));
}
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--enable-precise-memory-info'] });
const result: Record<string, unknown> = {};
try {
  const page = await browser.newPage({ viewport: { width: 1366, height: 768 }, acceptDownloads: true });
  page.setDefaultTimeout(900000);
  const errors: string[] = [];
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
    if (m.type() === 'error' || m.type() === 'warning') console.log(`[${m.type()}] ${m.text()}`);
  });
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(URL);
  await page.waitForFunction('(() => { const s = window.__mf?.store?.getState(); return s && s.material && !s.gen.busy; })()', null, { timeout: 180000 });
  await page.click('[data-preset="molten_crust"]');
  await page.click('[data-testid="open-export"]');
  await page.click(`[data-testid="export-res"] button:has-text("${LABEL}")`);
  const t0 = Date.now();
  const poll = setInterval(async () => {
    try {
      const st = await page.evaluate('(() => { const e = document.querySelector("[data-testid=export-progress] .stage"); return e ? e.textContent : "(no progress)"; })()');
      const mem = await page.evaluate('performance.memory ? Math.round(performance.memory.usedJSHeapSize / 1048576) : -1');
      console.log(`${((Date.now() - t0) / 1000).toFixed(0)}s  ${st}  heap ${mem} MB`);
    } catch {
      /* page busy */
    }
  }, 15000);
  const [dl] = await Promise.all([page.waitForEvent('download', { timeout: 900000 }), page.click('[data-testid="export-zip"]')]);
  const secs = (Date.now() - t0) / 1000;
  clearInterval(poll);
  const path = join(OUT, 'downloads', dl.suggestedFilename());
  await dl.saveAs(path);
  const files = unzipSync(new Uint8Array(readFileSync(path)));
  const dims = Object.keys(files)
    .filter((n) => n.endsWith('.png'))
    .map((n) => {
      const d = decodePng(files[n]);
      return `${n}: ${d.width}x${d.height} crc ${d.crcOk ? 'ok' : 'BAD'}`;
    });
  for (const n of Object.keys(files)) if (!n.endsWith('.png')) console.log('file', n, files[n].length);
  const heap = await page.evaluate('performance.memory ? performance.memory.usedJSHeapSize : 0');
  Object.assign(result, { ok: dims.every((d) => d.includes(`${SIZE}x${SIZE} crc ok`)), seconds: secs, zipMB: readFileSync(path).length / 1048576, files: dims, mainHeapAfterMB: Number(heap) / 1048576, errors });
} catch (e) {
  result.ok = false;
  result.error = String(e);
} finally {
  await browser.close();
  server.kill();
}
console.log(JSON.stringify(result, null, 2));
writeFileSync(join(OUT, `e2e-${SIZE}.json`), JSON.stringify(result, null, 2));
