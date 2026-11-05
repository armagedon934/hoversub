// End-to-end check of the DESKTOP app (Electron) — the same program the Windows installer
// installs. Requires: npm run build; cd desktop && npm install && node prepare-app.cjs.
// On Linux without a screen run it as: xvfb-run -a npx tsx scripts/e2e-desktop.ts
// Checks: the window opens from app:// (no web server), the code module works, C# and Python run
// (Pyodide from the packaged files), Mini-Unity, the local-AI bridge through the main process
// (a fake local server WITHOUT CORS headers — only the desktop bridge can reach it), the content
// security policy, and that the page has no Node.js access and cannot navigate away.

import { mkdirSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { join } from 'node:path';
import { _electron as electron } from '@playwright/test';

const OUT = 'verification';
const SHOTS = join(OUT, 'desktop');
type Check = { name: string; ok: boolean; detail: string };
const checks: Check[] = [];
function check(name: string, ok: boolean, detail = '') {
  checks.push({ name, ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  — ${detail}` : ''}`);
}

async function main() {
  mkdirSync(SHOTS, { recursive: true });
  const seen: string[] = [];
  const ai = createServer((req, res) => {
    let body = '';
    req.on('data', (c) => (body += c));
    req.on('end', () => {
      seen.push(`${req.method} ${req.url}`);
      res.setHeader('Content-Type', 'application/json');
      if (req.url === '/api/tags') return res.end(JSON.stringify({ models: [{ name: 'local-7b' }] }));
      if (req.url === '/api/generate') return res.end(JSON.stringify({ response: 'Debug.Log("desktop AI");' }));
      res.statusCode = 404;
      res.end('{}');
    });
  });
  ai.listen(4217);

  const app = await electron.launch({ executablePath: 'desktop/node_modules/electron/dist/electron', args: ['desktop', '--no-sandbox'], env: { ...process.env, ELECTRON_DISABLE_SECURITY_WARNINGS: '1' } });
  const errors: string[] = [];
  try {
    const page = await app.firstWindow();
    page.on('pageerror', (e) => errors.push(e.message));
    page.on('console', (m) => {
      if (/Content Security Policy|Refused to/i.test(m.text())) errors.push(m.text());
    });
    page.setDefaultTimeout(30000);
    await page.waitForLoadState('domcontentloaded');
    // The material studio (WebGL + generator workers) under the strict policy.
    await page.getByTestId('mode-materials').click();
    await page.waitForTimeout(4000);
    const canvases = await page.locator('canvas').count();
    check('Materials studio renders in the desktop app', canvases > 0, `${canvases} canvas`);
    await page.screenshot({ path: join(SHOTS, '00-desktop-materials.png') });
    check('Window opens the app from app:// (no server, no internet)', page.url().startsWith('app://local/'), page.url());
    await page.getByTestId('mode-code').click();
    await page.getByTestId('code-welcome').waitFor();
    await page.getByTestId('open-settings').click();
    await page.getByTestId('lang-ru').click();
    await page.getByTestId('code-welcome').waitFor();
    await page.screenshot({ path: join(SHOTS, '01-desktop-welcome.png') });

    const iso = await page.evaluate(() => ({ require: typeof (window as unknown as { require?: unknown }).require, process: typeof (window as unknown as { process?: unknown }).process, bridge: Object.keys((window as unknown as { mfDesktop?: object }).mfDesktop ?? {}) }));
    check('The page has no Node.js access; only the small AI bridge is exposed', iso.require === 'undefined' && iso.process === 'undefined' && iso.bridge.join(',') === 'platform,aiRequest', JSON.stringify(iso));
    const csp = await page.evaluate(async () => (await fetch('app://local/index.html')).headers.get('content-security-policy') ?? '');
    check('Content security policy is set (no remote code)', /default-src 'self'/.test(csp) && !/https?:/.test(csp));
    const escaped = await page.evaluate(async () => {
      try {
        return (await fetch('app://local/../../main.cjs')).status;
      } catch {
        return -1;
      }
    });
    check('Files outside the app folder cannot be read', escaped !== 200, String(escaped));

    // Workshop: C# with input.
    await page.getByTestId('start-workshop').click();
    await page.getByTestId('ws-new').click();
    await page.getByTestId('ws-new-cs').click();
    const setEditor = async (text: string) => {
      await page.locator('[data-testid="ws-editor"] .cm-content').click();
      await page.keyboard.press('Control+A');
      await page.keyboard.press('Delete');
      await page.keyboard.insertText(text);
    };
    await setEditor('using System;\nConsole.Write("Имя? ");\nstring n = Console.ReadLine();\nConsole.WriteLine("Привет, " + n);\n');
    await page.getByTestId('ws-run').click();
    await page.getByTestId('ws-answer').fill('Unity');
    await page.keyboard.press('Enter');
    await page.waitForFunction(() => /Привет, Unity/.test(document.querySelector('[data-testid="ws-output"]')?.textContent ?? ''));
    check('Desktop: C# runs in the Workshop', true);

    // Python from the packaged Pyodide files.
    await page.getByTestId('ws-new').click();
    await page.getByTestId('ws-new-py').click();
    await setEditor('print(sum(range(5)))\n');
    await page.getByTestId('ws-run').click();
    await page.waitForFunction(() => /^10$/.test(document.querySelector('[data-testid="ws-output"]')?.textContent?.trim() ?? ''), null, { timeout: 120000 });
    check('Desktop: Python (Pyodide) runs offline from the installed files', true);
    await page.screenshot({ path: join(SHOTS, '02-desktop-python.png') });

    // Mini-Unity level.
    await page.getByTestId('view-games').click();
    await page.getByTestId('view-unity').click();
    await page.getByTestId('mu-level-hello').click();
    await page.locator('[data-testid="mu-editor"] .cm-content').click();
    await page.keyboard.press('Control+A');
    await page.keyboard.press('Delete');
    await page.keyboard.insertText('using UnityEngine;\npublic class Hero : MonoBehaviour\n{\n    void Start()\n    {\n        Debug.Log("Hello, Unity!");\n    }\n}\n');
    await page.getByTestId('mu-play').click();
    await page.getByTestId('mu-won').waitFor({ timeout: 20000 });
    check('Desktop: Mini-Unity level is won', true);
    await page.screenshot({ path: join(SHOTS, '03-desktop-mini-unity.png') });

    // Local AI through the main process (the fake server sends no CORS headers).
    await page.getByTestId('open-settings').click();
    await page.getByTestId('ai-enabled').check();
    await page.getByTestId('ai-url').fill('http://127.0.0.1:4217');
    await page.getByTestId('ai-url').blur();
    await page.getByTestId('ai-check').click();
    await page.getByTestId('ai-status').waitFor();
    const st = (await page.getByTestId('ai-status').textContent()) ?? '';
    check('Desktop: local AI reached through the app (no CORS setup needed)', /Моделей: 1/.test(st), st);
    const refused = await page.evaluate(async () => (await (window as unknown as { mfDesktop: { aiRequest(r: object): Promise<{ status: number }> } }).mfDesktop.aiRequest({ url: 'https://example.com/', method: 'GET' })).status);
    check('Desktop bridge refuses non-local addresses', refused === 400, String(refused));
    await page.screenshot({ path: join(SHOTS, '04-desktop-ai.png') });

    // Navigation away is blocked.
    await page.evaluate(() => {
      location.href = 'https://example.com/';
    });
    await page.waitForTimeout(800);
    check('The window cannot be navigated to a website', page.url().startsWith('app://local/'), page.url());
  } catch (e) {
    check('Unexpected failure', false, e instanceof Error ? e.message : String(e));
  } finally {
    check('No page errors', errors.length === 0, errors.slice(0, 3).join(' | '));
    check('Only the local AI address was contacted by the bridge', seen.every((s) => /^(GET|POST) \/api\//.test(s)) && seen.length >= 1, seen.join(', '));
    await app.close();
    ai.close();
    const failed = checks.filter((c) => !c.ok);
    writeFileSync(join(OUT, 'e2e-desktop-report.json'), JSON.stringify({ when: new Date().toISOString(), passed: checks.length - failed.length, failed: failed.length, checks }, null, 2));
    console.log(`\n${checks.length - failed.length}/${checks.length} checks passed`);
    process.exit(failed.length ? 1 : 0);
  }
}

void main();
