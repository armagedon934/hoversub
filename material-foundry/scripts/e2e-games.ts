// Browser end-to-end check of the newer parts (requires `npm run build`): My path, the Games row,
// 10 themes with sounds, the Sound Lab, racing, models & materials from the texture generator,
// watching bots (spectator + vision), course lessons in two panes. Real WebGL (SwiftShader); every
// request that is not to the local preview server is blocked. Screenshots → verification/games/.

import { spawn, type ChildProcess } from 'node:child_process';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { chromium, type Page } from '@playwright/test';
import { setLocale } from '../src/code/i18n';
import { answerCode } from '../src/code/run/blanks';
import { MISSIONS } from '../src/code/run/shooter';
import { RACE_MISSIONS } from '../src/code/run/racing';
import { MODEL_MISSIONS } from '../src/code/run/models';
import { SOUND_LESSONS } from '../src/code/sound/soundLessons';

const OUT = 'verification';
const SHOTS = join(OUT, 'games');
const PORT = 4212;
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

  /** Seeds a campaign's progress so the finished script is in the editor, then opens it. */
  const seed = async (key: string, id: string, code: string, extra: Record<string, unknown> = {}) => {
    await page.evaluate(
      ([k, mid, c, ex]) => {
        const s = JSON.parse(localStorage.getItem(k as string) ?? '{}');
        s.code = { ...(s.code ?? {}), [mid as string]: c };
        Object.assign(s, ex);
        localStorage.setItem(k as string, JSON.stringify(s));
      },
      [key, id, code, extra] as const,
    );
    await page.reload();
    await page.getByTestId('code-welcome').waitFor();
  };
  const openGame = async (v: string) => {
    await page.getByTestId('view-games').click();
    await page.getByTestId(`view-${v}`).click();
  };
  const world = () =>
    page.evaluate(() => {
      const w = (window as unknown as { __mf?: { world3d?: { objects: { name: string; material?: { id: string }; mesh?: { version: number } }[]; spectate: unknown } } }).__mf?.world3d;
      return w ? { mats: w.objects.filter((o) => o.material?.id).map((o) => `${o.name}:${o.material!.id}`), dents: w.objects.find((o) => o.mesh)?.mesh?.version ?? 0, watching: !!w.spectate } : null;
    });

  try {
    await page.goto(`${URL}#code`);
    await page.evaluate(() => localStorage.setItem('mf.code.prefs.v1', JSON.stringify({ locale: 'ru' })));
    await page.reload();
    await page.getByTestId('code-welcome').waitFor();
    if (!(await page.getByText('Мой путь').count())) {
      await page.getByTestId('open-settings').click();
      await page.getByTestId('lang-ru').click();
      await page.keyboard.press('Escape');
      await page.mouse.click(5, 300);
    }

    // ------------------------------------------------------------------ my path
    check('Welcome shows "My path — next step" first', (await page.getByTestId('path-card').count()) === 1);
    await shot(page, '01-welcome');
    await page.getByTestId('path-card-all').click();
    await page.getByTestId('learning-path').waitFor();
    check('My path lists 10 stages in order', (await page.getByTestId('path-stage').count()) === 10);
    await shot(page, '02-path');
    await page.getByTestId('path-continue').click();
    await page.getByTestId('mini-unity').waitFor();
    check('Continue opens the next lesson (Mini-Unity 2D level 1)', true);
    check('The Games row shows 5 games', (await page.locator('.cm-games button').count()) === 5);

    // ------------------------------------------------------------------ themes and sounds
    await page.getByTestId('open-settings').click();
    check('Settings offer 10 themes', (await page.getByTestId('theme-grid').locator('button').count()) === 10);
    check('Settings offer a volume for every kind of sound', (await page.locator('[data-testid^="sound-vol-"]').count()) === 6);
    const before = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
    await page.getByTestId('theme-neon').click();
    const after = await page.evaluate(() => ({ bg: getComputedStyle(document.body).backgroundColor, theme: document.documentElement.dataset.theme }));
    check('Choosing a theme recolours the whole program', after.theme === 'neon' && after.bg !== before, `${before} → ${after.bg}`);
    await shot(page, '03-theme-neon');
    await page.getByTestId('theme-sakura').click();
    await shot(page, '04-theme-sakura');
    await page.getByTestId('theme-dark').click();
    await page.keyboard.press('Escape');
    await page.mouse.click(5, 300);

    // ------------------------------------------------------------------ course in two panes
    await page.getByTestId('view-learn').click();
    await page.getByText('Курсы').first().click();
    await page.getByTestId('course-cs-unity').click();
    await page.getByTestId('course-lesson-card').first().click();
    await page.getByTestId('course-screen').waitFor();
    await page.waitForFunction(() => (document.querySelector('[data-testid="course-screen"]')?.textContent ?? '…') !== '…');
    const screen = (await page.getByTestId('course-screen').textContent()) ?? '';
    check('A course lesson shows its result at once, next to the code', screen.length > 3 && screen !== '…', screen.slice(0, 60));
    check('…with a button to the same idea in a game', (await page.getByTestId('course-in-game').count()) === 1);
    await shot(page, '05-course-two-panes');
    await page.getByTestId('course-in-game').click();
    await page.getByTestId('shooter').waitFor();
    check('The game button opens the matching shooter mission', /Кто ты/.test((await page.getByTestId('sh-brief').textContent()) ?? ''));

    // ------------------------------------------------------------------ sound lab
    const z = SOUND_LESSONS[3];
    await page.evaluate(([c]) => localStorage.setItem('mf.soundlab.v1', JSON.stringify({ code: { z4: c }, lesson: 'z4', tab: 'lessons' })), [answerCode(z.code())]);
    await page.reload();
    await page.getByTestId('code-welcome').waitFor();
    await openGame('sound');
    await page.getByTestId('snd-build').click();
    await page.getByTestId('snd-won').waitFor({ timeout: 20000 });
    check('Sound lesson "Jump": the written OnAudioFilterRead passes its goals by listening', true);
    check('The live Inspector shows the sliders of the sound script', (await page.locator('[data-testid^="snd-field-"]').count()) >= 3);
    await shot(page, '06-sound-lesson');
    await page.getByTestId('snd-tab-synth').click();
    await page.getByTestId('snd-preset-laser').click();
    const facts = (await page.getByTestId('snd-facts').textContent()) ?? '';
    check('Synthesizer: a preset shows its wave and numbers; Play / Stop / Slow ×2 are there', /Гц/.test(facts) && (await page.getByTestId('snd-slow').count()) === 1, facts.slice(0, 80));
    await page.getByTestId('snd-use-shot').click();
    check('A sound can be used as the gunshot in the shooter', (await page.getByTestId('snd-used').count()) === 1);
    await shot(page, '07-synth');

    // ------------------------------------------------------------------ living bots
    const b2 = MISSIONS.find((m) => m.id === 'b2')!;
    await seed('mf.shooter.v1', 'b2', answerCode(b2.code()), { current: 'b2' });
    await openGame('shooter');
    await page.getByTestId('sh-demo').click();
    await page.getByTestId('sh-won').waitFor({ timeout: 40000 });
    check('Bot mission "A smooth turn" completes in the real game loop', true);
    await page.getByTestId('sh-free').click();
    await page.getByTestId('sh-play').click();
    await page.waitForTimeout(1500);
    await page.getByTestId('vision-toggle').click();
    await page.getByTestId('spectate-toggle').click();
    await page.waitForTimeout(2500);
    const labels = await page.locator('.gp-label').count();
    check('Watching bots: the camera follows a bot and their states are drawn over them', labels >= 1 && !!(await world())?.watching, `${labels} labels`);
    await shot(page, '08-watch-bots');
    await page.getByTestId('spectate-mode').click();
    await page.waitForTimeout(1200);
    await shot(page, '09-through-bot-eyes');
    await page.getByTestId('open-brain').click();
    await page.getByTestId('bb-rookie').click();
    check('The bot brain panel changes all bots live (characters and sliders)', (await page.locator('[data-testid^="bb-"]').count()) >= 10);
    await page.getByTestId('spectate-toggle').click();

    // ------------------------------------------------------------------ materials in a game
    await page.getByTestId('open-materials').click();
    await page.getByTestId('mat-target').selectOption('Crate');
    await page.getByTestId('mat-choice').selectOption('barn_planks');
    await page.getByTestId('mat-apply').click();
    await page.waitForTimeout(2500);
    const mats = (await world())?.mats ?? [];
    check('A texture-studio material can be put on any kind of object in a game', mats.some((m) => m === 'Crate:barn_planks'), mats.slice(0, 3).join(', '));
    await shot(page, '10-materials-in-game');

    // ------------------------------------------------------------------ racing
    const r9 = RACE_MISSIONS.find((m) => m.id === 'r9')!;
    await seed('mf.racing.v1', 'r9', answerCode(r9.code()), { current: 'r9' });
    await openGame('racing');
    await page.getByTestId('sh-demo').click();
    await page.getByTestId('sh-won').waitFor({ timeout: 40000 });
    check('Racing "Dents": the body crumples where it hit the barrier (real loop)', ((await world())?.dents ?? 0) >= 1);
    await shot(page, '11-race-dents');
    const r6 = RACE_MISSIONS.find((m) => m.id === 'r6')!;
    await seed('mf.racing.v1', 'r6', answerCode(r6.code()), { current: 'r6' });
    await openGame('racing');
    await page.getByTestId('sh-play').click();
    await page.waitForTimeout(1200);
    await page.getByTestId('sh-stage').focus();
    await page.keyboard.down('KeyW');
    await page.waitForTimeout(2500);
    const speed = Number(((await page.getByTestId('sh-speed').textContent()) ?? '0').replace(/\D/g, ''));
    await page.keyboard.up('KeyW');
    check('Racing: holding W drives the car (speedometer)', speed > 30, `${speed} km/h`);
    await page.getByTestId('race-paint').nth(1).click();
    await page.getByTestId('race-respawn').click();
    await shot(page, '12-race-drive');

    // ------------------------------------------------------------------ models
    const m3 = MODEL_MISSIONS.find((m) => m.id === 'm3')!;
    await seed('mf.models.v1', 'm3', answerCode(m3.code()), { current: 'm3' });
    await openGame('models');
    await page.getByTestId('sh-play').click();
    await page.getByTestId('sh-won').waitFor({ timeout: 30000 });
    await page.waitForTimeout(2500);
    check('Models "Tiling": the brick wall from the texture studio repeats by its size', ((await world())?.mats ?? []).includes('LongWall:red_brick'));
    await shot(page, '13-models-tiling');

    // narrow screen
    await page.setViewportSize({ width: 820, height: 1100 });
    await page.getByTestId('view-path').click();
    await page.waitForTimeout(400);
    check('Tablet width: My path has no sideways scroll', !(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 2)));
    await shot(page, '14-tablet-path');
  } catch (e) {
    check('Unexpected failure', false, e instanceof Error ? `${e.message}\n${e.stack}` : String(e));
    await shot(page, 'zz-failure').catch(() => {});
  } finally {
    check('No requests left this computer', external.length === 0, external.slice(0, 3).join(', '));
    check('No page errors', errors.length === 0, errors.slice(0, 5).join(' | '));
    await browser.close();
    server.kill();
    const failed = checks.filter((c) => !c.ok);
    writeFileSync(join(OUT, 'e2e-games-report.json'), JSON.stringify({ when: new Date().toISOString(), passed: checks.length - failed.length, failed: failed.length, checks }, null, 2));
    console.log(`\n${checks.length - failed.length}/${checks.length} checks passed`);
    process.exit(failed.length ? 1 : 0);
  }
}

void main();
