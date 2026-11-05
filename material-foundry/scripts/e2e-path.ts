// Browser end-to-end check of the home screen and the first steps (requires `npm run build`):
// the program opens on "My path" (a map of districts with locks), the intro says where you are,
// one big button starts the ABC of code, locked districts and games stay closed, the ABC shows its
// funny moment and the lesson card, a finished district breaks its lock, blanks ___ are selected by a
// click or Tab and replaced by typing, effects can be switched. Screenshots → verification/path/.

import { spawn, type ChildProcess } from 'node:child_process';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { chromium, type Page } from '@playwright/test';
import { ABC_LEVELS } from '../src/code/learn/abc';

const OUT = 'verification';
const SHOTS = join(OUT, 'path');
const PORT = 4213;
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

async function typeInEditor(page: Page, host: string, text: string) {
  await page.locator(`[data-testid="${host}"] .cm-content`).click();
  await page.keyboard.press('Control+A');
  await page.keyboard.press('Delete');
  await page.keyboard.insertText(text);
}

async function main() {
  rmSync(SHOTS, { recursive: true, force: true });
  mkdirSync(SHOTS, { recursive: true });
  const server = await startServer();
  const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
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

  try {
    // A first start, in Russian, effects bright.
    await page.goto(`${URL}#code`);
    await page.evaluate(() => {
      localStorage.clear();
      localStorage.setItem('mf.code.prefs.v1', JSON.stringify({ locale: 'ru', fx: 'full' }));
      localStorage.setItem('mf.code.locale', 'ru');
    });
    await page.reload();
    await page.getByTestId('learning-path').waitFor();
    if (!(await page.getByText('Мой путь').count())) {
      await page.getByTestId('open-settings').click();
      await page.getByTestId('lang-ru').click();
      await page.keyboard.press('Escape');
      await page.mouse.click(5, 300);
    }

    // ------------------------------------------------------------------ the home screen
    check('The program opens on "My path" (no separate "Start" tab)', (await page.getByTestId('view-welcome').count()) === 0 && (await page.getByTestId('view-path').getAttribute('aria-selected')) === 'true');
    const intro = (await page.getByTestId('home-intro').textContent()) ?? '';
    check('A first start says where you are and what to press', /Unity/.test(intro) && /большую кнопку/.test(intro), intro.slice(0, 80));
    const big = (await page.getByTestId('path-continue').textContent()) ?? '';
    check('One big button: "Start: The ABC of code → ( )"', /Начать/.test(big) && /Азбука/.test(big) && /\( \)/.test(big), big);
    check('The map has 12 districts', (await page.getByTestId('path-stage').count()) === 12);
    const locked = await page.locator('[data-testid="path-stage"][data-locked="1"]').count();
    check('Only the first district is open, the rest are locked like new cities', locked === 11, `${locked} locked`);
    check('The finish card says what you will be able to do', /уверенный начинающий/.test((await page.getByTestId('path-finish').textContent()) ?? ''));
    await shot(page, '01-home-first-start');

    await page.getByTestId('path-open-shooter-body').click({ force: true });
    await page.waitForTimeout(300);
    check('A locked district does not open (a toast says why)', (await page.getByTestId('learning-path').count()) === 1 && /закрыто/i.test((await page.getByTestId('code-toasts').textContent()) ?? ''));
    await page.getByTestId('view-games').click();
    await page.getByTestId('view-shooter').click();
    await page.getByTestId('locked-screen').waitFor();
    check('A game of a later district shows the locked screen', /пока закрыт/.test((await page.getByTestId('locked-screen').textContent()) ?? ''));
    await shot(page, '02-locked-game');
    await page.getByTestId('locked-go').click();
    await page.getByTestId('abc').waitFor();
    check('"To my next step" opens the ABC of code', true);

    // ------------------------------------------------------------------ the ABC of code
    check('The ABC: only the first symbol is open', (await page.locator('.abc-level.locked').count()) === ABC_LEVELS.length - 1);
    await page.getByTestId('abc-run').click();
    await page.getByTestId('abc-moment').waitFor({ timeout: 15000 });
    const moment = (await page.getByTestId('abc-moment').textContent()) ?? '';
    check('Running "robot.Jump;" shows the funny moment and the real C# error CS0201', /CS0201/.test(moment), moment.slice(0, 90));
    await shot(page, '03-abc-moment');
    await typeInEditor(page, 'abc-editor', 'robot.Jump();');
    await page.getByTestId('abc-run').click();
    await page.waitForFunction(() => document.querySelectorAll('[data-testid="abc-goal"]')[0]?.textContent?.includes('✅'), null, { timeout: 15000 });
    check('Bit jumps: the first goal is ticked', true);
    await typeInEditor(page, 'abc-editor', 'robot.Jump(3);');
    await page.getByTestId('abc-run').click();
    await page.getByTestId('fx-lesson').waitFor({ timeout: 15000 });
    await page.waitForTimeout(900);
    const card = (await page.getByTestId('fx-lesson').textContent()) ?? '';
    check('Level done: the card shows the one sentence to remember', /нажать кнопку/.test(card) && /Запомни/.test(card), card.slice(0, 120));
    await shot(page, '04-abc-lesson-card');
    await page.getByTestId('fx-next').click();
    await page.waitForTimeout(300);
    check('"Next" opens the next symbol (;)', /Точка с запятой/.test((await page.locator('.abc-head h2').textContent()) ?? ''));
    const reviewCards = await page.evaluate(() => JSON.parse(localStorage.getItem('mf.review.v1') ?? '[]').map((c: { id: string }) => c.id));
    check('The symbol becomes a review card (comes back in 1, 2, 4… days)', reviewCards.includes('abc:abc-parens'));

    // the boss with all moments
    await page.evaluate(() => {
      const s = JSON.parse(localStorage.getItem('mf.abc.v1') ?? '{}');
      s.done = ['abc-parens', 'abc-semicolon', 'abc-quotes', 'abc-assign', 'abc-braces', 'abc-compare', 'abc-comment', 'abc-dot', 'abc-index'];
      s.current = 'abc-boss';
      localStorage.setItem('mf.abc.v1', JSON.stringify(s));
    });
    await page.reload();
    await page.getByTestId('learning-path').waitFor();
    await page.getByTestId('path-continue').click();
    await page.getByTestId('abc').waitFor();
    await page.getByTestId('abc-run').click();
    await page.getByTestId('abc-moment').waitFor({ timeout: 15000 });
    check('The boss: the first broken thing shows its moment (missing ;)', /;/.test((await page.getByTestId('abc-moment').textContent()) ?? ''));
    await shot(page, '05-abc-boss');
    const boss = ABC_LEVELS.at(-1)!;
    await typeInEditor(page, 'abc-editor', boss.answer.ru);
    await page.getByTestId('abc-run').click();
    await page.getByTestId('fx-lesson').waitFor({ timeout: 20000 });
    check('The boss is beaten: Bit reaches the flag and shouts', true);
    await page.getByTestId('fx-close').click();
    await page.getByTestId('fx-unlock').waitFor({ timeout: 10000 });
    await page.waitForTimeout(1600);
    const unlock = (await page.getByTestId('fx-unlock').textContent()) ?? '';
    check('Finishing a district breaks the lock of the next one', /НОВЫЙ РАЙОН/.test(unlock) && /Кирпичный квартал/.test(unlock), unlock.slice(0, 80));
    await shot(page, '06-new-district');
    await page.getByTestId('fx-unlock-go').click();
    await page.getByTestId('lesson').waitFor();
    check('"Let\'s go" opens the first lesson of the new district', /Переменные/.test((await page.getByTestId('lesson').textContent()) ?? ''));

    // the corrected question wording
    await page.getByTestId('lesson-watch').click();
    for (let i = 0; i < 10 && !(await page.getByTestId('game-choice').count()); i++) {
      if (await page.getByTestId('anim-done').count()) await page.getByTestId('anim-done').click();
      else if (await page.getByTestId('anim-next').count()) await page.getByTestId('anim-next').click();
      await page.waitForTimeout(250);
    }
    if (await page.getByTestId('game-choice').count()) {
      const q = (await page.locator('.ln-q').first().textContent()) ?? '';
      check('The question names the line instead of "after the second line"', /health = health - 30/.test(q) && !/второй строки/.test(q), q);
      await page.getByTestId('game-option').first().click();
      await page.waitForTimeout(200);
      await page.getByTestId('game-option').nth(2).click();
      await page.waitForTimeout(300);
      check('A right answer gives sparks and +XP where it was earned', (await page.locator('.fx-burst').count()) + (await page.locator('.fx-float').count()) > 0);
      await shot(page, '07-lesson-sparks');
    } else check('The question names the line instead of "after the second line"', false, 'did not reach the games');

    // ------------------------------------------------------------------ blanks ___
    await page.getByTestId('open-settings').click();
    check('Settings explain what the effects mean', (await page.locator('.fx-legend').count()) === 1);
    await page.getByTestId('toggle-lock').click();
    await page.keyboard.press('Escape');
    await page.mouse.click(5, 300);
    await page.getByTestId('view-games').click();
    await page.getByTestId('view-shooter').click();
    await page.getByTestId('shooter').waitFor();
    await page.getByTestId('sh-mission-s02').click();
    await page.waitForTimeout(500);
    const before = (await page.getByTestId('sh-blanks').textContent()) ?? '';
    await page.locator('.cm-blank').first().click();
    const sel = await page.evaluate(() => window.getSelection()?.toString() ?? '');
    check('A click on ___ selects the whole blank', sel === '___', JSON.stringify(sel));
    await page.keyboard.type('5f');
    await page.waitForTimeout(200);
    const after = (await page.getByTestId('sh-blanks').textContent()) ?? '';
    const nb = (t: string) => Number((t.match(/\d+/) ?? ['0'])[0]);
    check('Typing replaces the blank (nothing to delete by hand)', nb(after) === nb(before) - 1 || /Все пропуски/.test(after), `${before} → ${after}`);
    const text = await page.locator('[data-testid="sh-editor"] .cm-content').first().textContent();
    check('…and no underscores are left around the typed text', !/5f_|_5f/.test(text ?? ''));
    if (nb(after) > 0) {
      await page.keyboard.press('Tab');
      const sel2 = await page.evaluate(() => window.getSelection()?.toString() ?? '');
      check('Tab jumps to the next blank and selects it', sel2 === '___', JSON.stringify(sel2));
    }
    await shot(page, '08-blanks');

    // ------------------------------------------------------------------ learn: C# is the main path
    await page.getByTestId('view-learn').click();
    await page.getByTestId('hub-lessons').click();
    if (await page.getByTestId('lesson-exit').count()) await page.getByTestId('lesson-exit').click();
    if (await page.getByTestId('change-track').count()) await page.getByTestId('change-track').click();
    await page.getByTestId('track-cs').waitFor();
    check('Learn: C# is the main language, the others are optional (folded)', (await page.getByTestId('track-cs').isVisible()) && !(await page.getByTestId('track-py').isVisible()));

    // narrow screen
    await page.setViewportSize({ width: 820, height: 1100 });
    await page.getByTestId('view-path').click();
    await page.waitForTimeout(400);
    check('Tablet width: the map has no sideways scroll', !(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 2)));
    await shot(page, '09-tablet-map');
  } catch (e) {
    check('Unexpected failure', false, e instanceof Error ? `${e.message}\n${e.stack}` : String(e));
    await shot(page, 'zz-failure').catch(() => {});
  } finally {
    check('No requests left this computer', external.length === 0, external.slice(0, 3).join(', '));
    check('No page errors', errors.length === 0, errors.slice(0, 5).join(' | '));
    await browser.close();
    server.kill();
    const failed = checks.filter((c) => !c.ok);
    writeFileSync(join(OUT, 'e2e-path-report.json'), JSON.stringify({ when: new Date().toISOString(), passed: checks.length - failed.length, failed: failed.length, checks }, null, 2));
    console.log(`\n${checks.length - failed.length}/${checks.length} checks passed`);
    process.exit(failed.length ? 1 : 0);
  }
}

void main();
