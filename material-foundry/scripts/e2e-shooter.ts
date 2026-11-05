// Browser end-to-end check of the 3D campaign "Shooter from zero" (requires `npm run build`).
// Real WebGL (SwiftShader) in Chromium. Blanks block the upload; finished scripts complete their
// missions in the real game loop (driven by "Show me how to play"); free play runs the whole match.
// Every request that is not to the local preview server is blocked. Screenshots → verification/shooter/.

import { spawn, type ChildProcess } from 'node:child_process';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { chromium, type Page } from '@playwright/test';
import { setLocale } from '../src/code/i18n';
import { MISSIONS, answerOf } from '../src/code/run/shooter';

const OUT = 'verification';
const SHOTS = join(OUT, 'shooter');
const PORT = 4211;
const URL = `http://localhost:${PORT}/`;

type Check = { name: string; ok: boolean; detail: string };
const checks: Check[] = [];
function check(name: string, ok: boolean, detail = '') {
  checks.push({ name, ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  — ${detail}` : ''}`);
}

async function startServer(): Promise<ChildProcess> {
  const p = spawn(process.execPath, ['node_modules/vite/bin/vite.js', 'preview', '--port', String(PORT), '--strictPort'], { stdio: 'pipe' });
  for (let i = 0; i < 60; i++) {
    try {
      if ((await fetch(URL)).ok) return p;
    } catch {
      /* not up yet */
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error('preview server did not start');
}

const shot = (page: Page, name: string) => page.screenshot({ path: join(SHOTS, `${name}.png`) });

async function main() {
  rmSync(SHOTS, { recursive: true, force: true });
  mkdirSync(SHOTS, { recursive: true });
  setLocale('ru', false);
  const answers = Object.fromEntries(MISSIONS.map((m) => [m.id, answerOf(m)]));
  const server = await startServer();
  const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const ctx = await browser.newContext({ viewport: { width: 1500, height: 900 } });
  const external: string[] = [];
  await ctx.route('**/*', (route) => {
    const u = route.request().url();
    if (u.startsWith(URL) || u.startsWith('data:') || u.startsWith('blob:')) return route.continue();
    external.push(u);
    return route.abort();
  });
  const page = await ctx.newPage();
  page.setDefaultTimeout(30000);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => {
    if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errors.push(m.text());
  });
  page.on('dialog', (d) => void d.accept());

  /** Puts the finished script into the editor of the open mission (as if typed). */
  const fill = async (id: string) => {
    await page.evaluate(
      ([mid, code]) => {
        const s = JSON.parse(localStorage.getItem('mf.shooter.v1') ?? '{}');
        s.code = { ...(s.code ?? {}), [mid]: code };
        s.current = mid;
        localStorage.setItem('mf.shooter.v1', JSON.stringify(s));
      },
      [id, answers[id]],
    );
    await page.reload();
    await page.getByTestId('start-shooter').click();
    await page.getByTestId('shooter').waitFor();
    await page.getByTestId('sh-brief').waitFor();
  };
  const completeWithDemo = async (id: string, seconds: number) => {
    await fill(id);
    await page.getByTestId('sh-demo').click();
    const t0 = Date.now();
    await page.getByTestId('sh-won').waitFor({ timeout: seconds * 1000 });
    return (Date.now() - t0) / 1000;
  };

  try {
    await page.goto(`${URL}#code`);
    await page.evaluate(() => localStorage.setItem('mf.code.prefs.v1', JSON.stringify({ ...JSON.parse(localStorage.getItem('mf.code.prefs.v1') ?? '{}'), locale: 'ru' })));
    await page.reload();
    await page.getByTestId('code-welcome').waitFor();
    if (!(await page.getByText('Шутер с нуля').count())) {
      await page.getByTestId('open-settings').click();
      await page.getByTestId('lang-ru').click();
      await page.keyboard.press('Escape');
      await page.mouse.click(5, 300);
    }
    check('Welcome shows the big "Shooter from zero" card first', (await page.getByTestId('start-shooter').count()) === 1);
    await shot(page, '01-welcome');
    await page.getByTestId('start-shooter').click();
    await page.getByTestId('shooter').waitFor();
    await page.getByTestId('sh-brief').waitFor();
    await page.waitForTimeout(600);
    check('32 missions in 6 chapters + free play', (await page.locator('[data-testid^="sh-mission-"]').count()) === 32 && (await page.getByTestId('sh-free').count()) === 1);

    // ------------------------------------------------------------ mission 1: soft "offline" screen
    const stage = await page.getByTestId('sh-stage').boundingBox();
    const pixel = await page.evaluate(() => (window as unknown as { __mf: { shooterPixel: (x: number, y: number) => number[] } }).__mf.shooterPixel(0.5, 0.25));
    const light = (pixel[0] + pixel[1] + pixel[2]) / 3;
    check('Mission 1 starts on a soft light screen (light, but not glaring white)', light > 170 && light < 245, `rgb ${pixel.join(',')}, stage ${Math.round(stage?.width ?? 0)}×${Math.round(stage?.height ?? 0)}`);
    check('The blanks counter shows what is left', /Пропусков: 1/.test((await page.getByTestId('sh-blanks').textContent()) ?? ''));
    await shot(page, '02-mission1-offline');
    await page.getByTestId('sh-play').click();
    check('Upload is refused while ___ is left, with a clear note', (await page.getByTestId('sh-blank-warn').count()) === 1);
    await page.getByTestId('sh-word').first().click();
    check('New words open a plain explanation', (await page.getByTestId('sh-word-say').count()) === 1);
    await page.getByTestId('sh-hint').click();
    check('Hints open one by one', (await page.getByTestId('sh-hints').locator('p').count()) === 1);

    // type the answer for real into the blank
    await page.locator('[data-testid="sh-editor"] .cm-content').click();
    await page.keyboard.press('Control+f');
    await page.keyboard.press('Escape');
    const doc = await page.locator('[data-testid="sh-editor"] .cm-content').textContent();
    check('The blank ___ is highlighted in the editor', (await page.locator('.cm-blank').count()) >= 1, doc?.slice(0, 40));
    await page.locator('.cm-blank').first().dblclick();
    await page.keyboard.type('"Приём! Боец на связи"');
    check('After typing, all blanks are filled', /Все пропуски заполнены/.test((await page.locator('.sh-blanks').textContent()) ?? ''));
    await page.getByTestId('sh-play').click();
    await page.getByTestId('sh-won').waitFor({ timeout: 15000 });
    check('Mission 1 is complete after writing the radio message', true);
    await page.waitForTimeout(2500);
    await shot(page, '03-mission1-done-lights-on');
    const radio = (await page.getByTestId('sh-radio').textContent()) ?? '';
    check('The Debug.Log message arrives on the in-game radio', /Приём! Боец на связи/.test(radio), radio);

    // ------------------------------------------------------------ real keyboard: mission 3 (W)
    await fill('s03');
    await page.getByTestId('sh-play').click();
    await page.getByTestId('sh-stage').click({ position: { x: 20, y: 20 } });
    await page.keyboard.down('KeyW');
    await page.getByTestId('sh-won').waitFor({ timeout: 20000 });
    await page.keyboard.up('KeyW');
    check('Mission 3: holding the real W key walks to the circle', true);
    await shot(page, '04-mission3-walked');

    // ------------------------------------------------------------ missions completed by "show me"
    const runs: [string, number, string][] = [
      ['s05', 30, '05-eyes'],
      ['s08', 40, '06-jump'],
      ['s10', 40, '07-range'],
      ['s16', 60, '08-bot-patrol'],
      ['s18', 60, '09-bot-brain'],
      ['s22', 50, '10-lean'],
      ['s24', 40, '11-living-body'],
    ];
    for (const [id, limit, name] of runs) {
      try {
        const s = await completeWithDemo(id, limit);
        check(`Mission ${id} completes in the real game loop ("show me")`, true, `${s.toFixed(1)} s`);
      } catch (e) {
        check(`Mission ${id} completes in the real game loop ("show me")`, false, e instanceof Error ? e.message.split('\n')[0] : String(e));
      }
      await shot(page, name);
    }

    // a mistake in the code: friendly error with the line
    await fill('s11');
    await page.locator('[data-testid="sh-editor"] .cm-content').click();
    await page.keyboard.press('Control+End');
    await page.keyboard.type('\nint broken = ;');
    await page.getByTestId('sh-play').click();
    await page.getByTestId('sh-error').waitFor({ timeout: 10000 });
    check('A syntax mistake is explained next to the code', /строка/.test((await page.getByTestId('sh-error').textContent()) ?? ''));
    await shot(page, '12-error');

    // the code reader works here too
    await page.getByTestId('sh-read').click();
    await page.getByTestId('code-reader').waitFor();
    check('"Read simply" opens the 5-lines reader for the mission script', (await page.getByTestId('reader-block').count()) >= 3);
    await shot(page, '13-reader');
    await page.getByTestId('reader-close').click();

    // ------------------------------------------------------------ the final mission and free play
    try {
      const s = await completeWithDemo('s25', 240);
      check('Final mission: the match against 5 bots is won (team of 3, real loop)', true, `${s.toFixed(1)} s`);
    } catch (e) {
      check('Final mission: the match against 5 bots is won (team of 3, real loop)', false, e instanceof Error ? e.message.split('\n')[0] : String(e));
    }
    await shot(page, '14-final-match');
    await page.getByTestId('sh-free').click();
    await page.getByTestId('sh-play').click();
    await page.waitForTimeout(2500);
    const ui = (await page.getByTestId('sh-ui').textContent()) ?? '';
    check('Free play: the whole game runs with every script (timer and enemies on screen)', /Врагов: 5/.test(ui) && /⏱/.test(ui), ui);
    const where = () =>
      page.evaluate(() => {
        const w = (window as unknown as { __mf?: { world3d?: { player: { pos: { x: number; z: number } } } } }).__mf?.world3d;
        return w ? { x: w.player.pos.x, z: w.player.pos.z } : null;
      });
    await page.getByTestId('sh-stage').focus();
    const p0 = await where();
    await page.keyboard.down('KeyW');
    await page.waitForTimeout(1500);
    await page.keyboard.up('KeyW');
    const p1 = await where();
    await shot(page, '15-free-play');
    const moved = p0 && p1 ? Math.hypot(p1.x - p0.x, p1.z - p0.z) : 0;
    check('Free play: the player moves with the keyboard (focus on the game, no mouse needed)', moved > 1, moved.toFixed(2));

    // progress is remembered
    const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('mf.shooter.v1') ?? '{}').done ?? []);
    check('Completed missions are remembered', saved.length >= 10, saved.join(','));

    // narrow screen
    await page.keyboard.press('Escape');
    await page.getByTestId('sh-stop').click();
    await page.setViewportSize({ width: 820, height: 1100 });
    await page.getByTestId('sh-mission-s10').click();
    await page.waitForTimeout(500);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 2);
    check('Tablet width: the game is on top and nothing scrolls sideways', !overflow);
    await shot(page, '16-tablet');
  } catch (e) {
    check('Unexpected failure', false, e instanceof Error ? `${e.message}\n${e.stack}` : String(e));
    await shot(page, 'zz-failure').catch(() => {});
  } finally {
    check('No requests left this computer', external.length === 0, external.slice(0, 3).join(', '));
    check('No page errors', errors.length === 0, errors.slice(0, 5).join(' | '));
    await browser.close();
    server.kill();
    const failed = checks.filter((c) => !c.ok);
    writeFileSync(join(OUT, 'e2e-shooter-report.json'), JSON.stringify({ when: new Date().toISOString(), passed: checks.length - failed.length, failed: failed.length, checks }, null, 2));
    console.log(`\n${checks.length - failed.length}/${checks.length} checks passed`);
    process.exit(failed.length ? 1 : 0);
  }
}

void main();
